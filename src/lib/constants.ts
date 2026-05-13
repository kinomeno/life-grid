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
// 強さは 1〜100 の連続スケール。コストは非線形（高強さほど急増）。
export const GENE_STRENGTH_MIN = 1;
export const GENE_STRENGTH_MAX = 100;
export const GENE_INTELLIGENCE_MIN = 0;
// 知能は 0〜100 の連続スケール（整数）。
//  - scanRate    = intelligence / 100
//  - avoidWeight = max(0, (intelligence - 20) / 80)
//  - bodyWeight  = max(0, (intelligence - 70) / 30)
export const GENE_INTELLIGENCE_MAX = 100;
export const GENE_REPRODUCTION_MIN = 0.1;
export const GENE_REPRODUCTION_MAX = 0.4;
export const GENE_MUTATION_MIN = 0.04;
export const GENE_MUTATION_MAX = 0.12;
export const GENE_LIFESPAN_MIN = 200;
export const GENE_LIFESPAN_MAX = 600;

export const INITIAL_ENERGY_RATIO = 0.4;

export const COST_BASE = 0.25;
export const COST_VISION = 0.15;
export const COST_SPEED_PER_STEP = 0.25;
// 強さコスト：^1.8 を維持し、戦闘報酬側（COMBAT_ENERGY_LOSS_RATIO）で MAX 張り付きを抑える方針。
//  - 強さ 20:  0.15
//  - 強さ 50:  0.80
//  - 強さ 80:  1.85
//  - 強さ 100: 2.79
export const COST_STRENGTH = 0.0007;
// 知能コストも非線形：COST_INTELLIGENCE * intelligence^1.8
//  - 知能 20:  0.11
//  - 知能 50:  0.57
//  - 知能 80:  1.32
//  - 知能 100: 1.99
// 確率戦闘導入後、知能の survival 価値が上がり MAX 化する傾向あり。
// 0.0004 → 0.0005 へ微増して平均を 60〜70 程度に抑える。
export const COST_INTELLIGENCE = 0.0005;
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
  mutationRate: 0.08,
  lifespan: 400,
} as const;
