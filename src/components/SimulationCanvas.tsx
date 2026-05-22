"use client";

import { useEffect, useRef } from "react";
import { ENERGY_DISPLAY_LEVELS, ENERGY_MAX } from "@/lib/constants";
import { binCenterColor } from "@/lib/species";
import type { Life, World } from "@/lib/types";

type Props = {
  world: World;
  cellSize: number;
  version: number;
  /** v1.30 (案1/B): 現在の再生速度。エネルギー提供○演出の表示判定に使う。 */
  speed?: number;
  /** 移動補間フェーズ（0=直前位置, 1=現在位置）。未指定なら 1。 */
  animPhase?: number;
  /** v1.21 軽量化: true なら描画を簡易化（形状→円）。大マップ高速時に有効。 */
  simplifiedRender?: boolean;
  selectedLifeId?: number | null;
  /** v1.02: 選択生命の最近の移動座標列（古い順、最大 60 点）。空配列なら描画しない。 */
  selectedLifePath?: { x: number; y: number }[];
  trackedSpeciesId?: string | null;
  onCellClick?: (x: number, y: number) => void;
  /** マウスホバー位置をワールド座標で通知。y=null なら離脱。px/py は viewport 内の px。 */
  onCellHover?: (x: number, y: number | null, px: number, py: number) => void;
};

export default function SimulationCanvas({
  world,
  cellSize,
  version,
  speed = 1,
  animPhase = 1,
  simplifiedRender = false,
  selectedLifeId = null,
  selectedLifePath = [],
  trackedSpeciesId = null,
  onCellClick,
  onCellHover,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // ImageData / off-screen canvas を再利用してアロケを抑える
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<ImageData | null>(null);

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

    // off-screen canvas / ImageData を必要なら確保（ライフ間で再利用）
    let off = offRef.current;
    if (!off || off.width !== world.width || off.height !== world.height) {
      off = document.createElement("canvas");
      off.width = world.width;
      off.height = world.height;
      offRef.current = off;
      const oc = off.getContext("2d");
      imgRef.current = oc ? oc.createImageData(world.width, world.height) : null;
    }

    drawEnergyField(ctx, world, cellSize, off, imgRef.current);
    drawSelectedPath(ctx, selectedLifePath, cellSize, world.width, world.height);
    drawLives(ctx, world, cellSize, trackedSpeciesId, selectedLifeId, animPhase, simplifiedRender);
    drawCombatFlashes(ctx, world, cellSize, animPhase);
    drawCataclysm(ctx, world, cellSize);
    drawBirthFlashes(ctx, world, cellSize);
    drawShareFlashes(ctx, world, cellSize, animPhase, speed);
  }, [
    world,
    cellSize,
    version,
    speed,
    animPhase,
    simplifiedRender,
    selectedLifeId,
    selectedLifePath,
    trackedSpeciesId,
  ]);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!onCellClick) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width * world.width;
    const cy = (e.clientY - rect.top) / rect.height * world.height;
    const x = Math.floor(cx);
    const y = Math.floor(cy);
    if (x < 0 || y < 0 || x >= world.width || y >= world.height) return;
    onCellClick(x, y);
  }

  function handleMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!onCellHover) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * world.width;
    const cy = ((e.clientY - rect.top) / rect.height) * world.height;
    const x = Math.floor(cx);
    const y = Math.floor(cy);
    if (x < 0 || y < 0 || x >= world.width || y >= world.height) {
      onCellHover(0, null, 0, 0);
      return;
    }
    onCellHover(x, y, e.clientX, e.clientY);
  }

  function handleLeave() {
    if (onCellHover) onCellHover(0, null, 0, 0);
  }

  return (
    <canvas
      ref={canvasRef}
      className="simulation-canvas"
      onClick={handleClick}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ cursor: onCellClick ? "crosshair" : "default" }}
    />
  );
}

/**
 * v1.02: 選択中の生命の移動軌跡を薄い線で描画する。
 * 古い点ほど透明度が高い（消えていく）。
 * トーラス境界をまたぐセグメントだけスキップ（速度が高い生命の数マスジャンプは描画する）。
 */
