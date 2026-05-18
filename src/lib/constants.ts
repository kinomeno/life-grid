export const ENERGY_MAX = 100;
export const ENERGY_INITIAL_MEAN = 35;
export const ENERGY_INITIAL_VARIANCE = 25;
export const ENERGY_REGEN_PER_TURN = 0.12;
export const ENERGY_DIFFUSION = 0.02;

export const ENERGY_WAVE_AMPLITUDE = 15;
export const ENERGY_WAVE_PERIOD_TURNS = 400;
export const ENERGY_WAVE_SPATIAL_FREQ = 0.04;

export const GENE_VISION_MIN = 1;
export const GENE_VISION_MAX = 4;
// 移動速度は 1〜100 の連続スケール（待機時間方式）。
// 1 ターンに加算される速度量 = speed / 33.3。floor(累積) ステップ移動。
export const GENE_SPEED_MIN = 1;
export const GENE_SPEED_MAX = 100;
export const GENE_SIZE_MIN = 60;
export const GENE_SIZE_MAX = 140;
// v1.01: 強さは 1〜999 の連続スケール。
// 0〜100 が通常レンジ、100〜300 が困難（ミュータント）、300〜500 が短命確定、500〜999 がほぼ即死。
export const GENE_STRENGTH_MIN = 1;
export const GENE_STRENGTH_MAX = 999;
// 観察 UI で「通常」と呼ぶしきい値（≦ ここまでは安定して生存可能）
export const GENE_STRENGTH_NORMAL_CAP = 100;
export const GENE_INTELLIGENCE_MIN = 0;
// v1.01: 知能は 0〜999 の連続スケール。100 超は維持コストが指数的に増加。
export const GENE_INTELLIGENCE_MAX = 999;
export const GENE_INTELLIGENCE_NORMAL_CAP = 100;
// v1.01: 繁殖率は 0.1〜2.0 に拡張。0.4 超では分裂エネルギーコストが急増。
export const GENE_REPRODUCTION_MIN = 0.1;
export const GENE_REPRODUCTION_MAX = 2.0;
export const GENE_REPRODUCTION_NORMAL_CAP = 0.4;
// v1.10: mutationRate 遺伝子は廃止。全個体共通の固定突然変異率を使う。
// 環境設定の mutationRateMultiplier（0 まで設定可）で全体倍率を制御。
export const BASE_MUTATION_RATE = 0.08;
// 環境設定 UI の表示レンジ（参考値）
export const GENE_MUTATION_MIN = 0.04;
export const GENE_MUTATION_MAX = 0.12;
export const GENE_LIFESPAN_MIN = 200;
export const GENE_LIFESPAN_MAX = 600;

// v1.10: 行動判断の重み遺伝子（0〜100 連続スケール）
export const GENE_WEIGHT_MIN = 0;
export const GENE_WEIGHT_MAX = 100;
// 重み遺伝子の初期分布の中央値とばらつき
export const GENE_WEIGHT_INIT_MEAN = 50;
export const GENE_WEIGHT_INIT_RANGE = 30; // 中央値 ± 30 の範囲で初期化（20〜80）

// v1.10: accuracy = min(1.0, sqrt(intel / ACCURACY_FULL_INTEL))
// 150 で 100% 機能、それ以上は飽和（視野ボーナスのみ伸びる）
// 200 だと通常進化範囲（〜100）での accuracy が低すぎたため 150 に下げた
export const ACCURACY_FULL_INTEL = 150;
// 視野深度ボーナス上限（パフォーマンス保護）
export const VISION_DEPTH_BONUS_MAX = 7;
// 視野深度ボーナスの傾き：知能 N ごとに +1
export const VISION_DEPTH_INTEL_PER_BONUS = 50;

export const INITIAL_ENERGY_RATIO = 0.4;

export const COST_BASE = 0.25;
export const COST_VISION = 0.15;
export const COST_SPEED_PER_STEP = 0.25;
// v1.01: 強さ・知能のコスト指数を別々に持たせる。
// 強さ ^2.0（戦闘優位が強いため厳しめ）
// 知能 ^1.85（間接効果なので緩め、100 超の天才個体が稀に出るように）
export const COST_STRENGTH_EXP = 2.0;
export const COST_INTELLIGENCE_EXP = 1.85;

// v1.01: 強さ・知能ともに単一の滑らかなカーブ（base * v^EXP）で維持コストを計算。
// 段階分けや「100 超を強制ペナルティ」のようなロジックは廃止し、
// 「自然な形で生存可能値が決まる」設計にしている。
//
// 目安（strength: base=0.0007 * v^2.0）:
//   v =  50 :   1.75
//   v = 100 :   7.0
//   v = 150 :  15.75
//   v = 200 :  28.0   （数十ターンで死亡）
//   v = 300 :  63.0   （短命）
//   v = 500 : 175.0   （超短命）
//   v = 999 : 698.6   （即死）
//
// 目安（intelligence: base=0.0005 * v^1.85）:
//   v = 100 :   3.54
//   v = 200 :  ~12.6
//   v = 500 :  ~70
//   v = 999 :  ~265
export const COST_STRENGTH = 0.0007;
// v1.10: 知能コストを 0.0005 → 0.00035 に軽減（知能の進化圧強化）
export const COST_INTELLIGENCE = 0.00035;
export const COST_SIZE = 0.005;

export const ABSORB_RATE = 0.10;

export const SPECIES_RGB_BIN = 48;

export const ENERGY_DISPLAY_LEVELS = 8;

export const REPRODUCTION_ENERGY_THRESHOLD_RATIO = 0.6;
export const MIN_REPRODUCTIVE_AGE_RATIO = 0.2;
export const MUTATION_STD_DEV = 0.15;
// 戦闘略奪率：勝者が敗者から奪うエネルギー比。
// 確率戦闘では期待値が減るため、元の 0.6 に戻して維持可能性を確保。
export const COMBAT_ENERGY_LOSS_RATIO = 0.6;

/**
 * 稼働遺伝子をオフにしたときに全個体に適用される固定値（中央値ベース）。
 * 体色は灰色固定。
 */
export const FIXED_GENE_VALUES = {
  r: 128,
  g: 128,
  b: 128,
  vision: 2,
  speed: 50,
  size: 100,
  strength: 50,
  intelligence: 50,
  reproductionRate: 0.25,
  lifespan: 400,
  // v1.10: 重み遺伝子の中央値固定
  wAppetite: 50,
  wPredation: 50,
  wCaution: 50,
  wGregarious: 50,
  wLoyalty: 50,
  wRepro: 50,
  wStarvSensitive: 50,
} as const;
