(function () {
  'use strict';
  const { $, hashString, mulberry32, shuffle, conditionOrders, mean, median } = window.Core;

  /*
   * 实验二：视觉搜索与并行加工（W6）
   * 范式来源：Treisman & Gelade (1980) 特征整合理论
   *   A 特征搜索：目标 = 红色竖条，干扰项 = 绿色竖条（单特征，平行搜索）
   *   B 联合搜索：目标 = 红色竖条，干扰项 = 红色横条 + 绿色竖条（颜色×朝向绑定）
   *   C 预览搜索（本项目改进条件）：与 B 相同的联合搜索，但一半干扰项提前 1000 ms
   *     呈现，随后再加入其余项目与目标。依据 Watson & Humphreys (1997) 的
   *     视觉标记（visual marking）研究，先呈现的旧项目会被抑制，搜索斜率应下降。
   * 因变量：正确率、正确反应时、反应时随搜索集大小的斜率（ms/项）。
   */

  const CONDITIONS = {
    A: { name: '特征搜索', label: '特征搜索', short: '特征' },
    B: { name: '联合搜索', label: '联合搜索', short: '联合' },
    C: { name: '预览搜索（改进）', label: '预览搜索', short: '预览' }
  };

  const SET_SIZES = [4, 8, 16, 32];
  const REPEATS_PER_CELL = 5;                 // 每个（集大小 × 目标有无）单元 5 次
  const FORMAL_PER_CONDITION = SET_SIZES.length * REPEATS_PER_CELL * 2; // 40
  const PRACTICE_PER_CONDITION = 2;
  const FIXATION_MS = 500;
  const PREVIEW_MS = 1000;
  const RESPONSE_LIMIT_MS = 6000;
  const FEEDBACK_MS = 450;
  const COLS = 8;
  const ROWS = 4;

  function targetLabel() { return '红色竖条'; }

  /* ---------------------------------------------------------------- 刺激生成 */

  // 位置与目标位置只由参与者和 stimulusId 决定，因此 A/B/C 三条件使用完全
  // 相同的空间布局，条件之间只改变干扰项构成与呈现时序。
  function buildBaseLayout(setSize, targetPresent, rng) {
    const cells = shuffle(Array.from({ length: COLS * ROWS }, (_, i) => i), rng).slice(0, setSize);
    const targetSlot = targetPresent ? Math.floor(rng() * setSize) : -1;
    return cells.map((cell, slot) => {
      const col = cell % COLS;
      const row = Math.floor(cell / COLS);
      const x = ((col + 0.5) / COLS) * 100 + (rng() - 0.5) * 2.2;
      const y = ((row + 0.5) / ROWS) * 100 + (rng() - 0.5) * 3.6;
      return {
        slot,
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        isTarget: slot === targetSlot
      };
    });
  }

  // 把基础布局装饰成某一条件的实际项目。干扰项类型按 slot 奇偶交替，
  // 因此 B 与 C 的干扰项构成一致，只有呈现时序不同。
  function decorateItems(baseItems, condition) {
    let distractorIndex = 0;
    const items = baseItems.map(item => {
      if (item.isTarget) {
        return { ...item, color: 'red', orient: 'v', phase: 'new' };
      }
      if (condition === 'A') {
        return { ...item, color: 'green', orient: 'v', phase: 'new' };
      }
      const redHorizontal = distractorIndex % 2 === 0;
      distractorIndex += 1;
      return {
        ...item,
        color: redHorizontal ? 'red' : 'green',
        orient: redHorizontal ? 'h' : 'v',
        phase: 'new'
      };
    });
    if (condition === 'C') {
      // 预览条件：一半干扰项先出现。按 slot 顺序取，保证跨被试可复现。
      const distractors = items.filter(item => !item.isTarget).sort((a, b) => a.slot - b.slot);
      const oldCount = Math.max(1, Math.floor(items.length / 2));
      const oldSlots = new Set(distractors.slice(0, oldCount).map(item => item.slot));
      items.forEach(item => { item.phase = oldSlots.has(item.slot) ? 'old' : 'new'; });
    }
    return items;
  }

  function buildBaseTrials(participantId) {
    const trials = [];
    SET_SIZES.forEach(setSize => {
      [true, false].forEach(targetPresent => {
        for (let repeat = 1; repeat <= REPEATS_PER_CELL; repeat++) {
          const stimulusId = 'S' + setSize + '-' + (targetPresent ? 'P' : 'A') + '-' + repeat;
          const rng = mulberry32(hashString(participantId + ':search:layout:' + stimulusId));
          trials.push({
            stimulusId,
            setSize,
            targetPresent,
            baseItems: buildBaseLayout(setSize, targetPresent, rng),
            trialType: targetPresent ? 'target_present' : 'target_absent'
          });
        }
      });
    });
    return trials;
  }

  function buildTrialSet(participantId, condition) {
    const rng = mulberry32(hashString(participantId + ':search:order:' + condition));
    return shuffle(buildBaseTrials(participantId), rng).map((trial, index) => ({
      ...trial,
      condition,
      trialInBlock: index + 1,
      items: decorateItems(trial.baseItems, condition),
      preview: condition === 'C' ? 1 : 0
    }));
  }

  function buildPracticeTrial(condition, index) {
    const targetPresent = index === 0;
    const stimulusId = 'PRACTICE-' + (index + 1);
    const rng = mulberry32(hashString('practice:search:' + condition + ':' + stimulusId));
    const baseItems = buildBaseLayout(8, targetPresent, rng);
    return {
      stimulusId,
      setSize: 8,
      targetPresent,
      baseItems,
      condition,
      trialInBlock: index + 1,
      items: decorateItems(baseItems, condition),
      preview: condition === 'C' ? 1 : 0,
      trialType: targetPresent ? 'practice_present' : 'practice_absent'
    };
  }

  /* ------------------------------------------------------------------ 统计 */

  // 反应时对搜索集大小的线性回归斜率（ms/项）。这是本实验的核心因变量：
  // 特征搜索应接近 0，联合搜索显著大于 0，预览条件应低于联合搜索。
  function slopeBySetSize(points) {
    const valid = points.filter(point => Number.isFinite(point.y));
    if (valid.length < 2) return NaN;
    const meanX = mean(valid.map(point => point.x));
    const meanY = mean(valid.map(point => point.y));
    const numerator = valid.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0);
    const denominator = valid.reduce((sum, point) => sum + Math.pow(point.x - meanX, 2), 0);
    return denominator ? numerator / denominator : NaN;
  }

  /* ------------------------------------------------------------------ 渲染 */

  function itemHtml(item) {
    return '<i class="search-item" data-color="' + item.color + '" data-orient="' + item.orient +
      '" data-phase="' + item.phase + '" style="left:' + item.x + '%;top:' + item.y + '%"></i>';
  }

  function renderItems(field, items, onlyOld) {
    field.innerHTML = items.filter(item => !onlyOld || item.phase === 'old').map(itemHtml).join('');
  }

  function setButtonsDisabled(disabled) {
    document.querySelectorAll('#searchOptions button').forEach(button => { button.disabled = disabled; });
  }

  /* ------------------------------------------------------------------ Runner */

  function createRunner(config) {
    const participantId = config.participantId;
    const sessionId = config.sessionId || 'session-' + Date.now();
    const order = conditionOrders(participantId, 'search-order');
    const trialsByCondition = Object.fromEntries(order.map(condition => [condition, buildTrialSet(participantId, condition)]));
    const total = order.length * FORMAL_PER_CONDITION;

    let blockIndex = 0, trialIndex = 0, practiceIndex = 0, phase = 'practice', isPractice = false;
    let current = null, rows = [], startTime = 0, responseArmed = false, responseRecorded = false;
    let fixationTimer = null, previewTimer = null, limitTimer = null, feedbackTimer = null;
    let listenersBound = false;

    function conditionLabel(condition) { return CONDITIONS[condition].label; }

    function bindResponses() {
      if (listenersBound) return;
      listenersBound = true;
      document.querySelectorAll('#searchOptions button').forEach(button => {
        button.addEventListener('click', () => respond(button.dataset.value));
      });
    }

    function start() {
      AppUI.showTaskScreen('search');
      bindResponses();
      blockIndex = 0; trialIndex = 0; practiceIndex = 0; phase = 'practice'; isPractice = false; rows = [];
      startTrial();
    }

    function updateMeta() {
      const globalTrial = order.slice(0, blockIndex)
        .reduce((sum, condition) => sum + trialsByCondition[condition].length, 0) + trialIndex + 1;
      AppUI.setTaskMeta({
        subline: '视觉搜索 · ' + targetLabel(),
        condition: conditionLabel(current.condition),
        counter: isPractice
          ? '练习 ' + (practiceIndex + 1) + ' / ' + PRACTICE_PER_CONDITION
          : '第 ' + String(globalTrial).padStart(2, '0') + ' / ' + total + ' 次',
        progress: isPractice ? (globalTrial - 1) / total * 100 : globalTrial / total * 100,
        participant: participantId,
        prompt: '在干扰项中搜索目标：' + targetLabel() + '。',
        subprompt: '有目标按 F，没有目标按 J；也可以直接点按钮。',
        response: 'search'
      });
      $('liveStatus').textContent = '第 ' + (blockIndex + 1) + ' 组 · ' + conditionLabel(current.condition);
    }

    function clearTimers() {
      clearTimeout(fixationTimer); clearTimeout(previewTimer);
      clearTimeout(limitTimer); clearTimeout(feedbackTimer);
      fixationTimer = previewTimer = limitTimer = feedbackTimer = null;
    }

    function startTrial() {
      if (blockIndex >= order.length) return finish();
      const condition = order[blockIndex];
      const list = trialsByCondition[condition];

      if (phase === 'practice') {
        if (practiceIndex < PRACTICE_PER_CONDITION) {
          isPractice = true;
          current = buildPracticeTrial(condition, practiceIndex);
        } else {
          phase = 'formal';
          trialIndex = 0;
          isPractice = false;
        }
      }

      if (phase === 'formal' && trialIndex >= list.length) {
        if (blockIndex >= order.length - 1) return finish();
        blockIndex += 1;
        phase = 'break';
        const next = order[blockIndex];
        AppUI.showBreak(
          '这一组完成啦！',
          '休息一下。下一组：' + CONDITIONS[next].name + '。先做 ' + PRACTICE_PER_CONDITION + ' 次练习，再继续正式任务。',
          blockIndex,
          order.length,
          () => {
            AppUI.showTaskScreen('search');
            phase = 'practice';
            practiceIndex = 0;
            trialIndex = 0;
            isPractice = false;
            startTrial();
          }
        );
        return;
      }

      if (phase === 'formal') {
        isPractice = false;
        current = list[trialIndex];
      }

      const field = $('searchField');
      const stage = $('searchStage');
      stage.classList.remove('feedback-correct', 'feedback-wrong');
      field.innerHTML = '<div class="search-fixation" aria-hidden="true">+</div>';
      $('searchPhase').textContent = '注视中央十字…';
      $('searchPhase').classList.remove('phase-answer');
      $('consoleTitle').textContent = '本轮任务：判断是否存在' + targetLabel();
      $('searchStage').classList.remove('preview-active');
      setButtonsDisabled(true);
      responseArmed = false;
      responseRecorded = false;
      updateMeta();

      fixationTimer = setTimeout(beginSearchDisplay, FIXATION_MS);
    }

    function beginSearchDisplay() {
      const field = $('searchField');
      if (current.condition === 'C') {
        renderItems(field, current.items, true);
        $('searchPhase').textContent = '预览阶段：先熟悉这些干扰项…';
        $('searchStage').classList.add('preview-active');
        $('liveStatus').textContent = '预览干扰项 · ' + conditionLabel(current.condition);
        previewTimer = setTimeout(() => {
          renderItems(field, current.items, false);
          $('searchStage').classList.remove('preview-active');
          armResponse();
        }, PREVIEW_MS);
      } else {
        renderItems(field, current.items, false);
        armResponse();
      }
    }

    function armResponse() {
      responseArmed = true;
      startTime = performance.now();
      $('searchPhase').textContent = '搜索中…有目标 F ／ 无目标 J';
      $('searchPhase').classList.add('phase-answer');
      setButtonsDisabled(false);
      limitTimer = setTimeout(() => { if (!responseRecorded) respond(null); }, RESPONSE_LIMIT_MS);
    }

    function respond(value) {
      if (!responseArmed || responseRecorded || !current) return;
      responseRecorded = true;
      responseArmed = false;
      setButtonsDisabled(true);
      clearTimeout(limitTimer);
      limitTimer = null;
      const rt = value === null ? NaN : Math.max(0, performance.now() - startTime);
      const correct = value === (current.targetPresent ? 'present' : 'absent');
      const stage = $('searchStage');
      stage.classList.remove('feedback-correct', 'feedback-wrong');
      stage.classList.add(correct ? 'feedback-correct' : 'feedback-wrong');
      $('searchPhase').textContent = value === null
        ? '超时未作答'
        : (correct ? '正确' : '错误：目标是' + (current.targetPresent ? '有' : '无'));

      if (!isPractice) {
        rows.push({
          experiment: 'visual_search',
          participant: participantId,
          session_id: sessionId,
          condition: current.condition,
          condition_name: CONDITIONS[current.condition].name,
          trial: rows.length + 1,
          trial_in_block: trialIndex + 1,
          stimulus_id: current.stimulusId,
          trial_type: current.trialType,
          set_size: current.setSize,
          target_present: current.targetPresent ? 1 : 0,
          target_color: 'red',
          target_orient: 'vertical',
          preview: current.preview,
          preview_count: current.items.filter(item => item.phase === 'old').length,
          response: value === null ? 'timeout' : value,
          correct: correct && value !== null ? 1 : 0,
          error_type: value === null ? 'timeout' : correct ? 'ok' : (current.targetPresent ? 'miss' : 'false_alarm'),
          rt_ms: Number.isFinite(rt) ? Math.round(rt) : '',
          timeout: value === null ? 1 : 0
        });
        trialIndex += 1;
        AppUI.setProgress(rows.length / total * 100);
      } else {
        practiceIndex += 1;
      }

      feedbackTimer = setTimeout(startTrial, FEEDBACK_MS);
    }

    function finish() {
      clearTimers();
      const summary = [];
      ['A', 'B', 'C'].forEach(condition => {
        const subset = rows.filter(row => row.condition === condition);
        const correctRows = subset.filter(row => row.correct === 1);
        const bySize = SET_SIZES.map(size => {
          const cell = correctRows.filter(row => row.set_size === size && row.target_present === 1);
          return { x: size, y: median(cell.map(row => Number(row.rt_ms))) };
        });
        summary.push({
          condition,
          name: CONDITIONS[condition].name,
          trials: subset.length,
          accuracy: subset.length ? correctRows.length / subset.length : 0,
          medianRT: median(correctRows.map(row => Number(row.rt_ms))),
          slope: slopeBySetSize(bySize)
        });
      });
      AppUI.finishSession('visual_search', rows, summary);
    }

    function abort() {
      clearTimers();
      responseArmed = false;
      responseRecorded = true;
    }

    function getStatus() {
      return {
        phase, blockIndex, condition: order[blockIndex] || null,
        trialIndex, practiceIndex, order: order.slice(),
        completedRows: rows.length, armed: responseArmed,
        targetPresent: current ? current.targetPresent : null,
        setSize: current ? current.setSize : null,
        isPractice
      };
    }

    return { start, resume: startTrial, respond, abort, getStatus };
  }

  window.SearchExperiment = {
    createRunner, CONDITIONS, SET_SIZES, FORMAL_PER_CONDITION, PRACTICE_PER_CONDITION,
    FIXATION_MS, PREVIEW_MS, RESPONSE_LIMIT_MS, FEEDBACK_MS,
    buildBaseTrials, buildTrialSet, decorateItems, slopeBySetSize, targetLabel
  };
})();
