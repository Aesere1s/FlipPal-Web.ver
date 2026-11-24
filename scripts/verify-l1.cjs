const fs = require('node:fs');
const assert = require('node:assert/strict');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BASE = process.env.FLIPPAL_BASE_URL || 'http://127.0.0.1:5173';
const CDP_PORT = process.env.FLIPPAL_CDP_PORT || '9222';

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
  const runtimeErrors = [];
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
      runtimeErrors.push(data.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
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
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
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
    await waitFor(`document.readyState === 'complete' && Boolean(document.querySelector('#root .site'))`, path);
    await delay(180);
  };

  const reload = async () => {
    const loaded = waitForLoad();
    await send('Page.reload');
    await loaded;
    await waitFor(`document.readyState === 'complete' && Boolean(document.querySelector('#root .site'))`, '刷新');
    await delay(180);
  };

  const setViewport = async (width, height, mobile) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
    });
  };

  const capture = async (name) => {
    await delay(180);
    const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(`screenshots/${name}.png`, Buffer.from(result.data, 'base64'));
  };

  const readPool = () =>
    evaluate(`(() => {
      const cards = [...document.querySelectorAll('.pool-card')];
      const tracks = cards.reduce((result, card) => {
        result[card.dataset.track] = (result[card.dataset.track] || 0) + 1;
        return result;
      }, {});
      return {
        path: location.pathname,
        heading: document.querySelector('.site-main h1')?.textContent?.replace(/\\s+/g, '') ?? '',
        featureCount: document.querySelectorAll('.pool-feature-card').length,
        featureTitles: [...document.querySelectorAll('.pool-feature-card h3')].map((node) => node.textContent.trim()),
        cardCount: cards.length,
        tracks,
        sourceCount: document.querySelectorAll('.pool-source').length,
        emptySources: [...document.querySelectorAll('.pool-source')].filter((node) => !node.textContent.trim()).length,
        visibleLabel: document.querySelector('.pool-browser-count')?.textContent?.trim() ?? '',
        navCount: document.querySelectorAll('.route-index a').length,
        innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth
      };
    })()`);

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await setViewport(1440, 1100, false);
    await navigate('/cards');

    const pool = await readPool();
    assert.equal(pool.heading, '卡池。24张，全部有出处。');
    assert.equal(pool.featureCount, 3);
    assert.deepEqual(pool.featureTitles, ['沉没成本', 'HTTP 状态码', '结论先行']);
    assert.equal(pool.cardCount, 24);
    assert.deepEqual(pool.tracks, { thinking: 8, coding: 8, expression: 8 });
    assert.equal(pool.sourceCount, 27);
    assert.equal(pool.emptySources, 0);
    assert.ok(pool.scrollWidth <= 1440);
    assert.equal(pool.navCount, 7);

    await capture('l1-card-pool-desktop');

    await evaluate(`[...document.querySelectorAll('.pool-filter button')].find((button) => button.textContent.includes('编程与工具')).click()`);
    await waitFor(`document.querySelectorAll('.pool-card').length === 8`, '筛选编程方向');
    const coding = await readPool();
    assert.deepEqual(coding.tracks, { coding: 8 });
    assert.match(coding.visibleLabel, /8 \/ 24/);

    await evaluate(`[...document.querySelectorAll('.pool-filter button')].find((button) => button.textContent.includes('全部')).click()`);
    await waitFor(`document.querySelectorAll('.pool-card').length === 24`, '恢复全部卡片');

    await evaluate(`document.querySelector('.pool-card details').open = true`);
    const expanded = await evaluate(`(() => ({
      answer: document.querySelector('.pool-card .pool-options .is-answer')?.textContent?.trim() ?? '',
      evidence: document.querySelector('.pool-card .pool-evidence')?.textContent?.trim() ?? '',
      backLength: (document.querySelector('.pool-card details > p')?.textContent ?? '').length
    }))()`);
    assert.match(expanded.answer, /正确/);
    assert.match(expanded.evidence, /^依据：/);
    assert.ok(expanded.backLength >= 150);

    await reload();
    assert.equal((await readPool()).cardCount, 24);

    await setViewport(375, 1000, true);
    await navigate('/cards');
    const mobile = await readPool();
    assert.ok(mobile.scrollWidth <= 375, `卡片池移动端横向溢出：${mobile.scrollWidth}`);
    assert.ok(mobile.bodyScrollWidth <= 375);
    assert.equal(mobile.featureCount, 3);
    await capture('l1-card-pool-mobile');

    await setViewport(1440, 1100, false);
    await navigate('/');
    const home = await evaluate(`(() => ({
      heading: document.querySelector('.site-main h1')?.textContent?.replace(/\\s+/g, '') ?? '',
      navCount: document.querySelectorAll('.route-index a').length,
      triggerDisabled: document.querySelector('.draw-trigger')?.disabled ?? null
    }))()`);
    assert.equal(home.heading, '把理解翻出来。');
    assert.equal(home.navCount, 7);
    assert.equal(home.triggerDisabled, false);
    assert.deepEqual(runtimeErrors, []);

    console.log(
      JSON.stringify(
        {
          result: 'L1 验收通过',
          cardPool: '24 张 / 3 方向 × 8 张',
          featured: pool.featureTitles,
          filters: '编程方向筛选 8 张，恢复全部 24 张',
          sources: `${pool.sourceCount} 个来源全部非空`,
          evidence: '展开卡片后小测答案与背面依据可见',
          mobile: '375px 无横向滚动',
          l0Regression: '首页 7 路由与可用抽卡入口保持',
          screenshots: ['l1-card-pool-desktop.png', 'l1-card-pool-mobile.png'],
          runtimeErrors,
        },
        null,
        2,
      ),
    );
  } finally {
    await send('Browser.close').catch(() => {});
    ws.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});