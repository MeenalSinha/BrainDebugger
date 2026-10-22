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

// ── V3: Pathway Tracer & Downstream Cascade ─────────────────────────────────

export type PathRankingStrategy = 'shortest' | 'weight_prioritized';

export interface PathNode {
  body_id: number;
  type: string | null;
  instance: string | null;
  superclass: string | null;
  hop: number;
}

export interface PathEdge {
  body_pre: number;
  body_post: number;
  weight: number;
  type_pre: string | null;
  type_post: string | null;
  instance_pre: string | null;
  instance_post: string | null;
  relative_weight_fraction: number | null;
}

export interface PathItem {
  rank: number;
  hops: number;
  nodes: PathNode[];
  edges: PathEdge[];
  score: number | null;
  log_cost: number | null;
  total_weight: number;
  bottleneck_weight: number;
}

export interface PathwaySearchResponse {
  source_body_id: number;
  target_body_id: number;
  strategy: string;
  max_hops: number;
  max_paths: number;
  paths: PathItem[];
  returned_count: number;
  status: 'found' | 'no_path_found' | 'same_node' | 'partial';
  is_partial: boolean;
  limit_reason: string | null;
  explored_nodes: number;
  explored_edges: number;
  dataset: string;
  source_file: string;
  coverage_notice: string;
  scientific_qualification: string;
}

export interface CascadeHopLayer {
  hop: number;
  newly_reached_nodes: number;
  cumulative_nodes: number;
  layer_edges: number;
  layer_weight: number;
}

export interface CascadeNode {
  body_id: number;
  type: string | null;
  instance: string | null;
  superclass: string | null;
  hop: number;
  in_degree: number;
  out_degree: number;
}

export interface CascadeEdge {
  body_pre: number;
  body_post: number;
  weight: number;
  pre_hop: number;
  post_hop: number;
}

export interface DownstreamCascadeResponse {
  source_body_id: number;
  max_hops: number;
  max_nodes: number;
  max_edges: number;
  min_weight: number | null;
  total_unique_nodes: number;
  total_edges: number;
  layers: CascadeHopLayer[];
  nodes: CascadeNode[];
  edges: CascadeEdge[];
  is_truncated: boolean;
  truncation_reason: string | null;
  dataset: string;
  source_file: string;
  coverage_notice: string;
  scientific_qualification: string;
}

