import {
  ABSORB_RATE,
  ACCURACY_FULL_INTEL,
  BASE_MUTATION_RATE,
  COMBAT_ENERGY_LOSS_RATIO,
  DEFAULT_ADVANCED,
  COST_BASE,
  COST_INTELLIGENCE,
  COST_INTELLIGENCE_EXP,
  COST_SIZE,
  COST_SPEED_PER_STEP,
  COST_SPEED_MAINT,
  COST_SPEED_EXP,
  COST_STRENGTH,
  COST_STRENGTH_EXP,
  COST_VISION,
  GENE_INTELLIGENCE_NORMAL_CAP,
  GENE_BIRTH_THRESHOLD_MAX,
  GENE_BIRTH_THRESHOLD_MIN,
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
  ENERGY_REGEN_FLOOR_RATIO,
  ENERGY_WAVE_AMPLITUDE,
  WAVE_SF_SMALL,
  WAVE_SF_LARGE,
  FIXED_GENE_VALUES,
  GENE_INTELLIGENCE_MAX,
  GENE_INTELLIGENCE_MIN,
  GENE_LIFESPAN_MAX,
  GENE_LIFESPAN_MIN,
  GENE_OFFSPRING_MAX,
  GENE_OFFSPRING_MIN,
  GENE_SIZE_MAX,
  GENE_SIZE_MIN,
  GENE_SPEED_MAX,
  GENE_SPEED_NORMAL_CAP,
  GENE_SPEED_MIN,
  GENE_STRENGTH_MAX,
  GENE_STRENGTH_MIN,
  GENE_VISION_MAX,
  GENE_VISION_MIN,
  COLOR_DRIFT_SCALE,
  SPECIES_RGB_BIN,
  SHARE_ASSORTATIVE,
  SHARE_DONOR_RESERVE_RATIO,
  SHARE_RECIPIENT_NEED_RATIO,
  SHARE_FRACTION,
  SHARE_EFF_BASE,
  SHARE_MIN_AMOUNT,
  MAX_SHARE_FLASHES,
  SHARE_FLASH_DURATION,
  INITIAL_ENERGY_RATIO,
  MIN_REPRODUCTIVE_AGE_RATIO,
  OFFSPRING_GENE_ENABLED,
  WORLD_FLAT_INITIAL_ENERGY,
  WORLD_FLAT_REGEN_MULT,
  FOUNDER_AGE_SPREAD_RATIO,
  REPRO_MIN_EMPTY_NEIGHBORS,
  DOMINATION_STREAK_TURNS,
  DOMINATION_MIN_TOTAL,
  REIGN_TURNS,
  REIGN_ATK_PENALTY,
} from "./constants";
import { mulberry32, randomInt, randomRange, type RNG } from "./random";
import {
  speciesIdFromGenes,
  speciesDisplayName,
  speciesColorFromGenes,
  binCenterColor,
} from "./species";
import { regionName } from "./maps";
import { makeStatsSample } from "./stats";
import type {
  DisabledGeneFlags,
  Genes,
  Life,
  LineageNode,
  SimulationParams,
  SpeciesLineageNode,
  World,
  WorldConfig,
  WorldEvent,
} from "./types";

// ver.2: 年表をターン1近くまで遡れるよう保持上限を拡大（イベントは小さいオブジェクト）。
// 表示側は「もっと見る」で1000件ずつ展開して描画負荷を抑える。
const MAX_EVENTS = 2000;

// ver.2: イベント文の系統名（出生地つき「北アメリカA / N. America A」、無ければ色名）。
function speciesName(world: World, id: string, locale: string = "ja"): string {
  return speciesDisplayName(id, world.speciesLineage.get(id), locale);
}
const HISTORY_SAMPLE_INTERVAL = 50;
const MAX_HISTORY = 240;