function drawSelectedPath(
  ctx: CanvasRenderingContext2D,
  path: { x: number; y: number }[],
  cellSize: number,
  worldWidth: number,
  worldHeight: number
) {
  if (!path || path.length < 2) return;
  const half = cellSize / 2;
  // トーラス境界跨ぎ判定：マップサイズの半分以上ジャンプしている場合は跨ぎとみなす
  const wrapX = worldWidth / 2;
  const wrapY = worldHeight / 2;
  ctx.save();
  ctx.lineWidth = Math.max(1, cellSize * 0.18);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const n = path.length;
  for (let i = 1; i < n; i++) {
    const p0 = path[i - 1];
    const p1 = path[i];
    const dx = Math.abs(p1.x - p0.x);
    const dy = Math.abs(p1.y - p0.y);
    // トーラス跨ぎ（マップ反対側へジャンプ）だけスキップ。
    // 速度が高い生命の 2〜3 マスジャンプも線として描画したいため緩い判定にする。
    if (dx > wrapX || dy > wrapY) continue;
    // 古いほど透明、新しいほど濃い。範囲 0.08〜0.55
    const t = i / (n - 1);
    const alpha = 0.08 + t * 0.47;
    ctx.strokeStyle = `rgba(40, 40, 40, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(p0.x * cellSize + half, p0.y * cellSize + half);
    ctx.lineTo(p1.x * cellSize + half, p1.y * cellSize + half);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * v1.30 (案1/B): 仲間へのエネルギー提供の演出。小○がドナー→受け手へ流れる。
 * 表示は速度・マップサイズ依存で間引く（100画面以上は <10倍速、50画面以下は <100倍速）。
 * サイズ・不透明度は一定（量には依存させない）。色は種代表色（フラッシュに保存済み）。
 */
function drawShareFlashes(
  ctx: CanvasRenderingContext2D,
  world: World,
  cellSize: number,
  animPhase: number,
  speed: number
) {
  const flashes = world.shareFlashes;
  if (!flashes || flashes.length === 0) return;
  const show = world.width >= 100 ? speed < 10 : speed < 100;
  if (!show) return;
  const half = cellSize / 2;
  const radius = Math.max(1.5, cellSize * 0.16);
  const lineW = Math.max(0.5, cellSize * 0.05);
  ctx.save();
  for (const f of flashes) {
    const t = (world.turn - f.startTurn + animPhase) / f.durationTurns;
    if (t < 0 || t > 1) continue;
    const ix = interp(f.fromX, f.toX, t, world.width);
    const iy = interp(f.fromY, f.toY, t, world.height);
    const cx = ix * cellSize + half;
    const cy = iy * cellSize + half;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${f.r}, ${f.g}, ${f.b})`;
    ctx.fill();
    ctx.lineWidth = lineW;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.stroke();
  }
  ctx.restore();
}

function drawEnergyField(
  ctx: CanvasRenderingContext2D,
  world: World,
  cellSize: number,
  off: HTMLCanvasElement,
  img: ImageData | null
) {
  const { width, height, energy } = world;
  if (!img) return;
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

  // Visual-only toroidal seam
  for (let y = 0; y < height; y++) {
    const lo = (y * width + 0) * 4;
    const ro = (y * width + (width - 1)) * 4;
    const avg = (data[lo] + data[ro]) >> 1;
    data[lo] = data[lo + 1] = data[lo + 2] = avg;
    data[ro] = data[ro + 1] = data[ro + 2] = avg;
  }
  for (let x = 0; x < width; x++) {
    const to = x * 4;
    const bo = ((height - 1) * width + x) * 4;
    const avg = (data[to] + data[bo]) >> 1;
    data[to] = data[to + 1] = data[to + 2] = avg;
    data[bo] = data[bo + 1] = data[bo + 2] = avg;
  }

  const offCtx = off.getContext("2d");
  if (!offCtx) return;
  offCtx.putImageData(img, 0, 0);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, width * cellSize, height * cellSize);
}

/**
 * 前ターン位置 prev と現在位置 cur の間を補間する。
 * トーラス境界をまたいだ場合はスナップ（現在位置をそのまま返す）。
 */
function interp(prev: number, cur: number, phase: number, size: number): number {
  const delta = cur - prev;
  if (Math.abs(delta) > size / 2) return cur;
  return prev + delta * phase;
}

/**
 * 個体の形状を決定する。
 * v1.01 で上限が 999 に拡張されたため、しきい値も再定義：
 *  - strength >= 100 && intelligence >= 100 → star（賢く強い「ミュータント」、極めて稀少）
 *  - strength  >= 100                       → square（強さのミュータント）
 *  - intelligence >= 75                     → triangle（思考型、現状の知能上限近く）
 *  - その他                                  → circle（通常）
 *
 * 注：strength=100 は v1.00 までは「上限」だったが、v1.01 では「ミュータント開始点」。
 *     形状ボーナスは「100 超」の希少性を表す視覚キューとして残す。
 */
