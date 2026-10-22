/**
 * BrainDebugger — Typed API Client
 *
 * All data access goes through this module.
 * The neuPrint token never leaves the backend.
 * All requests go to our FastAPI backend via the Vite proxy.
 */

import type {
  ConnectionListResponse,
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

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
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
  health(): Promise<HealthResponse> {
    return get<HealthResponse>('/health');
  },

  searchNeurons(params: {
    q: string;
    limit?: number;
    offset?: number;
  }): Promise<NeuronSearchResponse> {
    const p = new URLSearchParams({ q: params.q });
    if (params.limit !== undefined) p.set('limit', String(params.limit));
    if (params.offset !== undefined) p.set('offset', String(params.offset));
    return get<NeuronSearchResponse>(`/api/neurons/search?${p}`);
  },

  getNeuron(bodyId: number): Promise<Neuron> {
    return get<Neuron>(`/api/neurons/${bodyId}`);
  },

  getConnections(params: {
    bodyId: number;
    direction: 'incoming' | 'outgoing';
    limit?: number;
  }): Promise<ConnectionListResponse> {
    const p = new URLSearchParams({ direction: params.direction });
    if (params.limit !== undefined) p.set('limit', String(params.limit));
    return get<ConnectionListResponse>(
      `/api/neurons/${params.bodyId}/connections?${p}`,
    );
  },

  getNeighborhood(params: {
    bodyId: number;
    maxNodes?: number;
  }): Promise<GraphResponse> {
    const p = new URLSearchParams();
    if (params.maxNodes !== undefined) p.set('max_nodes', String(params.maxNodes));
    return get<GraphResponse>(
      `/api/neurons/${params.bodyId}/neighborhood?${p}`,
    );
  },
};

export { ApiClientError };
