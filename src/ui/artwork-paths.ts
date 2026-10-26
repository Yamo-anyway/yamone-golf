import { colors } from "./theme";
// All artwork stays vector-based; no embedded text or generated raster dependency.
export const artworkPaths = {
  courses: [
    "M40 89c28-28 46-18 65-4s40 8 63-10M38 102h130",
    "M95 90V29m0 3c16-11 26 16 50 3v32c-24 13-34-14-50-3",
    "M136 94a5 5 0 1 1-10 0 5 5 0 0 1 10 0",
  ],
  records: [
    "M64 26h66l14 14v64H64zM130 26v17h14",
    "M79 55h42M79 69h42M79 83h22",
    "m115 92 8 8 17-19",
  ],
  search: [
    "M118 58a28 28 0 1 1-56 0 28 28 0 0 1 56 0m-7 21 32 28",
    "M76 57h28",
    "M49 97h32M138 36h20m-10-10v20",
  ],
  offline: [
    "M48 49a79 79 0 0 1 96-6M60 67a53 53 0 0 1 65-6M79 86a26 26 0 0 1 26-3",
    "m53 23 100 86",
    "M101 105h.01",
  ],
  error: [
    "m104 26 49 78H55z",
    "M104 51v26M104 90h.01",
    "M39 52h14m-7-7v14M155 30l10 10m-10 0 10-10",
  ],
  success: [
    "M143 65a39 39 0 1 1-78 0 39 39 0 0 1 78 0",
    "m84 65 14 14 26-29",
    "M47 36h14m-7-7v14M156 88h14m-7-7v14M154 25h.01",
  ],
} as const;
export type ArtworkKind = keyof typeof artworkPaths;
export const artworkAccent = (kind: ArtworkKind) =>
  kind === "error" ? colors.error : colors.green;
