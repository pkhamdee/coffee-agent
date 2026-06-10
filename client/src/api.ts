import type { ApiResponse, SavedOrder } from './types';

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
