export type Genes = {
  r: number;
  g: number;
  b: number;
  vision: number;
  speed: number;
  size: number;
  strength: number;
  intelligence: number;
  reproductionRate: number;
  mutationRate: number;
  lifespan: number;
};

export type Life = {
  id: number;
  x: number;
  y: number;
  /** 前ターン開始時点での位置（描画スムージング用）。 */
  prevX: number;
  prevY: number;
  energy: number;
  age: number;
  speciesId: string;
  genes: Genes;
  alive: boolean;
  /** 移動の累積（speed/33.3 ずつ加算、floor() 値で移動ステップを決定）。 */
  moveAccum: number;
  /** プレイヤーの保護フラグ：true なら戦闘・天変地異で死なない。 */
  protected?: boolean;
};

/** 日本語と英語の両方を保持するメッセージ。表示時にロケールで選択。 */
export type LocalizedMessage = { ja: string; en: string };

export type SimulationParams = {
  /** 世界全体のエネルギー量倍率（再生・波振幅にスケールがかかる）。1.0が既定。 */
  totalEnergy: number;
  /** 突然変異率の倍率（生物の遺伝子変異率に乗算）。1.0が既定。 */
  mutationRateMultiplier: number;
  /** エネルギー波速度倍率。0で背景エネルギーが完全に静止する。1.0が既定。 */
  waveSpeed: number;
  /** 攻撃優位度。攻撃時に奪うエネルギー比率（0〜1）。 */
  combatAdvantage: number;
  /** 稼働遺伝子設定。true なら無効化（全個体で固定値）。 */
  disabledGenes: DisabledGeneFlags;
  /** マップ上部のニュースバーを表示するか。 */
  newsEnabled: boolean;
  /** v1.02: 選択中の生命が死んだとき、同系統 → 遺伝子近接の順で別個体を自動選択する。既定 true。 */
  inheritOnDeath: boolean;
};

/**
 * 稼働遺伝子のチェック状態。
 *  - 個別キーが true なら「無効化」されており、全個体で固定値となる。
 *  - rgb は r/g/b 一括（体色まとめ）。
 */
export type DisabledGeneFlags = {
  rgb: boolean;
  vision: boolean;
  speed: boolean;
  size: boolean;
  strength: boolean;
  intelligence: boolean;
  reproductionRate: boolean;
  mutationRate: boolean;
  lifespan: boolean;
};

/** 行動ログのイベント種別。 */
export type WorldEventType =
  | "birth"
  | "extinction"
  | "epoch"
  | "longevity" // 最長寿命到達
  | "topSpecies" // 最大繁殖系統
  | "milestone" // ターン到達マイルストーン
  | "massExtinction" // 大絶滅
  | "survival" // 大絶滅生存系統
  | "predatorRise" // 捕食系（高strength）の繁栄
  | "intelligentRise" // 知的生命（高intelligence）の繁栄
  | "cataclysm" // 天変地異
  | "totalExtinction"; // 全生物絶滅

export type WorldEvent = {
  turn: number;
  type: WorldEventType;
  /** 関連する系統ID（時代変化以外）。 */
  speciesId?: string;
  /** 表示色（種を示すドットに使用）。 */
  rgb?: { r: number; g: number; b: number };
  /** 説明文（日本語・英語）。 */
  message: LocalizedMessage;
};

/** 統計グラフ用の時系列サンプル。 */
export type StatsSample = {
  turn: number;
  lifeCount: number;
  speciesCount: number;
  averageIntelligence: number;
  averageSpeed: number;
  /** 平均強さ。 */
  averageStrength: number;
  /** 平均寿命。 */
  averageLifespan: number;
  /** 平均繁殖率。 */
  averageReproductionRate: number;
  /** 平均体格。 */
  averageSize: number;
  /** 平均RGB（0〜255）。 */
  avgR: number;
  avgG: number;
  avgB: number;
};

