# SOULS Organizer

Live site: https://linlin92.github.io/souls-organizer/

The pages at the root of this repo are the Gear advisor. The live site is the hub in `hub/`, with Gear, the Artifact advisor, and a Runes placeholder. GitHub Pages builds that hub and decodes the artifact icons.

# Gear advisor (v1: Equipment)

Upload Inventory screenshots (Equipment tab) and get an expandable recap of your gear, plus a share image for Discord.
Runs fully in the browser (no server code, no AI API, nothing uploaded). Same dark gold theme as the SOULS Artifact Advisor.

    npm install          # only for the tests / preview script
    npm start            # http://localhost:8090  (any static server works)
    npm test             # logic tests; screenshot checks run only if test/fixtures/screens is present locally
    npm run eval         # per-field accuracy vs the hand labels
    node tools/preview.js  # headless Chrome run with the real screenshots -> preview/*.png (needs npm start)

## What it reads per tile
slot, class (STR/AGI/INT; a "set" is just the class, a full set = helmet + armor + boots + weapon of one class), diamonds (0-3), refined (+1 / +2 / +3 icy diamonds from the top, the rest stay gold) and equipped (E badge). Level is ignored. Only yellow (Mythic) tiles. Sparkles and glow are ignored.
Tiles cut off or hidden behind the "Filter Applied" pill are merged across overlapping screenshots (never double counted).

## Files
- `src/vision.js` copy of the advisor's reader with two changes marked `ORGANIZER` (see below)
- `src/gear.js` gear reader, merge across screenshots, recap numbers (pure functions, run in Node and browser)
- `src/share.js` share image model + canvas painter; `src/app.js` the page
- `icons/`, `data/digits.json`, `fonts/` reference pictures and digit templates (from the advisor)

## Changes in vision.js (suggested upstream)
1. `findGrid`: choose the tile cluster by area (`grp.length * w*w`), not by count only.
2. `readNumberOnce`: for `kind === "level"` drop the leading bold "+" glyph when it is read as a 4th glyph (it touches pale artwork on dim tiles).

Inventory screenshots are not stored in this repo.
