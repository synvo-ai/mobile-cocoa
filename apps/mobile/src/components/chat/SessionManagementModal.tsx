import {
    ChevronDownIcon,
    ChevronRightIcon,
    CloseIcon,
    PlayIcon, RefreshCwIcon, TrashIcon
} from "@/components/icons/ChatActionIcons";
import { AsyncStateView } from "@/components/reusable/AsyncStateView";
import { ModalScaffold } from "@/components/reusable/ModalScaffold";
import { showAlert } from "@/components/ui/alert/nativeAlert";
import { Box } from "@/components/ui/box";
import { Button, ButtonIcon, ButtonText } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { Message } from "@/core/types";
import {
    AnimatedPressableView, EntranceAnimation, FlashAnimation,
    PulseAnimation,
    spacing, triggerHaptic
} from "@/designSystem";
import { useSessionManagementStore } from "@/state/sessionManagementStore";
import { useTheme } from "@/theme/index";
import { getFileName } from "@/utils/path";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    LayoutAnimation, Platform, StyleSheet, UIManager
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Session status entry from /api/sessions/status. */
export interface ApiSession {
  id: string;
  cwd: string | null;
  model: string | null;
  lastAccess: number;
  status: "running" | "idling";
  title: string;
}

/** Loaded session passed to onSelectSession (id + messages from GET /api/sessions/:id/messages) */
export interface LoadedSession {
  id: string;
  messages: Message[];
  provider?: string | null;
  model?: string | null;
  /** Whether session is running on server (enables SSE connect for live stream). */
  running?: boolean;
  /** Whether session has SSE subscribers. */
  sseConnected?: boolean;
  /** Workspace cwd this session belongs to. Used to auto-switch workspace when selecting. */
  cwd?: string | null;
}

const uiMonoFontFamily = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  default: "monospace",
});

const SOFT_LAYOUT_ANIMATION = {
  duration: 160,
  create: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
  update: {
    type: LayoutAnimation.Types.easeInEaseOut,
  },
  delete: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
};

/** Get relative path from root to fullPath. */
function getRelativePath(fullPath: string, root: string): string {
  const rootNorm = root.replace(/\/$/, "");
  if (fullPath === rootNorm || fullPath === root) return "";
  if (fullPath.startsWith(rootNorm + "/")) {
    return fullPath.slice(rootNorm.length + 1);
  }
  return fullPath;
}

function displayWorkspace(cwd: string | null | undefined, fallbackWorkspace?: string | null): string {
  const raw = (typeof cwd === "string" && cwd.trim())
    ? cwd.trim()
    : ((fallbackWorkspace ?? "").trim() || "(no workspace)");
  return raw === "(no workspace)" ? raw : (getFileName(raw) || raw);
}

function formatSessionTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return "—";
  }
}

function formatModelLabel(model: string | null | undefined): string {
  const raw = (model ?? "").trim();
  if (!raw) return "MODEL N/A";
  return raw.replace(/^models\//i, "").toUpperCase();
}

type WorkspaceSessionGroup = {
  key: string;
  sessions: ApiSession[];
  latestAccess: number;
};

export interface SessionManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Current session id if we're viewing a persisted session. */
  currentSessionId: string | null;
  /** Current workspace path for display. */
  workspacePath?: string | null;
  /** Base URL for API (e.g. http://localhost:3456). */
  serverBaseUrl?: string;
  /** Loading state for workspace path. */
  workspaceLoading?: boolean;
  /** Called when user taps "Change workspace" - opens full-screen picker. */
  onOpenWorkspacePicker?: () => void;
  /** Called when user selects a session (fetches messages from API first). */
  onSelectSession: (session: LoadedSession) => void;
  /** Called when user creates new session (clear and close). */
  onNewSession: () => void;
  /** When true, show an "Active chat" card to switch back to the live session. */
  showActiveChat?: boolean;
  /** Called when user taps "Active chat" to switch back to the live session. */
  onSelectActiveChat?: () => void;
  /** Whether a session is currently running (for display). */
  sessionRunning?: boolean;
  /** When true, render as embedded full-screen page (no ModalScaffold). */
  embedded?: boolean;
}

