const assert = require('node:assert/strict');
const cards = require('../src/data/cards.json').cards;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const BASE = process.env.FLIPPAL_BASE_URL || 'http://127.0.0.1:5173';
const CDP_PORT = process.env.FLIPPAL_CDP_PORT || '9222';
const PERSIST_KEY = 'flip-pal-demo-v1';
const runtimeErrors = [];

const card = cards.find((item) => item.id === 'sunk-cost');
if (!card) {
  throw new Error('缺少 sunk-cost 卡');
}

// 难度 2：答对（m2）与改写通过均得 3 点。
const EXPECTED_LEARN_GAIN = 3;
const EXPECTED_REMAKE_GAIN = 3;
const INJECTED_EXP = 22;

const OWN_EXPLANATION = '票钱已经回不来了，接下来只比较继续看和离场哪个更舒服，别让付过的钱替我做决定。';
const PERSONAL_EXAMPLE = '我上周在健身房办了年卡，去了 2 次就不想去了，但我没有因为办卡的钱强迫自己继续跑。';
const FRONT_OK = '已经付掉的钱，为什么还要绑架接下来的选择？';
const SOURCE_SPECIFIC = 'Richard Thaler《Misbehaving》第 4 章：沉没成本实验';

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
  const text = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`);
  const exists = (selector) => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
  const setField = (field, value) => evaluate(`(() => {
    const el = document.getElementById('remake-${field}');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const fillRemake = async (overrides = {}) => {
    const fields = {
      front: FRONT_OK,
      explanation: OWN_EXPLANATION,
      example: PERSONAL_EXAMPLE,
      source: SOURCE_SPECIFIC,
      ...overrides,
    };
    for (const [field, value] of Object.entries(fields)) {
      await setField(field, value);
    }
  };
  const submitRemake = () => evaluate("document.querySelector('.remake-submit').click()");
  const closeGrowth = async () => {
    await evaluate("document.querySelector('.growth-close').click()");
    await waitFor("!document.querySelector('.growth-overlay')", '关闭结算');
  };
  const answerQuiz = async () => {
    await evaluate("document.querySelector('.learn-flip-button').click()");
    await waitFor("document.querySelector('.quiz-panel')?.getAttribute('data-active') === 'true'", '翻面');
    await evaluate(`document.querySelectorAll('.quiz-panel-option')[${card.quiz.answer}].click()`);
    await evaluate("document.querySelector('.quiz-panel-submit').click()");
    await waitFor("Boolean(document.querySelector('.learn-result'))", '学卡结果');
  };

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await setViewport(1440, 900, false);

    await navigate('/?demo=fresh');
    await navigate('/oc');
    await evaluate("document.querySelectorAll('.oc-personality-option')[0].click()");
    await evaluate("document.querySelector('.oc-next').click()");
    await waitFor("Boolean(document.querySelector('.oc-voice-spec'))", '沉静声线');
    await evaluate("document.querySelector('.oc-next').click()");
    await waitFor("document.querySelectorAll('.oc-part-group').length === 4", '外观步骤');
    await evaluate("document.querySelector('.oc-next').click()");
    await waitFor("Boolean(document.querySelector('.oc-confirm'))", '确认步骤');
    await evaluate("document.querySelector('.oc-confirm').click()");
    await waitFor("location.pathname === '/' && Boolean(document.querySelector('.home-oc .oc-bubble'))", '首页 OC');

    let state = await readState();
    assert.equal(state.oc.relationExp, 0);
    assert.equal(state.oc.relationLevel, 1);
    assert.deepEqual(state.oc.abilities, []);
    console.log('PASS 初始关系 Lv.1 / 0 EXP / 无能力');

    await navigate('/learn/sunk-cost');
    await answerQuiz();
    await waitFor("Boolean(document.querySelector('.growth-overlay'))", '学卡结算弹层');
    assert.match(await text('.growth-flag'), /学卡结算/);
    assert.match(await text('.growth-relation-title'), /同学/);
    state = await readState();
    assert.equal(state.oc.relationExp, EXPECTED_LEARN_GAIN);
    assert.equal(state.growthEvents.length, 1);
    assert.match(state.growthEvents[0], /^learn:sunk-cost:m2$/);
    console.log('PASS 学卡结算弹层、成长值与 eventId 正确');

    await evaluate("document.querySelector('.growth-skip').click()");
    await waitFor(`document.querySelector('.growth-gain-value')?.textContent === '${EXPECTED_LEARN_GAIN}'`, '跳过动画后显示终值');
    assert.equal(await evaluate("document.querySelector('.growth-skip')?.disabled"), true);
    await closeGrowth();
    assert.equal(await exists('.learn-result'), true);
    console.log('PASS 可跳过数字动画，关闭后回到学卡结果页');

    await reload();
    await navigate('/learn/sunk-cost');
    await answerQuiz();
    await delay(400);
    assert.equal(await exists('.growth-overlay'), false);
    assert.equal((await readState()).oc.relationExp, EXPECTED_LEARN_GAIN);
    assert.equal((await readState()).growthEvents.length, 1);
    console.log('PASS 同一学卡事件重复结算不增加经验');

    await evaluate(`(() => {
      const raw = JSON.parse(localStorage.getItem('${PERSIST_KEY}'));
      raw.state.oc.relationExp = ${INJECTED_EXP};
      raw.state.oc.relationLevel = 1;
      localStorage.setItem('${PERSIST_KEY}', JSON.stringify(raw));
    })()`);
    await navigate('/remake/sunk-cost');
    await fillRemake();
    await submitRemake();
    await waitFor("Boolean(document.querySelector('.growth-overlay'))", '改卡结算弹层');
    assert.match(await text('.growth-flag'), /改卡结算/);
    assert.equal(await evaluate("document.querySelector('.growth-overlay')?.getAttribute('data-level-up')"), 'true');
    assert.match(await text('.growth-relation-from'), /从 Lv\.1/);
    assert.match(await text('.growth-relation-title'), /同路人/);
    assert.match(await text('.growth-ability h3'), /整理卡片/);
    state = await readState();
    assert.equal(state.oc.relationExp, INJECTED_EXP + EXPECTED_REMAKE_GAIN);
    assert.equal(state.oc.relationLevel, 2);
    assert.deepEqual(state.oc.abilities, ['organize-cards']);
    assert.equal(state.remakes[0].status, 'submitted');
    console.log('PASS 首次升级同时切换等级与称呼，改写通过解锁「整理卡片」');

    await closeGrowth();
    await reload();
    assert.equal((await readState()).oc.relationExp, INJECTED_EXP + EXPECTED_REMAKE_GAIN);
    assert.equal((await readState()).oc.relationLevel, 2);
    assert.deepEqual((await readState()).oc.abilities, ['organize-cards']);
    console.log('PASS 成长值与能力刷新后持久化');

    await setViewport(375, 900, true);
    await navigate('/remake/sunk-cost');
    await fillRemake({ example: `${PERSONAL_EXAMPLE}那次我直接离场。` });
    await submitRemake();
    await waitFor("Boolean(document.querySelector('.growth-overlay'))", '移动端改卡结算');
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    assert.equal((await readState()).oc.relationExp, INJECTED_EXP + EXPECTED_REMAKE_GAIN * 2);
    assert.deepEqual((await readState()).oc.abilities, ['organize-cards']);
    await closeGrowth();
    console.log('PASS 375px 结算页无横向溢出，能力不重复解锁');

    assert.deepEqual(runtimeErrors, []);
    console.log('L6 BROWSER VERIFICATION PASSED');
  } finally {
    ws.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});