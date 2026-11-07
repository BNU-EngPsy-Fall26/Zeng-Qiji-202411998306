(function () {
  'use strict';
  const { $, mulberry32, shuffle, conditionOrders, formatTime } = window.Core;
  const GAUGES = [
    { id:'airspeed', name:'空速', min:100, max:400, low:190, high:310, center:250, unit:'kt', display:v=>Math.round(v*10)/10 },
    { id:'altitude', name:'高度', min:2500, max:7500, low:3600, high:6400, center:5000, unit:'ft', display:v=>Math.round(v) },
    { id:'bank', name:'横滚角', min:-35, max:35, low:-18, high:18, center:0, unit:'°', display:v=>Math.round(v*10)/10 },
    { id:'temperature', name:'发动机温度', min:450, max:900, low:560, high:790, center:680, unit:'°C', display:v=>Math.round(v*10)/10 }
  ];
  const CONDITIONS = {
    A:{name:'无提示',label:'无提示',detail:'自主监控'},
    B:{name:'事后提示',label:'越界后提醒',detail:'越界后提示'},
    C:{name:'预测性提示',label:'提前预测',detail:'趋势预测提示'}
  };
  const CROSSING_TIMES_MS = [3400, 3750, 4100, 4450, 4800, 5150, 5500, 5850, 3600, 4250, 4900, 5550];
  const PREDICTION_LEAD_MS = 1500;
  const RESPONSE_WINDOW_MS = 2400;

  function buildBaseTrials(participantId) {
    // One matched 16-stimulus bank per participant; A/B/C vary only in cue policy.
    const rng = mulberry32(window.Core.hashString(participantId + ':monitor:stimulus-bank'));
    const trials = [];
    const extraDirections = shuffle([1,1,-1,-1], rng);
    const extraSpeeds = shuffle(['fast','fast','slow','slow'], rng);
    for (let gauge=0; gauge<4; gauge++) {
      const directions = shuffle([1,-1,extraDirections[gauge]], rng);
      const speeds = shuffle(['fast','slow',extraSpeeds[gauge]], rng);
      for (let j=0; j<3; j++) {
        const sequence=trials.length+1;
        trials.push({
          type:'anomaly', hasAnomaly:true, targetGauge:gauge,
          direction:directions[j], speed:speeds[j], crossingMs:4200,
          stimulusId:'M'+String(sequence).padStart(2,'0'), sequence
        });
      }
    }
    const variedOnsets = shuffle(CROSSING_TIMES_MS, rng);
    trials.forEach((trial,index)=>{ trial.crossingMs=variedOnsets[index]; });
    shuffle(trials,rng);
    trials.forEach((trial,index)=>{trial.sequence=index+1;trial.stimulusId='M'+String(index+1).padStart(2,'0');});
    for (let g=0; g<4; g++) {
      trials.push({ type:'near_miss', hasAnomaly:false, targetGauge:g,
        direction:rng() < .5 ? 1 : -1, speed:'moderate', crossingMs:4300+(g%4)*420,
        stimulusId:'N'+String(g+1), sequence:trials.length+1 });
    }
    // Two brief, non-target telemetry disturbances add a divided-attention
    // challenge. Their identity and timing are matched across A/B/C.
    trials.forEach((trial,index)=>{
      const otherGauges=[0,1,2,3].filter(g=>g!==trial.targetGauge);
      trial.distractors=[
        {gauge:otherGauges[index%3],atMs:1050+(index%4)*230,durationMs:820,magnitude:.052,direction:index%2?1:-1,label:'气流扰动'},
        {gauge:otherGauges[(index+1)%3],atMs:2250+(index%3)*270,durationMs:660,magnitude:.036,direction:index%2?-1:1,label:'侧风扰动'}
      ];
    });
    return trials;
  }

  function buildConditionTrials(participantId, condition) {
    const rng = mulberry32(window.Core.hashString(participantId + ':monitor:order:' + condition));
    return shuffle(buildBaseTrials(participantId), rng).map((trial, i) => ({...trial, trialInBlock:i+1, condition}));
  }

  function distanceFactor(speed) { return speed === 'fast' ? .31 : speed === 'slow' ? .20 : .26; }

  function targetValueAt(trial, elapsedMs) {
    const gauge = GAUGES[trial.targetGauge];
    const threshold = trial.direction > 0 ? gauge.high : gauge.low;
    const span = gauge.high - gauge.low;
    const distance = span * distanceFactor(trial.speed);
    const start = threshold - trial.direction * distance;
    const velocity = distance / (trial.crossingMs / 1000);
    const progress = Math.max(0, Math.min(1, elapsedMs / trial.crossingMs));
    // Small, tapered telemetry fluctuations make the signal less perfectly
    // predictable without changing its exact value at the planned crossing.
    // The envelope reaches zero at the crossing, preserving event timing.
    const seed = window.Core.hashString((trial.stimulusId || 'practice') + ':target-wobble');
    const phase = (seed % 997) / 997 * Math.PI * 2;
    const envelope = Math.sin(Math.PI * progress);
    const wobble = trial.direction * span * envelope * (
      0.012 * Math.sin(elapsedMs / 245 + phase) +
      0.006 * Math.sin(elapsedMs / 415 + phase * 1.37)
    );
    if (trial.hasAnomaly) {
      const base = start + trial.direction * velocity * (elapsedMs / 1000);
      return Math.max(gauge.min, Math.min(gauge.max, base + wobble));
    }
    const turnMs = trial.crossingMs - 850;
    const turnValue = start + trial.direction * velocity * (turnMs / 1000);
    const base = elapsedMs <= turnMs
      ? turnValueAt(start, velocity, trial.direction, elapsedMs)
      : turnValue - trial.direction * velocity * .7 * ((elapsedMs - turnMs) / 1000);
    return Math.max(gauge.min, Math.min(gauge.max, base + wobble));
  }

  function turnValueAt(start, velocity, direction, elapsedMs) {
    return start + direction * velocity * (elapsedMs/1000);
  }

  function backgroundValue(gauge, elapsedMs, gaugeIndex, trial) {
    // Every dial remains in motion. The two low-frequency components create
    // believable telemetry drift; a brief, matched disturbance affects one
    // non-target dial to make the monitoring task less predictable.
    const span = gauge.high - gauge.low;
    const seed = window.Core.hashString((trial?.stimulusId||'practice')+':'+gaugeIndex);
    const phase = gaugeIndex*1.31 + (seed%997)/997*Math.PI*2;
    const drift = Math.sin(elapsedMs/520 + phase) * span * .075;
    const wave = Math.sin(elapsedMs/1180 + phase*1.73) * span * .042;
    const slow = Math.sin(elapsedMs/2380 + phase*.61) * span * .020;
    let disturbance = 0;
    (trial?.distractors||[]).forEach(event=>{
      if(gaugeIndex!==event.gauge)return;
      const u=(elapsedMs-event.atMs)/event.durationMs;
      if(u>=0&&u<=1)disturbance+=event.direction*Math.sin(u*Math.PI)*span*event.magnitude;
    });
    const lower=gauge.low-span*.18, upper=gauge.high+span*.18;
    return Math.max(lower,Math.min(upper,gauge.center+drift+wave+slow+disturbance));
  }

  function regression(samples) {
    if (samples.length < 6) return null;
    const lastTime = samples[samples.length-1].t;
    const recent = samples.filter(s => lastTime - s.t <= 520);
    if (recent.length < 6 || recent[recent.length-1].t - recent[0].t < 280) return null;
    const mt = recent.reduce((s,p)=>s+p.t,0)/recent.length;
    const mv = recent.reduce((s,p)=>s+p.v,0)/recent.length;
    let num=0, den=0;
    for (const p of recent) { num += (p.t-mt)*(p.v-mv); den += (p.t-mt)**2; }
    if (!den) return null;
    return num/den*1000; // gauge units per second
  }

  function needleAngle(gauge, value) {
    const p = Math.max(0, Math.min(1, (value - gauge.min)/(gauge.max-gauge.min)));
    return -135 + p*270;
  }

  function markerGeometry(gauge, value) {
    const angle = needleAngle(gauge, value) * Math.PI / 180;
    const point = radius => ({ x:90 + Math.sin(angle) * radius, y:96 - Math.cos(angle) * radius });
    const inner = point(66), outer = point(77), label = point(83);
    return { inner, outer, label };
  }

  function initGaugeMarkers() {
    GAUGES.forEach(gauge => {
      const card=document.querySelector('.gauge-card[data-aoi="'+gauge.id+'"]');
      if (!card) return;
      [['low',gauge.low],['high',gauge.high]].forEach(([side,value]) => {
        const geo=markerGeometry(gauge,value);
        const line=card.querySelector('.tick-'+side);
        const label=card.querySelector('.tick-'+side+'-label');
        if(line){line.setAttribute('x1',geo.inner.x.toFixed(2));line.setAttribute('y1',geo.inner.y.toFixed(2));line.setAttribute('x2',geo.outer.x.toFixed(2));line.setAttribute('y2',geo.outer.y.toFixed(2));}
        if(label){label.setAttribute('x',geo.label.x.toFixed(2));label.setAttribute('y',(geo.label.y+2.5).toFixed(2));label.setAttribute('text-anchor','middle');label.textContent=gauge.display(value).toLocaleString('en-US');}
      });
    });
  }

  function setGauge(index, value, state='') {
    const gauge=GAUGES[index];
    const card=document.querySelector('.gauge-card[data-aoi="'+gauge.id+'"]');
    if (!card) return;
    const needle=card.querySelector('.dial-needle');
    if (needle) needle.style.transform='rotate('+needleAngle(gauge,value)+'deg)';
    const val=$("value-"+gauge.id);
    if (val) val.textContent=gauge.display(value).toLocaleString('en-US');
    card.classList.toggle('cued', state==='cued');
    card.classList.toggle('actual-alert', state==='actual');
  }

  function hasCrossedVisibleThreshold(gauge, value, direction) {
    // Event onset follows the value the participant can actually read, not only
    // the unrounded internal trajectory. This matters for the 10-ft altimeter.
    const visibleValue = gauge.display(value);
    return direction > 0 ? visibleValue > gauge.high : visibleValue < gauge.low;
  }

  function responseClassFor(trial, responseTime) {
    const eventTime = trial.hasAnomaly ? trial.eventTime : null;
    if (!trial.hasAnomaly) return 'false_alarm';
    // A response counts only after the threshold state has actually been rendered.
    if (eventTime === null || responseTime < eventTime) return 'premature';
    if (responseTime <= eventTime + RESPONSE_WINDOW_MS) return 'hit';
    return 'late';
  }

  function createRunner(config) {
    const participantId=config.participantId;
    const sessionId=config.sessionId||'session-'+Date.now();
    const order=conditionOrders(participantId,'monitoring-order');
    let blockIndex=0, trialIndex=0, practiceIndex=0, phase='practice', isPractice=false, rows=[], current=null, raf=0, lastDraw=0, cueTime=null, cueType=null;
    let targetSamples=[];
    let blockTrials=[];
    let cueOccurred=false, eventRecorded=false, responseRecorded=false;
    const trialsByCondition = Object.fromEntries(order.map(cond=>[cond,buildConditionTrials(participantId,cond)]));
    const flat = order.flatMap(cond=>trialsByCondition[cond]);
    const total=flat.length;

    function updateMeta() {
      const globalTrial=order.slice(0,blockIndex).reduce((n,c)=>n+trialsByCondition[c].length,0)+trialIndex+1;
      AppUI.setTaskMeta({subline:'四个仪表一起看',condition:CONDITIONS[current?.condition || order[blockIndex]].label,
        counter:isPractice?'练习 '+(practiceIndex+1)+' / 2':'第 '+String(globalTrial).padStart(2,'0')+' / '+total+' 次',
        progress:(globalTrial-1)/total*100,participant:participantId,
        prompt:'持续监控四个动态仪表。', subprompt:current?.condition==='C'?'表盘变黄只是预测预警；读数真正越界（表盘变红）才报告。':'读数越过红色边界、表盘变红时报告；其他波动不用报告。',
        response:'monitor'});
    }

    function start() {
      AppUI.showTaskScreen();
      initGaugeMarkers();
      trialIndex=0; practiceIndex=0; blockIndex=0; phase='practice'; rows=[]; isPractice=false;
      startTrial();
    }

    function startTrial() {
      if (blockIndex>=order.length) return finish();
      const condition=order[blockIndex];
      blockTrials=trialsByCondition[condition];

      // Explicit block state machine prevents practice counters and formal-trial
      // counters from jointly controlling the transition to the next condition.
      if (phase==='practice') {
        if (practiceIndex<2) {
          isPractice=true;
          current={type:practiceIndex===0?'practice_anomaly':'practice_near_miss',hasAnomaly:practiceIndex===0,targetGauge:practiceIndex===0?((blockIndex+1)%4):((blockIndex+2)%4),direction:practiceIndex===0?1:-1,speed:'moderate',crossingMs:4200,condition,trialInBlock:practiceIndex+1};
        } else {
          phase='formal';
          trialIndex=0;
          isPractice=false;
        }
      }

      if (phase==='formal' && trialIndex>=blockTrials.length) {
        if (blockIndex>=order.length-1) return finish();
        blockIndex++;
        phase='break';
        const next=order[blockIndex];
        AppUI.showBreak(
          '这一组完成啦！',
          '休息一下。下一组：'+CONDITIONS[next].name+'。先做 2 次练习，再继续正式任务。',
          blockIndex, 3,
          () => {
            // The break screen is a separate app screen. Return to the task
            // screen before rendering the next block; otherwise the runner
            // advances invisibly behind the still-visible break screen.
            AppUI.showTaskScreen();
            initGaugeMarkers();
            phase='practice';
            practiceIndex=0;
            trialIndex=0;
            isPractice=false;
            startTrial();
          }
        );
        return;
      }

      if (phase==='formal') {
        isPractice=false;
        current=blockTrials[trialIndex];
      }
      if (!current) return;
      cueTime=null; cueType=null; cueOccurred=false; eventRecorded=false; responseRecorded=false;
      current.distractorsShown=(current.distractors||[]).map(()=>false);
      targetSamples=[]; lastDraw=0;
      current.startedAt=performance.now();
      current.eventTime=null;
      document.querySelectorAll('.gauge-card').forEach(card=>{card.classList.remove('cued','actual-alert');});
      $('liveStatus').textContent='正在监控';
      const disturbance=$('ambientEvent');
      if(disturbance){disturbance.classList.remove('show');disturbance.textContent='';}
      updateMeta();
      raf=requestAnimationFrame(frame);
    }

    function frame(now) {
      if (!current || responseRecorded) return;
      const elapsed=now-current.startedAt;
      if (now-lastDraw>=16) {
        const values=GAUGES.map((g,i)=>i===current.targetGauge?targetValueAt(current,elapsed):backgroundValue(g,elapsed,i,current));
        const targetValue=values[current.targetGauge];
        const gauge=GAUGES[current.targetGauge];
        const threshold=current.direction>0?gauge.high:gauge.low;
        const visiblyBeyond=hasCrossedVisibleThreshold(gauge,targetValue,current.direction);

        // Event onset is tied to the first animation frame in which the
        // threshold state is rendered, not merely a planned timer value.
        if (current.hasAnomaly && !eventRecorded && elapsed>=current.crossingMs && visiblyBeyond) {
          eventRecorded=true;
          current.eventTime=now;
          if (current.condition==='B' && !cueOccurred) triggerCue('reactive',now);
        }

        GAUGES.forEach((g,i)=>{
          if(i===current.targetGauge) targetSamples.push({t:elapsed,v:values[i]});
          const state=i===current.targetGauge && cueOccurred ? (eventRecorded?'actual':'cued') : '';
          setGauge(i,values[i],state);
        });
        lastDraw=now;
        const clock=$('missionClock');
        if(clock)clock.textContent='航段 '+String(Math.floor(elapsed/1000)).padStart(2,'0')+' s';
        (current.distractors||[]).forEach((event,index)=>{
          if(!current.distractorsShown[index]&&elapsed>=event.atMs){
            current.distractorsShown[index]=true;
            const disturbance=$('ambientEvent');
            if(disturbance){
              disturbance.textContent=event.label;
              disturbance.classList.remove('show');
              requestAnimationFrame(()=>disturbance.classList.add('show'));
              setTimeout(()=>disturbance.classList.remove('show'),620);
            }
          }
        });

        if (current.condition==='C' && !cueOccurred && !eventRecorded && elapsed>650) {
          const slope=regression(targetSamples);
          if (slope!==null && slope*current.direction>0) {
            const ttc=(threshold-targetValue)/slope*1000;
            if (ttc>=0 && ttc<=PREDICTION_LEAD_MS) triggerCue('predictive',now);
          }
        }

      }
      // Note: when a predictive cue is confirmed by an actual crossing, the
      // gauge state computed above flips the card from amber to red. The cue
      // is conveyed purely by dial color — no text banner is shown.

      if (current.hasAnomaly && eventRecorded && now>current.eventTime+RESPONSE_WINDOW_MS) {
        finishTrial('miss', null, now);
        return;
      }
      if (!current.hasAnomaly && elapsed>6400) {
        finishTrial('correct_rejection', null, now);
        return;
      }
      raf=requestAnimationFrame(frame);
    }

    function triggerCue(type, time) {
      if (cueOccurred) return;
      cueOccurred=true; cueType=type; cueTime=time;
      // Warnings are rendered as dial color changes only — no text banner and
      // no status-line change, so A/B/C differ purely in dial color. The target
      // card gets the amber .cued state immediately; setGauge() keeps it while
      // the trial runs and flips it to the red .actual-alert state on a real
      // crossing.
      const card=document.querySelector('.gauge-card[data-aoi="'+GAUGES[current.targetGauge].id+'"]');
      if (card) card.classList.add('cued');
    }

    function respond() {
      if (!current || responseRecorded) return;
      const now=performance.now();
      const cls=responseClassFor(current,now);
      finishTrial(cls,now,now);
    }

    function finishTrial(classification,responseTime,finishedAt) {
      if (responseRecorded) return;
      responseRecorded=true;
      cancelAnimationFrame(raf);
      const actualTime=current.hasAnomaly?(current.eventTime||current.startedAt+current.crossingMs):null;
      const rt=(classification==='hit' && responseTime!==null)?responseTime-actualTime:null;
      const correct=classification==='hit'||classification==='correct_rejection';
      if(!isPractice){
        rows.push({
          experiment:'aviation_monitoring',participant:participantId,session_id:sessionId,condition:current.condition,
          condition_name:CONDITIONS[current.condition].name,trial:rows.length+1,trial_in_block:trialIndex+1,
          trial_type:current.type,target_gauge:GAUGES[current.targetGauge].id,direction:current.direction>0?'upper':'lower',
          signal_rate:current.speed,signal_velocity_units_s:Math.round((GAUGES[current.targetGauge].high-GAUGES[current.targetGauge].low)*distanceFactor(current.speed)/ (current.crossingMs/1000)*1000)/1000,
          nominal_crossing_ms:current.crossingMs,trial_duration_ms:current.hasAnomaly?current.crossingMs+RESPONSE_WINDOW_MS:6400,
          event_time_ms:current.hasAnomaly&&current.eventTime!==null?Math.round(current.eventTime-current.startedAt):'',cue_type:cueType||'none',
          cue_time_ms:cueTime===null?'':Math.round(cueTime-current.startedAt),
          cue_lead_ms:cueTime===null||!current.hasAnomaly||current.eventTime===null?'':Math.round(current.eventTime-cueTime),
          response_time_ms:responseTime===null?'':Math.round(responseTime-current.startedAt),
          response_class:classification,rt_ms:rt===null?'':Math.round(rt),correct:correct?1:0,
          predictive_validity:current.condition==='C'?(current.hasAnomaly?(cueType==='predictive'?'valid':'missed_prediction'):(cueType==='predictive'?'false_alarm':'no_prediction')):'not_applicable',
          prediction_triggered:current.condition==='C'&&cueType==='predictive'?1:0,
          distractor_gauges:(current.distractors||[]).map(d=>GAUGES[d.gauge].id).join('|'),
          distractor_event_times_ms:(current.distractors||[]).map(d=>d.atMs).join('|'),
          distractor_count:(current.distractors||[]).length,
          stimulus_id:current.stimulusId
        });
        trialIndex++;
        AppUI.setProgress(rows.length/total*100);
      }else{
        practiceIndex++;
      }
      setTimeout(startTrial,360);
    }

    function finish() {
      cancelAnimationFrame(raf);
      const conditions=['A','B','C'];
      const summary=conditions.map(c=>{
        const r=rows.filter(x=>x.condition===c);
        const anomalies=r.filter(x=>x.trial_type==='anomaly');
        const near=r.filter(x=>x.trial_type==='near_miss');
        return {condition:c,name:CONDITIONS[c].name,hitRate:anomalies.length?anomalies.filter(x=>x.response_class==='hit').length/anomalies.length:0,
          falseAlarmRate:near.length?near.filter(x=>x.response_class==='false_alarm').length/near.length:0,
          medianRT:window.Core.median(anomalies.filter(x=>x.response_class==='hit').map(x=>Number(x.rt_ms)))};
      });
      AppUI.finishSession('aviation_monitoring',rows,summary);
    }

    function resume() { startTrial(); }
    return {start,resume,respond,abort:()=>{cancelAnimationFrame(raf);current=null;},getStatus:()=>({phase,blockIndex,condition:order[blockIndex]||null,trialIndex,practiceIndex,order:order.slice(),completedRows:rows.length}),getTrials:()=>flat.map(t=>({...t}))};
  }

  window.MonitoringExperiment={createRunner,GAUGES,CONDITIONS,buildBaseTrials,buildConditionTrials,targetValueAt,backgroundValue,regression,needleAngle,markerGeometry,hasCrossedVisibleThreshold,responseClassFor,CROSSING_TIMES_MS};
})();
