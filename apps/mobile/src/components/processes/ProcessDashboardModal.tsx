import { ChevronLeftIcon, CloseIcon, RefreshCwIcon, TerminalIcon } from "@/components/icons/ChatActionIcons";
import { AsyncStateView } from "@/components/reusable/AsyncStateView";
import { LinkedText } from "@/components/reusable/LinkedText";
import { ListSectionCard } from "@/components/reusable/ListSectionCard";
import { ModalScaffold } from "@/components/reusable/ModalScaffold";
import { ProcessListItemCard } from "@/components/reusable/ProcessListItem";
import { showAlert } from "@/components/ui/alert/nativeAlert";
import { Box } from "@/components/ui/box";
import { Button, ButtonIcon } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { spacing, triggerHaptic } from "@/designSystem";
import { useTheme } from "@/theme/index";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { RefreshControl } from "@/components/ui/refresh-control";
import { ScrollView } from "@/components/ui/scroll-view";

export interface ApiProcess {
  pid: number;
  port: number;
  command: string;
  /** Log file names extracted from command (>> file.log, > file.log) */
  logPaths?: string[];
  /** Whether this is a system-critical process (no kill / no log). */
  protected?: boolean;
}

export interface ProcessDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverBaseUrl: string;
  onOpenUrl?: (url: string) => void;
}

function areApiProcessesEqual(a: ApiProcess[], b: ApiProcess[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const next = b[index];
    if (!next) return false;
    if (
      item.pid !== next.pid ||
      item.port !== next.port ||
      item.command !== next.command ||
      !!item.protected !== !!next.protected
    ) {
      return false;
    }
    const leftLogPaths = item.logPaths ?? [];
    const rightLogPaths = next.logPaths ?? [];
    if (leftLogPaths.length !== rightLogPaths.length) return false;
    return leftLogPaths.every((logPath, pathIndex) => logPath === rightLogPaths[pathIndex]);
  });
}

function getTerminalFontFamily() {
  return Platform.OS === "ios" ? "Menlo" : "monospace";
}

