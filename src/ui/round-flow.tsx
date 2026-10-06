import React from "react";
import { View } from "react-native";
import { colors, Txt } from "./components";
import { useSession } from "./session";

// Course selection, setup and the server-backed confirmation share one path.
export function RoundSteps({ step }: { step: number }) {
  const { lang } = useSession();
  const labels =
    lang === "ko"
      ? ["골프장", "코스·홀", "플레이어", "최종 확인"]
      : ["Course", "Holes", "Players", "Review"];
  return (
    <View
      accessibilityLabel={`${step + 1} / 4 · ${labels[step]}`}
      style={{ flexDirection: "row", gap: 6 }}
    >
      {labels.map((label, i) => (
        <View key={label} style={{ flex: 1, gap: 7 }}>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: i <= step ? colors.green : colors.line,
            }}
          />
          <Txt
            style={{
              fontSize: 11,
              lineHeight: 17,
              fontWeight: i === step ? "800" : "500",
              color: i === step ? colors.green : colors.muted,
            }}
          >
            {i + 1} {label}
          </Txt>
        </View>
      ))}
    </View>
  );
}
export function FlowNote({
  title,
  children,
}: {
  title: string;
  children: string;
}) {
  return (
    <View
      style={{
        padding: 16,
        borderRadius: 16,
        backgroundColor: colors.mint,
        gap: 6,
      }}
    >
      <Txt style={{ fontWeight: "700" }}>{title}</Txt>
      <Txt style={{ fontSize: 13, lineHeight: 21, color: colors.muted }}>
        {children}
      </Txt>
    </View>
  );
}
