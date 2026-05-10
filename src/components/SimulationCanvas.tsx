"use client";

import { useEffect, useRef } from "react";
import { ENERGY_DISPLAY_LEVELS, ENERGY_MAX } from "@/lib/constants";
import type { World } from "@/lib/types";

type Props = {
  world: World;
  cellSize: number;
  version: number;
};

export default function SimulationCanvas({ world, cellSize, version }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = world.width * cellSize;
    const cssHeight = world.height * cellSize;

    if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawEnergyField(ctx, world, cellSize);
    drawLives(ctx, world, cellSize);
  }, [world, cellSize, version]);

  return <canvas ref={canvasRef} className="simulation-canvas" />;
}

function drawEnergyField(
  ctx: CanvasRenderingContext2D,
  world: World,
  cellSize: number
) {
  const { width, height, energy } = world;

  const imgW = width;
  const imgH = height;
  const img = ctx.createImageData(imgW, imgH);
  const data = img.data;

  const levels = ENERGY_DISPLAY_LEVELS;
  for (let i = 0; i < energy.length; i++) {
    const v = energy[i] / ENERGY_MAX;
    const t = Math.min(1, Math.max(0, v));
    const quantized = Math.floor(t * levels) / levels;
    const shade = Math.round(250 - quantized * 90);
    const o = i * 4;
    data[o] = shade;
    data[o + 1] = shade;
    data[o + 2] = shade;
    data[o + 3] = 255;
  }

  const off = document.createElement("canvas");
  off.width = imgW;
  off.height = imgH;
  const offCtx = off.getContext("2d");
  if (!offCtx) return;
  offCtx.putImageData(img, 0, 0);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, imgW * cellSize, imgH * cellSize);
}

function drawLives(
  ctx: CanvasRenderingContext2D,
  world: World,
  cellSize: number
) {
  const inset = Math.max(0, Math.floor(cellSize * 0.15));
  const drawSize = Math.max(1, cellSize - inset * 2);
  const radius = drawSize / 2;
  const half = cellSize / 2;
  const TWO_PI = Math.PI * 2;

  for (const life of world.lives) {
    if (!life.alive) continue;
    const { r, g, b } = life.genes;
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.beginPath();
    ctx.arc(
      life.x * cellSize + half,
      life.y * cellSize + half,
      radius,
      0,
      TWO_PI
    );
    ctx.fill();
  }
}
