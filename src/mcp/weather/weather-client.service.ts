import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { insecureFetch } from 'src/lib/http/insecure-fetch';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface ShopWeather {
  city: string;
  country: string;
  temperatureC: number;
  feelsLikeC: number;
  humidityPct: number;
  condition: string;
  isRaining: boolean;
}

export interface WeatherMcpConfig {
  url: string;
  apiKey: string;
  city: string;
  /** Like `curl -k`: accept self-signed / mismatched TLS certificates. */
  skipTlsVerify: boolean;
}

const WEATHER_TOOL = 'get_current_weather';
const CACHE_MS = 10 * 60 * 1000;
// Retry soon after a failure so a server started mid-demo is picked up quickly.
const FAILURE_CACHE_MS = 30 * 1000;

/**
 * MCP client for the Weather MCP server (mcp-weather-server/).
 * Config set from the setup page lives in memory only — after a restart the
 * MCP_WEATHER_URL / MCP_WEATHER_API_KEY / SHOP_CITY env vars apply again.
 * Fails soft: if the server is down the agent just runs without weather.
 */
@Injectable()
export class WeatherClientService {
  private readonly logger = new Logger(WeatherClientService.name);
  private overrides: WeatherMcpConfig | null = null;
  private cache: { at: number; weather: ShopWeather | null } | null = null;

  getConfig(): WeatherMcpConfig {
    return (
      this.overrides ?? {
        url: process.env.MCP_WEATHER_URL || 'http://localhost:3001/mcp',
        apiKey: process.env.MCP_WEATHER_API_KEY || '',
        city: process.env.SHOP_CITY || '',
        skipTlsVerify: process.env.MCP_WEATHER_TLS_INSECURE === 'true',
      }
    );
  }

  /** Public view of the config — never exposes the API key itself. */
  getPublicConfig() {
    const { url, apiKey, city, skipTlsVerify } = this.getConfig();
    return {
      url,
      city,
      skipTlsVerify,
      hasApiKey: apiKey.length > 0,
      source: this.overrides ? 'setup-page' : 'env',
    };
  }

  /** Resolves an update against the current config: empty API key keeps the existing one. */
  resolve(update: {
    url: string;
    city: string;
    apiKey?: string;
    skipTlsVerify?: boolean;
  }): WeatherMcpConfig {
    return {
      url: update.url,
      city: update.city,
      apiKey: update.apiKey || this.getConfig().apiKey,
      skipTlsVerify: update.skipTlsVerify ?? false,
    };
  }

  setConfig(config: WeatherMcpConfig) {
    this.overrides = config;
    this.cache = null;
  }

  async getShopWeather(): Promise<ShopWeather | null> {
    const config = this.getConfig();
    if (!config.city) return null;
    const ttl = this.cache?.weather ? CACHE_MS : FAILURE_CACHE_MS;
    if (this.cache && Date.now() - this.cache.at < ttl) {
      return this.cache.weather;
    }

    let weather: ShopWeather | null = null;
    try {
      weather = await WeatherClientService.callWeatherTool(config);
      this.logger.log(`Weather via MCP: ${JSON.stringify(weather)}`);
    } catch (e) {
      this.logger.warn(
        `Weather MCP unavailable at ${config.url} — continuing without weather (${e instanceof Error ? e.message : e})`,
      );
    }
    this.cache = { at: Date.now(), weather };
    return weather;
  }

  /** Calls the weather tool once; throws on any connection, auth, or tool error. */
  static async callWeatherTool({
    url,
    apiKey,
    city,
    skipTlsVerify,
  }: WeatherMcpConfig): Promise<ShopWeather> {
    const client = new Client({ name: 'coffee-agent', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: apiKey
        ? { headers: { Authorization: `Bearer ${apiKey}` } }
        : undefined,
      ...(skipTlsVerify && { fetch: insecureFetch }),
    });
    try {
      await client.connect(transport).catch((e: unknown) => {
        if (e instanceof StreamableHTTPError && e.code === 401) {
          throw new Error(
            apiKey
              ? 'MCP server rejected the API key (401 Unauthorized)'
              : 'MCP server requires an API key (401 Unauthorized)',
          );
        }
        throw e;
      });
      const toolName = await WeatherClientService.findWeatherTool(client);
      const result = await client.callTool(
        { name: toolName, arguments: { city } },
        undefined,
        { timeout: 15_000 },
      );
      if (result.isError || !result.structuredContent) {
        const text = (result.content as { text?: string }[] | undefined)
          ?.map((c) => c.text)
          .join(' ');
        throw new Error(text || 'Weather tool returned no data');
      }
      return result.structuredContent as unknown as ShopWeather;
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  /**
   * Resolves the weather tool's name. Gateways such as Envoy AI Gateway prefix
   * tool names with the backend name (e.g. `my-server__get_current_weather`).
   */
  private static async findWeatherTool(client: Client): Promise<string> {
    const { tools } = await client.listTools(undefined, { timeout: 15_000 });
    const tool = tools.find(
      (t) => t.name === WEATHER_TOOL || t.name.endsWith(`__${WEATHER_TOOL}`),
    );
    if (!tool) {
      throw new Error(
        `MCP server has no ${WEATHER_TOOL} tool (found: ${tools.map((t) => t.name).join(', ') || 'none'})`,
      );
    }
    return tool.name;
  }
}