export function SessionManagementModal({
  isOpen,
  onClose,
  currentSessionId,
  workspacePath,
  serverBaseUrl,
  onOpenWorkspacePicker,
  onSelectSession,
  onNewSession,
  showActiveChat = false,
  onSelectActiveChat,
  sessionRunning = false,
  embedded = false,
}: SessionManagementModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const uiColors = useMemo(
    () => ({
      accent: theme.colors.accent,
      textInverse: theme.colors.textInverse,
    }),
    [theme]
  );

  const sessions = useSessionManagementStore((state) => state.sessionStatuses);
  const removeSessionStatus = useSessionManagementStore((state) => state.removeSessionStatus);
  const [loading, setLoading] = useState(false);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [allowedRoot, setAllowedRoot] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [refreshPressed, setRefreshPressed] = useState(false);
  const [closePressed, setClosePressed] = useState(false);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
      setSelectError(null);
      setListError(null);
      setCollapsedGroups({});
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && serverBaseUrl) {
      fetch(`${serverBaseUrl}/api/workspace-path`)
        .then((res) => res.json())
        .then((data) => setAllowedRoot(data?.allowedRoot ?? null))
        .catch(() => setAllowedRoot(null));
    }
  }, [isOpen, serverBaseUrl]);

  const currentRelativePath =
    allowedRoot && workspacePath ? getRelativePath(workspacePath, allowedRoot) : "";

  const groupedSessions = useMemo(() => {
    const byWorkspace = new Map<string, ApiSession[]>();
    for (const session of sessions) {
      const path = (typeof session.cwd === "string" && session.cwd.trim())
        ? session.cwd.trim()
        : ((workspacePath ?? "").trim() || "(no workspace)");
      if (!byWorkspace.has(path)) byWorkspace.set(path, []);
      byWorkspace.get(path)!.push(session);
    }

    const currentWorkspace = (workspacePath ?? "").trim();
    const groups: WorkspaceSessionGroup[] = Array.from(byWorkspace.entries()).map(([key, data]) => {
      const sorted = [...data].sort((a, b) => b.lastAccess - a.lastAccess);
      return {
        key,
        sessions: sorted,
        latestAccess: sorted[0]?.lastAccess ?? 0,
      };
    });

    groups.sort((a, b) => {
      if (currentWorkspace) {
        if (a.key === currentWorkspace && b.key !== currentWorkspace) return -1;
        if (b.key === currentWorkspace && a.key !== currentWorkspace) return 1;
      }
      return b.latestAccess - a.latestAccess;
    });

    return groups;
  }, [sessions, workspacePath]);

  const totalSessionCount = useMemo(
    () => groupedSessions.reduce((acc, group) => acc + group.sessions.length, 0),
    [groupedSessions]
  );
  const visibleGroups = groupedSessions;
  const groupedSessionsByKey = useMemo(
    () => new Map(groupedSessions.map((group) => [group.key, group])),
    [groupedSessions]
  );

  const refresh = useCallback(async (isPullRefresh = false, showLoadingIndicator = true) => {
    if (showLoadingIndicator) {
      if (isPullRefresh) {
        // No pull-to-refresh spinner in this modal UI.
      } else {
        setLoading(true);
      }
    }
    setListError(null);

    if (!serverBaseUrl) {
      if (showLoadingIndicator) {
        setLoading(false);
      }
      return;
    }

    try {
      const res = await fetch(`${serverBaseUrl}/api/sessions/status`);
      if (!res.ok) throw new Error("Failed to load sessions");
      const data = await res.json();
      if (data?.sessions && Array.isArray(data.sessions)) {
        useSessionManagementStore.getState().setSessionStatuses(data.sessions);
      }
    } catch (err: any) {
      setListError(err.message || "Failed to fetch sessions");
    } finally {
      if (showLoadingIndicator) {
        setLoading(false);
      }
    }
  }, [serverBaseUrl]);

  useEffect(() => {
    if (isOpen) {
      // Do a background refresh to ensure list is up-to-date,
      // and only show loading state if we currently have zero sessions.
      const currentSessionsCount = useSessionManagementStore.getState().sessionStatuses.length;
      void refresh(false, currentSessionsCount === 0);
    } else {
      setLoading(false);
    }
  }, [isOpen, refresh]);

  const handleSelect = useCallback(
    (session: ApiSession) => {
      triggerHaptic("selection");
      if (session.id === currentSessionId) {
        onClose();
        return;
      }
      if (!serverBaseUrl) {
        setSelectError("Server URL is unavailable");
        return;
      }
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
      setSelectError(null);
      setLoadingSessionId(session.id);
      fetch(`${serverBaseUrl}/api/sessions/${encodeURIComponent(session.id)}/messages`)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to load session");
          return res.json();
        })
        .then((data: { messages?: Message[]; sessionId?: string; activeSessionId?: string; provider?: string | null; model?: string | null; running?: boolean; sseConnected?: boolean; cwd?: string | null }) => {
          const messages = data.messages ?? [];
          const canonicalId = data.sessionId ?? session.id;
          const id = (data.running || data.sseConnected) && data.activeSessionId ? data.activeSessionId : canonicalId;
          const cwd = data.cwd ?? session.cwd ?? null;
          onSelectSession({
            id,
            messages,
            provider: data.provider,
            model: data.model ?? session.model,
            running: data.running ?? session.status === "running",
            sseConnected: data.sseConnected ?? session.status === "running",
            cwd,
          });
          onClose();
        })
        .catch((err) => {
          setSelectError(err?.message ?? "Failed to load session");
        })
        .finally(() => {
          setLoadingSessionId(null);
        });
    },
    [currentSessionId, serverBaseUrl, onSelectSession, onClose]
  );

  const handleDelete = useCallback(
    (session: ApiSession) => {
      triggerHaptic("medium");
      const title = session.title.slice(0, 50) + (session.title.length > 50 ? "…" : "");
      showAlert(
        "Delete session",
        `Remove "${title}" from sessions?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              if (!serverBaseUrl) return;
              try {
                const res = await fetch(`${serverBaseUrl}/api/sessions/${encodeURIComponent(session.id)}`, {
                  method: "DELETE",
                });
                if (!res.ok) throw new Error("Delete failed");
                LayoutAnimation.configureNext(SOFT_LAYOUT_ANIMATION);
                removeSessionStatus(session.id);
                if (session.id === currentSessionId) {
                  onNewSession();
                }
                triggerHaptic("success");
              } catch {
                setSelectError("Failed to delete session");
              }
            },
          },
        ]
      );
    },
    [serverBaseUrl, currentSessionId, onNewSession, removeSessionStatus]
  );

  const handleNewSession = useCallback(() => {
    triggerHaptic("selection");
    onNewSession();
    onClose();
  }, [onNewSession, onClose]);

  const handleToggleGroup = useCallback((groupKey: string) => {
    LayoutAnimation.configureNext(SOFT_LAYOUT_ANIMATION);
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  }, []);

  const handleDeleteWorkspaceSessions = useCallback(
    (group: WorkspaceSessionGroup) => {
      const groupLabel = displayWorkspace(group.key, workspacePath);
      const sessionCount = group.sessions.length;
      triggerHaptic("medium");
      showAlert(
        "Delete workspace sessions",
        `Remove ${sessionCount} session${sessionCount === 1 ? "" : "s"} in "${groupLabel}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              if (!serverBaseUrl) return;
              try {
                const ids = group.sessions.map((session) => session.id);
                const results = await Promise.all(
                  ids.map(async (id) => {
                    const res = await fetch(`${serverBaseUrl}/api/sessions/${encodeURIComponent(id)}`, {
                      method: "DELETE",
                    });
                    return { id, ok: res.ok };
                  })
                );
                const failed = results.find((result) => !result.ok);
                if (failed) throw new Error("Delete failed");

                LayoutAnimation.configureNext(SOFT_LAYOUT_ANIMATION);
                for (const { id } of results) {
                  removeSessionStatus(id);
                }
                if (currentSessionId && ids.includes(currentSessionId)) {
                  onNewSession();
                }
                triggerHaptic("success");
              } catch {
                setSelectError("Failed to delete workspace sessions");
              }
            },
          },
        ]
      );
    },
    [serverBaseUrl, currentSessionId, onNewSession, removeSessionStatus, workspacePath]
  );

  if (!isOpen) return null;

  const headerContent = (
    <EntranceAnimation variant="slideDown" duration={350} delay={0}>
      <HStack style={styles.embeddedHeader}>
        <VStack style={styles.embeddedHeaderTitleGroup}>
          <Text style={styles.mainTitle}>Session Management</Text>
          {onOpenWorkspacePicker && (
            <Pressable
              onPress={() => {
                triggerHaptic("selection");
                onOpenWorkspacePicker();
              }}
              accessibilityLabel="Change workspace"
              accessibilityRole="button"
              style={styles.changeWorkspaceButton}
            >
              <Text size="xs" style={styles.changeWorkspaceText}>
                {workspacePath ? displayWorkspace(null, workspacePath) : "Select workspace"}
              </Text>
              <ChevronRightIcon size={12} color={styles.changeWorkspaceText.color} strokeWidth={2} />
            </Pressable>
          )}
        </VStack>
        <HStack style={styles.headerActions}>
          <Button
            action="default"
            variant="outline"
            size="sm"
            onPress={() => void refresh(false)}
            onPressIn={() => setRefreshPressed(true)}
            onPressOut={() => setRefreshPressed(false)}
            accessibilityLabel="Refresh sessions"
            style={[styles.headerIconButton, refreshPressed && styles.headerIconButtonPressed]}
            className=""
          >
            <ButtonIcon as={RefreshCwIcon} size="sm" color={styles.headerIconColor.color} />
          </Button>
          <Button
            action="default"
            variant="outline"
            size="sm"
            onPress={onClose}
            onPressIn={() => setClosePressed(true)}
            onPressOut={() => setClosePressed(false)}
            accessibilityLabel="Close sessions"
            style={[styles.headerIconButton, closePressed && styles.headerIconButtonPressed]}
            className=""
          >
            <ButtonIcon as={CloseIcon} size="sm" color={styles.headerIconColor.color} />
          </Button>
        </HStack>
      </HStack>
    </EntranceAnimation>
  );

  const contentBody = (
    <>
      {(selectError || listError) && (
        <EntranceAnimation variant="fade" duration={140}>
          <HStack style={styles.errorBanner}>
            <Text size="sm" className="text-error-600 flex-1">{selectError ?? listError}</Text>
            {listError && (
              <AnimatedPressableView
                onPress={() => void refresh(false)}
                haptic="light"
                style={styles.retryButton}
                accessibilityLabel="Retry loading sessions"
              >
                <RefreshCwIcon size={16} color={uiColors.accent} strokeWidth={1.8} />
                <Text size="sm" bold style={{ color: uiColors.accent }}>
                  Retry
                </Text>
              </AnimatedPressableView>
            )}
          </HStack>
        </EntranceAnimation>
      )}
      <EntranceAnimation variant="fade" duration={400} delay={40}>
        <HStack style={styles.recentHeaderRow}>
          <VStack style={styles.recentHeaderText}>
            <Text size="sm" style={styles.recentHeaderTitle}>All Sessions</Text>
            <Text size="xs" style={styles.recentHeaderHint}>Grouped by workspace</Text>
          </VStack>
        </HStack>
      </EntranceAnimation>

      <AsyncStateView
        isLoading={loading && !listError}
        error={totalSessionCount === 0 && !showActiveChat ? listError : null}
        isEmpty={totalSessionCount === 0 && !showActiveChat && !listError}
        loadingText="Loading sessions..."
        emptyTitle="No Sessions Yet"
        emptyDescription="Start a conversation and it will appear here."
        onRetry={listError ? () => void refresh(false) : undefined}
        className="flex-1 bg-transparent"
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.list, { paddingBottom: 100 + insets.bottom }]}
          refreshControl={undefined}
          showsVerticalScrollIndicator={false}
        >
          {showActiveChat && onSelectActiveChat && (
            <EntranceAnimation variant="slideUp" delay={60} duration={300}>
              <AnimatedPressableView
                onPress={onSelectActiveChat}
                style={[
                  styles.activeChatCard,
                  { overflow: "hidden" }
                ]}
                accessibilityRole="button"
                accessibilityLabel="Open active chat"
                accessibilityHint="Switches back to the currently active live chat"
              >
                <LinearGradient
                  colors={theme.mode === "dark" ? ["rgba(0, 229, 255, 0.15)", "rgba(0, 24, 46, 0.6)"] : ["rgba(215, 175, 142, 0.25)", "rgba(255, 255, 255, 0.8)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <PulseAnimation intensity={0.15} duration={2500}>
                  <Box style={[styles.sessionStatusDot, styles.sessionStatusDotActive]} />
                </PulseAnimation>
                <VStack style={styles.activeChatCardContent}>
                  <Text size="sm" style={styles.activeChatTitle}>
                    Active Chat
                  </Text>
                  <Text size="xs" style={styles.activeChatSubtitle}>
                    {sessionRunning ? "Receiving updates now" : "Tap to resume"}
                  </Text>
                </VStack>
                <ChevronRightIcon size={18} color={theme.colors.textSecondary} strokeWidth={1.8} />
              </AnimatedPressableView>
            </EntranceAnimation>
          )}

          {visibleGroups.map((group, groupIndex) => {
            const fullGroup = groupedSessionsByKey.get(group.key) ?? group;
            const isCollapsed = Boolean(collapsedGroups[group.key]);
            const groupCount = fullGroup.sessions.length;

            return (
              <VStack key={group.key} style={styles.workspaceGroupSection}>
                <EntranceAnimation variant="slideUp" duration={250} delay={groupIndex * 40}>
                  <AnimatedPressableView
                    onPress={() => handleToggleGroup(group.key)}
                    style={styles.workspaceGroupCard}
                    accessibilityRole="button"
                    accessibilityLabel={`${isCollapsed ? "Expand" : "Collapse"} workspace ${displayWorkspace(group.key, workspacePath)}`}
                  >
                    <HStack style={styles.workspaceGroupCardLeft}>
                      {isCollapsed ? (
                        <ChevronRightIcon size={14} color={theme.colors.textSecondary} strokeWidth={2} />
                      ) : (
                        <ChevronDownIcon size={14} color={theme.colors.textSecondary} strokeWidth={2} />
                      )}
                      <Text size="sm" style={styles.workspaceGroupLabel} numberOfLines={1} ellipsizeMode="tail">
                        {displayWorkspace(group.key, workspacePath)}
                      </Text>
                    </HStack>
                    <HStack style={styles.workspaceGroupCardRight}>
                      <Box style={styles.workspaceGroupMetaBadge}>
                        <Text size="xs" style={styles.workspaceGroupMetaText}>
                          {groupCount}
                        </Text>
                      </Box>
                      <Pressable
                        onPress={(event: any) => {
                          event.stopPropagation?.();
                          handleDeleteWorkspaceSessions(fullGroup);
                        }}
                        accessibilityLabel="Delete workspace sessions"
                        style={styles.workspaceDeleteButton}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <TrashIcon size={15} color={styles.workspaceDeleteIcon.color} strokeWidth={1.8} />
                      </Pressable>
                    </HStack>
                  </AnimatedPressableView>
                </EntranceAnimation>

                {!isCollapsed && group.sessions.map((item, index) => {
                  const isLoading = loadingSessionId === item.id;
                  const isActive = item.id === currentSessionId;
                  const workspaceInfo = displayWorkspace(item.cwd, workspacePath);

                  return (
                    <EntranceAnimation
                      key={item.id}
                      variant="slideUp"
                      delay={24 * ((groupIndex + index) % 8)}
                      duration={150}
                    >
                      <AnimatedPressableView
                        onPress={() => handleSelect(item)}
                        onLongPress={() => handleDelete(item)}
                        longPressDelay={280}
                        disabled={isLoading}
                        style={[
                          styles.sessionCard,
                          isActive && styles.sessionCardActive,
                          isLoading && styles.sessionCardLoading,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Open session ${item.title || "(No Input)"}`}
                        accessibilityHint="Loads this session. Long press to delete."
                      >
                        <HStack style={styles.sessionCardInner}>
                          <VStack style={styles.sessionContent}>
                            <HStack style={{ alignItems: "center", gap: 8, marginBottom: 2 }}>
                              {item.status === "running" && (
                                <FlashAnimation duration={1500} minOpacity={0.3}>
                                  <Box style={styles.runningIndicatorDot} />
                                </FlashAnimation>
                              )}
                              <Text size="sm" numberOfLines={2} ellipsizeMode="tail" style={[styles.sessionTitle, { flex: 1 }]}>
                                {item.title || "(No Input)"}
                              </Text>
                            </HStack>
                            <HStack style={styles.sessionWorkspaceRow}>
                              <Text size="xs" numberOfLines={1} ellipsizeMode="tail" style={styles.sessionWorkspaceText}>
                                {workspaceInfo}
                              </Text>
                              <Box style={styles.sessionInfoSeparator} />
                              <Text size="xs" numberOfLines={1} style={styles.sessionIdText}>
                                {item.id.length > 8 ? item.id.slice(0, 8) : item.id}
                              </Text>
                            </HStack>
                            <HStack style={styles.sessionFooterRow}>
                              <Text size="xs" style={styles.sessionTimeText}>
                                {formatSessionTime(item.lastAccess)}
                              </Text>
                              {Boolean((item.model ?? "").trim()) && (
                                <Box style={styles.sessionModelBadge}>
                                  <Text size="xs" numberOfLines={1} ellipsizeMode="tail" style={styles.sessionModelBadgeText}>
                                    {formatModelLabel(item.model)}
                                  </Text>
                                </Box>
                              )}
                            </HStack>
                          </VStack>
                          <Box style={styles.sessionDeleteCol}>
                            <Button
                              action="default"
                              variant="link"
                              size="sm"
                              onPress={(event) => {
                                event.stopPropagation?.();
                                handleDelete(item);
                              }}
                              accessibilityLabel="Delete session"
                              className=""
                              style={styles.sessionDeleteButton}
                            >
                              <ButtonIcon as={TrashIcon} size={17} style={styles.sessionDeleteIcon} />
                            </Button>
                          </Box>
                        </HStack>
                      </AnimatedPressableView>
                    </EntranceAnimation>
                  );
                })}
              </VStack>
            );
          })}
        </ScrollView>
      </AsyncStateView>
      <EntranceAnimation variant="slideUp" duration={300} delay={200} style={[{ position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 50 }, { bottom: 24 + insets.bottom }] as any}>
        <Button
          action="primary"
          variant="solid"
          size="md"
          onPress={handleNewSession}
          style={styles.fabButton}
          className=""
        >
          <ButtonIcon as={PlayIcon} size="md" style={{ color: '#ffffff' }} />
          <ButtonText style={styles.fabText}>Start Session</ButtonText>
        </Button>
      </EntranceAnimation>
    </>
  );

  // Embedded mode: render directly with SafeAreaView and header (no ModalScaffold)
  if (embedded) {
    return (
      <Box style={styles.container}>
        <Box style={{ flex: 1 }}>
          {headerContent}
          {contentBody}
        </Box>
      </Box>
    );
  }

  // Non-embedded mode: wrap with ModalScaffold
  return (
    <ModalScaffold
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      title={
        <VStack>
          <Text style={styles.mainTitle}>Session Management</Text>
          {onOpenWorkspacePicker && (
            <Pressable
              onPress={() => {
                triggerHaptic("selection");
                onOpenWorkspacePicker();
              }}
              accessibilityLabel="Change workspace"
              accessibilityRole="button"
              style={styles.changeWorkspaceButton}
            >
              <Text size="xs" style={styles.changeWorkspaceText}>
                {workspacePath ? displayWorkspace(null, workspacePath) : "Select workspace"}
              </Text>
              <ChevronRightIcon size={12} color={styles.changeWorkspaceText.color} strokeWidth={2} />
            </Pressable>
          )}
        </VStack>
      }
      contentClassName="w-full h-full max-w-none rounded-none border-0 p-0 bg-transparent"
      bodyClassName="m-0 p-0"
      headerStyle={{ backgroundColor: "transparent", borderBottomWidth: 0, elevation: 0, shadowOpacity: 0 }}
      bodyProps={{ scrollEnabled: false }}
      showCloseButton={false}
      headerRight={
        <HStack style={styles.headerActions}>
          <Button
            action="default"
            variant="outline"
            size="sm"
            onPress={() => void refresh(false)}
            onPressIn={() => setRefreshPressed(true)}
            onPressOut={() => setRefreshPressed(false)}
            accessibilityLabel="Refresh sessions"
            style={[styles.headerIconButton, refreshPressed && styles.headerIconButtonPressed]}
            className=""
          >
            <ButtonIcon as={RefreshCwIcon} size="sm" color={styles.headerIconColor.color} />
          </Button>
          <Button
            action="default"
            variant="outline"
            size="sm"
            onPress={onClose}
            onPressIn={() => setClosePressed(true)}
            onPressOut={() => setClosePressed(false)}
            accessibilityLabel="Close sessions"
            style={[styles.headerIconButton, closePressed && styles.headerIconButtonPressed]}
            className=""
          >
            <ButtonIcon as={CloseIcon} size="sm" color={styles.headerIconColor.color} />
          </Button>
        </HStack>
      }
    >
      <Box style={styles.container}>
        <Box style={{ flex: 1 }}>
          {contentBody}
        </Box>
      </Box>
    </ModalScaffold>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.mode === "dark" ? "rgba(5, 10, 20, 0.45)" : "transparent" },
    mainTitle: {
      color: theme.mode === "dark" ? theme.colors.textPrimary : theme.colors.textPrimary,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: "800", // extrabold
      letterSpacing: theme.mode === "dark" ? -0.5 : 0,
      textTransform: theme.mode === "dark" ? "uppercase" : "none",
      fontFamily: theme.mode === "dark" ? uiMonoFontFamily : undefined,
      textShadowColor: theme.mode === "dark" ? "rgba(0, 229, 255, 0.8)" : "transparent",
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: theme.mode === "dark" ? 10 : 0,
    },
    embeddedHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing["5"],
      paddingTop: spacing["2"],
      paddingBottom: spacing["2"],
      backgroundColor: "transparent",
    },
    embeddedHeaderTitleGroup: {
      flex: 1,
    },
    safe: { flex: 1 },
    headerActions: { gap: spacing["2"], alignItems: "center", marginRight: 0 },
    headerIconButton: {
      width: 40, height: 40, minWidth: 40, minHeight: 40, borderRadius: theme.mode === "dark" ? 12 : 12, borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(0, 229, 255, 0.4)" : theme.colors.border,
      backgroundColor: theme.mode === "dark" ? "rgba(0, 24, 46, 0.6)" : theme.colors.surfaceMuted,
      shadowColor: theme.mode === "dark" ? "#00e5ff" : "transparent",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0,
      shadowRadius: theme.mode === "dark" ? 5 : 0,
      justifyContent: 'center', alignItems: 'center',
    },
    headerIconButtonPressed: {
      borderColor: theme.mode === "dark" ? "#00e5ff" : theme.colors.accent,
      backgroundColor: theme.mode === "dark" ? "rgba(0, 229, 255, 0.25)" : theme.colors.accentSoft,
      shadowOpacity: theme.mode === "dark" ? 0.6 : 0,
      shadowRadius: theme.mode === "dark" ? 10 : 0,
      transform: [{ scale: 0.96 }],
    },
    headerIconColor: { color: theme.mode === "dark" ? "#00e5ff" : theme.colors.textSecondary },
    changeWorkspaceButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 4,
      paddingVertical: 2,
      paddingHorizontal: 2,
      alignSelf: "flex-start",
    },
    changeWorkspaceText: {
      color: theme.mode === "dark" ? "rgba(0, 229, 255, 0.8)" : theme.colors.accent,
      fontFamily: theme.mode === "dark" ? uiMonoFontFamily : undefined,
      fontSize: 12,
      fontWeight: "600",
      letterSpacing: theme.mode === "dark" ? -0.3 : 0,
    },
    errorBanner: {
      padding: spacing["4"], marginHorizontal: spacing["5"], marginTop: spacing["2"],
      backgroundColor: theme.mode === "dark" ? "rgba(255, 0, 0, 0.15)" : theme.colors.surfaceMuted,
      borderRadius: theme.mode === "dark" ? 12 : 24,
      borderWidth: 1, borderColor: "rgba(255, 0, 0, 0.4)",
      flexDirection: "row", alignItems: "center",
      shadowColor: "#ff0000", shadowOpacity: theme.mode === "dark" ? 0.3 : 0.05, shadowRadius: 8,
    },
    retryButton: {
      flexDirection: "row", alignItems: "center", gap: spacing["2"], marginTop: spacing["3"],
      paddingVertical: spacing["2"], paddingHorizontal: spacing["3"], alignSelf: "flex-start", minHeight: 44,
      backgroundColor: theme.mode === "dark" ? "rgba(255, 0, 229, 0.1)" : theme.colors.surfaceMuted,
      borderRadius: theme.mode === "dark" ? 8 : 9999,
      borderWidth: 1, borderColor: theme.colors.accent,
    },
    workspaceSection: { paddingBottom: spacing["4"] },
    workspaceBox: {
      marginHorizontal: spacing["5"], borderRadius: theme.mode === "dark" ? 16 : 32, borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(0, 229, 255, 0.5)" : theme.colors.border,
      backgroundColor: theme.mode === "dark" ? "rgba(10, 15, 30, 0.3)" : theme.colors.surface,
      shadowColor: theme.mode === "dark" ? "#00e5ff" : theme.colors.shadow,
      shadowOffset: { width: 0, height: 6 }, shadowOpacity: theme.mode === "dark" ? 0.2 : 0.05, shadowRadius: 16,
      padding: spacing["4"],
    },
    workspacePathContainer: {
      justifyContent: "center", paddingBottom: spacing["3"], gap: spacing["2"],
    },
    workspaceLabel: {
      color: theme.mode === "dark" ? theme.colors.textSecondary : theme.colors.textMuted,
      fontFamily: theme.mode === "dark" ? uiMonoFontFamily : undefined, fontWeight: "700", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4,
    },
    cwdPathBox: {
      width: "100%", borderRadius: theme.mode === "dark" ? 12 : 16, borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(0, 229, 255, 0.3)" : theme.colors.borderSubtle,
      backgroundColor: theme.mode === "dark" ? "rgba(5, 10, 20, 0.3)" : theme.colors.surfaceMuted,
      paddingHorizontal: spacing["4"], paddingVertical: spacing["3"], justifyContent: "center", gap: spacing["2"],
    },
    cwdPathTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
    cwdPreviewPrefix: {
      color: theme.mode === "dark" ? theme.colors.textMuted : theme.colors.textPlaceholder,
      fontFamily: uiMonoFontFamily, fontSize: 10, lineHeight: 14, fontWeight: "600", letterSpacing: -0.5
    },
    cwdDots: { gap: 4, alignItems: "center", flexDirection: "row" },
    cwdDot: { width: 6, height: 6, borderRadius: 999 },
    cwdDotAmber: { backgroundColor: theme.mode === "dark" ? theme.colors.accent : theme.colors.borderStrong, shadowOpacity: theme.mode === "dark" ? 0.8 : 0 },
    cwdDotYellow: { backgroundColor: theme.mode === "dark" ? theme.colors.textSecondary : theme.colors.borderStrong, shadowOpacity: theme.mode === "dark" ? 0.8 : 0 },
    cwdDotGreen: { backgroundColor: theme.mode === "dark" ? theme.colors.accent : theme.colors.borderStrong, shadowOpacity: theme.mode === "dark" ? 0.8 : 0 },
    cwdPathText: {
      fontFamily: uiMonoFontFamily, fontSize: 13, lineHeight: 18, fontWeight: "600", color: theme.mode === "dark" ? theme.colors.textPrimary : theme.colors.textSecondary,
      flexShrink: 1, minWidth: 0,
    },
    workspaceActions: {
      flexDirection: "row", gap: spacing["3"], paddingTop: spacing["2"]
    },
    workspaceActionWrap: { flex: 1 },
    workspaceActionButtonPrimary: {
      width: "100%", height: 42, borderRadius: theme.mode === "dark" ? 12 : 14, backgroundColor: theme.colors.accent,
      shadowColor: theme.mode === "dark" ? theme.colors.accent : "transparent", shadowOffset: { width: 0, height: 4 }, shadowOpacity: theme.mode === "dark" ? 0.5 : 0, shadowRadius: 8, gap: 8,
      borderWidth: 1, borderColor: theme.mode === "dark" ? "#ff33f0" : "transparent",
    },
    workspaceActionButtonSecondary: {
      width: "100%", height: 42, borderRadius: theme.mode === "dark" ? 12 : 14, borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(0, 229, 255, 0.6)" : theme.colors.border,
      backgroundColor: theme.mode === "dark" ? "rgba(0, 229, 255, 0.05)" : theme.colors.surfaceMuted,
      shadowColor: theme.mode === "dark" ? "#00e5ff" : "transparent", shadowOpacity: theme.mode === "dark" ? 0.1 : 0, shadowRadius: 5, shadowOffset: { width: 0, height: 2 },
    },
    secondaryActionText: {
      color: theme.mode === "dark" ? theme.colors.textPrimary : theme.colors.textPrimary,
      fontFamily: theme.mode === "dark" ? uiMonoFontFamily : undefined, fontWeight: "700", fontSize: 13, textAlign: "center", textShadowColor: theme.mode === "dark" ? "rgba(0, 229, 255, 0.5)" : "transparent", textShadowRadius: theme.mode === "dark" ? 4 : 0
    },
    primaryActionText: { color: "#ffffff", fontFamily: theme.mode === "dark" ? uiMonoFontFamily : undefined, fontWeight: "800", fontSize: 13, textShadowColor: theme.mode === "dark" ? "rgba(255, 255, 255, 0.4)" : "transparent", textShadowRadius: theme.mode === "dark" ? 4 : 0 },
    recentHeaderRow: {
      marginHorizontal: spacing["5"], marginBottom: spacing["3"],
      flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing["3"],
    },
    recentHeaderText: { gap: spacing["0.5"] },
    recentHeaderTitle: {
      color: theme.mode === "dark" ? theme.colors.textPrimary : theme.colors.textMuted,
      fontWeight: "700", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: theme.mode === "dark" ? uiMonoFontFamily : undefined,
      textShadowColor: theme.mode === "dark" ? "rgba(0, 229, 255, 0.6)" : "transparent", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: theme.mode === "dark" ? 8 : 0,
    },
    recentHeaderHint: { display: "none" },
    fabContainer: {
      position: 'absolute',
      right: spacing["5"],
      zIndex: 50,
    },
    fabButton: {
      borderRadius: 9999,
      height: 56,
      paddingHorizontal: 20,
      backgroundColor: '#5BAAED',
      shadowColor: theme.mode === "dark" ? theme.colors.accent : theme.colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: theme.mode === "dark" ? 0.4 : 0.2,
      shadowRadius: 10,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#00e5ff" : "transparent",
      gap: 8,
    },
    fabText: {
      color: "#ffffff",
      fontFamily: theme.mode === "dark" ? uiMonoFontFamily : undefined,
      fontWeight: "800",
      fontSize: 15,
      textShadowColor: theme.mode === "dark" ? "rgba(255, 255, 255, 0.4)" : "transparent",
      textShadowRadius: theme.mode === "dark" ? 4 : 0,
    },
    scrollView: { flex: 1, backgroundColor: "transparent" },
    list: { paddingHorizontal: spacing["5"], paddingBottom: spacing["8"], gap: spacing["4"] },
    workspaceGroupSection: { gap: spacing["3"] },
    workspaceGroupCard: {
      borderRadius: theme.mode === "dark" ? 12 : 24, borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(0, 229, 255, 0.4)" : theme.colors.border,
      backgroundColor: theme.mode === "dark" ? "rgba(5, 15, 25, 0.4)" : theme.colors.surfaceMuted,
      paddingHorizontal: spacing["3"], paddingVertical: spacing["2"],
      flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing["2"],
    },
    workspaceGroupCardLeft: { flexDirection: "row", alignItems: "center", gap: spacing["2"], flex: 1, minWidth: 0 },
    workspaceGroupCardRight: { flexDirection: "row", alignItems: "center", gap: spacing["2"], flexShrink: 0 },
    workspaceGroupLabel: {
      color: theme.mode === "dark" ? theme.colors.textPrimary : theme.colors.textPrimary,
      fontSize: 12, lineHeight: 16, fontWeight: "700", fontFamily: theme.mode === "dark" ? uiMonoFontFamily : undefined, letterSpacing: 0,
      flex: 1, flexShrink: 1,
    },
    workspaceGroupMetaBadge: {
      minWidth: 20, height: 20, borderRadius: 10, borderWidth: 0,
      backgroundColor: theme.mode === "dark" ? "rgba(255, 0, 229, 0.1)" : theme.colors.surface,
      alignItems: "center", justifyContent: "center", paddingHorizontal: 6,
    },
    workspaceGroupMetaText: {
      color: theme.mode === "dark" ? theme.colors.textSecondary : theme.colors.textSecondary,
      fontSize: 10, fontFamily: theme.mode === "dark" ? uiMonoFontFamily : undefined, fontWeight: "800"
    },
    workspaceDeleteButton: { width: 24, height: 24, minWidth: 24, minHeight: 24, borderRadius: 8, justifyContent: "center", alignItems: "center", backgroundColor: "transparent" },
    workspaceDeleteIcon: { color: theme.mode === "dark" ? theme.colors.textSecondary : theme.colors.textMuted },
    activeChatCard: {
      borderRadius: theme.mode === "dark" ? 14 : 24, borderWidth: 1.5, borderColor: theme.mode === "dark" ? theme.colors.accent : theme.colors.border,
      backgroundColor: theme.mode === "dark" ? "rgba(255, 0, 229, 0.05)" : theme.colors.surfaceMuted,
      paddingHorizontal: spacing["5"], paddingVertical: spacing["4"], flexDirection: "row", alignItems: "center", gap: spacing["4"],
      shadowColor: theme.mode === "dark" ? theme.colors.accent : theme.colors.shadow, shadowOpacity: theme.mode === "dark" ? 0.3 : 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    },
    activeChatCardContent: { flex: 1, gap: 6 },
    activeChatTitle: { color: theme.mode === "dark" ? theme.colors.textPrimary : theme.colors.textPrimary, fontWeight: "800", fontFamily: theme.mode === "dark" ? uiMonoFontFamily : undefined, fontSize: 16, textShadowColor: theme.mode === "dark" ? "rgba(255, 0, 229, 0.8)" : "transparent", textShadowRadius: theme.mode === "dark" ? 6 : 0 },
    activeChatSubtitle: { color: theme.mode === "dark" ? theme.colors.accent : theme.colors.textMuted, fontFamily: theme.mode === "dark" ? uiMonoFontFamily : undefined, fontSize: 13, fontWeight: "700" },
    sessionCard: {
      borderRadius: theme.mode === "dark" ? 14 : 20, borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(0, 229, 255, 0.3)" : theme.colors.border,
      backgroundColor: theme.mode === "dark" ? "rgba(10, 15, 30, 0.6)" : theme.colors.surface,
      borderLeftWidth: 1,
      shadowColor: theme.mode === "dark" ? "#00e5ff" : "transparent", shadowOffset: { width: 0, height: 5 }, shadowOpacity: theme.mode === "dark" ? 0.1 : 0, shadowRadius: 8,
    },
    sessionCardActive: {
      borderColor: theme.colors.accent,
      borderLeftWidth: 4,
      backgroundColor: theme.mode === "dark" ? "rgba(0, 229, 255, 0.15)" : theme.colors.surfaceMuted,
      shadowColor: theme.colors.accent, shadowOpacity: theme.mode === "dark" ? 0.3 : 0.1, shadowRadius: 12
    },
    sessionCardInner: {
      flex: 1,
      flexDirection: "row",
      paddingHorizontal: spacing["4"],
      paddingVertical: spacing["3"],
      alignItems: 'flex-start',
    },
    sessionCardLoading: { opacity: 0.5 },
    pressState: { opacity: 0.8, transform: [{ scale: 0.98 }] },
    sessionContent: { flex: 1, gap: 4, justifyContent: "center" },
    sessionTitle: { color: theme.mode === "dark" ? theme.colors.textPrimary : theme.colors.textPrimary, fontFamily: theme.mode === "dark" ? uiMonoFontFamily : undefined, fontWeight: "700", fontSize: 14, lineHeight: 20, letterSpacing: -0.2, textShadowColor: theme.mode === "dark" ? "rgba(0, 229, 255, 0.6)" : "transparent", textShadowRadius: theme.mode === "dark" ? 6 : 0 },
    sessionWorkspaceRow: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0, marginTop: 2 },
    sessionWorkspaceText: {
      color: theme.mode === "dark" ? theme.colors.textSecondary : theme.colors.textMuted,
      fontFamily: uiMonoFontFamily, fontSize: 12, lineHeight: 16, fontWeight: "500", flex: 1, minWidth: 0
    },
    sessionInfoSeparator: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.mode === "dark" ? theme.colors.textMuted : theme.colors.textPlaceholder, marginHorizontal: 4 }, // dot
    sessionIdText: { color: theme.mode === "dark" ? theme.colors.textSecondary : theme.colors.textMuted, fontSize: 12, lineHeight: 16, fontFamily: uiMonoFontFamily, flexShrink: 0, fontWeight: "500" },
    sessionStatusDot: { width: 10, height: 10, borderRadius: 999, flexShrink: 0 },
    sessionStatusDotActive: { backgroundColor: theme.colors.accent, shadowColor: theme.colors.accent, shadowOpacity: 1, shadowRadius: 6 },
    runningIndicatorDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981", shadowColor: "#10B981", shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 2 },
    sessionFooterRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing["3"], minWidth: 0, marginTop: 6 },
    sessionTimeText: {
      color: theme.mode === "dark" ? theme.colors.textMuted : theme.colors.textPlaceholder,
      fontFamily: uiMonoFontFamily, fontSize: 12, lineHeight: 16, fontWeight: "600", textTransform: "uppercase"
    },
    sessionModelBadge: {
      backgroundColor: theme.mode === "dark" ? "rgba(0, 229, 255, 0.1)" : theme.colors.surfaceMuted, // clay-200
      borderWidth: 0,
      borderRadius: theme.mode === "dark" ? 6 : 9999,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    sessionModelBadgeText: {
      color: theme.mode === "dark" ? theme.colors.textSecondary : theme.colors.textMuted,
      fontSize: 9, lineHeight: 12, fontWeight: "800", letterSpacing: 0, fontFamily: uiMonoFontFamily, textShadowColor: theme.mode === "dark" ? "rgba(0, 229, 255, 0.5)" : "transparent", textShadowRadius: theme.mode === "dark" ? 4 : 0, textTransform: "uppercase"
    },
    sessionDeleteCol: { justifyContent: "center", alignItems: "flex-end", paddingLeft: spacing["2"], alignSelf: "center" },
    sessionDeleteButton: {
      width: 36, height: 36, minWidth: 36, minHeight: 36, borderRadius: 12,
      justifyContent: "center", alignItems: "center", backgroundColor: "transparent"
    },
    sessionDeleteIcon: { color: theme.mode === "dark" ? theme.colors.textSecondary : theme.colors.textMuted },
  });
}
