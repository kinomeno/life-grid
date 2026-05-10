import {
  ABSORB_RATE,
  COMBAT_ENERGY_LOSS_RATIO,
  COST_BASE,
  COST_INTELLIGENCE,
  COST_SIZE,
  COST_SPEED_PER_STEP,
  COST_STRENGTH,
  COST_VISION,
  ENERGY_DIFFUSION,
  ENERGY_INITIAL_MEAN,
  ENERGY_INITIAL_VARIANCE,
  ENERGY_MAX,
  ENERGY_REGEN_PER_TURN,
  ENERGY_WAVE_AMPLITUDE,
  ENERGY_WAVE_PERIOD_TURNS,
  ENERGY_WAVE_SPATIAL_FREQ,
  GENE_INTELLIGENCE_MAX,
  GENE_INTELLIGENCE_MIN,
  GENE_LIFESPAN_MAX,
  GENE_LIFESPAN_MIN,
  GENE_MUTATION_MAX,
  GENE_MUTATION_MIN,
  GENE_REPRODUCTION_MAX,
  GENE_REPRODUCTION_MIN,
  GENE_SIZE_MAX,
  GENE_SIZE_MIN,
  GENE_SPEED_MAX,
  GENE_SPEED_MIN,
  GENE_STRENGTH_MAX,
  GENE_STRENGTH_MIN,
  GENE_VISION_MAX,
  GENE_VISION_MIN,
  INITIAL_ENERGY_RATIO,
  MIN_REPRODUCTIVE_AGE_RATIO,
  REPRODUCTION_ENERGY_THRESHOLD_RATIO,
} from "./constants";
import { mulberry32, randomInt, randomRange, type RNG } from "./random";
import { speciesIdFromGenes } from "./species";
import type { Genes, Life, World, WorldConfig } from "./types";

export function createWorld(config: WorldConfig): World {
  const { width, height, initialLifeCount, seed } = config;
  const rng = mulberry32(seed);
  const total = width * height;

  const energy = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const v = ENERGY_INITIAL_MEAN + (rng() - 0.5) * 2 * ENERGY_INITIAL_VARIANCE;
    energy[i] = clamp(v, 0, ENERGY_MAX) * INITIAL_ENERGY_RATIO + 5;
  }

  const terrainBias = createTerrainBias(width, height, rng);
  const waveTimeScale = createWaveTimeScale(width, height, rng);

  const occupancy = new Int32Array(total).fill(-1);
  const lives: Life[] = [];

  let nextId = 0;
  let attempts = 0;
  while (lives.length < initialLifeCount && attempts < initialLifeCount * 20) {
    attempts++;
    const x = randomInt(rng, 0, width);
    const y = randomInt(rng, 0, height);
    const idx = y * width + x;
    if (occupancy[idx] !== -1) continue;
    const genes = randomGenes(rng);
    const life: Life = {
      id: nextId++,
      x,
      y,
      energy: genes.size * 0.5,
      age: 0,
      speciesId: speciesIdFromGenes(genes),
      genes,
      alive: true,
    };
    lives.push(life);
    occupancy[idx] = life.id;
  }

  return {
    width,
    height,
    turn: 0,
    seed,
    energy,
    occupancy,
    lives,
    nextLifeId: nextId,
    terrainBias,
    waveTimeScale,
  };
}

function randomGenes(rng: RNG): Genes {
  return {
    r: randomInt(rng, 0, 256),
    g: randomInt(rng, 0, 256),
    b: randomInt(rng, 0, 256),
    vision: randomInt(rng, GENE_VISION_MIN, GENE_VISION_MAX + 1),
    speed: randomInt(rng, GENE_SPEED_MIN, GENE_SPEED_MAX + 1),
    size: randomRange(rng, GENE_SIZE_MIN, GENE_SIZE_MAX),
    strength: randomRange(rng, GENE_STRENGTH_MIN, GENE_STRENGTH_MAX),
    intelligence: randomInt(rng, GENE_INTELLIGENCE_MIN, GENE_INTELLIGENCE_MAX + 1),
    reproductionRate: randomRange(rng, GENE_REPRODUCTION_MIN, GENE_REPRODUCTION_MAX),
    mutationRate: randomRange(rng, GENE_MUTATION_MIN, GENE_MUTATION_MAX),
    lifespan: randomRange(rng, GENE_LIFESPAN_MIN, GENE_LIFESPAN_MAX),
  };
}

