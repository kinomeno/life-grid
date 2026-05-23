/*
 * ユーザーの色分け画像(aaaaaa.png)を 200x100 に縮小し、陸セル上で使われている色を集計。
 * 区分→色の対応を決めるためのパレット調査。
 * 実行: node scripts/sample-user-regions.cjs
 */
const sharp = require("sharp");
const path = require("path");
const MASK_SRC = path.join(__dirname, "..", "..", "参考画像", "IMG_5876.PNG");
const USER_SRC = path.join(__dirname, "..", "..", "参考画像", "aaaaaa.png");
const W = 200, H = 100, TH = 128;

(async () => {
  const mask = await sharp(MASK_SRC).resize(W, H, { fit: "fill" }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const mch = mask.info.channels;
  const user = await sharp(USER_SRC).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const uch = user.info.channels;

  const tally = {};
  let land = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = mask.data[(y * W + x) * mch];
      const isLand = v < TH && y !== 0 && y !== H - 1;
      if (!isLand) continue;
      land++;
      const o = (y * W + x) * uch;
      const r = user.data[o], g = user.data[o + 1], b = user.data[o + 2];
      // 40刻みで量子化してアンチエイリアスをまとめる
      const q = `${Math.round(r / 40) * 40},${Math.round(g / 40) * 40},${Math.round(b / 40) * 40}`;
      tally[q] = (tally[q] || 0) + 1;
    }
  console.log(`land cells: ${land}`);
  console.log("top colors on land (quantized r,g,b : count):");
  Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 18)
    .forEach(([c, n]) => console.log(`  ${c.padEnd(14)} ${n}`));
})();
