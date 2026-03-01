/**
 * Animation System - Using React Native Built-in Animated API
 *
 * Replaces react-native-reanimated to avoid "property is not configurable" errors.
 * Provides the same component interfaces using RN's built-in Animated API.
 */

import { motion, useTheme } from "@/designSystem/theme";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Animated, DimensionValue, Easing, Pressable, StyleSheet, View, ViewStyle, type StyleProp
} from "react-native";

// ============================================================================
// Types
// ============================================================================

export type AnimationVariant =
  | "fade"
  | "scale"
  | "slideUp"
  | "slideDown"
  | "slideLeft"
  | "slideRight"
  | "bounce"
  | "flip"
  | "pulse";

export interface AnimationConfig {
  duration?: number;
  delay?: number;
  easing?: (t: number) => number;
}

export interface HapticConfig {
  type: "light" | "medium" | "heavy" | "success" | "warning" | "error" | "selection";
  enable?: boolean;
}

// ============================================================================
// Haptic Feedback System
// ============================================================================

const hapticFeedbackMap: Record<string, () => Promise<void>> = {
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  selection: () => Haptics.selectionAsync(),
};

export function triggerHaptic(type: HapticConfig["type"]): void {
  const feedback = hapticFeedbackMap[type];
  if (feedback) {
    feedback().catch(() => { });
  }
}

export function useHaptic() {
  return useCallback((type: HapticConfig["type"]) => {
    triggerHaptic(type);
  }, []);
}

// ============================================================================
// Spring Animation Utilities
// ============================================================================

export function useSpringAnimation(initialValue: number = 0) {
  const value = useRef(new Animated.Value(initialValue)).current;

  const animateTo = useCallback(
    (target: number, onComplete?: () => void) => {
      Animated.spring(value, {
        toValue: target,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && onComplete) onComplete();
      });
    },
    [value]
  );

  const animateWithSequence = useCallback(
    (sequence: Array<{ to: number; delay?: number }>, onComplete?: () => void) => {
      const animations = sequence.map((step) => {
        const anim = Animated.spring(value, {
          toValue: step.to,
          useNativeDriver: true,
        });
        return step.delay ? Animated.sequence([Animated.delay(step.delay), anim]) : anim;
      });
      Animated.sequence(animations).start(({ finished }) => {
        if (finished && onComplete) onComplete();
      });
    },
    [value]
  );

  const reset = useCallback(() => {
    value.stopAnimation();
    value.setValue(initialValue);
  }, [value, initialValue]);

  return { value, animateTo, animateWithSequence, reset };
}

// ============================================================================
// Pressable Animation Hook
// ============================================================================

export interface PressableAnimationOptions {
  scaleTo?: number;
  opacityTo?: number;
  haptic?: HapticConfig["type"];
  springConfig?: object;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  onLongPress?: () => void;
  longPressDelay?: number;
}

export function usePressableAnimation(options: PressableAnimationOptions = {}) {
  const {
    scaleTo = 0.96,
    opacityTo = 0.9,
    haptic = "selection",
    springConfig,
    onPress,
    onPressIn,
    onPressOut,
    onLongPress,
    longPressDelay = 500,
  } = options;

  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const longPressTriggered = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePressIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: scaleTo,
        useNativeDriver: true,
        ...(springConfig ?? {}),
      }),
      Animated.timing(opacity, {
        toValue: opacityTo,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start();

    if (haptic) triggerHaptic(haptic);
    onPressIn?.();

    if (onLongPress) {
      longPressTriggered.current = false;
      longPressTimer.current = setTimeout(() => {
        longPressTriggered.current = true;
        triggerHaptic("medium");
        onLongPress();
      }, longPressDelay);
    }
  }, [scaleTo, opacityTo, haptic, springConfig, onPressIn, onLongPress, longPressDelay, scale, opacity]);

  const handlePressOut = useCallback(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        ...(springConfig ?? {}),
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start();

    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    onPressOut?.();
  }, [springConfig, scale, opacity, onPressOut]);

  const handlePress = useCallback(() => {
    if (!longPressTriggered.current) {
      onPress?.();
    }
  }, [onPress]);

  const animatedStyle = {
    transform: [{ scale }],
    opacity,
  };

  return {
    animatedStyle,
    handlers: {
      onPressIn: handlePressIn,
      onPressOut: handlePressOut,
      onPress: handlePress,
    },
    isPressed: false,
  };
}

