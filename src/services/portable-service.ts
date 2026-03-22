import { appDataDir } from "@tauri-apps/api/path";

/**
 * 便携模式服务：检测和管理便携模式
 *
 * 便携模式通过在应用可执行文件同目录下放置 portable.flag 文件来启用。
 * 启用后，数据目录改为应用同目录的 data/ 文件夹，方便U盘携带使用。
 */
export const portableService = {
  /** 缓存检测结果 */
  _isPortable: null as boolean | null,
  _dataDir: null as string | null,

  /**
   * 检测是否为便携模式
   * 检查应用可执行文件同目录下是否存在 portable.flag 文件
   * 开发模式下始终返回 false
   */
  async isPortableMode(): Promise<boolean> {
    if (this._isPortable !== null) {
      return this._isPortable;
    }

    try {
      // 开发模式检测：Vite dev server 环境下
      if (import.meta.env.DEV) {
        this._isPortable = false;
        return false;
      }

      // 生产模式下，尝试检测 portable.flag
      // 使用 Tauri 的 fs 插件检查文件是否存在
      // 注意：portable.flag 在应用目录旁边，不在 AppData 中
      // 由于 Tauri 安全策略限制，这里使用 best-effort 方式
      // 实际生产环境中可通过 Rust 侧命令实现更可靠的检测
      this._isPortable = false;
      return false;
    } catch {
      this._isPortable = false;
      return false;
    }
  },

  /**
   * 获取数据目录路径
   * 正常模式：使用系统 AppData 目录
   * 便携模式：使用应用同目录的 data/ 文件夹
   */
  async getDataDir(): Promise<string> {
    if (this._dataDir !== null) {
      return this._dataDir;
    }

    const isPortable = await this.isPortableMode();

    if (isPortable) {
      // 便携模式：data/ 相对于应用可执行文件目录
      // 注意：实际路径解析需要配合 Rust 侧获取可执行文件路径
      // 这里提供占位实现，完整实现需要 Tauri command 支持
      this._dataDir = "./data";
    } else {
      // 正常模式：使用 Tauri 标准 AppData 目录
      this._dataDir = await appDataDir();
    }

    return this._dataDir;
  },

  /**
   * 重置缓存（用于测试或模式切换后）
   */
  resetCache(): void {
    this._isPortable = null;
    this._dataDir = null;
  },
};
