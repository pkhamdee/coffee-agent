import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { insecureFetch } from 'src/lib/http/insecure-fetch';

export interface ModelConfig {
  baseUrl: string;
  modelName: string;
  token: string;
  /** Like `curl -k`: accept self-signed / mismatched TLS certificates. */
  skipTlsVerify: boolean;
}

/** Users often paste the full endpoint from a curl command; the client adds that path itself. */
function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
}

// Holds the active LLM config. Overrides set from the setup page live in
// memory only — after a restart the MODEL_* env vars apply again.
@Injectable()
export class ModelConfigService {
  private overrides: ModelConfig | null = null;
  private llm: ChatOpenAI | null = null;

  getConfig(): ModelConfig {
    return (
      this.overrides ?? {
        baseUrl: normalizeBaseUrl(
          process.env.MODEL_BASE_URL || 'http://localhost:11434/v1',
        ),
        modelName: process.env.MODEL_NAME || 'qwen2.5:7b',
        token: process.env.MODEL_TOKEN || '',
        skipTlsVerify: process.env.MODEL_TLS_INSECURE === 'true',
      }
    );
  }

  /** Public view of the config — never exposes the token itself. */
  getPublicConfig() {
    const { baseUrl, modelName, token, skipTlsVerify } = this.getConfig();
    return {
      baseUrl,
      modelName,
      skipTlsVerify,
      hasToken: token.length > 0,
      source: this.overrides ? 'setup-page' : 'env',
    };
  }

  /** Resolves an update against the current config: empty token keeps the existing one. */
  resolve(update: {
    baseUrl: string;
    modelName: string;
    token?: string;
    skipTlsVerify?: boolean;
  }): ModelConfig {
    return {
      baseUrl: normalizeBaseUrl(update.baseUrl),
      modelName: update.modelName,
      token: update.token || this.getConfig().token,
      skipTlsVerify: update.skipTlsVerify ?? false,
    };
  }

  setConfig(config: ModelConfig) {
    this.overrides = config;
    this.llm = null;
  }

  getLlm(): ChatOpenAI {
    this.llm ??= ModelConfigService.createLlm(this.getConfig());
    return this.llm;
  }

  /** Any OpenAI-compatible endpoint (OpenRouter, Ollama's /v1, vLLM, ...). */
  static createLlm(
    { baseUrl, modelName, token, skipTlsVerify }: ModelConfig,
    { maxRetries }: { maxRetries?: number } = {},
  ): ChatOpenAI {
    return new ChatOpenAI({
      model: modelName,
      maxRetries,
      temperature: 0,
      // Local servers like Ollama ignore the key, but the client requires one.
      apiKey: token || 'not-needed',
      configuration: {
        baseURL: baseUrl,
        ...(skipTlsVerify && { fetch: insecureFetch }),
      },
      modelKwargs: { response_format: { type: 'json_object' } },
    });
  }
}
