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

// ── V4: Neural Debugger & Trace Engine ──────────────────────────────────────

export type TraceStatus = 'ready' | 'running' | 'paused' | 'completed' | 'stopped' | 'error';

export type BreakpointType = 'neuron' | 'hop' | 'annotation' | 'weight';

export interface Breakpoint {
  id: string;
  name: string;
  type: BreakpointType;
  enabled: boolean;
  neuronBodyId?: number;
  hopIndex?: number;
  annotationField?: 'type' | 'superclass' | 'instance';
  annotationValue?: string;
  minWeightThreshold?: number;
  hitCount: number;
  lastHitStep?: number;
}

export type TraceEventType =
  | 'session_created'
  | 'trace_started'
  | 'node_entered'
  | 'edge_traversed'
  | 'breakpoint_created'
  | 'breakpoint_updated'
  | 'breakpoint_toggled'
  | 'breakpoint_removed'
  | 'breakpoint_triggered'
  | 'trace_paused'
  | 'trace_resumed'
  | 'step_advanced'
  | 'history_navigation'
  | 'trace_stopped'
  | 'trace_completed'
  | 'trace_reset'
  | 'trace_error';

export interface TraceEvent {
  id: string;
  sessionId: string;
  runId: string;
  sequenceNumber: number;
  timestamp: string; // ISO 8601 UTC
  type: TraceEventType;
  step: number;
  hopIndex: number;
  currentNodeId?: number;
  currentEdgeKey?: string;
  breakpointId?: string;
  breakpointDetails?: string;
  description: string;
  traceStatus: TraceStatus;
}

export interface TraceSession {
  sessionId: string;
  runId: string;
  dataset: string;
  sourceBodyId: number;
  targetBodyId: number;
  pathRank: number;
  path: PathItem;
  currentStep: number; // Index in path.nodes (0 .. path.nodes.length - 1)
  status: TraceStatus;
  breakpoints: Breakpoint[];
  events: TraceEvent[];
  createdAt: string;
  lastTransitionAt: string;
  playbackSpeedMs: number;
  lastPausedReason?: string;
}

export interface ExportedTraceData {
  exportVersion: string;
  exportedAt: string;
  session: {
    sessionId: string;
    runId: string;
    dataset: string;
    sourceBodyId: number;
    targetBodyId: number;
    pathRank: number;
    totalHops: number;
    totalSynapticWeight: number;
    finalStatus: TraceStatus;
    createdAt: string;
    lastTransitionAt: string;
  };
  path: PathItem;
  breakpoints: Breakpoint[];
  events: TraceEvent[];
  scientificQualifications: string[];
}

// ── V5: Perturbation Lab Types ───────────────────────────────────────────────

export interface DisabledNeuron {
  body_id: number;
  label?: string | null;
  reason?: string | null;
}

export interface DisabledEdge {
  body_pre: number;
  body_post: number;
  weight?: number | null;
  label?: string | null;
}

export interface InterventionConfig {
  disabled_neurons: number[];
  disabled_edges: DisabledEdge[];
  analysis_scope?: string;
  experiment_name?: string | null;
  random_seed?: number | null;
}

export interface PerturbationValidationResponse {
  valid: boolean;
  verified_neurons: number[];
  unverified_neurons: number[];
  verified_edges: DisabledEdge[];
  unverified_edges: DisabledEdge[];
  incident_edges_disabled_count: number;
  message: string;
}

export interface PathComparisonResult {
  source_body_id: number;
  target_body_id: number;
  strategy: string;
  baseline_route_exists: boolean;
  baseline_hops: number | null;
  baseline_total_weight: number | null;
  baseline_paths_count: number;
  perturbed_route_exists: boolean;
  perturbed_hops: number | null;
  perturbed_total_weight: number | null;
  perturbed_paths_count: number;
  original_path_survived: boolean;
  alternative_path_found: boolean;
  delta_hops: number | null;
  endpoint_disabled: boolean;
  disabled_endpoint_id: number | null;
  baseline_paths: PathItem[];
  perturbed_paths: PathItem[];
}

export interface ReachabilityComparisonResult {
  source_body_id: number;
  max_hops: number;
  baseline_reachable_count: number;
  perturbed_reachable_count: number;
  delta_reachability: number;
  retention_fraction: number;
  lost_node_ids: number[];
  lost_nodes_per_hop: Record<number, number>;
  baseline_layers: CascadeHopLayer[];
  perturbed_layers: CascadeHopLayer[];
  baseline_cascade: DownstreamCascadeResponse | null;
  perturbed_cascade: DownstreamCascadeResponse | null;
}

export interface PerturbationComparisonRequest {
  interventions: InterventionConfig;
  source_body_id: number;
  target_body_id?: number | null;
  max_hops?: number;
  max_paths?: number;
  strategy?: string;
  min_weight?: number | null;
  max_cascade_nodes?: number;
  include_cascade_graph?: boolean;
}

export interface PerturbationComparisonResponse {
  experiment_id: string;
  timestamp: string;
  dataset: string;
  source_body_id: number;
  target_body_id?: number | null;
  interventions: InterventionConfig;
  path_comparison: PathComparisonResult | null;
  reachability_comparison: ReachabilityComparisonResult | null;
  summary_text: string;
  scientific_notice: string;
}

