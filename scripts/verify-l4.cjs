const assert = require('node:assert/strict');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const BASE = process.env.FLIPPAL_BASE_URL || 'http://127.0.0.1:5173';
const CDP_PORT = process.env.FLIPPAL_CDP_PORT || '9222';
const PERSIST_KEY = 'flip-pal-demo-v1';
const runtimeErrors = [];

async function connectTarget() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const page = list.find((item) => item.type === 'page');
      if (page) return page;
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
  let loadWaiters = [];
  const pending = new Map();

  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const pair = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) pair.reject(new Error(data.error.message));
      else pair.resolve(data.result);
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
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    pending.set(key, { resolve, reject });
    ws.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result.value;
  };
  const waitFor = async (expression, label) => {
    for (let i = 0; i < 60; i += 1) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    throw new Error(`等待超时：${label}`);
  };
  const navigate = async (url) => {
    const loaded = waitForLoad();
    await send('Page.navigate', { url: BASE + url });
    await loaded;
    await waitFor("document.readyState === 'complete' && Boolean(document.querySelector('#root .site'))", url);
    await delay(150);
  };
  const reload = async () => {
    const loaded = waitForLoad();
    await send('Page.reload');
    await loaded;
    await waitFor("document.readyState === 'complete' && Boolean(document.querySelector('#root .site'))", '刷新');
    await delay(150);
  };
  const setViewport = (width, height, mobile) => send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
  const readState = () => evaluate(`(() => {
    const raw = localStorage.getItem('${PERSIST_KEY}');
    return raw ? JSON.parse(raw).state : null;
  })()`);

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await setViewport(1440, 900, false);

    await navigate('/?demo=fresh');
    assert.equal(await evaluate('location.pathname'), '/');
    assert.equal(await evaluate("Boolean(document.querySelector('.draw-trigger'))"), true);
    console.log('PASS 未创建 OC 不会阻塞首页和抽卡入口');

    await navigate('/oc');
    assert.equal(await evaluate("document.querySelector('.oc-head h1')?.textContent"), 'OC');
    assert.equal(await evaluate("document.querySelector('.oc-next')?.disabled"), true);
    assert.equal(await evaluate("document.querySelectorAll('.oc-personality-option').length"), 3);

    await evaluate("document.querySelectorAll('.oc-personality-option')[2].click()");
    assert.equal(await evaluate("document.querySelector('.oc-next')?.disabled"), false);
    await evaluate("document.querySelector('.oc-next').click()");
    await waitFor("document.querySelector('.oc-voice-sample')?.textContent.includes('别绕')", '犀利声线');
    await evaluate("document.querySelector('.oc-editor-actions button').click()");
    await waitFor("Boolean(document.querySelector('.oc-personality-options'))", '返回性格步骤');
    assert.equal(await evaluate("document.querySelectorAll('.oc-personality-option')[2].getAttribute('aria-pressed')"), 'true');
    await evaluate("document.querySelector('.oc-next').click()");
    await waitFor("Boolean(document.querySelector('.oc-voice-spec'))", '重返声线步骤');
    await evaluate("document.querySelector('.oc-next').click()");
    await waitFor("document.querySelectorAll('.oc-part-group').length === 4", '外观步骤');

    await evaluate("document.querySelector('.oc-randomize').click()");
    assert.equal(await evaluate("document.querySelectorAll('.oc-part-option[aria-pressed=\"true\"]').length"), 4);
    await evaluate(`(() => {
      const groups = document.querySelectorAll('.oc-part-group');
      groups[0].querySelectorAll('button')[3].click();
      groups[1].querySelectorAll('button')[2].click();
      groups[2].querySelectorAll('button')[2].click();
      groups[3].querySelectorAll('button')[2].click();
    })()`);
    await evaluate("document.querySelector('.oc-next').click()");
    await waitFor("Boolean(document.querySelector('.oc-confirm'))", '确认步骤');
    const firstLine = await evaluate("document.querySelector('.oc-bubble-text')?.textContent ?? ''");
    assert.match(firstLine, /砂黄/);
    assert.match(firstLine, /连帽卫衣/);
    assert.match(firstLine, /别只点头|选择很明确/);
    console.log('PASS 四步、逐步返回、随机与第一句话变量替换');

    await evaluate("document.querySelector('.oc-confirm').click()");
    await waitFor("location.pathname === '/' && Boolean(document.querySelector('.home-oc .oc-bubble'))", '首页 OC 气泡');
    const saved = await readState();
    assert.equal(saved.oc.personality, 'sharp');
    assert.deepEqual(saved.oc.parts, { face: 3, hair: 2, color: 2, outfit: 2 });
    assert.equal(saved.oc.relationLevel, 1);
    assert.equal(saved.oc.relationExp, 0);
    assert.equal(await evaluate("document.querySelector('.home-oc .oc-bubble-text')?.textContent"), firstLine);

    await reload();
    assert.equal(await evaluate("document.querySelector('.home-oc .oc-bubble-text')?.textContent"), firstLine);
    assert.equal((await readState()).oc.personality, 'sharp');
    console.log('PASS OC 与第一句话刷新后保留');

    await setViewport(375, 900, true);
    await delay(150);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    await navigate('/learn/sunk-cost');
    assert.equal(await evaluate("Boolean(document.querySelector('.learn-oc .oc-avatar'))"), true);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    console.log('PASS 375px 首页/学卡无横向溢出，气泡复用');

    assert.deepEqual(runtimeErrors, []);
    console.log('L4 BROWSER VERIFICATION PASSED');
  } finally {
    ws.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});