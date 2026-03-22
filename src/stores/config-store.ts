import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { AppConfig, ApiProvider } from "@/types";
import { configService } from "@/services/config-service";

interface ConfigState {
  /** 全局配置 */
  config: AppConfig | null;
  /** 是否正在加载 */
  loading: boolean;

  /** 加载全局配置 */
  loadConfig: () => Promise<void>;
  /** 添加 API 厂商 */
  addProvider: (provider: Omit<ApiProvider, "id">) => Promise<ApiProvider>;
  /** 更新 API 厂商 */
  updateProvider: (
    id: string,
    updates: Partial<Omit<ApiProvider, "id">>
  ) => Promise<void>;
  /** 删除 API 厂商 */
  removeProvider: (id: string) => Promise<void>;
  /** 设置当前激活的厂商和模型 */
  setActiveProvider: (providerId: string, model: string) => Promise<void>;
}

export const useConfigStore = create<ConfigState>()(
  immer((set) => ({
    config: null,
    loading: false,

    loadConfig: async () => {
      set((state) => {
        state.loading = true;
      });
      try {
        const config = await configService.getConfig();
        set((state) => {
          state.config = config;
        });
      } finally {
        set((state) => {
          state.loading = false;
        });
      }
    },

    addProvider: async (provider) => {
      const newProvider = await configService.addProvider(provider);
      set((state) => {
        if (state.config) {
          state.config.providers.push(newProvider);
        }
      });
      return newProvider;
    },

    updateProvider: async (id, updates) => {
      const updated = await configService.updateProvider(id, updates);
      set((state) => {
        if (state.config) {
          const index = state.config.providers.findIndex((p) => p.id === id);
          if (index !== -1) {
            state.config.providers[index] = updated;
          }
        }
      });
    },

    removeProvider: async (id) => {
      await configService.removeProvider(id);
      set((state) => {
        if (state.config) {
          state.config.providers = state.config.providers.filter(
            (p) => p.id !== id
          );
          if (state.config.activeProviderId === id) {
            state.config.activeProviderId = undefined;
            state.config.activeModel = undefined;
          }
        }
      });
    },

    setActiveProvider: async (providerId, model) => {
      const config = await configService.setActiveProvider(providerId, model);
      set((state) => {
        state.config = config;
      });
    },
  }))
);
