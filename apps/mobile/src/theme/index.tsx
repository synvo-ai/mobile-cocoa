/**
 * Theme System
 * 
 * Consistent design system with multi-provider state support.
 */

import { buildTypographyScale, type TypographyScaleRecord } from "@/theme/typography";
import React, { createContext, useContext, useMemo } from "react";
import { Dimensions, useColorScheme } from "react-native";

export type Provider = "claude" | "gemini" | "codex";
export type ColorMode = "dark" | "light";
export type ColorModePreference = ColorMode | "system";

export const darkUniversalGlassTheme = {
  accent: "#8B75FF",
  accentSoft: "rgba(139, 117, 255, 0.15)",
  accentMuted: "rgba(139, 117, 255, 0.25)",
  accentOnDark: "#A594FF",
} as const;

export type DesignTheme = {
  provider: Provider;
  mode: ColorMode;

  colors: {
    background: string;
    surface: string;
    surfaceAlt: string;
    surfaceMuted: string;
    border: string;
    borderSubtle: string;
    borderStrong: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    textInverse: string;
    textPlaceholder: string;
    accent: string;
    accentSoft: string;
    accentSubtle: string;
    success: string;
    danger: string;
    warning: string;
    info: string;
    overlay: string;
    shadow: string;
    skeleton: string;
    skeletonHighlight: string;
  };
  typography: TypographyScaleRecord;
  spacing: typeof spacing;
  radii: typeof radii;
  motion: typeof motion;
  grid: number;
};

const spacing = { xs: 8, sm: 16, md: 24, lg: 32, xl: 40, xxl: 48, xxxl: 64 };
const radii = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };
const motion = { fast: 140, normal: 220, slow: 360, spring: { damping: 18, stiffness: 240, mass: 0.8 } };

function getNeutrals(mode: ColorMode = "light") {
  if (mode === "light") {
    return {
      background: "transparent",
      surface: "rgba(255, 255, 255, 0.7)",
      surfaceAlt: "rgba(248, 250, 252, 0.7)",
      surfaceMuted: "rgba(241, 245, 249, 0.7)",
      border: "rgba(148, 163, 184, 0.2)",
      borderSubtle: "rgba(148, 163, 184, 0.1)",
      borderStrong: "rgba(148, 163, 184, 0.4)",
      textPrimary: "#0F172A",
      textSecondary: "#475569",
      textMuted: "#64748B",
      textInverse: "#FFFFFF",
      textPlaceholder: "#94A3B8",
      overlay: "rgba(255, 255, 255, 0.8)",
      shadow: "rgba(15, 23, 42, 0.08)",
      skeleton: "rgba(226, 232, 240, 0.5)",
      skeletonHighlight: "rgba(241, 245, 249, 0.8)",
    };
  }

  return {
    background: "transparent",
    surface: "rgba(15, 23, 42, 0.75)",
    surfaceAlt: "rgba(30, 41, 59, 0.75)",
    surfaceMuted: "rgba(51, 65, 85, 0.75)",
    border: "rgba(139, 117, 255, 0.3)",
    borderSubtle: "rgba(139, 117, 255, 0.15)",
    borderStrong: "rgba(139, 117, 255, 0.5)",
    textPrimary: "#F8FAFC",
    textSecondary: "#CBD5E1",
    textMuted: "#94A3B8",
    textInverse: "#0F172A",
    textPlaceholder: "#64748B",
    overlay: "rgba(15, 23, 42, 0.85)",
    shadow: "rgba(0, 0, 0, 0.4)",
    skeleton: "rgba(30, 41, 59, 0.6)",
    skeletonHighlight: "rgba(51, 65, 85, 0.8)",
  };
}

export function buildTheme(provider: Provider = "codex", mode: ColorMode = "light"): DesignTheme {
  const brand = darkUniversalGlassTheme;
  const neutral = getNeutrals(mode);
  const isLight = mode === "light";
  const defaultAccent = isLight ? "#4A90E2" : brand.accentOnDark;
  const accent = defaultAccent;

  return {
    provider,
    mode,
    colors: {
      ...neutral,
      accent,
      accentSoft: isLight ? "#B3D4FF" : "rgba(139, 117, 255, 0.18)",
      accentSubtle: isLight ? "rgba(179, 212, 255, 0.4)" : "rgba(139, 117, 255, 0.2)",
      success: "#22c55e",
      danger: "#f87171",
      warning: "#fbbf24",
      info: "#60a5fa",
    },
    typography: buildTypographyScale(),
    spacing,
    radii,
    motion,
    grid: 8,
  };
}

export function getTheme(): DesignTheme {
  return buildTheme();
}


type ThemeContextValue = {
  activeMode: ColorMode;
  activeProvider: Provider;
};

const ThemeContext = createContext<ThemeContextValue>({ activeMode: "light", activeProvider: "codex" });

export function ThemeProvider({ children, mode, provider = "codex" }: { children: React.ReactNode, mode?: ColorMode, provider?: Provider }) {
  const systemColorScheme = useColorScheme();

  const activeMode = useMemo(() => {
    if (mode) return mode;
    return (systemColorScheme === "dark" ? "dark" : "light") as ColorMode;
  }, [systemColorScheme, mode]);

  const value = useMemo(() => ({ activeMode, activeProvider: provider }), [activeMode, provider]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): DesignTheme {
  const ctx = useContext(ThemeContext);
  return useMemo(() => buildTheme(ctx.activeProvider, ctx.activeMode), [ctx.activeProvider, ctx.activeMode]);
}

export function useColorMode(): ColorMode {
  const ctx = useContext(ThemeContext);
  return ctx.activeMode;
}

export function useResponsive() {
  const { width, height } = Dimensions.get("window");
  return useMemo(() => ({ width, height, isSmallScreen: width < 375 }), [width, height]);
}

export { spacing, radii, motion };
export function getTypography() { return buildTypographyScale(); }
