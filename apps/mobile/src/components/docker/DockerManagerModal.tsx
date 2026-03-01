import { ChevronLeftIcon, CloseIcon, ContainerIcon, CopyIcon, DockerIcon, ImageIcon, VolumeIcon } from "@/components/docker/DockerTabIcons";
import { DockerResourceCard } from "@/components/reusable/DockerResourceCard";
import { ModalScaffold } from "@/components/reusable/ModalScaffold";
import { TabBarPills } from "@/components/reusable/TabBarPills";
import { showAlert } from "@/components/ui/alert/nativeAlert";
import { Box } from "@/components/ui/box";
import { Button, ButtonIcon, ButtonText } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { RefreshControl } from "@/components/ui/refresh-control";
import { ScrollView } from "@/components/ui/scroll-view";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { Skeleton, triggerHaptic } from "@/designSystem";
import { useTheme } from "@/theme/index";
import * as Clipboard from "expo-clipboard";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Platform, StyleSheet, TouchableOpacity as Pressable
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";


export type DockerTab = "containers" | "images" | "volumes";

export interface DockerContainer {
  id: string;
  names: string[];
  image: string;
  status: string;
  state: string;
  ports: string;
  created: string;
}

export interface DockerImage {
  id: string;
  repoTags: string[];
  size: number;
  created: string;
}

export interface DockerVolume {
  name: string;
  driver: string;
  mountpoint: string;
  created: string;
}

export interface DockerManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverBaseUrl: string;
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function areDockerContainersEqual(a: DockerContainer[], b: DockerContainer[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const next = b[index];
    if (!next) return false;
    return (
      item.id === next.id &&
      areStringArraysEqual(item.names, next.names) &&
      item.image === next.image &&
      item.status === next.status &&
      item.state === next.state &&
      item.ports === next.ports &&
      item.created === next.created
    );
  });
}

function areDockerImagesEqual(a: DockerImage[], b: DockerImage[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const next = b[index];
    if (!next) return false;
    return (
      item.id === next.id &&
      areStringArraysEqual(item.repoTags, next.repoTags) &&
      item.size === next.size &&
      item.created === next.created
    );
  });
}

function areDockerVolumesEqual(a: DockerVolume[], b: DockerVolume[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const next = b[index];
    if (!next) return false;
    return (
      item.name === next.name &&
      item.driver === next.driver &&
      item.mountpoint === next.mountpoint &&
      item.created === next.created
    );
  });
}

