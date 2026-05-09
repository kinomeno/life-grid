"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SimulationCanvas from "./SimulationCanvas";
import { computeStats, type WorldStats } from "@/lib/stats";
import { randomSeed } from "@/lib/random";
import { createWorld, stepWorld } from "@/lib/world";
import { speciesLabel } from "@/lib/species";
import type { World } from "@/lib/types";

type Props = {
  width: number;
  height: number;
  initialLifeCount: number;
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
}: Props) {
  const cellSize = useMemo(() => {
    const maxPx = 720;
    const fit = Math.floor(maxPx / Math.max(width, height));
    return Math.max(2, Math.min(8, fit));
  }, [width, height]);

  const [seed, setSeed] = useState<number | null>(null);
  const worldRef = useRef<World | null>(null);

  const [version, setVersion] = useState(0);
  const [stats, setStats] = useState<WorldStats>({
    turn: 0,
    lifeCount: 0,
    speciesCount: 0,
    averageEnergy: 0,
    averageIntelligence: 0,
    averageSpeed: 0,
  });
  const [topSpecies, setTopSpecies] = useState<SpeciesEntry[]>([]);
  const [speed, setSpeedState] = useState<Speed>(0);
  const speedRef = useRef<Speed>(0);
  const [currentTps, setCurrentTps] = useState(0);

  const refreshDerived = useCallback((w: World) => {
    setStats(computeStats(w));
    setTopSpecies(computeTopSpecies(w));
  }, []);

  useEffect(() => {
    if (worldRef.current !== null) return;
    const s = randomSeed();
    const w = createWorld({ width, height, initialLifeCount, seed: s });
    worldRef.current = w;
    setSeed(s);
    refreshDerived(w);
    setVersion((v) => v + 1);
  }, [width, height, initialLifeCount, refreshDerived]);

  const setSpeed = useCallback((s: Speed) => {
    speedRef.current = s;
    setSpeedState(s);
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let stepsSinceTpsUpdate = 0;
    let tpsWindowStart = performance.now();
    const FRAME_BUDGET_MS = 25;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const s = speedRef.current;
      const world = worldRef.current;
      if (s > 0 && world) {
        const targetTps = s === 1 ? 4 : s === 10 ? 30 : 150;
        acc += (dt / 1000) * targetTps;
        const requestedSteps = Math.floor(acc);
        acc -= requestedSteps;
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
          setVersion((v) => v + 1);
          refreshDerived(world);
        }
      } else {
        acc = 0;
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
      });
      worldRef.current = w;
      setSeed(newSeed);
      setVersion((v) => v + 1);
      refreshDerived(w);
    },
    [width, height, initialLifeCount, refreshDerived]
  );

  const stepOnce = useCallback(() => {
    setSpeed(0);
    const world = worldRef.current;
    if (world) {
      stepWorld(world);
      setVersion((v) => v + 1);
      refreshDerived(world);
    }
  }, [setSpeed, refreshDerived]);

  const world = worldRef.current;

  return (
    <div className="sim-root">
      <div className="tps-display">
        <span className="tps-label">turn/s</span>
        <span className="tps-value">{currentTps.toFixed(1)}</span>
      </div>
      <aside className="sim-cell sim-left">
        <section className="panel">
          <h2 className="panel-title">全体情報</h2>
          <dl className="info-list">
            <InfoRow label="ターン" value={stats.turn.toLocaleString()} />
            <InfoRow label="時代" value="—" />
            <InfoRow label="総生物数" value={stats.lifeCount.toLocaleString()} />
            <InfoRow label="系統数" value={String(stats.speciesCount)} />
            <InfoRow
              label="平均エネルギー"
              value={stats.averageEnergy.toFixed(1)}
            />
            <InfoRow
              label="平均知能"
              value={stats.averageIntelligence.toFixed(2)}
            />
            <InfoRow
              label="平均移動速度"
              value={stats.averageSpeed.toFixed(2)}
            />
          </dl>
        </section>

        <section className="panel">
          <h2 className="panel-title">系統（上位）</h2>
          <ul className="species-list">
            {topSpecies.length === 0 && (
              <li className="species-empty">—</li>
            )}
            {topSpecies.map((s) => (
              <li key={s.id} className="species-item">
                <span
                  className="species-dot"
                  style={{
                    backgroundColor: `rgb(${s.r}, ${s.g}, ${s.b})`,
                  }}
                />
                <span className="species-label">{s.label}</span>
                <span className="species-count">{s.count}</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <main className="sim-cell sim-center">
        <div className="canvas-wrap">
          {world && (
            <SimulationCanvas
              world={world}
              cellSize={cellSize}
              version={version}
            />
          )}
        </div>
      </main>

      <aside className="sim-cell sim-right">
        <section className="panel">
          <h2 className="panel-title">選択した生命</h2>
          <p className="empty-hint">未選択</p>
          <p className="empty-sub">
            マップ上の生命をクリックすると詳細を表示します（次バージョンで実装予定）
          </p>
        </section>
      </aside>

      <footer className="sim-cell sim-bottom">
        <div className="ctrl-bar">
          <div className="ctrl-group">
            <button
              className={`btn ${speed === 0 ? "btn-primary" : ""}`}
              onClick={() => setSpeed(speed === 0 ? 1 : 0)}
            >
              {speed === 0 ? "▶ 再生" : "⏸ 一時停止"}
            </button>
            <button className="btn" onClick={stepOnce}>
              ターン進む
            </button>
          </div>
          <div className="ctrl-group">
            {([1, 10, 100] as const).map((s) => (
              <button
                key={s}
                className={`btn ${speed === s ? "btn-active" : ""}`}
                onClick={() => setSpeed(s)}
              >
                x{s}
              </button>
            ))}
          </div>
          <div className="ctrl-spacer" />
          <div className="world-info">
            <span className="world-info-item">
              <span className="world-info-label">シード</span>
              <span className="world-info-value">{seed ?? "—"}</span>
            </span>
            <span className="world-info-item">
              <span className="world-info-label">マップ</span>
              <span className="world-info-value">
                {width} × {height}
              </span>
            </span>
          </div>
          <div className="ctrl-group">
            <button
              className="btn"
              onClick={() => seed !== null && reset(seed)}
            >
              RESET
            </button>
            <button className="btn" onClick={() => reset(randomSeed())}>
              NEW SEED
            </button>
          </div>
        </div>
      </footer>
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

function computeTopSpecies(world: World, max = 10): SpeciesEntry[] {
  const map = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (const life of world.lives) {
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
