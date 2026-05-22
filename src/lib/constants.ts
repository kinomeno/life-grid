export const ENERGY_MAX = 100;
export const ENERGY_INITIAL_MEAN = 35;
export const ENERGY_INITIAL_VARIANCE = 25;
export const ENERGY_REGEN_PER_TURN = 0.12;
export const ENERGY_DIFFUSION = 0.02;
// v1.21 実験: 波が負のピークでもエネルギー再生が完全停止しないよう下限を保証。
// 基礎再生 regenPerTurn の何割を最低保証するか。
// マップ全体が同時に「真っ白（低エネルギー）」になって全滅する環境絶滅を防ぐ。
// 0 にすると従来挙動（下限なし）に戻る。
export const ENERGY_REGEN_FLOOR_RATIO = 0.25;

export const ENERGY_WAVE_AMPLITUDE = 15;
// v1.20: ENERGY_WAVE_PERIOD_TURNS は v1.10 以降未使用のため削除済み。
// v1.21: 波の空間周波数（= 波長）をマップサイズ可変に。
//   小世界（50 以下）: 0.12（波長 ≈ 52 セル）
//     → 波長 < マップなので空間的に明暗が分かれ、全マップ同時枯渇の環境絶滅を防ぐ。
//   大世界（200 以上）: 0.04（波長 ≈ 157 セル、v1.20 相当）
//     → マップに対し波長が大きく、ゆったりダイナミックなうねりになる。
//   中間（100 など）は線形補間（≈ 0.093）。
// waveSpatialFreq(size) で算出。両端を入れ替えると挙動が変わる。
export const WAVE_SF_SMALL = 0.12; // マップ辺 50 以下
export const WAVE_SF_LARGE = 0.04; // マップ辺 200 以上

export const GENE_VISION_MIN = 1;
export const GENE_VISION_MAX = 4;
// v1.11/v1.20: 速度は 0〜999 の連続スケール（sqrt + 指数コスト）。
//   speed = 0: 完全静止（植物的生物。光合成戦略）
//   1 ターンに加算される速度量 = sqrt(speed / 33.3)。floor(累積) ステップ移動。
//     speed   0:  0/turn      （植物）
//     speed   1:  0.17/turn   （超低速）
//     speed  33:  1.0/turn
//     speed 100:  1.73        speed 300:  3.0
//     speed 500:  3.87        speed 999:  5.48
//   100 超は維持コストが指数的に増加（短命）。500 超は数十ターンで餓死。
export const GENE_SPEED_MIN = 0;
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
// v1.20: 繁殖率（reproductionRate）を廃止し「出産閾値」遺伝子に置き換え。
// 所持エネルギーが実効閾値 min(birthThreshold, size*0.9) を上回ると出産する。
//   低い（30〜）= 早く頻繁に産む（r 戦略）
//   高い（〜300）= じっくり蓄えてから産む（K 戦略）
// 実効閾値が体格（タンク容量）を超えないようクランプ（超えると永遠に出産不可になるため）。
export const GENE_BIRTH_THRESHOLD_MIN = 30;
export const GENE_BIRTH_THRESHOLD_MAX = 300;
// v1.11: 出産数遺伝子。1 回の繁殖で生まれる子の数。
//   1: 単独出産（哺乳類的）
//   3-5: 中程度（鳥・爬虫類的）
//   8-10: 多産（昆虫・魚的、r 戦略）
// 親 + 子 N 体に均等分割 = 各個体が parent.energy / (N+1)。
export const GENE_OFFSPRING_MIN = 1;
// v1.21 検証: 出産数の上限を 4 → 3 に抑制。
// 上限 4 では多様性がやや低かったため、さらに多産を抑えて
// 「単産 vs 少数多産」の戦略性は残しつつ空間独占を緩和。
export const GENE_OFFSPRING_MAX = 3;
// v1.21: 出産数遺伝子の進化を有効化（上限 4 で）。
// false にすると全個体 1 固定（出産数進化なし）。
export const OFFSPRING_GENE_ENABLED = true;
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
// v1.10: 知能コストを 0.00035 → 0.00025 に軽減（平均知能 30 前後で停滞のため）。
// v1.30 (H11): 0.00025 → 0.0000833（約 1/3）。吸収シナジー撤廃とセットで、知能を
//   「採餌で越境して支配する超戦略」から「正確さ(accuracy)中核の並の有力戦略」へ。
//   grid 検証（吸収OFF×コスト×乗算K, 100+200）で多様な戦略戦が最良だった点を採用。
//   v=50: 0.13  v=100: 0.59  v=150: 1.26  v=200: 2.13  v=500: 10.6
export const COST_INTELLIGENCE = 0.0000833;
// v1.11: COST_SIZE = 0。体格は「エネルギー貯蔵タンク」専用遺伝子に。
// 大型化のトレードオフは「繁殖閾値が上がる」(= 0.6 × size) のみ。
// 戦闘・維持コストともに体格は影響しない。
export const COST_SIZE = 0;

