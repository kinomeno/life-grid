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
  ENERGY_WAVE_SPATIAL_FREQ,
  FIXED_GENE_VALUES,
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
import { speciesIdFromGenes, speciesLabel } from "./species";
import { makeStatsSample } from "./stats";
import type {
  DisabledGeneFlags,
  Genes,
  Life,
  SimulationParams,
  World,
  WorldConfig,
  WorldEvent,
} from "./types";

const MAX_EVENTS = 200;
const HISTORY_SAMPLE_INTERVAL = 50;
const MAX_HISTORY = 240;

export function defaultSimulationParams(): SimulationParams {
  return {
    // 初期はやや楽な世界に：初心者が「すぐ全滅」を経験しないように
    // 確率戦闘 + size 防御で戦闘成功率が下がり食料獲得が減るため 1.20 に増量。
    totalEnergy: 1.2,
    mutationRateMultiplier: 1.0,
    waveSpeed: 1.0,
    combatAdvantage: COMBAT_ENERGY_LOSS_RATIO,
    disabledGenes: defaultDisabledGenes(),
    newsEnabled: true,
  };
}

export function defaultDisabledGenes(): DisabledGeneFlags {
  return {
    rgb: false,
    vision: false,
    speed: false,
    size: false,
    strength: false,
    intelligence: false,
    reproductionRate: false,
    mutationRate: false,
    lifespan: false,
  };
}

/**
 * 稼働遺伝子フラグに従って、無効化された遺伝子を固定値で上書きする。
 * 子個体生成時・初期世代生成時に呼び出される。
 */
export function applyDisabledGenes(
  genes: Genes,
  disabled: DisabledGeneFlags
): Genes {
  const out = { ...genes };
  if (disabled.rgb) {
    out.r = FIXED_GENE_VALUES.r;
    out.g = FIXED_GENE_VALUES.g;
    out.b = FIXED_GENE_VALUES.b;
  }
  if (disabled.vision) out.vision = FIXED_GENE_VALUES.vision;
  if (disabled.speed) out.speed = FIXED_GENE_VALUES.speed;
  if (disabled.size) out.size = FIXED_GENE_VALUES.size;
  if (disabled.strength) out.strength = FIXED_GENE_VALUES.strength;
  if (disabled.intelligence) out.intelligence = FIXED_GENE_VALUES.intelligence;
  if (disabled.reproductionRate)
    out.reproductionRate = FIXED_GENE_VALUES.reproductionRate;
  if (disabled.mutationRate) out.mutationRate = FIXED_GENE_VALUES.mutationRate;
  if (disabled.lifespan) out.lifespan = FIXED_GENE_VALUES.lifespan;
  return out;
}

export function createWorld(config: WorldConfig): World {
  const { width, height, initialLifeCount, seed, initialGenes } = config;
  const params = config.params ?? defaultSimulationParams();
  const rng = mulberry32(seed);
  const total = width * height;

  const energy = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const v = ENERGY_INITIAL_MEAN + (rng() - 0.5) * 2 * ENERGY_INITIAL_VARIANCE;
    energy[i] = clamp(v, 0, ENERGY_MAX) * INITIAL_ENERGY_RATIO + 5;
  }

  const terrainBias = createTerrainBias(width, height, rng);
  const waveTimeScale = createWaveTimeScale(width, height, rng);
  const wavePatternId = Math.floor(rng() * WAVE_PATTERN_COUNT);
  // シード値ベースの時代長（800〜1600ターン）。
  // 同じシードなら毎回同じ進行となる。
  const eraBaseDurationTurns = 800 + Math.floor(rng() * 800);

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
    // 初期遺伝子が指定されていれば全個体に同じ遺伝子をコピー（参照ではなくクローン）。
    let genes = initialGenes ? { ...initialGenes } : randomGenes(rng);
    // 稼働遺伝子フラグに従って無効化された遺伝子は固定値で上書き
    genes = applyDisabledGenes(genes, params.disabledGenes);
    const life: Life = {
      id: nextId++,
      x,
      y,
      prevX: x,
      prevY: y,
      energy: genes.size * 0.5,
      age: 0,
      speciesId: speciesIdFromGenes(genes),
      genes,
      alive: true,
      moveAccum: 0,
    };
    lives.push(life);
    occupancy[idx] = life.id;
  }

  // 初期生命の系統を knownSpecies に登録
  const knownSpecies = new Set<string>();
  const livesById = new Map<number, Life>();
  for (const life of lives) {
    knownSpecies.add(life.speciesId);
    livesById.set(life.id, life);
  }

  // updateEnergy 用バッファ（毎フレームのアロケーション回避）
  const energyNext = new Float32Array(total);

  return {
    width,
    height,
    turn: 0,
    seed,
    energy,
    energyNext,
    occupancy,
    lives,
    livesById,
    nextLifeId: nextId,
    terrainBias,
    waveTimeScale,
    wavePatternId,
    eraBaseDurationTurns,
    eraTime: 0,
    knownSpecies,
    prevSpeciesCounts: new Map(),
    prevEraIndex: 0,
    events: [],
    history: [],
    maxObservedAge: 0,
    prevTopSpeciesId: null,
    totalExtinctionLogged: false,
    milestonesFired: new Set<number>(),
    peakLifeCount: lives.length,
    lastMassExtinctionTurn: -10000,
    predatorRiseLogged: new Set<string>(),
    intelligentRiseLogged: new Set<string>(),
    // 最初の天変地異は早めの 600〜1200 ターン（シードで決定）。
    nextCataclysmTurn: 600 + Math.floor(rng() * 600),
    activeCataclysm: null,
    birthFlashes: [],
    combatFlashes: [],
    params,
  };
}

const WAVE_PATTERN_COUNT = 6;

