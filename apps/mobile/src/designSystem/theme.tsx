/**
 * Modern Design System Theme Configuration
 * 
 * Comprehensive theming system supporting:
 * - Light/Dark mode with system preference detection
 * - WCAG 2.1 AA accessibility compliance
 * - Dynamic color theming with brand color support
 * - 8px grid system for consistent spacing
 * - Fluid motion/animation timing
 */

import { buildTypographyScale } from "@/theme/typography";
import React, { createContext, useContext, useMemo } from "react";
import { Dimensions, PixelRatio, Platform, useColorScheme } from "react-native";

// ============================================================================
// Color System - WCAG 2.1 AA Compliant
// ============================================================================

/** 
 * Color contrast ratios for WCAG 2.1 AA compliance
 * Normal text: 4.5:1 minimum
 * Large text (18pt+ or 14pt+ bold): 3:1 minimum
 */
export const contrastRatios = {
  normal: 4.5,
  large: 3.0,
  enhanced: 7.0, // AAA level for critical text
} as const;

/** Calculate relative luminance for contrast ratio calculation */
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** Calculate contrast ratio between two colors */
export function getContrastRatio(color1: string, color2: string): number {
  const hex1 = color1.replace("#", "");
  const hex2 = color2.replace("#", "");
  const rgb1 = {
    r: parseInt(hex1.slice(0, 2), 16),
    g: parseInt(hex1.slice(2, 4), 16),
    b: parseInt(hex1.slice(4, 6), 16),
  };
  const rgb2 = {
    r: parseInt(hex2.slice(0, 2), 16),
    g: parseInt(hex2.slice(2, 4), 16),
    b: parseInt(hex2.slice(4, 6), 16),
  };
  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

// ============================================================================
// Base Color Palettes
// ============================================================================

const neutralColors = {
  white: "#ffffff",
  gray50: "#f8f7f5",
  gray100: "#f1f2f6",
  gray200: "#e7e9ef",
  gray300: "#e2e4ea",
  gray400: "#c5c9d2",
  gray500: "#9aa3b2",
  gray600: "#6b7280",
  gray700: "#4b5563",
  gray800: "#3e4250",
  gray900: "#12131a",
  black: "#0d0f14",
} as const;

const semanticColors = {
  success: { light: "#16a34a", dark: "#22c55e" },
  danger: { light: "#dc2626", dark: "#f87171" },
  warning: { light: "#d97706", dark: "#fbbf24" },
  info: { light: "#2563eb", dark: "#60a5fa" },
} as const;

// Brand color configurations (Unified Universal Theme)
export const brandColors = {
  accent: "#8B75FF",
  accentSoft: "rgba(139, 117, 255, 0.15)",
  accentMuted: "rgba(139, 117, 255, 0.25)",
  accentOnDaily: "#8B75FF", // Standard accent
  accentOnDark: "#A594FF", // Slightly lighter for dark mode contrast
} as const;



// ============================================================================
// Typography System (shared types from theme/typography)
// ============================================================================

import type {
    TypographyScaleRecord
} from "@/theme/typography";
export type { TypographyScaleRecord, TypographyStyle, TypographyVariant } from "@/theme/typography";

// Lazy init to avoid "runtime not ready" (Dimensions at module load on Hermes)
let _typographyScale: TypographyScaleRecord | null = null;

function getTypographyScale(): TypographyScaleRecord {
  if (_typographyScale) return _typographyScale;
  _typographyScale = buildTypographyScale();
  return _typographyScale;
}

// ============================================================================
// Spacing System (8px Grid)
// ============================================================================

export const spacing = {
  "0": 0,
  "0.5": 4,
  "1": 8,
  "2": 12,
  "3": 16,
  "4": 20,
  "5": 24,
  "6": 32,
  "7": 40,
  "8": 48,
  "9": 64,
  "10": 80,
  "11": 96,
  "12": 128,
} as const;

export type SpacingToken = keyof typeof spacing;

// ============================================================================
// Border Radius System
// ============================================================================

export const radii = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  pill: 9999,
  full: 9999,
} as const;

export type RadiusToken = keyof typeof radii;

// ============================================================================
// Motion/Timing System
// ============================================================================

export const motion = {
  /** Ultra-fast for micro-interactions (button presses) */
  instant: 80,
  /** Fast for small state changes */
  fast: 140,
  /** Normal for most transitions */
  normal: 220,
  /** Slow for emphasis animations */
  slow: 360,
  /** Very slow for page transitions */
  deliberate: 500,
} as const;

