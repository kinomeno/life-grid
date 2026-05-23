// v1.31 (C1): セーブ/ロード。World 全体を JSON 文字列にシリアライズ／復元する。
//
// 決定性について：
//   ステップ実行の乱数はすべて (turn, life.id) 由来で導出され（findBestNeighborCell /
//   reproduceLife / shuffledIndices）、World の外に隠れた可変 RNG 状態は存在しない。
//   したがって World を忠実に復元すれば、ロード後も保存時とまったく同じ進化が続く。
//
// 容量最適化：
//   - 大きな Float32Array（energy / terrainBias / waveTimeScale）は base64 で格納（厳密・コンパクト）。
//   - occupancy / energyNext / livesById は派生情報なのでロード時に再構築する。
//   - 一時的な演出配列（*Flashes）は保存せず空で復元する。

import { DEFAULT_ADVANCED } from "./constants";
import type {
  AdvancedParams,
  DisabledGeneFlags,
  Life,
  SimulationParams,
  SpeciesLineageNode,
  StatsSample,
  World,
  WorldEvent,
} from "./types";

const SAVE_FORMAT = "life-grid-save";
const SAVE_VERSION = 1;

type RecentDeath = {
  id: number;
  x: number;
  y: number;
  speciesId: string;
  genes: Life["genes"];
  deathTurn: number;
};

type EncodedWorld = {
  width: number;
  height: number;
  turn: number;
  seed: number;
  energyB64: string;
  terrainBiasB64: string;
  waveTimeScaleB64: string;
  lives: Life[];
  recentDeaths: [number, RecentDeath][];
  nextLifeId: number;
  wavePatternId: number;
  eraBaseDurationTurns: number;
  eraTime: number;
  knownSpecies: string[];
  speciesLineage: SpeciesLineageNode[];
  prevSpeciesCounts: [string, number][];
  prevEraIndex: number;
  events: WorldEvent[];
  history: StatsSample[];
  maxObservedAge: number;
  prevTopSpeciesId: string | null;
  totalExtinctionLogged: boolean;
  milestonesFired: number[];
  peakLifeCount: number;
  lastMassExtinctionTurn: number;
  predatorRiseLogged: string[];
  intelligentRiseLogged: string[];
  nextCataclysmTurn: number;
  activeCataclysm: World["activeCataclysm"];
  params: SimulationParams;
};

export type SaveFile = {
  format: string;
  version: number;
  savedAt: string;
  world: EncodedWorld;
};

// ──── base64 ⇄ Float32Array ────
function f32ToBase64(arr: Float32Array): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    bin += String.fromCharCode.apply(null, sub as unknown as number[]);
  }
  return btoa(bin);
}

function base64ToF32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

/** World を保存用 JSON 文字列にする。 */
export function serializeWorld(world: World): string {
  const encoded: EncodedWorld = {
    width: world.width,
    height: world.height,
    turn: world.turn,
    seed: world.seed,
    energyB64: f32ToBase64(world.energy),
    terrainBiasB64: f32ToBase64(world.terrainBias),
    waveTimeScaleB64: f32ToBase64(world.waveTimeScale),
    lives: world.lives,
    recentDeaths: Array.from(world.recentDeaths.entries()),
    nextLifeId: world.nextLifeId,
    wavePatternId: world.wavePatternId,
    eraBaseDurationTurns: world.eraBaseDurationTurns,
    eraTime: world.eraTime,
    knownSpecies: Array.from(world.knownSpecies),
    speciesLineage: Array.from(world.speciesLineage.values()),
    prevSpeciesCounts: Array.from(world.prevSpeciesCounts.entries()),
    prevEraIndex: world.prevEraIndex,
    events: world.events,
    history: world.history,
    maxObservedAge: world.maxObservedAge,
    prevTopSpeciesId: world.prevTopSpeciesId,
    totalExtinctionLogged: world.totalExtinctionLogged,
    milestonesFired: Array.from(world.milestonesFired),
    peakLifeCount: world.peakLifeCount,
    lastMassExtinctionTurn: world.lastMassExtinctionTurn,
    predatorRiseLogged: Array.from(world.predatorRiseLogged),
    intelligentRiseLogged: Array.from(world.intelligentRiseLogged),
    nextCataclysmTurn: world.nextCataclysmTurn,
    activeCataclysm: world.activeCataclysm,
    params: world.params,
  };
  const file: SaveFile = {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    world: encoded,
  };
  return JSON.stringify(file);
}

