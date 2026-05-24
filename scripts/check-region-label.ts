// 地域ラベル位置の検証: 各地域の連結成分（横ループ考慮・4近傍）のサイズと重心を出力。
import { getWorldTerrain } from "../src/lib/maps";
const w = getWorldTerrain();
const { width, height, regions, regionMeta } = w;

function components(target: number, wrap = true) {
  const seen = new Uint8Array(width * height);
  const comps: { n: number; cx: number; cy: number; minx: number; maxx: number }[] = [];
  for (let i = 0; i < regions.length; i++) {
    if (regions[i] !== target || seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    let sx = 0, sy = 0, n = 0, minx = 1e9, maxx = -1e9;
    while (stack.length) {
      const c = stack.pop()!;
      const x = c % width, y = (c / width) | 0;
      sx += x; sy += y; n++;
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      const nbs = wrap
        ? [[(x + 1) % width, y], [(x - 1 + width) % width, y], [x, y + 1], [x, y - 1]]
        : [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of nbs) {
        if (ny < 0 || ny >= height) continue;
        const j = ny * width + nx;
        if (regions[j] === target && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    comps.push({ n, cx: Math.round((sx / n) * 10) / 10, cy: Math.round((sy / n) * 10) / 10, minx, maxx });
  }
  comps.sort((a, b) => b.n - a.n);
  return comps;
}

for (let ri = 0; ri < regionMeta.length; ri++) {
  const cs = components(ri);
  const naive = (() => {
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < regions.length; i++) if (regions[i] === ri) { sx += i % width; sy += (i / width) | 0; n++; }
    return n ? { cx: Math.round(sx / n * 10) / 10, cy: Math.round(sy / n * 10) / 10 } : null;
  })();
  console.log(regionMeta[ri].code.padEnd(7), (regionMeta[ri].ja).padEnd(8),
    "naive=", JSON.stringify(naive), "main=", JSON.stringify(cs[0]));
}

// EU の「左側（実ヨーロッパ）」アンカー候補を算出
for (const cut of [50, 60, 70]) {
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < regions.length; i++) {
    if (regions[i] !== 2) continue;
    const x = i % width, y = (i / width) | 0;
    if (x < cut) { sx += x; sy += y; n++; }
  }
  console.log(`EU x<${cut}: n=${n} centroid=(${(sx / n).toFixed(1)},${(sy / n).toFixed(1)})`);
}
