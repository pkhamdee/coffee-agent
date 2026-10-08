/**
 * Weather MCP server — exposes live weather (Open-Meteo, no API key) as an MCP tool.
 *
 *   node dist/server.js           Streamable HTTP on :MCP_WEATHER_PORT/mcp (default 3001)
 *   node dist/server.js --stdio   stdio, for Claude Desktop and other local MCP clients
 *
 * HTTP auth: when MCP_WEATHER_API_KEY is set, every request must send
 * `Authorization: Bearer <key>`. stdio is local-only and needs no key.
 */
import { config as loadEnv } from 'dotenv';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, IncomingMessage } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

// Quiet: in --stdio mode stdout is the MCP channel, so dotenv must not print to it.
loadEnv({ quiet: true });

// WMO weather codes → short description (https://open-meteo.com/en/docs).
const WEATHER_CODES: Record<number, string> = {
  0: 'clear sky',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'freezing fog',
  51: 'light drizzle',
  53: 'drizzle',
  55: 'heavy drizzle',
  61: 'light rain',
  63: 'rain',
  65: 'heavy rain',
  71: 'light snow',
  73: 'snow',
  75: 'heavy snow',
  80: 'rain showers',
  81: 'rain showers',
  82: 'violent rain showers',
  95: 'thunderstorm',
  96: 'thunderstorm with hail',
  99: 'thunderstorm with hail',
};

const weatherOutput = {
  city: z.string(),
  country: z.string(),
  temperatureC: z.number(),
  feelsLikeC: z.number(),
  humidityPct: z.number(),
  condition: z.string(),
  isRaining: z.boolean(),
};

// Fields used from the Open-Meteo responses.
interface GeocodingResponse {
  results?: {
    name: string;
    country?: string;
    latitude: number;
    longitude: number;
  }[];
}
interface ForecastResponse {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    precipitation: number;
    weather_code: number;
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Weather API returned ${res.status}`);
  return (await res.json()) as T;
}

async function getCurrentWeather(city: string) {
  const geo = await fetchJson<GeocodingResponse>(
    `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`,
  );
  const place = geo.results?.[0];
  if (!place) throw new Error(`City not found: ${city}`);

  const { current } = await fetchJson<ForecastResponse>(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code',
  );
  return {
    city: place.name,
    country: place.country ?? '',
    temperatureC: current.temperature_2m,
    feelsLikeC: current.apparent_temperature,
    humidityPct: current.relative_humidity_2m,
    condition: WEATHER_CODES[current.weather_code] ?? 'unknown',
    isRaining: current.precipitation > 0,
  };
}

function createWeatherServer() {
  const server = new McpServer({ name: 'weather', version: '1.0.0' });

  server.registerTool(
    'get_current_weather',
    {
      title: 'Get current weather',
      description:
        'Current weather for a city: temperature, feels-like, humidity, and conditions.',
      inputSchema: {
        city: z.string().min(1).describe('City name, e.g. "Bangkok"'),
      },
      outputSchema: weatherOutput,
    },
    async ({ city }) => {
      try {
        const w = await getCurrentWeather(city);
        return {
          content: [
            {
              type: 'text',
              text: `${w.city}, ${w.country}: ${w.temperatureC}°C (feels like ${w.feelsLikeC}°C), ${w.condition}, humidity ${w.humidityPct}%.`,
            },
          ],
          structuredContent: w,
        };
      } catch (e) {
        return {
          isError: true,
          content: [
            { type: 'text', text: e instanceof Error ? e.message : String(e) },
          ],
        };
      }
    },
  );

  return server;
}

/** Constant-time check of the request's Bearer token against the configured key. */
function isAuthorized(req: IncomingMessage, apiKey: string): boolean {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  if (!match) return false;
  // Hash both sides so lengths match and nothing leaks through timing.
  const digest = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(match[1]), digest(apiKey));
}

async function main() {
  if (process.argv.includes('--stdio')) {
    await createWeatherServer().connect(new StdioServerTransport());
    return; // stdout is the MCP channel — never log to it.
  }

  const port = Number(process.env.MCP_WEATHER_PORT ?? 3001);
  const apiKey = process.env.MCP_WEATHER_API_KEY;
  if (!apiKey) {
    console.warn(
      'WARNING: MCP_WEATHER_API_KEY is not set — the server accepts requests without a key.',
    );
  }

  createServer(async (req, res) => {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/mcp') {
      res.writeHead(404).end();
      return;
    }
    if (apiKey && !isAuthorized(req, apiKey)) {
      res
        .writeHead(401, {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer',
        })
        .end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32001,
              message: 'Unauthorized: invalid or missing API key',
            },
            id: null,
          }),
        );
      return;
    }
    // Stateless mode: a fresh server + transport per request, no sessions to track.
    const server = createWeatherServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (e) {
      console.error('MCP request failed:', e);
      if (!res.headersSent) res.writeHead(500).end();
    }
  }).listen(port, () => {
    console.log(
      `Weather MCP server listening on http://localhost:${port}/mcp (API key ${apiKey ? 'required' : 'NOT required'})`,
    );
  });
}

void main();
