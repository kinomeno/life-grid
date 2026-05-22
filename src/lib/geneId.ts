import {
  GENE_INTELLIGENCE_MAX,
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
  GENE_WEIGHT_MAX,
  GENE_WEIGHT_MIN,
} from "./constants";
import type { Genes } from "./types";

/**
 * v1.10: 遺伝子を区切りなしの文字列に直列化する。
 *
 * 各遺伝子を桁数固定にすることで、後でパースして元に戻せる。
 *  - r,g,b: 3桁 ×3                = 9
 *  - vision: 1桁 (1-9)            = 1
 *  - speed: 3桁 (001-999)         = 3   (v1.11: 100→999 上限拡張)
 *  - size: 3桁 (030-200)          = 3   (v1.11: 60-140→30-200 範囲変更)
 *  - strength: 3桁 (001-999)      = 3
 *  - intelligence: 3桁 (000-999)  = 3
 *  - birthThreshold: 3桁 (030-300)= 3   (v1.20: 繁殖率廃止→出産閾値)
 *  - lifespan: 4桁                = 4
 *  - offspringCount: 1桁 (1-9 → 1-10 範囲、0=10 にマップ) = 1   (v1.11 追加)
 *  - wAppetite～wStarvSensitive: 1桁 ×7（10刻みで精度を犠牲に短縮） = 7
 * 合計 37桁。
 *
 * v1.10 から mutationRate を廃止。重み遺伝子 7 つを追加した。
 * v1.11 で offspringCount を 1 桁追加。
 */
export const GENE_ID_LENGTH = 37;
export function encodeGeneId(genes: Genes): string {
  const r = pad(genes.r, 3);
  const g = pad(genes.g, 3);
  const b = pad(genes.b, 3);
  const vision = pad(genes.vision, 1);
  const speed = pad(Math.round(genes.speed), 3);
  const size = pad(Math.round(genes.size), 3);
  const strength = pad(Math.round(genes.strength), 3);
  const intel = pad(Math.round(genes.intelligence), 3);
  const repro = pad(Math.round(genes.birthThreshold), 3);
  const life = pad(Math.round(genes.lifespan), 4);
  // v1.11: 出産数 1-10 を 1-9 + (10→0) として 1 桁に圧縮
  const ocRaw = Math.max(GENE_OFFSPRING_MIN, Math.min(GENE_OFFSPRING_MAX, Math.round(genes.offspringCount)));
  const oc = ocRaw === 10 ? "0" : String(ocRaw);
  // 重み遺伝子は 0-100 を 0-9 にマッピング（10刻みで精度を犠牲）
  const w1 = compressWeight(genes.wAppetite);
  const w2 = compressWeight(genes.wPredation);
  const w3 = compressWeight(genes.wCaution);
  const w4 = compressWeight(genes.wGregarious);
  const w5 = compressWeight(genes.wLoyalty);
  const w6 = compressWeight(genes.wRepro);
  const w7 = compressWeight(genes.wStarvSensitive);
  return `${r}${g}${b}${vision}${speed}${size}${strength}${intel}${repro}${life}${oc}${w1}${w2}${w3}${w4}${w5}${w6}${w7}`;
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
  const birthThreshold = clamp(
    parseInt(trimmed.slice(p, (p += 3)), 10),
    GENE_BIRTH_THRESHOLD_MIN,
    GENE_BIRTH_THRESHOLD_MAX
  );
  const lifespan = clamp(
    parseInt(trimmed.slice(p, (p += 4)), 10),
    GENE_LIFESPAN_MIN,
    GENE_LIFESPAN_MAX
  );
  // v1.11: 出産数 1 桁（"0"→10）
  const ocDigit = parseInt(trimmed.slice(p, (p += 1)), 10);
  const offspringCount = ocDigit === 0 ? 10 : clamp(ocDigit, GENE_OFFSPRING_MIN, GENE_OFFSPRING_MAX);
  const wAppetite = decompressWeight(parseInt(trimmed.slice(p, (p += 1)), 10));
  const wPredation = decompressWeight(parseInt(trimmed.slice(p, (p += 1)), 10));
  const wCaution = decompressWeight(parseInt(trimmed.slice(p, (p += 1)), 10));
  const wGregarious = decompressWeight(parseInt(trimmed.slice(p, (p += 1)), 10));
  const wLoyalty = decompressWeight(parseInt(trimmed.slice(p, (p += 1)), 10));
  const wRepro = decompressWeight(parseInt(trimmed.slice(p, (p += 1)), 10));
  const wStarvSensitive = decompressWeight(parseInt(trimmed.slice(p, (p += 1)), 10));
  return {
    r,
    g,
    b,
    vision,
    speed,
    size,
    strength,
    intelligence,
    birthThreshold,
    lifespan,
    offspringCount,
    wAppetite,
    wPredation,
    wCaution,
    wGregarious,
    wLoyalty,
    wRepro,
    wStarvSensitive,
    // v1.30 (案1, プロトタイプ): wShare はまだ geneID に含めない（37桁ID互換を維持）。
    // 共有IDから生成した個体は中立値(50)で開始し、以後 mutatGenes で進化する。
    wShare: 50,
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

// 重み遺伝子（0-100）を 0-9 の 1 桁にマッピング
function compressWeight(w: number): string {
  const v = Math.max(GENE_WEIGHT_MIN, Math.min(GENE_WEIGHT_MAX, w));
  return String(Math.min(9, Math.floor(v / 10)));
}

// 1 桁（0-9）を 0-100 の重み遺伝子に戻す（10刻みの中央値）
function decompressWeight(d: number): number {
  const v = Math.max(0, Math.min(9, d));
  // 0→5, 1→15, ..., 9→95（中央値）
  return v * 10 + 5;
}
