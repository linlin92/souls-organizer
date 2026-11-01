const fs = require("fs"), path = require("path");
const { loadImage, root } = require("./load.js");
const G = require("../src/gear.js");
function loadRefs() {
  const sprites = {}, classes = {}, diamonds = {};
  for (const s of G.SPRITES) sprites[s.id] = loadImage(path.join(root, "icons/gear", s.id + ".png"));
  for (const c of ["hammer", "bow", "staff"]) classes[c] = loadImage(path.join(root, "icons/class", c + ".png"));
  for (const d of ["normal", "refined"]) diamonds[d] = loadImage(path.join(root, "icons/diamonds", d + ".png"));
  const digits = JSON.parse(fs.readFileSync(path.join(root, "data/digits.json"), "utf8"));
  return { sprites, classes, diamonds, digits };
}
const matcher = () => G.buildMatcher(loadRefs());
module.exports = { loadRefs, matcher, G };
