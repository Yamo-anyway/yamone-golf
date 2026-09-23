import {
  type Env,
  type Device,
  ApiError,
  body,
  json,
  hash,
  now,
} from "./shared";
import {
  atomic,
  getRound,
  member,
  stmt,
  uid,
  revision,
  type Check,
} from "./round-store";
import type {
  Delivery,
  Receipt,
  ReceiveAction,
  RecordDetail,
} from "../../shared/records";
import { editAccess } from "../../shared/personal-records";
const deliverySQL = `SELECT d.*,su.nickname sender_name,ru.nickname recipient_name,
 COALESCE(pu.nickname,p.name) player_name,json_extract(r.course_snapshot,'$.name') course_name,
 r.hole_count,r.ended_at,r.creator_id,p.user_id linked_user_id,p.deleted_at slot_deleted,r.status round_status
 FROM deliveries d JOIN rounds r ON r.round_id=d.round_id JOIN player_slots p ON p.slot_id=d.slot_id
 JOIN users su ON su.user_id=d.sender_id JOIN users ru ON ru.user_id=d.recipient_id LEFT JOIN users pu ON pu.user_id=p.user_id`;
type StoredDelivery = Delivery & {
  creator_id: string;
  linked_user_id: string | null;
  slot_deleted: number | null;
  round_status: string;
};
type Action = {
  action_id: string;
  user_id: string;
  delivery_id: string;
  ad_outcome: string | null;
  ad_source: string | null;
  ad_settled_at: number | null;
  completed_receipt_id: string | null;
};
function publicDelivery(v: StoredDelivery, d: Device): Delivery {
  const {
    creator_id,
    linked_user_id: _linked,
    slot_deleted: _deleted,
    round_status: _status,
    ...rest
  } = v;
  return {
    ...rest,
    can_cancel:
      v.status === "pending" &&
      [v.sender_id, v.recipient_id, creator_id].includes(d.user_id),
  };
}
async function delivery(env: Env, id: string) {
  const row = await stmt(
    env,
    deliverySQL + " WHERE d.delivery_id=?",
    id,
  ).first<StoredDelivery>();
  if (!row) throw new ApiError("delivery_not_found", 404);
  return row;
}
const validDelivery = (v: StoredDelivery, d: Device) =>
  v.recipient_id === d.user_id &&
  v.status === "pending" &&
  v.round_status === "ended" &&
  v.linked_user_id === d.user_id &&
  v.slot_deleted === null;
const receipt = async (env: Env, d: Device, id: string) => {
  const r = await stmt(
    env,
    "SELECT * FROM receipts WHERE receipt_id=? AND user_id=?",
    id,
    d.user_id,
  ).first<Receipt>();
  if (!r) throw new ApiError("record_not_found", 404);
  return r;
};
const activeReceipt = (env: Env, d: Device, round: string) =>
  stmt(
    env,
    "SELECT * FROM receipts WHERE user_id=? AND round_id=? AND status='received'",
    d.user_id,
    round,
  ).first<Receipt>();
async function replay(env: Env, d: Device, id: string, fingerprint: string) {
  const old = await stmt(
    env,
    "SELECT request_hash,result_id FROM record_mutations WHERE user_id=? AND mutation_id=?",
    d.user_id,
    id,
  ).first<{ request_hash: string; result_id: string }>();
  if (old && old.request_hash !== fingerprint)
    throw new ApiError("request_reused", 409);
  return old?.result_id;
}
const mutation = (
  env: Env,
  d: Device,
  id: string,
  kind: string,
  fingerprint: string,
  result: string,
) =>
  stmt(
    env,
    "INSERT INTO record_mutations(user_id,mutation_id,kind,request_hash,result_id,created_at) VALUES(?,?,?,?,?,?)",
    d.user_id,
    id,
    kind,
    fingerprint,
    result,
    now(),
  );
