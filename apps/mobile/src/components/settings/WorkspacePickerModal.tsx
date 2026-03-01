import {
    AttachPlusIcon, ChevronLeftIcon,
    ChevronRightIcon
} from "@/components/icons/ChatActionIcons";
import { FolderIcon } from "@/components/icons/WorkspaceTreeIcons";
import { ModalScaffold } from "@/components/reusable/ModalScaffold";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import { ScrollView } from "@/components/ui/scroll-view";
import { Spinner } from "@/components/ui/spinner";
import { Text as GText } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { EntranceAnimation, triggerHaptic } from "@/designSystem";
import { useTheme } from "@/theme/index";
import { basename, getDirname, getParentPath, getRelativePath, truncatePathForDisplay } from "@/utils/path";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── Cyberpunk color palette (dark mode) ──────────────────────────────
const CYAN = "#00e5ff";
const CYAN_75 = "rgba(0, 229, 255, 0.75)";
const CYAN_50 = "rgba(0, 229, 255, 0.5)";
const CYAN_25 = "rgba(0, 229, 255, 0.25)";
const CYAN_15 = "rgba(0, 229, 255, 0.15)";
const PINK = "#ff00e5";
const PINK_25 = "rgba(255, 0, 229, 0.25)";
const TEXT_WHITE = "#ffffff";
const TEXT_TINT = "#a5f5f5";
const BG_SURFACE = "rgba(10, 15, 30, 0.6)";
const BG_SURFACE_ALT = "rgba(0, 20, 35, 0.4)";
const MONO_FONT = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

// ── Clean White palette (light mode) ────────────────────────────
const LIGHT_900 = "#0F172A";
const LIGHT_800 = "#334155";
const LIGHT_700 = "#475569";
const LIGHT_600 = "#4A90E2";
const LIGHT_500 = "#64748B";
const LIGHT_400 = "#94A3B8";
const LIGHT_300 = "#CBD5E1";
const LIGHT_200 = "#E2E8F0";
const LIGHT_100 = "#F0F4F8";
const LIGHT_BG = "transparent";

type WorkspaceChild = { name: string; path: string };

export interface WorkspacePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverBaseUrl: string;
  workspacePath: string | null;
  onRefreshWorkspace?: () => void;
  /** Called when user selects a new workspace; use to init new session. */
  onWorkspaceSelected?: (path: string) => void;
}

