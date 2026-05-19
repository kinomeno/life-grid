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
// v1.11: 速度は 1〜999 の連続スケール（sqrt + 指数コスト）。
//   1 ターンに加算される速度量 = sqrt(speed / 33.3)。floor(累積) ステップ移動。
//     speed   1:  0.17/turn  speed  33:  1.0/turn
//     speed 100:  1.73       speed 300:  3.0
//     speed 500:  3.87       speed 999:  5.48
//   100 超は維持コストが指数的に増加（短命）。500 超は数十ターンで餓死。
export const GENE_SPEED_MIN = 1;
export const GENE_SPEED_MAX = 999;
// 観察 UI で「通常」と呼ぶしきい値
export const GENE_SPEED_NORMAL_CAP = 100;
// v1.11: 体格範囲を 60-140 → 30-200 に拡張。
// 上限張り付きが頻発するようなら 30-999 にさらに拡張を検討。
export const GENE_SIZE_MIN = 30;
export const GENE_SIZE_MAX = 200;
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
// v1.11: 出産数遺伝子。1 回の繁殖で生まれる子の数。
//   1: 単独出産（哺乳類的）
//   3-5: 中程度（鳥・爬虫類的）
//   8-10: 多産（昆虫・魚的、r 戦略）
// 親 + 子 N 体に均等分割 = 各個体が parent.energy / (N+1)。
export const GENE_OFFSPRING_MIN = 1;
export const GENE_OFFSPRING_MAX = 10;
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
// v1.10: 7 → 5 に縮小（控えめ）。知能が視野を支配しすぎていたため、
// 視野遺伝子にも進化圧がかかるよう調整。
export const VISION_DEPTH_BONUS_MAX = 5;
// 視野深度ボーナスの傾き：知能 N ごとに +1
// v1.10: 50 → 75 に拡大。知能 75 で +1、150 で +2、…、375 以上で上限 +5。
export const VISION_DEPTH_INTEL_PER_BONUS = 75;

export const INITIAL_ENERGY_RATIO = 0.4;

export const COST_BASE = 0.25;
// v1.10: 視野コストを 0.15 → 0.12 に軽減。
// 知能ボーナス縮小（7→5、50→75）と合わせて、視野遺伝子の進化圧をプラス方向に。
//   vision 1: 0.12, vision 2: 0.24, vision 3: 0.36, vision 4: 0.48
export const COST_VISION = 0.12;
export const COST_SPEED_PER_STEP = 0.25;
// v1.11: 速度の維持コスト（移動の有無に関わらず常時かかる）。
// 指数 1.7 で、speed 100 までは軽く、超えると急に重くなるカーブ。
//   speed   1:   0.00006
//   speed 100:   0.15
//   speed 200:   0.49
//   speed 500:   2.33
//   speed 999:   7.54
// COST_SPEED_PER_STEP（移動時のみ、0.25/step）と合わせて、
// 高速個体は短命確定（999 で約 10-15 turn の寿命）。
export const COST_SPEED_MAINT = 0.00006;
export const COST_SPEED_EXP = 1.7;
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
// v1.10: 知能コストを 0.00035 → 0.00025 にさらに軽減。
// バランス検証で平均知能 30 前後で停滞していたため。
//   v= 50:  0.39  v=100:  1.77  v=200:  6.39  v=500: 31.8  v=999: 116.4
export const COST_INTELLIGENCE = 0.00025;
// v1.11: COST_SIZE = 0。体格は「エネルギー貯蔵タンク」専用遺伝子に。
// 大型化のトレードオフは「繁殖閾値が上がる」(= 0.6 × size) のみ。
// 戦闘・維持コストともに体格は影響しない。
export const COST_SIZE = 0;

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
  // v1.11: 出産数の固定値は 1（単独出産が無効化時のデフォルト）
  offspringCount: 1,
  // v1.10: 重み遺伝子の中央値固定
  wAppetite: 50,
  wPredation: 50,
  wCaution: 50,
  wGregarious: 50,
  wLoyalty: 50,
  wRepro: 50,
  wStarvSensitive: 50,
} as const;
