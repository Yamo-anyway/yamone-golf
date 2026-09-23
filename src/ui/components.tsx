import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
export const colors = {
  ink: "#173F34",
  muted: "#566B60",
  green: "#23634B",
  mint: "#E7F0E7",
  paper: "#F7F8F3",
  line: "#D6DED5",
  error: "#9D3030",
};
export const styles = StyleSheet.create({
  text: { fontSize: 16, lineHeight: 24, color: colors.ink },
  title: {
    fontSize: 30,
    lineHeight: 39,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.5,
  },
  card: {
    padding: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    gap: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    padding: 14,
    fontSize: 17,
    color: colors.ink,
  },
});
export function Txt({ children, ...props }: React.ComponentProps<typeof Text>) {
  return (
    <Text {...props} style={[styles.text, props.style]}>
      {children}
    </Text>
  );
}
export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export function Button({
  label,
  onPress,
  disabled,
  secondary,
  busy,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  busy?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: secondary ? colors.line : colors.green,
        backgroundColor: secondary ? "#FFFFFF" : colors.green,
        opacity: disabled || busy ? 0.55 : pressed ? 0.8 : 1,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
      })}
    >
      {busy && <ActivityIndicator color={secondary ? colors.ink : "#FFFFFF"} />}
      <Txt
        style={{
          color: secondary ? colors.ink : "#FFFFFF",
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}
export function Field({
  label,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Txt style={{ fontWeight: "700" }}>{label}</Txt>
      <TextInput {...props} accessibilityLabel={label} style={styles.input} />
    </View>
  );
}