type LifeShape = "circle" | "square" | "triangle" | "star";
function getLifeShape(life: Life): LifeShape {
  const g = life.genes;
  const mutantStrong = g.strength >= 100;
  const smartMutant = g.intelligence >= 100;
  const smart = g.intelligence >= 75;
  if (mutantStrong && smartMutant) return "star";
  if (mutantStrong) return "square";
  if (smart) return "triangle";
  return "circle";
}

function drawLifeShape(
  ctx: CanvasRenderingContext2D,
  shape: LifeShape,
  cx: number,
  cy: number,
  radius: number
) {
  const TWO_PI = Math.PI * 2;
  ctx.beginPath();
  if (shape === "circle") {
    ctx.arc(cx, cy, radius, 0, TWO_PI);
  } else if (shape === "square") {
    // 円と同じ視覚的重さになるよう、辺 = radius * 1.78（円の直径より少し小さい）
    const side = radius * 1.78;
    ctx.rect(cx - side / 2, cy - side / 2, side, side);
  } else if (shape === "triangle") {
    // 上向き正三角形
    const r = radius * 1.15;
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.866, cy + r * 0.5);
    ctx.lineTo(cx - r * 0.866, cy + r * 0.5);
    ctx.closePath();
  } else if (shape === "star") {
    // 5 点星
    const outerR = radius * 1.25;
    const innerR = outerR * 0.45;
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  ctx.fill();
}