/** 6種類の波パターン。time-phase は呼び出し側で計算済み。 */
function wavePattern(
  id: number,
  x: number,
  y: number,
  phase: number,
  SF: number
): number {
  switch (id) {
    case 0:
      // 古典的な可分波
      return Math.sin(x * SF + phase) * Math.cos(y * SF - phase * 0.7);
    case 1:
      // 加算型 - 縞状
      return (Math.sin(x * SF + phase) + Math.cos(y * SF - phase * 0.7)) * 0.5;
    case 2:
      // 斜め進行波
      return Math.sin((x + y) * SF * 0.7 + phase) * 0.85;
    case 3:
      // 多層干渉
      return (
        Math.sin(x * SF + phase) * Math.cos(y * SF - phase * 0.7) * 0.6 +
        Math.sin(x * SF * 1.7 - phase * 0.5) *
          Math.cos(y * SF * 1.3 + phase * 0.4) * 0.4
      );
    case 4:
      // 異方性ストレッチ
      return (
        Math.sin(x * SF * 1.4 + phase) *
        Math.sin(y * SF * 0.6 - phase * 0.5)
      );
    case 5:
      // 斜め + 逆斜めクロス
      return (
        Math.sin((x + y) * SF * 0.5 + phase) * 0.5 +
        Math.cos((x - y) * SF * 0.5 - phase * 0.6) * 0.5
      );
    default:
      return Math.sin(x * SF + phase) * Math.cos(y * SF - phase * 0.7);
  }
}

function randomGenes(rng: RNG): Genes {
  return {
    r: randomInt(rng, 0, 256),
    g: randomInt(rng, 0, 256),
    b: randomInt(rng, 0, 256),
    vision: randomInt(rng, GENE_VISION_MIN, GENE_VISION_MAX + 1),
    speed: randomInt(rng, GENE_SPEED_MIN, GENE_SPEED_MAX + 1),
    size: randomRange(rng, GENE_SIZE_MIN, GENE_SIZE_MAX),
    // 強さは整数 1〜100
    strength: randomInt(rng, GENE_STRENGTH_MIN, GENE_STRENGTH_MAX + 1),
    intelligence: randomInt(rng, GENE_INTELLIGENCE_MIN, GENE_INTELLIGENCE_MAX + 1),
    reproductionRate: randomRange(rng, GENE_REPRODUCTION_MIN, GENE_REPRODUCTION_MAX),
    mutationRate: randomRange(rng, GENE_MUTATION_MIN, GENE_MUTATION_MAX),
    lifespan: randomRange(rng, GENE_LIFESPAN_MIN, GENE_LIFESPAN_MAX),
  };
}

export function mutatGenes(parentGenes: Genes, mutationRate: number, rng: RNG): Genes {
  const genes = { ...parentGenes };
  // factor は変動幅 = (max-min) * factor。既定 0.3 = 範囲の 30% まで変動。
  const mutate = (
    gene: number,
    min: number,
    max: number,
    factor = 0.3
  ): number => {
    if (rng() < mutationRate) {
      const variation = (rng() - 0.5) * 2 * (max - min) * factor;
      return clamp(gene + variation, min, max);
    }
    return gene;
  };
  genes.r = Math.round(mutate(genes.r, 0, 255));
  genes.g = Math.round(mutate(genes.g, 0, 255));
  genes.b = Math.round(mutate(genes.b, 0, 255));
  genes.vision = Math.round(mutate(genes.vision, GENE_VISION_MIN, GENE_VISION_MAX));
  // 速度（1〜100）：知能と同様に小刻みな変動（±3）にする
  genes.speed = Math.round(
    mutate(genes.speed, GENE_SPEED_MIN, GENE_SPEED_MAX, 0.03)
  );
  genes.size = mutate(genes.size, GENE_SIZE_MIN, GENE_SIZE_MAX);
  // 強さ（1〜100）：細分化のため小刻みな変動（±3）にする
  genes.strength = Math.round(
    mutate(genes.strength, GENE_STRENGTH_MIN, GENE_STRENGTH_MAX, 0.03)
  );
  // 知能は連続スケール 0〜100 のため変動を細かく（factor 0.03 → ±3）
  genes.intelligence = Math.round(
    mutate(
      genes.intelligence,
      GENE_INTELLIGENCE_MIN,
      GENE_INTELLIGENCE_MAX,
      0.03
    )
  );
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
  // Two-octave noise for more variation in time scale per cell.
  const f1 = 0.03 + rng() * 0.02;
  const phx1 = rng() * Math.PI * 2;
  const phy1 = rng() * Math.PI * 2;
  const f2 = 0.08 + rng() * 0.04;
  const phx2 = rng() * Math.PI * 2;
  const phy2 = rng() * Math.PI * 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v1 = Math.sin(x * f1 + phx1) * Math.cos(y * f1 + phy1);
      const v2 = Math.sin(x * f2 + phx2) * Math.sin(y * f2 + phy2);
      const v = v1 * 0.7 + v2 * 0.3; // -1..1
      // map to range [0.2, 1.8] — wider than the previous [0.3, 1.3]
      // so neighboring cells can have visibly different oscillation rates.
      map[y * width + x] = 1.0 + v * 0.8;
    }
  }
  return map;
}


