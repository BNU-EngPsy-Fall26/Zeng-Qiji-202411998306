(function(){
  'use strict';
  const {$,showScreen,toast,downloadBlob,toCSV,conditionOrders}=window.Core;
  const originalGaugeMarkup=$('gaugeGrid').innerHTML;
  // Course project code supplied by the project owner. It is preconfigured so
  // participants do not need to type it and completed experiments POST directly.
  const DEFAULT_PROJECT_CODE='7WJ4J5';
  const state={activeExperiment:null,participantId:'',sessionId:'',projectCode:DEFAULT_PROJECT_CODE,currentRunner:null,lastSession:null,breakCallback:null,imported:false};
  const EXPERIMENTS={
    monitoring:{title:'预测性注意引导',duration:'约7–9分钟',code:'MISSION 01 / W5',slug:'aviation_monitoring'},
    search:{title:'视觉搜索与并行加工',duration:'约9–11分钟',code:'MISSION 02 / W6',slug:'visual_search'}
  };

  function setTaskMeta(meta){
    $('taskSubline').textContent=meta.subline||'';
    $('taskCondition').textContent=meta.condition||'';
    $('taskCounter').textContent=meta.counter||'';
    $('taskParticipant').textContent='被试编号 '+state.participantId;
    $('taskPrompt').textContent=meta.prompt||'';
    $('taskSubPrompt').textContent=meta.subprompt||'';
    $('taskProgressBar').style.width=(meta.progress||0)+'%';
    $('monitorResponse').hidden=meta.response!=='monitor';
    $('searchResponse').hidden=meta.response!=='search';
    $('missionClock').textContent='';
  }

  function showTaskScreen(experimentId){
    $('gaugeGrid').innerHTML=originalGaugeMarkup;
    $('instrumentConsole').classList.remove('search-mode');
    $('instrumentConsole').classList.toggle('search-mode',experimentId==='search');
    $('consoleTitle').textContent=experimentId==='search'?'视觉搜索':'仪表监控';
    // 实验二是纯视觉搜索任务，去掉与战机座舱相关的品牌与状态文案。
    const isSearch=experimentId==='search';
    $('taskBrandTitle').textContent=isSearch?'视觉搜索任务':'战机编队训练';
    $('taskBrandMark').textContent=isSearch?'◎':'✈';
    $('searchLegend').hidden=!isSearch;
    $('searchStage').hidden=!isSearch;
    $('searchField').innerHTML='<div class="search-fixation" aria-hidden="true">+</div>';
    $('searchStage').classList.remove('feedback-correct','feedback-wrong','preview-active');
    $('searchPhase').textContent='准备';
    $('liveStatus').textContent=isSearch?'准备中':'正在监控';
    $('flightdeckScene').classList.remove('search-scene');
    $('flightdeckScene').classList.toggle('search-scene',isSearch);
    $('monitorResponse').hidden=false;$('searchResponse').hidden=true;
    showScreen('task');
    // 实验二使用中性舞台，不加载 3D 座舱；座舱只在实验一挂载。
    requestAnimationFrame(()=>{ if(!isSearch) window.Cockpit3D?.mount(); });
  }
  function setProgress(value){$('taskProgressBar').style.width=Math.max(0,Math.min(100,value))+'%';}
  function showBreak(title,message,current,total,callback){
    $('breakTitle').textContent=title;$('breakMessage').textContent=message;
    $('breakProgress').innerHTML=Array.from({length:total},(_,i)=>`<i class="${i<current?'':'pending'}"></i>`).join('');
    state.breakCallback=callback;
    const button=$('continueBlock');
    button.disabled=false;
    button.textContent='开始下一组 →';
    showScreen('break');
  }

  function populateBriefing(){
    const key=state.activeExperiment;
    const e=EXPERIMENTS[key];
    $('briefingCode').textContent=key==='monitoring'?'飞行任务 1':'飞行任务 2';
    $('briefingTitle').textContent=e.title;
    $('briefingFootnote').textContent='确认后进入正式任务，开始前会先进行练习。';
    $('beginExperiment').textContent='开始实验 →';
    if(key==='monitoring'){
      $('briefingLead').textContent='执行高空编队巡航。持续监控四个飞行参数，发现越界立即报告。';
      $('briefingInstructions').innerHTML=`
        <section class="brief-card"><h3>先记住这四条边界</h3>
          <table class="threshold-table"><tbody>
            <tr><td>空速</td><td>190–310 kt</td></tr>
            <tr><td>高度</td><td>3600–6400 ft</td></tr>
            <tr><td>横滚角</td><td>−18°至+18°</td></tr>
            <tr><td>发动机温度</td><td>560–790 ℃</td></tr>
          </tbody></table>
          <p class="field-hint">只有读数越过红色边界才报告。所有阈值均为课程模拟值。</p>
        </section>
        <section class="brief-card"><h3>怎么操作</h3>
          <p>四个指针持续波动，途中会出现气流和侧风扰动。目标参数可能在不同时间越界；只有真实读数越过红色边界、表盘整体变红时才按空格报告。</p>
        </section>
        <section class="brief-card"><h3>三种提示方式</h3>
          <div class="condition-chips"><span>A 无提示</span><span>B 越界后提醒</span><span>C 提前预测</span></div>
          <p>B 条件下表盘会在越界瞬间变红；C 条件下表盘会先<b>变黄</b>预警（预测提示），等真正越界再<b>变红</b>。变黄只是提醒，仍要等读数真正越界才报告。异常出现时间不固定。</p>
        </section>`;
      $('briefingSide').innerHTML=`<div class="brief-mascot" aria-hidden="true">✈</div><strong>编队巡航</strong><p>高空监控任务<br>保持持续观察</p><span>3 组 · 48 次</span>`;
    }else{
      $('briefingLead').textContent='盯住屏幕中央，在一组条状目标中快速判断是否存在「红色竖条」。';
      $('briefingInstructions').innerHTML=`
        <section class="brief-card"><h3>目标长什么样</h3>
          <p>目标固定是 <b>红色竖条</b>。每一轮的项目数量和位置都不同，你需要判断这一屏里<b>有没有</b>目标。</p>
          <p class="field-hint">三种条件的干扰项不同：特征搜索里干扰项全是绿色竖条；联合搜索里干扰项是红色横条和绿色竖条混在一起；预览搜索先出现一半干扰项，1 秒后再出现其余项目。</p>
        </section>
        <section class="brief-card"><h3>怎么作答</h3>
          <p>先注视中央十字，项目出现后尽快判断：<b>有目标按 F</b>，<b>没有目标按 J</b>，也可以直接点屏幕上的两个按钮。</p>
          <p class="field-hint">每轮限时 6 秒，超时记为错误。请优先保证正确，再尽量快。作答后会短暂显示对错。</p>
        </section>
        <section class="brief-card"><h3>三种搜索条件</h3>
          <div class="condition-chips"><span>A 特征搜索</span><span>B 联合搜索</span><span>C 预览搜索（改进）</span></div>
          <p>三种条件各有 40 次正式试次，每完成一组可以休息。项目数量会在 4、8、16、32 之间变化，这是本实验的关键：<b>反应时随项目数量增长得越快，说明搜索越依赖逐个注意</b>。</p>
        </section>
        <section class="brief-card"><h3>这项实验在检验什么</h3>
          <p>依据 Treisman 与 Gelade（1980）的特征整合理论，只靠单一特征（颜色）就能找到目标时，项目再多也不明显变慢；需要把颜色和朝向绑定时，就要逐项检查，项目越多越慢。</p>
          <p class="field-hint">C 条件是本项目的改进：把一半干扰项提前呈现，检验先出现的旧项目是否会被抑制，从而减轻联合搜索的负担。</p>
        </section>`;
      $('briefingSide').innerHTML=`<div class="brief-mascot" aria-hidden="true">✈</div><strong>目标搜索</strong><p>特征与联合搜索<br>比较搜索效率</p><span>3 组 · 120 次</span>`;
    }
  }

  function startSelectedExperiment(){
    const key=state.activeExperiment;
    state.sessionId=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():('S'+Date.now().toString(36)+Math.random().toString(36).slice(2,7));
    state.currentRunner=key==='monitoring'?window.MonitoringExperiment.createRunner({participantId:state.participantId,sessionId:state.sessionId}):window.SearchExperiment.createRunner({participantId:state.participantId,sessionId:state.sessionId});
    state.currentRunner.start();
  }

  function saveSession(session){
    let list=[];try{list=JSON.parse(localStorage.getItem('northstar_sessions_v1')||'[]');}catch(_e){}
    list.push(session);
    // Keep behavior rows for up to 80 sessions; gaze coordinates are not written to localStorage.
    localStorage.setItem('northstar_sessions_v1',JSON.stringify(list.slice(-80)));
  }

  function finishSession(experimentId,rows,summary){
    const session={experimentId,participantId:state.participantId,sessionId:state.sessionId,projectCode:state.projectCode,completedAt:new Date().toISOString(),rows,summary};
    state.lastSession=session;saveSession(session);
    renderSessionResults(session);
    showScreen('session-results');
    if(state.projectCode)submitSession(session,true);
  }

  function renderSessionResults(session){
    const monitoring=session.experimentId==='aviation_monitoring';
    $('sessionResultTitle').textContent=monitoring?'第一关完成啦！':'第二关完成啦！';
    $('sessionResultText').textContent='编号 '+session.participantId+' · 已完成 '+session.rows.length+' 次任务。';
    let cards='';
    if(monitoring){
      const all= session.rows.filter(r=>r.trial_type==='anomaly');
      const hits=all.filter(r=>r.response_class==='hit');
      const falseAlarms=session.rows.filter(r=>r.trial_type==='near_miss'&&r.response_class==='false_alarm');
      const medianRT=window.Core.median(hits.map(r=>Number(r.rt_ms)));
      cards=[['命中率',fmtPercent(hits.length,all.length),'真实异常'],['虚报次数',String(falseAlarms.length),'接近阈值后恢复'],['反应时中位数',Number.isFinite(medianRT)?Math.round(medianRT)+' ms':'—','正确命中']].map(c=>statHtml(...c)).join('');
      $('sessionInterpretation').textContent='本实验记录的是异常检测与响应表现。预测提示可能缩短检测时间，也可能在接近阈值后恢复的试次中引起虚报。';
    }else{
      const correctRows=session.rows.filter(r=>r.correct===1);
      const acc=session.rows.length?correctRows.length/session.rows.length:0;
      const medianRT=window.Core.median(correctRows.map(r=>Number(r.rt_ms)));
      const sizes=[...new Set(session.rows.map(r=>Number(r.set_size)))].filter(Number.isFinite).sort((a,b)=>a-b);
      const slopePoints=sizes.map(size=>({x:size,y:window.Core.median(correctRows.filter(r=>Number(r.set_size)===size&&Number(r.target_present)===1).map(r=>Number(r.rt_ms)))}));
      const slope=window.SearchExperiment?.slopeBySetSize(slopePoints);
      cards=[['正确率',(acc*100).toFixed(1)+'%','全部正式试次'],['反应时中位数',Number.isFinite(medianRT)?Math.round(medianRT)+' ms':'—','正确试次'],['搜索斜率',Number.isFinite(slope)?slope.toFixed(1)+' ms/项':'—','目标存在试次'],['正式试次',String(session.rows.length),'已完成']].map(c=>statHtml(...c)).join('');
      $('sessionInterpretation').textContent='本实验记录的是视觉搜索的正确率与反应时。斜率接近 0 表示目标可以平行检出；斜率越大表示越依赖逐项注意。三个条件的结果需要横向比较，单人数据不能当作普遍效应，需与其他被试的数据合并分析。';
    }
    $('sessionStats').innerHTML=cards;
    renderSessionModels(monitoring,session.rows,session.participantId);
    const btn=$('submitDataBtn');btn.disabled=!state.projectCode;btn.textContent=state.projectCode?'提交至注意实验室 ↗':'设置项目码后提交 ↗';
    $('submitStatus').textContent=state.projectCode?'已配置项目码；本实验完成后将提交一次。':'未配置项目码。可以先下载数据，项目码配置后再提交。';
  }

  // 被试自查用的模型图：SDT/SEEV（实验一）与 RT = a + b·N（实验二）。
  // 全部由这名被试本次的试次记录现算，换一个人画出来就不同；任何绘图失败都不影响结果页本身。
  function renderSessionModels(monitoring,rows,participantId){
    const host=$('sessionModel');
    if(!host)return;
    const viz=window.ModelViz;
    if(!viz||!Array.isArray(rows)||!rows.length){host.innerHTML='';return;}
    try{
      const who=participantId?` · ${participantId}`:'';
      if(monitoring){
        const roc=viz.roc(rows), seev=viz.seev(rows);
        if(!roc&&!seev){host.innerHTML='';return;}
        host.innerHTML=`<div class="model-heading"><span class="eyebrow">YOUR MODEL FIT</span><h2>你的结果与模型预测${who}</h2>
          <p class="model-lead">${monitoringNarrative(viz.sdtTable(rows))}</p>
          <p>左图是信号检测论（SDT）的预测曲线：圆点是你每个条件实际的“虚报率—命中率”位置，同色虚线是这个 d′ 下模型给出的等敏感度曲线。点落在线上，说明你的判断符合 SDT；点越靠左上，说明你既更常报告、也更少误报。</p>
          <p>右图是 SEEV 注意分配模型：空心方块是按“各仪表出现异常的比例”算出的预测注意份额，圆点是你实际发现的份额，两者之差就是模型没解释的部分（例如位置偏好或检查策略）。</p></div>
          <div class="model-grid">${roc}${seev}</div>
          <p class="model-caveat">这是你一个人的数据，只用于自查，不作为普遍结论：虚报率仅由每个条件 4 个“接近阈值但未越界”的试次估计，随机波动较大；正式结论需要用全部被试的数据合并分析。</p>`;
      }else{
        const rt=viz.rt(viz.searchTableRows(rows));
        if(!rt){host.innerHTML='';return;}
        host.innerHTML=`<div class="model-heading"><span class="eyebrow">YOUR MODEL FIT</span><h2>你的结果与模型预测${who}</h2>
          <p class="model-lead">${searchNarrative(viz,viz.searchTableRows(rows))}</p>
          <p>下图把 Treisman 与 Gelade（1980）的线性模型 RT = a + b×N 画在你的数据上：圆点是各集大小的正确反应时中位数，虚线是同一条件的最小二乘拟合。线越平，说明项目变多也不明显变慢（平行搜索）；线越陡，说明你要逐个注意检查。</p></div>
          <div class="model-grid single">${rt}</div>
          <p class="model-caveat">这是你一个人的数据，每个集大小只有约 10 个试次，单点中位数波动较大；拟合优度 R² 低时不要过度解读斜率，正式结论需要合并全部被试。</p>`;
      }
    }catch(error){
      console.error('Session model figures failed:',error);
      host.innerHTML='';
    }
  }

  // 由这名被试自己的 SDT 指标生成一句结论（不是模板文案）
  function monitoringNarrative(sdt){
    const get=condition=>sdt.find(item=>item.condition===condition);
    const a=get('A'),b=get('B'),c=get('C');
    const parts=[];
    const row=item=>`${item.condition} d′=${item.d.toFixed(2)}、c=${item.c.toFixed(2)}`;
    const have=[a,b,c].filter(item=>item&&Number.isFinite(item.d)&&Number.isFinite(item.c));
    if(!have.length)return '本次记录不足，暂时画不出你的判断标准。';
    parts.push('你的检测指标：'+have.map(row).join('；')+'。');
    if(a&&c&&Number.isFinite(a.d)&&Number.isFinite(c.d)&&Number.isFinite(a.c)&&Number.isFinite(c.c)){
      const dGain=c.d-a.d, cShift=c.c-a.c;
      const hrGain=(c.hr-a.hr)*100;
      if(cShift<=-0.3&&Math.abs(cShift)>Math.abs(dGain)*1.2){
        parts.push(`从 A 到 C，你的判断标准宽松了 ${Math.abs(cShift).toFixed(2)}（c 变小），命中率上升 ${hrGain.toFixed(1)} 个百分点，但分辨力只提高 ${dGain.toFixed(2)}。也就是说，提示主要是让你更敢报告，而不是看得更准。`);
      }else if(dGain>=0.3){
        parts.push(`从 A 到 C，你的分辨力提高了 ${dGain.toFixed(2)} 个 d′ 单位，判断标准变化 ${cShift.toFixed(2)}（负值＝更敢报），说明提前提示帮你把真实异常和正常波动分得更开。`);
      }else if(Math.abs(dGain)<0.3&&Math.abs(cShift)<0.3){
        parts.push(`三种提示下你的判断几乎没有变化（d′ 差 ${dGain.toFixed(2)}、c 差 ${cShift.toFixed(2)}），本轮提示没有明显改变你的检测方式。`);
      }else{
        parts.push(`从 A 到 C，你的分辨力变化 ${dGain.toFixed(2)} 个 d′ 单位、判断标准变化 ${cShift.toFixed(2)}，两种作用同时存在，需要结合虚报次数一起看。`);
      }
    }
    return parts.join('');
  }

  // 由这名被试自己的斜率生成一句结论
  function searchNarrative(viz,tableRows){
    const fitOf=condition=>viz.linearFit(tableRows
      .filter(row=>row.condition===condition&&Number.isFinite(row.medianRT))
      .map(row=>({x:row.size,y:row.medianRT})));
    const fit={A:fitOf('A'),B:fitOf('B'),C:fitOf('C')};
    const ok=condition=>Number.isFinite(fit[condition].slope);
    const label={A:'特征搜索',B:'联合搜索',C:'预览搜索'};
    const shown=['A','B','C'].filter(ok);
    if(!shown.length)return '本次记录不足，暂时算不出你的搜索斜率。';
    const parts=['你的搜索斜率：'+shown.map(condition=>`${condition} ${label[condition]} ${fit[condition].slope.toFixed(1)} ms/项`).join('；')+'。'];
    if(ok('A')&&ok('B')){
      const diff=fit.B.slope-fit.A.slope;
      if(diff>=10) parts.push(`联合搜索比特征搜索陡 ${diff.toFixed(1)} ms/项，方向与特征整合理论一致：需要把颜色和朝向绑定时，你确实在一项一项地检查。`);
      else if(diff>=3) parts.push(`联合搜索只比特征搜索陡 ${diff.toFixed(1)} ms/项，方向对但幅度不大，说明你在一部分试次里仍能靠颜色整体扫过去。`);
      else if(diff>-3) parts.push(`两种搜索的斜率几乎一样（差 ${diff.toFixed(1)} ms/项），本轮没有出现经典的平行—序列差异，可能和练习量或速度—正确率权衡有关。`);
      else parts.push(`联合搜索反而比特征搜索平 ${Math.abs(diff).toFixed(1)} ms/项，方向与经典结果相反，单人数据下更可能是随机波动，不宜直接下结论。`);
    }
    if(ok('B')&&ok('C')&&fit.B.slope>0){
      const drop=(fit.B.slope-fit.C.slope)/fit.B.slope*100;
      if(drop>=8) parts.push(`预览条件比联合搜索低 ${drop.toFixed(0)}%，说明提前出现的那一半项目帮你减轻了逐项检查的负担。`);
      else if(drop>-8) parts.push(`预览条件与联合搜索基本持平（差 ${Math.abs(drop).toFixed(0)}%），这一轮的预览没有帮到你。`);
      else parts.push(`预览条件反而比联合搜索更高（+${Math.abs(drop).toFixed(0)}%），本轮预览没有起到视觉标记的作用。`);
    }
    return parts.join('');
  }
  function statHtml(label,value,note){return `<div class="stat-card"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;}
  function fmtPercent(a,b){return b?(a/b*100).toFixed(1)+'%':'—';}

  async function submitSession(session,automatic=false){
    if(!session)return;
    const code=state.projectCode||session.projectCode;
    if(!code){$('submitStatus').textContent='请先设置六位课程项目码，再提交。';return;}
    if(session.submitted){$('submitStatus').textContent='该次实验记录已提交，未重复发送。';return;}
    const btn=$('submitDataBtn');btn.disabled=true;$('submitStatus').textContent='正在提交实验数据…';
    const payload={project:code,experiment:session.experimentId,participant:session.participantId,condition:'',trials:session.rows.map(r=>({cond:r.condition,rt:r.rt_ms,correct:r.correct,...r}))};
    let timeout=null;
    try{
      const controller=new AbortController();timeout=setTimeout(()=>controller.abort(),15000);
      const response=await fetch('https://attention-lab-production.up.railway.app/api/hw2/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
      const text=await response.text();
      if(!response.ok)throw new Error('服务器返回 '+response.status+'：'+text.slice(0,180));
      session.submitted=true;session.submittedAt=new Date().toISOString();
      $('submitStatus').textContent='数据已成功提交到课程注意实验室。该实验本次只发送了一次 POST。';
      toast('数据提交成功');
      btn.textContent='已提交 ✓';btn.disabled=true;
      updateLocalSubmission(session);
    }catch(err){
      $('submitStatus').textContent='自动提交未成功：'+(err.name==='AbortError'?'请求超时':err.message)+'。请下载CSV备用，或检查项目码与网络后重试。';
      btn.disabled=false;btn.textContent='重试提交 ↗';
      if(automatic)toast('接口提交失败；本地数据仍已保留');
    }finally{if(timeout!==null)clearTimeout(timeout);}
  }
  function updateLocalSubmission(session){
    let list=[];try{list=JSON.parse(localStorage.getItem('northstar_sessions_v1')||'[]');}catch(_e){}
    const idx=list.findIndex(s=>s.experimentId===session.experimentId&&s.participantId===session.participantId&&s.completedAt===session.completedAt);
    if(idx>=0){list[idx].submitted=true;list[idx].submittedAt=session.submittedAt;localStorage.setItem('northstar_sessions_v1',JSON.stringify(list));}
  }

  function exportLastSession(format){
    const s=state.lastSession;if(!s)return;
    const base=s.experimentId+'_'+s.participantId+'_'+new Date(s.completedAt).toISOString().slice(0,10);
    if(format==='csv')downloadBlob(toCSV(s.rows),base+'.csv','text/csv;charset=utf-8');
    else downloadBlob(JSON.stringify({experiment:s.experimentId,participant:s.participantId,completed_at:s.completedAt,trials:s.rows},null,2),base+'.json','application/json');
  }

  function init(){
    $('startMonitoring').addEventListener('click',()=>chooseExperiment('monitoring'));
    $('startSearch').addEventListener('click',()=>chooseExperiment('search'));
    $('cardMonitoring').addEventListener('click',()=>chooseExperiment('monitoring'));
    $('cardSearch').addEventListener('click',()=>chooseExperiment('search'));
    $('backHome').addEventListener('click',()=>showScreen('home'));
    $('briefingBack').addEventListener('click',()=>showScreen('setup'));
    $('continueSetup').addEventListener('click',continueSetup);
    $('beginExperiment').addEventListener('click',startSelectedExperiment);
    $('continueBlock').addEventListener('click',()=>{
      const button=$('continueBlock');
      const fn=state.breakCallback;
      if(typeof fn!=='function'){toast('下一组还没有准备好，请稍等片刻。');return;}
      if(button.disabled)return;
      state.breakCallback=null;
      button.disabled=true;
      button.textContent='正在准备下一组…';
      try{
        fn();
        // A successful transition must leave the break screen. If it does not,
        // restore the callback so the participant can safely retry.
        requestAnimationFrame(()=>{
          if($('screen-break').classList.contains('active')){
            state.breakCallback=fn;
            button.disabled=false;
            button.textContent='再试一次 →';
            toast('下一组没有启动，请再点一次。');
          }
        });
      }catch(err){
        console.error('Block transition failed:',err);
        state.breakCallback=fn;
        button.disabled=false;
        button.textContent='再试一次 →';
        toast('下一组启动失败，请重试。');
      }
    });
    $('reportAnomaly').addEventListener('click',()=>state.currentRunner?.respond());
    $('exitExperiment').addEventListener('click',()=>{
      if(confirm('退出后本次未完成的数据不会提交。确定退出吗？')){state.currentRunner?.abort();showScreen('home');}
    });
    document.addEventListener('keydown',e=>{
      if(!$('screen-task').classList.contains('active'))return;
      if(e.code==='Space'&&$('monitorResponse').hidden===false){e.preventDefault();state.currentRunner?.respond();}
      if(!$('searchResponse').hidden){
        const key=e.key.toLowerCase();
        if(key==='f'){e.preventDefault();state.currentRunner?.respond('present');}
        if(key==='j'){e.preventDefault();state.currentRunner?.respond('absent');}
      }
    });
    $('downloadCsvBtn').addEventListener('click',()=>exportLastSession('csv'));
    $('downloadJsonBtn').addEventListener('click',()=>exportLastSession('json'));
    $('submitDataBtn').addEventListener('click',()=>submitSession(state.lastSession,false));
    $('homeAfterResults').addEventListener('click',()=>{showScreen('home');window.DataAnalysis.render();});
    $('openResults').addEventListener('click',()=>{window.DataAnalysis.render();showScreen('results');});
    $('resultsHome').addEventListener('click',()=>showScreen('home'));
    $('resultsHomeBottom').addEventListener('click',()=>showScreen('home'));
    $('brandHome').addEventListener('click',e=>{e.preventDefault();showScreen('home');});
    $('settingsBtn').addEventListener('click',()=>{ $('settingsProjectCode').value=state.projectCode; $('settingsDialog').showModal();});
    $('saveSettings').addEventListener('click',e=>{
      const code=$('settingsProjectCode').value.trim().toUpperCase();
      if(code&&!/^[A-Z0-9]{6}$/.test(code)){e.preventDefault();toast('项目码应为6位字母或数字');return;}
      state.projectCode=code;if(code)localStorage.setItem('northstar_project_code',code);else localStorage.removeItem('northstar_project_code');$('projectCode').value=code;
    });
    $('projectCode').value=state.projectCode;
    $('settingsProjectCode').value=state.projectCode;
    window.DataAnalysis.init();
    window.DataAnalysis.render();
  }


  function chooseExperiment(key){
    state.activeExperiment=key;
    const e=EXPERIMENTS[key];
    $('setupTitle').textContent=e.title;
    $('setupSubtitle').textContent=e.duration+'。请使用匿名编号，并确认知情同意。';
    $('setupDuration').textContent=e.duration.replace('约','').replace('分钟','');
    $('participantId').value='';$('consentCheck').checked=false;
    $('projectCode').value=state.projectCode;
    $('setupError').textContent='';
    showScreen('setup');
  }
  function continueSetup(){
    const id=$('participantId').value.trim();
    const project=$('projectCode').value.trim().toUpperCase();
    if(!/^[A-Za-z0-9_-]{2,20}$/.test(id)){$('setupError').textContent='请填写2–20位字母、数字、下划线或连字符组成的匿名编号。';return;}
    if(!$('consentCheck').checked){$('setupError').textContent='请先勾选知情同意。';return;}
    if(project&&!/^[A-Z0-9]{6}$/.test(project)){$('setupError').textContent='项目码应为6位字母或数字。';return;}
    state.participantId=id;state.projectCode=project;
    if(project)localStorage.setItem('northstar_project_code',project);else localStorage.removeItem('northstar_project_code');
    populateBriefing();showScreen('briefing');
  }

  window.AppUI={showTaskScreen,setTaskMeta,setProgress,showBreak,finishSession};
  window.AppState=state;
  document.addEventListener('DOMContentLoaded',init);
})();
