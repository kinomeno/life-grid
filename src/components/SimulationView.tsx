"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import SimulationCanvas from "./SimulationCanvas";
import StatsGraphModal, {
  DEFAULT_GRAPH_SERIES,
  type GraphSeriesState,
  type StatsTab,
  type GeneKey as StatsGeneKey,
} from "./StatsGraphModal";
import ActionLogModal from "./ActionLogModal";
import RulesScreen from "./RulesScreen";
import { computeStats, type WorldStats } from "@/lib/stats";
import { randomSeed } from "@/lib/random";
import {
  serializeWorld,
  deserializeWorld,
  encodeParamsPreset,
} from "@/lib/serialize";
import {
  createWorld,
  currentEra,
  defaultDisabledGenes,
  defaultSimulationParams,
  findHeir,
  describeBehavior,
  describeBehaviorPhrase,
  behaviorAccuracyNote,
  stepWorld,
} from "@/lib/world";
import type { DisabledGeneFlags, WorldEvent } from "@/lib/types";
import { speciesLabel, binCenterColor } from "@/lib/species";
import { encodeGeneId, truncateGeneId } from "@/lib/geneId";
import { DEFAULT_ADVANCED } from "@/lib/constants";
import { isUnlocked } from "@/lib/unlock";
import ShareXButton from "./ShareXButton";
import PasswordPrompt from "./PasswordPrompt";
import KinomenoLink from "./KinomenoLink";
import { useLocale } from "./LocaleProvider";
import type { Genes, Life, SimulationParams, World } from "@/lib/types";

type Props = {
  width: number;
  height: number;
  initialLifeCount: number;
  initialSeed: number;
  initialGenes?: Genes;
  /** v1.31: 共有URLの設定プリセット（環境設定の一部）。あれば初期 params に上書き。 */
  initialParams?: Partial<SimulationParams>;
  /** v1.31: 保存データから読み込んだ World。あれば createWorld の代わりにこれで開始。 */
  initialWorld?: World;
  onBackToTitle?: () => void;
};

type Speed = 0 | 1 | 10 | 100;

type SpeciesEntry = {
  id: string;
  label: string;
  count: number;
  r: number;
  g: number;
  b: number;
  /** v1.30 (N1): 代表個体の行動・能力アーキタイプ（trait.* キー列）。 */
  archetype: string[];
};

/** v1.31: ヘッダーのセーブ/ロードメニューから呼ぶ命令型ハンドル。 */
export type SimulationViewHandle = {
  saveStorage: () => void;
  loadStorage: () => void;
  exportFile: () => void;
  importFile: () => void;
};

