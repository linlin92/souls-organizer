// Drives the page in headless Chrome with the real screenshots and saves preview pictures. Run the server first: npm start
const { chromium } = require("playwright-core"), path = require("path"), fs = require("fs");
const root = path.join(__dirname, ".."), out = path.join(root, "preview"), shots = [1, 2, 3, 4, 5, 6].map((i) => path.join(root, `test/fixtures/screens/shot${i}.jpg`));
(async () => {
  const exe = ["/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => fs.existsSync(p));
  const b = await chromium.launch(exe ? { executablePath: exe } : {});
  for (const [name, vp, mobile] of [["desktop", { width: 1100, height: 900 }, false], ["mobile", { width: 390, height: 844 }, true]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, acceptDownloads: true });
    const pg = await ctx.newPage(); const errs = []; pg.on("pageerror", (e) => errs.push(e.message)); pg.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    await pg.goto("http://localhost:8090/index.html");
    await pg.setInputFiles("#files", shots);
    await pg.screenshot({ path: `${out}/${name}-1-upload.png`, fullPage: true });
    const t0 = Date.now(); await pg.click("#read"); await pg.waitForFunction(() => /Done|Sorry/.test(document.getElementById("status").textContent), null, { timeout: 120000 });
    console.log(name, "read in", Date.now() - t0, "ms:", await pg.textContent("#status"), "|", await pg.textContent("#summary"));
    console.log(" notes:", (await pg.textContent("#notes")).trim());
    await pg.locator("#sec-check").screenshot({ path: `${out}/${name}-2-check.png` });
    await pg.click("#fAll"); 
    await pg.click("#expAll");
    await pg.locator("#sec-recap").screenshot({ path: `${out}/${name}-3-recap-expanded.png` });
    await pg.click("#colAll"); await pg.evaluate(() => document.querySelector('details[data-k=overview]').open = true);
    await pg.locator("#sec-recap").screenshot({ path: `${out}/${name}-3-recap-overview.png` });
    await pg.click("details[data-k=share] summary"); 
    await pg.waitForFunction(() => { const i = document.getElementById("sharePrev"); return i && !i.hidden && i.complete && i.naturalWidth > 0; }, null, { timeout: 30000 });
    const dims = await pg.evaluate(() => { const i = document.getElementById("sharePrev"); return [i.naturalWidth, i.naturalHeight]; });
    console.log(" share image", dims, "buttons:", await pg.evaluate(() => [...document.querySelectorAll("[data-share]")].map((x) => x.dataset.share + (x.hidden ? "(hidden)" : "")).join(" ")));
    const [dl] = await Promise.all([pg.waitForEvent("download"), pg.click('[data-share=dl]')]);
    if (!mobile) { await dl.saveAs(`${out}/share-image-equipment.png`); }
    await pg.locator("details[data-k=share]").screenshot({ path: `${out}/${name}-4-share-section.png` });
    console.log(" errors:", errs.length ? errs : "none");
    await ctx.close();
  }
  await b.close();
})();
