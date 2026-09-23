import React, { useMemo, useState } from "react";
import { PanResponder, View } from "react-native";
import { Card, colors, Txt } from "./components";
export function DragRow({
  children,
  onDrop,
  label,
  disabled,
  onHeight,
}: {
  children: React.ReactNode;
  onDrop: (dy: number) => void;
  label: string;
  disabled: boolean;
  onHeight: (height: number) => void;
}) {
  const [offset, setOffset] = useState(0);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderMove: (_, g) => setOffset(g.dy),
        onPanResponderRelease: (_, g) => {
          setOffset(0);
          onDrop(g.dy);
        },
        onPanResponderTerminate: () => setOffset(0),
        onPanResponderTerminationRequest: () => false,
      }),
    [disabled, onDrop],
  );
  return (
    <View
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
      style={{
        transform: [{ translateY: offset }],
        zIndex: offset ? 10 : 0,
        opacity: offset ? 0.85 : 1,
      }}
    >
      <Card>
        <View
          {...pan.panHandlers}
          accessibilityLabel={label}
          style={{
            minHeight: 44,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: colors.mint,
            borderRadius: 8,
          }}
        >
          <Txt>☰</Txt>
        </View>
        {children}
      </Card>
    </View>
  );
}
