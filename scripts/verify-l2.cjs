/**
 * L2「抽卡」层端到端验收。
 * 用法：先启动 dev server 与带 --remote-debugging-port=9222 的浏览器，再 node scripts/verify-l2.cjs
 * 覆盖：分层路线 L2 的 5 条验收标准 + 1.2 层间门禁（可运行 / 可恢复 / 可演示）。
 */
const assert = require('node:assert/strict');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BASE = process.env.FLIPPAL_BASE_URL || 'http://127.0.0.1:5173';
const CDP_PORT = process.env.FLIPPAL_CDP_PORT || '9222';
const PERSIST_KEY = 'flip-pal-demo-v1';

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

  const navigate = async (path) => {
    const loaded = waitForLoad();
    await send('Page.navigate', { url: BASE + path });
    await loaded;
    await waitFor(
      "document.readyState === 'complete' && Boolean(document.querySelector('#root .site'))",
      path,
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

  const readDraw = () =>
    evaluate(`(() => ({
      path: location.pathname,
      cardCount: document.querySelectorAll('.flip-card').length,
      flippedCount: document.querySelectorAll('.flip-card.is-flipped').length,
      titles: [...document.querySelectorAll('.flip-card-title')].map((n) => n.textContent.trim()),
      redrawDisabled: document.querySelector('.draw-redraw')?.disabled ?? null,
      note: document.querySelector('.draw-actions-note')?.textContent?.trim() ?? '',
      progress: document.querySelector('.draw-progress')?.textContent?.trim() ?? '',
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth
    }))()`);

  const waitForDeal = () =>
    waitFor("document.querySelectorAll('.flip-card').length === 3", '三张卡发牌');

  const freshDraw = async () => {
    await navigate('/draw?demo=fresh');
    await waitForDeal();
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

    // ---------- 验收 1：同一天同一用户刷新 5 次，抽卡结果一致 ----------
    await stage('验收1 同日刷新 5 次结果一致', async () => {
      await freshDraw();
      const first = await readDraw();
      const firstState = await readState();
      assert.equal(first.cardCount, 3, '应有 3 张卡');
      assert.equal(first.flippedCount, 0, '初始均为卡背');
      assert.equal(firstState.todayDraw.cardIds.length, 3);
      assert.equal(firstState.todayDraw.redrawUsed, false);

      const snapshots = [];
      for (let i = 0; i < 5; i += 1) {
        await reload();
        await waitForDeal();
        const dom = await readDraw();
        const state = await readState();
        snapshots.push({
          domTitles: dom.titles,
          ids: state.todayDraw.cardIds,
          flipped: dom.flippedCount,
        });
      }
      snapshots.forEach((snap, index) => {
        assert.deepEqual(snap.domTitles, first.titles, `第 ${index + 1} 次刷新卡面顺序变化`);
        assert.deepEqual(
          snap.ids,
          firstState.todayDraw.cardIds,
          `第 ${index + 1} 次刷新 cardIds 变化`,
        );
      });
      return {
        ids: firstState.todayDraw.cardIds,
        date: firstState.todayDraw.date,
        titles: first.titles,
        reloads: snapshots.length,
      };
    });

    // ---------- 验收 2 / 4：重抽置灰持久化、已翻开的卡不消失 ----------
    await stage('验收2 重抽置灰且刷新后保持', async () => {
      await freshDraw();
      const before = await readState();
      await evaluate("document.querySelector('.flip-card-back-button').click()");
      await waitFor("document.querySelectorAll('.flip-card.is-flipped').length === 1", '翻开首张');
      const revealedState = await readState();
      const revealedId = revealedState.todayDraw.revealed[0];
      const revealedTitle = (await readDraw()).titles[0];
      assert.equal(before.todayDraw.cardIds[0], revealedId);

      await evaluate("document.querySelector('.draw-redraw').click()");
      await waitFor(
        `JSON.parse(localStorage.getItem('${PERSIST_KEY}')).state.todayDraw.redrawUsed === true`,
        '重抽标记落盘',
      );
      const after = await readDraw();
      const afterState = await readState();
      assert.equal(after.redrawDisabled, true, '重抽后按钮应置灰');
      assert.match(after.note, /今日重抽已使用/);

      await reload();
      await waitForDeal();
      const reloaded = await readDraw();
      const reloadedState = await readState();
      assert.equal(reloaded.redrawDisabled, true, '刷新后按钮仍应置灰');
      assert.equal(reloadedState.todayDraw.redrawUsed, true, '刷新后重抽标记应保留');
      assert.deepEqual(
        reloadedState.todayDraw.cardIds,
        afterState.todayDraw.cardIds,
        '刷新后重抽结果应保留',
      );
      return {
        afterReloadDisabled: reloaded.redrawDisabled,
        redrawUsed: true,
        ids: afterState.todayDraw.cardIds,
      };
    });

    await stage('验收4 已翻开的卡不因重抽消失', async () => {
      await freshDraw();
      const before = await readState();
      await evaluate("document.querySelector('.flip-card-back-button').click()");
      await waitFor("document.querySelectorAll('.flip-card.is-flipped').length === 1", '翻开首张');
      const revealedId = (await readState()).todayDraw.revealed[0];
      const revealedTitle = (await readDraw()).titles[0];
      const idsBefore = before.todayDraw.cardIds;

      await evaluate("document.querySelector('.draw-redraw').click()");
      await waitFor(
        `JSON.parse(localStorage.getItem('${PERSIST_KEY}')).state.todayDraw.redrawUsed === true`,
        '重抽标记落盘',
      );
      const idsAfter = (await readState()).todayDraw.cardIds;
      const dom = await readDraw();
      assert.equal(idsAfter[0], revealedId, '首张已翻开的卡位置与 id 应保持');
      assert.equal(dom.flippedCount, 1, '首张应保持翻开状态');
      assert.equal(dom.titles[0], revealedTitle, '首张卡面内容应保持');
      assert.equal(new Set(idsAfter).size, 3, '重抽后不应出现重复卡');
      assert.ok(
        idsAfter.slice(1).every((cardId) => !idsBefore.includes(cardId)),
        '重抽后的卡不应与重抽前任何位置的卡相同',
      );
      assert.ok(
        idsAfter.slice(1).some((cardId, index) => cardId !== idsBefore[index + 1]),
        '未翻开位置应有实际替换',
      );

      await reload();
      await waitForDeal();
      const finalState = await readState();
      assert.deepEqual(finalState.todayDraw.revealed, [revealedId], '刷新后翻开记录应保留');
      assert.deepEqual(finalState.todayDraw.cardIds, idsAfter, '刷新后重抽结果应保留');
      return {
        revealedId,
        before: idsBefore,
        after: idsAfter,
        replaced: idsAfter.filter((cardId, i) => cardId !== idsBefore[i]).length,
      };
    });

    // ---------- 60 秒彩排（按路线文档更新后的顺序）----------
    await stage('彩排 翻 1 张→重抽→翻完→刷新', async () => {
      await freshDraw();
      await evaluate("document.querySelector('.flip-card-back-button').click()");
      await waitFor("document.querySelectorAll('.flip-card.is-flipped').length === 1", '翻开首张');
      await evaluate("document.querySelector('.draw-redraw').click()");
      await waitFor(
        `JSON.parse(localStorage.getItem('${PERSIST_KEY}')).state.todayDraw.redrawUsed === true`,
        '重抽标记落盘',
      );
      const afterRedraw = await readState();
      await evaluate(
        "[...document.querySelectorAll('.flip-card-back-button')].filter((b) => !b.disabled).forEach((b) => b.click())",
      );
      await waitFor("document.querySelectorAll('.flip-card.is-flipped').length === 3", '三张全翻开');
      await reload();
      await waitForDeal();
      const afterReload = await readDraw();
      const state = await readState();
      assert.deepEqual(state.todayDraw.cardIds, afterRedraw.todayDraw.cardIds, '刷新后抽卡结果不变');
      assert.equal(state.todayDraw.revealed.length, 3, '刷新后三张仍为已翻开');
      assert.equal(afterReload.flippedCount, 3, '刷新后三张仍显示正面');
      assert.equal(afterReload.redrawDisabled, true, '刷新后重抽按钮仍置灰');
      assert.match(afterReload.progress, /3 \/ 3/);
      return {
        progress: afterReload.progress,
        flippedAfterReload: afterReload.flippedCount,
        ids: state.todayDraw.cardIds,
      };
    });

    // ---------- 验收 3：跨天（注入日期）重新抽 3 张 ----------
    await stage('验收3 跨天注入日期后重新抽 3 张', async () => {
      await freshDraw();
      const before = await readState();
      const tomorrow = await evaluate(`(() => {
        const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
        return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
      })()`);

      const injected = await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `(() => {
          const RealDate = Date;
          const shift = 24 * 60 * 60 * 1000;
          class FakeDate extends RealDate {
            constructor(...args) {
              if (args.length === 0) super(RealDate.now() + shift);
              else super(...args);
            }
            static now() { return RealDate.now() + shift; }
          }
          window.Date = FakeDate;
        })()`,
      });
      try {
        await reload();
        await waitForDeal();
        await waitFor(
          `JSON.parse(localStorage.getItem('${PERSIST_KEY}')).state.todayDraw.date === '${tomorrow}'`,
          '跨天后日期切换',
        );
        const after = await readState();
        const dom = await readDraw();
        assert.notEqual(after.todayDraw.date, before.todayDraw.date, '日期应变化');
        assert.equal(after.todayDraw.cardIds.length, 3, '应重新抽 3 张');
        assert.equal(new Set(after.todayDraw.cardIds).size, 3, '新一天 3 张不重复');
        assert.equal(after.todayDraw.revealed.length, 0, '新一天应重新发牌');
        assert.equal(after.todayDraw.redrawUsed, false, '新一天重抽次数应重置');
        assert.equal(dom.redrawDisabled, false, '新一天重抽按钮应可用');
        assert.equal(dom.flippedCount, 0, '新一天应全为卡背');
        assert.equal(after.lastDrawDate, tomorrow, 'lastDrawDate 应同步');
        return { from: before.todayDraw.date, to: after.todayDraw.date, ids: after.todayDraw.cardIds };
      } finally {
        await send('Page.removeScriptToEvaluateOnNewDocument', {
          identifier: injected.identifier,
        });
      }
    });

    // ---------- 门禁：重置演示后回到 L2 初始态 ----------
    await stage('门禁 可恢复：重置演示回到初始态', async () => {
      await freshDraw();
      await evaluate("document.querySelector('.flip-card-back-button').click()");
      await waitFor("document.querySelectorAll('.flip-card.is-flipped').length === 1", '翻开首张');
      await evaluate("[...document.querySelectorAll('.text-button')].find((b) => b.textContent.includes('重置演示')).click()");
      await waitFor("document.querySelector('.reset-dialog')?.open === true", '重置确认弹窗');
      await evaluate("document.querySelector('.reset-actions .button.danger').click()");
      await waitFor("location.pathname === '/'", '重置后返回首页');
      const raw = await evaluate(`localStorage.getItem('${PERSIST_KEY}')`);
      assert.equal(raw, null, '重置后 localStorage 应清空');
      const home = await evaluate(`(() => ({
        trigger: document.querySelector('.draw-trigger small')?.textContent?.trim() ?? '',
        heading: document.querySelector('.site-main h1')?.textContent?.replace(/\\s+/g, '') ?? ''
      }))()`);
      assert.match(home.trigger, /0 \/ 3/);
      await navigate('/draw');
      await waitForDeal();
      const state = await readState();
      assert.equal(state.todayDraw.revealed.length, 0);
      assert.equal(state.todayDraw.redrawUsed, false);
      return { home, redrawAfterReset: state.todayDraw.redrawUsed, cards: state.todayDraw.cardIds.length };
    });

    // ---------- 门禁：可演示 / 移动端无横向滚动 ----------
    await stage('门禁 可演示：375px 移动端无横向溢出', async () => {
      await setViewport(375, 900, true);
      await freshDraw();
      const dom = await readDraw();
      assert.equal(dom.cardCount, 3);
      assert.ok(dom.scrollWidth <= 375, `横向溢出：${dom.scrollWidth}`);
      assert.equal(dom.redrawDisabled, false);
      await setViewport(1440, 900, false);
      return { scrollWidth: dom.scrollWidth, cardCount: dom.cardCount };
    });

    record('门禁 可运行：控制台无红色错误', runtimeErrors.length === 0, runtimeErrors);

    const hard = checks.filter((item) => item.severity === 'hard');
    const passed = hard.filter((item) => item.pass).length;
    console.log(
      JSON.stringify(
        {
          layer: 'L2 抽卡',
          verdict: passed === hard.length ? '硬性验收全部通过' : '存在未通过项',
          passed,
          total: hard.length,
          notes: checks.filter((item) => item.severity === 'note'),
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