export function stepWorld(world: World): void {
  updateEnergy(world);
  // 天変地異の進行・発生処理
  updateCataclysm(world);
  // 描画スムージング用：このターン開始時点の位置を記録
  for (const life of world.lives) {
    if (!life.alive) continue;
    life.prevX = life.x;
    life.prevY = life.y;
  }
  const order = shuffledIndices(world.lives.length, world.turn);
  for (const i of order) {
    const life = world.lives[i];
    if (!life.alive) continue;
    actLife(world, life);
  }
  if (world.turn % 15 === 0) {
    cullDead(world);
  }
  // 時代進行は固定速度。時代名の切替は内部スケジュールに任せる。
  world.eraTime += 1;

  // 系統数のスナップショットを取り、誕生・絶滅イベントを発行
  detectSpeciesEvents(world);

  // 紀元変化のイベント発行
  const era = currentEra(world);
  if (era.index !== world.prevEraIndex) {
    pushEvent(world, {
      turn: world.turn,
      type: "epoch",
      message: {
        ja: `${era.name} に突入 — ${era.environment.name}`,
        en: `Entered ${eraNameEn(era.index)} — ${era.environment.nameEn}`,
      },
    });
    world.prevEraIndex = era.index;
  }

  // ユニークな世界史イベント検出
  detectUniqueEvents(world);

  // 履歴サンプルを記録
  if (world.turn % HISTORY_SAMPLE_INTERVAL === 0) {
    world.history.push(makeStatsSample(world));
    if (world.history.length > MAX_HISTORY) {
      // 古いものを2:1に間引きして長期トレンドを保持
      world.history = world.history.filter((_, i) => i % 2 === 0);
    }
  }

  world.turn++;
}

const LONGEVITY_BUCKETS = [200, 400, 600, 800, 1000, 1500, 2000, 3000];
const TURN_MILESTONES = [500, 1000, 2000, 5000, 10000, 20000];

/**
 * 天変地異の発生と進行を処理する。
 *  - 隕石（meteor）: 中心半径内のエネルギーを焦土化、生命にダメージ。
 *  - 旱魃（drought）: エリアのエネルギーが緩やかに減衰。
 *  - 開花（bloom）  : エリアのエネルギーが過剰に上昇（恵みの一時期）。
 * 仕様：
 *  - 1500〜3500ターン間隔（シードベース）でランダム発生。
 *  - メイン画面で activeCataclysm 情報を参照してエフェクト表示。
 */
function updateCataclysm(world: World): void {
  // 進行中ならエフェクト適用
  if (world.activeCataclysm) {
    const c = world.activeCataclysm;
    const elapsed = world.turn - c.startTurn;
    if (elapsed >= c.durationTurns) {
      world.activeCataclysm = null;
    } else {
      applyCataclysmEffect(world, c, elapsed);
      return;
    }
  }

  // 発生判定
  if (world.turn < world.nextCataclysmTurn) return;

  // 種別をランダムに決定（隕石を主、他を稀に）
  const r = (world.turn * 9301 + 49297) % 233280; // 簡易擬似乱数
  const dice = r / 233280;
  let type: "meteor" | "drought" | "bloom";
  if (dice < 0.55) type = "meteor";
  else if (dice < 0.85) type = "drought";
  else type = "bloom";

  const cx = Math.floor((world.turn * 1664525 + 1013904223) % world.width);
  const cy = Math.floor(
    ((world.turn + 7) * 22695477 + 1) % world.height
  );
  const radius = Math.max(
    3,
    Math.floor(Math.min(world.width, world.height) * 0.18)
  );
  const duration = type === "meteor" ? 8 : type === "drought" ? 80 : 60;

  world.activeCataclysm = {
    type,
    centerX: Math.abs(cx) % world.width,
    centerY: Math.abs(cy) % world.height,
    radius,
    startTurn: world.turn,
    durationTurns: duration,
  };

  const labelJa =
    type === "meteor"
      ? "隕石衝突"
      : type === "drought"
        ? "旱魃"
        : "大開花";
  const labelEn =
    type === "meteor"
      ? "Meteor impact"
      : type === "drought"
        ? "Drought"
        : "Great bloom";
  pushEvent(world, {
    turn: world.turn,
    type: "cataclysm",
    message: {
      ja: `天変地異 — ${labelJa}（中心: ${cx}, ${cy} / 半径 ${radius}）`,
      en: `Cataclysm — ${labelEn} (center: ${cx}, ${cy} / radius ${radius})`,
    },
  });

  // 次の発生は 1500〜3500 ターン後
  const interval = 1500 + Math.floor(Math.abs(Math.sin(world.turn) * 2000));
  world.nextCataclysmTurn = world.turn + interval;
}

function applyCataclysmEffect(
  world: World,
  c: NonNullable<World["activeCataclysm"]>,
  elapsed: number
): void {
  const { width, height, energy, occupancy } = world;
  const { type, centerX, centerY, radius } = c;
  const r2 = radius * radius;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const x = (centerX + dx + width) % width;
      const y = (centerY + dy + height) % height;
      const idx = y * width + x;
      // 距離係数（中心ほど効果大）
      const falloff = 1 - Math.sqrt(d2) / radius;

      if (type === "meteor") {
        if (elapsed === 0) {
          // 衝突瞬間：エネルギーを焦土化し、影響範囲内の生命はほぼ即死
          energy[idx] = Math.max(0, energy[idx] - 80 * falloff);
          const lid = occupancy[idx];
          if (lid !== -1) {
            const life = world.livesById.get(lid);
            if (life && life.alive) {
              if (life.protected) {
                // 保護中：天変地異も無効
              } else if (falloff > 0.15) {
                // 影響範囲内：即死（中心ほど確実）
                life.alive = false;
                life.energy = 0;
                occupancy[idx] = -1;
              } else {
                // 縁の縁：軽傷
                life.energy -= 30 * falloff;
              }
            }
          }
        } else {
          // 余波：軽い焦土化
          energy[idx] = Math.max(0, energy[idx] - 0.5 * falloff);
        }
      } else if (type === "drought") {
        // 緩やかな減衰
        energy[idx] = Math.max(0, energy[idx] - 0.15 * falloff);
      } else if (type === "bloom") {
        // 緩やかな上昇
        energy[idx] = Math.min(ENERGY_MAX, energy[idx] + 0.25 * falloff);
      }
    }
  }
}

