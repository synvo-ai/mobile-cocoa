import {
    FileTreePane,
    type WorkspaceTreeItem
} from "@/components/file/workspaceSidebar/FileTreePane";
import { FolderRow } from "@/components/file/workspaceSidebar/FolderRow";
import { GitPane } from "@/components/file/workspaceSidebar/GitPane";
import { SidebarHeader } from "@/components/file/workspaceSidebar/SidebarHeader";
import {
    FileIconByType, FolderIconByType
} from "@/components/icons/WorkspaceTreeIcons";
import { ListSectionCard } from "@/components/reusable/ListSectionCard";
import { ModalScaffold } from "@/components/reusable/ModalScaffold";
import { showAlert } from "@/components/ui/alert/nativeAlert";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Pressable } from "@/components/ui/pressable";
import { ScrollView } from "@/components/ui/scroll-view";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { getDefaultServerConfig } from "@/core";
import { EntranceAnimation, triggerHaptic } from "@/designSystem";
import { useTheme } from "@/theme/index";
import { basename, dirname } from "@/utils/path";
import { BlurView } from "expo-blur";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Platform, StyleSheet, TextInput, useWindowDimensions
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type TreeItem = WorkspaceTreeItem;

type WorkspaceData = {
  root: string;
  tree: TreeItem[];
};

export interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export interface GitStatusItem {
  file: string;
  status: string;
  isDirectory?: boolean;
}

export interface GitUntrackedItem {
  file: string;
  isDirectory?: boolean;
}

const DEFAULT_REFRESH_MS = 3000;

// Colors by file type (Atom One Light–style)
const ATOM_ONE_LIGHT = {
  folder: "#C18401",
  blue: "#4078F2",
  green: "#50A14F",
  red: "#E45649",
  orange: "#D28445",
  purple: "#A626A4",
  cyan: "#0184BC",
  yellow: "#C18401",
  grey: "#696C77",
};

function areGitCommitsEqual(a: GitCommit[], b: GitCommit[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const next = b[index];
    if (!next) return false;
    return (
      item.hash === next.hash &&
      item.author === next.author &&
      item.date === next.date &&
      item.message === next.message
    );
  });
}

function areGitStatusItemsEqual(
  a: ReadonlyArray<{ file: string; status?: string; isDirectory?: boolean }>,
  b: ReadonlyArray<{ file: string; status?: string; isDirectory?: boolean }>
): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const next = b[index];
    if (!next) return false;
    return (
      item.file === next.file &&
      item.status === next.status &&
      item.isDirectory === next.isDirectory
    );
  });
}

export type GitContextForAI = {
  staged: string[];
  unstaged: string[];
  untracked: string[];
};

interface WorkspaceSidebarProps {
  isOpen: boolean;
  embedded?: boolean;
  onClose: () => void;
  onFileSelect?: (path: string) => void;
  /** When provided, replaces manual commit with "Commit by AI" flow. Always starts a new session on current workspace. */
  onCommitByAI?: (userRequest: string) => void;
  /** Called when the active tab (files | changes | commits) changes. Use to hide InputPanel during staging/commit. */
  onActiveTabChange?: (tab: "files" | "changes" | "commits") => void;
}

const SIDE_MARGIN = 12;
const IGNORED_FILES = new Set([".gitignore", ".env", ".env.example", ".env.local"]);
const PATH_MAX_CHARS = 42;

/** Deprecated: using ellipsizeMode="middle" instead */
function truncatePathMiddle(path: string, maxChars: number = PATH_MAX_CHARS): string {
  if (path.length <= maxChars) return path;
  const file = basename(path);
  const dir = dirname(path);
  if (!dir || dir === ".") return `...${path.slice(-(maxChars - 3))}`;
  const ellipsis = ".../";
  const startChars = Math.max(4, maxChars - file.length - ellipsis.length);
  const start = dir.slice(0, startChars);
  return `${start}${ellipsis}${file}`;
}

