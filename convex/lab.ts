import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { DOSE } from "./bounties";
import { enqueue } from "./jobs";
import { LIMITS, neuronKey, playerFor, requirePlayer, today, validNeuron } from "./lib";
import { push } from "./schema";

// The lab: push two neurons separately and together, and measure whether the joint effect is the sum of the two.

export const run = mutation({
  args: { a: push, b: push },
  handler: async (ctx, { a, b }) => {
    const player = await requirePlayer(ctx);
    for (const p of [a, b]) {
      validNeuron(p.layer, p.n);
      if (!Number.isFinite(p.dose) || Math.abs(p.dose) < DOSE.min || Math.abs(p.dose) > DOSE.max)
        throw new ConvexError(`Doses are ${DOSE.min} to ${DOSE.max} (or negative)`);
    }
    if (neuronKey(a.layer, a.n) === neuronKey(b.layer, b.n)) throw new ConvexError("Pick two different neurons");
    const date = today();
    const done = await ctx.db.query("experiments").withIndex("by_player_date", (q) => q.eq("playerId", player._id).eq("date", date)).collect();
    if (done.length >= LIMITS.experiments) throw new ConvexError(`${LIMITS.experiments} experiments a day. More tomorrow.`);
    const round = (p: typeof a) => ({ ...p, dose: Math.round(p.dose * 100) / 100 });
    const id = await ctx.db.insert("experiments", { playerId: player._id, a: round(a), b: round(b), date, status: "pending" });
    await enqueue(ctx, "combo", `combo:${id}`, { experimentId: id, a: round(a), b: round(b) }, 0, player._id);
    return id;
  },
});

// This player's experiments, newest first.
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const player = await playerFor(ctx);
    if (!player) return [];
    const rows = await ctx.db.query("experiments").withIndex("by_player_date", (q) => q.eq("playerId", player._id)).order("desc").take(30);
    return rows.map(({ _id, a, b, status, texts, additivity, gain, towardA, towardB, faint }) => ({
      id: _id,
      a,
      b,
      status,
      texts,
      additivity,
      gain,
      towardA,
      towardB,
      faint: !!faint,
    }));
  },
});
