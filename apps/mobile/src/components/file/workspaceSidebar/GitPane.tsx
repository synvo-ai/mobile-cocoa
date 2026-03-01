import React from "react";

import type { SidebarTab } from "@/components/hooks/useSidebarState";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";

type GitPaneStyles = {
  scroll: any;
  scrollContent: any;
  emptyText: any;
};

type GitPaneProps = {
  activeTab: SidebarTab;
  styles: GitPaneStyles;
  renderChangesTab: () => React.ReactNode;
  renderCommitsTab: () => React.ReactNode;
};

export function GitPane({
  activeTab,
  styles,
  renderChangesTab,
  renderCommitsTab,
}: GitPaneProps) {
  if (activeTab === "commits") return <>{renderCommitsTab()}</>;
  if (activeTab === "changes") return <>{renderChangesTab()}</>;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.emptyText}>Select a Git tab</Text>
    </ScrollView>
  );
}
