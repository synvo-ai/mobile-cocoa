/**
 * Skill configuration and management panel.
 */
import { ChevronRightIcon, CloseIcon } from "@/components/icons/ChatActionIcons";
import { getCategoryIcon } from "@/components/icons/SkillCategoryIcons";
import { SkillDetailSheet } from "@/components/settings/SkillDetailSheet";
import { Modal } from "@/components/ui/modal";
import { Box } from "@/components/ui/box";
import { Button, ButtonText } from "@/components/ui/button";
import { Input, InputField } from "@/components/ui/input";
import { Textarea, TextareaInput } from "@/components/ui/textarea";
import { Pressable } from "@/components/ui/pressable";
import { ScrollView } from "@/components/ui/scroll-view";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { showAlert } from "@/components/ui/alert/nativeAlert";
import { useTheme } from "@/theme/index";
import {
  type SearchSkillResult,
  type SkillCreateRequest,
  type SkillInstallRequest,
  type SkillMetadata,
  createSkill,
  getSkills,
  getSkillsEnabled,
  installSkill,
  searchSkills,
  setSkillsEnabled,
} from "@/services/server/skillsApi";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView as RNScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CATEGORIES, CATEGORY_COLORS, CATEGORY_COLORS_LIGHT, type Category } from "@/utils/skillColors";

type Skill = SkillMetadata;

type AddFlowTab = "catalog" | "create";

type CreateFormState = {
  name: string;
  id: string;
  category: Category;
  description: string;
  author: string;
  sourceUrl: string;
};

export interface SkillConfigurationViewProps {
  isOpen: boolean;
  onClose: () => void;
  presentation?: "modal" | "inline";
  /** Called when user taps a skill to view details. */
  onSelectSkill?: (skillId: string) => void;
  /** Currently selected skill ID for detail view */
  selectedSkillId?: string | null;
  /** Called when user closes the skill detail overlay */
  onCloseSkillDetail?: () => void;
  /** Base URL for API */
  serverBaseUrl: string;
}

