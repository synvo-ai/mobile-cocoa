import {
  PreviewWebViewAddressBar, PreviewWebViewBottomBar, PreviewWebViewPlaceholder, PreviewWebViewTabsPage
} from "@/components/preview/PreviewWebViewSubcomponents";
import { UrlChoiceModal } from "@/components/preview/UrlChoiceModal";
import { ModalScaffold } from "@/components/reusable/ModalScaffold";
import { Box } from "@/components/ui/box";
import { Pressable } from "@/components/ui/pressable";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/theme/index";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard, Platform, StyleSheet, useWindowDimensions
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

const PREVIEW_TABS_KEY = "@vibe_preview_tabs";

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "https://" + trimmed;
}

function isLocalhostUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1";
  } catch {
    return false;
  }
}

function genTabId(): string {
  return "tab-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

function stripPreviewParam(href: string): string {
  try {
    const u = new URL(href);
    u.searchParams.delete("_preview");
    const out = u.toString();
    return out.endsWith("?") ? out.slice(0, -1) : out;
  } catch {
    return href.replace(/([?&])_preview=[^&]*&?/g, (_, p) => (p === "?" ? "" : p)).replace(/\?$/, "");
  }
}

interface PreviewWebViewModalProps {
  isOpen: boolean;
  url: string;
  title?: string;
  onClose: () => void;
  resolvePreviewUrl?: (url: string) => string;
}

interface TabState {
  id: string;
  url: string;
  loadKey: number;
}

export function PreviewWebViewModal({
  isOpen,
  url,
  title = "Preview",
  onClose,
  resolvePreviewUrl,
}: PreviewWebViewModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => createPreviewStyles(theme), [theme]);
  const [tabs, setTabs] = useState<TabState[]>(() => []);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlInputValue, setUrlInputValue] = useState("");
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const [urlChoiceVisible, setUrlChoiceVisible] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showTabs, setShowTabs] = useState(false);
  const pendingUrlChoice = useRef<{ normalized: string; thenApply: (u: string) => void } | null>(null);
  const initializedRef = useRef(false);
  const lastInitUrlRef = useRef<string>("");
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;

  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setIsFullScreen(isLandscape);
  }, [isOpen, isLandscape]);

  useEffect(() => {
    if (showTabs && isFullScreen) {
      setIsFullScreen(false);
    }
  }, [showTabs, isFullScreen]);

  const currentTab = tabs[activeIndex] ?? null;
  const currentUrl = currentTab?.url ?? "";

  const applyUrl = (u: string) => {
    setTabs((prev) => {
      const next = [...prev];
      const tab = next[activeIndex];
      if (tab) {
        next[activeIndex] = { ...tab, url: u, loadKey: Date.now() };
      }
      return next;
    });
    setUrlInputValue(u);
    setError(null);
    setLoading(true);
  };

  const promptLocalhostToVpn = (normalized: string, thenApply: (u: string) => void) => {
    if (!resolvePreviewUrl || !isLocalhostUrl(normalized)) {
      thenApply(normalized);
      return;
    }
    const resolved = resolvePreviewUrl(normalized);
    thenApply(resolved);
  };

  const handleUrlChoiceVpn = () => {
    const p = pendingUrlChoice.current;
    if (p && resolvePreviewUrl) {
      p.thenApply(resolvePreviewUrl(p.normalized));
    }
    pendingUrlChoice.current = null;
    setUrlChoiceVisible(false);
  };

  const handleUrlChoiceOriginal = () => {
    const p = pendingUrlChoice.current;
    if (p) {
      p.thenApply(p.normalized);
      pendingUrlChoice.current = null;
      setUrlChoiceVisible(false);
    }
  };

  const handleUrlChoiceCancel = () => {
    pendingUrlChoice.current = null;
    setUrlChoiceVisible(false);
  };

  useEffect(() => {
    if (!isOpen) {
      initializedRef.current = false;
      lastInitUrlRef.current = "";
      setIsFullScreen(false);
      setShowTabs(false);
      return;
    }
    const initialUrl = (url?.trim() ?? "") || "";
    const normalized = initialUrl ? normalizeUrl(initialUrl) : "";
    if (normalized && lastInitUrlRef.current !== normalized) {
      initializedRef.current = false;
    }
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastInitUrlRef.current = normalized;

      (async () => {
        if (!normalized) {
          try {
            const raw = await AsyncStorage.getItem(PREVIEW_TABS_KEY);
            const stored = raw ? (JSON.parse(raw) as { tabs: { id: string; url: string }[]; activeIndex: number }) : null;
            if (stored?.tabs?.length) {
              const restored: TabState[] = stored.tabs.map((t) => ({ ...t, loadKey: t.url ? Date.now() : 0 }));
              const idx = Math.min(Math.max(0, stored.activeIndex ?? 0), restored.length - 1);
              setTabs(restored);
              setActiveIndex(idx);
              setUrlInputValue(restored[idx]?.url ?? "");
              setError(null);
              setLoading(!!restored[idx]?.url);
              return;
            }
          } catch { }
        }

        const willResolve = !!normalized && !!resolvePreviewUrl && isLocalhostUrl(normalized);
        if (willResolve) {
          const resolved = resolvePreviewUrl(normalized);
          setTabs([{ id: genTabId(), url: resolved, loadKey: Date.now() }]);
          setActiveIndex(0);
          setUrlInputValue(resolved);
          setError(null);
          setLoading(true);
        } else if (normalized) {
          setTabs([{ id: genTabId(), url: normalized, loadKey: Date.now() }]);
          setActiveIndex(0);
          setUrlInputValue(normalized);
          setError(null);
          setLoading(true);
        } else {
          setTabs([{ id: genTabId(), url: "", loadKey: 0 }]);
          setActiveIndex(0);
          setUrlInputValue("");
          setError(null);
          setLoading(false);
        }
      })();
    }
  }, [isOpen, url, resolvePreviewUrl]);

  useEffect(() => {
    if (!isOpen || tabs.length === 0) return;
    const payload = {
      tabs: tabs.map((t) => ({ id: t.id, url: t.url })),
      activeIndex,
    };
    AsyncStorage.setItem(PREVIEW_TABS_KEY, JSON.stringify(payload)).catch(() => { });
  }, [isOpen, tabs, activeIndex]);

  const handleGo = () => {
    Keyboard.dismiss();
    const raw = urlInputValue.trim();
    if (!raw) return;
    const normalized = normalizeUrl(raw);
    const currentClean = stripPreviewParam(resolvedUrl) || resolvedUrl;
    if (normalized === currentClean) {
      setLoading(true);
      setError(null);
      if (webViewRef.current) webViewRef.current.reload();
      return;
    }
    promptLocalhostToVpn(normalized, applyUrl);
  };

  const handleReload = () => {
    Keyboard.dismiss();
    const raw = urlInputValue.trim();
    if (raw) {
      const normalized = normalizeUrl(raw);
      const currentClean = stripPreviewParam(resolvedUrl) || resolvedUrl;
      if (normalized !== currentClean) {
        promptLocalhostToVpn(normalized, applyUrl);
        return;
      }
    }
    if (!resolvedUrl) return;
    setError(null);
    setLoading(true);
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  };

  const handleNavigationStateChange = (navState: { url?: string; canGoBack?: boolean; canGoForward?: boolean }, tabIndex: number) => {
    if (tabIndex === activeIndex) {
      setCanGoBack(navState.canGoBack ?? false);
      setCanGoForward(navState.canGoForward ?? false);
    }
    if (navState.url) {
      const clean = stripPreviewParam(navState.url);
      setTabs((prev) => {
        const next = [...prev];
        const tab = next[tabIndex];
        if (tab && tab.url !== clean) {
          next[tabIndex] = { ...tab, url: clean };
          return next;
        }
        return prev;
      });
      if (tabIndex === activeIndex) {
        setUrlInputValue((prev) => prev !== clean ? clean : prev);
      }
    }
  };

  const addTab = () => {
    const newTab: TabState = { id: genTabId(), url: "", loadKey: 0 };
    setTabs((prev) => [...prev, newTab]);
    setActiveIndex(tabs.length);
    setUrlInputValue("");
    setError(null);
    setLoading(false);
    setShowTabs(false);
  };

  const closeTab = (index: number) => {
    if (tabs.length <= 1) {
      setTabs([{ id: genTabId(), url: "", loadKey: 0 }]);
      setActiveIndex(0);
      setUrlInputValue("");
      setShowTabs(false);
      return;
    }
    const nextTabs = tabs.filter((_, i) => i !== index);
    const nextActive =
      activeIndex === index ? (index > 0 ? index - 1 : 0) : activeIndex > index ? activeIndex - 1 : activeIndex;
    setTabs(nextTabs);
    setActiveIndex(nextActive);
    setUrlInputValue(nextTabs[nextActive]?.url ?? "");
  };

  const selectTab = (index: number) => {
    setActiveIndex(index);
    setUrlInputValue(tabs[index]?.url ?? "");
    setError(null);
    setShowTabs(false);
  };

  if (!isOpen) return null;

  const resolvedUrl = currentUrl || "";

  return (
    <ModalScaffold
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      title={title}
      subtitle={resolvedUrl || "Web preview"}
      showHeader={false}
      contentClassName="w-full h-full max-w-none rounded-none border-0 p-0"
      bodyClassName="m-0 p-0 flex-1"
      bodyProps={{ scrollEnabled: false, contentContainerStyle: { flexGrow: 1, paddingBottom: 0 } }}
    >
      <Box style={styles.safe}>
        {showTabs ? (
          <PreviewWebViewTabsPage
            tabs={tabs}
            activeIndex={activeIndex}
            onSelectTab={selectTab}
            onCloseTab={closeTab}
            onAddTab={addTab}
            onDone={() => setShowTabs(false)}
            insetsTop={insets.top}
            theme={theme}
          />
        ) : (
          <>
            {!isFullScreen && (
              <PreviewWebViewAddressBar
                value={urlInputValue}
                onChangeText={setUrlInputValue}
                onSubmit={handleGo}
                onReload={handleReload}
                resolvedUrl={resolvedUrl}
                loading={loading}
                theme={theme}
                insetsTop={insets.top}
              />
            )}

            {!resolvedUrl ? (
              <PreviewWebViewPlaceholder
                theme={theme}
              />
            ) : (
              <Box style={styles.webContainer}>
                {tabs.map((tab, i) => {
                  const tabUrl = tab.url ?? "";
                  const tabLoadUri = tabUrl ? stripPreviewParam(tabUrl) : "";
                  const isActive = i === activeIndex;
                  if (!tabLoadUri) return null;
                  return (
                    <Box
                      key={tab.id}
                      style={[
                        styles.webviewWrapper,
                        !isActive && styles.webviewWrapperHidden,
                      ]}
                      pointerEvents={isActive ? "auto" : "none"}
                    >
                      <WebView
                        ref={isActive ? webViewRef : undefined}
                        key={tab.id}
                        source={{ uri: tabLoadUri }}
                        style={styles.webview}
                        onLoadStart={() => {
                          if (i === activeIndex) {
                            setLoading(true);
                            setError(null);
                          }
                        }}
                        onLoadEnd={() => {
                          if (i === activeIndex) setLoading(false);
                        }}
                        onError={(e) => {
                          if (i === activeIndex) {
                            setLoading(false);
                            const desc = e.nativeEvent?.description ?? "Failed to load";
                            setError(desc);
                          }
                        }}
                        onHttpError={(e) => {
                          if (i === activeIndex) {
                            setLoading(false);
                            const status = e.nativeEvent?.statusCode;
                            setError(status ? `HTTP ${status}` : "Failed to load");
                          }
                        }}
                        onNavigationStateChange={(navState) => {
                          handleNavigationStateChange(navState, i);
                        }}
                        renderError={() => <Box style={styles.webviewErrorFallback} />}
                        javaScriptEnabled
                        domStorageEnabled
                        startInLoadingState
                        scalesPageToFit
                        mixedContentMode="compatibility"
                        cacheEnabled={false}
                        {...(Platform.OS === "android" ? { cacheMode: "LOAD_NO_CACHE" as const } : {})}
                      />
                    </Box>
                  );
                })}
                {loading && (
                  <Box style={styles.loadingOverlay}>
                    <Box style={styles.loadingCard}>
                      <Spinner size="large" color={theme.colors.accent} />
                      <Text style={styles.loadingText}>Loading page...</Text>
                    </Box>
                  </Box>
                )}
                {error ? (
                  <Box style={styles.errorOverlay}>
                    <Box style={styles.errorBox}>
                      <Text style={styles.errorTitle}>Could not load page</Text>
                      <Text style={styles.errorText}>{error}</Text>
                      <Text style={styles.urlHint} numberOfLines={2}>
                        {resolvedUrl}
                      </Text>
                      <Box style={styles.errorActions}>
                        <Pressable style={styles.retryBtn} onPress={handleReload} accessibilityRole="button" accessibilityLabel="Retry">
                          <Text style={styles.retryBtnText}>Retry</Text>
                        </Pressable>
                        <Pressable
                          style={styles.editBtn}
                          onPress={() => setError(null)}
                          accessibilityRole="button"
                          accessibilityLabel="Edit URL"
                        >
                          <Text style={styles.editBtnText}>Edit URL</Text>
                        </Pressable>
                      </Box>
                    </Box>
                  </Box>
                ) : null}
              </Box>
            )}

            {!isFullScreen && (
              <Box
                style={{
                  backgroundColor: theme.colors.surface,
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.colors.border,
                  paddingBottom: Math.max(insets.bottom, 8),
                }}
              >
                <PreviewWebViewBottomBar
                  onBack={() => { if (canGoBack && webViewRef.current) webViewRef.current.goBack(); }}
                  onForward={() => { if (canGoForward && webViewRef.current) webViewRef.current.goForward(); }}
                  onHome={() => onClose()}
                  tabCount={tabs.length}
                  onShowTabs={() => setShowTabs(true)}
                  onMenu={() => { }}
                  theme={theme}
                  canGoBack={canGoBack}
                  canGoForward={canGoForward}
                />
              </Box>
            )}

            {isFullScreen && (
              <Pressable
                style={[styles.fullScreenExit, { top: insets.top }]}
                onPress={() => (isLandscape ? onClose() : setIsFullScreen(false))}
                accessibilityLabel={isLandscape ? "Close preview" : "Exit full screen"}
                accessibilityRole="button"
              >
                <Text style={styles.fullScreenExitText}>✕</Text>
              </Pressable>
            )}
          </>
        )}
      </Box>

      <UrlChoiceModal
        isOpen={urlChoiceVisible}
        title="Localhost URL"
        description="This URL uses localhost/127.0.0.1. On this device you may not be able to reach it."
        originalUrl={pendingUrlChoice.current?.normalized ?? ""}
        vpnUrl={pendingUrlChoice.current && resolvePreviewUrl ? resolvePreviewUrl(pendingUrlChoice.current.normalized) : ""}
        onChooseVpn={handleUrlChoiceVpn}
        onChooseOriginal={handleUrlChoiceOriginal}
        onCancel={handleUrlChoiceCancel}
      />
    </ModalScaffold>
  );
}