export const springConfigs = {
  /** Snappy spring for button presses */
  snappy: {
    damping: 22,
    stiffness: 380,
    mass: 0.6,
  },
  /** Standard spring for general use */
  standard: {
    damping: 18,
    stiffness: 240,
    mass: 0.8,
  },
  /** Gentle spring for large elements */
  gentle: {
    damping: 15,
    stiffness: 150,
    mass: 1,
  },
  /** Bouncy spring for playful interactions */
  bouncy: {
    damping: 12,
    stiffness: 300,
    mass: 0.8,
  },
  /** Slow spring for dramatic entrances */
  dramatic: {
    damping: 20,
    stiffness: 120,
    mass: 1.2,
  },
} as const;

// Easing curves
export const easings = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => 1 - (1 - t) * (1 - t),
  easeInOut: (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  spring: (t: number) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
} as const;

// ============================================================================
// Shadow System - lazy to avoid Platform at module load (runtime not ready on Hermes)
// ============================================================================

export type ShadowsRecord = {
  none: Record<string, never>;
  xs: object;
  sm: object;
  md: object;
  lg: object;
  xl: object;
  inner: object;
};

let _shadows: ShadowsRecord | null = null;

function getShadows(): ShadowsRecord {
  if (_shadows) return _shadows;
  _shadows = {
    none: {},
    xs: Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: { elevation: 1 },
      default: {},
    }) ?? {},
    sm: Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
      default: {},
    }) ?? {},
    md: Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      default: {},
    }) ?? {},
    lg: Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.14,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
      default: {},
    }) ?? {},
    xl: Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.18,
        shadowRadius: 32,
      },
      android: { elevation: 16 },
      default: {},
    }) ?? {},
    inner: Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: {},
      default: {},
    }) ?? {},
  };
  return _shadows;
}

export type ShadowToken = keyof ShadowsRecord;

// ============================================================================
// Theme Type Definitions
// ============================================================================

export type ColorMode = "dark" | "light";
export type ColorModePreference = ColorMode | "system";

export interface ThemeColors {
  // Background colors
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceAlt: string;
  surfaceMuted: string;

  // Border colors
  border: string;
  borderSubtle: string;
  borderStrong: string;

  // Text colors
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textMuted: string;
  textInverse: string;
  textPlaceholder: string;

  // Brand colors
  accent: string;
  accentSoft: string;
  accentMuted: string;
  accentSubtle: string;
  accentOnDark: string;

  // Semantic colors
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;

  // Utility colors
  overlay: string;
  shadow: string;
  skeleton: string;
  skeletonHighlight: string;

  // Special colors
  assistantBg: string;
  userBg: string;
}

export interface Theme {
  mode: ColorMode;
  colors: ThemeColors;
  typography: TypographyScaleRecord;
  spacing: typeof spacing;
  radii: typeof radii;
  motion: typeof motion;
  spring: typeof springConfigs;
  easings: typeof easings;
  shadows: ShadowsRecord;
}

// ============================================================================
// Theme Building Functions
// ============================================================================

