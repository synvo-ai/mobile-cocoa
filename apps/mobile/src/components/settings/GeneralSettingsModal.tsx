import { CloseIcon } from "@/components/icons/ChatActionIcons";
import { Box } from "@/components/ui/box";
import { Modal } from "@/components/ui/modal";
import { Pressable } from "@/components/ui/pressable";
import { ScrollView } from "@/components/ui/scroll-view";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { HStack } from "@/components/ui/hstack";
import { triggerHaptic } from "@/designSystem";
import { useTheme } from "@/theme/index";
import React from "react";
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
    isAutoApproveToolConfirm: boolean;
    onAutoApproveToolConfirmChange: (next: boolean) => void;
    connectionMode: ConnectionMode;
    workspacePath: string | null;
}

export function GeneralSettingsModal({
    isOpen,
    onClose,
    isAutoApproveToolConfirm,
    onAutoApproveToolConfirmChange,
    connectionMode,
    workspacePath,
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
    const serverUrl = getDefaultServerConfig().getBaseUrl();

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
                >
                    <VStack space="xl">
                        {/* YOLO Mode Section */}
                        <VStack space="md">
                            <Text size="sm" bold style={{ color: mutedColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                Automation & Permissions
                            </Text>
                            <HStack className="items-center justify-between p-4 rounded-xl border" style={{ backgroundColor: cardSurface, borderColor: panelBorder }}>
                                <VStack space="xs" className="flex-1">
                                    <Text size="md" bold style={{ color: titleColor }}>YOLO Mode</Text>
                                    <Text size="xs" style={{ color: mutedColor }}>Skip confirmations for AI tool execution</Text>
                                </VStack>
                                <Switch
                                    value={isAutoApproveToolConfirm}
                                    onValueChange={(val: boolean) => {
                                        triggerHaptic("light");
                                        onAutoApproveToolConfirmChange(val);
                                    }}
                                    trackColor={{
                                        false: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)",
                                        true: accentColor,
                                    }}
                                />
                            </HStack>
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
