import { useMemo } from "react";
import type { ImageSourcePropType } from "react-native";

import { useTheme } from "@/theme";

// Pre-require assets to ensure they exist at bundle time
const lightAssets = {
  background: require("../../assets/theme/light/background.png") as ImageSourcePropType,
  leftHeaderIcon: require("../../assets/theme/light/left_header_icon.png") as ImageSourcePropType,
  rightHeaderIcon: require("../../assets/theme/light/right_header_icon.svg") as ImageSourcePropType,
};

const darkAssets = {
  background: require("../../assets/theme/dark/background.png") as ImageSourcePropType,
  leftHeaderIcon: require("../../assets/theme/dark/left_header_icon.png") as ImageSourcePropType,
  rightHeaderIcon: require("../../assets/theme/dark/right_header_icon.svg") as ImageSourcePropType,
};

export type ThemeAssets = {
  background: ImageSourcePropType;
  leftHeaderIcon: ImageSourcePropType;
  rightHeaderIcon: ImageSourcePropType;
};

export function useThemeAssets(): ThemeAssets {
  const theme = useTheme();
  const isLight = theme.mode === "light";

  return useMemo(() => (isLight ? lightAssets : darkAssets), [isLight]);
}
