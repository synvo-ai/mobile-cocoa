import React, { useMemo, useState } from "react";
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
  setProvider: (p: BrandProvider) => void;
};

export function ThemeSessionState({ children }: ThemeSessionStateProps) {
  const [provider, setProvider] = useState<BrandProvider>("codex");

  // ── Dynamic model config from server (/api/models) ──
  const { modelsForProvider, defaultModelForProvider } = useModelsConfig();

  const [model, setModel] = useState<string>(() => defaultModelForProvider(provider));

  const systemColorScheme = useColorScheme();
  const resolvedSystemMode = systemColorScheme === "dark" ? "dark" : "light";
  const themeMode = useMemo(() => getThemeMode("light", resolvedSystemMode), [resolvedSystemMode]);
  const theme = useMemo(() => buildTheme(provider, themeMode), [provider, themeMode]);
  const styles = useMemo(() => createAppStyles(theme), [theme]);

  const modelOptions = useMemo(() => modelsForProvider(provider), [modelsForProvider, provider]);

  const providerModelOptions = useMemo(() => {
    const out: Record<string, ModelOption[]> = {};
    for (const p of ["claude", "gemini", "codex"]) {
      out[p] = modelsForProvider(p);
    }
    return out;
  }, [modelsForProvider]);

  const permissionModeUI = useMemo(() => getDefaultPermissionModeUI(), []);

  return children({
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
  });
}
