import React from "react";
import Svg, { Path } from "react-native-svg";

const paths = {
  "chevron-left": "m14.5 6-6 6 6 6",
  "chevron-right": "m9.5 6 6 6-6 6",
  "chevron-down": "m6 9 6 6 6-6",
  "chevron-up": "m6 15 6-6 6 6",
  "arrow-right": "M4 12h16m-6-6 6 6-6 6",
  home: "m3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9",
  flag: "M6 21V3m0 1c4-3 8 3 13 0v9c-5 3-9-3-13 0",
  scorecard: "M5 3h14v18H5zM8 7h8M8 11h2m4 0h2m-8 4h2m4 0h2",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2",
  users:
    "M14 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M3 20v-2a8 8 0 0 1 16 0v2M18 4a3 3 0 0 1 0 6m2 4a6 6 0 0 1 2 4v2",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2",
  search: "M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0m-2 5 6 6",
  qr: "M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 0h2v2h-2zm6 0v3h-3v3h3M12 3v3m0 6h3m-3 6v3M3 12h3m12 0h3",
  settings:
    "M14 3h-4l-.7 2.1-2 .9-2-.6-2 3.4 1.5 1.5-.1 2.4L3.2 14l2 3.4 2.1-.5 2 1 .7 2.1h4l.7-2.1 2-1 2.1.5 2-3.4-1.5-1.3-.1-2.4 1.5-1.5-2-3.4-2 .6-2-.9zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  trash: "M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  edit: "m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14z",
  save: "M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-7h8v7",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  trophy:
    "M7 3h10v6a5 5 0 0 1-10 0zM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 14v6m-4 1h8",
  "circle-check": "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0m-14 0 3 3 6-6",
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 22,
  color = "#163C34",
  strokeWidth = 1.8,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        d={paths[name]}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