function createPreviewStyles(theme: ReturnType<typeof useTheme>) {
  const modalCardBackground = theme.mode === "dark" ? "#161616" : theme.colors.surfaceMuted;
  const webviewFallbackBackground = theme.mode === "dark" ? "#0A0A0A" : theme.colors.surfaceAlt;

  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.colors.surfaceAlt,
    },
    webContainer: {
      flex: 1,
      position: "relative",
    },
    webviewWrapper: {
      ...StyleSheet.absoluteFillObject,
    },
    webviewWrapperHidden: {
      opacity: 0,
      zIndex: -1,
    },
    webview: {
      flex: 1,
      backgroundColor: theme.colors.surfaceAlt,
    },
    webviewErrorFallback: {
      flex: 1,
      backgroundColor: webviewFallbackBackground,
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.overlay,
      justifyContent: "center",
      alignItems: "center",
      zIndex: 4,
    },
    loadingCard: {
      minWidth: 180,
      alignItems: "center",
      paddingVertical: 18,
      paddingHorizontal: 20,
      borderRadius: theme.mode === "dark" ? 14 : 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === "dark" ? theme.colors.surface : theme.colors.surfaceMuted,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: theme.mode === "dark" ? 0.2 : 0.05,
      shadowRadius: theme.mode === "dark" ? 8 : 12,
    },
    loadingText: {
      marginTop: 10,
      fontSize: 14,
      color: theme.colors.textPrimary,
      fontWeight: "600",
    },
    errorOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.overlay,
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
      zIndex: 5,
    },
    errorBox: {
      width: "100%",
      maxWidth: 380,
      alignItems: "center",
      paddingVertical: 24,
      paddingHorizontal: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.mode === "dark" ? 16 : 28,
      backgroundColor: modalCardBackground,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: theme.mode === "dark" ? 0.3 : 0.08,
      shadowRadius: theme.mode === "dark" ? 16 : 20,
    },
    errorTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: theme.colors.textPrimary,
      textAlign: "center",
      marginBottom: 8,
    },
    errorText: {
      fontSize: 15,
      color: theme.colors.danger,
      textAlign: "center",
    },
    urlHint: {
      marginTop: 10,
      fontSize: 12,
      color: theme.colors.textSecondary,
      textAlign: "center",
    },
    retryBtn: {
      minHeight: 46,
      paddingVertical: 11,
      paddingHorizontal: 24,
      backgroundColor: theme.colors.accent,
      borderRadius: theme.mode === "dark" ? 12 : 9999,
    },
    retryBtnText: {
      fontSize: 15,
      color: theme.colors.textInverse,
      fontWeight: "600",
    },
    errorActions: {
      marginTop: 18,
      width: "100%",
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
    },
    editBtn: {
      marginLeft: 12,
      minHeight: 46,
      paddingVertical: 11,
      paddingHorizontal: 20,
      borderRadius: theme.mode === "dark" ? 12 : 9999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
    },
    editBtnText: {
      fontSize: 15,
      color: theme.colors.textPrimary,
      fontWeight: "600",
    },
    fullScreenExit: {
      position: "absolute",
      right: 16,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 10,
    },
    fullScreenExitText: {
      fontSize: 20,
      color: "#fff",
      fontWeight: "400",
    },
  });
}
