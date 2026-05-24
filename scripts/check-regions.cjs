// worldRegions.ts を読み、各区分の分布と「他地域への飛び地」を点検する。
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "maps", "worldRegions.ts"), "utf8");
const m = src.match(/WORLD_REGION_ROWS:\s*string\[\]\s*=\s*\[([\s\S]*?)\];/);
const rows = [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
const H = rows.length, W = rows[0].length;
const CODES = ["NA", "NAsia", "EU", "EAsia", "NAfr", "CAsia", "SA", "SAfr", "SEAsia", "AU"];
const stat = {};
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const ch = rows[y][x];
    if (ch === ".") continue;
    const i = ch.charCodeAt(0) - 65;
    const code = CODES[i];
    (stat[code] ||= { n: 0, minX: 999, maxX: -1, minY: 999, maxY: -1, sx: 0, sy: 0 });
    const s = stat[code];
    s.n++; s.sx += x; s.sy += y;
    if (x < s.minX) s.minX = x; if (x > s.maxX) s.maxX = x;
    if (y < s.minY) s.minY = y; if (y > s.maxY) s.maxY = y;
  }
console.log("region bbox / centroid:");
for (const c of CODES) { const s = stat[c]; if (!s) continue;
  console.log(`  ${c.padEnd(7)} n=${String(s.n).padStart(4)} x[${s.minX}-${s.maxX}] y[${s.minY}-${s.maxY}] c(${Math.round(s.sx/s.n)},${Math.round(s.sy/s.n)})`); }
// 豪州緯度(y>=58)にある SAfr(H) セルを列挙
console.log("\nSAfr cells with y>=56 (Australia latitude band):");
const hits = [];
for (let y = 56; y < H; y++) for (let x = 0; x < W; x++) if (rows[y][x] === "H") hits.push([x, y]);
console.log("  count=", hits.length, hits.slice(0, 30).map((p) => `(${p[0]},${p[1]})`).join(" "));