export function defaultSimulationParams(): SimulationParams {
  return {
    // 初期はやや楽な世界に：初心者が「すぐ全滅」を経験しないように。
    // v1.20: 1.35 に上げると 100×100 で知能進化圧が失われた（賢くなくても生きられる）ため
    // 1.2 に据え置き。小世界の安定化は初期個体数側で対処する。
    totalEnergy: 1.2,
    mutationRateMultiplier: 1.0,
    waveSpeed: 1.0,
    // v1.10: combatAdvantage は UI から削除。掠奪率は COMBAT_ENERGY_LOSS_RATIO 固定 +
    // 時代の era.environment.combatScale 倍率で変動する。
    disabledGenes: defaultDisabledGenes(),
    newsEnabled: true,
    inheritOnDeath: true,
    smoothAnimation: true,
    // v1.30 (案1/B): 既定はOFF（オプトイン）。設定でONにすると分配＋wShare進化が有効。
    energyShareEnabled: false,
    // v1.31: 上級設定（コスト等の倍率）。既定すべて1.0＝現行バランス。
    advanced: { ...DEFAULT_ADVANCED },
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
    birthThreshold: false,
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
  // v1.30 (H4 再設計): 体色 r,g,b は「仲間タグ」遺伝子。能力から算出せず、継承＋微ドリフト
  // （randomGenes / mutatGenes 側で決定）。ここでは触れない。旧「体色 RGB 無効化」分岐も廃止。
  if (disabled.vision) out.vision = FIXED_GENE_VALUES.vision;
  if (disabled.speed) out.speed = FIXED_GENE_VALUES.speed;
  if (disabled.size) out.size = FIXED_GENE_VALUES.size;
  if (disabled.strength) out.strength = FIXED_GENE_VALUES.strength;
  if (disabled.intelligence) out.intelligence = FIXED_GENE_VALUES.intelligence;
  if (disabled.birthThreshold)
    out.birthThreshold = FIXED_GENE_VALUES.birthThreshold;
  if (disabled.lifespan) out.lifespan = FIXED_GENE_VALUES.lifespan;
  // v1.30 (案1/B): wShare（利他性）は共有OFFでもリセットしない。分配フェーズを実行しないことで
  // 不活性化されるだけで、進化した値はそのまま保持される（再ONで以前の利他性から再開）。
  return out;
}

// ver.2: 祖先の体色を「地域の色の同系統（別ビン）」で count 色生成する。
// 主要チャンネル（色味）を保ち、他2チャンネルをビン境界をまたいでずらして別種化。
function founderColors(
  r: number,
  g: number,
  b: number,
  count: number
): [number, number, number][] {
  const BIN = SPECIES_RGB_BIN;
  const base: [number, number, number] = [r, g, b];
  const di = base[0] >= base[1] && base[0] >= base[2] ? 0 : base[1] >= base[2] ? 1 : 2;
  const others = [0, 1, 2].filter((i) => i !== di);
  const offs = [[0, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [0, 1], [1, 0]];
  const seen = new Set<string>();
  const out: [number, number, number][] = [];
  for (let k = 0; k < offs.length && out.length < count; k++) {
    const c: [number, number, number] = [base[0], base[1], base[2]];
    c[others[0]] = clamp(base[others[0]] + offs[k][0] * BIN, 0, 255);
    c[others[1]] = clamp(base[others[1]] + offs[k][1] * BIN, 0, 255);
    const key = `${Math.floor(c[0] / BIN)},${Math.floor(c[1] / BIN)},${Math.floor(c[2] / BIN)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  if (out.length === 0) out.push(base);
  return out;
}

export function createWorld(config: WorldConfig): World {
  const { width, height, initialLifeCount, seed, initialGenes, terrain, regions, regionMeta } = config;
  const params = config.params ?? defaultSimulationParams();
  const rng = mulberry32(seed);
  const total = width * height;

  const energy = new Float32Array(total);
  // v1.30 (あ): 25画面（観察モード）は序盤に全マップ同時枯渇で全滅しやすいので初期エネを少し増やす。
  const initEnergyBoost = width <= 25 ? 1.4 : 1;
  for (let i = 0; i < total; i++) {
    // rng は毎セル消費する（地形の有無で乱数列がずれないように揃える）。
    const v = ENERGY_INITIAL_MEAN + (rng() - 0.5) * 2 * ENERGY_INITIAL_VARIANCE;
    if (terrain) {
      // ver.2: 完全平準化。陸は全マス同値（公平・決定的）、海は常時0。
      energy[i] = terrain[i] === 0 ? 0 : WORLD_FLAT_INITIAL_ENERGY;
    } else {
      energy[i] = Math.min(
        ENERGY_MAX,
        (clamp(v, 0, ENERGY_MAX) * INITIAL_ENERGY_RATIO + 5) * initEnergyBoost
      );
    }
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
  if (regions && regionMeta && regionMeta.length > 0) {
    // ver.2: 大陸ごとに数種の祖先を配置（同系色・能力ランダム）。
    //   各区分 = 同系色の祖先 FOUNDERS 種、それぞれ INDIV 体のコロニー。
    //   能力は祖先ごとにランダム → 区分ごとの力量差を平準化＆内部競争。
    const FOUNDERS_PER_REGION = 3;
    // 各区分の総個体数＝タイトルの初期生命数（「各地域で○○個体」）。祖先3種に巡回割り当て。
    const perRegion = Math.max(FOUNDERS_PER_REGION, initialLifeCount);
    const cellsByRegion: number[][] = regionMeta.map(() => []);
    for (let i = 0; i < total; i++) {
      const rg = regions[i];
      if (rg >= 0 && rg < regionMeta.length && (!terrain || terrain[i] === 1)) {
        cellsByRegion[rg].push(i);
      }
    }
    for (let rgi = 0; rgi < regionMeta.length; rgi++) {
      const meta = regionMeta[rgi];
      const cells = cellsByRegion[rgi];
      if (!cells || cells.length === 0) continue;
      const colors = founderColors(meta.r, meta.g, meta.b, FOUNDERS_PER_REGION);
      // 祖先テンプレ（同系色・能力ランダム）を用意。
      const templates = colors.map((col) => {
        let g = randomGenes(rng);
        g.r = col[0];
        g.g = col[1];
        g.b = col[2];
        g = applyDisabledGenes(g, params.disabledGenes);
        return { genes: g, sid: speciesIdFromGenes(g) };
      });
      // 区分内に perRegion 体を配置（祖先テンプレを巡回割り当て）。
      for (let k = 0; k < perRegion; k++) {
        const tmpl = templates[k % templates.length];
        for (let t = 0; t < 30; t++) {
          const idx = cells[Math.floor(rng() * cells.length)];
          if (occupancy[idx] !== -1) continue;
          const x = idx % width;
          const y = (idx / width) | 0;
          const genes = { ...tmpl.genes };
          const life: Life = {
            id: nextId++, x, y, prevX: x, prevY: y,
            energy: genes.size * 0.5,
            // ver.2: 脱同期。祖先の初期年齢を散らし、出産・寿命死が同時に来る「崖」を防ぐ。
            age: Math.floor(rng() * tmpl.genes.lifespan * FOUNDER_AGE_SPREAD_RATIO),
            speciesId: tmpl.sid, genes, alive: true,
            moveAccum: 0, dx: 0, dy: 0, origin: meta.code,
          };
          lives.push(life);
          occupancy[idx] = life.id;
          break;
        }
      }
    }
  } else {
    let attempts = 0;
    while (lives.length < initialLifeCount && attempts < initialLifeCount * 20) {
      attempts++;
      const x = randomInt(rng, 0, width);
      const y = randomInt(rng, 0, height);
      const idx = y * width + x;
      if (occupancy[idx] !== -1) continue;
      // ver.2: 海には初期配置しない。
      if (terrain && terrain[idx] === 0) continue;
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
  }

  // 初期生命の系統を knownSpecies に登録
  const knownSpecies = new Set<string>();
  const livesById = new Map<number, Life>();
  // v1.31 (A5): 命名・色用の種登録（色ビン → ノード）。
  const speciesLineage = new Map<string, SpeciesLineageNode>();
  // ver.2 (系統樹): 一意な系統IDの系統樹。初期種は色ビンごとに1つのルート系統に束ねる。
  const lineageNodes: LineageNode[] = [];
  const founderLineageByBin = new Map<string, number>();
  let nextLineageId = 0;
  for (const life of lives) {
    knownSpecies.add(life.speciesId);
    livesById.set(life.id, life);
    if (!speciesLineage.has(life.speciesId)) {
      const c = speciesColorFromGenes(life.genes);
      let seq: number | undefined;
      if (life.origin) {
        seq = 0;
        for (const n of speciesLineage.values()) if (n.origin === life.origin) seq++;
      }
      speciesLineage.set(life.speciesId, {
        id: life.speciesId,
        parentId: null,
        birthTurn: 0,
        r: c.r,
        g: c.g,
        b: c.b,
        origin: life.origin,
        seq,
      });
    }
    // 出自＋色ビンごとに1ルート（別出自が同じ色ビンを持っても系統が混ざらないように）。
    const fkey = `${life.origin ?? ""}|${life.speciesId}`;
    let lid = founderLineageByBin.get(fkey);
    if (lid === undefined) {
      lid = nextLineageId++;
      founderLineageByBin.set(fkey, lid);
      const sln = speciesLineage.get(life.speciesId)!;
      lineageNodes.push({
        id: lid,
        parentId: null,
        birthTurn: 0,
        speciesId: life.speciesId,
        r: sln.r,
        g: sln.g,
        b: sln.b,
        origin: life.origin,
        seq: sln.seq,
      });
    }
    life.lineageId = lid;
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
    terrain,
    regions,
    regionMeta,
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
    speciesLineage,
    lineageNodes,
    nextLineageId,
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
    shareFlashes: [],
    dominationOrigin: null,
    dominationStreak: 0,
    reignOrigin: null,
    reignUntilTurn: 0,
    params,
  };
}

const WAVE_PATTERN_COUNT = 6;

/**
 * v1.21: マップサイズ依存の波の空間周波数（= 波長）。
 *   辺 50 以下 → WAVE_SF_SMALL（短波長、小世界の全体同期枯渇を防ぐ）
 *   辺 200 以上 → WAVE_SF_LARGE（長波長、v1.20 相当のダイナミックなうねり）
 *   中間（100 など）は線形補間。
 */
function waveSpatialFreq(size: number): number {
  if (size <= 50) return WAVE_SF_SMALL;
  if (size >= 200) return WAVE_SF_LARGE;
  const t = (size - 50) / (200 - 50);
  return WAVE_SF_SMALL + t * (WAVE_SF_LARGE - WAVE_SF_SMALL);
}

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
    // v1.30 (H4 再設計): 体色は「仲間タグ」。初期世代はランダム色で多様な系統からスタートし、
    // 以降は継承＋微ドリフト（mutatGenes）で系統ごとに色が分かれていく。
    r: randomInt(rng, 0, 256),
    g: randomInt(rng, 0, 256),
    b: randomInt(rng, 0, 256),
    vision: randomInt(rng, GENE_VISION_MIN, GENE_VISION_MAX + 1),
    // v1.11: 初期分布は通常レンジ（1〜100）。突然変異で 100 超のミュータントが稀に発生。
    speed: randomInt(rng, GENE_SPEED_MIN, GENE_SPEED_NORMAL_CAP + 1),
    size: randomRange(rng, GENE_SIZE_MIN, GENE_SIZE_MAX),
    // v1.01: 初期分布は通常レンジ（1〜100）のみ。突然変異で 100 超に達する。
    strength: randomInt(rng, GENE_STRENGTH_MIN, GENE_STRENGTH_NORMAL_CAP + 1),
    intelligence: randomInt(rng, GENE_INTELLIGENCE_MIN, GENE_INTELLIGENCE_NORMAL_CAP + 1),
    // v1.20: 出産閾値。初期 50〜120 から進化開始（30〜300 の範囲）。
    birthThreshold: randomRange(rng, 50, 120),
    lifespan: randomRange(rng, GENE_LIFESPAN_MIN, GENE_LIFESPAN_MAX),
    // v1.11: 初期出産数は 1（単独出産）。突然変異で多産個体が稀に発生。
    offspringCount: 1,
    // v1.10: 行動判断の重み遺伝子（中央値 50 ± 30 から進化）
    wAppetite: initW(),
    wPredation: initW(),
    wCaution: initW(),
    wGregarious: initW(),
    wLoyalty: initW(),
    wRepro: initW(),
    wStarvSensitive: initW(),
    // v1.30 (案1): 利他性も中央値 50 ± 30 から進化開始。
    wShare: initW(),
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
  // v1.30 (H4 再設計): r,g,b は「仲間タグ」。親色を継承（{ ...parentGenes } 済み）し、
  // 能力・行動が変化した分だけランダム方向に微ドリフトさせる（末尾で適用）。
  genes.vision = Math.round(mutate(genes.vision, GENE_VISION_MIN, GENE_VISION_MAX));
  // v1.11: 速度（1〜999）：strength/intelligence と同じく ±3 相当（factor 0.003 で範囲 998 に対し ±3）
  // 100 超のミュータントは稀に発生 → 数世代以内に死亡（短命）。
  genes.speed = Math.round(
    mutate(genes.speed, GENE_SPEED_MIN, GENE_SPEED_MAX, 0.003)
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
  // v1.20: 出産閾値（30〜300）：factor 0.04 で範囲 270 に対し ±10 程度
  genes.birthThreshold = mutate(
    genes.birthThreshold,
    GENE_BIRTH_THRESHOLD_MIN,
    GENE_BIRTH_THRESHOLD_MAX,
    0.04
  );
  // v1.10: mutationRate 遺伝子は廃止（環境設定の倍率で制御）
  genes.lifespan = mutate(genes.lifespan, GENE_LIFESPAN_MIN, GENE_LIFESPAN_MAX);
  // v1.11: 出産数（1〜10）：factor 0.05 で範囲 9 に対し ±0.45 程度
  // 整数値だが mutate（連続値）→ round で離散化。たまに ±1 が起きる程度。
  // v1.21 実験: OFFSPRING_GENE_ENABLED が false の間は変異させず 1 固定のまま。
  if (OFFSPRING_GENE_ENABLED) {
    genes.offspringCount = Math.round(
      mutate(genes.offspringCount, GENE_OFFSPRING_MIN, GENE_OFFSPRING_MAX, 0.05)
    );
  } else {
    genes.offspringCount = 1;
  }
  // v1.10: 行動判断の重み遺伝子（factor 0.05 で範囲 100 に対し ±5）
  genes.wAppetite = Math.round(mutate(genes.wAppetite, GENE_WEIGHT_MIN, GENE_WEIGHT_MAX, 0.05));
  genes.wPredation = Math.round(mutate(genes.wPredation, GENE_WEIGHT_MIN, GENE_WEIGHT_MAX, 0.05));
  genes.wCaution = Math.round(mutate(genes.wCaution, GENE_WEIGHT_MIN, GENE_WEIGHT_MAX, 0.05));
  genes.wGregarious = Math.round(mutate(genes.wGregarious, GENE_WEIGHT_MIN, GENE_WEIGHT_MAX, 0.05));
  genes.wLoyalty = Math.round(mutate(genes.wLoyalty, GENE_WEIGHT_MIN, GENE_WEIGHT_MAX, 0.05));
  genes.wRepro = Math.round(mutate(genes.wRepro, GENE_WEIGHT_MIN, GENE_WEIGHT_MAX, 0.05));
  genes.wStarvSensitive = Math.round(mutate(genes.wStarvSensitive, GENE_WEIGHT_MIN, GENE_WEIGHT_MAX, 0.05));
  // v1.30 (案1): 利他性遺伝子の変異。
  genes.wShare = Math.round(mutate(genes.wShare, GENE_WEIGHT_MIN, GENE_WEIGHT_MAX, 0.05));

  // v1.30 (H4 再設計): 体色ドリフト。
  // 能力・行動が親からどれだけ変化したか（各遺伝子を意味のあるレンジで正規化した合計）に
  // 比例して、体色 r,g,b をランダム方向へ動かす。変化ゼロなら色も不変（安定系統＝同色＝同種）。
  // 蓄積して 48 ビンを越えた子が新種になる。方向はランダムなので、別系統が同じ能力に
  // 収斂しても色は別＝別種として表現される。
  const dnorm = (a: number, b: number, range: number): number =>
    range > 0 ? Math.abs(a - b) / range : 0;
  const changeMag =
    dnorm(genes.speed, parentGenes.speed, GENE_SPEED_NORMAL_CAP) +
    dnorm(genes.strength, parentGenes.strength, GENE_STRENGTH_NORMAL_CAP) +
    dnorm(genes.intelligence, parentGenes.intelligence, GENE_INTELLIGENCE_NORMAL_CAP) +
    dnorm(genes.size, parentGenes.size, GENE_SIZE_MAX - GENE_SIZE_MIN) +
    dnorm(genes.vision, parentGenes.vision, GENE_VISION_MAX - GENE_VISION_MIN) +
    dnorm(genes.birthThreshold, parentGenes.birthThreshold, GENE_BIRTH_THRESHOLD_MAX - GENE_BIRTH_THRESHOLD_MIN) +
    dnorm(genes.lifespan, parentGenes.lifespan, GENE_LIFESPAN_MAX - GENE_LIFESPAN_MIN) +
    dnorm(genes.offspringCount, parentGenes.offspringCount, GENE_OFFSPRING_MAX - GENE_OFFSPRING_MIN) +
    dnorm(genes.wAppetite, parentGenes.wAppetite, GENE_WEIGHT_MAX - GENE_WEIGHT_MIN) +
    dnorm(genes.wPredation, parentGenes.wPredation, GENE_WEIGHT_MAX - GENE_WEIGHT_MIN) +
    dnorm(genes.wCaution, parentGenes.wCaution, GENE_WEIGHT_MAX - GENE_WEIGHT_MIN) +
    dnorm(genes.wGregarious, parentGenes.wGregarious, GENE_WEIGHT_MAX - GENE_WEIGHT_MIN) +
    dnorm(genes.wLoyalty, parentGenes.wLoyalty, GENE_WEIGHT_MAX - GENE_WEIGHT_MIN) +
    dnorm(genes.wRepro, parentGenes.wRepro, GENE_WEIGHT_MAX - GENE_WEIGHT_MIN) +
    dnorm(genes.wStarvSensitive, parentGenes.wStarvSensitive, GENE_WEIGHT_MAX - GENE_WEIGHT_MIN) +
    dnorm(genes.wShare, parentGenes.wShare, GENE_WEIGHT_MAX - GENE_WEIGHT_MIN);
  if (changeMag > 0) {
    const amt = changeMag * COLOR_DRIFT_SCALE;
    genes.r = clamp(Math.round(genes.r + (rng() * 2 - 1) * amt), 0, 255);
    genes.g = clamp(Math.round(genes.g + (rng() * 2 - 1) * amt), 0, 255);
    genes.b = clamp(Math.round(genes.b + (rng() * 2 - 1) * amt), 0, 255);
    // v1.30 (い): 種分化が起きた瞬間（親と別の色ビンへ移った）だけ、色を追加で大きくジャンプ
    // させ、新種を視覚的にはっきり親と別色にする。方向は親ビンから離れる側へバイアス。
    const bin = (v: number): number => Math.floor(v / SPECIES_RGB_BIN);
    const speciationJump = (cur: number, parent: number): number => {
      if (bin(cur) === bin(parent)) return cur; // 同じ種ビンなら据え置き
      const dir = cur >= parent ? 1 : -1;
      const extra = SPECIES_RGB_BIN * (0.5 + rng() * 0.5); // 0.5〜1.0 ビン分、離れる方向へ
      return clamp(Math.round(cur + dir * extra), 0, 255);
    };
    genes.r = speciationJump(genes.r, parentGenes.r);
    genes.g = speciationJump(genes.g, parentGenes.g);
    genes.b = speciationJump(genes.b, parentGenes.b);
  }
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
  // v1.21 軽量化 B1: 全マップでエネルギー場を 2 ターンに 1 回だけ更新し、
  // updateEnergy のコストを半減。マップサイズによらず挙動を一貫させる
  // （マップサイズで更新頻度が変わると同じ生態でも結果が変わってしまうため）。
  // エネルギー場はゆっくり変化するので見た目への影響は小さい。
  if (world.turn % 2 === 0) {
    updateEnergy(world);
  }
  // 天変地異の進行・発生処理
  updateCataclysm(world);
  // 描画スムージング用：このターン開始時点の位置を記録
  for (const life of world.lives) {
    if (!life.alive) continue;
    life.prevX = life.x;
    life.prevY = life.y;
  }
  // v1.30 (案1): 仲間へのエネルギー提供フェーズ。actLife（採餌・餓死判定）の前に実行し、
  // 余剰を持つ近縁が瀕死の仲間を救えるようにする。
  shareEnergyPhase(world);
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

  // ver.2: 大陸（出自）の世界制覇判定（出自つき個体がいる世界地図など）
  detectDomination(world);
  // ver.2: 出自（大陸系統）の全滅を年表に記録（世界地図）
  detectOriginExtinction(world);

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
          rgb: speciesColorFromGenes(oldest.genes),
          message: {
            ja: `最長寿命 ${bucket} ターン到達 — ${speciesName(world, oldest.speciesId)} の個体が長寿記録を更新`,
            en: `Longevity ${bucket} turns reached — ${speciesName(world, oldest.speciesId, "en")} sets a new record`,
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
        rgb: sample ? speciesColorFromGenes(sample.genes) : undefined,
        message: {
          ja: `最大繁殖系統が ${speciesName(world, topId)} に交代（${topCount} 体）`,
          en: `Top species shifted to ${speciesName(world, topId, "en")} (${topCount} alive)`,
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
    // ver.2: 生存系統は1行に集約（最多1系統＋生存系統数）。冗長な列挙をやめる。
    const survivors = [...world.prevSpeciesCounts.entries()].sort(
      (a, b) => b[1] - a[1]
    );
    if (survivors.length > 0) {
      const [topId, topCount] = survivors[0];
      const sample = world.lives.find((l) => l.alive && l.speciesId === topId);
      const nSpecies = survivors.length;
      pushEvent(world, {
        turn: world.turn,
        type: "survival",
        speciesId: topId,
        rgb: sample ? speciesColorFromGenes(sample.genes) : undefined,
        message: {
          ja: `生存 — ${speciesName(world, topId)} ら ${nSpecies} 系統（最多 ${topCount} 体）が生き延びた`,
          en: `Survivors — ${speciesName(world, topId, "en")} and ${nSpecies} species (top ${topCount}) survived`,
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
        r: binCenterColor(l.genes.r),
        g: binCenterColor(l.genes.g),
        b: binCenterColor(l.genes.b),
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
          ja: `捕食系の繁栄 — ${speciesName(world, id)}（強さ ${avgStr.toFixed(1)} 平均, ${a.count} 体）`,
          en: `Predator rise — ${speciesName(world, id, "en")} (avg strength ${avgStr.toFixed(1)}, ${a.count} alive)`,
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
          ja: `知的生命の繁栄 — ${speciesName(world, id)}（知能 ${avgInt.toFixed(1)} 平均, ${a.count} 体）`,
          en: `Intelligent rise — ${speciesName(world, id, "en")} (avg intelligence ${avgInt.toFixed(1)}, ${a.count} alive)`,
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

// ver.2: 世界制覇判定（領土制＝全地域同色）。すべての地域(地理)の最多勢力(出自)が
// 同一になり、それを DOMINATION_STREAK_TURNS ターン連続維持したら一度だけ告知する。
// ＝勢力地図の全地域が同じ色になった状態。世界地図（regions あり）のみ。
function detectDomination(world: World): void {
  const regions = world.regions;
  const meta = world.regionMeta;
  if (!regions || !meta || meta.length === 0) return; // 世界地図のみ
  const w = world.width;
  const regionCount = meta.length;
  const counts: Map<string, number>[] = [];
  for (let i = 0; i < regionCount; i++) counts.push(new Map());
  let total = 0;
  for (const l of world.lives) {
    if (!l.alive || !l.origin) continue;
    const ri = regions[l.y * w + l.x];
    if (ri < 0 || ri >= regionCount) continue;
    counts[ri].set(l.origin, (counts[ri].get(l.origin) || 0) + 1);
    total++;
  }
  if (total < DOMINATION_MIN_TOTAL) {
    world.dominationOrigin = null;
    world.dominationStreak = 0;
    return;
  }
  // 全地域が「人口あり」かつ最多勢力が同一出自か判定（＝全地域が同じ色）。
  let common = "";
  let allSame = true;
  for (let ri = 0; ri < regionCount; ri++) {
    const m = counts[ri];
    if (m.size === 0) {
      allSame = false; // 無人地域があれば未達（全地域同色でない）
      break;
    }
    let top = "";
    let topN = 0;
    for (const [o, n] of m) if (n > topN) { topN = n; top = o; }
    if (common === "") common = top;
    else if (top !== common) {
      allSame = false;
      break;
    }
  }
  if (!allSame || !common) {
    world.dominationOrigin = null;
    world.dominationStreak = 0;
    return;
  }
  // 全地域同色 → 連続維持でストリーク加算（揺らぎでの誤確定を防ぐ）。
  if (world.dominationOrigin === common) {
    world.dominationStreak = (world.dominationStreak ?? 0) + 1;
  } else {
    world.dominationOrigin = common;
    world.dominationStreak = 1;
  }
  if ((world.dominationStreak ?? 0) < DOMINATION_STREAK_TURNS) return;
  // 同じ覇者が治世を継続中なら再宣言しない。
  if (world.reignOrigin === common) return;
  // ver.2 革命: 初回は「制覇」、覇者交代は「革命」。治世(REIGN_TURNS)を開始する。
  const isRevolution = world.reignOrigin != null;
  world.reignOrigin = common;
  world.reignUntilTurn = world.turn + REIGN_TURNS;
  pushEvent(world, {
    turn: world.turn,
    type: "worldDomination",
    message: isRevolution
      ? {
          ja: `${regionName(common, "ja") ?? common}系が革命！世界を再統一した`,
          en: `Revolution! ${regionName(common, "en") ?? common} reunifies the world`,
        }
      : {
          ja: `${regionName(common, "ja") ?? common}系が全地域を制覇！`,
          en: `${regionName(common, "en") ?? common} controls every region!`,
        },
  });
}

// ver.2: 出自（大陸系統）の全滅検出。ある出自の総個体数が前回>0→今回0になったら年表に記録。
// 世界地図のみ（regionMeta あり）。prevOriginCounts は毎ターン更新（保存不要・ロード後は初回スキップ）。
function detectOriginExtinction(world: World): void {
  if (!world.regionMeta || world.regionMeta.length === 0) return;
  const cur = new Map<string, number>();
  for (const l of world.lives) {
    if (!l.alive || !l.origin) continue;
    cur.set(l.origin, (cur.get(l.origin) || 0) + 1);
  }
  const prev = world.prevOriginCounts;
  if (prev) {
    for (const [code, pc] of prev) {
      if (pc > 0 && (cur.get(code) || 0) === 0) {
        pushEvent(world, {
          turn: world.turn,
          type: "originExtinction",
          message: {
            ja: `${regionName(code, "ja") ?? code}系の系統がすべて途絶えた`,
            en: `All lineages of ${regionName(code, "en") ?? code} have died out`,
          },
        });
      }
    }
  }
  world.prevOriginCounts = cur;
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
        r: binCenterColor(l.genes.r),
        g: binCenterColor(l.genes.g),
        b: binCenterColor(l.genes.b),
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
            ja: `新しい系統 ${speciesName(world, id)} が誕生`,
            en: `New species ${speciesName(world, id, "en")} emerged`,
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
  // v1.30 (案1/B): エネルギー提供エフェクトも期限切れ削除
  if (world.shareFlashes.length > 0) {
    world.shareFlashes = world.shareFlashes.filter(
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
            ja: `系統 ${speciesName(world, id)} が絶滅`,
            en: `Species ${speciesName(world, id, "en")} went extinct`,
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
  // v1.20: 出産閾値 30〜300。寿命と同様にスケールを抑える（0.3 倍）
  d += ((a.birthThreshold - b.birthThreshold) * 0.3) ** 2;
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

// v1.10 perf: 拡散の境界処理用に y±1 / x±1 のインデックスを一度だけ計算してキャッシュ。
// 旧実装は内側ループ内で % width / % height を呼んでいた（10000 セル/turn）。
let _yPrevCache: Int32Array | null = null;
let _yNextCache: Int32Array | null = null;
let _xPrevCache: Int32Array | null = null;
let _xNextCache: Int32Array | null = null;
// 波形バッファ：トリグを拡散ループから分離して JIT が両方を最適化しやすくする。
let _waveBuf: Float32Array | null = null;
function ensureWrapCaches(width: number, height: number): void {
  if (!_yPrevCache || _yPrevCache.length !== height) {
    _yPrevCache = new Int32Array(height);
    _yNextCache = new Int32Array(height);
    for (let y = 0; y < height; y++) {
      _yPrevCache[y] = (y - 1 + height) % height;
      _yNextCache[y] = (y + 1) % height;
    }
  }
  if (!_xPrevCache || _xPrevCache.length !== width) {
    _xPrevCache = new Int32Array(width);
    _xNextCache = new Int32Array(width);
    for (let x = 0; x < width; x++) {
      _xPrevCache[x] = (x - 1 + width) % width;
      _xNextCache[x] = (x + 1) % width;
    }
  }
  const cells = width * height;
  if (!_waveBuf || _waveBuf.length !== cells) {
    _waveBuf = new Float32Array(cells);
  }
}

function updateEnergy(world: World): void {
  const { width, height, energy, energyNext: next, turn, terrainBias, waveTimeScale, wavePatternId, params, terrain } = world;
  ensureWrapCaches(width, height);
  const yPrev = _yPrevCache!;
  const yNext = _yNextCache!;
  const xPrev = _xPrevCache!;
  const xNext = _xNextCache!;
  const waveBuf = _waveBuf!;

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
  // ver.2: 固定地形（世界地図）は公平のためエネルギーを平坦化（波・偏り無し）。
  const flat = !!terrain;
  const waveAmp = flat ? 0 : ENERGY_WAVE_AMPLITUDE * 0.04 * energyScale * env.ampScale;
  const regenPerTurn = ENERGY_REGEN_PER_TURN * energyScale * env.regenScale * (flat ? WORLD_FLAT_REGEN_MULT : 1);
  // v1.21: 再生の下限。波が負のピークでも regenFloor は必ず供給され、
  // マップ全体が同時に枯渇する環境絶滅を防ぐ。
  const regenFloor = regenPerTurn * ENERGY_REGEN_FLOOR_RATIO;
  // v1.21: 波長をマップサイズ可変に（小世界=短波長、大世界=長波長）
  const SF = waveSpatialFreq(width);

  // 時代によるパターン切替（最後20%でフェード）
  const patternA = (wavePatternId + era.index) % WAVE_PATTERN_COUNT;
  const patternB = (wavePatternId + era.index + 1) % WAVE_PATTERN_COUNT;
  const fadeStart = 0.8;
  const blend =
    era.progress <= fadeStart
      ? 0
      : (era.progress - fadeStart) / (1 - fadeStart); // 0..1
  const blendInv = 1 - blend;

  // v1.10 perf: 波形は拡散ループから分離して別パスで計算する。
  //   - トリグ集中ループは JIT が最適化しやすい
  //   - 振幅 0 のときはトリグをスキップして 0 で埋める
  if (waveAmp === 0) {
    waveBuf.fill(0);
  } else {
    let idx = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const phase = phaseBase * waveTimeScale[idx];
        let v = wavePattern(patternA, x, y, phase, SF);
        if (blend > 0) {
          const vB = wavePattern(patternB, x, y, phase, SF);
          v = v * blendInv + vB * blend;
        }
        waveBuf[idx] = v * waveAmp;
        idx++;
      }
    }
  }

  // 拡散 + 再生ループ。波形はバッファから読むだけ。
  for (let y = 0; y < height; y++) {
    const rowY = y * width;
    const rowYm = yPrev[y] * width;
    const rowYp = yNext[y] * width;
    for (let x = 0; x < width; x++) {
      const idx = rowY + x;
      // ver.2: 海セルはエネルギーを持たない（常時0・拡散も再生もしない）。
      if (terrain && terrain[idx] === 0) {
        next[idx] = 0;
        continue;
      }
      const cur = energy[idx];

      const neighborSum =
        energy[rowY + xPrev[x]] +
        energy[rowY + xNext[x]] +
        energy[rowYm + x] +
        energy[rowYp + x];
      const diffused = cur + (neighborSum * 0.25 - cur) * ENERGY_DIFFUSION;

      // v1.21: 再生に下限 regenFloor を保証（波が負でも完全停止しない）
      const rawRegen = regenPerTurn * (1 + terrainBias[idx] * (flat ? 0 : 0.6)) + waveBuf[idx];
      const regen = rawRegen > regenFloor ? rawRegen : regenFloor;
      let v = diffused + regen;
      if (v < 0) v = 0;
      else if (v > ENERGY_MAX) v = ENERGY_MAX;
      next[idx] = v;
    }
  }
  energy.set(next);
}

function actLife(world: World, life: Life): void {
  const { width, height, energy, occupancy } = world;
  const g = life.genes;
  // v1.31: 上級設定（コスト等の倍率）。既定すべて1.0なので ×1.0 は恒等＝従来と一致。
  const adv = world.params.advanced;

  // v1.11: 速度は 1〜999 の sqrt スケール（線形だと崩壊するため）。
  //   1 ターンに加算される速度量 = sqrt(speed / 33.3)
  //     speed   1:  0.17/turn  → 約 6 turn に 1 歩
  //     speed  33:  1.00       → 毎ターン 1 歩
  //     speed 100:  1.73       → 約 2 歩
  //     speed 300:  3.0        → 3 歩
  //     speed 500:  3.87       → 約 4 歩
  //     speed 999:  5.48       → 約 5-6 歩（上限相当）
  //   高速個体は COST_SPEED_MAINT で短命確定（指数 1.7）。
  life.moveAccum += Math.sqrt(g.speed / 33.3);
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
    // ver.2: 海には入れない（海岸で停止）。
    if (world.terrain && world.terrain[newIdx] === 0) break;
    const oldIdx = life.y * width + life.x;
    occupancy[oldIdx] = -1;
    occupancy[newIdx] = life.id;
    life.x = nx;
    life.y = ny;
    steps++;
    life.energy -= COST_SPEED_PER_STEP * adv.costSpeedMul;
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
  // v1.30 (H11): 知能の吸収シナジー（旧 intel>50 で吸収+最大45%）を撤廃。
  //   知能を採餌から切り離し、価値を accuracy（行動の正確さ）に集約する。
  //   「賢い個体が採餌も得意」で他戦略を駆逐する現象を解消し、多様な戦略戦を促す
  //   （grid 検証：吸収撤廃＋コスト1/3＋乗算なし が種数・戦略バランス最良）。
  const absorb = Math.max(
    0,
    Math.min(available * ABSORB_RATE * adv.absorbMul, capacity)
  );
  energy[idx] = available - absorb;
  life.energy += absorb;

  // v1.01: 強さ・知能でコスト指数を別々に持たせる。
  // 強さ ^2.0（戦闘優位が直接効くため厳しめ）、知能 ^1.85（間接効果なので緩め）。
  // 戦闘は決定論。バランスは指数差で取る。
  const strengthCost =
    nonlinearGeneCost(g.strength, COST_STRENGTH, COST_STRENGTH_EXP) *
    adv.costStrengthMul;
  const intelligenceCost =
    nonlinearGeneCost(g.intelligence, COST_INTELLIGENCE, COST_INTELLIGENCE_EXP) *
    adv.costIntelligenceMul;
  // v1.11: 速度 100 超の維持コスト（指数 1.7）。
  // 速度 999 で約 7.5/turn、100 までは 0.15 以下で軽め。
  const speedMaintCost =
    nonlinearGeneCost(g.speed, COST_SPEED_MAINT, COST_SPEED_EXP) *
    adv.costSpeedMul;
  const upkeep =
    COST_BASE * adv.costBaseMul +
    COST_VISION * g.vision * adv.costVisionMul +
    intelligenceCost +
    strengthCost +
    speedMaintCost +
    COST_SIZE * g.size; // v1.11: COST_SIZE = 0 のため実質ゼロ
  life.energy -= upkeep;

  life.age++;

  if (life.energy <= 0) {
    if (life.protected) {
      // 保護中：餓死しない代わりにエネルギーを最低限維持
      life.energy = 1;
    } else {
      // 餓死：所持エネルギーは 0 なので、体の分解分（size*0.3）のみ場に還元
      life.alive = false;
      life.energy = 0;
      depositCarcassEnergy(world, life.x, life.y, g.size * 0.3);
      occupancy[idx] = -1;
    }
  }

  if (life.age >= g.lifespan) {
    if (life.protected) {
      // 保護中：寿命無視
    } else {
      // v1.20: 寿命死。残った所持エネルギー + 体の分解分（size*0.3）を分配方式で還元。
      // 戦闘死と同じく上限超過分は上下左右 4 セルに均等分配。
      life.alive = false;
      const remain = life.energy > 0 ? life.energy : 0;
      life.energy = 0;
      depositCarcassEnergy(world, life.x, life.y, remain + g.size * 0.3);
      occupancy[idx] = -1;
    }
  }

  if (life.alive && shouldReproduce(life)) {
    // 周囲の空き陸セルを列挙（reproduceLife 側で出産数遺伝子に応じて使用数を決める）。
    const emptyNeighbors = findEmptyNeighbors(world, life);
    // ver.2: 密度依存出産（世界地図のみ）。周囲の空き陸が REPRO_MIN_EMPTY_NEIGHBORS 未満なら
    // 過密とみなして出産を見送る → フロンティア（辺縁）駆動の logistic 成長になり、
    // 開始直後のオーバーシュート＆クラッシュを抑える。
    const dense =
      world.terrain != null &&
      emptyNeighbors.length < REPRO_MIN_EMPTY_NEIGHBORS;
    if (emptyNeighbors.length > 0 && !dense) {
      reproduceLife(world, life, emptyNeighbors);
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
// v1.10 perf: 視野内の敵情報を典型的な配列で持つ。各 findBestNeighborCell 呼び出し毎に
// オブジェクト割り当てが発生していたのを、モジュール共有のスクラッチバッファで再利用。
// シングルスレッド前提なので安全。
const ENEMY_CAP = 256;
const _eX = new Int16Array(ENEMY_CAP);
const _eY = new Int16Array(ENEMY_CAP);
const _eEnergy = new Float32Array(ENEMY_CAP);
const _eStrength = new Float32Array(ENEMY_CAP);
const _eDx = new Int8Array(ENEMY_CAP);
const _eDy = new Int8Array(ENEMY_CAP);
const _eWinnable = new Uint8Array(ENEMY_CAP);
// v1.20: 仲間情報も同様に SoA で保持。wGregarious / wLoyalty / wRepro の
// 「候補セル依存」化のため、位置とエネルギーを記録する。
const ALLY_CAP = 256;
const _aX = new Int16Array(ALLY_CAP);
const _aY = new Int16Array(ALLY_CAP);
const _aEnergy = new Float32Array(ALLY_CAP);

// ver.2: 出自コード→本拠地リージョンID（キャッシュ）。本拠地内かどうかの判定に使う。
let _homeIdMeta: World["regionMeta"];
let _homeIdMap: Map<string, number> | null = null;
function homeRegionIdOf(world: World, code: string | undefined): number {
  if (code == null) return -2; // 該当なし（海 -1 とも区別）
  if (_homeIdMeta !== world.regionMeta) {
    _homeIdMeta = world.regionMeta;
    _homeIdMap = new Map();
    if (world.regionMeta)
      for (const m of world.regionMeta) _homeIdMap.set(m.code, m.id);
  }
  return _homeIdMap?.get(code) ?? -2;
}

function findBestNeighborCell(
  world: World,
  life: Life
): { x: number; y: number } {
  const { width, height, energy, occupancy, livesById } = world;
  const g = life.genes;
  const intel = g.intelligence > 0 ? g.intelligence : 0;

  // 行動用 RNG（ターン × ライフID 由来で再現性維持）
  const rngSeed =
    ((world.turn + 1) * 2654435761) ^ ((life.id + 1) * 73856093);
  const rng = mulberry32(rngSeed >>> 0);

  // accuracy：知能の機能精度。0 なら完全ランダム
  const accuracy =
    intel >= ACCURACY_FULL_INTEL ? 1.0 : Math.sqrt(intel / ACCURACY_FULL_INTEL);
  if (accuracy === 0) {
    return randomNeighborOrStay(world, life, rng);
  }

  // 視野範囲：vision + 知能ボーナス（上限あり）
  // v1.10 Phase 4: 低 accuracy（知能 50 未満）の個体は視野を最小化して計算量を抑える。
  const visionBonusRaw = (intel / VISION_DEPTH_INTEL_PER_BONUS) | 0;
  const visionBonus =
    visionBonusRaw > VISION_DEPTH_BONUS_MAX
      ? VISION_DEPTH_BONUS_MAX
      : visionBonusRaw;
  const effectiveVision =
    accuracy < 0.5 ? (g.vision > 1 ? g.vision - 1 : 1) : g.vision;
  const depthRaw = effectiveVision + visionBonus;
  const depth = depthRaw < 1 ? 1 : depthRaw;
  const depthSq = depth * depth;
  const invDepth = 1 / depth;

  // 自分の状態
  const selfHunger =
    life.energy < g.size ? 1 - life.energy / g.size : 0; // 0=満腹, 1=空腹

  // 重み遺伝子（0〜100 → 0〜1 正規化）
  const wA = g.wAppetite * 0.01;
  const wP = g.wPredation * 0.01;
  const wC = g.wCaution * 0.01;
  const wG = g.wGregarious * 0.01;
  const wL = g.wLoyalty * 0.01;
  const wR = g.wRepro * 0.01;
  const wS = g.wStarvSensitive * 0.01;

  // 視野内の生命を事前スキャン（仲間集計 + 敵リスト）
  // v1.10: 視野は円形（ユークリッド距離）で判定する
  const lx = life.x;
  const ly = life.y;
  const speciesId = life.speciesId;
  // ver.2: 同じ出自（大陸系統）は色が違っても味方（協力関係）。
  const myOrigin = life.origin;
  // ver.2: 本拠地（自分の出自地域）の中にいる間は同出自でも競争（敵）＝内部競争。外では協力。
  const iAmHome =
    myOrigin != null &&
    world.regions != null &&
    world.regions[life.y * width + life.x] === homeRegionIdOf(world, myOrigin);
  const myStrength = g.strength;
  let allyCount = 0;
  let enemyCount = 0;
  const halfW = width / 2;
  const halfH = height / 2;

  for (let dy = -depth; dy <= depth; dy++) {
    for (let dx = -depth; dx <= depth; dx++) {
      const distSq = dx * dx + dy * dy;
      if (distSq > depthSq) continue;
      if (dx === 0 && dy === 0) continue;
      let nx = lx + dx;
      if (nx < 0) nx += width;
      else if (nx >= width) nx -= width;
      let ny = ly + dy;
      if (ny < 0) ny += height;
      else if (ny >= height) ny -= height;
      const idx = ny * width + nx;
      const occId = occupancy[idx];
      if (occId === -1) continue;
      const other = livesById.get(occId);
      if (!other || !other.alive) continue;
      if (other.speciesId === speciesId || (myOrigin != null && other.origin === myOrigin && !iAmHome)) {
        // v1.20: 仲間も位置を記録（wG/wL/wR の候補セル依存化のため）
        if (allyCount < ALLY_CAP) {
          _aX[allyCount] = nx;
          _aY[allyCount] = ny;
          _aEnergy[allyCount] = other.energy;
          allyCount++;
        }
      } else if (enemyCount < ENEMY_CAP) {
        const og = other.genes;
        const enemyDef = og.strength + og.size * 0.05;
        _eX[enemyCount] = nx;
        _eY[enemyCount] = ny;
        _eEnergy[enemyCount] = other.energy;
        _eStrength[enemyCount] = og.strength;
        _eDx[enemyCount] = other.dx;
        _eDy[enemyCount] = other.dy;
        _eWinnable[enemyCount] = myStrength > enemyDef ? 1 : 0;
        enemyCount++;
      }
    }
  }

  // 各セルのスコアを計算して最大を求める
  let bestX = lx;
  let bestY = ly;
  let bestScore = -Infinity;

  for (let dy = -depth; dy <= depth; dy++) {
    for (let dx = -depth; dx <= depth; dx++) {
      const distSq = dx * dx + dy * dy;
      if (distSq > depthSq) continue;
      let nx = lx + dx;
      if (nx < 0) nx += width;
      else if (nx >= width) nx -= width;
      let ny = ly + dy;
      if (ny < 0) ny += height;
      else if (ny >= height) ny -= height;
      const idx = ny * width + nx;
      // 移動先は空きセル（自セルは例外）
      if (occupancy[idx] !== -1 && (dx !== 0 || dy !== 0)) continue;

      // === 入力特徴量 ===
      const f_energy = energy[idx] * 0.01;
      const dist = distSq > 0 ? Math.sqrt(distSq) : 0;
      const f_dist = dist * invDepth;
      const f_starvHunger = f_energy * selfHunger;

      // v1.20: 候補セルから「最も近い仲間」までの距離を計算（wG/wL の候補セル依存化）
      let f_allyNear = 0;
      let f_strongAllyNear = 0;
      if (allyCount > 0) {
        let nearestAllySq = Infinity;
        let nearestAllyEnergy = 0;
        for (let k = 0; k < allyCount; k++) {
          let adx = _aX[k] - nx;
          let ady = _aY[k] - ny;
          if (adx > halfW) adx -= width;
          else if (adx < -halfW) adx += width;
          if (ady > halfH) ady -= height;
          else if (ady < -halfH) ady += height;
          const aDistSq = adx * adx + ady * ady;
          if (aDistSq < nearestAllySq) {
            nearestAllySq = aDistSq;
            nearestAllyEnergy = _aEnergy[k];
          }
        }
        if (nearestAllySq !== Infinity) {
          const d = Math.sqrt(nearestAllySq);
          const proximity = 1 - d * invDepth;
          if (proximity > 0) {
            f_allyNear = proximity;
            const eClamp = nearestAllyEnergy > 100 ? 1 : nearestAllyEnergy * 0.01;
            f_strongAllyNear = proximity * eClamp;
          }
        }
      }
      // v1.20: 候補セル周囲 8 セルの空き数（wRepro の候補セル依存化＝繁殖余地）
      let emptyAround = 0;
      for (let k = 0; k < 8; k++) {
        let ax = nx + NEIGHBOR_DX[k];
        if (ax < 0) ax += width;
        else if (ax >= width) ax -= width;
        let ay = ny + NEIGHBOR_DY[k];
        if (ay < 0) ay += height;
        else if (ay >= height) ay -= height;
        if (occupancy[ay * width + ax] === -1) emptyAround++;
      }
      const f_emptyAround = emptyAround * 0.125; // /8

      // 敵との関係（最も近い「倒せる敵」「倒せない敵」を探す）
      // perf: 二乗距離で比較し、最後だけ sqrt
      let f_prey = 0;
      let f_threat = 0;
      let f_approach = 0;
      if (enemyCount > 0) {
        let nearestPreySq = Infinity;
        let nearestPreyEnergy = 0;
        let nearestThreatSq = Infinity;
        let nearestThreatStrength = 0;
        let nearestThreatApproachRaw = 0;
        for (let k = 0; k < enemyCount; k++) {
          let edx = _eX[k] - nx;
          let edy = _eY[k] - ny;
          if (edx > halfW) edx -= width;
          else if (edx < -halfW) edx += width;
          if (edy > halfH) edy -= height;
          else if (edy < -halfH) edy += height;
          const eDistSq = edx * edx + edy * edy;
          if (_eWinnable[k]) {
            if (eDistSq < nearestPreySq) {
              nearestPreySq = eDistSq;
              nearestPreyEnergy = _eEnergy[k];
            }
          } else if (eDistSq < nearestThreatSq) {
            nearestThreatSq = eDistSq;
            nearestThreatStrength = _eStrength[k];
            // 接近度：敵の (dx, dy) と「敵→自分」ベクトルの内積
            const dot = -_eDx[k] * edx + -_eDy[k] * edy;
            const half = dot * 0.5;
            nearestThreatApproachRaw =
              half > 1 ? 1 : half < -1 ? -1 : half;
          }
        }
        if (nearestPreySq !== Infinity) {
          const d = Math.sqrt(nearestPreySq);
          const proximity = 1 - d * invDepth;
          if (proximity > 0) {
            const eClamp = nearestPreyEnergy > 100 ? 1 : nearestPreyEnergy * 0.01;
            f_prey = proximity * eClamp;
          }
        }
        if (nearestThreatSq !== Infinity) {
          const d = Math.sqrt(nearestThreatSq);
          const proximity = 1 - d * invDepth;
          if (proximity > 0) {
            const sClamp =
              nearestThreatStrength > 999 ? 1 : nearestThreatStrength / 999;
            f_threat = proximity * sClamp;
          }
          if (nearestThreatApproachRaw > 0) f_approach = nearestThreatApproachRaw;
        }
      }

      // === 重み × 特徴の線形和 ===
      // v1.20: wG/wL/wR が候補セル依存の特徴になり、行動に正しく作用する。
      //   wG * f_allyNear       : 候補セルが仲間に近いか（群居性）
      //   wL * f_strongAllyNear : 強い仲間に近いか（強者追従）
      //   wR * f_emptyAround    : 候補セル周囲の空きセル数（繁殖余地）
      const weightedSum =
        wA * f_energy +
        wP * f_prey -
        wC * (f_threat + 0.5 * f_approach) +
        wG * f_allyNear +
        wL * f_strongAllyNear +
        wR * f_emptyAround +
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

/** v1.31 (H9): 思考ヒートマップ用の候補セルとスコア。 */
export type DecisionCell = { x: number; y: number; score: number; chosen: boolean };

/**
 * v1.31 (H9): 選択個体の「思考」を可視化するため、findBestNeighborCell と同じ採点を
 * 再現し、視野内の各候補セルのスコアを返す。
 *
 * ※ read-only。シミュレーション本体（stepWorld）からは呼ばれず、描画層から選択個体に
 *    対してのみ呼ばれる。findBestNeighborCell 本体には一切手を加えていない。
 *    採点ロジックは findBestNeighborCell と一致させること（片方を変えたら両方更新）。
 *    モジュール共有スクラッチ配列（_aX 等）を使うが、RAF のフレーム間に呼ばれるため
 *    stepWorld と同時実行されず安全。
 */
export function computeDecisionField(world: World, life: Life): DecisionCell[] {
  if (!life.alive) return [];
  const { width, height, energy, occupancy, livesById } = world;
  const g = life.genes;
  const intel = g.intelligence > 0 ? g.intelligence : 0;

  const rngSeed =
    ((world.turn + 1) * 2654435761) ^ ((life.id + 1) * 73856093);
  const rng = mulberry32(rngSeed >>> 0);

  const accuracy =
    intel >= ACCURACY_FULL_INTEL ? 1.0 : Math.sqrt(intel / ACCURACY_FULL_INTEL);
  // 知能 0（完全ランダム）は意味のある思考マップが無い。
  if (accuracy === 0) return [];

  const visionBonusRaw = (intel / VISION_DEPTH_INTEL_PER_BONUS) | 0;
  const visionBonus =
    visionBonusRaw > VISION_DEPTH_BONUS_MAX
      ? VISION_DEPTH_BONUS_MAX
      : visionBonusRaw;
  const effectiveVision =
    accuracy < 0.5 ? (g.vision > 1 ? g.vision - 1 : 1) : g.vision;
  const depthRaw = effectiveVision + visionBonus;
  const depth = depthRaw < 1 ? 1 : depthRaw;
  const depthSq = depth * depth;
  const invDepth = 1 / depth;

  const selfHunger = life.energy < g.size ? 1 - life.energy / g.size : 0;

  const wA = g.wAppetite * 0.01;
  const wP = g.wPredation * 0.01;
  const wC = g.wCaution * 0.01;
  const wG = g.wGregarious * 0.01;
  const wL = g.wLoyalty * 0.01;
  const wR = g.wRepro * 0.01;
  const wS = g.wStarvSensitive * 0.01;

  const lx = life.x;
  const ly = life.y;
  const speciesId = life.speciesId;
  // ver.2: 同じ出自（大陸系統）は色が違っても味方（協力関係）。
  const myOrigin = life.origin;
  // ver.2: 本拠地（自分の出自地域）の中にいる間は同出自でも競争（敵）＝内部競争。外では協力。
  const iAmHome =
    myOrigin != null &&
    world.regions != null &&
    world.regions[life.y * width + life.x] === homeRegionIdOf(world, myOrigin);
  const myStrength = g.strength;
  let allyCount = 0;
  let enemyCount = 0;
  const halfW = width / 2;
  const halfH = height / 2;

  for (let dy = -depth; dy <= depth; dy++) {
    for (let dx = -depth; dx <= depth; dx++) {
      const distSq = dx * dx + dy * dy;
      if (distSq > depthSq) continue;
      if (dx === 0 && dy === 0) continue;
      let nx = lx + dx;
      if (nx < 0) nx += width;
      else if (nx >= width) nx -= width;
      let ny = ly + dy;
      if (ny < 0) ny += height;
      else if (ny >= height) ny -= height;
      const idx = ny * width + nx;
      const occId = occupancy[idx];
      if (occId === -1) continue;
      const other = livesById.get(occId);
      if (!other || !other.alive) continue;
      if (other.speciesId === speciesId || (myOrigin != null && other.origin === myOrigin && !iAmHome)) {
        if (allyCount < ALLY_CAP) {
          _aX[allyCount] = nx;
          _aY[allyCount] = ny;
          _aEnergy[allyCount] = other.energy;
          allyCount++;
        }
      } else if (enemyCount < ENEMY_CAP) {
        const og = other.genes;
        const enemyDef = og.strength + og.size * 0.05;
        _eX[enemyCount] = nx;
        _eY[enemyCount] = ny;
        _eEnergy[enemyCount] = other.energy;
        _eStrength[enemyCount] = og.strength;
        _eDx[enemyCount] = other.dx;
        _eDy[enemyCount] = other.dy;
        _eWinnable[enemyCount] = myStrength > enemyDef ? 1 : 0;
        enemyCount++;
      }
    }
  }

  const cells: DecisionCell[] = [];
  let bestX = lx;
  let bestY = ly;
  let bestScore = -Infinity;

  for (let dy = -depth; dy <= depth; dy++) {
    for (let dx = -depth; dx <= depth; dx++) {
      const distSq = dx * dx + dy * dy;
      if (distSq > depthSq) continue;
      let nx = lx + dx;
      if (nx < 0) nx += width;
      else if (nx >= width) nx -= width;
      let ny = ly + dy;
      if (ny < 0) ny += height;
      else if (ny >= height) ny -= height;
      const idx = ny * width + nx;
      if (occupancy[idx] !== -1 && (dx !== 0 || dy !== 0)) continue;

      const f_energy = energy[idx] * 0.01;
      const dist = distSq > 0 ? Math.sqrt(distSq) : 0;
      const f_dist = dist * invDepth;
      const f_starvHunger = f_energy * selfHunger;

      let f_allyNear = 0;
      let f_strongAllyNear = 0;
      if (allyCount > 0) {
        let nearestAllySq = Infinity;
        let nearestAllyEnergy = 0;
        for (let k = 0; k < allyCount; k++) {
          let adx = _aX[k] - nx;
          let ady = _aY[k] - ny;
          if (adx > halfW) adx -= width;
          else if (adx < -halfW) adx += width;
          if (ady > halfH) ady -= height;
          else if (ady < -halfH) ady += height;
          const aDistSq = adx * adx + ady * ady;
          if (aDistSq < nearestAllySq) {
            nearestAllySq = aDistSq;
            nearestAllyEnergy = _aEnergy[k];
          }
        }
        if (nearestAllySq !== Infinity) {
          const d = Math.sqrt(nearestAllySq);
          const proximity = 1 - d * invDepth;
          if (proximity > 0) {
            f_allyNear = proximity;
            const eClamp = nearestAllyEnergy > 100 ? 1 : nearestAllyEnergy * 0.01;
            f_strongAllyNear = proximity * eClamp;
          }
        }
      }
      let emptyAround = 0;
      for (let k = 0; k < 8; k++) {
        let ax = nx + NEIGHBOR_DX[k];
        if (ax < 0) ax += width;
        else if (ax >= width) ax -= width;
        let ay = ny + NEIGHBOR_DY[k];
        if (ay < 0) ay += height;
        else if (ay >= height) ay -= height;
        if (occupancy[ay * width + ax] === -1) emptyAround++;
      }
      const f_emptyAround = emptyAround * 0.125;

      let f_prey = 0;
      let f_threat = 0;
      let f_approach = 0;
      if (enemyCount > 0) {
        let nearestPreySq = Infinity;
        let nearestPreyEnergy = 0;
        let nearestThreatSq = Infinity;
        let nearestThreatStrength = 0;
        let nearestThreatApproachRaw = 0;
        for (let k = 0; k < enemyCount; k++) {
          let edx = _eX[k] - nx;
          let edy = _eY[k] - ny;
          if (edx > halfW) edx -= width;
          else if (edx < -halfW) edx += width;
          if (edy > halfH) edy -= height;
          else if (edy < -halfH) edy += height;
          const eDistSq = edx * edx + edy * edy;
          if (_eWinnable[k]) {
            if (eDistSq < nearestPreySq) {
              nearestPreySq = eDistSq;
              nearestPreyEnergy = _eEnergy[k];
            }
          } else if (eDistSq < nearestThreatSq) {
            nearestThreatSq = eDistSq;
            nearestThreatStrength = _eStrength[k];
            const dot = -_eDx[k] * edx + -_eDy[k] * edy;
            const half = dot * 0.5;
            nearestThreatApproachRaw = half > 1 ? 1 : half < -1 ? -1 : half;
          }
        }
        if (nearestPreySq !== Infinity) {
          const d = Math.sqrt(nearestPreySq);
          const proximity = 1 - d * invDepth;
          if (proximity > 0) {
            const eClamp = nearestPreyEnergy > 100 ? 1 : nearestPreyEnergy * 0.01;
            f_prey = proximity * eClamp;
          }
        }
        if (nearestThreatSq !== Infinity) {
          const d = Math.sqrt(nearestThreatSq);
          const proximity = 1 - d * invDepth;
          if (proximity > 0) {
            const sClamp =
              nearestThreatStrength > 999 ? 1 : nearestThreatStrength / 999;
            f_threat = proximity * sClamp;
          }
          if (nearestThreatApproachRaw > 0) f_approach = nearestThreatApproachRaw;
        }
      }

      const weightedSum =
        wA * f_energy +
        wP * f_prey -
        wC * (f_threat + 0.5 * f_approach) +
        wG * f_allyNear +
        wL * f_strongAllyNear +
        wR * f_emptyAround +
        wS * f_starvHunger;

      const noise = (1 - accuracy) * (rng() - 0.5) * 2;
      const score = accuracy * weightedSum + noise - 0.3 * f_dist;

      cells.push({ x: nx, y: ny, score, chosen: false });
      if (score > bestScore) {
        bestScore = score;
        bestX = nx;
        bestY = ny;
      }
    }
  }
  for (const c of cells) {
    if (c.x === bestX && c.y === bestY) {
      c.chosen = true;
      break;
    }
  }
  return cells;
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

/**
 * v1.20: 個体の「行動の特徴」を分かりやすく文章化するためのデータを返す。
 *
 * 「同じ距離・同じ条件で複数の対象（餌・天敵・仲間など）がいたら何を優先するか」を、
 * 重み遺伝子の大小から導出。性格タグより具体的で観察しやすい。
 *
 * 戻り値は i18n キーと重み値のペア配列（重み降順、上位のみ）。
 * UI 側でローカライズして「餌を追う(85) / 強敵から逃げる(70) …」のように表示する。
 */
export type BehaviorTrait = { key: string; weight: number };

export function describeBehavior(life: Life): BehaviorTrait[] {
  if (!life.alive) return [];
  const g = life.genes;
  const intel = Math.max(0, g.intelligence);
  // 知能 0：完全ランダム
  if (intel <= 0) return [{ key: "behavior_desc.random", weight: 0 }];

  const traits: BehaviorTrait[] = [
    { key: "behavior_desc.chase_prey", weight: g.wPredation },
    { key: "behavior_desc.flee_threat", weight: g.wCaution },
    { key: "behavior_desc.follow_strong", weight: g.wLoyalty },
    { key: "behavior_desc.gather", weight: g.wGregarious },
    { key: "behavior_desc.forage", weight: g.wAppetite },
    { key: "behavior_desc.seek_breeding", weight: g.wRepro },
  ];
  traits.sort((a, b) => b.weight - a.weight);
  // 重み 40 以上の「ある程度反応する」傾向を上位 3 つまで
  const top = traits.filter((t) => t.weight >= 40).slice(0, 3);
  if (top.length === 0) {
    // すべての重みが低い＝消極的（食べて繁殖する以外あまり動かない）
    return [{ key: "behavior_desc.passive", weight: 0 }];
  }
  return top;
}

/**
 * v1.30 (う): 行動・能力を「文章」で表すための記述子キー列を返す。
 * 例 ["trait.fast","trait.smart","trait.predatory"] → UI 側で
 * 「俊敏で知的で獰猛な個体」/「fast, smart, predatory creature」に組み立てる。
 * 能力（速度/知能/強さ/体格）の最も顕著な 1〜2 個 ＋ 行動の最上位 1 個。
 */
export function describeBehaviorPhrase(life: Life): string[] {
  if (!life.alive) return [];
  const g = life.genes;
  if (Math.max(0, g.intelligence) <= 0) return ["trait.random"];

  // 能力の顕著さ＝中央値からの正規化偏差。大きい順に最大2つ採用。
  const abil: { key: string; dev: number }[] = [];
  const consider = (
    v: number,
    mid: number,
    span: number,
    hi: string,
    lo: string,
    th: number
  ): void => {
    const d = (v - mid) / span;
    if (Math.abs(d) >= th) abil.push({ key: d > 0 ? hi : lo, dev: Math.abs(d) });
  };
  consider(g.speed, 50, 50, "trait.fast", "trait.slow", 0.3);
  consider(g.intelligence, 50, 50, "trait.smart", "trait.dull", 0.3);
  consider(g.strength, 50, 50, "trait.strong", "trait.weak", 0.3);
  consider(g.size, 115, 85, "trait.big", "trait.small", 0.35);
  abil.sort((a, b) => b.dev - a.dev);
  const abilKeys = abil.slice(0, 2).map((a) => a.key);

  // 行動の最上位（重み最大・しきい値以上、なければ温厚）。
  const beh: { key: string; w: number }[] = [
    { key: "trait.predatory", w: g.wPredation },
    { key: "trait.timid", w: g.wCaution },
    { key: "trait.loyal", w: g.wLoyalty },
    { key: "trait.social", w: g.wGregarious },
    { key: "trait.greedy", w: g.wAppetite },
    { key: "trait.prolific", w: g.wRepro },
  ];
  beh.sort((a, b) => b.w - a.w);
  const behKey = beh[0].w >= 55 ? beh[0].key : "trait.calm";

  return [...abilKeys, behKey];
}

/**
 * v1.20: その個体の判断が「正確か / 気まぐれか」を accuracy から判定。
 * UI で行動特徴に注釈を添えるのに使う。
 */
export function behaviorAccuracyNote(life: Life): "precise" | "unstable" | "random" {
  const intel = Math.max(0, life.genes.intelligence);
  if (intel <= 0) return "random";
  const accuracy = intel >= ACCURACY_FULL_INTEL ? 1 : Math.sqrt(intel / ACCURACY_FULL_INTEL);
  return accuracy < 0.5 ? "unstable" : "precise";
}

/** 隣接 8 セルからランダムな空きセルを返す。なければ自身位置。 */
function randomNeighborOrStay(
  world: World,
  life: Life,
  rng: RNG
): { x: number; y: number } {
  const { width, height, occupancy, terrain } = world;
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
    if (occupancy[idx] === -1 && (!terrain || terrain[idx] === 1)) return { x: nx, y: ny };
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

function shouldReproduce(life: Life): boolean {
  const g = life.genes;
  const minAge = g.lifespan * MIN_REPRODUCTIVE_AGE_RATIO;
  // v1.20: 出産閾値（birthThreshold）方式。所持エネルギーが実効閾値を超えたら出産。
  //   実効閾値 = min(birthThreshold, size * 0.9)
  //   - birthThreshold が体格（タンク容量 size）を超えると永遠に出産不可になるため、
  //     size*0.9 でクランプ（タンクの 9 割まで貯めれば必ず出産可能）。
  //   低い閾値 = 早く頻繁に産む（r 戦略）／高い閾値 = じっくり育てて産む（K 戦略）
  //
  // 暗黙のトレードオフ: 閾値が低い → 親エネルギー少ない → 子も低エネルギーで
  // 生まれる（reproduceLife の均等分割により）→ 子の生存が厳しくなる。
  const effectiveThreshold = Math.min(g.birthThreshold, g.size * 0.9);
  return life.age >= minAge && life.energy >= effectiveThreshold;
}

/**
 * 周囲 8 セルの「空き陸セル」をすべて列挙する（最大 8）。
 * 多産（offspringCount > 1）対応。実際の使用数は reproduceLife 側で出産数遺伝子に応じて決める。
 * ver.2: 戻り値の length は密度依存出産（過密判定）にも使う。空きがなければ空配列。
 */
function findEmptyNeighbors(
  world: World,
  life: Life
): { x: number; y: number }[] {
  const { width, height, occupancy, terrain } = world;
  const result: { x: number; y: number }[] = [];
  const x = life.x;
  const y = life.y;
  for (let i = 0; i < 8; i++) {
    let nx = x + NEIGHBOR_DX[i];
    if (nx < 0) nx += width;
    else if (nx >= width) nx -= width;
    let ny = y + NEIGHBOR_DY[i];
    if (ny < 0) ny += height;
    else if (ny >= height) ny -= height;
    const idx = ny * width + nx;
    // ver.2: 海には出産しない。
    if (occupancy[idx] === -1 && (!terrain || terrain[idx] === 1)) {
      result.push({ x: nx, y: ny });
    }
  }
  return result;
}

/**
 * v1.11: 多産対応の出産処理。
 *
 * 親の出産数遺伝子 N（1〜10）に応じて子を N 体出産しようとする。
 * 空きセルが不足した場合は実際に生まれる数が制限される。
 *
 * エネルギー分割（案 A：完全均等）：
 *   親 + 子 N 体に均等分割 → 各個体が parent.energy / (N+1)
 *   実際に生まれた子 K 体 ≤ N の場合も同じ「N+1 等分」ルール（あぶれた分は親に戻る）
 *
 * これにより多産は子のエネルギーが少なくなる自然なトレードオフが生まれる。
 */
function reproduceLife(
  world: World,
  parent: Life,
  emptyPositions: { x: number; y: number }[]
): void {
  if (emptyPositions.length === 0) return;
  const rng = mulberry32((world.turn * 73856093) ^ (parent.id * 19349663) >>> 0);
  // v1.10: 全個体共通の固定突然変異率 × 環境設定の倍率（0 設定で完全コピー）
  const effectiveMutationRate = clamp(
    BASE_MUTATION_RATE * world.params.mutationRateMultiplier,
    0,
    1
  );

  // 親の出産数遺伝子（1〜10）の範囲で、空きセル数以下までを実出産数に
  const wanted = Math.max(
    1,
    Math.min(GENE_OFFSPRING_MAX, Math.round(parent.genes.offspringCount))
  );
  const actual = Math.min(wanted, emptyPositions.length);
  if (actual === 0) return;

  // エネルギー分割：親 + 子 wanted 体に均等分割（実出産数 actual に関わらず）
  // 余り（あぶれた子の分）は親に戻る仕様 = 親が他にエネルギーを保つ自然な式
  const share = parent.energy / (wanted + 1);
  const childEnergy = share;
  // v1.20: 案 X1 - 出産疲労コスト。多産個体は親も消耗する。
  //   N=1: log(2) ≈ 0.69 → 親追加消耗 = 0.069 × share
  //   N=5: log(6) ≈ 1.79 → 0.179 × share
  //   N=10: log(11) ≈ 2.40 → 0.240 × share
  // multi-birth の暴走を構造的に抑制し、r/K 戦略の多様性を保つ。
  // 50×50 小世界では 2/10 絶滅程度。本格的な集団崩壊（多産暴走）を防ぐ意味で
  // 係数 0.1 を維持。
  const fatigueCost = share * 0.1 * Math.log(wanted + 1);
  const parentRemain = parent.energy - share * actual - fatigueCost;
  parent.energy = parentRemain > 0 ? parentRemain : 0;

  for (let i = 0; i < actual; i++) {
    const childPos = emptyPositions[i];
    let childGenes = mutatGenes(parent.genes, effectiveMutationRate, rng);
    childGenes = applyDisabledGenes(childGenes, world.params.disabledGenes);
    const childSpeciesId = speciesIdFromGenes(childGenes);
    // v1.31 (A5): 種分化（親と別の色ビン）の初出を系統樹に記録する。
    // 乱数は消費しない＝シミュレーションの決定性に影響しない（観察用の副記録）。
    if (
      childSpeciesId !== parent.speciesId &&
      !world.speciesLineage.has(childSpeciesId)
    ) {
      const cc = speciesColorFromGenes(childGenes);
      const origin = parent.origin;
      let seq: number | undefined;
      if (origin) {
        seq = 0;
        for (const n of world.speciesLineage.values()) if (n.origin === origin) seq++;
      }
      world.speciesLineage.set(childSpeciesId, {
        id: childSpeciesId,
        parentId: parent.speciesId,
        birthTurn: world.turn,
        r: cc.r,
        g: cc.g,
        b: cc.b,
        origin,
        seq,
      });
    }
    // ver.2 (系統樹): 種分化のたびに新しい系統ノードを親の系統IDの下に作る（色ビン再利用に強い）。
    let childLineageId = parent.lineageId ?? 0;
    if (childSpeciesId !== parent.speciesId) {
      const sln = world.speciesLineage.get(childSpeciesId);
      childLineageId = world.nextLineageId++;
      world.lineageNodes.push({
        id: childLineageId,
        parentId: parent.lineageId ?? null,
        birthTurn: world.turn,
        speciesId: childSpeciesId,
        r: sln?.r ?? 128,
        g: sln?.g ?? 128,
        b: sln?.b ?? 128,
        // 出自は親から不変で継承（単為生殖）。色ビンの最初の出自に引きずられないようにする。
        origin: parent.origin,
        seq: sln?.seq,
      });
    }
    // v1.30 (H8): 誕生時に変異した主要遺伝子と「新種か」を記録（観察用ハイライト）。
    const pg = parent.genes;
    const muts: string[] = [];
    if (Math.abs(childGenes.vision - pg.vision) > 0.5) muts.push("info.vision");
    if (Math.abs(childGenes.speed - pg.speed) > 0.5) muts.push("info.move_speed");
    if (Math.abs(childGenes.size - pg.size) > 0.5) muts.push("info.size");
    if (Math.abs(childGenes.strength - pg.strength) > 0.5) muts.push("info.strength");
    if (Math.abs(childGenes.intelligence - pg.intelligence) > 0.5)
      muts.push("info.intelligence");
    if (Math.abs(childGenes.birthThreshold - pg.birthThreshold) > 0.5)
      muts.push("info.birth_threshold");
    if (Math.abs(childGenes.lifespan - pg.lifespan) > 0.5)
      muts.push("info.lifespan");
    if (Math.abs(childGenes.offspringCount - pg.offspringCount) > 0.5)
      muts.push("info.offspring_count");

    const idx = childPos.y * world.width + childPos.x;
    const childLife: Life = {
      id: world.nextLifeId++,
      x: childPos.x,
      y: childPos.y,
      // 親マスから子位置へ「分裂・移動」する演出
      prevX: parent.x,
      prevY: parent.y,
      energy: childEnergy,
      age: 0,
      speciesId: childSpeciesId,
      genes: childGenes,
      alive: true,
      moveAccum: 0,
      // v1.10: 向きは初期 0（静止状態）
      dx: 0,
      dy: 0,
      // v1.30 (H8): 観察用ハイライト
      bornMutations: muts.length ? muts : undefined,
      bornNewSpecies: childSpeciesId !== parent.speciesId || undefined,
      // ver.2: 出生地は親から不変で継承（祖先の出自）。
      origin: parent.origin,
      // ver.2 (系統樹): 系統IDを継承（種分化時は上で発行した新ID）。
      lineageId: childLineageId,
    };
    world.lives.push(childLife);
    world.livesById.set(childLife.id, childLife);
    world.occupancy[idx] = childLife.id;
  }
}

// v1.10 perf: モジュール共有の隣接オフセット（配列リテラル割り当てを回避）
const NEIGHBOR_DX = new Int8Array([-1, 0, 1, -1, 1, -1, 0, 1]);
const NEIGHBOR_DY = new Int8Array([-1, -1, -1, 0, 0, 1, 1, 1]);

/**
 * v1.20: 死骸エネルギーを (x,y) セルに付与する共通処理。
 * セル上限 ENERGY_MAX を超えた分は上下左右 4 セルに均等分配（あふれは消滅）。
 *
 * 戦闘死・寿命死・餓死すべてで使用。死んだ生命のエネルギーが場に還元され、
 * 「死骸ホットスポット」を作って捕食連鎖や採餌を誘発する。
 */
function depositCarcassEnergy(
  world: World,
  x: number,
  y: number,
  amount: number
): void {
  if (amount <= 0) return;
  const { width, height, energy } = world;
  const idx = y * width + x;
  const total = energy[idx] + amount;
  if (total <= ENERGY_MAX) {
    energy[idx] = total;
    return;
  }
  energy[idx] = ENERGY_MAX;
  const share = (total - ENERGY_MAX) * 0.25;
  const xN = (x + 1) % width;
  const xP = (x - 1 + width) % width;
  const yN = (y + 1) % height;
  const yP = (y - 1 + height) % height;
  const i1 = y * width + xN;
  const i2 = y * width + xP;
  const i3 = yN * width + x;
  const i4 = yP * width + x;
  const v1 = energy[i1] + share;
  const v2 = energy[i2] + share;
  const v3 = energy[i3] + share;
  const v4 = energy[i4] + share;
  energy[i1] = v1 > ENERGY_MAX ? ENERGY_MAX : v1;
  energy[i2] = v2 > ENERGY_MAX ? ENERGY_MAX : v2;
  energy[i3] = v3 > ENERGY_MAX ? ENERGY_MAX : v3;
  energy[i4] = v4 > ENERGY_MAX ? ENERGY_MAX : v4;
}

/**
 * v1.30 (案1): 仲間へのエネルギー提供（血縁淘汰・利他の進化）。
 * 各個体が1ターンに1回、隣接3x3の同種(=近縁)のうち最も困窮した個体へ、
 * 自分の余剰エネルギーの一部を分け与える。
 *  - wShare 遺伝子で利他性が進化（0=利己, 100=高利他）。
 *  - 知能(accuracy)が高いほど転送効率が上がる（ロスが減る）。
 *  - 転送ロスは場に還元（エネルギー保存）。
 * actLife ループの前に呼ぶことで、瀕死の近縁が餓死判定の前に救われ得る。
 */
function shareEnergyPhase(world: World): void {
  if (!world.params.energyShareEnabled) return;
  const { width, height, occupancy, livesById } = world;
  for (const donor of world.lives) {
    if (!donor.alive) continue;
    const g = donor.genes;
    const willingness = g.wShare / GENE_WEIGHT_MAX;
    if (willingness <= 0) continue;
    // 自分用の確保分を超えた「余剰」だけを分配対象にする。
    const reserve = g.size * SHARE_DONOR_RESERVE_RATIO;
    const surplus = donor.energy - reserve;
    if (surplus < SHARE_MIN_AMOUNT) continue;
    const dx0 = donor.x;
    const dy0 = donor.y;
    // 隣接3x3の同種から受け手を選ぶ。
    // assortment 版: 優先度 = 困窮度 × 相手の利他性（利他的な近縁を優先、タダ乗りは助けない）。
    // 素朴版: 優先度 = 困窮度のみ。
    let bestRecipient: Life | null = null;
    let bestNeed = 0;
    let bestPriority = 0;
    for (let i = 0; i < 8; i++) {
      let nx = dx0 + NEIGHBOR_DX[i];
      if (nx < 0) nx += width;
      else if (nx >= width) nx -= width;
      let ny = dy0 + NEIGHBOR_DY[i];
      if (ny < 0) ny += height;
      else if (ny >= height) ny -= height;
      const occId = occupancy[ny * width + nx];
      if (occId === -1) continue;
      const nb = livesById.get(occId);
      if (!nb || !nb.alive) continue;
      if (nb.speciesId !== donor.speciesId) continue;
      const need = nb.genes.size * SHARE_RECIPIENT_NEED_RATIO - nb.energy;
      if (need <= 0) continue;
      const priority = SHARE_ASSORTATIVE
        ? need * (nb.genes.wShare / GENE_WEIGHT_MAX)
        : need;
      if (priority > bestPriority) {
        bestPriority = priority;
        bestNeed = need;
        bestRecipient = nb;
      }
    }
    if (!bestRecipient || bestNeed < SHARE_MIN_AMOUNT) continue;
    // 提供量 = min(余剰, 相手の不足) × 係数 × 利他性。
    const give = Math.min(surplus, bestNeed) * SHARE_FRACTION * willingness;
    if (give < SHARE_MIN_AMOUNT) continue;
    // 知能(accuracy)で転送効率。低知能ほどロスが大きい。
    const accuracy =
      g.intelligence >= ACCURACY_FULL_INTEL
        ? 1
        : Math.sqrt(g.intelligence / ACCURACY_FULL_INTEL);
    const efficiency = SHARE_EFF_BASE + (1 - SHARE_EFF_BASE) * accuracy;
    donor.energy -= give;
    bestRecipient.energy += give * efficiency;
    const loss = give * (1 - efficiency);
    if (loss > 0) depositCarcassEnergy(world, dx0, dy0, loss);
    // 可視化用フラッシュ（小○がドナー→受け手へ流れる）。上限超過時はスキップ。
    // 表示自体は速度・マップサイズ依存で SimulationCanvas 側が間引く。
    if (world.shareFlashes.length < MAX_SHARE_FLASHES) {
      world.shareFlashes.push({
        fromId: donor.id,
        toId: bestRecipient.id,
        fromX: dx0,
        fromY: dy0,
        toX: bestRecipient.x,
        toY: bestRecipient.y,
        r: binCenterColor(g.r),
        g: binCenterColor(g.g),
        b: binCenterColor(g.b),
        startTurn: world.turn,
        durationTurns: SHARE_FLASH_DURATION,
      });
    }
  }
}

function handleCombat(world: World, life: Life): void {
  const { width, height, occupancy, energy, livesById } = world;
  const x = life.x;
  const y = life.y;
  const speciesId = life.speciesId;
  // ver.2: 同じ出自（大陸系統）は色が違っても味方（協力関係）＝攻撃しない・共闘する。
  const myOrigin = life.origin;
  // ver.2: 本拠地（自分の出自地域）の中にいる間は同出自でも競争（敵）＝内部競争。外では協力。
  const iAmHome =
    myOrigin != null &&
    world.regions != null &&
    world.regions[life.y * width + life.x] === homeRegionIdOf(world, myOrigin);

  // v1.10: 隣接 3×3 内の同系統数を数えて、戦闘時のボーナス算定に使う。
  // 仲間が多いほど戦闘力が増す（群れの戦闘力）。対数で逓減して支配的にならないように。
  let attackerAllyCount = 0;
  let hasOpponent = false;
  // 兼用：仲間カウントと、敵が存在するかの早期判定を同時に行う
  for (let i = 0; i < 8; i++) {
    let nx = x + NEIGHBOR_DX[i];
    if (nx < 0) nx += width;
    else if (nx >= width) nx -= width;
    let ny = y + NEIGHBOR_DY[i];
    if (ny < 0) ny += height;
    else if (ny >= height) ny -= height;
    const occId = occupancy[ny * width + nx];
    if (occId === -1) continue;
    const neighbor = livesById.get(occId);
    if (!neighbor || !neighbor.alive) continue;
    if (
      neighbor.speciesId === speciesId ||
      (myOrigin != null && neighbor.origin === myOrigin && !iAmHome)
    ) {
      attackerAllyCount++;
    } else {
      hasOpponent = true;
    }
  }
  // 敵がいなければ何もしない（最頻出ケースの早期 return）
  if (!hasOpponent) return;
  const allyBonus = Math.log1p(attackerAllyCount) * 1.5;

  for (let i = 0; i < 8; i++) {
    let nx = x + NEIGHBOR_DX[i];
    if (nx < 0) nx += width;
    else if (nx >= width) nx -= width;
    let ny = y + NEIGHBOR_DY[i];
    if (ny < 0) ny += height;
    else if (ny >= height) ny -= height;
    const nidx = ny * width + nx;
    const occId = occupancy[nidx];
    if (occId === -1) continue;

    const opponent = livesById.get(occId);
    if (!opponent || !opponent.alive) continue;

    // 同系統は常に攻撃しない（共食い禁止）。同出自は本拠地外でのみ味方（本拠地内は競争＝攻撃可）。
    if (
      opponent.speciesId === speciesId ||
      (myOrigin != null && opponent.origin === myOrigin && !iAmHome)
    )
      continue;

    // ver.2: 防御側(opponent)が自分の本拠地内にいるか。本拠地内では同出自を味方に数えない。
    const oppHome =
      opponent.origin != null &&
      world.regions != null &&
      world.regions[opponent.y * width + opponent.x] ===
        homeRegionIdOf(world, opponent.origin);

    // 防御側も自分の周囲の仲間数で防御力ボーナスを得る（群れの防御力）
    let defenderAllyCount = 0;
    for (let j = 0; j < 8; j++) {
      let dnx = opponent.x + NEIGHBOR_DX[j];
      if (dnx < 0) dnx += width;
      else if (dnx >= width) dnx -= width;
      let dny = opponent.y + NEIGHBOR_DY[j];
      if (dny < 0) dny += height;
      else if (dny >= height) dny -= height;
      const dnidx = dny * width + dnx;
      const doccId = occupancy[dnidx];
      if (doccId === -1) continue;
      const dneighbor = livesById.get(doccId);
      if (
        dneighbor &&
        dneighbor.alive &&
        (dneighbor.speciesId === opponent.speciesId ||
          (opponent.origin != null &&
            dneighbor.origin === opponent.origin &&
            !oppHome))
      ) {
        defenderAllyCount++;
      }
    }
    const defAllyBonus = Math.log1p(defenderAllyCount) * 1.5;

    // v1.11: 体格は戦闘から完全に除外。
    //   effectiveAtk = life.strength + 仲間ボーナス + 知能ボーナス
    //   effectiveDef = opponent.strength + 仲間ボーナス + 知能ボーナス
    // 体格は「エネルギー貯蔵タンク」専用の遺伝子に役割を集約（COST_SIZE=0 とセット）。
    // v1.10: 知能 100 超は戦闘の効果的攻防に +bonus*5（暫定実装・のちに改修予定）
    //   intel 100: +0
    //   intel 200: +2.5
    //   intel 300: +5
    //   intel 500: +10
    // 防御側にも同じ補正を入れて、知能差が戦闘上の小さな差になるように。
    // プレイヤーが保護中の個体は戦闘で死なない
    if (opponent.protected) continue;
    const atkIntelBonus = Math.max(0, (life.genes.intelligence - 100) / 200) * 5;
    const defIntelBonus = Math.max(0, (opponent.genes.intelligence - 100) / 200) * 5;
    let effectiveAtk = life.genes.strength + allyBonus + atkIntelBonus;
    // ver.2 革命: 治世中は覇者以外の攻撃を弱める（非覇者は戦闘で勝ちにくい＝防御的に）。
    if (
      world.reignOrigin != null &&
      world.turn < (world.reignUntilTurn ?? 0) &&
      life.origin !== world.reignOrigin
    ) {
      effectiveAtk *= REIGN_ATK_PENALTY;
    }
    const effectiveDef = opponent.genes.strength + defAllyBonus + defIntelBonus;
    if (effectiveAtk > effectiveDef) {
      // v1.01: 確率戦闘を廃止し決定論に。強さの差は実効値として直接勝敗を決め、
      // バランスはコスト関数（^2.0）側で取る。
      // 強さを伸ばすと戦闘で確実に勝てるが、維持コストが指数的に重くなる。
      // v1.10: 旧 params.combatAdvantage は廃止。掠奪率は COMBAT_ENERGY_LOSS_RATIO に固定し、
      // 時代の combatScale で動的に変動する。
      const era = currentEra(world);
      // v1.31: 上級設定の戦闘略奪率倍率を適用（0..1にclamp）。×1.0 は従来と一致。
      const effLoss = clamp(
        COMBAT_ENERGY_LOSS_RATIO * world.params.advanced.combatLossMul,
        0,
        1
      );
      const lootEnergy =
        opponent.energy * effLoss * era.environment.combatScale;
      life.energy += lootEnergy;
      // v1.11/v1.20: 残り 40% は「死骸」としてその場のセルに付与。
      // depositCarcassEnergy で上限超過分は上下左右 4 セルに均等分配。
      const carcassEnergy =
        opponent.energy *
        (1 - effLoss) *
        era.environment.combatScale
        + opponent.genes.size * 0.3;
      depositCarcassEnergy(world, nx, ny, carcassEnergy);
      // 捕食エフェクト：捕食者の位置に被食者が重なって縮小・消滅する演出
      // v1.11: durationTurns 5→8 に延長。パクっとアニメ（exp 減衰）が十分に見える時間を確保。
      world.combatFlashes.push({
        attackerLifeId: life.id,
        fallbackX: life.x,
        fallbackY: life.y,
        victimR: binCenterColor(opponent.genes.r),
        victimG: binCenterColor(opponent.genes.g),
        victimB: binCenterColor(opponent.genes.b),
        startTurn: world.turn,
        durationTurns: 8,
      });
      opponent.alive = false;
      opponent.energy = 0;
      occupancy[nidx] = -1;
      break;
    }
  }
}
