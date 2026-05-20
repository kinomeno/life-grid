"use client";

import { useState } from "react";
import { useLocale } from "./LocaleProvider";
import { useDraggablePanel, type DragOffset } from "./useDraggablePanel";
import type { Locale } from "@/lib/i18n";

type Section = {
  key: string;
  label: string;
  /** 子セクションを持つ場合（カテゴリ見出し）。 */
  isCategory?: boolean;
  /** カテゴリの場合はサブメニューとして展開される。 */
  children?: Section[];
  body: { heading?: string; lines: string[] }[];
};

const SECTIONS_JA: Section[] = [
  {
    key: "overview",
    label: "概要",
    body: [
      {
        heading: "ゲームの目的",
        lines: [
          "単純なルールから発生する生命進化と生態変化を観察するシミュレーション。",
          "勝利条件なし。観察者として環境を調整し、進化の物語を見守る。",
        ],
      },
      {
        heading: "生命の基本",
        lines: [
          "・エネルギーを消費して行動。尽きれば死亡。",
          "・分裂で増殖、ときに突然変異。",
          "・植物／動物の区別なし。性質は進化の結果として現れる。",
        ],
      },
      {
        heading: "遺伝形質（17 種）",
        lines: [
          "▼ 基本形質（10 種）",
          "色（R/G/B）／視野／移動速度／体格／強さ／知能／繁殖率／寿命／出産数。",
          "高性能ほど維持コスト増。完全な万能化は不可。",
          "",
          "▼ 行動判断の重み遺伝子（7 種、性格）",
          "食欲・捕食欲・警戒・社交性・強者追従・繁殖欲・飢餓敏感の 7 つ。",
          "知能の精度（accuracy）に応じて重みが反映され、性格が創発します。",
          "",
          "▼ 突然変異率は遺伝子から廃止",
          "全個体共通の固定値。環境設定の倍率（0〜2.0）で全体制御可能。",
          "",
          "▼ 上限と典型的な進化レンジ（v1.20）",
          "・強さ・知能：0〜999。通常 0〜100 が安定、それ以上は維持コスト指数増。",
          "・移動速度：0〜999。0 = 完全静止（光合成型植物的生物）。",
          "  100 超は維持コスト + 移動コスト両方で短命確定。",
          "・体格：30〜200。v1.20 で維持コストは無く、エネルギー貯蔵タンク専用。",
          "  大型ほど繁殖閾値が上がる（自然なトレードオフ）。",
          "・繁殖率：0.1〜2.0。「繁殖頻度」を表す（v1.11 で機能追加）。",
          "・出産数：1〜10。1 回の出産で生まれる子の数（v1.11 追加）。",
          "  多産個体は子のエネルギーが薄くなる + 出産疲労コスト（v1.20）。",
          "・寿命：200〜600 ターン。",
        ],
      },
      {
        heading: "エネルギー場",
        lines: [
          "世界全体は 0〜100 のエネルギー場。毎ターン回復・拡散・波打つ。",
          "高エネルギー領域は時間とともに移動（エネルギー波）→ 回遊が発生。",
        ],
      },
    ],
  },
  {
    key: "rules",
    label: "行動ルール",
    body: [
      {
        heading: "毎ターン",
        lines: [
          "・探索",
          "・移動",
          "・エネルギー吸収",
          "・戦闘判定",
          "・分裂判定",
          "・老化",
          "・死亡判定",
        ],
      },
      {
        heading: "知能の影響（v1.10 で全面刷新、v1.20 で吸収補正追加）",
        lines: [
          "知能 = 行動判断の精度（accuracy）。重み遺伝子が遺伝子通りに反映される度合いです。",
          "",
          "▼ 計算式：accuracy = min(1.0, sqrt(intelligence / 150))",
          "・知能   0：accuracy   0% → 完全ランダム移動",
          "・知能  50：accuracy  58% → 性格が薄く出る",
          "・知能 100：accuracy  82% → 性格が明確に出る",
          "・知能 150：accuracy 100% → 重み遺伝子通り正確に行動",
          "・知能 150 超：完全機能 + 視野範囲ボーナス（最大 +5 マス）",
          "",
          "▼ v1.20: 知能の直接ペイオフ",
          "・知能 50 超：エネルギー吸収効率 +0.45 × ((intel-50)/200)",
          "  intel 100 で +11%、200 で +33%、250 で +45%（上限近く）",
          "・知能 100 超：戦闘の effective 攻撃・防御に +(intel-100)/200 × 5",
          "  intel 200 で +2.5、300 で +5、500 で +10",
          "",
          "▼ 重み遺伝子 7 種が「性格」を決める（v1.20 で全 7 種が候補セル依存に修正）",
          "個体は候補セルごとに以下の特徴量を計算し、重み × 特徴量の線形和で行動を選びます。",
          "・食欲     (wAppetite)      ：そのセルのエネルギーへの引力",
          "・捕食欲   (wPredation)     ：そのセルから倒せる獲物への近さ",
          "・警戒     (wCaution)       ：倒せない敵への警戒（負方向）",
          "・社交性   (wGregarious)    ：そのセルから仲間への近さ（v1.20 修正）",
          "・強者追従 (wLoyalty)       ：強い仲間への近さ（v1.20 修正）",
          "・繁殖欲   (wRepro)         ：そのセル周囲の空きセル数（繁殖余地、v1.20 修正）",
          "・飢餓敏感 (wStarvSensitive)：自身が空腹のとき食料を強く求める",
          "",
          "性格は遺伝子の組み合わせから自然に創発し、",
          "「狩人」「臆病」「食いしん坊」「社交家」「繁殖家」など多様な戦略が進化します。",
          "個体詳細パネルで遺伝子値と「性格タグ」が確認できます。",
        ],
      },
    ],
  },
  {
    key: "combat",
    label: "戦闘",
    body: [
      {
        lines: [
          "生命同士が接触した場合、戦闘が発生します。",
          "決定論的戦闘（v1.01 から確率廃止、v1.20 で体格寄与撤廃）：",
          "・effectiveAtk = 自分の強さ + 仲間ボーナス + 知能ボーナス",
          "・effectiveDef = 相手の強さ + 仲間ボーナス + 知能ボーナス",
          "・effectiveAtk > effectiveDef → 攻撃側が確実に勝利",
          "",
          "戦闘掠奪と死骸（v1.20 新仕様）：",
          "・勝者：相手のエネルギーの 60% を吸収（時代の combatScale で変動）",
          "・残り 40% は死骸エネルギーとして敗者のいたセルに付与",
          "・セル上限 100 を超えた分は上下左右 4 セルに均等分配",
          "・死骸ホットスポットが他個体を引き寄せ捕食連鎖が emergent に",
          "",
          "強さは上限 999 まで進化可能だが、維持コストが指数的に増加するため、",
          "観察上の生存可能値は環境次第で自然に決まる。",
        ],
      },
      {
        heading: "仲間認識（知能不問）",
        lines: [
          "全ての個体は同じ系統（同 RGB ブロック）を「仲間」として認識します。",
          "仲間は戦闘の対象外（共食い禁止）。",
          "戦闘時、隣接 3×3 内の同系統数 × log1p × 1.5 で攻撃力・防御力にボーナス。",
          "群れの戦闘力が自然発生し、社交性遺伝子（wGregarious）の高い個体ほど",
          "仲間に近づき群れを形成しやすくなります。",
        ],
      },
      {
        heading: "捕食エフェクト",
        lines: [
          "・捕食者が一瞬「パクっ」と 1.7 倍に膨らむ（指数減衰で 8 turn）。",
          "・被食者は元位置と捕食者位置の中間に 1 ターン描画 → 捕食者位置で縮小消滅。",
          "・「吸い込まれる」動きが視覚化されます。",
        ],
      },
    ],
  },
  {
    key: "species",
    label: "系統",
    body: [
      {
        lines: [
          "近いRGB値を持つ個体を同系統として扱います。",
          "系統名は自動生成されます（例：R-10, B-04, G-15）。",
          "色によって直感的に系統を識別できることを優先しています。",
        ],
      },
      {
        heading: "個体の形状（遺伝子による分化）",
        lines: [
          "個体は遺伝子の値によって 4 種類の形に分かれます（0〜100 スケール）。",
          "● 丸：通常個体（強さ < 100 かつ 知能 < 75）",
          "■ 四角：強さ MAX (100) に到達した稀少個体",
          "▲ 三角：思考型（知能 ≥ 75）",
          "★ 星：賢く最強の極めて稀少な個体（強さ 100 かつ 知能 ≥ 75）",
          "形の変化を見るだけで、種がどの方向に進化しているか分かります。",
        ],
      },
    ],
  },
  {
    key: "era",
    label: "時代",
    body: [
      {
        lines: [
          "世界状態に応じて時代が自動的に切り替わります。",
          "時代名は観察上の傾向ラベルであり、世界の正解ではありません。",
          "時代変化に伴い、エネルギー波のパターンも切り替わります。",
        ],
      },
    ],
  },
  {
    key: "cataclysm",
    label: "天変地異",
    body: [
      {
        heading: "概要",
        lines: [
          "世界では数千ターンに一度、突発的な大規模イベント「天変地異」が発生します。",
          "シード値ベースで時間と種類が決まるため、同じシードなら同じ歴史が再現されます。",
        ],
      },
      {
        heading: "種類",
        lines: [
          "🜂 隕石衝突：影響範囲内の生命をほぼ即死させる。短時間（数ターン）。",
          "🌵 旱魃：広範囲のエネルギーがゆっくり減衰。長期間（80 ターン前後）。",
          "🌸 大開花：エネルギーが過剰に上昇する恵みの時期。中期間（60 ターン前後）。",
        ],
      },
      {
        heading: "効果",
        lines: [
          "・隕石は地形バランスを大きく崩し、絶滅と新興のきっかけになる。",
          "・旱魃は脆い種を淘汰し、効率的な系統に有利。",
          "・大開花は爆発的な繁殖を促し、種の多様化を加速する。",
          "・行動ログとマップ上のエフェクトで発生を確認できる。",
        ],
      },
    ],
  },
  {
    key: "env",
    label: "環境設定",
    isCategory: true,
    body: [
      {
        lines: [
          "観察者がプレイ中に調整できるパラメータ群。",
          "シミュレーション下部の「環境設定」ボタンから変更可能。",
          "サブ項目で各パラメータの詳細を確認できます。",
        ],
      },
    ],
    children: [
      {
        key: "env-energy",
        label: "エネルギー総量",
        body: [
          {
            heading: "概要",
            lines: [
              "世界全体のエネルギー供給量を調整します。",
              "1.0 が基準値。大きいほど豊かな環境、小さいほど厳しい環境。",
            ],
          },
          {
            heading: "影響",
            lines: [
              "・高い値（1.5〜2.0）：生物が繁栄しやすく、多くの個体が生存できます。捕食圧が低く、草食的な種が有利。",
              "・中程度（0.8〜1.2）：バランスの取れた進化が期待できます。",
              "・低い値（0.3〜0.7）：生存が困難で、効率的な生物のみ生き残ります。肉食的な種が優位。",
            ],
          },
        ],
      },
      {
        key: "env-mutation",
        label: "突然変異率",
        body: [
          {
            heading: "概要",
            lines: [
              "分裂時の遺伝子変異発生確率を調整します。",
              "1.0 が基準値。",
            ],
          },
          {
            heading: "影響",
            lines: [
              "・高い値（1.5〜2.0）：多くの異なる形質が出現し、種の多様化が加速します。新種が頻繁に誕生。",
              "・中程度（0.8〜1.2）：緩やかな進化が見られます。種が安定化。",
              "・低い値（0.2〜0.5）：変異が少なく、祖先遺伝子がそのまま継承されやすい。種の多様性が低い。",
            ],
          },
        ],
      },
      {
        key: "env-wavespeed",
        label: "エネルギー波速度",
        body: [
          {
            heading: "概要",
            lines: [
              "背景エネルギー波の進行速度を調整します。",
              "1.0 が基準値。0 にすると波が完全に静止します。",
            ],
          },
          {
            heading: "影響",
            lines: [
              "・高い値（1.5〜3.0）：エネルギー分布が激しく動き、生物は移動を強いられます。",
              "・中程度（0.8〜1.2）：定期的な揺らぎ。緩やかな回遊が生まれます。",
              "・低い値（0.1〜0.5）：環境がほぼ静止し、地形に最適化した種が支配的になります。",
              "・ゼロ：波が完全停止。地形のバイアスのみ残り、定住可能。",
            ],
          },
        ],
      },
      {
        key: "env-genes",
        label: "稼働遺伝子",
        body: [
          {
            heading: "概要",
            lines: [
              "個別の遺伝形質を「稼働」または「無効化」できます。",
              "無効化された遺伝子は、全個体で固定値（中央値）になり進化しません。",
            ],
          },
          {
            heading: "用途",
            lines: [
              "・実験・観察：「強さだけが進化する世界」「視野以外を全て止めた世界」など。",
              "・体色（RGB）をオフ：全て灰色になり、系統の視認性は失われますが、能力進化のみ集中して観察できます。",
              "・全 ON / 全 OFF ボタンで一括切替可能。",
            ],
          },
        ],
      },
    ],
  },
  {
    key: "ops",
    label: "操作方法",
    body: [
      {
        lines: [
          "・生命クリック：個体選択（右パネルに詳細＋行動モード表示）",
          "・系統クリック：系統追跡（マップ上で強調表示）",
          "・速度ボタン：x1 / x10 / x100 / 一時停止",
          "・スペースキー：再生／一時停止のトグル（入力フィールド外で有効）",
          "・拡大縮小：マップ右下の ＋ / − ボタン（等倍時はスクロールバー非表示）",
          "・行動ログ：誕生・絶滅・時代変化など世界史を確認（開いている間は時間停止）",
          "・統計グラフ：時系列＋遺伝子分布（ヒストグラム）両対応",
          "・PNG保存：現在のマップを画像として保存",
          "・言語切替：上部バー右端のボタンで JA / EN を切替",
          "・タイトル戻り：左上の「LIFE GRID」をクリック（確認ダイアログあり）",
          "・ホイール：マップにマウスを乗せてスクロールでズーム",
          "・右クリックドラッグ：拡大時にマップをパン（移動）",
          "・ホバー：マウスを生命の上に乗せるとミニ情報ポップアップ",
        ],
      },
      {
        heading: "マップ操作モード（マップ下のアイコン）",
        lines: [
          "⚡ 投入：マップクリックで局所にエネルギー注入（半径 3）",
          "☄🌵🌸 天変地異召喚：クリック位置に隕石／旱魃／大開花を発生",
          "再度同じボタンでモード解除。",
        ],
      },
      {
        heading: "保護モード（金色の光輪）",
        lines: [
          "個体選択後の「保護モード」チェックで戦闘・寿命・天変地異から守る。",
          "観察対象の個体を長期追跡するために使用。",
          "保護中の個体は金色の光輪に包まれる。",
        ],
      },
      {
        heading: "モバイル縦画面（観察モード）",
        lines: [
          "スマホ等の縦画面では自動的に観察モードに切替。",
          "・全体情報・系統・選択生命の各パネルは折りたたみ既定",
          "・マップ操作モード（⚡☄🌵🌸）は非表示",
          "・速度は ×1 と ×100 のみ表示",
          "・ホバーポップアップは無効（タッチ環境のため）",
        ],
      },
    ],
  },
  {
    key: "greeting",
    label: "ごあいさつ",
    body: [
      {
        heading: "ようこそ LIFE GRID へ",
        lines: [
          "この度は LIFE GRID をプレイしていただき、ありがとうございます。",
          "",
          "このゲームは、単純なルールから生命進化と生態系の変化が",
          "自然に立ち現れる様子を、ただ眺めて楽しむシミュレーションです。",
          "勝ち負けはありません。環境を少しずつ調整しながら、",
          "あなただけの進化の物語をのんびり観察してください。",
        ],
      },
      {
        heading: "ご意見・フィードバック",
        lines: [
          "ご感想・ご要望・バグ報告などは、下記 note 記事の",
          "コメント欄までお気軽にお寄せください。",
        ],
      },
      {
        heading: "応援していただけると嬉しいです",
        lines: [
          "もし気に入っていただけたら、SNS でのシェアが何より励みになります。",
          "また、note のチップ（投げ銭）で開発を応援していただけると、",
          "今後のアップデートの大きな力になります。",
          "　▶ https://note.com/kinomeno/n/n95fdec908a26",
          "",
          "今後ともどうぞよろしくお願いいたします。",
        ],
      },
    ],
  },
];