// ============================================================================
// Animated Pressable Component
// ============================================================================

interface AnimatedPressableViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  longPressDelay?: number;
  disabled?: boolean;
  haptic?: HapticConfig["type"];
  scaleTo?: number;
  opacityTo?: number;
  activeScale?: number;
  springConfig?: object;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: "button" | "link" | "none";
  testID?: string;
}

export function AnimatedPressableView({
  children,
  style,
  onPress,
  onLongPress,
  longPressDelay,
  disabled = false,
  haptic = "selection",
  scaleTo = 0.96,
  opacityTo = 0.9,
  springConfig,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = "button",
  testID,
}: AnimatedPressableViewProps) {
  const { animatedStyle, handlers } = usePressableAnimation({
    scaleTo,
    opacityTo,
    haptic: disabled ? undefined : haptic,
    springConfig,
    onPress,
    onLongPress,
    longPressDelay,
  });

  return (
    <Animated.View style={[style, animatedStyle, disabled && { opacity: 0.5 }]}>
      <Pressable
        style={{ flex: 1 }}
        onPressIn={disabled ? undefined : handlers.onPressIn}
        onPressOut={disabled ? undefined : handlers.onPressOut}
        onPress={disabled ? undefined : handlers.onPress}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityRole={accessibilityRole}
        accessibilityState={{ disabled }}
        testID={testID}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ============================================================================
// Skeleton/Shimmer Loading Components
// ============================================================================

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle;
  shimmer?: boolean;
  shimmerDuration?: number;
}

export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius,
  style,
  shimmer = true,
  shimmerDuration = 1500,
}: SkeletonProps) {
  const theme = useTheme();
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const [layoutWidth, setLayoutWidth] = useState(0);

  useEffect(() => {
    if (!shimmer || layoutWidth === 0) return;
    const animation = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: shimmerDuration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [shimmer, layoutWidth, shimmerDuration, shimmerAnim]);

  const shimmerTranslateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-layoutWidth, layoutWidth * 2],
  });

  const handleLayout = useCallback(
    (event: { nativeEvent: { layout: { width: number } } }) => {
      setLayoutWidth(event.nativeEvent.layout.width);
    },
    []
  );

  return (
    <View
      style={[
        styles.skeletonBase,
        {
          width,
          height,
          borderRadius: borderRadius ?? theme.radii.md,
          backgroundColor: theme.colors.skeleton,
        },
        style,
      ]}
      onLayout={handleLayout}
    >
      {shimmer && layoutWidth > 0 && (
        <Animated.View
          style={[
            styles.shimmer,
            {
              width: layoutWidth * 0.5,
              backgroundColor: theme.colors.skeletonHighlight,
              transform: [{ translateX: shimmerTranslateX }],
            },
          ]}
        />
      )}
    </View>
  );
}

export function SkeletonText({
  lines = 3,
  lineHeight = 16,
  lineSpacing = 8,
  lastLineWidth = "60%",
  style,
}: {
  lines?: number;
  lineHeight?: number;
  lineSpacing?: number;
  lastLineWidth?: DimensionValue;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  return (
    <View style={[{ gap: lineSpacing }, style]}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height={lineHeight}
          width={index === lines - 1 ? lastLineWidth : "100%"}
          borderRadius={theme.radii.sm}
        />
      ))}
    </View>
  );
}

