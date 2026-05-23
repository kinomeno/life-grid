// ver.2: 固定地形プリセット。文字列マスクを Uint8Array/Int8Array に展開する。
import { WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT, WORLD_MAP_ROWS } from "./worldMap";
import { WORLD_REGION_ROWS, WORLD_REGIONS } from "./worldRegions";
import type { RegionMeta } from "../types";

export type TerrainPreset = {
  id: string;
  width: number;
  height: number;
  /** 1=陸（生息可能） / 0=海（侵入不可・エネルギー0）。長さ width*height。 */
  terrain: Uint8Array;
  /** -1=海 / 0..=リージョンindex（regionMeta に対応）。長さ width*height。 */
  regions: Int8Array;
  /** リージョン（大陸区分）のメタ：コード・名前・代表色（祖先体色）。 */
  regionMeta: RegionMeta[];
};

/** '#'=陸 / '.'=海 の行配列を Uint8Array(1=陸/0=海) に展開。 */
function decodeMask(rows: string[], width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = rows[y] ?? "";
    for (let x = 0; x < width; x++) mask[y * width + x] = row[x] === "#" ? 1 : 0;
  }
  return mask;
}

/** 'A'..='区分0..' / '.'=海(-1) の行配列を Int8Array に展開。 */
function decodeRegions(rows: string[], width: number, height: number): Int8Array {
  const arr = new Int8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = rows[y] ?? "";
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      arr[y * width + x] = ch && ch !== "." ? ch.charCodeAt(0) - 65 : -1;
    }
  }
  return arr;
}

// ver.2: リージョンコード → 日本語名（系統名「北アメリカA」用）。
const _regionJa = new Map<string, string>(WORLD_REGIONS.map((r) => [r.code, r.ja]));
export function regionJaByCode(code: string): string | undefined {
  return _regionJa.get(code);
}

let _world: TerrainPreset | null = null;

/** 世界地図プリセット（200x100・横ループ・上下端は海・陸橋込み・10区分）。 */
export function getWorldTerrain(): TerrainPreset {
  if (_world) return _world;
  _world = {
    id: "world",
    width: WORLD_MAP_WIDTH,
    height: WORLD_MAP_HEIGHT,
    terrain: decodeMask(WORLD_MAP_ROWS, WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT),
    regions: decodeRegions(WORLD_REGION_ROWS, WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT),
    regionMeta: WORLD_REGIONS,
  };
  return _world;
}