export type World = {
  width: number;
  height: number;
  turn: number;
  seed: number;
  energy: Float32Array;
  /** updateEnergy 用の書き込みバッファ（毎フレームのアロケーション回避）。 */
  energyNext: Float32Array;
  occupancy: Int32Array;
  lives: Life[];
  /** O(1) ライフ検索用マップ（id → Life）。cullDead 毎に再構築。 */
  livesById: Map<number, Life>;
  nextLifeId: number;
  terrainBias: Float32Array;
  waveTimeScale: Float32Array;
  /** 初代（紀元）の波パターンID。eraIndex を加算して現在のパターンを得る。 */
  wavePatternId: number;
  /** 1つの時代の基本長（ターン）。シードで決まる。 */
  eraBaseDurationTurns: number;
  /** 累積された時代進行（時代変動率でスケールされる）。 */
  eraTime: number;
  /** 既出系統の追跡（誕生イベント記録用）。 */
  knownSpecies: Set<string>;
  /** 直近の系統別生物数（絶滅イベント記録用）。 */
  prevSpeciesCounts: Map<string, number>;
  /** 直近の時代インデックス（紀元変化検出用）。 */
  prevEraIndex: number;
  /** 行動ログ（最大件数を超えると古いものから捨てる）。 */
  events: WorldEvent[];
  /** 統計グラフ用の時系列サンプル。 */
  history: StatsSample[];
  /** これまで観測した最高齢の年齢。 */
  maxObservedAge: number;
  /** 直近の最大系統ID（生物数1位）。 */
  prevTopSpeciesId: string | null;
  /** 全絶滅イベント既発火フラグ（同一世代で複数回発火しない）。 */
  totalExtinctionLogged: boolean;
  /** 既に発火したマイルストーンターン集合。 */
  milestonesFired: Set<number>;
  /** 観測した最大の生物数（大絶滅検出用）。 */
  peakLifeCount: number;
  /** 最後に大絶滅イベントを記録したターン（連続発火防止）。 */
  lastMassExtinctionTurn: number;
  /** 捕食系の繁栄を既に記録した系統ID集合（再記録防止）。 */
  predatorRiseLogged: Set<string>;
  /** 知的生命の繁栄を既に記録した系統ID集合（再記録防止）。 */
  intelligentRiseLogged: Set<string>;
  /** 次の天変地異候補ターン。 */
  nextCataclysmTurn: number;
  /** 進行中の天変地異（マップエフェクト用）。 */
  activeCataclysm: {
    type: "meteor" | "drought" | "bloom";
    centerX: number;
    centerY: number;
    radius: number;
    startTurn: number;
    durationTurns: number;
  } | null;
  /** 新系統発生エフェクト（短期間表示）。表示後、自動的に削除される。 */
  birthFlashes: BirthFlash[];
  /** 捕食発生エフェクト（短期間表示）。 */
  combatFlashes: CombatFlash[];
  params: SimulationParams;
};

/** 新系統が誕生した瞬間のエフェクト情報。 */
export type BirthFlash = {
  /** 誕生した個体のID（色フェード用に追跡）。 */
  lifeId: number;
  /** マップ上の位置（リング描画用）。 */
  x: number;
  y: number;
  /** 系統ID（色判定用）。 */
  speciesId: string;
  /** 個体の RGB（色フェード用）。 */
  r: number;
  g: number;
  b: number;
  /** 開始ターン。 */
  startTurn: number;
  /** 持続ターン数。 */
  durationTurns: number;
};

/** 戦闘（捕食）が発生した瞬間のエフェクト情報。
 *  捕食者の現在位置に被食者が重なって縮小・消滅する演出に使用。 */
export type CombatFlash = {
  /** 捕食者の ID（位置を追跡）。 */
  attackerLifeId: number;
  /** 捕食者が死亡している場合のフォールバック位置。 */
  fallbackX: number;
  fallbackY: number;
  /** 被食者の RGB（消失する色）。 */
  victimR: number;
  victimG: number;
  victimB: number;
  startTurn: number;
  durationTurns: number;
};

export type WorldConfig = {
  width: number;
  height: number;
  initialLifeCount: number;
  seed: number;
  params?: SimulationParams;
  /** 指定した場合、初期生命の遺伝子はこれをコピーする。 */
  initialGenes?: Genes;
};
