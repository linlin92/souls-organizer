// Cache-busting: one shared version, set as window.SOULS_V in the artifact page and the Rune page,
// and repeated on every versioned URL there (scripts, font, icons).
// Run before each deploy:  node tools/bump-version.js [version]   (default: a timestamp)
const fs = require("fs"), path = require("path");
// The artifact page and the Rune page share one version, so a deploy never pairs new HTML with a cached copy of the old script.
const files = [
  path.join(__dirname, "..", "index.html"),
  path.join(__dirname, "..", "..", "runes", "index.html"),
];
let v = process.argv[2];
if (!v) {
  const d = new Date(), pad = (n) => String(n).padStart(2, "0");
  v = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
}
for (const file of files) {
  let html = fs.readFileSync(file, "utf8");
  const next = html.replace(/window\.SOULS_V="[^"]*"/g, `window.SOULS_V="${v}"`).replace(/(\.(?:js|png|woff2))\?v=[\w.-]+/g, `$1?v=${v}`);
  if (next === html || !next.includes(`window.SOULS_V="${v}"`)) throw new Error("no version markers in " + file);
  fs.writeFileSync(file, next);
}
console.log("version", v);
