import assert from "node:assert/strict";
import { test } from "vitest";
import { createAccountSetup, type SetupSnapshot } from "./accountSetup.ts";

const selecting: SetupSnapshot = { identity: "session:a", authenticated: true, loading: false, player: false };
const playing = { ...selecting, player: true };
const signedOut: SetupSnapshot = { identity: null, authenticated: false, loading: false, player: undefined };
const loading: SetupSnapshot = { identity: undefined, authenticated: false, loading: true, player: undefined };

function fixture(initial = selecting) {
  let open = false;
  let signIns = 0;
  const setup = createAccountSetup(value => { open = value; }, () => { signIns++; });
  setup.mount();
  setup.update(initial);
  const calls: { promise: Promise<boolean>; results: boolean[] }[] = [];
  const request = () => {
    const results: boolean[] = [];
    const promise = setup.request().then(ok => { results.push(ok); return ok; });
    const call = { promise, results };
    calls.push(call);
    return call;
  };
  return { setup, request, calls, open: () => open, signIns: () => signIns };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("simultaneous callers all succeed once, after the player query confirms setup", async () => {
  const f = fixture();
  const calls = [f.request(), f.request(), f.request()];
  let joins = 0;
  await f.setup.submit(async () => { joins++; });
  assert.equal(joins, 1);
  assert.ok(calls.every(c => c.results.length === 0));
  f.setup.update(playing);
  assert.deepEqual(await Promise.all(calls.map(c => c.promise)), [true, true, true]);
  f.setup.update(playing);
  f.setup.cancel();
  assert.ok(calls.every(c => c.results.length === 1));
  assert.equal(f.open(), false);
});

test("an existing player proceeds immediately without opening setup", async () => {
  const f = fixture(playing);
  assert.equal(await f.request().promise, true);
  assert.equal(f.open(), false);
});

test("signed-out callers open sign-in and return false without replaying on login", async () => {
  const f = fixture(signedOut);
  const call = f.request();
  assert.equal(await call.promise, false);
  assert.equal(f.signIns(), 1);
  f.setup.update(playing);
  assert.deepEqual(call.results, [false]);
});

test("initial authentication readiness retains every caller until Convex and the player query settle", async () => {
  const f = fixture(loading);
  const calls = [f.request(), f.request()];
  f.setup.update({ ...playing, loading: true, player: undefined });
  await Promise.resolve();
  assert.ok(calls.every(c => c.results.length === 0));
  f.setup.update({ ...playing, player: undefined });
  await Promise.resolve();
  assert.ok(calls.every(c => c.results.length === 0));
  assert.equal(f.signIns(), 0);
  f.setup.update(playing);
  assert.deepEqual(await Promise.all(calls.map(c => c.promise)), [true, true]);
});

test("initial readiness ending signed out settles all callers without waiting for login", async () => {
  const f = fixture(loading);
  const calls = [f.request(), f.request()];
  f.setup.update(signedOut);
  assert.deepEqual(await Promise.all(calls.map(c => c.promise)), [false, false]);
  assert.equal(f.signIns(), 1);
});

test("dialog cancellation settles everyone and a later explicit request starts fresh", async () => {
  const f = fixture();
  const calls = [f.request(), f.request()];
  f.setup.cancel();
  assert.deepEqual(await Promise.all(calls.map(c => c.promise)), [false, false]);
  f.setup.update(selecting);
  assert.equal(f.open(), false);
  const retry = f.request();
  assert.equal(f.open(), true);
  f.setup.update(playing);
  assert.equal(await retry.promise, true);
  assert.ok(calls.every(c => c.results.length === 1));
});

test("explicit sign-out cancels immediately, before Clerk reports the change", async () => {
  const f = fixture();
  const call = f.request();
  f.setup.cancel(); // SessionProvider cancels before calling clerk.signOut().
  assert.equal(await call.promise, false);
  f.setup.update(signedOut);
  f.setup.update(playing);
  assert.deepEqual(call.results, [false]);
});

test("session expiration cancels setup without requiring a local sign-out click", async () => {
  const f = fixture();
  const calls = [f.request(), f.request()];
  f.setup.update(signedOut);
  assert.deepEqual(await Promise.all(calls.map(c => c.promise)), [false, false]);
  assert.equal(f.open(), false);
  assert.equal(f.signIns(), 0);
});

test("switching directly to another authenticated identity never releases old actions", async () => {
  const f = fixture();
  const call = f.request();
  f.setup.update({ ...playing, identity: "session:b" });
  assert.equal(await call.promise, false);
  assert.equal(await f.request().promise, true);
  assert.deepEqual(call.results, [false]);
});

test("identity changes also cancel calls waiting on initial player-query readiness", async () => {
  const f = fixture({ ...selecting, player: undefined });
  const call = f.request();
  f.setup.update({ ...playing, identity: "session:b" });
  assert.equal(await call.promise, false);
});

test("a new identity without a player gets its own setup dialog", async () => {
  const f = fixture();
  const call = f.request();
  f.setup.update({ ...selecting, identity: "session:b" });
  assert.equal(await call.promise, false);
  assert.equal(f.open(), true);
});

test("same-session token refresh waits for readiness without canceling intent", async () => {
  const f = fixture();
  const call = f.request();
  f.setup.update({ ...selecting, loading: true });
  await Promise.resolve();
  assert.deepEqual(call.results, []);
  f.setup.update(playing);
  assert.equal(await call.promise, true);
});

test("a disappearing known session cancels intent even while authentication is loading", async () => {
  const f = fixture();
  const call = f.request();
  f.setup.update(loading);
  assert.equal(await call.promise, false);
  f.setup.update(playing);
  assert.deepEqual(call.results, [false]);
});

test("a stale Convex player cannot release actions after Clerk has signed out", async () => {
  const f = fixture({ ...playing, identity: null });
  const call = f.request();
  await Promise.resolve();
  assert.deepEqual(call.results, []);
  f.setup.update(signedOut);
  assert.equal(await call.promise, false);
});

test("another-tab player initialization releases all current callers without a local join", async () => {
  const f = fixture();
  const calls = [f.request(), f.request()];
  f.setup.update(playing);
  assert.deepEqual(await Promise.all(calls.map(c => c.promise)), [true, true]);
  assert.equal(f.open(), false);
});

test("unmount cancels readiness and setup waiters, and disposed callbacks cannot act", async () => {
  for (const initial of [loading, selecting]) {
    const f = fixture(initial);
    const calls = [f.request(), f.request()];
    f.setup.dispose();
    assert.deepEqual(await Promise.all(calls.map(c => c.promise)), [false, false]);
    f.setup.update(playing);
    assert.equal(await f.request().promise, false);
    assert.ok(calls.every(c => c.results.length === 1));
  }
});

test("effect cleanup and remount can start a fresh setup (React Strict Mode)", async () => {
  const f = fixture();
  const old = f.request();
  f.setup.dispose();
  assert.equal(await old.promise, false);
  f.setup.mount();
  f.setup.update(selecting);
  const next = f.request();
  f.setup.update(playing);
  assert.equal(await next.promise, true);
  assert.deepEqual(old.results, [false]);
});

test("join failure cancels waiting actions, preserves the error, and allows an explicit retry", async () => {
  const f = fixture();
  const calls = [f.request(), f.request()];
  const error = new Error("handle taken");
  await assert.rejects(f.setup.submit(async () => { throw error; }), e => e === error);
  assert.deepEqual(await Promise.all(calls.map(c => c.promise)), [false, false]);
  assert.equal(f.open(), true); // JoinDialog can display the original mutation error.
  const retry = f.request();
  await f.setup.submit(async () => {});
  f.setup.update(playing);
  assert.equal(await retry.promise, true);
});

test("another-tab initialization wins even when a redundant local join subsequently fails", async () => {
  const f = fixture();
  const call = f.request();
  const join = deferred();
  const operation = f.setup.submit(() => join.promise);
  f.setup.update(playing);
  assert.equal(await call.promise, true);
  join.reject(new Error("already have a handle"));
  await assert.rejects(operation);
  assert.deepEqual(call.results, [true]);
});

for (const outcome of ["success", "failure"] as const) {
  test(`late join ${outcome} after identity switch cannot affect the next user's setup`, async () => {
    const f = fixture();
    const old = f.request();
    const join = deferred();
    const operation = f.setup.submit(() => join.promise);
    f.setup.update({ ...selecting, identity: "session:b" });
    assert.equal(await old.promise, false);
    const next = f.request();
    if (outcome === "success") { join.resolve(); await operation; }
    else { join.reject(new Error("old session failed")); await assert.rejects(operation); }
    await Promise.resolve();
    assert.deepEqual(next.results, []);
    f.setup.update({ ...playing, identity: "session:b" });
    assert.equal(await next.promise, true);
    assert.deepEqual(old.results, [false]);
  });
}

test("canceling an in-flight join prevents its completion from replaying canceled actions", async () => {
  const f = fixture();
  const call = f.request();
  const join = deferred();
  const operation = f.setup.submit(() => join.promise);
  f.setup.cancel();
  assert.equal(await call.promise, false);
  join.resolve();
  await operation;
  f.setup.update(playing);
  assert.deepEqual(call.results, [false]);
});

test("unmount during join prevents its completion from releasing pending intent", async () => {
  const f = fixture();
  const call = f.request();
  const join = deferred();
  const operation = f.setup.submit(() => join.promise);
  f.setup.dispose();
  join.resolve();
  await operation;
  assert.equal(await call.promise, false);
});
