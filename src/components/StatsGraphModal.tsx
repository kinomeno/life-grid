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

/** 分布タブで選べる遺伝子。 */
type GeneKey =
  | "intelligence"
  | "strength"
  | "vision"
  | "speed"
  | "size"
  | "lifespan"
  | "reproductionRate"
  | "mutationRate";

type GeneSpec = {
  key: GeneKey;
  tKey: string;
  min: number;
  max: number;
  bins: number;
  pick: (l: Life) => number;
};

const GENES: GeneSpec[] = [
  {
    key: "intelligence",
    tKey: "info.intelligence",
    min: GENE_INTELLIGENCE_MIN,
    max: GENE_INTELLIGENCE_MAX,
    bins: 10,
    pick: (l) => l.genes.intelligence,
  },
  {
    key: "strength",
    tKey: "info.strength",
    min: GENE_STRENGTH_MIN,
    max: GENE_STRENGTH_MAX,
    bins: 14,
    pick: (l) => l.genes.strength,
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
  {
    key: "mutationRate",
    tKey: "info.mutation_rate",
    min: GENE_MUTATION_MIN,
    max: GENE_MUTATION_MAX,
    bins: 12,
    pick: (l) => l.genes.mutationRate,
  },
];

type Tab = "timeseries" | "distribution";

export default function StatsGraphModal({
  history,
  lives,
  enabled,
  onChange,
  onClose,
  timeRunning = false,
  onToggleTime,
}: Props) {
  const { t } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tab, setTab] = useState<Tab>("timeseries");
  const [geneKey, setGeneKey] = useState<GeneKey>("intelligence");

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
      drawChart(ctx, cssW, cssH, history, enabled);
    } else {
      const gene = GENES.find((g) => g.key === geneKey) ?? GENES[0];
      drawHistogram(ctx, cssW, cssH, lives, gene);
    }
  }, [tab, history, enabled, lives, geneKey]);

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

          <div className="graph-canvas-wrap">
            <canvas ref={canvasRef} className="graph-canvas" />
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

function drawChart(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  history: StatsSample[],
  enabled: GraphSeriesState
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

  // bin 集計
  const counts = new Array(gene.bins).fill(0) as number[];
  const range = gene.max - gene.min;
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

  // X軸ラベル（min, max）
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const minLabel = formatVal(gene.min, gene.key);
  const maxLabel = formatVal(gene.max, gene.key);
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