const endedMember = (round: string, d: Device): Check => ({
  sql: "SELECT 1 FROM rounds r JOIN round_participants p ON p.round_id=r.round_id WHERE r.round_id=? AND r.status='ended' AND p.user_id=?",
  args: [round, d.user_id],
});
const receiveCheck = (v: StoredDelivery, d: Device): Check => ({
  sql: "SELECT 1 FROM deliveries d JOIN rounds r ON r.round_id=d.round_id JOIN player_slots p ON p.slot_id=d.slot_id AND p.round_id=d.round_id WHERE d.delivery_id=? AND d.recipient_id=? AND d.status='pending' AND p.user_id=? AND p.deleted_at IS NULL AND r.status='ended'",
  args: [v.delivery_id, d.user_id, d.user_id],
});
function userBody(b: Record<string, unknown>, d: Device) {
  if (b.user_id !== d.user_id) throw new ApiError("user_changed", 409);
}
function cursor(url: URL) {
  const value = url.searchParams.get("before");
  if (!value) return null;
  const parts = value.split(":");
  if (parts.length !== 2) throw new ApiError("invalid_request");
  const at = Number(parts[0]);
  if (!Number.isSafeInteger(at) || at < 0)
    throw new ApiError("invalid_request");
  return { at, id: uid(parts[1]) };
}
function page<T>(rows: T[], key: (r: T) => string) {
  return {
    items: rows.slice(0, 20),
    next_cursor: rows.length > 20 ? key(rows[19]) : null,
  };
}
async function action(env: Env, d: Device, id: string) {
  const a = await stmt(
    env,
    "SELECT * FROM receipt_actions WHERE action_id=? AND user_id=?",
    id,
    d.user_id,
  ).first<Action>();
  if (!a) throw new ApiError("not_found", 404);
  return a;
}
async function actionView(
  env: Env,
  d: Device,
  a: Action,
): Promise<ReceiveAction> {
  const v = await delivery(env, a.delivery_id);
  return {
    action_id: a.action_id,
    delivery: publicDelivery(v, d),
    ad_settled: !!(await stmt(
      env,
      "SELECT 1 FROM round_ad_settlements WHERE user_id=? AND round_id=?",
      d.user_id,
      v.round_id,
    ).first()),
    test_ads: ["development", "test", "ui-test"].includes(env.ENVIRONMENT),
    completed_receipt: a.completed_receipt_id
      ? await receipt(env, d, a.completed_receipt_id)
      : v.status === "received"
        ? await stmt(
            env,
            "SELECT * FROM receipts WHERE delivery_id=? AND user_id=?",
            v.delivery_id,
            d.user_id,
          ).first<Receipt>()
        : null,
    available: validDelivery(v, d),
  };
}
async function execute(env: Env, d: Device, a: Action) {
  if (a.completed_receipt_id)
    return json({ receipt: await receipt(env, d, a.completed_receipt_id) });
  const v = await delivery(env, a.delivery_id);
  // Another device/tab can finish the same delivery. Return its existing receipt,
  // including a deleted tombstone, without turning it into a new receive.
  if (v.recipient_id !== d.user_id) throw new ApiError("forbidden", 403);
  if (v.status === "received") {
    const old = await stmt(
      env,
      "SELECT * FROM receipts WHERE delivery_id=? AND user_id=?",
      v.delivery_id,
      d.user_id,
    ).first<Receipt>();
    if (old) return json({ receipt: old });
  }
  if (!validDelivery(v, d)) throw new ApiError("delivery_unavailable", 409);
  if (
    !(await stmt(
      env,
      "SELECT 1 FROM round_ad_settlements WHERE user_id=? AND round_id=?",
      d.user_id,
      v.round_id,
    ).first())
  )
    throw new ApiError("ad_required", 409);
  const existing = await activeReceipt(env, d, v.round_id);
  if (existing) throw new ApiError("already_received", 409);
  const id = crypto.randomUUID(),
    time = now();
  try {
    await atomic(
      env,
      d,
      [
        receiveCheck(v, d),
        {
          sql: "SELECT 1 FROM round_ad_settlements WHERE user_id=? AND round_id=?",
          args: [d.user_id, v.round_id],
        },
        {
          sql: "SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM receipts WHERE user_id=? AND round_id=? AND status='received')",
          args: [d.user_id, v.round_id],
        },
        {
          sql: "SELECT 1 FROM receipt_actions WHERE action_id=? AND user_id=? AND completed_receipt_id IS NULL",
          args: [a.action_id, d.user_id],
        },
      ],
      [
        stmt(
          env,
          "INSERT INTO receipts(receipt_id,round_id,user_id,player_slot_id,delivery_id,status,received_at) VALUES(?,?,?,?,?,'received',?)",
          id,
          v.round_id,
          d.user_id,
          v.slot_id,
          v.delivery_id,
          time,
        ),
        stmt(
          env,
          "UPDATE deliveries SET status='received',updated_at=? WHERE delivery_id=?",
          time,
          v.delivery_id,
        ),
        stmt(
          env,
          "UPDATE receipt_actions SET completed_receipt_id=? WHERE action_id=?",
          id,
          a.action_id,
        ),
      ],
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw e;
    const done = await stmt(
      env,
      "SELECT * FROM receipts WHERE delivery_id=? AND user_id=?",
      v.delivery_id,
      d.user_id,
    ).first<Receipt>();
    if (done) return json({ receipt: done });
    if (!validDelivery(await delivery(env, v.delivery_id), d))
      throw new ApiError("delivery_unavailable", 409);
    if (await activeReceipt(env, d, v.round_id))
      throw new ApiError("already_received", 409);
    throw e;
  }
  return json({ receipt: await receipt(env, d, id) }, 201);
}
export async function recordDetail(
  env: Env,
  d: Device,
  id: string,
): Promise<RecordDetail> {
  const access =
    "EXISTS(SELECT 1 FROM receipts rr WHERE rr.receipt_id=? AND rr.user_id=? AND rr.status='received')";
  const result = await env.DB.batch<any>([
    stmt(
      env,
      `SELECT q.*,r.course_snapshot,r.hole_count,r.ended_at,r.roster_version,
    EXISTS(SELECT 1 FROM round_participants p WHERE p.round_id=q.round_id AND p.user_id=q.user_id) can_manage,
    EXISTS(SELECT 1 FROM player_slots p WHERE p.slot_id=q.player_slot_id AND p.user_id=q.user_id AND p.deleted_at IS NULL) current_player,
    (SELECT version FROM player_slots p WHERE p.slot_id=q.player_slot_id) slot_version
    FROM receipts q JOIN rounds r ON r.round_id=q.round_id WHERE q.receipt_id=? AND q.user_id=?`,
      id,
      d.user_id,
    ),
    stmt(
      env,
      `SELECT p.slot_id,COALESCE(u.nickname,p.name) name,p.position FROM player_slots p LEFT JOIN users u ON u.user_id=p.user_id WHERE p.round_id=(SELECT round_id FROM receipts WHERE receipt_id=?) AND p.deleted_at IS NULL AND ${access} ORDER BY p.position`,
      id,
      id,
      d.user_id,
    ),
    stmt(
      env,
      `SELECT s.slot_id,s.hole,s.strokes,s.version FROM scores s JOIN player_slots p ON p.slot_id=s.slot_id WHERE s.round_id=(SELECT round_id FROM receipts WHERE receipt_id=?) AND p.deleted_at IS NULL AND ${access}`,
      id,
      id,
      d.user_id,
    ),
  ]);
  const row = result[0].results[0];
  if (!row) throw new ApiError("record_not_found", 404);
  const {
    course_snapshot,
    hole_count,
    ended_at,
    roster_version,
    can_manage,
    current_player,
    slot_version,
    ...r
  } = row;
  return {
    receipt: r,
    ended_at,
    can_manage: !!can_manage,
    current_player: !!current_player,
    slot_version,
    edit: editAccess(
      ended_at,
      r.status === "received",
      !!current_player,
      now(),
    ),
    peoria_runs: [],
    sheet:
      r.status === "received"
        ? {
            round_id: r.round_id,
            status: "ended",
            hole_count,
            course: JSON.parse(course_snapshot),
            roster_version,
            target_version: 0,
            slot_ids: [],
            players: result[1].results,
            scores: result[2].results,
          }
        : null,
  };
}
export async function recordsRoute(
  request: Request,
  env: Env,
  d: Device,
): Promise<Response | null> {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  if (path === "/api/record-inbox" && method === "GET") {
    const c = cursor(url);
    const rows = await stmt(
      env,
      deliverySQL +
        ` WHERE d.recipient_id=? AND d.status='pending' AND p.user_id=d.recipient_id AND p.deleted_at IS NULL AND r.status='ended' AND NOT EXISTS(SELECT 1 FROM receipts q WHERE q.round_id=d.round_id AND q.user_id=d.recipient_id AND q.status='received')${c ? " AND (d.created_at<? OR (d.created_at=? AND d.delivery_id<?))" : ""} ORDER BY d.created_at DESC,d.delivery_id DESC LIMIT 21`,
      d.user_id,
      ...(c ? [c.at, c.at, c.id] : []),
    ).all<StoredDelivery>();
    return json(
      page(
        rows.results.map((v) => publicDelivery(v, d)),
        (v) => v.created_at + ":" + v.delivery_id,
      ),
    );
  }
  const rm = path.match(/^\/api\/records\/([^/]+)$/);
  if (rm) {
    const id = uid(rm[1]);
    if (method === "GET") return json(await recordDetail(env, d, id));
    if (method !== "DELETE") throw new ApiError("not_found", 404);
    const b = await body(request);
    userBody(b, d);
    const mutationId = uid(b.mutation_id),
      fingerprint = await hash("delete:" + id);
    if (await replay(env, d, mutationId, fingerprint))
      return json({ receipt: await receipt(env, d, id) });
    await receipt(env, d, id);
    try {
      await atomic(
        env,
        d,
        [
          {
            sql: "SELECT 1 FROM receipts WHERE receipt_id=? AND user_id=?",
            args: [id, d.user_id],
          },
        ],
        [
          stmt(
            env,
            "UPDATE receipts SET status='deleted',deleted_at=COALESCE(deleted_at,?) WHERE receipt_id=? AND user_id=?",
            now(),
            id,
            d.user_id,
          ),
          mutation(env, d, mutationId, "delete", fingerprint, id),
        ],
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) throw e;
      if (!(await replay(env, d, mutationId, fingerprint))) throw e;
    }
    return json({ receipt: await receipt(env, d, id) });
  }
  const dm = path.match(/^\/api\/rounds\/([^/]+)\/deliveries$/);
  if (dm) {
    const round = uid(dm[1]);
    await member(env, d, round);
    if ((await getRound(env, round)).status !== "ended")
      throw new ApiError("round_not_ended", 409);
    if (method === "GET") {
      const c = cursor(url);
      const rows = await stmt(
        env,
        deliverySQL +
          ` WHERE d.round_id=?${c ? " AND (d.created_at<? OR (d.created_at=? AND d.delivery_id<?))" : ""} ORDER BY d.created_at DESC,d.delivery_id DESC LIMIT 21`,
        round,
        ...(c ? [c.at, c.at, c.id] : []),
      ).all<StoredDelivery>();
      return json(
        page(
          rows.results.map((v) => publicDelivery(v, d)),
          (v) => v.created_at + ":" + v.delivery_id,
        ),
      );
    }
    if (method !== "POST") throw new ApiError("not_found", 404);
    const b = await body(request);
    userBody(b, d);
    const mutationId = uid(b.mutation_id),
      slot = uid(b.slot_id),
      version = revision(b.version),
      recipient = uid(b.recipient_id);
    const fingerprint = await hash(
      JSON.stringify(["send", round, slot, version, recipient]),
    );
    const old = await replay(env, d, mutationId, fingerprint);
    if (old)
      return json({ delivery: publicDelivery(await delivery(env, old), d) });
    const p = await stmt(
      env,
      "SELECT version,user_id FROM player_slots WHERE slot_id=? AND round_id=? AND deleted_at IS NULL",
      slot,
      round,
    ).first<{ version: number; user_id: string | null }>();
    if (!p || p.version !== version || p.user_id !== recipient)
      throw new ApiError("player_link_changed", 409);
    const existing = await stmt(
      env,
      "SELECT 1 FROM receipts WHERE user_id=? AND round_id=? AND status='received'",
      recipient,
      round,
    ).first();
    if (existing) throw new ApiError("already_received", 409);
    // Existing pending delivery is returned and the alias request is recorded.
    const pending = await stmt(
      env,
      "SELECT delivery_id FROM deliveries WHERE round_id=? AND slot_id=? AND recipient_id=? AND status='pending'",
      round,
      slot,
      recipient,
    ).first<{ delivery_id: string }>();
    const id = pending?.delivery_id ?? mutationId,
      time = now();
    const checks: Check[] = [
      endedMember(round, d),
      {
        sql: "SELECT 1 FROM player_slots WHERE round_id=? AND slot_id=? AND user_id=? AND version=? AND deleted_at IS NULL",
        args: [round, slot, recipient, version],
      },
      {
        sql: "SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM receipts WHERE round_id=? AND user_id=? AND status='received')",
        args: [round, recipient],
      },
      pending
        ? {
            sql: "SELECT 1 FROM deliveries WHERE delivery_id=? AND status='pending'",
            args: [id],
          }
        : {
            sql: "SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM deliveries WHERE round_id=? AND slot_id=? AND recipient_id=? AND status='pending')",
            args: [round, slot, recipient],
          },
    ];
    try {
      await atomic(env, d, checks, [
        ...(pending
          ? []
          : [
              stmt(
                env,
                "INSERT INTO deliveries(delivery_id,round_id,slot_id,sender_id,recipient_id,status,created_at,updated_at) VALUES(?,?,?,?,?,'pending',?,?)",
                id,
                round,
                slot,
                d.user_id,
                recipient,
                time,
                time,
              ),
            ]),
        mutation(env, d, mutationId, "send", fingerprint, id),
      ]);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) throw e;
      const replayId = await replay(env, d, mutationId, fingerprint);
      if (replayId)
        return json({
          delivery: publicDelivery(await delivery(env, replayId), d),
        });
      throw e;
    }
    return json(
      { delivery: publicDelivery(await delivery(env, id), d) },
      pending ? 200 : 201,
    );
  }
  const cancel = path.match(/^\/api\/deliveries\/([^/]+)\/cancel$/);
  if (cancel && method === "POST") {
    const id = uid(cancel[1]),
      v = await delivery(env, id);
    if (![v.sender_id, v.recipient_id, v.creator_id].includes(d.user_id))
      throw new ApiError("forbidden", 403);
    const b = await body(request);
    userBody(b, d);
    const mutationId = uid(b.mutation_id),
      fingerprint = await hash("cancel:" + id);
    if (await replay(env, d, mutationId, fingerprint))
      return json({ delivery: publicDelivery(await delivery(env, id), d) });
    if (v.status === "received") throw new ApiError("delivery_received", 409);
    try {
      await atomic(
        env,
        d,
        [
          {
            sql: "SELECT 1 FROM deliveries WHERE delivery_id=? AND status IN ('pending','cancelled')",
            args: [id],
          },
        ],
        [
          stmt(
            env,
            "UPDATE deliveries SET status='cancelled',updated_at=? WHERE delivery_id=? AND status='pending'",
            now(),
            id,
          ),
          mutation(env, d, mutationId, "cancel", fingerprint, id),
        ],
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) throw e;
      if (await replay(env, d, mutationId, fingerprint))
        return json({ delivery: publicDelivery(await delivery(env, id), d) });
      if ((await delivery(env, id)).status === "received")
        throw new ApiError("delivery_received", 409);
      throw e;
    }
    return json({ delivery: publicDelivery(await delivery(env, id), d) });
  }
  if (path === "/api/receipt-actions" && method === "POST") {
    const b = await body(request);
    userBody(b, d);
    const id = uid(b.action_id),
      deliveryId = uid(b.delivery_id);
    const old = await stmt(
      env,
      "SELECT * FROM receipt_actions WHERE action_id=?",
      id,
    ).first<Action>();
    if (old) {
      if (old.user_id !== d.user_id) throw new ApiError("not_found", 404);
      if (old.delivery_id !== deliveryId)
        throw new ApiError("request_reused", 409);
      return json(await actionView(env, d, old));
    }
    const v = await delivery(env, deliveryId);
    if (!validDelivery(v, d)) throw new ApiError("delivery_unavailable", 409);
    if (await activeReceipt(env, d, v.round_id))
      throw new ApiError("already_received", 409);
    try {
      await atomic(
        env,
        d,
        [receiveCheck(v, d)],
        [
          stmt(
            env,
            "INSERT INTO receipt_actions(action_id,user_id,delivery_id,created_at) VALUES(?,?,?,?)",
            id,
            d.user_id,
            deliveryId,
            now(),
          ),
        ],
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) throw e;
      const retry = await stmt(
        env,
        "SELECT * FROM receipt_actions WHERE action_id=? AND user_id=? AND delivery_id=?",
        id,
        d.user_id,
        deliveryId,
      ).first<Action>();
      if (retry) return json(await actionView(env, d, retry));
      throw e;
    }
    return json(await actionView(env, d, await action(env, d, id)), 201);
  }
  const am = path.match(/^\/api\/receipt-actions\/([^/]+)(?:\/(ad|execute))?$/);
  if (am) {
    const a = await action(env, d, uid(am[1]));
    if (method === "GET" && !am[2]) return json(await actionView(env, d, a));
    if (method !== "POST") throw new ApiError("not_found", 404);
    const b = await body(request);
    userBody(b, d);
    if (am[2] === "execute") return execute(env, d, a);
    if (am[2] === "ad") {
      const v = await delivery(env, a.delivery_id);
      if ((await actionView(env, d, a)).ad_settled)
        return json(await actionView(env, d, a));
      if (!["development", "test", "ui-test"].includes(env.ENVIRONMENT))
        throw new ApiError("ads_not_configured", 503);
      if (
        ![
          "completed",
          "unavailable",
          "load_failed",
          "show_failed",
          "load_timeout",
        ].includes(String(b.outcome))
      )
        throw new ApiError("ad_interrupted", 409);
      const time = now();
      // Ad settlement remains valid even if a sender cancelled during the ad.
      // It grants no receipt. Execute must still recheck delivery and slot ownership.
      await atomic(
        env,
        d,
        [],
        [
          stmt(
            env,
            "UPDATE receipt_actions SET ad_outcome=?,ad_source='development-test',ad_settled_at=? WHERE action_id=? AND ad_outcome IS NULL",
            String(b.outcome),
            time,
            a.action_id,
          ),
          stmt(
            env,
            "INSERT INTO round_ad_settlements(user_id,round_id,receive_action_id,outcome,source,settled_at) VALUES(?,?,?,?,'development-test',?) ON CONFLICT(user_id,round_id) DO NOTHING",
            d.user_id,
            v.round_id,
            a.action_id,
            String(b.outcome),
            time,
          ),
        ],
      );
      return json(await actionView(env, d, await action(env, d, a.action_id)));
    }
  }
  return null;
}
