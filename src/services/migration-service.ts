/**
 * 数据迁移框架
 *
 * 所有持久化 JSON 文件包含 schemaVersion 字段。
 * 应用启动时检测版本号，按需执行迁移函数。
 */

/** 迁移函数类型：接收旧数据，返回新数据 */
type MigrationFn = (data: Record<string, unknown>) => Record<string, unknown>;

/** 迁移注册表：key 为 "类型:fromVersion→toVersion" */
const migrations: Record<string, MigrationFn> = {};

/**
 * 注册一个迁移函数
 * @param type 数据类型标识（如 "project", "conversation", "config"）
 * @param fromVersion 源版本
 * @param toVersion 目标版本
 * @param fn 迁移函数
 */
export function registerMigration(
  type: string,
  fromVersion: number,
  toVersion: number,
  fn: MigrationFn
): void {
  const key = `${type}:${fromVersion}→${toVersion}`;
  migrations[key] = fn;
}

/**
 * 对数据执行必要的迁移，从当前 schemaVersion 升级到目标版本
 * @param type 数据类型标识
 * @param data 原始数据（含 schemaVersion）
 * @param targetVersion 目标版本
 * @returns 迁移后的数据
 */
export function migrateData<T extends Record<string, unknown>>(
  type: string,
  data: T,
  targetVersion: number
): T {
  let current = { ...data };
  let version = (current.schemaVersion as number) ?? 0;

  while (version < targetVersion) {
    const nextVersion = version + 1;
    const key = `${type}:${version}→${nextVersion}`;
    const fn = migrations[key];

    if (!fn) {
      console.warn(
        `缺少迁移: ${key}，跳过从 v${version} 到 v${nextVersion} 的迁移`
      );
      break;
    }

    console.log(`执行迁移: ${key}`);
    current = fn(current) as T & Record<string, unknown>;
    (current as Record<string, unknown>).schemaVersion = nextVersion;
    version = nextVersion;
  }

  return current as T;
}

/** 当前各数据类型的最新 schema 版本 */
export const SCHEMA_VERSIONS = {
  config: 1,
  project: 1,
  conversation: 1,
  knowledgeBase: 1,
} as const;

// ========== 示例：未来版本迁移可以这样注册 ==========
// registerMigration("project", 1, 2, (data) => {
//   // 例如：v2 新增了 tags 字段
//   return { ...data, tags: [] };
// });
