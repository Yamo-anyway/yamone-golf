import React from "react";
import Svg, { Path } from "react-native-svg";

import { iconPaths, type IconName } from "./icon-paths";
export type { IconName } from "./icon-paths";

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
        d={iconPaths[name]}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
