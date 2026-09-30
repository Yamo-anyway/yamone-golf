import type { EndRequest, EndView } from "../../shared/round-ending";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { request } from "./api";
import type { AdSource } from "./ad-config";
export type Segment = { name: string; pars: number[] };
export type Course = {
  course_id: string;
  name: string;
  region: string;
  country_code?: string;
  city?: string;
  source_name?: string | null;
  source_url?: string | null;
  managed_by_admin?: boolean;
  version: number;
  segments: Segment[];
};
export type Round = {
  round_id: string;
  creator_id: string;
  join_code: string;
  course: Course;
  hole_count: 9 | 18;
  status: "active" | "ended";
  created_at: number;
  ended_at: number | null;
};
export type Invitation = {
  invitation_id: string;
  round_id: string;
  sender_name: string;
  course: Course;
  hole_count: number;
};
export type HomeData = {
  active_round: Round | null;
  invitations: Invitation[];
  ended_rounds: Round[];
};
export type CourseList = { courses: Course[]; version: number };
export type RoundDetail = {
  round: Round;
  participants: { user_id: string; nickname: string; can_end: number }[];
  players: {
    slot_id: string;
    user_id: string | null;
    name: string;
    position: number;
  }[];
};
export type CreateInput = {
  kind: "create";
  course_id: string;
  course_version: number;
  segment_indices: number[];
  players: { name: string; self: boolean }[];
};
export type JoinInput = { kind: "join"; code?: string; invitation_id?: string };
export type AdResult =
  "completed" | "unavailable" | "load_failed" | "show_failed" | "load_timeout";
export type PendingRound = {
  action_id: string;
  input: CreateInput | JoinInput;
  outcome?: AdResult;
  source?: AdSource;
};
export type RoundAction = {
  action_id: string;
  kind: "create" | "join";
  ad_settled: boolean;
  completed_round_id: string | null;
  summary: {
    course: Course;
    hole_count: number;
    players?: { name: string; self: boolean }[];
  };
  test_ads: boolean;
};
const key = (user: string) => "yamone.golf.pending-round.v1." + user;
export const pendingRound = {
  read: async (user: string): Promise<PendingRound | null> => {
    const s = await AsyncStorage.getItem(key(user));
    return s ? JSON.parse(s) : null;
  },
  write: (user: string, p: PendingRound) =>
    AsyncStorage.setItem(key(user), JSON.stringify(p)),
  clear: (user: string) => AsyncStorage.removeItem(key(user)),
};
export const golf = {
  ending: (id: string) => request<EndView>("/api/rounds/" + id + "/ending"),
  end: (id: string, value: EndRequest) =>
    request<EndView>("/api/rounds/" + id + "/ending", "POST", value),
  endPermission: (
    id: string,
    value: {
      user_id: string;
      mutation_id: string;
      permission_version: number;
      participant_id: string;
      can_end: boolean;
    },
  ) =>
    request<EndView>("/api/rounds/" + id + "/end-permissions", "POST", value),
  home: () => request<HomeData>("/api/home"),
  courses: (q = "", offset = 0) =>
    request<{ courses: Course[]; next_offset: number | null }>(
      "/api/courses?q=" + encodeURIComponent(q) + "&offset=" + offset,
    ),
  course: (id: string) => request<{ course: Course }>("/api/courses/" + id),
  saveCourse: (c: Course, creating: boolean) =>
    request<{ course: Course }>(
      creating ? "/api/courses" : "/api/courses/" + c.course_id,
      creating ? "POST" : "PATCH",
      c,
    ),
  mine: () => request<CourseList>("/api/me/courses"),
  changeList: (
    version: number,
    change:
      | { action: "add" | "remove"; course_id: string }
      | { action: "reorder"; course_ids: string[] },
  ) => request<CourseList>("/api/me/courses", "PATCH", { version, ...change }),
  round: (id: string) => request<RoundDetail>("/api/rounds/" + id),
  lookup: (code: string) =>
    request<{
      round: {
        round_id: string;
        creator_name: string;
        course: Course;
        hole_count: number;
      };
    }>("/api/rounds/lookup", "POST", { code }),
  prepare: (p: PendingRound) =>
    request<RoundAction>("/api/round-actions", "POST", {
      action_id: p.action_id,
      ...p.input,
    }),
  action: (id: string) => request<RoundAction>("/api/round-actions/" + id),
  settle: (
    id: string,
    outcome: AdResult,
    source: AdSource = "development-test",
  ) =>
    request<RoundAction>("/api/round-actions/" + id + "/ad", "POST", {
      outcome,
      source,
    }),
  execute: (id: string) =>
    request<{ round: Round }>(
      "/api/round-actions/" + id + "/execute",
      "POST",
      {},
    ),
  invite: (id: string, invitation_id: string, personal_code: string) =>
    request<{ ok: true; recipient: string }>(
      "/api/rounds/" + id + "/invitations",
      "POST",
      { invitation_id, personal_code },
    ),
  decline: (id: string) =>
    request<{ ok: true }>("/api/invitations/" + id + "/decline", "POST", {}),
};
