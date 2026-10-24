export type Seed = number | string | undefined | null;

/** Deterministic PRNG: returns a function yielding floats in [0, 1). */
export function createRng(seed?: Seed): () => number;

/** Seeded Fisher-Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], seed?: Seed): T[];
