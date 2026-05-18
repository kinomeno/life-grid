import {
  ABSORB_RATE,
  ACCURACY_FULL_INTEL,
  BASE_MUTATION_RATE,
  COMBAT_ENERGY_LOSS_RATIO,
  COST_BASE,
  COST_INTELLIGENCE,
  COST_INTELLIGENCE_EXP,
  COST_SIZE,
  COST_SPEED_PER_STEP,
  COST_STRENGTH,
  COST_STRENGTH_EXP,
  COST_VISION,
  GENE_INTELLIGENCE_NORMAL_CAP,
  GENE_REPRODUCTION_NORMAL_CAP,
  GENE_STRENGTH_NORMAL_CAP,
  GENE_WEIGHT_INIT_MEAN,
  GENE_WEIGHT_INIT_RANGE,
  GENE_WEIGHT_MAX,
  GENE_WEIGHT_MIN,
  VISION_DEPTH_BONUS_MAX,
  VISION_DEPTH_INTEL_PER_BONUS,
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
    inheritOnDeath: true,
    smoothAnimation: true,
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
      dx: 0,
      dy: 0,
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
    recentDeaths: new Map(),
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
  // v1.10: 重み遺伝子の初期分布は中央値 50 ± 30（つまり 20〜80）。
  // 極端な値（0 や 100）から始めないことで初期世代の挙動を安定させる。
  const initW = () =>
    Math.round(
      randomRange(
        rng,
        GENE_WEIGHT_INIT_MEAN - GENE_WEIGHT_INIT_RANGE,
        GENE_WEIGHT_INIT_MEAN + GENE_WEIGHT_INIT_RANGE
      )
    );
  return {
    r: randomInt(rng, 0, 256),
    g: randomInt(rng, 0, 256),
    b: randomInt(rng, 0, 256),
    vision: randomInt(rng, GENE_VISION_MIN, GENE_VISION_MAX + 1),
    speed: randomInt(rng, GENE_SPEED_MIN, GENE_SPEED_MAX + 1),
    size: randomRange(rng, GENE_SIZE_MIN, GENE_SIZE_MAX),
    // v1.01: 初期分布は通常レンジ（1〜100）のみ。突然変異で 100 超に達する。
    strength: randomInt(rng, GENE_STRENGTH_MIN, GENE_STRENGTH_NORMAL_CAP + 1),
    intelligence: randomInt(rng, GENE_INTELLIGENCE_MIN, GENE_INTELLIGENCE_NORMAL_CAP + 1),
    reproductionRate: randomRange(rng, GENE_REPRODUCTION_MIN, GENE_REPRODUCTION_NORMAL_CAP),
    lifespan: randomRange(rng, GENE_LIFESPAN_MIN, GENE_LIFESPAN_MAX),
    // v1.10: 行動判断の重み遺伝子（中央値 50 ± 30 から進化）
    wAppetite: initW(),
    wPredation: initW(),
    wCaution: initW(),
    wGregarious: initW(),
    wLoyalty: initW(),
    wRepro: initW(),
    wStarvSensitive: initW(),
  };
}

