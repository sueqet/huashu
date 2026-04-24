export interface EmbeddingConfig {
  model: string;
  dimension: number;
}

export interface ModelConfig {
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
}

export interface ImageGenerationConfig {
  model: string;
  size: string;
  apiUrl?: string;
  apiKey?: string;
}

export interface ApiProvider {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  models: string[];
  defaultModel: string;
  maxContextTokens: number;
  embedding?: EmbeddingConfig;
  imageGeneration?: ImageGenerationConfig;
  modelConfig: ModelConfig;
}

export interface AppConfig {
  schemaVersion: number;
  providers: ApiProvider[];
  activeProviderId?: string;
  activeModel?: string;
  autoGenerateOnEnter?: boolean;
}
