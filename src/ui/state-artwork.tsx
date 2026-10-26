import React from "react";
import { View } from "react-native";
import Svg, { Ellipse, Path } from "react-native-svg";
import { artworkPaths, artworkAccent, type ArtworkKind } from "./artwork-paths";
import { colors } from "./theme";
import { Txt } from "./components";
export type { ArtworkKind } from "./artwork-paths";
export function StateArtwork({
  kind,
  width = 156,
}: {
  kind: ArtworkKind;
  width?: number;
}) {
  return (
    <Svg
      width={width}
      height={width * 0.625}
      viewBox="0 0 208 130"
      accessible={false}
    >
      <Ellipse
        cx={104}
        cy={69}
        rx={71}
        ry={54}
        fill={kind === "error" ? colors.errorSoft : colors.mint}
      />
      <Ellipse cx={104} cy={116} rx={63} ry={5} fill={colors.line} />
      {artworkPaths[kind].map((d, i) => (
        <Path
          key={i}
          d={d}
          fill="none"
          stroke={artworkAccent(kind)}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}
export function EmptyState({
  kind,
  title,
  detail,
  testID,
  children,
}: {
  kind: ArtworkKind;
  title: string;
  detail?: string;
  testID?: string;
  children?: React.ReactNode;
}) {
  return (
    <View
      testID={testID}
      style={{
        alignItems: "center",
        paddingVertical: 20,
        paddingHorizontal: 16,
        gap: 10,
      }}
    >
      <StateArtwork kind={kind} />
      <Txt style={{ textAlign: "center", fontWeight: "600" }}>{title}</Txt>
      {!!detail && (
        <Txt style={{ textAlign: "center", fontSize: 14, color: colors.muted }}>
          {detail}
        </Txt>
      )}
      {children}
    </View>
  );
}
