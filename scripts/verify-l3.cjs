/**
 * L3「学卡」层端到端验收。
 * 用法：先启动 dev server 与带 --remote-debugging-port=9222 的浏览器，再 node scripts/verify-l3.cjs
 * 覆盖：分层路线 L3 的 5 条验收标准 + 关键实现（60 秒计时、答错依据、只升不降、失焦暂停）
 *       + 层间门禁（刷新不崩、状态可恢复、可重置、移动端、控制台零错误）+ L0/L1 回归关键点。
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BASE = process.env.FLIPPAL_BASE_URL || 'http://127.0.0.1:5173';
const CDP_PORT = process.env.FLIPPAL_CDP_PORT || '9222';
const PERSIST_KEY = 'flip-pal-demo-v1';

const cards = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../src/data/cards.json'), 'utf8'),
).cards;
const cardsById = new Map(cards.map((card) => [card.id, card]));

const checks = [];
const runtimeErrors = [];

function record(name, ok, detail, severity = 'hard') {
  checks.push({ name, pass: Boolean(ok), detail, severity });
}

async function connectTarget() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const page = list.find((item) => item.type === 'page');
      if (page) {
        return page;
      }
    } catch {}
    await delay(250);
  }
  throw new Error('无法连接验收浏览器');
}

async function main() {
  const page = await connectTarget();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  let loadWaiters = [];

  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const pair = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) {
        pair.reject(new Error(data.error.message));
      } else {
        pair.resolve(data.result);
      }
    }
    if (data.method === 'Page.loadEventFired') {
      const waiters = loadWaiters;
      loadWaiters = [];
      waiters.forEach((resolve) => resolve());
    }
    if (data.method === 'Runtime.exceptionThrown') {
      runtimeErrors.push(data.params.exceptionDetails.text);
    }
    if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
      runtimeErrors.push(
        data.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '),
      );
    }
  });

  const waitForLoad = () => new Promise((resolve) => loadWaiters.push(resolve));

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const key = ++id;
      pending.set(key, { resolve, reject });
      ws.send(JSON.stringify({ id: key, method, params }));
    });

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description || result.exceptionDetails.text,
      );
    }
    return result.result.value;
  };

  const waitFor = async (expression, label, attempts = 60) => {
    for (let i = 0; i < attempts; i += 1) {
      if (await evaluate(expression)) {
        return;
      }
      await delay(100);
    }
    throw new Error(`等待超时：${label}`);
  };

  const navigate = async (url) => {
    const loaded = waitForLoad();
    await send('Page.navigate', { url: BASE + url });
    await loaded;
    await waitFor(
      "document.readyState === 'complete' && Boolean(document.querySelector('#root .site'))",
      url,
    );
    await delay(150);
  };

  const reload = async () => {
    const loaded = waitForLoad();
    await send('Page.reload');
    await loaded;
    await waitFor(
      "document.readyState === 'complete' && Boolean(document.querySelector('#root .site'))",
      '刷新',
    );
    await delay(150);
  };

  const setViewport = async (width, height, mobile) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
    });
  };

  const readState = () =>
    evaluate(`(() => {
      const raw = localStorage.getItem('${PERSIST_KEY}');
      return raw ? JSON.parse(raw).state : null;
    })()`);

  const readLearn = () =>
    evaluate(`(() => ({
      path: location.pathname,
      heading: document.querySelector('.learn-head h1')?.textContent?.trim() ?? '',
      question: document.querySelector('.learn-question')?.textContent?.trim() ?? '',
      back: document.querySelector('.learn-back')?.textContent?.trim() ?? '',
      source: document.querySelector('.learn-source')?.textContent?.trim() ?? '',
      flipped: document.querySelector('.learn-flip')?.classList.contains('is-flipped') ?? false,
      hasQuiz: Boolean(document.querySelector('.quiz-panel')),
      timer: document.querySelector('.quiz-panel-timer')?.textContent?.trim() ?? '',
      optionCount: document.querySelectorAll('.quiz-panel-option').length,
      submitDisabled: document.querySelector('.quiz-panel-submit')?.disabled ?? null,
      resultFlag: document.querySelector('.learn-result-flag')?.textContent?.trim() ?? '',
      result: document.querySelector('.learn-result h2')?.textContent?.trim() ?? '',
      resultAnswer: document.querySelector('.learn-result-answer')?.textContent?.trim() ?? '',
      resultEvidence: document.querySelector('.learn-result-evidence')?.textContent?.trim() ?? '',
      resultMastery: document.querySelector('.learn-result-mastery-value')?.textContent?.trim() ?? '',
      masteryLabel: [...document.querySelectorAll('.learn-meta span')].map((n) => n.textContent.trim()),
      ring: document.querySelector('.learn-result .progress-ring-text')?.textContent?.trim() ?? '',
      ringAria: document.querySelector('.learn-result .progress-ring')?.getAttribute('aria-label') ?? '',
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth
    }))()`);

  const readHome = () =>
    evaluate(`(() => ({
      path: location.pathname,
      ring: document.querySelector('.home .progress-ring-text')?.textContent?.trim() ?? '',
      ringAria: document.querySelector('.home .progress-ring')?.getAttribute('aria-label') ?? '',
      doneMarkers: document.querySelectorAll('.island-marker[data-status="done"]').length,
      triggerNote: document.querySelector('.draw-trigger small')?.textContent?.trim() ?? '',
      triggerDisabled: document.querySelector('.draw-trigger')?.disabled ?? null,
      navCount: document.querySelectorAll('.route-index a').length,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth
    }))()`);

  const openLearn = async (cardId) => {
    await navigate(`/learn/${cardId}`);
    await waitFor("Boolean(document.querySelector('.learn-page'))", '学卡页挂载');
  };

  const flip = async () => {
    await evaluate("document.querySelector('.learn-flip-button').click()");
    await waitFor("Boolean(document.querySelector('.quiz-panel'))", '翻面后小测出现');
  };

  const timerSeconds = async () => {
    const text = await evaluate("document.querySelector('.quiz-panel-timer')?.textContent ?? ''");
    const match = text.match(/\d+/);
    return match ? Number(match[0]) : NaN;
  };

  const stage = async (name, fn) => {
    try {
      const detail = await fn();
      record(name, true, detail);
      return detail;
    } catch (error) {
      record(name, false, error.message);
      return null;
    }
  };

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await setViewport(1440, 900, false);

    // 取今日三张卡（L2 抽卡结果），后续 L3 全部基于真实卡数据。
    await navigate('/draw?demo=fresh');
    await waitFor("document.querySelectorAll('.flip-card').length === 3", '三张卡发牌');
    const todayIds = (await readState()).todayDraw.cardIds;
    const [firstId, secondId, thirdId] = todayIds;
    const firstCard = cardsById.get(firstId);
    const secondCard = cardsById.get(secondId);
    const thirdCard = cardsById.get(thirdId);
    assert.ok(firstCard && secondCard && thirdCard, '今日卡片必须都能在卡池中找到');

    // 走真实入口：抽卡页翻牌 → 点击「进入学卡」，而不是直接深链。
    // 首页路线图第 01 站依赖翻牌记录，深链进入会绕过这一步。
    await evaluate("document.querySelector('.flip-card-back-button').click()");
    await waitFor("document.querySelectorAll('.flip-card.is-flipped').length === 1", '翻开首张卡');
    await evaluate("document.querySelector('.flip-card-link').click()");
    await waitFor("location.pathname.startsWith('/learn/')", '从抽卡页进入学卡页');
    await waitFor("Boolean(document.querySelector('.learn-page'))", '学卡页挂载');

    // ---------- 验收 1：翻面动画 + 60 秒小测启动 + 未完成不记录 ----------
    const frontStage = await stage('验收1 翻面动画与 60 秒小测启动', async () => {
      await openLearn(firstId);
      const before = await readLearn();
      const state = await readState();
      assert.equal(before.question, firstCard.front, '正面应展示卡面提问');
      assert.equal(before.hasQuiz, false, '翻面前不应启动小测计时');
      assert.equal(state.mastery[firstId] ?? 0, 0, '未翻面不应记录掌握度');
      assert.equal((state.learnedToday ?? []).length, 0, '未翻面不应写入今日已学');

      await flip();
      const after = await readLearn();
      const seenState = await readState();
      assert.equal(after.flipped, true);
      assert.ok(after.back.includes(firstCard.back.slice(0, 20)), '背面解释应完整呈现');
      assert.ok(after.source.includes(firstCard.source.slice(0, 12)), '来源应可见');
      assert.equal(after.hasQuiz, true);
      assert.equal(after.optionCount, 4, '小测应为 4 选 1');
      assert.match(after.timer, /剩余 \d+ 秒/);
      const seconds = Number(after.timer.match(/\d+/)[0]);
      assert.ok(seconds >= 58 && seconds <= 60, `倒计时应从 60 秒开始，实际 ${seconds}`);
      assert.equal(after.submitDisabled, true, '未选择时提交按钮应禁用');
      assert.equal(seenState.mastery[firstId], 1, '翻面应记掌握度 1');
      assert.deepEqual(seenState.learnedToday, [firstId], '翻面应写入今日已学');

      await delay(1300);
      const style = await evaluate(`(() => {
        const inner = document.querySelector('.learn-flip-inner');
        const face = document.querySelector('.learn-face');
        const a = getComputedStyle(inner);
        const b = getComputedStyle(face);
        return {
          transform: a.transform,
          transitionDuration: a.transitionDuration,
          transformStyle: a.transformStyle,
          backfaceVisibility: b.backfaceVisibility
        };
      })()`);
      assert.match(style.transform, /matrix3d|matrix/, '翻面应产生 rotateY 变换');
      assert.equal(style.transitionDuration, '0.72s');
      assert.equal(style.transformStyle, 'preserve-3d');
      assert.equal(style.backfaceVisibility, 'hidden', '应使用 backface-visibility 防止闪烁');
      const tickAfter = await timerSeconds();
      assert.ok(
        tickAfter < seconds,
        `翻面后倒计时应自然推进（StrictMode 回归），实际 ${seconds} → ${tickAfter}`,
      );
      return { seconds, tickAfter, style, masteryAfterFlip: seenState.mastery[firstId] };
    });

    // ---------- 验收 3：答对升 2 + 答错显示依据 ----------
    await stage('验收3 答对后掌握度为 2', async () => {
      if (!frontStage) throw new Error('前置阶段失败');
      await evaluate(`document.querySelectorAll('.quiz-panel-option')[${firstCard.quiz.answer}].click()`);
      const enabled = await evaluate("document.querySelector('.quiz-panel-submit')?.disabled === false");
      assert.equal(enabled, true, '选择后提交按钮应可用');
      await evaluate("document.querySelector('.quiz-panel-submit').click()");
      await waitFor("Boolean(document.querySelector('.learn-result'))", '结果页出现');
      const dom = await readLearn();
      const state = await readState();
      assert.equal(dom.result, '答对。');
      assert.ok(dom.resultAnswer.includes(firstCard.quiz.options[firstCard.quiz.answer]));
      assert.ok(dom.resultEvidence.includes(firstCard.quiz.evidence), '结果页应展示背面依据句');
      assert.equal(state.mastery[firstId], 2, '答对应升到 2');
      assert.equal(dom.resultMastery, '2 / 3');
      assert.equal(dom.ring, '1 / 3', '结果页进度环应为 1 / 3');
      assert.match(dom.ringAria, /1 \/ 3/);
      return { mastery: state.mastery[firstId], ring: dom.ring, evidence: firstCard.quiz.evidence };
    });

    // ---------- 验收 5：从学卡页返回首页，进度环数值一致 ----------
    await stage('验收5 返回首页进度环数值一致', async () => {
      await evaluate("document.querySelector('.learn-result .learn-nav a.button.primary').click()");
      await waitFor("location.pathname === '/'", '返回首页');
      const home = await readHome();
      assert.equal(home.ring, '1 / 3', '首页进度环应与学卡结果页一致');
      assert.match(home.ringAria, /1 \/ 3/);
      assert.ok(home.doneMarkers >= 1, '路线图第 01 站应点亮');
      return { ring: home.ring, doneMarkers: home.doneMarkers, triggerNote: home.triggerNote };
    });

    // ---------- 验收 4：刷新后掌握度与今日进度保留 ----------
    await stage('验收4 刷新后掌握度与今日进度保留', async () => {
      await reload();
      const home = await readHome();
      const state = await readState();
      assert.equal(state.mastery[firstId], 2, '刷新后掌握度应保留');
      assert.deepEqual(state.learnedToday, [firstId], '刷新后今日已学应保留');
      assert.equal(home.ring, '1 / 3', '刷新后进度环应保留');
      await openLearn(firstId);
      const dom = await readLearn();
      assert.ok(dom.masteryLabel.some((text) => text.includes('掌握度 2 / 3')), '重新进入应显示掌握度 2');
      return { mastery: state.mastery[firstId], ring: home.ring, meta: dom.masteryLabel };
    });

    // ---------- 验收 3b：答错保持 1、答错显示依据、只升不降与幂等 ----------
    await stage('验收3b 答错保持 1 且展示依据，重复学习不重复加分', async () => {
      await openLearn(secondId);
      await flip();
      const wrongIndex = (secondCard.quiz.answer + 1) % secondCard.quiz.options.length;
      await evaluate(`document.querySelectorAll('.quiz-panel-option')[${wrongIndex}].click()`);
      await evaluate("document.querySelector('.quiz-panel-submit').click()");
      await waitFor("Boolean(document.querySelector('.learn-result'))", '答错结果页');
      const wrong = await readLearn();
      const wrongState = await readState();
      assert.equal(wrong.result, '这次没答对。');
      assert.ok(wrong.resultAnswer.includes(secondCard.quiz.options[secondCard.quiz.answer]));
      assert.ok(wrong.resultEvidence.includes(secondCard.quiz.evidence), '答错也应展示背面依据句');
      assert.equal(wrongState.mastery[secondId], 1, '答错应保持 1');
      assert.equal(wrong.ring, '2 / 3', '两张卡已翻面，进度环应为 2 / 3');

      // 重新学习同一张卡并答对：掌握度 1 → 2，且 learnedToday 不重复增长。
      await openLearn(secondId);
      await flip();
      await evaluate(`document.querySelectorAll('.quiz-panel-option')[${secondCard.quiz.answer}].click()`);
      await evaluate("document.querySelector('.quiz-panel-submit').click()");
      await waitFor("Boolean(document.querySelector('.learn-result'))", '二次答对结果页');
      const corrected = await readState();
      assert.equal(corrected.mastery[secondId], 2, '二次答对应升到 2');
      assert.equal(corrected.learnedToday.length, 2, '重复学习不应重复添加今日已学');

      // 第三次重复：掌握度只升不降，分数不变。
      await openLearn(secondId);
      await flip();
      await evaluate(`document.querySelectorAll('.quiz-panel-option')[${wrongIndex}].click()`);
      await evaluate("document.querySelector('.quiz-panel-submit').click()");
      await waitFor("Boolean(document.querySelector('.learn-result'))", '三次重复结果页');
      const repeated = await readState();
      assert.equal(repeated.mastery[secondId], 2, '答错不应把已有掌握度降回 1');
      assert.equal(repeated.learnedToday.length, 2);
      return {
        wrongMastery: wrongState.mastery[secondId],
        correctedMastery: corrected.mastery[secondId],
        repeatedMastery: repeated.mastery[secondId],
        learnedToday: repeated.learnedToday,
      };
    });

    // ---------- 验收 2：计时结束自动交卷、未选视为答错 ----------
    await stage('验收2 计时结束自动交卷（未选视为答错）', async () => {
      await openLearn(thirdId);
      await flip();
      assert.equal((await readLearn()).submitDisabled, true, '未选择任何选项');
      await evaluate(`(() => {
        const orig = performance.now.bind(performance);
        let offset = 0;
        Object.defineProperty(performance, 'now', {
          configurable: true,
          value: () => orig() + offset
        });
        window.__advanceClock = (ms) => { offset += ms; };
        return true;
      })()`);
      await evaluate('window.__advanceClock(61000)');
      await waitFor("Boolean(document.querySelector('.learn-result'))", '超时自动交卷', 40);
      const dom = await readLearn();
      const state = await readState();
      assert.equal(dom.resultFlag, 'QUIZ / TIMEOUT');
      assert.equal(dom.result, '时间到，按答错结算。');
      assert.ok(dom.resultAnswer.includes(thirdCard.quiz.options[thirdCard.quiz.answer]));
      assert.equal(state.mastery[thirdId], 1, '超时未选应按答错结算为 1');
      return { flag: dom.resultFlag, result: dom.result, mastery: state.mastery[thirdId] };
    });

    // ---------- 关键实现：页面失焦暂停计时，回焦恢复 ----------
    await stage('关键实现 失焦暂停计时、回焦恢复', async () => {
      await openLearn(firstId);
      await flip();
      await evaluate("window.dispatchEvent(new Event('blur'))");
      await delay(200);
      const pausedAt = await timerSeconds();
      await delay(1400);
      const stillPaused = await timerSeconds();
      assert.equal(stillPaused, pausedAt, '失焦期间倒计时不应推进');

      await evaluate("window.dispatchEvent(new Event('focus'))");
      let resumed = stillPaused;
      for (let i = 0; i < 14; i += 1) {
        await delay(300);
        resumed = await timerSeconds();
        if (resumed < pausedAt) break;
      }
      assert.ok(resumed < pausedAt, `回焦后倒计时应恢复，实际 ${pausedAt} → ${resumed}`);
      return { pausedAt, stillPaused, resumed };
    });

    // ---------- 门禁：重置、移动端、控制台零错误、L0/L1 回归 ----------
    await stage('门禁 可恢复：重置演示回到初始态', async () => {
      await navigate('/?demo=fresh');
      const raw = await evaluate(`localStorage.getItem('${PERSIST_KEY}')`);
      assert.equal(raw, null, '重置后 localStorage 应清空');
      const home = await readHome();
      assert.equal(home.ring, '0 / 3', '重置后进度环归零');
      assert.equal(home.doneMarkers, 0, '重置后路线图无已完成站点');
      await navigate('/draw');
      await waitFor("document.querySelectorAll('.flip-card').length === 3", '重置后可再次抽卡');
      return { ring: home.ring, doneMarkers: home.doneMarkers };
    });

    await stage('门禁 可演示：375px 学卡页无横向溢出', async () => {
      await setViewport(375, 900, true);
      await openLearn(firstId);
      const dom = await readLearn();
      assert.ok(dom.scrollWidth <= 375, `横向溢出：${dom.scrollWidth}`);
      assert.equal(dom.optionCount, 0, '未翻面时不应渲染小测');
      await evaluate("document.querySelector('.learn-flip-button').click()");
      await waitFor("Boolean(document.querySelector('.quiz-panel'))", '移动端翻面');
      const flipped = await readLearn();
      assert.ok(flipped.scrollWidth <= 375, `翻面后横向溢出：${flipped.scrollWidth}`);
      assert.equal(flipped.optionCount, 4);
      await setViewport(1440, 900, false);
      return { scrollWidth: flipped.scrollWidth, optionCount: flipped.optionCount };
    });

    await stage('回归 L0/L1 关键点', async () => {
      await navigate('/cards');
      const pool = await evaluate("document.querySelectorAll('.pool-card').length");
      assert.equal(pool, 24, '卡池仍应为 24 张');
      await navigate('/');
      const home = await readHome();
      assert.equal(home.navCount, 7, '首页仍应有 7 个路由入口');
      assert.equal(home.triggerDisabled, false, '首页抽卡入口应可用');
      await navigate('/learn/preview');
      assert.ok(await evaluate("Boolean(document.querySelector('#root .site'))"), '学卡路由可直接访问');
      return { pool, navCount: home.navCount, triggerDisabled: home.triggerDisabled };
    });

    // 静态：小测依据句必须来自卡背面（内容红线）。
    const evidenceOutsideBack = cards.filter((card) => !card.back.includes(card.quiz.evidence));
    record(
      '内容红线 小测依据句可在背面找到',
      evidenceOutsideBack.length === 0,
      evidenceOutsideBack.length === 0
        ? '24 张卡的 quiz.evidence 均可在本卡背面定位'
        : evidenceOutsideBack.map((card) => card.id),
    );

    record('门禁 可运行：控制台无红色错误', runtimeErrors.length === 0, runtimeErrors);

    const hard = checks.filter((item) => item.severity === 'hard');
    const passed = hard.filter((item) => item.pass).length;
    console.log(
      JSON.stringify(
        {
          layer: 'L2 回归 + L3 学卡',
          verdict: passed === hard.length ? '硬性验收全部通过' : '存在未通过项',
          passed,
          total: hard.length,
          todayIds,
          checks,
          runtimeErrors,
        },
        null,
        2,
      ),
    );
    if (passed !== hard.length) {
      process.exitCode = 1;
    }
  } finally {
    if (process.env.FLIPPAL_CLOSE_BROWSER !== '0') {
      await send('Browser.close').catch(() => {});
    }
    ws.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
