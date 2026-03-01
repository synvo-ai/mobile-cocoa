/**
 * Modern Design System Components
 *
 * Uses React Native's built-in Animated API instead of react-native-reanimated.
 */

import { type ImageSource } from "expo-image";
import React, { useCallback, useMemo, useState } from "react";
import {
    Animated, KeyboardAvoidingView,
    Platform, Pressable, StyleSheet, Text,
    TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle
} from "react-native";

import {
    AnimatedPressableView, EntranceAnimation, ProgressiveImage, Skeleton, triggerHaptic, TypingDots, usePressableAnimation
} from "@/designSystem/animations";
import {
    radii, spacing, useColors, useTheme, type TypographyVariant
} from "@/designSystem/theme";

// ============================================================================
// Typography Component
// ============================================================================

type TextTone = "primary" | "secondary" | "tertiary" | "muted";
export type TypographyTone = "primary" | "secondary" | "muted" | "accent" | "success" | "danger" | "warning" | "info" | "inverse";

export interface TypographyProps {
  children: React.ReactNode;
  variant?: TypographyVariant;
  tone?: TypographyTone;
  weight?: "normal" | "medium" | "semibold" | "bold";
  align?: "left" | "center" | "right";
  transform?: "none" | "uppercase" | "lowercase" | "capitalize";
  italic?: boolean;
  underline?: boolean;
  strikeThrough?: boolean;
  numberOfLines?: number;
  ellipsizeMode?: "head" | "middle" | "tail" | "clip";
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function Typography({
  children,
  variant = "body",
  tone = "primary",
  weight,
  align = "left",
  transform = "none",
  italic = false,
  underline = false,
  strikeThrough = false,
  numberOfLines,
  ellipsizeMode,
  color: customColor,
  style,
}: TypographyProps) {
  const theme = useTheme();

  const getFontWeight = (): TextStyle["fontWeight"] => {
    if (weight) {
      switch (weight) {
        case "bold": return "700";
        case "semibold": return "600";
        case "medium": return "500";
        case "normal": return "400";
      }
    }
    return theme.typography[variant].fontWeight as TextStyle["fontWeight"];
  };

  const getToneColor = () => {
    if (customColor) return customColor;
    const colors = theme.colors;
    switch (tone) {
      case "primary": return colors.textPrimary;
      case "secondary": return colors.textSecondary;
      case "muted": return colors.textMuted;
      case "accent": return colors.accent;
      case "success": return colors.success;
      case "danger": return colors.danger;
      case "warning": return colors.warning;
      case "info": return colors.info;
      case "inverse": return colors.textInverse;
      default: return colors.textPrimary;
    }
  };

  const textStyle = useMemo(
    () => ({
      ...theme.typography[variant],
      color: getToneColor(),
      textAlign: align,
      textTransform: transform,
      fontWeight: getFontWeight(),
      fontStyle: (italic ? "italic" : "normal") as "italic" | "normal",
      textDecorationLine: (underline
        ? strikeThrough
          ? "underline line-through"
          : "underline"
        : strikeThrough
          ? "line-through"
          : "none") as "none" | "underline" | "line-through" | "underline line-through",
    }),
    [theme.typography, variant, tone, align, transform, italic, underline, strikeThrough, weight, customColor, theme.colors]
  );

  return (
    <Text
      style={[textStyle, style]}
      numberOfLines={numberOfLines}
      ellipsizeMode={ellipsizeMode}
      maxFontSizeMultiplier={1.5}
    >
      {children}
    </Text>
  );
}

// ============================================================================
// Button Components
// ============================================================================

type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "ghost"
  | "danger"
  | "success";
type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";

interface ButtonProps {
  label: string;
  onPress?: () => void;
  onLongPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  haptic?: Parameters<typeof triggerHaptic>[0];
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

/* UI/UX Pro Max: sm/md at least 44px height for touch targets */
const buttonSizeConfig: Record<
  ButtonSize,
  { height: number; padding: number; fontSize: number }
> = {
  xs: { height: 28, padding: spacing["2"], fontSize: 12 },
  sm: { height: 44, padding: spacing["2"], fontSize: 13 },
  md: { height: 44, padding: spacing["3"], fontSize: 14 },
  lg: { height: 48, padding: spacing["4"], fontSize: 16 },
  xl: { height: 56, padding: spacing["5"], fontSize: 17 },
};

export function Button({
  label,
  onPress,
  onLongPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  icon,
  iconPosition = "left",
  haptic = "selection",
  style,
  labelStyle,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const colors = theme.colors;
  const config = buttonSizeConfig[size];

  const isDisabled = disabled || loading;

  const backgroundColors: Record<ButtonVariant, string> = {
    primary: colors.accent,
    secondary: colors.surface,
    tertiary: colors.surfaceAlt,
    ghost: "transparent",
    danger: colors.danger,
    success: colors.success,
  };

  const borderColors: Record<ButtonVariant, string> = {
    primary: colors.accent,
    secondary: colors.border,
    tertiary: colors.borderSubtle,
    ghost: "transparent",
    danger: colors.danger,
    success: colors.success,
  };

  const textColors: Record<ButtonVariant, string> = {
    primary: colors.textInverse,
    secondary: colors.textPrimary,
    tertiary: colors.textPrimary,
    ghost: colors.accent,
    danger: colors.textInverse,
    success: colors.textInverse,
  };

  const { animatedStyle, handlers } = usePressableAnimation({
    scaleTo: 0.97,
    opacityTo: 0.9,
    haptic: isDisabled ? undefined : haptic,
    onPress: onPress,
    onLongPress: onLongPress,
  });

  const buttonStyle = useMemo(
    () => ({
      height: config.height,
      paddingHorizontal: config.padding,
      backgroundColor: backgroundColors[variant],
      borderColor: borderColors[variant],
      borderWidth: variant === "ghost" ? 0 : 1,
      borderRadius: radii.md,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: spacing["2"],
      opacity: isDisabled ? 0.5 : 1,
    }),
    [config, variant, isDisabled, backgroundColors, borderColors]
  );

  const buttonContainerStyle = useMemo(() => {
    const flatStyle = StyleSheet.flatten(style);
    return { width: flatStyle?.width };
  }, [style]);

  return (
    <Animated.View style={[animatedStyle, buttonContainerStyle]}>
      <Pressable
        onPressIn={handlers.onPressIn}
        onPressOut={handlers.onPressOut}
        onPress={handlers.onPress}
        disabled={isDisabled}
        style={[buttonStyle, style]}
        accessibilityLabel={accessibilityLabel || label}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        testID={testID}
      >
        {loading ? (
          <TypingDots dotSize={6} dotColor={textColors[variant]} />
        ) : (
          <>
            {icon && iconPosition === "left" && icon}
            <Text
              style={[
                {
                  fontSize: config.fontSize,
                  fontWeight: "600",
                  color: textColors[variant],
                },
                labelStyle,
              ]}
            >
              {label}
            </Text>
            {icon && iconPosition === "right" && icon}
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

// Icon Button
interface IconButtonProps {
  icon: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  haptic?: Parameters<typeof triggerHaptic>[0];
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
  testID?: string;
}

/* UI/UX Pro Max: minimum 44x44px touch targets */
const iconButtonSizes = {
  sm: 44,
  md: 44,
  lg: 48,
};

export function IconButton({
  icon,
  onPress,
  onLongPress,
  variant = "secondary",
  size = "md",
  disabled = false,
  haptic = "selection",
  style,
  accessibilityLabel,
  testID,
}: IconButtonProps) {
  const theme = useTheme();
  const colors = theme.colors;
  const buttonSize = iconButtonSizes[size];

  const backgroundColors: Record<ButtonVariant, string> = {
    primary: colors.accent,
    secondary: colors.surfaceAlt,
    tertiary: colors.surfaceMuted,
    ghost: "transparent",
    danger: colors.dangerSoft,
    success: colors.successSoft,
  };

  const { animatedStyle, handlers } = usePressableAnimation({
    scaleTo: 0.92,
    haptic: disabled ? undefined : haptic,
    onPress,
    onLongPress,
  });

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPressIn={handlers.onPressIn}
        onPressOut={handlers.onPressOut}
        onPress={handlers.onPress}
        disabled={disabled}
        style={[
          {
            width: buttonSize,
            height: buttonSize,
            borderRadius: radii.md,
            backgroundColor: backgroundColors[variant],
            alignItems: "center",
            justifyContent: "center",
            borderWidth: variant === "ghost" ? 0 : 1,
            borderColor:
              variant === "ghost" ? "transparent" : colors.borderSubtle,
            opacity: disabled ? 0.5 : 1,
          },
          style,
        ]}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        testID={testID}
      >
        {icon}
      </Pressable>
    </Animated.View>
  );
}

// ============================================================================
// Card Component
// ============================================================================

type CardVariant = "default" | "elevated" | "outlined" | "ghost";

interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  padding?: keyof typeof spacing;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  haptic?: Parameters<typeof triggerHaptic>[0];
  accessibilityLabel?: string;
  testID?: string;
}

export function Card({
  children,
  variant = "default",
  padding = "4",
  style,
  onPress,
  haptic = "selection",
  accessibilityLabel,
  testID,
}: CardProps) {
  const theme = useTheme();
  const colors = theme.colors;
  const shadows = theme.shadows;

  const cardStyles = useMemo(() => {
    const base = {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing[padding],
    };

    switch (variant) {
      case "elevated":
        return {
          ...base,
          ...shadows.md,
        };
      case "outlined":
        return {
          ...base,
          borderWidth: 1,
          borderColor: colors.border,
        };
      case "ghost":
        return {
          ...base,
          backgroundColor: colors.surfaceAlt,
        };
      default:
        return {
          ...base,
          borderWidth: 1,
          borderColor: colors.borderSubtle,
          ...shadows.xs,
        };
    }
  }, [variant, colors, padding, shadows]);

  if (onPress) {
    return (
      <AnimatedPressableView
        onPress={onPress}
        haptic={haptic}
        style={[cardStyles, style]}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      >
        {children}
      </AnimatedPressableView>
    );
  }

  return (
    <View style={[cardStyles, style]} testID={testID}>
      {children}
    </View>
  );
}

// ============================================================================
// Input Components
// ============================================================================

interface InputProps extends Omit<TextInputProps, "style" | "editable"> {
  label?: string;
  error?: string;
  helper?: string;
  disabled?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  hapticOnFocus?: boolean;
}

export function Input({
  label,
  error,
  helper,
  disabled = false,
  leading,
  trailing,
  containerStyle,
  inputStyle,
  hapticOnFocus = true,
  onFocus,
  onBlur,
  placeholder,
  placeholderTextColor,
  ...textInputProps
}: InputProps) {
  const theme = useTheme();
  const colors = theme.colors;
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = useCallback(
    (e: any) => {
      setIsFocused(true);
      if (hapticOnFocus) {
        triggerHaptic("selection");
      }
      onFocus?.(e);
    },
    [onFocus, hapticOnFocus]
  );

  const handleBlur = useCallback(
    (e: any) => {
      setIsFocused(false);
      onBlur?.(e);
    },
    [onBlur]
  );

  const borderColor = error
    ? colors.danger
    : isFocused
      ? colors.accent
      : colors.border;
  const backgroundColor = disabled
    ? colors.surfaceMuted
    : isFocused
      ? colors.surfaceAlt
      : colors.surface;

  return (
    <View style={[{ width: "100%" }, containerStyle]}>
      {label && (
        <Typography
          variant="label"
          tone="secondary"
          style={{ marginBottom: spacing["2"] }}
        >
          {label}
        </Typography>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 48,
          paddingHorizontal: spacing["3"],
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor,
          backgroundColor,
          gap: spacing["2"],
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {leading}
        <TextInput
          {...textInputProps}
          editable={!disabled}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor || colors.textPlaceholder}
          style={[
            {
              flex: 1,
              fontSize: 16,
              color: colors.textPrimary,
              paddingVertical: spacing["2"],
            },
            inputStyle,
          ]}
        />
        {trailing}
      </View>
      {(error || helper) && (
        <Typography
          variant="caption"
          tone={error ? "danger" : "muted"}
          style={{ marginTop: 6 }}
        >
          {error || helper}
        </Typography>
      )}
    </View>
  );
}

// ============================================================================
// Badge Component
// ============================================================================

type BadgeVariant =
  | "default"
  | "accent"
  | "success"
  | "danger"
  | "warning"
  | "info";
type BadgeSize = "sm" | "md";

interface BadgeProps {
  children?: React.ReactNode;
  label?: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  style?: StyleProp<ViewStyle>;
  dot?: boolean;
}

const badgeStyles = StyleSheet.create({
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontWeight: "600",
  },
});

export function Badge({
  children,
  label,
  variant = "default",
  size = "md",
  style,
  dot = false,
}: BadgeProps) {
  const theme = useTheme();
  const colors = theme.colors;

  const variantStyles: Record<BadgeVariant, { backgroundColor: string; foregroundColor: string }> = {
    default: { backgroundColor: colors.surfaceMuted, foregroundColor: colors.textSecondary },
    accent: { backgroundColor: colors.accentSoft, foregroundColor: colors.accent },
    success: { backgroundColor: colors.successSoft, foregroundColor: colors.success },
    danger: { backgroundColor: colors.dangerSoft, foregroundColor: colors.danger },
    warning: { backgroundColor: colors.warningSoft, foregroundColor: colors.warning },
    info: { backgroundColor: colors.infoSoft, foregroundColor: colors.info },
  };

  const { backgroundColor, foregroundColor } = variantStyles[variant];
  const pad =
    size === "sm"
      ? { x: spacing["2"], y: 2 }
      : { x: spacing["3"], y: 4 };

  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: spacing["1"],
          paddingHorizontal: pad.x,
          paddingVertical: pad.y,
          backgroundColor: backgroundColor,
          borderRadius: radii.pill,
          alignSelf: "flex-start",
        },
        style,
      ]}
    >
      {dot && size === "md" && <View style={[badgeStyles.badgeDot, { backgroundColor: foregroundColor }]} />}
      <Text
        style={[
          badgeStyles.badgeText,
          { color: foregroundColor, fontSize: size === "sm" ? 10 : 12 },
        ]}
      >
        {children ?? label}
      </Text>
    </View>
  );
}

// ============================================================================
// Divider Component
// ============================================================================

interface DividerProps {
  orientation?: "horizontal" | "vertical";
  spacing?: keyof typeof spacing;
  style?: StyleProp<ViewStyle>;
}

export function Divider({
  orientation = "horizontal",
  spacing: spacingToken = "4",
  style,
}: DividerProps) {
  const colors = useColors();

  if (orientation === "vertical") {
    return (
      <View
        style={[
          {
            width: 1,
            backgroundColor: colors.border,
            marginHorizontal: spacing[spacingToken],
          },
          style,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        {
          height: 1,
          backgroundColor: colors.border,
          marginVertical: spacing[spacingToken],
        },
        style,
      ]}
    />
  );
}

// ============================================================================
// Avatar Component
// ============================================================================

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

interface AvatarProps {
  source?: ImageSource;
  name?: string;
  size?: AvatarSize;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

const avatarSizes: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
};

export function Avatar({
  source,
  name,
  size = "md",
  style,
  onPress,
}: AvatarProps) {
  const theme = useTheme();
  const colors = theme.colors;
  const dimension = avatarSizes[size];

  const initials = useMemo(() => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }, [name]);

  const content = source ? (
    <ProgressiveImage
      source={source}
      style={{
        width: dimension,
        height: dimension,
        borderRadius: dimension / 2,
      }}
      contentFit="cover"
    />
  ) : (
    <View
      style={{
        width: dimension,
        height: dimension,
        borderRadius: dimension / 2,
        backgroundColor: colors.accentSoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Typography
        variant={size === "xs" ? "caption" : "callout"}
        tone="accent"
      >
        {initials}
      </Typography>
    </View>
  );

  if (onPress) {
    return (
      <AnimatedPressableView
        onPress={onPress}
        haptic="selection"
        style={[{ borderRadius: dimension / 2 }, style]}
      >
        {content}
      </AnimatedPressableView>
    );
  }

  return <View style={style}>{content}</View>;
}

// ============================================================================
// Chip Component
// ============================================================================

interface ChipProps {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function Chip({
  label,
  selected = false,
  disabled = false,
  onPress,
  onRemove,
  icon,
  style,
}: ChipProps) {
  const theme = useTheme();
  const colors = theme.colors;

  const { animatedStyle, handlers } = usePressableAnimation({
    scaleTo: 0.95,
    haptic: disabled ? undefined : "selection",
    onPress,
  });

  return (
    <Animated.View style={[animatedStyle, { alignSelf: "flex-start" }]}>
      <Pressable
        onPressIn={handlers.onPressIn}
        onPressOut={handlers.onPressOut}
        onPress={handlers.onPress}
        disabled={disabled}
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: spacing["3"],
            paddingVertical: 6,
            backgroundColor: selected ? colors.accentSoft : colors.surfaceAlt,
            borderRadius: radii.pill,
            borderWidth: 1,
            borderColor: selected ? colors.accent : colors.borderSubtle,
            opacity: disabled ? 0.5 : 1,
          },
          style,
        ]}
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled }}
      >
        {icon}
        <Typography
          variant="callout"
          tone={selected ? "accent" : "primary"}
        >
          {label}
        </Typography>
        {onRemove && (
          <Pressable
            onPress={onRemove}
            hitSlop={8}
            style={{
              marginLeft: spacing["1"],
              marginRight: -spacing["1"],
            }}
          >
            <Typography variant="callout" tone="muted">
              ×
            </Typography>
          </Pressable>
        )}
      </Pressable>
    </Animated.View >
  );
}

