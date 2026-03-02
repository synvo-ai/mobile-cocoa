import React from "react";
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from "react-native-reanimated";

interface ScaleWrapperProps {
    children: React.ReactElement<any>;
    scaleTo?: number;
}

export function ScaleWrapper({ children, scaleTo = 0.95 }: ScaleWrapperProps) {
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    return (
        <Reanimated.View style={animatedStyle}>
            {React.cloneElement(children, {
                onPressIn: (e: any) => {
                    scale.value = withTiming(scaleTo, { duration: 100 });
                    if (children.props.onPressIn) children.props.onPressIn(e);
                },
                onPressOut: (e: any) => {
                    scale.value = withSpring(1, { damping: 10, stiffness: 300 });
                    if (children.props.onPressOut) children.props.onPressOut(e);
                }
            })}
        </Reanimated.View>
    );
}
