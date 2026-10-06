import React, { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { create } from "qrcode/lib/core/qrcode";
import { colors } from "./components";

export function QRCode({ value, label }: { value: string; label: string }) {
  const matrix = useMemo(
    () => create(value, { errorCorrectionLevel: "M" }).modules,
    [value],
  );
  let d = "";
  for (let y = 0; y < matrix.size; y++)
    for (let x = 0; x < matrix.size; x++)
      if (matrix.get(y, x)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
  return (
    <View style={{ alignItems: "center" }}>
      <Svg
        accessibilityLabel={label}
        accessibilityRole="image"
        width={196}
        height={196}
        viewBox={`0 0 ${matrix.size + 8} ${matrix.size + 8}`}
      >
        <Rect width="100%" height="100%" fill="white" />
        <Path d={d} fill={colors.ink} />
      </Svg>
    </View>
  );
}