export function WorkspaceSidebar({ isOpen, embedded, onClose, onFileSelect, onCommitByAI, onActiveTabChange }: WorkspaceSidebarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [data, setData] = useState<WorkspaceData | null>(null);
  const safeAreaAwareHeight = Math.max(
    0,
    windowHeight - insets.bottom
  );

  // Sidebar logic state
  const [loading, setLoading] = useState(true);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(DEFAULT_REFRESH_MS);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set([""]));
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"files" | "changes" | "commits">("files");

  // Git Data States
  const [gitLoading, setGitLoading] = useState(false);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [stagedFiles, setStagedFiles] = useState<GitStatusItem[]>([]);
  const [unstagedFiles, setUnstagedFiles] = useState<GitStatusItem[]>([]);
  const [untrackedFiles, setUntrackedFiles] = useState<GitUntrackedItem[]>([]);
  const [gitError, setGitError] = useState<string | null>(null);

  // Changes State
  const [commitMessage, setCommitMessage] = useState("");
  const [aiCommitQuery, setAiCommitQuery] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const baseUrl = getDefaultServerConfig().getBaseUrl();
  const drawerWidth = embedded ? windowWidth : windowWidth - 2 * SIDE_MARGIN;
  const maxDrawerHeight = Math.max(0, Math.round(safeAreaAwareHeight));
  const drawerHeight = embedded ? undefined : maxDrawerHeight;
  const drawerSize = embedded
    ? { width: drawerWidth, flex: 1 }
    : { width: drawerWidth, maxHeight: drawerHeight };

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/api/config`);
      const cfg = await res.json();
      if (cfg.sidebarRefreshIntervalMs != null && cfg.sidebarRefreshIntervalMs >= 0) {
        setRefreshIntervalMs(cfg.sidebarRefreshIntervalMs);
      }
    } catch (_) { }
  }, [baseUrl]);

  const fetchTree = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/api/workspace-tree`);
      const json = await res.json();
      if (json.tree && json.root != null) {
        setData({ root: json.root, tree: json.tree });
      }
    } catch (_) {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  const fetchCommits = useCallback(async () => {
    setGitLoading(true);
    setGitError(null);
    try {
      const res = await fetch(`${baseUrl}/api/git/commits?limit=50`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setCommits((prev) =>
        areGitCommitsEqual(prev, json.commits || [])
          ? prev
          : json.commits || []
      );
    } catch (err: any) {
      setGitError(err.message);
    } finally {
      setGitLoading(false);
    }
  }, [baseUrl]);

  const fetchStatus = useCallback(async () => {
    setGitLoading(true);
    setGitError(null);
    try {
      const res = await fetch(`${baseUrl}/api/git/status`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const normalizeItem = (x: unknown): GitStatusItem | GitUntrackedItem => {
        if (typeof x === "string") return { file: x, isDirectory: false };
        if (x && typeof x === "object" && "file" in x) {
          const obj = x as { file?: unknown; isDirectory?: boolean; status?: string };
          const file = typeof obj.file === "string" ? obj.file : String(obj?.file ?? "");
          return obj.status != null
            ? { file, status: String(obj.status ?? ""), isDirectory: !!obj.isDirectory }
            : { file, isDirectory: !!obj.isDirectory };
        }
        return { file: "", isDirectory: false };
      };
      const nextStaged = (json.status?.staged || []).map(normalizeItem) as GitStatusItem[];
      const nextUnstaged = (json.status?.unstaged || []).map(normalizeItem) as GitStatusItem[];
      const nextUntracked = (json.status?.untracked || []).map(normalizeItem) as GitUntrackedItem[];
      setStagedFiles((prev) => (areGitStatusItemsEqual(prev, nextStaged) ? prev : nextStaged));
      setUnstagedFiles((prev) => (areGitStatusItemsEqual(prev, nextUnstaged) ? prev : nextUnstaged));
      setUntrackedFiles((prev) => (areGitStatusItemsEqual(prev, nextUntracked) ? prev : nextUntracked));
    } catch (err: any) {
      setGitError(err.message);
    } finally {
      setGitLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchConfig();
    fetchTree();
  }, [isOpen, fetchConfig, fetchTree]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === "commits") fetchCommits();
    else if (activeTab === "changes") fetchStatus();
  }, [isOpen, activeTab, fetchCommits, fetchStatus]);

  useEffect(() => {
    if (isOpen) onActiveTabChange?.(activeTab);
  }, [isOpen, activeTab, onActiveTabChange]);

  useEffect(() => {
    if (!isOpen || refreshIntervalMs <= 0 || activeTab !== "files") return;
    const timer = setInterval(fetchTree, refreshIntervalMs);
    return () => clearInterval(timer);
  }, [isOpen, activeTab, refreshIntervalMs, fetchTree]);

  // Actions
  const handleStageFile = async (file: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`${baseUrl}/api/git/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stage", files: [file] })
      });
      if (!res.ok) throw new Error("Failed to stage");
      await fetchStatus();
    } catch (e: any) {
      showAlert("Error", e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStageAll = async () => {
    try {
      setActionLoading(true);
      const allFiles = [
        ...unstagedFiles.map((f) => f.file),
        ...untrackedFiles.map((u) => u.file),
      ];
      if (!allFiles.length) return;
      const res = await fetch(`${baseUrl}/api/git/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stage", files: allFiles })
      });
      if (!res.ok) throw new Error("Failed to stage all");
      await fetchStatus();
    } catch (e: any) {
      showAlert("Error", e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleGitInit = async () => {
    try {
      setActionLoading(true);
      const res = await fetch(`${baseUrl}/api/git/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "init" })
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Failed to initialize git");
      setGitError(null);
      if (activeTab === "commits") await fetchCommits();
      else if (activeTab === "changes") await fetchStatus();
    } catch (e: any) {
      showAlert("Error", e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    try {
      setActionLoading(true);
      const res = await fetch(`${baseUrl}/api/git/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "commit", message: commitMessage })
      });
      if (!res.ok) throw new Error("Commit failed");
      setCommitMessage("");
      await fetchStatus();
    } catch (e: any) {
      showAlert("Error", e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Rest of Tree helpers
  const getFileColor = useCallback((name: string): string => {
    const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "" : "";
    const m: Record<string, string> = {
      js: ATOM_ONE_LIGHT.yellow,
      jsx: ATOM_ONE_LIGHT.blue,
      ts: ATOM_ONE_LIGHT.blue,
      tsx: ATOM_ONE_LIGHT.blue,
      json: ATOM_ONE_LIGHT.yellow,
      md: ATOM_ONE_LIGHT.blue,
      html: ATOM_ONE_LIGHT.red,
      css: ATOM_ONE_LIGHT.cyan,
      scss: ATOM_ONE_LIGHT.purple,
      py: ATOM_ONE_LIGHT.green,
      yml: ATOM_ONE_LIGHT.purple,
      yaml: ATOM_ONE_LIGHT.purple,
      sh: ATOM_ONE_LIGHT.orange,
      bash: ATOM_ONE_LIGHT.orange,
      zsh: ATOM_ONE_LIGHT.orange,
    };
    return m[ext] ?? ATOM_ONE_LIGHT.grey;
  }, []);

  const isIgnoredFile = useCallback((name: string): boolean => {
    return IGNORED_FILES.has(name);
  }, []);

  const filterTree = useCallback((items: TreeItem[], query: string): TreeItem[] => {
    if (!query.trim()) return items;
    const q = query.trim().toLowerCase();
    const filterItem = (item: TreeItem): TreeItem | null => {
      if (item.type === "folder") {
        const filteredChildren = (item.children ?? [])
          .map(filterItem)
          .filter((c): c is TreeItem => c != null);
        const matchesSelf = item.name.toLowerCase().includes(q);
        if (filteredChildren.length > 0 || matchesSelf) {
          return { ...item, children: filteredChildren.length ? filteredChildren : item.children };
        }
        return null;
      }
      return item.name.toLowerCase().includes(q) ? item : null;
    };
    return items.map(filterItem).filter((c): c is TreeItem => c != null);
  }, []);

  const filteredTree = useMemo(
    () => (data?.tree ? filterTree(data.tree, searchQuery) : []),
    [data?.tree, searchQuery, filterTree]
  );

  const toggleFolder = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleFilePress = useCallback(
    (filePath: string) => {
      onFileSelect?.(filePath);
    },
    [onFileSelect]
  );

  const renderItem = useCallback(
    (item: TreeItem, depth: number) => {
      if (item.type === "folder") {
        const isExpanded = expandedPaths.has(item.path);
        return (
          <React.Fragment key={item.path}>
            <FolderRow
              item={item}
              depth={depth}
              expanded={isExpanded}
              isDark={theme.mode === "dark"}
              rootColorPrimary={theme.colors.textPrimary}
              rootColorSecondary={theme.colors.textSecondary}
              folderIconColor={ATOM_ONE_LIGHT.folder}
              onToggleFolder={toggleFolder}
              onOpenFile={handleFilePress}
              getFileColor={getFileColor}
            />
            {isExpanded && item.children && item.children.length > 0 && (
              <Box className="ml-0">
                {item.children.map((child) => renderItem(child, depth + 1))}
              </Box>
            )}
          </React.Fragment>
        );
      }
      const ignored = isIgnoredFile(item.name);
      return (
        <FolderRow
          key={item.path}
          item={item}
          depth={depth}
          isIgnored={ignored}
          isDark={theme.mode === "dark"}
          rootColorPrimary={theme.colors.textPrimary}
          rootColorSecondary={theme.colors.textSecondary}
          folderIconColor={ATOM_ONE_LIGHT.folder}
          onToggleFolder={toggleFolder}
          onOpenFile={handleFilePress}
          getFileColor={getFileColor}
        />
      );
    },
    [expandedPaths, toggleFolder, getFileColor, isIgnoredFile, handleFilePress, theme.mode, theme.colors.textPrimary, theme.colors.textSecondary]
  );

  const styles = useMemo(() => createWorkspaceSidebarStyles(theme), [theme]);

  const renderChangesTab = () => {
    const hasStaged = stagedFiles.length > 0;
    const hasUnstaged = unstagedFiles.length > 0;
    const hasUntracked = untrackedFiles.length > 0;
    const totalUnstaged = unstagedFiles.length + untrackedFiles.length;
    const canCommit = hasStaged || hasUnstaged || hasUntracked;
    const isDark = theme.mode === "dark";

    const renderChangeRow = (
      item: { file: string; isDirectory?: boolean; status?: string },
      key: string,
      index: number,
      variant: "staged" | "unstaged",
      onPress: () => void,
      onAction?: () => void,
      actionLabel?: string
    ) => {
      const fileName = basename(item.file);
      const fileColor = item.isDirectory ? ATOM_ONE_LIGHT.folder : getFileColor(fileName);
      return (
        <EntranceAnimation key={key} variant="slideUp" delay={index * 35} duration={220}>
          <Pressable
            style={({ pressed }) => [
              styles.changeRow,
              variant === "staged" && styles.changeRowStaged,
              pressed && styles.changeRowPressed,
            ]}
            onPress={onPress}
          >
            <Box style={styles.changeRowIconWrap}>
              {item.isDirectory ? (
                <FolderIconByType name={item.file} expanded={false} color={fileColor} />
              ) : (
                <FileIconByType name={fileName} color={fileColor} />
              )}
            </Box>
            <Box style={styles.changeRowContent}>
              <Text style={styles.changeRowPath} numberOfLines={1} ellipsizeMode="middle">
                {item.file}
              </Text>
            </Box>
            {variant === "staged" && item.status != null && (
              <Box style={styles.changeRowBadge}>
                <Badge
                  action={item.status === "M" || item.status === "A" || item.status === "D" ? "success" : "muted"}
                  variant="solid"
                  size="sm"
                  className="shrink-0"
                >
                  <BadgeText>{item.status}</BadgeText>
                </Badge>
              </Box>
            )}
            {variant === "unstaged" && onAction && (
              <Pressable
                style={({ pressed }) => [styles.stageBtn, pressed && styles.stageBtnPressed]}
                onPress={() => {
                  triggerHaptic("selection");
                  onAction();
                }}
                accessibilityLabel={actionLabel ?? "Stage"}
              >
                <Text style={styles.stageBtnText}>Stage</Text>
              </Pressable>
            )}
          </Pressable>
        </EntranceAnimation>
      );
    };

    return (
      <Box style={[styles.changesLayout, { backgroundColor: "transparent" }]}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.changesScrollContent} showsVerticalScrollIndicator={false}>
          {/* Staged section card */}
          <ListSectionCard
            title="Staged"
            className="border-0"
            style={[styles.sectionCard, isDark && styles.sectionCardDark]}
            action={undefined}
          >
            {hasStaged ? (
              <Box style={styles.changeList}>
                {stagedFiles.map((f, i) =>
                  renderChangeRow(
                    f,
                    `staged:${f.file}:${i}`,
                    i,
                    "staged",
                    () => !f.isDirectory && handleFilePress("__diff__:staged:" + f.file)
                  )
                )}
              </Box>
            ) : (
              <Text style={styles.emptyText}>No staged changes</Text>
            )}
          </ListSectionCard>

          {/* Unstaged section card */}
          <ListSectionCard
            title="Unstaged"
            className="border-0"
            style={[styles.sectionCard, isDark && styles.sectionCardDark]}
            action={
              <Box style={styles.unstagedHeaderActions}>
                {totalUnstaged > 0 ? (
                  <Pressable
                    style={({ pressed }) => [styles.stageAllBtn, pressed && styles.stageAllBtnPressed]}
                    onPress={() => {
                      triggerHaptic("light");
                      handleStageAll();
                    }}
                  >
                    <Text style={[styles.stageAllBtnText, { color: theme.colors.accent }]}>Stage all</Text>
                  </Pressable>
                ) : null}
              </Box>
            }
          >
            {hasUnstaged ? (
              <Box style={styles.changeList}>
                {unstagedFiles.map((f, i) =>
                  renderChangeRow(
                    f,
                    `unstaged:${f.file}:${i}`,
                    i,
                    "unstaged",
                    () => !f.isDirectory && handleFilePress("__diff__:unstaged:" + f.file),
                    () => handleStageFile(f.file)
                  )
                )}
              </Box>
            ) : null}
            {hasUntracked ? (
              <Box style={[styles.changeList, hasUnstaged && { marginTop: 4 }]}>
                {untrackedFiles.map((u, i) =>
                  renderChangeRow(
                    u,
                    `untracked:${u.file}:${i}`,
                    unstagedFiles.length + i,
                    "unstaged",
                    () => !u.isDirectory && handleFilePress("__diff__:unstaged:" + u.file),
                    () => handleStageFile(u.file)
                  )
                )}
              </Box>
            ) : null}
            {!hasUnstaged && !hasUntracked && <Text style={styles.emptyText}>No unstaged changes</Text>}
          </ListSectionCard>
        </ScrollView>

        {/* Commit form */}
        <Box style={[styles.commitForm, isDark && styles.commitFormDark, { paddingBottom: Math.max(18, insets.bottom + 12) }]}>
          {onCommitByAI ? (
            <Box style={styles.commitInputRow}>
              <Box style={[styles.commitInputWrap, isDark && styles.commitInputWrapDark]}>
                <TextInput
                  multiline
                  style={[styles.commitInput, styles.commitInputWithButton]}
                  placeholder="Describe what to commit (e.g. add feature)..."
                  placeholderTextColor={theme.mode === "dark" ? "rgba(255,255,255,0.5)" : "rgba(82, 55, 36, 0.4)"}
                  value={aiCommitQuery}
                  onChangeText={setAiCommitQuery}
                  editable={!actionLoading}
                />
              </Box>
              <Pressable
                style={[
                  styles.commitBtn,
                  { backgroundColor: theme.colors.accent, shadowColor: theme.colors.accent },
                  (!aiCommitQuery.trim() || !canCommit) && { opacity: 0.5 },
                ]}
                onPress={() => {
                  const q = aiCommitQuery.trim();
                  if (!q || !canCommit) return;
                  triggerHaptic("light");
                  onCommitByAI?.(q);
                  setAiCommitQuery("");
                  onClose();
                }}
                disabled={!aiCommitQuery.trim() || !canCommit || actionLoading}
              >
                <Text style={styles.commitBtnText}>Commit by AI</Text>
              </Pressable>
            </Box>
          ) : (
            <Box style={styles.commitInputRow}>
              <Box style={[styles.commitInputWrap, isDark && styles.commitInputWrapDark]}>
                <TextInput
                  multiline
                  style={[styles.commitInput, styles.commitInputWithButton]}
                  placeholder="Commit message..."
                  placeholderTextColor={theme.colors.textSecondary}
                  value={commitMessage}
                  onChangeText={setCommitMessage}
                  editable={!actionLoading}
                />
              </Box>
              <Pressable
                style={[
                  styles.commitBtn,
                  { backgroundColor: theme.colors.accent, shadowColor: theme.colors.accent },
                  (!hasStaged || !commitMessage.trim()) && { opacity: 0.5 },
                ]}
                onPress={handleCommit}
                disabled={!hasStaged || !commitMessage.trim() || actionLoading}
              >
                <Text style={styles.commitBtnText}>{actionLoading ? "…" : "Commit"}</Text>
              </Pressable>
            </Box>
          )}
        </Box>
      </Box>
    );
  };

  const renderCommitsTab = () => {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {commits.length > 0 ? commits.map(c => (
          <Box key={c.hash} style={styles.commitItem}>
            <Box style={styles.commitHeaderRow}>
              <Text style={styles.commitHash}>{c.hash.slice(0, 7)}</Text>
              <Text style={styles.commitDate}>{c.date}</Text>
            </Box>
            <Text style={styles.commitMessageTxt}>{c.message}</Text>
            <Text style={styles.commitAuthorTxt}>{c.author}</Text>
          </Box>
        )) : <Text style={styles.emptyText}>No commits found</Text>}
      </ScrollView>
    );
  };

  const overlayPadding = embedded
    ? { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 }
    : {
      paddingTop: 0,
      paddingBottom: insets.bottom,
      paddingLeft: insets.left,
      paddingRight: insets.right,
    };
  const drawerCenterStyle = embedded
    ? [styles.drawerCenter, styles.drawerCenterEmbedded, { flex: 1 }]
    : [styles.drawerCenter, styles.drawerCenterAbsolute, { paddingHorizontal: SIDE_MARGIN }];
  const overlayContent = (
    <Box style={[styles.overlay, embedded && styles.overlayEmbedded, overlayPadding]}>
      <Pressable
        style={styles.mask}
        onPress={onClose}
      />
      <Box style={drawerCenterStyle} pointerEvents="box-none">
        <EntranceAnimation variant="slideRight" duration={280}>
          <Box style={[styles.drawer, drawerSize, embedded && styles.drawerEmbedded]}>
            {theme.mode === "dark" ? <BlurView intensity={85} tint="dark" style={StyleSheet.absoluteFill} /> : <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />}
            <SidebarHeader
              activeTab={activeTab}
              onClose={onClose}
              onTabChange={(tab) => {
                setActiveTab(tab);
                onActiveTabChange?.(tab);
              }}
            />

            {gitLoading && activeTab !== "files" ? (
              <Box style={styles.loading}>
                <Spinner size="large" color={theme.colors.accent} />
              </Box>
            ) : gitError && activeTab !== "files" ? (
              <ScrollView style={styles.scroll} contentContainerStyle={styles.errorContainer}>
                {gitError.includes("not a git repository") ? (
                  <Pressable
                    style={[styles.initGitBtn, actionLoading && styles.initGitBtnDisabled]}
                    onPress={handleGitInit}
                    disabled={actionLoading}
                    accessibilityLabel="Initialize Git repository"
                  >
                    {actionLoading ? (
                      <Spinner size="small" color="#fff" />
                    ) : (
                      <Text style={styles.initGitBtnText}>Initialize Git Repository</Text>
                    )}
                  </Pressable>
                ) : (
                  <>
                    <Text style={styles.errorTitle}>Git Error</Text>
                    <Text style={styles.errorText}>{gitError}</Text>
                  </>
                )}
              </ScrollView>
            ) : activeTab === "files" ? (
              <FileTreePane
                theme={theme}
                root={data?.root}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                loading={loading}
                hasData={!!data}
                filteredTree={filteredTree}
                renderItem={renderItem}
              />
            ) : (
              <GitPane
                activeTab={activeTab}
                styles={styles}
                renderChangesTab={renderChangesTab}
                renderCommitsTab={renderCommitsTab}
              />
            )}

          </Box>
        </EntranceAnimation>
      </Box>
    </Box>
  );

  if (embedded) {
    if (!isOpen) return null;
    return overlayContent;
  }

  return (
    <ModalScaffold
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      title="Workspace"
      subtitle="Files, changes, and commits"
      showHeader={false}
      showCloseButton={false}
      contentClassName="w-full h-full max-w-none rounded-none border-0 p-0"
      bodyClassName="m-0 p-0"
      bodyProps={{ scrollEnabled: false }}
    >
      {overlayContent}
    </ModalScaffold>
  );
}

function createWorkspaceSidebarStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    overlay: { flex: 1 },
    overlayEmbedded: { minHeight: 0 },
    mask: { ...StyleSheet.absoluteFillObject, backgroundColor: "transparent" },
    drawerCenter: { justifyContent: "flex-start", alignItems: "center" },
    drawerCenterAbsolute: { ...StyleSheet.absoluteFillObject },
    drawerCenterEmbedded: { justifyContent: "flex-start" as const },
    drawer: {
      backgroundColor: theme.mode === "dark" ? "rgba(8, 12, 22, 0.4)" : "rgba(255, 255, 255, 0.5)",
      borderRadius: theme.mode === "dark" ? 24 : 36,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(162, 210, 255, 0.3)" : "rgba(0, 0, 0, 0.05)",
      overflow: "hidden",
      shadowColor: theme.mode === "dark" ? theme.colors.accent : theme.colors.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: theme.mode === "dark" ? 0.3 : 0.08,
      shadowRadius: theme.mode === "dark" ? 16 : 32,
      elevation: theme.mode === "dark" ? 8 : 4,
    },
    drawerEmbedded: {
      borderRadius: 0,
      borderWidth: 0,
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    loading: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 24, backgroundColor: "transparent" },
    scroll: { flex: 1, minHeight: 0, backgroundColor: "transparent" },
    scrollContent: { paddingVertical: 8, paddingBottom: 24 },

    // Git specific
    errorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
    errorTitle: { fontSize: 18, fontWeight: "700", color: theme.colors.warning, marginBottom: 8 },
    errorText: { fontSize: 14, color: theme.colors.textSecondary, textAlign: "center", lineHeight: 20 },
    initGitBtn: {
      marginTop: 20,
      paddingVertical: 12,
      paddingHorizontal: 20,
      backgroundColor: theme.colors.accent,
      borderRadius: 12,
    },
    initGitBtnDisabled: { opacity: 0.7 },
    initGitBtnText: { fontSize: 15, fontWeight: "600", color: "#fff" },

    emptyText: { paddingHorizontal: 14, paddingVertical: 8, color: theme.colors.textSecondary, fontSize: 13 },

    // Redesigned Changes tab
    changesLayout: { flex: 1 },
    changesScrollContent: { paddingHorizontal: 12, paddingVertical: 8, paddingBottom: 16 },
    sectionCard: {
      backgroundColor: theme.mode === "dark" ? theme.colors.surface : "rgba(255,255,255,0.7)",
      borderRadius: theme.mode === "dark" ? 14 : 20,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? theme.colors.border : "rgba(0,0,0,0.05)",
      marginBottom: 8,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: theme.mode === "dark" ? 0 : 0.03,
      shadowRadius: 10,
    },
    sectionCardDark: {
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: theme.colors.border,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
      gap: 8,
    },
    changeList: { paddingVertical: 2 },
    changeRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 7,
      minHeight: 38,
    },
    changeRowStaged: {},
    changeRowPressed: { backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.08)" : theme.colors.surfaceMuted },
    changeRowIconWrap: {
      width: 24,
      height: 24,
      borderRadius: 6,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
    },
    changeRowContent: { flex: 1, minWidth: 0 },
    changeRowPath: {
      fontSize: 13,
      color: theme.colors.textPrimary,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    changeRowBadge: { marginLeft: 8 },
    stageBtn: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: theme.mode === "dark" ? theme.colors.accentSoft : "rgba(139, 94, 60, 0.08)",
    },
    stageBtnPressed: { opacity: 0.8 },
    stageBtnText: { fontSize: 11, fontWeight: "700", color: theme.colors.accent },
    stageAllBtn: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: theme.mode === "dark" ? theme.colors.accentSoft : "rgba(139, 94, 60, 0.08)",
      marginLeft: "auto",
    },
    stageAllBtnPressed: { opacity: 0.8 },
    unstagedHeaderActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginLeft: "auto",
    },

    changeItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    changeItemStaged: { paddingLeft: 24 },
    stagedPathWrap: { flex: 1, minWidth: 0, flexShrink: 1 },
    changePathTouchable: { flex: 1, minWidth: 0 },
    changeFileLabel: { flex: 1, minWidth: 0, fontSize: 12, color: theme.colors.textPrimary, paddingLeft: 4, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
    changeFileLabelStaged: { fontFamily: undefined },
    statusBadgeWrap: { flexShrink: 0, marginLeft: 8, justifyContent: "center" },
    statusLabel: { fontSize: 11, color: theme.colors.accent, fontWeight: "600" },
    stageBtnWrap: { flexShrink: 0, marginLeft: 8 },
    stageAllBtnText: { fontSize: 12, fontWeight: "600" },

    commitForm: {
      padding: 18,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.mode === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)",
      backgroundColor: theme.mode === "dark" ? "rgba(0, 5, 12, 0.3)" : "rgba(255,255,255,0.3)",
      flexShrink: 0,
    },
    commitFormDark: {
      borderTopColor: "rgba(162, 210, 255, 0.15)",
    },
    commitInputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 12,
    },
    commitInputWrap: {
      flex: 1,
      minWidth: 0,
    },
    commitInputWrapDark: {},
    commitInput: {
      minHeight: 44,
      maxHeight: 120,
      backgroundColor: theme.mode === "dark" ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.9)",
      borderRadius: theme.mode === "dark" ? 14 : 20,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 14,
      color: theme.colors.textPrimary,
      textAlignVertical: "top",
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(255,255,255,0.1)" : "rgba(139, 94, 60, 0.15)",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: theme.mode === "dark" ? 0 : 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    commitInputWithButton: {
      flex: 1,
    },
    commitBtn: {
      backgroundColor: theme.mode === "dark" ? theme.colors.accent : "#8B5E3C",
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: theme.mode === "dark" ? 14 : 20,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: theme.mode === "dark" ? theme.colors.accent : "#8B5E3C",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: theme.mode === "dark" ? 0.3 : 0.25,
      shadowRadius: 10,
      elevation: 4,
      flexShrink: 0,
    },
    commitBtnText: { color: "#FFF", fontSize: 13, fontWeight: "700" },

    commitItem: {
      padding: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    commitHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },
    commitHash: { fontSize: 12, color: theme.colors.accent, fontWeight: "700", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
    commitDate: { fontSize: 12, color: theme.colors.textSecondary },
    commitMessageTxt: { fontSize: 14, color: theme.colors.textPrimary, marginBottom: 4, fontWeight: "500" },
    commitAuthorTxt: { fontSize: 12, color: theme.colors.textSecondary, opacity: 0.8 },
  });
}
