import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requestRecoveryCode,
  submitEmailRecovery,
  type EmailRecoveryStorage,
} from "../src/data/email-recovery";
import type { Vault } from "../src/data/model";

function memory(initial: Vault = {}) {
  let value = structuredClone(initial);
  const writes: Vault[] = [];
  const store: EmailRecoveryStorage = {
    durableSecret: true,
    read: async () => structuredClone(value),
    write: async (next) => {
      value = structuredClone(next);
      writes.push(structuredClone(next));
    },
  };
  return { store, writes, value: () => value };
}

test("email code request is durable first and reuses its ID after a lost response", async () => {
  const state = memory();
  const sent: string[] = [];
  let lose = true;
  const send = async (value: { request_id: string }) => {
    sent.push(value.request_id);
    if (lose) throw new Error("lost response");
    return { status: "accepted" as const };
  };
  await assert.rejects(
    requestRecoveryCode(
      state.store,
      " Player@Example.com ",
      "en",
      () => "request-1",
      send,
    ),
  );
  assert.deepEqual(state.value().emailRecovery, {
    request_id: "request-1",
    email: "player@example.com",
  });
  lose = false;
  await requestRecoveryCode(
    state.store,
    "player@example.com",
    "en",
    () => "must-not-be-used",
    send,
  );
  assert.deepEqual(sent, ["request-1", "request-1"]);
  assert.equal(state.value().emailRecovery?.sent, true);
});

test("email claim persists one device and replacement key across response loss", async () => {
  const state = memory({
    emailRecovery: { request_id: "request-2", sent: true },
  });
  let generated = 0;
  const payloads: unknown[] = [];
  let lose = true;
  const make = async () => {
    generated++;
    return { device_secret: "d".repeat(64), next_recovery_key: "next-key" };
  };
  const send = async (value: unknown) => {
    payloads.push(value);
    if (lose) throw new Error("lost response");
    return {
      profile: {
        user_id: "user",
        nickname: "야모",
        personal_code: "CODE",
        personal_qr: "yamone-golf://player/CODE",
        language: "ko" as const,
        created_at: 1,
        updated_at: 1,
      },
      server_time: 1,
    };
  };
  await assert.rejects(
    submitEmailRecovery(state.store, "request-2", "CODE", make, send),
  );
  lose = false;
  await submitEmailRecovery(state.store, "request-2", "CODE", make, send);
  assert.equal(generated, 1);
  assert.deepEqual(payloads[0], payloads[1]);
  assert.deepEqual(state.value(), {
    secret: "d".repeat(64),
    keyToSave: "next-key",
  });
});

test("email recovery never publishes credentials when durable storage fails", async () => {
  let sent = false;
  const store: EmailRecoveryStorage = {
    durableSecret: true,
    read: async () => ({}),
    write: async () => {
      throw new Error("storage");
    },
  };
  await assert.rejects(
    submitEmailRecovery(
      store,
      "request-3",
      "CODE",
      async () => ({
        device_secret: "e".repeat(64),
        next_recovery_key: "next-key",
      }),
      async () => {
        sent = true;
        throw new Error("must not run");
      },
    ),
  );
  assert.equal(sent, false);
});