export function SkeletonCard({
  height = 120,
  hasImage = true,
  imageHeight = 80,
  lines = 2,
  style,
}: {
  height?: number;
  hasImage?: boolean;
  imageHeight?: number;
  lines?: number;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.skeletonCard,
        {
          height,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.lg,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      {hasImage && (
        <Skeleton height={imageHeight} width="100%" borderRadius={theme.radii.lg} />
      )}
      <View style={{ padding: theme.spacing["3"], gap: theme.spacing["2"] }}>
        <SkeletonText lines={lines} lineHeight={14} lineSpacing={8} />
      </View>
    </View>
  );
}

// ============================================================================
// Progressive Image Loading
// ============================================================================

import { Image as ExpoImage, type ImageSource } from "expo-image";

interface ProgressiveImageProps {
  source: ImageSource;
  style?: any;
  placeholder?: ImageSource;
  contentFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
  transitionDuration?: number;
  onLoad?: () => void;
  onError?: () => void;
}

export function ProgressiveImage({
  source,
  style,
  placeholder,
  contentFit = "cover",
  transitionDuration = motion.normal,
  onLoad,
  onError,
}: ProgressiveImageProps) {
  const theme = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [isLoaded, setIsLoaded] = useState(false);

  const handleLoad = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: transitionDuration,
      useNativeDriver: true,
    }).start();
    setIsLoaded(true);
    onLoad?.();
  }, [transitionDuration, onLoad, fadeAnim]);

  return (
    <View style={[styles.imageContainer, style]}>
      {!isLoaded && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: theme.colors.surfaceMuted },
          ]}
        >
          <Skeleton
            width="100%"
            height="100%"
            borderRadius={(style?.borderRadius as number) ?? theme.radii.md}
          />
        </View>
      )}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
        <ExpoImage
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          onLoad={handleLoad}
          onError={onError}
          placeholder={placeholder}
          transition={transitionDuration}
        />
      </Animated.View>
    </View>
  );
}

// ============================================================================
// Typing Indicator Animation
// ============================================================================

interface TypingDotsProps {
  dotSize?: number;
  dotColor?: string;
  spacing?: number;
  style?: ViewStyle;
}

export function TypingDots({
  dotSize = 8,
  dotColor,
  spacing: dotSpacing = 4,
  style,
}: TypingDotsProps) {
  const theme = useTheme();
  const color = dotColor ?? theme.colors.textMuted;

  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createDotAnimation = (value: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay(600),
        ])
      );
    };

    const a1 = createDotAnimation(dot1, 0);
    const a2 = createDotAnimation(dot2, 150);
    const a3 = createDotAnimation(dot3, 300);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  const dots = [dot1, dot2, dot3];

  return (
    <View
      style={[{ flexDirection: "row", alignItems: "center", gap: dotSpacing }, style]}
    >
      {dots.map((dotAnim, index) => (
        <Animated.View
          key={index}
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: color,
            transform: [
              {
                translateY: dotAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -6],
                }),
              },
              {
                scale: dotAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.2],
                }),
              },
            ],
            opacity: dotAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.5, 1],
            }),
          }}
        />
      ))}
    </View>
  );
}

// ============================================================================
// Entrance Animations
// ============================================================================

interface EntranceAnimationProps {
  children: React.ReactNode;
  variant?: AnimationVariant;
  delay?: number;
  duration?: number;
  style?: ViewStyle;
  onComplete?: () => void;
}

export function EntranceAnimation({
  children,
  variant = "fade",
  delay = 0,
  duration = motion.normal,
  style,
  onComplete,
}: EntranceAnimationProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(
    new Animated.Value(
      variant === "slideUp" ? 30 : variant === "slideDown" ? -30 : 0
    )
  ).current;
  const translateX = useRef(
    new Animated.Value(
      variant === "slideLeft" ? 30 : variant === "slideRight" ? -30 : 0
    )
  ).current;
  const scale = useRef(
    new Animated.Value(
      variant === "scale" || variant === "bounce" ? 0.8 : 1
    )
  ).current;

  useEffect(() => {
    const startAnimation = () => {
      const animations: Animated.CompositeAnimation[] = [
        Animated.timing(opacity, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ];

      if (variant === "slideUp" || variant === "slideDown") {
        animations.push(
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true })
        );
      }
      if (variant === "slideLeft" || variant === "slideRight") {
        animations.push(
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true })
        );
      }
      if (variant === "scale" || variant === "bounce") {
        if (variant === "bounce") {
          animations.push(
            Animated.sequence([
              Animated.spring(scale, { toValue: 1.05, useNativeDriver: true }),
              Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
            ])
          );
        } else {
          animations.push(
            Animated.spring(scale, { toValue: 1, useNativeDriver: true })
          );
        }
      }

      Animated.parallel(animations).start(({ finished }) => {
        if (finished && onComplete) onComplete();
      });
    };

    if (delay > 0) {
      const timer = setTimeout(startAnimation, delay);
      return () => clearTimeout(timer);
    } else {
      startAnimation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Animated.Values are
    // stable refs; variant/delay/duration/onComplete included so dynamic props work.
  }, [variant, delay, duration, onComplete, opacity, translateY, translateX, scale]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: [{ translateY }, { translateX }, { scale }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// ============================================================================
// Staggered List Animation
// ============================================================================

interface StaggeredListProps<T> {
  data: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string;
  staggerDelay?: number;
  initialDelay?: number;
  style?: ViewStyle;
  itemStyle?: ViewStyle;
}

export function StaggeredList<T>({
  data,
  renderItem,
  keyExtractor,
  staggerDelay = 50,
  initialDelay = 0,
  style,
  itemStyle,
}: StaggeredListProps<T>) {
  return (
    <View style={style}>
      {data.map((item, index) => (
        <EntranceAnimation
          key={keyExtractor(item, index)}
          variant="slideUp"
          delay={initialDelay + index * staggerDelay}
          style={itemStyle}
        >
          {renderItem(item, index)}
        </EntranceAnimation>
      ))}
    </View>
  );
}

// ============================================================================
// Pulse Animation
// ============================================================================

interface PulseAnimationProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  duration?: number;
}

