const fs = require('node:fs');
const assert = require('node:assert/strict');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findTarget() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
      const page = targets.find((target) => target.type === 'page');
      if (page) return page;
    } catch (error) {}
    await delay(200);
  }
  throw new Error('无法连接浏览器');
}

async function main() {
  const target = await findTarget();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let sequence = 0;
  const pending = new Map();
  const runtimeErrors = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) task.reject(new Error(message.error.message));
      else task.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') {
      runtimeErrors.push(message.params.exceptionDetails.text);
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
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
  const navigate = async () => {
    await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
    for (let i = 0; i < 30; i += 1) {
      await delay(100);
      const ready = await evaluate(`document.readyState === 'complete' && !!document.querySelector('.learning-map') && [...document.images].every(img => img.complete && img.naturalWidth > 0)`);
      if (ready) return;
    }
    throw new Error('React 页面加载超时');
  };
  const capture = async (filename) => {
    await delay(150);
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(`screenshots/${filename}.png`, Buffer.from(shot.data, 'base64'));
  };
  const captureRegion = async (selector, filename, maxHeight = 1400) => {
    const box = await evaluate(`(() => {
      const rect = document.querySelector('${selector}').getBoundingClientRect();
      const pad = 24;
      return {
        x: Math.max(0, Math.floor(rect.left - pad)),
        y: Math.max(0, Math.floor(rect.top + window.scrollY - pad)),
        width: Math.min(innerWidth, Math.ceil(rect.width + pad * 2)),
        height: Math.min(${maxHeight}, Math.ceil(rect.height + pad * 2))
      };
    })()`);
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { ...box, scale: 1 },
    });
    fs.writeFileSync(`screenshots/${filename}.png`, Buffer.from(shot.data, 'base64'));
  };
  const metrics = () => evaluate(`(() => {
    const title = document.querySelector('.home-story-title').getBoundingClientRect();
    const cardHead = document.querySelector('.island-sample-head').getBoundingClientRect();
    const question = document.querySelector('.island-sample-body h2').getBoundingClientRect();
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return {
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyFontSize: getComputedStyle(document.body).fontSize,
      images: [...document.images].map((img) => ({ loaded: img.complete && img.naturalWidth > 0, src: img.getAttribute('src') })),
      markers: document.querySelectorAll('.island-marker').length,
      currentMarkers: document.querySelectorAll('.island-marker[data-status="current"]').length,
      lockedMarkers: document.querySelectorAll('.island-marker[data-status="locked"]').length,
      titleCardHeadOverlap: overlap(title, cardHead),
      titleQuestionOverlap: overlap(title, question),
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
    assert.ok(mobile.images.length >= 2 && mobile.images.every((image) => image.loaded));
    assert.equal(mobile.markers, 5);
    assert.equal(mobile.currentMarkers, 1);
    assert.equal(mobile.lockedMarkers, 4);
    assert.equal(mobile.titleCardHeadOverlap, 0);
    assert.equal(mobile.titleQuestionOverlap, 0);
    await capture('flippal-island-mobile');

    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
    await navigate();
    const desktop = await metrics();
    assert.ok(desktop.scrollWidth <= 1440);
    assert.equal(desktop.titleCardHeadOverlap, 0);
    assert.equal(desktop.titleQuestionOverlap, 0);
    assert.ok(desktop.images.every((image) => image.loaded));
    await capture('flippal-island-desktop');

    await evaluate(`document.documentElement.style.scrollBehavior = 'auto'; document.querySelector('.learning-route').scrollIntoView(); window.scrollBy(0, -24)`);
    await capture('flippal-island-route');

    await evaluate(`(() => {
      const saved = {
        state: {
          schemaVersion: 1,
          nickname: 'Demo Reader',
          trackPref: '认知与思维',
          tickets: 2,
          streak: 1,
          mastery: { demo: 2 },
          learnedToday: ['demo'],
          remakes: [{ id: 'demo' }],
          sent: [{ id: 'demo' }],
          inbox: [],
          lastDrawDate: '',
          oc: { personality: 'calm', parts: { face: 0, hair: 0, color: 0, outfit: 0 }, relationLevel: 1, relationExp: 16, abilities: [] }
        },
        version: 1
      };
      localStorage.setItem('flip-pal-demo-v1', JSON.stringify(saved));
      location.reload();
    })()`);
    await delay(800);
    for (let i = 0; i < 30; i += 1) {
      await delay(100);
      if (await evaluate(`document.querySelectorAll('.island-marker[data-status="done"]').length === 5`)) break;
    }
    assert.equal(await evaluate(`document.querySelectorAll('.island-marker[data-status="done"]').length`), 5);

    await evaluate(`localStorage.removeItem('flip-pal-demo-v1'); location.reload()`);
    await delay(600);
    await evaluate(`document.querySelector('a[href="/draw"]').click()`);
    await delay(300);
    assert.match(await evaluate(`location.pathname`), /^\/draw$/);
    assert.deepEqual(runtimeErrors, []);

    console.log(JSON.stringify({
      mobile,
      desktop,
      routeStates: '初始 → 当前/未解锁；注入完整状态 → 五点全完成',
      routePreserved: '/draw 导航通过',
      screenshots: ['flippal-island-mobile.png', 'flippal-island-desktop.png', 'flippal-island-route.png'],
      runtimeErrors,
    }, null, 2));
  } finally {
    await send('Browser.close').catch(() => {});
    socket.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});