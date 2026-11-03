// The Rune page used to load src/app.js with no query string. After a deploy, GitHub Pages can
// serve the new HTML with a cached copy of the previous script. That old script still looks for
// #out and tells the player the screenshot could not be read. The script URLs must carry the same
// version as the artifact page.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const artifact = fs.readFileSync(path.join(root, "artifact/index.html"), "utf8");
const rune = fs.readFileSync(path.join(root, "runes/index.html"), "utf8");
const version = artifact.match(/window\.SOULS_V="([^"]+)"/);

test("rune scripts use the artifact page cache version", () => {
  assert.ok(version, "artifact page sets window.SOULS_V");
  const v = version[1];
  assert.match(rune, new RegExp(`window\\.SOULS_V="${v}"`));
  for (const src of ["src/runes.js", "src/share.js", "src/app.js", "icons/logo.png", "../gear/fonts/cinzel-700.woff2"]) {
    assert.ok(rune.includes(`${src}?v=${v}`), `${src} is not versioned with ${v}`);
  }
});
