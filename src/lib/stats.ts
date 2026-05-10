import type { World } from "./types";

export type WorldStats = {
  turn: number;
  lifeCount: number;
  speciesCount: number;
  averageEnergy: number;
  averageIntelligence: number;
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
      averageSpeed: 0,
    };
  }

  let energySum = 0;
  let intSum = 0;
  let speedSum = 0;
  const speciesSet = new Set<string>();

  for (let i = 0; i < n; i++) {
    const l = lives[i];
    energySum += l.energy;
    intSum += l.genes.intelligence;
    speedSum += l.genes.speed;
    speciesSet.add(l.speciesId);
  }

  return {
    turn: world.turn,
    lifeCount: n,
    speciesCount: speciesSet.size,
    averageEnergy: energySum / n,
    averageIntelligence: intSum / n,
    averageSpeed: speedSum / n,
  };
}