const SECTIONS_EN: Section[] = [
  {
    key: "overview",
    label: "Overview",
    body: [
      {
        heading: "Purpose",
        lines: [
          "A simulation of life evolution and ecological change emerging from simple rules.",
          "No win condition. As an observer, tune the environment and watch the story of evolution unfold.",
        ],
      },
      {
        heading: "Life basics",
        lines: [
          "・Consume energy to act. Die when depleted.",
          "・Reproduce by division; mutations may occur.",
          "・No plant/animal distinction. Behavior emerges from evolution.",
        ],
      },
      {
        heading: "Genetic traits (16)",
        lines: [
          "▼ Basic traits (8)",
          "Color (R/G/B) / Vision / Speed / Size / Strength / Intelligence / Reproduction / Lifespan.",
          "Higher traits cost more energy. Complete generalization is impossible.",
          "",
          "▼ v1.10: Behavior weight genes (7) — personality",
          "Appetite, Predation, Caution, Sociability, Strength-attraction,",
          "Reproductive drive, Starvation sensitivity.",
          "These weights are scaled by intelligence accuracy.",
          "Personalities emerge from the gene combinations.",
          "",
          "▼ v1.10: Mutation rate gene removed",
          "Now a fixed constant. Use the environment-settings multiplier (0–2.0).",
          "",
          "▼ v1.01: Strength & Intelligence cap raised to 999, Reproduction to 2.0",
          "The normal range is sustainable. Mutants beyond it appear rarely",
          "with exponentially rising upkeep cost.",
          "・Strength 100: ~7/turn, 200: ~28, 500: ~175 (lethal)",
          "・The natural sustainable value is decided by the environment.",
        ],
      },
      {
        heading: "Energy field",
        lines: [
          "The world is a 0–100 energy field. It regenerates, diffuses, and waves each turn.",
          "High-energy regions migrate over time (energy waves), encouraging migration.",
        ],
      },
    ],
  },
  {
    key: "rules",
    label: "Behavior Rules",
    body: [
      {
        heading: "Each turn",
        lines: [
          "・Exploration",
          "・Movement",
          "・Energy absorption",
          "・Combat resolution",
          "・Reproduction check",
          "・Aging",
          "・Death check",
        ],
      },
      {
        heading: "Effect of intelligence (continuous scale 0–100)",
        lines: [
          "Intelligence evolves as an integer 0–100. \"Cleverness\" is unlocked in stages.",
          "",
          "▼ Intelligence 0: instinctive random movement",
          "No evaluation of surroundings — moves to a random neighboring cell out of 8.",
          "",
          "▼ Intelligence 1+: vision evaluation begins (scan rate)",
          "\"Intelligence value = percentage of cells in vision that are evaluated.\"",
          "・Intelligence 30: sees 30% of vision, misses the other 70%.",
          "・Intelligence 100: evaluates every cell in vision perfectly.",
          "Also: every 25 intelligence points adds +1 cell to vision range (up to +4).",
          "",
          "▼ Intelligence 20+: avoidance of strong enemies",
          "Above intelligence 20, nearby strong enemies are factored as a threat score in cell evaluation.",
          "Higher intelligence weighs enemies more heavily, choosing safer paths.",
          "",
          "▼ Intelligence 70+: situational mode switching",
          "Above intelligence 70, the life switches between 4 modes based on its state:",
          "・Starving: low energy → prioritize food score, move toward food.",
          "・Fleeing: stronger enemy adjacent → prefer cells far from the enemy.",
          "・Breeding: surplus energy + reproductive age → prefer cells adjacent to empty spots to divide.",
          "・Normal: otherwise → balanced food + weak-enemy avoidance.",
          "",
          "▼ Cost: intelligence is not free",
          "Each point of intelligence adds upkeep cost (≈ 0.72/turn at intelligence 100).",
          "High-intelligence individuals have poor fuel economy and may lose to low-intelligence ones in food-scarce environments.",
          "Intelligence ≠ strongest. The trade-off with the environment drives evolution.",
        ],
      },
      {
        heading: "Behavior modes",
        lines: [
          "Lives with situational judgment behave as follows depending on state:",
          "・Normal: abundant energy and no danger. Aim for the highest-energy cell.",
          "・Starving: own energy below 30% of body size. Prioritize food score, deprioritize avoidance.",
          "・Fleeing: a stronger enemy is adjacent. Evaluate directions that increase distance.",
          "・Breeding: surplus energy + reproductive age. Prefer cells adjacent to empty space.",
        ],
      },
    ],
  },
  {
    key: "combat",
    label: "Combat",
    body: [
      {
        lines: [
          "When lives come into contact, combat may occur.",
          "Deterministic combat with size as defense (v1.01: probabilistic combat removed):",
          "・Attack = your strength",
          "・Defense = opponent's strength + opponent's size × 0.05",
          "・If Attack > Defense → attacker wins for certain",
          "Winner absorbs 60% of opponent's energy. Loser dies.",
          "Size 100 gives +5 defense, 140 gives +7.",
          "Big weak individuals can fend off small strong ones — strategy diversifies.",
          "Strength can evolve up to 999, but upkeep cost rises exponentially,",
          "so the actual sustainable value emerges naturally from the environment.",
        ],
      },
      {
        heading: "Ally recognition (intelligence-independent since v1.10)",
        lines: [
          "All lives recognize same-species individuals as allies regardless of intelligence.",
          "Allies are exempt from combat (no cannibalism).",
          "Combat: log1p(ally count in 3×3) × 1.5 bonus to both attacker and defender.",
          "Group combat strength emerges naturally; lives with high wGregarious",
          "tend to cluster with allies and form herds.",
        ],
      },
      {
        heading: "Predation effect",
        lines: [
          "When combat resolves, a brief expanding circle in the prey's color appears at the prey's cell.",
        ],
      },
    ],
  },
  {
    key: "species",
    label: "Species",
    body: [
      {
        lines: [
          "Individuals with similar RGB values are treated as the same species.",
          "Species names are auto-generated (e.g., R-10, B-04, G-15).",
          "We prioritize intuitive species identification by color.",
        ],
      },
      {
        heading: "Individual shape (gene differentiation)",
        lines: [
          "Individuals take one of 4 shapes based on their genes (0–100 scale):",
          "● Circle: normal (strength < 100 and intelligence < 75)",
          "■ Square: reached MAX strength (=100), rare achievement",
          "▲ Triangle: thinker type (intelligence ≥ 75)",
          "★ Star: extremely rare smart + max strength (str =100, int ≥ 75)",
          "The shapes alone tell you which direction a species is evolving.",
        ],
      },
    ],
  },
  {
    key: "era",
    label: "Era",
    body: [
      {
        lines: [
          "Eras switch automatically based on world state.",
          "Era names are observational tendency labels, not authoritative world states.",
          "Era transitions also switch the energy-wave pattern.",
        ],
      },
    ],
  },
  {
    key: "cataclysm",
    label: "Cataclysms",
    body: [
      {
        heading: "Overview",
        lines: [
          "Roughly every few thousand turns, a sudden large-scale event — a \"cataclysm\" — occurs.",
          "The type and timing are seed-based, so the same seed always reproduces the same history.",
        ],
      },
      {
        heading: "Types",
        lines: [
          "🜂 Meteor impact: near-instantly kills lives within range. Short duration (a few turns).",
          "🌵 Drought: energy slowly drains across a wide area. Long duration (~80 turns).",
          "🌸 Great bloom: a brief period of abundant energy. Medium duration (~60 turns).",
        ],
      },
      {
        heading: "Effects",
        lines: [
          "・Meteors disrupt terrain balance; they trigger extinctions and new emergences.",
          "・Droughts cull fragile species, favoring efficient lineages.",
          "・Blooms drive explosive reproduction and species diversification.",
          "・Events are visible in the action log and as map effects.",
        ],
      },
    ],
  },
  {
    key: "env",
    label: "Environment Settings",
    isCategory: true,
    body: [
      {
        lines: [
          "Parameters the observer can tune during play.",
          "Open the \"Settings\" button at the bottom of the simulation.",
          "Sub-items below describe each parameter.",
        ],
      },
    ],
    children: [
      {
        key: "env-energy",
        label: "Total Energy",
        body: [
          {
            heading: "Overview",
            lines: [
              "Adjusts the world's total energy supply.",
              "1.0 is baseline. Higher = rich environment, lower = harsh.",
            ],
          },
          {
            heading: "Effect",
            lines: [
              "・High (1.5–2.0): life flourishes; many individuals survive. Low predation pressure favors herbivore-like species.",
              "・Medium (0.8–1.2): balanced evolution expected.",
              "・Low (0.3–0.7): survival is hard; only efficient lives remain. Carnivore-like species dominate.",
            ],
          },
        ],
      },
      {
        key: "env-mutation",
        label: "Mutation Rate",
        body: [
          {
            heading: "Overview",
            lines: [
              "Adjusts the probability of gene mutation on division.",
              "1.0 is baseline.",
            ],
          },
          {
            heading: "Effect",
            lines: [
              "・High (1.5–2.0): many traits appear; species diversification accelerates. New species emerge frequently.",
              "・Medium (0.8–1.2): gradual evolution; species stabilize.",
              "・Low (0.2–0.5): few mutations; ancestral genes are inherited as-is. Low diversity.",
            ],
          },
        ],
      },
      {
        key: "env-wavespeed",
        label: "Wave Speed",
        body: [
          {
            heading: "Overview",
            lines: [
              "Adjusts the speed of background energy waves.",
              "1.0 is baseline. 0 freezes the waves completely.",
            ],
          },
          {
            heading: "Effect",
            lines: [
              "・High (1.5–3.0): energy distribution moves rapidly; lives are forced to migrate.",
              "・Medium (0.8–1.2): periodic undulation; gentle circulation arises.",
              "・Low (0.1–0.5): the environment is nearly static; species adapted to terrain dominate.",
              "・Zero: waves are completely halted; only terrain bias remains, settlement becomes viable.",
            ],
          },
        ],
      },
      {
        key: "env-genes",
        label: "Active Genes",
        body: [
          {
            heading: "Overview",
            lines: [
              "Each genetic trait can be \"active\" or \"disabled.\"",
              "Disabled genes are fixed (median value) for all individuals and do not evolve.",
            ],
          },
          {
            heading: "Usage",
            lines: [
              "・Experiment/observe: \"a world where only strength evolves,\" \"a world where everything except vision is frozen,\" etc.",
              "・Disable color (RGB): all individuals become gray; species visibility is lost, but you can focus on ability evolution.",
              "・Toggle all on/off with the All-On / All-Off buttons.",
            ],
          },
        ],
      },
    ],
  },
  {
    key: "ops",
    label: "Controls",
    body: [
      {
        lines: [
          "・Click a life: select the individual (right panel shows details + behavior mode).",
          "・Click a species: track it (highlighted on the map).",
          "・Speed buttons: x1 / x10 / x100 / pause.",
          "・Spacebar: toggle play/pause (works outside input fields).",
          "・Zoom: ＋ / − buttons at bottom-right of map (no scrollbar at 100%).",
          "・Action log: review world history — births, extinctions, era changes (time pauses while open).",
          "・Stats graph: time series + gene distribution (histogram) modes.",
          "・Save PNG: download current map view as an image.",
          "・Language toggle: JA / EN button at the top-right of the header.",
          "・Return to title: click \"LIFE GRID\" at top-left (confirmation dialog appears).",
          "・Mouse wheel: scroll on the map to zoom.",
          "・Right-click drag: pan the map when zoomed in.",
          "・Hover: place mouse over a life for a mini info popup.",
        ],
      },
      {
        heading: "Map modes (icons under the map)",
        lines: [
          "⚡ Inject: click the map to add local energy (radius 3)",
          "☄🌵🌸 Cataclysm summon: click to spawn meteor / drought / bloom",
          "Click the same button again to clear the mode.",
        ],
      },
      {
        heading: "Protect mode (gold halo)",
        lines: [
          "Toggle \"Protect\" in the selected-life panel to make a life immune to combat, aging, and cataclysms.",
          "Use it for long-term observation. Protected lives are wrapped in a gold halo.",
        ],
      },
      {
        heading: "Mobile portrait (observation mode)",
        lines: [
          "Switches automatically to observation mode in portrait orientation.",
          "・Info / species / selected-life panels collapsed by default",
          "・Map mode buttons (⚡☄🌵🌸) hidden",
          "・Only ×1 and ×100 speeds shown",
          "・Hover popup disabled (touch environment)",
        ],
      },
    ],
  },
  {
    key: "greeting",
    label: "Welcome",
    body: [
      {
        heading: "Welcome to LIFE GRID",
        lines: [
          "Thank you for playing LIFE GRID!",
          "",
          "This is a simulation where life evolution and ecosystem change",
          "emerge naturally from simple rules — just sit back and watch.",
          "There is no winning or losing. Tune the environment little by little",
          "and enjoy observing your own unique story of evolution.",
        ],
      },
      {
        heading: "Feedback",
        lines: [
          "Thoughts, requests, and bug reports are very welcome —",
          "please leave a comment on the note article below.",
        ],
      },
      {
        heading: "Support",
        lines: [
          "If you enjoy it, sharing on social media means a lot.",
          "A tip on note also greatly helps future development:",
          "　▶ https://note.com/kinomeno/n/n95fdec908a26",
          "",
          "Thank you, and enjoy!",
        ],
      },
    ],
  },
];