export function ProcessDashboardModal({
  isOpen,
  onClose,
  serverBaseUrl,
  onOpenUrl,
}: ProcessDashboardModalProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [apiProcesses, setApiProcesses] = useState<ApiProcess[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [killingPid, setKillingPid] = useState<number | null>(null);
  const [logViewer, setLogViewer] = useState<{ name: string; content: string } | null>(null);
  const [refreshPressed, setRefreshPressed] = useState(false);
  const [closePressed, setClosePressed] = useState(false);

  const terminalFont = useMemo(getTerminalFontFamily, []);

  const fetchProcesses = useCallback(async () => {
    try {
      setError(null);
      setWarning(null);
      const url = `${serverBaseUrl}/api/processes`;
      const res = await fetch(url);
      const rawText = await res.text();
      let data: { processes?: ApiProcess[]; error?: string; warning?: string } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        throw new Error(res.ok ? "Invalid response" : `Server error (${res.status})`);
      }
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
      }
      const nextProcesses = (data.processes ?? []) as ApiProcess[];
      setApiProcesses((prev) => (areApiProcessesEqual(prev, nextProcesses) ? prev : nextProcesses));
      if ((data as { warning?: string }).warning) {
        setWarning((data as { warning: string }).warning);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load processes");
      setApiProcesses((prev) => (prev.length === 0 ? prev : []));
    }
  }, [serverBaseUrl]);

  const load = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    await fetchProcesses();
    setLoading(false);
    setRefreshing(false);
  }, [fetchProcesses]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const handleViewLog = useCallback(
    async (logPath: string) => {
      triggerHaptic("selection");
      try {
        const param = logPath.includes("/") ? `path=${encodeURIComponent(logPath)}` : `name=${encodeURIComponent(logPath)}`;
        const res = await fetch(`${serverBaseUrl}/api/processes/log?${param}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Failed to load log");
        setLogViewer({ name: logPath, content: (data as { content?: string }).content ?? "" });
      } catch (err) {
        showAlert("Error", err instanceof Error ? err.message : "Failed to load log");
      }
    },
    [serverBaseUrl]
  );

  const handleKillApiProcess = useCallback(
    async (proc: ApiProcess) => {
      triggerHaptic("warning");
      showAlert("Terminate?", `Kill process PID ${proc.pid}?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Kill",
          style: "destructive",
          onPress: async () => {
            triggerHaptic("error");
            setKillingPid(proc.pid);
            try {
              const res = await fetch(`${serverBaseUrl}/api/processes/${proc.pid}/kill`, {
                method: "POST",
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Failed to kill");
              await fetchProcesses();
            } catch (err) {
              showAlert("Error", err instanceof Error ? err.message : "Failed to kill process");
            } finally {
              setKillingPid(null);
            }
          },
        },
      ]);
    },
    [serverBaseUrl, fetchProcesses]
  );

  const hasProcesses = apiProcesses.length > 0;
  const isEmpty = !hasProcesses && !loading && !error;
  const protectedProcesses = useMemo(
    () => apiProcesses.filter((p) => p.protected),
    [apiProcesses]
  );
  const userProcesses = useMemo(
    () => apiProcesses.filter((p) => !p.protected),
    [apiProcesses]
  );
  const processCount = apiProcesses.length;
  const uniquePortCount = useMemo(
    () => new Set(apiProcesses.map((proc) => proc.port)).size,
    [apiProcesses]
  );
  const headerDividerStyle = useMemo(
    () => ({
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: `${theme.colors.accent}38`,
    }),
    [theme.colors.accent]
  );
  const errorBannerStyle = useMemo(
    () => ({
      backgroundColor: `${theme.colors.danger}12`,
      borderColor: `${theme.colors.danger}25`,
    }),
    [theme.colors.danger]
  );
  const warningBannerStyle = useMemo(
    () => ({
      backgroundColor: theme.colors.accentSoft,
    }),
    [theme.colors.accentSoft]
  );
  const containerStyle = useMemo(
    () => ({ backgroundColor: theme.colors.background, paddingTop: insets.top }),
    [theme.colors.background, insets.top]
  );
  const heroCardStyle = useMemo(
    () => ({
      backgroundColor: theme.colors.surface,
      borderColor: `${theme.colors.accent}30`,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    }),
    [theme.colors.accent, theme.colors.shadow, theme.colors.surface]
  );
  const statPillStyle = useMemo(
    () => ({
      backgroundColor: `${theme.colors.accent}14`,
      borderColor: `${theme.colors.accent}30`,
    }),
    [theme.colors.accent]
  );
  const sectionCardStyle = useMemo(
    () => ({
      borderColor: `${theme.colors.accent}2A`,
      backgroundColor: theme.colors.surface,
    }),
    [theme.colors.accent, theme.colors.surface]
  );
  const topActionIconStyle = useMemo(
    () => ({ color: theme.colors.textMuted }),
    [theme.colors.textMuted]
  );
  const refreshButtonStyle = useMemo(
    () => ({
      borderColor: `${theme.colors.accent}35`,
      backgroundColor: `${theme.colors.accent}12`,
      shadowColor: theme.colors.accent,
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 0 },
      elevation: 2,
    }),
    [theme.colors.accent]
  );
  const pressedActionButtonStyle = useMemo(
    () => ({
      borderColor: `${theme.colors.accent}AA`,
      backgroundColor: `${theme.colors.accent}2C`,
      shadowColor: theme.colors.accent,
      shadowOpacity: 0.55,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 0 },
      elevation: 5,
      transform: [{ scale: 0.97 }],
    }),
    [theme.colors.accent]
  );
  const textPrimaryStyle = useMemo(
    () => ({ color: theme.colors.textPrimary }),
    [theme.colors.textPrimary]
  );
  const textSecondaryStyle = useMemo(
    () => ({ color: theme.colors.textSecondary }),
    [theme.colors.textSecondary]
  );
  const handleRefreshPress = useCallback(() => {
    triggerHaptic("selection");
    load(true);
  }, [load]);

  if (!isOpen) return null;

  // Log viewer page — replaces process list content inline
  if (logViewer) {
    return (
      <ModalScaffold
        isOpen={isOpen}
        onClose={() => setLogViewer(null)}
        size="full"
        title="Log Viewer"
        showHeader={false}
        showCloseButton={false}
        contentClassName="w-full h-full max-w-none rounded-none border-0 p-0"
        bodyClassName="m-0 p-0 flex-1"
        bodyProps={{ scrollEnabled: false, contentContainerStyle: { flex: 1 } }}
      >
        <Box className="flex-1" style={containerStyle}>
          <SafeAreaView style={{ flex: 1 }} edges={["left", "right", "bottom"]}>
            <HStack className="items-center justify-between px-5 py-3 border-b" style={headerDividerStyle}>
              <HStack className="min-w-0 flex-1 items-center gap-2">
                <Button
                  action="default"
                  variant="link"
                  size="md"
                  onPress={() => setLogViewer(null)}
                  accessibilityLabel="Back to processes"
                  className="min-w-11 min-h-11 -ml-2"
                >
                  <ButtonIcon as={ChevronLeftIcon} size="md" color={theme.colors.accent} />
                </Button>
                <Box className="w-1 h-6 rounded-sm" style={{ backgroundColor: theme.colors.accent }} />
                <Text
                  size="md"
                  bold
                  numberOfLines={1}
                  className="min-w-0 flex-1"
                  style={textPrimaryStyle}
                >
                  {logViewer.name}
                </Text>
              </HStack>
              <Button
                action="default"
                variant="link"
                size="md"
                onPress={onClose}
                accessibilityLabel="Close"
                className="min-w-11 min-h-11 -mr-2"
              >
                <ButtonIcon as={CloseIcon} size="md" color={topActionIconStyle.color} />
              </Button>
            </HStack>
            <ScrollView
              className="flex-1"
              contentContainerStyle={{
                padding: spacing["5"],
                paddingBottom: spacing["6"],
              }}
              horizontal={false}
            >
              {onOpenUrl ? (
                <LinkedText
                  size="xs"
                  selectable
                  className="font-mono"
                  style={{ color: theme.colors.textPrimary, fontFamily: terminalFont }}
                  onPressUrl={onOpenUrl}
                  urlColor={theme.colors.accent}
                >
                  {logViewer.content || "(empty)"}
                </LinkedText>
              ) : (
                <Text
                  size="xs"
                  selectable
                  className="font-mono"
                  style={{ color: theme.colors.textPrimary, fontFamily: terminalFont }}
                >
                  {logViewer.content || "(empty)"}
                </Text>
              )}
            </ScrollView>
          </SafeAreaView>
        </Box>
      </ModalScaffold>
    );
  }

  return (
    <ModalScaffold
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      title="Process Dashboard"
      subtitle="Port-bound process information"
      showHeader={false}
      showCloseButton={false}
      contentClassName="w-full h-full max-w-none rounded-none border-0 p-0"
      bodyClassName="m-0 p-0 flex-1"
      bodyProps={{ scrollEnabled: false, contentContainerStyle: { flex: 1 } }}
    >
      <Box className="flex-1" style={containerStyle}>
        <SafeAreaView style={{ flex: 1 }} edges={["left", "right", "bottom"]}>
          <HStack className="items-center justify-between px-5 py-3 border-b" style={headerDividerStyle}>
            <HStack className="flex-1 items-center gap-3">
              <Box
                className="h-10 w-10 rounded-xl items-center justify-center border"
                style={statPillStyle}
              >
                <TerminalIcon color={theme.colors.accent} size={18} />
              </Box>
              <Box className="flex-1 min-w-0">
                <Text size="xl" bold style={textPrimaryStyle}>
                  Process Dashboard
                </Text>
                <Text size="xs" className="mt-0.5" style={textSecondaryStyle}>
                  Local servers and logs
                </Text>
              </Box>
            </HStack>
            <HStack className="items-center gap-1">
              <Button
                action="default"
                variant="outline"
                size="sm"
                onPress={handleRefreshPress}
                onPressIn={() => setRefreshPressed(true)}
                onPressOut={() => setRefreshPressed(false)}
                accessibilityLabel="Refresh process list"
                className="min-w-11 min-h-11 rounded-xl border"
                style={[refreshButtonStyle, refreshPressed && pressedActionButtonStyle]}
              >
                <ButtonIcon as={RefreshCwIcon} size="md" color={theme.colors.accent} />
              </Button>
              <Button
                action="default"
                variant="link"
                size="md"
                onPress={onClose}
                onPressIn={() => setClosePressed(true)}
                onPressOut={() => setClosePressed(false)}
                accessibilityLabel="Close"
                className="min-w-11 min-h-11"
                style={closePressed ? pressedActionButtonStyle : undefined}
              >
                <ButtonIcon as={CloseIcon} size="lg" color={topActionIconStyle.color} />
              </Button>
            </HStack>
          </HStack>

          {error ? (
            <Box
              className="mx-5 mt-2 gap-2 rounded-xl border p-4"
              style={errorBannerStyle}
            >
              <Text size="sm" className="text-error-600">
                {error}
              </Text>
              <Text size="xs" className="text-error-600 leading-4.5 opacity-90">
                Ensure the app can reach the server. On a physical device, use the machine&apos;s IP or EXPO_PUBLIC_SERVER_URL.
              </Text>
            </Box>
          ) : null}

          {warning && !error ? (
            <Box className="mx-5 mt-2 rounded-xl p-4" style={warningBannerStyle}>
              <Text size="sm" style={textPrimaryStyle}>
                {warning}
              </Text>
            </Box>
          ) : null}

          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              paddingHorizontal: spacing["5"],
              paddingTop: spacing["4"],
              paddingBottom: spacing["6"],
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
                tintColor={theme.colors.accent}
              />
            }
          >
            <Box className="rounded-2xl border p-4 mb-4" style={heroCardStyle}>
              <HStack className="items-center justify-between">
                <Box className="flex-1 min-w-0 pr-4">
                  <Text size="sm" bold style={textPrimaryStyle}>
                    Active local processes
                  </Text>
                  <Text size="xs" className="mt-1" style={textSecondaryStyle}>
                    Pull to refresh or use the refresh action for live status.
                  </Text>
                </Box>
                <HStack className="gap-2">
                  <Box className="rounded-lg border px-3 py-2" style={statPillStyle}>
                    <Text size="xs" style={textSecondaryStyle}>
                      Processes
                    </Text>
                    <Text size="sm" bold style={{ color: theme.colors.accent }}>
                      {processCount}
                    </Text>
                  </Box>
                  <Box className="rounded-lg border px-3 py-2" style={statPillStyle}>
                    <Text size="xs" style={textSecondaryStyle}>
                      Ports
                    </Text>
                    <Text size="sm" bold style={{ color: theme.colors.accent }}>
                      {uniquePortCount}
                    </Text>
                  </Box>
                </HStack>
              </HStack>
            </Box>
            <AsyncStateView
              isLoading={loading && !refreshing}
              isEmpty={isEmpty}
              loadingText="Loading processes..."
              emptyTitle="No running processes found"
              emptyDescription="Port-bound processes (e.g. dev servers on 3000, 8000) will appear here when active."
            >
              {hasProcesses ? (
                <>
                  {protectedProcesses.length > 0 && (
                    <ListSectionCard
                      title="System infrastructure"
                      subtitle="Protected — cannot be killed or have logs read"
                      className="mb-4"
                      style={sectionCardStyle}
                    >
                      <VStack className="gap-3">
                        {[...protectedProcesses]
                          .sort((a, b) => b.pid - a.pid)
                          .map((proc) => (
                            <ProcessListItemCard
                              key={`${proc.pid}-${proc.port}`}
                              pid={proc.pid}
                              port={proc.port}
                              command={proc.command}
                              logPaths={proc.logPaths}
                              accentColor={theme.colors.accent}
                              isProtected
                              onViewLog={handleViewLog}
                              onKill={() => { }}
                              onOpenUrl={onOpenUrl}
                            />
                          ))}
                      </VStack>
                    </ListSectionCard>
                  )}
                  {userProcesses.length > 0 && (
                    <ListSectionCard
                      title="Port-bound processes"
                      subtitle="Active local/dev server processes"
                      className="mb-4"
                      style={sectionCardStyle}
                    >
                      <VStack className="gap-3">
                        {[...userProcesses]
                          .sort((a, b) => b.pid - a.pid)
                          .map((proc) => (
                            <ProcessListItemCard
                              key={`${proc.pid}-${proc.port}`}
                              pid={proc.pid}
                              port={proc.port}
                              command={proc.command}
                              logPaths={proc.logPaths}
                              accentColor={theme.colors.accent}
                              isKilling={killingPid === proc.pid}
                              onViewLog={handleViewLog}
                              onKill={() => handleKillApiProcess(proc)}
                              onOpenUrl={onOpenUrl}
                            />
                          ))}
                      </VStack>
                    </ListSectionCard>
                  )}
                </>
              ) : null}
            </AsyncStateView>
          </ScrollView>
        </SafeAreaView>
      </Box>
    </ModalScaffold>
  );
}
