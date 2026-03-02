import { ChevronRightIcon, CloseIcon } from "@/components/icons/ChatActionIcons";
import { MCPDetailSheet } from "@/components/settings/MCPDetailSheet";
import { MCPAddServerSheet } from "@/components/settings/MCPAddServerSheet";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Pressable } from "@/components/ui/pressable";
import { ScrollView } from "@/components/ui/scroll-view";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/theme/index";
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView as RNScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type MCPServer = {
  id: string;
  name: string;
  description?: string;
  type: "stdio" | "http";
  command?: string;
  url?: string;
};

const MCP_TYPE_LABELS: Record<string, string> = {
  stdio: "Local",
  http: "HTTP",
};

const MCP_TYPE_COLORS = {
  dark: {
    stdio: { active: "rgba(34, 197, 94, 0.2)", text: "#22C55E" },
    http: { active: "rgba(59, 130, 246, 0.2)", text: "#3B82F6" },
  },
  light: {
    stdio: { active: "rgba(34, 197, 94, 0.15)", text: "#16A34A" },
    http: { active: "rgba(59, 130, 246, 0.15)", text: "#2563EB" },
  },
};

export interface MCPConfigurationViewProps {
  isOpen: boolean;
  onClose: () => void;
  presentation?: "modal" | "inline";
  onSelectServer?: (serverId: string) => void;
  selectedServerId?: string | null;
  onCloseServerDetail?: () => void;
  serverBaseUrl: string;
}

