/**
 * Base API Client
 * Handles HTTP requests, token management, and error handling
 */

import { outletStore } from './outletStore';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Token storage keys
const ACCESS_TOKEN_KEY = 'ovenisto_access_token';
const REFRESH_TOKEN_KEY = 'ovenisto_refresh_token';

// --- Token helpers ---

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// --- API Error class ---

export class ApiError extends Error {
  status: number;
  errors?: Array<{ field: string; message: string }>;

  constructor(message: string, status: number, errors?: Array<{ field: string; message: string }>) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

// --- Core request function ---

async function request<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAccessToken();
  const outletId = outletStore.get();
  const outletHeader = outletId && outletId !== 'all' ? { 'X-Outlet-Id': outletId } : {};

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...outletHeader,
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  // Handle 401 - try token refresh
  if (res.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // Retry original request with new token
      const newToken = getAccessToken();
      const retryRes = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...outletHeader,
          ...(newToken && { Authorization: `Bearer ${newToken}` }),
          ...options.headers,
        },
      });
      if (retryRes.ok) {
        return retryRes.status === 204 ? (null as T) : retryRes.json();
      }
    }
    // Refresh failed - clear tokens and redirect to login
    clearTokens();
    localStorage.removeItem('ovenisto_user');
    window.location.href = '/login';
    throw new ApiError('Session expired. Please login again.', 401);
  }

  if (!res.ok) {
    let errorData: { error?: string; errors?: Array<{ field: string; message: string }> } = {};
    try {
      errorData = await res.json();
    } catch {
      // Response wasn't JSON
    }
    throw new ApiError(
      errorData.error || `Request failed with status ${res.status}`,
      res.status,
      errorData.errors
    );
  }

  if (res.status === 204) {
    return null as T;
  }

  return res.json();
}

// --- Token refresh ---

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    if (data.success && data.data) {
      setTokens(data.data.accessToken, data.data.refreshToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// --- GET Request Cache ---

interface CacheEntry {
  data: unknown;
  timestamp: number;
  inflight?: Promise<unknown>;
}

const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL = 30_000; // 30 seconds

// Endpoints that change rarely — cache longer (5 min)
const LONG_TTL_PATTERNS = [
  '/inventory/ingredient-categories',
  '/inventory/units',
  '/inventory/ingredients',
  '/warehouses',
  '/suppliers',
];

function getCacheTTL(endpoint: string): number {
  if (LONG_TTL_PATTERNS.some(p => endpoint.startsWith(p) && !endpoint.includes('stock'))) {
    return 300_000; // 5 minutes for reference data
  }
  return DEFAULT_TTL;
}

function getCacheKey(endpoint: string): string {
  // Per-outlet cache: switching outlets must not serve another outlet's rows.
  return `${outletStore.get()}::${endpoint}`;
}

// Get base path for invalidation: "/purchases/abc123" → "/purchases"
function getBasePath(endpoint: string): string {
  const parts = endpoint.split('?')[0].split('/').filter(Boolean);
  return '/' + (parts[0] || '');
}

function invalidateCache(endpoint: string): void {
  const base = getBasePath(endpoint);
  const keysToDelete: string[] = [];
  cache.forEach((_, key) => {
    const sep = key.indexOf('::');
    const path = sep >= 0 ? key.slice(sep + 2) : key;
    if (path.startsWith(base)) keysToDelete.push(key);
  });
  keysToDelete.forEach(k => cache.delete(k));
}

async function cachedGet<T>(endpoint: string): Promise<T> {
  const key = getCacheKey(endpoint);
  const ttl = getCacheTTL(endpoint);
  const now = Date.now();

  const cached = cache.get(key);

  // Return cached data if fresh
  if (cached && (now - cached.timestamp) < ttl) {
    return cached.data as T;
  }

  // Deduplicate: if same request is already in-flight, wait for it
  if (cached?.inflight) {
    return cached.inflight as Promise<T>;
  }

  // Make the request and cache the promise for deduplication
  const promise = request<T>(endpoint).then(data => {
    cache.set(key, { data, timestamp: Date.now() });
    return data;
  }).catch(err => {
    // Remove failed entry
    cache.delete(key);
    throw err;
  });

  cache.set(key, { data: cached?.data, timestamp: cached?.timestamp ?? 0, inflight: promise });
  return promise;
}

// --- Exported API methods ---

export const api = {
  get: <T = unknown>(endpoint: string) => cachedGet<T>(endpoint),

  /** Bypass cache — always fetch fresh */
  getFresh: <T = unknown>(endpoint: string) => {
    cache.delete(getCacheKey(endpoint));
    return cachedGet<T>(endpoint);
  },

  post: <T = unknown>(endpoint: string, data?: unknown) => {
    invalidateCache(endpoint);
    return request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  put: <T = unknown>(endpoint: string, data?: unknown) => {
    invalidateCache(endpoint);
    return request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  patch: <T = unknown>(endpoint: string, data?: unknown) => {
    invalidateCache(endpoint);
    return request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  delete: <T = unknown>(endpoint: string) => {
    invalidateCache(endpoint);
    return request<T>(endpoint, { method: 'DELETE' });
  },

  /** Manually clear all cache or specific endpoint */
  clearCache: (endpoint?: string) => {
    if (endpoint) invalidateCache(endpoint);
    else cache.clear();
  },
};