// ============================================================================
// List Item Component
// ============================================================================

interface ListItemProps {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  haptic?: Parameters<typeof triggerHaptic>[0];
}

export function ListItem({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  disabled = false,
  style,
  haptic = "selection",
}: ListItemProps) {
  const theme = useTheme();
  void theme;

  const content = (
    <>
      {leading}
      <View style={{ flex: 1, gap: spacing["0.5"] }}>
        <Typography variant="body" tone="primary">
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="footnote" tone="muted">
            {subtitle}
          </Typography>
        )}
      </View>
      {trailing}
    </>
  );

  const containerStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing["3"],
    paddingVertical: spacing["3"],
    paddingHorizontal: spacing["4"],
    opacity: disabled ? 0.5 : 1,
  };

  if (onPress) {
    return (
      <AnimatedPressableView
        onPress={onPress}
        haptic={haptic}
        style={[containerStyle, style]}
        disabled={disabled}
      >
        {content}
      </AnimatedPressableView>
    );
  }

  return <View style={[containerStyle, style]}>{content}</View>;
}

// ============================================================================
// Keyboard Avoiding View Wrapper
// ============================================================================

interface KeyboardAwareProps {
  children: React.ReactNode;
  style?: ViewStyle;
  behavior?: "padding" | "position" | "height";
  offset?: number;
}

export function KeyboardAware({
  children,
  style,
  behavior = "padding",
  offset = 0,
}: KeyboardAwareProps) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? behavior : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? offset : 0}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

// ============================================================================
// Export all components
// ============================================================================

// Re-export SkeletonText and SkeletonCard from animations
export { SkeletonCard, SkeletonText } from "@/designSystem/animations";
export {
    type ButtonVariant,
    type ButtonSize,
    type CardVariant,
    type TextTone,
    type TypographyVariant,
    type BadgeVariant,
    type BadgeSize,
    type AvatarSize,
    // Animation components re-export
    Skeleton,
    ProgressiveImage,
    EntranceAnimation,
    TypingDots,
    AnimatedPressableView,
};

