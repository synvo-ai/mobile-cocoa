import { Box } from "@/components/ui/box";
import { Input, InputField } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import { ScrollView } from "@/components/ui/scroll-view";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import type { DesignTheme } from "@/theme/index";
import React from "react";
import { Platform, StyleSheet } from "react-native";
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from "react-native-svg";

const Icons = {
  Lock: ({ color, size }: { color: string; size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="11" width="18" height="11" rx="2" ry="2"></Rect>
      <Path d="M7 11V7a5 5 0 0110 0v4"></Path>
    </Svg>
  ),
  Refresh: ({ color, size }: { color: string; size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 2v6h-6"></Path>
      <Path d="M3 12a9 9 0 0115-6.7L21 8"></Path>
      <Path d="M3 22v-6h6"></Path>
      <Path d="M21 12a9 9 0 01-15 6.7L3 16"></Path>
    </Svg>
  ),
  Globe: ({ color, size }: { color: string; size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10"></Circle>
      <Line x1="2" y1="12" x2="22" y2="12"></Line>
      <Path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"></Path>
    </Svg>
  ),
  Search: ({ color, size }: { color: string; size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="11" cy="11" r="8"></Circle>
      <Line x1="21" y1="21" x2="16.65" y2="16.65"></Line>
    </Svg>
  ),
  Bookmark: ({ color, size }: { color: string; size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"></Path>
    </Svg>
  ),
  History: ({ color, size }: { color: string; size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10"></Circle>
      <Path d="M12 6v6l4 2"></Path>
    </Svg>
  ),
  Download: ({ color, size }: { color: string; size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></Path>
      <Polyline points="7 10 12 15 17 10"></Polyline>
      <Line x1="12" y1="15" x2="12" y2="3"></Line>
    </Svg>
  ),
  ChevronLeft: ({ color, size }: { color: string; size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 18l-6-6 6-6"></Path>
    </Svg>
  ),
  ChevronRight: ({ color, size }: { color: string; size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 18l6-6-6-6"></Path>
    </Svg>
  ),
  Home: ({ color, size }: { color: string; size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"></Path>
      <Polyline points="9 22 9 12 15 12 15 22"></Polyline>
    </Svg>
  ),
  Layers: ({ color, size }: { color: string; size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Polygon points="12 2 2 7 12 12 22 7 12 2"></Polygon>
      <Polyline points="2 17 12 22 22 17"></Polyline>
      <Polyline points="2 12 12 17 22 12"></Polyline>
    </Svg>
  ),
  MoreVertical: ({ color, size }: { color: string; size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="1"></Circle>
      <Circle cx="12" cy="5" r="1"></Circle>
      <Circle cx="12" cy="19" r="1"></Circle>
    </Svg>
  ),
  Plus: ({ color, size }: { color: string; size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Line x1="12" y1="5" x2="12" y2="19"></Line>
      <Line x1="5" y1="12" x2="19" y2="12"></Line>
    </Svg>
  ),
  X: ({ color, size }: { color: string; size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Line x1="18" y1="6" x2="6" y2="18"></Line>
      <Line x1="6" y1="6" x2="18" y2="18"></Line>
    </Svg>
  ),
};

// Removed custom wrappers as we now import them directly

type PreviewWebViewAddressBarProps = {
  value: string;
  onChangeText: (next: string) => void;
  onSubmit: () => void;
  onReload: () => void;
  resolvedUrl: string;
  loading: boolean;
  theme: DesignTheme;
  insetsTop: number;
};

export function PreviewWebViewAddressBar({
  value,
  onChangeText,
  onSubmit,
  onReload,
  resolvedUrl,
  loading,
  theme,
  insetsTop,
}: PreviewWebViewAddressBarProps) {
  const inputStyle =
    Platform.OS === "web"
      ? {
        whiteSpace: "nowrap" as const,
        overflowX: "auto" as const,
      }
      : {};

  return (
    <Box
      style={{
        backgroundColor: theme.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        paddingHorizontal: 16,
        paddingBottom: 12,
        paddingTop: insetsTop > 0 ? insetsTop : 16,
      }}
    >
      <Box style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surfaceAlt, borderRadius: 12, height: 48, paddingHorizontal: 12 }}>
        <Box style={{ marginRight: 8 }}>
          <Icons.Lock color={theme.colors.textSecondary} size={16} />
        </Box>
        <Input variant="outline" size="md" style={{ flex: 1, minWidth: 0, borderWidth: 0, backgroundColor: "transparent", height: "100%", paddingHorizontal: 0 }}>
          <InputField
            value={value}
            onChangeText={onChangeText}
            placeholder="Search or enter website name"
            placeholderTextColor={theme.colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
            selectTextOnFocus
            style={{
              fontSize: 15,
              fontWeight: "500",
              color: theme.colors.textPrimary,
              textAlign: "center",
              paddingVertical: 0,
              paddingHorizontal: 0,
              ...inputStyle,
            }}
          />
        </Input>
        <Pressable
          style={{ marginLeft: 8, height: 32, width: 32, alignItems: "center", justifyContent: "center", borderRadius: 16 }}
          onPress={onReload}
          disabled={loading && !!resolvedUrl}
          accessibilityLabel="Reload"
          accessibilityRole="button"
        >
          {loading && !!resolvedUrl ? (
            <Spinner size="small" color={theme.colors.textSecondary} />
          ) : (
            <Icons.Refresh color={theme.colors.textSecondary} size={18} />
          )}
        </Pressable>
      </Box>
    </Box>
  );
}

export function PreviewWebViewPlaceholder({ theme }: { theme: DesignTheme }) {
  return (
    <Box style={{ flex: 1, alignItems: "center", paddingTop: 64, paddingHorizontal: 24, backgroundColor: theme.colors.surface }}>
      <Box style={{ width: 256, height: 256, borderRadius: 128, backgroundColor: theme.mode === 'dark' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.05)', alignItems: "center", justifyContent: "center", marginBottom: 32 }}>
        <Box style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.accent, alignItems: "center", justifyContent: "center" }}>
          <Icons.Globe color="#000" size={32} />
        </Box>
      </Box>
    </Box>
  );
}

export function PreviewWebViewBottomBar({
  onBack,
  onForward,
  onHome,
  tabCount,
  onShowTabs,
  onMenu,
  theme,
  canGoBack,
  canGoForward
}: {
  onBack: () => void;
  onForward: () => void;
  onHome: () => void;
  tabCount: number;
  onShowTabs: () => void;
  onMenu: () => void;
  theme: DesignTheme;
  canGoBack: boolean;
  canGoForward: boolean;
}) {
  const bottomBarStyles = StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 24,
      minHeight: 64,
      backgroundColor: theme.colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    iconButton: {
      padding: 8,
    },
    centerButtonShell: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 2,
      borderColor: theme.colors.accent,
      shadowColor: theme.colors.accent,
      shadowOpacity: theme.mode === 'dark' ? 0.3 : 0.2,
      shadowRadius: 10,
      elevation: 6,
    },
    tabsButton: {
      padding: 8,
      position: "relative",
    },
    tabsBadge: {
      position: "absolute",
      top: 0,
      right: 0,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: theme.colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
  });

  return (
    <Box style={bottomBarStyles.container}>
      <Pressable style={bottomBarStyles.iconButton} onPress={onBack} disabled={!canGoBack}>
        <Icons.ChevronLeft color={canGoBack ? theme.colors.textSecondary : theme.colors.border} size={24} />
      </Pressable>
      <Pressable style={bottomBarStyles.iconButton} onPress={onForward} disabled={!canGoForward}>
        <Icons.ChevronRight color={canGoForward ? theme.colors.textSecondary : theme.colors.border} size={24} />
      </Pressable>
      <Box style={bottomBarStyles.centerButtonShell}>
        <Pressable onPress={onHome} style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center", borderRadius: 28 }}>
          <Icons.Home color={theme.colors.accent} size={24} />
        </Pressable>
      </Box>
      <Pressable style={bottomBarStyles.tabsButton} onPress={onShowTabs}>
        <Icons.Layers color={theme.colors.textSecondary} size={24} />
        <Box style={bottomBarStyles.tabsBadge}>
          <Text style={{ fontSize: 10, color: '#000', fontWeight: 'bold' }}>{String(tabCount)}</Text>
        </Box>
      </Pressable>
      <Pressable style={bottomBarStyles.iconButton} onPress={onMenu}>
        <Icons.MoreVertical color={theme.colors.textSecondary} size={24} />
      </Pressable>
    </Box>
  );
}

export function PreviewWebViewTabsPage({
  tabs,
  activeIndex,
  onSelectTab,
  onCloseTab,
  onAddTab,
  onDone,
  insetsTop,
  theme
}: {
  tabs: { id: string, url: string }[];
  activeIndex: number;
  onSelectTab: (index: number) => void;
  onCloseTab: (index: number) => void;
  onAddTab: () => void;
  onDone: () => void;
  insetsTop: number;
  theme: DesignTheme;
}) {
  return (
    <Box style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header */}
      <Box
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: theme.colors.surface, paddingTop: insetsTop > 0 ? insetsTop : 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}
      >
        <Pressable onPress={onDone} style={{ padding: 8, marginLeft: -8 }}>
          <Text style={{ fontSize: 17, color: theme.colors.accent, fontWeight: '600' }}>Tabs</Text>
        </Pressable>
        <Text style={{ fontSize: 17, color: theme.colors.textPrimary, fontWeight: 'bold' }}>Vibe Coding Everywhere</Text>
        <Pressable onPress={onDone} style={{ padding: 8, marginRight: -8 }}>
          <Text style={{ fontSize: 17, color: theme.colors.accent, fontWeight: '600' }}>Done</Text>
        </Pressable>
      </Box>

      {/* Grid */}
      <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}>
        <Box style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {tabs.map((tab, i) => {
            const domain = tab.url ? tab.url.replace(/^https?:\/\//, '').split('/')[0] : 'New Tab';
            const isActive = i === activeIndex;
            return (
              <Box
                key={tab.id}
                style={{
                  width: '48%',
                  backgroundColor: theme.colors.surface,
                  borderRadius: 16,
                  overflow: 'hidden',
                  marginBottom: 16,
                  borderWidth: isActive ? 2 : 1,
                  borderColor: isActive ? theme.colors.accent : theme.colors.border,
                }}
              >
                <Pressable onPress={() => onSelectTab(i)} style={{ flex: 1 }}>
                  <Box style={{ height: 128, backgroundColor: theme.colors.surfaceAlt, width: '100%', position: 'relative' }}>
                    {/* Placeholder image for tab content based on URL */}
                    <Box style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                      <Pressable onPress={(e) => { e.stopPropagation(); onCloseTab(i); }}>
                        <Icons.X color="#fff" size={14} />
                      </Pressable>
                    </Box>
                  </Box>
                  <Box style={{ height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, backgroundColor: theme.colors.surface }}>
                    <Box style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.surfaceAlt, marginRight: 8, alignItems: 'center', justifyContent: 'center' }}>
                      <Icons.Globe color={theme.colors.textSecondary} size={12} />
                    </Box>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: theme.colors.textPrimary, flex: 1 }} numberOfLines={1}>{domain}</Text>
                  </Box>
                </Pressable>
              </Box>
            );
          })}
        </Box>
        <Box style={{ height: 96 }} />
      </ScrollView>

      {/* Floating Action Button */}
      <Pressable
        style={{
          position: 'absolute', bottom: 80, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center', shadowColor: theme.colors.accent, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6
        }}
        onPress={onAddTab}
      >
        <Icons.Plus color="#000" size={28} />
      </Pressable>

      {/* Tab Nav */}
      <Box style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 8, height: 64, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
        <Pressable style={{ padding: 12, alignItems: 'center' }} onPress={() => onSelectTab(activeIndex)}>
          <Icons.Home color={theme.colors.textSecondary} size={22} />
        </Pressable>
        <Pressable style={{ padding: 12, alignItems: 'center' }}>
          <Icons.Search color={theme.colors.textSecondary} size={22} />
        </Pressable>
        <Pressable style={{ padding: 12, alignItems: 'center' }}>
          <Icons.History color={theme.colors.textSecondary} size={22} />
        </Pressable>
        <Pressable style={{ padding: 12, alignItems: 'center' }}>
          <Icons.Bookmark color={theme.colors.textSecondary} size={22} />
        </Pressable>
        <Pressable style={{ padding: 12, alignItems: 'center' }}>
          <Icons.Layers color={theme.colors.accent} size={22} />
        </Pressable>
      </Box>
    </Box>
  );
}
