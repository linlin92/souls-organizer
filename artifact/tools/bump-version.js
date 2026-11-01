// Cache-busting: one shared version, set as window.SOULS_V in index.html and repeated on every versioned URL there (scripts, CSS font, icons).
// Run before each deploy:  node tools/bump-version.js [version]   (default: YYYYMMDD + short git hash, or a timestamp when git is not available)
const fs = require("fs"), path = require("path"), cp = require("child_process");
const file = path.join(__dirname, "..", "index.html");
let v = process.argv[2];
if (!v) {
  const d = new Date(), pad = (n) => String(n).padStart(2, "0");
  v = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
}
let html = fs.readFileSync(file, "utf8");
html = html.replace(/window\.SOULS_V="[^"]*"/, `window.SOULS_V="${v}"`).replace(/(\.(?:js|png|woff2))\?v=[\w.-]+/g, `$1?v=${v}`);
fs.writeFileSync(file, html);
console.log("version", v);