function drawLives(
  ctx: CanvasRenderingContext2D,
  world: World,
  cellSize: number,
  trackedSpeciesId: string | null,
  selectedLifeId: number | null,
  animPhase: number,
  simplifiedRender = false
) {
  const inset = Math.max(0, Math.floor(cellSize * 0.15));
  const drawSize = Math.max(1, cellSize - inset * 2);
  const radius = drawSize / 2;
  const half = cellSize / 2;
  const TWO_PI = Math.PI * 2;
  // セルサイズが小さすぎる場合は形状差を無視して全て丸（視認性優先）
  // v1.21 軽量化 A2: simplifiedRender 時も形状判定をスキップして全て丸に。
  const useShapes = cellSize >= 4 && !simplifiedRender;

  // 系統追跡時は非該当系統を薄く表示
  const isTracking = trackedSpeciesId !== null;

  // 新系統初代個体の色フェード状態を取得（lifeId → fadeAlpha のマップ）
  const fadeMap = new Map<number, number>();
  for (const f of world.birthFlashes) {
    const elapsed = world.turn - f.startTurn;
    const t = Math.min(1, Math.max(0, elapsed / f.durationTurns));
    const alpha = 0.3 + 0.7 * t;
    fadeMap.set(f.lifeId, alpha);
  }

  // v1.11: 捕食エフェクト中の攻撃者は「パクっと」一瞬大きくなる
  //   開始直後に 1.7x（peak）→ 指数減衰で 1.0x へ
  //   exp(-t*5) なら t=0.2 で約 1.26x、t=0.6 で約 1.03x まで戻る
  const expandMap = new Map<number, number>();
  for (const f of world.combatFlashes) {
    const elapsed = world.turn - f.startTurn;
    if (elapsed >= f.durationTurns) continue;
    const t = elapsed / f.durationTurns;
    // パクっと: 最大 1.7 倍 → 指数減衰
    const expansion = 1.0 + 0.7 * Math.exp(-t * 5);
    const prev = expandMap.get(f.attackerLifeId) ?? 1.0;
    if (expansion > prev) expandMap.set(f.attackerLifeId, expansion);
  }

  for (const life of world.lives) {
    if (!life.alive) continue;
    // v1.30 (H4 再設計): 表示色は「種代表色」（生 RGB をビン中心に量子化）。
    // 同種は画面上まったく同色になり、「色＝仲間」を明快にする。生 RGB は仲間タグとして
    // 内部で微ドリフトし、ビンを越えた瞬間が種分化＝表示色のジャンプになる。
    const gr = life.genes;
    const r = binCenterColor(gr.r);
    const g = binCenterColor(gr.g);
    const b = binCenterColor(gr.b);
    const isTracked =
      !isTracking || life.speciesId === trackedSpeciesId;
    const fadeAlpha = fadeMap.get(life.id);
    if (fadeAlpha !== undefined) {
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${fadeAlpha})`;
    } else if (isTracked) {
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    } else {
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.18)`;
    }
    // 補間位置（前ターン位置→現在位置）
    const ix = interp(life.prevX, life.x, animPhase, world.width);
    const iy = interp(life.prevY, life.y, animPhase, world.height);
    const cxp = ix * cellSize + half;
    const cyp = iy * cellSize + half;
    const shape = useShapes ? getLifeShape(life) : "circle";
    const expansion = expandMap.get(life.id) ?? 1.0;
    drawLifeShape(ctx, shape, cxp, cyp, radius * expansion);

    if (isTracking && isTracked) {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cxp, cyp, radius * expansion + 1, 0, TWO_PI);
      ctx.stroke();
    }

    // 保護中の個体には金色の光輪を描画（G3）
    if (life.protected) {
      const gold = `rgba(250, 200, 60, 0.9)`;
      ctx.strokeStyle = gold;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cxp, cyp, radius * expansion + 3, 0, TWO_PI);
      ctx.stroke();
      // 内側にも淡い光輪
      ctx.strokeStyle = `rgba(250, 200, 60, 0.45)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cxp, cyp, radius * expansion + 5, 0, TWO_PI);
      ctx.stroke();
    }
  }

  // 選択中の生命をハイライト（こちらも補間位置を使う）
  if (selectedLifeId !== null) {
    const sel = world.lives.find((l) => l.id === selectedLifeId && l.alive);
    if (sel) {
      const ix = interp(sel.prevX, sel.x, animPhase, world.width);
      const iy = interp(sel.prevY, sel.y, animPhase, world.height);
      const cx = ix * cellSize + half;
      const cy = iy * cellSize + half;
      ctx.strokeStyle = "rgba(220, 50, 50, 0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(radius + 3, cellSize * 0.7), 0, TWO_PI);
      ctx.stroke();
      const armLen = cellSize * 1.4;
      ctx.beginPath();
      ctx.moveTo(cx - armLen, cy);
      ctx.lineTo(cx + armLen, cy);
      ctx.moveTo(cx, cy - armLen);
      ctx.lineTo(cx, cy + armLen);
      ctx.strokeStyle = "rgba(220, 50, 50, 0.4)";
      ctx.stroke();

      // v1.10: 選択中生命の視野範囲を円（ユークリッド距離）で線表示。
      // depth = vision + 知能ボーナス。低 accuracy 個体は vision-1 で処理されることに注意。
      const intel = Math.max(0, sel.genes.intelligence);
      const accuracy = Math.min(1.0, Math.sqrt(intel / 150));
      const visionBonus = Math.min(7, Math.floor(intel / 50));
      const effectiveVision =
        accuracy < 0.5 ? Math.max(1, sel.genes.vision - 1) : sel.genes.vision;
      const depth = Math.max(1, effectiveVision + visionBonus);
      const visionRadiusPx = depth * cellSize;
      ctx.strokeStyle = "rgba(50, 100, 220, 0.55)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, visionRadiusPx, 0, TWO_PI);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

/**
 * 新系統が誕生した瞬間のリングエフェクトを描画する。
 * 仕様：
 *  - リングは 0% → 100% の進行に応じて拡大する。
 *  - 同時に alpha が 0.85 → 0 にフェード。
 *  - 系統色（誕生した個体の RGB）を使用してアクセントを出す。
 */
function drawBirthFlashes(
  ctx: CanvasRenderingContext2D,
  world: World,
  cellSize: number
) {
  if (world.birthFlashes.length === 0) return;
  const half = cellSize / 2;
  const TWO_PI = Math.PI * 2;
  // セルサイズに応じて最大半径を決定（最低 12px、cellSize の 4 倍）
  const maxRadius = Math.max(12, cellSize * 4);

  for (const f of world.birthFlashes) {
    const elapsed = world.turn - f.startTurn;
    const t = Math.min(1, Math.max(0, elapsed / f.durationTurns));
    if (t >= 1) continue;
    const cx = f.x * cellSize + half;
    const cy = f.y * cellSize + half;
    const ringRadius = cellSize * 0.5 + (maxRadius - cellSize * 0.5) * t;
    const alpha = 0.85 * (1 - t);

    // 外側リング（系統色）
    ctx.strokeStyle = `rgba(${f.r}, ${f.g}, ${f.b}, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, TWO_PI);
    ctx.stroke();

    // 内側リング（白色 — コントラスト用、薄め）
    if (t < 0.6) {
      const innerAlpha = 0.55 * (1 - t / 0.6);
      const innerRadius = ringRadius * 0.6;
      ctx.strokeStyle = `rgba(255, 255, 255, ${innerAlpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, innerRadius, 0, TWO_PI);
      ctx.stroke();
    }
  }
}

/**
 * 捕食エフェクト：捕食者の現在位置に被食者の色が重なって縮小・消滅する。
 * 表示深度：被食者が手前。捕食者は drawLives 側で拡大される。
 */
function drawCombatFlashes(
  ctx: CanvasRenderingContext2D,
  world: World,
  cellSize: number,
  animPhase: number
) {
  if (world.combatFlashes.length === 0) return;
  const half = cellSize / 2;
  const TWO_PI = Math.PI * 2;
  const inset = Math.max(0, Math.floor(cellSize * 0.15));
  const drawSize = Math.max(1, cellSize - inset * 2);
  const baseRadius = drawSize / 2;

  for (const f of world.combatFlashes) {
    const elapsed = world.turn - f.startTurn;
    if (elapsed >= f.durationTurns) continue;
    const t = elapsed / f.durationTurns;

    // 捕食者の現在位置を取得（死亡時は fallback）
    const attacker = world.livesById.get(f.attackerLifeId);
    let cx: number;
    let cy: number;
    if (attacker && attacker.alive) {
      const ix = interp(attacker.prevX, attacker.x, animPhase, world.width);
      const iy = interp(attacker.prevY, attacker.y, animPhase, world.height);
      cx = ix * cellSize + half;
      cy = iy * cellSize + half;
    } else {
      cx = f.fallbackX * cellSize + half;
      cy = f.fallbackY * cellSize + half;
    }

    // v1.20: 被食者の「吸込みアニメ」
    //   - t < 0.15 (最初の 1-2 turn): 被食者の元位置と捕食者位置の中間に描画（吸込み中）
    //   - t >= 0.15: 捕食者位置に到達 → 縮小消滅
    const ax = attacker?.alive ? attacker.x : f.fallbackX;
    const ay = attacker?.alive ? attacker.y : f.fallbackY;
    const vx = f.fallbackX;
    const vy = f.fallbackY;
    let drawX: number;
    let drawY: number;
    if (t < 0.15) {
      // 中間地点（トーラス対応：被食者→捕食者の最短経路）
      let dx = ax - vx;
      let dy = ay - vy;
      if (dx > world.width / 2) dx -= world.width;
      else if (dx < -world.width / 2) dx += world.width;
      if (dy > world.height / 2) dy -= world.height;
      else if (dy < -world.height / 2) dy += world.height;
      const mx = (vx + dx * 0.5 + world.width) % world.width;
      const my = (vy + dy * 0.5 + world.height) % world.height;
      drawX = mx * cellSize + half;
      drawY = my * cellSize + half;
    } else {
      drawX = cx;
      drawY = cy;
    }

    // 被食者を手前に重ね、縮小しながら消滅
    const victimR = baseRadius * (1 - t);
    if (victimR > 0.4) {
      ctx.fillStyle = `rgb(${f.victimR}, ${f.victimG}, ${f.victimB})`;
      ctx.beginPath();
      ctx.arc(drawX, drawY, victimR, 0, TWO_PI);
      ctx.fill();
      // 黒い縁で「重なっている」感を出す
      ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.arc(drawX, drawY, victimR, 0, TWO_PI);
      ctx.stroke();
    }
  }
}

function drawCataclysm(
  ctx: CanvasRenderingContext2D,
  world: World,
  cellSize: number
) {
  const c = world.activeCataclysm;
  if (!c) return;
  const elapsed = world.turn - c.startTurn;
  const progress = Math.min(1, elapsed / c.durationTurns);
  const cx = c.centerX * cellSize + cellSize / 2;
  const cy = c.centerY * cellSize + cellSize / 2;
  const baseRadius = c.radius * cellSize;

  if (c.type === "meteor") {
    // 衝撃波（時間とともに広がるリング）
    const ringRadius = baseRadius * (0.3 + progress * 1.0);
    ctx.strokeStyle = `rgba(220, 80, 30, ${0.85 * (1 - progress)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    // 中心の閃光（最初だけ）
    if (progress < 0.3) {
      const flash = baseRadius * 0.7 * (1 - progress / 0.3);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, flash);
      grad.addColorStop(0, "rgba(255, 220, 120, 0.85)");
      grad.addColorStop(1, "rgba(255, 220, 120, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, flash, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (c.type === "drought") {
    // 茶色いオーバーレイ
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius);
    grad.addColorStop(0, "rgba(120, 80, 40, 0.18)");
    grad.addColorStop(1, "rgba(120, 80, 40, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
    ctx.fill();
  } else if (c.type === "bloom") {
    // 緑のオーバーレイ
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius);
    grad.addColorStop(0, "rgba(80, 200, 90, 0.18)");
    grad.addColorStop(1, "rgba(80, 200, 90, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}
