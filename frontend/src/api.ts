/**
 * BrainDebugger — Typed API Client
 *
 * All data access goes through this module.
 * The neuPrint token never leaves the backend.
 * All requests go to our FastAPI backend via the Vite proxy.
 */

import type {
  BiologicalConcept,
  ConceptCandidateNeuron,
  ConceptDetailResponse,
  ConnectionListResponse,
  ConnectivitySummaryResponse,
  ControlledExperimentRequest,
  ControlledExperimentResponse,
  DownstreamCascadeResponse,
  EvidenceSource,
  GraphResponse,
  HealthResponse,
  InterventionConfig,
  KnowledgeStatusResponse,
  KnowledgeValidationReport,
  Neuron,
  NeuronSearchResponse,
  PathwaySearchResponse,
  PerturbationComparisonRequest,
  PerturbationComparisonResponse,
  PerturbationValidationResponse,
  SupportedInvestigation,
  InvestigationPlan,
  PlanGenerationRequest,
  PlanValidationRequest,
  PlanValidationResponse,
  NeuroQueryConfigResponse,
  IntentTaxonomyItem,
  CircuitDiscoveryResult,
  InvestigationExecutionRequest,
  InvestigationExecutionRecord,
  CircuitSubgraphExpansionRequest,
  CircuitSubgraphExpansionResponse,
  CircuitComparisonRequest,
  CircuitComparisonResult,
  RankingProfile,
  RobustnessAnalysisRequest,
  RobustnessAnalysisResponse,
  HypothesisSuggestion,
  HypothesisSuggestRequest,
  HypothesisRecord,
  HypothesisCreateRequest,
  HypothesisUpdateRequest,
  HypothesisStatusTransitionRequest,
  HypothesisEvidence,
  EvidenceCreateRequest,
  AlternativeExplanation,
  AlternativeCreateRequest,
  FollowupStudy,
  StudyCreateRequest,
  StudyExecuteRequest,
  StudyEvaluationResult,
  ResearchProject,
  ProjectCreateRequest,
  ResearchNotebookExport,
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

async function put<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody?.detail?.message) detail = errBody.detail.message;
      else if (typeof errBody?.detail === 'string') detail = errBody.detail;
      else if (errBody?.message) detail = errBody.message;
    } catch { /* ignore */ }
    throw new ApiClientError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

