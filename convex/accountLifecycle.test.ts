// Pure production coordinator used by SessionProvider; no browser, Clerk client or network.
import { expect, test } from "vitest";
import { createAccountGate } from "../src/lib/accountGate";

const setup = () => {
  const gate = createAccountGate();
  gate.update("alice-session", "needs-handle");
  return gate;
};

test("all simultaneous actions wait until the player query confirms readiness", async () => {
  const gate = setup();
  const results: boolean[] = [];
  const pending = [gate.request(), gate.request(), gate.request()];
  pending.forEach((p) => void p.then((r) => results.push(r)));
  await Promise.resolve();
  expect(results).toEqual([]); // A successful join mutation alone does not change the gate.
  gate.update("alice-session", "ready");
  expect(await Promise.all(pending)).toEqual([true, true, true]);
  gate.update("alice-session", "ready");
  gate.cancel();
  await Promise.resolve();
  expect(results).toEqual([true, true, true]);
});

test.each(["loading", "needs-handle"] as const)("switching accounts cancels %s actions even if the new player is ready", async (state) => {
  const gate = setup();
  gate.update("alice-session", state);
  const pending = gate.request();
  gate.update("bob-session", "ready");
  expect(await pending).toBe(false);
  expect(await gate.request()).toBe(true);
});

test.each(["loading", "needs-handle", "ready"] as const)("sign-out cancels %s actions before their continuation runs", async (state) => {
  const gate = setup();
  gate.update("alice-session", state);
  const pending = gate.request();
  gate.update(null, "signed-out");
  expect(await pending).toBe(false);
  expect(await gate.request()).toBe(false);
});

test.each(["loading", "needs-handle"] as const)("unmount settles %s waiters and ignores late readiness", async (state) => {
  const gate = setup();
  gate.update("alice-session", state);
  const pending = gate.request();
  gate.dispose();
  gate.update("alice-session", "ready");
  expect(await pending).toBe(false);
  expect(await gate.request()).toBe(false);
});

test("dialog cancellation or join failure cancels the attempt without stranding subsequent callers", async () => {
  const gate = setup();
  const first = gate.request();
  gate.cancel();
  expect(await first).toBe(false);
  const retry = gate.request();
  gate.update("alice-session", "ready");
  expect(await retry).toBe(true);
});

test("another-tab setup releases same-session actions only when its player query is ready", async () => {
  const gate = setup();
  const pending = gate.request();
  gate.update("alice-session", "loading");
  gate.update("alice-session", "ready");
  expect(await pending).toBe(true);
});

test("auth readiness can progress to handle setup without losing the original action", async () => {
  const gate = createAccountGate();
  gate.update("alice-session", "loading");
  const pending = gate.request();
  gate.update("alice-session", "needs-handle");
  gate.update("alice-session", "ready");
  expect(await pending).toBe(true);
});

test("StrictMode cleanup never resurrects old waiters when setup activates again", async () => {
  const gate = setup();
  const pending = gate.request();
  gate.dispose();
  gate.activate();
  gate.update("alice-session", "ready");
  expect(await pending).toBe(false);
  expect(await gate.request()).toBe(true);
});


test("a rejected join cancels every waiting action but permits an explicit retry", async () => {
  const gate = setup();
  const pending = [gate.request(), gate.request()];
  await expect(gate.setup(async () => { throw new Error("handle taken"); })).rejects.toThrow("handle taken");
  expect(await Promise.all(pending)).toEqual([false, false]);
  const retry = gate.request();
  await gate.setup(async () => {});
  gate.update("alice-session", "ready");
  expect(await retry).toBe(true);
});

test("a successful join response alone does not resume gameplay before the player query", async () => {
  const gate = setup();
  let resumed = false;
  const pending = gate.request().then((ok) => { resumed = ok; return ok; });
  await gate.setup(async () => {});
  expect(resumed).toBe(false);
  gate.update("alice-session", "ready");
  expect(await pending).toBe(true);
});

test("an old account's rejected join cannot cancel the new account's setup", async () => {
  const gate = setup();
  let reject!: (error: Error) => void;
  const mutation = gate.setup(() => new Promise((_, no) => { reject = no; }));
  const failure = expect(mutation).rejects.toThrow("old failure");
  const old = gate.request();
  gate.update("bob-session", "needs-handle");
  const current = gate.request();
  reject(new Error("old failure"));
  await failure;
  expect(await old).toBe(false);
  gate.update("bob-session", "ready");
  expect(await current).toBe(true);
});
