"use client";

import { useState, type ReactNode } from "react";
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
          "通常マップは勝利条件なし。観察者として環境を調整し、進化の物語を見守る。",
          "世界地図モードには勝利条件がある（全地域を一つの出自が制覇）。下記「世界地図モード」参照。",
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
        heading: "遺伝形質",
        lines: [
          "生命は体色と、さまざまな能力・性格を遺伝子として持つ。",
          "分裂で子に受け継がれ、ときに突然変異で少しずつ変化する。",
          "",
          "▼ 能力",
          "視野・移動速度・体格・強さ・知能・寿命・出産の閾値と数。",
          "・能力が高いほど生存に有利だが、維持にエネルギーを多く消費する。",
          "・万能な生命は維持できない。環境に合った得意分野を持つ種が生き残る。",
          "",
          "▼ 性格（行動の傾向）",
          "食欲・捕食欲・警戒・社交性・強者追従・繁殖欲・飢餓敏感。",
          "・これらの強弱の組み合わせで、狩人・臆病・群れ好きなど多様な性格が現れる。",
          "・知能が高いほど、性格どおりに的確に行動する。",
          "",
          "具体的な数値バランスは、観察して発見してください。",
        ],
      },
      {
        heading: "エネルギー場",
        lines: [
          "世界は一面のエネルギー場。生命はここから食べて生きる。",
          "エネルギーは絶えず回復し、波のように広がり、移動していく。",
          "豊かな場所と乏しい場所が移り変わるため、回遊や移住が生まれる。",
        ],
      },
    ],
  },
  {
    key: "worldmap",
    label: "世界地図モード",
    body: [
      {
        heading: "世界地図とは",
        lines: [
          "実在の世界地図を模した固定マップ。海は壁（侵入・繁殖・エネルギー無し）、陸が生息域。",
          "孤立した大陸・島は1ドット幅の橋でつながり行き来できる。左右はつながる（大西洋）。",
          "各大陸は出自（系統の故郷）として色分けされ、複数の祖先種が配置される。",
          "エネルギーは全陸で均一（地域差なし＝公平）。",
        ],
      },
      {
        heading: "大陸の協力と競争",
        lines: [
          "・同じ出自の生命は、体色（種）が違っても味方＝攻撃せず共闘する（大陸対抗）。",
          "・ただし自分の本拠地（出自の地域）の中では、同出自どうしでも競争する（内部競争）。",
          "・別の出自とは戦う（色が似ていても敵）。",
        ],
      },
      {
        heading: "勝利＝全地域制覇",
        lines: [
          "勢力地図（各地域を最大勢力の出自の色で塗る）が全地域とも同じ色になれば「制覇」。",
          "制覇すると再生が一時停止し、勝利演出（所要ターン等）が出る。閉じれば観察を続行できる。",
          "制覇後は一定期間「治世」となり覇者以外は戦闘が弱る。耐え抜いて別の出自が再統一すると「革命」。",
        ],
      },
      {
        heading: "表示の操作（下部バー）",
        lines: [
          "・🗺️ 勢力地図：地域を最大勢力の色で薄く塗り、輪郭線を引く（初期ON）。",
          "・🏷️ 地域名：各地域の名前を地図に重ねる。",
          "・系統名は出自つき（例「北アメリカA」）。系統樹は行動ログ内のタブ＋「画像保存」。",
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
        heading: "知能の役割",
        lines: [
          "知能は「判断の正確さ」を決める。",
          "・知能が低い生命は気まぐれに動く（性格が行動に出にくい）。",
          "・知能が高い生命は、性格どおりに的確に動き、遠くまで見渡し、",
          "  効率よく採餌し、戦いでも有利になる。",
          "",
          "賢さは強力だが、知能の維持にもエネルギーがかかる。",
          "「賢いが燃費の悪い種」と「単純だが効率的な種」、",
          "どちらが生き残るかは環境しだい。",
          "",
          "個体を選ぶと、その生命の「行動の特徴」を文章で確認できます。",
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
          "生命同士がぶつかると戦闘が起きる。",
          "・強い方が勝ち、相手のエネルギーを奪う。負けた側は死ぬ。",
          "・倒された生命の体は、一部がその場のエネルギーとして残る（死骸）。",
          "  死骸はやがて他の生命を引き寄せ、新たな捕食を生む。",
          "",
          "強さを上げれば戦いに有利になるが、維持コストも上がる。",
          "戦うか、逃げるか、群れるか——性格しだいで生き方が分かれる。",
        ],
      },
      {
        heading: "仲間",
        lines: [
          "近い体色の生命を「仲間（同じ系統）」として認識する。",
          "・仲間どうしは戦わない（共食いしない）。",
          "・まわりに仲間が多いほど、戦闘で有利になる（群れの力）。",
          "・社交的な性格の生命ほど、仲間に近づき群れを作りやすい。",
        ],
      },
      {
        heading: "捕食の演出",
        lines: [
          "捕食の瞬間、捕食者が一瞬ふくらみ、獲物が吸い込まれて消える。",
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
          "体色は「仲間（系統）」を表します。近い体色の個体が同じ系統です。",
          "能力・行動が変化すると体色も少しずつ変化し、十分に変わると",
          "新しい色＝新種として枝分かれします（種分化）。同種は画面上で同じ色。",
          "別の系統が偶然似た能力に進化（収斂進化）しても、色は別＝別種のまま。",
          "系統名は自動生成されます（例：R-10, B-04, G-15）。",
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
              "・全 ON / 全 OFF ボタンで一括切替可能。",
              "・「エネルギー共有（利他）」：ONで困窮した近縁へ余剰エネルギーを分け与える血縁淘汰の実験ができます（既定OFF）。",
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
        heading: "再生・速度",
        lines: [
          "**速度ボタン** … x1 / x10 / x100 / 一時停止",
          "**スペースキー** … 再生／一時停止のトグル（入力欄の外で有効）",
        ],
      },
      {
        heading: "視点（ズーム・移動・全画面）",
        lines: [
          "**＋ / − ボタン** … マップ右下で拡大縮小（等倍時はスクロールバー非表示）",
          "**マウスホイール** … マップ上でスクロールしてズーム",
          "**右クリックドラッグ** … 拡大時にマップをパン（移動）",
          "**全画面（⛶ / ⛶⛶）** … マップ下のアイコン。⛶＝HUDを隠す／⛶⛶＝真の全画面（観賞専用）",
        ],
      },
      {
        heading: "選択・観察",
        lines: [
          "**生命クリック** … 個体を選択（右パネルに詳細・行動モード）",
          "**系統クリック** … その系統を追跡（マップ上で強調）",
          "**ホバー** … 生命にマウスを乗せるとミニ情報（PC のみ）",
          "**▼注目選択** … 選択生命の下から最強／最賢／最速／最大／最古へジャンプ",
          "**🧠 思考ヒートマップ** … マップ下のアイコン。選択個体が次にどこへ動きたいかを色で表示（青=低→赤=高）",
        ],
      },
      {
        heading: "観察ウィンドウ",
        lines: [
          "**統計グラフ** … 時系列／遺伝子分布／戦略散布（速度×知能・点＝系統色）",
          "**行動ログ** … 「ログ」「年表（主要イベント）」「系統樹（種の枝分かれ）」の3タブ",
        ],
      },
      {
        heading: "介入（マップ下のアイコン）",
        lines: [
          "**🎬 シネマ追尾** … 注目個体（最大勢力／最古参／最強）へカメラが寄って自動追従",
          "**⚡ 投入** … クリック位置にエネルギーを注入（半径 3）",
          "**☄ / 🌵 / 🌸 天変地異** … クリック位置に隕石／旱魃／大開花。再度押すと解除",
        ],
      },
      {
        heading: "ファイル・共有",
        lines: [
          "**セーブ／ロード（右上メニュー）** … 「セーブ／ロード」＝ブラウザ内に保存・読み出し。「書き出し／読み込み」＝ファイルで保存・復元（続きから同じ進化を再現）",
          "**PNG保存** … 現在のマップを画像として保存",
          "**𝕏 で共有** … 右下のボタンから投稿（環境設定は共有URLに含まれます）",
        ],
      },
      {
        heading: "その他",
        lines: [
          "**言語切替** … 上部バー右端の JA / EN",
          "**タイトルへ戻る** … 左上「LIFE GRID」をクリック（確認あり）",
        ],
      },
      {
        heading: "保護モード（金色の光輪）",
        lines: [
          "個体選択後の「**保護モード**」チェックで戦闘・寿命・天変地異から守る。",
          "観察対象を長期追跡するために使用。保護中の個体は金色の光輪に包まれる。",
        ],
      },
      {
        heading: "モバイル縦画面（観察モード）",
        lines: [
          "スマホ等の縦画面では自動的に観察モードに切替。",
          "・全体情報／系統／選択生命の各パネルは折りたたみ既定",
          "・速度は ×1 と ×100 のみ表示",
          "・ホバーは無効（タッチ環境のため。タップで操作）",
        ],
      },
    ],
  },
  {
    key: "changelog",
    label: "更新履歴",
    body: [
      {
        heading: "バージョンごとの新機能",
        lines: [
          "v1.30: 体色＝仲間(系統タグ)・利他(エネルギー共有/任意)・25画面=観察モード・戦略散布図・年表・シネマ追尾・注目選択・知能再設計",
          "v1.21: 環境バランス・大マップ軽量化・致命バグ修正・モバイルUI",
          "v1.20: 植物的生物・出産数遺伝子・真の全画面・行動の特徴表示",
          "v1.11: 戦闘で死骸が残る・速度/体格の上限拡張",
          "v1.10: 性格遺伝子(7種)・知能=判断精度モデルに刷新",
          "v1.02: マップ全画面・移動軌跡・選択の自動継承",
          "v1.01: 強さ・知能の上限を 999 に拡張",
          "v1.00: 公開",
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
        heading: "詳しい遊び方・解説（note）",
        lines: [
          "遊び込む人向けの完全ガイド（詳細説明書）を note に公開しています。",
          "各機能の意味・観察のコツ・戦略のヒントはこちらへ。",
          "　▶ https://note.com/kinomeno/n/ndb8659cc6d4a",
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
          "Standard maps have no win condition; observe and tune the environment.",
          "World Map mode has a win condition: one origin dominates every region. See \"World Map mode\" below.",
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
        heading: "Genetic traits",
        lines: [
          "Each life carries a body color plus various abilities and personality",
          "traits as genes. They pass to offspring via division, with occasional",
          "mutations that drift slightly over generations.",
          "",
          "▼ Abilities",
          "Vision / Speed / Size / Strength / Intelligence / Lifespan /",
          "Birth threshold & count.",
          "・Higher abilities aid survival but cost more energy to maintain.",
          "・No life can be all-powerful. Species with the right specialty survive.",
          "",
          "▼ Personality (behavioral tendencies)",
          "Appetite, Predation, Caution, Sociability, Strength-following,",
          "Reproductive drive, Starvation sensitivity.",
          "・Their combination yields diverse personalities: hunter, timid, social…",
          "・The smarter a life, the more accurately it acts on its personality.",
          "",
          "Discover the exact numeric balance through observation.",
        ],
      },
      {
        heading: "Energy field",
        lines: [
          "The world is one vast energy field. Life feeds on it to survive.",
          "Energy constantly regenerates, spreads like waves, and shifts around.",
          "Rich and poor regions keep changing, driving migration.",
        ],
      },
    ],
  },
  {
    key: "worldmap",
    label: "World Map mode",
    body: [
      {
        heading: "What it is",
        lines: [
          "A fixed map shaped like the real world. Sea is a wall (no entry/breeding/energy); land is habitable.",
          "Isolated continents/islands connect via 1-cell bridges; left and right wrap (Atlantic).",
          "Each continent is an origin (a lineage's homeland), color-coded, seeded with several founder species.",
          "Energy is uniform across all land (no regional bias = fair).",
        ],
      },
      {
        heading: "Continental cooperation & rivalry",
        lines: [
          "・Same-origin lives are allies even if their color (species) differs — they don't fight and battle together.",
          "・But within their home region, same-origin lives still compete (internal rivalry).",
          "・Different origins fight (enemies even if similar in color).",
        ],
      },
      {
        heading: "Victory = control every region",
        lines: [
          "When the territory map (each region tinted by its dominant origin) becomes one color, that origin wins.",
          "On victory, the sim pauses and shows a result card (turns taken, etc.). Close it to keep watching.",
          "After victory a \"reign\" weakens non-rulers for a while; if another origin reunifies, a \"Revolution\" occurs.",
        ],
      },
      {
        heading: "Display controls (bottom bar)",
        lines: [
          "・🗺️ Territory map: tint each region by its dominant origin and draw outlines (on by default).",
          "・🏷️ Region names: overlay each region's name on the map.",
          "・Lineage names include origin (e.g. \"N. America A\"). The lineage tree is a tab in the action log with \"Save PNG\".",
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
        heading: "Role of intelligence",
        lines: [
          "Intelligence determines how accurately a life makes decisions.",
          "・Low intelligence: moves erratically (personality barely shows).",
          "・High intelligence: acts on its personality precisely, sees farther,",
          "  forages efficiently, and fights more effectively.",
          "",
          "Cleverness is powerful, but maintaining it costs energy.",
          "Whether a \"smart but fuel-hungry\" species or a \"simple but efficient\"",
          "one survives depends on the environment.",
          "",
          "Select a life to see its behavioral tendencies described in words.",
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
          "When lives collide, combat occurs.",
          "・The stronger one wins and takes the loser's energy. The loser dies.",
          "・The fallen body partly remains as energy on that cell (a carcass),",
          "  which later draws other lives and sparks new predation.",
          "",
          "Raising strength helps in battle, but upkeep cost rises too.",
          "Fight, flee, or flock — personality decides each way of life.",
        ],
      },
      {
        heading: "Allies",
        lines: [
          "Lives of similar body color are recognized as allies (same species).",
          "・Allies never fight each other (no cannibalism).",
          "・The more allies nearby, the stronger in combat (power of the herd).",
          "・Social lives tend to gather with allies and form herds.",
        ],
      },
      {
        heading: "Predation effect",
        lines: [
          "On predation, the predator briefly swells and the prey is drawn in and vanishes.",
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
          "Body color represents kin (lineage). Similar colors = same species.",
          "As abilities/behavior change, color drifts slightly; once it changes",
          "enough, a new color = a new species branches off (speciation).",
          "Same-species individuals share the same on-screen color.",
          "Even if separate lineages converge on similar abilities, colors stay",
          "different — so convergent evolution appears as distinct species.",
          "Species names are auto-generated (e.g., R-10, B-04, G-15).",
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
              "・Toggle all on/off with the All-On / All-Off buttons.",
              "・\"Energy sharing (altruism)\": when on, lives donate surplus energy to needy kin — experiment with kin selection (default off).",
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
        heading: "Playback & speed",
        lines: [
          "**Speed buttons** … x1 / x10 / x100 / pause",
          "**Spacebar** … toggle play/pause (works outside input fields)",
        ],
      },
      {
        heading: "View (zoom, pan, fullscreen)",
        lines: [
          "**＋ / − buttons** … zoom at bottom-right of map (no scrollbar at 100%)",
          "**Mouse wheel** … scroll on the map to zoom",
          "**Right-click drag** … pan the map when zoomed in",
          "**Fullscreen (⛶ / ⛶⛶)** … icons under the map. ⛶ = hide HUD / ⛶⛶ = true fullscreen (viewing only)",
        ],
      },
      {
        heading: "Select & observe",
        lines: [
          "**Click a life** … select it (right panel shows details & behavior mode)",
          "**Click a species** … track it (highlighted on the map)",
          "**Hover** … mini info popup over a life (PC only)",
          "**▼Focus** … from under the selected life, jump to strongest/smartest/fastest/biggest/oldest",
          "**🧠 Thought heatmap** … icon under the map. Colors where the selected life wants to move next (blue=low → red=high)",
        ],
      },
      {
        heading: "Observation windows",
        lines: [
          "**Stats graph** … time series / gene distribution / strategy scatter (speed×intelligence, point = species color)",
          "**Action log** … three tabs: Log / Chronicle (major events) / Lineage (species branching)",
        ],
      },
      {
        heading: "Intervene (icons under the map)",
        lines: [
          "**🎬 Cinema follow** … camera zooms in and auto-tracks a notable life (dominant/oldest/strongest)",
          "**⚡ Inject** … click to add local energy (radius 3)",
          "**☄ / 🌵 / 🌸 Cataclysm** … click to spawn meteor / drought / bloom. Press again to clear",
        ],
      },
      {
        heading: "File & share",
        lines: [
          "**Save / Load (top-right menu)** … Save/Load = store/restore in the browser. Export/Import = save/restore via a file (resume the same evolution)",
          "**Save PNG** … download the current map as an image",
          "**Share on 𝕏** … post from the button at bottom-right (environment settings are included in the share URL)",
        ],
      },
      {
        heading: "Other",
        lines: [
          "**Language** … JA / EN at the top-right of the header",
          "**Return to title** … click \"LIFE GRID\" at top-left (confirmation appears)",
        ],
      },
      {
        heading: "Protect mode (gold halo)",
        lines: [
          "Toggle \"**Protect**\" in the selected-life panel to make a life immune to combat, aging, and cataclysms.",
          "Use it for long-term observation. Protected lives are wrapped in a gold halo.",
        ],
      },
      {
        heading: "Mobile portrait (observation mode)",
        lines: [
          "Switches automatically to observation mode in portrait orientation.",
          "・Info / species / selected-life panels collapsed by default",
          "・Only ×1 and ×100 speeds shown",
          "・Hover disabled (touch environment; tap to interact)",
        ],
      },
    ],
  },
  {
    key: "changelog",
    label: "Changelog",
    body: [
      {
        heading: "New features by version",
        lines: [
          "v1.30: Color = kin (lineage tag), altruism (energy sharing/opt-in), 25-map observe mode, strategy scatter, chronicle, cinema follow, focus-jump, intelligence redesign",
          "v1.21: Environment balance, large-map perf, critical bug fixes, mobile UI",
          "v1.20: Plant-like life, offspring gene, true fullscreen, behavior view",
          "v1.11: Carcasses remain after combat, speed/size cap raised",
          "v1.10: Personality genes (7), intelligence = decision accuracy",
          "v1.02: Fullscreen map, movement trail, auto-inherit selection",
          "v1.01: Strength / intelligence cap raised to 999",
          "v1.00: Public launch",
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
        heading: "Full guide (note)",
        lines: [
          "A complete guide for deep play is published on note (Japanese).",
          "For what each feature means and strategy tips:",
          "　▶ https://note.com/kinomeno/n/ndb8659cc6d4a",
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

/**
 * v1.20: 行内の URL を検出してクリック可能なリンクに変換する。
 * ご挨拶セクションの note URL などを強調表示。
 */
function renderLine(line: string): ReactNode {
  // v1.31: 行内の **太字** と http(s) URL をインラインで処理する。
  const nodes: ReactNode[] = [];
  let key = 0;
  // まず **bold** で分割（偶数=通常, 奇数=太字）
  const boldParts = line.split(/\*\*([^*]+)\*\*/g);
  boldParts.forEach((seg, i) => {
    if (seg === "") return;
    if (i % 2 === 1) {
      nodes.push(
        <strong key={key++} className="rules-term">
          {seg}
        </strong>
      );
      return;
    }
    // 通常部分内の URL をリンク化（全角/半角スペースまで）
    const parts = seg.split(/(https?:\/\/[^\s　]+)/g);
    for (const part of parts) {
      if (part === "") continue;
      if (/^https?:\/\//.test(part)) {
        nodes.push(
          <a
            key={key++}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="rules-link"
          >
            {part}
          </a>
        );
      } else {
        nodes.push(<span key={key++}>{part}</span>);
      }
    }
  });
  return nodes;
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
                    {renderLine(line)}
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
