const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), port = Number(process.env.PORT) || 8090;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".css": "text/css; charset=utf-8", ".mp4": "video/mp4", ".webm": "video/webm" };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, b) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": types[path.extname(f).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(b);
  });
}).listen(port, () => console.log(`SOULS Organizer on http://localhost:${port}`));
