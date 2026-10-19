export interface Provider {
  id: number;
  name: string;
  base_url: string;
  auth_scheme: string; // "Bearer" | "x-api-key" | "none"
  extra_headers: string; // JSON string
  timeout_ms: number;
  enabled: number;
  created_at: string;
}

export interface ApiKeyRow {
  id: number;
  provider_id: number;
  label: string;
  key_value: string;
  enabled: number;
  status: string; // active | cooldown | quota_exhausted | invalid | disabled
  priority: number;
  consecutive_failures: number;
  cooldown_until: number; // epoch ms, 0 = none
  total_requests: number;
  total_failures: number;
  last_used_at: number;
  last_error: string;
}

export interface VirtualModel {
  id: number;
  alias: string;
  provider_id: number;
  upstream_model: string;
  enabled: number;
}

export interface ProviderWithKeys extends Provider {
  keys: ApiKeyRow[];
  models: VirtualModel[];
}
