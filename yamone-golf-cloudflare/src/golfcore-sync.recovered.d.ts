import type { Env } from "./shared";
export declare function syncNextGolfCoreCatalogPage(
  env: Env,
  country?: string,
  options?: { forceComplete?: boolean },
): Promise<unknown>;
export declare function golfCoreSyncStatus(env: Env): Promise<unknown>;
export declare function golfCoreSourceUrl(slug: string): string;
export declare function fetchGolfCoreDetail(
  env: Env,
  slug: string,
): Promise<unknown>;
export declare function fetchGolfCorePage(
  env: Env,
  country: string,
  offset: number,
  options?: { limit?: number },
): Promise<unknown>;
