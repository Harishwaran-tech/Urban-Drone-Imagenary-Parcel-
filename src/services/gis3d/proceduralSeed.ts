/**
 * Deterministic PRNG based on Mulberry32 seeded with string / ID hashing.
 * Guarantees that the same GIS building feature generates the exact same
 * architectural attributes across scene reloads.
 */

export function hashStringToSeed(str: string): number {
  let hash = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(hash ^ str.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return (hash >>> 0);
}

export class SeededRandom {
  private state: number;

  constructor(seed: string | number) {
    if (typeof seed === 'string') {
      this.state = hashStringToSeed(seed);
    } else {
      this.state = seed >>> 0;
    }
    if (this.state === 0) this.state = 1337;
  }

  // Returns pseudo-random float in [0, 1)
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Range [min, max)
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  // Integer in [min, max]
  rangeInt(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  // Pick one element from array
  pick<T>(arr: readonly T[] | T[]): T {
    const idx = Math.floor(this.next() * arr.length);
    return arr[Math.min(idx, arr.length - 1)];
  }

  // Boolean with probability
  chance(probability: number): boolean {
    return this.next() < probability;
  }
}
