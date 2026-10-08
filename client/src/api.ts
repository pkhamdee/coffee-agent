import type {
  ApiResponse,
  McpSettings,
  McpSettingsInput,
  ModelSettings,
  ModelSettingsInput,
  SavedOrder,
  WeatherResult,
} from './types';

export async function sendMessage(threadId: string, query: string): Promise<ApiResponse> {
  const res = await fetch(`/api/chats/message/${threadId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }

  return res.json();
}

export async function getOrders(): Promise<SavedOrder[]> {
  const res = await fetch('/api/chats/orders');
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export async function deliverOrder(id: string): Promise<void> {
  const res = await fetch(`/api/chats/orders/${id}/deliver`, { method: 'PATCH' });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
}

/** Throws with the backend's error message (e.g. validation or model errors). */
async function jsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body?.message;
    throw new Error(Array.isArray(msg) ? msg.join(', ') : msg || `Request failed: ${res.status}`);
  }
  return body as T;
}

export async function getModelSettings(): Promise<ModelSettings> {
  return jsonOrThrow(await fetch('/api/settings/model'));
}

export async function saveModelSettings(input: ModelSettingsInput): Promise<ModelSettings> {
  return jsonOrThrow(
    await fetch('/api/settings/model', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function testModelSettings(input: ModelSettingsInput): Promise<void> {
  await jsonOrThrow(
    await fetch('/api/settings/model/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function getMcpSettings(): Promise<McpSettings> {
  return jsonOrThrow(await fetch('/api/settings/mcp'));
}

export async function saveMcpSettings(input: McpSettingsInput): Promise<McpSettings> {
  return jsonOrThrow(
    await fetch('/api/settings/mcp', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function testMcpSettings(input: McpSettingsInput): Promise<WeatherResult> {
  const { weather } = await jsonOrThrow<{ weather: WeatherResult }>(
    await fetch('/api/settings/mcp/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
  return weather;
}
