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

// Deletes every player and what they did (scans, catches, guesses, results, entries), and un-catches their neurons.
// For dev deployments and for moving to a new players schema; puzzles, bounties and measured neurons stay.
export const resetPlayers = internalMutation({
  args: {},
  handler: async (ctx) => {
    let n = 0;
    for (const c of await ctx.db.query("catches").collect()) {
      const p = await ctx.db.query("profiles").withIndex("by_key", (q) => q.eq("key", c.key)).unique();
      if (p) await ctx.db.patch(p._id, { caught: false });
    }
    for (const t of ["scans", "catches", "guesses", "results", "entries", "players"] as const)
      for (const d of await ctx.db.query(t).collect()) {
        await ctx.db.delete(d._id);
        n++;
      }
    const s = await ctx.db.query("stats").withIndex("by_name", (q) => q.eq("name", "global")).unique();
    if (s) await ctx.db.patch(s._id, { caught: 0, coverage: s.coverage.map(() => 0) });
    return n;
  },
});
