import { ChevronLeftIcon, CloseIcon } from "@/components/icons/ChatActionIcons";
import { ModalScaffold } from "@/components/reusable/ModalScaffold";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { Pressable } from "@/components/ui/pressable";
import { ScrollView } from "@/components/ui/scroll-view";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/theme/index";
import React, { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type MCPServerDetail = {
  id: string;
  name: string;
  description?: string;
  type: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

type TestResult = {
  ok: boolean;
  serverInfo?: { name?: string; version?: string };
  tools?: any[];
  resources?: any[];
  error?: string;
};

export interface MCPDetailSheetProps {
  isOpen: boolean;
  serverId: string | null;
  serverBaseUrl: string;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  embedded?: boolean;
}

export function MCPDetailSheet({
  isOpen,
  serverId,
  serverBaseUrl,
  onClose,
  onEdit,
  onDelete,
  embedded = false,
}: MCPDetailSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = theme.mode === "dark";
  const pageSurface = isDark ? "rgba(7, 11, 21, 0.94)" : "rgba(255, 255, 255, 0.96)";
  const headerSurface = isDark ? "rgba(10, 16, 30, 0.94)" : "rgba(248, 250, 252, 0.98)";
  const panelBorder = isDark ? "rgba(162, 210, 255, 0.28)" : "rgba(15, 23, 42, 0.12)";
  const titleColor = isDark ? "#EAF4FF" : "#0F172A";
  const bodyColor = isDark ? "#D9E8F9" : "#1E293B";
  const mutedColor = isDark ? "rgba(217, 232, 249, 0.82)" : "#475569";
  const cardSurface = isDark ? "rgba(16, 24, 40, 0.9)" : "rgba(248, 250, 252, 0.96)";
  const accentColor = isDark ? "#60A5FA" : "#2563EB";
  const successColor = isDark ? "#22C55E" : "#16A34A";
  const errorColor = isDark ? "#EF4444" : "#DC2626";
  const codeBg = isDark ? "rgba(2, 6, 23, 0.9)" : "#0F172A";

  const [detail, setDetail] = useState<MCPServerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (isOpen && serverId && serverBaseUrl) {
      setLoading(true);
      setError(null);
      setTestResult(null);
      fetch(`${serverBaseUrl}/api/mcp-servers/${serverId}`)
        .then(async (r) => {
          if (!r.ok) throw new Error(`Failed to load server: ${r.status}`);
          return r.json();
        })
        .then(setDetail)
        .catch((err) => setError(err?.message ?? "Failed to load"))
        .finally(() => setLoading(false));
    }
  }, [isOpen, serverId, serverBaseUrl]);

  const handleTest = useCallback(async () => {
    if (!serverId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${serverBaseUrl}/api/mcp-servers/${serverId}/test`, {
        method: "POST",
      });
      const result = await res.json();
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ ok: false, error: err?.message ?? "Test failed" });
    } finally {
      setTesting(false);
    }
  }, [serverBaseUrl, serverId]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      "Delete Server",
      `Are you sure you want to delete "${detail?.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDelete?.(),
        },
      ]
    );
  }, [detail?.name, onDelete]);

  if (!isOpen) return null;

  const safeStyle = {
    paddingTop: Math.max(insets.top, 4),
    paddingBottom: Math.max(insets.bottom, 8),
  };

  const content = (
    <Box className="flex-1 overflow-hidden" style={{ backgroundColor: pageSurface }}>
      <Box className="flex-1" style={safeStyle}>
        {/* Header */}
        <Box
          className="flex-row items-center justify-between py-4 px-5 border-b"
          style={{ borderBottomColor: panelBorder, backgroundColor: headerSurface }}
        >
          <Box className="flex-row items-center gap-3">
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel="Go back"
              className="p-2 -ml-2"
            >
              <ChevronLeftIcon size={24} color={mutedColor} />
            </Pressable>
            <Text className="text-lg font-semibold" style={{ color: titleColor }}>
              {detail?.name ?? "Server Details"}
            </Text>
          </Box>
          {!embedded && (
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel="Close"
              className="p-2"
            >
              <CloseIcon size={20} color={mutedColor} />
            </Pressable>
          )}
        </Box>

        {loading ? (
          <Box className="flex-1 items-center justify-center">
            <Spinner size="large" color={theme.colors.accent} />
          </Box>
        ) : error ? (
          <Box className="flex-1 items-center justify-center px-5">
            <Text className="text-sm text-error-500">{error}</Text>
          </Box>
        ) : detail ? (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 24,
            }}
            showsVerticalScrollIndicator={false}
          >
            {/* Description */}
            {detail.description && (
              <Text className="text-sm mb-4 leading-5" style={{ color: bodyColor }}>
                {detail.description}
              </Text>
            )}

            {/* Type Badge */}
            <Box className="flex-row items-center gap-2 mb-4">
              <Box
                style={{
                  backgroundColor: detail.type === "stdio"
                    ? (isDark ? "rgba(34, 197, 94, 0.2)" : "rgba(34, 197, 94, 0.15)")
                    : (isDark ? "rgba(59, 130, 246, 0.2)" : "rgba(59, 130, 246, 0.15)"),
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: detail.type === "stdio"
                      ? (isDark ? "#22C55E" : "#16A34A")
                      : (isDark ? "#3B82F6" : "#2563EB"),
                  }}
                >
                  {detail.type === "stdio" ? "Local (stdio)" : "HTTP"}
                </Text>
              </Box>
            </Box>

            {/* Configuration Card */}
            <Box
              className="rounded-xl border p-4 mb-4"
              style={{ backgroundColor: cardSurface, borderColor: panelBorder }}
            >
              <Text className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: mutedColor }}>
                Configuration
              </Text>

              {detail.type === "stdio" ? (
                <>
                  {/* Command */}
                  <Box className="mb-3">
                    <Text className="text-xs mb-1" style={{ color: mutedColor }}>Command</Text>
                    <Box
                      style={{
                        backgroundColor: codeBg,
                        borderRadius: 8,
                        padding: 12,
                      }}
                    >
                      <Text className="font-mono text-sm" style={{ color: "#F8FAFC" }}>
                        {detail.command}
                      </Text>
                    </Box>
                  </Box>

                  {/* Args */}
                  {detail.args && detail.args.length > 0 && (
                    <Box className="mb-3">
                      <Text className="text-xs mb-1" style={{ color: mutedColor }}>Arguments</Text>
                      <Box
                        style={{
                          backgroundColor: codeBg,
                          borderRadius: 8,
                          padding: 12,
                        }}
                      >
                        <Text className="font-mono text-sm" style={{ color: "#F8FAFC" }}>
                          {detail.args.join(" ")}
                        </Text>
                      </Box>
                    </Box>
                  )}

                  {/* Env */}
                  {detail.env && Object.keys(detail.env).length > 0 && (
                    <Box className="mb-3">
                      <Text className="text-xs mb-1" style={{ color: mutedColor }}>Environment Variables</Text>
                      <Box
                        style={{
                          backgroundColor: codeBg,
                          borderRadius: 8,
                          padding: 12,
                        }}
                      >
                        {Object.entries(detail.env).map(([key, value]) => (
                          <Text key={key} className="font-mono text-sm" style={{ color: "#F8FAFC" }}>
                            {key}={"*".repeat(Math.min(value.length, 8))}
                          </Text>
                        ))}
                      </Box>
                    </Box>
                  )}

                  {/* CWD */}
                  {detail.cwd && (
                    <Box>
                      <Text className="text-xs mb-1" style={{ color: mutedColor }}>Working Directory</Text>
                      <Box
                        style={{
                          backgroundColor: codeBg,
                          borderRadius: 8,
                          padding: 12,
                        }}
                      >
                        <Text className="font-mono text-sm" style={{ color: "#F8FAFC" }}>
                          {detail.cwd}
                        </Text>
                      </Box>
                    </Box>
                  )}
                </>
              ) : (
                <>
                  {/* URL */}
                  <Box className="mb-3">
                    <Text className="text-xs mb-1" style={{ color: mutedColor }}>URL</Text>
                    <Box
                      style={{
                        backgroundColor: codeBg,
                        borderRadius: 8,
                        padding: 12,
                      }}
                    >
                      <Text className="font-mono text-sm" style={{ color: "#F8FAFC" }}>
                        {detail.url}
                      </Text>
                    </Box>
                  </Box>

                  {/* Headers */}
                  {detail.headers && Object.keys(detail.headers).length > 0 && (
                    <Box>
                      <Text className="text-xs mb-1" style={{ color: mutedColor }}>Headers</Text>
                      <Box
                        style={{
                          backgroundColor: codeBg,
                          borderRadius: 8,
                          padding: 12,
                        }}
                      >
                        {Object.entries(detail.headers).map(([key, value]) => (
                          <Text key={key} className="font-mono text-sm" style={{ color: "#F8FAFC" }}>
                            {key}: {"*".repeat(Math.min(value.length, 8))}
                          </Text>
                        ))}
                      </Box>
                    </Box>
                  )}
                </>
              )}
            </Box>

            {/* Test Connection */}
            <Box
              className="rounded-xl border p-4 mb-4"
              style={{ backgroundColor: cardSurface, borderColor: panelBorder }}
            >
              <Text className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: mutedColor }}>
                Connection Test
              </Text>

              <Button
                size="sm"
                variant="outline"
                onPress={handleTest}
                disabled={testing}
                style={{ borderColor: accentColor, marginBottom: testResult ? 12 : 0 }}
              >
                {testing ? (
                  <Spinner size="small" color={accentColor} />
                ) : (
                  <ButtonText style={{ color: accentColor }}>Test Connection</ButtonText>
                )}
              </Button>

              {testResult && (
                <Box
                  style={{
                    backgroundColor: testResult.ok
                      ? (isDark ? "rgba(34, 197, 94, 0.15)" : "rgba(34, 197, 94, 0.1)")
                      : (isDark ? "rgba(239, 68, 68, 0.15)" : "rgba(239, 68, 68, 0.1)"),
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <Text
                    className="text-sm font-medium"
                    style={{ color: testResult.ok ? successColor : errorColor }}
                  >
                    {testResult.ok ? "Connection successful" : "Connection failed"}
                  </Text>
                  {testResult.error && (
                    <Text className="text-xs mt-1" style={{ color: errorColor }}>
                      {testResult.error}
                    </Text>
                  )}
                  {testResult.serverInfo?.name && (
                    <Text className="text-xs mt-1" style={{ color: mutedColor }}>
                      Server: {testResult.serverInfo.name}
                    </Text>
                  )}
                </Box>
              )}
            </Box>

            {/* Metadata */}
            <Box
              className="rounded-xl border p-4 mb-4"
              style={{ backgroundColor: cardSurface, borderColor: panelBorder }}
            >
              <Text className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: mutedColor }}>
                Metadata
              </Text>
              <Box className="flex-row justify-between mb-2">
                <Text className="text-xs" style={{ color: mutedColor }}>Created</Text>
                <Text className="text-xs" style={{ color: bodyColor }}>
                  {new Date(detail.createdAt).toLocaleDateString()}
                </Text>
              </Box>
              <Box className="flex-row justify-between">
                <Text className="text-xs" style={{ color: mutedColor }}>Updated</Text>
                <Text className="text-xs" style={{ color: bodyColor }}>
                  {new Date(detail.updatedAt).toLocaleDateString()}
                </Text>
              </Box>
            </Box>

            {/* Actions */}
            <Box className="flex-row gap-3">
              <Button
                size="sm"
                variant="outline"
                onPress={onEdit}
                style={{ flex: 1, borderColor: accentColor }}
              >
                <ButtonText style={{ color: accentColor }}>Edit</ButtonText>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onPress={handleDelete}
                style={{ flex: 1, borderColor: errorColor }}
              >
                <ButtonText style={{ color: errorColor }}>Delete</ButtonText>
              </Button>
            </Box>
          </ScrollView>
        ) : null}
      </Box>
    </Box>
  );

  if (embedded) {
    return content;
  }

  return (
    <ModalScaffold isOpen={isOpen} onClose={onClose}>
      {content}
    </ModalScaffold>
  );
}