type Props = {
  onClose: () => void;
  // v1.20: モーダル位置記録
  initialOffset?: DragOffset;
  onOffsetChange?: (o: DragOffset) => void;
};

/** 全セクションを平坦化（カテゴリ自体も含み、子も追加）。 */
function flatten(sections: Section[]): Section[] {
  const out: Section[] = [];
  for (const s of sections) {
    out.push(s);
    if (s.children) {
      for (const c of s.children) out.push(c);
    }
  }
  return out;
}

function sectionsFor(locale: Locale): Section[] {
  return locale === "en" ? SECTIONS_EN : SECTIONS_JA;
}

export default function RulesScreen({
  onClose,
  initialOffset,
  onOffsetChange,
}: Props) {
  const { t, locale } = useLocale();
  const sections = sectionsFor(locale);
  const flat = flatten(sections);
  const [active, setActive] = useState<string>(sections[0].key);
  const section = flat.find((s) => s.key === active) ?? sections[0];
  // v1.11/v1.20: モーダルドラッグ + 位置記録
  const { offset, dragging, dragHandlers } = useDraggablePanel(
    initialOffset,
    onOffsetChange
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel modal-wide rules-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <div
          className="modal-head modal-draggable"
          data-dragging={dragging}
          {...dragHandlers}
        >
          <h2 className="modal-title">{t("start.button.rules")}</h2>
          <button className="btn modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="rules-layout">
          <nav className="rules-menu">
            {sections.map((s) => (
              <div key={s.key} className="rules-menu-group">
                <button
                  className={`rules-menu-item ${
                    active === s.key ? "rules-menu-active" : ""
                  } ${s.isCategory ? "rules-menu-category" : ""}`}
                  onClick={() => setActive(s.key)}
                >
                  {s.label}
                </button>
                {s.children && (
                  <div className="rules-menu-children">
                    {s.children.map((c) => (
                      <button
                        key={c.key}
                        className={`rules-menu-item rules-menu-child ${
                          active === c.key ? "rules-menu-active" : ""
                        }`}
                        onClick={() => setActive(c.key)}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
          <div className="rules-content">
            <h3 className="rules-content-title">{section.label}</h3>
            {section.body.map((b, i) => (
              <div key={i} className="rules-content-block">
                {b.heading && (
                  <div className="rules-content-heading">{b.heading}</div>
                )}
                {b.lines.map((line, j) => (
                  <p key={j} className="rules-content-line">
                    {line}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
