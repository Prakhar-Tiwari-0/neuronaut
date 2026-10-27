import { ConvexError } from "convex/values";
import type { QueryCtx } from "./_generated/server";

export * from "./rules";

// The signed-in caller's player, or null if they're signed out or haven't picked a handle yet.
export async function playerFor(ctx: QueryCtx) {
  const id = await ctx.auth.getUserIdentity();
  if (!id) return null;
  return await ctx.db.query("players").withIndex("by_user", (q) => q.eq("userId", id.tokenIdentifier)).unique();
}

export async function requirePlayer(ctx: QueryCtx) {
  if (!(await ctx.auth.getUserIdentity())) throw new ConvexError("Sign in first");
  const p = await playerFor(ctx);
  if (!p) throw new ConvexError("Pick a handle first");
  return p;
}

export function checkWorker(secret: string) {
  if (!process.env.WORKER_SECRET || secret !== process.env.WORKER_SECRET) throw new ConvexError("bad worker secret");
}