async function del<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    signal,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody?.detail?.message) detail = errBody.detail.message;
      else if (typeof errBody?.detail === 'string') detail = errBody.detail;
      else if (errBody?.message) detail = errBody.message;
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

  getKnowledgeStatus(signal?: AbortSignal): Promise<KnowledgeStatusResponse> {
    return get<KnowledgeStatusResponse>('/api/knowledge/status', signal);
  },

  listConcepts(params?: {
    domain?: string;
    evidenceStatus?: string;
    q?: string;
  }, signal?: AbortSignal): Promise<BiologicalConcept[]> {
    const p = new URLSearchParams();
    if (params?.domain) p.set('domain', params.domain);
    if (params?.evidenceStatus) p.set('evidence_status', params.evidenceStatus);
    if (params?.q?.trim()) p.set('q', params.q.trim());
    const queryStr = p.toString();
    return get<BiologicalConcept[]>(`/api/knowledge/concepts${queryStr ? '?' + queryStr : ''}`, signal);
  },

  getConceptDetail(conceptId: string, signal?: AbortSignal): Promise<ConceptDetailResponse> {
    return get<ConceptDetailResponse>(`/api/knowledge/concepts/${encodeURIComponent(conceptId)}`, signal);
  },

  getConceptCandidates(conceptId: string, params?: {
    limit?: number;
    offset?: number;
  }, signal?: AbortSignal): Promise<ConceptCandidateNeuron[]> {
    const p = new URLSearchParams();
    if (params?.limit !== undefined) p.set('limit', String(params.limit));
    if (params?.offset !== undefined) p.set('offset', String(params.offset));
    const queryStr = p.toString();
    return get<ConceptCandidateNeuron[]>(`/api/knowledge/concepts/${encodeURIComponent(conceptId)}/candidates${queryStr ? '?' + queryStr : ''}`, signal);
  },

  listSupportedInvestigations(signal?: AbortSignal): Promise<SupportedInvestigation[]> {
    return get<SupportedInvestigation[]>('/api/knowledge/investigations', signal);
  },

  getEvidenceSource(sourceId: string, signal?: AbortSignal): Promise<EvidenceSource> {
    return get<EvidenceSource>(`/api/knowledge/sources/${encodeURIComponent(sourceId)}`, signal);
  },

  auditKnowledgeCatalog(signal?: AbortSignal): Promise<KnowledgeValidationReport> {
    return get<KnowledgeValidationReport>('/api/knowledge/audit', signal);
  },

  generateInvestigationPlan(req: PlanGenerationRequest, signal?: AbortSignal): Promise<InvestigationPlan> {
    return post<InvestigationPlan>('/api/neuroquery/plan', req, signal);
  },

  validateInvestigationPlan(req: PlanValidationRequest, signal?: AbortSignal): Promise<PlanValidationResponse> {
    return post<PlanValidationResponse>('/api/neuroquery/validate', req, signal);
  },

  getNeuroQueryConfig(signal?: AbortSignal): Promise<NeuroQueryConfigResponse> {
    return get<NeuroQueryConfigResponse>('/api/neuroquery/config', signal);
  },

  listNeuroQueryIntents(signal?: AbortSignal): Promise<IntentTaxonomyItem[]> {
    return get<IntentTaxonomyItem[]>('/api/neuroquery/intents', signal);
  },

  executeInvestigationPlan(req: InvestigationExecutionRequest, signal?: AbortSignal): Promise<CircuitDiscoveryResult> {
    return post<CircuitDiscoveryResult>('/api/neuroquery/execute', req, signal);
  },

  getInvestigationExecution(executionId: string, signal?: AbortSignal): Promise<InvestigationExecutionRecord> {
    return get<InvestigationExecutionRecord>(`/api/neuroquery/executions/${encodeURIComponent(executionId)}`, signal);
  },

  expandCircuitSubgraph(req: CircuitSubgraphExpansionRequest, signal?: AbortSignal): Promise<CircuitSubgraphExpansionResponse> {
    return post<CircuitSubgraphExpansionResponse>('/api/neuroquery/expand-subgraph', req, signal);
  },

  compareCircuitInvestigations(req: CircuitComparisonRequest, signal?: AbortSignal): Promise<CircuitComparisonResult> {
    return post<CircuitComparisonResult>('/api/neuroquery/compare', req, signal);
  },

  getRobustnessProfiles(signal?: AbortSignal): Promise<RankingProfile[]> {
    return get<RankingProfile[]>('/api/neuroquery/robustness/profiles', signal);
  },

  analyzeCircuitRobustness(req: RobustnessAnalysisRequest, signal?: AbortSignal): Promise<RobustnessAnalysisResponse> {
    return post<RobustnessAnalysisResponse>('/api/neuroquery/robustness/analyze', req, signal);
  },

  getRobustnessAnalysis(analysisId: string, signal?: AbortSignal): Promise<RobustnessAnalysisResponse> {
    return get<RobustnessAnalysisResponse>(`/api/neuroquery/robustness/${encodeURIComponent(analysisId)}`, signal);
  },

  // ── V11: Hypothesis Workbench & Research Notebook ─────────────────────────

  suggestHypotheses(req: HypothesisSuggestRequest, signal?: AbortSignal): Promise<HypothesisSuggestion[]> {
    return post<HypothesisSuggestion[]>('/api/neuroquery/hypotheses/suggest', req, signal);
  },

  listHypotheses(
    params?: { project_id?: string; category?: string; status?: string },
    signal?: AbortSignal
  ): Promise<HypothesisRecord[]> {
    const sp = new URLSearchParams();
    if (params?.project_id) sp.set('project_id', params.project_id);
    if (params?.category) sp.set('category', params.category);
    if (params?.status) sp.set('status', params.status);
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return get<HypothesisRecord[]>(`/api/neuroquery/hypotheses${qs}`, signal);
  },

  createHypothesis(req: HypothesisCreateRequest, signal?: AbortSignal): Promise<HypothesisRecord> {
    return post<HypothesisRecord>('/api/neuroquery/hypotheses', req, signal);
  },

  getHypothesis(hypothesisId: string, signal?: AbortSignal): Promise<HypothesisRecord> {
    return get<HypothesisRecord>(`/api/neuroquery/hypotheses/${encodeURIComponent(hypothesisId)}`, signal);
  },

  updateHypothesis(hypothesisId: string, req: HypothesisUpdateRequest, signal?: AbortSignal): Promise<HypothesisRecord> {
    return put<HypothesisRecord>(`/api/neuroquery/hypotheses/${encodeURIComponent(hypothesisId)}`, req, signal);
  },

  deleteHypothesis(hypothesisId: string, signal?: AbortSignal): Promise<{ status: string; hypothesis_id: string }> {
    return del<{ status: string; hypothesis_id: string }>(`/api/neuroquery/hypotheses/${encodeURIComponent(hypothesisId)}`, signal);
  },

  transitionHypothesisStatus(
    hypothesisId: string,
    req: HypothesisStatusTransitionRequest,
    signal?: AbortSignal
  ): Promise<HypothesisRecord> {
    return post<HypothesisRecord>(`/api/neuroquery/hypotheses/${encodeURIComponent(hypothesisId)}/transition`, req, signal);
  },

  attachEvidence(hypothesisId: string, req: EvidenceCreateRequest, signal?: AbortSignal): Promise<HypothesisEvidence> {
    return post<HypothesisEvidence>(`/api/neuroquery/hypotheses/${encodeURIComponent(hypothesisId)}/evidence`, req, signal);
  },

  removeEvidence(hypothesisId: string, evidenceId: string, signal?: AbortSignal): Promise<{ status: string; evidence_id: string }> {
    return del<{ status: string; evidence_id: string }>(
      `/api/neuroquery/hypotheses/${encodeURIComponent(hypothesisId)}/evidence/${encodeURIComponent(evidenceId)}`,
      signal
    );
  },

  addAlternative(
    hypothesisId: string,
    req: AlternativeCreateRequest,
    signal?: AbortSignal
  ): Promise<AlternativeExplanation> {
    return post<AlternativeExplanation>(`/api/neuroquery/hypotheses/${encodeURIComponent(hypothesisId)}/alternatives`, req, signal);
  },

  createFollowupStudy(hypothesisId: string, req: StudyCreateRequest, signal?: AbortSignal): Promise<FollowupStudy> {
    return post<FollowupStudy>(`/api/neuroquery/hypotheses/${encodeURIComponent(hypothesisId)}/studies`, req, signal);
  },

  executeFollowupStudy(
    hypothesisId: string,
    studyId: string,
    req: StudyExecuteRequest,
    signal?: AbortSignal
  ): Promise<StudyEvaluationResult> {
    return post<StudyEvaluationResult>(
      `/api/neuroquery/hypotheses/${encodeURIComponent(hypothesisId)}/studies/${encodeURIComponent(studyId)}/execute`,
      req,
      signal
    );
  },

  async getHypothesisMarkdownReport(hypothesisId: string, signal?: AbortSignal): Promise<string> {
    const res = await fetch(`${BASE}/api/neuroquery/hypotheses/${encodeURIComponent(hypothesisId)}/report`, { signal });
    if (!res.ok) throw new Error(`Report generation failed: HTTP ${res.status}`);
    return res.text();
  },

  listResearchProjects(signal?: AbortSignal): Promise<ResearchProject[]> {
    return get<ResearchProject[]>('/api/research/projects', signal);
  },

  createResearchProject(req: ProjectCreateRequest, signal?: AbortSignal): Promise<ResearchProject> {
    return post<ResearchProject>('/api/research/projects', req, signal);
  },

  getResearchProject(projectId: string, signal?: AbortSignal): Promise<ResearchProject> {
    return get<ResearchProject>(`/api/research/projects/${encodeURIComponent(projectId)}`, signal);
  },

  exportResearchNotebook(projectId?: string, signal?: AbortSignal): Promise<ResearchNotebookExport> {
    const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
    return get<ResearchNotebookExport>(`/api/research/notebook/export${qs}`, signal);
  },

  importResearchNotebook(
    exportData: ResearchNotebookExport,
    signal?: AbortSignal
  ): Promise<{ status: string; imported_projects: number; imported_hypotheses: number }> {
    return post<{ status: string; imported_projects: number; imported_hypotheses: number }>(
      '/api/research/notebook/import',
      exportData,
      signal
    );
  },
};



