// Browser checks for the share image: it stays on "Preparing image…" until fonts and pictures have
// decoded, a throttled load still paints the gear icons and the totals, a failed picture is retried
// once, and Share / Copy / Download draw a new image instead of reusing the previous one.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path"), http = require("http"), { spawn } = require("child_process");
const root = path.join(__dirname, "..");
const chrome = ["/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => fs.existsSync(p));
const PORT = 8765;
const skip = chrome ? false : "Chrome is not installed";
let browser, server, chromium;

async function waitServer() {
  for (let i = 0; i < 50; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get("http://127.0.0.1:" + PORT + "/", (res) => { res.resume(); resolve(); });
        req.on("error", reject);
      });
      return;
    } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error("preview server did not start");
}

test.before(async () => {
  if (!chrome) return;
  ({ chromium } = require("playwright-core"));
  server = spawn(process.execPath, ["tools/serve.js"], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  browser = await chromium.launch({ executablePath: chrome, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  await waitServer();
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
});

function piecePage() {
  return `(() => {
    const c = document.createElement("canvas"); c.width = 8; c.height = 8;
    const g = c.getContext("2d"); g.fillStyle = "#39c"; g.fillRect(0, 0, 8, 8);
    const thumb = c.toDataURL("image/png");
    return [
      { cls: "INT", slot: "helmet", diamonds: 3, refinedCount: 1, equipped: true, thumb },
      { cls: "AGI", slot: "weapon", diamonds: 2, refinedCount: 0, equipped: false },
    ];
  })()`;
}

async function shareState(page) {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll("[data-share]")];
    const prev = document.getElementById("sharePrev");
    const msg = document.querySelector(".share-msg");
    return {
      labels: buttons.map((b) => b.textContent),
      disabled: buttons.map((b) => b.disabled),
      hidden: buttons.map((b) => b.hidden),
      msg: msg ? msg.textContent : "",
      prevHidden: !prev || prev.hidden,
      painted: window.__painted || 0,
    };
  });
}

async function openShare(page) {
  await page.evaluate(new Function("const pieces = " + piecePage() + "; window.__organizer.setItems(pieces); window.__renders = 0; window.__painted = 0; const orig = Share.render; Share.render = function () { window.__renders++; const p = orig.apply(this, arguments); return Promise.resolve(p).then((cv) => { window.__painted++; return cv; }); }; window.__organizer.open('share');"));
}

function assertPreparing(state) {
  assert.ok(state.labels.includes("Download PNG"), "download button is present");
  assert.ok(state.disabled.every(Boolean), "Share, Copy, and Download stay disabled until the image is ready: " + JSON.stringify(state));
  assert.equal(state.msg, "Preparing image\u2026");
  assert.equal(state.prevHidden, true);
  assert.equal(state.painted, 0);
}

async function pngStats(page) {
  return page.evaluate(async () => {
    const prev = document.getElementById("sharePrev");
    if (prev.decode) { try { await prev.decode(); } catch (e) { /* the element is already complete */ } }
    const c = document.createElement("canvas");
    c.width = prev.naturalWidth; c.height = prev.naturalHeight;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(prev, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height).data;
    let ink = 0, magenta = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], gc = data[i + 1], b = data[i + 2];
      if (r > 220 && gc > 200 && b > 180) ink++;
      if (r > 120 && b > 70 && gc < 100 && r > gc + 40) magenta++;
    }
    return { w: c.width, h: c.height, ink, magenta };
  });
}

test("share image waits for decode and fonts before it draws", { skip, timeout: 90000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__organizer && window.Share && window.Share.render);
    await page.evaluate(() => {
      let release;
      window.__decodeGate = new Promise((r) => { release = r; });
      window.__releaseDecode = () => release();
      // Resolve when the gate opens. Calling the original decode here recurses through this override.
      HTMLImageElement.prototype.decode = function () { return window.__decodeGate.then(() => {}); };
      const fonts = document.fonts;
      const ready = fonts.ready;
      let releaseFonts;
      window.__fontGate = new Promise((r) => { releaseFonts = r; });
      window.__releaseFonts = () => releaseFonts();
      Object.defineProperty(fonts, "ready", { configurable: true, get() { return window.__fontGate.then(() => ready); } });
    });
    await openShare(page);
    await page.waitForTimeout(250);
    const held = await shareState(page);
    assertPreparing(held);
    await page.locator("details[data-k=share]").scrollIntoViewIfNeeded();
    await page.locator(".share").screenshot({ path: "/tmp/share-preparing.png" });
    // Fonts alone must not let the canvas paint. Pictures are still undecoded.
    await page.evaluate(() => window.__releaseFonts());
    await page.waitForTimeout(300);
    assertPreparing(await shareState(page));
    await page.evaluate(() => window.__releaseDecode());
    await page.waitForFunction(() => {
      const prev = document.getElementById("sharePrev");
      const dl = document.querySelector('[data-share="dl"]');
      return prev && !prev.hidden && prev.naturalWidth === 1100 && dl && !dl.disabled && window.__painted >= 1;
    });
    const ready = await shareState(page);
    assert.ok(ready.disabled.every((d) => d === false), JSON.stringify(ready));
    assert.equal(ready.msg, "");
    assert.ok(ready.painted >= 1, JSON.stringify(ready));
    const stats = await pngStats(page);
    assert.equal(stats.w, 1100);
    assert.ok(stats.ink > 400, "totals and title text are painted: " + JSON.stringify(stats));
    assert.ok(stats.magenta > 15, "gear sprite is painted: " + JSON.stringify(stats));
    const paintedBeforeDownload = await page.evaluate(() => window.__painted);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.click('[data-share="dl"]'),
    ]);
    assert.equal(download.suggestedFilename(), "souls-organizer-equipment.png");
    await page.waitForFunction((n) => window.__painted > n && window.__renders > n, paintedBeforeDownload);
    await page.locator("#sharePrev").screenshot({ path: "/tmp/share-ready.png" });
    assert.deepEqual(errors, []);
    fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
    fs.copyFileSync("/tmp/share-preparing.png", "/opt/cursor/artifacts/share_preparing_disabled.png");
    fs.copyFileSync("/tmp/share-ready.png", "/opt/cursor/artifacts/share_ready_preview.png");
  } finally { await page.close(); }
});

