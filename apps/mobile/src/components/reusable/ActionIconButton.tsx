import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import React from "react";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

type Tone = "default" | "primary" | "danger";

type ActionIconButtonProps = {
  icon: React.ElementType<{ size?: number; color?: string; className?: string }>;
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: Tone;
  iconSize?: number;
  className?: string;
  accessibilityLabel?: string;
};

function getToneClasses(tone: Tone) {
  if (tone === "primary") {
    return {
      button: "bg-primary-500 border-primary-500 active:bg-primary-600",
      text: "text-typography-0",
      icon: "text-typography-0",
    };
  }
  if (tone === "danger") {
    return {
      button: "bg-error-500 border-error-500 active:bg-error-600",
      text: "text-typography-0",
      icon: "text-typography-0",
    };
  }
  return {
    button: "bg-background-0 border-outline-200 active:bg-background-100",
    text: "text-typography-700",
    icon: "text-typography-700",
  };
}

export function ActionIconButton({
  icon: Icon,
  label,
  onPress,
  disabled,
  tone = "default",
  iconSize = 18,
  className,
  accessibilityLabel,
}: ActionIconButtonProps) {
  const toneClass = getToneClasses(tone);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withTiming(0.95, { duration: 100 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 10, stiffness: 300 });
  };

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel ?? label ?? "action"}
        accessibilityRole="button"
        className={[
          "min-h-11 px-3 rounded-lg border items-center justify-center",
          toneClass.button,
          disabled ? "opacity-40" : "",
          className ?? "",
        ].join(" ")}
      >
        <HStack space="xs" className="items-center">
          <Icon size={iconSize} className={toneClass.icon} />
          {label ? (
            <Text size="sm" bold className={toneClass.text}>
              {label}
            </Text>
          ) : null}
        </HStack>
      </Pressable>
    </Animated.View>
  );
}

