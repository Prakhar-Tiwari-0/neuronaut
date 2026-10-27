// Game rules that are hard to see from the UI, run against the real Convex functions (validators, schema, indexes)
// through convex-test. Each test is named for the failure it catches.
import { describe, test } from "vitest";

describe("accounts", () => {
  test.todo("a signed-out caller can't scan, catch, guess or enter");
  test.todo("one sign-in can't create two players");
  test.todo("a signed-in caller without a player is told to pick a handle");
  test.todo("handles are unique regardless of case");
});

describe("GPU budget", () => {
  test.todo("a player can't have more than MAX_PENDING jobs waiting on the GPU");
  test.todo("past the global queue cap, new GPU work is refused for everyone");
  test.todo("a refused scan doesn't use up one of the day's scans");
  test.todo("work that needs no GPU (already measured neurons) is never refused");
});
