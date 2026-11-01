const fs = require("fs"), path = require("path"), jpeg = require("jpeg-js"), { PNG } = require("pngjs");
const root = path.join(__dirname, "..");
function loadImage(f) {
  const b = fs.readFileSync(f);
  if (/\.png$/i.test(f)) { const p = PNG.sync.read(b); return { width: p.width, height: p.height, data: p.data }; }
  const j = jpeg.decode(b, { useTArray: true, formatAsRGBA: true });
  return { width: j.width, height: j.height, data: j.data };
}
const savePng = (img, f) => { const p = new PNG({ width: img.width, height: img.height }); Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length).copy(p.data); fs.writeFileSync(f, PNG.sync.write(p)); };
module.exports = { loadImage, savePng, root };
