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
    console.log(
      `t${world.turn}\talive=${a}\torigins=${m.size}\ttop=${top}(${pct}%)\tstreak=${world.dominationStreak ?? 0}`
    );
  }
  if (world.events.some((e) => e.type === "worldDomination")) {
    console.log(`>>> DOMINATION confirmed at turn ${world.turn}`);
    break;
  }
  if (a === 0) {
    console.log(`>>> EXTINCT at turn ${world.turn}`);
    break;
  }
}
console.log(
  `END turn=${world.turn} alive=${aliveCount(world)} peak=${peak} trough=${trough}@t${troughTurn}`
);
