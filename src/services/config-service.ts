import { v4 as uuidv4 } from "uuid";
import type { AppConfig, ApiProvider } from "@/types";
import { fileService } from "./file-service";

const CONFIG_PATH = "config.json";
const CURRENT_SCHEMA_VERSION = 1;

function createDefaultConfig(): AppConfig {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    providers: [],
    activeProviderId: undefined,
    activeModel: undefined,
  };
}

/**
 * 配置服务：管理全局 API 配置（厂商、模型等）
 */
export const configService = {
  /**
   * 获取全局配置，若文件不存在则创建默认配置
   */
  async getConfig(): Promise<AppConfig> {
    const configExists = await fileService.exists(CONFIG_PATH);
    if (!configExists) {
      const defaultConfig = createDefaultConfig();
      await fileService.writeJSON(CONFIG_PATH, defaultConfig);
      return defaultConfig;
    }
    return fileService.readJSON<AppConfig>(CONFIG_PATH);
  },

  /**
   * 保存全局配置
   */
  async saveConfig(config: AppConfig): Promise<void> {
    await fileService.writeJSON(CONFIG_PATH, config);
  },

  /**
   * 获取所有 API 厂商列表
   */
  async listProviders(): Promise<ApiProvider[]> {
    const config = await this.getConfig();
    return config.providers;
  },

  /**
   * 添加 API 厂商
   */
  async addProvider(provider: Omit<ApiProvider, "id">): Promise<ApiProvider> {
    const config = await this.getConfig();
    const newProvider: ApiProvider = {
      ...provider,
      id: uuidv4(),
    };
    config.providers.push(newProvider);
    await this.saveConfig(config);
    return newProvider;
  },

  /**
   * 更新 API 厂商配置
   */
  async updateProvider(
    id: string,
    updates: Partial<Omit<ApiProvider, "id">>
  ): Promise<ApiProvider> {
    const config = await this.getConfig();
    const index = config.providers.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`厂商不存在: ${id}`);
    }
    const updated: ApiProvider = {
      ...config.providers[index],
      ...updates,
    };
    config.providers[index] = updated;
    await this.saveConfig(config);
    return updated;
  },

  /**
   * 删除 API 厂商
   */
  async removeProvider(id: string): Promise<void> {
    const config = await this.getConfig();
    config.providers = config.providers.filter((p) => p.id !== id);

    // 若删除的是当前激活的厂商，清除激活状态
    if (config.activeProviderId === id) {
      config.activeProviderId = undefined;
      config.activeModel = undefined;
    }

    await this.saveConfig(config);
  },

  /**
   * 设置当前激活的厂商和模型
   */
  async setActiveProvider(
    providerId: string,
    model: string
  ): Promise<AppConfig> {
    const config = await this.getConfig();
    const provider = config.providers.find((p) => p.id === providerId);
    if (!provider) {
      throw new Error(`厂商不存在: ${providerId}`);
    }
    config.activeProviderId = providerId;
    config.activeModel = model;
    await this.saveConfig(config);
    return config;
  },
};
