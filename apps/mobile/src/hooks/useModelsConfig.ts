/**
 * React hook that loads models from the server (/api/models) at mount time.
 *
 * Usage:
 *   const { loading, error, config, modelsForProvider, defaultModelForProvider, refresh } = useModelsConfig();
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { ModelsConfig, ModelOption } from "@/services/server/modelsApi";
import {
  fetchModelsConfig,
  getModelsConfigSync,
  invalidateModelsCache,
} from "@/services/server/modelsApi";

interface UseModelsConfigResult {
  loading: boolean;
  error: Error | null;
  config: ModelsConfig;
  modelsForProvider: (provider: string) => ModelOption[];
  defaultModelForProvider: (provider: string) => string;
  refresh: () => Promise<void>;
}

export function useModelsConfig(): UseModelsConfigResult {
  const [config, setConfig] = useState<ModelsConfig>(getModelsConfigSync);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchModelsConfig()
      .then((cfg) => {
        if (!cancelled) {
          setConfig(cfg);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const modelsForProvider = useCallback(
    (provider: string): ModelOption[] => {
      return config.providers[provider]?.models ?? [];
    },
    [config],
  );

  const defaultModelForProvider = useCallback(
    (provider: string): string => {
      return config.providers[provider]?.defaultModel ?? "";
    },
    [config],
  );

  /** Force a re-fetch from the server. */
  const refresh = useCallback(async () => {
    invalidateModelsCache();
    setLoading(true);
    setError(null);
    try {
      const cfg = await fetchModelsConfig();
      if (isMountedRef.current) {
        setConfig(cfg);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  return { loading, error, config, modelsForProvider, defaultModelForProvider, refresh };
}
