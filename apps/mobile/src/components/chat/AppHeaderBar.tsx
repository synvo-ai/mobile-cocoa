import { SettingsGradientIcon } from "@/components/icons/HeaderIcons";
import { layoutGlassHeaderStyleDark, SHELL_HORIZONTAL_PADDING } from "@/components/styles/appStyles";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import {
    AnimatedPressableView,
    EntranceAnimation,
    triggerHaptic
} from "@/designSystem";
import { useThemeAssets } from "@/hooks/useThemeAssets";
import { useTheme } from "@/theme/index";
import { BlurView } from "expo-blur";
import React from "react";
import { Image, StyleSheet } from "react-native";

interface AppHeaderBarProps {
  visible: boolean;
  onOpenExplorer: () => void;
  onOpenSessionManagement: () => void;
}

interface HeaderButtonProps {
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  delay?: number;
  plain?: boolean;
  size?: number;
}

function HeaderButton({ icon, onPress, accessibilityLabel, delay = 0, plain = false, size = 44, isDark = true }: HeaderButtonProps & { isDark?: boolean }) {
  return (
    <EntranceAnimation variant="scale" delay={delay}>
      <AnimatedPressableView
        onPress={() => {
          triggerHaptic("light");
          onPress();
        }}
        haptic={undefined}
        scaleTo={0.92}
        style={{
          width: size,
          height: size,
          justifyContent: "center",
          alignItems: "center",
          borderRadius: plain ? 0 : 12,
          overflow: plain ? "visible" : "hidden",
          backgroundColor: plain ? "transparent" : (isDark ? "rgba(255, 255, 255, 0.05)" : "#F0F4F8"), // surfaceMuted for light
          borderColor: plain ? "transparent" : (isDark ? "rgba(255, 255, 255, 0.1)" : "#E2E8F0"), // border for light
          borderWidth: plain ? 0 : StyleSheet.hairlineWidth,
        }}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
      >
        {!plain && isDark && <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />}
        {icon}
      </AnimatedPressableView>
    </EntranceAnimation>
  );
}

function HeaderLogo() {
  const assets = useThemeAssets();

  return (
    <Image
      source={assets.leftHeaderIcon}
      style={{ width: 80, height: 80 }}
      resizeMode="contain"
    />
  );
}

export function AppHeaderBar({
  visible,
  onOpenExplorer,
  onOpenSessionManagement,
}: AppHeaderBarProps) {
  const theme = useTheme();
  const isDark = theme.mode === "dark";

  if (!visible) return null;

  return (
    <Box
      style={[
        isDark ? layoutGlassHeaderStyleDark : { backgroundColor: "transparent" },
        {
          marginHorizontal: -SHELL_HORIZONTAL_PADDING,
          paddingHorizontal: SHELL_HORIZONTAL_PADDING,
        },
      ]}
      className="relative z-10 pb-2 overflow-hidden"
    >
      {isDark && <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />}
      <HStack className="relative h-20 flex-row items-center justify-between px-0 -mt-2" pointerEvents="box-none">
        <HeaderButton
          icon={<Box style={{ marginLeft: -10 }}><HeaderLogo /></Box>}
          onPress={onOpenExplorer}
          accessibilityLabel="Open Explorer"
          delay={100}
          size={72}
          plain
          isDark={isDark}
        />
        <Box className="min-w-0 flex-1 shrink justify-center items-center px-2" />
        <HeaderButton
          icon={
            <SettingsGradientIcon size={36} />
          }
          onPress={onOpenSessionManagement}
          accessibilityLabel="Manage sessions"
          delay={200}
          size={56}
          plain
          isDark={isDark}
        />
      </HStack>
    </Box>
  );
}
