import React from "react";
import { View } from "react-native";
import { Txt, colors } from "./components";
import { symbolFor } from "../../shared/scores";

export function ScoreMark({
  strokes,
  par,
}: {
  strokes: number | null;
  par: number;
}) {
  const symbol = symbolFor(strokes, par),
    color =
      symbol === "birdie"
        ? colors.birdie
        : symbol === "bogey" || symbol === "double"
          ? colors.bogey
          : colors.ink;
  return (
    <View
      style={{
        width: 21,
        height: 25,
        alignItems: "center",
        justifyContent: "center",
        borderWidth:
          symbol === "birdie" || symbol === "bogey" || symbol === "double"
            ? 1
            : 0,
        borderColor: color,
        borderRadius: symbol === "birdie" ? 14 : 0,
      }}
    >
      {symbol === "double" && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 2,
            bottom: 2,
            left: 2,
            right: 2,
            borderWidth: 1,
            borderColor: color,
          }}
        />
      )}
      <Txt style={{ fontSize: 11, lineHeight: 17, color }}>
        {strokes ?? "—"}
      </Txt>
    </View>
  );
}
