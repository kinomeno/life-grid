/**
 * 多言語化基盤（最小実装）。
 *
 * 仕様：
 *  - サポート言語: 日本語 (ja) / English (en)
 *  - localStorage に選択を保存し、再訪時に復元
 *  - 翻訳辞書は段階的に拡張する。未翻訳キーは ja の値にフォールバック
 *
 * 使い方：
 *   const { t, locale, setLocale } = useLocale();
 *   <h1>{t("app.title")}</h1>
 */

export type Locale = "ja" | "en";

export const SUPPORTED_LOCALES: Locale[] = ["ja", "en"];
export const DEFAULT_LOCALE: Locale = "ja";
export const LOCALE_STORAGE_KEY = "lgrid_locale";

type Dictionary = Record<string, string>;

const ja: Dictionary = {
  "app.title": "LIFE GRID",
  "app.subtitle": "生命進化シミュレーター",
  "app.version": "ver 1.21.1",
  "lang.toggle.ja": "JA",
  "lang.toggle.en": "EN",

  // 開始画面
  "start.map_size": "マップサイズ",
  "start.life_count": "初期生命数",
  "start.initial_genes": "初期生命遺伝子",
  "start.seed": "シード値（任意）",
  "start.placeholder.random": "ランダム",
  "start.placeholder.seed": "空欄で自動生成",
  "start.gene_hint": "空欄なら全個体ランダム。{n}桁の遺伝子IDを入力すると全初期生命が同じ遺伝子で開始します。",
  "start.gene_error": "遺伝子IDが不正です（{n}桁の数字、または空欄でランダム）",
  "start.button.rules": "ルール説明",
  "start.button.start": "シミュレーション開始",

  // 共通
  "common.cancel": "キャンセル",
  "common.unlock": "解除",
  "common.close": "✕",
  "common.copy": "コピー",
  "common.copied": "コピー済",
  "common.load": "読み込み",
  "common.reset_default": "既定値に戻す",
  "common.dash": "—",
  "common.locked_hint": "ロック中（クリックで解除手順を表示）",
  "common.yes": "はい",
  "common.no": "いいえ",

  // タイトル戻り確認
  "confirm.title_return": "タイトルに戻りますか？",
  "confirm.title_return_hint": "現在のシミュレーションは破棄されます。",

  // パスワード
  "password.title": "ロック解除",
  "password.message": "この機能の利用にはパスワードが必要です。",
  "password.placeholder": "パスワードを入力",
  "password.error": "パスワードが違います。",
  "password.cta": "こちらでゲットできます！",
  "password.feature.map": "{label} マップ",
  "password.feature.speed": "× {speed} 速度",

  // 上部ステータス
  "status.seed": "シード",
  "status.map": "マップ",
  "status.tps": "turn/s",
  "status.effective_x": "実倍率",

  // 全体情報パネル
  "panel.global_info": "全体情報",
  "panel.species_top": "系統（上位）",
  "panel.selected_life": "選択した生命",
  "panel.tab.basic": "基本",
  "panel.tab.genes": "遺伝",
  "panel.tab.personality": "性格",
  "panel.genes": "遺伝子",
  "panel.gene_params": "遺伝子内パラメータ",
  "panel.current_params": "現在のパラメータ",

  "info.turn": "ターン",
  "info.era": "時代",
  "info.environment": "環境",
  "info.life_count_total": "総生物数",
  "info.species_count": "系統数",
  "info.avg_energy": "平均エネルギー",
  "info.avg_intelligence": "平均知能",
  "info.max_intelligence": "最大知能",
  "info.avg_speed": "平均移動速度",

  "info.species": "系統",
  "info.rgb": "RGB",
  "info.vision": "視野",
  "info.move_speed": "移動速度",
  "info.size": "体格",
  "info.strength": "強さ",
  "info.intelligence": "知能",
  "info.birth_threshold": "出産閾値",
  "info.mutation_rate": "突然変異率",
  "info.lifespan": "寿命",
  "info.offspring_count": "出産数",

  "info.id": "ID",
  "info.position": "位置",
  "info.energy_owned": "所持エネルギー",
  "info.age": "年齢",
  "info.behavior_mode": "行動モード",
  "info.behavior_traits": "行動の特徴",
  "behavior_desc.chase_prey": "餌を見つけると追う",
  "behavior_desc.flee_threat": "強い敵から逃げる",
  "behavior_desc.follow_strong": "強い仲間に寄る",
  "behavior_desc.gather": "仲間と群れる",
  "behavior_desc.forage": "食料を探し回る",
  "behavior_desc.seek_breeding": "繁殖場所を求める",
  "behavior_desc.random": "気まぐれに動く（知能 0）",
  "behavior_desc.passive": "あまり活発に動かない",
  "behavior_desc.note_unstable": "※知能が低く判断は不安定",
  "info.protect": "保護モード（戦闘・寿命・天変地異から守る）",

  "info.untracked": "未選択",
  "info.untracked_hint": "マップ上の生命をクリックすると詳細を表示します。",
  "info.deselect": "選択解除",
  "info.untrack_species": "追跡解除",
  "info.tracking_hint": "クリックで追跡",

  // 行動モード
  "mode.random": "ランダム",
  "mode.starving": "飢餓",
  "mode.fleeing": "逃走",
  "mode.breeding": "繁殖期",
  "mode.normal": "通常",

  // 環境名
  "env.balanced": "安定期",
  "env.fertile": "豊穣期",
  "env.tempest": "嵐期",
  "env.predator": "捕食期",
  "env.harsh": "厳寒期",
  "env.drought": "旱魃期",

  // コントロールバー
  "ctrl.play": "▶ 再生",
  "ctrl.pause": "⏸ 一時停止",
  "ctrl.step": "ターン進む",
  "ctrl.action_log": "行動ログ",
  "ctrl.stats_graph": "統計グラフ",
  "ctrl.settings": "環境設定",
  "ctrl.reset": "RESET",
  "ctrl.new_seed": "NEW SEED",
  "ctrl.title": "タイトル",
  "ctrl.export_png": "PNG保存",
  "ctrl.export_png_hint": "マップを画像として保存",
  "ctrl.zoom": "拡大",
  "ctrl.zoom_reset": "等倍に戻す",
  "ctrl.enter_fullscreen": "マップ全画面（F キー）",
  "ctrl.exit_fullscreen": "全画面解除（F または ESC）",
  "ctrl.enter_true_fullscreen": "真の全画面・ブラウザ越え（Shift+F）",
  "ctrl.exit_true_fullscreen": "真の全画面を解除（Shift+F または ESC）",
  "info.inherited_from": "から継承",
  "info.w_appetite": "食欲",
  "info.w_predation": "捕食欲",
  "info.w_caution": "警戒",
  "info.w_gregarious": "社交性",
  "info.w_loyalty": "強者追従",
  "info.w_repro": "繁殖欲",
  "info.w_starv_sensitive": "飢餓敏感",
  "mode.hunter": "捕食者",
  "mode.timid": "臆病",
  "mode.glutton": "食いしん坊",
  "mode.social": "社交家",
  "mode.breeder": "繁殖家",
  "settings.param.inherit_on_death": "自動継承",
  "settings.param.inherit_on_death_hint": "選択中の個体が死んだら、同系統または遺伝子の近い個体を自動的に選択し直します。",
  "settings.param.smooth_animation": "滑らかなアニメーション（T キー）",
  "settings.param.smooth_animation_hint": "OFF にすると補間が切れ、各ターンの状態がパチッと切り替わる「厳密なターン表示」になります。高速個体は数マス飛び、遅い個体は明らかに待機して見えます。",
  "ctrl.share_url": "URLコピー",
  "ctrl.share_url_copied": "コピー済",
  "ctrl.share_url_hint": "この世界を共有する URL をコピー",
  "modal.time_on": "時間進行中",
  "modal.time_off": "時間停止中",
  "modal.time_hint": "クリックで時間進行を切替（初期は停止）",
  "ctrl.lightning": "投入：クリックでエネルギー注入",
  "ctrl.cataclysm_meteor": "隕石を召喚",
  "ctrl.cataclysm_drought": "旱魃を召喚",
  "ctrl.cataclysm_bloom": "大開花を召喚",
  "ctrl.mode_off": "モード解除",

  // 環境設定モーダル
  "settings.title": "環境設定",
  "settings.col.world_rules": "世界のルール",
  "settings.col.gene_toggle": "稼働遺伝子",
  "settings.gene_toggle_hint": "オフにすると全個体で固定値となり進化しない",
  "settings.gene_all_on": "全て有効",
  "settings.gene_all_off": "全て無効",
  "settings.summary_title": "現在の環境",
  "settings.section.display": "表示",
  "settings.toggle.news": "ニュース帯を表示",
  "settings.section.export": "データ書き出し",
  "settings.export_csv": "統計データCSV保存",
  "settings.export_csv_hint": "時系列の統計データを CSV としてダウンロード",
  "settings.param.total_energy": "エネルギー総量",
  "settings.param.mutation_rate": "突然変異率",
  "settings.param.wave_speed": "エネルギー波速度",
  // v1.10: 攻撃優位度の UI スライダーは廃止
  "settings.section.seed": "シード値",
  "settings.seed_input_placeholder": "シード値を入力",
  "settings.seed_hint": "シード値を共有すると同じ世界を再現できます。",

  // 遺伝子チェックラベル
  "gene.rgb": "体色 (RGB)",
  "gene.vision": "視野",
  "gene.speed": "移動速度",
  "gene.size": "体格",
  "gene.strength": "強さ",
  "gene.intelligence": "知能",
  "gene.birth_threshold": "出産閾値",
  "gene.mutation_rate": "突然変異率",
  "gene.lifespan": "寿命",

  // 統計グラフ
  "graph.title": "統計グラフ",
  "graph.empty_hint": "シミュレーションを進めるとデータが蓄積されます。",
  "graph.life_count": "総生物数",
  "graph.species_count": "系統数（多様性）",
  "graph.avg_intelligence": "平均知能",
  "graph.avg_speed": "平均移動速度",
  "graph.avg_strength": "平均強さ",
  "graph.avg_lifespan": "平均寿命",
  "graph.avg_birth_threshold": "平均出産閾値",
  "graph.avg_size": "平均体格",
  "graph.avg_vision": "平均視野",
  "graph.avg_offspring_count": "平均出産数",
  "graph.rgb": "RGB分布",
  "graph.tab.timeseries": "時系列",
  "graph.tab.distribution": "分布",
  "graph.dist.title": "現在の遺伝子分布",
  "graph.dist.gene": "遺伝子",
  "graph.dist.empty": "生命がいません",
  "graph.dist.bins_axis": "値の範囲",
  "graph.dist.count_axis": "個体数",
  "graph.all_on": "全て表示",
  "graph.all_off": "全て非表示",

  // 行動ログ
  "log.title": "行動ログ",
  "log.empty": "まだイベントが発生していません。",
};