const SimulationView = forwardRef<SimulationViewHandle, Props>(
  function SimulationView(
    {
      width,
      height,
      initialLifeCount,
      initialSeed,
      initialGenes,
      initialParams,
      initialWorld,
      onBackToTitle,
    }: Props,
    ref
  ) {
  const { t, locale } = useLocale();
  // 画面サイズを追跡し、マップが overflow（スクロールバー）しないよう自動拡縮する
  const [screenWidth, setScreenWidth] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  const [screenHeight, setScreenHeight] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerHeight : 800
  );
  useEffect(() => {
    const onResize = () => {
      setScreenWidth(window.innerWidth);
      setScreenHeight(window.innerHeight);
    };
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const cellSize = useMemo(() => {
    // v1.20: 開始時のマップ自動拡縮。
    // 画面の「幅」と「高さ」の両方でフィットさせ、ブラウザにスクロールバーが
    // 出ないサイズを選ぶ。従来は幅しか見ておらず、縦長マップで縦スクロールが
    // 出ていた。
    //   - 幅: 左右パネル(240px×2) + 余白を差し引いた残り
    //     （モバイル縦画面ではパネルを畳むので画面幅の大半が使える）
    //   - 高さ: ヘッダー・操作バー・上下余白を差し引いた残り
    const sidePanels = screenWidth >= 900 ? 240 * 2 + 60 : 40;
    const availW = Math.max(160, screenWidth - sidePanels);
    // v1.31: 縦の確保量を実測に合わせて拡大（180→270）。
    // ヘッダー(50)+ステータス(28)+ニュース/余白+map-bar(26)+下部操作バー(51)+本文padding
    // = 約260px。180 では cellSize 上限12（マップ600px）に張り付く高さ帯（〜860px）で
    // 数十px溢れて縦スクロールバーが出ていた。
    const availH = Math.max(160, screenHeight - 270);
    const fitW = availW / Math.max(width, height);
    const fitH = availH / Math.max(width, height);
    // v1.31: floor を外して分数セルサイズを許可。
    // 大マップ（例 200）で floor(2.95)=2 となり利用可能領域の約1/3を捨てて
    // メインフレームが小さくなっていた問題を解消し、領域いっぱいに広げる。
    // エネルギー場は nearest-neighbor 拡大（imageSmoothingEnabled=false）なので
    // 分数倍率でも見た目はほぼ問題ない。
    const fit = Math.min(fitW, fitH);
    // 上限は 12（大画面で小マップが巨大化しすぎないように）。下限 2。
    return Math.max(2, Math.min(12, fit));
  }, [width, height, screenWidth, screenHeight]);

  const [seed, setSeed] = useState<number | null>(null);
  const worldRef = useRef<World | null>(null);
  // レンダーで参照するための同期 state（worldRef と同じオブジェクトを保持）
  const [world, setWorldState] = useState<World | null>(null);

  const [version, setVersion] = useState(0);
  const [stats, setStats] = useState<WorldStats>({
    turn: 0,
    lifeCount: 0,
    speciesCount: 0,
    averageEnergy: 0,
    averageIntelligence: 0,
    maxIntelligence: 0,
    averageSpeed: 0,
    averageShare: 0,
  });
  const [topSpecies, setTopSpecies] = useState<SpeciesEntry[]>([]);
  const [speed, setSpeedState] = useState<Speed>(0);
  const speedRef = useRef<Speed>(0);
  const [currentTps, setCurrentTps] = useState(0);
  const [params, setParams] = useState<SimulationParams>(() => {
    const p = defaultSimulationParams();
    // v1.20: マップサイズ依存の初期エネルギー量。
    // 小世界は局所的な変動で共倒れ・絶滅しやすいため、エネルギーを潤沢にして安定化。
    // 大世界はエネルギーを希少なまま保ち、知能の進化圧（賢くないと生き残れない）を維持。
    //   ・50×50 以下: 1.5（小世界の絶滅抑制を優先）
    //   ・75 以下:    1.35（中間）
    //   ・100 以上:   1.2（知能進化を促す標準値）
    if (width <= 50) p.totalEnergy = 1.5;
    else if (width <= 75) p.totalEnergy = 1.35;
    // v1.31: 共有URLの設定プリセットがあれば上書き（研究者の設定を t0 から再現）。
    if (initialParams) Object.assign(p, initialParams);
    return p;
  });
  // RAF ループ内で常に最新の params を参照するための ref
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showRules, setShowRules] = useState(false);
  // v1.31 (H9): 思考ヒートマップ表示トグル（選択個体の行動評価を可視化）
  const [showThoughtHeatmap, setShowThoughtHeatmap] = useState(false);
  // 統計／ログ画面の「時間進行 ON/OFF」トグル（初期 OFF＝停止）
  const [statsKeepRunning, setStatsKeepRunning] = useState(false);
  const [logKeepRunning, setLogKeepRunning] = useState(false);
  const [seedCopied, setSeedCopied] = useState(false);
  const [seedInput, setSeedInput] = useState("");
  // v1.31 (C1): セーブ/ロード（ファイル入力参照 + 一時メッセージ）
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [selectedLifeId, setSelectedLifeId] = useState<number | null>(null);
  // v1.20: 矢印キー処理で最新の selectedLifeId を参照するための ref
  const selectedLifeIdRef = useRef<number | null>(null);
  useEffect(() => {
    selectedLifeIdRef.current = selectedLifeId;
  }, [selectedLifeId]);
  const [trackedSpeciesId, setTrackedSpeciesId] = useState<string | null>(null);

  // G1/G2: マップクリック時の特殊モード
  type InteractionMode = "none" | "lightning" | "meteor" | "drought" | "bloom";
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("none");

  // パネル折りたたみ状態。タイトル click で開閉。
  // モバイル縦画面では既定で折りたたむ（観察モード）。
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    // v1.30 (N3): 「注目選択」は既定で折りたたむ。
    if (typeof window === "undefined") return new Set(["focus"]);
    const isMobilePortrait =
      window.innerWidth <= 520 && window.innerHeight > window.innerWidth;
    return isMobilePortrait
      ? new Set(["global", "species", "life", "focus"])
      : new Set(["focus"]);
  });
  const toggleSection = useCallback((name: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);
  const isCollapsed = useCallback(
    (name: string) => collapsedSections.has(name),
    [collapsedSections]
  );
  const [graphSeries, setGraphSeries] = useState<GraphSeriesState>(
    DEFAULT_GRAPH_SERIES
  );
  // v1.10: モーダルを閉じても保持。タブと分布の遺伝子選択を再オープン時も覚えておく。
  const [statsTab, setStatsTab] = useState<StatsTab>("timeseries");
  const [statsGeneKey, setStatsGeneKey] =
    useState<StatsGeneKey>("intelligence");
  // v1.20: モーダルの位置をセッション内で記録（× で閉じて再オープン時も同じ位置）
  const [statsModalOffset, setStatsModalOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [logModalOffset, setLogModalOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rulesModalOffset, setRulesModalOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  // v1.20: 個体詳細パネルのタブ状態
  type LifePanelTab = "basic" | "genes" | "personality";
  const [lifePanelTab, setLifePanelTab] = useState<LifePanelTab>("basic");
  // ロック解除状態（x100 速度に必要）
  const [unlocked, setUnlocked] = useState(false);
  const [pwTarget, setPwTarget] = useState<{
    label: string;
    onUnlock: () => void;
  } | null>(null);

  useEffect(() => {
    setUnlocked(isUnlocked());
  }, []);

  const refreshDerived = useCallback((w: World) => {
    setStats(computeStats(w));
    setTopSpecies(computeTopSpecies(w));
  }, []);

  useEffect(() => {
    if (worldRef.current !== null) return;
    // v1.31: 保存データから読み込んだ World があればそれで開始（タイトルから再開）。
    const w =
      initialWorld ??
      createWorld({
        width,
        height,
        initialLifeCount,
        seed: initialSeed,
        params,
        initialGenes,
      });
    worldRef.current = w;
    setWorldState(w);
    setSeed(w.seed);
    if (initialWorld) setParams(w.params);
    refreshDerived(w);
    setVersion((v) => v + 1);
    // v1.20: 初回起動時にもランダムで生命を 1 体選択
    const alive = w.lives.filter((l) => l.alive);
    if (alive.length > 0) {
      const idx = Math.floor(Math.random() * alive.length);
      setSelectedLifeId(alive[idx].id);
    }
    // v1.31: 共有URL（seed/w/n/p）は下の useEffect で同期する。
    // params/initialGenes は初回のみ読み取り（リセット時のみ反映）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, initialLifeCount, initialSeed, refreshDerived]);

  // v1.31: 共有URLを seed/w/n＋設定プリセット(p) で同期（履歴を汚さず replaceState）。
  // 設定を変更した後に共有しても、その設定が URL（=共有内容）に反映される。
  useEffect(() => {
    if (typeof window === "undefined" || seed === null) return;
    const sp = new URLSearchParams();
    sp.set("seed", String(seed));
    sp.set("w", String(width));
    sp.set("n", String(initialLifeCount));
    sp.set("p", encodeParamsPreset(params));
    window.history.replaceState(null, "", `?${sp.toString()}`);
  }, [seed, params, width, initialLifeCount]);

  useEffect(() => {
    const w = worldRef.current;
    if (w) w.params = params;
  }, [params]);

  const setSpeed = useCallback((s: Speed) => {
    speedRef.current = s;
    setSpeedState(s);
  }, []);

  // v1.31: 「セーブ」＝ブラウザ内（localStorage）に保存。
  const saveStorage = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    try {
      localStorage.setItem("lifegrid_save", serializeWorld(w));
      setSaveMsg(t("save.saved_storage"));
    } catch {
      setSaveMsg(t("save.error"));
    }
    window.setTimeout(() => setSaveMsg(null), 2500);
  }, [t]);

  // v1.31: 「書き出し」＝ファイルへダウンロード。
  const exportFile = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    try {
      const json = serializeWorld(w);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `life-grid_seed${w.seed}_t${w.turn}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSaveMsg(t("save.exported"));
    } catch {
      setSaveMsg(t("save.error"));
    }
    window.setTimeout(() => setSaveMsg(null), 2500);
  }, [t]);

  // v1.31 (C1): 復元した World を現在のシミュレーションに反映する。
  const applyLoadedWorld = useCallback(
    (w: World) => {
      setSpeed(0); // ロード直後は一時停止
      worldRef.current = w;
      setWorldState(w);
      setParams(w.params);
      setSeed(w.seed);
      refreshDerived(w);
      setSelectedLifeId(null);
      setTrackedSpeciesId(null);
      setVersion((v) => v + 1);
      setSaveMsg(t("save.loaded"));
      window.setTimeout(() => setSaveMsg(null), 2500);
    },
    [refreshDerived, setSpeed, t]
  );

  // v1.31 (C1): 選択されたファイルを読み込んで復元する。
  const handleLoadFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const w = deserializeWorld(String(reader.result));
          applyLoadedWorld(w);
        } catch (err) {
          setSaveMsg(err instanceof Error ? err.message : t("save.load_error"));
          window.setTimeout(() => setSaveMsg(null), 4000);
        }
      };
      reader.onerror = () => {
        setSaveMsg(t("save.load_error"));
        window.setTimeout(() => setSaveMsg(null), 4000);
      };
      reader.readAsText(file);
    },
    [applyLoadedWorld, t]
  );

  // v1.31: 「ロード」＝ブラウザ内（localStorage）から読み出し。無ければ案内。
  const loadStorage = useCallback(() => {
    let json: string | null = null;
    try {
      json = localStorage.getItem("lifegrid_save");
    } catch {
      json = null;
    }
    if (!json) {
      setSaveMsg(t("save.none"));
      window.setTimeout(() => setSaveMsg(null), 2500);
      return;
    }
    try {
      applyLoadedWorld(deserializeWorld(json));
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : t("save.load_error"));
      window.setTimeout(() => setSaveMsg(null), 4000);
    }
  }, [applyLoadedWorld, t]);

  // v1.31: 「読み込み」＝ファイル選択ダイアログを開く。
  const importFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // v1.31: セーブ/ロードはヘッダー（AppHeader）のメニューから呼ばれる。
  useImperativeHandle(
    ref,
    () => ({ saveStorage, loadStorage, exportFile, importFile }),
    [saveStorage, loadStorage, exportFile, importFile]
  );

  // v1.30 (H10): タブが非アクティブになったら自動で一時停止（無駄計算・電池配慮）。復帰は手動。
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && speedRef.current !== 0) setSpeed(0);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [setSpeed]);

  // モーダル表示中は基本的にシミュレーション停止。
  // 統計／ログ画面は「時間進行ON」が選ばれていれば停止しない。
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current =
      (showLog && !logKeepRunning) ||
      (showStats && !statsKeepRunning) ||
      showSettings ||
      showRules;
  }, [
    showLog,
    logKeepRunning,
    showStats,
    statsKeepRunning,
    showSettings,
    showRules,
  ]);

  // モーダルを閉じるたびに時間進行トグルを OFF に戻す（次回開いた時の既定）
  useEffect(() => {
    if (!showStats) setStatsKeepRunning(false);
  }, [showStats]);
  useEffect(() => {
    if (!showLog) setLogKeepRunning(false);
  }, [showLog]);

  // v1.21 バグ修正: RAF 由来の React 更新が未コミットかどうかを示すフラグ。
  // x100＋大マップでは 1 フレームの描画が重く、RAF がコミット速度を追い越して
  // setState を積み上げ "Maximum update depth exceeded" を起こしていた。
  // 直前の更新がコミットされるまで次の setState を出さないことで追い越しを防ぐ。
  const renderPendingRef = useRef(false);
  // version が変化＝React が RAF 由来更新をコミットした、とみなしてフラグ解除。
  useEffect(() => {
    renderPendingRef.current = false;
  }, [version]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let stepsSinceTpsUpdate = 0;
    let tpsWindowStart = performance.now();
    let lastRenderTime = 0;
    const FRAME_BUDGET_MS = 25;
    // 描画フレームレート: 20 FPS（負荷削減のため。シミュレーション速度には影響しない）
    const RENDER_INTERVAL_MS = 1000 / 20;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const s = speedRef.current;
      const world = worldRef.current;
      let didStep = false;
      const targetTps = s === 1 ? 4 : s === 10 ? 30 : s === 100 ? 150 : 0;
      if (s > 0 && world && !pausedRef.current) {
        acc += (dt / 1000) * targetTps;
        let requestedSteps = Math.floor(acc);
        acc -= requestedSteps;
        // v1.02: x1 速度ではターン表示が 1,2,3,... と等間隔（250ms ごと）に
        // 進むよう、1 フレーム = 最大 1 ステップに制限し、フレーム落ち時の
        // 「キャッチアップ」（繰越による複数ターン連続実行）も完全に防ぐ。
        //   - ステップが入った場合は acc を 0 にリセットして次の 250ms を待つ
        //   - これにより実 TPS は targetTps を超えないが、観察体験は安定
        if (s === 1) {
          if (requestedSteps > 0) {
            requestedSteps = 1;
            acc = 0;
          }
        }
        if (requestedSteps > 0) {
          const frameStart = performance.now();
          let actualSteps = 0;
          for (let i = 0; i < requestedSteps; i++) {
            stepWorld(world);
            actualSteps++;
            if (world.lives.length === 0) break;
            if (performance.now() - frameStart > FRAME_BUDGET_MS) {
              acc = 0;
              break;
            }
          }
          stepsSinceTpsUpdate += actualSteps;
          didStep = actualSteps > 0;
          if (didStep) {
            lastStepAtRef.current = now;
            stepDurationMsRef.current = Math.max(20, 1000 / targetTps);
          }
        }
      } else {
        acc = 0;
      }
      // 描画ループ：速度 > 0 のときは毎フレーム描画して補間を動かす。
      // ×1（250ms/ターン）で 1 ターンあたり 5 描画フレーム入る計算。
      const shouldRender = s > 0 && !pausedRef.current;
      if (
        (didStep || shouldRender) &&
        world &&
        // v1.21 バグ修正: 直前の RAF 由来更新が未コミットなら新たな setState を
        // 発行しない。RAF が React のコミットを追い越して更新を積み上げるのを防ぎ、
        // x100＋大マップでの "Maximum update depth exceeded" を解消する。
        !renderPendingRef.current &&
        now - lastRenderTime >= RENDER_INTERVAL_MS
      ) {
        renderPendingRef.current = true;
        // 補間フェーズ：直近ステップからの経過時間 / ステップ間隔。
        // v1.02: smoothAnimation=false なら補間を行わず常に 1（ステップ完了状態）に固定。
        // v1.21 軽量化 A1: 大マップ高速時は補間を強制オフ（描画負荷を下げる）。
        //   200マップ: x10/x100、100マップ: x100 で補間オフ。
        const sp = speedRef.current;
        const simplified =
          (width >= 200 && sp >= 10) || (width >= 100 && sp >= 100);
        setSimplifiedRender(simplified);
        const sinceStep = now - lastStepAtRef.current;
        const phase =
          paramsRef.current.smoothAnimation && !simplified
            ? Math.min(1, sinceStep / stepDurationMsRef.current)
            : 1;
        setAnimPhase(phase);
        setVersion((v) => v + 1);
        if (didStep) refreshDerived(world);
        lastRenderTime = now;
      }
      const elapsed = now - tpsWindowStart;
      if (elapsed >= 250) {
        const measuredTps = stepsSinceTpsUpdate / (elapsed / 1000);
        setCurrentTps(measuredTps);
        stepsSinceTpsUpdate = 0;
        tpsWindowStart = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [refreshDerived]);

  const reset = useCallback(
    (newSeed: number) => {
      const w = createWorld({
        width,
        height,
        initialLifeCount,
        seed: newSeed,
        params,
      });
      worldRef.current = w;
      setWorldState(w);
      setSeed(newSeed);
      setVersion((v) => v + 1);
      // v1.20: 開始時に生命をランダムで自動選択（観察体験の即開始）
      const alive = w.lives.filter((l) => l.alive);
      if (alive.length > 0) {
        const idx = Math.floor(Math.random() * alive.length);
        setSelectedLifeId(alive[idx].id);
      } else {
        setSelectedLifeId(null);
      }
      setTrackedSpeciesId(null);
      refreshDerived(w);
    },
    [width, height, initialLifeCount, refreshDerived, params]
  );

  // A5: 統計データを CSV としてダウンロード
  const exportCsv = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    const headers = [
      "turn",
      "lifeCount",
      "speciesCount",
      "averageIntelligence",
      "averageSpeed",
      "averageStrength",
      "averageLifespan",
      "averageBirthThreshold",
      "averageSize",
      "avgR",
      "avgG",
      "avgB",
    ];
    const lines = [headers.join(",")];
    for (const s of w.history) {
      lines.push(
        [
          s.turn,
          s.lifeCount,
          s.speciesCount,
          s.averageIntelligence.toFixed(3),
          s.averageSpeed.toFixed(3),
          s.averageStrength.toFixed(3),
          s.averageLifespan.toFixed(3),
          s.averageBirthThreshold.toFixed(3),
          s.averageSize.toFixed(3),
          s.avgR.toFixed(1),
          s.avgG.toFixed(1),
          s.avgB.toFixed(1),
        ].join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp =
      seed !== null ? `lifegrid_seed${seed}_stats.csv` : "lifegrid_stats.csv";
    link.href = url;
    link.download = stamp;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [seed]);

  // 現在表示中のマップ canvas を PNG として保存（ブランディング付き）
  const exportPng = useCallback(() => {
    const canvas = document.querySelector(
      ".canvas-wrap canvas"
    ) as HTMLCanvasElement | null;
    if (!canvas) return;
    try {
      // 拡張キャンバスを作成（上ヘッダ＋下フッタ付き）
      const dpr = window.devicePixelRatio || 1;
      const mapW = canvas.width / dpr;
      const mapH = canvas.height / dpr;
      const padX = 16;
      const headerH = 28;
      const footerH = 40;
      const totalW = Math.max(mapW + padX * 2, 360);
      const totalH = mapH + headerH + footerH;

      const out = document.createElement("canvas");
      out.width = totalW * dpr;
      out.height = totalH * dpr;
      const octx = out.getContext("2d");
      if (!octx) return;
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 背景
      octx.fillStyle = "#fafafa";
      octx.fillRect(0, 0, totalW, totalH);

      // ヘッダ：タイトル
      octx.fillStyle = "#1a1a1a";
      octx.font = "600 13px sans-serif";
      octx.textBaseline = "middle";
      octx.textAlign = "left";
      octx.fillText("LIFE GRID", padX, headerH / 2);
      octx.font = "10px sans-serif";
      octx.fillStyle = "#666";
      octx.textAlign = "right";
      octx.fillText("生命進化シミュレーター", totalW - padX, headerH / 2);

      // マップ画像
      octx.drawImage(canvas, padX, headerH, mapW, mapH);
      // マップの周囲枠
      octx.strokeStyle = "#cccccc";
      octx.lineWidth = 1;
      octx.strokeRect(padX - 0.5, headerH - 0.5, mapW + 1, mapH + 1);

      // フッタ：シード・ターン・サイズ・著者
      octx.fillStyle = "#444";
      octx.font = "10px sans-serif";
      octx.textBaseline = "top";
      octx.textAlign = "left";
      const stampY = headerH + mapH + 8;
      octx.fillText(
        `Seed ${seed ?? "-"}  /  Turn ${stats.turn.toLocaleString()}  /  ${width}×${height}`,
        padX,
        stampY
      );
      octx.textAlign = "right";
      octx.fillStyle = "#888";
      octx.fillText("by キノメノ", totalW - padX, stampY);
      octx.fillStyle = "#aaa";
      octx.fillText("https://note.com/kinomeno", totalW - padX, stampY + 14);

      const url = out.toDataURL("image/png");
      const link = document.createElement("a");
      const stamp =
        seed !== null
          ? `lifegrid_seed${seed}_t${stats.turn}.png`
          : "lifegrid.png";
      link.href = url;
      link.download = stamp;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      // origin-tainted canvas で失敗する可能性。ローカル描画では通常成功する。
    }
  }, [seed, stats.turn, width, height]);

  const stepOnce = useCallback(() => {
    setSpeed(0);
    const world = worldRef.current;
    if (world) {
      stepWorld(world);
      setVersion((v) => v + 1);
      refreshDerived(world);
    }
  }, [setSpeed, refreshDerived]);

  // v1.30 (N3): 指定軸の最上位（最強/最賢/最速/最大/最古）の生存個体を選択する。
  const selectTopLife = useCallback(
    (stat: "strength" | "intelligence" | "speed" | "size" | "age") => {
      const w = worldRef.current;
      if (!w) return;
      let bestId = -1;
      let bestVal = -Infinity;
      for (const l of w.lives) {
        if (!l.alive) continue;
        const v =
          stat === "age"
            ? l.age
            : stat === "strength"
              ? l.genes.strength
              : stat === "intelligence"
                ? l.genes.intelligence
                : stat === "speed"
                  ? l.genes.speed
                  : l.genes.size;
        if (v > bestVal) {
          bestVal = v;
          bestId = l.id;
        }
      }
      if (bestId >= 0) setSelectedLifeId(bestId);
    },
    [setSelectedLifeId]
  );

  const handleCellClick = useCallback(
    (x: number, y: number) => {
      const world = worldRef.current;
      if (!world) return;

      // G1 投入モード：エネルギー局所注入（半径 3 セル）
      if (interactionMode === "lightning") {
        const radius = 3;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > radius) continue;
            const nx = (x + dx + world.width) % world.width;
            const ny = (y + dy + world.height) % world.height;
            const idx = ny * world.width + nx;
            const falloff = 1 - dist / radius;
            world.energy[idx] = Math.min(
              100,
              world.energy[idx] + 60 * falloff
            );
          }
        }
        setVersion((v) => v + 1);
        return;
      }

      // G2 天変地異召喚
      if (
        interactionMode === "meteor" ||
        interactionMode === "drought" ||
        interactionMode === "bloom"
      ) {
        const type = interactionMode;
        const radius = Math.max(
          3,
          Math.floor(Math.min(world.width, world.height) * 0.18)
        );
        const duration = type === "meteor" ? 8 : type === "drought" ? 80 : 60;
        world.activeCataclysm = {
          type,
          centerX: x,
          centerY: y,
          radius,
          startTurn: world.turn,
          durationTurns: duration,
        };
        // 次回の自動発生を遅らせる
        world.nextCataclysmTurn = world.turn + 1500;
        setVersion((v) => v + 1);
        return;
      }

      // 通常モード：個体選択
      // v1.02: 移動補間中は描画位置と論理位置がズレるため、半径 1 セルまで許容して
      // クリック位置に最も近い生命を選択する。範囲内に生命がいなければ選択解除。
      let bestId = -1;
      let bestDist = Infinity;
      const r = 1;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = (x + dx + world.width) % world.width;
          const ny = (y + dy + world.height) % world.height;
          const idx = ny * world.width + nx;
          const id = world.occupancy[idx];
          if (id === -1) continue;
          // 補間後の描画位置（prevX/Y → x/y）に動いている個体を優先
          const life = world.livesById.get(id);
          if (!life || !life.alive) continue;
          // クリック点（x+0.5, y+0.5）と描画想定中心（life.x+0.5, life.y+0.5）の距離
          let sdx = (life.x + 0.5) - (x + 0.5);
          let sdy = (life.y + 0.5) - (y + 0.5);
          // トーラス境界跨ぎ補正
          if (sdx > world.width / 2) sdx -= world.width;
          if (sdx < -world.width / 2) sdx += world.width;
          if (sdy > world.height / 2) sdy -= world.height;
          if (sdy < -world.height / 2) sdy += world.height;
          const d = sdx * sdx + sdy * sdy;
          if (d < bestDist) {
            bestDist = d;
            bestId = id;
          }
        }
      }
      if (bestId === -1) {
        setSelectedLifeId(null);
        return;
      }
      setSelectedLifeId(bestId);
    },
    [interactionMode]
  );

  // V2: マウスホバーで個体ポップアップを更新
  // v1.02: クリック判定と同じく半径 1 セルまで許容（補間中の描画ズレ対策）
  const handleCellHover = useCallback(
    (x: number, y: number | null, px: number, py: number) => {
      if (y === null) {
        setHoverInfo(null);
        return;
      }
      const world = worldRef.current;
      if (!world) return;
      let bestLife: typeof world.lives[number] | null = null;
      let bestDist = Infinity;
      const r = 1;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = (x + dx + world.width) % world.width;
          const ny = (y + dy + world.height) % world.height;
          const idx = ny * world.width + nx;
          const id = world.occupancy[idx];
          if (id === -1) continue;
          const life = world.livesById.get(id);
          if (!life || !life.alive) continue;
          let sdx = (life.x + 0.5) - (x + 0.5);
          let sdy = (life.y + 0.5) - (y + 0.5);
          if (sdx > world.width / 2) sdx -= world.width;
          if (sdx < -world.width / 2) sdx += world.width;
          if (sdy > world.height / 2) sdy -= world.height;
          if (sdy < -world.height / 2) sdy += world.height;
          const d = sdx * sdx + sdy * sdy;
          if (d < bestDist) {
            bestDist = d;
            bestLife = life;
          }
        }
      }
      if (!bestLife) {
        setHoverInfo(null);
        return;
      }
      setHoverInfo({ life: bestLife, px, py });
    },
    []
  );

  const handleSpeciesClick = useCallback((id: string) => {
    setTrackedSpeciesId((prev) => (prev === id ? null : id));
  }, []);

  // `world` は state（同じオブジェクトのまま中身が変わる）。
  // 表示の更新は version state の変化でトリガーされる。
  const era = world ? currentEra(world) : null;
  const selectedLife: Life | null = world
    ? world.lives.find((l) => l.id === selectedLifeId && l.alive) || null
    : null;

  // ニュース：直近の最新イベント 1 件をフェードインで表示。
  // 新しいイベントが届くたびに id が変わって CSS アニメが再起動する。
  const lastEventCountRef = useRef(0);
  const [latestNews, setLatestNews] = useState<{
    id: string;
    event: WorldEvent;
  } | null>(null);
  useEffect(() => {
    if (!world) return;
    const evs = world.events;
    if (evs.length === lastEventCountRef.current) return;
    const startIdx = Math.max(
      0,
      Math.min(lastEventCountRef.current, evs.length)
    );
    lastEventCountRef.current = evs.length;
    if (evs.length === 0) return;
    // 最新のイベントを表示
    const ev = evs[evs.length - 1];
    setLatestNews({
      id: `${ev.turn}-${startIdx}-${ev.type}`,
      event: ev,
    });
    // 全絶滅イベント検出時は自動的にシミュレーションを停止
    if (ev.type === "totalExtinction" && speedRef.current !== 0) {
      setSpeed(0);
    }
  }, [version, world, setSpeed]);

  // ズーム倍率（A 案：CSS transform でスケール。0.5〜3.0 倍）
  const [zoom, setZoom] = useState(1.0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1.0);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  // v1.30 (H6): シネマ追尾モード。注目個体にカメラ（ビューポート）が追従する。
  const [cinemaMode, setCinemaMode] = useState(false);
  const cinemaModeRef = useRef(false);
  useEffect(() => {
    cinemaModeRef.current = cinemaMode;
  }, [cinemaMode]);
  const [cinemaReason, setCinemaReason] = useState<string | null>(null);
  const cinemaPrevZoomRef = useRef(1.0);
  const cinemaLastPickTurnRef = useRef(-1e9);
  const cinemaPickCountRef = useRef(0);
  const toggleCinema = useCallback(() => {
    if (cinemaModeRef.current) {
      setCinemaMode(false);
      setCinemaReason(null);
      setZoom(cinemaPrevZoomRef.current);
    } else {
      cinemaPrevZoomRef.current = zoomRef.current;
      cinemaLastPickTurnRef.current = -1e9; // 次フレームで即ターゲット選定
      setCinemaMode(true);
      setZoom(2.4); // CINEMA_ZOOM: 寄りの追従
    }
  }, [setZoom]);

  // v1.02: マップ全画面モード。HUD（パネル・ヘッダー・下部ボタン）を一時的に隠す。
  // F キーまたは右上ボタンでトグル、ESC で解除。
  const [fullscreenMap, setFullscreenMap] = useState(false);

  // v1.11: 真の全画面モード（Fullscreen API）。ブラウザ・タスクバーも消える。
  // Shift+F または専用ボタンで起動、ESC で解除。fullscreenchange でユーザー操作を捕捉。
  const [trueFullscreen, setTrueFullscreen] = useState(false);
  // v1.20: 真の全画面時のマップ拡大倍率（整数倍、画面いっぱいフィット）
  const [fullscreenScale, setFullscreenScale] = useState(1);
  const enterTrueFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
      setFullscreenMap(true); // 同時に擬似全画面（HUD 隠し）も有効に
    } catch (e) {
      // ユーザー操作 がトリガーでない場合は失敗（セキュリティ仕様）
      // eslint-disable-next-line no-console
      console.warn("True fullscreen request failed:", e);
    }
  }, []);
  const exitTrueFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("Exit fullscreen failed:", e);
    }
  }, []);
  // ブラウザの fullscreenchange を監視して state を同期（ESC で抜けた場合も拾える）
  useEffect(() => {
    const onFsChange = () => {
      const isFs = document.fullscreenElement !== null;
      setTrueFullscreen(isFs);
      // v1.20 fix: 真の全画面を抜けたら、連動して有効化した擬似全画面（HUD 隠し）も
      // 必ず解除する。これをしないと ESC/Shift+F で抜けても左右パネル・下部バーが
      // 隠れたまま残り、マップだけの画面になってしまう。
      if (!isFs) {
        setFullscreenMap(false);
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFsChange);
  }, []);
  // v1.20: 真の全画面時、画面サイズに合わせて整数倍スケールを計算
  useEffect(() => {
    if (!trueFullscreen) {
      setFullscreenScale(1);
      return;
    }
    const calcScale = () => {
      const baseW = cellSize * width;
      const baseH = cellSize * height;
      if (baseW <= 0 || baseH <= 0) return;
      const scale = Math.max(
        1,
        Math.floor(
          Math.min(window.innerWidth / baseW, window.innerHeight / baseH)
        )
      );
      setFullscreenScale(scale);
    };
    calcScale();
    window.addEventListener("resize", calcScale);
    return () => window.removeEventListener("resize", calcScale);
  }, [trueFullscreen, cellSize, width, height]);

  // v1.02: 選択中の生命の移動軌跡。最近 60 ターンの座標を保持。
  // SimulationCanvas で薄い線として描画される。選択切替・死亡でリセット。
  const [selectedLifePath, setSelectedLifePath] = useState<
    { x: number; y: number }[]
  >([]);

  // v1.02: 自動継承の一時表示用ラベル（例：「← Y-12 から継承」）。
  // 5 秒で自動的にクリア。行動ログには残さない仕様。
  const [inheritedFromLabel, setInheritedFromLabel] = useState<string | null>(
    null
  );
  // v1.02: 選択中の生命のスナップショット（生きてた最後の状態）。
  // cullDead で世界の lives 配列から削除された後でも、findHeir に渡すために保持する。
  // x10/x100 高速時、死亡同フレーム内に cullDead で消されるケースに対応。
  const lastSelectedSnapshotRef = useRef<{
    id: number;
    x: number;
    y: number;
    speciesId: string;
    genes: import("@/lib/types").Genes;
  } | null>(null);

  /**
   * ズーム時の中心点を計算する。
   * 生命選択中なら生命位置（補間済）、未選択ならマップ中央。
   * 戻り値はワールド座標（セル単位、小数許容）。
   */
  const getZoomFocus = useCallback(
    (life: Life | null): { x: number; y: number } => {
      if (life) {
        return { x: life.x + 0.5, y: life.y + 0.5 };
      }
      return { x: width / 2, y: height / 2 };
    },
    [width, height]
  );

  /** ズーム後に focus 座標を viewport の中心に来るよう scroll を調整 */
  const scrollToFocus = useCallback(
    (focusX: number, focusY: number, newZoom: number) => {
      const v = viewportRef.current;
      if (!v) return;
      const pxX = focusX * cellSize * newZoom;
      const pxY = focusY * cellSize * newZoom;
      v.scrollLeft = pxX - v.clientWidth / 2;
      v.scrollTop = pxY - v.clientHeight / 2;
    },
    [cellSize]
  );

  // V2: ホバー中の個体情報をポップアップで表示
  const [hoverInfo, setHoverInfo] = useState<{
    life: Life;
    px: number;
    py: number;
  } | null>(null);

  // 左右カラムの最大高さ：sim-center の自然サイズに合わせる。
  // これにより系統数の増減で sim-root 高さが変動しない（がたつき防止）。
  const columnMaxHeight = useMemo(() => {
    const canvasH = cellSize * height; // マップ高さ
    const newsBlock = params.newsEnabled ? 26 + 8 : 0; // ニュース帯＋ gap
    const padding = 12 * 2; // sim-center 上下 padding
    const border = 2; // viewport 枠
    return canvasH + newsBlock + padding + border;
  }, [cellSize, height, params.newsEnabled]);

  // v1.30 (あ): 25画面＝観察モード。選択生命欄を縦スクロールさせず、全体の高さをパネルに合わせ、
  // 小さなマップは中央カラムの縦中央へ（左右カラムの高さ制限を外し、CSS .sim-observe で行を内容高に）。
  const observeMode = !!world && world.width <= 25;
  // v1.10: ズームレベルは固定配列で管理し、1.0（100%）が常にステップに含まれるよう保証する。
  // 以前は ZOOM_STEP=0.2 で 1.0 基準にしていたが、ZOOM_MIN=0.5 がグリッド外のため、
  // 0.5 まで縮小→拡大で 0.5→0.7→0.9→1.1 となり 100% を踏まずに飛び越えてしまうバグがあった。
  const ZOOM_LEVELS = useMemo(
    () => [
      0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.6, 2.8, 3.0,
    ],
    []
  );
  const ZOOM_MIN = ZOOM_LEVELS[0];
  const ZOOM_MAX = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
  /** delta > 0: 現在値より大きい最小レベル / delta < 0: 現在値より小さい最大レベル */
  const stepZoom = useCallback(
    (z: number, delta: number): number => {
      if (delta > 0) {
        for (let j = 0; j < ZOOM_LEVELS.length; j++) {
          if (ZOOM_LEVELS[j] > z + 0.005) return ZOOM_LEVELS[j];
        }
        return ZOOM_MAX;
      }
      for (let j = ZOOM_LEVELS.length - 1; j >= 0; j--) {
        if (ZOOM_LEVELS[j] < z - 0.005) return ZOOM_LEVELS[j];
      }
      return ZOOM_MIN;
    },
    [ZOOM_LEVELS, ZOOM_MIN, ZOOM_MAX]
  );
  // ズーム時はマップ中央（または選択生命中心）が viewport の中心に来るよう調整
  const applyZoom = useCallback(
    (newZoom: number, oldZoom: number) => {
      if (newZoom === oldZoom) return;
      const w = worldRef.current;
      const sel =
        w && selectedLifeId !== null
          ? w.lives.find((l) => l.id === selectedLifeId && l.alive) ?? null
          : null;
      const focus = getZoomFocus(sel);
      // 次フレームで scroll 調整（DOM 更新後）
      requestAnimationFrame(() => scrollToFocus(focus.x, focus.y, newZoom));
    },
    [getZoomFocus, scrollToFocus, selectedLifeId]
  );
  const zoomIn = useCallback(() => {
    setZoom((z) => {
      const newZoom = stepZoom(z, +1);
      applyZoom(newZoom, z);
      return newZoom;
    });
  }, [applyZoom, stepZoom]);
  const zoomOut = useCallback(() => {
    setZoom((z) => {
      const newZoom = stepZoom(z, -1);
      applyZoom(newZoom, z);
      return newZoom;
    });
  }, [applyZoom, stepZoom]);
  /** %表示クリックで 100% に即座に戻す（確実な復帰経路） */
  const zoomReset = useCallback(() => {
    setZoom((z) => {
      applyZoom(1.0, z);
      return 1.0;
    });
  }, [applyZoom]);

  // スペースバーで再生／一時停止
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement | null)?.isContentEditable) return;

      if (e.code === "Space") {
        e.preventDefault();
        const cur = speedRef.current;
        setSpeed(cur === 0 ? 1 : 0);
        return;
      }
      // v1.11: Shift+F で真の全画面（Fullscreen API、ブラウザ越え）
      if (e.code === "KeyF" && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (document.fullscreenElement) {
          exitTrueFullscreen();
        } else {
          enterTrueFullscreen();
        }
        return;
      }
      // v1.02: F キーでマップ全画面トグル（擬似全画面、HUD のみ隠す）、ESC で解除
      if (e.code === "KeyF" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setFullscreenMap((v) => !v);
        return;
      }
      if (e.code === "Escape") {
        setFullscreenMap(false);
        return;
      }
      // v1.02: T キーで補間 ON/OFF（厳密ターン表示）トグル
      if (e.code === "KeyT" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setParams((p) => ({ ...p, smoothAnimation: !p.smoothAnimation }));
        return;
      }
      // v1.20: 矢印キーで選択生命を切替（ID 順、生存個体のみ）
      // 左/右: 全体の前/次、上/下: 同系統の前/次
      if (
        (e.code === "ArrowLeft" || e.code === "ArrowRight" ||
         e.code === "ArrowUp" || e.code === "ArrowDown") &&
        !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
      ) {
        const w = worldRef.current;
        if (!w) return;
        e.preventDefault();
        const dir =
          e.code === "ArrowLeft" || e.code === "ArrowUp" ? -1 : +1;
        const sameSpecies = e.code === "ArrowUp" || e.code === "ArrowDown";
        const cur = w.livesById.get(selectedLifeIdRef.current ?? -1);
        const list = w.lives.filter(
          (l) => l.alive && (!sameSpecies || !cur || l.speciesId === cur.speciesId)
        );
        if (list.length === 0) return;
        // ID 昇順でソート
        list.sort((a, b) => a.id - b.id);
        let idx = 0;
        if (cur) {
          idx = list.findIndex((l) => l.id === cur.id);
          if (idx === -1) idx = 0;
          else idx = (idx + dir + list.length) % list.length;
        }
        setSelectedLifeId(list[idx].id);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSpeed, enterTrueFullscreen, exitTrueFullscreen]);

  // 描画スムージング用：最後にステップが完了した時刻と、目標ターン間隔。
  // 描画毎に animPhase = (now - lastStepAt) / stepDuration を計算してキャンバスへ渡す。
  const lastStepAtRef = useRef(performance.now());
  const stepDurationMsRef = useRef(250); // ×1 既定
  const [animPhase, setAnimPhase] = useState(1);
  // v1.21 軽量化 A2: 大マップ高速時は描画を簡易化（形状→円）するフラグ。
  const [simplifiedRender, setSimplifiedRender] = useState(false);

  // v1.02: 選択生命が変わったら移動軌跡をリセット
  // selectedLifePath を空にすると SimulationCanvas が prop 変化で再描画するため、
  // 一時停止中の選択解除でも古い軌跡は確実に消える。
  // v1.21 バグ修正: ここで version を増やすと、x100＋自動継承で選択が毎フレーム
  // 変わるたびに version が跳ね、version 依存 effect 群（軌跡・継承・ニュース）が
  // 連鎖再発火して "Maximum update depth exceeded" の一因になっていた。version 加算は廃止。
  useEffect(() => {
    setSelectedLifePath([]);
  }, [selectedLifeId]);

  // v1.02: ターン進行で選択生命の現在位置を移動軌跡に追加
  // 同時にスナップショットも更新（自動継承時の dead 参照用）
  useEffect(() => {
    if (selectedLifeId == null) {
      lastSelectedSnapshotRef.current = null;
      return;
    }
    const w = worldRef.current;
    if (!w) return;
    const life = w.livesById.get(selectedLifeId);
    if (!life || !life.alive) return;
    // 生きてる状態のスナップショットを保存（cullDead で消えた後の findHeir 用）
    lastSelectedSnapshotRef.current = {
      id: life.id,
      x: life.x,
      y: life.y,
      speciesId: life.speciesId,
      genes: life.genes,
    };
    // v1.21 バグ修正: x100 では 1 フレームごとに setSelectedLifePath が走り、
    // version 依存の本 effect と相まって React の更新が積み上がり
    // "Maximum update depth exceeded" を誘発していた。高速時は軌跡が視認できない
    // ため記録自体を省略する（スナップショットは上で更新済み＝継承には影響なし）。
    if (speedRef.current >= 100) return;
    setSelectedLifePath((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.x === life.x && last.y === life.y) return prev;
      const next = [...prev, { x: life.x, y: life.y }];
      return next.length > 60 ? next.slice(next.length - 60) : next;
    });
  }, [stats.turn, version, selectedLifeId]);

  // v1.02: 選択中の生命が死亡したら、設定 ON なら自動継承する。
  // 1) 同 speciesId の最近接、2) フォールバック：遺伝子距離最近接。
  // いずれもいなければ選択解除。
  //
  // deps に version も含めることで、雷・隕石などの一時停止中の死亡（stats.turn が
  // 変わらない場面）でも発火する。world.lives へのミューテーション後に必ず
  // setVersion(v => v + 1) が呼ばれている前提。
  useEffect(() => {
    if (selectedLifeId == null) return;
    if (!params.inheritOnDeath) return;
    const w = worldRef.current;
    if (!w) return;
    // version 変化で毎フレーム発火するため O(1) lookup を使う
    const cur = w.livesById.get(selectedLifeId);
    // 生きてるなら何もしない
    if (cur && cur.alive) return;
    // 死亡。優先順位:
    //   1) cur (alive=false の状態でまだ配列にいる)
    //   2) world.recentDeaths（cullDead 時に保存されたスナップショット）
    //   3) lastSelectedSnapshotRef（軌跡更新時に保持していたスナップショット）
    const dead =
      cur ??
      w.recentDeaths.get(selectedLifeId) ??
      lastSelectedSnapshotRef.current;
    if (!dead) return;
    // スナップショットの id 不一致（別個体が割り当てられた）は無視
    if (dead.id !== selectedLifeId) return;
    const heir = findHeir(w, dead);
    if (!heir) {
      setSelectedLifeId(null);
      return;
    }
    // 「Y-12 から継承」ラベル（一時表示用、行動ログには残さない）
    setInheritedFromLabel(speciesLabel(dead.speciesId));
    setSelectedLifeId(heir.id);
  }, [stats.turn, version, selectedLifeId, params.inheritOnDeath]);

  // 自動継承の一時表示を 5 秒で自動消去
  useEffect(() => {
    if (!inheritedFromLabel) return;
    const t = setTimeout(() => setInheritedFromLabel(null), 5000);
    return () => clearTimeout(t);
  }, [inheritedFromLabel]);

  // ズーム > 1 ＋ 生命選択中：選択生命を viewport の中心に追従させる
  useEffect(() => {
    if (zoom <= 1.001) return;
    if (selectedLifeId === null) return;
    const w = worldRef.current;
    if (!w) return;
    const sel = w.lives.find((l) => l.id === selectedLifeId && l.alive);
    if (!sel) return;
    const v = viewportRef.current;
    if (!v) return;
    // 補間位置（前ターン位置→現在位置）を使ってスムーズに追従
    const dx = sel.x - sel.prevX;
    const dy = sel.y - sel.prevY;
    // トーラス境界跨ぎはスナップ（現在位置を直接使用）
    const ix =
      Math.abs(dx) > w.width / 2 ? sel.x : sel.prevX + dx * animPhase;
    const iy =
      Math.abs(dy) > w.height / 2 ? sel.y : sel.prevY + dy * animPhase;
    const pxX = (ix + 0.5) * cellSize * zoom;
    const pxY = (iy + 0.5) * cellSize * zoom;
    v.scrollLeft = pxX - v.clientWidth / 2;
    v.scrollTop = pxY - v.clientHeight / 2;
  }, [zoom, selectedLifeId, animPhase, cellSize]);

  // v1.30 (H6): シネマ追尾の対象選定。注目個体が死亡 or 150ターン経過で次の注目個体へ自動切替。
  // カメラの中央寄せは上のズーム追従エフェクトが担当（cinema 時は zoom=2.4）。
  useEffect(() => {
    if (!cinemaMode) return;
    const w = worldRef.current;
    if (!w) return;
    const cur =
      selectedLifeIdRef.current != null
        ? w.livesById.get(selectedLifeIdRef.current)
        : undefined;
    if (!cur || !cur.alive || w.turn - cinemaLastPickTurnRef.current > 150) {
      const picked = pickCinemaTarget(w, cinemaPickCountRef.current++);
      if (picked) {
        cinemaLastPickTurnRef.current = w.turn;
        setSelectedLifeId(picked.id);
        setCinemaReason(
          `${t(picked.reasonKey)}: ${speciesLabel(picked.speciesId)}`
        );
      }
    }
  }, [version, cinemaMode, t]);

  const targetTps = speed === 0 ? 0 : speed === 1 ? 4 : speed === 10 ? 30 : 150;
  const isThrottled =
    speed > 0 && targetTps > 0 && currentTps < targetTps * 0.9;
  const effectiveX = currentTps / 4;

  return (
    <>
    <div
      className={`sim-root${fullscreenMap ? " sim-fullscreen" : ""}${observeMode ? " sim-observe" : ""}`}
      style={{
        // 中央列幅をマップサイズ＋枠ぶん（padding+border）に固定。
        // ニュースの文字長に引きずられないようにするため。
        // ただしモバイル（<=880px）では CSS 側の grid-template-columns: 1fr
        // を効かせたいので、インラインでは指定しない。
        ...(screenWidth > 880
          ? {
              gridTemplateColumns: `240px ${cellSize * width + 26}px 240px`,
            }
          : {}),
      }}
    >
      <div className="top-status">
        <div className="status-item">
          <span className="status-label">{t("status.seed")}</span>
          <span className="status-value">{seed ?? t("common.dash")}</span>
        </div>
        <div className="status-item">
          <span className="status-label">{t("status.map")}</span>
          <span className="status-value">
            {width} × {height}
          </span>
        </div>
        <div className="status-item">
          <span className="status-label">{t("status.tps")}</span>
          <span className="status-value">{currentTps.toFixed(1)}</span>
        </div>
        {speed > 0 && (
          <div className={`status-item ${isThrottled ? "status-warn" : ""}`}>
            <span className="status-label">{t("status.effective_x")}</span>
            <span className="status-value">
              {isThrottled && "⚠ "}x{effectiveX.toFixed(1)}
            </span>
          </div>
        )}
      </div>
      <aside
        className="sim-cell sim-left"
        style={observeMode ? undefined : { maxHeight: `${columnMaxHeight}px` }}
      >
        <section className="panel">
          <button
            type="button"
            className="panel-title panel-title-btn"
            onClick={() => toggleSection("global")}
            aria-expanded={!isCollapsed("global")}
          >
            <span className="panel-chevron">
              {isCollapsed("global") ? "▶" : "▼"}
            </span>
            <span>{t("panel.global_info")}</span>
          </button>
          {!isCollapsed("global") && (
          <dl className="info-list">
            <InfoRow label={t("info.turn")} value={stats.turn.toLocaleString()} />
            <InfoRow
              label={t("info.era")}
              value={
                era
                  ? `${era.name} (${Math.floor(era.progress * 100)}%)`
                  : t("common.dash")
              }
            />
            <InfoRow
              label={t("info.environment")}
              value={
                era
                  ? t(`env.${era.environment.type}`)
                  : t("common.dash")
              }
            />
            <InfoRow
              label={t("info.life_count_total")}
              value={stats.lifeCount.toLocaleString()}
            />
            <InfoRow
              label={t("info.species_count")}
              value={String(stats.speciesCount)}
            />
            <InfoRow
              label={t("info.avg_energy")}
              value={stats.averageEnergy.toFixed(1)}
            />
            <InfoRow
              label={t("info.avg_intelligence")}
              value={stats.averageIntelligence.toFixed(2)}
            />
            <InfoRow
              label={t("info.max_intelligence")}
              value={stats.maxIntelligence.toFixed(2)}
            />
            <InfoRow
              label={t("info.avg_speed")}
              value={stats.averageSpeed.toFixed(2)}
            />
            {/* v1.30 (N2): エネルギー共有ON時のみ平均利他性を表示 */}
            {params.energyShareEnabled && (
              <InfoRow
                label={t("info.avg_share")}
                value={stats.averageShare.toFixed(1)}
              />
            )}
          </dl>
          )}
        </section>

        <section className="panel">
          <button
            type="button"
            className="panel-title panel-title-btn"
            onClick={() => toggleSection("species")}
            aria-expanded={!isCollapsed("species")}
          >
            <span className="panel-chevron">
              {isCollapsed("species") ? "▶" : "▼"}
            </span>
            <span>{t("panel.species_top")}</span>
          </button>
          {!isCollapsed("species") && (
            <>
              <ul className="species-list">
                {topSpecies.length === 0 && (
                  <li className="species-empty">{t("common.dash")}</li>
                )}
                {topSpecies.map((s) => {
                  const isTracked = trackedSpeciesId === s.id;
                  return (
                    <li
                      key={s.id}
                      className={`species-item species-clickable ${
                        isTracked ? "species-tracked" : ""
                      }`}
                      onClick={() => handleSpeciesClick(s.id)}
                      title={
                        isTracked
                          ? t("info.untrack_species")
                          : t("info.tracking_hint")
                      }
                    >
                      <span
                        className="species-dot"
                        style={{
                          backgroundColor: `rgb(${s.r}, ${s.g}, ${s.b})`,
                        }}
                      />
                      <span className="species-text">
                        <span className="species-label">{s.label}</span>
                        {s.archetype.length > 0 && (
                          <span className="species-archetype">
                            {s.archetype
                              .map((k) => t(k))
                              .join(t("behavior_phrase.sep"))}
                          </span>
                        )}
                      </span>
                      <span className="species-count">{s.count}</span>
                    </li>
                  );
                })}
              </ul>
              {trackedSpeciesId && (
                <button
                  className="btn param-reset"
                  onClick={() => setTrackedSpeciesId(null)}
                >
                  {t("info.untrack_species")}
                </button>
              )}
            </>
          )}
        </section>
      </aside>

      <main className="sim-cell sim-center">
        {/* 中央カラム最上部の単一ニュース帯（フェードイン演出）。
            news 無効時は DOM ごと消して中央上部のグレー帯も非表示 */}
        {params.newsEnabled && (
        <div className="news-strip" aria-live="polite">
          {latestNews &&
            (() => {
              const ev = latestNews.event;
              const clickable =
                ev.speciesId &&
                (ev.type === "birth" ||
                  ev.type === "extinction" ||
                  ev.type === "topSpecies" ||
                  ev.type === "longevity" ||
                  ev.type === "survival" ||
                  ev.type === "predatorRise" ||
                  ev.type === "intelligentRise");
              return (
                <div
                  key={latestNews.id}
                  className={`news-item news-${ev.type} news-fadein ${
                    clickable ? "news-clickable" : ""
                  }`}
                  onClick={() => {
                    if (clickable && ev.speciesId) {
                      handleSpeciesClick(ev.speciesId);
                    }
                  }}
                  title={ev.message[locale]}
                >
                  {ev.rgb ? (
                    <span
                      className="news-dot"
                      style={{
                        backgroundColor: `rgb(${ev.rgb.r}, ${ev.rgb.g}, ${ev.rgb.b})`,
                      }}
                    />
                  ) : (
                    <span className="news-dot news-dot-empty" />
                  )}
                  <span className="news-msg">{ev.message[locale]}</span>
                </div>
              );
            })()}
        </div>
        )}
        {/* v1.30 (H6): シネマ追尾の「なぜ」を控えめに表示（中央カラム基準＝スクロールしない） */}
        {cinemaMode && cinemaReason && (
          <div className="cinema-reason">🎬 {cinemaReason}</div>
        )}
        <div
          ref={viewportRef}
          className="canvas-viewport"
          style={
            // v1.20: 真の全画面時は「画面全体を覆う固定オーバーレイ」にして、
            // マップ以外（ヘッダー・パネル・操作バー・スクロールバー・枠）を完全に隠す。
            // スクリーンセーバー的な観賞専用モード。
            trueFullscreen
              ? {
                  position: "fixed",
                  inset: 0,
                  width: "100vw",
                  height: "100vh",
                  zIndex: 9999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#000",
                  overflow: "hidden",
                  border: "none",
                }
              : {
                  width: `${cellSize * width}px`,
                  height: `${cellSize * height}px`,
                  // ズーム時のみスクロールバー出現。等倍はバー無し。
                  overflow: zoom > 1 ? "auto" : "hidden",
                }
          }
          onWheel={(e) => {
            // Q1: マウスホイールでズーム（Ctrl/Shift 不要、viewport 上で直接）
            // v1.10: ボタンと同じ ZOOM_LEVELS 配列で動くようにし、100% を必ず踏むよう保証。
            e.preventDefault();
            const dir = e.deltaY < 0 ? +1 : -1;
            setZoom((z) => {
              const newZoom = stepZoom(z, dir);
              applyZoom(newZoom, z);
              return newZoom;
            });
          }}
          onMouseDown={(e) => {
            // Q2: 右クリックドラッグでパン（左クリックは個体選択用のため右を採用）
            if (e.button !== 2) return;
            const v = viewportRef.current;
            if (!v) return;
            e.preventDefault();
            const startX = e.clientX;
            const startY = e.clientY;
            const startScrollLeft = v.scrollLeft;
            const startScrollTop = v.scrollTop;
            const onMove = (ev: MouseEvent) => {
              v.scrollLeft = startScrollLeft - (ev.clientX - startX);
              v.scrollTop = startScrollTop - (ev.clientY - startY);
            };
            const onUp = () => {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className="canvas-wrap"
            style={{
              // v1.20: 真の全画面時は整数倍スケールでフィット（fullscreenScale 使用）
              width: `${cellSize * width * (trueFullscreen ? fullscreenScale : zoom)}px`,
              height: `${cellSize * height * (trueFullscreen ? fullscreenScale : zoom)}px`,
            }}
          >
            {world && (
              <div
                style={{
                  transform: `scale(${trueFullscreen ? fullscreenScale : zoom})`,
                  transformOrigin: "top left",
                  width: `${cellSize * width}px`,
                  height: `${cellSize * height}px`,
                  imageRendering: "pixelated",
                }}
              >
                <SimulationCanvas
                  world={world}
                  cellSize={cellSize}
                  version={version}
                  speed={speed}
                  animPhase={animPhase}
                  simplifiedRender={simplifiedRender}
                  selectedLifeId={selectedLifeId}
                  showThoughtHeatmap={showThoughtHeatmap}
                  selectedLifePath={selectedLifePath}
                  trackedSpeciesId={trackedSpeciesId}
                  onCellClick={handleCellClick}
                  onCellHover={handleCellHover}
                />
              </div>
            )}
          </div>
          {/* v1.30: 真の全画面時は画面隅に控えめにブランドを表示 */}
          {trueFullscreen && (
            <div className="fullscreen-brand">LIFE GRID</div>
          )}
        </div>
        {/* モバイル縦画面：マップ直下に主要操作（再生／ステップ／速度） */}
        <div className="mobile-quick-controls">
          <button
            className={`btn ${speed === 0 ? "btn-primary" : ""}`}
            onClick={() => setSpeed(speed === 0 ? 1 : 0)}
          >
            {speed === 0 ? t("ctrl.play") : t("ctrl.pause")}
          </button>
          <button className="btn" onClick={stepOnce}>
            {t("ctrl.step")}
          </button>
          {((world && world.width <= 25 ? [1] : [1, 100]) as Speed[]).map((s) => {
            const locked = s === 100 && !unlocked;
            return (
              <button
                key={s}
                data-speed={s}
                className={`btn ${speed === s ? "btn-active" : ""} ${
                  locked ? "btn-locked" : ""
                }`}
                onClick={() => {
                  if (locked) {
                    setPwTarget({
                      label: t("password.feature.speed", { speed: s }),
                      onUnlock: () => {
                        setUnlocked(true);
                        setSpeed(s);
                        setPwTarget(null);
                      },
                    });
                    return;
                  }
                  setSpeed(s);
                }}
                title={locked ? t("common.locked_hint") : undefined}
              >
                {locked && <span className="btn-lock-glyph">🔒</span>}
                x{s}
              </button>
            );
          })}
        </div>
        {/* マップ操作バー：モードボタン群 + ズーム */}
        <div className="map-bar">
          {/* v1.30 (H6): シネマ追尾トグル（注目個体にカメラ追従） */}
          <button
            className={`mini-btn ${cinemaMode ? "mini-btn-active" : ""}`}
            onClick={toggleCinema}
            title={t("ctrl.cinema")}
            aria-label={t("ctrl.cinema")}
          >
            🎬
          </button>
          {/* v1.31 (H9): 思考ヒートマップ（選択個体の行動評価を色で可視化） */}
          <button
            className={`mini-btn ${showThoughtHeatmap ? "mini-btn-active" : ""}`}
            onClick={() => setShowThoughtHeatmap((v) => !v)}
            title={t("ctrl.thought_heatmap")}
            aria-label={t("ctrl.thought_heatmap")}
            aria-pressed={showThoughtHeatmap}
          >
            🧠
          </button>
          {/* G1: エネルギー投入 */}
          <button
            className={`mini-btn ${interactionMode === "lightning" ? "mini-btn-active" : ""}`}
            onClick={() =>
              setInteractionMode((m) =>
                m === "lightning" ? "none" : "lightning"
              )
            }
            title={t("ctrl.lightning")}
            aria-label={t("ctrl.lightning")}
          >
            ⚡
          </button>
          {/* G2: 天変地異召喚（3 種選択） */}
          <button
            className={`mini-btn ${interactionMode === "meteor" ? "mini-btn-active" : ""}`}
            onClick={() =>
              setInteractionMode((m) => (m === "meteor" ? "none" : "meteor"))
            }
            title={t("ctrl.cataclysm_meteor")}
            aria-label={t("ctrl.cataclysm_meteor")}
          >
            ☄
          </button>
          <button
            className={`mini-btn ${interactionMode === "drought" ? "mini-btn-active" : ""}`}
            onClick={() =>
              setInteractionMode((m) => (m === "drought" ? "none" : "drought"))
            }
            title={t("ctrl.cataclysm_drought")}
            aria-label={t("ctrl.cataclysm_drought")}
          >
            🌵
          </button>
          <button
            className={`mini-btn ${interactionMode === "bloom" ? "mini-btn-active" : ""}`}
            onClick={() =>
              setInteractionMode((m) => (m === "bloom" ? "none" : "bloom"))
            }
            title={t("ctrl.cataclysm_bloom")}
            aria-label={t("ctrl.cataclysm_bloom")}
          >
            🌸
          </button>
          <div className="map-bar-spacer" />
          {/* v1.02: マップ全画面トグル（F キーでも切替可） */}
          <button
            type="button"
            className="mini-btn"
            onClick={() => setFullscreenMap((v) => !v)}
            title={fullscreenMap ? t("ctrl.exit_fullscreen") : t("ctrl.enter_fullscreen")}
            aria-label={fullscreenMap ? t("ctrl.exit_fullscreen") : t("ctrl.enter_fullscreen")}
            aria-pressed={fullscreenMap}
          >
            {fullscreenMap ? "⛶✕" : "⛶"}
          </button>
          {/* v1.11: 真の全画面（Fullscreen API・Shift+F でも切替可） */}
          <button
            type="button"
            className="mini-btn"
            onClick={() => {
              if (trueFullscreen) exitTrueFullscreen();
              else enterTrueFullscreen();
            }}
            title={trueFullscreen ? t("ctrl.exit_true_fullscreen") : t("ctrl.enter_true_fullscreen")}
            aria-label={trueFullscreen ? t("ctrl.exit_true_fullscreen") : t("ctrl.enter_true_fullscreen")}
            aria-pressed={trueFullscreen}
          >
            {trueFullscreen ? "⛶⛶✕" : "⛶⛶"}
          </button>
          {/* ズーム */}
          <div className="zoom-mini">
            <button
              className="zoom-mini-btn"
              onClick={zoomOut}
              disabled={zoom <= ZOOM_MIN + 0.001}
              title={`${t("ctrl.zoom")} -`}
              aria-label={`${t("ctrl.zoom")} -`}
            >
              −
            </button>
            {/* v1.10: %表示クリックで 100% に即座に復帰（確実な復帰経路） */}
            <button
              type="button"
              className="zoom-mini-value zoom-mini-value-btn"
              onClick={zoomReset}
              disabled={Math.abs(zoom - 1.0) < 0.001}
              title={t("ctrl.zoom_reset")}
              aria-label={t("ctrl.zoom_reset")}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              className="zoom-mini-btn"
              onClick={zoomIn}
              disabled={zoom >= ZOOM_MAX - 0.001}
              title={`${t("ctrl.zoom")} +`}
              aria-label={`${t("ctrl.zoom")} +`}
            >
              ＋
            </button>
          </div>
        </div>
      </main>

      <aside
        className="sim-cell sim-right"
        style={observeMode ? undefined : { maxHeight: `${columnMaxHeight}px` }}
      >
        <section className="panel">
          <button
            type="button"
            className="panel-title panel-title-btn"
            onClick={() => toggleSection("life")}
            aria-expanded={!isCollapsed("life")}
          >
            <span className="panel-chevron">
              {isCollapsed("life") ? "▶" : "▼"}
            </span>
            <span>{t("panel.selected_life")}</span>
          </button>
          {!isCollapsed("life") && (
            selectedLife ? (
              <>
                {/* ヘッダ：色＋ID＋選択解除（ID 右に配置） */}
                <SelectedLifeBlock
                  life={selectedLife}
                  onDeselect={() => setSelectedLifeId(null)}
                  deselectLabel={t("info.deselect")}
                />
                {/* v1.30 (H8): 誕生時の新種・変異ハイライト（若い個体のみ） */}
                {selectedLife.age < 100 &&
                  (selectedLife.bornNewSpecies ||
                    selectedLife.bornMutations) && (
                    <div className="born-chips">
                      {selectedLife.bornNewSpecies && (
                        <span className="born-chip born-newspecies">
                          {t("info.new_species")}
                        </span>
                      )}
                      {selectedLife.bornMutations && (
                        <span className="born-chip born-mutation">
                          {t("info.mutated")}:{" "}
                          {selectedLife.bornMutations
                            .map((k) => t(k))
                            .join(", ")}
                        </span>
                      )}
                    </div>
                  )}
                {/* v1.02: 自動継承の一時表示（行動ログには残さない） */}
                {inheritedFromLabel && (
                  <div className="inherit-chip">
                    ← {inheritedFromLabel} {t("info.inherited_from")}
                  </div>
                )}
                {/* 遺伝子 ID（コピー可） */}
                <GeneIdRow life={selectedLife} />
                {/* G3 保護トグル */}
                <label className="protect-toggle">
                  <input
                    type="checkbox"
                    checked={!!selectedLife.protected}
                    onChange={(e) => {
                      selectedLife.protected = e.target.checked;
                      setVersion((v) => v + 1);
                    }}
                  />
                  <span>{t("info.protect")}</span>
                </label>
                {/* v1.20: タブナビゲーション（基本 / 遺伝 / 性格） */}
                <div className="life-tabs">
                  <button
                    type="button"
                    className={`life-tab ${lifePanelTab === "basic" ? "active" : ""}`}
                    onClick={() => setLifePanelTab("basic")}
                  >
                    {t("panel.tab.basic")}
                  </button>
                  <button
                    type="button"
                    className={`life-tab ${lifePanelTab === "genes" ? "active" : ""}`}
                    onClick={() => setLifePanelTab("genes")}
                  >
                    {t("panel.tab.genes")}
                  </button>
                  <button
                    type="button"
                    className={`life-tab ${lifePanelTab === "personality" ? "active" : ""}`}
                    onClick={() => setLifePanelTab("personality")}
                  >
                    {t("panel.tab.personality")}
                  </button>
                </div>
                {/* 「基本」タブ：状態と系統情報 + 行動の特徴 */}
                {lifePanelTab === "basic" && (
                  <>
                    {world && (
                      <div className="info-grid-2 info-compact">
                        <InfoRow
                          label={t("info.species")}
                          value={speciesLabel(selectedLife.speciesId)}
                        />
                        <InfoRow
                          label={t("info.rgb")}
                          value={`(${binCenterColor(selectedLife.genes.r)},${binCenterColor(selectedLife.genes.g)},${binCenterColor(selectedLife.genes.b)})`}
                        />
                        <InfoRow
                          label={t("info.position")}
                          value={`(${selectedLife.x}, ${selectedLife.y})`}
                        />
                        <InfoRow
                          label={t("info.energy_owned")}
                          value={selectedLife.energy.toFixed(1)}
                        />
                        <InfoRow
                          label={t("info.age")}
                          value={`${selectedLife.age} / ${selectedLife.genes.lifespan.toFixed(0)}`}
                        />
                      </div>
                    )}
                    {/* v1.20: 行動の特徴を文章で表示（性格タグより具体的） */}
                    <div className="behavior-traits">
                      <div className="behavior-traits-label">
                        {t("info.behavior_traits")}
                      </div>
                      {/* v1.30 (う): 行動・能力を一文で要約「〇〇で〇〇な〇〇な個体」 */}
                      <div className="behavior-traits-phrase">
                        {(() => {
                          const ks = describeBehaviorPhrase(selectedLife);
                          if (ks.length === 0) return null;
                          return (
                            ks.map((k) => t(k)).join(t("behavior_phrase.sep")) +
                            t("behavior_phrase.suffix")
                          );
                        })()}
                      </div>
                      <ul className="behavior-traits-list">
                        {describeBehavior(selectedLife).map((tr, i) => (
                          <li key={i}>
                            {t(tr.key)}
                            {tr.weight > 0 && (
                              <span className="behavior-traits-weight">
                                {" "}
                                {tr.weight.toFixed(0)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                      {behaviorAccuracyNote(selectedLife) === "unstable" && (
                        <div className="behavior-traits-note">
                          {t("behavior_desc.note_unstable")}
                        </div>
                      )}
                    </div>
                  </>
                )}
                {/* 「遺伝」タブ：8 つの基本遺伝子 */}
                {lifePanelTab === "genes" && (
                  <div className="info-grid-2 info-compact">
                    <InfoRow
                      label={t("info.vision")}
                      hint={t("info.vision_hint")}
                      value={selectedLife.genes.vision}
                    />
                    <InfoRow
                      label={t("info.move_speed")}
                      hint={t("info.move_speed_hint")}
                      value={`${selectedLife.genes.speed} / 999${
                        selectedLife.genes.speed > 100 ? "  ⚠" : ""
                      }`}
                    />
                    <InfoRow
                      label={t("info.size")}
                      hint={t("info.size_hint")}
                      value={selectedLife.genes.size.toFixed(0)}
                    />
                    <InfoRow
                      label={t("info.strength")}
                      hint={t("info.strength_hint")}
                      value={`${selectedLife.genes.strength.toFixed(0)} / 999${
                        selectedLife.genes.strength > 100 ? "  ⚠" : ""
                      }`}
                    />
                    <InfoRow
                      label={t("info.intelligence")}
                      hint={t("info.intelligence_hint")}
                      value={`${selectedLife.genes.intelligence} / 999${
                        selectedLife.genes.intelligence > 100 ? "  ⚠" : ""
                      }`}
                    />
                    <InfoRow
                      label={t("info.birth_threshold")}
                      hint={t("info.birth_threshold_hint")}
                      value={`${selectedLife.genes.birthThreshold.toFixed(0)} / 300`}
                    />
                    <InfoRow
                      label={t("info.lifespan")}
                      hint={t("info.lifespan_hint")}
                      value={selectedLife.genes.lifespan.toFixed(0)}
                    />
                    <InfoRow
                      label={t("info.offspring_count")}
                      hint={t("info.offspring_count_hint")}
                      value={`${selectedLife.genes.offspringCount} / 3`}
                    />
                  </div>
                )}
                {/* 「性格」タブ：7 つの行動判断重み遺伝子 */}
                {lifePanelTab === "personality" && (
                  <div className="info-grid-2 info-compact">
                    <InfoRow
                      label={t("info.w_appetite")}
                      value={selectedLife.genes.wAppetite.toFixed(0)}
                    />
                    <InfoRow
                      label={t("info.w_predation")}
                      value={selectedLife.genes.wPredation.toFixed(0)}
                    />
                    <InfoRow
                      label={t("info.w_caution")}
                      value={selectedLife.genes.wCaution.toFixed(0)}
                    />
                    <InfoRow
                      label={t("info.w_gregarious")}
                      value={selectedLife.genes.wGregarious.toFixed(0)}
                    />
                    <InfoRow
                      label={t("info.w_loyalty")}
                      value={selectedLife.genes.wLoyalty.toFixed(0)}
                    />
                    <InfoRow
                      label={t("info.w_repro")}
                      value={selectedLife.genes.wRepro.toFixed(0)}
                    />
                    <InfoRow
                      label={t("info.w_starv_sensitive")}
                      value={selectedLife.genes.wStarvSensitive.toFixed(0)}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="empty-hint">{t("info.untracked")}</p>
                <p className="empty-sub">{t("info.untracked_hint")}</p>
              </>
            )
          )}
        </section>
        {/* v1.30 (N3): 注目選択（最上位個体へジャンプ）。選択生命の下・既定は折りたたみ。 */}
        <section className="panel">
          <button
            type="button"
            className="panel-title panel-title-btn"
            onClick={() => toggleSection("focus")}
            aria-expanded={!isCollapsed("focus")}
          >
            <span className="panel-chevron">
              {isCollapsed("focus") ? "▶" : "▼"}
            </span>
            <span>{t("panel.focus")}</span>
          </button>
          {!isCollapsed("focus") && (
            <div className="focus-top-bar">
              {(
                [
                  ["strength", "focus.strongest"],
                  ["intelligence", "focus.smartest"],
                  ["speed", "focus.fastest"],
                  ["size", "focus.biggest"],
                  ["age", "focus.oldest"],
                ] as const
              ).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  className="btn focus-top-btn"
                  onClick={() => selectTopLife(k)}
                >
                  {t(lbl)}
                </button>
              ))}
            </div>
          )}
        </section>
      </aside>

      <footer className="sim-cell sim-bottom">
        <div className="ctrl-bar">
          <div className="ctrl-group">
            <button
              className={`btn ${speed === 0 ? "btn-primary" : ""}`}
              onClick={() => setSpeed(speed === 0 ? 1 : 0)}
            >
              {speed === 0 ? t("ctrl.play") : t("ctrl.pause")}
            </button>
            <button className="btn" onClick={stepOnce}>
              {t("ctrl.step")}
            </button>
          </div>
          <div className="ctrl-group">
            {((world && world.width <= 25 ? [1] : [1, 10, 100]) as Speed[]).map((s) => {
              const locked = s === 100 && !unlocked;
              return (
                <button
                  key={s}
                  data-speed={s}
                  className={`btn ${speed === s ? "btn-active" : ""} ${
                    locked ? "btn-locked" : ""
                  }`}
                  onClick={() => {
                    if (locked) {
                      setPwTarget({
                        label: t("password.feature.speed", { speed: s }),
                        onUnlock: () => {
                          setUnlocked(true);
                          setSpeed(s);
                          setPwTarget(null);
                        },
                      });
                      return;
                    }
                    setSpeed(s);
                  }}
                  title={locked ? t("common.locked_hint") : undefined}
                >
                  {locked && <span className="btn-lock-glyph">🔒</span>}
                  x{s}
                </button>
              );
            })}
          </div>
          <div className="ctrl-spacer" />
          <div className="ctrl-group">
            <button
              className="btn btn-ghost"
              onClick={() => setShowRules(true)}
              title={t("start.button.rules")}
            >
              ?
            </button>
            <button className="btn" onClick={() => setShowLog(true)}>
              {t("ctrl.action_log")}
            </button>
            <button className="btn" onClick={() => setShowStats(true)}>
              {t("ctrl.stats_graph")}
            </button>
            <button
              className="btn"
              onClick={exportPng}
              title={t("ctrl.export_png_hint")}
            >
              {t("ctrl.export_png")}
            </button>
            <button className="btn" onClick={() => setShowSettings(true)}>
              {t("ctrl.settings")}
            </button>
            <button
              className="btn"
              onClick={() => seed !== null && reset(seed)}
            >
              {t("ctrl.reset")}
            </button>
            <button className="btn" onClick={() => reset(randomSeed())}>
              {t("ctrl.new_seed")}
            </button>
          </div>
        </div>
      </footer>

      {showSettings && (
        <div
          className="modal-backdrop"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="modal-panel modal-wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 className="modal-title">{t("settings.title")}</h2>
              <button
                className="btn modal-close"
                onClick={() => setShowSettings(false)}
              >
                {t("common.close")}
              </button>
            </div>

            <section className="modal-section">
              <h3 className="modal-section-title">
                {t("settings.summary_title")}
              </h3>
              <p className="settings-summary">
                {describeEnvironment(params, locale as "ja" | "en")}
              </p>
            </section>

            <section className="modal-section">
              <h3 className="settings-col-title">
                {t("settings.col.world_rules")}
              </h3>
              <div className="param-list">
                <ParamSlider
                  label={t("settings.param.total_energy")}
                  value={params.totalEnergy}
                  min={0.3}
                  max={2.0}
                  step={0.05}
                  onChange={(v) => setParams((p) => ({ ...p, totalEnergy: v }))}
                />
                <ParamSlider
                  label={t("settings.param.mutation_rate")}
                  value={params.mutationRateMultiplier}
                  min={0.0}
                  max={3.0}
                  step={0.05}
                  onChange={(v) =>
                    setParams((p) => ({ ...p, mutationRateMultiplier: v }))
                  }
                />
                <ParamSlider
                  label={t("settings.param.wave_speed")}
                  value={params.waveSpeed}
                  min={0.0}
                  max={3.0}
                  step={0.05}
                  onChange={(v) => setParams((p) => ({ ...p, waveSpeed: v }))}
                />
                <button
                  className="btn param-reset"
                  onClick={() => setParams(defaultSimulationParams())}
                >
                  {t("common.reset_default")}
                </button>
              </div>
              {/* v1.30 (案1/B): 仲間へのエネルギー提供（利他）。既定OFFのオプトイン。 */}
              <label
                className="settings-toggle"
                title={t("settings.energy_share_hint")}
              >
                <input
                  type="checkbox"
                  checked={params.energyShareEnabled}
                  onChange={(e) =>
                    setParams((p) => ({
                      ...p,
                      energyShareEnabled: e.target.checked,
                    }))
                  }
                />
                <span>{t("settings.energy_share")}</span>
              </label>
            </section>

            {/* v1.31: 上級設定（研究者向け）。既定で折りたたみ。 */}
            <section className="modal-section">
              <details className="advanced-details">
                <summary className="advanced-summary">
                  {t("settings.advanced.title")}
                </summary>
                <p className="empty-sub advanced-hint">
                  {t("settings.advanced.hint")}
                </p>
                <div className="settings-grid">
                  <div>
                    <h3 className="settings-col-title">
                      {t("settings.advanced.cost_title")}
                    </h3>
                    <div className="param-list">
                      <ParamSlider
                        label={t("settings.adv.cost_base")}
                        value={params.advanced.costBaseMul}
                        min={0}
                        max={3}
                        step={0.1}
                        onChange={(v) =>
                          setParams((p) => ({
                            ...p,
                            advanced: { ...p.advanced, costBaseMul: v },
                          }))
                        }
                      />
                      <ParamSlider
                        label={t("settings.adv.cost_vision")}
                        value={params.advanced.costVisionMul}
                        min={0}
                        max={3}
                        step={0.1}
                        onChange={(v) =>
                          setParams((p) => ({
                            ...p,
                            advanced: { ...p.advanced, costVisionMul: v },
                          }))
                        }
                      />
                      <ParamSlider
                        label={t("settings.adv.cost_speed")}
                        value={params.advanced.costSpeedMul}
                        min={0}
                        max={3}
                        step={0.1}
                        onChange={(v) =>
                          setParams((p) => ({
                            ...p,
                            advanced: { ...p.advanced, costSpeedMul: v },
                          }))
                        }
                      />
                      <ParamSlider
                        label={t("settings.adv.cost_strength")}
                        value={params.advanced.costStrengthMul}
                        min={0}
                        max={3}
                        step={0.1}
                        onChange={(v) =>
                          setParams((p) => ({
                            ...p,
                            advanced: { ...p.advanced, costStrengthMul: v },
                          }))
                        }
                      />
                      <ParamSlider
                        label={t("settings.adv.cost_intelligence")}
                        value={params.advanced.costIntelligenceMul}
                        min={0}
                        max={3}
                        step={0.1}
                        onChange={(v) =>
                          setParams((p) => ({
                            ...p,
                            advanced: {
                              ...p.advanced,
                              costIntelligenceMul: v,
                            },
                          }))
                        }
                      />
                      <ParamSlider
                        label={t("settings.adv.absorb")}
                        value={params.advanced.absorbMul}
                        min={0.2}
                        max={3}
                        step={0.1}
                        onChange={(v) =>
                          setParams((p) => ({
                            ...p,
                            advanced: { ...p.advanced, absorbMul: v },
                          }))
                        }
                      />
                      <ParamSlider
                        label={t("settings.adv.combat_loss")}
                        value={params.advanced.combatLossMul}
                        min={0}
                        max={1.6}
                        step={0.1}
                        onChange={(v) =>
                          setParams((p) => ({
                            ...p,
                            advanced: { ...p.advanced, combatLossMul: v },
                          }))
                        }
                      />
                      <button
                        className="btn param-reset"
                        onClick={() =>
                          setParams((p) => ({
                            ...p,
                            advanced: { ...DEFAULT_ADVANCED },
                          }))
                        }
                      >
                        {t("settings.advanced.reset_cost")}
                      </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="settings-col-title">
                      {t("settings.col.gene_toggle")}
                    </h3>
                    <p className="empty-sub">{t("settings.gene_toggle_hint")}</p>
                    <GeneToggleGrid
                      disabled={params.disabledGenes}
                      onChange={(next) =>
                        setParams((p) => ({ ...p, disabledGenes: next }))
                      }
                    />
                    <div className="gene-toggle-actions">
                      <button
                        className="btn"
                        onClick={() =>
                          setParams((p) => ({
                            ...p,
                            disabledGenes: defaultDisabledGenes(),
                          }))
                        }
                      >
                        {t("settings.gene_all_on")}
                      </button>
                      <button
                        className="btn"
                        onClick={() =>
                          setParams((p) => ({
                            ...p,
                            disabledGenes: allDisabledGenes(),
                          }))
                        }
                      >
                        {t("settings.gene_all_off")}
                      </button>
                    </div>
                  </div>
                </div>
              </details>
            </section>

            <section className="modal-section">
              <h3 className="modal-section-title">
                {t("settings.section.display")}
              </h3>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={params.newsEnabled}
                  onChange={(e) =>
                    setParams((p) => ({ ...p, newsEnabled: e.target.checked }))
                  }
                />
                <span>{t("settings.toggle.news")}</span>
              </label>
              {/* v1.02: 自動継承トグル */}
              <label
                className="settings-toggle"
                title={t("settings.param.inherit_on_death_hint")}
              >
                <input
                  type="checkbox"
                  checked={params.inheritOnDeath}
                  onChange={(e) =>
                    setParams((p) => ({
                      ...p,
                      inheritOnDeath: e.target.checked,
                    }))
                  }
                />
                <span>{t("settings.param.inherit_on_death")}</span>
              </label>
              {/* v1.02: 補間アニメーション ON/OFF（T キーでも切替可） */}
              <label
                className="settings-toggle"
                title={t("settings.param.smooth_animation_hint")}
              >
                <input
                  type="checkbox"
                  checked={params.smoothAnimation}
                  onChange={(e) =>
                    setParams((p) => ({
                      ...p,
                      smoothAnimation: e.target.checked,
                    }))
                  }
                />
                <span>{t("settings.param.smooth_animation")}</span>
              </label>
            </section>

            <section className="modal-section">
              <h3 className="modal-section-title">
                {t("settings.section.export")}
              </h3>
              <button
                className="btn"
                onClick={exportCsv}
                title={t("settings.export_csv_hint")}
              >
                {t("settings.export_csv")}
              </button>
            </section>

            <section className="modal-section">
              <h3 className="modal-section-title">
                {t("settings.section.seed")}
              </h3>
              <div className="seed-row">
                <span className="seed-current">
                  {seed ?? t("common.dash")}
                </span>
                <button
                  className="btn"
                  onClick={() => {
                    if (seed === null) return;
                    if (
                      typeof navigator !== "undefined" &&
                      navigator.clipboard
                    ) {
                      navigator.clipboard.writeText(String(seed)).then(
                        () => {
                          setSeedCopied(true);
                          setTimeout(() => setSeedCopied(false), 1200);
                        },
                        () => {}
                      );
                    }
                  }}
                >
                  {seedCopied ? t("common.copied") : t("common.copy")}
                </button>
              </div>
              <div className="seed-row">
                <input
                  type="text"
                  className="seed-input"
                  placeholder={t("settings.seed_input_placeholder")}
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value)}
                />
                <button
                  className="btn"
                  onClick={() => {
                    const n = Number(seedInput.trim());
                    if (!Number.isFinite(n)) return;
                    reset((n >>> 0) || randomSeed());
                    setSeedInput("");
                    setShowSettings(false);
                  }}
                >
                  {t("common.load")}
                </button>
              </div>
              <p className="empty-sub">{t("settings.seed_hint")}</p>
            </section>
          </div>
        </div>
      )}

      {showStats && world && (
        <StatsGraphModal
          history={world.history}
          lives={world.lives}
          enabled={graphSeries}
          onChange={setGraphSeries}
          onClose={() => setShowStats(false)}
          onSpeciesClick={(id) => {
            setTrackedSpeciesId(id);
            setShowStats(false);
          }}
          timeRunning={statsKeepRunning}
          onToggleTime={() => setStatsKeepRunning((v) => !v)}
          tab={statsTab}
          onTabChange={setStatsTab}
          geneKey={statsGeneKey}
          onGeneKeyChange={setStatsGeneKey}
          initialOffset={statsModalOffset}
          onOffsetChange={setStatsModalOffset}
        />
      )}

      {showLog && world && (
        <ActionLogModal
          events={world.events}
          lineage={Array.from(world.speciesLineage.values())}
          lives={world.lives}
          onClose={() => setShowLog(false)}
          onSpeciesClick={(id) => {
            setTrackedSpeciesId(id);
            setShowLog(false);
          }}
          timeRunning={logKeepRunning}
          onToggleTime={() => setLogKeepRunning((v) => !v)}
          initialOffset={logModalOffset}
          onOffsetChange={setLogModalOffset}
        />
      )}

      {showRules && (
        <RulesScreen
          onClose={() => setShowRules(false)}
          initialOffset={rulesModalOffset}
          onOffsetChange={setRulesModalOffset}
        />
      )}

      {/* v1.31 (C1): ロード用の隠しファイル入力 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleLoadFile(f);
          e.target.value = ""; // 同じファイルを連続で選べるように
        }}
      />
      {saveMsg && <div className="save-toast">{saveMsg}</div>}

      <ShareXButton
        text={
          selectedLife
            ? `LIFE GRID で最強の生き物できた！🧬 ${speciesLabel(selectedLife.speciesId)}`
            : `LIFE GRID で世界を観察中 🌍 (T${stats.turn.toLocaleString()})`
        }
        className="x-share-fixed"
      />
    </div>
    <KinomenoLink />
    {pwTarget && (
      <PasswordPrompt
        featureLabel={pwTarget.label}
        onUnlock={pwTarget.onUnlock}
        onCancel={() => setPwTarget(null)}
      />
    )}
    {/* V2: ホバーポップアップ（カーソル付近に個体情報） */}
    {hoverInfo && (
      <div
        className="hover-pop"
        style={{
          left: `${hoverInfo.px + 14}px`,
          top: `${hoverInfo.py + 14}px`,
        }}
      >
        <div className="hover-pop-row">
          <span
            className="species-dot"
            style={{
              backgroundColor: `rgb(${binCenterColor(hoverInfo.life.genes.r)}, ${binCenterColor(hoverInfo.life.genes.g)}, ${binCenterColor(hoverInfo.life.genes.b)})`,
            }}
          />
          <strong>ID {hoverInfo.life.id}</strong>
          <span className="hover-pop-species">
            {speciesLabel(hoverInfo.life.speciesId)}
          </span>
        </div>
        <div className="hover-pop-row hover-pop-stats">
          E {hoverInfo.life.energy.toFixed(0)} · Age {hoverInfo.life.age} · Str{" "}
          {Math.round(hoverInfo.life.genes.strength)} · Int{" "}
          {hoverInfo.life.genes.intelligence}
        </div>
      </div>
    )}
    </>
  );
  }
);

export default SimulationView;

function GeneIdRow({ life }: { life: Life }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  const id = encodeGeneId(life.genes);
  const display = truncateGeneId(id, 17);
  return (
    <div className="gene-id-row">
      <code className="gene-id" title={id}>
        {display}
      </code>
      <button
        className="btn gene-copy"
        onClick={() => {
          if (typeof navigator !== "undefined" && navigator.clipboard) {
            navigator.clipboard.writeText(id).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              },
              () => {}
            );
          }
        }}
      >
        {copied ? "✓" : t("common.copy")}
      </button>
    </div>
  );
}

function SelectedLifeBlock({
  life,
  onDeselect,
  deselectLabel,
}: {
  life: Life;
  onDeselect: () => void;
  deselectLabel: string;
}) {
  return (
    <div className="selected-head">
      <span
        className="species-dot"
        style={{
          backgroundColor: `rgb(${binCenterColor(life.genes.r)}, ${binCenterColor(life.genes.g)}, ${binCenterColor(life.genes.b)})`,
        }}
      />
      <div className="selected-text">
        <div className="selected-id-row">
          <span className="selected-id">ID {life.id}</span>
          <button className="btn selected-deselect" onClick={onDeselect}>
            {deselectLabel}
          </button>
        </div>
        <div className="selected-pos">
          {speciesLabel(life.speciesId)} · ({life.x}, {life.y})
        </div>
      </div>
    </div>
  );
}

/** 全項目を「無効化」した DisabledGeneFlags を返す。 */
function allDisabledGenes(): DisabledGeneFlags {
  return {
    rgb: true,
    vision: true,
    speed: true,
    size: true,
    strength: true,
    intelligence: true,
    birthThreshold: true,
    lifespan: true,
  };
}

const GENE_TOGGLE_ITEMS: { key: keyof DisabledGeneFlags; tKey: string }[] = [
  // v1.30 (H4): 体色は表現型から算出するため「体色(RGB)」トグルは廃止。
  { key: "vision", tKey: "gene.vision" },
  { key: "speed", tKey: "gene.speed" },
  { key: "size", tKey: "gene.size" },
  { key: "strength", tKey: "gene.strength" },
  { key: "intelligence", tKey: "gene.intelligence" },
  { key: "birthThreshold", tKey: "gene.birth_threshold" },
  { key: "lifespan", tKey: "gene.lifespan" },
];

/**
 * 現在の環境設定を自然な日本語／英語文で説明する。
 * 多様な判定（楽園・混沌・凍結・嵐・etc）で「バランス」の出現を抑える。
 * v1.10: combatAdvantage を UI から削除したため、C 軸の判定を撤去し E/M/W のみで判定する。
 */
function describeEnvironment(
  params: SimulationParams,
  locale: "ja" | "en"
): string {
  const E = params.totalEnergy;
  const M = params.mutationRateMultiplier;
  const W = params.waveSpeed;

  // === タイプ判定（早期 return で一意に決まるよう優先度順） ===
  type Verdict = { ja: string; en: string };
  let v: Verdict;
  if (E >= 1.4 && M <= 1.3) {
    v = {
      ja: "エネルギーが満ち溢れる楽園。資源は潤沢で温和な生物が長く繁栄する。",
      en: "An overflowing paradise. Resources abound and gentle species thrive long.",
    };
  } else if (E < 0.7 && M <= 0.8) {
    v = {
      ja: "資源が乏しく、強者が弱者を喰らう過酷な世界。",
      en: "Scarce resources, a harsh world where the strong devour the weak.",
    };
  } else if (M >= 1.6) {
    v = {
      ja: "突然変異が異常に活発で、毎瞬のように新種が生まれる混沌の時代。",
      en: "Mutation runs wild — new species emerge constantly in an age of chaos.",
    };
  } else if (W <= 0.2) {
    v = {
      ja: "エネルギーの波が凍りつき、地形に最適化した種が支配する静止世界。",
      en: "Energy waves are frozen; species adapted to terrain dominate a static world.",
    };
  } else if (W >= 2.0) {
    v = {
      ja: "嵐のように波が激しく、生物は絶えず移動を強いられる。",
      en: "Storm-like waves force constant migration.",
    };
  } else if (E >= 1.3) {
    v = {
      ja: "豊かな実りに恵まれた牧歌的世界。草食的な種が広がりやすい。",
      en: "A pastoral world rich in harvest; herbivore-like species spread easily.",
    };
  } else if (E < 0.8 && M <= 0.6) {
    v = {
      ja: "資源は乏しく、進化も停滞気味。生き残るのは効率的な少数のみ。",
      en: "Scarce resources, stagnant evolution. Only the efficient few survive.",
    };
  } else if (M <= 0.4) {
    v = {
      ja: "突然変異がほぼ起きず、祖先の遺伝子がそのまま継承される保守的な世界。",
      en: "Mutation is nearly absent; ancestral genes are inherited unchanged in a conservative world.",
    };
  } else if (E >= 1.2 && M >= 1.2 && W >= 1.2) {
    v = {
      ja: "豊穣・激変・多様化が同時進行する、ドラマチックな進化の舞台。",
      en: "Abundance, turbulence, and diversification at once — a dramatic stage for evolution.",
    };
  } else if (W >= 1.5) {
    v = {
      ja: "波が激しく、回遊と適応が進化の鍵となる世界。",
      en: "Turbulent waves; migration and adaptation drive evolution.",
    };
  } else {
    v = {
      ja: "極端ではない、進化の方向が読みにくい中庸の世界。",
      en: "Not extreme — a moderate world where evolution's direction is hard to predict.",
    };
  }

  return v[locale];
}

function GeneToggleGrid({
  disabled,
  onChange,
}: {
  disabled: DisabledGeneFlags;
  onChange: (next: DisabledGeneFlags) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="gene-toggle-list">
      {GENE_TOGGLE_ITEMS.map((item) => {
        const enabled = !disabled[item.key];
        return (
          <label
            key={item.key}
            className={`gene-toggle-item ${enabled ? "" : "disabled"}`}
          >
            <input
              type="checkbox"
              checked={enabled}
              onChange={() =>
                onChange({ ...disabled, [item.key]: enabled })
              }
            />
            {t(item.tKey)}
          </label>
        );
      })}
    </div>
  );
}

function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return (
    <div className="param-row">
      <div className="param-head">
        <span className="param-label">{label}</span>
        <span className="param-value">{value.toFixed(decimals)}</span>
      </div>
      <input
        type="range"
        className="param-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
  hint,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div className="info-row" title={hint}>
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{value}</dd>
    </div>
  );
}

// v1.30 (H6): シネマ追尾の注目対象を選ぶ（最大勢力／最古参／最強 をローテーション）。
function pickCinemaTarget(
  world: World,
  pickCount: number
): { id: number; reasonKey: string; speciesId: string } | null {
  const alive = world.lives.filter((l) => l.alive);
  if (alive.length === 0) return null;
  const crit = pickCount % 3;
  if (crit === 1) {
    let best = alive[0];
    for (const l of alive) if (l.age > best.age) best = l;
    return { id: best.id, reasonKey: "cinema.oldest", speciesId: best.speciesId };
  }
  if (crit === 2) {
    let best = alive[0];
    for (const l of alive) if (l.genes.strength > best.genes.strength) best = l;
    return {
      id: best.id,
      reasonKey: "cinema.strongest",
      speciesId: best.speciesId,
    };
  }
  // 0: 最大勢力（最多の種）の高エネルギー代表
  const counts = new Map<string, number>();
  for (const l of alive)
    counts.set(l.speciesId, (counts.get(l.speciesId) ?? 0) + 1);
  let topSp = alive[0].speciesId;
  let topC = 0;
  for (const [sp, c] of counts)
    if (c > topC) {
      topC = c;
      topSp = sp;
    }
  let best = alive[0];
  let bv = -Infinity;
  for (const l of alive)
    if (l.speciesId === topSp && l.energy > bv) {
      bv = l.energy;
      best = l;
    }
  return { id: best.id, reasonKey: "cinema.dominant", speciesId: best.speciesId };
}

function computeTopSpecies(world: World, max = 30): SpeciesEntry[] {
  const map = new Map<
    string,
    { count: number; r: number; g: number; b: number; archetype: string[] }
  >();
  for (const life of world.lives) {
    if (!life.alive) continue;
    const cur = map.get(life.speciesId);
    if (cur) {
      cur.count++;
    } else {
      map.set(life.speciesId, {
        count: 1,
        r: binCenterColor(life.genes.r),
        g: binCenterColor(life.genes.g),
        b: binCenterColor(life.genes.b),
        // v1.30 (N1): 最初に見つかった個体を代表としてアーキタイプを算出（同種は近い性質）。
        archetype: describeBehaviorPhrase(life),
      });
    }
  }
  const entries: SpeciesEntry[] = [];
  for (const [id, v] of map) {
    entries.push({
      id,
      label: speciesLabel(id),
      count: v.count,
      r: v.r,
      g: v.g,
      b: v.b,
      archetype: v.archetype,
    });
  }
  entries.sort((a, b) => b.count - a.count);
  return entries.slice(0, max);
}
