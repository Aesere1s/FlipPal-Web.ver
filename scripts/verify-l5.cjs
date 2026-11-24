const assert = require('node:assert/strict');
const ocPresets = require('../src/data/ocPresets.json');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const BASE = process.env.FLIPPAL_BASE_URL || 'http://127.0.0.1:5173';
const CDP_PORT = process.env.FLIPPAL_CDP_PORT || '9222';
const PERSIST_KEY = 'flip-pal-demo-v1';
const runtimeErrors = [];

// 与原卡无 12 字以上连续相同的自有表达；example 不含第一人称/数字/具体场景词。
const OWN_EXPLANATION = '票钱已经回不来了，接下来只比较继续看和离场哪个更舒服，别让付过的钱替我做决定。';
const GENERIC_EXAMPLE = '一部电影看到一半很无聊，继续坐着只会更难受，起身离开才是明智的选择。';
const PERSONAL_EXAMPLE = '我上周在健身房办了年卡，去了 2 次就不想去了，但我没有因为办卡的钱强迫自己继续跑。';
const COPY_EXPLANATION = '沉没成本是已经发生、无法收回的支出，包括钱、时间和注意力。它不该进入下一步决策。';
const FRONT_OK = '已经付掉的钱，为什么还要绑架接下来的选择？';
const SOURCE_VAGUE = '《Misbehaving》';
const SOURCE_SPECIFIC = 'Richard Thaler《Misbehaving》第 4 章：沉没成本实验';
const readyLineCalm = '这版已经是你的表达了。解释、例子和来源都在，我们可以慢慢把它交给下一位读者。';