function withAlpha(color: string, alpha: number): string {
  const hex = color.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildColors(mode: ColorMode = "light"): ThemeColors {
  const brand = brandColors;
  const isDark = mode === "dark";

  // Neutral palette selection
  const neutrals = isDark
    ? {
      background: neutralColors.black,
      surface: "#151821",
      surfaceElevated: "#1d202a",
      surfaceAlt: "#1d202a",
      surfaceMuted: "#262b36",
      border: "#2e3340",
      borderSubtle: "#1e222d",
      borderStrong: "#3d4352",
      textPrimary: "#f5f7fb",
      textSecondary: "#d1d7e3",
      textTertiary: "#9aa3b2",
      textMuted: "#6b7280",
      textInverse: neutralColors.black,
      textPlaceholder: "#6b7280",
      overlay: "rgba(0, 0, 0, 0.7)",
      shadow: "rgba(0, 0, 0, 0.5)",
      skeleton: "#1e222d",
      skeletonHighlight: "#2a3140",
    }
    : {
      background: "transparent",
      surface: "rgba(255, 255, 255, 0.6)",
      surfaceElevated: "rgba(255, 255, 255, 0.8)",
      surfaceAlt: "rgba(240, 248, 255, 0.6)",
      surfaceMuted: "rgba(224, 242, 255, 0.6)",
      border: "rgba(135, 206, 235, 0.4)",
      borderSubtle: "rgba(135, 206, 235, 0.2)",
      borderStrong: "rgba(135, 206, 235, 0.6)",
      textPrimary: "#0F172A",
      textSecondary: "#334155",
      textTertiary: "#475569",
      textMuted: "rgba(71, 85, 105, 0.7)",
      textInverse: "#FFFFFF",
      textPlaceholder: "#94A3B8",
      overlay: "rgba(255, 255, 255, 0.7)",
      shadow: "rgba(0, 100, 200, 0.05)",
      skeleton: "rgba(135, 206, 235, 0.1)",
      skeletonHighlight: "rgba(135, 206, 235, 0.3)",
    };

  // Semantic colors
  const semantic = isDark
    ? {
      success: semanticColors.success.dark,
      successSoft: withAlpha(semanticColors.success.dark, 0.2),
      danger: semanticColors.danger.dark,
      dangerSoft: withAlpha(semanticColors.danger.dark, 0.2),
      warning: semanticColors.warning.dark,
      warningSoft: withAlpha(semanticColors.warning.dark, 0.2),
      info: semanticColors.info.dark,
      infoSoft: withAlpha(semanticColors.info.dark, 0.2),
    }
    : {
      success: semanticColors.success.light,
      successSoft: withAlpha(semanticColors.success.light, 0.2),
      danger: semanticColors.danger.light,
      dangerSoft: withAlpha(semanticColors.danger.light, 0.2),
      warning: semanticColors.warning.light,
      warningSoft: withAlpha(semanticColors.warning.light, 0.2),
      info: semanticColors.info.light,
      infoSoft: withAlpha(semanticColors.info.light, 0.2),
    };

  const lightBrandColors = {
    accent: "#4A90E2", // Soft Cerulean
    accentSoft: "#B3D4FF", // Cloud Blue
    accentMuted: "rgba(179, 212, 255, 0.25)",
    accentOnDaily: "#4A90E2",
    accentOnDark: "#A594FF",
  };
  const activeBrand = isDark ? brand : lightBrandColors;

  return {
    ...neutrals,
    ...activeBrand,
    ...semantic,
    accentSubtle: withAlpha(activeBrand.accent, 0.2),
    assistantBg: neutrals.surfaceAlt,
    userBg: isDark ? "#1e2a3a" : "#F0F4F8",
  };
}

export function buildTheme(mode: ColorMode): Theme {
  return {
    mode,
    colors: buildColors(mode),
    typography: getTypographyScale(),
    spacing,
    radii,
    motion,
    spring: springConfigs,
    easings,
    shadows: getShadows(),
  };
}

// ============================================================================
// Theme Context
// ============================================================================

interface ThemeContextValue {
  mode: ColorMode;
}

const defaultContextValue: ThemeContextValue = {
  mode: "light",
};

const ThemeContext = createContext<ThemeContextValue>(defaultContextValue);

export interface ModernThemeProviderProps {
  mode?: ColorModePreference;
  onModeChange?: (mode: ColorModePreference) => void;
  children: React.ReactNode;
}

export function ModernThemeProvider({
  mode: initialMode = "system",
  onModeChange,
  children,
}: ModernThemeProviderProps) {
  const systemColorScheme = useColorScheme();

  // Note: if initialMode changes dynamically, it will override userPreference
  const [userPreference, setUserPreference] = React.useState<ColorModePreference>(initialMode);

  // Update state if controlled prop changes
  React.useEffect(() => {
    if (initialMode && initialMode !== userPreference) {
      setUserPreference(initialMode);
    }
  }, [initialMode]);

  const activeMode = useMemo(() => {
    if (userPreference === "system") {
      return (systemColorScheme === "dark" ? "dark" : "light") as ColorMode;
    }
    return userPreference as ColorMode;
  }, [userPreference, systemColorScheme]);

  const value = useMemo(
    () => ({
      mode: activeMode,
    }),
    [activeMode]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// ============================================================================
// Theme Hooks
// ============================================================================

export function useThemeContext(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function useThemeMode(): ColorMode {
  return useThemeContext().mode;
}

export function useTheme(): Theme {
  const mode = useThemeMode();

  return useMemo(() => buildTheme(mode), [mode]);
}

export function useColors(): ThemeColors {
  return useTheme().colors;
}

export function useTypography(): TypographyScaleRecord {
  return useTheme().typography;
}

// ============================================================================
// Responsive Utilities
// ============================================================================

export function useResponsive() {
  const { width, height, scale, fontScale } = Dimensions.get("window");

  return useMemo(() => ({
    width,
    height,
    scale,
    fontScale,
    isSmallScreen: width < 375,
    isMediumScreen: width >= 375 && width < 414,
    isLargeScreen: width >= 414,
    isLandscape: width > height,
    pixelDensity: PixelRatio.get(),

    // Responsive sizing helpers
    scaleSize: (size: number) => Math.round(size * scale),
    scaleFont: (size: number) => Math.round(size * fontScale),

    // Breakpoint helpers
    gt: {
      xs: width >= 320,
      sm: width >= 375,
      md: width >= 414,
      lg: width >= 768,
      xl: width >= 1024,
    },
  }), [width, height, scale, fontScale]);
}
