import type { QueryCtx } from "./_generated/server";

// Game rules live here so the client and server agree on them.
export const MODEL = { name: "Qwen/Qwen3.5-4B", layers: 32, width: 9216 };
export const LIMITS = { scans: 12, catches: 3, guesses: 15, entries: 8 };
export const HINTS = { band: 5, token: 10 }; // daily hints unlock after this many guesses
export const SOLVE_COS = 0.97; // a guess this similar to the answer counts as solving it
export const LAUNCH = "2026-10-27";

export const RARITIES = ["legendary", "epic", "rare", "uncommon", "common", "glitch"] as const;
export type Rarity = (typeof RARITIES)[number];
export const POINTS: Record<Rarity, number> = { legendary: 100, epic: 30, rare: 10, uncommon: 3, common: 1, glitch: 5 };

// Strength z against random directions. From a 2048-neuron calibration (64 per layer), among coherent neurons about
// 0.4% are legendary, 2% epic, 6% rare and 20% uncommon. A push that wrecks the text is a glitch: high NLL under the
// unsteered model, or any reply that loops or comes back empty (worst prompt's distinct-2 under 0.5). Glitches are
// common among the strongest pushes, and worth a little.
const Z = { legendary: 12, epic: 7, rare: 3.5, uncommon: 1.5 };
export const GLITCH = { nll: 3.2, distinct: 0.5 };

export function rarity(z: number, nll: number, distinct: number): Rarity {
  if (nll > GLITCH.nll || distinct < GLITCH.distinct) return "glitch";
  if (z >= Z.legendary) return "legendary";
  if (z >= Z.epic) return "epic";
  if (z >= Z.rare) return "rare";
  if (z >= Z.uncommon) return "uncommon";
  return "common";
}

export const neuronKey = (layer: number, n: number) => `${layer}:${n}`;

export function validNeuron(layer: number, n: number) {
  if (!Number.isInteger(layer) || !Number.isInteger(n) || layer < 0 || layer >= MODEL.layers || n < 0 || n >= MODEL.width)
    throw new Error(`no neuron L${layer} N${n}: layers 0-${MODEL.layers - 1}, neurons 0-${MODEL.width - 1}`);
}

export function today(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  return today(Date.parse(date + "T00:00:00Z") + days * 86400000);
}

export function dailyNumber(date: string) {
  return Math.round((Date.parse(date) - Date.parse(LAUNCH)) / 86400000) + 1;
}

export function cosine(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // both unit length
}

export async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function playerFor(ctx: QueryCtx, token: string | undefined) {
  if (!token) return null;
  const tokenHash = await sha256(token);
  return await ctx.db.query("players").withIndex("by_token", (q) => q.eq("tokenHash", tokenHash)).unique();
}

export async function requirePlayer(ctx: QueryCtx, token: string | undefined) {
  const p = await playerFor(ctx, token);
  if (!p) throw new Error("Pick a handle first");
  return p;
}

export function checkWorker(secret: string) {
  if (!process.env.WORKER_SECRET || secret !== process.env.WORKER_SECRET) throw new Error("bad worker secret");
}
