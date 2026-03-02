import { ChevronDownIcon } from "@/components/icons/ChatActionIcons";
import { triggerHaptic } from "@/designSystem";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View as RNView } from "react-native";
import Animated, { useAnimatedStyle, withSpring, LinearTransition, SlideInDown } from "react-native-reanimated";
import { Text } from "@/components/ui/text";

interface ThinkingSectionProps {
    content: string;
    theme: any;
    renderContent: (content: string) => React.ReactNode;
    initiallyExpanded?: boolean;
    isLoading?: boolean;
}

export function ThinkingSection({
    content,
    theme,
    renderContent,
    initiallyExpanded = false,
    isLoading = false,
}: ThinkingSectionProps) {
    const [expanded, setExpanded] = useState(initiallyExpanded);

    useEffect(() => {
        setExpanded(initiallyExpanded);
    }, [initiallyExpanded]);

    const chevronStyle = useAnimatedStyle(() => {
        return {
            transform: [{ rotate: withSpring(expanded ? "180deg" : "0deg") }],
        };
    }, [expanded]);

    return (
        <Animated.View
            layout={LinearTransition.springify().damping(24).stiffness(120)}
            className="my-2 rounded-xl border border-l-4 overflow-hidden"
            style={{
                borderColor: theme.colors.border,
                borderLeftColor: theme.colors.accent,
                backgroundColor: theme.colors.accentSoft,
            }}
        >
            <Pressable
                onPress={() => {
                    triggerHaptic("light");
                    setExpanded((e) => !e);
                }}
                className="flex-row items-center justify-between py-3 px-4 min-h-11 active:opacity-80"
                accessibilityRole="button"
                accessibilityLabel={expanded ? "Hide reasoning" : "Show reasoning"}
                accessibilityState={{ expanded }}
            >
                <RNView style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {isLoading && <ActivityIndicator size="small" color={theme.colors.accent} />}
                    <Text size="xs" bold style={{ color: theme.colors.textPrimary, opacity: 0.7 }}>
                        {expanded ? "Reasoning" : "Show reasoning"}
                    </Text>
                </RNView>
                <Animated.View style={chevronStyle}>
                    <ChevronDownIcon size={14} color={theme.colors.textMuted} strokeWidth={2} />
                </Animated.View>
            </Pressable>
            {expanded && (
                <Animated.View
                    entering={SlideInDown.springify().damping(24).stiffness(120)}
                    className="px-4 pb-3"
                >
                    {renderContent(content)}
                </Animated.View>
            )}
        </Animated.View>
    );
}