function detectUniqueEvents(world: World): void {
  // 0. 全絶滅検出（生物数 0 への遷移）：1 回のみ発火
  let aliveCount = 0;
  for (const l of world.lives) if (l.alive) aliveCount++;
  if (aliveCount === 0 && !world.totalExtinctionLogged) {
    world.totalExtinctionLogged = true;
    pushEvent(world, {
      turn: world.turn,
      type: "totalExtinction",
      message: {
        ja: "すべてが絶滅しました。世界に生命はもう存在しません。",
        en: "All life is extinct. No species remains in the world.",
      },
    });
  } else if (aliveCount > 0 && world.totalExtinctionLogged) {
    // 何らかの理由で再び生命が出現した場合はフラグをリセット
    world.totalExtinctionLogged = false;
  }

  // 1. 最長寿命到達: 段階的バケットを跨ぐ最高齢を観測したとき
  let oldest: Life | null = null;
  for (const l of world.lives) {
    if (!l.alive) continue;
    if (oldest === null || l.age > oldest.age) oldest = l;
  }
  if (oldest !== null) {
    for (const bucket of LONGEVITY_BUCKETS) {
      if (oldest.age >= bucket && world.maxObservedAge < bucket) {
        pushEvent(world, {
          turn: world.turn,
          type: "longevity",
          speciesId: oldest.speciesId,
          rgb: { r: oldest.genes.r, g: oldest.genes.g, b: oldest.genes.b },
          message: {
            ja: `最長寿命 ${bucket} ターン到達 — ${speciesLabel(
              oldest.speciesId
            )} の個体が長寿記録を更新`,
            en: `Longevity ${bucket} turns reached — ${speciesLabel(
              oldest.speciesId
            )} sets a new record`,
          },
        });
      }
    }
    if (oldest.age > world.maxObservedAge) {
      world.maxObservedAge = oldest.age;
    }
  }

  // 2. 最大繁殖系統交代: 最大の系統が直前と異なる
  if (world.prevSpeciesCounts.size > 0) {
    let topId: string | null = null;
    let topCount = 0;
    for (const [id, count] of world.prevSpeciesCounts) {
      if (count > topCount) {
        topCount = count;
        topId = id;
      }
    }
    if (
      topId !== null &&
      topId !== world.prevTopSpeciesId &&
      topCount >= 5 // ノイズ抑制：5体未満は無視
    ) {
      // 色を取得
      const sample = world.lives.find(
        (l) => l.alive && l.speciesId === topId
      );
      pushEvent(world, {
        turn: world.turn,
        type: "topSpecies",
        speciesId: topId,
        rgb: sample
          ? { r: sample.genes.r, g: sample.genes.g, b: sample.genes.b }
          : undefined,
        message: {
          ja: `最大繁殖系統が ${speciesLabel(topId)} に交代（${topCount} 体）`,
          en: `Top species shifted to ${speciesLabel(topId)} (${topCount} alive)`,
        },
      });
      world.prevTopSpeciesId = topId;
    }
  }

  // 3. ターン到達マイルストーン
  for (const m of TURN_MILESTONES) {
    if (world.turn === m && !world.milestonesFired.has(m)) {
      world.milestonesFired.add(m);
      pushEvent(world, {
        turn: world.turn,
        type: "milestone",
        message: {
          ja: `${m.toLocaleString()} ターン到達 — 世界の生物数 ${aliveCount.toLocaleString()}, 系統数 ${world.prevSpeciesCounts.size}`,
          en: `Reached ${m.toLocaleString()} turns — ${aliveCount.toLocaleString()} alive, ${world.prevSpeciesCounts.size} species`,
        },
      });
    }
  }

  // 4. 大絶滅検出: ピーク比50%以上の急減（直近1000ターン以内に未発火）
  if (aliveCount > world.peakLifeCount) {
    world.peakLifeCount = aliveCount;
  }
  if (
    world.peakLifeCount >= 30 &&
    aliveCount > 0 &&
    aliveCount <= world.peakLifeCount * 0.5 &&
    world.turn - world.lastMassExtinctionTurn >= 1000
  ) {
    pushEvent(world, {
      turn: world.turn,
      type: "massExtinction",
      message: {
        ja: `大絶滅 — 全体生物数が ${world.peakLifeCount.toLocaleString()} から ${aliveCount.toLocaleString()} へ激減`,
        en: `Mass extinction — population crashed from ${world.peakLifeCount.toLocaleString()} to ${aliveCount.toLocaleString()}`,
      },
    });
    // 生存系統を一行ずつ列挙（上位5種まで）
    const survivors = [...world.prevSpeciesCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    for (const [id, count] of survivors) {
      const sample = world.lives.find((l) => l.alive && l.speciesId === id);
      pushEvent(world, {
        turn: world.turn,
        type: "survival",
        speciesId: id,
        rgb: sample
          ? { r: sample.genes.r, g: sample.genes.g, b: sample.genes.b }
          : undefined,
        message: {
          ja: `生存系統 ${speciesLabel(id)} — ${count} 体が大絶滅を生き延びた`,
          en: `Survivor ${speciesLabel(id)} — ${count} survived the mass extinction`,
        },
      });
    }
    world.lastMassExtinctionTurn = world.turn;
    // ピークをリセット（次の大絶滅検出のため）
    world.peakLifeCount = aliveCount;
  }

  // 5. 捕食系・知的生命系統の繁栄検出
  detectSpecialistSpecies(world);
}

/**
 * 平均値より大きく上回る strength / intelligence を持つ系統が
 * 一定の繁栄状態に達した場合、ログに記録する。
 * 「ある程度繁栄している」基準: 系統数 >= 10 体 かつ全体の 5% 以上。
 */
function detectSpecialistSpecies(world: World): void {
  // 系統別の集計（合計 strength, intelligence, count, RGB サンプル）
  type Agg = {
    count: number;
    sumStrength: number;
    sumIntelligence: number;
    r: number;
    g: number;
    b: number;
  };
  const map = new Map<string, Agg>();
  let totalAlive = 0;
  for (const l of world.lives) {
    if (!l.alive) continue;
    totalAlive++;
    const a = map.get(l.speciesId);
    if (a) {
      a.count++;
      a.sumStrength += l.genes.strength;
      a.sumIntelligence += l.genes.intelligence;
    } else {
      map.set(l.speciesId, {
        count: 1,
        sumStrength: l.genes.strength,
        sumIntelligence: l.genes.intelligence,
        r: l.genes.r,
        g: l.genes.g,
        b: l.genes.b,
      });
    }
  }
  if (totalAlive < 20) return;

  const minCount = Math.max(10, Math.floor(totalAlive * 0.05));
  const PREDATOR_THRESHOLD = 70; // strength 平均 (1〜100 の範囲なので上位)
  const INTELLIGENT_THRESHOLD = 70; // intelligence 平均 (0〜100 の範囲なので上位)

  for (const [id, a] of map) {
    if (a.count < minCount) continue;
    const avgStr = a.sumStrength / a.count;
    const avgInt = a.sumIntelligence / a.count;

    if (avgStr >= PREDATOR_THRESHOLD && !world.predatorRiseLogged.has(id)) {
      world.predatorRiseLogged.add(id);
      pushEvent(world, {
        turn: world.turn,
        type: "predatorRise",
        speciesId: id,
        rgb: { r: a.r, g: a.g, b: a.b },
        message: {
          ja: `捕食系の繁栄 — ${speciesLabel(id)}（強さ ${avgStr.toFixed(1)} 平均, ${a.count} 体）`,
          en: `Predator rise — ${speciesLabel(id)} (avg strength ${avgStr.toFixed(1)}, ${a.count} alive)`,
        },
      });
    }

    if (
      avgInt >= INTELLIGENT_THRESHOLD &&
      !world.intelligentRiseLogged.has(id)
    ) {
      world.intelligentRiseLogged.add(id);
      pushEvent(world, {
        turn: world.turn,
        type: "intelligentRise",
        speciesId: id,
        rgb: { r: a.r, g: a.g, b: a.b },
        message: {
          ja: `知的生命の繁栄 — ${speciesLabel(id)}（知能 ${avgInt.toFixed(1)} 平均, ${a.count} 体）`,
          en: `Intelligent rise — ${speciesLabel(id)} (avg intelligence ${avgInt.toFixed(1)}, ${a.count} alive)`,
        },
      });
    }
  }
}

function pushEvent(world: World, ev: WorldEvent): void {
  world.events.push(ev);
  if (world.events.length > MAX_EVENTS) {
    world.events.splice(0, world.events.length - MAX_EVENTS);
  }
}

function detectSpeciesEvents(world: World): void {
  // 現在の系統別カウントを集計
  const cur = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (const l of world.lives) {
    if (!l.alive) continue;
    const v = cur.get(l.speciesId);
    if (v) {
      v.count++;
    } else {
      cur.set(l.speciesId, {
        count: 1,
        r: l.genes.r,
        g: l.genes.g,
        b: l.genes.b,
      });
    }
  }

  // 新規系統（初出現）→ 誕生イベント（50%サンプリング）
  for (const [id, v] of cur) {
    if (!world.knownSpecies.has(id)) {
      world.knownSpecies.add(id);
      // 50%の確率でイベントを記録（birth イベント削減）
      if (Math.random() < 0.5) {
        pushEvent(world, {
          turn: world.turn,
          type: "birth",
          speciesId: id,
          rgb: { r: v.r, g: v.g, b: v.b },
          message: {
            ja: `新しい系統 ${speciesLabel(id)} が誕生`,
            en: `New species ${speciesLabel(id)} emerged`,
          },
        });
      }
      // ビジュアルエフェクト：新系統誕生個体の位置にフラッシュを追加
      // 同系統で最も若い個体（age=0）を初代として選択
      let founder: Life | null = null;
      for (const l of world.lives) {
        if (!l.alive || l.speciesId !== id) continue;
        if (founder === null || l.age < founder.age) {
          founder = l;
        }
      }
      if (founder !== null) {
        world.birthFlashes.push({
          lifeId: founder.id,
          x: founder.x,
          y: founder.y,
          speciesId: id,
          r: v.r,
          g: v.g,
          b: v.b,
          startTurn: world.turn,
          durationTurns: 10,
        });
      }
    }
  }

  // 期限切れフラッシュを削除
  if (world.birthFlashes.length > 0) {
    world.birthFlashes = world.birthFlashes.filter(
      (f) => world.turn - f.startTurn < f.durationTurns
    );
  }
  // 捕食エフェクトも期限切れ削除
  if (world.combatFlashes.length > 0) {
    world.combatFlashes = world.combatFlashes.filter(
      (f) => world.turn - f.startTurn < f.durationTurns
    );
  }

  // 直前まで存在した系統が消滅 → 絶滅イベント（20%サンプリング）
  for (const [id, prevCount] of world.prevSpeciesCounts) {
    if (prevCount > 0 && !cur.has(id)) {
      // 20%の確率でイベントを記録（extinction イベント大幅削減）
      if (Math.random() < 0.2) {
        pushEvent(world, {
          turn: world.turn,
          type: "extinction",
          speciesId: id,
          message: {
            ja: `系統 ${speciesLabel(id)} が絶滅`,
            en: `Species ${speciesLabel(id)} went extinct`,
          },
        });
      }
    }
  }

  // 次回検出のためカウントを更新
  world.prevSpeciesCounts.clear();
  for (const [id, v] of cur) {
    world.prevSpeciesCounts.set(id, v.count);
  }
}

/**
 * 時代環境（Phase 3：状態ベース化）。
 * 6 種の波パターン id にそれぞれ意味のある環境タイプを紐付け、
 * 各時代でエネルギー再生・波振幅・戦闘優位度を変動させる。
 */
export type EraEnvironmentType =
  | "balanced"
  | "fertile"
  | "tempest"
  | "predator"
  | "harsh"
  | "drought";

export type EraEnvironment = {
  type: EraEnvironmentType;
  name: string;
  nameEn: string;
  /** エネルギー再生倍率 */
  regenScale: number;
  /** 波振幅倍率 */
  ampScale: number;
  /** 戦闘で奪うエネルギー比率の倍率 */
  combatScale: number;
  /** エネルギー回復全体への倍率 */
  energyScale: number;
};

const ERA_ENVIRONMENTS: EraEnvironment[] = [
  // 0: 古典波 → 安定期
  {
    type: "balanced",
    name: "安定期",
    nameEn: "Balanced era",
    regenScale: 1.0,
    ampScale: 1.0,
    combatScale: 1.0,
    energyScale: 1.0,
  },
  // 1: 縞状 → 豊穣期
  {
    type: "fertile",
    name: "豊穣期",
    nameEn: "Fertile era",
    regenScale: 1.3,
    ampScale: 0.85,
    combatScale: 0.9,
    energyScale: 1.15,
  },
  // 2: 斜め進行 → 嵐期
  {
    type: "tempest",
    name: "嵐期",
    nameEn: "Tempest era",
    regenScale: 1.0,
    ampScale: 1.4,
    combatScale: 1.0,
    energyScale: 1.0,
  },
  // 3: 多層干渉 → 捕食期
  {
    type: "predator",
    name: "捕食期",
    nameEn: "Predator era",
    regenScale: 0.95,
    ampScale: 1.0,
    combatScale: 1.3,
    energyScale: 0.95,
  },
  // 4: 異方性 → 厳寒期
  {
    type: "harsh",
    name: "厳寒期",
    nameEn: "Harsh era",
    regenScale: 0.8,
    ampScale: 1.0,
    combatScale: 1.05,
    energyScale: 0.85,
  },
  // 5: クロス → 旱魃期
  {
    type: "drought",
    name: "旱魃期",
    nameEn: "Drought era",
    regenScale: 0.65,
    ampScale: 1.15,
    combatScale: 1.15,
    energyScale: 0.78,
  },
];

/**
 * 現在の時代インデックス、時代名、時代内進行率（0〜1）、環境を返す。
 */
export function currentEra(world: World): {
  index: number;
  name: string;
  progress: number;
  environment: EraEnvironment;
} {
  const dur = world.eraBaseDurationTurns;
  const t = world.eraTime;
  const index = Math.floor(t / dur);
  const progress = (t - index * dur) / dur;
  const patternIdx = (world.wavePatternId + index) % WAVE_PATTERN_COUNT;
  return {
    index,
    name: eraName(index),
    progress,
    environment: ERA_ENVIRONMENTS[patternIdx],
  };
}

const ERA_ROMAN = [
  "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
];

function eraName(index: number): string {
  if (index < ERA_ROMAN.length) return `第${ERA_ROMAN[index]}紀`;
  return `第${index + 1}紀`;
}

function eraNameEn(index: number): string {
  if (index < ERA_ROMAN.length) return `Era ${ERA_ROMAN[index]}`;
  return `Era ${index + 1}`;
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
  const { width, height, energy, energyNext: next, turn, terrainBias, waveTimeScale, wavePatternId, params } = world;

  // 時代環境（Phase 3：状態ベース化）と既存のユーザー設定を合算
  const era = currentEra(world);
  const env = era.environment;
  const energyScale = params.totalEnergy * env.energyScale;
  // 波速度は背景エネルギー波の進行速度に作用（0で完全停止）
  // phaseBase を 2π でラップして浮動小数点精度損失を防止
  const rawPhaseBase =
    (turn / 2000) * Math.PI * 2 * Math.max(0, params.waveSpeed);
  const phaseBase = rawPhaseBase % (Math.PI * 2);
  // 振幅係数 0.04（旧 0.025）：背景エネルギー揺れを視覚的に分かりやすく
  const waveAmp = ENERGY_WAVE_AMPLITUDE * 0.04 * energyScale * env.ampScale;
  const regenPerTurn = ENERGY_REGEN_PER_TURN * energyScale * env.regenScale;
  const SF = ENERGY_WAVE_SPATIAL_FREQ;

  // 時代によるパターン切替（最後20%でフェード）
  const patternA = (wavePatternId + era.index) % WAVE_PATTERN_COUNT;
  const patternB = (wavePatternId + era.index + 1) % WAVE_PATTERN_COUNT;
  const fadeStart = 0.8;
  const blend =
    era.progress <= fadeStart
      ? 0
      : (era.progress - fadeStart) / (1 - fadeStart); // 0..1

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

      let waveBase = wavePattern(patternA, x, y, phase, SF);
      if (blend > 0) {
        const waveBaseB = wavePattern(patternB, x, y, phase, SF);
        waveBase = waveBase * (1 - blend) + waveBaseB * blend;
      }

      const wave = waveBase * waveAmp;

      const bias = terrainBias[idx];
      const regen = regenPerTurn * (1 + bias * 0.6) + wave;
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

  // 速度を「累積スコア」方式で扱う：speed/33.3 を毎ターン加算、floor 分だけ動く。
  //  - speed 100: 3.0/turn → 毎ターン 3 ステップ
  //  - speed 50:  1.5/turn → 1〜2 ステップ
  //  - speed 33:  1.0/turn → 1 ステップ
  //  - speed 10:  0.3/turn → 3〜4 ターンに 1 ステップ
  //  - speed 1:   0.03/turn → 33 ターンに 1 ステップ
  life.moveAccum += g.speed / 33.3;
  const allowedSteps = Math.floor(life.moveAccum);
  life.moveAccum -= allowedSteps;

  const target = findBestNeighborCell(world, life);
  let steps = 0;
  while (steps < allowedSteps) {
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

  // 強さ・知能ともに非線形コスト（^1.8）。
  //   strength 100:    係数 * 3981
  //   intelligence 100:係数 * 3981
  const strengthCost = COST_STRENGTH * Math.pow(g.strength, 1.8);
  const intelligenceCost = COST_INTELLIGENCE * Math.pow(g.intelligence, 1.8);
  const upkeep =
    COST_BASE +
    COST_VISION * g.vision +
    intelligenceCost +
    strengthCost +
    COST_SIZE * g.size;
  life.energy -= upkeep;

  life.age++;

  if (life.energy <= 0) {
    if (life.protected) {
      // 保護中：餓死しない代わりにエネルギーを最低限維持
      life.energy = 1;
    } else {
      life.alive = false;
      life.energy = 0;
      energy[idx] = Math.min(ENERGY_MAX, energy[idx] + g.size * 0.3);
      occupancy[idx] = -1;
    }
  }

  if (life.age >= g.lifespan) {
    if (life.protected) {
      // 保護中：寿命無視
    } else {
      life.alive = false;
      energy[idx] = Math.min(ENERGY_MAX, energy[idx] + g.size * 0.3);
      occupancy[idx] = -1;
    }
  }

  if (life.alive && shouldReproduce(life)) {
    const emptyNeighbor = findEmptyNeighbor(world, life);
    if (emptyNeighbor) {
      reproduceLife(world, life, emptyNeighbor);
    }
  }
}

/**
 * 知能（intelligence）に応じた連続スケールの行動決定。
 *
 * 仕様（intelligence は 0〜100 の整数）：
 *  - scanRate    = intelligence / 100                  : 視野内セルの評価率
 *  - avoidWeight = max(0, (intelligence - 20) / 80)    : 敵回避の重み（20 から立ち上がる）
 *  - bodyWeight  = max(0, (intelligence - 70) / 30)    : 状況判断の有効度（70 から立ち上がる）
 *
 * スコア合成式：
 *   score = energyScore × (1 + avoidWeight × 0.3)
 *         − threatScore × avoidWeight
 *         + modeBonus  × bodyWeight
 *         − distCost
 *
 * モード（bodyWeight > 0 のときのみ起動）：
 *  - 飢餓: energy < size×0.3       → 餌スコアを重視
 *  - 逃走: 自strength < 隣接敵     → 敵から離れる方向を評価
 *  - 繁殖: energy > size×0.8 etc.  → 空きセル評価ボーナス
 *  - 通常: 上記いずれでもない       → エネルギー優先 + 弱敵回避
 */
function findBestNeighborCell(
  world: World,
  life: Life
): { x: number; y: number } {
  const { width, height, energy, occupancy } = world;
  const g = life.genes;
  const intel = Math.max(0, Math.min(100, g.intelligence));
  const scanRate = intel / 100;
  const avoidWeight = Math.max(0, (intel - 20) / 80);
  const bodyWeight = Math.max(0, (intel - 70) / 30);

  // 行動用 RNG（ターン × ライフID 由来で再現性維持）
  const rngSeed =
    ((world.turn + 1) * 2654435761) ^ ((life.id + 1) * 73856093);
  const rng = mulberry32(rngSeed >>> 0);

  // 知能 0：ランダム行動（隣接 8 セルから空きセルを 1 つ選ぶ。なければ自身に留まる）
  if (intel <= 0) {
    return randomNeighborOrStay(world, life, rng);
  }

  // モード判定（bodyWeight > 0 のときのみ）
  type Mode = "normal" | "starving" | "fleeing" | "breeding";
  let mode: Mode = "normal";
  if (bodyWeight > 0) {
    if (life.energy < g.size * 0.3) {
      mode = "starving";
    } else if (hasNearStrongerEnemy(world, life)) {
      mode = "fleeing";
    } else if (
      life.energy > g.size * 0.8 &&
      life.age >= g.lifespan * MIN_REPRODUCTIVE_AGE_RATIO
    ) {
      mode = "breeding";
    }
  }

  const range = g.vision;
  // 視野深度ボーナス：知能 25 ごとに +1 セル（0〜+4）
  const intelDepthBonus = Math.floor(intel / 25);
  const depth = Math.max(1, range + intelDepthBonus);

  let bestX = life.x;
  let bestY = life.y;
  let bestScore = -Infinity;

  for (let dy = -depth; dy <= depth; dy++) {
    for (let dx = -depth; dx <= depth; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > depth) continue;

      // 視野サーチ率で間引き（自セル位置は必ず評価）
      if ((dx !== 0 || dy !== 0) && rng() > scanRate) continue;

      const nx = (life.x + dx + width) % width;
      const ny = (life.y + dy + height) % height;
      const idx = ny * width + nx;
      if (occupancy[idx] !== -1 && (dx !== 0 || dy !== 0)) continue;

      const energyScore = energy[idx];
      const distCost = dist * 0.5;
      const threatScore =
        avoidWeight > 0 ? nearbyThreatScore(world, nx, ny, life) : 0;

      let modeBonus = 0;
      if (mode === "starving") {
        modeBonus = energyScore * 0.8;
      } else if (mode === "fleeing") {
        modeBonus = dist * 1.5;
      } else if (mode === "breeding") {
        modeBonus = (depth - dist) * 0.3;
      }

      const score =
        energyScore * (1 + avoidWeight * 0.3) -
        threatScore * avoidWeight -
        distCost +
        modeBonus * bodyWeight;

      if (score > bestScore) {
        bestScore = score;
        bestX = nx;
        bestY = ny;
      }
    }
  }
  return { x: bestX, y: bestY };
}

/**
 * 個体の現在の行動モードを返す（UI 表示用）。
 *  - random   : 知能 0（ランダム移動）
 *  - normal   : 通常（餌＋弱敵回避）
 *  - starving : 飢餓
 *  - fleeing  : 逃走
 *  - breeding : 繁殖
 */
export type BehaviorMode =
  | "random"
  | "normal"
  | "starving"
  | "fleeing"
  | "breeding";

export function getBehaviorMode(world: World, life: Life): BehaviorMode {
  if (!life.alive) return "normal";
  const g = life.genes;
  const intel = Math.max(0, Math.min(100, g.intelligence));
  if (intel <= 0) return "random";
  const bodyWeight = Math.max(0, (intel - 70) / 30);
  if (bodyWeight <= 0) return "normal";
  if (life.energy < g.size * 0.3) return "starving";
  if (hasNearStrongerEnemy(world, life)) return "fleeing";
  if (
    life.energy > g.size * 0.8 &&
    life.age >= g.lifespan * MIN_REPRODUCTIVE_AGE_RATIO
  ) {
    return "breeding";
  }
  return "normal";
}

/** 隣接 8 セルからランダムな空きセルを返す。なければ自身位置。 */
function randomNeighborOrStay(
  world: World,
  life: Life,
  rng: RNG
): { x: number; y: number } {
  const { width, height, occupancy } = world;
  const offsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1],
  ];
  // フィッシャーイェーツで並べ替え
  for (let i = offsets.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [offsets[i], offsets[j]] = [offsets[j], offsets[i]];
  }
  for (const [dx, dy] of offsets) {
    const nx = (life.x + dx + width) % width;
    const ny = (life.y + dy + height) % height;
    const idx = ny * width + nx;
    if (occupancy[idx] === -1) return { x: nx, y: ny };
  }
  return { x: life.x, y: life.y };
}