export interface MultiLevelResult {
  level: number;
  disabled_neurons: number[];
  reachable_count: number;
  delta_reachability: number;
  retention_fraction: number;
  path_exists: boolean | null;
  path_hops: number | null;
}

export interface ControlledExperimentRequest {
  experiment_type: 'random_nodes' | 'high_degree_nodes' | 'random_edges' | 'multi_level';
  scope_source_id: number;
  scope_target_id?: number | null;
  max_hops?: number;
  removal_count?: number;
  degree_type?: 'in' | 'out' | 'total';
  random_seed?: number | null;
  levels?: number[] | null;
}

export interface ControlledExperimentResponse {
  experiment_id: string;
  experiment_type: string;
  random_seed: number | null;
  selected_interventions: InterventionConfig;
  comparison: PerturbationComparisonResponse;
  multi_level_results?: MultiLevelResult[] | null;
}

// ── V6: NeuroQuery Biological Knowledge Layer Types ─────────────────────────

export interface EvidenceSource {
  source_id: string;
  title: string;
  authors: string[] | string;
  year?: number | null;
  doi?: string | null;
  url?: string | null;
  source_type: 'peer_reviewed_paper' | 'official_documentation' | 'dataset_descriptor' | 'curated_annotation';
  source_version?: string | null;
  key_findings?: string | null;
  relevant_section?: string | null;
  notes?: string | null;
}

export interface ConceptMapping {
  mapping_id: string;
  concept_id: string;
  target_field: 'type' | 'instance' | 'superclass' | 'body_id';
  match_type: 'exact' | 'prefix' | 'set';
  target_values: string[];
  dataset_version: string;
  evidence_type: string;
  evidence_source_ids: string[];
  rationale: string;
  known_limitations?: string | null;
  review_status: 'verified' | 'partially_supported' | 'unsupported' | 'requires_review';
  mapping_version: string;
}

export interface BiologicalConcept {
  concept_id: string;
  display_name: string;
  description: string;
  domain: string;
  related_concepts: string[];
  evidence_status: 'verified' | 'partially_supported' | 'unsupported' | 'requires_review';
  mapping_ids: string[];
  source_references: string[];
  dataset_compatibility: 'compatible' | 'partial_coverage' | 'incompatible' | 'untested';
  coverage_notes?: string | null;
  limitations?: string | null;
  catalog_version: string;
}

export interface SupportedInvestigation {
  investigation_id: string;
  name: string;
  description: string;
  required_concepts: string[];
  required_evidence_types: string[];
  required_dataset_fields: string[];
  required_graph_operations: string[];
  supported_parameters: string[];
  graph_scope_constraints: string;
  expected_result_structure: string;
  limitations: string;
  status: 'supported' | 'partially_supported' | 'unsupported' | 'requires_review';
  version: string;
}

export interface KnowledgeCatalogManifest {
  catalog_id: string;
  catalog_name: string;
  version: string;
  description: string;
  dataset_version: string;
  created_at: string;
  last_updated: string;
  schema_version: string;
  maintainer?: string | null;
  total_concepts: number;
  total_sources: number;
  total_mappings: number;
  total_investigations: number;
}

export interface KnowledgeStatusResponse {
  catalog_id: string;
  catalog_name: string;
  catalog_version: string;
  dataset_version: string;
  catalog_loaded: boolean;
  total_concepts: number;
  total_evidence_sources: number;
  total_mappings: number;
  total_investigations: number;
  supported_investigation_count: number;
  validation_status: string;
  data_availability_notice: string;
}

export interface ConceptCandidateNeuron {
  body_id: number;
  cell_type?: string | null;
  instance?: string | null;
  superclass?: string | null;
  status?: string | null;
  consensus_nt?: string | null;
  matched_mapping_id: string;
  matched_field: string;
  matched_value: string;
  evidence_status: string;
  evidence_source_ids: string[];
}

export interface ConceptDetailResponse {
  concept: BiologicalConcept;
  sources: EvidenceSource[];
  mappings: ConceptMapping[];
  supported_investigations: SupportedInvestigation[];
  candidate_count?: number | null;
  dataset_compatibility_status: string;
}

export interface KnowledgeValidationReport {
  valid: boolean;
  catalog_version: string;
  dataset_version: string;
  errors: string[];
  warnings: string[];
  concept_count: number;
  verified_concept_count: number;
  compatible_mapping_count: number;
  incompatible_mapping_count: number;
  unresolved_references: string[];
  summary: string;
}

export interface ConceptsListResponse {
  total: number;
  domain_filter?: string | null;
  evidence_status_filter?: string | null;
  compatibility_filter?: string | null;
  search_query?: string | null;
  concepts: BiologicalConcept[];
}

export interface CandidateNeuronsResponse {
  concept_id: string;
  total: number;
  returned: number;
  limit: number;
  offset: number;
  candidates: ConceptCandidateNeuron[];
}

export interface SupportedInvestigationsResponse {
  total: number;
  investigations: SupportedInvestigation[];
}


