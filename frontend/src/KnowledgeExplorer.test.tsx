import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { KnowledgeExplorer } from './components/KnowledgeExplorer';
import { api } from './api';
import type {
  BiologicalConcept,
  ConceptCandidateNeuron,
  ConceptDetailResponse,
  EvidenceSource,
  KnowledgeStatusResponse,
  KnowledgeValidationReport,
  SupportedInvestigation,
} from './types';

// Mock API client
vi.mock('./api', () => ({
  api: {
    getKnowledgeStatus: vi.fn(),
    listConcepts: vi.fn(),
    getConceptDetail: vi.fn(),
    getConceptCandidates: vi.fn(),
    listSupportedInvestigations: vi.fn(),
    getEvidenceSource: vi.fn(),
    auditKnowledgeCatalog: vi.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(public status: number, public detail: string) {
      super(detail);
    }
  },
}));

describe('KnowledgeExplorer (V6) Component', () => {
  const mockStatus: KnowledgeStatusResponse = {
    catalog_id: 'neuroquery-cns-catalog',
    catalog_name: 'NeuroQuery MaleCNS Knowledge Catalog',
    catalog_version: '1.0.0',
    dataset_version: 'male-cns:v1.0',
    catalog_loaded: true,
    total_concepts: 2,
    total_evidence_sources: 2,
    total_mappings: 2,
    total_investigations: 5,
    supported_investigation_count: 5,
    validation_status: 'valid',
    data_availability_notice: 'Connected to local MaleCNS Feather provider.',
  };

  const mockConcepts: BiologicalConcept[] = [
    {
      concept_id: 'giant_fiber_escape_circuit',
      display_name: 'Giant Fiber Escape & Flight Initiation (DNp01 → TTMn)',
      description: 'The giant fiber neural circuit mediates the rapid escape response in Drosophila.',
      domain: 'motor_control',
      related_concepts: ['visual_motion_detection_t4_t5'],
      evidence_status: 'verified',
      mapping_ids: ['map-escape-dnp01-ttmn'],
      source_references: ['src-schlegel-2024'],
      dataset_compatibility: 'compatible',
      coverage_notes: null,
      limitations: 'Only two bilateral giant fiber descending neurons exist in the CNS.',
      catalog_version: '1.0.0',
    },
    {
      concept_id: 'visual_motion_detection_t4_t5',
      display_name: 'Direction-Selective Visual Motion Detection (T4 / T5)',
      description: 'Elementary motion detection in the optic lobe.',
      domain: 'visual_processing',
      related_concepts: [],
      evidence_status: 'verified',
      mapping_ids: ['map-motion-t4-t5'],
      source_references: ['src-schlegel-2024'],
      dataset_compatibility: 'compatible',
      coverage_notes: null,
      limitations: null,
      catalog_version: '1.0.0',
    },
  ];

  const mockSources: EvidenceSource[] = [
    {
      source_id: 'src-schlegel-2024',
      title: 'Whole-brain connectome of Drosophila melanogaster',
      authors: ['Schlegel, P.', 'Bates, A. S.', 'et al.'],
      year: 2024,
      doi: '10.1038/s41586-024-07968-y',
      url: 'https://doi.org/10.1038/s41586-024-07968-y',
      source_type: 'peer_reviewed_paper',
      source_version: 'v1.0',
      key_findings: 'Complete adult connectome annotations including DNp01 descending neuron mappings.',
      notes: null,
    },
  ];

  const mockDetail: ConceptDetailResponse = {
    concept: mockConcepts[0],
    sources: mockSources,
    mappings: [
      {
        mapping_id: 'map-escape-dnp01-ttmn',
        concept_id: 'giant_fiber_escape_circuit',
        target_field: 'type',
        match_type: 'set',
        target_values: ['DNp01', 'TTMn'],
        dataset_version: 'male-cns:v1.0',
        evidence_type: 'functional_connectomics',
        evidence_source_ids: ['src-schlegel-2024'],
        rationale: 'DNp01 synapses directly onto TTMn motor neuron.',
        known_limitations: 'Gap junctions are not quantified in EM chemical synapse weights.',
        review_status: 'verified',
        mapping_version: '1.0.0',
      },
    ],
    supported_investigations: [
      {
        investigation_id: 'inv-circuit-discovery',
        name: 'Circuit Discovery',
        description: 'Retrieve verified candidate neurons and recorded connectivity.',
        required_concepts: ['concept_id'],
        required_evidence_types: ['functional_connectomics'],
        required_dataset_fields: ['type'],
        required_graph_operations: ['neighborhood', 'connectivity_summary'],
        supported_parameters: ['max_nodes', 'min_weight'],
        graph_scope_constraints: 'max_nodes <= 100',
        expected_result_structure: 'GraphResponse',
        limitations: 'Limited to traced chemical synapses.',
        status: 'supported',
        version: '1.0.0',
      },
    ],
    candidate_count: 4,
    dataset_compatibility_status: 'compatible',
  };

  const mockCandidates: ConceptCandidateNeuron[] = [
    {
      body_id: 10001,
      cell_type: 'DNp01',
      instance: 'DNp01_L',
      superclass: 'descending',
      status: 'Traced',
      consensus_nt: 'acetylcholine',
      matched_mapping_id: 'map-escape-dnp01-ttmn',
      matched_field: 'type',
      matched_value: 'DNp01',
      evidence_status: 'verified',
      evidence_source_ids: ['src-schlegel-2024'],
    },
    {
      body_id: 800146,
      cell_type: 'TTMn',
      instance: null,
      superclass: 'motor',
      status: 'Traced',
      consensus_nt: 'acetylcholine',
      matched_mapping_id: 'map-escape-dnp01-ttmn',
      matched_field: 'type',
      matched_value: 'TTMn',
      evidence_status: 'verified',
      evidence_source_ids: ['src-schlegel-2024'],
    },
  ];

  const mockAuditReport: KnowledgeValidationReport = {
    valid: true,
    catalog_version: '1.0.0',
    dataset_version: 'male-cns:v1.0',
    errors: [],
    warnings: ['AMMC acoustic interneurons lack dedicated subclassification in MaleCNS v1.0.'],
    concept_count: 2,
    verified_concept_count: 2,
    compatible_mapping_count: 2,
    incompatible_mapping_count: 0,
    unresolved_references: [],
    summary: 'Knowledge catalog is fully valid. 2 concepts loaded.',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getKnowledgeStatus).mockResolvedValue(mockStatus);
    vi.mocked(api.listConcepts).mockResolvedValue(mockConcepts);
    vi.mocked(api.getConceptDetail).mockResolvedValue(mockDetail);
    vi.mocked(api.getConceptCandidates).mockResolvedValue(mockCandidates);
    vi.mocked(api.auditKnowledgeCatalog).mockResolvedValue(mockAuditReport);
  });

  it('renders concepts list and catalog title', async () => {
    render(
      <KnowledgeExplorer
        onSelectNeuron={vi.fn()}
      />
    );

    expect(screen.getByText('NeuroQuery Catalog')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('Giant Fiber Escape & Flight Initiation (DNp01 → TTMn)')).toBeDefined();
      expect(screen.getByText('Direction-Selective Visual Motion Detection (T4 / T5)')).toBeDefined();
    });
  });

  it('filters concepts by search query', async () => {
    render(
      <KnowledgeExplorer
        onSelectNeuron={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Giant Fiber Escape & Flight Initiation (DNp01 → TTMn)')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText('Search concepts or descriptions...');
    fireEvent.change(searchInput, { target: { value: 'motion' } });

    const aside = screen.getByRole('complementary');
    expect(within(aside).getByText('Direction-Selective Visual Motion Detection (T4 / T5)')).toBeDefined();
    expect(within(aside).queryByText('Giant Fiber Escape & Flight Initiation (DNp01 → TTMn)')).toBeNull();
  });

  it('displays concept details, peer-reviewed sources, and DOIs', async () => {
    render(
      <KnowledgeExplorer
        onSelectNeuron={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Whole-brain connectome of Drosophila melanogaster')).toBeDefined();
      expect(screen.getByText('DOI')).toBeDefined();
      expect(screen.getByText('Circuit Discovery')).toBeDefined();
    });
  });

  it('renders candidate neurons table and triggers callbacks on button click', async () => {
    const onSelectNeuron = vi.fn();
    const onNavigateToExplorer = vi.fn();
    const onSetPathwaySource = vi.fn();

    render(
      <KnowledgeExplorer
        onSelectNeuron={onSelectNeuron}
        onNavigateToExplorer={onNavigateToExplorer}
        onSetPathwaySource={onSetPathwaySource}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('10001')).toBeDefined();
      expect(screen.getByText('800146')).toBeDefined();
    });

    const inspectButtons = screen.getAllByRole('button', { name: /Inspect/i });
    expect(inspectButtons.length).toBeGreaterThan(0);
    fireEvent.click(inspectButtons[0]);
    expect(onSelectNeuron).toHaveBeenCalledWith(10001);

    const explorerButtons = screen.getAllByRole('button', { name: /Explorer/i });
    expect(explorerButtons.length).toBeGreaterThan(0);
    fireEvent.click(explorerButtons[0]);
    expect(onNavigateToExplorer).toHaveBeenCalledWith(10001);

    const traceButtons = screen.getAllByRole('button', { name: /Trace/i });
    expect(traceButtons.length).toBeGreaterThan(0);
    fireEvent.click(traceButtons[0]);
    expect(onSetPathwaySource).toHaveBeenCalledWith(10001);
  });

  it('opens and displays the knowledge catalog audit modal', async () => {
    render(
      <KnowledgeExplorer
        onSelectNeuron={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Audit/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Audit/i }));

    await waitFor(() => {
      expect(screen.getByText('Knowledge Catalog Validation Audit')).toBeDefined();
      expect(screen.getByText('Catalog Integrity & Schema Valid')).toBeDefined();
      expect(screen.getByText(/AMMC acoustic interneurons lack dedicated subclassification/i)).toBeDefined();
    });

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: /Done/i }));
    await waitFor(() => {
      expect(screen.queryByText('Knowledge Catalog Validation Audit')).toBeNull();
    });
  });
});
