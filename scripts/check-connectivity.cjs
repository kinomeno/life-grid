// worldMap.ts の陸を「4連結（上下左右のみ・横ループ）」で連結成分を数える。
// 移動が4方向なので、これが実際に行き来できる単位。
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "maps", "worldMap.ts"), "utf8");
const m = src.match(/WORLD_MAP_ROWS:\s*string\[\]\s*=\s*\[([\s\S]*?)\];/);
const rows = [...m[1].matchAll(/"([.#]*)"/g)].map((x) => x[1]);
const H = rows.length, W = rows[0].length;
const comp = new Int32Array(W * H).fill(-1);
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
let n = 0; const sizes = [];
for (let s = 0; s < W * H; s++) {
  if (rows[(s / W) | 0][s % W] !== "#" || comp[s] !== -1) continue;
  const id = n++; let sz = 0; const st = [s]; comp[s] = id;
  while (st.length) {
    const c = st.pop(); sz++;
    const cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of N4) {
      const ny = cy + dy; if (ny < 0 || ny >= H) continue;
      const nx = (cx + dx + W) % W; const ni = ny * W + nx;
      if (rows[ny][nx] === "#" && comp[ni] === -1) { comp[ni] = id; st.push(ni); }
    }
  }
  sizes.push(sz);
}
sizes.sort((a, b) => b - a);
console.log("4-connected components:", n);
console.log("top sizes:", sizes.slice(0, 12).join(", "));
