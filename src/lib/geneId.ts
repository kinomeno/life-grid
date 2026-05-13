import {
  GENE_INTELLIGENCE_MAX,
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
} from "./constants";
import type { Genes } from "./types";

/**
 * 11個の遺伝子を区切りなしの文字列に直列化する。
 *
 * 各遺伝子を桁数固定にすることで、後でパースして元に戻せる。
 *  - r,g,b: 3桁 (000-255) = 9
 *  - vision: 1桁 (1-9)    = 1
 *  - speed: 3桁 (1-100)   = 3  (旧 0.39 以前の 1 桁 ID とは非互換)
 *  - size: 3桁 (000-999)  = 3
 *  - strength: 3桁 (1-100)= 3  (旧 0.39 以前の 2 桁 ID とは非互換)
 *  - intelligence: 3桁    = 3
 *  - reproductionRate: 2桁= 2
 *  - mutationRate: 3桁    = 3
 *  - lifespan: 4桁        = 4
 * 合計 31桁。
 */
export const GENE_ID_LENGTH = 31;
export function encodeGeneId(genes: Genes): string {
  const r = pad(genes.r, 3);
  const g = pad(genes.g, 3);
  const b = pad(genes.b, 3);
  const vision = pad(genes.vision, 1);
  const speed = pad(Math.round(genes.speed), 3);
  const size = pad(Math.round(genes.size), 3);
  const strength = pad(Math.round(genes.strength), 3);
  const intel = pad(Math.round(genes.intelligence), 3);
  const repro = pad(Math.round(genes.reproductionRate * 100), 2);
  const mut = pad(Math.round(genes.mutationRate * 1000), 3);
  const life = pad(Math.round(genes.lifespan), 4);
  return `${r}${g}${b}${vision}${speed}${size}${strength}${intel}${repro}${mut}${life}`;
}

/** ID を Genes に戻す。失敗時は null。 */
export function decodeGeneId(id: string): Genes | null {
  const trimmed = id.replace(/\s/g, "");
  if (!/^\d+$/.test(trimmed)) return null;
  if (trimmed.length !== GENE_ID_LENGTH) return null;
  let p = 0;
  const r = clamp(parseInt(trimmed.slice(p, (p += 3)), 10), 0, 255);
  const g = clamp(parseInt(trimmed.slice(p, (p += 3)), 10), 0, 255);
  const b = clamp(parseInt(trimmed.slice(p, (p += 3)), 10), 0, 255);
  const vision = clamp(
    parseInt(trimmed.slice(p, (p += 1)), 10),
    GENE_VISION_MIN,
    GENE_VISION_MAX
  );
  const speed = clamp(
    parseInt(trimmed.slice(p, (p += 3)), 10),
    GENE_SPEED_MIN,
    GENE_SPEED_MAX
  );
  const size = clamp(
    parseInt(trimmed.slice(p, (p += 3)), 10),
    GENE_SIZE_MIN,
    GENE_SIZE_MAX
  );
  const strength = clamp(
    parseInt(trimmed.slice(p, (p += 3)), 10),
    GENE_STRENGTH_MIN,
    GENE_STRENGTH_MAX
  );
  const intelligence = clamp(
    parseInt(trimmed.slice(p, (p += 3)), 10),
    0,
    GENE_INTELLIGENCE_MAX
  );
  const reproductionRate = clamp(
    parseInt(trimmed.slice(p, (p += 2)), 10) / 100,
    GENE_REPRODUCTION_MIN,
    GENE_REPRODUCTION_MAX
  );
  const mutationRate = clamp(
    parseInt(trimmed.slice(p, (p += 3)), 10) / 1000,
    GENE_MUTATION_MIN,
    GENE_MUTATION_MAX
  );
  const lifespan = clamp(
    parseInt(trimmed.slice(p, (p += 4)), 10),
    GENE_LIFESPAN_MIN,
    GENE_LIFESPAN_MAX
  );
  return {
    r,
    g,
    b,
    vision,
    speed,
    size,
    strength,
    intelligence,
    reproductionRate,
    mutationRate,
    lifespan,
  };
}

/** 遺伝子IDを表示用に切り詰め（17文字超なら末尾「...」付き）。 */
export function truncateGeneId(id: string, max = 17): string {
  if (id.length <= max) return id;
  return id.slice(0, Math.max(1, max - 3)) + "...";
}

function pad(n: number, len: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(len, "0");
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
