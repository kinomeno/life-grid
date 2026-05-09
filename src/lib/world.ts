import {
  ABSORB_RATE,
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

export function stepWorld(world: World): void {
  updateEnergy(world);
  const order = shuffledIndices(world.lives.length, world.turn);
  for (const i of order) {
    const life = world.lives[i];
    if (!life.alive) continue;
    actLife(world, life);
  }
  cullDead(world);
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
  const { width, height, energy, turn } = world;
  const wavePhase = (turn / ENERGY_WAVE_PERIOD_TURNS) * Math.PI * 2;
  const next = new Float32Array(energy.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const cur = energy[idx];

      let neighborSum = 0;
      let neighborCount = 0;
      if (x > 0) {
        neighborSum += energy[idx - 1];
        neighborCount++;
      }
      if (x < width - 1) {
        neighborSum += energy[idx + 1];
        neighborCount++;
      }
      if (y > 0) {
        neighborSum += energy[idx - width];
        neighborCount++;
      }
      if (y < height - 1) {
        neighborSum += energy[idx + width];
        neighborCount++;
      }
      const avgNeighbor = neighborCount > 0 ? neighborSum / neighborCount : cur;
      const diffused = cur + (avgNeighbor - cur) * ENERGY_DIFFUSION;

      const wave =
        Math.sin(x * ENERGY_WAVE_SPATIAL_FREQ + wavePhase) *
        Math.cos(y * ENERGY_WAVE_SPATIAL_FREQ - wavePhase * 0.7) *
        ENERGY_WAVE_AMPLITUDE *
        0.02;

      const regen = ENERGY_REGEN_PER_TURN + wave;
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
    const dx = Math.sign(target.x - life.x);
    const dy = Math.sign(target.y - life.y);
    let nx = life.x;
    let ny = life.y;
    if (dx !== 0 && dy !== 0) {
      if (Math.abs(target.x - life.x) >= Math.abs(target.y - life.y)) {
        nx = life.x + dx;
      } else {
        ny = life.y + dy;
      }
    } else {
      nx = life.x + dx;
      ny = life.y + dy;
    }
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) break;
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
      const nx = life.x + dx;
      const ny = life.y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > depth) continue;
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
