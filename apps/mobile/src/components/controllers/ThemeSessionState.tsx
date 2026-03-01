import React, { memo, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

import { createAppStyles } from "@/components/styles/appStyles";
import type { ModelOption, Provider as BrandProvider } from "@/core/modelOptions";
import {
  getDefaultPermissionModeUI,
  getThemeMode
} from "@/features/app/appConfig";
import { useModelsConfig } from "@/hooks/useModelsConfig";
import { buildTheme, getTheme } from "@/theme/index";
import type { PermissionModeUI } from "@/utils/permission";

export type ThemeSessionStateProps = {
  children: (state: ThemeSessionStateState) => React.ReactNode;
};

export type ThemeSessionStateState = {
  model: string;
  setModel: (model: string) => void;
  themeMode: ReturnType<typeof getThemeMode>;
  theme: ReturnType<typeof getTheme>;
  styles: ReturnType<typeof createAppStyles>;
  modelOptions: ModelOption[];
  providerModelOptions: Record<string, ModelOption[]>;
  permissionModeUI: PermissionModeUI;
  provider: BrandProvider;
  setProvider: (provider: BrandProvider) => void;
};

export const ThemeSessionState = memo(function ThemeSessionState({ children }: ThemeSessionStateProps) {
  const [provider, setProvider] = useState<BrandProvider>("codex");

  // ── Dynamic model config from server (/api/models) ──
  const { modelsForProvider, defaultModelForProvider } = useModelsConfig();
  const providerDefaultModel = useMemo(() => defaultModelForProvider(provider), [defaultModelForProvider, provider]);

  const [model, setModel] = useState<string>(() => defaultModelForProvider(provider));

  const systemColorScheme = useColorScheme();
  const resolvedSystemMode = systemColorScheme === "dark" ? "dark" : "light";
  const themeMode = useMemo(() => getThemeMode("light", resolvedSystemMode), [resolvedSystemMode]);
  const theme = useMemo(() => buildTheme(provider, themeMode), [provider, themeMode]);
  const styles = useMemo(() => createAppStyles(theme), [theme]);

  const modelOptions = useMemo(() => modelsForProvider(provider), [modelsForProvider, provider]);

  const providerModelOptions = useMemo(() => {
    const out: Record<string, ModelOption[]> = {};
    for (const providerId of ["claude", "gemini", "codex"]) {
      out[providerId] = modelsForProvider(providerId);
    }
    return out;
  }, [modelsForProvider]);

  useEffect(() => {
    const options = modelsForProvider(provider);
    const isCurrentModelValid = options.some((option) => option.value === model);
    const isDefaultModelValid = providerDefaultModel
      ? options.some((option) => option.value === providerDefaultModel)
      : false;
    const fallbackModel = isDefaultModelValid ? providerDefaultModel : options[0]?.value;

    if (!isCurrentModelValid && fallbackModel && fallbackModel !== model) {
      setModel(fallbackModel);
    }
  }, [provider, model, modelsForProvider, providerDefaultModel]);

  const permissionModeUI = useMemo(() => getDefaultPermissionModeUI(), []);

  const state = useMemo(
    () => ({
      provider,
      setProvider,
      model,
      setModel,
      themeMode,
      theme,
      styles,
      modelOptions,
      providerModelOptions,
      permissionModeUI,
    }),
    [provider, setProvider, model, setModel, themeMode, theme, styles, modelOptions, providerModelOptions, permissionModeUI]
  );

  return children(state);
});
