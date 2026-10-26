import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Icon, type IconName } from "./icons";
import { colors, ui } from "./theme";
export { colors } from "./theme";
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
export type ButtonVariant =
  "primary" | "secondary" | "tonal" | "quiet" | "danger";
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
  iconName,
  style,
  variant,
  size = "regular",
  iconOnly = false,
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
  iconName?: IconName;
  style?: StyleProp<ViewStyle>;
  variant?: ButtonVariant;
  size?: "regular" | "compact";
  iconOnly?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const kind =
    variant ??
    (quiet ? "quiet" : secondary ? "secondary" : danger ? "danger" : "primary");
  const subdued = kind === "secondary" || kind === "quiet" || kind === "tonal";
  const foreground = subdued
    ? danger
      ? colors.error
      : colors.ink
    : colors.white;
  const background =
    kind === "quiet"
      ? "transparent"
      : kind === "secondary"
        ? colors.white
        : kind === "tonal"
          ? colors.mint
          : kind === "danger"
            ? colors.error
            : colors.green;
  const blocked = !!disabled || !!busy;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: blocked, busy: !!busy }}
      aria-busy={!!busy}
      aria-disabled={blocked}
      disabled={blocked}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: size === "compact" ? ui.touch : ui.button,
          minWidth: ui.touch,
          paddingHorizontal: iconOnly ? 12 : 16,
          paddingVertical: size === "compact" ? 10 : 12,
          borderRadius: ui.radius,
          borderWidth: 1,
          borderColor: focused
            ? colors.green
            : kind === "secondary"
              ? colors.line
              : kind === "quiet"
                ? "transparent"
                : background,
          backgroundColor: pressed
            ? subdued
              ? colors.mint
              : kind === "primary"
                ? colors.greenPressed
                : background
            : background,
          opacity: disabled ? 0.42 : pressed ? 0.86 : busy ? 0.75 : 1,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          ...(focused && !blocked
            ? {
                outlineStyle: "solid",
                outlineWidth: 2,
                outlineColor: colors.green,
                outlineOffset: 3,
              }
            : {}),
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : (
        (icon ??
        (iconName && <Icon name={iconName} size={20} color={foreground} />))
      )}
      {!iconOnly && (
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
      )}
    </Pressable>
  );
}
export function IconButton(
  props: Omit<React.ComponentProps<typeof Button>, "iconOnly" | "icon"> & {
    iconName: IconName;
  },
) {
  return <Button {...props} iconOnly />;
}
export function Chip({
  label,
  selected,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      {...(Platform.OS === "web" ? { "aria-pressed": !!selected } : {})}
      aria-disabled={!!disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: ui.touch,
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: selected ? colors.green : colors.line,
        backgroundColor: selected
          ? colors.green
          : pressed
            ? colors.mint
            : colors.white,
        opacity: disabled ? 0.42 : 1,
      })}
    >
      {selected && <Icon name="check" size={16} color={colors.white} />}
      <Txt
        style={{
          color: selected ? colors.white : colors.ink,
          fontSize: 14,
          fontWeight: "600",
          flexShrink: 1,
        }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}
export function StatusBadge({
  label,
  tone = "saved",
}: {
  label: string;
  tone?: "saved" | "draft" | "queued" | "conflict" | "ended";
}) {
  const color =
    tone === "conflict"
      ? colors.error
      : tone === "queued"
        ? colors.pending
        : tone === "ended"
          ? colors.muted
          : colors.green;
  const name: IconName =
    tone === "conflict"
      ? "warning"
      : tone === "queued"
        ? "clock"
        : tone === "draft"
          ? "edit"
          : tone === "ended"
            ? "lock"
            : "circle-check";
  return (
    <View
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        backgroundColor:
          tone === "conflict"
            ? colors.errorSoft
            : tone === "queued"
              ? colors.pendingSoft
              : colors.mint,
      }}
    >
      <Icon name={name} size={15} color={color} />
      <Txt style={{ color, fontSize: 12, lineHeight: 18, fontWeight: "600" }}>
        {label}
      </Txt>
    </View>
  );
}
export function Field({
  label,
  error,
  leadingIcon,
  style,
  onFocus,
  onBlur,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  error?: string;
  leadingIcon?: IconName;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Txt style={{ fontWeight: "600", fontSize: 14 }}>{label}</Txt>
      <View style={{ justifyContent: "center" }}>
        {!!leadingIcon && (
          <View
            pointerEvents="none"
            style={{ position: "absolute", left: 14, zIndex: 1 }}
          >
            <Icon
              name={leadingIcon}
              size={20}
              color={error ? colors.error : colors.muted}
            />
          </View>
        )}
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
            !!leadingIcon && { paddingLeft: 44 },
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
      </View>
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

/** Compact choice indicator with a full 48px touch target. */
export function Choice({
  label,
  checked,
  onPress,
  mode = "checkbox",
  disabled,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
  mode?: "checkbox" | "radio";
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={mode}
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: !!disabled }}
      aria-checked={checked}
      aria-disabled={!!disabled}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        minHeight: ui.touch,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        opacity: disabled ? 0.42 : pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: mode === "radio" ? 11 : 6,
          borderWidth: 1.5,
          borderColor: checked ? colors.green : colors.muted,
          backgroundColor:
            checked && mode === "checkbox" ? colors.green : colors.white,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked &&
          (mode === "radio" ? (
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: colors.green,
              }}
            />
          ) : (
            <Icon name="check" size={16} color={colors.white} />
          ))}
      </View>
      <Txt style={{ flexShrink: 1 }}>{label}</Txt>
    </Pressable>
  );
}

export function Toggle({
  label,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View
      style={{
        minHeight: ui.touch,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        justifyContent: "space-between",
        opacity: disabled ? 0.42 : 1,
      }}
    >
      <Txt style={{ flexShrink: 1 }}>{label}</Txt>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.line, true: colors.green }}
        thumbColor={colors.white}
      />
    </View>
  );
}
