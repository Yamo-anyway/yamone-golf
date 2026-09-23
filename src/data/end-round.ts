import type { EndRequest, EndView } from "../../shared/round-ending";
import { errorCode, type OfflineScores } from "./score-offline-core";
// The local checkpoint also locks score entry across tabs. It is never cleared on
// an ambiguous network/server failure: retry the identical request after restart.
export async function sendEnd(
  store: OfflineScores,
  round: string,
  version: number,
  send: (request: EndRequest) => Promise<EndView>,
) {
  const request = await store.prepareEnd(round, version);
  let result: EndView;
  try {
    result = await send(request);
  } catch (e) {
    if (
      [
        "end_changed",
        "end_forbidden",
        "device_moved",
        "unauthorized",
        "user_changed",
        "request_reused",
        "forbidden",
      ].includes(errorCode(e))
    )
      await store.settleEnd(round, request.mutation_id, false);
    throw e;
  }
  await store.settleEnd(round, request.mutation_id, true);
  return result;
}
