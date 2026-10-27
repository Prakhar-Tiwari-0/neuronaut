import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { MODEL } from "./lib";

export const COVERAGE_BINS = 96;

// Queues GPU work unless the same key is already pending or running. priority 0 means a player is waiting on it.
export async function enqueue(ctx: MutationCtx, kind: Doc<"jobs">["kind"], key: string, args: unknown, priority = 0) {
  const open = await ctx.db
    .query("jobs")
    .withIndex("by_key", (q) => q.eq("key", key))
    .filter((q) => q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "running")))
    .first();
  if (open) return open._id;
  return await ctx.db.insert("jobs", { kind, key, args, priority, status: "pending" });
}

export async function globalStats(ctx: QueryCtx) {
  return await ctx.db.query("stats").withIndex("by_name", (q) => q.eq("name", "global")).unique();
}

export async function bumpStats(
  ctx: MutationCtx,
  change: { profiled?: number; caught?: { layer: number; n: number }; baseline?: { prompts: string[]; texts: string[] } },
) {
  let s = await globalStats(ctx);
  if (!s) {
    const id = await ctx.db.insert("stats", {
      name: "global",
      profiled: 0,
      caught: 0,
      coverage: new Array(MODEL.layers * COVERAGE_BINS).fill(0),
    });
    s = (await ctx.db.get(id))!;
  }
  const patch: Partial<Doc<"stats">> = {};
  if (change.baseline) Object.assign(patch, { prompts: change.baseline.prompts, baseline: change.baseline.texts });
  if (change.profiled) patch.profiled = s.profiled + change.profiled;
  if (change.caught) {
    const { layer, n } = change.caught;
    const coverage = [...s.coverage];
    coverage[layer * COVERAGE_BINS + Math.floor((n * COVERAGE_BINS) / MODEL.width)] += 1;
    patch.coverage = coverage;
    patch.caught = s.caught + 1;
  }
  await ctx.db.patch(s._id, patch);
}
