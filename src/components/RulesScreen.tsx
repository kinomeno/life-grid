"use client";

import { useState } from "react";
import { useLocale } from "./LocaleProvider";
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
        heading: "遺伝形質（9 種）",
        lines: [
          "色（R/G/B）／視野／移動速度／体格／強さ／知能／繁殖率／突然変異率／寿命。",
          "高性能ほど維持コスト増。完全な万能化は不可。",
          "",
          "▼ v1.01：強さ・知能の上限を 999 / 繁殖率の上限を 2.0 に拡張",
          "通常レンジ（強さ・知能 0〜100、繁殖率 0〜0.4）が安定して生存可能。",
          "それを超える「ミュータント個体」は突然変異で稀に発生し、",
          "高い能力と引き換えに維持コストが指数的に上昇する。",
          "・強さ 100：コスト ~7/ターン、強さ 200：~28、強さ 500：~175（即死級）",
          "・観察上の上限は環境次第で自然に決まる。",
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
        heading: "知能の影響（0〜100 連続スケール）",
        lines: [
          "知能は 0〜100 の整数で進化し、行動の「賢さ」が段階的に解放されます。",
          "",
          "▼ 知能 0：本能だけのランダム移動",
          "周囲を一切評価せず、隣接 8 マスからランダムに 1 マス選んで動きます。",
          "",
          "▼ 知能 1〜:視野評価が始まる（視野サーチ率）",
          "「知能の値 = 視野内セルを評価する割合(%)」です。",
          "・知能 30：視野の 30% だけ見えて、残り 70% は見落とす",
          "・知能 100：視野の全セルを完全に評価できる",
          "また、知能 25 ごとに視野範囲が +1 マス遠くまで届きます（最大 +4）。",
          "",
          "▼ 知能 20〜:強い敵を避けて動く（敵回避）",
          "知能 20 を超えると、隣接する強敵を脅威スコアとしてセル評価に反映し始めます。",
          "知能が高いほど敵を強く嫌い、より安全な経路を選びます。",
          "",
          "▼ 知能 70〜:状況判断モードが起動",
          "知能 70 を超えると、自分の状態に応じて 4 モードを切り替えるようになります：",
          "・飢餓モード：エネルギー残量が少ない → 餌スコアを最重視して食料に向かう",
          "・逃走モード：自分より強い敵が隣接 → 敵から離れる方向を高評価",
          "・繁殖モード：エネルギー余剰＋繁殖可能年齢 → 空きセル隣接を高評価し分裂しやすく",
          "・通常モード：上記以外 → 餌＋弱敵回避のバランス行動",
          "",
          "▼ コスト：知能はタダではない",
          "知能 1 ごとにエネルギー消費が増えます（知能 100 で約 0.72/ターン）。",
          "高知能個体は燃費が悪く、餌の少ない環境では知能が低い個体に負けることも。",
          "知能＝最強ではなく、環境とのトレードオフが進化を決めます。",
        ],
      },
      {
        heading: "行動モード",
        lines: [
          "状況判断が有効な個体は、自身の状態に応じて以下のモードで行動します。",
          "・通常：エネルギーが豊富で危険なし。最大エネルギー地点を目指す。",
          "・飢餓：所持エネルギーが体格の 30% 未満。餌スコアを最重視し敵回避を軽視。",
          "・逃走：隣接に自分より強い敵が居る。距離を取る方向を評価。",
          "・繁殖期：エネルギー余剰＋繁殖可能年齢。空きセル隣接を優先。",
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
          "生命同士が接触した場合、戦闘が発生することがあります。",
          "体格を防御役として組み込んだ決定論的戦闘（v1.01 から確率廃止）：",
          "・攻撃力 = 自分の強さ",
          "・防御力 = 相手の強さ + 相手の体格 × 0.05",
          "・攻撃力 > 防御力 → 攻撃側が確実に勝利",
          "勝者：相手のエネルギーの 60% を吸収（既定）。敗者は死亡。",
          "体格 100 で +5、140 で +7 の防御。",
          "体格大の弱者が小型強者を撃退できる、戦略の多様性が生まれる。",
          "強さは上限 999 まで進化可能だが、維持コストが指数的に増加するため、",
          "観察上の生存可能値は環境次第で自然に決まる。",
        ],
      },
      {
        heading: "仲間認識（知能 70 以上）",
        lines: [
          "知能 70 を超える個体は、同じ系統（同 RGB ブロック）を「仲間」として認識します。",
          "仲間は戦闘の対象外、脅威スコアも 0。逃走モードでも避けません。",
          "結果として、賢い種は群れを形成しやすくなります。",
        ],
      },
      {
        heading: "捕食エフェクト",
        lines: [
          "戦闘成立時、被食者の位置に被食色の円が広がって消える短いエフェクトが表示されます。",
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
        key: "env-combat",
        label: "攻撃優位度",
        body: [
          {
            heading: "概要",
            lines: [
              "戦闘時に勝者が奪うエネルギー比率を調整します。",
              "0.0〜1.0 の範囲。",
            ],
          },
          {
            heading: "影響",
            lines: [
              "・高い値（0.7〜1.0）：捕食による利益が大きく、肉食戦略が非常に有利。猛獣的な生物が繁栄。",
              "・中程度（0.4〜0.6）：略奪と採食のバランスが取れた進化が見られます。",
              "・低い値（0.0〜0.3）：戦闘による利益が少なく、採食一辺倒の方が効率的。草食的な種が優位。",
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
        heading: "Genetic traits (9)",
        lines: [
          "Color (R/G/B) / Vision / Speed / Size / Strength / Intelligence / Reproduction / Mutation / Lifespan.",
          "Higher traits cost more energy. Complete generalization is impossible.",
          "",
          "▼ v1.01: Strength & Intelligence cap raised to 999, Reproduction to 2.0",
          "The normal range (Strength/Intelligence 0–100, Reproduction 0–0.4) is",
          "sustainable. Mutant individuals beyond this range appear rarely from",
          "mutations, gaining high ability at exponentially rising upkeep cost.",
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
        heading: "Ally recognition (intelligence 70+)",
        lines: [
          "Lives with intelligence > 70 recognize same-species individuals as allies.",
          "Allies are exempt from combat and contribute 0 to threat scoring; even fleeing mode does not flee from them.",
          "As a result, smart species tend to form herds.",
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
        key: "env-combat",
        label: "Combat Advantage",
        body: [
          {
            heading: "Overview",
            lines: [
              "Adjusts the energy ratio the winner takes in combat.",
              "Range 0.0–1.0.",
            ],
          },
          {
            heading: "Effect",
            lines: [
              "・High (0.7–1.0): predation yields large gains; carnivore strategies are very advantageous. Predatory lives flourish.",
              "・Medium (0.4–0.6): a balance of raiding and foraging emerges.",
              "・Low (0.0–0.3): little gain from combat; foraging alone is more efficient. Herbivore-like species dominate.",
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
];

type Props = {
  onClose: () => void;
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

export default function RulesScreen({ onClose }: Props) {
  const { t, locale } = useLocale();
  const sections = sectionsFor(locale);
  const flat = flatten(sections);
  const [active, setActive] = useState<string>(sections[0].key);
  const section = flat.find((s) => s.key === active) ?? sections[0];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel modal-wide rules-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
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
