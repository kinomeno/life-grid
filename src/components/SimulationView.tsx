"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  createWorld,
  currentEra,
  defaultDisabledGenes,
  defaultSimulationParams,
  findHeir,
  getBehaviorMode,
  stepWorld,
} from "@/lib/world";
import type { DisabledGeneFlags, WorldEvent } from "@/lib/types";
import { speciesLabel } from "@/lib/species";
import { encodeGeneId, truncateGeneId } from "@/lib/geneId";
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
};

export default function SimulationView({
  width,
  height,
  initialLifeCount,
  initialSeed,
  initialGenes,
  onBackToTitle,
}: Props) {
  const { t, locale } = useLocale();
  // 画面幅を追跡し、モバイルでマップが overflow しないようにする
  const [screenWidth, setScreenWidth] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  useEffect(() => {
    const onResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const cellSize = useMemo(() => {
    // 画面幅から余白を引いた値とデスクトップ時の上限 720px のうち小さい方。
    // モバイル縦画面では左右パネルを畳むため画面幅の大半が使えるが、
    // .sim-center / .canvas-wrap の左右 padding + border ぶんを差し引かないと
    // Canvas が親 wrap より大きくなり右端がはみ出るので余裕をもって 40px 引く。
    const padding = 40;
    const maxPx = Math.min(720, Math.max(160, screenWidth - padding));
    const fit = Math.floor(maxPx / Math.max(width, height));
    return Math.max(2, Math.min(8, fit));
  }, [width, height, screenWidth]);

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
  });
  const [topSpecies, setTopSpecies] = useState<SpeciesEntry[]>([]);
  const [speed, setSpeedState] = useState<Speed>(0);
  const speedRef = useRef<Speed>(0);
  const [currentTps, setCurrentTps] = useState(0);
  const [params, setParams] = useState<SimulationParams>(() =>
    defaultSimulationParams()
  );
  // RAF ループ内で常に最新の params を参照するための ref
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showRules, setShowRules] = useState(false);
  // 統計／ログ画面の「時間進行 ON/OFF」トグル（初期 OFF＝停止）
  const [statsKeepRunning, setStatsKeepRunning] = useState(false);
  const [logKeepRunning, setLogKeepRunning] = useState(false);
  const [seedCopied, setSeedCopied] = useState(false);
  const [seedInput, setSeedInput] = useState("");

  const [selectedLifeId, setSelectedLifeId] = useState<number | null>(null);
  const [trackedSpeciesId, setTrackedSpeciesId] = useState<string | null>(null);

  // G1/G2: マップクリック時の特殊モード
  type InteractionMode = "none" | "lightning" | "meteor" | "drought" | "bloom";
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("none");

  // パネル折りたたみ状態。タイトル click で開閉。
  // モバイル縦画面では既定で折りたたむ（観察モード）。
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const isMobilePortrait =
      window.innerWidth <= 520 && window.innerHeight > window.innerWidth;
    return isMobilePortrait
      ? new Set(["global", "species", "life"])
      : new Set();
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
    const w = createWorld({
      width,
      height,
      initialLifeCount,
      seed: initialSeed,
      params,
      initialGenes,
    });
    worldRef.current = w;
    setWorldState(w);
    setSeed(initialSeed);
    refreshDerived(w);
    setVersion((v) => v + 1);
    // 共有可能な URL に更新（履歴を汚さず replaceState）
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams();
      sp.set("seed", String(initialSeed));
      sp.set("w", String(width));
      sp.set("n", String(initialLifeCount));
      window.history.replaceState(null, "", `?${sp.toString()}`);
    }
    // params/initialGenes は初回のみ読み取り（リセット時のみ反映）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, initialLifeCount, initialSeed, refreshDerived]);

  useEffect(() => {
    const w = worldRef.current;
    if (w) w.params = params;
  }, [params]);

  const setSpeed = useCallback((s: Speed) => {
    speedRef.current = s;
    setSpeedState(s);
  }, []);

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
        now - lastRenderTime >= RENDER_INTERVAL_MS
      ) {
        // 補間フェーズ：直近ステップからの経過時間 / ステップ間隔。
        // v1.02: smoothAnimation=false なら補間を行わず常に 1（ステップ完了状態）に固定。
        const sinceStep = now - lastStepAtRef.current;
        const phase = paramsRef.current.smoothAnimation
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
      setSelectedLifeId(null);
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
      "averageReproductionRate",
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
          s.averageReproductionRate.toFixed(4),
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

  // v1.02: マップ全画面モード。HUD（パネル・ヘッダー・下部ボタン）を一時的に隠す。
  // F キーまたは右上ボタンでトグル、ESC で解除。
  const [fullscreenMap, setFullscreenMap] = useState(false);

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
      // v1.02: F キーでマップ全画面トグル、ESC で解除
      if (e.code === "KeyF" && !e.ctrlKey && !e.metaKey && !e.altKey) {
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSpeed]);

  // 描画スムージング用：最後にステップが完了した時刻と、目標ターン間隔。
  // 描画毎に animPhase = (now - lastStepAt) / stepDuration を計算してキャンバスへ渡す。
  const lastStepAtRef = useRef(performance.now());
  const stepDurationMsRef = useRef(250); // ×1 既定
  const [animPhase, setAnimPhase] = useState(1);

  // v1.02: 選択生命が変わったら移動軌跡をリセット
  // 一時停止中の選択解除でも確実にキャンバスから古い軌跡を消すため version も増やして再描画を強制
  useEffect(() => {
    setSelectedLifePath([]);
    setVersion((v) => v + 1);
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

  const targetTps = speed === 0 ? 0 : speed === 1 ? 4 : speed === 10 ? 30 : 150;
  const isThrottled =
    speed > 0 && targetTps > 0 && currentTps < targetTps * 0.9;
  const effectiveX = currentTps / 4;

  return (
    <>
    <div
      className={`sim-root${fullscreenMap ? " sim-fullscreen" : ""}`}
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
        style={{ maxHeight: `${columnMaxHeight}px` }}
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
                      <span className="species-label">{s.label}</span>
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
        <div
          ref={viewportRef}
          className="canvas-viewport"
          style={{
            width: `${cellSize * width}px`,
            height: `${cellSize * height}px`,
            // ズーム時のみスクロールバー出現。等倍はバー無し。
            overflow: zoom > 1 ? "auto" : "hidden",
          }}
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
              width: `${cellSize * width * zoom}px`,
              height: `${cellSize * height * zoom}px`,
            }}
          >
            {world && (
              <div
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "top left",
                  width: `${cellSize * width}px`,
                  height: `${cellSize * height}px`,
                }}
              >
                <SimulationCanvas
                  world={world}
                  cellSize={cellSize}
                  version={version}
                  animPhase={animPhase}
                  selectedLifeId={selectedLifeId}
                  selectedLifePath={selectedLifePath}
                  trackedSpeciesId={trackedSpeciesId}
                  onCellClick={handleCellClick}
                  onCellHover={handleCellHover}
                />
              </div>
            )}
          </div>
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
          {([1, 100] as const).map((s) => {
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
        style={{ maxHeight: `${columnMaxHeight}px` }}
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
                {/* 状態（2 カラム） */}
                {world && (
                  <div className="info-grid-2 info-compact">
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
                    <InfoRow
                      label={t("info.behavior_mode")}
                      value={t(`mode.${getBehaviorMode(world, selectedLife)}`)}
                    />
                  </div>
                )}
                {/* 遺伝子パラメータ（2 カラム） */}
                <h3 className="panel-subtitle">{t("panel.gene_params")}</h3>
                <div className="info-grid-2 info-compact">
                  <InfoRow
                    label={t("info.species")}
                    value={speciesLabel(selectedLife.speciesId)}
                  />
                  <InfoRow
                    label={t("info.rgb")}
                    value={`(${selectedLife.genes.r},${selectedLife.genes.g},${selectedLife.genes.b})`}
                  />
                  <InfoRow
                    label={t("info.vision")}
                    value={selectedLife.genes.vision}
                  />
                  <InfoRow
                    label={t("info.move_speed")}
                    value={selectedLife.genes.speed}
                  />
                  <InfoRow
                    label={t("info.size")}
                    value={selectedLife.genes.size.toFixed(0)}
                  />
                  <InfoRow
                    label={t("info.strength")}
                    value={`${selectedLife.genes.strength.toFixed(0)} / 999${
                      selectedLife.genes.strength > 100 ? "  ⚠" : ""
                    }`}
                  />
                  <InfoRow
                    label={t("info.intelligence")}
                    value={`${selectedLife.genes.intelligence} / 999${
                      selectedLife.genes.intelligence > 100 ? "  ⚠" : ""
                    }`}
                  />
                  <InfoRow
                    label={t("info.reproduction_rate")}
                    value={`${selectedLife.genes.reproductionRate.toFixed(2)} / 2.00${
                      selectedLife.genes.reproductionRate > 0.4 ? "  ⚠" : ""
                    }`}
                  />
                  <InfoRow
                    label={t("info.lifespan")}
                    value={selectedLife.genes.lifespan.toFixed(0)}
                  />
                </div>
                {/* v1.10: 行動判断の重み遺伝子（性格） */}
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
              </>
            ) : (
              <>
                <p className="empty-hint">{t("info.untracked")}</p>
                <p className="empty-sub">{t("info.untracked_hint")}</p>
              </>
            )
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
            {([1, 10, 100] as const).map((s) => {
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
              <div className="settings-grid">
                <div>
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
                      onChange={(v) =>
                        setParams((p) => ({ ...p, totalEnergy: v }))
                      }
                    />
                    <ParamSlider
                      label={t("settings.param.mutation_rate")}
                      value={params.mutationRateMultiplier}
                      min={0.0}
                      max={3.0}
                      step={0.05}
                      onChange={(v) =>
                        setParams((p) => ({
                          ...p,
                          mutationRateMultiplier: v,
                        }))
                      }
                    />
                    <ParamSlider
                      label={t("settings.param.wave_speed")}
                      value={params.waveSpeed}
                      min={0.0}
                      max={3.0}
                      step={0.05}
                      onChange={(v) =>
                        setParams((p) => ({ ...p, waveSpeed: v }))
                      }
                    />
                    {/* v1.10: 攻撃優位度のスライダーは廃止。掠奪率は内部定数 +
                        era.combatScale で時代ごとに変動する。 */}
                    <button
                      className="btn param-reset"
                      onClick={() => setParams(defaultSimulationParams())}
                    >
                      {t("common.reset_default")}
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
          timeRunning={statsKeepRunning}
          onToggleTime={() => setStatsKeepRunning((v) => !v)}
          tab={statsTab}
          onTabChange={setStatsTab}
          geneKey={statsGeneKey}
          onGeneKeyChange={setStatsGeneKey}
        />
      )}

      {showLog && world && (
        <ActionLogModal
          events={world.events}
          onClose={() => setShowLog(false)}
          onSpeciesClick={(id) => {
            setTrackedSpeciesId(id);
            setShowLog(false);
          }}
          timeRunning={logKeepRunning}
          onToggleTime={() => setLogKeepRunning((v) => !v)}
        />
      )}

      {showRules && <RulesScreen onClose={() => setShowRules(false)} />}

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
              backgroundColor: `rgb(${hoverInfo.life.genes.r}, ${hoverInfo.life.genes.g}, ${hoverInfo.life.genes.b})`,
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
          backgroundColor: `rgb(${life.genes.r}, ${life.genes.g}, ${life.genes.b})`,
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
    reproductionRate: true,
    lifespan: true,
  };
}

const GENE_TOGGLE_ITEMS: { key: keyof DisabledGeneFlags; tKey: string }[] = [
  { key: "rgb", tKey: "gene.rgb" },
  { key: "vision", tKey: "gene.vision" },
  { key: "speed", tKey: "gene.speed" },
  { key: "size", tKey: "gene.size" },
  { key: "strength", tKey: "gene.strength" },
  { key: "intelligence", tKey: "gene.intelligence" },
  { key: "reproductionRate", tKey: "gene.reproduction_rate" },
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
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div className="info-row">
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{value}</dd>
    </div>
  );
}

function computeTopSpecies(world: World, max = 30): SpeciesEntry[] {
  const map = new Map<
    string,
    { count: number; r: number; g: number; b: number }
  >();
  for (const life of world.lives) {
    if (!life.alive) continue;
    const cur = map.get(life.speciesId);
    if (cur) {
      cur.count++;
    } else {
      map.set(life.speciesId, {
        count: 1,
        r: life.genes.r,
        g: life.genes.g,
        b: life.genes.b,
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
    });
  }
  entries.sort((a, b) => b.count - a.count);
  return entries.slice(0, max);
}
