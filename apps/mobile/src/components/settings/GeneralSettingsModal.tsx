import { CloseIcon, PortForwardIcon } from "@/components/icons/ChatActionIcons";
import { Box } from "@/components/ui/box";
import { Modal } from "@/components/ui/modal";
import { Pressable } from "@/components/ui/pressable";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { HStack } from "@/components/ui/hstack";
import { triggerHaptic } from "@/designSystem";
import { useTheme } from "@/theme/index";
import React, { useCallback, useEffect, useState } from "react";
import { TextInput, ActivityIndicator, Keyboard } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { type ConnectionMode, getDefaultServerConfig } from "@/services/server/config";

const CONNECTION_MODE_LABELS: Record<ConnectionMode, { label: string; description: string }> = {
    cloudflare: { label: "Cloudflare Tunnel", description: "Proxy through Cloudflare for remote access" },
    tailscale: { label: "Tailscale", description: "Direct connection on a Tailscale private network" },
    direct: { label: "Direct / Local", description: "Direct connection (localhost or LAN IP)" },
};

export interface GeneralSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    connectionMode: ConnectionMode;
    workspacePath: string | null;
    onOpenPortForwarding?: () => void;
}

export function GeneralSettingsModal({
    isOpen,
    onClose,
    connectionMode,
    workspacePath,
    onOpenPortForwarding,
}: GeneralSettingsModalProps) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const isDark = theme.mode === "dark";

    const surfaceBase = isDark ? "rgba(7, 11, 21, 0.94)" : "rgba(255, 255, 255, 0.96)";
    const cardSurface = isDark ? "rgba(16, 24, 40, 0.9)" : "rgba(248, 250, 252, 0.96)";
    const panelBorder = isDark ? "rgba(162, 210, 255, 0.28)" : "rgba(15, 23, 42, 0.12)";
    const titleColor = isDark ? "#EAF4FF" : "#0F172A";
    const mutedColor = isDark ? "rgba(217, 232, 249, 0.82)" : "#475569";
    const accentColor = isDark ? "#60A5FA" : "#2563EB";

    const piPath = workspacePath ? `${workspacePath}/.pi` : "—";
    const activeConnection = CONNECTION_MODE_LABELS[connectionMode];
    const serverConfig = getDefaultServerConfig();
    const serverUrl = serverConfig.getBaseUrl();

    // ── System Prompt State ──────────────────────────────────────────────────
    const [systemPrompt, setSystemPrompt] = useState("");
    const [savedPrompt, setSavedPrompt] = useState("");
    const [loadingPrompt, setLoadingPrompt] = useState(false);
    const [savingPrompt, setSavingPrompt] = useState(false);
    const [promptStatus, setPromptStatus] = useState<"idle" | "saved" | "error">("idle");

    const hasChanges = systemPrompt !== savedPrompt;

    // Load system prompt when modal opens
    useEffect(() => {
        if (!isOpen) return;
        setLoadingPrompt(true);
        setPromptStatus("idle");
        fetch(`${serverUrl}/api/system-prompt`)
            .then((r) => r.json())
            .then((data) => {
                const prompt = typeof data.prompt === "string" ? data.prompt : "";
                setSystemPrompt(prompt);
                setSavedPrompt(prompt);
            })
            .catch(() => setPromptStatus("error"))
            .finally(() => setLoadingPrompt(false));
    }, [isOpen, serverUrl]);

    const saveSystemPrompt = useCallback(() => {
        Keyboard.dismiss();
        setSavingPrompt(true);
        setPromptStatus("idle");
        triggerHaptic("light");
        fetch(`${serverUrl}/api/system-prompt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: systemPrompt }),
        })
            .then((r) => r.json())
            .then((data) => {
                const saved = typeof data.prompt === "string" ? data.prompt : systemPrompt;
                setSavedPrompt(saved);
                setSystemPrompt(saved);
                setPromptStatus("saved");
                setTimeout(() => setPromptStatus("idle"), 2000);
            })
            .catch(() => setPromptStatus("error"))
            .finally(() => setSavingPrompt(false));
    }, [serverUrl, systemPrompt]);

    const content = (
        <SafeAreaView style={{ flex: 1, backgroundColor: surfaceBase }} edges={["top", "left", "right"]}>
            <Box className="flex-1 overflow-hidden" style={{ backgroundColor: surfaceBase }}>
                <Box
                    className="flex-row items-center justify-between py-4 px-5 border-b"
                    style={{ borderBottomColor: panelBorder }}
                >
                    <Text className="text-lg font-semibold" style={{ color: titleColor }}>
                        General Settings
                    </Text>
                    <Pressable
                        onPress={onClose}
                        hitSlop={12}
                        accessibilityLabel="Close settings"
                        className="p-2 min-w-11 min-h-11 items-center justify-center"
                    >
                        <CloseIcon size={20} color={mutedColor} />
                    </Pressable>
                </Box>

                <ScrollView
                    className="flex-1"
                    contentContainerStyle={{
                        paddingHorizontal: 20,
                        paddingTop: 16,
                        paddingBottom: Math.max(insets.bottom, 24),
                    }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <VStack space="xl">

                        {/* System Prompt Section */}
                        <VStack space="md">
                            <Text size="sm" bold style={{ color: mutedColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                System Prompt
                            </Text>
                            <VStack space="sm" className="p-4 rounded-xl border" style={{ backgroundColor: cardSurface, borderColor: panelBorder }}>
                                <Text size="xs" style={{ color: mutedColor }}>
                                    Custom instructions appended to every session. Changes take effect on the next session start.
                                </Text>
                                {loadingPrompt ? (
                                    <Box className="items-center justify-center py-6">
                                        <ActivityIndicator size="small" color={accentColor} />
                                    </Box>
                                ) : (
                                    <TextInput
                                        value={systemPrompt}
                                        onChangeText={setSystemPrompt}
                                        multiline
                                        numberOfLines={6}
                                        textAlignVertical="top"
                                        placeholder="e.g. Always respond in concise bullet points…"
                                        placeholderTextColor={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)"}
                                        style={{
                                            color: titleColor,
                                            backgroundColor: isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.04)",
                                            borderRadius: 8,
                                            padding: 12,
                                            minHeight: 120,
                                            fontSize: 13,
                                            fontFamily: "System",
                                            borderWidth: 1,
                                            borderColor: hasChanges ? accentColor : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"),
                                        }}
                                    />
                                )}
                                <HStack className="items-center justify-between" style={{ marginTop: 4 }}>
                                    <Text size="xs" style={{
                                        color: promptStatus === "saved" ? "#22C55E" : promptStatus === "error" ? "#EF4444" : "transparent",
                                    }}>
                                        {promptStatus === "saved" ? "✓ Saved" : promptStatus === "error" ? "Failed to save" : "—"}
                                    </Text>
                                    <Pressable
                                        onPress={saveSystemPrompt}
                                        disabled={!hasChanges || savingPrompt}
                                        style={{
                                            backgroundColor: hasChanges ? accentColor : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"),
                                            paddingHorizontal: 16,
                                            paddingVertical: 8,
                                            borderRadius: 8,
                                            opacity: hasChanges && !savingPrompt ? 1 : 0.5,
                                        }}
                                    >
                                        {savingPrompt ? (
                                            <ActivityIndicator size="small" color="#fff" />
                                        ) : (
                                            <Text size="xs" bold style={{ color: hasChanges ? "#fff" : mutedColor }}>
                                                Save
                                            </Text>
                                        )}
                                    </Pressable>
                                </HStack>
                            </VStack>
                        </VStack>

                        {/* Connection Method Section — read-only, derived from config */}
                        <VStack space="md">
                            <Text size="sm" bold style={{ color: mutedColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                Connection Method
                            </Text>
                            <VStack space="sm" className="p-4 rounded-xl border" style={{ backgroundColor: cardSurface, borderColor: panelBorder }}>
                                <HStack className="items-center" space="sm">
                                    <Box
                                        className="w-2.5 h-2.5 rounded-full"
                                        style={{ backgroundColor: accentColor }}
                                    />
                                    <Text size="md" bold style={{ color: titleColor }}>{activeConnection.label}</Text>
                                </HStack>
                                <Text size="xs" style={{ color: mutedColor }}>{activeConnection.description}</Text>

                                <Text size="xs" bold style={{ color: mutedColor, marginTop: 8 }}>Remote Host URL</Text>
                                <Box className="p-2 rounded bg-black/5 dark:bg-white/5">
                                    <Text size="xs" style={{ color: titleColor, fontFamily: "System" }}>{serverUrl}</Text>
                                </Box>

                                <Text size="xs" style={{ color: mutedColor, fontStyle: "italic", marginTop: 4 }}>
                                    Set via EXPO_PUBLIC_CONNECTION_MODE environment variable.
                                </Text>

                                {connectionMode === "cloudflare" && onOpenPortForwarding && (
                                    <Pressable
                                        onPress={() => {
                                            triggerHaptic("selection");
                                            onClose();
                                            onOpenPortForwarding();
                                        }}
                                        className="flex-row items-center gap-3 p-3 rounded-xl mt-2 active:opacity-80"
                                        style={{
                                            backgroundColor: isDark ? "rgba(34, 197, 94, 0.08)" : "rgba(34, 197, 94, 0.06)",
                                            borderWidth: 1,
                                            borderColor: isDark ? "rgba(34, 197, 94, 0.2)" : "rgba(34, 197, 94, 0.15)",
                                        }}
                                    >
                                        <Box className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: isDark ? "rgba(34, 197, 94, 0.15)" : "rgba(34, 197, 94, 0.12)" }}>
                                            <PortForwardIcon size={18} color={isDark ? "#4ADE80" : "#16A34A"} />
                                        </Box>
                                        <VStack>
                                            <Text size="sm" bold style={{ color: titleColor }}>Port Forwarding</Text>
                                            <Text size="xs" style={{ color: mutedColor }}>Configure port mappings for Cloudflare Tunnel</Text>
                                        </VStack>
                                    </Pressable>
                                )}
                            </VStack>
                        </VStack>

                        {/* Environment Info Section */}
                        <VStack space="md">
                            <Text size="sm" bold style={{ color: mutedColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                Environment Info
                            </Text>
                            <VStack space="sm" className="p-4 rounded-xl border" style={{ backgroundColor: cardSurface, borderColor: panelBorder }}>
                                <Text size="xs" bold style={{ color: mutedColor }}>Pi Workspace Path</Text>
                                <Box className="p-2 rounded bg-black/5 dark:bg-white/5">
                                    <Text size="xs" style={{ color: titleColor, fontFamily: "System" }}>{piPath}</Text>
                                </Box>
                                <Text size="xs" style={{ color: mutedColor, fontStyle: "italic", marginTop: 4 }}>
                                    This is the absolute path to your active .pi configuration directory.
                                </Text>
                            </VStack>
                        </VStack>
                    </VStack>
                </ScrollView>
            </Box>
        </SafeAreaView>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            {content}
        </Modal>
    );
}
