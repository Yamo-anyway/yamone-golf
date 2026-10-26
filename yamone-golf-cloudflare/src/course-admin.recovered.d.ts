import type { Env } from "./shared";
export declare function courseAdminRoute(
  request: Request,
  env: Env,
): Promise<Response | null>;
export declare function courseRequestRoute(
  request: Request,
  env: Env,
): Promise<Response | null>;
export declare function normalizeGolfCoreCourse(value: unknown): {
  name: string;
  country_code: string;
  segments: { name: string; pars: number[] }[];
  [key: string]: unknown;
};
