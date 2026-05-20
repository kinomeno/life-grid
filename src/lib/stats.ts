import type { StatsSample, World } from "./types";

export type WorldStats = {
  turn: number;
  lifeCount: number;
  speciesCount: number;
  averageEnergy: number;
  averageIntelligence: number;
  maxIntelligence: number;
  averageSpeed: number;
};

export function computeStats(world: World): WorldStats {
  const lives = world.lives;
  const n = lives.length;
  if (n === 0) {
    return {
      turn: world.turn,
      lifeCount: 0,
      speciesCount: 0,
      averageEnergy: 0,
      averageIntelligence: 0,
      maxIntelligence: 0,
      averageSpeed: 0,
    };
  }

  let energySum = 0;
  let intSum = 0;
  let intMax = -Infinity;
  let speedSum = 0;
  const speciesSet = new Set<string>();

  for (let i = 0; i < n; i++) {
    const l = lives[i];
    if (!l.alive) continue;
    energySum += l.energy;
    intSum += l.genes.intelligence;
    if (l.genes.intelligence > intMax) intMax = l.genes.intelligence;
    speedSum += l.genes.speed;
    speciesSet.add(l.speciesId);
  }

  return {
    turn: world.turn,
    lifeCount: n,
    speciesCount: speciesSet.size,
    averageEnergy: energySum / n,
    averageIntelligence: intSum / n,
    maxIntelligence: intMax === -Infinity ? 0 : intMax,
    averageSpeed: speedSum / n,
  };
}

/** 統計グラフ用のサンプルを生成。 */
export function makeStatsSample(world: World): StatsSample {
  const lives = world.lives;
  let aliveCount = 0;
  let intSum = 0;
  let speedSum = 0;
  let strSum = 0;
  let lifespanSum = 0;
  let reproSum = 0;
  let sizeSum = 0;
  let visionSum = 0;
  let offspringSum = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  const speciesSet = new Set<string>();
  for (const l of lives) {
    if (!l.alive) continue;
    aliveCount++;
    intSum += l.genes.intelligence;
    speedSum += l.genes.speed;
    strSum += l.genes.strength;
    lifespanSum += l.genes.lifespan;
    reproSum += l.genes.reproductionRate;
    sizeSum += l.genes.size;
    visionSum += l.genes.vision;
    offspringSum += l.genes.offspringCount;
    rSum += l.genes.r;
    gSum += l.genes.g;
    bSum += l.genes.b;
    speciesSet.add(l.speciesId);
  }
  if (aliveCount === 0) {
    return {
      turn: world.turn,
      lifeCount: 0,
      speciesCount: 0,
      averageIntelligence: 0,
      averageSpeed: 0,
      averageStrength: 0,
      averageLifespan: 0,
      averageReproductionRate: 0,
      averageSize: 0,
      averageVision: 0,
      averageOffspringCount: 0,
      avgR: 0,
      avgG: 0,
      avgB: 0,
    };
  }
  return {
    turn: world.turn,
    lifeCount: aliveCount,
    speciesCount: speciesSet.size,
    averageIntelligence: intSum / aliveCount,
    averageSpeed: speedSum / aliveCount,
    averageStrength: strSum / aliveCount,
    averageLifespan: lifespanSum / aliveCount,
    averageReproductionRate: reproSum / aliveCount,
    averageSize: sizeSum / aliveCount,
    averageVision: visionSum / aliveCount,
    averageOffspringCount: offspringSum / aliveCount,
    avgR: rSum / aliveCount,
    avgG: gSum / aliveCount,
    avgB: bSum / aliveCount,
  };
}