export const ABSORB_RATE = 0.10;

export const SPECIES_RGB_BIN = 48;

// v1.30 (H4 再設計): 体色は「仲間タグ」。能力・行動が親からどれだけ変化したか（正規化合計）に
// 比例して、体色をランダム方向へ微ドリフトさせる。SCALE が大きいほど分化が速い。
//   変化ゼロ → 色も不変（安定系統＝同色＝同種）。
//   蓄積して 48 ビン（SPECIES_RGB_BIN）を越えた子が新種になる。
//   方向はランダムなので、別系統が同じ能力に収斂しても色は別＝別種（収斂進化を表現できる）。
// 表示色・仲間認識は既存の RGB ビンを流用（表示はビン中心色に量子化）。
export const COLOR_DRIFT_SCALE = 90;

export const ENERGY_DISPLAY_LEVELS = 8;

// v1.20: REPRODUCTION_ENERGY_THRESHOLD_RATIO は出産閾値方式への移行で廃止。
export const MIN_REPRODUCTIVE_AGE_RATIO = 0.2;
// v1.20: MUTATION_STD_DEV は v1.10 以降未使用のため削除済み（BASE_MUTATION_RATE に統合）。
// 戦闘略奪率：勝者が敗者から奪うエネルギー比。
// 確率戦闘では期待値が減るため、元の 0.6 に戻して維持可能性を確保。
export const COMBAT_ENERGY_LOSS_RATIO = 0.6;

// ──── v1.30 (案1/B): 仲間へのエネルギー提供（血縁淘汰・利他の進化）────
// 隣接3x3の同種(speciesId一致=近縁)のうち最も困窮した個体へ、余剰エネルギーを分配する。
// wShare 遺伝子で利他性が進化。知能(accuracy)が高いほど転送効率が上がる（ロスが減る）。
// 転送ロスは場に還元（エネルギー保存）。
// ON/OFF は SimulationParams.energyShareEnabled（既定OFF＝オプトイン）で制御する。
// 利他の相手選択を「困窮度 × 相手の利他性」で行う（assortment/greenbeard）。
// true: 利他的な近縁を優先して助け、利己的なタダ乗り個体は助けない＝利他遺伝子が
//   自分のコピーを優先的に利するため進化的に安定（free-rider 問題を緩和）。
// false: 困窮度のみで選ぶ素朴版（利他はタダ乗りに食われ中立化しやすい）。
export const SHARE_ASSORTATIVE = true;
// ドナーが自分用に確保する下限（size 比）。これを超えた分だけが「余剰」。
export const SHARE_DONOR_RESERVE_RATIO = 0.6;
// 受け手が「困窮」と判定される所持エネルギー（size 比）。未満なら不足分を需要とみなす。
export const SHARE_RECIPIENT_NEED_RATIO = 0.35;
// 1回の提供量 = min(余剰, 相手の不足) × この係数 × (wShare/100)。
export const SHARE_FRACTION = 0.5;
// 転送効率の下限（知能0時）。efficiency = base + (1-base)*accuracy。残りはロス。
export const SHARE_EFF_BASE = 0.5;
// これ未満の余剰・提供量は無視（微小転送を避ける）。
export const SHARE_MIN_AMOUNT = 0.5;
// 提供の可視化（小○がドナー→受け手へ流れる演出）：同時表示の上限と1粒子の寿命（ターン）。
// 表示は速度・マップサイズ依存（100画面以上は<10倍速、50画面以下は<100倍速のときのみ）。
export const MAX_SHARE_FLASHES = 300;
// v1.30: ○がドナー→受け手へ届くまでのターン数。短いほどスッと素早く動く（4→2で約2倍速）。
export const SHARE_FLASH_DURATION = 2;

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
  birthThreshold: 80,
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
  // v1.30 (案1): 利他性の固定値（中央値）。
  wShare: 50,
} as const;
