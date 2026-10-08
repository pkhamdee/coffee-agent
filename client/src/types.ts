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
  sweetener: string | null;
  toppings: string | null;
  quantity: number;
}

export interface ModelSettings {
  baseUrl: string;
  modelName: string;
  skipTlsVerify: boolean;
  hasToken: boolean;
  source: 'env' | 'setup-page';
}

export interface ModelSettingsInput {
  baseUrl: string;
  modelName: string;
  skipTlsVerify: boolean;
  /** Empty = keep the current token. */
  token: string;
}

export interface McpSettings {
  url: string;
  city: string;
  skipTlsVerify: boolean;
  hasApiKey: boolean;
  source: 'env' | 'setup-page';
}

export interface McpSettingsInput {
  url: string;
  city: string;
  skipTlsVerify: boolean;
  /** Empty = keep the current key. */
  apiKey: string;
}

export interface WeatherResult {
  city: string;
  country: string;
  temperatureC: number;
  feelsLikeC: number;
  condition: string;
}
