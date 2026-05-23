/*
 * ユーザーの色分け画像(aaaaaa.png)から大陸リージョンを生成する。
 * - 陸/海は IMG_5876.PNG のマスクを使用（worldMap.ts と一致）
 * - 各陸セルを「最近傍のパレット色」で 10 区分に分類
 * 出力:
 *   - src/lib/maps/worldRegions.ts （区分データ＋メタ）
 *   - region-classified.png （検証用：分類結果を色で再描画）
 * 実行: node scripts/gen-world-regions.cjs
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const MASK_SRC = path.join(__dirname, "..", "..", "参考画像", "IMG_5876.PNG");
const USER_SRC = path.join(__dirname, "..", "..", "参考画像", "aaaaaa.png");
const OUT_TS = path.join(__dirname, "..", "src", "lib", "maps", "worldRegions.ts");
const OUT_PNG = path.join(__dirname, "..", "region-classified.png");
const W = 200, H = 100, TH = 128, SCALE = 4;

// 区分の代表色（ユーザー画像のパレット）。色はそのまま祖先の初期体色にも使う。
const REGIONS = [
  { code: "NA",     ja: "北アメリカ",   rgb: [160, 200, 240] },
  { code: "NAsia",  ja: "北アジア",     rgb: [40, 80, 240] },
  { code: "EU",     ja: "ヨーロッパ",   rgb: [40, 200, 80] },
  { code: "EAsia",  ja: "東アジア",     rgb: [240, 80, 80] },
  { code: "NAfr",   ja: "北アフリカ",   rgb: [20, 20, 20] },
  { code: "CAsia",  ja: "中央アジア",   rgb: [200, 200, 40] },
  { code: "SA",     ja: "南アメリカ",   rgb: [120, 40, 120] },
  { code: "SAfr",   ja: "南アフリカ",   rgb: [40, 200, 240] },
  { code: "SEAsia", ja: "東南アジア",   rgb: [240, 160, 240] },
  { code: "AU",     ja: "オーストラリア", rgb: [40, 240, 200] },
];
const CHAR = (i) => String.fromCharCode(65 + i); // A..J

function nearest(r, g, b) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < REGIONS.length; i++) {
    const [pr, pg, pb] = REGIONS[i].rgb;
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return { idx: best, dist: Math.sqrt(bd) };
}

(async () => {
  const mask = await sharp(MASK_SRC).resize(W, H, { fit: "fill" }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const mch = mask.info.channels;
  const user = await sharp(USER_SRC).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const uch = user.info.channels;

  const rows = [];
  const counts = {};
  let land = 0, far = 0, maxDist = 0;
  const out = Buffer.alloc(W * SCALE * H * SCALE * 3);
  for (let y = 0; y < H; y++) {
    let row = "";
    for (let x = 0; x < W; x++) {
      const v = mask.data[(y * W + x) * mch];
      const isLand = v < TH && y !== 0 && y !== H - 1;
      let ch = ".", color = [12, 30, 52];
      if (isLand) {
        land++;
        const o = (y * W + x) * uch;
        let { idx, dist } = nearest(user.data[o], user.data[o + 1], user.data[o + 2]);
        // グリーンランド（右側の緑）は北アメリカへ寄せる
        if (REGIONS[idx].code === "EU" && x > 140) idx = REGIONS.findIndex((r) => r.code === "NA");
        ch = CHAR(idx);
        color = REGIONS[idx].rgb;
        counts[REGIONS[idx].code] = (counts[REGIONS[idx].code] || 0) + 1;
        if (dist > 120) far++;
        if (dist > maxDist) maxDist = dist;
      }
      row += ch;
      for (let sy = 0; sy < SCALE; sy++)
        for (let sx = 0; sx < SCALE; sx++) {
          const px = ((y * SCALE + sy) * W * SCALE + (x * SCALE + sx)) * 3;
          out[px] = color[0]; out[px + 1] = color[1]; out[px + 2] = color[2];
        }
    }
    rows.push(row);
  }

  await sharp(out, { raw: { width: W * SCALE, height: H * SCALE, channels: 3 } }).png().toFile(OUT_PNG);

  const meta = REGIONS.map((r, i) => `  { id: ${i}, code: ${JSON.stringify(r.code)}, ja: ${JSON.stringify(r.ja)}, r: ${r.rgb[0]}, g: ${r.rgb[1]}, b: ${r.rgb[2]} },`).join("\n");
  const ts =
    `// 自動生成: scripts/gen-world-regions.cjs（参考画像 aaaaaa.png より）\n` +
    `// 各文字が大陸区分（A..J）、'.' は海。${W}x${H}。worldMap.ts の陸/海と一致。\n` +
    `export type WorldRegionMeta = { id: number; code: string; ja: string; r: number; g: number; b: number };\n` +
    `export const WORLD_REGIONS: WorldRegionMeta[] = [\n${meta}\n];\n` +
    `export const WORLD_REGION_WIDTH = ${W};\n` +
    `export const WORLD_REGION_HEIGHT = ${H};\n` +
    `// 'A'..'J' = WORLD_REGIONS[0..9] の区分、'.' = 海。\n` +
    `export const WORLD_REGION_ROWS: string[] = [\n` +
    rows.map((r) => `  ${JSON.stringify(r)},`).join("\n") + `\n];\n`;
  fs.mkdirSync(path.dirname(OUT_TS), { recursive: true });
  fs.writeFileSync(OUT_TS, ts, "utf8");

  console.log(`land=${land}  far(dist>120)=${far}  maxDist=${maxDist.toFixed(0)}`);
  console.log("region counts:");
  for (const r of REGIONS) console.log(`  ${r.code.padEnd(7)} ${r.ja.padEnd(7)} ${counts[r.code] || 0}`);
  console.log("written:", path.relative(path.join(__dirname, ".."), OUT_TS), "/", path.relative(path.join(__dirname, ".."), OUT_PNG));
})();