const critiqueLines = (personality, signal) =>
  ocPresets.personalities.find((preset) => preset.id === personality).critique[signal];

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
  // React controlled textarea：走原生 setter + input 事件，确保 onChange 触发。
  const setField = (field, value) => evaluate(`(() => {
    const el = document.getElementById('remake-${field}');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const fillFields = async (fields) => {
    for (const [field, value] of Object.entries(fields)) {
      await setField(field, value);
    }
  };
  const submit = () => evaluate("document.querySelector('.remake-submit').click()");
  const bubbleText = () => evaluate("document.querySelector('.remake-critique .oc-bubble-text')?.textContent ?? ''");
  const signal = () => evaluate("document.querySelector('.remake-critique')?.getAttribute('data-signal')");
  const switchPersonality = async (personality) => {
    await evaluate(`(() => {
      const raw = JSON.parse(localStorage.getItem('${PERSIST_KEY}'));
      raw.state.oc.personality = '${personality}';
      localStorage.setItem('${PERSIST_KEY}', JSON.stringify(raw));
    })()`);
    await reload();
  };

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await setViewport(1440, 900, false);

    await navigate('/?demo=fresh');
    await navigate('/remake/preview');
    assert.match(await evaluate("document.querySelector('.remake-empty h2')?.textContent ?? ''"), /先选一张已经读过的卡/);

    await navigate('/remake/sunk-cost');
    assert.equal(await evaluate("document.querySelector('.remake-submit')?.disabled"), true);
    assert.equal(await evaluate("Boolean(document.querySelector('.remake-oc-empty a[href=\"/oc\"]'))"), true);
    console.log('PASS 无卡空态 + 无 OC 时禁止提交并引导创建');

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
    assert.match(await evaluate("document.querySelector('.home-oc .oc-bubble-text')?.textContent ?? ''"), /墨绿/);
    assert.equal((await readState()).oc.personality, 'calm');

    await navigate('/remake/sunk-cost');
    assert.equal(await evaluate("document.querySelector('.remake-submit')?.disabled"), false);
    assert.equal(await signal(), 'waiting');

    await submit();
    assert.equal(await evaluate("document.querySelectorAll('.remake-field-error').length"), 4);
    assert.match(await evaluate("document.querySelector('#remake-front-error')?.textContent ?? ''"), /正面不能为空/);
    assert.equal((await readState()).remakes.length, 0);
    assert.equal(await signal(), 'waiting');

    await fillFields({
      front: '长'.repeat(70),
      explanation: OWN_EXPLANATION,
      example: PERSONAL_EXAMPLE,
      source: SOURCE_SPECIFIC,
    });
    await submit();
    assert.equal(await evaluate("document.querySelectorAll('.remake-field-error').length"), 1);
    assert.match(await evaluate("document.querySelector('#remake-front-error')?.textContent ?? ''"), /最多 60 字，当前 70 字/);
    assert.equal((await readState()).remakes.length, 0);
    console.log('PASS 空槽位与超长内容拦截，错误提示明确且不写入状态');

    await fillFields({
      front: FRONT_OK,
      explanation: COPY_EXPLANATION,
      example: PERSONAL_EXAMPLE,
      source: SOURCE_SPECIFIC,
    });
    await evaluate("document.querySelector('.remake-actions button[type=\"button\"]').click()");
    assert.equal((await readState()).remakes[0].status, 'draft');
    assert.match(await evaluate("document.querySelector('.remake-save-note')?.textContent ?? ''"), /草稿已保存/);

    await reload();
    assert.equal(await evaluate("document.getElementById('remake-explanation').value"), COPY_EXPLANATION);
    assert.equal(await evaluate("document.getElementById('remake-source').value"), SOURCE_SPECIFIC);
    console.log('PASS 草稿持久化，刷新后四槽位恢复');

    await submit();
    assert.equal(await signal(), 'copy');
    const copyMessages = { calm: await bubbleText() };
    assert.ok(critiqueLines('calm', 'copy').some((line) => copyMessages.calm.includes(line)));
    assert.match(copyMessages.calm, /沉没成本是已经发生、无法收回的支出/);
    assert.equal((await readState()).remakes[0].status, 'submitted');

    for (const personality of ['curious', 'sharp']) {
      await switchPersonality(personality);
      await submit();
      assert.equal(await signal(), 'copy');
      copyMessages[personality] = await bubbleText();
      assert.ok(critiqueLines(personality, 'copy').some((line) => copyMessages[personality].includes(line)));
    }
    assert.equal(new Set(Object.values(copyMessages)).size, 3);
    console.log('PASS 照抄检测引用原文片段，三种性格话术各自可区分');

    await switchPersonality('calm');
    await fillFields({ explanation: OWN_EXPLANATION, example: GENERIC_EXAMPLE });
    await submit();
    assert.equal(await signal(), 'personal');
    assert.ok(critiqueLines('calm', 'personal').some((line) => copyMessages.calm !== line));
    const personalText = await bubbleText();
    assert.ok(critiqueLines('calm', 'personal').some((line) => personalText.includes(line)));
    assert.match(personalText, /起身离开/);

    await fillFields({ example: PERSONAL_EXAMPLE, source: SOURCE_VAGUE });
    await submit();
    assert.equal(await signal(), 'complete');
    const completeText = await bubbleText();
    assert.ok(critiqueLines('calm', 'complete').some((line) => completeText.includes(line)));
    assert.match(completeText, /《Misbehaving》/);
    console.log('PASS 补充例子后反馈从个人化切换为来源完整性，反馈随输入变化');

    await fillFields({ source: SOURCE_SPECIFIC });
    await submit();
    assert.equal(await signal(), 'ready');
    assert.match(await bubbleText(), /这版已经是你的表达了/);
    assert.equal((await readState()).remakes[0].status, 'submitted');
    assert.equal((await readState()).remakes[0].explanation, OWN_EXPLANATION);

    await reload();
    assert.equal(await evaluate("document.querySelector('.remake-status')?.textContent"), '已提交');
    assert.equal(await evaluate("document.getElementById('remake-example').value"), PERSONAL_EXAMPLE);

    await navigate('/');
    assert.equal(await evaluate("document.querySelectorAll('.island-marker')[2]?.getAttribute('data-status')"), 'done');
    console.log('PASS ready 反馈 + submitted 持久化，首页路线改卡节点点亮');

    await setViewport(375, 900, true);
    await navigate('/remake/sunk-cost');
    await delay(150);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    console.log('PASS 375px 改卡页无横向溢出');

    assert.deepEqual(runtimeErrors, []);
    console.log('L5 BROWSER VERIFICATION PASSED');
  } finally {
    ws.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});