export function mutatGenes(parentGenes: Genes, mutationRate: number, rng: RNG): Genes {
  const genes = { ...parentGenes };
  const mutate = (gene: number, min: number, max: number): number => {
    if (rng() < mutationRate) {
      const variation = (rng() - 0.5) * 2 * (max - min) * 0.3;
      return clamp(gene + variation, min, max);
    }
    return gene;
  };
  genes.r = Math.round(mutate(genes.r, 0, 255));
  genes.g = Math.round(mutate(genes.g, 0, 255));
  genes.b = Math.round(mutate(genes.b, 0, 255));
  genes.vision = Math.round(mutate(genes.vision, GENE_VISION_MIN, GENE_VISION_MAX));
  genes.speed = Math.round(mutate(genes.speed, GENE_SPEED_MIN, GENE_SPEED_MAX));
  genes.size = mutate(genes.size, GENE_SIZE_MIN, GENE_SIZE_MAX);
  genes.strength = mutate(genes.strength, GENE_STRENGTH_MIN, GENE_STRENGTH_MAX);
  genes.intelligence = Math.round(mutate(genes.intelligence, GENE_INTELLIGENCE_MIN, GENE_INTELLIGENCE_MAX));
  genes.reproductionRate = mutate(genes.reproductionRate, GENE_REPRODUCTION_MIN, GENE_REPRODUCTION_MAX);
  genes.mutationRate = mutate(genes.mutationRate, GENE_MUTATION_MIN, GENE_MUTATION_MAX);
  genes.lifespan = mutate(genes.lifespan, GENE_LIFESPAN_MIN, GENE_LIFESPAN_MAX);
  return genes;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function wrapDelta(d: number, size: number): number {
  const half = size / 2;
  if (d > half) return d - size;
  if (d < -half) return d + size;
  return d;
}

function createTerrainBias(
  width: number,
  height: number,
  rng: RNG
): Float32Array {
  const map = new Float32Array(width * height);
  const ph1x = rng() * Math.PI * 2;
  const ph1y = rng() * Math.PI * 2;
  const ph2x = rng() * Math.PI * 2;
  const ph2y = rng() * Math.PI * 2;
  const ph3x = rng() * Math.PI * 2;
  const ph3y = rng() * Math.PI * 2;
  const f1 = 0.04 + rng() * 0.02;
  const f2 = 0.11 + rng() * 0.04;
  const f3 = 0.23 + rng() * 0.06;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v =
        Math.sin(x * f1 + ph1x) * Math.cos(y * f1 + ph1y) * 0.55 +
        Math.sin(x * f2 + ph2x) * Math.sin(y * f2 + ph2y) * 0.3 +
        Math.cos(x * f3 + ph3x) * Math.sin(y * f3 + ph3y) * 0.15;
      map[y * width + x] = v;
    }
  }
  return map;
}

function createWaveTimeScale(
  width: number,
  height: number,
  rng: RNG
): Float32Array {
  const map = new Float32Array(width * height);
  const phx = rng() * Math.PI * 2;
  const phy = rng() * Math.PI * 2;
  const f = 0.03 + rng() * 0.02;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.sin(x * f + phx) * Math.cos(y * f + phy);
      map[y * width + x] = 0.3 + (v + 1) * 0.5;
    }
  }
  return map;
}

export function stepWorld(world: World): void {
  updateEnergy(world);
  const order = shuffledIndices(world.lives.length, world.turn);
  for (const i of order) {
    const life = world.lives[i];
    if (!life.alive) continue;
    actLife(world, life);
  }
  if (world.turn % 15 === 0) {
    cullDead(world);
  }
  world.turn++;
}

