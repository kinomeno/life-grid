// ver.2: 固定地形プリセット。文字列マスクを Uint8Array(1=陸/0=海) に展開する。
import { WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT, WORLD_MAP_ROWS } from "./worldMap";

export type TerrainPreset = {
  id: string;
  width: number;
  height: number;
  /** 1=陸（生息可能） / 0=海（侵入不可・エネルギー0）。長さ width*height。 */
  terrain: Uint8Array;
};

/** '#'=陸 / '.'=海 の行配列を Uint8Array に展開。 */
function decodeMask(rows: string[], width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = rows[y] ?? "";
    for (let x = 0; x < width; x++) {
      mask[y * width + x] = row[x] === "#" ? 1 : 0;
    }
  }
  return mask;
}

/**
 * 陸橋・連結の手調整。孤立した大陸・島を1ドット幅で連結する。
 * 座標は worldMap.ts の解像度（200x100）前提。観察しながら調整する。
 * （Stage 3 で本格調整：アフリカ↔南米の左右継ぎ目・島嶼の連結など）
 */
function applyWorldBridges(mask: Uint8Array, width: number, height: number): void {
  const land = (x: number, y: number) => {
    const xx = ((x % width) + width) % width; // 横はループ
    if (y < 0 || y >= height) return; // 縦は範囲外無視
    mask[y * width + xx] = 1;
  };
  // プレースホルダ：現状は無し。Stage 3 で land(x,y) を並べて陸橋を敷く。
  void land;
}

let _world: TerrainPreset | null = null;

/** 世界地図プリセット（200x100・横ループ・上下端は海）。 */
export function getWorldTerrain(): TerrainPreset {
  if (_world) return _world;
  const terrain = decodeMask(WORLD_MAP_ROWS, WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT);
  applyWorldBridges(terrain, WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT);
  _world = {
    id: "world",
    width: WORLD_MAP_WIDTH,
    height: WORLD_MAP_HEIGHT,
    terrain,
  };
  return _world;
}
