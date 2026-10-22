/**
 * BrainDebugger — Shared TypeScript types
 *
 * These mirror the Pydantic models in backend/models.py exactly.
 * All optional fields reflect genuine nullability in the MaleCNS v1.0 dataset.
 */

export interface Neuron {
  body_id: number;
  cell_type: string | null;
  instance: string | null;
  superclass: string | null;
  status: string | null;
  status_label: string | null;
  soma_side: string | null;
  soma_neuromere: string | null;
  subclass: string | null;
  hemi_brain_type: string | null;
  consensus_nt: string | null;
  pre_synapses: number | null;
  post_synapses: number | null;
  synweight: number | null;
  entry_nerve?: string | null;
  exit_nerve?: string | null;
  dimorphism?: string | null;
  group?: string | null;
  dataset?: string;
  dataset_attribution?: string;
}

export interface NeuronSearchResult {
  body_id: number;
  cell_type: string | null;
  instance: string | null;
  superclass: string | null;
  status: string | null;
  match_field: string;
}

export interface NeuronSearchResponse {
  results: NeuronSearchResult[];
  total: number;
  limit: number;
  offset: number;
  query: string;
  dataset: string;
}

export interface DirectionalConnectivitySummary {
  direction: 'incoming' | 'outgoing';
  partner_count: number;
  record_count: number;
  total_weight: number;
  body_stat_synapses: number | null;
}

export interface ConnectivitySummaryResponse {
  body_id: number;
  incoming: DirectionalConnectivitySummary;
  outgoing: DirectionalConnectivitySummary;
  source_file: string;
  is_traced_only_subset: boolean;
  coverage_notice: string;
  dataset: string;
}

export interface Connection {
  body_pre: number;
  body_post: number;
  weight: number;
  type_pre: string | null;
  type_post: string | null;
  instance_pre?: string | null;
  instance_post?: string | null;
  superclass_pre?: string | null;
  superclass_post?: string | null;
}

export interface ConnectionListResponse {
  body_id: number;
  direction: 'incoming' | 'outgoing';
  connections: Connection[];
  returned_count: number;
  total_matched: number;
  total_in_source: number;
  unique_partners: number;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  sort_by: string;
  sort_order: string;
  partner_filter?: string | null;
  dataset: string;
  source_file: string;
  is_traced_only_subset: boolean;
  coverage_notice: string;
}

export interface GraphNode {
  id: string;
  body_id: number;
  label: string;
  cell_type: string | null;
  instance: string | null;
  superclass: string | null;
  status: string | null;
  consensus_nt: string | null;
  is_selected: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  body_pre: number;
  body_post: number;
  weight: number;
  type_pre: string | null;
  type_post: string | null;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  node_count: number;
  edge_count: number;
  is_partial: boolean;
  dataset: string;
  dataset_version: string;
  center_body_id: number;
}

export interface DataSourceStatus {
  local_data_available: boolean;
  neuprint_configured: boolean;
  neuprint_reachable: boolean | null;
  neuprint_dataset_ok: boolean | null;
  detail: string | null;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'unavailable';
  application: string;
  version: string;
  dataset: string;
  data_source: DataSourceStatus;
}

export interface ApiError {
  error: string;
  message: string;
  dataset?: string;
}

/** Discriminated union for async state */
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };
