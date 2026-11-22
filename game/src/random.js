// A tiny seeded generator (mulberry32) plus the small helpers the city and the
// screenshot staging share, so the same seed always builds the same city.

export function createRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A float in [min, max). */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** An integer in [min, max]. */
export function rangeInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** One element of `list`, picked uniformly. */
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/** Fisher–Yates shuffle of a copy. */
export function shuffled(random, list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/** Shortest signed turn from angle `from` to angle `to`, in (-PI, PI]. */
export function angleDiff(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Clamp `v` into [min, max]. */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** Smooth 0→1 interpolation between `edge0` and `edge1` (Hermite). */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Distance between two points. */
export function dist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}
