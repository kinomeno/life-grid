/**
 * v1.01 バランステスト API（開発用）
 *
 * 使い方：
 *   curl 'http://localhost:3000/api/test-balance?seed=12345&turns=1000&w=100&n=100'
 *
 * 戻り値（JSON）:
 *   seed, turns, alive, species_count, era,
 *   strength: {avg, min, max, p50, p90, p99, over100, over200, over300},
 *   intelligence: 同上,
 *   birthThreshold: 同上 (lt50, gt150, gt250),
 *   recent_deaths: 最近死んだ個体のサンプル（強さの値だけ）
 */

import { NextRequest, NextResponse } from "next/server";
import { createWorld, currentEra, defaultSimulationParams, getBehaviorMode, stepWorld } from "@/lib/world";

function pct(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function stats(values: number[]) {
  if (values.length === 0) {
    return { n: 0, avg: 0, min: 0, max: 0, p50: 0, p90: 0, p99: 0 };
  }
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    n: values.length,
    avg: Number((sum / values.length).toFixed(2)),
    min: Number(Math.min(...values).toFixed(2)),
    max: Number(Math.max(...values).toFixed(2)),
    p50: Number(pct(values, 50).toFixed(2)),
    p90: Number(pct(values, 90).toFixed(2)),
    p99: Number(pct(values, 99).toFixed(2)),
  };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const seed = Number(sp.get("seed") ?? 12345);
  const turns = Math.min(20000, Math.max(1, Number(sp.get("turns") ?? 1000)));
  const w = Math.min(200, Math.max(10, Number(sp.get("w") ?? 100)));
  const n = Math.min(1000, Math.max(1, Number(sp.get("n") ?? 100)));
  // v1.20: totalEnergy をクエリで検証可能に（マップサイズ別デフォルトの調整用）
  const te = Math.min(3, Math.max(0.1, Number(sp.get("te") ?? 1.2)));

  const world = createWorld({
    width: w,
    height: w,
    initialLifeCount: n,
    seed,
    params: { ...defaultSimulationParams(), totalEnergy: te },
  });

  // 進化を進める
  for (let i = 0; i < turns; i++) {
    stepWorld(world);
  }

  const alive = world.lives.filter((l) => l.alive);
  const strengths = alive.map((l) => l.genes.strength);
  const intelligences = alive.map((l) => l.genes.intelligence);
  const visions = alive.map((l) => l.genes.vision);
  const speeds = alive.map((l) => l.genes.speed);
  const sizes = alive.map((l) => l.genes.size);
  const birthThresholds = alive.map((l) => l.genes.birthThreshold);
  // v1.11b: 観察のため追加
  const offspringCounts = alive.map((l) => l.genes.offspringCount);
  const lifespans = alive.map((l) => l.genes.lifespan);
  const ages = alive.map((l) => l.age);
  const energies = alive.map((l) => l.energy);

  // 死亡個体のサンプル（直近 100 を最大）
  const dead = world.lives
    .filter((l) => !l.alive)
    .slice(-100)
    .map((l) => ({
      s: l.genes.strength,
      i: l.genes.intelligence,
      r: Number(l.genes.birthThreshold.toFixed(0)),
      age: l.age,
    }));
  const deadStrengths = dead.map((d) => d.s);

  return NextResponse.json({
    config: { seed, turns: world.turn, world: `${w}x${w}`, initialN: n },
    alive: alive.length,
    speciesCount: new Set(alive.map((l) => l.speciesId)).size,
    era: currentEra(world).name,
    strength: {
      ...stats(strengths),
      over100: strengths.filter((s) => s > 100).length,
      over200: strengths.filter((s) => s > 200).length,
      over300: strengths.filter((s) => s > 300).length,
      over500: strengths.filter((s) => s > 500).length,
    },
    intelligence: {
      ...stats(intelligences),
      over100: intelligences.filter((s) => s > 100).length,
      over200: intelligences.filter((s) => s > 200).length,
      over300: intelligences.filter((s) => s > 300).length,
    },
    vision: stats(visions),
    speed: stats(speeds),
    size: stats(sizes),
    birthThreshold: {
      ...stats(birthThresholds),
      lt50: birthThresholds.filter((b) => b < 50).length,
      gt150: birthThresholds.filter((b) => b > 150).length,
      gt250: birthThresholds.filter((b) => b > 250).length,
    },
    // v1.11b: 出産数（機能確認用）
    offspringCount: {
      ...stats(offspringCounts),
      eq1: offspringCounts.filter((c) => c === 1).length,
      ge3: offspringCounts.filter((c) => c >= 3).length,
      ge5: offspringCounts.filter((c) => c >= 5).length,
      ge8: offspringCounts.filter((c) => c >= 8).length,
    },
    lifespan: stats(lifespans),
    age: stats(ages),
    energy: stats(energies),
    deadSample: {
      n: dead.length,
      maxStrength: deadStrengths.length ? Math.max(...deadStrengths) : 0,
      avgAge:
        dead.length > 0
          ? Number(
              (dead.reduce((s, d) => s + d.age, 0) / dead.length).toFixed(1)
            )
          : 0,
    },
    // v1.10: 重み遺伝子の統計
    weights: {
      appetite: stats(alive.map((l) => l.genes.wAppetite)),
      predation: stats(alive.map((l) => l.genes.wPredation)),
      caution: stats(alive.map((l) => l.genes.wCaution)),
      gregarious: stats(alive.map((l) => l.genes.wGregarious)),
      loyalty: stats(alive.map((l) => l.genes.wLoyalty)),
      repro: stats(alive.map((l) => l.genes.wRepro)),
      starvSensitive: stats(alive.map((l) => l.genes.wStarvSensitive)),
    },
    // v1.10: 性格タグの分布
    behaviorTags: (() => {
      const counts: Record<string, number> = {};
      for (const l of alive) {
        const tag = getBehaviorMode(world, l);
        counts[tag] = (counts[tag] || 0) + 1;
      }
      return counts;
    })(),
  });
}
