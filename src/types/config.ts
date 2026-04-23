/** Embedding 配置 */
export interface EmbeddingConfig {
  /** Embedding 模型名称 */
  model: string;
  /** 向量维度 */
  dimension: number;
}

/** 模型参数配置 */
export interface ModelConfig {
  /** 温度 */
  temperature: number;
  /** 最大生成 Token 数 */
  maxTokens: number;
  /** Top P */
  topP: number;
  /** 频率惩罚 */
  frequencyPenalty: number;
  /** 存在惩罚 */
  presencePenalty: number;
}

/** 图片生成配置 */
export interface ImageGenerationConfig {
  /** 图片生成模型名称 */
  model: string;
  /** 图片尺寸，如 "1024x1024" */
  size: string;
  /** 可选的独立图片生成 API 端点 */
  apiUrl?: string;
}

/** API 厂商配置 */
export interface ApiProvider {
  /** 厂商唯一标识符 */
  id: string;
  /** 厂商名称 */
  name: string;
  /** API 端点 URL */
  apiUrl: string;
  /** API 密钥 */
  apiKey: string;
  /** 该厂商支持的模型名称列表 */
  models: string[];
  /** 默认使用的模型 */
  defaultModel: string;
  /** 最大上下文 Token 数 */
  maxContextTokens: number;
  /** Embedding 配置 */
  embedding?: EmbeddingConfig;
  /** 图片生成配置 */
  imageGeneration?: ImageGenerationConfig;
  /** 模型额外参数配置 */
  modelConfig: ModelConfig;
}

/** 全局应用配置 */
export interface AppConfig {
  /** 数据结构版本号 */
  schemaVersion: number;
  /** API 厂商列表 */
  providers: ApiProvider[];
  /** 当前激活的厂商 ID */
  activeProviderId?: string;
  /** 当前激活的模型名称 */
  activeModel?: string;
  /** 编辑保存后是否自动生成 AI 回复 */
  autoGenerateOnEnter?: boolean;
}