function shuffledIndices(n: number, seed: number): Int32Array {
  const arr = new Int32Array(n);
  for (let i = 0; i < n; i++) arr[i] = i;
  const rng = mulberry32((seed * 2654435761) >>> 0);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function updateEnergy(world: World): void {
  const { width, height, energy, turn, terrainBias, waveTimeScale } = world;
  const next = new Float32Array(energy.length);

  const phaseBase = (turn / 2000) * Math.PI * 2;

  for (let y = 0; y < height; y++) {
    const ym = (y - 1 + height) % height;
    const yp = (y + 1) % height;
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const xm = (x - 1 + width) % width;
      const xp = (x + 1) % width;
      const cur = energy[idx];

      const neighborSum =
        energy[y * width + xm] +
        energy[y * width + xp] +
        energy[ym * width + x] +
        energy[yp * width + x];
      const avgNeighbor = neighborSum * 0.25;
      const diffused = cur + (avgNeighbor - cur) * ENERGY_DIFFUSION;

      const tScale = waveTimeScale[idx];
      const phase = phaseBase * tScale;

      const wave =
        Math.sin(x * ENERGY_WAVE_SPATIAL_FREQ + phase) *
        Math.cos(y * ENERGY_WAVE_SPATIAL_FREQ - phase * 0.7) *
        ENERGY_WAVE_AMPLITUDE *
        0.025;

      const bias = terrainBias[idx];
      const regen = ENERGY_REGEN_PER_TURN * (1 + bias * 0.6) + wave;
      let v = diffused + regen;
      if (v < 0) v = 0;
      if (v > ENERGY_MAX) v = ENERGY_MAX;
      next[idx] = v;
    }
  }
  energy.set(next);
}

function actLife(world: World, life: Life): void {
  const { width, height, energy, occupancy } = world;
  const g = life.genes;

  const target = findBestNeighborCell(world, life);
  let steps = 0;
  while (steps < g.speed) {
    if (life.x === target.x && life.y === target.y) break;
    const dxRaw = wrapDelta(target.x - life.x, width);
    const dyRaw = wrapDelta(target.y - life.y, height);
    const dx = Math.sign(dxRaw);
    const dy = Math.sign(dyRaw);
    let nx = life.x;
    let ny = life.y;
    if (dx !== 0 && dy !== 0) {
      if (Math.abs(dxRaw) >= Math.abs(dyRaw)) {
        nx = life.x + dx;
      } else {
        ny = life.y + dy;
      }
    } else {
      nx = life.x + dx;
      ny = life.y + dy;
    }
    nx = (nx + width) % width;
    ny = (ny + height) % height;
    const newIdx = ny * width + nx;
    if (occupancy[newIdx] !== -1) break;
    const oldIdx = life.y * width + life.x;
    occupancy[oldIdx] = -1;
    occupancy[newIdx] = life.id;
    life.x = nx;
    life.y = ny;
    steps++;
    life.energy -= COST_SPEED_PER_STEP;
  }

  const idx = life.y * width + life.x;

  if (life.alive) {
    handleCombat(world, life);
  }

  const available = energy[idx];
  const capacity = g.size - life.energy;
  const absorb = Math.max(0, Math.min(available * ABSORB_RATE, capacity));
  energy[idx] = available - absorb;
  life.energy += absorb;

  const upkeep =
    COST_BASE +
    COST_VISION * g.vision +
    COST_INTELLIGENCE * g.intelligence +
    COST_STRENGTH * (g.strength * 0.1) +
    COST_SIZE * g.size;
  life.energy -= upkeep;

  life.age++;

  if (life.energy <= 0) {
    life.alive = false;
    life.energy = 0;
    energy[idx] = Math.min(ENERGY_MAX, energy[idx] + g.size * 0.3);
    occupancy[idx] = -1;
  }

  if (life.age >= g.lifespan) {
    life.alive = false;
    energy[idx] = Math.min(ENERGY_MAX, energy[idx] + g.size * 0.3);
    occupancy[idx] = -1;
  }

  if (life.alive && shouldReproduce(life, world)) {
    const emptyNeighbor = findEmptyNeighbor(world, life);
    if (emptyNeighbor) {
      reproduceLife(world, life, emptyNeighbor);
    }
  }
}

