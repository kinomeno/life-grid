"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Life, StatsSample } from "@/lib/types";
import {
  GENE_INTELLIGENCE_MAX,
  GENE_INTELLIGENCE_MIN,
  GENE_LIFESPAN_MAX,
  GENE_LIFESPAN_MIN,
  GENE_OFFSPRING_MAX,
  GENE_OFFSPRING_MIN,
  GENE_BIRTH_THRESHOLD_MAX,
  GENE_BIRTH_THRESHOLD_MIN,
  GENE_SIZE_MAX,
  GENE_SIZE_MIN,
  GENE_SPEED_MAX,
  GENE_SPEED_MIN,
  GENE_STRENGTH_MAX,
  GENE_STRENGTH_MIN,
  GENE_VISION_MAX,
  GENE_VISION_MIN,
} from "@/lib/constants";
import { binCenterColor, speciesLabel } from "@/lib/species";
import { useLocale } from "./LocaleProvider";
import TimeToggle from "./TimeToggle";
import { useDraggablePanel, type DragOffset } from "./useDraggablePanel";

export type GraphSeriesState = {
  lifeCount: boolean;
  speciesCount: boolean;
  avgIntelligence: boolean;
  avgSpeed: boolean;
  avgStrength: boolean;
  avgLifespan: boolean;
  avgBirthThreshold: boolean;
  avgSize: boolean;
  // v1.20: 視野・出産数の時系列を追加
  avgVision: boolean;
  avgOffspringCount: boolean;
  rgb: boolean;
};

export const DEFAULT_GRAPH_SERIES: GraphSeriesState = {
  lifeCount: true,
  speciesCount: true,
  avgIntelligence: false,
  avgSpeed: false,
  avgStrength: false,
  avgLifespan: false,
  avgBirthThreshold: false,
  avgSize: false,
  avgVision: false,
  avgOffspringCount: false,
  rgb: false,
};

export type StatsTab = "timeseries" | "distribution" | "scatter";

/** 分布タブで選べる遺伝子。 */
// v1.20: mutationRate は遺伝子廃止のため削除。offspringCount を追加。
export type GeneKey =
  | "intelligence"
  | "strength"
  | "vision"
  | "speed"
  | "size"
  | "lifespan"
  | "birthThreshold"
  | "offspringCount";

type Props = {
  history: StatsSample[];
  /** 現在の生命リスト（分布タブで使用）。 */
  lives: Life[];
  enabled: GraphSeriesState;
  onChange: (next: GraphSeriesState) => void;
  onClose: () => void;
  /** v1.31: 戦略散布で系統をクリック/選択したとき（系統追跡へ）。 */
  onSpeciesClick?: (speciesId: string) => void;
  /** 時間進行 ON/OFF（true なら世界の時間が進む）。 */
  timeRunning?: boolean;
  onToggleTime?: () => void;
  /** v1.10: タブ・分布遺伝子選択の状態をモーダル外で保持し、開閉間で永続化する。 */
  tab: StatsTab;
  onTabChange: (t: StatsTab) => void;
  geneKey: GeneKey;
  onGeneKeyChange: (k: GeneKey) => void;
  // v1.20: モーダル位置記録（×で閉じても再オープン時に復元）
  initialOffset?: DragOffset;
  onOffsetChange?: (o: DragOffset) => void;
};

type Series = {
  key: string;
  tKey: string;
  color: string;
  pick: (s: StatsSample) => number;
};