function statusClass(state: string): "running" | "exited" | "paused" | "unknown" {
  const s = (state || "").toLowerCase();
  if (s.includes("running")) return "running";
  if (s.includes("exited") || s.includes("dead")) return "exited";
  if (s.includes("paused")) return "paused";
  return "unknown";
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function DockerManagerModal({
  isOpen,
  onClose,
  serverBaseUrl,
}: DockerManagerModalProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isDarkMode = theme.mode === "dark";

  const [activeTab, setActiveTab] = useState<DockerTab>("containers");
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [volumes, setVolumes] = useState<DockerVolume[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actingImageId, setActingImageId] = useState<string | null>(null);
  const [actingVolumeName, setActingVolumeName] = useState<string | null>(null);
  const [logsFor, setLogsFor] = useState<{ id: string; name: string } | null>(null);
  const [logsContent, setLogsContent] = useState<string>("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [volumeSearch, setVolumeSearch] = useState("");

  const errMsg = (data: unknown, status: number) =>
    (data as { error?: string })?.error ??
    (status === 404
      ? "Docker manager is disabled. Set ENABLE_DOCKER_MANAGER=1 on the server."
      : status === 503
        ? "Docker daemon not available."
        : `Request failed (${status})`);

  const fetchContainers = useCallback(async () => {
    const url = `${serverBaseUrl}/api/docker/containers?all=${showAll ? "true" : "false"}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(errMsg(data, res.status));
    return (data.containers ?? []) as DockerContainer[];
  }, [serverBaseUrl, showAll]);

  const fetchImages = useCallback(async () => {
    const res = await fetch(`${serverBaseUrl}/api/docker/images`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(errMsg(data, res.status));
    return (data.images ?? []) as DockerImage[];
  }, [serverBaseUrl]);

  const fetchVolumes = useCallback(async () => {
    const res = await fetch(`${serverBaseUrl}/api/docker/volumes`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(errMsg(data, res.status));
    return (data.volumes ?? []) as DockerVolume[];
  }, [serverBaseUrl]);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const list = await fetchContainers();
        setContainers((prev) => (areDockerContainersEqual(prev, list) ? prev : list));
      } catch (err) {
        setContainers((prev) => (prev.length === 0 ? prev : []));
        setError(err instanceof Error ? err.message : "Failed to load containers");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchContainers]
  );

  const loadImages = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const list = await fetchImages();
        setImages((prev) => (areDockerImagesEqual(prev, list) ? prev : list));
      } catch (err) {
        setImages((prev) => (prev.length === 0 ? prev : []));
        setError(err instanceof Error ? err.message : "Failed to load images");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchImages]
  );

  const loadVolumes = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const list = await fetchVolumes();
        setVolumes((prev) => (areDockerVolumesEqual(prev, list) ? prev : list));
      } catch (err) {
        setVolumes((prev) => (prev.length === 0 ? prev : []));
        setError(err instanceof Error ? err.message : "Failed to load volumes");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchVolumes]
  );

  useEffect(() => {
    if (isOpen && serverBaseUrl) {
      if (activeTab === "containers") load();
      else if (activeTab === "images") loadImages();
      else loadVolumes();
    }
  }, [isOpen, serverBaseUrl, activeTab, showAll, load, loadImages, loadVolumes]);

  const handleAction = useCallback(
    async (id: string, op: "start" | "stop" | "restart" | "remove") => {
      if (op === "remove") {
        showAlert(
          "Remove container",
          "Are you sure you want to remove this container?",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Remove", style: "destructive", onPress: () => doAction(id, op) },
          ]
        );
        return;
      }
      await doAction(id, op);
    },
    [serverBaseUrl]
  );

  const doAction = useCallback(
    async (id: string, op: "start" | "stop" | "restart" | "remove") => {
      setActingId(id);
      try {
        if (op === "remove") {
          const res = await fetch(
            `${serverBaseUrl}/api/docker/containers/${encodeURIComponent(id)}?force=true`,
            { method: "DELETE" }
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error ?? "Failed to remove");
        } else {
          const res = await fetch(
            `${serverBaseUrl}/api/docker/containers/${encodeURIComponent(id)}/${op}`,
            { method: "POST" }
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error ?? `Failed to ${op}`);
        }
        await load(true);
      } catch (err) {
        showAlert("Error", err instanceof Error ? err.message : `Failed to ${op}`);
      } finally {
        setActingId(null);
      }
    },
    [serverBaseUrl, load]
  );

  const openLogs = useCallback(
    async (id: string, name: string) => {
      setLogsFor({ id, name });
      setLogsContent("");
      setLogsLoading(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      try {
        const res = await fetch(
          `${serverBaseUrl}/api/docker/containers/${encodeURIComponent(id)}/logs?tail=500`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);
        const raw = await res.text();
        const data = raw ? (() => { try { return JSON.parse(raw); } catch { return { _raw: raw }; } })() : {};
        if (!res.ok) {
          const msg = data?.error ?? data?._raw ?? `HTTP ${res.status}`;
          throw new Error(typeof msg === "string" ? msg : "Failed to load logs");
        }
        setLogsContent(data.logs ?? "(no logs)");
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error) {
          setLogsContent(err.name === "AbortError" ? "Request timed out (30s)" : err.message);
        } else {
          setLogsContent("Failed to load logs");
        }
      } finally {
        setLogsLoading(false);
      }
    },
    [serverBaseUrl]
  );

  const closeLogs = useCallback(() => {
    setLogsFor(null);
    setLogsContent("");
  }, []);

  const handleRemoveImage = useCallback(
    async (id: string) => {
      showAlert(
        "Remove image",
        "Are you sure you want to remove this image?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              setActingImageId(id);
              try {
                const res = await fetch(
                  `${serverBaseUrl}/api/docker/images/${encodeURIComponent(id)}?force=true`,
                  { method: "DELETE" }
                );
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Failed to remove");
                await loadImages(true);
              } catch (err) {
                showAlert("Error", err instanceof Error ? err.message : "Failed to remove image");
              } finally {
                setActingImageId(null);
              }
            },
          },
        ]
      );
    },
    [serverBaseUrl, loadImages]
  );

  const handleRemoveVolume = useCallback(
    async (name: string) => {
      showAlert(
        "Remove volume",
        `Are you sure you want to remove volume "${name}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              setActingVolumeName(name);
              try {
                const res = await fetch(
                  `${serverBaseUrl}/api/docker/volumes/${encodeURIComponent(name)}`,
                  { method: "DELETE" }
                );
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Failed to remove");
                await loadVolumes(true);
              } catch (err) {
                showAlert("Error", err instanceof Error ? err.message : "Failed to remove volume");
              } finally {
                setActingVolumeName(null);
              }
            },
          },
        ]
      );
    },
    [serverBaseUrl, loadVolumes]
  );

  const handleTabChange = useCallback((tab: DockerTab) => {
    setActiveTab(tab);
    setError(null);
  }, []);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      triggerHaptic("success");
    } catch {
      triggerHaptic("error");
    }
  }, []);

  const filteredVolumes = useMemo(() => {
    if (!volumeSearch.trim()) return volumes;
    const q = volumeSearch.trim().toLowerCase();
    return volumes.filter((v) => v.name.toLowerCase().includes(q) || (v.mountpoint ?? "").toLowerCase().includes(q));
  }, [volumes, volumeSearch]);

  if (!isOpen) return null;

  // Log viewer page — replaces docker content inline
  if (logsFor) {
    return (
      <ModalScaffold
        isOpen={isOpen}
        onClose={closeLogs}
        size="full"
        title="Logs"
        showHeader={false}
        showCloseButton={false}
        contentClassName="w-full h-full max-w-none rounded-none border-0 p-0"
        bodyClassName="m-0 p-0 flex-1"
        bodyProps={{ scrollEnabled: false, contentContainerStyle: { flex: 1 } }}
      >
        <Box style={[styles.fullScreen, { paddingTop: insets.top }]}>
          <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
            <Box style={styles.logsHeader} className="flex-row items-center justify-between py-4 px-5 border-b border-outline-200">
              <HStack className="min-w-0 flex-1 items-center gap-2">
                <Button action="default" variant="link" size="md" onPress={closeLogs} accessibilityLabel="Back to Docker" className="min-w-11 min-h-11 -ml-2">
                  <ButtonIcon as={ChevronLeftIcon} size="md" color={theme.colors.accent} />
                </Button>
                <Text size="lg" bold numberOfLines={1} className="flex-1" style={{ color: theme.colors.textPrimary }}>
                  Logs: {logsFor.name}
                </Text>
              </HStack>
              <Button action="default" variant="link" size="md" onPress={onClose} accessibilityLabel="Close" className="min-w-11 min-h-11">
                <ButtonIcon as={CloseIcon} size="lg" style={{ color: theme.colors.textMuted }} />
              </Button>
            </Box>
            {logsLoading ? (
              <Box style={styles.loadingBox} className="flex-1 items-center justify-center p-6">
                <Spinner size="large" color={theme.colors.accent} />
                <Text size="sm" className="mt-3" style={{ color: theme.colors.textMuted }}>Loading logs…</Text>
              </Box>
            ) : (
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={[styles.scrollContent, styles.logsContent]}
              >
                <Text
                  size="xs"
                  selectable
                  className="font-mono"
                  style={{
                    color: isDarkMode ? "#F8FAFC" : theme.colors.textPrimary,
                    fontFamily: Platform?.OS === "ios" ? "Menlo" : "monospace",
                  }}
                >
                  {logsContent}
                </Text>
              </ScrollView>
            )}
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
      title="Docker"
      showHeader={false}
      showCloseButton={false}
      contentClassName="w-full h-full max-w-none rounded-none border-0 p-0"
      bodyClassName="m-0 p-0 flex-1"
      bodyProps={{ scrollEnabled: false, contentContainerStyle: { flex: 1 } }}
    >
      <Box style={[styles.fullScreen, { paddingTop: insets.top }]}>
        <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
          <Box style={styles.header} className="border-b border-outline-200">
            <Box style={styles.headerTopRow} className="flex-row items-start justify-between gap-4">
              <Box style={styles.headerLeft} className="flex-1 min-w-0">
                <Box style={styles.headerTitleRow} className="flex-row items-center gap-2.5 min-w-0">
                  <Box style={styles.headerIconWrap}>
                    <DockerIcon color={theme.colors.accent} size={18} />
                  </Box>
                  <Text style={styles.title} size="lg" bold>
                    Docker
                  </Text>
                  <Box style={styles.livePill} className="rounded-full">
                    <Text size="2xs" bold style={{ color: theme.colors.accent }}>
                      Live
                    </Text>
                  </Box>
                </Box>
              </Box>
              <Button
                action="default"
                variant="link"
                size="md"
                onPress={onClose}
                accessibilityLabel="Close Docker manager"
                className="min-w-11 min-h-11 -mr-2 -mt-1"
              >
                <ButtonIcon as={CloseIcon} size="lg" style={{ color: theme.colors.textMuted }} />
              </Button>
            </Box>

            <Box style={styles.tabRail}>
              <TabBarPills
                tabs={[
                  { key: "containers", label: "Containers", badge: containers.length },
                  { key: "images", label: "Images", badge: images.length },
                  { key: "volumes", label: "Volumes", badge: volumes.length },
                ]}
                value={activeTab}
                onChange={handleTabChange}
                variant="segment"
                className="w-full"
              />
            </Box>
          </Box>

          <Box style={styles.contentArea} className="flex-1 min-w-0">
            {activeTab === "containers" && (
              <>
                <Box style={styles.toolbar} className="flex-row items-center gap-3 py-3">
                  <HStack space="sm">
                    <Box style={styles.tabIconBadge}>
                      <ContainerIcon color={theme.colors.accent} size={16} />
                    </Box>
                    <Text size="sm" bold style={{ color: theme.colors.textSecondary }}>
                      Runtime
                    </Text>
                  </HStack>
                  <HStack space="sm">
                    <Pressable
                      onPress={() => setShowAll(true)}
                      style={[styles.filterChip, showAll ? styles.filterChipActive : null]}
                      accessibilityLabel="Show all containers"
                      accessibilityState={{ selected: showAll }}
                    >
                      <Text size="sm" style={{ color: showAll ? theme.colors.accent : theme.colors.textSecondary }} className={showAll ? "font-semibold" : ""}>
                        All
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setShowAll(false)}
                      style={[styles.filterChip, !showAll ? styles.filterChipActive : null]}
                      accessibilityLabel="Show running containers only"
                      accessibilityState={{ selected: !showAll }}
                    >
                      <Text size="sm" style={{ color: !showAll ? theme.colors.accent : theme.colors.textSecondary }} className={!showAll ? "font-semibold" : ""}>
                        Running
                      </Text>
                    </Pressable>
                  </HStack>
                </Box>
                {error ? (
                  <Box style={styles.errorBox} className="p-4 rounded-lg bg-error-500/10 border border-error-500/20">
                    <Text size="sm" style={{ color: theme.colors.danger }}>{error}</Text>
                    <Button action="primary" variant="solid" size="sm" onPress={() => load(true)} className="mt-3">
                      <ButtonText>Retry</ButtonText>
                    </Button>
                  </Box>
                ) : loading && containers.length === 0 ? (
                  <Box style={styles.skeletonList} className="flex gap-2">
                    {[1, 2, 3].map((i) => (
                      <Box key={i} style={styles.card} className="p-3 rounded-lg bg-background-50 border border-outline-400">
                        <Skeleton height={18} width="70%" style={{ marginBottom: 12 }} />
                        <Skeleton height={14} width="100%" style={{ marginBottom: 8 }} />
                        <Skeleton height={14} width="60%" style={{ marginBottom: 8 }} />
                        <Skeleton height={14} width="40%" />
                      </Box>
                    ))}
                  </Box>
                ) : containers.length === 0 ? (
                  <Box style={styles.emptyBox} className="py-8 items-center">
                    <Text size="sm" style={{ color: theme.colors.textMuted }}>No containers found.</Text>
                  </Box>
                ) : (
                  <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    refreshControl={
                      <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => load(true)}
                        tintColor={theme.colors.accent}
                      />
                    }
                  >
                    {containers.map((c) => {
                      const names = (c.names ?? []).join(", ") || c.id?.slice(0, 12) || "—";
                      const isRunning = (c.state ?? "").toLowerCase().includes("running");
                      const acting = actingId === c.id;
                      const statusCls = statusClass(c.state);
                      const statusBadgeClass =
                        statusCls === "running"
                          ? "bg-success-500/15"
                          : statusCls === "exited"
                            ? "bg-typography-500/15"
                            : statusCls === "paused"
                              ? "bg-warning-500/15"
                              : "bg-error-500/15";
                      const statusColor =
                        statusCls === "running"
                          ? theme.colors.success
                          : statusCls === "exited"
                            ? theme.colors.textSecondary
                            : statusCls === "paused"
                              ? theme.colors.warning
                              : theme.colors.danger;

                      return (
                        <DockerResourceCard
                          key={c.id}
                          title={names}
                          className="mb-2"
                          action={
                            <HStack space="sm" className="items-center">
                              <Pressable
                                onPress={() => copyToClipboard(c.id)}
                                style={styles.copyBtn}
                                accessibilityLabel="Copy container ID"
                              >
                                <CopyIcon color={theme.colors.textMuted} size={18} />
                              </Pressable>
                              <Box className={`px-2 py-0.5 rounded ${statusBadgeClass}`}>
                                <Text size="xs" style={{ color: statusColor }}>{c.status || "—"}</Text>
                              </Box>
                            </HStack>
                          }
                          rows={[
                            {
                              label: "Image",
                              value: (
                                <Text size="xs" numberOfLines={1} className="flex-1 min-w-0" style={{ color: theme.colors.textPrimary }}>
                                  {c.image || "—"}
                                </Text>
                              ),
                            },
                            {
                              label: "Ports",
                              value: (
                                <Text size="xs" numberOfLines={2} className="flex-1 min-w-0" style={{ color: theme.colors.textPrimary }}>
                                  {c.ports || "—"}
                                </Text>
                              ),
                            },
                            {
                              label: "Created",
                              value: (
                                <Text size="xs" style={{ color: theme.colors.textPrimary }}>
                                  {formatDate(c.created)}
                                </Text>
                              ),
                            },
                          ]}
                          actions={
                            <>
                              <Button action="secondary" variant="outline" size="sm" onPress={() => openLogs(c.id, names)} isDisabled={acting}>
                                <ButtonText>Logs</ButtonText>
                              </Button>
                              {!isRunning ? (
                                <Button action="primary" variant="solid" size="sm" onPress={() => handleAction(c.id, "start")} isDisabled={acting}>
                                  <ButtonText>Start</ButtonText>
                                </Button>
                              ) : (
                                <>
                                  <Button action="secondary" variant="outline" size="sm" onPress={() => handleAction(c.id, "stop")} isDisabled={acting}>
                                    <ButtonText>Stop</ButtonText>
                                  </Button>
                                  <Button action="secondary" variant="outline" size="sm" onPress={() => handleAction(c.id, "restart")} isDisabled={acting}>
                                    <ButtonText>Restart</ButtonText>
                                  </Button>
                                </>
                              )}
                              <Button action="negative" variant="outline" size="sm" onPress={() => handleAction(c.id, "remove")} isDisabled={acting}>
                                <ButtonText>Remove</ButtonText>
                              </Button>
                            </>
                          }
                        />
                      );
                    })}
                  </ScrollView>
                )}
              </>
            )}

            {activeTab === "images" && (
              <>
                <Box style={styles.toolbar} className="flex-row items-center justify-between gap-3 py-3">
                  <HStack space="sm">
                    <Box style={styles.tabIconBadge}>
                      <ImageIcon color={theme.colors.accent} size={16} />
                    </Box>
                    <Text size="sm" bold style={{ color: theme.colors.textSecondary }}>
                      Image Cache
                    </Text>
                  </HStack>
                </Box>
                {error ? (
                  <Box style={styles.errorBox} className="p-4 rounded-lg bg-error-500/10 border border-error-500/20">
                    <Text size="sm" style={{ color: theme.colors.danger }}>{error}</Text>
                    <Button action="primary" variant="solid" size="sm" onPress={() => loadImages(true)} className="mt-3">
                      <ButtonText>Retry</ButtonText>
                    </Button>
                  </Box>
                ) : loading && images.length === 0 ? (
                  <Box style={styles.skeletonList} className="flex gap-2">
                    {[1, 2, 3].map((i) => (
                      <Box key={i} style={styles.card} className="p-3 rounded-lg bg-background-50 border border-outline-400">
                        <Skeleton height={18} width="80%" style={{ marginBottom: 12 }} />
                        <Skeleton height={14} width="50%" style={{ marginBottom: 8 }} />
                        <Skeleton height={14} width="40%" />
                      </Box>
                    ))}
                  </Box>
                ) : images.length === 0 ? (
                  <Box style={styles.emptyBox} className="py-8 items-center">
                    <Text size="sm" style={{ color: theme.colors.textMuted }}>No images found.</Text>
                  </Box>
                ) : (
                  <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    refreshControl={
                      <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => loadImages(true)}
                        tintColor={theme.colors.accent}
                      />
                    }
                  >
                    {images.map((img) => {
                      const tags = (img.repoTags ?? []).filter(Boolean);
                      const display = tags.length ? tags.join(", ") : img.id?.slice(0, 12) || "—";
                      const acting = actingImageId === img.id;

                      return (
                        <DockerResourceCard
                          key={img.id}
                          title={display}
                          className="mb-2"
                          action={
                            <Pressable
                              onPress={() => copyToClipboard(img.id)}
                              style={styles.copyBtn}
                              accessibilityLabel="Copy image ID"
                            >
                              <CopyIcon color={theme.colors.textMuted} size={18} />
                            </Pressable>
                          }
                          rows={[
                            {
                              label: "Size",
                              value: <Text size="xs" style={{ color: theme.colors.textPrimary }}>{formatBytes(img.size)}</Text>,
                            },
                            {
                              label: "Created",
                              value: <Text size="xs" style={{ color: theme.colors.textPrimary }}>{formatDate(img.created)}</Text>,
                            },
                          ]}
                          actions={
                            <Button action="negative" variant="outline" size="sm" onPress={() => handleRemoveImage(img.id)} isDisabled={acting}>
                              <ButtonText>Remove</ButtonText>
                            </Button>
                          }
                        />
                      );
                    })}
                  </ScrollView>
                )}
              </>
            )}

            {activeTab === "volumes" && (
              <>
                <Box style={styles.toolbar} className="flex-row gap-2 py-3 flex-wrap items-center">
                  <HStack space="sm">
                    <Box style={styles.tabIconBadge}>
                      <VolumeIcon color={theme.colors.accent} size={16} />
                    </Box>
                    <Text size="sm" bold style={{ color: theme.colors.textSecondary }}>
                      Persistent Storage
                    </Text>
                  </HStack>
                  <Input variant="outline" size="md" className="flex-1 min-w-0">
                    <InputField
                      placeholder="Search volumes…"
                      value={volumeSearch}
                      onChangeText={setVolumeSearch}
                      accessibilityLabel="Search volumes by name or mount point"
                      placeholderTextColor={theme.colors.textMuted}
                    />
                  </Input>
                </Box>
                {error ? (
                  <Box style={styles.errorBox} className="p-4 rounded-lg bg-error-500/10 border border-error-500/20">
                    <Text size="sm" style={{ color: theme.colors.danger }}>{error}</Text>
                    <Button action="primary" variant="solid" size="sm" onPress={() => loadVolumes(true)} className="mt-3">
                      <ButtonText>Retry</ButtonText>
                    </Button>
                  </Box>
                ) : loading && volumes.length === 0 ? (
                  <Box style={styles.skeletonList} className="flex gap-2">
                    {[1, 2, 3].map((i) => (
                      <Box key={i} style={styles.card} className="p-3 rounded-lg bg-background-50 border border-outline-400">
                        <Skeleton height={18} width="75%" style={{ marginBottom: 12 }} />
                        <Skeleton height={14} width="30%" style={{ marginBottom: 8 }} />
                        <Skeleton height={14} width="100%" style={{ marginBottom: 8 }} />
                        <Skeleton height={14} width="50%" />
                      </Box>
                    ))}
                  </Box>
                ) : filteredVolumes.length === 0 ? (
                  <Box style={styles.emptyBox} className="py-8 items-center">
                    <Text size="sm" style={{ color: theme.colors.textMuted }}>
                      {volumeSearch.trim() ? "No matching volumes." : "No volumes found."}
                    </Text>
                  </Box>
                ) : (
                  <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    refreshControl={
                      <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => loadVolumes(true)}
                        tintColor={theme.colors.accent}
                      />
                    }
                  >
                    {filteredVolumes.map((v) => {
                      const acting = actingVolumeName === v.name;

                      return (
                        <DockerResourceCard
                          key={v.name}
                          title={v.name}
                          className="mb-2"
                          action={
                            <Pressable onPress={() => copyToClipboard(v.name)} style={styles.copyBtn} accessibilityLabel="Copy volume name">
                              <CopyIcon color={theme.colors.textMuted} size={18} />
                            </Pressable>
                          }
                          rows={[
                            {
                              label: "Driver",
                              value: <Text size="xs" style={{ color: theme.colors.textPrimary }}>{v.driver || "—"}</Text>,
                            },
                            {
                              label: "Mount point",
                              value: (
                                <Box className="flex-1 flex-row items-start gap-2 min-w-0">
                                  <Text size="xs" numberOfLines={2} className="flex-1 min-w-0" style={{ color: theme.colors.textPrimary }}>
                                    {v.mountpoint || "—"}
                                  </Text>
                                  <Pressable onPress={() => copyToClipboard(v.mountpoint ?? "")} style={styles.copyBtn} accessibilityLabel="Copy mount point">
                                    <CopyIcon color={theme.colors.textMuted} size={18} />
                                  </Pressable>
                                </Box>
                              ),
                            },
                            {
                              label: "Created",
                              value: <Text size="xs" style={{ color: theme.colors.textPrimary }}>{formatDate(v.created)}</Text>,
                            },
                          ]}
                          actions={
                            <Button action="negative" variant="outline" size="sm" onPress={() => handleRemoveVolume(v.name)} isDisabled={acting}>
                              <ButtonText>Remove</ButtonText>
                            </Button>
                          }
                        />
                      );
                    })}
                  </ScrollView>
                )}
              </>
            )}
          </Box>
        </SafeAreaView>
      </Box>
    </ModalScaffold>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  const isDarkMode = theme.mode === "dark";
  const panelBackground = isDarkMode ? "rgba(7, 12, 26, 0.9)" : "rgba(248, 250, 255, 0.96)";
  const railBackground = isDarkMode ? "rgba(16, 22, 40, 0.92)" : "rgba(242, 246, 255, 0.98)";
  const cardBackground = isDarkMode ? "rgba(13, 18, 34, 0.95)" : "rgba(255, 255, 255, 0.99)";
  const screenOverlay = isDarkMode ? "rgba(3, 7, 18, 0.78)" : "rgba(245, 248, 255, 0.9)";

  return StyleSheet.create({
    fullScreen: {
      flex: 1,
      backgroundColor: screenOverlay,
    },
    safe: {
      flex: 1,
    },
    header: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 14,
      backgroundColor: panelBackground,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerTopRow: {
      marginBottom: 12,
    },
    title: {
      fontSize: 20,
      fontWeight: "700",
      color: theme.colors.textPrimary,
    },
    headerLeft: {
      flexDirection: "column",
    },
    headerTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    headerIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 10,
      backgroundColor: theme.colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    livePill: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: theme.colors.accentSoft,
    },
    tabRail: {
      backgroundColor: railBackground,
      borderRadius: 14,
      padding: 4,
    },
    contentArea: {
      flex: 1,
      backgroundColor: panelBackground,
    },
    toolbar: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: panelBackground,
    },
    tabIconBadge: {
      width: 26,
      height: 26,
      borderRadius: 8,
      backgroundColor: theme.colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    filterChip: {
      minHeight: 44,
      minWidth: 72,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
    },
    filterChipActive: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent,
    },
    copyBtn: {
      minWidth: 40,
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
    },
    errorBox: {
      flex: 1,
      padding: 24,
      justifyContent: "center",
      alignItems: "center",
    },
    loadingBox: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    skeletonList: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 32,
    },
    card: {
      marginBottom: 14,
      padding: 16,
      borderRadius: 14,
      backgroundColor: cardBackground,
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 2,
    },
    emptyBox: {
      flex: 1,
      padding: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 32,
    },
    logsContent: {
      padding: 16,
      paddingBottom: 32,
    },
    logsHeader: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: panelBackground,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
  });
}