const en: Dictionary = {
  "app.title": "LIFE GRID",
  "app.subtitle": "Life Evolution Simulator",
  "app.version": "ver 1.21.1",
  "lang.toggle.ja": "JA",
  "lang.toggle.en": "EN",

  // Start screen
  "start.map_size": "Map Size",
  "start.life_count": "Initial Life Count",
  "start.initial_genes": "Initial Genes",
  "start.seed": "Seed (optional)",
  "start.placeholder.random": "Random",
  "start.placeholder.seed": "Leave blank to auto-generate",
  "start.gene_hint": "Leave blank for random genes. Enter a {n}-digit ID to start with identical genes.",
  "start.gene_error": "Invalid gene ID ({n} digits required, or leave blank).",
  "start.button.rules": "Rules",
  "start.button.start": "Start Simulation",

  // Common
  "common.cancel": "Cancel",
  "common.unlock": "Unlock",
  "common.close": "✕",
  "common.copy": "Copy",
  "common.copied": "Copied",
  "common.load": "Load",
  "common.reset_default": "Reset to default",
  "common.dash": "—",
  "common.locked_hint": "Locked (click to unlock)",
  "common.yes": "Yes",
  "common.no": "No",

  // Title return confirmation
  "confirm.title_return": "Return to title?",
  "confirm.title_return_hint": "The current simulation will be discarded.",

  // Password
  "password.title": "Unlock",
  "password.message": "This feature requires a password.",
  "password.placeholder": "Enter password",
  "password.error": "Incorrect password.",
  "password.cta": "Get it here!",
  "password.feature.map": "{label} map",
  "password.feature.speed": "× {speed} speed",

  // Top status
  "status.seed": "Seed",
  "status.map": "Map",
  "status.tps": "turn/s",
  "status.effective_x": "Effective ×",

  // Panels
  "panel.global_info": "World Info",
  "panel.species_top": "Top Species",
  "panel.selected_life": "Selected Life",
  "panel.tab.basic": "Basic",
  "panel.tab.genes": "Genes",
  "panel.tab.personality": "Personality",
  "panel.genes": "Genes",
  "panel.gene_params": "Gene Parameters",
  "panel.current_params": "Current State",

  "info.turn": "Turn",
  "info.era": "Era",
  "info.environment": "Environment",
  "info.life_count_total": "Total Lives",
  "info.species_count": "Species",
  "info.avg_energy": "Avg Energy",
  "info.avg_intelligence": "Avg Intelligence",
  "info.max_intelligence": "Max Intelligence",
  "info.avg_speed": "Avg Speed",

  "info.species": "Species",
  "info.rgb": "RGB",
  "info.vision": "Vision",
  "info.move_speed": "Move Speed",
  "info.size": "Size",
  "info.strength": "Strength",
  "info.intelligence": "Intelligence",
  "info.birth_threshold": "Birth Threshold",
  "info.mutation_rate": "Mutation",
  "info.lifespan": "Lifespan",
  "info.offspring_count": "Offspring",

  "info.id": "ID",
  "info.position": "Position",
  "info.energy_owned": "Energy",
  "info.age": "Age",
  "info.behavior_mode": "Mode",
  "info.behavior_traits": "Behavior",
  "behavior_desc.chase_prey": "Chases prey when spotted",
  "behavior_desc.flee_threat": "Flees from strong enemies",
  "behavior_desc.follow_strong": "Follows strong allies",
  "behavior_desc.gather": "Gathers with allies",
  "behavior_desc.forage": "Forages for food",
  "behavior_desc.seek_breeding": "Seeks breeding spots",
  "behavior_desc.random": "Moves randomly (intel 0)",
  "behavior_desc.passive": "Not very active",
  "behavior_desc.note_unstable": "* Low intel: unstable decisions",
  "info.protect": "Protect (immune to combat / aging / cataclysm)",

  "info.untracked": "None selected",
  "info.untracked_hint": "Click a life on the map to see its details.",
  "info.deselect": "Deselect",
  "info.untrack_species": "Untrack",
  "info.tracking_hint": "Click to track",

  // Behavior modes
  "mode.random": "Random",
  "mode.starving": "Starving",
  "mode.fleeing": "Fleeing",
  "mode.breeding": "Breeding",
  "mode.normal": "Normal",

  // Era environments
  "env.balanced": "Balanced",
  "env.fertile": "Fertile",
  "env.tempest": "Tempest",
  "env.predator": "Predator",
  "env.harsh": "Harsh",
  "env.drought": "Drought",

  // Controls
  "ctrl.play": "▶ Play",
  "ctrl.pause": "⏸ Pause",
  "ctrl.step": "Step",
  "ctrl.action_log": "Action Log",
  "ctrl.stats_graph": "Stats Graph",
  "ctrl.settings": "Settings",
  "ctrl.reset": "RESET",
  "ctrl.new_seed": "NEW SEED",
  "ctrl.title": "Title",
  "ctrl.export_png": "Save PNG",
  "ctrl.export_png_hint": "Save map as image",
  "ctrl.zoom": "Zoom",
  "ctrl.zoom_reset": "Reset to 100%",
  "ctrl.enter_fullscreen": "Fullscreen map (F)",
  "ctrl.exit_fullscreen": "Exit fullscreen (F or ESC)",
  "ctrl.enter_true_fullscreen": "True fullscreen — beyond browser (Shift+F)",
  "ctrl.exit_true_fullscreen": "Exit true fullscreen (Shift+F or ESC)",
  "info.inherited_from": "inherited",
  "info.w_appetite": "Appetite",
  "info.w_predation": "Predation",
  "info.w_caution": "Caution",
  "info.w_gregarious": "Sociability",
  "info.w_loyalty": "Strength-attraction",
  "info.w_repro": "Repro drive",
  "info.w_starv_sensitive": "Starvation-sensitivity",
  "mode.hunter": "Hunter",
  "mode.timid": "Timid",
  "mode.glutton": "Glutton",
  "mode.social": "Social",
  "mode.breeder": "Breeder",
  "settings.param.inherit_on_death": "Auto-inherit selection",
  "settings.param.inherit_on_death_hint": "When the selected life dies, automatically pick a related (same species or genetically close) individual to keep observing.",
  "settings.param.smooth_animation": "Smooth animation (T key)",
  "settings.param.smooth_animation_hint": "Turn off to see strict turn-by-turn rendering. Fast individuals jump several cells per turn, slow ones clearly wait in place.",
  "ctrl.share_url": "Copy URL",
  "ctrl.share_url_copied": "Copied",
  "ctrl.share_url_hint": "Copy a URL that shares this world",
  "modal.time_on": "Time running",
  "modal.time_off": "Time paused",
  "modal.time_hint": "Click to toggle time progress (default: paused)",
  "ctrl.lightning": "Inject: click to add energy",
  "ctrl.cataclysm_meteor": "Summon meteor",
  "ctrl.cataclysm_drought": "Summon drought",
  "ctrl.cataclysm_bloom": "Summon bloom",
  "ctrl.mode_off": "Clear mode",

  // Settings modal
  "settings.title": "Settings",
  "settings.col.world_rules": "World Rules",
  "settings.col.gene_toggle": "Active Genes",
  "settings.gene_toggle_hint": "Disabled genes are fixed for all individuals (no evolution).",
  "settings.gene_all_on": "All On",
  "settings.gene_all_off": "All Off",
  "settings.summary_title": "Current Environment",
  "settings.section.display": "Display",
  "settings.toggle.news": "Show news bar",
  "settings.section.export": "Data Export",
  "settings.export_csv": "Save stats CSV",
  "settings.export_csv_hint": "Download time-series stats as CSV",
  "settings.param.total_energy": "Total Energy",
  "settings.param.mutation_rate": "Mutation Rate",
  "settings.param.wave_speed": "Wave Speed",
  // v1.10: Combat Advantage slider removed; constant + era.combatScale drives it now
  "settings.section.seed": "Seed",
  "settings.seed_input_placeholder": "Enter a seed",
  "settings.seed_hint": "Sharing a seed reproduces the same world.",

  // Gene labels
  "gene.rgb": "Color (RGB)",
  "gene.vision": "Vision",
  "gene.speed": "Speed",
  "gene.size": "Size",
  "gene.strength": "Strength",
  "gene.intelligence": "Intelligence",
  "gene.birth_threshold": "Birth Threshold",
  "gene.mutation_rate": "Mutation Rate",
  "gene.lifespan": "Lifespan",

  // Stats graph
  "graph.title": "Stats Graph",
  "graph.empty_hint": "Data will accumulate as the simulation progresses.",
  "graph.life_count": "Total Lives",
  "graph.species_count": "Species (diversity)",
  "graph.avg_intelligence": "Avg Intelligence",
  "graph.avg_speed": "Avg Speed",
  "graph.avg_strength": "Avg Strength",
  "graph.avg_lifespan": "Avg Lifespan",
  "graph.avg_birth_threshold": "Avg Birth Threshold",
  "graph.avg_size": "Avg Size",
  "graph.avg_vision": "Avg Vision",
  "graph.avg_offspring_count": "Avg Offspring",
  "graph.rgb": "RGB Distribution",
  "graph.tab.timeseries": "Time series",
  "graph.tab.distribution": "Distribution",
  "graph.dist.title": "Current gene distribution",
  "graph.dist.gene": "Gene",
  "graph.dist.empty": "No lives",
  "graph.dist.bins_axis": "Value range",
  "graph.dist.count_axis": "Count",
  "graph.all_on": "Show All",
  "graph.all_off": "Hide All",

  // Action log
  "log.title": "Action Log",
  "log.empty": "No events yet.",
};

const dictionaries: Record<Locale, Dictionary> = { ja, en };

/**
 * 指定キーの翻訳を返す。未翻訳の場合は ja のフォールバック → キー名の順。
 * vars が指定された場合、{name} 形式のプレースホルダーを置換する。
 */
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>
): string {
  const dict = dictionaries[locale];
  let template: string;
  if (dict && key in dict) {
    template = dict[key];
  } else if (key in ja) {
    template = ja[key];
  } else {
    template = key;
  }
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    if (name in vars) return String(vars[name]);
    return `{${name}}`;
  });
}

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as string[]).includes(value);
}
