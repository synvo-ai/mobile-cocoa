import React, { useState, useCallback, useRef } from 'react';
import {
    FlatList,
    Platform,
    TextInput,
    LayoutAnimation,
    UIManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Motion } from '@legendapp/motion';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';

import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { KeyboardAvoidingView } from '@/components/ui/keyboard-avoiding-view';
import { cn } from '@/utils/cn';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// --- Types ---
export type Message = {
    id: string;
    text: string;
    isUser: boolean;
    timestamp: Date;
};

// --- Dummy Data ---
const INITIAL_MESSAGES: Message[] = [
    { id: '1', text: 'Hello! I am your modern Chat Bot. How can I assist you today?', isUser: false, timestamp: new Date() },
];

// --- Subview: Modular Message Bubble ---
const MessageBubble = React.memo(({ message }: { message: Message }) => {
    const isUser = message.isUser;

    return (
        <Motion.View
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', damping: 18, stiffness: 200 }}
            className={cn(
                "my-1.5 max-w-[85%]", // messageWrapper
                isUser ? "self-end" : "self-start"
            )}
        >
            <Box
                className={cn(
                    "px-4 py-3 rounded-[22px] overflow-hidden", // messageBubble
                    isUser
                        ? "bg-blue-500 rounded-br-[6px]" // User Bubble
                        : "bg-white rounded-bl-[6px] border border-neutral-200 shadow-sm" // Bot Bubble
                )}
            >
                <Text
                    className={cn(
                        "text-base leading-[22px]",
                        isUser ? "text-white" : "text-black"
                    )}
                >
                    {message.text}
                </Text>
            </Box>
        </Motion.View>
    );
});

// --- Subview: Tactile Send Button ---
const SendButton = ({ onPress, disabled }: { onPress: () => void; disabled: boolean }) => {
    const handlePress = () => {
        if (disabled) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
    };

    return (
        <Motion.Pressable
            onPress={handlePress}
            disabled={disabled}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            whileTap={{ scale: disabled ? 1 : 0.92 }}
            animate={{ opacity: disabled ? 0.5 : 1 }}
            transition={{ default: { type: 'spring', damping: 10, stiffness: 300 } }}
            className="ml-3 bg-blue-500 rounded-[18px] py-2 px-4 justify-center items-center mb-[-2px]"
        >
            <Motion.Text
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', damping: 12, stiffness: 250 }}
                className="text-white text-[15px] font-semibold"
            >
                Send
            </Motion.Text>
        </Motion.Pressable>
    );
};

// --- Main Chat Page Container ---
export default function ModernChatBotPage() {
    const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
    const [inputText, setInputText] = useState('');
    const flatListRef = useRef<FlatList>(null);
    const insets = useSafeAreaInsets();

    const handleSend = useCallback(() => {
        const trimmed = inputText.trim();
        if (!trimmed) return;

        const newMessage: Message = {
            id: Date.now().toString(),
            text: trimmed,
            isUser: true,
            timestamp: new Date(),
        };

        // Smooth layout changes when dynamically adding messages onto the list
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

        setMessages((prev) => [newMessage, ...prev]);
        setInputText('');

        setTimeout(() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const botMessage: Message = {
                id: (Date.now() + 1).toString(),
                text: "I received your message! Animations are fully powered by legendapp/motion and core React Native.",
                isUser: false,
                timestamp: new Date(),
            };

            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setMessages((prev) => [botMessage, ...prev]);
        }, 1200);
    }, [inputText]);

    return (
        <SafeAreaView className="flex-1 bg-neutral-100" edges={['top', 'left', 'right']}>
            <KeyboardAvoidingView
                className="flex-1"
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => <MessageBubble message={item} />}
                    showsVerticalScrollIndicator={false}
                    inverted
                    contentContainerStyle={{
                        paddingHorizontal: 16,
                        paddingTop: 20,
                        paddingBottom: insets.bottom + 90
                    }}
                />

                {/* Sticky iOS Blur Input Dock */}
                <BlurView
                    intensity={85}
                    tint="light"
                    className="absolute bottom-0 left-0 right-0 px-4 pt-3 border-t border-neutral-300"
                    style={{ paddingBottom: Math.max(insets.bottom, 16) }}
                >
                    <Box className="flex-row items-end bg-white rounded-[24px] px-4 py-2 border border-neutral-300">
                        <TextInput
                            className="flex-1 max-h-[120px] min-h-[24px] text-base leading-5 py-1 text-black"
                            placeholder="Message..."
                            placeholderTextColor="#8E8E93"
                            value={inputText}
                            onChangeText={setInputText}
                            multiline
                            maxLength={1000}
                        />
                        <SendButton onPress={handleSend} disabled={inputText.trim().length === 0} />
                    </Box>
                </BlurView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
