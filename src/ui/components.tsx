import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
export const colors = {
  ink: "#163C34",
  muted: "#68766F",
  green: "#174E3F",
  mint: "#E9EFE8",
  lime: "#DAEE94",
  paper: "#F5F6F2",
  line: "#DFE5DE",
  error: "#A13636",
  white: "#FFFFFF",
};
export const styles = StyleSheet.create({
  text: { fontSize: 16, lineHeight: 24, color: colors.ink },
  title: {
    fontSize: 27,
    lineHeight: 35,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.5,
  },
  card: {
    padding: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    gap: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    padding: 14,
    fontSize: 16,
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
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Button({
  label,
  onPress,
  disabled,
  secondary,
  busy,
  testID,
  quiet,
  danger,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  busy?: boolean;
  testID?: string;
  quiet?: boolean;
  danger?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const subdued = secondary || quiet;
  const foreground = subdued
    ? danger
      ? colors.error
      : colors.ink
    : colors.white;
  const background = quiet
    ? "transparent"
    : secondary
      ? colors.white
      : danger
        ? colors.error
        : colors.green;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 52,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: quiet
            ? "transparent"
            : secondary
              ? colors.line
              : background,
          backgroundColor: pressed && subdued ? colors.mint : background,
          opacity: disabled ? 0.45 : pressed ? 0.86 : busy ? 0.7 : 1,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={foreground} /> : icon}
      <Txt
        style={{
          color: foreground,
          fontWeight: "700",
          textAlign: "center",
          flexShrink: 1,
        }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}
export function Field({
  label,
  error,
  style,
  onFocus,
  onBlur,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string; error?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Txt style={{ fontWeight: "600", fontSize: 14 }}>{label}</Txt>
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        accessibilityHint={error || props.accessibilityHint}
        placeholderTextColor={colors.muted}
        selectionColor={colors.green}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          {
            borderColor: error
              ? colors.error
              : focused
                ? colors.green
                : colors.line,
          },
          props.editable === false && {
            backgroundColor: colors.paper,
            color: colors.muted,
          },
          style,
        ]}
      />
      {!!error && (
        <Txt
          accessibilityRole="alert"
          style={{ color: colors.error, fontSize: 13 }}
        >
          {error}
        </Txt>
      )}
    </View>
  );
}
