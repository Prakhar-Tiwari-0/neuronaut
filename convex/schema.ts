import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const push = v.object({ layer: v.number(), n: v.number(), dose: v.number() });

export default defineSchema({
  // One row, "global": totals and the dex coverage grid (layers x COVERAGE_BINS catch counts).
  stats: defineTable({ name: v.string(), profiled: v.number(), caught: v.number(), coverage: v.array(v.number()) }).index(
    "by_name",
    ["name"],
  ),

  // Every neuron in the model with its steer lens and logit lens tokens: the searchable index players hunt with.
  neurons: defineTable({
    layer: v.number(),
    n: v.number(),
    steer: v.array(v.string()), // tokens a push makes more likely, strongest first
    lens: v.array(v.string()), // logit lens of the write direction
    terms: v.string(), // search text built from both
  })
    .index("by_ln", ["layer", "n"])
    .searchIndex("search_terms", { searchField: "terms", filterFields: ["layer"] }),

  // What a neuron does, measured by the GPU worker. Hidden from a player until they scan or guess it, or it is caught.
  profiles: defineTable({
    key: v.string(), // "layer:n"
    layer: v.number(),
    n: v.number(),
    texts: v.array(v.string()), // steered replies to the profile prompts
    words: v.array(v.string()),
    z: v.number(), // strength against random directions
    nll: v.number(),
    distinct: v.number(),
    rarity: v.string(),
    embedding: v.array(v.float64()),
    caught: v.boolean(),
  })
    .index("by_key", ["key"])
    .vectorIndex("by_embedding", { vectorField: "embedding", dimensions: 256, filterFields: ["caught"] }),

  players: defineTable({
    handle: v.string(),
    handleLower: v.string(),
    tokenHash: v.string(),
    points: v.number(),
    caught: v.number(),
    dailySolved: v.number(),
    streak: v.number(),
    bestStreak: v.number(),
    lastSolved: v.optional(v.string()),
    bountyWins: v.number(),
  })
    .index("by_token", ["tokenHash"])
    .index("by_handle", ["handleLower"])
    .index("by_points", ["points"]),

  // A player looking at a neuron's card. source "scan" spends a daily scan; "guess" comes free with a daily guess.
  scans: defineTable({
    playerId: v.id("players"),
    key: v.string(),
    layer: v.number(),
    n: v.number(),
    date: v.string(),
    source: v.union(v.literal("scan"), v.literal("guess")),
  })
    .index("by_player", ["playerId"])
    .index("by_player_date", ["playerId", "date"])
    .index("by_player_key", ["playerId", "key"]),

  catches: defineTable({
    playerId: v.id("players"),
    key: v.string(),
    layer: v.number(),
    n: v.number(),
    name: v.string(),
    rarity: v.string(),
    points: v.number(),
    uniqueness: v.number(),
    date: v.string(),
  })
    .index("by_key", ["key"])
    .index("by_rarity", ["rarity"])
    .index("by_player", ["playerId"])
    .index("by_player_date", ["playerId", "date"]),

  // Work for the GPU worker. key dedupes (one pending profile per neuron).
  jobs: defineTable({
    kind: v.union(v.literal("profile"), v.literal("judge"), v.literal("daily"), v.literal("par")),
    key: v.string(),
    args: v.any(),
    priority: v.number(), // 0 = a player is waiting
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("done"), v.literal("failed")),
    startedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_status_priority", ["status", "priority"])
    .index("by_key", ["key"]),

  dailies: defineTable({
    date: v.string(),
    key: v.string(),
    layer: v.number(),
    n: v.number(),
    prompts: v.array(v.string()),
    texts: v.array(v.string()),
    baseline: v.array(v.string()),
    embedding: v.array(v.float64()),
    neighbors: v.array(v.number()), // cosines of the answer's nearest profiled neurons, descending
    band: v.array(v.number()), // [lo, hi] layers, a hint
    hint: v.string(), // the answer's top steer token, a hint
  }).index("by_date", ["date"]),

  guesses: defineTable({
    playerId: v.id("players"),
    date: v.string(),
    key: v.string(),
    layer: v.number(),
    n: v.number(),
    status: v.union(v.literal("pending"), v.literal("done")),
    heat: v.optional(v.number()),
    rank: v.optional(v.union(v.number(), v.null())),
    correct: v.optional(v.boolean()),
  })
    .index("by_player_date", ["playerId", "date"])
    .index("by_key_status", ["key", "status"]),

  results: defineTable({
    playerId: v.id("players"),
    date: v.string(),
    solved: v.boolean(),
    guesses: v.number(),
    heats: v.array(v.number()),
  })
    .index("by_player_date", ["playerId", "date"])
    .index("by_date", ["date"]),

  bounties: defineTable({
    slug: v.string(),
    title: v.string(),
    brief: v.string(),
    maxNeurons: v.number(),
    prompts: v.array(v.string()), // hidden: the judge runs entries on these
    anchors: v.array(v.string()), // hidden: on-target example replies the judge compares with
    startsAt: v.number(),
    endsAt: v.number(),
    par: v.optional(v.object({ score: v.number(), pushes: v.array(push) })),
    settled: v.boolean(),
  })
    .index("by_slug", ["slug"])
    .index("by_ends", ["endsAt"]),

  entries: defineTable({
    bountyId: v.id("bounties"),
    playerId: v.id("players"),
    pushes: v.array(push),
    status: v.union(v.literal("pending"), v.literal("done"), v.literal("failed")),
    score: v.optional(v.number()),
    concept: v.optional(v.number()),
    coherence: v.optional(v.number()),
    texts: v.optional(v.array(v.string())),
  })
    .index("by_bounty", ["bountyId"])
    .index("by_player_bounty", ["playerId", "bountyId"]),
});