const SERIES: Series[] = [
  { key: "lifeCount", tKey: "graph.life_count", color: "#444", pick: (s) => s.lifeCount },
  { key: "speciesCount", tKey: "graph.species_count", color: "#c0532e", pick: (s) => s.speciesCount },
  { key: "avgIntelligence", tKey: "graph.avg_intelligence", color: "#3a7e9f", pick: (s) => s.averageIntelligence },
  { key: "avgSpeed", tKey: "graph.avg_speed", color: "#5d9b4f", pick: (s) => s.averageSpeed },
  { key: "avgStrength", tKey: "graph.avg_strength", color: "#b04050", pick: (s) => s.averageStrength },
  { key: "avgLifespan", tKey: "graph.avg_lifespan", color: "#8a6a2e", pick: (s) => s.averageLifespan },
  { key: "avgBirthThreshold", tKey: "graph.avg_birth_threshold", color: "#9f6a3e", pick: (s) => s.averageBirthThreshold },
  { key: "avgSize", tKey: "graph.avg_size", color: "#6a3e9f", pick: (s) => s.averageSize },
  // v1.20: 視野・出産数の時系列
  { key: "avgVision", tKey: "graph.avg_vision", color: "#3a9f8e", pick: (s) => s.averageVision },
  { key: "avgOffspringCount", tKey: "graph.avg_offspring_count", color: "#b07ec0", pick: (s) => s.averageOffspringCount },
];

type GeneSpec = {
  key: GeneKey;
  tKey: string;
  min: number;
  max: number;
  bins: number;
  pick: (l: Life) => number;
  /** v1.02: true ならヒストグラムの max 軸を実データに応じて動的に伸縮する。
   *  最低 100 まで表示、ミュータントが出現すれば自動的に軸が広がる。 */
  dynamicScale?: boolean;
};

const GENES: GeneSpec[] = [
  {
    key: "intelligence",
    tKey: "info.intelligence",
    min: GENE_INTELLIGENCE_MIN,
    max: GENE_INTELLIGENCE_MAX,
    bins: 16,
    pick: (l) => l.genes.intelligence,
    dynamicScale: true,
  },
  {
    key: "strength",
    tKey: "info.strength",
    min: GENE_STRENGTH_MIN,
    max: GENE_STRENGTH_MAX,
    bins: 16,
    pick: (l) => l.genes.strength,
    dynamicScale: true,
  },
  {
    key: "vision",
    tKey: "info.vision",
    min: GENE_VISION_MIN,
    max: GENE_VISION_MAX,
    bins: GENE_VISION_MAX - GENE_VISION_MIN + 1,
    pick: (l) => l.genes.vision,
  },
  {
    key: "speed",
    tKey: "info.move_speed",
    min: GENE_SPEED_MIN,
    max: GENE_SPEED_MAX,
    bins: GENE_SPEED_MAX - GENE_SPEED_MIN + 1,
    pick: (l) => l.genes.speed,
  },
  {
    key: "size",
    tKey: "info.size",
    min: GENE_SIZE_MIN,
    max: GENE_SIZE_MAX,
    bins: 16,
    pick: (l) => l.genes.size,
  },
  {
    key: "lifespan",
    tKey: "info.lifespan",
    min: GENE_LIFESPAN_MIN,
    max: GENE_LIFESPAN_MAX,
    bins: 16,
    pick: (l) => l.genes.lifespan,
  },
  {
    key: "birthThreshold",
    tKey: "info.birth_threshold",
    min: GENE_BIRTH_THRESHOLD_MIN,
    max: GENE_BIRTH_THRESHOLD_MAX,
    bins: 16,
    pick: (l) => l.genes.birthThreshold,
  },
  // v1.20: 出産数の分布（mutationRate は遺伝子廃止のため削除）
  {
    key: "offspringCount",
    tKey: "info.offspring_count",
    min: GENE_OFFSPRING_MIN,
    max: GENE_OFFSPRING_MAX,
    bins: GENE_OFFSPRING_MAX - GENE_OFFSPRING_MIN + 1,
    pick: (l) => l.genes.offspringCount,
  },
];

