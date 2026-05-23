/*
 * 世界マスクの連結成分（＝大陸/島）を列挙する解析スクリプト。
 * 横方向ループ(x wrap)・8近傍。各成分のサイズ・バウンディングボックス・重心を出力。
 * 実行: node scripts/analyze-continents.cjs
 */
const sharp = require("sharp");
const path = require("path");
const SRC = path.join(__dirname, "..", "..", "参考画像", "IMG_5876.PNG");
const W = 200, H = 100, THRESHOLD = 128;

(async () => {
  const { data, info } = await sharp(SRC).resize(W, H, { fit: "fill" }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const land = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = data[(y * W + x) * ch];
      land[y * W + x] = v < THRESHOLD && y !== 0 && y !== H - 1 ? 1 : 0;
    }

  const comp = new Int32Array(W * H).fill(-1);
  const comps = [];
  const stack = [];
  const idx = (x, y) => y * W + x;
  for (let s = 0; s < W * H; s++) {
    if (land[s] !== 1 || comp[s] !== -1) continue;
    const id = comps.length;
    let size = 0, minX = W, maxX = -1, minY = H, maxY = -1, sumX = 0, sumY = 0;
    stack.push(s); comp[s] = id;
    while (stack.length) {
      const c = stack.pop();
      const cx = c % W, cy = (c / W) | 0;
      size++; sumX += cx; sumY += cy;
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = cy + dy; if (ny < 0 || ny >= H) continue;
          const nx = (cx + dx + W) % W; // x wrap
          const ni = idx(nx, ny);
          if (land[ni] === 1 && comp[ni] === -1) { comp[ni] = id; stack.push(ni); }
        }
    }
    comps.push({ id, size, minX, maxX, minY, maxY, cx: Math.round(sumX / size), cy: Math.round(sumY / size) });
  }
  comps.sort((a, b) => b.size - a.size);
  console.log(`components: ${comps.length} (total land ${land.reduce((a, b) => a + b, 0)})`);
  console.log("top components (size>=20):");
  for (const c of comps.filter((c) => c.size >= 20))
    console.log(`  size=${String(c.size).padStart(4)}  x[${c.minX}-${c.maxX}] y[${c.minY}-${c.maxY}]  centroid(${c.cx},${c.cy})`);
})();
