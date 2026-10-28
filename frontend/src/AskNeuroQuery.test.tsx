import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AskNeuroQuery } from './components/AskNeuroQuery';
import { api } from './api';
import type {
  InvestigationPlan,
  NeuroQueryConfigResponse,
  PlanValidationResponse,
} from './types';

// Mock API client
vi.mock('./api', () => ({
  api: {
    getNeuroQueryConfig: vi.fn(),
    generateInvestigationPlan: vi.fn(),
    validateInvestigationPlan: vi.fn(),
    listNeuroQueryIntents: vi.fn(),
    executeInvestigationPlan: vi.fn(),
    getInvestigationExecution: vi.fn(),
    expandCircuitSubgraph: vi.fn(),
    compareCircuitInvestigations: vi.fn(),
    findPaths: vi.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(public status: number, public detail: string) {
      super(detail);
    }
  },
}));

describe('AskNeuroQuery (V7) Component', () => {
  const mockConfig: NeuroQueryConfigResponse = {
    provider: 'mock',
    model: 'deterministic-cns-nlp',
    is_configured: true,
    timeout_seconds: 30,
    max_retries: 2,
    supported_intents: [
      'circuit_discovery',
      'inspect_neuron',
      'structural_pathway_search',
      'downstream_reachability',
      'structural_intervention_analysis',
      'general_question',
      'unsupported_biological_question',
      'ambiguous_question',
    ],
    notice: 'Mock LLM provider is active; running deterministic biological NLP offline.',
  };

  const mockPlan: InvestigationPlan = {
    plan_id: 'plan-test-12345',
    plan_schema_version: '1.0.0',
    original_question: 'How does the fly visual system detect directional motion?',
    normalized_question: 'How does the fly visual system detect directional motion?',
    intent: 'circuit_discovery',
    confidence_score: 0.95,
    confidence_explanation: 'Matches cataloged direction-selective visual motion detection concepts (T4/T5 & Mi1/Tm3).',
    concept_ids: ['visual_motion_detection_t4_t5'],
    resolved_concepts: [
      {
        concept_id: 'visual_motion_detection_t4_t5',
        display_name: 'Visual Motion Detection (T4/T5 Directional Circuit)',
        description: 'Computation of directional optical flow in the Drosophila optic lobe.',
        domain: 'visual_processing',
        related_concepts: [],
        evidence_status: 'verified',
        mapping_ids: ['map-motion-t4-t5'],
        source_references: ['src-schlegel-2024'],
        dataset_compatibility: 'compatible',
        catalog_version: '1.0.0',
      },
    ],
    investigation_id: 'inv-circuit-discovery',
    investigation: {
      investigation_id: 'inv-circuit-discovery',
      name: 'Circuit Candidate Discovery & Neighborhood Retrieval',
      description: 'Locate candidate neurons matching evidence-grounded biological concept mappings.',
      required_concepts: ['any'],
      required_evidence_types: ['functional_connectomics'],
      required_dataset_fields: ['type', 'instance'],
      required_graph_operations: ['neuron_search', 'get_neighborhood'],
      supported_parameters: ['max_nodes', 'min_weight'],
      graph_scope_constraints: 'Bounded to local 1-hop presynaptic and postsynaptic partners.',
      expected_result_structure: 'List of candidate neurons with body IDs.',
      limitations: 'Retrieves structural synaptic partners within the loaded subset.',
      status: 'supported',
      version: '1.0.0',
    },
    requested_entities: { cell_types: ['T4a', 'T5a'] },
    parameters: { max_nodes: 50, max_hops: 3 },
    planned_operations: [
      {
        operation_id: 'op-concept-mapping',
        tool_name: 'KnowledgeService.get_candidates_for_concept',
        description: 'Resolve candidate neurons matching concept mappings in MaleCNS v1.0.',
        parameters: { concept_ids: ['visual_motion_detection_t4_t5'] },
        prerequisites: [],
        is_v8_execution: false,
      },
      {
        operation_id: 'op-subgraph-expansion',
        tool_name: 'ConnectomeGraph.expand_subgraph',
        description: 'Extract synaptic adjacency between candidate neuron populations.',
        parameters: { max_hops: 3, max_nodes: 50 },
        prerequisites: ['op-concept-mapping'],
        is_v8_execution: true,
      },
    ],
    required_dataset_fields: ['body_id', 'type', 'instance'],
    required_evidence_sources: ['src-schlegel-2024'],
    evidence_sources: [
      {
        source_id: 'src-schlegel-2024',
        title: 'Whole-brain connectome of Drosophila melanogaster',
        authors: 'Schlegel, P., Yin, Y., Bates, A. S., et al.',
        year: 2024,
        journal: 'Nature',
        doi: '10.1038/s41586-024-07968-y',
        url: 'https://doi.org/10.1038/s41586-024-07968-y',
        source_type: 'peer_reviewed_paper',
      },
    ],
    support_status: 'ready_for_review',
    clarification_needed: false,
    clarification_questions: [],
    limitations: [
      'V7 Plan Boundary: This is a structured investigation plan. Circuit discovery, subgraph assembly, and graph traversal will be executed in V8.',
    ],
    validation_findings: ['All parameters bounded within supported connectome constraints.'],
    explanation: 'Plan investigation for direction-selective elementary motion detection mediated by T4/T5.',
    knowledge_catalog_version: '1.0.0',
    dataset_version: 'male-cns:v1.0',
    created_at: '2026-10-28T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getNeuroQueryConfig).mockResolvedValue(mockConfig);
    vi.mocked(api.generateInvestigationPlan).mockResolvedValue(mockPlan);
    vi.mocked(api.validateInvestigationPlan).mockResolvedValue({
      valid: true,
      plan_id: 'plan-test-12345',
      errors: [],
      warnings: [],
      support_status: 'ready_for_review',
      summary: 'Investigation plan successfully validated and ready for review.',
    });
  });

  it('renders initial workspace controls and provider configuration', async () => {
    render(<AskNeuroQuery />);

    expect(screen.getByText('Ask NeuroQuery')).toBeDefined();
    expect(screen.getByText('Version 7.0')).toBeDefined();
    expect(screen.getByPlaceholderText(/How does the fruit fly visual system detect directional motion/i)).toBeDefined();
    expect(screen.getByText('Interpret Question')).toBeDefined();

    await waitFor(() => {
      expect(api.getNeuroQueryConfig).toHaveBeenCalled();
    });
    expect(screen.getByText(/deterministic-cns-nlp/i)).toBeDefined();
  });

  it('submits a question and renders the structured investigation plan', async () => {
    render(<AskNeuroQuery />);

    const input = screen.getByPlaceholderText(/How does the fruit fly visual system detect directional motion/i);
    fireEvent.change(input, { target: { value: 'How does the fly visual system detect directional motion?' } });

    const submitBtn = screen.getByRole('button', { name: /Interpret Question/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.generateInvestigationPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          question: 'How does the fly visual system detect directional motion?',
        }),
        expect.any(AbortSignal)
      );
    });

    // Check plan rendering
    await waitFor(() => {
      expect(screen.getByText('plan-test-12345')).toBeDefined();
    });
    expect(screen.getByText('Ready for Review')).toBeDefined();
    expect(screen.getByText('Circuit Discovery (V8 Execution)')).toBeDefined();
    expect(screen.getByText('Visual Motion Detection (T4/T5 Directional Circuit)')).toBeDefined();
    expect(screen.getByText('KnowledgeService.get_candidates_for_concept')).toBeDefined();
    expect(screen.getByText('ConnectomeGraph.expand_subgraph')).toBeDefined();
    expect(screen.getByText('V8 Execution')).toBeDefined();
    expect(screen.getByText('V7 Prepared')).toBeDefined();
    expect(screen.getByText('Whole-brain connectome of Drosophila melanogaster')).toBeDefined();
  });

  it('renders clarification panel for ambiguous questions and allows user refinement', async () => {
    const ambiguousPlan: InvestigationPlan = {
      ...mockPlan,
      plan_id: 'plan-ambig-999',
      original_question: 'Show me the visual circuit.',
      intent: 'ambiguous_question',
      support_status: 'needs_clarification',
      clarification_needed: true,
      clarification_questions: [
        'Would you like to investigate (1) direction-selective motion detection (T4/T5), (2) color processing (Dm8/Dm9), or (3) looming visual escape (LC4)?',
      ],
      planned_operations: [],
    };

    vi.mocked(api.generateInvestigationPlan).mockResolvedValueOnce(ambiguousPlan);

    render(<AskNeuroQuery />);

    const input = screen.getByPlaceholderText(/How does the fruit fly visual system detect directional motion/i);
    fireEvent.change(input, { target: { value: 'Show me the visual circuit.' } });

    const submitBtn = screen.getByRole('button', { name: /Interpret Question/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Clarification Required to Proceed')).toBeDefined();
    });
    expect(screen.getByText(/Would you like to investigate/i)).toBeDefined();

    // Check preset clarification options
    const motionPreset = screen.getByText(/Directional motion detection \(T4\/T5\)/i);
    expect(motionPreset).toBeDefined();

    // Click preset
    fireEvent.click(motionPreset);
    await waitFor(() => {
      expect(api.generateInvestigationPlan).toHaveBeenCalledTimes(2);
    });
  });

  it('triggers plan validation audit through the backend API', async () => {
    render(<AskNeuroQuery />);

    const input = screen.getByPlaceholderText(/How does the fruit fly visual system detect directional motion/i);
    fireEvent.change(input, { target: { value: 'Motion query' } });
    fireEvent.click(screen.getByRole('button', { name: /Interpret Question/i }));

    await waitFor(() => {
      expect(screen.getByText('plan-test-12345')).toBeDefined();
    });

    const validateBtn = screen.getByRole('button', { name: /Validate Plan/i });
    fireEvent.click(validateBtn);

    await waitFor(() => {
      expect(api.validateInvestigationPlan).toHaveBeenCalledWith({ plan: mockPlan });
    });
    await waitFor(() => {
      expect(screen.getByText('Investigation plan successfully validated and ready for review.')).toBeDefined();
    });
  });

  it('triggers JSON plan download on export', async () => {
    // Mock URL.createObjectURL and URL.revokeObjectURL
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.fn();
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;

    render(<AskNeuroQuery />);

    const input = screen.getByPlaceholderText(/How does the fruit fly visual system detect directional motion/i);
    fireEvent.change(input, { target: { value: 'Motion query' } });
    fireEvent.click(screen.getByRole('button', { name: /Interpret Question/i }));

    await waitFor(() => {
      expect(screen.getByText('plan-test-12345')).toBeDefined();
    });

    const exportBtn = screen.getByRole('button', { name: /Export JSON/i });
    fireEvent.click(exportBtn);

    expect(createObjectURL).toHaveBeenCalled();
  });

  it('executes validated plan and renders discovered circuit view with candidate rankings', async () => {
    const mockResult = {
      execution_id: 'exec-test-8888',
      plan_id: 'plan-test-12345',
      question: 'How does the fly visual system detect directional motion?',
      intent: 'circuit_discovery' as const,
      resolved_concepts: mockPlan.resolved_concepts,
      candidate_neurons: [
        {
          body_id: 20001,
          cell_type: 'T4a',
          instance: 'T4a_R',
          superclass: 'visual',
          consensus_nt: 'acetylcholine',
          matched_concept_ids: ['visual_motion_detection_t4_t5'],
          matched_mapping_ids: ['map-motion-t4-t5'],
          matched_field: 'type',
          matched_value: 'T4a',
          evidence_status: 'verified',
          evidence_tier: 'Tier 1 (Verified)',
          subgraph_in_degree: 2,
          subgraph_out_degree: 3,
          subgraph_total_weight: 45,
          ranking_score: 1072.5,
          explanation: 'Rank #1: Tier 1 (Verified) annotation match (type=T4a) with 5 directed connections and 45 synapses.',
        },
      ],
      subgraph_nodes: [
        {
          id: '20001',
          body_id: 20001,
          cell_type: 'T4a',
          instance: 'T4a_R',
          superclass: 'visual',
          consensus_nt: 'acetylcholine',
          is_candidate: true,
          matched_concept_ids: ['visual_motion_detection_t4_t5'],
          evidence_status: 'verified',
          degree: 5,
          total_weight: 45,
        },
      ],
      subgraph_edges: [],
      structural_metrics: {
        total_nodes: 1,
        total_edges: 0,
        candidate_nodes_count: 1,
        partner_nodes_count: 0,
        density: 0.0,
        average_weight: 0.0,
        max_weight: 0,
        top_hub_body_id: 20001,
        connected_components: 1,
      },
      ranking_method: 'dual_criteria_evidence_and_synaptic_weight',
      evidence_sources: mockPlan.evidence_sources,
      dataset_version: 'male-cns:v1.0',
      catalog_version: '1.0.0',
      source_coverage: 'Traced-only synaptic connection weights from Janelia MaleCNS v1.0',
      limitations: ['Traced-only synaptic connection weights from Janelia MaleCNS v1.0.'],
      warnings: [],
      execution_status: 'completed' as const,
      execution_duration_ms: 18.5,
      completed_at: '2026-10-28T00:00:00Z',
      is_partial: false,
    };

    vi.mocked(api.executeInvestigationPlan).mockResolvedValue(mockResult);

    render(<AskNeuroQuery />);

    const input = screen.getByPlaceholderText(/How does the fruit fly visual system detect directional motion/i);
    fireEvent.change(input, { target: { value: 'Motion query' } });
    fireEvent.click(screen.getByRole('button', { name: /Interpret Question/i }));

    await waitFor(() => {
      expect(screen.getByText('plan-test-12345')).toBeDefined();
    });

    const runBtn = screen.getByRole('button', { name: /Run Investigation/i });
    expect(runBtn).toBeDefined();
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(api.executeInvestigationPlan).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText('Discovered Neural Circuit')).toBeDefined();
      expect(screen.getByText('exec-test-8888')).toBeDefined();
      expect(screen.getByText('Transparent Candidate Neuron Rankings')).toBeDefined();
      expect(screen.getByText('Calculated Structural Graph Metrics')).toBeDefined();
    });
  });

  it('renders V9 exploration controls, tabs, and switches to Reasoning Trace and Compare views', async () => {
    const mockResult = {
      execution_id: 'exec-v9-demo',
      question: 'Explore visual motion circuit',
      intent: 'circuit_discovery' as const,
      resolved_concepts: [{ concept_id: 'motion_detection', display_name: 'Motion Detection', description: 'desc', domain: 'visual', related_concepts: [], evidence_status: 'verified' as const, mapping_ids: [], source_references: [], dataset_compatibility: 'compatible' as const, catalog_version: '1.0.0' }],
      candidate_neurons: [
        {
          body_id: 10001,
          cell_type: 'T4a',
          matched_concept_ids: ['motion_detection'],
          matched_mapping_ids: ['map-t4a'],
          matched_field: 'type',
          matched_value: 'T4a',
          evidence_status: 'verified',
          evidence_tier: 'Tier 1 (Verified)',
          subgraph_in_degree: 2,
          subgraph_out_degree: 3,
          subgraph_total_weight: 45,
          ranking_score: 1052.5,
          ranking_breakdown: {
            evidence_tier_weight: 1000.0,
            synaptic_weight_contribution: 22.5,
            degree_contribution: 50.0,
            total_score: 1052.5,
          },
          explanation: 'T4a candidate',
        },
      ],
      subgraph_nodes: [
        {
          id: '10001',
          body_id: 10001,
          cell_type: 'T4a',
          is_candidate: true,
          matched_concept_ids: ['motion_detection'],
          degree: 5,
          total_weight: 45,
        },
      ],
      subgraph_edges: [],
      structural_metrics: {
        total_nodes: 1,
        total_edges: 0,
        candidate_nodes_count: 1,
        partner_nodes_count: 0,
        density: 0.0,
        average_weight: 0.0,
        max_weight: 0,
        top_hub_body_id: 10001,
        connected_components: 1,
      },
      ranking_method: 'dual_criteria',
      evidence_sources: [],
      dataset_version: 'male-cns:v1.0',
      catalog_version: '1.0.0',
      source_coverage: 'Janelia MaleCNS v1.0',
      limitations: ['Traced-only synaptic weights'],
      warnings: [],
      execution_status: 'completed' as const,
      execution_duration_ms: 12.0,
      completed_at: '2026-10-28T00:00:00Z',
      is_partial: false,
    };

    vi.mocked(api.executeInvestigationPlan).mockResolvedValue(mockResult);

    render(<AskNeuroQuery />);

    const input = screen.getByPlaceholderText(/How does the fruit fly visual system detect directional motion/i);
    fireEvent.change(input, { target: { value: 'Motion query' } });
    fireEvent.click(screen.getByRole('button', { name: /Interpret Question/i }));

    await waitFor(() => {
      expect(screen.getByText('plan-test-12345')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Run Investigation/i }));

    await waitFor(() => {
      expect(screen.getByText('Circuit Explorer')).toBeDefined();
      expect(screen.getByText('Reasoning Trace')).toBeDefined();
      expect(screen.getByText('Compare Investigations')).toBeDefined();
      expect(screen.getByText('Candidates CSV')).toBeDefined();
      expect(screen.getByText('Edges CSV')).toBeDefined();
    });

    // Switch to Reasoning Trace tab
    fireEvent.click(screen.getByText('Reasoning Trace'));
    await waitFor(() => {
      expect(screen.getByText('Investigation Reasoning Trace & Provenance')).toBeDefined();
      expect(screen.getByText('Step 1: Research Question Formulation')).toBeDefined();
    });

    // Switch to Compare Investigations tab
    fireEvent.click(screen.getByText('Compare Investigations'));
    await waitFor(() => {
      expect(screen.getByText('Compare Two Completed NeuroQuery Investigations')).toBeDefined();
    });
  });
});


