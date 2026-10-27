import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// Operator tools, run with `npx convex run admin:<name>`. Not callable from the client.

// Drops the puzzles from `from` on (with their guesses and results) so the hourly cron generates new ones.
export const resetDailies = internalMutation({
  args: { from: v.string() },
  handler: async (ctx, { from }) => {
    const ds = await ctx.db.query("dailies").withIndex("by_date", (q) => q.gte("date", from)).collect();
    for (const d of ds) {
      for (const g of await ctx.db.query("guesses").filter((q) => q.eq(q.field("date"), d.date)).collect()) await ctx.db.delete(g._id);
      for (const r of await ctx.db.query("results").withIndex("by_date", (q) => q.eq("date", d.date)).collect()) await ctx.db.delete(r._id);
      await ctx.db.delete(d._id);
    }
    return ds.length;
  },
});

// The answer to a day's puzzle, for checking a puzzle by hand and for the E2E test.
export const answer = internalQuery({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const d = await ctx.db.query("dailies").withIndex("by_date", (q) => q.eq("date", date)).unique();
    return d ? { layer: d.layer, n: d.n } : null;
  },
});
