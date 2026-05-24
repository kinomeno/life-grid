/*
 * 世界地図の「陸/海マスク（陸橋つき）」と「大陸リージョン」を生成する統合パイプライン。
 *  1) IMG_5876.PNG から陸/海マスク
 *  2) aaaaaa.png（ユーザー色分け）を最近傍色で 10 区分に分類＋多数決スムージング＋アイスランド補正
 *  3) 陸橋（1ドット線）を追加：大西洋（南米東岸→継ぎ目→アフリカ西岸）＋孤立塊を最近傍連結
 *  4) 橋セルに最近傍リージョンを割当て、連結性を検証
 * 出力: src/lib/maps/worldMap.ts（陸/海）・worldRegions.ts（区分）・region-classified.png（検証）
 * 実行: node scripts/gen-world-regions.cjs
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const MASK_SRC = path.join(__dirname, "..", "..", "参考画像", "IMG_5876.PNG");
const USER_SRC = path.join(__dirname, "..", "..", "参考画像", "aaaaaa.png");
const OUT_MAP = path.join(__dirname, "..", "src", "lib", "maps", "worldMap.ts");
const OUT_REG = path.join(__dirname, "..", "src", "lib", "maps", "worldRegions.ts");
const OUT_PNG = path.join(__dirname, "..", "region-classified.png");
const W = 200, H = 100, TH = 128, SCALE = 4;

const REGIONS = [
  { code: "NA",     ja: "北アメリカ",     match: [160, 200, 240], display: [160, 200, 240] },
  { code: "NAsia",  ja: "北アジア",       match: [40, 80, 240],   display: [40, 80, 240] },
  { code: "EU",     ja: "ヨーロッパ",     match: [40, 200, 80],   display: [40, 200, 80] },
  { code: "EAsia",  ja: "東アジア",       match: [240, 80, 80],   display: [240, 80, 80] },
  { code: "NAfr",   ja: "北アフリカ",     match: [20, 20, 20],    display: [225, 150, 70] },
  { code: "CAsia",  ja: "中央アジア",     match: [200, 200, 40],  display: [200, 200, 40] },
  { code: "SA",     ja: "南アメリカ",     match: [120, 40, 120],  display: [150, 60, 160] },
  { code: "SAfr",   ja: "南アフリカ",     match: [40, 200, 240],  display: [40, 200, 240] },
  { code: "SEAsia", ja: "東南アジア",     match: [240, 160, 240], display: [240, 160, 240] },
  { code: "AU",     ja: "オーストラリア", match: [40, 240, 200],  display: [140, 215, 50] },
];
const CHAR = (i) => String.fromCharCode(65 + i);
const idxOf = (c) => REGIONS.findIndex((r) => r.code === c);
const nearest = (r, g, b) => {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < REGIONS.length; i++) {
    const [pr, pg, pb] = REGIONS[i].match;
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
};
const wrapDX = (x0, x1) => { let d = x1 - x0; if (d > W / 2) d -= W; else if (d < -W / 2) d += W; return d; };

function components(land) {
  const comp = new Int32Array(W * H).fill(-1);
  const list = [];
  const st = [];
  for (let s = 0; s < W * H; s++) {
    if (!land[s] || comp[s] !== -1) continue;
    const id = list.length, cells = [];
    st.push(s); comp[s] = id;
    while (st.length) {
      const c = st.pop(); cells.push(c);
      const cx = c % W, cy = (c / W) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const ny = cy + dy; if (ny < 0 || ny >= H) continue;
          const ni = ny * W + ((cx + dx + W) % W);
          if (land[ni] && comp[ni] === -1) { comp[ni] = id; st.push(ni); }
        }
    }
    list.push({ id, cells, size: cells.length });
  }
  list.sort((a, b) => b.size - a.size);
  return list;
}

function drawBridge(land, a, b) {
  const ax = a % W, ay = (a / W) | 0, bx = b % W, by = (b / W) | 0;
  const dx = wrapDX(ax, bx), dy = by - ay;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = (Math.round(ax + dx * t) % W + W) % W;
    const y = Math.round(ay + dy * t);
    if (y >= 1 && y < H - 1) land[y * W + x] = 1;
  }
}

function nearestPair(cellsA, cellsB) {
  let bd = Infinity, ba = -1, bb = -1;
  for (const a of cellsA) {
    const ax = a % W, ay = (a / W) | 0;
    for (const b of cellsB) {
      const dx = wrapDX(ax, b % W), dy = ((b / W) | 0) - ay;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; ba = a; bb = b; }
    }
  }
  return [ba, bb];
}

// 陸に囲まれた小さな他区分ブロブを周囲の多数派へ吸収（海に囲まれた島は保持）。
function removeStrayBlobs(reg, land, maxSize) {
  const seen = new Uint8Array(W * H), st = [];
  for (let s = 0; s < W * H; s++) {
    if (!land[s] || seen[s]) continue;
    const myreg = reg[s], cells = [];
    st.push(s); seen[s] = 1;
    while (st.length) {
      const c = st.pop(); cells.push(c);
      const cx = c % W, cy = (c / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const ny = cy + dy; if (ny < 0 || ny >= H) continue;
        const ni = ny * W + ((cx + dx + W) % W);
        if (land[ni] && !seen[ni] && reg[ni] === myreg) { seen[ni] = 1; st.push(ni); }
      }
    }
    if (cells.length > maxSize) continue;
    const cset = new Set(cells), ext = {}; let extLand = 0;
    for (const c of cells) {
      const cx = c % W, cy = (c / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const ny = cy + dy; if (ny < 0 || ny >= H) continue;
        const ni = ny * W + ((cx + dx + W) % W);
        if (land[ni] && !cset.has(ni)) { ext[reg[ni]] = (ext[reg[ni]] || 0) + 1; extLand++; }
      }
    }
    if (extLand === 0) continue; // 島は保持
    let mj = -1, mc = 0; for (const k in ext) if (ext[k] > mc) { mc = ext[k]; mj = +k; }
    if (mj >= 0) for (const c of cells) reg[c] = mj;
  }
}

(async () => {
  const mask = await sharp(MASK_SRC).resize(W, H, { fit: "fill" }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const mch = mask.info.channels;
  const user = await sharp(USER_SRC).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const uch = user.info.channels;

  const land = new Uint8Array(W * H);
  const reg = new Int16Array(W * H).fill(-1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = mask.data[(y * W + x) * mch];
      if (!(v < TH && y !== 0 && y !== H - 1)) continue;
      land[y * W + x] = 1;
      const o = (y * W + x) * uch;
      reg[y * W + x] = nearest(user.data[o], user.data[o + 1], user.data[o + 2]);
    }

  // 多数決スムージング（孤立誤分類ドット除去）。own<=2 で 2〜3 セルの誤分類塊も吸収。
  for (let p = 0; p < 4; p++) {
    const next = reg.slice();
    for (let y = 1; y < H - 1; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x; if (!land[i]) continue;
        const cnt = {}; let own = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const ny = y + dy; if (ny < 0 || ny >= H) continue;
            const ni = ny * W + ((x + dx + W) % W); if (!land[ni]) continue;
            cnt[reg[ni]] = (cnt[reg[ni]] || 0) + 1; if (reg[ni] === reg[i]) own++;
          }
        let mj = -1, mc = 0; for (const k in cnt) if (cnt[k] > mc) { mc = cnt[k]; mj = +k; }
        if (mj >= 0 && mj !== reg[i] && own <= 2 && mc >= 4) next[i] = mj;
      }
    reg.set(next);
  }
  // 小ブロブ（陸に囲まれた他区分の小塊）を吸収（2回）。島は保持。
  removeStrayBlobs(reg, land, 6);
  removeStrayBlobs(reg, land, 6);
  // アイスランド（欧州北西の小島）を欧州へ
  const EU = idxOf("EU");
  for (let y = 4; y <= 12; y++) for (let x = 6; x <= 22; x++) if (land[y * W + x]) reg[y * W + x] = EU;

  // ---- 陸橋 ----
  const comps0 = components(land);
  // 大西洋橋：南米東岸(右下) → アフリカ西岸(左・中緯度)。継ぎ目を跨ぐ。
  const americas = comps0[1]; // 2番目に大きい＝南北アメリカ
  const oldworld = comps0[0]; // 最大＝旧大陸
  const saEast = americas.cells.filter((c) => (c / W | 0) >= 55).reduce((m, c) => (c % W) > (m % W) ? c : m, americas.cells[0]);
  const afrWest = oldworld.cells.filter((c) => { const y = c / W | 0; return y >= 45 && y <= 72; }).reduce((m, c) => (c % W) < (m % W) ? c : m, oldworld.cells[0]);
  drawBridge(land, saEast, afrWest);

  // ベーリング橋：旧大陸の北東端（NEアジア）→ アメリカの北西端（アラスカ）。太平洋の北。
  const owNE = oldworld.cells.filter((c) => { const y = c / W | 0; return y >= 6 && y <= 30; }).reduce((m, c) => (c % W) > (m % W) ? c : m, oldworld.cells[0]);
  const amNW = americas.cells.filter((c) => { const y = c / W | 0; return y >= 6 && y <= 30; }).reduce((m, c) => (c % W) < (m % W) ? c : m, americas.cells[0]);
  drawBridge(land, owNE, amNW);

  // アイスランド → ヨーロッパ本土（北西の小島を欧州へ）。
  const iceCells = [], euArea = [];
  for (let i = 0; i < W * H; i++) {
    if (!land[i]) continue;
    const x = i % W, y = i / W | 0;
    if (x >= 4 && x <= 24 && y >= 3 && y <= 14) iceCells.push(i);
    else if (x >= 16 && x <= 52 && y >= 12 && y <= 36) euArea.push(i);
  }
  if (iceCells.length && euArea.length) { const [ia, ib] = nearestPair(iceCells, euArea); drawBridge(land, ia, ib); }

  // グリーンランド（欧州色の右上塊・x>140）→ ヨーロッパ本土（x<60）。北大西洋・継ぎ目またぎ。
  const EU2 = idxOf("EU");
  const grnCells = [], euMain = [];
  for (let i = 0; i < W * H; i++) {
    if (!land[i] || reg[i] !== EU2) continue;
    const x = i % W;
    if (x > 140) grnCells.push(i);
    else if (x < 60) euMain.push(i);
  }
  if (grnCells.length && euMain.length) { const [ga, gb] = nearestPair(grnCells, euMain); drawBridge(land, ga, gb); }

  // 残りの孤立塊を最大連結塊へ最近傍で連結（反復）
  for (let iter = 0; iter < 40; iter++) {
    const cs = components(land);
    if (cs.length <= 1) break;
    const main = cs[0].cells;
    const other = cs[1].cells; // 次に大きい孤立塊
    const [a, b] = nearestPair(other, main);
    if (a < 0) break;
    drawBridge(land, a, b);
  }
  const finalComps = components(land);

  // 橋で増えた陸セル(reg==-1)に最近傍リージョンを割当て
  const known = [];
  for (let i = 0; i < W * H; i++) if (land[i] && reg[i] >= 0) known.push(i);
  for (let i = 0; i < W * H; i++) {
    if (!land[i] || reg[i] >= 0) continue;
    const ix = i % W, iy = i / W | 0;
    let bd = Infinity, br = 0;
    for (const k of known) {
      const dx = wrapDX(ix, k % W), dy = (k / W | 0) - iy, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; br = reg[k]; }
    }
    reg[i] = br;
  }

  // 出力
  const mapRows = [], regRows = [], counts = {};
  const out = Buffer.alloc(W * SCALE * H * SCALE * 3);
  for (let y = 0; y < H; y++) {
    let mr = "", rr = "";
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let color = [12, 30, 52];
      if (land[i]) {
        mr += "#"; rr += CHAR(reg[i]); color = REGIONS[reg[i]].display;
        counts[REGIONS[reg[i]].code] = (counts[REGIONS[reg[i]].code] || 0) + 1;
      } else { mr += "."; rr += "."; }
      for (let sy = 0; sy < SCALE; sy++) for (let sx = 0; sx < SCALE; sx++) {
        const px = ((y * SCALE + sy) * W * SCALE + (x * SCALE + sx)) * 3;
        out[px] = color[0]; out[px + 1] = color[1]; out[px + 2] = color[2];
      }
    }
    mapRows.push(mr); regRows.push(rr);
  }
  await sharp(out, { raw: { width: W * SCALE, height: H * SCALE, channels: 3 } }).png().toFile(OUT_PNG);

  fs.writeFileSync(OUT_MAP,
    `// 自動生成: scripts/gen-world-regions.cjs（IMG_5876＋陸橋）\n` +
    `// '#'=陸（生息可）/'.'=海。${W}x${H}。上下端は海＝縦ループ遮断。横はトーラス。\n` +
    `// 陸橋（孤立大陸・島の1ドット連結／大西洋の継ぎ目）を含む。\n` +
    `export const WORLD_MAP_WIDTH = ${W};\nexport const WORLD_MAP_HEIGHT = ${H};\n` +
    `export const WORLD_MAP_ROWS: string[] = [\n` + mapRows.map((r) => `  ${JSON.stringify(r)},`).join("\n") + `\n];\n`, "utf8");

  const meta = REGIONS.map((r, i) => `  { id: ${i}, code: ${JSON.stringify(r.code)}, ja: ${JSON.stringify(r.ja)}, r: ${r.display[0]}, g: ${r.display[1]}, b: ${r.display[2]} },`).join("\n");
  fs.writeFileSync(OUT_REG,
    `// 自動生成: scripts/gen-world-regions.cjs（参考画像 aaaaaa.png より）\n` +
    `// 'A'..'J'=区分/'.'=海。${W}x${H}。worldMap.ts の陸/海と一致（陸橋含む）。\n` +
    `export type WorldRegionMeta = { id: number; code: string; ja: string; r: number; g: number; b: number };\n` +
    `export const WORLD_REGIONS: WorldRegionMeta[] = [\n${meta}\n];\n` +
    `export const WORLD_REGION_WIDTH = ${W};\nexport const WORLD_REGION_HEIGHT = ${H};\n` +
    `export const WORLD_REGION_ROWS: string[] = [\n` + regRows.map((r) => `  ${JSON.stringify(r)},`).join("\n") + `\n];\n`, "utf8");

  console.log(`components: before=${comps0.length} after=${finalComps.length} (sizes: ${finalComps.slice(0, 5).map((c) => c.size).join(",")})`);
  console.log("region counts:");
  for (const r of REGIONS) console.log(`  ${r.code.padEnd(7)} ${r.ja.padEnd(8)} ${counts[r.code] || 0}`);
})();
