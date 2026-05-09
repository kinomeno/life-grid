"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SimulationCanvas from "./SimulationCanvas";
import { computeStats, type WorldStats } from "@/lib/stats";
import { randomSeed } from "@/lib/random";
import { createWorld, stepWorld } from "@/lib/world";
import type { World } from "@/lib/types";

type Props = {
  width: number;
  height: number;
  initialLifeCount: number;
};

type Speed = 0 | 1 | 10 | 100;

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
  const [speed, setSpeedState] = useState<Speed>(0);
  const speedRef = useRef<Speed>(0);

  useEffect(() => {
    if (worldRef.current !== null) return;
    const s = randomSeed();
    const w = createWorld({ width, height, initialLifeCount, seed: s });
    worldRef.current = w;
    setSeed(s);
    setStats(computeStats(w));
    setVersion((v) => v + 1);
  }, [width, height, initialLifeCount]);

  const setSpeed = useCallback((s: Speed) => {
    speedRef.current = s;
    setSpeedState(s);
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const s = speedRef.current;
      const world = worldRef.current;
      if (s > 0 && world) {
        const tps = s === 1 ? 12 : s === 10 ? 60 : 240;
        acc += (dt / 1000) * tps;
        let steps = Math.floor(acc);
        acc -= steps;
        if (steps > 0) {
          if (steps > 600) steps = 600;
          for (let i = 0; i < steps; i++) {
            stepWorld(world);
            if (world.lives.length === 0) break;
          }
          setVersion((v) => v + 1);
          setStats(computeStats(world));
        }
      } else {
        acc = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

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
      setStats(computeStats(w));
    },
    [width, height, initialLifeCount]
  );

  const stepOnce = useCallback(() => {
    setSpeed(0);
    const world = worldRef.current;
    if (world) {
      stepWorld(world);
      setVersion((v) => v + 1);
      setStats(computeStats(world));
    }
  }, [setSpeed]);

  const world = worldRef.current;

  return (
    <div className="sim-root">
      <aside className="sim-side sim-side-left">
        <section className="panel">
          <h2 className="panel-title">全体情報</h2>
          <dl className="info-list">
            <div className="info-row">
              <dt>TURN</dt>
              <dd>{stats.turn.toLocaleString()}</dd>
            </div>
            <div className="info-row">
              <dt>LIFE COUNT</dt>
              <dd>{stats.lifeCount.toLocaleString()}</dd>
            </div>
            <div className="info-row">
              <dt>SPECIES COUNT</dt>
              <dd>{stats.speciesCount}</dd>
            </div>
            <div className="info-row">
              <dt>AVG ENERGY</dt>
              <dd>{stats.averageEnergy.toFixed(1)}</dd>
            </div>
            <div className="info-row">
              <dt>AVG INTELLIGENCE</dt>
              <dd>{stats.averageIntelligence.toFixed(2)}</dd>
            </div>
            <div className="info-row">
              <dt>AVG SPEED</dt>
              <dd>{stats.averageSpeed.toFixed(2)}</dd>
            </div>
            <div className="info-row">
              <dt>WORLD SEED</dt>
              <dd className="mono">{seed ?? "—"}</dd>
            </div>
          </dl>
        </section>
      </aside>

      <main className="sim-main">
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

      <aside className="sim-side sim-side-right">
        <section className="panel">
          <h2 className="panel-title">システム</h2>
          <div className="ctrl-row">
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
          <div className="ctrl-row">
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
          <div className="ctrl-row">
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
        </section>
      </aside>
    </div>
  );
}