export default function StatsGraphModal({
  history,
  lives,
  enabled,
  onChange,
  onClose,
  onSpeciesClick,
  timeRunning = false,
  onToggleTime,
  tab,
  onTabChange,
  geneKey,
  onGeneKeyChange,
  initialOffset,
  onOffsetChange,
}: Props) {
  const { t } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // v1.21.1: グラフ canvas をコンテナ幅にフィットさせ、モバイルでのはみ出しを防ぐ。
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [cssW, setCssW] = useState(600);
  // v1.10: tab・geneKey は親が保持。setter は親へ通知する形に。
  const setTab = onTabChange;
  const setGeneKey = onGeneKeyChange;
  // v1.11/v1.20: モーダルドラッグ + 位置記録
  const { offset, dragging, dragHandlers } = useDraggablePanel(
    initialOffset,
    onOffsetChange
  );
  // v1.10: 時系列グラフのホバー情報。マウス位置と該当サンプル。
  const [hoverInfo, setHoverInfo] = useState<{
    px: number;
    py: number;
    sample: StatsSample;
  } | null>(null);

  // v1.31: 戦略散布の「系統ごと」マーカー（重心・サイズ∝個体数・色＝種代表色）。
  // ホバー/クリックのヒットテストと描画の両方で使うため useMemo で前計算する。
  const scatterMarkers = useMemo<ScatterMarker[]>(() => {
    if (tab !== "scatter") return [];
    type Agg = {
      n: number;
      sp: number;
      it: number;
      st: number;
      cr: number;
      cg: number;
      cb: number;
    };
    const agg = new Map<string, Agg>();
    for (const l of lives) {
      if (!l.alive) continue;
      let a = agg.get(l.speciesId);
      if (!a) {
        a = {
          n: 0,
          sp: 0,
          it: 0,
          st: 0,
          cr: binCenterColor(l.genes.r),
          cg: binCenterColor(l.genes.g),
          cb: binCenterColor(l.genes.b),
        };
        agg.set(l.speciesId, a);
      }
      a.n++;
      a.sp += l.genes.speed;
      a.it += l.genes.intelligence;
      a.st += l.genes.strength;
    }
    const out: ScatterMarker[] = [];
    for (const [id, a] of agg) {
      const avgSpeed = a.sp / a.n;
      const avgIntel = a.it / a.n;
      const avgStrength = a.st / a.n;
      const { px, py } = scatterProject(avgSpeed, avgIntel, cssW);
      const r = Math.max(4, Math.min(22, 4 + Math.sqrt(a.n) * 1.6));
      out.push({
        id,
        px,
        py,
        r,
        cr: a.cr,
        cg: a.cg,
        cb: a.cb,
        count: a.n,
        avgSpeed,
        avgIntel,
        avgStrength,
      });
    }
    out.sort((p, q) => q.count - p.count); // 大きい順（描画は大→小、ヒットは小優先）
    return out;
  }, [tab, lives, cssW]);

  // v1.31: クリック/タップで開く系統フロート（persistent=タッチで固定表示）。
  const [scatterFloat, setScatterFloat] = useState<{
    id: string;
    px: number;
    py: number;
    persistent: boolean;
  } | null>(null);

  const hitScatterMarker = (px: number, py: number): ScatterMarker | null => {
    // 小さいマーカー（描画で手前）を優先してヒット判定。
    for (let i = scatterMarkers.length - 1; i >= 0; i--) {
      const m = scatterMarkers[i];
      const dx = px - m.px;
      const dy = py - m.py;
      const rr = m.r + 4;
      if (dx * dx + dy * dy <= rr * rr) return m;
    }
    return null;
  };

  // v1.21.1: 描画幅をコンテナに合わせて測定（260〜600px）。リサイズ追従。
  useEffect(() => {
    const measure = () => {
      const el = wrapRef.current;
      if (!el) return;
      const w = el.clientWidth - 2; // border 1px×2 ぶん
      setCssW(Math.max(260, Math.min(600, w)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssH = 280;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (tab === "timeseries") {
      drawChart(ctx, cssW, cssH, history, enabled, hoverInfo?.sample.turn ?? null);
    } else if (tab === "scatter") {
      drawScatter(
        ctx,
        cssW,
        cssH,
        lives,
        scatterMarkers,
        scatterFloat?.id ?? null,
        t("graph.scatter_x"),
        t("graph.scatter_y")
      );
    } else {
      const gene = GENES.find((g) => g.key === geneKey) ?? GENES[0];
      drawHistogram(ctx, cssW, cssH, lives, gene);
    }
  }, [
    tab,
    history,
    enabled,
    lives,
    geneKey,
    hoverInfo,
    scatterMarkers,
    scatterFloat,
    cssW,
    t,
  ]);

  // タブ切替時はホバー/フロートをクリア
  useEffect(() => {
    if (tab !== "timeseries") setHoverInfo(null);
    if (tab !== "scatter") setScatterFloat(null);
  }, [tab]);

  function handleCanvasMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (tab === "scatter") {
      // PC のマウスホバー。タッチで固定表示中は維持する。
      if (scatterFloat?.persistent) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const m = hitScatterMarker(e.clientX - rect.left, e.clientY - rect.top);
      if (m) setScatterFloat({ id: m.id, px: m.px, py: m.py, persistent: false });
      else if (scatterFloat) setScatterFloat(null);
      return;
    }
    if (tab !== "timeseries" || history.length < 2) {
      if (hoverInfo) setHoverInfo(null);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const padL = 36;
    const padR = 12;
    const innerW = rect.width - padL - padR;
    if (px < padL - 2 || px > padL + innerW + 2) {
      if (hoverInfo) setHoverInfo(null);
      return;
    }
    const turnMin = history[0].turn;
    const turnMax = history[history.length - 1].turn;
    const ratio = (px - padL) / innerW;
    const targetTurn = turnMin + ratio * (turnMax - turnMin);
    // 二分探索で最も近いサンプルを取得
    let lo = 0;
    let hi = history.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (history[mid].turn < targetTurn) lo = mid + 1;
      else hi = mid;
    }
    const candidates = [
      history[Math.max(0, lo - 1)],
      history[lo],
      history[Math.min(history.length - 1, lo + 1)],
    ];
    let best = candidates[0];
    let bestDiff = Math.abs(best.turn - targetTurn);
    for (const c of candidates) {
      const d = Math.abs(c.turn - targetTurn);
      if (d < bestDiff) {
        bestDiff = d;
        best = c;
      }
    }
    setHoverInfo({ px, py, sample: best });
  }

  function handleCanvasLeave() {
    setHoverInfo(null);
    if (scatterFloat && !scatterFloat.persistent) setScatterFloat(null);
  }

  // v1.31: クリック/タップ。PCマウス＝即・系統選択。タッチ＝フロート固定（中の選択ボタンで確定）。
  function handleScatterPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tab !== "scatter") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const m = hitScatterMarker(e.clientX - rect.left, e.clientY - rect.top);
    if (!m) {
      setScatterFloat(null);
      return;
    }
    if (e.pointerType === "touch") {
      setScatterFloat({ id: m.id, px: m.px, py: m.py, persistent: true });
    } else {
      onSpeciesClick?.(m.id);
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel modal-wide"
        onClick={(e) => e.stopPropagation()}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <div
          className="modal-head modal-draggable"
          data-dragging={dragging}
          {...dragHandlers}
        >
          <h2 className="modal-title">{t("graph.title")}</h2>
          {onToggleTime && (
            <TimeToggle running={timeRunning} onToggle={onToggleTime} />
          )}
          <button className="btn modal-close" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>

        <section className="modal-section">
          <div className="graph-tabs">
            <button
              className={`btn ${tab === "timeseries" ? "btn-active" : ""}`}
              onClick={() => setTab("timeseries")}
            >
              {t("graph.tab.timeseries")}
            </button>
            <button
              className={`btn ${tab === "distribution" ? "btn-active" : ""}`}
              onClick={() => setTab("distribution")}
            >
              {t("graph.tab.distribution")}
            </button>
            <button
              className={`btn ${tab === "scatter" ? "btn-active" : ""}`}
              onClick={() => setTab("scatter")}
            >
              {t("graph.tab.scatter")}
            </button>
          </div>

          {tab === "timeseries" && (
            <div className="graph-actions">
              <button
                className="btn"
                onClick={() =>
                  onChange({
                    lifeCount: true,
                    speciesCount: true,
                    avgIntelligence: true,
                    avgSpeed: true,
                    avgStrength: true,
                    avgLifespan: true,
                    avgBirthThreshold: true,
                    avgSize: true,
                    avgVision: true,
                    avgOffspringCount: true,
                    rgb: true,
                  })
                }
              >
                {t("graph.all_on")}
              </button>
              <button
                className="btn"
                onClick={() =>
                  onChange({
                    lifeCount: false,
                    speciesCount: false,
                    avgIntelligence: false,
                    avgSpeed: false,
                    avgStrength: false,
                    avgLifespan: false,
                    avgBirthThreshold: false,
                    avgSize: false,
                    avgVision: false,
                    avgOffspringCount: false,
                    rgb: false,
                  })
                }
              >
                {t("graph.all_off")}
              </button>
            </div>
          )}

          {tab === "timeseries" && (
            <div className="graph-checks">
              {SERIES.map((s) => (
                <label key={s.key} className="graph-check">
                  <input
                    type="checkbox"
                    checked={
                      (enabled as unknown as Record<string, boolean>)[s.key] ??
                      false
                    }
                    onChange={(e) =>
                      onChange({
                        ...enabled,
                        [s.key]: e.target.checked,
                      } as GraphSeriesState)
                    }
                  />
                  <span
                    className="graph-swatch"
                    style={{ backgroundColor: s.color }}
                  />
                  <span>{t(s.tKey)}</span>
                </label>
              ))}
              <label className="graph-check">
                <input
                  type="checkbox"
                  checked={enabled.rgb}
                  onChange={(e) =>
                    onChange({ ...enabled, rgb: e.target.checked })
                  }
                />
                <span className="graph-swatch graph-swatch-rgb" />
                <span>{t("graph.rgb")}</span>
              </label>
            </div>
          )}

          {tab === "distribution" && (
            <div className="graph-dist-controls">
              <label className="graph-dist-label">
                {t("graph.dist.gene")}:
              </label>
              <select
                className="seed-input"
                value={geneKey}
                onChange={(e) => setGeneKey(e.target.value as GeneKey)}
              >
                {GENES.map((g) => (
                  <option key={g.key} value={g.key}>
                    {t(g.tKey)}
                  </option>
                ))}
              </select>
              <span className="graph-dist-meta">
                ({lives.length.toLocaleString()})
              </span>
            </div>
          )}

          <div
            ref={wrapRef}
            className="graph-canvas-wrap"
            style={{ position: "relative" }}
          >
            <canvas
              ref={canvasRef}
              className="graph-canvas"
              onMouseMove={handleCanvasMove}
              onMouseLeave={handleCanvasLeave}
              onPointerUp={handleScatterPointer}
              style={tab === "scatter" ? { cursor: "pointer" } : undefined}
            />
            {hoverInfo && tab === "timeseries" && (
              <div
                className="graph-tooltip"
                style={{
                  position: "absolute",
                  left: Math.max(8, Math.min(hoverInfo.px + 12, cssW - 200)),
                  top: Math.max(8, hoverInfo.py - 100),
                  pointerEvents: "none",
                }}
              >
                <div className="graph-tooltip-turn">
                  {t("info.turn")}: {hoverInfo.sample.turn.toLocaleString()}
                </div>
                {SERIES.filter(
                  (s) =>
                    (enabled as unknown as Record<string, boolean>)[s.key]
                ).map((s) => (
                  <div key={s.key} className="graph-tooltip-row">
                    <span
                      className="graph-swatch"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="graph-tooltip-label">{t(s.tKey)}</span>
                    <span className="graph-tooltip-value">
                      {formatTooltipValue(s.pick(hoverInfo.sample))}
                    </span>
                  </div>
                ))}
                {enabled.rgb && (
                  <>
                    <div className="graph-tooltip-row">
                      <span
                        className="graph-swatch"
                        style={{ backgroundColor: "#c44" }}
                      />
                      <span className="graph-tooltip-label">R</span>
                      <span className="graph-tooltip-value">
                        {hoverInfo.sample.avgR.toFixed(0)}
                      </span>
                    </div>
                    <div className="graph-tooltip-row">
                      <span
                        className="graph-swatch"
                        style={{ backgroundColor: "#4a4" }}
                      />
                      <span className="graph-tooltip-label">G</span>
                      <span className="graph-tooltip-value">
                        {hoverInfo.sample.avgG.toFixed(0)}
                      </span>
                    </div>
                    <div className="graph-tooltip-row">
                      <span
                        className="graph-swatch"
                        style={{ backgroundColor: "#46a" }}
                      />
                      <span className="graph-tooltip-label">B</span>
                      <span className="graph-tooltip-value">
                        {hoverInfo.sample.avgB.toFixed(0)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
            {scatterFloat && tab === "scatter" && (() => {
              const m = scatterMarkers.find((x) => x.id === scatterFloat.id);
              if (!m) return null;
              return (
                <div
                  className="graph-tooltip"
                  style={{
                    position: "absolute",
                    left: Math.max(8, Math.min(scatterFloat.px + 12, cssW - 168)),
                    top: Math.max(8, Math.min(scatterFloat.py - 30, SC_H - 150)),
                    pointerEvents: scatterFloat.persistent ? "auto" : "none",
                  }}
                >
                  <div
                    className="graph-tooltip-turn"
                    style={{ display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <span
                      className="graph-swatch"
                      style={{ backgroundColor: `rgb(${m.cr},${m.cg},${m.cb})` }}
                    />
                    {speciesLabel(m.id)}
                  </div>
                  <div className="graph-tooltip-row">
                    <span className="graph-tooltip-label">{t("graph.pop")}</span>
                    <span className="graph-tooltip-value">
                      {m.count.toLocaleString()}
                    </span>
                  </div>
                  <div className="graph-tooltip-row">
                    <span className="graph-tooltip-label">
                      {t("info.move_speed")}
                    </span>
                    <span className="graph-tooltip-value">
                      {m.avgSpeed.toFixed(0)}
                    </span>
                  </div>
                  <div className="graph-tooltip-row">
                    <span className="graph-tooltip-label">
                      {t("info.intelligence")}
                    </span>
                    <span className="graph-tooltip-value">
                      {m.avgIntel.toFixed(0)}
                    </span>
                  </div>
                  <div className="graph-tooltip-row">
                    <span className="graph-tooltip-label">
                      {t("info.strength")}
                    </span>
                    <span className="graph-tooltip-value">
                      {m.avgStrength.toFixed(0)}
                    </span>
                  </div>
                  {scatterFloat.persistent && onSpeciesClick && (
                    <button
                      className="btn graph-float-btn"
                      onClick={() => {
                        onSpeciesClick(m.id);
                        onClose();
                      }}
                    >
                      {t("graph.select_species")}
                    </button>
                  )}
                </div>
              );
            })()}
          </div>

          {tab === "timeseries" && history.length === 0 && (
            <p className="empty-sub">{t("graph.empty_hint")}</p>
          )}
          {tab === "distribution" && lives.length === 0 && (
            <p className="empty-sub">{t("graph.dist.empty")}</p>
          )}
        </section>
      </div>
    </div>
  );
}

function formatTooltipValue(v: number): string {
  if (v === 0) return "0";
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

/**
 * v1.30 (H5): 戦略空間スキャッタ図。x=速度, y=知能、点＝生存個体（色＝種代表色）。
 * クラスタ＝ニッチ、拡散＝多様性が一目で分かる。
 */
// v1.31: 戦略散布の投影（速度×知能 → キャンバス座標）。memo と drawScatter で共有する。
const SC_PADL = 40;
const SC_PADR = 14;
const SC_PADT = 14;
const SC_PADB = 28;
const SC_XMAX = 120; // 速度（通常0-100＋少し）
const SC_YMAX = 150; // 知能（accuracy 飽和の 150）
const SC_H = 280; // 散布図の描画高さ（effect の cssH と一致させる）

type ScatterMarker = {
  id: string;
  px: number;
  py: number;
  r: number;
  cr: number;
  cg: number;
  cb: number;
  count: number;
  avgSpeed: number;
  avgIntel: number;
  avgStrength: number;
};

function scatterProject(
  speed: number,
  intel: number,
  cssW: number
): { px: number; py: number } {
  const innerW = cssW - SC_PADL - SC_PADR;
  const innerH = SC_H - SC_PADT - SC_PADB;
  const sx = Math.min(speed, SC_XMAX) / SC_XMAX;
  const sy = Math.min(intel, SC_YMAX) / SC_YMAX;
  return { px: SC_PADL + sx * innerW, py: SC_PADT + innerH - sy * innerH };
}

function drawScatter(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  lives: Life[],
  markers: ScatterMarker[],
  hoveredId: string | null,
  xLabel: string,
  yLabel: string
) {
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(0, 0, cssW, cssH);
  const padL = SC_PADL;
  const padR = SC_PADR;
  const padT = SC_PADT;
  const padB = SC_PADB;
  const innerW = cssW - padL - padR;
  const innerH = cssH - padT - padB;
  const xMax = SC_XMAX;
  const yMax = SC_YMAX;
  // グリッド＋目盛
  ctx.font = "10px sans-serif";
  for (let i = 0; i <= 3; i++) {
    const gx = padL + (i / 3) * innerW;
    const gy = padT + innerH - (i / 3) * innerH;
    ctx.strokeStyle = "#ececec";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx, padT);
    ctx.lineTo(gx, padT + innerH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(padL + innerW, gy);
    ctx.stroke();
    ctx.fillStyle = "#aaa";
    ctx.fillText(String(Math.round((i / 3) * xMax)), gx - 6, padT + innerH + 13);
    ctx.fillText(String(Math.round((i / 3) * yMax)), 6, gy + 3);
  }
  ctx.strokeStyle = "#ddd";
  ctx.strokeRect(padL, padT, innerW, innerH);
  // 背景：個体点（種代表色・ごく薄く）。種内の広がりをテクスチャとして見せる。
  let n = 0;
  for (const l of lives) {
    if (!l.alive) continue;
    n++;
    const { px, py } = scatterProject(l.genes.speed, l.genes.intelligence, cssW);
    ctx.fillStyle = `rgba(${binCenterColor(l.genes.r)},${binCenterColor(
      l.genes.g
    )},${binCenterColor(l.genes.b)},0.16)`;
    ctx.beginPath();
    ctx.arc(px, py, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // 系統マーカー（重心・サイズ∝個体数）。大→小の順に描き、小さい種を手前に。
  for (const m of markers) {
    ctx.beginPath();
    ctx.arc(m.px, m.py, m.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${m.cr},${m.cg},${m.cb},0.9)`;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.stroke();
    if (m.id === hoveredId) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(30,30,30,0.85)";
      ctx.beginPath();
      ctx.arc(m.px, m.py, m.r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // 軸ラベル
  ctx.fillStyle = "#555";
  ctx.font = "11px sans-serif";
  ctx.fillText(xLabel, padL + innerW / 2 - 12, cssH - 4);
  ctx.save();
  ctx.translate(11, padT + innerH / 2 + 12);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
  ctx.fillStyle = "#999";
  ctx.font = "10px sans-serif";
  ctx.fillText(`n=${n} (${markers.length})`, padL + innerW - 70, padT + 12);
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  history: StatsSample[],
  enabled: GraphSeriesState,
  hoverTurn: number | null = null
) {
  const flags = enabled as unknown as Record<string, boolean>;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#ddd";
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

  if (history.length < 2) return;

  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const turnMin = history[0].turn;
  const turnMax = history[history.length - 1].turn;
  const turnRange = Math.max(1, turnMax - turnMin);

  const xAt = (turn: number) =>
    padL + ((turn - turnMin) / turnRange) * innerW;

  ctx.strokeStyle = "#aaa";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT + innerH);
  ctx.lineTo(padL + innerW, padT + innerH);
  ctx.stroke();
  ctx.fillStyle = "#666";
  ctx.font = "10px sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(`${turnMin}`, padL, padT + innerH + 6);
  ctx.textAlign = "right";
  ctx.fillText(`${turnMax}`, padL + innerW, padT + innerH + 6);
  ctx.textAlign = "left";

  for (const s of SERIES) {
    if (!flags[s.key]) continue;
    const values = history.map((h) => s.pick(h));
    let maxV = 0;
    for (const v of values) if (v > maxV) maxV = v;
    if (maxV <= 0) continue;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const x = xAt(history[i].turn);
      const y = padT + innerH - (values[i] / maxV) * innerH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  if (flags.rgb) {
    for (let chan = 0; chan < 3; chan++) {
      const color = chan === 0 ? "#c44" : chan === 1 ? "#4a4" : "#46a";
      const pick = (s: StatsSample) =>
        chan === 0 ? s.avgR : chan === 1 ? s.avgG : s.avgB;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const x = xAt(history[i].turn);
        const y = padT + innerH - (pick(history[i]) / 255) * innerH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // v1.10: ホバー位置に縦線を描画
  if (hoverTurn !== null) {
    const x = xAt(hoverTurn);
    ctx.strokeStyle = "rgba(40, 40, 40, 0.45)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + innerH);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawHistogram(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lives: Life[],
  gene: GeneSpec
) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#ddd";
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  if (lives.length === 0) return;

  // v1.02: dynamicScale なら実データの max に応じて軸を伸縮する
  let effectiveMax = gene.max;
  if (gene.dynamicScale) {
    let observedMax = 0;
    for (const l of lives) {
      if (!l.alive) continue;
      const v = gene.pick(l);
      if (v > observedMax) observedMax = v;
    }
    // 最低 100 までは表示、それを超えるなら 50 単位で切り上げ
    effectiveMax = Math.max(100, Math.ceil(observedMax / 50) * 50);
    // gene.max（999 など）を絶対上限とする
    if (effectiveMax > gene.max) effectiveMax = gene.max;
  }

  // bin 集計
  const counts = new Array(gene.bins).fill(0) as number[];
  const range = effectiveMax - gene.min;
  for (const l of lives) {
    if (!l.alive) continue;
    const v = gene.pick(l);
    const ratio = Math.max(0, Math.min(0.9999, (v - gene.min) / range));
    const idx = Math.floor(ratio * gene.bins);
    counts[idx]++;
  }
  let maxCount = 0;
  for (const c of counts) if (c > maxCount) maxCount = c;
  if (maxCount === 0) return;

  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const barGap = 2;
  const barW = (innerW - (gene.bins - 1) * barGap) / gene.bins;

  // 軸
  ctx.strokeStyle = "#aaa";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + innerH);
  ctx.lineTo(padL + innerW, padT + innerH);
  ctx.stroke();

  // Y軸ラベル（最大値）
  ctx.fillStyle = "#666";
  ctx.font = "10px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.fillText(`${maxCount}`, padL - 4, padT + 6);
  ctx.fillText(`0`, padL - 4, padT + innerH);

  // X軸ラベル（min, max）— effectiveMax を使う（dynamicScale なら実データに追随）
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const minLabel = formatVal(gene.min, gene.key);
  const maxLabel = formatVal(effectiveMax, gene.key);
  ctx.fillText(minLabel, padL, padT + innerH + 6);
  ctx.textAlign = "right";
  ctx.fillText(maxLabel, padL + innerW, padT + innerH + 6);

  // バー
  for (let i = 0; i < gene.bins; i++) {
    const c = counts[i];
    if (c === 0) continue;
    const barH = (c / maxCount) * innerH;
    const x = padL + i * (barW + barGap);
    const y = padT + innerH - barH;
    ctx.fillStyle = "#3a7e9f";
    ctx.fillRect(x, y, barW, barH);
  }
}

function formatVal(v: number, key: GeneKey): string {
  // v1.20: 出産閾値・その他はすべて整数表示
  void key;
  return `${Math.round(v)}`;
}