/** 保存 JSON 文字列から World を復元する。不正な内容なら例外を投げる。 */
export function deserializeWorld(json: string): World {
  let file: SaveFile;
  try {
    file = JSON.parse(json) as SaveFile;
  } catch {
    throw new Error("セーブデータの解析に失敗しました（JSON 不正）。");
  }
  if (!file || file.format !== SAVE_FORMAT) {
    throw new Error("これは LIFE GRID のセーブデータではありません。");
  }
  if (file.version !== SAVE_VERSION) {
    throw new Error(
      `セーブデータの版が一致しません（保存: v${file.version} / 対応: v${SAVE_VERSION}）。`
    );
  }
  const e = file.world;
  const total = e.width * e.height;
  // v1.31: 旧セーブには advanced（上級設定）が無いので既定（すべて1.0）で補完。
  e.params.advanced = { ...DEFAULT_ADVANCED, ...(e.params.advanced ?? {}) };

  const energy = base64ToF32(e.energyB64);
  const terrainBias = base64ToF32(e.terrainBiasB64);
  const waveTimeScale = base64ToF32(e.waveTimeScaleB64);
  if (
    energy.length !== total ||
    terrainBias.length !== total ||
    waveTimeScale.length !== total
  ) {
    throw new Error("セーブデータが壊れています（マップサイズ不一致）。");
  }

  // 派生情報を再構築：occupancy（生存個体の位置）と livesById。
  const occupancy = new Int32Array(total).fill(-1);
  const livesById = new Map<number, Life>();
  for (const life of e.lives) {
    livesById.set(life.id, life);
    if (life.alive) {
      const idx = life.y * e.width + life.x;
      if (idx >= 0 && idx < total) occupancy[idx] = life.id;
    }
  }

  const speciesLineage = new Map<string, SpeciesLineageNode>();
  for (const node of e.speciesLineage) speciesLineage.set(node.id, node);

  const world: World = {
    width: e.width,
    height: e.height,
    turn: e.turn,
    seed: e.seed,
    energy,
    energyNext: new Float32Array(total),
    occupancy,
    lives: e.lives,
    livesById,
    recentDeaths: new Map(e.recentDeaths),
    nextLifeId: e.nextLifeId,
    terrainBias,
    waveTimeScale,
    wavePatternId: e.wavePatternId,
    eraBaseDurationTurns: e.eraBaseDurationTurns,
    eraTime: e.eraTime,
    knownSpecies: new Set(e.knownSpecies),
    speciesLineage,
    prevSpeciesCounts: new Map(e.prevSpeciesCounts),
    prevEraIndex: e.prevEraIndex,
    events: e.events,
    history: e.history,
    maxObservedAge: e.maxObservedAge,
    prevTopSpeciesId: e.prevTopSpeciesId,
    totalExtinctionLogged: e.totalExtinctionLogged,
    milestonesFired: new Set(e.milestonesFired),
    peakLifeCount: e.peakLifeCount,
    lastMassExtinctionTurn: e.lastMassExtinctionTurn,
    predatorRiseLogged: new Set(e.predatorRiseLogged),
    intelligentRiseLogged: new Set(e.intelligentRiseLogged),
    nextCataclysmTurn: e.nextCataclysmTurn,
    activeCataclysm: e.activeCataclysm,
    birthFlashes: [],
    combatFlashes: [],
    shareFlashes: [],
    params: e.params,
  };
  return world;
}

// ──── v1.31 (item4): 環境設定（recipe）の共有用エンコード ────
// 世界の状態は含めず「設定（params＋上級コスト＋有効遺伝子）」だけを短い文字列にする。
// 共有URLの ?p= に載せ、受け手は同じ設定で t0 から再現できる（研究者の作品＝設定）。

const GENE_BIT_ORDER: (keyof DisabledGeneFlags)[] = [
  "rgb",
  "vision",
  "speed",
  "size",
  "strength",
  "intelligence",
  "birthThreshold",
  "lifespan",
];
const ADV_ORDER: (keyof AdvancedParams)[] = [
  "costBaseMul",
  "costVisionMul",
  "costSpeedMul",
  "costStrengthMul",
  "costIntelligenceMul",
  "absorbMul",
  "combatLossMul",
];

type ParamPreset = {
  e: number;
  m: number;
  w: number;
  s: 0 | 1;
  d: number;
  a: number[];
};

function b64urlEncode(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  return atob(s.replace(/-/g, "+").replace(/_/g, "/"));
}
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** 環境設定を URL 用の短い文字列にエンコードする。 */
export function encodeParamsPreset(params: SimulationParams): string {
  let d = 0;
  GENE_BIT_ORDER.forEach((k, i) => {
    if (params.disabledGenes[k]) d |= 1 << i;
  });
  const obj: ParamPreset = {
    e: r3(params.totalEnergy),
    m: r3(params.mutationRateMultiplier),
    w: r3(params.waveSpeed),
    s: params.energyShareEnabled ? 1 : 0,
    d,
    a: ADV_ORDER.map((k) => r3(params.advanced[k])),
  };
  return b64urlEncode(JSON.stringify(obj));
}

/** 共有文字列を環境設定の一部に復元する。不正なら空（適用しない）。 */
export function decodeParamsPreset(str: string): Partial<SimulationParams> {
  try {
    const obj = JSON.parse(b64urlDecode(str)) as Partial<ParamPreset>;
    if (!obj || typeof obj !== "object") return {};
    const out: Partial<SimulationParams> = {};
    if (typeof obj.e === "number") out.totalEnergy = obj.e;
    if (typeof obj.m === "number") out.mutationRateMultiplier = obj.m;
    if (typeof obj.w === "number") out.waveSpeed = obj.w;
    if (obj.s === 0 || obj.s === 1) out.energyShareEnabled = obj.s === 1;
    if (typeof obj.d === "number") {
      const flags = {} as DisabledGeneFlags;
      const bits = obj.d;
      GENE_BIT_ORDER.forEach((k, i) => {
        flags[k] = (bits & (1 << i)) !== 0;
      });
      out.disabledGenes = flags;
    }
    if (Array.isArray(obj.a)) {
      const adv = { ...DEFAULT_ADVANCED } as AdvancedParams;
      const arr = obj.a;
      ADV_ORDER.forEach((k, i) => {
        if (typeof arr[i] === "number") adv[k] = arr[i];
      });
      out.advanced = adv;
    }
    return out;
  } catch {
    return {};
  }
}
