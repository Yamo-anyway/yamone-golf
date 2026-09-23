import {
  stmt,
  uid,
  revision,
  getRound,
  member,
  atomic,
  liveCheck,
  type Round,
  type Check,
} from "./round-store";
import { personalRecordsRoute } from "./personal-records";
import { peoriaRoute } from "./peoria";
import { recordsRoute } from "./records";
import { lifecycleRoute } from "./round-lifecycle";
import { scoresRoute } from "./scores";
import { playersRoute } from "./players";
import {
  ApiError,
  authenticate,
  body,
  json,
  limit,
  nickname,
  now,
  randomCode,
  type Device,
  type Env,
} from "./shared";

type Segment = { name: string; pars: number[] };
type Course = {
  course_id: string;
  name: string;
  region: string;
  segments_json: string;
  version: number;
};
type Action = {
  action_id: string;
  user_id: string;
  kind: "create" | "join";
  payload_json: string;
  ad_outcome: string | null;
  ad_source: string | null;
  ad_settled_at: number | null;
  completed_round_id: string | null;
};
function text(v: unknown, max: number, optional = false) {
  if (typeof v !== "string") throw new ApiError("invalid_course");
  const s = v.trim().normalize("NFC");
  if (
    (!optional && !s) ||
    Array.from(s).length > max ||
    /[\u0000-\u001f\u007f]/.test(s)
  )
    throw new ApiError("invalid_course");
  return s;
}
function courseInput(b: Record<string, unknown>) {
  if (
    !Array.isArray(b.segments) ||
    b.segments.length < 1 ||
    b.segments.length > 9
  )
    throw new ApiError("invalid_course");
  const segments: Segment[] = b.segments.map((s: unknown) => {
    if (!s || typeof s !== "object") throw new ApiError("invalid_course");
    const v = s as Record<string, unknown>;
    if (
      !Array.isArray(v.pars) ||
      v.pars.length !== 9 ||
      v.pars.some((p) => !Number.isInteger(p) || p < 3 || p > 7)
    )
      throw new ApiError("invalid_course");
    return { name: text(v.name, 30), pars: v.pars };
  });
  if (new Set(segments.map((s) => s.name)).size !== segments.length)
    throw new ApiError("duplicate_segment");
  return {
    name: text(b.name, 80),
    region: text(b.region ?? "", 80, true),
    segments,
  };
}
function courseView(c: Course) {
  const { segments_json, ...rest } = c;
  return { ...rest, segments: JSON.parse(segments_json) as Segment[] };
}
async function getCourse(env: Env, id: string) {
  const c = await stmt(
    env,
    "SELECT * FROM courses WHERE course_id=?",
    id,
  ).first<Course>();
  if (!c) throw new ApiError("course_not_found", 404);
  return c;
}
async function activeRound(env: Env, user: string) {
  const current = await stmt(
    env,
    "SELECT r.* FROM active_round_users a JOIN rounds r ON r.round_id=a.round_id WHERE a.user_id=? AND r.status='active'",
    user,
  ).first<Round>();
  if (!current) return null;
  const latest = await getRound(env, current.round_id);
  return latest.status === "active" ? latest : null;
}
function roundView(r: Round) {
  const { course_snapshot, ...rest } = r;
  return { ...rest, course: JSON.parse(course_snapshot) };
}
async function action(env: Env, d: Device, id: string) {
  const a = await stmt(
    env,
    "SELECT * FROM round_actions WHERE action_id=? AND user_id=?",
    id,
    d.user_id,
  ).first<Action>();
  if (!a) throw new ApiError("not_found", 404);
  return a;
}
async function mine(env: Env, d: Device) {
  // A single SQL statement gives list rows and version from one snapshot.
  const row = await stmt(
    env,
    `SELECT COALESCE((SELECT version FROM course_lists WHERE user_id=?),0) AS version,
    (SELECT json_group_array(json(item)) FROM (SELECT json_object('course_id',c.course_id,'name',c.name,'region',c.region,'segments',json(c.segments_json),'version',c.version) AS item FROM user_courses u JOIN courses c ON c.course_id=u.course_id WHERE u.user_id=? ORDER BY u.sort_order,c.course_id)) AS items`,
    d.user_id,
    d.user_id,
  ).first<{ version: number; items: string }>();
  return { version: row!.version, courses: JSON.parse(row!.items) };
}
const freeCheck = (d: Device): Check => ({
  sql: "SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM active_round_users WHERE user_id=?)",
  args: [d.user_id],
});
async function precheck(env: Env, d: Device, a: Action) {
  if (a.completed_round_id) return;
  const active = await activeRound(env, d.user_id);
  const p = JSON.parse(a.payload_json);
  if (active && !(a.kind === "join" && active.round_id === p.round_id))
    throw new ApiError("active_round_exists", 409);
  if (a.kind === "join") {
    if ((await getRound(env, p.round_id)).status !== "active")
      throw new ApiError("round_ended", 409);
    if (
      p.invitation_id &&
      !(await stmt(
        env,
        "SELECT 1 FROM round_invitations WHERE invitation_id=? AND recipient_id=? AND round_id=? AND status='pending'",
        p.invitation_id,
        d.user_id,
        p.round_id,
      ).first())
    )
      throw new ApiError("invitation_unavailable", 409);
  }
}
async function actionView(env: Env, d: Device, a: Action) {
  const p = JSON.parse(a.payload_json);
  const settled =
    a.kind === "join"
      ? await stmt(
          env,
          "SELECT 1 FROM round_ad_settlements WHERE user_id=? AND round_id=?",
          d.user_id,
          p.round_id,
        ).first()
      : null;
  return {
    action_id: a.action_id,
    kind: a.kind,
    ad_settled: !!a.ad_outcome || !!settled,
    completed_round_id: a.completed_round_id,
    summary:
      a.kind === "create" ? p : roundView(await getRound(env, p.round_id)),
    test_ads: ["development", "test", "ui-test"].includes(env.ENVIRONMENT),
  };
}
async function execute(env: Env, d: Device, a: Action) {
  if (a.completed_round_id)
    return json({
      round: roundView(await getRound(env, a.completed_round_id)),
    });
  await precheck(env, d, a);
  const p = JSON.parse(a.payload_json);
  const existing =
    a.kind === "join"
      ? await stmt(
          env,
          "SELECT 1 FROM round_ad_settlements WHERE user_id=? AND round_id=?",
          d.user_id,
          p.round_id,
        ).first()
      : null;
  if (!a.ad_outcome && !existing) throw new ApiError("ad_required", 409);
  const id = a.kind === "create" ? a.action_id : p.round_id;
  const time = now();
  const checks: Check[] = [
    {
      sql: "SELECT 1 FROM round_actions WHERE action_id=? AND user_id=? AND completed_round_id IS NULL",
      args: [a.action_id, d.user_id],
    },
  ];
  const writes: D1PreparedStatement[] = [];
  if (a.kind === "create") {
    checks.push(freeCheck(d));
    writes.push(
      stmt(
        env,
        "INSERT INTO rounds(round_id,creator_id,join_code,course_snapshot,hole_count,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        id,
        d.user_id,
        randomCode(),
        JSON.stringify(p.course),
        p.hole_count,
        time,
        time,
      ),
    );
    p.players.forEach((player: { name: string; self: boolean }, i: number) =>
      writes.push(
        stmt(
          env,
          "INSERT INTO player_slots(slot_id,round_id,user_id,name,position) VALUES(?,?,?,?,?)",
          crypto.randomUUID(),
          id,
          player.self ? d.user_id : null,
          player.name,
          i,
        ),
      ),
    );
  } else {
    checks.push(liveCheck(id), {
      sql: "SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM active_round_users WHERE user_id=? AND round_id<>?)",
      args: [d.user_id, id],
    });
    if (p.invitation_id)
      checks.push({
        sql: "SELECT 1 FROM round_invitations WHERE invitation_id=? AND recipient_id=? AND status='pending'",
        args: [p.invitation_id, d.user_id],
      });
    writes.push(
      stmt(
        env,
        "UPDATE rounds SET updated_at=?,record_version=record_version+1 WHERE round_id=?",
        time,
        id,
      ),
    );
  }
  writes.push(
    stmt(
      env,
      "INSERT INTO round_participants(round_id,user_id,joined_at,can_end) VALUES(?,?,?,?) ON CONFLICT(round_id,user_id) DO NOTHING",
      id,
      d.user_id,
      time,
      a.kind === "create" ? 1 : 0,
    ),
    stmt(
      env,
      "INSERT INTO active_round_users(user_id,round_id) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET round_id=excluded.round_id",
      d.user_id,
      id,
    ),
    stmt(
      env,
      "UPDATE round_actions SET completed_round_id=? WHERE action_id=?",
      id,
      a.action_id,
    ),
    stmt(
      env,
      "UPDATE round_invitations SET status='accepted',updated_at=? WHERE round_id=? AND recipient_id=? AND status='pending'",
      time,
      id,
      d.user_id,
    ),
  );
  if (a.ad_outcome)
    writes.push(
      stmt(
        env,
        "INSERT INTO round_ad_settlements(user_id,round_id,action_id,outcome,source,settled_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,round_id) DO NOTHING",
        d.user_id,
        id,
        a.action_id,
        a.ad_outcome,
        a.ad_source!,
        a.ad_settled_at!,
      ),
    );
  try {
    await atomic(env, d, checks, writes);
  } catch (e) {
    const latest = await action(env, d, a.action_id);
    if (latest.completed_round_id)
      return json({
        round: roundView(await getRound(env, latest.completed_round_id)),
      });
    await precheck(env, d, latest);
    throw e;
  }
  return json({ round: roundView(await getRound(env, id)) }, 201);
}
export async function golfRoute(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  const d = await authenticate(request, env);
  if (method !== "GET")
    await limit(request, env, `golf:${d.user_id}`, 120, 60_000);
  const personal = await personalRecordsRoute(request, env, d);
  if (personal) return personal;
  const peoria = await peoriaRoute(request, env, d);
  if (peoria) return peoria;
  const records = await recordsRoute(request, env, d);
  if (records) return records;
  const lifecycle = await lifecycleRoute(request, env, d);
  if (lifecycle) return lifecycle;
  if (path === "/api/courses" && method === "GET") {
    const q = (url.searchParams.get("q") ?? "").slice(0, 80),
      offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
    if (!Number.isSafeInteger(offset) || offset > 100000)
      throw new ApiError("invalid_request");
    const rows = await stmt(
      env,
      "SELECT * FROM courses WHERE instr(lower(name||' '||region),lower(?))>0 ORDER BY name,course_id LIMIT 31 OFFSET ?",
      q,
      offset,
    ).all<Course>();
    return json({
      courses: rows.results.slice(0, 30).map(courseView),
      next_offset: rows.results.length > 30 ? offset + 30 : null,
    });
  }
  if (path === "/api/courses" && method === "POST") {
    const b = await body(request),
      id = uid(b.course_id),
      v = courseInput(b);
    const old = await stmt(
      env,
      "SELECT * FROM courses WHERE course_id=?",
      id,
    ).first<Course & { created_by: string }>();
    if (old) {
      if (
        old.created_by !== d.user_id ||
        old.name !== v.name ||
        old.region !== v.region ||
        old.segments_json !== JSON.stringify(v.segments)
      )
        throw new ApiError("request_reused", 409);
      return json({ course: courseView(old) });
    }
    await atomic(
      env,
      d,
      [],
      [
        stmt(
          env,
          "INSERT INTO courses(course_id,name,region,segments_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
          id,
          v.name,
          v.region,
          JSON.stringify(v.segments),
          d.user_id,
          now(),
          now(),
        ),
      ],
    );
    return json({ course: courseView(await getCourse(env, id)) }, 201);
  }
  const courseMatch = path.match(/^\/api\/courses\/([^/]+)$/);
  if (courseMatch && ["GET", "PATCH"].includes(method)) {
    const id = uid(courseMatch[1]);
    await getCourse(env, id);
    if (method === "PATCH") {
      const b = await body(request),
        v = courseInput(b),
        version = revision(b.version);
      await atomic(
        env,
        d,
        [
          {
            sql: "SELECT 1 FROM courses WHERE course_id=? AND version=?",
            args: [id, version],
          },
        ],
        [
          stmt(
            env,
            "UPDATE courses SET name=?,region=?,segments_json=?,version=version+1,updated_at=? WHERE course_id=?",
            v.name,
            v.region,
            JSON.stringify(v.segments),
            now(),
            id,
          ),
        ],
        "course_changed",
      );
    }
    return json({ course: courseView(await getCourse(env, id)) });
  }
  if (path === "/api/me/courses" && method === "GET")
    return json(await mine(env, d));
  if (path === "/api/me/courses" && method === "PATCH") {
    const b = await body(request),
      version = revision(b.version);
    const current = await mine(env, d);
    if (current.version !== version) throw new ApiError("list_changed", 409);
    let ids: string[] = current.courses.map((c: Course) => c.course_id);
    if (b.action === "add") {
      const id = uid(b.course_id);
      await getCourse(env, id);
      if (!ids.includes(id)) ids.push(id);
    } else if (b.action === "remove")
      ids = ids.filter((id) => id !== uid(b.course_id));
    else if (b.action === "reorder") {
      if (!Array.isArray(b.course_ids)) throw new ApiError("invalid_request");
      const requested = b.course_ids.map(uid);
      if (
        requested.length !== ids.length ||
        new Set(requested).size !== ids.length ||
        requested.some((id) => !ids.includes(id))
      )
        throw new ApiError("invalid_request");
      ids = requested;
    } else throw new ApiError("invalid_request");
    if (ids.length > 100) throw new ApiError("course_list_full");
    await atomic(
      env,
      d,
      [
        {
          sql: "SELECT 1 WHERE COALESCE((SELECT version FROM course_lists WHERE user_id=?),0)=?",
          args: [d.user_id, version],
        },
      ],
      [
        stmt(
          env,
          "INSERT INTO course_lists(user_id,version) VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET version=version+1",
          d.user_id,
        ),
        stmt(env, "DELETE FROM user_courses WHERE user_id=?", d.user_id),
        ...ids.map((id, i) =>
          stmt(
            env,
            "INSERT INTO user_courses(user_id,course_id,sort_order) VALUES(?,?,?)",
            d.user_id,
            id,
            i,
          ),
        ),
      ],
      "list_changed",
    );
    return json(await mine(env, d));
  }
  if (path === "/api/home" && method === "GET") {
    const r = await activeRound(env, d.user_id);
    const invites = await stmt(
      env,
      "SELECT i.invitation_id,i.round_id,u.nickname AS sender_name,r.course_snapshot,r.hole_count FROM round_invitations i JOIN rounds r ON r.round_id=i.round_id JOIN users u ON u.user_id=i.sender_id WHERE i.recipient_id=? AND i.status='pending' AND r.status='active' AND r.updated_at>CAST(unixepoch('subsec')*1000 AS INTEGER)-21600000 ORDER BY i.created_at DESC LIMIT 100",
      d.user_id,
    ).all<{ course_snapshot: string }>();
    const ended = await stmt(
      env,
      "SELECT r.* FROM rounds r JOIN round_participants p ON p.round_id=r.round_id WHERE p.user_id=? AND r.status='ended' AND NOT EXISTS(SELECT 1 FROM receipts q WHERE q.round_id=r.round_id AND q.user_id=p.user_id) ORDER BY r.ended_at DESC LIMIT 10",
      d.user_id,
    ).all<Round>();
    return json({
      ended_rounds: ended.results.map(roundView),
      active_round: r ? roundView(r) : null,
      invitations: invites.results.map(({ course_snapshot, ...rest }) => ({
        ...rest,
        course: JSON.parse(course_snapshot),
      })),
    });
  }
  if (path === "/api/rounds/lookup" && method === "POST") {
    await limit(request, env, `lookup:${d.user_id}`, 30, 60_000);
    const b = await body(request);
    const code =
      typeof b.code === "string"
        ? b.code.replace(/[\s-]/g, "").toUpperCase()
        : "";
    const r = await stmt(
      env,
      "SELECT * FROM rounds WHERE join_code=? AND status='active'",
      code,
    ).first<Round>();
    if (!r) throw new ApiError("round_not_found", 404);
    if ((await getRound(env, r.round_id)).status !== "active")
      throw new ApiError("round_ended", 409);
    // The join code is a bearer invitation. Do not expose players, user IDs or personal codes here.
    const creator = await stmt(
      env,
      "SELECT nickname FROM users WHERE user_id=?",
      r.creator_id,
    ).first<{ nickname: string }>();
    return json({
      round: {
        round_id: r.round_id,
        course: JSON.parse(r.course_snapshot),
        hole_count: r.hole_count,
        status: r.status,
        creator_name: creator!.nickname,
      },
    });
  }
  if (path === "/api/round-actions" && method === "POST") {
    const b = await body(request),
      id = uid(b.action_id);
    const old = await stmt(
      env,
      "SELECT * FROM round_actions WHERE action_id=?",
      id,
    ).first<Action>();
    if (old) {
      if (old.user_id !== d.user_id) throw new ApiError("not_found", 404);
      return json(await actionView(env, d, old));
    }
    if (await activeRound(env, d.user_id))
      throw new ApiError("active_round_exists", 409);
    let payload: unknown;
    if (b.kind === "create") {
      const c = await getCourse(env, uid(b.course_id));
      if (c.version !== revision(b.course_version))
        throw new ApiError("course_changed", 409);
      const segments = JSON.parse(c.segments_json) as Segment[];
      if (
        !Array.isArray(b.segment_indices) ||
        ![1, 2].includes(b.segment_indices.length) ||
        b.segment_indices.some(
          (i) => !Number.isInteger(i) || i < 0 || i >= segments.length,
        )
      )
        throw new ApiError("invalid_course");
      if (
        !Array.isArray(b.players) ||
        b.players.length < 1 ||
        b.players.length > 8
      )
        throw new ApiError("invalid_players");
      const players = b.players.map((p) => {
        if (!p || typeof p !== "object") throw new ApiError("invalid_players");
        return { name: nickname(p.name), self: p.self === true };
      });
      if (players.filter((p) => p.self).length > 1)
        throw new ApiError("invalid_players");
      const selected = b.segment_indices.map((i) => segments[i]);
      payload = {
        course: {
          course_id: c.course_id,
          version: c.version,
          name: c.name,
          region: c.region,
          segments: selected,
        },
        hole_count: selected.length * 9,
        players,
      };
    } else if (b.kind === "join") {
      let roundId: string;
      if (b.invitation_id) {
        const invitation = await stmt(
          env,
          "SELECT round_id FROM round_invitations WHERE invitation_id=? AND recipient_id=? AND status='pending'",
          uid(b.invitation_id),
          d.user_id,
        ).first<{ round_id: string }>();
        if (!invitation) throw new ApiError("invitation_unavailable", 409);
        roundId = invitation.round_id;
      } else {
        const code =
          typeof b.code === "string"
            ? b.code.replace(/[\s-]/g, "").toUpperCase()
            : "";
        const r = await stmt(
          env,
          "SELECT round_id FROM rounds WHERE join_code=?",
          code,
        ).first<{ round_id: string }>();
        if (!r) throw new ApiError("round_not_found", 404);
        roundId = r.round_id;
      }
      if ((await getRound(env, roundId)).status !== "active")
        throw new ApiError("round_ended", 409);
      payload = {
        round_id: roundId,
        ...(b.invitation_id ? { invitation_id: b.invitation_id } : {}),
      };
    } else throw new ApiError("invalid_request");
    try {
      await atomic(
        env,
        d,
        [],
        [
          stmt(
            env,
            "INSERT INTO round_actions(action_id,user_id,kind,payload_json,created_at) VALUES(?,?,?,?,?)",
            id,
            d.user_id,
            b.kind,
            JSON.stringify(payload),
            now(),
          ),
        ],
      );
    } catch (e) {
      const retry = await stmt(
        env,
        "SELECT * FROM round_actions WHERE action_id=? AND user_id=?",
        id,
        d.user_id,
      ).first<Action>();
      if (retry) return json(await actionView(env, d, retry));
      throw e;
    }
    return json(await actionView(env, d, await action(env, d, id)), 201);
  }
  const am = path.match(/^\/api\/round-actions\/([^/]+)(?:\/(ad|execute))?$/);
  if (am) {
    const a = await action(env, d, uid(am[1]));
    if (!am[2] && method === "GET") return json(await actionView(env, d, a));
    if (am[2] === "ad" && method === "POST") {
      const b = await body(request);
      // Stage 2 has no production ad SDK. Test settlement is explicitly blocked in production.
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
      await precheck(env, d, a);
      await atomic(
        env,
        d,
        [],
        [
          stmt(
            env,
            "UPDATE round_actions SET ad_outcome=?,ad_source='development-test',ad_settled_at=? WHERE action_id=? AND ad_outcome IS NULL",
            String(b.outcome),
            now(),
            a.action_id,
          ),
        ],
      );
      return json(await actionView(env, d, await action(env, d, a.action_id)));
    }
    if (am[2] === "execute" && method === "POST") return execute(env, d, a);
  }
  const rm = path.match(/^\/api\/rounds\/([^/]+)(?:\/(invitations))?$/);
  if (rm) {
    const id = uid(rm[1]);
    await member(env, d, id);
    const r = await getRound(env, id);
    if (!rm[2] && method === "GET") {
      const participants = await stmt(
        env,
        "SELECT p.user_id,p.can_end,u.nickname FROM round_participants p JOIN users u ON u.user_id=p.user_id WHERE p.round_id=? ORDER BY p.joined_at,p.user_id",
        id,
      ).all();
      const players = await stmt(
        env,
        "SELECT p.*,COALESCE(u.nickname,p.name) AS name FROM player_slots p LEFT JOIN users u ON u.user_id=p.user_id WHERE p.round_id=? AND p.deleted_at IS NULL ORDER BY p.position",
        id,
      ).all();
      return json({
        round: roundView(r),
        participants: participants.results,
        players: players.results,
      });
    }
    if (rm[2] && method === "POST") {
      if (r.status !== "active") throw new ApiError("round_ended", 409);
      const b = await body(request),
        invitationId = uid(b.invitation_id);
      const code =
        typeof b.personal_code === "string"
          ? b.personal_code.replace(/[\s-]/g, "").toUpperCase()
          : "";
      const target = await stmt(
        env,
        "SELECT user_id,nickname FROM users WHERE personal_code=?",
        code,
      ).first<{ user_id: string; nickname: string }>();
      if (!target) throw new ApiError("user_not_found", 404);
      if (
        await stmt(
          env,
          "SELECT 1 FROM round_participants WHERE round_id=? AND user_id=?",
          id,
          target.user_id,
        ).first()
      )
        throw new ApiError("already_joined", 409);
      const old = await stmt(
        env,
        "SELECT invitation_id FROM round_invitations WHERE invitation_id=? AND round_id=? AND sender_id=? AND recipient_id=?",
        invitationId,
        id,
        d.user_id,
        target.user_id,
      ).first();
      if (old) return json({ ok: true, recipient: target.nickname });
      await atomic(
        env,
        d,
        [
          liveCheck(id),
          {
            sql: "SELECT 1 FROM round_participants WHERE round_id=? AND user_id=?",
            args: [id, d.user_id],
          },
          {
            sql: "SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM round_participants WHERE round_id=? AND user_id=?)",
            args: [id, target.user_id],
          },
        ],
        [
          stmt(
            env,
            "INSERT INTO round_invitations(invitation_id,round_id,sender_id,recipient_id,status,created_at,updated_at) VALUES(?,?,?,?,'pending',?,?)",
            invitationId,
            id,
            d.user_id,
            target.user_id,
            now(),
            now(),
          ),
        ],
        "invitation_exists",
      );
      return json({ ok: true, recipient: target.nickname }, 201);
    }
  }
  const im = path.match(/^\/api\/invitations\/([^/]+)\/decline$/);
  if (im && method === "POST") {
    const id = uid(im[1]);
    const old = await stmt(
      env,
      "SELECT status FROM round_invitations WHERE invitation_id=? AND recipient_id=?",
      id,
      d.user_id,
    ).first<{ status: string }>();
    if (!old) throw new ApiError("not_found", 404);
    if (old.status === "declined") return json({ ok: true });
    await atomic(
      env,
      d,
      [
        {
          sql: "SELECT 1 FROM round_invitations WHERE invitation_id=? AND recipient_id=? AND status='pending'",
          args: [id, d.user_id],
        },
      ],
      [
        stmt(
          env,
          "UPDATE round_invitations SET status='declined',updated_at=? WHERE invitation_id=?",
          now(),
          id,
        ),
      ],
      "invitation_unavailable",
    );
    return json({ ok: true });
  }
  return (await scoresRoute(request, env, d)) ?? playersRoute(request, env, d);
}