export function mutatGenes(parentGenes: Genes, mutationRate: number, rng: RNG): Genes {
  const genes = { ...parentGenes };
  // factor は変動幅 = (max-min) * factor。既定 0.3 = 範囲の 30% まで変動。
  // v1.01: ジャンプ変異 — 突然変異発生時、5% の確率で 8〜15 倍の大変動が起きる。
  // これにより、強さ・知能・繁殖率で 100 を超える「ミュータント個体」が
  // 数百〜数千世代に 1 度、自然に現れる。ほとんどは即死するが観察として面白い。
  const mutate = (
    gene: number,
    min: number,
    max: number,
    factor = 0.3
  ): number => {
    if (rng() < mutationRate) {
      let variation = (rng() - 0.5) * 2 * (max - min) * factor;
      if (rng() < 0.15) {
        // ジャンプ変異：通常変動の 10〜20 倍。
        // 平均 100 以下に淘汰される設計（tier2 線形 1.0）でも、
        // 数百ターンに 1 度はミュータントが観察できる頻度を確保する。
        variation *= 10 + rng() * 10;
      }
      return clamp(gene + variation, min, max);
    }
    return gene;
  };
  genes.r = Math.round(mutate(genes.r, 0, 255));
  genes.g = Math.round(mutate(genes.g, 0, 255));
  genes.b = Math.round(mutate(genes.b, 0, 255));
  genes.vision = Math.round(mutate(genes.vision, GENE_VISION_MIN, GENE_VISION_MAX));
  // 速度（1〜100）：小刻みな変動（±3）
  genes.speed = Math.round(
    mutate(genes.speed, GENE_SPEED_MIN, GENE_SPEED_MAX, 0.03)
  );
  genes.size = mutate(genes.size, GENE_SIZE_MIN, GENE_SIZE_MAX);
  // v1.01: 強さ（1〜999）：通常変異は ±3 相当（factor 0.003 で範囲 998 に対し ±3）
  // 100 超のミュータントは稀に発生 → 数世代以内に死亡する設計
  genes.strength = Math.round(
    mutate(genes.strength, GENE_STRENGTH_MIN, GENE_STRENGTH_MAX, 0.003)
  );
  // v1.01: 知能（0〜999）：同じく ±3 相当
  genes.intelligence = Math.round(
    mutate(
      genes.intelligence,
      GENE_INTELLIGENCE_MIN,
      GENE_INTELLIGENCE_MAX,
      0.003
    )
  );
  // v1.01: 繁殖率（0.1〜2.0）：factor 0.05 で範囲 1.9 に対し ±0.095
  genes.reproductionRate = mutate(
    genes.reproductionRate,
    GENE_REPRODUCTION_MIN,
    GENE_REPRODUCTION_MAX,
    0.05
  );
  // v1.10: mutationRate 遺伝子は廃止（環境設定の倍率で制御）
  genes.lifespan = mutate(genes.lifespan, GENE_LIFESPAN_MIN, GENE_LIFESPAN_MAX);
  // v1.10: 行動判断の重み遺伝子（factor 0.05 で範囲 100 に対し ±5）
  genes.wAppetite = Math.round(mutate(genes.wAppetite, GENE_WEIGHT_MIN, GENE_WEIGHT_MAX, 0.05));
  genes.wPredation = Math.round(mutate(genes.wPredation, GENE_WEIGHT_MIN, GENE_WEIGHT_MAX, 0.05));
  genes.wCaution = Math.round(mutate(genes.wCaution, GENE_WEIGHT_MIN, GENE_WEIGHT_MAX, 0.05));
  genes.wGregarious = Math.round(mutate(genes.wGregarious, GENE_WEIGHT_MIN, GENE_WEIGHT_MAX, 0.05));
  genes.wLoyalty = Math.round(mutate(genes.wLoyalty, GENE_WEIGHT_MIN, GENE_WEIGHT_MAX, 0.05));
  genes.wRepro = Math.round(mutate(genes.wRepro, GENE_WEIGHT_MIN, GENE_WEIGHT_MAX, 0.05));
  genes.wStarvSensitive = Math.round(mutate(genes.wStarvSensitive, GENE_WEIGHT_MIN, GENE_WEIGHT_MAX, 0.05));
  return genes;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * v1.01: 強さ・知能の維持コスト。単一の滑らかな非線形カーブ（^2.0）。
 * 「最大値で即死」のような硬い設計をやめ、コスト関数だけで「自然な生存可能値」が
 * 進化過程で決まるようにする。確率戦闘も廃止して、戦闘優位もコスト負担も
 * すべて連続変数として作用する。
 *
 *  目安（base = COST_STRENGTH = 0.0007）:
 *    v =  20 :   0.28
 *    v =  50 :   1.75
 *    v = 100 :   7.0    （以前の倍）
 *    v = 150 :  15.75
 *    v = 200 :  28.0    （数十ターンで死亡レベル）
 *    v = 300 :  63.0    （短命）
 *    v = 500 : 175.0    （超短命）
 *    v = 700 : 343.0    （ほぼ即死）
 *    v = 999 : 698.6    （即死、エネルギーキャパを大幅超過）
 *
 * 平均的個体のエネルギーキャパ（size）は 60〜140 程度なので、
 *  - 強さ 100 程度までは安定に維持可能
 *  - 強さ 150 程度はエネルギー豊かな環境でのみ生存
 *  - 強さ 200 超は短命確定
 *  - 強さ 500 超は実質即死
 */
function nonlinearGeneCost(v: number, base: number, exponent: number): number {
  if (v <= 0) return 0;
  return base * Math.pow(v, exponent);
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
 * v1.02: 選択中の生命が死亡したときの「後継者」を探す。
 * 1) 同 speciesId で最も位置が近い生きた個体
 * 2) 同系統がいなければ、全生命の中で遺伝子距離が最も近い個体
 * いなければ null。トーラス境界を考慮した位置距離・各遺伝子の差の二乗和を使う。
 *
 * dead は Life でなくスナップショット（id/x/y/speciesId/genes）でも受け取れる。
 * x10/x100 高速時に cullDead で world.lives から既に削除されている個体に対応する。
 */
