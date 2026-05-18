"use client";

import { useEffect, useRef, useState } from "react";
import type { Life, StatsSample } from "@/lib/types";
import {
  GENE_INTELLIGENCE_MAX,
  GENE_INTELLIGENCE_MIN,
  GENE_LIFESPAN_MAX,
  GENE_LIFESPAN_MIN,
  GENE_MUTATION_MAX,
  GENE_MUTATION_MIN,
  GENE_REPRODUCTION_MAX,
  GENE_REPRODUCTION_MIN,
  GENE_SIZE_MAX,
  GENE_SIZE_MIN,
  GENE_SPEED_MAX,
  GENE_SPEED_MIN,
  GENE_STRENGTH_MAX,
  GENE_STRENGTH_MIN,
  GENE_VISION_MAX,
  GENE_VISION_MIN,
} from "@/lib/constants";
import { useLocale } from "./LocaleProvider";

export type GraphSeriesState = {
  lifeCount: boolean;
  speciesCount: boolean;
  avgIntelligence: boolean;
  avgSpeed: boolean;
  avgStrength: boolean;
  avgLifespan: boolean;
  avgReproductionRate: boolean;
  avgSize: boolean;
  rgb: boolean;
};

export const DEFAULT_GRAPH_SERIES: GraphSeriesState = {
  lifeCount: true,
  speciesCount: true,
  avgIntelligence: false,
  avgSpeed: false,
  avgStrength: false,
  avgLifespan: false,
  avgReproductionRate: false,
  avgSize: false,
  rgb: false,
};

export type StatsTab = "timeseries" | "distribution";

/** 分布タブで選べる遺伝子。 */
export type GeneKey =
  | "intelligence"
  | "strength"
  | "vision"
  | "speed"
  | "size"
  | "lifespan"
  | "reproductionRate"
  | "mutationRate";

type Props = {
  history: StatsSample[];
  /** 現在の生命リスト（分布タブで使用）。 */
  lives: Life[];
  enabled: GraphSeriesState;
  onChange: (next: GraphSeriesState) => void;
  onClose: () => void;
  /** 時間進行 ON/OFF（true なら世界の時間が進む）。 */
  timeRunning?: boolean;
  onToggleTime?: () => void;
  /** v1.10: タブ・分布遺伝子選択の状態をモーダル外で保持し、開閉間で永続化する。 */
  tab: StatsTab;
  onTabChange: (t: StatsTab) => void;
  geneKey: GeneKey;
  onGeneKeyChange: (k: GeneKey) => void;
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
  { key: "avgReproductionRate", tKey: "graph.avg_reproduction_rate", color: "#9f6a3e", pick: (s) => s.averageReproductionRate },
  { key: "avgSize", tKey: "graph.avg_size", color: "#6a3e9f", pick: (s) => s.averageSize },
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
    key: "reproductionRate",
    tKey: "info.reproduction_rate",
    min: GENE_REPRODUCTION_MIN,
    max: GENE_REPRODUCTION_MAX,
    bins: 12,
    pick: (l) => l.genes.reproductionRate,
  },
];

export default function StatsGraphModal({
  history,
  lives,
  enabled,
  onChange,
  onClose,
  timeRunning = false,
  onToggleTime,
  tab,
  onTabChange,
  geneKey,
  onGeneKeyChange,
}: Props) {
  const { t } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // v1.10: tab・geneKey は親が保持。setter は親へ通知する形に。
  const setTab = onTabChange;
  const setGeneKey = onGeneKeyChange;
  // v1.10: 時系列グラフのホバー情報。マウス位置と該当サンプル。
  const [hoverInfo, setHoverInfo] = useState<{
    px: number;
    py: number;
    sample: StatsSample;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = 600;
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
    } else {
      const gene = GENES.find((g) => g.key === geneKey) ?? GENES[0];
      drawHistogram(ctx, cssW, cssH, lives, gene);
    }
  }, [tab, history, enabled, lives, geneKey, hoverInfo]);

  // タブ切替・分布時はホバーをクリア
  useEffect(() => {
    if (tab !== "timeseries") setHoverInfo(null);
  }, [tab]);

  function handleCanvasMove(e: React.MouseEvent<HTMLCanvasElement>) {
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
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel modal-wide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title">{t("graph.title")}</h2>
          {onToggleTime && (
            <button
              className={`btn modal-time-toggle ${
                timeRunning ? "modal-time-on" : ""
              }`}
              onClick={onToggleTime}
              title={t("modal.time_hint")}
            >
              {timeRunning ? t("modal.time_on") : t("modal.time_off")}
            </button>
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
                    avgReproductionRate: true,
                    avgSize: true,
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
                    avgReproductionRate: false,
                    avgSize: false,
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

          <div className="graph-canvas-wrap" style={{ position: "relative" }}>
            <canvas
              ref={canvasRef}
              className="graph-canvas"
              onMouseMove={handleCanvasMove}
              onMouseLeave={handleCanvasLeave}
            />
            {hoverInfo && tab === "timeseries" && (
              <div
                className="graph-tooltip"
                style={{
                  position: "absolute",
                  left: Math.min(hoverInfo.px + 12, 600 - 200),
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
  if (key === "reproductionRate") return v.toFixed(2);
  if (key === "mutationRate") return v.toFixed(3);
  return `${Math.round(v)}`;
}