/** 隣接 8 セルに自分より強い敵が居れば true。同系統は常に除外。 */
function hasNearStrongerEnemy(world: World, life: Life): boolean {
  const { width, height, occupancy } = world;
  const myStr = life.genes.strength;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = (life.x + dx + width) % width;
      const ny = (life.y + dy + height) % height;
      const idx = ny * width + nx;
      const id = occupancy[idx];
      if (id === -1) continue;
      const opp = findLifeById(world, id);
      if (!opp || !opp.alive) continue;
      if (opp.speciesId === life.speciesId) continue;
      if (opp.genes.strength > myStr) return true;
    }
  }
  return false;
}

/**
 * セル (cx, cy) の周辺 1 マスに居る敵の脅威スコアを返す。
 * 敵 strength が自分より高いほど大きくなる。
 */
function nearbyThreatScore(
  world: World,
  cx: number,
  cy: number,
  self: Life
): number {
  const { width, height, occupancy } = world;
  let total = 0;
  const myStr = self.genes.strength;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = (cx + dx + width) % width;
      const ny = (cy + dy + height) % height;
      const id = occupancy[ny * width + nx];
      if (id === -1 || id === self.id) continue;
      const opp = findLifeById(world, id);
      if (!opp || !opp.alive) continue;
      if (opp.speciesId === self.speciesId) continue;
      const diff = opp.genes.strength - myStr;
      if (diff > 0) total += diff;
    }
  }
  return total;
}

