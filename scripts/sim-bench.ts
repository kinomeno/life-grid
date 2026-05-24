// ver.2 世界地図バランス計測（ヘッドレス）。
//   実行: npx tsx scripts/sim-bench.ts [turns] [perRegion] [seed]
//   目的: 開始直後のクラッシュ有無・環境収容力 K・制覇までのターン数を実測してチューニングする。
import { getWorldTerrain } from "../src/lib/maps";
import { createWorld, stepWorld, defaultSimulationParams } from "../src/lib/world";
import type { World } from "../src/lib/types";

const TURNS = Number(process.argv[2] ?? 3000);
const PER_REGION = Number(process.argv[3] ?? 100);
const SEED = Number(process.argv[4] ?? 12345);

function aliveCount(w: World): number {
  let c = 0;
  for (const l of w.lives) if (l.alive) c++;
  return c;
}
function origins(w: World): { m: Map<string, number>; total: number } {
  const m = new Map<string, number>();
  let total = 0;
  for (const l of w.lives) {
    if (!l.alive || !l.origin) continue;
    m.set(l.origin, (m.get(l.origin) || 0) + 1);
    total++;
  }
  return { m, total };
}

// ver.2: 地域(地理)ごとの最多勢力(出自)を集計し、首位出自が支配する地域数を返す。
// 全地域制覇に近づいているか（leadCount → regionCount）を観察する。
function regionControl(w: World): {
  lead: string;
  leadCount: number;
  populated: number;
  regionCount: number;
} {
  const regions = w.regions;
  const meta = w.regionMeta;
  if (!regions || !meta) return { lead: "", leadCount: 0, populated: 0, regionCount: 0 };
  const rc = meta.length;
  const counts: Map<string, number>[] = [];
  for (let i = 0; i < rc; i++) counts.push(new Map());
  for (const l of w.lives) {
    if (!l.alive || !l.origin) continue;
    const ri = regions[l.y * w.width + l.x];
    if (ri < 0 || ri >= rc) continue;
    counts[ri].set(l.origin, (counts[ri].get(l.origin) || 0) + 1);
  }
  let populated = 0;
  const leadByOrigin = new Map<string, number>();
  for (let ri = 0; ri < rc; ri++) {
    const mp = counts[ri];
    if (mp.size === 0) continue;
    populated++;
    let top = "";
    let tn = 0;
    for (const [o, n] of mp) if (n > tn) { tn = n; top = o; }
    leadByOrigin.set(top, (leadByOrigin.get(top) || 0) + 1);
  }
  let lead = "";
  let leadCount = 0;
  for (const [o, n] of leadByOrigin) if (n > leadCount) { leadCount = n; lead = o; }
  return { lead, leadCount, populated, regionCount: rc };
}

const tp = getWorldTerrain();
let landCells = 0;
for (let i = 0; i < tp.terrain.length; i++) if (tp.terrain[i] === 1) landCells++;

const world = createWorld({
  width: tp.width,
  height: tp.height,
  initialLifeCount: PER_REGION,
  seed: SEED,
  params: defaultSimulationParams(),
  terrain: tp.terrain,
  regions: tp.regions,
  regionMeta: tp.regionMeta,
});

const start = aliveCount(world);
console.log(
  `map ${tp.width}x${tp.height} land=${landCells} perRegion=${PER_REGION} seed=${SEED} startAlive=${start}`
);

let peak = start;
let trough = start;
let troughTurn = 0;
let lastDomTurn = -1; // 直近の制覇/革命イベントのターン（革命は複数回起こりうる）
for (let i = 0; i < TURNS; i++) {
  stepWorld(world);
  const a = aliveCount(world);
  if (a > peak) peak = a;
  if (a < trough) {
    trough = a;
    troughTurn = world.turn;
  }
  if (world.turn % 100 === 0) {
    const { m, total } = origins(world);
    let top = "";
    let tn = 0;
    for (const [o, n] of m) if (n > tn) { tn = n; top = o; }
    const pct = total ? Math.round((tn / total) * 100) : 0;
    const rcInfo = regionControl(world);
    console.log(
      `t${world.turn}\talive=${a}\torigins=${m.size}\ttop=${top}(${pct}%)\tregions=${rcInfo.lead}:${rcInfo.leadCount}/${rcInfo.regionCount}(pop${rcInfo.populated})\tstreak=${world.dominationStreak ?? 0}`
    );
  }
  // 制覇/革命イベントを観察（制覇後も継続して革命の有無を見る）。
  const doms = world.events.filter((e) => e.type === "worldDomination");
  if (doms.length > 0) {
    const last = doms[doms.length - 1];
    if (last.turn > lastDomTurn) {
      lastDomTurn = last.turn;
      console.log(`>>> turn ${world.turn}: ${last.message.ja}`);
    }
  }
  if (a === 0) {
    console.log(`>>> EXTINCT at turn ${world.turn}`);
    break;
  }
}
// ver.2: 系統樹の妥当性（全 parentId が存在＝本物の樹／孤児0が正常）。
{
  const ids = new Set(world.lineageNodes.map((n) => n.id));
  let roots = 0;
  let orphans = 0;
  for (const n of world.lineageNodes) {
    if (n.parentId == null) roots++;
    else if (!ids.has(n.parentId)) orphans++;
  }
  console.log(
    `lineage: nodes=${world.lineageNodes.length} roots=${roots} orphans=${orphans} nextId=${world.nextLineageId}`
  );
}
{
  let iSum = 0;
  let iN = 0;
  for (const l of world.lives) {
    if (!l.alive) continue;
    iSum += l.genes.intelligence;
    iN++;
  }
  console.log(`avgIntelligence=${iN ? (iSum / iN).toFixed(1) : 0}`);
}
console.log(
  `END turn=${world.turn} alive=${aliveCount(world)} peak=${peak} trough=${trough}@t${troughTurn}`
);
