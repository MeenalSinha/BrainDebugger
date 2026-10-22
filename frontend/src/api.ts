/**
 * BrainDebugger — Typed API Client
 *
 * All data access goes through this module.
 * The neuPrint token never leaves the backend.
 * All requests go to our FastAPI backend via the Vite proxy.
 */

import type {
  ConnectionListResponse,
  ConnectivitySummaryResponse,
  GraphResponse,
  HealthResponse,
  Neuron,
  NeuronSearchResponse,
} from './types';

const BASE = '';  // Vite proxy handles /api and /health

class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(detail);
    this.name = 'ApiClientError';
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(BASE + path, { signal });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.detail?.message || body?.message || body?.detail || detail;
    } catch { /* ignore */ }
    throw new ApiClientError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health(signal?: AbortSignal): Promise<HealthResponse> {
    return get<HealthResponse>('/health', signal);
  },

  searchNeurons(params: {
    q: string;
    limit?: number;
    offset?: number;
  }, signal?: AbortSignal): Promise<NeuronSearchResponse> {
    const p = new URLSearchParams({ q: params.q });
    if (params.limit !== undefined) p.set('limit', String(params.limit));
    if (params.offset !== undefined) p.set('offset', String(params.offset));
    return get<NeuronSearchResponse>(`/api/neurons/search?${p}`, signal);
  },

  getNeuron(bodyId: number, signal?: AbortSignal): Promise<Neuron> {
    return get<Neuron>(`/api/neurons/${bodyId}`, signal);
  },

  getConnectivitySummary(bodyId: number, signal?: AbortSignal): Promise<ConnectivitySummaryResponse> {
    return get<ConnectivitySummaryResponse>(`/api/neurons/${bodyId}/connectivity-summary`, signal);
  },

  getConnections(params: {
    bodyId: number;
    direction: 'incoming' | 'outgoing';
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: string;
    partnerId?: number;
    partnerType?: string;
    minWeight?: number;
  }, signal?: AbortSignal): Promise<ConnectionListResponse> {
    const p = new URLSearchParams({ direction: params.direction });
    if (params.limit !== undefined) p.set('limit', String(params.limit));
    if (params.offset !== undefined) p.set('offset', String(params.offset));
    if (params.sortBy !== undefined) p.set('sort_by', params.sortBy);
    if (params.sortOrder !== undefined) p.set('sort_order', params.sortOrder);
    if (params.partnerId !== undefined) p.set('partner_id', String(params.partnerId));
    if (params.partnerType !== undefined && params.partnerType.trim()) {
      p.set('partner_type', params.partnerType.trim());
    }
    if (params.minWeight !== undefined) p.set('min_weight', String(params.minWeight));

    return get<ConnectionListResponse>(
      `/api/neurons/${params.bodyId}/connections?${p}`,
      signal,
    );
  },

  getNeighborhood(params: {
    bodyId: number;
    maxNodes?: number;
  }, signal?: AbortSignal): Promise<GraphResponse> {
    const p = new URLSearchParams();
    if (params.maxNodes !== undefined) p.set('max_nodes', String(params.maxNodes));
    return get<GraphResponse>(
      `/api/neurons/${params.bodyId}/neighborhood?${p}`,
      signal,
    );
  },
};

export { ApiClientError };