export function MCPConfigurationView({
  isOpen,
  onClose,
  presentation = "modal",
  onSelectServer,
  selectedServerId = null,
  onCloseServerDetail,
  serverBaseUrl,
}: MCPConfigurationViewProps) {
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
  const pressedSurface = isDark ? "rgba(173, 222, 255, 0.14)" : "rgba(15, 23, 42, 0.06)";
  const accentColor = isDark ? "#60A5FA" : "#2563EB";

  const [servers, setServers] = useState<MCPServer[]>([]);
  const [enabledServerIds, setEnabledServerIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"All" | "stdio" | "http">("All");
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null);

  const fetchServers = useCallback(() => {
    if (!serverBaseUrl) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`${serverBaseUrl}/api/mcp-servers`).then(async (r) => {
        if (!r.ok)
          throw new Error(
            r.status === 404
              ? "MCP API not available. Restart the server to enable MCP."
              : `MCP API error: ${r.status}`
          );
        return r.json();
      }),
      fetch(`${serverBaseUrl}/api/mcp-servers-enabled`).then(async (r) => {
        if (!r.ok) return { enabledIds: [] };
        return r.json();
      }),
    ])
      .then(([serversData, enabledData]) => {
        setServers(serversData?.servers ?? []);
        setEnabledServerIds(new Set(enabledData?.enabledIds ?? []));
      })
      .catch((err) => {
        setServers([]);
        setEnabledServerIds(new Set());
        setError(err?.message ?? "Failed to load MCP servers");
      })
      .finally(() => setLoading(false));
  }, [serverBaseUrl]);

  useEffect(() => {
    if (isOpen && serverBaseUrl) {
      fetchServers();
    }
  }, [isOpen, serverBaseUrl, fetchServers]);

  const handleServerToggle = useCallback(
    (serverId: string, enabled: boolean) => {
      const next = new Set(enabledServerIds);
      if (enabled) next.add(serverId);
      else next.delete(serverId);
      setEnabledServerIds(next);
      setSaving(true);
      fetch(`${serverBaseUrl}/api/mcp-servers-enabled`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledIds: Array.from(next) }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed"))))
        .then((data) => setEnabledServerIds(new Set(data?.enabledIds ?? [])))
        .catch(() => setEnabledServerIds(enabledServerIds))
        .finally(() => setSaving(false));
    },
    [serverBaseUrl, enabledServerIds]
  );

  const handleServerRowPress = useCallback(
    (serverId: string) => {
      onSelectServer?.(serverId);
    },
    [onSelectServer]
  );

  const handleAddServer = useCallback(() => {
    setEditingServer(null);
    setShowAddSheet(true);
  }, []);

  const handleEditServer = useCallback((server: MCPServer) => {
    setEditingServer(server);
    setShowAddSheet(true);
  }, []);

  const handleDeleteServer = useCallback(
    async (serverId: string) => {
      try {
        const res = await fetch(`${serverBaseUrl}/api/mcp-servers/${serverId}`, {
          method: "DELETE",
        });
        if (res.ok) {
          fetchServers();
          onCloseServerDetail?.();
        }
      } catch (err) {
        console.error("Failed to delete server:", err);
      }
    },
    [serverBaseUrl, fetchServers, onCloseServerDetail]
  );

  const handleSaveServer = useCallback(() => {
    fetchServers();
    setShowAddSheet(false);
    setEditingServer(null);
  }, [fetchServers]);

  const filteredServers =
    selectedType === "All"
      ? servers
      : servers.filter((s) => s.type === selectedType);

  const typeCounts: Record<string, number> = {
    All: servers.length,
    stdio: servers.filter((s) => s.type === "stdio").length,
    http: servers.filter((s) => s.type === "http").length,
  };

  if (!isOpen) return null;

  const safeStyle = {
    paddingTop: Math.max(insets.top, 4),
    paddingBottom: Math.max(insets.bottom, 8),
  };
  const detailOverlayStyle = {
    paddingTop: 0,
    paddingBottom: 0,
  };

  const showDetailOverlay = Boolean(selectedServerId);
  const colorPalette = isDark ? MCP_TYPE_COLORS.dark : MCP_TYPE_COLORS.light;

  const content = (
    <Box className="flex-1 overflow-hidden" style={{ backgroundColor: pageSurface }}>
      {showDetailOverlay ? (
        <Box className="flex-1" style={detailOverlayStyle}>
          <MCPDetailSheet
            embedded
            isOpen
            serverId={selectedServerId!}
            serverBaseUrl={serverBaseUrl}
            onClose={onCloseServerDetail ?? (() => {})}
            onEdit={() => {
              const server = servers.find((s) => s.id === selectedServerId);
              if (server) handleEditServer(server);
            }}
            onDelete={() => selectedServerId && handleDeleteServer(selectedServerId)}
          />
        </Box>
      ) : showAddSheet ? (
        <Box className="flex-1" style={detailOverlayStyle}>
          <MCPAddServerSheet
            isOpen
            serverBaseUrl={serverBaseUrl}
            editingServer={editingServer}
            onClose={() => {
              setShowAddSheet(false);
              setEditingServer(null);
            }}
            onSave={handleSaveServer}
          />
        </Box>
      ) : (
        <Box className="flex-1" style={safeStyle}>
          <Box
            className="flex-row items-center justify-between py-4 px-5 border-b"
            style={{ borderBottomColor: panelBorder, backgroundColor: headerSurface }}
          >
            <Text className="text-lg font-semibold" style={{ color: titleColor }}>
              MCP Servers
            </Text>
            <Box className="flex-row items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                onPress={handleAddServer}
                style={{ borderColor: accentColor }}
              >
                <ButtonText style={{ color: accentColor }}>+ Add</ButtonText>
              </Button>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityLabel="Close MCP configuration"
                className="p-2 min-w-11 min-h-11 items-center justify-center"
              >
                <CloseIcon size={20} color={mutedColor} />
              </Pressable>
            </Box>
          </Box>

          {/* Type Filter Navbar */}
          <Box
            style={{
              borderBottomColor: panelBorder,
              borderBottomWidth: 1,
              backgroundColor: isDark ? "rgba(10, 16, 30, 0.6)" : "rgba(248, 250, 252, 0.7)",
            }}
          >
            <RNScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                gap: 8,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              {(["All", "stdio", "http"] as const).map((type) => {
                const isActive = selectedType === type;
                const colors = type === "All"
                  ? { active: isDark ? "rgba(148, 163, 184, 0.2)" : "rgba(100, 116, 139, 0.15)", text: isDark ? "#94A3B8" : "#64748B" }
                  : colorPalette[type];
                const count = typeCounts[type];
                const label = type === "All" ? "All" : MCP_TYPE_LABELS[type];

                return (
                  <Pressable
                    key={type}
                    onPress={() => setSelectedType(type)}
                    accessibilityLabel={`Filter by ${label}`}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                    style={({ pressed }) => [
                      {
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        borderRadius: 20,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        backgroundColor: isActive
                          ? colors.active
                          : pressed
                            ? (isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)")
                            : (isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.02)"),
                        borderWidth: 1,
                        borderColor: isActive
                          ? (isDark ? `${colors.text}44` : `${colors.text}33`)
                          : (isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)"),
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: isActive ? "700" : "500",
                        color: isActive ? colors.text : mutedColor,
                        letterSpacing: -0.2,
                      }}
                    >
                      {label}
                    </Text>
                    {count > 0 && (
                      <Box
                        style={{
                          backgroundColor: isActive
                            ? `${colors.text}22`
                            : (isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)"),
                          borderRadius: 10,
                          paddingHorizontal: 6,
                          paddingVertical: 1,
                          minWidth: 20,
                          alignItems: "center" as const,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "600",
                            color: isActive ? colors.text : mutedColor,
                          }}
                        >
                          {count}
                        </Text>
                      </Box>
                    )}
                  </Pressable>
                );
              })}
            </RNScrollView>
          </Box>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 24,
            }}
            showsVerticalScrollIndicator={false}
          >
            <Text className="text-sm mb-5 leading-5" style={{ color: mutedColor }}>
              Configure MCP (Model Context Protocol) servers. Enabled servers
              provide tools and resources to the AI agent.
            </Text>
            {loading ? (
              <Spinner
                size="small"
                color={theme.colors.accent}
                style={{ marginTop: 16 }}
              />
            ) : error ? (
              <Text className="text-sm text-error-500 mt-4">{error}</Text>
            ) : filteredServers.length === 0 ? (
              <Box className="mt-4 items-center">
                <Text className="text-sm mb-4" style={{ color: mutedColor }}>
                  {servers.length === 0
                    ? "No MCP servers configured. Add one to get started."
                    : `No ${MCP_TYPE_LABELS[selectedType]} servers.`}
                </Text>
                {servers.length === 0 && (
                  <Button size="sm" onPress={handleAddServer}>
                    <ButtonText>Add MCP Server</ButtonText>
                  </Button>
                )}
              </Box>
            ) : (
              filteredServers.map((server) => {
                const typeColors = colorPalette[server.type] || colorPalette.stdio;
                return (
                  <Box
                    key={server.id}
                    className="flex-row items-center justify-between py-3.5 px-4 rounded-xl border mb-2.5"
                    style={{ backgroundColor: cardSurface, borderColor: panelBorder }}
                  >
                    <Pressable
                      onPress={() => handleServerRowPress(server.id)}
                      hitSlop={{ top: 12, bottom: 12, left: 0, right: 12 }}
                      accessibilityLabel={`${server.name}. View details`}
                      accessibilityHint="Opens server details"
                      accessibilityRole="button"
                      className="flex-1 flex-row items-center mr-3"
                      style={({ pressed }) => (pressed ? { backgroundColor: pressedSurface, borderRadius: 10 } : undefined)}
                    >
                      <Box className="flex-1 mr-2 min-w-0">
                        <Box style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text className="text-[15px] font-semibold" style={{ color: bodyColor }}>
                            {server.name}
                          </Text>
                          {selectedType === "All" && (
                            <Box
                              style={{
                                backgroundColor: typeColors.active,
                                borderRadius: 8,
                                paddingHorizontal: 6,
                                paddingVertical: 1,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: "600",
                                  color: typeColors.text,
                                  letterSpacing: -0.2,
                                }}
                              >
                                {MCP_TYPE_LABELS[server.type]}
                              </Text>
                            </Box>
                          )}
                        </Box>
                        {server.description ? (
                          <Text
                            className="text-xs mt-1 leading-4"
                            style={{ color: mutedColor }}
                            numberOfLines={2}
                          >
                            {server.description}
                          </Text>
                        ) : server.type === "stdio" && server.command ? (
                          <Text
                            className="text-xs mt-1 leading-4 font-mono"
                            style={{ color: mutedColor }}
                            numberOfLines={1}
                          >
                            {server.command}
                          </Text>
                        ) : server.type === "http" && server.url ? (
                          <Text
                            className="text-xs mt-1 leading-4 font-mono"
                            style={{ color: mutedColor }}
                            numberOfLines={1}
                          >
                            {server.url}
                          </Text>
                        ) : null}
                      </Box>
                      <ChevronRightIcon size={18} color={mutedColor} />
                    </Pressable>
                    <Box className="shrink-0">
                      <Switch
                        value={enabledServerIds.has(server.id)}
                        onValueChange={(val) => handleServerToggle(server.id, val)}
                        disabled={saving}
                        accessibilityLabel={`Enable ${server.name}`}
                        trackColor={{
                          false: isDark ? "rgba(255, 255, 255, 0.25)" : "rgba(15, 23, 42, 0.2)",
                          true: isDark ? `${typeColors.text}66` : `${typeColors.text}55`,
                        }}
                        thumbColor={
                          enabledServerIds.has(server.id)
                            ? typeColors.text
                            : isDark
                              ? "rgba(226, 238, 252, 0.9)"
                              : "#F8FAFC"
                        }
                      />
                    </Box>
                  </Box>
                );
              })
            )}
          </ScrollView>
        </Box>
      )}
    </Box>
  );

  if (presentation === "inline") {
    return content;
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      {content}
    </Modal>
  );
}