function cullDead(world: World): void {
  if (world.lives.some((l) => !l.alive)) {
    world.lives = world.lives.filter((l) => l.alive);
    // livesById を再構築（死亡個体を除去）
    world.livesById.clear();
    for (const l of world.lives) world.livesById.set(l.id, l);
  }
}

function findLifeById(world: World, id: number): Life | null {
  return world.livesById.get(id) ?? null;
}

function shouldReproduce(life: Life): boolean {
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
  const effectiveMutationRate = clamp(
    parent.genes.mutationRate * world.params.mutationRateMultiplier,
    0,
    1
  );
  let childGenes = mutatGenes(parent.genes, effectiveMutationRate, rng);
  // 稼働遺伝子フラグに従って無効化された遺伝子は固定値で上書き
  childGenes = applyDisabledGenes(childGenes, world.params.disabledGenes);
  const splitEnergy = parent.energy * 0.5;
  parent.energy = splitEnergy;

  const idx = childPos.y * world.width + childPos.x;
  const childLife: Life = {
    id: world.nextLifeId++,
    x: childPos.x,
    y: childPos.y,
    // 親マスから子位置へ「分裂・移動」する演出
    prevX: parent.x,
    prevY: parent.y,
    energy: splitEnergy,
    age: 0,
    speciesId: speciesIdFromGenes(childGenes),
    genes: childGenes,
    alive: true,
    moveAccum: 0,
  };
  world.lives.push(childLife);
  world.livesById.set(childLife.id, childLife);
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

    // 同系統は常に攻撃しない（共食い禁止）
    if (opponent.speciesId === life.speciesId) continue;

    // 体格を防御役として戦闘判定に組み込む（B1 案）。
    //   effectiveAtk = life.strength
    //   effectiveDef = opponent.strength + opponent.size * 0.05
    // 体格 100 で +5、140 で +7 の防御。控えめだが体格の存在意義を増す。
    //   ※ 0.1 だと体格大個体が無敵化し population 全滅。
    // プレイヤーが保護中の個体は戦闘で死なない
    if (opponent.protected) continue;
    const effectiveAtk = life.genes.strength;
    const effectiveDef = opponent.genes.strength + opponent.genes.size * 0.05;
    if (effectiveAtk > effectiveDef) {
      // 確率戦闘：差分が大きいほど確実勝利。
      //   diff 0:    0%（試行成立せず）
      //   diff 4:   50%
      //   diff 8+: 95%（上限）
      const diff = effectiveAtk - effectiveDef;
      const killChance = Math.min(0.95, Math.max(0, diff / 8));
      if (Math.random() >= killChance) {
        continue; // 攻撃失敗
      }
      const era = currentEra(world);
      const lootEnergy =
        opponent.energy *
        world.params.combatAdvantage *
        era.environment.combatScale;
      life.energy += lootEnergy;
      // 捕食エフェクト：捕食者の位置に被食者が重なって縮小・消滅する演出
      world.combatFlashes.push({
        attackerLifeId: life.id,
        fallbackX: life.x,
        fallbackY: life.y,
        victimR: opponent.genes.r,
        victimG: opponent.genes.g,
        victimB: opponent.genes.b,
        startTurn: world.turn,
        durationTurns: 5,
      });
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
