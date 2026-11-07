(function () {
  'use strict';
  const { $, parseCSV, mean, median } = window.Core;
  let importedRows = [];

  function flattenJson(parsed) {
    const out = [];
    function walk(node, context = {}) {
      if (Array.isArray(node)) { node.forEach(item => walk(item, context)); return; }
      if (!node || typeof node !== 'object') return;
      const merged = { ...context, ...node };
      if (Array.isArray(node.trials)) {
        const parent = Object.fromEntries(Object.entries(node).filter(([key]) => key !== 'trials'));
        node.trials.forEach(trial => out.push({ ...context, ...parent, ...trial }));
        return;
      }
      if (('experiment' in node || 'experiment_id' in node) &&
          ('condition' in node || 'cond' in node) &&
          ('participant' in node || 'participant_id' in node)) out.push(merged);
      Object.entries(node).forEach(([key, value]) => {
        if (value && typeof value === 'object' && key !== 'trials') walk(value, merged);
      });
    }
    walk(parsed);
    return out;
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === '') return NaN;
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
  }

  function normalizeRows(rows) {
    return rows.map(row => {
      const rawExperiment = String(row.experiment || row.experiment_id || row.study || '').toLowerCase();
      const isSearch = rawExperiment.includes('search') || rawExperiment.includes('visual') || rawExperiment.includes('treisman');
      const isMonitoring = rawExperiment.includes('monitor') || rawExperiment.includes('senders') || rawExperiment.includes('aviation');
      const rawCorrect = row.correct ?? row.is_correct ?? row.accuracy;
      const hasCorrect = rawCorrect !== undefined && rawCorrect !== null && rawCorrect !== '';
      const correct = rawCorrect === true || rawCorrect === 1 || String(rawCorrect).toLowerCase() === 'true' || String(rawCorrect) === '1';
      return {
        ...row,
        experiment: isSearch ? 'visual_search' : isMonitoring ? 'aviation_monitoring' : rawExperiment,
        participant: String(row.participant || row.participant_id || row.subject || 'unknown'),
        session_id: String(row.session_id || row.session || ''),
        condition: String(row.condition || row.cond || ''),
        task_type: String(row.task_type || row.task || ''),
        trial_type: String(row.trial_type || row.event_type || ''),
        response_class: String(row.response_class || row.response_type || ''),
        correct,
        has_correct: hasCorrect,
        rt_ms: toNumber(row.rt_ms ?? row.rt ?? row.reaction_time_ms ?? row.reaction_time)
      };
    }).filter(row => row.experiment && row.condition);
  }

  function getRows() {
    let local = [];
    try { local = JSON.parse(localStorage.getItem('northstar_sessions_v1') || '[]').flatMap(session => session.rows || []); }
    catch (_error) { local = []; }
    const seen = new Set();
    return normalizeRows([...local, ...importedRows]).filter(row => {
      const key = [row.experiment, row.participant, row.session_id, row.condition,
        row.stimulus_id || row.trial || row.trial_in_block, row.rt_ms, row.correct].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function byParticipant(rows, condition, metric, filter = () => true) {
    const grouped = new Map();
    rows.filter(row => row.condition === condition && filter(row)).forEach(row => {
      if (!grouped.has(row.participant)) grouped.set(row.participant, []);
      const value = metric(row);
      if (Number.isFinite(value)) grouped.get(row.participant).push(value);
    });
    return new Map([...grouped.entries()].map(([participant, values]) => [participant, mean(values)]));
  }

  function pairedEffect(conditionA, conditionB) {
    const participants = [...conditionA.keys()].filter(id => conditionB.has(id));
    const differences = participants.map(id => conditionB.get(id) - conditionA.get(id)).filter(Number.isFinite);
    if (differences.length < 2) return { n: differences.length, difference: NaN, dz: NaN };
    const difference = mean(differences);
    const sd = Math.sqrt(differences.reduce((sum, value) => sum + (value - difference) ** 2, 0) / (differences.length - 1));
    return { n: differences.length, difference, dz: sd > 0 ? difference / sd : NaN };
  }

  function fmt(value, digits = 1) { return Number.isFinite(value) ? value.toFixed(digits) : '—'; }
  function uniqueParticipants(rows) { return new Set(rows.map(row => row.participant).filter(id => id && id !== 'unknown')).size; }
  function eligibleOtherParticipants(rows) { return [...new Set(rows.map(row => row.participant).filter(id => id && id !== 'unknown' && !/^(SELF|TEST|RESEARCHER)$/i.test(id)))]; }
  function byParticipantAcrossConditions(rows, metric, filter = () => true) {
    const grouped = new Map();
    rows.filter(filter).forEach(row => {
      if (!grouped.has(row.participant)) grouped.set(row.participant, []);
      const value = metric(row);
      if (Number.isFinite(value)) grouped.get(row.participant).push(value);
    });
    return new Map([...grouped.entries()].map(([participant, values]) => [participant, mean(values)]));
  }

  function byParticipantMedian(rows, condition, filter = () => true, valueField = 'rt_ms') {
    const grouped = new Map();
    rows.filter(row => row.condition === condition && filter(row)).forEach(row => {
      const value = toNumber(row[valueField]);
      if (!Number.isFinite(value)) return;
      if (!grouped.has(row.participant)) grouped.set(row.participant, []);
      grouped.get(row.participant).push(value);
    });
    return new Map([...grouped.entries()].map(([participant, values]) => [participant, median(values)]));
  }
  function statCard(label, value, note) { return `<div class="stat-card"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`; }

  function coverageLine(rows, conditions, minimumTrials = 10) {
    const participants = eligibleOtherParticipants(rows);
    const details = conditions.map(condition => {
      const reached = participants.filter(id => rows.filter(row => row.participant === id && row.condition === condition).length >= minimumTrials).length;
      return `${condition}：${reached}/${participants.length} 人达到每人≥${minimumTrials}试次`;
    });
    const meets = participants.length >= 5 && conditions.every(condition => participants.every(id =>
      rows.filter(row => row.participant === id && row.condition === condition).length >= minimumTrials));
    return `<p class="coverage-line ${meets ? 'coverage-ok' : 'coverage-pending'}"><b>${meets ? '当前记录已达到最低数量门槛' : '数据收集进度'}</b>：匿名被试 ${participants.length}/5；${details.join('；')}。统计时需确认至少5名是其他被试，不把研究者本人计入。</p>`;
  }

  function render() {
    const rows = getRows();
    const monitoring = rows.filter(row => row.experiment === 'aviation_monitoring');
    const search = rows.filter(row => row.experiment === 'visual_search');
    $('dataSourceLabel').textContent = importedRows.length
      ? `本地记录 + 导入文件（导入 ${importedRows.length} 行）`
      : `当前浏览器本地记录（${rows.length} 行）`;
    $('dataOverview').innerHTML = [
      statCard('UNIQUE PARTICIPANTS', uniqueParticipants(rows), '按匿名编号去重'),
      statCard('MONITORING TRIALS', monitoring.length, '实验一记录数'),
      statCard('SEARCH TRIALS', search.length, '实验二记录数'),
      statCard('DATA COMPLETENESS', rows.length ? fmt(rows.filter(row => row.has_correct).length / rows.length * 100, 0) + '%' : '—', '可识别正确性字段')
    ].join('');
    renderMonitoring(monitoring);
    renderSearch(search);
  }

  function renderMonitoring(rows) {
    const host = $('monitorAnalysis');
    if (!rows.length) {
      host.innerHTML = '<div class="empty-analysis">尚无实验一数据。完成实验后可查看本地记录；收集结束后，也可以从注意实验室下载 CSV / JSON 并导入此页面。</div>';
      return;
    }
    const conditions = ['A', 'B', 'C'];
    const summaries = conditions.map(condition => {
      const subset = rows.filter(row => row.condition === condition);
      const anomalies = subset.filter(row => row.trial_type === 'anomaly');
      const nearMisses = subset.filter(row => row.trial_type === 'near_miss');
      const hits = anomalies.filter(row => row.response_class === 'hit');
      const falseAlarms = nearMisses.filter(row => row.response_class === 'false_alarm');
      const validRT = hits.map(row => row.rt_ms).filter(Number.isFinite);
      return {
        condition, n: subset.length, hitRate: anomalies.length ? hits.length / anomalies.length : NaN,
        falseAlarmRate: nearMisses.length ? falseAlarms.length / nearMisses.length : NaN,
        medianRT: median(validRT)
      };
    });

    const hitMaps = Object.fromEntries(conditions.map(condition => [condition,
      byParticipant(rows, condition, row => row.trial_type === 'anomaly' ? (row.response_class === 'hit' ? 1 : 0) : NaN,
        row => row.trial_type === 'anomaly')
    ]));
    const falseAlarmMaps = Object.fromEntries(conditions.map(condition => [condition,
      byParticipant(rows, condition, row => row.trial_type === 'near_miss' ? (row.response_class === 'false_alarm' ? 1 : 0) : NaN,
        row => row.trial_type === 'near_miss')
    ]));
    const bVsA = pairedEffect(hitMaps.A, hitMaps.B);
    const cVsB = pairedEffect(hitMaps.B, hitMaps.C);
    const faCVsB = pairedEffect(falseAlarmMaps.B, falseAlarmMaps.C);
    const hitRTFilter = row => row.trial_type === 'anomaly' && row.response_class === 'hit';
    const rtA = byParticipantMedian(rows, 'A', hitRTFilter);
    const rtB = byParticipantMedian(rows, 'B', hitRTFilter);
    const rtC = byParticipantMedian(rows, 'C', hitRTFilter);
    const rtBVsA = pairedEffect(rtA, rtB);
    const rtCVsB = pairedEffect(rtB, rtC);
    const fastHitMap = byParticipantAcrossConditions(rows, row => row.response_class === 'hit' ? 1 : 0, row => row.trial_type === 'anomaly' && row.signal_rate === 'fast');
    const slowHitMap = byParticipantAcrossConditions(rows, row => row.response_class === 'hit' ? 1 : 0, row => row.trial_type === 'anomaly' && row.signal_rate === 'slow');
    const fastSlowEffect = pairedEffect(slowHitMap, fastHitMap);
    const cRows = rows.filter(row => row.condition === 'C');
    const validPredictions = cRows.filter(row => row.trial_type === 'anomaly' && row.cue_type === 'predictive');
    const falsePredictions = cRows.filter(row => row.trial_type === 'near_miss' && row.cue_type === 'predictive');
    const anomalyC = cRows.filter(row => row.trial_type === 'anomaly');
    const cuePrecision = validPredictions.length + falsePredictions.length ? validPredictions.length / (validPredictions.length + falsePredictions.length) : NaN;
    const predictionCoverage = anomalyC.length ? validPredictions.length / anomalyC.length : NaN;
    const meanCueLead = mean(validPredictions.map(row => row.cue_lead_ms === '' ? NaN : Number(row.cue_lead_ms)).filter(Number.isFinite));
    const speedSummaries = ['slow','fast'].map(rate => {
      const subset = rows.filter(row => row.trial_type === 'anomaly' && row.signal_rate === rate);
      const hits = subset.filter(row => row.response_class === 'hit');
      return { rate, n:subset.length, hitRate:subset.length?hits.length/subset.length:NaN, medianRT:median(hits.map(row=>row.rt_ms).filter(Number.isFinite)) };
    });
    const speedPattern = speedSummaries.every(x => Number.isFinite(x.hitRate))
      ? (speedSummaries[1].hitRate < speedSummaries[0].hitRate
          ? '较快轨迹下命中率低于较慢轨迹。这个方向可与动态信号变化速度影响监控难度的研究思路进行讨论。'
          : speedSummaries[1].hitRate > speedSummaries[0].hitRate
            ? '较快轨迹下命中率高于较慢轨迹。该结果没有呈现“变化越快、监控越困难”的简单模式，应结合反应时与仪表差异解释。'
            : '较快与较慢轨迹下命中率相同；当前样本未显示清晰的速度差异。')
      : '速度分组数据不完整，暂不能判断变化速度模式。';

    const modelFigures = rocFigure(rows) + seevFigure(rows);
    const barRows = summaries.map(summary => `
      <div class="bar-row"><span>${summary.condition} · ${{A:'无提示',B:'事后提示',C:'预测提示'}[summary.condition]}</span>
      <div class="bar-track"><i style="width:${Math.max(0, Math.min(100, (summary.hitRate || 0) * 100))}%"></i></div>
      <b>${fmt(summary.hitRate * 100)}%</b></div>`).join('');
    host.innerHTML = `
      <table class="analysis-table"><thead><tr><th>条件</th><th>命中率</th><th>虚报率</th><th>命中RT中位数</th><th>试次</th></tr></thead>
      <tbody>${summaries.map(summary => `<tr><td>${summary.condition} · ${{A:'无提示',B:'事后提示',C:'预测提示'}[summary.condition]}</td><td>${fmt(summary.hitRate * 100)}%</td><td>${fmt(summary.falseAlarmRate * 100)}%</td><td>${fmt(summary.medianRT, 0)} ms</td><td>${summary.n}</td></tr>`).join('')}</tbody></table>
      ${barRows}
      <h4 class="analysis-subheading">预测提示表现（条件 C）</h4>
      <table class="analysis-table"><tbody><tr><td>真实异常提前提示比例</td><td>${fmt(predictionCoverage*100)}%</td><td>提示 ${validPredictions.length}/${anomalyC.length} 次</td></tr><tr><td>已发出预测提示的准确率</td><td>${fmt(cuePrecision*100)}%</td><td>有效 ${validPredictions.length} 次；误报 ${falsePredictions.length} 次</td></tr><tr><td>有效预测的平均提前量</td><td>${fmt(meanCueLead,0)} ms</td><td>相对实际显示越界帧</td></tr></tbody></table>
      <h4 class="analysis-subheading">信号变化速度与监控绩效</h4>
      <table class="analysis-table"><thead><tr><th>轨迹速度</th><th>真实异常试次数</th><th>命中率</th><th>正确命中 RT 中位数</th></tr></thead><tbody>${speedSummaries.map(x=>`<tr><td>${x.rate==='fast'?'较快':'较慢'}</td><td>${x.n}</td><td>${fmt(x.hitRate*100)}%</td><td>${fmt(x.medianRT,0)} ms</td></tr>`).join('')}</tbody></table>
      ${modelFigures ? `<h4 class="analysis-subheading">模型预测 vs 实测</h4>${modelFigures}` : ''}
      ${coverageLine(rows, conditions, 10)}
      <p class="field-hint">被试内效应：命中率 B−A 平均差=${fmt(bVsA.difference * 100)} 个百分点，d<sub>z</sub>=${fmt(bVsA.dz, 2)}（n=${bVsA.n}）；C−B 差=${fmt(cVsB.difference * 100)} 个百分点，d<sub>z</sub>=${fmt(cVsB.dz, 2)}（n=${cVsB.n}）。正确命中 RT 中位数的被试内差值：B−A=${fmt(rtBVsA.difference,0)} ms，d<sub>z</sub>=${fmt(rtBVsA.dz,2)}（n=${rtBVsA.n}）；C−B=${fmt(rtCVsB.difference,0)} ms，d<sub>z</sub>=${fmt(rtCVsB.dz,2)}（n=${rtCVsB.n}）。近失误试次虚报率 C−B 差=${fmt(faCVsB.difference * 100)} 个百分点（n=${faCVsB.n}）。较快−较慢轨迹命中率差=${fmt(fastSlowEffect.difference*100)} 个百分点，d<sub>z</sub>=${fmt(fastSlowEffect.dz,2)}（n=${fastSlowEffect.n}）。</p>
      <p class="field-hint"><b>与经典研究的对应：</b>Senders（1964）以多仪表动态信号及阈值事件研究视觉采样。本网页保留多仪表监控与阈值响应的任务结构，但仅采用两档简化斜率，并以点击检测绩效作为主要结果，没有复现原研究的眼动测量与完整带宽操纵。当前结果：${speedPattern} 因此应比较变化速度与监控绩效的方向和任务逻辑，不将点击RT解释为眼动采样率。</p>
      <p class="field-hint">每个条件仅有4个接近阈值但未越界试次，因此虚报率估计较不稳定，应作为探索性结果。RT仅计算真实异常显示后的正确命中。</p>`;
  }

  function slopeOf(points) {
    const valid = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (valid.length < 2) return NaN;
    const mx = mean(valid.map(point => point.x));
    const my = mean(valid.map(point => point.y));
    const numerator = valid.reduce((sum, point) => sum + (point.x - mx) * (point.y - my), 0);
    const denominator = valid.reduce((sum, point) => sum + Math.pow(point.x - mx, 2), 0);
    return denominator ? numerator / denominator : NaN;
  }

  // 每名被试一个斜率：把 4 个集大小上的正确RT中位数做线性回归。
  function participantSlopes(rows, condition) {
    const grouped = new Map();
    rows.filter(row => row.condition === condition && row.correct === true && Number(row.target_present) === 1).forEach(row => {
      const size = Number(row.set_size);
      const rt = Number(row.rt_ms);
      if (!Number.isFinite(size) || !Number.isFinite(rt)) return;
      if (!grouped.has(row.participant)) grouped.set(row.participant, new Map());
      const perSize = grouped.get(row.participant);
      if (!perSize.has(size)) perSize.set(size, []);
      perSize.get(size).push(rt);
    });
    const slopes = new Map();
    grouped.forEach((perSize, participant) => {
      slopes.set(participant, slopeOf([...perSize.entries()].map(([size, values]) => ({ x: size, y: median(values) }))));
    });
    return slopes;
  }

  /* ==============================================================
     模型可视化（仅用于结果呈现，不参与实验流程与数据采集）
     1) SDT：由 d′ 生成等敏感度 ROC 预测曲线，与三条件实测点对照
     2) SEEV：按 S·E·V/Ef 计算仪表预测注意份额，与实测命中份额对照
     3) 线性模型：RT = a + b×N，模型预测直线 vs 各集大小实测中位数
     ============================================================== */

  const SERIES_COLOR = { A: '#6f988d', B: '#c7ad70', C: '#5a708f' };
  const SERIES_DASH = { A: '', B: '5 3', C: '2 3' };
  const CONDITION_LABEL = { A: '无提示', B: '事后提示', C: '预测提示' };
  const GAUGE_LABEL = { airspeed: '空速', altitude: '高度', bank: '横滚角', temperature: '发动机温度' };

  // 标准正态分位函数（Acklam 近似，误差 < 1.15e-9）
  function zScore(p) {
    if (!Number.isFinite(p)) return NaN;
    const q = Math.min(Math.max(p, 1e-9), 1 - 1e-9);
    const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];
    const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0, -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0];
    const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0, 3.754408661907416e0];
    const pl = 0.02425, ph = 1 - pl;
    let r, s;
    if (q < pl) {
      s = Math.sqrt(-2 * Math.log(q));
      return (((((c[0] * s + c[1]) * s + c[2]) * s + c[3]) * s + c[4]) * s + c[5]) / ((((d[0] * s + d[1]) * s + d[2]) * s + d[3]) * s + 1);
    }
    if (q > ph) {
      s = Math.sqrt(-2 * Math.log(1 - q));
      return -(((((c[0] * s + c[1]) * s + c[2]) * s + c[3]) * s + c[4]) * s + c[5]) / ((((d[0] * s + d[1]) * s + d[2]) * s + d[3]) * s + 1);
    }
    r = q - 0.5; s = r * r;
    return (((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
  }

  // 标准正态分布函数（Abramowitz & Stegun 7.1.26，误差 < 1.5e-7）
  function normalCdf(x) {
    if (!Number.isFinite(x)) return NaN;
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const p = 1 - Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI) * poly;
    return x >= 0 ? p : 1 - p;
  }

  // 信号检测论：0.5 校正（log-linear），避免 100%／0% 时 d′ 发散
  function sdtStats(hits, signals, falseAlarms, noise) {
    if (!signals || !noise) return { hr: NaN, far: NaN, d: NaN, c: NaN };
    const hr = (hits + 0.5) / (signals + 1);
    const far = (falseAlarms + 0.5) / (noise + 1);
    const zh = zScore(hr), zf = zScore(far);
    return { hr, far, d: zh - zf, c: -0.5 * (zh + zf) };
  }

  function linearFit(points) {
    const valid = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (valid.length < 2) return { slope: NaN, intercept: NaN, r2: NaN, n: valid.length };
    const mx = mean(valid.map(p => p.x)), my = mean(valid.map(p => p.y));
    const sxx = valid.reduce((s, p) => s + (p.x - mx) ** 2, 0);
    const sxy = valid.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
    const syy = valid.reduce((s, p) => s + (p.y - my) ** 2, 0);
    const slope = sxx ? sxy / sxx : NaN;
    return { slope, intercept: my - slope * mx, r2: sxx && syy ? (sxy * sxy) / (sxx * syy) : NaN, n: valid.length };
  }

  function num(v, digits = 0) { return Number.isFinite(v) ? v.toFixed(digits) : '—'; }

  function niceTicks(min, max, count) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
    const raw = (max - min) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) {
      out.push(Math.abs(v) < 1e-9 ? 0 : Number(v.toFixed(6)));
    }
    return out;
  }

  function tickLabel(v) {
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k';
    return Math.abs(v) >= 10 ? String(Math.round(v)) : String(Number(v.toFixed(2)));
  }

  // 统一的 SVG 坐标系：返回数据坐标到像素坐标的映射
  function makeFrame(opts) {
    const W = opts.width || 520, H = opts.height || 300;
    const pad = opts.pad || { l: 56, r: 20, t: 18, b: 44 };
    const x = v => pad.l + (v - opts.xMin) / (opts.xMax - opts.xMin || 1) * (W - pad.l - pad.r);
    const y = v => H - pad.b - (v - opts.yMin) / (opts.yMax - opts.yMin || 1) * (H - pad.t - pad.b);
    const parts = [];
    const yTicks = opts.yTicks || niceTicks(opts.yMin, opts.yMax, 4);
    const xTicks = opts.xTicks || niceTicks(opts.xMin, opts.xMax, 5);
    yTicks.forEach(t => {
      parts.push(`<line x1="${x(opts.xMin).toFixed(1)}" y1="${y(t).toFixed(1)}" x2="${(W - pad.r).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="#eef2f0" stroke-width="1"/>`);
      parts.push(`<text x="${(x(opts.xMin) - 9).toFixed(1)}" y="${(y(t) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="#9aa6ab">${tickLabel(t)}</text>`);
    });
    xTicks.forEach(t => {
      parts.push(`<line x1="${x(t).toFixed(1)}" y1="${y(opts.yMin).toFixed(1)}" x2="${x(t).toFixed(1)}" y2="${(y(opts.yMin) + 4).toFixed(1)}" stroke="#cfd9d5" stroke-width="1"/>`);
      parts.push(`<text x="${x(t).toFixed(1)}" y="${(H - pad.b + 16).toFixed(1)}" text-anchor="middle" font-size="10" fill="#9aa6ab">${tickLabel(t)}</text>`);
    });
    parts.push(`<line x1="${x(opts.xMin).toFixed(1)}" y1="${pad.t}" x2="${x(opts.xMin).toFixed(1)}" y2="${y(opts.yMin).toFixed(1)}" stroke="#cfd9d5" stroke-width="1.2"/>`);
    parts.push(`<line x1="${x(opts.xMin).toFixed(1)}" y1="${y(opts.yMin).toFixed(1)}" x2="${(W - pad.r).toFixed(1)}" y2="${y(opts.yMin).toFixed(1)}" stroke="#cfd9d5" stroke-width="1.2"/>`);
    if (opts.xLabel) parts.push(`<text x="${((pad.l + W - pad.r) / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#8d98a8">${esc(opts.xLabel)}</text>`);
    if (opts.yLabel) parts.push(`<text x="14" y="${((pad.t + H - pad.b) / 2).toFixed(1)}" text-anchor="middle" font-size="10" fill="#8d98a8" transform="rotate(-90 14 ${((pad.t + H - pad.b) / 2).toFixed(1)})">${esc(opts.yLabel)}</text>`);
    return { W, H, pad, x, y, parts };
  }

  function esc(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function legend(items) {
    return `<div class="model-legend">${items.map(item =>
      `<span><i style="background:${item.color}"></i>${esc(item.label)}</span>`).join('')}</div>`;
  }

  function figure(svgInner, caption) {
    return `<figure class="model-figure">${svgInner}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
  }

  // 三个条件的 SDT 指标：群体分析与被试自查共用。
  function sdtTable(rows) {
    return ['A', 'B', 'C'].map(condition => {
      const subset = rows.filter(row => row.condition === condition);
      const signals = subset.filter(row => row.trial_type === 'anomaly');
      const noise = subset.filter(row => row.trial_type === 'near_miss');
      const hits = signals.filter(row => row.response_class === 'hit').length;
      const falseAlarms = noise.filter(row => row.response_class === 'false_alarm').length;
      return { condition, nSignal: signals.length, nNoise: noise.length, ...sdtStats(hits, signals.length, falseAlarms, noise.length) };
    });
  }

  // ── 图 1：SDT 等敏感度 ROC 预测曲线 vs 实测点（实验一）──────────
  function rocFigure(rows) {
    const stats = sdtTable(rows).filter(item => item.nSignal > 0 && item.nNoise > 0 && Number.isFinite(item.d));
    if (!stats.length) return '';

    const frame = makeFrame({ xMin: 0, xMax: 1, yMin: 0, yMax: 1, xTicks: [0, 0.25, 0.5, 0.75, 1], yTicks: [0, 0.25, 0.5, 0.75, 1], xLabel: '虚报率 False Alarm Rate', yLabel: '命中率 Hit Rate', width: 520, height: 320 });
    const parts = frame.parts.slice();
    // 无分辨力对角线
    parts.push(`<line x1="${frame.x(0)}" y1="${frame.y(0)}" x2="${frame.x(1)}" y2="${frame.y(1)}" stroke="#dbe3e0" stroke-width="1.2" stroke-dasharray="4 4"/>`);
    // 各条件按 d′ 画出模型预测曲线 z(HR) = d′ + z(FAR)
    stats.forEach(item => {
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const far = 0.004 + (0.992 * i) / 60;
        const hr = Math.min(0.9995, Math.max(0.0005, normalCdf(item.d + zScore(far))));
        pts.push(`${frame.x(far).toFixed(1)},${frame.y(hr).toFixed(1)}`);
      }
      parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${SERIES_COLOR[item.condition]}" stroke-width="1.8" stroke-dasharray="${SERIES_DASH[item.condition]}" opacity=".85"><title>${item.condition} 条件 SDT 预测曲线 d′=${num(item.d, 2)}</title></polyline>`);
    });
    // 实测点
    stats.forEach((item, index) => {
      const color = SERIES_COLOR[item.condition];
      parts.push(`<circle cx="${frame.x(item.far).toFixed(1)}" cy="${frame.y(item.hr).toFixed(1)}" r="5.5" fill="${color}" stroke="#fff" stroke-width="2"><title>${item.condition} 实测：命中率 ${(item.hr * 100).toFixed(0)}%、虚报率 ${(item.far * 100).toFixed(0)}%、d′=${num(item.d, 2)}、c=${num(item.c, 2)}</title></circle>`);
      // 标签上下交错，避免三个条件靠得近时相互遮挡
      const labelY = frame.y(item.hr) + (index % 2 === 0 ? -10 : 16);
      const labelX = Math.min(frame.x(item.far) + 9, frame.W - frame.pad.r - 58);
      parts.push(`<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" font-size="10" font-weight="700" fill="${color}" paint-order="stroke" stroke="#fffdf9" stroke-width="3" stroke-linejoin="round">${item.condition} d′=${num(item.d, 2)}</text>`);
    });
    const svg = `<svg viewBox="0 0 ${frame.W} ${frame.H}" role="img" aria-label="信号检测论 ROC 预测曲线与实测点">${parts.join('')}</svg>`;
    const caption = `模型：等方差信号检测论 z(HR)=d′+z(FAR)；实线为各条件按实测 d′ 反推的 ROC 预测曲线，圆点为实测 (虚报率, 命中率)，按 0.5 校正落点。点落在曲线上＝该条件与 SDT 假设一致；点相对曲线的高低反映判断标准 c 的偏移。`;
    return figure(svg + legend(stats.map(item => ({ label: `${item.condition} · ${CONDITION_LABEL[item.condition]} d′=${num(item.d, 2)} c=${num(item.c, 2)}`, color: SERIES_COLOR[item.condition] }))), caption);
  }

  // ── 图 2：SEEV 预测注意份额 vs 实测命中份额（实验一）────────────
  function seevFigure(rows) {
    const gauges = ['airspeed', 'altitude', 'bank', 'temperature'];
    const anomalies = rows.filter(row => row.trial_type === 'anomaly');
    if (!anomalies.length) return '';
    const events = gauges.map(gauge => anomalies.filter(row => row.target_gauge === gauge).length);
    const hits = gauges.map(gauge => anomalies.filter(row => row.target_gauge === gauge && row.response_class === 'hit').length);
    const totalEvents = events.reduce((a, b) => a + b, 0);
    const totalHits = hits.reduce((a, b) => a + b, 0);
    if (!totalEvents || !totalHits) return '';
    // SEEV：本界面四表同尺寸（S 恒定）、同阈值重要性（V 恒定）、等距布局（Ef 恒定），
    // 因此预测份额退化为事件率份额 E_i；偏差即 S／Ef／策略的残差。
    const rowsData = gauges.map((gauge, index) => ({
      gauge,
      predicted: totalEvents ? events[index] / totalEvents : NaN,
      observed: totalHits ? hits[index] / totalHits : NaN,
      events: events[index], hits: hits[index]
    })).filter(item => Number.isFinite(item.predicted) && Number.isFinite(item.observed));

    const maxShare = Math.max(0.4, ...rowsData.map(item => Math.max(item.predicted, item.observed) * 1.12));
    const W = 520, rowH = 52, H = 46 + rowsData.length * rowH + 22, padL = 96, padR = 24;
    const x = v => padL + (v / maxShare) * (W - padL - padR);
    const parts = [];
    // 25% 基准线（四表均分）
    const uniform = 1 / rowsData.length;
    parts.push(`<line x1="${x(uniform)}" y1="24" x2="${x(uniform)}" y2="${H - 22}" stroke="#cfd9d5" stroke-width="1.2" stroke-dasharray="4 4"/>`);
    parts.push(`<text x="${x(uniform)}" y="16" text-anchor="middle" font-size="9.5" fill="#9aa6ab">均匀分配 ${(uniform * 100).toFixed(0)}%</text>`);
    rowsData.forEach((item, index) => {
      const cy = 46 + index * rowH + rowH / 2;
      const color = item.observed >= item.predicted ? '#5a708f' : '#b5846a';
      parts.push(`<text x="${padL - 12}" y="${cy + 4}" text-anchor="end" font-size="11" font-weight="700" fill="#344c57">${GAUGE_LABEL[item.gauge] || item.gauge}</text>`);
      parts.push(`<line x1="${x(item.predicted).toFixed(1)}" y1="${cy}" x2="${x(item.observed).toFixed(1)}" y2="${cy}" stroke="${color}" stroke-width="2.5" opacity=".55"/>`);
      parts.push(`<rect x="${(x(item.predicted) - 5).toFixed(1)}" y="${cy - 5}" width="10" height="10" fill="#fff" stroke="#8d98a8" stroke-width="1.6"><title>SEEV 预测 ${(item.predicted * 100).toFixed(1)}%</title></rect>`);
      parts.push(`<circle cx="${x(item.observed).toFixed(1)}" cy="${cy}" r="6" fill="${color}" stroke="#fff" stroke-width="2"><title>实测 ${(item.observed * 100).toFixed(1)}%</title></circle>`);
      const delta = (item.observed - item.predicted) * 100;
      parts.push(`<text x="${(x(Math.max(item.predicted, item.observed)) + 12).toFixed(1)}" y="${cy + 4}" font-size="10" fill="${color}">${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pp</text>`);
      parts.push(`<text x="${(x(Math.max(item.predicted, item.observed)) + 62).toFixed(1)}" y="${cy + 4}" font-size="9.5" fill="#9aa6ab">命中 ${item.hits}/${item.events}</text>`);
    });
    parts.push(`<text x="${((padL + W - padR) / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#8d98a8">注意份额（%）</text>`);
    const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="SEEV 预测注意份额与实测命中份额对比">${parts.join('')}</svg>`;
    const caption = `模型：SEEV 权重 ∝ S·E·V / Ef。四表同尺寸（S）、同阈值重要性（V）、等距布局（Ef）在界面中被控制为常量，故预测份额＝各仪表异常事件份额（空心方块）；实心点为实测命中份额（行为代理，非眼动采样率）。两者之差即模型未解释的残差。`;
    const key = `<div class="model-legend"><span><i style="background:#fff;border:1.5px solid #8d98a8"></i>SEEV 预测份额</span><span><i style="background:#5a708f;border-radius:50%"></i>实测高于预测</span><span><i style="background:#b5846a;border-radius:50%"></i>实测低于预测</span></div>`;
    return figure(svg + key, caption);
  }

  // ── 图 3：RT = a + b×N 线性模型 vs 实测（实验二）────────────────
  function rtModelFigure(tableRows) {
    const conditions = ['A', 'B', 'C'];
    const series = conditions.map(condition => {
      const points = tableRows
        .filter(row => row.condition === condition && Number.isFinite(row.medianRT))
        .map(row => ({ x: row.size, y: row.medianRT }));
      return { condition, points, fit: linearFit(points) };
    }).filter(item => item.points.length >= 2);
    if (!series.length) return '';
    const maxX = Math.max(...series.flatMap(item => item.points.map(point => point.x)), 8);
    const maxY = Math.max(...series.flatMap(item => item.points.map(point => point.y)), 500);
    const frame = makeFrame({ xMin: 0, xMax: maxX * 1.05, yMin: 0, yMax: maxY * 1.12, xLabel: '搜索集大小（项）', yLabel: '正确 RT 中位数（ms）', width: 520, height: 320 });
    const parts = frame.parts.slice();
    series.forEach(item => {
      if (Number.isFinite(item.fit.slope)) {
        const x1 = 0, x2 = maxX;
        const y1 = item.fit.intercept, y2 = item.fit.intercept + item.fit.slope * maxX;
        parts.push(`<line x1="${frame.x(x1).toFixed(1)}" y1="${frame.y(y1).toFixed(1)}" x2="${frame.x(x2).toFixed(1)}" y2="${frame.y(y2).toFixed(1)}" stroke="${SERIES_COLOR[item.condition]}" stroke-width="1.8" stroke-dasharray="${SERIES_DASH[item.condition]}" opacity=".9"><title>${item.condition} 模型 RT=${num(item.fit.intercept, 0)}+${num(item.fit.slope, 1)}×N</title></line>`);
      }
      item.points.forEach(point => {
        parts.push(`<circle cx="${frame.x(point.x).toFixed(1)}" cy="${frame.y(point.y).toFixed(1)}" r="4.8" fill="${SERIES_COLOR[item.condition]}" stroke="#fff" stroke-width="1.8"><title>${item.condition} N=${point.x}：${num(point.y, 0)} ms</title></circle>`);
      });
      const last = item.points.slice().sort((a, b) => a.x - b.x).slice(-1)[0];
      if (last && Number.isFinite(item.fit.slope)) {
        parts.push(`<text x="${(frame.x(last.x) - 4).toFixed(1)}" y="${(frame.y(last.y) - 10).toFixed(1)}" text-anchor="end" font-size="10" font-weight="700" fill="${SERIES_COLOR[item.condition]}">${item.condition} ${num(item.fit.slope, 1)} ms/项</text>`);
      }
    });
    const svg = `<svg viewBox="0 0 ${frame.W} ${frame.H}" role="img" aria-label="线性模型预测线与实测反应时">${parts.join('')}</svg>`;
    const caption = `模型：RT = a + b×N（Treisman & Gelade 的平行—序列框架）。虚线为各条件最小二乘拟合的预测线，圆点为各集大小的正确 RT 中位数（目标存在）。拟合优度：${series.map(item => `${item.condition} R²=${num(item.fit.r2, 2)}`).join('，')}。`;
    return figure(svg + legend(series.map(item => ({ label: `${item.condition} · 斜率 ${num(item.fit.slope, 1)} ms/项，截距 ${num(item.fit.intercept, 0)} ms`, color: SERIES_COLOR[item.condition] }))), caption);
  }

  // 条件×集大小的汇总行：群体分析与被试自查共用同一套计算。
  // 同时兼容 normalizeRows 后的布尔型 correct 与试次原始记录里的 1/0。
  function searchTableRows(rows) {
    const sizes = [...new Set(rows.map(row => Number(row.set_size)).filter(Number.isFinite))].sort((a, b) => a - b);
    const tableRows = [];
    ['A', 'B', 'C'].forEach(condition => sizes.forEach(size => {
      const subset = rows.filter(row => row.condition === condition && Number(row.set_size) === size);
      const correct = subset.filter(row => row.correct === true || Number(row.correct) === 1);
      const presentCorrect = correct.filter(row => Number(row.target_present) === 1);
      tableRows.push({
        condition, size, n: subset.length,
        accuracy: subset.length ? correct.length / subset.length : NaN,
        medianRT: median(presentCorrect.map(row => row.rt_ms))
      });
    }));
    return tableRows;
  }

  function renderSearch(rows) {
    const host = $('searchAnalysis');
    if (!rows.length) {
      host.innerHTML = '<div class="empty-analysis">尚无实验二数据。完成实验后可查看各条件的搜索斜率与正确率；也可以导入课程平台下载的数据。</div>';
      return;
    }
    const conditions = ['A', 'B', 'C'];
    const names = { A: '特征搜索', B: '联合搜索', C: '预览搜索（改进）' };
    const sizes = [...new Set(rows.map(row => Number(row.set_size)).filter(Number.isFinite))].sort((a, b) => a - b);
    const tableRows = searchTableRows(rows);

    const slopes = Object.fromEntries(conditions.map(condition => [condition, participantSlopes(rows, condition)]));
    const meanSlope = Object.fromEntries(conditions.map(condition => [condition, mean([...slopes[condition].values()].filter(Number.isFinite))]));
    const featureVsConjunction = pairedEffect(slopes.A, slopes.B);
    const previewBenefit = pairedEffect(slopes.B, slopes.C);
    const accuracyMaps = Object.fromEntries(conditions.map(condition => [condition,
      byParticipant(rows, condition, row => row.correct ? 1 : 0)
    ]));
    const accuracyBVsC = pairedEffect(accuracyMaps.B, accuracyMaps.C);

    const slopeDirection = Number.isFinite(meanSlope.A) && Number.isFinite(meanSlope.B) && Number.isFinite(meanSlope.C)
      ? (meanSlope.B > meanSlope.A
          ? '联合搜索的斜率高于特征搜索，方向与特征整合理论的平行—序列搜索区分一致。'
          : '联合搜索的斜率没有高于特征搜索；当前数据未呈现经典的特征／联合差异，应检查练习量、集大小范围与速度—正确率权衡。')
      : '三个条件的斜率数据尚不完整。';
    const previewDirection = Number.isFinite(meanSlope.B) && Number.isFinite(meanSlope.C)
      ? (meanSlope.C < meanSlope.B
          ? '预览条件的斜率低于联合搜索，提示先出现的旧项目可能被抑制（视觉标记），减轻了逐项检查的负担。'
          : '预览条件没有降低斜率；可能说明 1000 ms 预览不足以形成标记，或本样本的搜索策略不依赖逐项扫描。')
      : '预览条件与联合搜索的斜率还不能比较。';
    const benefitPercent = Number.isFinite(meanSlope.B) && meanSlope.B > 0 && Number.isFinite(meanSlope.C)
      ? (meanSlope.B - meanSlope.C) / meanSlope.B * 100 : NaN;

    const rtFigure = rtModelFigure(tableRows);

    host.innerHTML = `
      <table class="analysis-table"><thead><tr><th>条件</th><th>集大小</th><th>正确率</th><th>正确RT中位数</th><th>试次</th></tr></thead>
      <tbody>${tableRows.map(row => `<tr><td>${row.condition} · ${names[row.condition]}</td><td>${row.size}</td><td>${fmt(row.accuracy * 100)}%</td><td>${fmt(row.medianRT, 0)} ms</td><td>${row.n}</td></tr>`).join('')}</tbody></table>
      <h4 class="analysis-subheading">搜索斜率（目标存在且作答正确的试次）</h4>
      <table class="analysis-table"><thead><tr><th>条件</th><th>斜率 ms/项</th><th>人均斜率范围</th></tr></thead><tbody>
      ${conditions.map(condition => {
        const values = [...slopes[condition].values()].filter(Number.isFinite);
        return `<tr><td>${condition} · ${names[condition]}</td><td>${fmt(meanSlope[condition], 1)}</td><td>${values.length ? fmt(Math.min(...values), 1) + ' ~ ' + fmt(Math.max(...values), 1) : '—'}</td></tr>`;
      }).join('')}
      </tbody></table>
      ${rtFigure ? `<h4 class="analysis-subheading">模型拟合 vs 实测</h4>${rtFigure}` : ''}
      ${coverageLine(rows, conditions, 10)}
      <p class="field-hint">斜率是被试内指标：先算每名被试在各集大小上的正确RT中位数，再对这 4 个点做线性回归。联合−特征的平均差=${fmt(featureVsConjunction.difference, 1)} ms/项，d<sub>z</sub>=${fmt(featureVsConjunction.dz, 2)}（n=${featureVsConjunction.n}）；预览−联合=${fmt(previewBenefit.difference, 1)} ms/项，d<sub>z</sub>=${fmt(previewBenefit.dz, 2)}（n=${previewBenefit.n}）。正确率上预览−联合=${fmt(accuracyBVsC.difference * 100)} 个百分点，d<sub>z</sub>=${fmt(accuracyBVsC.dz, 2)}（n=${accuracyBVsC.n}）。</p>
      <p class="field-hint"><b>与经典研究的对应：</b>${slopeDirection}${previewDirection}${Number.isFinite(benefitPercent) ? '预览带来的斜率下降为 ' + fmt(benefitPercent, 0) + '%。' : ''} Treisman 与 Gelade（1980）报告特征搜索的斜率接近平坦、联合搜索明显随集大小上升；Watson 与 Humphreys（1997）报告预览旧项目可显著加快联合搜索。本项目采用网页刺激、固定 1000 ms 预览与 4 档集大小，数值不应与原文直接等同，应比较效应方向与任务逻辑。</p>
      <p class="field-hint">注意：正确率与斜率需同时看，速度—正确率权衡会让斜率被低估或高估；红绿配色对红绿色觉异常者不友好，正式收数应记录这一限制。</p>`;
  }

  function loadFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const rows = file.name.toLowerCase().endsWith('.json')
            ? flattenJson(JSON.parse(reader.result))
            : parseCSV(reader.result);
          importedRows = normalizeRows(rows);
          render();
          resolve(importedRows.length);
        } catch (error) { reject(error); }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    });
  }

  function downloadSummary() {
    const rows = getRows();
    const output = [];
    ['aviation_monitoring', 'visual_search'].forEach(experiment => {
      ['A', 'B', 'C'].forEach(condition => {
        const subset = rows.filter(row => row.experiment === experiment && row.condition === condition);
        const taskTypes = experiment === 'visual_search' ? ['all', 'target_present'] : ['all'];
        taskTypes.forEach(task => {
          const selected = task === 'target_present' ? subset.filter(row => Number(row.target_present) === 1) : subset;
          const valid = selected.filter(row => row.correct === true || row.correct === 1);
          const sizes = [...new Set(selected.map(row => Number(row.set_size)).filter(Number.isFinite))].sort((a, b) => a - b);
          const slope = experiment === 'visual_search'
            ? slopeOf(sizes.map(size => ({ x: size, y: median(valid.filter(row => Number(row.set_size) === size).map(row => row.rt_ms)) })))
            : '';
          output.push({
            experiment, condition, task_type: task, participants: uniqueParticipants(selected), trials: selected.length,
            accuracy: selected.length ? valid.length / selected.length : '',
            median_rt_ms: median(valid.map(row => row.rt_ms)),
            slope_ms_per_item: slope
          });
        });
      });
    });
    window.Core.downloadBlob(window.Core.toCSV(output), 'northstar_analysis_summary.csv', 'text/csv;charset=utf-8');
  }

  function init() {
    [$('importData'), $('resultsImport')].forEach(input => input?.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const count = await loadFile(file);
        $('screen-home')?.classList.remove('active');
        window.Core.showScreen('results');
        window.Core.toast('已导入 ' + count + ' 条记录');
      } catch (error) { window.Core.toast('导入失败：' + error.message); }
      event.target.value = '';
    }));
    $('clearImported')?.addEventListener('click', () => { importedRows = []; render(); window.Core.toast('已清除导入数据；本地记录未删除'); });
    $('downloadAnalysis')?.addEventListener('click', downloadSummary);
  }

  window.DataAnalysis = { render, init, loadFile, getRows };
  // 被试完成实验后的“本次结果”页面复用同一套模型图，避免两处各画一份。
  window.ModelViz = { roc: rocFigure, seev: seevFigure, rt: rtModelFigure, searchTableRows, sdtTable, sdtStats, linearFit };
})();