export function findHeir(
  world: World,
  dead: { id: number; x: number; y: number; speciesId: string; genes: Genes }
): Life | null {
  const { width, height } = world;

  // (1) 同系統での最近接
  let bestSame: Life | null = null;
  let bestSameDist = Infinity;
  // (2) 全体での遺伝子距離最近接（同系統がいなかった場合のフォールバック）
  let bestGene: Life | null = null;
  let bestGeneDist = Infinity;

  for (const l of world.lives) {
    if (!l.alive || l.id === dead.id) continue;

    if (l.speciesId === dead.speciesId) {
      const d = torusDist2(dead.x, dead.y, l.x, l.y, width, height);
      if (d < bestSameDist) {
        bestSameDist = d;
        bestSame = l;
      }
    } else if (!bestSame) {
      // 同系統が既に見つかっていれば、遺伝子距離は調べない（最適化）
      const d = geneDist2(dead.genes, l.genes);
      if (d < bestGeneDist) {
        bestGeneDist = d;
        bestGene = l;
      }
    }
  }

  return bestSame ?? bestGene;
}

function torusDist2(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  height: number
): number {
  let dx = Math.abs(ax - bx);
  let dy = Math.abs(ay - by);
  if (dx > width / 2) dx = width - dx;
  if (dy > height / 2) dy = height - dy;
  return dx * dx + dy * dy;
}

