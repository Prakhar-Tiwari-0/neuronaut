import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import { Nav } from "./components/Nav";
import { Bounty } from "./pages/Bounties";
import { Dex, Seen } from "./pages/Dex";
import { Trainers } from "./pages/Trainers";

const h = vi.hoisted(() => ({ mode: "dex" }));

vi.mock("convex/react", () => ({
  useQuery: () => {
    if (h.mode === "trainers") {
      return [
        {
          handle: "Bartholomew-Fitz",
          points: 12840,
          caught: 3,
          dailySolved: 12,
          streak: 4,
          bestStreak: 9,
          bountyWins: 1,
        },
      ];
    }
    if (h.mode === "bounty") {
      return {
        title: "The sea",
        brief: "Make the model talk about the sea.",
        state: "open",
        endsAt: Date.now() + 86_400_000,
        startsAt: Date.now() - 1000,
        maxNeurons: 3,
        par: 40,
        leaderboard: [],
        mine: [],
        entriesLeft: 8,
      };
    }
    if (h.mode === "seen") {
      return [
        {
          layer: 6,
          n: 12,
          rarity: "rare",
          words: ["bartholomew.fitzgerald", "ocean"],
          source: "scan",
          caughtBy: null,
        },
      ];
    }
    // Dex reads totals; the caught map maps the same result. An empty array with those fields serves both.
    return Object.assign([], { caught: 1, profiled: 12, total: 294912 });
  },
  usePaginatedQuery: () => ({
    results: [
      {
        layer: 31,
        n: 9215,
        name: "Aleksandra-Wisniewska",
        rarity: "legendary",
        words: ["ocean", "doctor"],
        handle: "Bartholomew-Fitz",
        points: 1284,
        at: 1_700_000_000_000,
      },
    ],
    status: "Exhausted",
    loadMore: () => {},
  }),
  useMutation: () => async () => {},
}));

vi.mock("./lib/session", () => ({
  useSession: () => ({
    me: {
      handle: "Bartholomew-Fitz",
      points: 1284,
      scansLeft: 12,
      catchesLeft: 3,
      predicted: 0,
      predictedRight: 0,
    },
    signedIn: true,
    requireJoin: async () => true,
    signIn: () => {},
    signOut: () => {},
  }),
  errorText: () => "error",
}));

beforeEach(() => {
  h.mode = "dex";
  const store = new Map<string, string>([["neuronaut:seen-howto", "1"]]);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
  vi.stubGlobal("document", {
    documentElement: { classList: { contains: () => false, toggle: () => {}, add: () => {}, remove: () => {} } },
    querySelector: () => null,
  });
});

const page = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

test("a 16-character handle truncates in the nav instead of stretching the row", () => {
  const html = page(<Nav />);
  expect(html).toContain('title="Bartholomew-Fitz"');
  expect(html).toContain("min-w-0 truncate");
  expect(html).toContain("Bartholomew-Fitz");
  expect(html).toContain("Sign out");
  expect(html).toContain('href="/t/Bartholomew-Fitz"');
});

test("a 24-character catch name stays in the dex scroller with its words and trainer", () => {
  const html = page(<Dex />);
  expect(html).toContain('aria-label="Caught neurons"');
  expect(html).toContain("overflow-x-auto");
  expect(html).toContain('title="Aleksandra-Wisniewska"');
  expect(html).toContain("Aleksandra-Wisniewska");
  expect(html).toContain("legendary");
  expect(html).toContain("ocean");
  expect(html).toContain('title="Bartholomew-Fitz"');
  expect(html).not.toContain("hidden md:table-cell");
  expect(html).not.toContain("hidden sm:table-cell");
});

test("seen neurons keep a long token inside the same horizontal scroller", () => {
  h.mode = "seen";
  const html = page(<Seen signedIn />);
  expect(html).toContain('aria-label="Neurons you have seen"');
  expect(html).toContain("overflow-x-auto");
  expect(html).toContain("bartholomew.fitzgerald");
  expect(html).toContain("rare");
});

test("the trainers leaderboard scrolls its columns instead of wrapping the header", () => {
  h.mode = "trainers";
  const html = page(<Trainers />);
  expect(html).toContain('aria-label="Trainer leaderboard"');
  expect(html).toContain("overflow-x-auto");
  expect(html).toContain("whitespace-nowrap");
  expect(html).toContain("Bartholomew-Fitz");
  expect(html).toContain("bounty wins");
  expect(html).toContain('href="/t/Bartholomew-Fitz"');
});

test("a bounty dose stays grouped with its neuron when the row wraps", () => {
  h.mode = "bounty";
  const html = page(<Bounty />);
  expect(html).toContain("flex flex-wrap items-center gap-2");
  expect(html).toContain("flex shrink-0 items-center gap-2");
  expect(html).toMatch(/flex shrink-0 items-center gap-2">[\s\S]*aria-label="dose"/);
  expect(html).toContain('aria-label="layer"');
  expect(html).toContain('aria-label="neuron"');
});
