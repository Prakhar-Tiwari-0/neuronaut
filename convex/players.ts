import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { LIMITS, playerFor, sha256, today } from "./lib";

// A player is a handle plus a secret token the browser generates and keeps. The token is the login: the same token on
// another device is the same player.
export const join = mutation({
  args: { handle: v.string(), token: v.string() },
  handler: async (ctx, { handle, token }) => {
    const h = handle.trim();
    if (!/^[A-Za-z0-9_-]{3,16}$/.test(h)) throw new Error("Handles are 3-16 letters, digits, _ or -");
    if (token.length < 32) throw new Error("bad token");
    const taken = await ctx.db.query("players").withIndex("by_handle", (q) => q.eq("handleLower", h.toLowerCase())).unique();
    if (taken) throw new Error(`${h} is taken`);
    await ctx.db.insert("players", {
      handle: h,
      handleLower: h.toLowerCase(),
      tokenHash: await sha256(token),
      points: 0,
      caught: 0,
      dailySolved: 0,
      streak: 0,
      bestStreak: 0,
      bountyWins: 0,
    });
    return h;
  },
});

// The signed-in player with what they have left today.
export const me = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, { token }) => {
    const p = await playerFor(ctx, token);
    if (!p) return null;
    const date = today();
    const scans = await ctx.db
      .query("scans")
      .withIndex("by_player_date", (q) => q.eq("playerId", p._id).eq("date", date))
      .collect();
    const catches = await ctx.db
      .query("catches")
      .withIndex("by_player_date", (q) => q.eq("playerId", p._id).eq("date", date))
      .collect();
    return {
      _id: p._id,
      handle: p.handle,
      points: p.points,
      caught: p.caught,
      streak: p.streak,
      scansLeft: LIMITS.scans - scans.filter((s) => s.source === "scan").length,
      catchesLeft: LIMITS.catches - catches.length,
    };
  },
});

export const leaderboard = query({
  args: {},
  handler: async (ctx) => {
    const top = await ctx.db.query("players").withIndex("by_points").order("desc").take(100);
    return top.map((p) => ({
      handle: p.handle,
      points: p.points,
      caught: p.caught,
      dailySolved: p.dailySolved,
      streak: p.streak,
      bestStreak: p.bestStreak,
      bountyWins: p.bountyWins,
    }));
  },
});

export const profile = query({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    const p = await ctx.db.query("players").withIndex("by_handle", (q) => q.eq("handleLower", handle.toLowerCase())).unique();
    if (!p) return null;
    const catches = await ctx.db.query("catches").withIndex("by_player", (q) => q.eq("playerId", p._id)).order("desc").collect();
    return {
      handle: p.handle,
      points: p.points,
      dailySolved: p.dailySolved,
      streak: p.streak,
      bestStreak: p.bestStreak,
      bountyWins: p.bountyWins,
      catches: catches.map((c) => ({ layer: c.layer, n: c.n, name: c.name, rarity: c.rarity, points: c.points, date: c.date })),
    };
  },
});
