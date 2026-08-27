// Buddy-system matching.
//
// Pure and framework-free — it runs at request time inside the Worker (workerd),
// so no `node:` imports, no `fs`, no `process`. The randomness is INJECTED the
// same way the rest of src/lib injects `now`: a round stores its seed, so it can
// be replayed and so `npm test` can assert an exact pairing.
//
// The rule, in order:
//   1. Fill — hand each seeker to the buddy with the fewest so far, never past
//      that buddy's stated capacity. Everyone reaches one buddy before any buddy
//      reaches two.
//   2. Overflow — if seekers remain and every buddy is at capacity, keep going,
//      but only onto buddies who ticked "give me an extra if we're short".
//   3. Remainder — anyone still unmatched is returned for the board to hold for
//      the next round. Never force-fitted onto an unwilling buddy.

/**
 * @typedef {Object} Buddy
 * @property {string} id
 * @property {number} [capacity]     how many seekers this buddy offered to take (1–3); default 1
 * @property {boolean} [openToExtra] take one more than `capacity` when the round is short
 *
 * @typedef {Object} Seeker
 * @property {string} id
 *
 * @typedef {Object} Pairing
 * @property {string} buddyId
 * @property {string} seekerId
 * @property {"fill"|"overflow"} basis
 */

/**
 * A small deterministic PRNG (mulberry32). Not cryptographic — it only shuffles
 * a signup list — but stable, so a stored 32-bit seed reproduces a round.
 * @param {number} seed
 * @returns {() => number} next value in [0, 1)
 */
export function rngFromSeed(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh 32-bit seed. Math.random is fine — this seeds a shuffle, not a key. */
export function makeSeed() {
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}

/**
 * Fisher–Yates. Pure: returns a new array and leaves the input untouched.
 * @template T
 * @param {T[]} list
 * @param {() => number} rng
 * @returns {T[]}
 */
export function shuffle(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Pair every seeker with a buddy.
 *
 * @param {{ buddies?: Buddy[], seekers?: Seeker[], seed?: number, rng?: () => number }} input
 * @returns {{
 *   seed: number,
 *   pairs: Pairing[],
 *   unmatchedSeekers: string[],
 *   idleBuddies: string[],
 *   load: Record<string, number>,
 * }}
 */
export function planMatches({ buddies = [], seekers = [], seed, rng } = {}) {
  const usedSeed = seed ?? makeSeed();
  const next = rng ?? rngFromSeed(usedSeed);

  // Sort by id first, so the shuffle depends only on the seed — not on the order
  // rows happened to come back from the database.
  const pool = buddies
    .slice()
    .sort(byId)
    .map((b) => ({
      id: b.id,
      capacity: Math.max(1, Math.trunc(Number(b.capacity) || 1)),
      openToExtra: Boolean(b.openToExtra),
      load: 0,
    }));
  const queue = shuffle(seekers.slice().sort(byId), next);
  const anyOpen = pool.some((b) => b.openToExtra);

  /** @type {Pairing[]} */
  const pairs = [];
  /** @type {string[]} */
  const unmatchedSeekers = [];

  for (const seeker of queue) {
    // `over` is how far past capacity we are currently willing to go, and only
    // for buddies who opted in. It stays 0 (pure fill) until every buddy is at
    // capacity, then rises one seeker at a time.
    let over = 0;
    let chosen = null;

    for (;;) {
      const ceiling = (b) => b.capacity + (b.openToExtra ? over : 0);
      const eligible = pool.filter((b) => b.load < ceiling(b));
      if (eligible.length > 0) {
        eligible.sort((a, b) => a.load - b.load || byId(a, b));
        chosen = eligible[0];
        break;
      }
      // Nobody can take this seeker at the current ceiling. If no buddy is open
      // to extra, raising the ceiling changes nothing — stop and hold them.
      if (!anyOpen) break;
      over += 1;
      // Unreachable in practice (an open buddy always frees up), but a loop over
      // external data gets a hard stop.
      if (over > queue.length + 1) break;
    }

    if (chosen) {
      chosen.load += 1;
      pairs.push({
        buddyId: chosen.id,
        seekerId: seeker.id,
        basis: over > 0 ? "overflow" : "fill",
      });
    } else {
      unmatchedSeekers.push(seeker.id);
    }
  }

  return {
    seed: usedSeed,
    pairs,
    unmatchedSeekers,
    idleBuddies: pool.filter((b) => b.load === 0).map((b) => b.id),
    load: Object.fromEntries(pool.map((b) => [b.id, b.load])),
  };
}