export function WorkspacePickerModal({
  isOpen,
  onClose,
  serverBaseUrl,
  workspacePath,
  onRefreshWorkspace,
  onWorkspaceSelected,
}: WorkspacePickerModalProps) {
  const theme = useTheme();
  const isDark = theme.mode === "dark";
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const currentWorkspaceRowY = useRef<number | null>(null);

  // Theme-aware accent colors for inline use
  const accentColor = isDark ? CYAN : LIGHT_600;
  const folderColor = isDark ? CYAN_75 : LIGHT_500;
  const chevronColor = isDark ? CYAN : LIGHT_600;
  const spinnerColor = isDark ? CYAN : LIGHT_600;

  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [allowedRoot, setAllowedRoot] = useState<string | null>(null);
  const [browseRoot, setBrowseRoot] = useState<string>("");
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [treeCache, setTreeCache] = useState<Record<string, WorkspaceChild[]>>({});
  const [currentPath, setCurrentPath] = useState<string>("");
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [selectingWorkspace, setSelectingWorkspace] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  const pickerRoot = browseRoot || (workspacePath ?? workspaceRoot ?? "");

  const fetchPickerChildren = useCallback(
    async (parentPath: string): Promise<WorkspaceChild[]> => {
      const rootNorm = pickerRoot.replace(/\/$/, "");
      const parentRel =
        parentPath === rootNorm || parentPath === pickerRoot
          ? ""
          : parentPath.startsWith(rootNorm + "/")
            ? parentPath.slice(rootNorm.length + 1)
            : parentPath;
      const params = new URLSearchParams();
      params.set("root", pickerRoot);
      if (parentRel) params.set("parent", parentRel);
      const q = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`${serverBaseUrl}/api/workspace-allowed-children${q}`);
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error ?? res.statusText;
        throw new Error(msg);
      }
      const children = data?.children ?? [];
      return children;
    },
    [serverBaseUrl, pickerRoot]
  );

  const handleNavigateInto = useCallback(
    async (path: string) => {
      if (!pickerRoot) return;
      triggerHaptic("selection");
      setCurrentPath(path);
      const cacheKey = path || pickerRoot;
      if (treeCache[cacheKey]) return;
      setLoadingPaths((prev) => new Set(prev).add(cacheKey));
      try {
        const children = await fetchPickerChildren(path || pickerRoot);
        setTreeCache((prev) => ({ ...prev, [cacheKey]: children }));
      } catch (e) {
        setPickerError(e instanceof Error ? e.message : "Failed to load");
        setTreeCache((prev) => ({ ...prev, [cacheKey]: [] }));
      } finally {
        setLoadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(cacheKey);
          return next;
        });
      }
    },
    [pickerRoot, treeCache, fetchPickerChildren]
  );

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim() || !pickerRoot) return;
    setCreatingFolder(true);
    triggerHaptic("selection");
    try {
      const rootNorm = pickerRoot.replace(/\/$/, "");
      const parentRel =
        currentPath === rootNorm || currentPath === pickerRoot
          ? ""
          : currentPath.startsWith(rootNorm + "/")
            ? currentPath.slice(rootNorm.length + 1)
            : currentPath;

      const res = await fetch(`${serverBaseUrl}/api/workspace/create-folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          root: pickerRoot,
          parent: parentRel,
          name: newFolderName.trim()
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? res.statusText);
      }

      setIsCreatingFolder(false);
      setNewFolderName("");

      // refresh current tree
      const cacheKey = currentPath || pickerRoot;
      setLoadingPaths((prev) => new Set(prev).add(cacheKey));
      try {
        const children = await fetchPickerChildren(currentPath || pickerRoot);
        setTreeCache((prev) => ({ ...prev, [cacheKey]: children }));
      } finally {
        setLoadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(cacheKey);
          return next;
        });
      }
    } catch (e) {
      setPickerError(e instanceof Error ? e.message : "Failed to create folder");
    } finally {
      setCreatingFolder(false);
    }
  }, [newFolderName, currentPath, pickerRoot, serverBaseUrl, fetchPickerChildren]);

  const handleGoToParent = useCallback(() => {
    if (!pickerRoot) return;
    triggerHaptic("selection");
    if (currentPath !== "") {
      const parent = getParentPath(currentPath, pickerRoot);
      setCurrentPath(parent);
    } else {
      // At root: go up to parent of browse root (e.g. from workspace to its parent)
      const parentBrowseRoot = getDirname(pickerRoot);
      const norm = (allowedRoot ?? "").replace(/\/$/, "") || "";
      const validParent =
        norm &&
        parentBrowseRoot &&
        parentBrowseRoot !== pickerRoot &&
        (parentBrowseRoot === norm || parentBrowseRoot.startsWith(norm + "/"));
      if (validParent) {
        setBrowseRoot(parentBrowseRoot);
        setCurrentPath("");
        setTreeCache((prev) => {
          const next = { ...prev };
          delete next[""];
          delete next[pickerRoot];
          return next;
        });
      }
    }
  }, [pickerRoot, currentPath, allowedRoot]);

  const handleSelectWorkspace = useCallback(
    (path: string) => {
      setSelectingWorkspace(true);
      triggerHaptic("selection");
      fetch(`${serverBaseUrl}/api/workspace-path`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      })
        .then((res) => {
          if (!res.ok)
            return res.json().then((d) =>
              Promise.reject(new Error(d?.error ?? res.statusText))
            );
          onWorkspaceSelected?.(path);
          onClose();
          onRefreshWorkspace?.();
        })
        .catch((e) => setPickerError(e?.message ?? "Failed to set workspace"))
        .finally(() => setSelectingWorkspace(false));
    },
    [serverBaseUrl, onClose, onRefreshWorkspace, onWorkspaceSelected]
  );

  const pickerLoading = loadingPaths.has("") || selectingWorkspace;
  const currentRelativePath =
    pickerRoot && workspacePath ? getRelativePath(workspacePath, pickerRoot) : "";
  const viewCacheKey = currentPath || "";
  const viewChildren = treeCache[viewCacheKey] ?? [];
  const viewLoading = loadingPaths.has(viewCacheKey);
  const allowedNorm = (allowedRoot ?? "").replace(/\/$/, "") || "";
  const parentOfBrowseRoot = pickerRoot ? getDirname(pickerRoot) : "";
  const canGoUpFromRoot =
    !!allowedNorm &&
    !!parentOfBrowseRoot &&
    parentOfBrowseRoot !== pickerRoot &&
    (parentOfBrowseRoot === allowedNorm ||
      parentOfBrowseRoot.startsWith(allowedNorm + "/"));
  const canGoBack = currentPath !== "" || canGoUpFromRoot;

  // Fetch workspace-path and roots when modal opens
  useEffect(() => {
    if (isOpen) {
      setPickerError(null);
      fetch(`${serverBaseUrl}/api/workspace-path`)
        .then((res) => res.json())
        .then((data) => {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.log("[WorkspacePicker] API workspace-path response", data);
          }
          const root = data?.workspaceRoot ?? data?.path ?? null;
          setWorkspaceRoot(root);
          setAllowedRoot(data?.allowedRoot ?? root ?? null);
          setBrowseRoot(workspacePath ?? root ?? "");
        })
        .catch(() => {
          setWorkspaceRoot(null);
          setAllowedRoot(null);
          setBrowseRoot("");
        });
    }
  }, [isOpen, serverBaseUrl, workspacePath]);

  // Load root children when picker opens; preload path to current workspace for faster drill-down
  useEffect(() => {
    if (!isOpen || !pickerRoot) return;

    const loadInitial = async () => {
      setPickerError(null);
      setLoadingPaths((prev) => new Set(prev).add(""));
      try {
        const children = await fetchPickerChildren(pickerRoot);
        setTreeCache((prev) => ({ ...prev, "": children }));
      } catch (e) {
        setPickerError(e instanceof Error ? e.message : "Failed to load");
        setTreeCache((prev) => ({ ...prev, "": [] }));
      } finally {
        setLoadingPaths((prev) => {
          const n = new Set(prev);
          n.delete("");
          return n;
        });
      }

      // Preload ancestors of current workspace for faster navigation
      if (workspacePath && workspacePath.startsWith(pickerRoot)) {
        const relPath = workspacePath
          .slice(pickerRoot.length)
          .replace(/^\//, "")
          .trim();
        if (relPath) {
          const segments = relPath.split("/").filter(Boolean);
          const rootNorm = pickerRoot.replace(/\/$/, "");
          let p = rootNorm;
          for (const seg of segments) {
            p = p + "/" + seg;
            try {
              const children = await fetchPickerChildren(p);
              setTreeCache((prev) => ({ ...prev, [p]: children }));
            } catch {
              /* ignore */
            }
          }
        }
      }
    };

    loadInitial();
  }, [isOpen, pickerRoot, serverBaseUrl, workspacePath, fetchPickerChildren]);

  // Fallback: when at root and children for current folder were not loaded (e.g. initial load failed or raced), load them
  const loadRootChildren = useCallback(async () => {
    if (!pickerRoot) return;
    const key = "";
    setLoadingPaths((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    try {
      const children = await fetchPickerChildren(pickerRoot);
      setTreeCache((prev) => ({ ...prev, [key]: children }));
      setPickerError(null);
    } catch (e) {
      setPickerError(e instanceof Error ? e.message : "Failed to load");
      setTreeCache((prev) => ({ ...prev, [key]: [] }));
    } finally {
      setLoadingPaths((prev) => {
        const n = new Set(prev);
        n.delete(key);
        return n;
      });
    }
  }, [pickerRoot, fetchPickerChildren]);

  useEffect(() => {
    if (
      !isOpen ||
      !pickerRoot ||
      currentPath !== "" ||
      loadingPaths.has("")
    ) return;
    if (treeCache[""] === undefined) {
      loadRootChildren();
    }
  }, [isOpen, pickerRoot, currentPath, treeCache, loadingPaths, loadRootChildren]);

  // Reset state when closing
  useEffect(() => {
    if (!isOpen) {
      setTreeCache({});
      setCurrentPath("");
      setBrowseRoot("");
      setLoadingPaths(new Set());
      setPickerError(null);
      setIsCreatingFolder(false);
      setNewFolderName("");
      currentWorkspaceRowY.current = null;
    }
  }, [isOpen]);

  const handleCurrentWorkspaceLayout = useCallback((e: LayoutChangeEvent) => {
    const { layout } = e.nativeEvent;
    currentWorkspaceRowY.current = layout.y;
    // Scroll to current workspace row after a short delay (tree may still be rendering)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (currentWorkspaceRowY.current != null && scrollRef.current) {
          scrollRef.current.scrollTo({
            y: Math.max(0, currentWorkspaceRowY.current - 80),
            animated: true,
          });
        }
      });
    });
  }, []);

  const renderChildRow = useCallback(
    (child: WorkspaceChild, index: number) => {
      const isLoading = loadingPaths.has(child.path);
      const isCurrentWorkspace =
        workspacePath != null && child.path === workspacePath;
      return (
        <EntranceAnimation key={child.path} variant="slideUp" delay={index * 32} duration={220}>
          <Box
            style={[
              styles.childCard,
              isCurrentWorkspace && styles.childCardActive,
            ]}
            onLayout={isCurrentWorkspace ? handleCurrentWorkspaceLayout : undefined}
          >
            <HStack style={styles.childCardRow}>
              <Pressable
                onPress={() => handleNavigateInto(child.path)}
                disabled={isLoading}
                style={styles.childPressable}
                accessibilityRole="button"
                accessibilityLabel={`Open ${child.name}`}
              >
                <HStack style={styles.childInnerRow}>
                  <FolderIcon color={folderColor} />
                  <ChevronRightIcon size={14} color={chevronColor} strokeWidth={2.5} />
                  <VStack style={styles.childTextCol}>
                    <GText
                      size="sm"
                      numberOfLines={1}
                      ellipsizeMode="middle"
                      style={[styles.childPath, isCurrentWorkspace && styles.childNameActive]}
                    >
                      {child.name}
                    </GText>
                  </VStack>
                  {isLoading ? (
                    <Spinner size="small" color={spinnerColor} />
                  ) : null}
                </HStack>
              </Pressable>
              <Pressable
                onPress={() => handleSelectWorkspace(child.path)}
                disabled={pickerLoading}
                style={({ pressed }) => [
                  styles.selectButton,
                  pressed && styles.selectButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Select ${child.name}`}
              >
                <GText size="sm" style={styles.selectButtonText}>Select</GText>
              </Pressable>
            </HStack>
          </Box>
        </EntranceAnimation>
      );
    },
    [
      loadingPaths,
      workspacePath,
      pickerRoot,
      handleNavigateInto,
      handleSelectWorkspace,
      handleCurrentWorkspaceLayout,
      pickerLoading,
      styles,
      folderColor,
      chevronColor,
      spinnerColor,
    ]
  );

  if (!isOpen) return null;

  return (
    <ModalScaffold
      isOpen={isOpen}
      onClose={onClose}
      title={
        <GText size="lg" style={styles.titleText}>Workspace Picker</GText>
      }
      size="full"
      contentClassName="w-full h-full max-w-none rounded-none border-0 p-0 bg-transparent"
      bodyClassName="flex-1 m-0 p-0"
      bodyProps={{ scrollEnabled: false, contentContainerStyle: { flex: 1 } }}
      showCloseButton={true}
    >
      <Box style={styles.container}>
        <Box style={{ flex: 1 }}>
          <EntranceAnimation variant="fade" duration={180}>
            <VStack style={styles.headerSection}>
              <HStack style={[styles.navRow, { justifyContent: "space-between" }]}>
                {canGoBack ? (
                  <Pressable
                    onPress={handleGoToParent}
                    style={({ pressed }) => [
                      styles.backButton,
                      pressed && styles.backButtonPressed,
                    ]}
                    accessibilityLabel="Go back to parent folder"
                    accessibilityRole="button"
                  >
                    <ChevronLeftIcon size={18} color={accentColor} strokeWidth={2} />
                    <GText size="xs" style={styles.backButtonText}>Parent</GText>
                  </Pressable>
                ) : (
                  <Box style={{ minHeight: 44, minWidth: 90 }} />
                )}
                <Pressable
                  onPress={() => setIsCreatingFolder(!isCreatingFolder)}
                  disabled={pickerLoading || viewLoading}
                  style={({ pressed }) => [
                    styles.backButton,
                    { minWidth: 44, paddingHorizontal: 12 },
                    pressed && styles.backButtonPressed,
                  ]}
                  accessibilityLabel="Create folder"
                  accessibilityRole="button"
                >
                  <AttachPlusIcon size={18} color={accentColor} strokeWidth={2} />
                </Pressable>
              </HStack>

              {isCreatingFolder && (
                <EntranceAnimation variant="slideDown" duration={200}>
                  <Box style={styles.createFolderRow}>
                    <Input style={{ flex: 1, borderColor: isDark ? CYAN_25 : LIGHT_300 }} size="md" variant="outline">
                      <InputField
                        placeholder="Folder name"
                        value={newFolderName}
                        onChangeText={setNewFolderName}
                        style={{ color: isDark ? TEXT_WHITE : LIGHT_900 }}
                        onSubmitEditing={handleCreateFolder}
                        autoFocus
                      />
                    </Input>
                    <Button
                      size="md"
                      onPress={handleCreateFolder}
                      disabled={!newFolderName.trim() || creatingFolder}
                      style={{ backgroundColor: isDark ? CYAN : LIGHT_600 }}
                    >
                      <ButtonText style={{ color: isDark ? LIGHT_900 : TEXT_WHITE }}>
                        {creatingFolder ? "..." : "Create"}
                      </ButtonText>
                    </Button>
                    <Button
                      size="md"
                      variant="outline"
                      onPress={() => { setIsCreatingFolder(false); setNewFolderName(''); }}
                      style={{ borderColor: isDark ? PINK_25 : LIGHT_300, borderWidth: 1 }}
                    >
                      <ButtonText style={{ color: isDark ? PINK : LIGHT_600 }}>Cancel</ButtonText>
                    </Button>
                  </Box>
                </EntranceAnimation>
              )}

              <Box style={styles.browserCard}>
                <VStack style={{ gap: 4 }}>
                  <GText size="xs" style={styles.browserLabel}>
                    Workspace Browser
                  </GText>
                  <GText
                    size="sm"
                    numberOfLines={1}
                    ellipsizeMode="head"
                    style={styles.browserPath}
                  >
                    {pickerRoot ? truncatePathForDisplay(currentPath || pickerRoot) || "/" : "Select workspace"}
                  </GText>
                </VStack>
              </Box>
            </VStack>
          </EntranceAnimation>

          {!pickerRoot ? (
            <EntranceAnimation variant="fade" duration={220} delay={80} style={{ flex: 1 }}>
              <VStack style={styles.spinnerCenter}>
                <Spinner size="large" color={spinnerColor} />
              </VStack>
            </EntranceAnimation>
          ) : (
            <EntranceAnimation variant="fade" duration={200} delay={60} style={{ flex: 1 }}>
              <ScrollView
                ref={scrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
                showsVerticalScrollIndicator
                nestedScrollEnabled
              >
                <VStack style={styles.listContainer}>
                  {/* Current folder card */}
                  <Box
                    style={[
                      styles.currentFolderCard,
                      !currentPath && !currentRelativePath && styles.currentFolderCardActive,
                    ]}
                    onLayout={
                      !currentPath && !currentRelativePath
                        ? handleCurrentWorkspaceLayout
                        : undefined
                    }
                  >
                    <HStack style={styles.childCardRow}>
                      <Pressable
                        onPress={() => {
                          triggerHaptic("selection");
                          if (!currentPath && viewChildren.length === 0 && !viewLoading) {
                            loadRootChildren();
                          }
                        }}
                        style={styles.childPressable}
                        accessibilityRole="button"
                        accessibilityLabel={`Current location ${truncatePathForDisplay(currentPath || pickerRoot)}`}
                      >
                        <HStack style={styles.childInnerRow}>
                          <FolderIcon color={folderColor} />
                          <VStack style={styles.childTextCol}>
                            <GText
                              size="sm"
                              numberOfLines={1}
                              ellipsizeMode="head"
                              style={[styles.childPath, !currentPath && !currentRelativePath && styles.childNameActive]}
                            >
                              {basename(currentPath || pickerRoot) || truncatePathForDisplay(currentPath || pickerRoot) || "."}
                            </GText>
                            <GText size="xs" style={[styles.childPath, { fontSize: 8, color: isDark ? CYAN_50 : LIGHT_400, fontWeight: "400" }]}>
                              Current folder
                            </GText>
                          </VStack>
                          {!currentPath && viewLoading ? (
                            <Spinner size="small" color={spinnerColor} />
                          ) : null}
                        </HStack>
                      </Pressable>
                      <Pressable
                        onPress={() => handleSelectWorkspace(currentPath || pickerRoot)}
                        disabled={pickerLoading}
                        style={({ pressed }) => [
                          styles.useFolderButton,
                          pressed && styles.useFolderButtonPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Use this folder"
                      >
                        <GText size="sm" style={styles.useFolderButtonText}>Select</GText>
                      </Pressable>
                    </HStack>
                  </Box>

                  {pickerError ? (
                    <Box style={styles.errorCard}>
                      <GText size="xs" style={styles.errorText}>
                        {pickerError}
                      </GText>
                    </Box>
                  ) : (pickerLoading || viewLoading) && viewChildren.length === 0 ? (
                    <VStack style={styles.loadingBox}>
                      <Spinner size="large" color={spinnerColor} />
                    </VStack>
                  ) : (
                    <VStack>
                      <GText size="xs" style={styles.sectionLabel}>
                        Subfolders ({viewChildren.length})
                      </GText>
                      {viewChildren.map((child, index) => renderChildRow(child, index))}
                      {!pickerError && viewChildren.length === 0 && !viewLoading ? (
                        <Box style={styles.emptyCard}>
                          <GText size="xs" style={styles.emptyText}>
                            No subfolders here. Tap the current folder card to refresh.
                          </GText>
                        </Box>
                      ) : null}
                    </VStack>
                  )}
                </VStack>
              </ScrollView>
            </EntranceAnimation>
          )}
        </Box>
      </Box>
    </ModalScaffold>
  );
}

// ── Theme-aware Styles ───────────────────────────────────────────────
function createStyles(theme: ReturnType<typeof useTheme>) {
  const isDark = theme.mode === "dark";

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? "rgba(5, 10, 20, 0.45)" : LIGHT_BG,
    },

    // Title
    titleText: {
      color: isDark ? TEXT_WHITE : LIGHT_900,
      fontSize: 15,
      fontWeight: "800",
      letterSpacing: isDark ? 1.5 : 0,
      textTransform: isDark ? "uppercase" : "none",
      fontFamily: isDark ? MONO_FONT : undefined,
      textShadowColor: isDark ? "rgba(0, 229, 255, 0.9)" : "transparent",
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: isDark ? 12 : 0,
    },
    subtitleText: {
      color: isDark ? CYAN_50 : LIGHT_500,
      fontFamily: isDark ? MONO_FONT : undefined,
      fontSize: 9,
      fontWeight: "700",
      marginTop: 2,
      letterSpacing: 1,
    },

    // Header section
    headerSection: {
      borderBottomWidth: 1,
      borderBottomColor: isDark ? CYAN_25 : LIGHT_300,
      backgroundColor: isDark ? BG_SURFACE : "rgba(255, 255, 255, 0.4)",
      paddingHorizontal: 16,
      paddingBottom: 16,
      paddingTop: 12,
      gap: 10,
    },
    navRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
    },
    backButton: {
      minHeight: 36,
      minWidth: 80,
      borderRadius: isDark ? 10 : 14,
      borderWidth: 1,
      borderColor: isDark ? CYAN : LIGHT_300,
      backgroundColor: isDark ? "rgba(0, 24, 46, 0.9)" : LIGHT_100,
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      shadowColor: isDark ? CYAN : "transparent",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: isDark ? 0.3 : 0,
      shadowRadius: isDark ? 6 : 0,
      elevation: 2,
    },
    backButtonPressed: {
      backgroundColor: isDark ? CYAN_15 : LIGHT_200,
      shadowOpacity: isDark ? 0.75 : 0,
      shadowRadius: isDark ? 12 : 0,
      transform: [{ scale: 0.97 }],
    },
    backButtonText: {
      color: isDark ? CYAN : LIGHT_600,
      fontFamily: isDark ? MONO_FONT : undefined,
      fontWeight: "800",
      fontSize: 11,
    },
    createFolderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 4,
    },

    // Browser card
    browserCard: {
      borderRadius: isDark ? 12 : 16,
      borderWidth: 1,
      borderColor: isDark ? CYAN_25 : LIGHT_200,
      backgroundColor: isDark ? BG_SURFACE_ALT : LIGHT_100,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    browserLabel: {
      color: isDark ? CYAN_50 : LIGHT_500,
      fontFamily: isDark ? MONO_FONT : undefined,
      fontWeight: "800",
      fontSize: 8,
      letterSpacing: isDark ? 2 : 1.5,
      textTransform: "uppercase",
    },
    browserPath: {
      color: isDark ? TEXT_TINT : LIGHT_700,
      fontFamily: MONO_FONT,
      fontWeight: "700",
      fontSize: 9,
    },
    instructionText: {
      color: isDark ? CYAN_50 : LIGHT_400,
      fontFamily: isDark ? MONO_FONT : undefined,
      fontSize: 11,
    },

    // Spinner
    spinnerCenter: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },

    // List
    listContainer: {
      paddingTop: 12,
      gap: 10,
    },

    // Current folder card
    currentFolderCard: {
      marginHorizontal: 16,
      borderRadius: isDark ? 12 : 16,
      borderWidth: 1.5,
      borderColor: isDark ? CYAN : "rgba(255, 255, 255, 0.6)",
      backgroundColor: isDark ? BG_SURFACE : "rgba(255, 255, 255, 0.5)",
      paddingHorizontal: 12,
      paddingVertical: 8,
      shadowColor: isDark ? CYAN : LIGHT_900,
      shadowOffset: { width: 0, height: isDark ? 0 : 4 },
      shadowOpacity: isDark ? 0.25 : 0.06,
      shadowRadius: isDark ? 8 : 12,
      elevation: 3,
    },
    currentFolderCardActive: {
      borderColor: isDark ? CYAN : LIGHT_600,
      backgroundColor: isDark ? "rgba(0, 25, 45, 0.7)" : "rgba(255, 255, 255, 0.7)",
      shadowOpacity: isDark ? 0.5 : 0.1,
      shadowRadius: 12,
    },

    // Child rows
    childCard: {
      marginHorizontal: 16,
      marginBottom: 6,
      borderRadius: isDark ? 12 : 16,
      borderWidth: 1,
      borderColor: isDark ? PINK_25 : LIGHT_200,
      backgroundColor: isDark ? BG_SURFACE : "rgba(255, 255, 255, 0.5)",
      paddingHorizontal: 12,
      paddingVertical: 8,
      shadowColor: isDark ? PINK : "transparent",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: isDark ? 0.15 : 0,
      shadowRadius: isDark ? 6 : 0,
      elevation: 2,
    },
    childCardActive: {
      borderColor: isDark ? CYAN : LIGHT_600,
      backgroundColor: isDark ? "rgba(0, 25, 45, 0.7)" : LIGHT_100,
      shadowColor: isDark ? CYAN : LIGHT_600,
      shadowOpacity: isDark ? 0.4 : 0.1,
      shadowRadius: 10,
    },
    childCardRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    childPressable: {
      flex: 1,
      minWidth: 0,
      minHeight: 36,
      justifyContent: "center",
      borderRadius: 10,
    },
    childInnerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    childTextCol: {
      flex: 1,
      minWidth: 0,
    },
    childNameActive: {
      color: isDark ? CYAN : LIGHT_600,
      fontWeight: "800",
    },
    childPath: {
      color: isDark ? CYAN_50 : LIGHT_800,
      fontFamily: isDark ? MONO_FONT : undefined,
      fontWeight: "500",
      fontSize: 9,
    },

    // Select button
    selectButton: {
      minHeight: 32,
      borderRadius: isDark ? 8 : 12,
      borderWidth: 1,
      borderColor: isDark ? PINK : LIGHT_600,
      backgroundColor: isDark ? "rgba(255, 0, 229, 0.15)" : LIGHT_600,
      paddingHorizontal: 12,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: isDark ? PINK : "transparent",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: isDark ? 0.3 : 0,
      shadowRadius: isDark ? 6 : 0,
      elevation: 2,
    },
    selectButtonPressed: {
      backgroundColor: isDark ? "rgba(255, 0, 229, 0.3)" : LIGHT_700,
      shadowOpacity: isDark ? 0.6 : 0,
      transform: [{ scale: 0.97 }],
    },
    selectButtonText: {
      color: TEXT_WHITE,
      fontFamily: isDark ? MONO_FONT : undefined,
      fontWeight: "800",
      fontSize: 11,
    },

    // Use Folder button (primary)
    useFolderButton: {
      minHeight: 32,
      borderRadius: isDark ? 8 : 12,
      borderWidth: 1,
      borderColor: isDark ? PINK : LIGHT_600,
      backgroundColor: isDark ? "rgba(255, 0, 229, 0.15)" : LIGHT_600,
      paddingHorizontal: 12,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: isDark ? PINK : "transparent",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: isDark ? 0.3 : 0,
      shadowRadius: isDark ? 6 : 0,
      elevation: 2,
    },
    useFolderButtonPressed: {
      backgroundColor: isDark ? "rgba(255, 0, 229, 0.3)" : LIGHT_700,
      shadowOpacity: isDark ? 0.6 : 0,
      transform: [{ scale: 0.97 }],
    },
    useFolderButtonText: {
      color: TEXT_WHITE,
      fontFamily: isDark ? MONO_FONT : undefined,
      fontWeight: "800",
      fontSize: 11,
    },

    // Section label
    sectionLabel: {
      color: isDark ? CYAN : LIGHT_500,
      fontFamily: isDark ? MONO_FONT : undefined,
      fontWeight: "800",
      fontSize: 9,
      letterSpacing: isDark ? 2 : 1.5,
      textTransform: "uppercase",
      marginHorizontal: 16,
      marginBottom: 4,
      marginTop: 8,
      textShadowColor: isDark ? "rgba(0, 229, 255, 0.6)" : "transparent",
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: isDark ? 6 : 0,
    },

    // Error
    errorCard: {
      marginHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "rgba(255, 60, 60, 0.6)",
      backgroundColor: isDark ? "rgba(255, 0, 0, 0.1)" : "rgba(255, 220, 220, 0.6)",
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    errorText: {
      color: isDark ? "#ff6b6b" : "#c0392b",
      fontFamily: MONO_FONT,
      fontSize: 12,
    },

    // Loading
    loadingBox: {
      marginHorizontal: 16,
      marginTop: 16,
      minHeight: 160,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: isDark ? 16 : 24,
      borderWidth: 1,
      borderColor: isDark ? CYAN_25 : LIGHT_200,
      backgroundColor: isDark ? BG_SURFACE : "rgba(255, 255, 255, 0.4)",
    },

    // Empty
    emptyCard: {
      marginHorizontal: 16,
      marginTop: 8,
      borderRadius: isDark ? 12 : 20,
      borderWidth: 1,
      borderColor: isDark ? CYAN_25 : LIGHT_200,
      backgroundColor: isDark ? BG_SURFACE_ALT : LIGHT_100,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    emptyText: {
      color: isDark ? CYAN_50 : LIGHT_400,
      fontFamily: MONO_FONT,
      fontSize: 12,
    },
  });
}
