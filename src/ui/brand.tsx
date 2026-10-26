import React from "react";
import { brandPaths } from "./brand-paths";
import { View } from "react-native";
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";
import { colors } from "./theme";
import { Txt } from "./components";

/** Original YAMONE flag, shared with the platform icon source. */
export function BrandMark({
  size = 56,
  monochrome = false,
}: {
  size?: number;
  monochrome?: boolean;
}) {
  const foreground = monochrome ? colors.green : colors.lime;
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessible={false}>
      {!monochrome && (
        <Rect width={1024} height={1024} rx={220} fill={colors.green} />
      )}
      <Path
        d={brandPaths.pole}
        fill="none"
        stroke={foreground}
        strokeWidth={36}
        strokeLinecap="round"
      />
      <Path d={brandPaths.flag} fill={foreground} />
      <Ellipse
        cx={423}
        cy={769}
        rx={130}
        ry={23}
        fill={monochrome ? colors.green : colors.mint}
        opacity={0.4}
      />
      <Circle
        cx={669}
        cy={745}
        r={28}
        fill={monochrome ? colors.green : colors.white}
      />
    </Svg>
  );
}
export function BrandLockup({ size = 48 }: { size?: number }) {
  return (
    <View
      accessibilityLabel="YAMONE GOLF"
      style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
    >
      <BrandMark size={size} />
      <View>
        <Txt
          style={{
            fontSize: 18,
            lineHeight: 23,
            letterSpacing: 2.4,
            fontWeight: "800",
          }}
        >
          YAMONE
        </Txt>
        <Txt
          style={{
            fontSize: 12,
            lineHeight: 18,
            letterSpacing: 4.6,
            color: colors.muted,
          }}
        >
          GOLF
        </Txt>
      </View>
    </View>
  );
}
