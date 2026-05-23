/*
 * 世界地図マスク生成（ver.2 マップ機能）
 * 参考画像（黒=陸／白=海）を 200x100 グリッドに変換し、
 * src/lib/maps/worldMap.ts を出力する。
 *
 *   '#' = 陸（生息可能） / '.' = 海（侵入不可）
 *   - 上下端の行は海に固定（縦ループを遮断＝上下通行不可）
 *   - 横方向は既存のトーラスがそのまま機能（左右ループ）。継ぎ目の陸橋は後で手調整。
 *
 * 実行: node scripts/gen-world-mask.cjs
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "..", "参考画像", "IMG_5876.PNG");
const OUT = path.join(__dirname, "..", "src", "lib", "maps", "worldMap.ts");
const W = 200;
const H = 100;
const THRESHOLD = 128; // グレースケールでこの値未満を「陸」とみなす

(async () => {
  const { data, info } = await sharp(SRC)
    .resize(W, H, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels; // 1 (grayscale)
  const rows = [];
  let land = 0;
  for (let y = 0; y < H; y++) {
    let row = "";
    for (let x = 0; x < W; x++) {
      const v = data[(y * W + x) * channels];
      const isLand = v < THRESHOLD;
      // 上下端は海に固定（縦ループ遮断）
      const sea = y === 0 || y === H - 1;
      const cell = isLand && !sea;
      row += cell ? "#" : ".";
      if (cell) land++;
    }
    rows.push(row);
  }

  // 出力ファイル
  const header = `// 自動生成: scripts/gen-world-mask.cjs（参考画像 IMG_5876.PNG より）\n` +
    `// '#' = 陸（生息可能） / '.' = 海（侵入不可・エネルギー無し）。${W}x${H}。\n` +
    `// 上下端は海＝縦ループ遮断。横方向は既存トーラスでループ（左右接続）。\n` +
    `// 陸橋（島嶼の連結・大西洋の継ぎ目）は本ファイルを手編集して調整可能。\n`;
  const body =
    `export const WORLD_MAP_WIDTH = ${W};\n` +
    `export const WORLD_MAP_HEIGHT = ${H};\n` +
    `export const WORLD_MAP_ROWS: string[] = [\n` +
    rows.map((r) => `  "${r}",`).join("\n") +
    `\n];\n`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, header + body, "utf8");

  // ASCII プレビュー（横100・縦50に間引き）
  console.log(`land cells: ${land} / ${W * H} (${((land / (W * H)) * 100).toFixed(1)}%)`);
  console.log("preview (downsampled):");
  for (let y = 0; y < H; y += 2) {
    let line = "";
    for (let x = 0; x < W; x += 2) line += rows[y][x];
    console.log(line);
  }
  console.log(`written: ${path.relative(path.join(__dirname, ".."), OUT)}`);
})();
