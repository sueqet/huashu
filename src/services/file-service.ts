import {
  readTextFile,
  writeTextFile,
  mkdir,
  exists,
  remove,
  rename,
  readDir,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";
import { v4 as uuidv4 } from "uuid";

const BASE_DIR = BaseDirectory.AppData;

/**
 * 基础文件服务：封装原子写入、JSON读写、目录管理
 */
export const fileService = {
  /**
   * 确保目录存在，不存在则递归创建
   */
  async ensureDir(path: string): Promise<void> {
    const dirExists = await exists(path, { baseDir: BASE_DIR });
    if (!dirExists) {
      await mkdir(path, { baseDir: BASE_DIR, recursive: true });
    }
  },

  /**
   * 检查文件是否存在
   */
  async exists(path: string): Promise<boolean> {
    return exists(path, { baseDir: BASE_DIR });
  },

  /**
   * 读取 JSON 文件并解析
   */
  async readJSON<T>(path: string): Promise<T> {
    const content = await readTextFile(path, { baseDir: BASE_DIR });
    return JSON.parse(content) as T;
  },

  /**
   * 原子写入 JSON 文件：先写临时文件，再 rename 替换
   * 防止写入过程中崩溃导致文件损坏
   */
  async writeJSON(path: string, data: unknown): Promise<void> {
    const content = JSON.stringify(data, null, 2);
    const tmpPath = `${path}.${uuidv4().slice(0, 8)}.tmp`;

    try {
      // 写入临时文件
      await writeTextFile(tmpPath, content, { baseDir: BASE_DIR });
      // 原子替换：如果目标文件存在，先删除再重命名
      const targetExists = await exists(path, { baseDir: BASE_DIR });
      if (targetExists) {
        await remove(path, { baseDir: BASE_DIR });
      }
      await rename(tmpPath, path, {
        oldPathBaseDir: BASE_DIR,
        newPathBaseDir: BASE_DIR,
      });
    } catch (err) {
      // 清理临时文件
      try {
        const tmpExists = await exists(tmpPath, { baseDir: BASE_DIR });
        if (tmpExists) {
          await remove(tmpPath, { baseDir: BASE_DIR });
        }
      } catch {
        // 忽略清理失败
      }
      throw err;
    }
  },

  /**
   * 写入文本文件（非原子，用于临时文件等场景）
   */
  async writeText(path: string, content: string): Promise<void> {
    await writeTextFile(path, content, { baseDir: BASE_DIR });
  },

  /**
   * 读取文本文件
   */
  async readText(path: string): Promise<string> {
    return readTextFile(path, { baseDir: BASE_DIR });
  },

  /**
   * 删除文件
   */
  async removeFile(path: string): Promise<void> {
    const fileExists = await exists(path, { baseDir: BASE_DIR });
    if (fileExists) {
      await remove(path, { baseDir: BASE_DIR });
    }
  },

  /**
   * 删除目录（递归）
   */
  async removeDir(path: string): Promise<void> {
    const dirExists = await exists(path, { baseDir: BASE_DIR });
    if (dirExists) {
      await remove(path, { baseDir: BASE_DIR, recursive: true });
    }
  },

  /**
   * 列出目录内容
   */
  async listDir(path: string): Promise<Array<{ name: string | undefined; isDirectory: boolean; isFile: boolean }>> {
    const dirExists = await exists(path, { baseDir: BASE_DIR });
    if (!dirExists) {
      return [];
    }
    const entries = await readDir(path, { baseDir: BASE_DIR });
    return entries.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory,
      isFile: e.isFile,
    }));
  },

  /**
   * 初始化应用数据目录结构
   */
  async initAppDataDir(): Promise<void> {
    await this.ensureDir("projects");
  },
};
