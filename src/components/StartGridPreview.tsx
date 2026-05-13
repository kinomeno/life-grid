"use client";

import { useEffect, useRef } from "react";

/**
 * 3×3 のミニグリッド。1〜2 個の生命がランダムに移動し続ける。
 * 開始画面のビジュアルとして使用。
 */
export default function StartGridPreview() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cell = 19;
    const grid = 3;
    const cssSize = cell * grid;
    canvas.width = cssSize * dpr;
    canvas.height = cssSize * dpr;
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    type Mover = {
      x: number;
      y: number;
      r: number;
      g: number;
      b: number;
      lastMove: number;
    };

    const movers: Mover[] = [];
    const count = Math.random() < 0.5 ? 1 : 2;
    for (let i = 0; i < count; i++) {
      movers.push(makeMover(grid));
    }

    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = now - prev;
      prev = now;

      for (const m of movers) {
        m.lastMove += dt;
        if (m.lastMove > 1800) {
          // 8方向ランダムだが他のmoverと重ならないように
          const dirs = [
            [-1, -1], [0, -1], [1, -1],
            [-1, 0],            [1, 0],
            [-1, 1],  [0, 1],   [1, 1],
            [0, 0],
          ];
          for (let s = dirs.length - 1; s > 0; s--) {
            const j = Math.floor(Math.random() * (s + 1));
            [dirs[s], dirs[j]] = [dirs[j], dirs[s]];
          }
          for (const [dx, dy] of dirs) {
            const nx = m.x + dx;
            const ny = m.y + dy;
            if (nx < 0 || ny < 0 || nx >= grid || ny >= grid) continue;
            if (
              movers.some(
                (o) => o !== m && o.x === nx && o.y === ny
              )
            )
              continue;
            m.x = nx;
            m.y = ny;
            break;
          }
          m.lastMove = 0;
        }
      }

      // 描画
      ctx.fillStyle = "#fafafa";
      ctx.fillRect(0, 0, cssSize, cssSize);
      ctx.strokeStyle = "#d0d0d0";
      ctx.lineWidth = 1;
      // グリッド線
      for (let i = 0; i <= grid; i++) {
        const p = i * cell + 0.5;
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, cssSize);
        ctx.moveTo(0, p);
        ctx.lineTo(cssSize, p);
        ctx.stroke();
      }
      // 生命
      for (const m of movers) {
        const cx = m.x * cell + cell / 2;
        const cy = m.y * cell + cell / 2;
        ctx.fillStyle = `rgb(${m.r}, ${m.g}, ${m.b})`;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.32, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="start-grid" />;
}

function makeMover(grid: number) {
  return {
    x: Math.floor(Math.random() * grid),
    y: Math.floor(Math.random() * grid),
    r: Math.floor(Math.random() * 256),
    g: Math.floor(Math.random() * 256),
    b: Math.floor(Math.random() * 256),
    lastMove: 0,
  };
}