function geneDist2(a: Genes, b: Genes): number {
  // 各遺伝子の差の二乗和（粗い指標）。範囲が大きく異なるので個別にスケーリング。
  let d = 0;
  d += (a.r - b.r) ** 2;
  d += (a.g - b.g) ** 2;
  d += (a.b - b.b) ** 2;
  // 0〜100 系（強さ・知能・速度・体格）はそのまま
  d += (a.strength - b.strength) ** 2;
  d += (a.intelligence - b.intelligence) ** 2;
  d += (a.size - b.size) ** 2;
  d += (a.speed - b.speed) ** 2;
  // 視野（1〜4）はスケール拡大
  d += ((a.vision - b.vision) * 25) ** 2;
  // 0〜2.0 の繁殖率は 50 倍してスケール合わせ
  d += ((a.reproductionRate - b.reproductionRate) * 50) ** 2;
  // 寿命 200〜600 → そのまま比較すると支配的になるので 0.2 倍
  d += ((a.lifespan - b.lifespan) * 0.2) ** 2;
  // v1.10: 重み遺伝子の差も遺伝子距離に含める（性格の近さを反映）
  d += (a.wAppetite - b.wAppetite) ** 2;
  d += (a.wPredation - b.wPredation) ** 2;
  d += (a.wCaution - b.wCaution) ** 2;
  d += (a.wGregarious - b.wGregarious) ** 2;
  d += (a.wLoyalty - b.wLoyalty) ** 2;
  d += (a.wRepro - b.wRepro) ** 2;
  d += (a.wStarvSensitive - b.wStarvSensitive) ** 2;
  return d;
}

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

  const startX = life.x;
  const startY = life.y;
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
  // v1.10: 今ターンの実移動を「向き」として記録（判断材料・描画用）。
  // トーラス境界跨ぎを考慮して短い方の向きを採用。
  if (steps > 0) {
    let mdx = wrapDelta(life.x - startX, width);
    let mdy = wrapDelta(life.y - startY, height);
    // 単位ベクトル化（小さな値で十分）
    life.dx = Math.sign(mdx);
    life.dy = Math.sign(mdy);
  } else {
    // 静止：向きをリセット
    life.dx = 0;
    life.dy = 0;
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

  // v1.01: 強さ・知能でコスト指数を別々に持たせる。
  // 強さ ^2.0（戦闘優位が直接効くため厳しめ）、知能 ^1.85（間接効果なので緩め）。
  // 戦闘は決定論。バランスは指数差で取る。
  const strengthCost = nonlinearGeneCost(g.strength, COST_STRENGTH, COST_STRENGTH_EXP);
  const intelligenceCost = nonlinearGeneCost(
    g.intelligence,
    COST_INTELLIGENCE,
    COST_INTELLIGENCE_EXP
  );
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
 * v1.10: 単層ニューラルネット風の連続スコア評価。
 *
 * 設計思想：
 *  - ハードコードのモード切替（飢餓/逃走/繁殖/通常）を廃止
 *  - 入力（観察事実）× 重み（遺伝子）の線形和で各セルを評価
 *  - 知能は「重みが正確に反映される度合い（accuracy）」として作用
 *  - 性格は遺伝子の組み合わせから創発する
 *
 * accuracy = min(1.0, sqrt(intel / 200))
 *  - 知能 0   →  0% （完全ランダム）
 *  - 知能 50  → 50%
 *  - 知能 100 → 71%
 *  - 知能 200 → 100% （重みが完全反映）
 *  - 知能 200 超 → 視野深度ボーナス（広域認識）
 *
 * 入力特徴量（各セル）:
 *  f_energy       : セルのエネルギー量 / 100
 *  f_dist         : 距離コスト
 *  f_prey         : 最近接の倒せる敵のエネルギー量
 *  f_threat       : 最近接の倒せない敵の強さ
 *  f_approach     : 倒せない敵が自分の方向に向かっているか
 *  f_allyCount    : 視野内の仲間数（事前計算）
 *  f_allyEnergy   : 仲間の平均エネルギー（事前計算）
 *  f_empty        : 空きセル（繁殖可能性）
 *  f_starvHunger  : 飢餓×食料の組み合わせ特徴
 */
function findBestNeighborCell(
  world: World,
  life: Life
): { x: number; y: number } {
  const { width, height, energy, occupancy } = world;
  const g = life.genes;
  const intel = Math.max(0, g.intelligence);

  // 行動用 RNG（ターン × ライフID 由来で再現性維持）
  const rngSeed =
    ((world.turn + 1) * 2654435761) ^ ((life.id + 1) * 73856093);
  const rng = mulberry32(rngSeed >>> 0);

  // accuracy：知能の機能精度。0 なら完全ランダム
  const accuracy = Math.min(1.0, Math.sqrt(intel / ACCURACY_FULL_INTEL));
  if (accuracy === 0) {
    return randomNeighborOrStay(world, life, rng);
  }

  // 視野範囲：vision + 知能ボーナス（上限あり）
  // v1.10 Phase 4: 低 accuracy（知能 50 未満）の個体は視野を最小化して計算量を抑える。
  //   理由：低 accuracy ではノイズ項が大きいため、広い視野で評価しても結果に差が出にくい。
  //   観察上も「ぼんやり個体は遠くを見ても見えない」のは自然。
  const visionBonus = Math.min(
    VISION_DEPTH_BONUS_MAX,
    Math.floor(intel / VISION_DEPTH_INTEL_PER_BONUS)
  );
  const effectiveVision = accuracy < 0.5 ? Math.max(1, g.vision - 1) : g.vision;
  const depth = Math.max(1, effectiveVision + visionBonus);

  // 自分の状態
  const selfHunger = Math.max(0, Math.min(1, 1 - life.energy / g.size)); // 0=満腹, 1=空腹
  const selfDef = g.strength + g.size * 0.05;

  // 重み遺伝子（0〜100 → 0〜1 正規化）
  const wA = g.wAppetite / 100;
  const wP = g.wPredation / 100;
  const wC = g.wCaution / 100;
  const wG = g.wGregarious / 100;
  const wL = g.wLoyalty / 100;
  const wR = g.wRepro / 100;
  const wS = g.wStarvSensitive / 100;

  // 視野内の生命を事前スキャン（仲間集計 + 敵リスト）
  let allyCount = 0;
  let allyEnergySum = 0;
  type VisibleEnemy = {
    x: number;
    y: number;
    energy: number;
    strength: number;
    dx: number;
    dy: number;
    winnable: boolean;
  };
  const enemies: VisibleEnemy[] = [];
  const livesById = world.livesById;
  for (let dy = -depth; dy <= depth; dy++) {
    for (let dx = -depth; dx <= depth; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > depth) continue;
      if (dx === 0 && dy === 0) continue;
      const nx = (life.x + dx + width) % width;
      const ny = (life.y + dy + height) % height;
      const idx = ny * width + nx;
      const occId = occupancy[idx];
      if (occId === -1) continue;
      const other = livesById.get(occId);
      if (!other || !other.alive) continue;
      if (other.speciesId === life.speciesId) {
        // 仲間
        allyCount++;
        allyEnergySum += other.energy;
      } else {
        // 敵：倒せるかどうかを判定
        const enemyDef = other.genes.strength + other.genes.size * 0.05;
        const winnable = g.strength > enemyDef;
        enemies.push({
          x: nx,
          y: ny,
          energy: other.energy,
          strength: other.genes.strength,
          dx: other.dx,
          dy: other.dy,
          winnable,
        });
      }
    }
  }
  const fAllyCount = Math.min(1.0, allyCount / 10);
  const fAllyEnergy =
    allyCount > 0
      ? Math.min(1.0, allyEnergySum / allyCount / 100)
      : 0;

  // 各セルのスコアを計算して最大を求める
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
      // 移動先は空きセル（自セルは例外）
      if (occupancy[idx] !== -1 && (dx !== 0 || dy !== 0)) continue;

      // === 入力特徴量 ===
      const f_energy = energy[idx] / 100;
      const f_dist = dist / Math.max(1, depth);
      const f_empty = 1; // 既に空きセルしか通っていない
      const f_starvHunger = f_energy * selfHunger;

      // 敵との関係（最も近い「倒せる敵」「倒せない敵」を探す）
      let nearestPreyDist = Infinity;
      let nearestPreyEnergy = 0;
      let nearestThreatDist = Infinity;
      let nearestThreatStrength = 0;
      let nearestThreatApproach = 0;
      for (const e of enemies) {
        // セル (nx, ny) から敵 e への距離（トーラス考慮）
        let edx = e.x - nx;
        let edy = e.y - ny;
        if (edx > width / 2) edx -= width;
        if (edx < -width / 2) edx += width;
        if (edy > height / 2) edy -= height;
        if (edy < -height / 2) edy += height;
        const eDist = Math.abs(edx) + Math.abs(edy);
        if (e.winnable) {
          if (eDist < nearestPreyDist) {
            nearestPreyDist = eDist;
            nearestPreyEnergy = e.energy;
          }
        } else {
          if (eDist < nearestThreatDist) {
            nearestThreatDist = eDist;
            nearestThreatStrength = e.strength;
            // 接近度：敵の (dx, dy) と自分から敵へのベクトルの内積
            // 敵がこちらに向かってきている = (e.dx, e.dy) · (-edx, -edy) > 0
            // 正規化（ベクトル長で割らないが、向きの方向性として使える）
            const dot = -e.dx * edx + -e.dy * edy;
            nearestThreatApproach = Math.max(-1, Math.min(1, dot / 2));
          }
        }
      }
      // 距離を 0-1 に正規化（近いほど大）
      const f_prey =
        nearestPreyDist === Infinity
          ? 0
          : Math.max(0, 1 - nearestPreyDist / depth) *
            Math.min(1.0, nearestPreyEnergy / 100);
      const f_threat =
        nearestThreatDist === Infinity
          ? 0
          : Math.max(0, 1 - nearestThreatDist / depth) *
            Math.min(1.0, nearestThreatStrength / 999);
      const f_approach =
        nearestThreatDist === Infinity
          ? 0
          : Math.max(0, nearestThreatApproach);

      // === 重み × 特徴の線形和 ===
      const weightedSum =
        wA * f_energy +
        wP * f_prey +
        wC * -1 * (f_threat + 0.5 * f_approach) +
        wG * fAllyCount +
        wL * fAllyEnergy +
        wR * f_empty * (f_empty > 0 ? 1 : 0) +
        wS * f_starvHunger;

      // accuracy で重み係数の有効度を制御。知能低い分はランダムノイズ
      const noise = (1 - accuracy) * (rng() - 0.5) * 2; // -1〜+1
      const score = accuracy * weightedSum + noise - 0.3 * f_dist;

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
 *
 * v1.10: ハードコードのモード切替（飢餓/逃走/繁殖）を廃止。
 * 代わりに重み遺伝子から「性格タグ」を導出する。
 *  - random  : 知能 0（完全ランダム）
 *  - normal  : 通常範囲
 *  - hunter  : wPredation 突出
 *  - timid   : wCaution 突出
 *  - glutton : wAppetite 突出
 *  - social  : wGregarious 突出
 *  - breeder : wRepro 突出
 */
export type BehaviorMode =
  | "random"
  | "normal"
  | "hunter"
  | "timid"
  | "glutton"
  | "social"
  | "breeder";

export function getBehaviorMode(world: World, life: Life): BehaviorMode {
  if (!life.alive) return "normal";
  const g = life.genes;
  const intel = Math.max(0, g.intelligence);
  if (intel <= 0) return "random";

  // 性格タグ：最も突出した重み遺伝子から判定。
  // 70 以上で「突出」とみなす。
  const weights: { mode: BehaviorMode; value: number }[] = [
    { mode: "hunter", value: g.wPredation },
    { mode: "timid", value: g.wCaution },
    { mode: "glutton", value: g.wAppetite },
    { mode: "social", value: g.wGregarious },
    { mode: "breeder", value: g.wRepro },
  ];
  let topMode: BehaviorMode = "normal";
  let topValue = 70; // しきい値
  for (const w of weights) {
    if (w.value > topValue) {
      topValue = w.value;
      topMode = w.mode;
    }
  }
  return topMode;
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

// v1.10: hasNearStrongerEnemy / nearbyThreatScore は廃止
// （新しい線形和スコアモデルで敵の警戒は f_threat + wCaution として表現される）

function cullDead(world: World): void {
  if (world.lives.some((l) => !l.alive)) {
    // v1.02: 死亡個体を recentDeaths にスナップショットしてから削除する。
    // 自動継承（高速再生時の死亡検出）で「死亡時点の情報」を取り戻すため。
    for (const l of world.lives) {
      if (!l.alive && !world.recentDeaths.has(l.id)) {
        world.recentDeaths.set(l.id, {
          id: l.id,
          x: l.x,
          y: l.y,
          speciesId: l.speciesId,
          genes: l.genes,
          deathTurn: world.turn,
        });
      }
    }
    // 200 ターンより古い記録は捨てる（メモリ膨張防止）
    for (const [id, snap] of world.recentDeaths) {
      if (world.turn - snap.deathTurn > 200) {
        world.recentDeaths.delete(id);
      }
    }
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
  // v1.10: 全個体共通の固定突然変異率 × 環境設定の倍率（0 設定で完全コピー）
  const effectiveMutationRate = clamp(
    BASE_MUTATION_RATE * world.params.mutationRateMultiplier,
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
    // v1.10: 向きは初期 0（静止状態）
    dx: 0,
    dy: 0,
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

  // v1.10: 隣接 3×3 内の同系統数を数えて、戦闘時のボーナス算定に使う。
  // 仲間が多いほど戦闘力が増す（群れの戦闘力）。対数で逓減して支配的にならないように。
  let attackerAllyCount = 0;
  for (const [dx, dy] of neighbors) {
    const nx = (x + dx + width) % width;
    const ny = (y + dy + height) % height;
    const nidx = ny * width + nx;
    if (occupancy[nidx] === -1) continue;
    const neighbor = world.livesById.get(occupancy[nidx]);
    if (neighbor && neighbor.alive && neighbor.speciesId === life.speciesId) {
      attackerAllyCount++;
    }
  }
  const allyBonus = Math.log1p(attackerAllyCount) * 1.5;

  for (const [dx, dy] of neighbors) {
    const nx = (x + dx + width) % width;
    const ny = (y + dy + height) % height;
    const nidx = ny * width + nx;
    if (occupancy[nidx] === -1) continue;

    const opponent = findLifeById(world, occupancy[nidx]);
    if (!opponent || !opponent.alive) continue;

    // 同系統は常に攻撃しない（共食い禁止）
    if (opponent.speciesId === life.speciesId) continue;

    // 防御側も自分の周囲の仲間数で防御力ボーナスを得る（群れの防御力）
    let defenderAllyCount = 0;
    for (const [ddx, ddy] of neighbors) {
      const dnx = (opponent.x + ddx + width) % width;
      const dny = (opponent.y + ddy + height) % height;
      const dnidx = dny * width + dnx;
      if (occupancy[dnidx] === -1) continue;
      const dneighbor = world.livesById.get(occupancy[dnidx]);
      if (
        dneighbor &&
        dneighbor.alive &&
        dneighbor.speciesId === opponent.speciesId
      ) {
        defenderAllyCount++;
      }
    }
    const defAllyBonus = Math.log1p(defenderAllyCount) * 1.5;

    // 体格を防御役として戦闘判定に組み込む（B1 案）。
    //   effectiveAtk = life.strength + 仲間ボーナス
    //   effectiveDef = opponent.strength + opponent.size * 0.05 + 仲間ボーナス
    // 体格 100 で +5、140 で +7 の防御。控えめだが体格の存在意義を増す。
    //   ※ 0.1 だと体格大個体が無敵化し population 全滅。
    // プレイヤーが保護中の個体は戦闘で死なない
    if (opponent.protected) continue;
    const effectiveAtk = life.genes.strength + allyBonus;
    const effectiveDef = opponent.genes.strength + opponent.genes.size * 0.05 + defAllyBonus;
    if (effectiveAtk > effectiveDef) {
      // v1.01: 確率戦闘を廃止し決定論に。強さの差は実効値として直接勝敗を決め、
      // バランスはコスト関数（^2.0）側で取る。
      // 強さを伸ばすと戦闘で確実に勝てるが、維持コストが指数的に重くなる。
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
