export interface Order {
  name: string | null;
  drink: string | null;
  size: string | null;
  milk: string | null;
  syrup: string | null;
  sweeteners: string | null;
  toppings: string | null;
  quantity: number | null;
}

export interface ApiResponse {
  message: string;
  current_order: Order | null;
  suggestions: string[] | null;
  progress: 'in_progress' | 'completed';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface SavedOrder {
  _id: string;
  name: string;
  drink: string;
  size: string | null;
  milk: string | null;
  syrup: string | null;
  sweeter: string | null;
  toppings: string | null;
  quantity: number;
}
