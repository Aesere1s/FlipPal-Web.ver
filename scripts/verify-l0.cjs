const fs = require('node:fs');
const assert = require('node:assert/strict');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BASE = process.env.FLIPPAL_BASE_URL || 'http://127.0.0.1:5173';
const CDP_PORT = process.env.FLIPPAL_CDP_PORT || '9222';
const ROUTES = [
  { path: '/', heading: '把理解翻出来。' },
  { path: '/draw', heading: '今日抽卡。' },
  { path: '/learn', headingPrefix: '学卡' },
  { path: '/remake/preview', heading: '改卡' },
  { path: '/drift', heading: '漂流' },
  { path: '/oc', heading: 'OC' },
  { path: '/about', heading: '关于' },
];

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
    await waitFor(
      `document.readyState === 'complete' && Boolean(document.querySelector('#root .site'))`,
      path,
    );
    await delay(160);
  };

  const reload = async () => {
    const loaded = waitForLoad();
    await send('Page.reload');
    await loaded;
    await waitFor(
      `document.readyState === 'complete' && Boolean(document.querySelector('#root .site'))`,
      '页面刷新',
    );
    await delay(160);
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
    await delay(160);
    const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(`screenshots/${name}.png`, Buffer.from(result.data, 'base64'));
  };

  const readPage = () =>
    evaluate(`(() => ({
      path: location.pathname,
      search: location.search,
      heading: document.querySelector('.site-main h1')?.textContent?.replace(/\\s+/g, '') ?? '',
      navCount: document.querySelectorAll('.route-index a').length,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      innerWidth,
      bodyFontSize: getComputedStyle(document.body).fontSize,
      triggerDisabled: document.querySelector('.draw-trigger')?.disabled ?? null,
      storage: localStorage.getItem('flip-pal-demo-v1')
    }))()`);

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await setViewport(1440, 1100, false);
    await navigate('/?demo=fresh');

    const home = await readPage();
    assert.equal(home.heading, '把理解翻出来。');
    assert.equal(home.navCount, 7);
    assert.equal(home.triggerDisabled, false);
    assert.equal(home.storage, null);
    assert.equal(home.path, '/');
    assert.ok(home.scrollWidth <= 1440);
    await capture('l0-home-desktop');

    await setViewport(1440, 3400, false);
    await delay(260);
    await capture('l0-home-full');
    await setViewport(1440, 1100, false);

    for (const route of ROUTES) {
      await navigate(route.path);
      const pageState = await readPage();
      if (route.heading) {
        assert.equal(pageState.heading, route.heading, `${route.path} 标题不匹配`);
      } else {
        assert.ok(pageState.heading.startsWith(route.headingPrefix), `${route.path} 标题不匹配`);
      }
      assert.equal(pageState.navCount, 7);
      assert.ok(pageState.scrollWidth <= pageState.innerWidth, `${route.path} 桌面横向溢出`);
    }

    await navigate('/draw');
    await capture('l0-draw-placeholder');

    await navigate('/learn');
    assert.ok((await readPage()).path.startsWith('/learn'), '/learn 应落在学卡路由');

    await navigate('/learn/card-preview');
    await reload();
    assert.ok((await readPage()).heading.startsWith('学卡'));

    await navigate('/');
    await evaluate(`localStorage.setItem('flip-pal-demo-v1', JSON.stringify({ version: 1, state: { schemaVersion: 1, nickname: 'dirty' } }))`);
    await reload();
    await evaluate(`document.querySelector('.masthead .text-button').click()`);
    await waitFor(`document.querySelector('dialog')?.open === true`, '重置确认框');
    await capture('l0-reset-dialog');
    await evaluate(`document.querySelector('dialog .button.danger').click()`);
    await delay(160);
    const afterReset = await readPage();
    assert.equal(afterReset.path, '/');
    assert.equal(afterReset.storage, null);

    await navigate('/');
    await evaluate(`localStorage.setItem('flip-pal-demo-v1', JSON.stringify({ version: 999, state: { schemaVersion: 999, nickname: 'stale' } }))`);
    await reload();
    const afterStaleVersion = await readPage();
    assert.equal(afterStaleVersion.storage, null);
    assert.equal(afterStaleVersion.heading, '把理解翻出来。');

    await navigate('/about?demo=fresh');
    const afterFresh = await readPage();
    assert.equal(afterFresh.path, '/about');
    assert.equal(afterFresh.heading, '关于');
    assert.equal(afterFresh.storage, null);
    assert.ok(!afterFresh.search.includes('demo=fresh'), 'fresh 参数应被抹掉');

    await setViewport(375, 1000, true);
    await navigate('/about');
    for (const route of ROUTES) {
      await navigate(route.path);
      const mobileState = await readPage();
      if (route.heading) {
        assert.equal(mobileState.heading, route.heading, `${route.path} 移动端标题不匹配`);
      } else {
        assert.ok(
          mobileState.heading.startsWith(route.headingPrefix),
          `${route.path} 移动端标题不匹配`,
        );
      }
      assert.ok(mobileState.scrollWidth <= 375, `${route.path} 移动端横向溢出：${mobileState.scrollWidth}`);
      assert.ok(mobileState.bodyScrollWidth <= 375, `${route.path} 移动端 body 横向溢出：${mobileState.bodyScrollWidth}`);
      assert.equal(mobileState.bodyFontSize, '16px');
    }

    await navigate('/');
    await capture('l0-home-mobile');
    const mobileHome = await readPage();
    assert.equal(mobileHome.triggerDisabled, false);

    await setViewport(320, 900, true);
    await navigate('/');
    const narrowHome = await readPage();
    assert.ok(narrowHome.scrollWidth <= 320, `320px 横向溢出：${narrowHome.scrollWidth}`);

    await setViewport(1440, 1100, false);
    await evaluate(`document.querySelector('.route-index a:nth-child(2)').click()`);
    await waitFor(`location.pathname === '/draw'`, '导航跳转');
    assert.equal((await readPage()).heading, '今日抽卡。');

    const finalState = await readPage();
    assert.deepEqual(runtimeErrors, []);

    console.log(
      JSON.stringify(
        {
          result: 'L0 验收通过',
          routes: ROUTES.length,
          viewport: { desktop: '1440x1100', mobile: '375x1000', narrow: '320x900' },
          reset: '二次确认、清空存储、回到首页',
          freshDemo: '?demo=fresh 在深路由上清空状态、保留路径并抹掉参数',
          navigation: '路由索引点击跳转通过',
          screenshots: ['l0-home-desktop.png', 'l0-home-mobile.png', 'l0-draw-placeholder.png'],
          runtimeErrors,
          finalState,
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