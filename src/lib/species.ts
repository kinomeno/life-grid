import { SPECIES_RGB_BIN } from "./constants";
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
