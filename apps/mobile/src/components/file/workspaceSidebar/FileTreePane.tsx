import React from "react";

import { Box } from "@/components/ui/box";
import { Input, InputField } from "@/components/ui/input";
import { ScrollView } from "@/components/ui/scroll-view";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/theme/index";

export type WorkspaceTreeItem = {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: WorkspaceTreeItem[];
};

type FileTreePaneProps = {
  theme: ReturnType<typeof useTheme>;
  root?: string;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  loading: boolean;
  hasData: boolean;
  filteredTree: WorkspaceTreeItem[];
  renderItem: (item: WorkspaceTreeItem, depth: number) => React.ReactNode;
};

export function FileTreePane({
  theme,
  root,
  searchQuery,
  onSearchQueryChange,
  loading,
  hasData,
  filteredTree,
  renderItem,
}: FileTreePaneProps) {
  const paneSurface = theme.mode === "dark" ? "rgba(8, 12, 22, 0.2)" : "rgba(255, 255, 255, 0.4)";
  const paneBorder = theme.mode === "dark" ? "rgba(162, 210, 255, 0.15)" : "rgba(0,0,0,0.08)";
  const inputBg = theme.mode === "dark" ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)";

  return (
    <>
      <Box className="py-1.5 px-3.5" style={{ backgroundColor: paneSurface }}>
        <Text
          className="text-sm leading-5 font-medium"
          style={{ color: theme.colors.textPrimary }}
          numberOfLines={2}
        >
          {root ?? "Workspace"}
        </Text>
      </Box>
      <Box className="px-3 pt-1 pb-3 border-b" style={{ backgroundColor: paneSurface, borderBottomColor: paneBorder }}>
        <Input
          variant="outline"
          size="md"
          className="flex-1 rounded-xl"
          style={{ backgroundColor: inputBg, borderColor: paneBorder }}
        >
          <InputField
            placeholder="Search files..."
            placeholderTextColor={theme.colors.textSecondary}
            value={searchQuery}
            onChangeText={onSearchQueryChange}
            returnKeyType="search"
            style={{ color: theme.colors.textPrimary }}
          />
        </Input>
      </Box>
      {loading && !hasData ? (
        <Box className="flex-1 items-center justify-center py-6" style={{ backgroundColor: paneSurface }}>
          <Spinner size="small" color={theme.colors.accent} />
        </Box>
      ) : (
        <ScrollView
          className="flex-1 min-h-0"
          style={{ backgroundColor: paneSurface }}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          {filteredTree.map((item) => renderItem(item, 0))}
        </ScrollView>
      )}
    </>
  );
}
