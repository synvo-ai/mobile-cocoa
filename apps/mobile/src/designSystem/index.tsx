/**
 * Modern Design System for React Native
 *
 * A comprehensive, accessible, and performant design system featuring:
 * - WCAG 2.1 AA compliant color system
 * - Scalable typography with responsive sizing
 * - 8px grid spacing system
 * - Smooth animations using RN built-in Animated API
 * - Haptic feedback integration
 * - Dark/light mode support
 */

// ============================================================================
// Theme System Exports
// ============================================================================

// ============================================================================
// Animation System Exports
// ============================================================================
export {

    // Components
    AnimatedPressableView, EntranceAnimation, FlashAnimation, ProgressiveImage, PulseAnimation, Skeleton, SkeletonCard, SkeletonText, StaggeredList, SwipeableCard,
    // Utilities
    triggerHaptic, TypingDots, useHaptic,
    usePerformanceMonitor, usePressableAnimation,
    // Hooks
    useSpringAnimation, type AnimationConfig,
    // Types
    type AnimationVariant, type HapticConfig
} from "@/designSystem/animations";
// ============================================================================
// Component Exports
// ============================================================================
export {
    Avatar,
    // Data Display
    Badge,
    // Buttons
    Button,
    // Layout
    Card, Chip, Divider, IconButton,
    // Form Elements
    Input,
    // Utilities
    KeyboardAware, ListItem,
    // Typography
    Typography, type AvatarSize, type BadgeSize, type BadgeVariant, type ButtonSize,
    // Types
    type ButtonVariant, type CardVariant,
    type TextTone
} from "@/designSystem/components";
export {
    brandColors,
    // Utilities
    buildTheme, contrastRatios, easings, getContrastRatio, ModernThemeProvider, motion, radii,
    // Constants
    spacing, springConfigs, useColors, useResponsive,
    // Hooks
    useTheme,
    useThemeContext,
    useThemeMode, useTypography, type ColorMode,
    type ColorModePreference, type RadiusToken,
    type ShadowToken, type SpacingToken,
    // Types
    type Theme,
    type ThemeColors, type TypographyStyle, type TypographyVariant
} from "@/designSystem/theme";
export { cn } from "@/utils/cn";



