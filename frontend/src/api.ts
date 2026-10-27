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
  ControlledExperimentRequest,
  ControlledExperimentResponse,
  DownstreamCascadeResponse,
  GraphResponse,
  HealthResponse,
  InterventionConfig,
  Neuron,
  NeuronSearchResponse,
  PathwaySearchResponse,
  PerturbationComparisonRequest,
  PerturbationComparisonResponse,
  PerturbationValidationResponse,
} from './types';

const BASE = '';  // Vite proxy handles /api and /health

export class ApiClientError extends Error {
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
      if (body) {
        if (typeof body.detail === 'string') {
          detail = body.detail;
        } else if (Array.isArray(body.detail)) {
          detail = body.detail.map((e: any) => e.msg || JSON.stringify(e)).join('; ');
        } else if (body.detail?.message) {
          detail = body.detail.message;
        } else if (body.message) {
          detail = body.message;
        } else if (typeof body.detail === 'object') {
          detail = JSON.stringify(body.detail);
        }
      }
    } catch { /* ignore */ }
    throw new ApiClientError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody) {
        if (typeof errBody.detail === 'string') {
          detail = errBody.detail;
        } else if (errBody.detail?.message) {
          detail = errBody.detail.message;
        } else if (errBody.message) {
          detail = errBody.message;
        }
      }
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

  findPaths(params: {
    sourceBodyId: number;
    targetBodyId: number;
    maxHops?: number;
    maxPaths?: number;
    strategy?: string;
    minWeight?: number;
  }, signal?: AbortSignal): Promise<PathwaySearchResponse> {
    const p = new URLSearchParams();
    p.set('source_body_id', String(params.sourceBodyId));
    p.set('target_body_id', String(params.targetBodyId));
    if (params.maxHops !== undefined) p.set('max_hops', String(params.maxHops));
    if (params.maxPaths !== undefined) p.set('max_paths', String(params.maxPaths));
    if (params.strategy !== undefined) p.set('strategy', params.strategy);
    if (params.minWeight !== undefined) p.set('min_weight', String(params.minWeight));
    return get<PathwaySearchResponse>(`/api/paths?${p}`, signal);
  },

  getDownstreamCascade(params: {
    bodyId: number;
    maxHops?: number;
    maxNodes?: number;
    maxEdges?: number;
    minWeight?: number;
  }, signal?: AbortSignal): Promise<DownstreamCascadeResponse> {
    const p = new URLSearchParams();
    if (params.maxHops !== undefined) p.set('max_hops', String(params.maxHops));
    if (params.maxNodes !== undefined) p.set('max_nodes', String(params.maxNodes));
    if (params.maxEdges !== undefined) p.set('max_edges', String(params.maxEdges));
    if (params.minWeight !== undefined) p.set('min_weight', String(params.minWeight));
    return get<DownstreamCascadeResponse>(`/api/neurons/${params.bodyId}/downstream-cascade?${p}`, signal);
  },

  validateInterventions(config: InterventionConfig, signal?: AbortSignal): Promise<PerturbationValidationResponse> {
    return post<PerturbationValidationResponse>('/api/perturbations/validate', config, signal);
  },

  comparePerturbations(req: PerturbationComparisonRequest, signal?: AbortSignal): Promise<PerturbationComparisonResponse> {
    return post<PerturbationComparisonResponse>('/api/perturbations/compare', req, signal);
  },

  runControlledExperiment(req: ControlledExperimentRequest, signal?: AbortSignal): Promise<ControlledExperimentResponse> {
    return post<ControlledExperimentResponse>('/api/perturbations/experiments', req, signal);
  },
};
