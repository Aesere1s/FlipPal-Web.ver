const fs = require('node:fs');
const assert = require('node:assert/strict');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function target() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
      const page = list.find((item) => item.type === 'page');
      if (page) return page;
    } catch (error) {}
    await delay(200);
  }
  throw new Error('无法连接验收浏览器');
}

async function main() {
  const page = await target();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const pair = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) pair.reject(new Error(data.error.message));
      else pair.resolve(data.result);
    }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    pending.set(key, { resolve, reject });
    ws.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitLoaded = async () => {
    for (let i = 0; i < 30; i += 1) {
      const ready = await evaluate(`document.readyState === 'complete' && [...document.images].every(img => img.complete && img.naturalWidth > 0)`);
      if (ready) return;
      await delay(100);
    }
    throw new Error('页面或插画加载超时');
  };
  const navigate = async () => {
    await send('Page.navigate', { url: 'file:///D:/Projects/TODO/04-FlipPalWeb.ver/design/prototype.html?demo=fresh' });
    await delay(150);
    await waitLoaded();
  };
  const capture = async (name) => {
    await delay(180);
    const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(`screenshots/${name}.png`, Buffer.from(result.data, 'base64'));
  };
  const metrics = () => evaluate(`(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect() ?? null;
    const overlapX = (a, b) => (a && b ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) : 0);
    const overlapY = (a, b) => (a && b ? Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0);
    const overlap = (a, b) => (overlapX(a, b) > 0 ? overlapY(a, b) : 0);
    const title = rect('.hero-title');
    const visual = rect('.hero-visual');
    const kicker = rect('.hero-kicker');
    const lead = rect('.hero-copy .lead');
    return {
      innerWidth,
      innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyFontSize: getComputedStyle(document.body).fontSize,
      loadedImages: [...document.images].filter(img => img.complete && img.naturalWidth > 0).length,
      imageCount: document.images.length,
      titleImageOverlap: Math.round(overlap(title, visual)),
      titleKickerOverlap: Math.round(overlap(title, kicker)),
      titleLeadOverlap: Math.round(overlap(title, lead)),
      titleBottom: title ? Math.round(title.bottom) : 0,
      titleVisible: title ? title.bottom <= innerHeight : false,
      productionNotes: document.body.innerText.includes('原创场景') || document.body.innerText.includes('不使用角色素材')
    };
  })()`);

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 1200, deviceScaleFactor: 1, mobile: true });
    await navigate();
    const mobile = await metrics();
    assert.equal(mobile.innerWidth, 375);
    assert.ok(mobile.scrollWidth <= 375);
    assert.ok(mobile.bodyScrollWidth <= 375);
    assert.equal(mobile.bodyFontSize, '16px');
    assert.equal(mobile.loadedImages, mobile.imageCount);
    assert.equal(mobile.titleImageOverlap, 0, '移动端标题不应压图');
    assert.ok(mobile.titleVisible, `移动端首屏标题底部 ${mobile.titleBottom}px 超出视口`);

    await capture('flippal-mobile-hero');

    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await navigate();
    const desktop = await metrics();
    assert.ok(desktop.scrollWidth <= 1440);
    assert.equal(desktop.titleImageOverlap, 0, `首屏标题压图 ${desktop.titleImageOverlap}px`);
    assert.equal(desktop.titleKickerOverlap, 0, `标题压上头图说明 ${desktop.titleKickerOverlap}px`);
    assert.equal(desktop.titleLeadOverlap, 0, `标题压住副标题 ${desktop.titleLeadOverlap}px`);
    assert.ok(desktop.titleVisible, `1440x1100 首屏标题底部 ${desktop.titleBottom}px 超出视口`);
    assert.equal(desktop.loadedImages, desktop.imageCount);

    await capture('flippal-desktop-hero');

    await evaluate(`document.documentElement.style.scrollBehavior = 'auto'; document.getElementById('draw').scrollIntoView(); window.scrollBy(0, -24)`);
    await capture('flippal-draw');

    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 1000, deviceScaleFactor: 1, mobile: true });
    await navigate();
    await evaluate(`document.querySelector('[data-card-slot="0"]').click()`);
    assert.equal(await evaluate(`document.getElementById('goLearnButton').disabled`), false);
    await evaluate(`document.getElementById('flipButton').click()`);
    assert.equal(await evaluate(`document.getElementById('flipInner').classList.contains('is-flipped')`), true);
    await evaluate(`document.querySelectorAll('.quiz-option')[2].click()`);
    assert.equal(await evaluate(`document.getElementById('critiqueButton').disabled`), false);
    await evaluate(`(() => {
      const values = {
        fieldFact: '决定应该比较接下来的收益，而不是追回已经付出去的钱。',
        fieldAnalogy: '像排队很久后仍不愿换一条更短的队伍，只是因为已经等过。',
        fieldCounter: '如果继续投入能避免更大损失，过去投入提供的信息就仍然有用。',
        fieldOwn: '已经花掉的钱收不回来，下一步只需要比较继续和停下哪种结果更好。'
      };
      for (const [key, value] of Object.entries(values)) {
        const field = document.getElementById(key);
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
      document.getElementById('remakeForm').requestSubmit();
    })()`);
    assert.equal(await evaluate(`document.getElementById('sendButton').disabled`), false);
    await evaluate(`document.getElementById('sendButton').click()`);
    assert.equal(await evaluate(`document.getElementById('growthNumber').textContent`), '52');
    assert.equal(await evaluate(`document.getElementById('letter').hidden`), false);
    await evaluate(`(() => {
      document.getElementById('replyInput').value = '类比的边界提醒最有用，我会补进下一张卡。';
      document.getElementById('replyButton').click();
    })()`);
    assert.match(await evaluate(`document.getElementById('replyStatus').textContent`), /漂流完成了/);

    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await evaluate(`document.documentElement.style.scrollBehavior = 'auto'; document.getElementById('drift').scrollIntoView(); window.scrollBy(0, -24)`);
    await capture('flippal-drift');

    await evaluate(`document.getElementById('redrawButton').click()`);
    assert.match(await evaluate(`document.querySelector('[data-card-slot="0"] .draw-art').src`), /track-expression\.svg$/);
    assert.equal(await evaluate(`document.getElementById('growthNumber').textContent`), '0');
    assert.equal(await evaluate(`document.getElementById('studyTrack').textContent`), '尚未选卡');
    await evaluate(`window.confirm = () => true; document.getElementById('resetDemo').click()`);
    assert.equal(await evaluate(`document.getElementById('goLearnButton').disabled`), true);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ mobile, desktop, flow: '完整学习闭环、重抽图像切换与重置：通过', screenshots: ['flippal-mobile-hero.png', 'flippal-desktop-hero.png', 'flippal-draw.png', 'flippal-drift.png'], runtimeErrors: errors }, null, 2));
  } finally {
    await send('Browser.close').catch(() => {});
    ws.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});