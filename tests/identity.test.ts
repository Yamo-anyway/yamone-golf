import { test } from "node:test";
import assert from "node:assert/strict";
import {
  submitIdentity,
  recoveryKeyFromBytes,
  type IdentityStorage,
} from "../src/data/identity";
import type { PendingIdentity, Vault, IdentityResult } from "../src/data/model";
const pending: PendingIdentity = {
  kind: "register",
  nickname: "야모",
  device_secret: "a".repeat(64),
  recovery_key: recoveryKeyFromBytes(new Uint8Array(32)),
};
const result = {
  profile: { user_id: "same-user" },
  server_time: 1,
} as IdentityResult;
function storage(durableSecret = true) {
  let value: Vault = {};
  return {
    durableSecret,
    read: async () => structuredClone(value),
    write: async (v: Vault) => {
      value = structuredClone(v);
    },
  } satisfies IdentityStorage;
}
test("credential storage failure prevents sending registration", async () => {
  let sent = false;
  const store = {
    ...storage(),
    write: async () => {
      throw new Error("disk");
    },
  };
  await assert.rejects(
    submitIdentity(
      store,
      async () => pending,
      async () => {
        sent = true;
        return result;
      },
    ),
  );
  assert.equal(sent, false);
});
test("lost response keeps the exact pending request for a restart and retry", async () => {
  const store = storage();
  await assert.rejects(
    submitIdentity(
      store,
      async () => pending,
      async () => {
        throw new Error("response lost");
      },
    ),
  );
  assert.deepEqual((await store.read()).pending, pending);
  await submitIdentity(
    store,
    async () => {
      throw new Error("must not make a second user");
    },
    async (p) => {
      assert.deepEqual(p, pending);
      return result;
    },
  );
  assert.equal((await store.read()).secret, pending.device_secret);
  assert.equal((await store.read()).keyToSave, pending.recovery_key);
  assert.equal((await store.read()).pending, undefined);
});
test("web removes pending bearer material only after server success", async () => {
  const store = storage(false);
  await submitIdentity(
    store,
    async () => pending,
    async () => result,
  );
  assert.equal((await store.read()).secret, undefined);
  assert.equal((await store.read()).pending, undefined);
  assert.equal((await store.read()).keyToSave, pending.recovery_key);
});
test("recovery displays the replacement key rather than the consumed key", async () => {
  const store = storage();
  const restored: PendingIdentity = {
    ...pending,
    kind: "recover",
    next_recovery_key: "replacement",
  };
  await submitIdentity(
    store,
    async () => restored,
    async () => result,
  );
  assert.equal((await store.read()).keyToSave, "replacement");
});
