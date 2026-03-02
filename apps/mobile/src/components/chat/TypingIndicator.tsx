import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming,
    type SharedValue
} from "react-native-reanimated";

interface TypingIndicatorProps {
    color?: string;
    dotSize?: number;
}

const DOT_OFFSET = 5;
const ANIMATION_DURATION = 350;

export function TypingIndicator({ color = "#888", dotSize = 6 }: TypingIndicatorProps) {
    const dot1 = useSharedValue(0);
    const dot2 = useSharedValue(0);
    const dot3 = useSharedValue(0);

    useEffect(() => {
        const animateDot = (dot: SharedValue<number>, delay: number) => {
            dot.value = withDelay(
                delay,
                withRepeat(
                    withSequence(
                        withTiming(-DOT_OFFSET, { duration: ANIMATION_DURATION }),
                        withTiming(0, { duration: ANIMATION_DURATION }),
                        withTiming(0, { duration: ANIMATION_DURATION })
                    ),
                    -1, // Infinite loop
                    true // Reverse to start before repeating
                )
            );
        };

        animateDot(dot1, 0);
        animateDot(dot2, ANIMATION_DURATION * 0.4);
        animateDot(dot3, ANIMATION_DURATION * 0.8);
    }, [dot1, dot2, dot3]);

    const style1 = useAnimatedStyle(() => ({ transform: [{ translateY: dot1.value }] }));
    const style2 = useAnimatedStyle(() => ({ transform: [{ translateY: dot2.value }] }));
    const style3 = useAnimatedStyle(() => ({ transform: [{ translateY: dot3.value }] }));

    const dotBaseStyle = {
        width: dotSize,
        height: dotSize,
        borderRadius: dotSize / 2,
        backgroundColor: color,
    };

    return (
        <View style={styles.container}>
            <Animated.View style={[dotBaseStyle, style1]} />
            <Animated.View style={[dotBaseStyle, style2]} />
            <Animated.View style={[dotBaseStyle, style3]} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        height: 24,
        paddingHorizontal: 4,
    },
});