const CREATE_CATEGORY_OPTIONS = CATEGORIES.filter((cat) => cat !== "All");
const SKILL_ID_REGEX = /^(?!-)(?!.*--)[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function SkillConfigurationView({
  isOpen,
  onClose,
  presentation = "modal",
  onSelectSkill,
  selectedSkillId = null,
  onCloseSkillDetail,
  serverBaseUrl,
}: SkillConfigurationViewProps) {
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
  const activeTabColor = isDark ? "#93C5FD" : theme.colors.accent;
  const activePill = isDark ? "rgba(147, 197, 253, 0.18)" : `${theme.colors.accent}22`;
  const colorPalette = isDark ? CATEGORY_COLORS : CATEGORY_COLORS_LIGHT;

  const [skills, setSkills] = useState<Skill[]>([]);
  const [enabledSkillIds, setEnabledSkillIds] = useState<Set<string>>(new Set());
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsSaving, setSkillsSaving] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category>("All");

  const [isAddSkillOpen, setIsAddSkillOpen] = useState(false);
  const [addFlowTab, setAddFlowTab] = useState<AddFlowTab>("catalog");
  const [searchQuery, setSearchQuery] = useState("");
  const searchSource = "find-skills" as const;
  const [searchResults, setSearchResults] = useState<SearchSkillResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchBusyIds, setSearchBusyIds] = useState<Set<string>>(new Set());

  const [createForm, setCreateForm] = useState<CreateFormState>({
    name: "",
    id: "",
    category: "Development",
    description: "",
    author: "",
    sourceUrl: "",
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSaving, setCreateSaving] = useState(false);

  const installedSkillIds = useMemo(() => new Set(skills.map((skill) => skill.id)), [skills]);

  const refreshSkills = useCallback(() => {
    if (!serverBaseUrl) return Promise.resolve();

    setSkillsLoading(true);
    setSkillsError(null);
    return Promise.all([getSkills(serverBaseUrl), getSkillsEnabled(serverBaseUrl)])
      .then(([skillsData, enabledData]) => {
        setSkills(skillsData?.skills ?? []);
        setEnabledSkillIds(new Set(enabledData?.enabledIds ?? []));
      })
      .catch((err) => {
        setSkillsError(err?.message ?? "Failed to load skills");
        setSkills([]);
        setEnabledSkillIds(new Set());
      })
      .finally(() => setSkillsLoading(false));
  }, [serverBaseUrl]);

  const loadSources = useCallback(() => {
    return Promise.resolve();
  }, []);

  const handleSkillToggle = useCallback(
    (skillId: string, enabled: boolean) => {
      const next = new Set(enabledSkillIds);
      if (enabled) {
        next.add(skillId);
      } else {
        next.delete(skillId);
      }

      setEnabledSkillIds(next);
      setSkillsSaving(true);
      return setSkillsEnabled(serverBaseUrl, Array.from(next))
        .then((data) => setEnabledSkillIds(new Set(data?.enabledIds ?? [])))
        .catch(() => setEnabledSkillIds(enabledSkillIds))
        .finally(() => setSkillsSaving(false));
    },
    [enabledSkillIds, serverBaseUrl]
  );

  const handleSearch = useCallback(() => {
    if (!isAddSkillOpen || addFlowTab !== "catalog" || !searchQuery.trim()) {
      setSearchResults([]);
      setSearchError(null);
      return Promise.resolve();
    }



    setSearchLoading(true);
    setSearchError(null);
    const source = "find-skills";

    return searchSkills(serverBaseUrl, {
      q: searchQuery.trim(),
      source,
      limit: 25,
    })
      .then((data) => {
        setSearchResults(data?.skills ?? []);
      })
      .catch((err) => {
        setSearchResults([]);
        setSearchError(err?.message ?? "Failed to search skills");
      })
      .finally(() => setSearchLoading(false));
  }, [addFlowTab, isAddSkillOpen, searchQuery, searchSource, serverBaseUrl]);

  useEffect(() => {
    if (!isOpen || !serverBaseUrl) return;
    void refreshSkills();
  }, [isOpen, serverBaseUrl, refreshSkills]);

  useEffect(() => {
    if (!isAddSkillOpen) {
      setSearchResults([]);
      setSearchError(null);
      setSearchQuery("");
      return;
    }

    void loadSources();
  }, [isAddSkillOpen, loadSources]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (addFlowTab === "catalog") {
        void handleSearch();
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [addFlowTab, handleSearch]);

  const resetCreateForm = useCallback(() => {
    setCreateForm({
      name: "",
      id: "",
      category: "Development",
      description: "",
      author: "",
      sourceUrl: "",
    });
    setCreateError(null);
  }, []);

  const closeAddSkillModal = useCallback(() => {
    setIsAddSkillOpen(false);
    setCreateError(null);
    setSearchError(null);
    setSearchResults([]);
    setSearchBusyIds(new Set());
    setSearchQuery("");
  }, []);

  const openAddSkillModal = useCallback(() => {
    setAddFlowTab("catalog");
    setIsAddSkillOpen(true);
    setSearchError(null);
    setSearchResults([]);
    setSearchBusyIds(new Set());
    setSearchQuery("");
  }, []);

  const handleInstallAction = useCallback(
    async (item: SearchSkillResult) => {
      if (!serverBaseUrl) return;

      const id = item.id;
      const alreadyInstalled = installedSkillIds.has(id);
      const alreadyEnabled = enabledSkillIds.has(id);

      setSearchBusyIds((prev) => new Set(prev).add(id));
      try {
        if (alreadyInstalled) {
          if (!alreadyEnabled) {
            await handleSkillToggle(id, true);
            showAlert("Skill enabled", `${item.name} is now enabled.`);
          } else {
            showAlert("Skill already installed", `${item.name} is already installed and enabled.`);
          }
          return;
        }

        const payload: SkillInstallRequest = { source: "find-skills", skillId: id, autoEnable: true };

        const result = await installSkill(serverBaseUrl, payload);
        showAlert("Skill added", result.message || `${item.name} installed`);
        if (result.enabledIds?.length) {
          setEnabledSkillIds(new Set(result.enabledIds));
        }
        await refreshSkills();
      } catch (err) {
        showAlert("Failed to add skill", err instanceof Error ? err.message : "Unknown error");
      } finally {
        setSearchBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [handleSkillToggle, installedSkillIds, refreshSkills, serverBaseUrl, enabledSkillIds]
  );

  const handleCreateSubmit = useCallback(async () => {
    if (!serverBaseUrl) return;

    const name = createForm.name.trim();
    const id = createForm.id.trim().toLowerCase();
    const category = createForm.category;

    if (!name || !id || !category) {
      setCreateError("Name, ID, and category are required.");
      return;
    }

    if (!SKILL_ID_REGEX.test(id)) {
      setCreateError("ID must be lowercase slug format (letters, digits, single dashes). Example: my-skill");
      return;
    }

    const payload: SkillCreateRequest = {
      name,
      id,
      category,
      description: createForm.description.trim(),
      author: createForm.author.trim() || undefined,
      repoUrl: createForm.sourceUrl.trim() || undefined,
      autoEnable: true,
    };

    setCreateError(null);
    setCreateSaving(true);
    try {
      const result = await createSkill(serverBaseUrl, payload);
      if (result.enabledIds?.length) {
        setEnabledSkillIds(new Set(result.enabledIds));
      }
      showAlert("Skill created", result.message || `${name} created`);
      await refreshSkills();
      closeAddSkillModal();
      resetCreateForm();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create skill");
    } finally {
      setCreateSaving(false);
    }
  }, [closeAddSkillModal, createForm, refreshSkills, resetCreateForm, serverBaseUrl]);

  const filteredSkills =
    selectedCategory === "All"
      ? skills
      : skills.filter((skill) => (skill.category ?? "Development") === selectedCategory);

  const categoryCounts: Record<Category, number> = {
    All: skills.length,
    Development: skills.filter((skill) => (skill.category ?? "Development") === "Development").length,
    "UI/UX": skills.filter((skill) => skill.category === "UI/UX").length,
    DevOps: skills.filter((skill) => skill.category === "DevOps").length,
    Debug: skills.filter((skill) => skill.category === "Debug").length,
    Prompt: skills.filter((skill) => skill.category === "Prompt").length,
  };

  const safeStyle = {
    paddingTop: Math.max(insets.top, 4),
    paddingBottom: Math.max(insets.bottom, 8),
  };

  const detailOverlayStyle = {
    paddingTop: 0,
    paddingBottom: 0,
  };

  const showDetailOverlay = Boolean(selectedSkillId);

  const renderSearchResults = (
    <>
      {searchLoading ? (
        <Spinner size="small" color={theme.colors.accent} />
      ) : searchError ? (
        <Text className="text-sm text-error-500 mt-2">{searchError}</Text>
      ) : searchResults.length === 0 ? (
        <Text className="text-sm mt-1" style={{ color: mutedColor }}>
          {searchQuery.trim().length === 0
            ? "Type at least one character to search"
            : "No skills found in catalog."}
        </Text>
      ) : (
        searchResults.map((skill) => {
          const isBusy = searchBusyIds.has(skill.id);
          const isInstalled = installedSkillIds.has(skill.id);
          const isEnabled = isInstalled && enabledSkillIds.has(skill.id);
          const actionLabel = !isInstalled ? "Install" : isEnabled ? "Installed" : "Enable";
          const buttonDisabled = isBusy || skillsSaving;

          return (
            <Box
              key={skill.id}
              className="border rounded-xl p-3.5 mb-3"
              style={{ borderColor: panelBorder, backgroundColor: cardSurface }}
            >
              <Box className="flex-row items-start justify-between gap-2">
                <Box className="flex-1">
                  <Text className="text-sm font-semibold" style={{ color: bodyColor }}>
                    {skill.name}
                  </Text>
                  {skill.description ? (
                    <Text className="text-xs mt-1" style={{ color: mutedColor }}>
                      {skill.description}
                    </Text>
                  ) : null}
                  <Text className="text-xs mt-1" style={{ color: mutedColor }}>
                    {skill.source}
                    {skill.repoUrl ? ` · ${skill.repoUrl}` : ""}
                    {skill.sourceRef ? ` · ${skill.sourceRef}` : ""}
                  </Text>
                </Box>
                <Button
                  size="xs"
                  action="default"
                  onPress={() => {
                    void handleInstallAction(skill);
                  }}
                  isDisabled={buttonDisabled}
                >
                  <ButtonText>{buttonDisabled ? "..." : actionLabel}</ButtonText>
                </Button>
              </Box>
              {isInstalled && skill.path ? (
                <Text className="text-xs mt-2" style={{ color: mutedColor }}>
                  {`Path: ${skill.path}`}
                </Text>
              ) : null}
            </Box>
          );
        })
      )}
    </>
  );

  const renderCreateForm = (
    <>
      {createError ? <Text className="text-sm text-error-500 mb-3">{createError}</Text> : null}
      <Text className="text-xs text-typography-600 mb-1">Name</Text>
      <Input className="h-11 mb-3">
        <InputField
          placeholder="Enter display name"
          value={createForm.name}
          onChangeText={(value) => setCreateForm((prev) => ({ ...prev, name: value }))}
          autoCorrect={false}
        />
      </Input>

      <Text className="text-xs text-typography-600 mb-1">Skill ID (slug)</Text>
      <Input className="h-11 mb-3">
        <InputField
          placeholder="my-skill-id"
          value={createForm.id}
          onChangeText={(value) => setCreateForm((prev) => ({ ...prev, id: value.toLowerCase() }))}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Input>

      <Text className="text-xs text-typography-600 mb-1">Category</Text>
      <RNScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {CREATE_CATEGORY_OPTIONS.map((category) => {
          const selected = createForm.category === category;
          return (
            <Pressable
              key={category}
              onPress={() => setCreateForm((prev) => ({ ...prev, category }))}
              className="px-3 py-2 rounded-full border"
              style={{
                borderColor: selected ? activeTabColor : panelBorder,
                backgroundColor: selected ? activePill : "transparent",
              }}
            >
              <Text style={{ color: selected ? activeTabColor : mutedColor }}>{category}</Text>
            </Pressable>
          );
        })}
      </RNScrollView>

      <Text className="text-xs text-typography-600 mb-1">Description</Text>
      <Textarea className="mb-3">
        <TextareaInput
          placeholder="Short description"
          value={createForm.description}
          onChangeText={(value) => setCreateForm((prev) => ({ ...prev, description: value }))}
          multiline
          numberOfLines={4}
        />
      </Textarea>

      <Input className="h-11 mb-3">
        <InputField
          placeholder="Author (optional)"
          value={createForm.author}
          onChangeText={(value) => setCreateForm((prev) => ({ ...prev, author: value }))}
        />
      </Input>

      <Input className="h-11 mb-4">
        <InputField
          placeholder="Source URL (optional)"
          value={createForm.sourceUrl}
          onChangeText={(value) => setCreateForm((prev) => ({ ...prev, sourceUrl: value }))}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Input>

      <Button onPress={handleCreateSubmit} isDisabled={createSaving} action={createSaving ? "default" : "primary"}>
        <ButtonText>{createSaving ? "Creating..." : "Create Skill"}</ButtonText>
      </Button>
    </>
  );

  const content = (
    <Box className="flex-1 overflow-hidden" style={{ backgroundColor: pageSurface }}>
      {showDetailOverlay ? (
        <Box className="flex-1" style={detailOverlayStyle}>
          <SkillDetailSheet
            embedded
            isOpen
            skillId={selectedSkillId!}
            serverBaseUrl={serverBaseUrl}
            onClose={onCloseSkillDetail ?? (() => { })}
          />
        </Box>
      ) : (
        <Box className="flex-1" style={safeStyle}>
          <Box
            className="flex-row items-center justify-between py-4 px-5 border-b"
            style={{ borderBottomColor: panelBorder, backgroundColor: headerSurface }}
          >
            <Text className="text-lg font-semibold" style={{ color: titleColor }}>
              Skill Configuration
            </Text>
            <Box className="flex-row items-center" style={{ gap: 8 }}>
              <Button
                size="xs"
                action="default"
                variant="outline"
                onPress={openAddSkillModal}
              >
                <ButtonText>+ Add Skill</ButtonText>
              </Button>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityLabel="Close skill configuration"
                className="p-2 min-w-11 min-h-11 items-center justify-center"
              >
                <CloseIcon size={20} color={mutedColor} />
              </Pressable>
            </Box>
          </Box>

          <Box
            className="relative z-10"
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
              {CATEGORIES.map((cat) => {
                const isActive = selectedCategory === cat;
                const colors = colorPalette[cat];
                const count = categoryCounts[cat];

                return (
                  <Pressable
                    key={cat}
                    onPress={() => setSelectedCategory(cat)}
                    accessibilityLabel={`Filter by ${cat}`}
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
                    {getCategoryIcon(cat, {
                      color: isActive ? colors.text : mutedColor,
                      size: 14,
                      strokeWidth: isActive ? 2.5 : 2,
                    })}
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: isActive ? "700" : "500",
                        color: isActive ? colors.text : mutedColor,
                        letterSpacing: -0.2,
                      }}
                    >
                      {cat}
                    </Text>
                    {count > 0 && (
                      <Box
                        style={{
                          backgroundColor: isActive ? `${colors.text}22` : (isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)"),
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
                            fontWeight: "700",
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
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            <Text className="text-sm mb-5 leading-5" style={{ color: mutedColor }}>
              Enable skills for Pi agent. When enabled, skill content is included in the prompt.
            </Text>

            {skillsLoading ? (
              <Spinner size="small" color={theme.colors.accent} style={{ marginTop: 16 }} />
            ) : skillsError ? (
              <Text className="text-sm text-error-500 mt-4">{skillsError}</Text>
            ) : filteredSkills.length === 0 ? (
              <Text className="text-sm mt-4" style={{ color: mutedColor }}>
                {skills.length === 0 ? "No skills found in project skills folder." : `No skills in "${selectedCategory}" category.`}
              </Text>
            ) : (
              filteredSkills.map((skill) => {
                const catColors = colorPalette[(skill.category as Category) ?? "Development"];
                const isEnabled = enabledSkillIds.has(skill.id);

                return (
                  <Box
                    key={skill.id}
                    className="flex-row items-center justify-between py-3.5 px-4 rounded-xl border mb-2.5"
                    style={{ backgroundColor: cardSurface, borderColor: panelBorder }}
                  >
                    <Pressable
                      onPress={() => onSelectSkill?.(skill.id)}
                      hitSlop={{ top: 12, bottom: 12, left: 0, right: 12 }}
                      accessibilityLabel={`${skill.name}. View details`}
                      accessibilityHint="Opens skill details"
                      accessibilityRole="button"
                      className="flex-1 flex-row items-center mr-3"
                      style={({ pressed }) =>
                        pressed ? { backgroundColor: pressedSurface, borderRadius: 10 } : undefined
                      }
                    >
                      <Box className="flex-1 mr-2 min-w-0">
                        <Box style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text className="text-[15px] font-semibold" style={{ color: bodyColor }}>
                            {skill.name}
                          </Text>
                          {selectedCategory === "All" && skill.category && (
                            <Box
                              style={{
                                backgroundColor: catColors.active,
                                borderRadius: 8,
                                paddingHorizontal: 6,
                                paddingVertical: 1,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: "600",
                                  color: catColors.text,
                                  letterSpacing: -0.2,
                                }}
                              >
                                {skill.category}
                              </Text>
                            </Box>
                          )}
                        </Box>
                        {skill.description ? (
                          <Text className="text-xs mt-1 leading-4" style={{ color: mutedColor }} numberOfLines={2}>
                            {skill.description}
                          </Text>
                        ) : null}
                      </Box>
                      <ChevronRightIcon size={18} color={mutedColor} />
                    </Pressable>
                    <Switch
                      value={isEnabled}
                      onValueChange={(val) => handleSkillToggle(skill.id, val)}
                      disabled={skillsSaving}
                      accessibilityLabel={`Enable ${skill.name}`}
                      trackColor={{
                        false: isDark ? "rgba(255, 255, 255, 0.25)" : "rgba(15, 23, 42, 0.2)",
                        true: isDark ? `${catColors.text}66` : `${catColors.text}55`,
                      }}
                      thumbColor={
                        isEnabled
                          ? catColors.text
                          : isDark
                            ? "rgba(226, 238, 252, 0.9)"
                            : "#F8FAFC"
                      }
                    />
                  </Box>
                );
              })
            )}
          </ScrollView>
        </Box>
      )}
    </Box>
  );

  const addSkillModal = isAddSkillOpen ? (
    <Modal isOpen={isAddSkillOpen} onClose={closeAddSkillModal} size="full">
      <Box className="h-full w-full" style={[safeStyle, { backgroundColor: pageSurface }]}>
        <Box
          className="flex-row items-center justify-between px-4 py-3 border-b"
          style={{ borderBottomColor: panelBorder, backgroundColor: headerSurface }}
        >
          <Text className="text-lg font-semibold" style={{ color: titleColor }}>
            Add Skill
          </Text>
          <Pressable
            onPress={closeAddSkillModal}
            hitSlop={12}
            accessibilityLabel="Close add skill"
            className="p-2"
          >
            <CloseIcon size={20} color={mutedColor} />
          </Pressable>
        </Box>

        <Box className="flex-row border-b" style={{ borderBottomColor: panelBorder }}>
          <Pressable
            onPress={() => setAddFlowTab("catalog")}
            className="px-4 py-3"
            style={{
              borderBottomWidth: addFlowTab === "catalog" ? 2 : 0,
              borderBottomColor: addFlowTab === "catalog" ? activeTabColor : "transparent",
            }}
          >
            <Text style={{ color: addFlowTab === "catalog" ? activeTabColor : mutedColor }}>Install from Catalog</Text>
          </Pressable>
          <Pressable
            onPress={() => setAddFlowTab("create")}
            className="px-4 py-3"
            style={{
              borderBottomWidth: addFlowTab === "create" ? 2 : 0,
              borderBottomColor: addFlowTab === "create" ? activeTabColor : "transparent",
            }}
          >
            <Text style={{ color: addFlowTab === "create" ? activeTabColor : mutedColor }}>Create Skill</Text>
          </Pressable>
        </Box>

        <ScrollView className="flex-1 px-4 py-4" contentContainerStyle={{ paddingBottom: 48 }}>
          {addFlowTab === "catalog" ? (
            <>


              <Input className="h-11 mb-2">
                <InputField
                  placeholder="Search catalog skills"
                  value={searchQuery}
                  onChangeText={(value) => setSearchQuery(value)}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </Input>

              {renderSearchResults}
            </>
          ) : (
            renderCreateForm
          )}
        </ScrollView>
      </Box>
    </Modal>
  ) : null;

  if (!isOpen) return null;

  const output = (
    <>
      {content}
      {addSkillModal}
    </>
  );

  if (presentation === "inline") {
    return output;
  }

  return output;
}