test("throttled images still produce icons and numbers, including on the published gear page", { skip, timeout: 90000 }, async () => {
  for (const base of ["/index.html", "/gear/index.html"]) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(base + " " + e));
    try {
      const client = await page.context().newCDPSession(page);
      await client.send("Network.setCacheDisabled", { cacheDisabled: true });
      await client.send("Network.emulateNetworkConditions", { offline: false, latency: 200, downloadThroughput: 40 * 1024, uploadThroughput: 40 * 1024 });
      await page.route("**/*", async (route) => {
        const u = route.request().url();
        if (/\/icons\/(gear|class|diamonds)\/[^?]+\.png(?:\?|$)/.test(u) || /\.woff2(?:\?|$)/.test(u)) await new Promise((r) => setTimeout(r, 1200));
        await route.continue();
      });
      await page.goto("http://127.0.0.1:" + PORT + base, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(() => window.__organizer && window.Share);
      await openShare(page);
      await page.waitForTimeout(350);
      const early = await shareState(page);
      assertPreparing(early);
      await page.waitForFunction(() => {
        const prev = document.getElementById("sharePrev");
        const dl = document.querySelector('[data-share="dl"]');
        return prev && !prev.hidden && prev.naturalWidth === 1100 && dl && !dl.disabled;
      }, null, { timeout: 30000 });
      const stats = await pngStats(page);
      assert.ok(stats.ink > 400, base + " text " + JSON.stringify(stats));
      assert.ok(stats.magenta > 15, base + " sprite " + JSON.stringify(stats));
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  }
});

test("a failed share image is loaded once more", { skip, timeout: 60000 }, async () => {
  const page = await browser.newPage();
  try {
    let aborted = 0;
    await page.route("**/icons/gear/agi-weapon.png**", (route) => {
      const u = route.request().url();
      if (u.includes("share-retry-test") && !u.includes("retry=1")) { aborted++; return route.abort(); }
      return route.continue();
    });
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.Share && window.Share.loadImage);
    const ok = await page.evaluate(() => Share.loadImage("icons/gear/agi-weapon.png?share-retry-test=1").then((img) => !!(img && img.naturalWidth > 0)));
    assert.equal(ok, true);
    assert.equal(aborted, 1);
  } finally { await page.close(); }
});

test("mobile share still sends a fresh PNG", { skip, timeout: 60000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await context.addInitScript(() => {
    navigator.share = (data) => {
      const file = data && data.files && data.files[0];
      window.__shared = { name: file && file.name, type: file && file.type, title: data && data.title, size: file && file.size };
      return Promise.resolve();
    };
    navigator.canShare = () => true;
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto("http://127.0.0.1:" + PORT + "/gear/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__organizer && window.Share);
    // Hold decode so a warm cache cannot finish the picture before the preparing state is observed.
    await page.evaluate(() => {
      let release;
      window.__decodeGate = new Promise((r) => { release = r; });
      window.__releaseDecode = () => release();
      HTMLImageElement.prototype.decode = function () { return window.__decodeGate.then(() => {}); };
    });
    await openShare(page);
    const early = await shareState(page);
    assertPreparing(early);
    await page.evaluate(() => window.__releaseDecode());
    const native = early.labels.indexOf("Share image");
    assert.ok(native >= 0 && early.hidden[native] === false, "mobile offers Share image: " + JSON.stringify(early));
    await page.waitForFunction(() => {
      const b = document.querySelector('[data-share="native"]');
      return b && !b.hidden && !b.disabled;
    });
    const row = await page.evaluate(() => {
      const el = document.querySelector(".share").getBoundingClientRect();
      return el.width <= document.documentElement.clientWidth + 1;
    });
    assert.equal(row, true);
    await page.locator(".share").screenshot({ path: "/tmp/share-mobile.png" });
    const paintedBeforeShare = await page.evaluate(() => window.__painted);
    await page.click('[data-share="native"]');
    await page.waitForFunction(() => window.__shared && window.__shared.size > 1000);
    const shared = await page.evaluate(() => ({ shared: window.__shared, painted: window.__painted, renders: window.__renders }));
    assert.equal(shared.shared.name, "souls-organizer-equipment.png");
    assert.equal(shared.shared.type, "image/png");
    assert.equal(shared.shared.title, "SOULS Gear Advisor");
    assert.ok(shared.painted > paintedBeforeShare, "share draws a new image instead of reusing the preview: " + JSON.stringify(shared));
    assert.deepEqual(errors, []);
    fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
    fs.copyFileSync("/tmp/share-mobile.png", "/opt/cursor/artifacts/share_mobile_ready.png");
  } finally { await context.close(); }
});
