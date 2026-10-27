import { ConvexError } from "convex/values";
import type { QueryCtx } from "./_generated/server";

export * from "./rules";

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
  if (!p) throw new ConvexError("Pick a handle first");
  return p;
}

export function checkWorker(secret: string) {
  if (!process.env.WORKER_SECRET || secret !== process.env.WORKER_SECRET) throw new ConvexError("bad worker secret");
}