export function PulseAnimation({
  children,
  style,
  intensity = 0.05,
  duration = 2000,
}: PulseAnimationProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const scaleAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1 + intensity,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    const opacityAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          toValue: 1 - intensity,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 1,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    scaleAnim.start();
    opacityAnim.start();

    return () => {
      scaleAnim.stop();
      opacityAnim.stop();
    };
  }, [intensity, duration, scale, pulseOpacity]);

  return (
    <Animated.View
      style={[style, { transform: [{ scale }], opacity: pulseOpacity }]}
    >
      {children}
    </Animated.View>
  );
}

// ============================================================================
// Flash Animation (opacity blink for status indicators)
// ============================================================================

interface FlashAnimationProps {
  children: React.ReactNode;
  style?: ViewStyle;
  minOpacity?: number;
  duration?: number;
}

export function FlashAnimation({
  children,
  style,
  minOpacity = 0.35,
  duration = 600,
}: FlashAnimationProps) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: minOpacity,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [minOpacity, duration, opacity]);

  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

// ============================================================================
// Swipeable Card (Simplified - no gesture handler dependency)
// ============================================================================

interface SwipeableCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  swipeThreshold?: number;
  hapticOnSwipe?: boolean;
}

export function SwipeableCard({
  children,
  style,
}: SwipeableCardProps) {
  return <View style={style}>{children}</View>;
}

// ============================================================================
// Performance Monitor Hook
// ============================================================================

interface PerformanceMetrics {
  currentFps: number;
  averageFps: number;
  minFps: number;
  maxFps: number;
  droppedFrames: number;
  jankScore: number;
}

export function usePerformanceMonitor(
  active: boolean = true
): PerformanceMetrics {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    currentFps: 60,
    averageFps: 60,
    minFps: 60,
    maxFps: 60,
    droppedFrames: 0,
    jankScore: 0,
  });

  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(Date.now());
  const totalFramesRef = useRef(0);
  const tickCountRef = useRef(0);
  const minFpsRef = useRef(60);
  const maxFpsRef = useRef(0);
  const droppedFramesRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    let rafId: number;

    const loop = () => {
      frameCountRef.current++;
      const now = Date.now();
      const delta = now - lastTimeRef.current;

      if (delta >= 1000) {
        const fps = Math.round((frameCountRef.current * 1000) / delta);
        if (fps < 58) {
          droppedFramesRef.current += 60 - fps;
        }
        const jankScore = Math.min(
          100,
          (droppedFramesRef.current / (tickCountRef.current + 1)) * 2
        );
        totalFramesRef.current += fps;
        tickCountRef.current++;
        minFpsRef.current = Math.min(minFpsRef.current, fps);
        maxFpsRef.current = Math.max(maxFpsRef.current, fps);

        setMetrics({
          currentFps: fps,
          averageFps: Math.round(
            totalFramesRef.current / tickCountRef.current
          ),
          minFps:
            minFpsRef.current === 999 ? fps : minFpsRef.current,
          maxFps: maxFpsRef.current,
          droppedFrames: droppedFramesRef.current,
          jankScore: Math.round(jankScore),
        });

        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [active]);

  return metrics;
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  skeletonBase: {
    overflow: "hidden",
  },
  shimmer: {
    height: "100%",
    opacity: 0.6,
  },
  skeletonCard: {
    overflow: "hidden",
    borderWidth: 1,
  },
  imageContainer: {
    overflow: "hidden",
    position: "relative",
  },
});
