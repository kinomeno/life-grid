export type Genes = {
  r: number;
  g: number;
  b: number;
  vision: number;
  speed: number;
  size: number;
  strength: number;
  intelligence: number;
  reproductionRate: number;
  mutationRate: number;
  lifespan: number;
};

export type Life = {
  id: number;
  x: number;
  y: number;
  energy: number;
  age: number;
  speciesId: string;
  genes: Genes;
  alive: boolean;
};

export type World = {
  width: number;
  height: number;
  turn: number;
  seed: number;
  energy: Float32Array;
  occupancy: Int32Array;
  lives: Life[];
  nextLifeId: number;
};

export type WorldConfig = {
  width: number;
  height: number;
  initialLifeCount: number;
  seed: number;
};