function findBestNeighborCell(
  world: World,
  life: Life
): { x: number; y: number } {
  const { width, height, energy, occupancy } = world;
  const g = life.genes;
  const range = g.vision;
  const depth = Math.max(1, range + g.intelligence);

  let bestX = life.x;
  let bestY = life.y;
  let bestScore = -Infinity;

  for (let dy = -depth; dy <= depth; dy++) {
    for (let dx = -depth; dx <= depth; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > depth) continue;
      const nx = (life.x + dx + width) % width;
      const ny = (life.y + dy + height) % height;
      const idx = ny * width + nx;
      if (occupancy[idx] !== -1 && (dx !== 0 || dy !== 0)) continue;
      const e = energy[idx];
      const score = e - dist * 0.5;
      if (score > bestScore) {
        bestScore = score;
        bestX = nx;
        bestY = ny;
      }
    }
  }
  return { x: bestX, y: bestY };
}

function cullDead(world: World): void {
  if (world.lives.some((l) => !l.alive)) {
    world.lives = world.lives.filter((l) => l.alive);
  }
}

function findLifeById(world: World, id: number): Life | null {
  return world.lives.find((l) => l.id === id) || null;
}

function shouldReproduce(life: Life, world: World): boolean {
  const minAge = life.genes.lifespan * MIN_REPRODUCTIVE_AGE_RATIO;
  const reproThreshold = life.genes.size * REPRODUCTION_ENERGY_THRESHOLD_RATIO;
  return life.age >= minAge && life.energy >= reproThreshold;
}

function findEmptyNeighbor(
  world: World,
  life: Life
): { x: number; y: number } | null {
  const { width, height, occupancy } = world;
  const { x, y } = life;
  const offsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1],
  ];
  for (const [dx, dy] of offsets) {
    const nx = (x + dx + width) % width;
    const ny = (y + dy + height) % height;
    const idx = ny * width + nx;
    if (occupancy[idx] === -1) {
      return { x: nx, y: ny };
    }
  }
  return null;
}

function reproduceLife(
  world: World,
  parent: Life,
  childPos: { x: number; y: number }
): void {
  const rng = mulberry32((world.turn * 73856093) ^ (parent.id * 19349663) >>> 0);
  const childGenes = mutatGenes(parent.genes, parent.genes.mutationRate, rng);
  const splitEnergy = parent.energy * 0.5;
  parent.energy = splitEnergy;

  const idx = childPos.y * world.width + childPos.x;
  const childLife: Life = {
    id: world.nextLifeId++,
    x: childPos.x,
    y: childPos.y,
    energy: splitEnergy,
    age: 0,
    speciesId: speciesIdFromGenes(childGenes),
    genes: childGenes,
    alive: true,
  };
  world.lives.push(childLife);
  world.occupancy[idx] = childLife.id;
}

function handleCombat(world: World, life: Life): void {
  const { width, height, occupancy, energy } = world;
  const { x, y } = life;
  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1],
  ];

  for (const [dx, dy] of neighbors) {
    const nx = (x + dx + width) % width;
    const ny = (y + dy + height) % height;
    const nidx = ny * width + nx;
    if (occupancy[nidx] === -1) continue;

    const opponent = findLifeById(world, occupancy[nidx]);
    if (!opponent || !opponent.alive) continue;

    if (life.genes.strength > opponent.genes.strength) {
      const lootEnergy = opponent.energy * COMBAT_ENERGY_LOSS_RATIO;
      life.energy += lootEnergy;
      opponent.alive = false;
      opponent.energy = 0;
      energy[nidx] = Math.min(
        ENERGY_MAX,
        energy[nidx] + opponent.genes.size * 0.3
      );
      occupancy[nidx] = -1;
      break;
    }
  }
}
