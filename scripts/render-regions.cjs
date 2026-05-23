/*
 * リージョン（大陸区分）の割り当てを色分けPNGで可視化する確認用スクリプト。
 * 200x100 のマスを 11 区分に割り当て、4倍(800x400)で描画して region-preview.png に出力。
 * 実行: node scripts/render-regions.cjs
 */
const sharp = require("sharp");
const path = require("path");
const SRC = path.join(__dirname, "..", "..", "参考画像", "IMG_5876.PNG");
const OUT = path.join(__dirname, "..", "region-preview.png");
const W = 200, H = 100, THRESHOLD = 128, SCALE = 4;

const COLORS = {
  NA:   [225, 80, 80],   // 北米 赤
  SA:   [240, 150, 55],  // 南米 橙
  EU:   [80, 140, 235],  // ヨーロッパ 青
  NAsia:[150, 110, 220], // 北アジア 紫
  CAsia:[220, 200, 70],  // 中央アジア 黄
  EAsia:[235, 100, 180], // 東アジア 桃
  SEAsia:[70, 200, 160], // 東南アジア 青緑
  NAfr: [200, 150, 100], // 北アフリカ 茶
  SAfr: [110, 200, 90],  // 南アフリカ 緑
  AU:   [235, 120, 80],  // 豪州 珊瑚
  ISL:  [170, 170, 170], // 島嶼 灰
  SEA:  [12, 30, 52],     // 海
};

function region(x, y) {
  // 南北アメリカ（右側）
  if (x >= 115) return y < 48 ? "NA" : "SA";
  // オーストラリア（南の独立塊）
  if (x >= 66 && x < 102 && y >= 58) return "AU";
  // 旧大陸（x 5-111）
  if (y < 17 && x >= 42) return "NAsia";        // 北アジア（シベリア帯）
  if (x >= 88) return y < 42 ? "EAsia" : "SEAsia"; // 東端＝東アジア／東南アジア
  if (x >= 76 && y >= 40 && y < 60) return "SEAsia"; // 東南アジア島嶼帯
  if (x < 58) {                                  // 西側
    if (y < 40) return "EU";                     // ヨーロッパ
    return y < 55 ? "NAfr" : "SAfr";             // 北/南アフリカ
  }
  if (y < 42) return "CAsia";                    // 中央アジア（中央）
  return y < 55 ? "NAfr" : "SAfr";               // 北/南アフリカ
}

(async () => {
  const { data, info } = await sharp(SRC).resize(W, H, { fit: "fill" }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const counts = {};
  const out = Buffer.alloc(W * SCALE * H * SCALE * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = data[(y * W + x) * ch];
      const isLand = v < THRESHOLD && y !== 0 && y !== H - 1;
      const key = isLand ? region(x, y) : "SEA";
      if (isLand) counts[key] = (counts[key] || 0) + 1;
      const [r, g, b] = COLORS[key];
      for (let sy = 0; sy < SCALE; sy++)
        for (let sx = 0; sx < SCALE; sx++) {
          const px = ((y * SCALE + sy) * W * SCALE + (x * SCALE + sx)) * 3;
          out[px] = r; out[px + 1] = g; out[px + 2] = b;
        }
    }
  await sharp(out, { raw: { width: W * SCALE, height: H * SCALE, channels: 3 } }).png().toFile(OUT);
  console.log("region cell counts:");
  for (const k of Object.keys(counts).sort((a, b) => counts[b] - counts[a]))
    console.log(`  ${k.padEnd(7)} ${counts[k]}`);
  console.log("written:", path.relative(path.join(__dirname, ".."), OUT));
})();
