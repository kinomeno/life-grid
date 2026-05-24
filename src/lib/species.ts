import { SPECIES_RGB_BIN } from "./constants";
import { regionName } from "./maps";
import type { Genes } from "./types";

export function speciesIdFromGenes(genes: Genes): string {
  const rb = Math.floor(genes.r / SPECIES_RGB_BIN);
  const gb = Math.floor(genes.g / SPECIES_RGB_BIN);
  const bb = Math.floor(genes.b / SPECIES_RGB_BIN);
  return `${rb}-${gb}-${bb}`;
}

export function speciesLabel(speciesId: string): string {
  const [rb, gb, bb] = speciesId.split("-").map((s) => Number(s));
  const r = rb * SPECIES_RGB_BIN + Math.floor(SPECIES_RGB_BIN / 2);
  const g = gb * SPECIES_RGB_BIN + Math.floor(SPECIES_RGB_BIN / 2);
  const b = bb * SPECIES_RGB_BIN + Math.floor(SPECIES_RGB_BIN / 2);

  let dominant: "R" | "G" | "B" | "Y" | "C" | "M" | "W" | "K";
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 40) {
    dominant = max > 180 ? "W" : "K";
  } else if (r === max) {
    if (g - b > 30) dominant = "Y";
    else if (b - g > 30) dominant = "M";
    else dominant = "R";
  } else if (g === max) {
    if (r - b > 30) dominant = "Y";
    else if (b - r > 30) dominant = "C";
    else dominant = "G";
  } else {
    if (g - r > 30) dominant = "C";
    else if (r - g > 30) dominant = "M";
    else dominant = "B";
  }

  const code = rb * 36 + gb * 6 + bb;
  return `${dominant}-${String(code).padStart(2, "0")}`;
}

/** ver.2: 連番ラベル。0->A, 1->B, … 25->Z, 26->AA, …。 */
export function letterFromSeq(seq: number): string {
  let s = "";
  let n = seq;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/**
 * ver.2: 出生地つきの系統表示名。「北アメリカA」等。
 * 出自(origin)と連番(seq)があり、region 名引き関数が渡されればそれを使う。
 * 無ければ従来の色ベース名（speciesLabel）にフォールバック。
 */
export function speciesDisplayName(
  speciesId: string,
  node?: { origin?: string; seq?: number } | null,
  locale: string = "ja"
): string {
  if (node && node.origin != null && node.seq != null) {
    const nm = regionName(node.origin, locale);
    if (nm) {
      // 英語名（A-Z含む）は区切りスペース、日本語名は詰める（北アメリカA / N. America A）。
      const sep = /[A-Za-z]/.test(nm) ? " " : "";
      return `${nm}${sep}${letterFromSeq(node.seq)}`;
    }
  }
  return speciesLabel(speciesId);
}

/**
 * v1.30 (H4 再設計): 表示用の 1 チャンネル「種代表色」。生 RGB をビン中心に量子化する。
 * 同じ種(speciesId)の個体はすべて同じ表示色になり、「色＝仲間」を視覚的に明快にする。
 * 内部の生 RGB（仲間タグ・微ドリフトする遺伝子）は speciesIdFromGenes / geneId 側で使う。
 */
export function binCenterColor(v: number): number {
  const c =
    Math.floor(v / SPECIES_RGB_BIN) * SPECIES_RGB_BIN + (SPECIES_RGB_BIN >> 1);
  return c > 255 ? 255 : c;
}

/** 表示用の種代表色（ビン中心色）。speciesIdFromGenes と同じビンを使う。 */
export function speciesColorFromGenes(genes: Genes): {
  r: number;
  g: number;
  b: number;
} {
  return {
    r: binCenterColor(genes.r),
    g: binCenterColor(genes.g),
    b: binCenterColor(genes.b),
  };
}
