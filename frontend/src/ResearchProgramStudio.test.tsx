import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ResearchProgramStudio } from './components/ResearchProgramStudio';
import { api } from './api';
import type {
  ResearchProject,
  ResearchSynthesis,
  ResearchAgenda,
  StudyDependency,
  CampaignPreviewResponse,
  ResearchCampaign,
} from './types';

vi.mock('./api', () => ({
  api: {
    listResearchProjects: vi.fn(),
    createResearchProject: vi.fn(),
    generateProjectSynthesis: vi.fn(),
    getProjectSynthesis: vi.fn(),
    getProjectAgenda: vi.fn(),
    generateProjectAgenda: vi.fn(),
    listProjectStudyDependencies: vi.fn(),
    createProjectStudyDependency: vi.fn(),
    deleteProjectStudyDependency: vi.fn(),
    reviewProjectContradiction: vi.fn(),
    updateProjectEvidenceGap: vi.fn(),
    previewResearchCampaign: vi.fn(),
    executeResearchCampaign: vi.fn(),
    getProjectSynthesisMarkdownReport: vi.fn(),
    exportProjectSynthesisCsv: vi.fn(),
  },
}));

describe('ResearchProgramStudio (V12) Component', () => {
  const mockProject: ResearchProject = {
    project_id: 'proj-12',
    title: 'Visual P9 Modulatory Circuit Program',
    description: 'Comprehensive multi-study investigation into P9 feedback loops.',
    objective: 'Test whether P9 downstream modulation is robust under synaptic pruning.',
    linked_concept_ids: ['visual_motion_detection_t4_t5'],
    hypotheses: [
      {
        hypothesis_id: 'hyp-1',
        project_id: 'proj-12',
        title: 'P9 Excites Downstream Interneurons',
        statement: 'Neuron 10001 forms strong downstream synapses onto 20001.',
        category: 'candidate_stability',
        target_neurons: [10001, 20001],
        target_edges: [[10001, 20001]],
        evidence_records: [],
        alternative_explanations: [],
        assumptions: [],
        limitations: [],
        proposed_studies: [
          {
            study_id: 'study-1',
            hypothesis_id: 'hyp-1',
            title: 'Downstream Cascade Verification',
            analysis_type: 'downstream_cascade',
            objective: 'Trace downstream reachability',
            parameters: {},
            prerequisites: [],
            expected_null_outcome: 'No reachability',
            testable_criteria: [],
            status: 'draft',
            created_at: '2026-10-28T12:00:00Z',
          },
        ],
        status: 'draft',
        status_history: [],
        linked_execution_ids: [],
        linked_robustness_ids: [],
        linked_concept_ids: [],
        created_at: '2026-10-28T12:00:00Z',
        updated_at: '2026-10-28T12:00:00Z',
      },
    ],
    timeline: [],
    notes: [],
    created_at: '2026-10-28T12:00:00Z',
    updated_at: '2026-10-28T12:00:00Z',
  };

  const mockSynthesis: ResearchSynthesis = {
    synthesis_id: 'syn-1',
    project_id: 'proj-12',
    project_title: 'Visual P9 Modulatory Circuit Program',
    project_objective: 'Test whether P9 downstream modulation is robust under synaptic pruning.',
    generated_at: '2026-10-28T12:00:00Z',
    is_fresh: true,
    included_hypothesis_ids: ['hyp-1'],
    total_hypotheses: 1,
    status_distribution: { draft: 1 },
    shared_evidence_sources: [
      {
        source_identifier: 'exec-shared-101',
        citation_count: 2,
        citing_hypothesis_ids: ['hyp-1', 'hyp-2'],
        evidence_types: ['computational_execution'],
        is_shared: true,
        is_independent: false,
        scientific_warning:
          'Multiple hypotheses cite this identical execution artifact. It does NOT constitute independent replication.',
      },
    ],
    independent_evidence_sources: [
      {
        source_identifier: 'doi:10.1101/2026.01.01.male_cns',
        citation_count: 1,
        citing_hypothesis_ids: ['hyp-1'],
        evidence_types: ['peer_reviewed_literature'],
        is_shared: false,
        is_independent: true,
        scientific_warning: '',
      },
    ],
    shared_concepts: [],
    distinct_concepts: [],
    shared_candidate_neuron_ids: [10001],
    distinct_candidate_neuron_ids: [20001],
    shared_directed_edges: [[10001, 20001]],
    distinct_directed_edges: [],
    active_contradictions: [
      {
        contradiction_id: 'contra-1',
        project_id: 'proj-12',
        category: 'confirmed_record_mismatch',
        description: 'Status conflict between hyp-1 and hyp-2.',
        affected_hypothesis_ids: ['hyp-1', 'hyp-2'],
        affected_evidence_ids: [],
        affected_study_ids: [],
        detection_rule: 'deterministic_status_mismatch',
        required_resolution_info: 'Manual review required',
        review_status: 'open',
        created_at: '2026-10-28T12:00:00Z',
      },
    ],
    open_gaps: [
      {
        gap_id: 'gap-1',
        project_id: 'proj-12',
        category: 'missing_source_evidence',
        description: 'Hypothesis hyp-1 has no empirical evidence attached.',
        affected_hypothesis_ids: ['hyp-1'],
        affected_claim_or_evidence_ids: [],
        source_records_inspected: [],
        detection_rule: 'missing_evidence_rule',
        priority_score: 0.85,
        required_information: 'Attach execution artifact',
        is_actionable: true,
        suggested_action_type: 'evidence_attachment',
        suggested_action_description: 'Run pathway analysis',
        status: 'open',
        created_at: '2026-10-28T12:00:00Z',
      },
    ],
    completed_studies_count: 0,
    agenda_summary: null,
    manifest: {},
    caveats: [],
  };

  const mockAgenda: ResearchAgenda = {
    agenda_id: 'agenda-1',
    project_id: 'proj-12',
    created_at: '2026-10-28T12:00:00Z',
    priority_weights: {
      gap_importance: 0.35,
      hypothesis_coverage: 0.25,
      uncertainty_reduction: 0.2,
      feasibility: 0.15,
      cost_penalty: 0.15,
    },
    recommended_actions: [
      {
        action_id: 'study-1',
        project_id: 'proj-12',
        action_type: 'followup_study',
        title: 'Downstream Cascade Verification',
        description: 'Execute cascade verification for P9.',
        target_tool: 'pathway_tracer',
        target_hypothesis_ids: ['hyp-1'],
        addressed_gap_ids: ['gap-1'],
        prerequisite_action_ids: [],
        suggested_parameters: {},
        expected_outputs: 'Reachability set',
        scientific_limitations: 'Static connectome assumptions',
        estimated_cost_label: 'low',
        cost_factors: {},
        priority_score: 0.742,
        priority_breakdown: {
          gap_importance: 0.85,
          hypothesis_coverage: 0.5,
          uncertainty_reduction: 0.7,
          feasibility: 1.0,
          cost_penalty: 0.1,
        },
        is_ready: true,
        blocking_reasons: [],
      },
    ],
    total_actions: 1,
    ready_actions: 1,
    blocked_actions: 0,
  };

  const mockDependencies: StudyDependency[] = [
    {
      dependency_id: 'dep-1',
      study_id: 'study-2',
      prerequisite_study_id: 'study-1',
      dependency_type: 'required_prerequisite',
      is_satisfied: false,
      created_at: '2026-10-28T12:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (api.listResearchProjects as any).mockResolvedValue([mockProject]);
    (api.generateProjectSynthesis as any).mockResolvedValue(mockSynthesis);
    (api.getProjectAgenda as any).mockResolvedValue(mockAgenda);
    (api.listProjectStudyDependencies as any).mockResolvedValue(mockDependencies);
  });

  it('renders research program studio header, freshness indicator, and shared evidence', async () => {
    render(<ResearchProgramStudio />);

    expect(screen.getByText(/Research Program Studio/i)).toBeDefined();
    expect(screen.getByText(/V12 Program Synthesis/i)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText(/Visual P9 Modulatory Circuit Program/i)).toBeDefined();
      expect(screen.getByText(/Synthesis Fresh/i)).toBeDefined();
      expect(screen.getByText(/exec-shared-101/i)).toBeDefined();
      expect(screen.getByText(/Cross-Hypothesis Evidence Provenance Policy/i)).toBeDefined();
    });
  });

  it('navigates to Contradictions tab and reviews a contradiction record', async () => {
    (api.reviewProjectContradiction as any).mockResolvedValue({
      ...mockSynthesis.active_contradictions[0],
      review_status: 'confirmed_inconsistency',
      resolution_rationale: 'Verified parameter difference',
    });

    render(<ResearchProgramStudio />);

    await waitFor(() => {
      expect(screen.getByText(/Contradictions \(1\)/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Contradictions \(1\)/i));

    await waitFor(() => {
      expect(screen.getByText(/Status conflict between hyp-1 and hyp-2/i)).toBeDefined();
    });

    // Click Review & Classify
    fireEvent.click(screen.getByText(/Review & Classify/i));

    await waitFor(() => {
      expect(screen.getByText(/Review Contradiction Record/i)).toBeDefined();
    });

    // Enter rationale and submit
    const textarea = screen.getByPlaceholderText(/Explain why this inconsistency is expected/i);
    fireEvent.change(textarea, { target: { value: 'Verified parameter difference' } });

    fireEvent.click(screen.getByText(/Save Review/i));

    await waitFor(() => {
      expect(api.reviewProjectContradiction).toHaveBeenCalledWith(
        'proj-12',
        'contra-1',
        expect.objectContaining({
          review_status: 'confirmed_inconsistency',
          resolution_rationale: 'Verified parameter difference',
        })
      );
    });
  });

  it('navigates to Prioritized Agenda and recalculates with custom weights', async () => {
    (api.generateProjectAgenda as any).mockResolvedValue(mockAgenda);

    render(<ResearchProgramStudio />);

    await waitFor(() => {
      expect(screen.getByText(/Prioritized Agenda/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Prioritized Agenda/i));

    await waitFor(() => {
      expect(screen.getByText(/Transparent Priority Scoring Parameters/i)).toBeDefined();
      expect(screen.getByText(/Score: 0.742/i)).toBeDefined();
      expect(screen.getByText(/✓ Ready/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Recalculate Agenda/i));

    await waitFor(() => {
      expect(api.generateProjectAgenda).toHaveBeenCalled();
    });
  });

  it('navigates to Campaigns tab, performs dry-run preview, and executes campaign', async () => {
    const mockPreview: CampaignPreviewResponse = {
      project_id: 'proj-12',
      selected_study_ids: ['study-1'],
      ordered_studies: [
        {
          study_id: 'study-1',
          hypothesis_id: 'hyp-1',
          title: 'Downstream Cascade Verification',
          analysis_type: 'downstream_cascade',
          parameters: {},
          prerequisites: [],
          execution_order_index: 0,
          is_ready: true,
          blocking_reasons: [],
        },
      ],
      total_studies: 1,
      ready_studies: 1,
      blocked_studies: 0,
      estimated_scenarios: 4,
      estimated_resource_summary: {},
      warnings: [],
      can_execute: true,
    };

    const mockCampaign: ResearchCampaign = {
      campaign_id: 'camp-101',
      project_id: 'proj-12',
      status: 'completed',
      selected_study_ids: ['study-1'],
      execution_order: ['study-1'],
      study_results: [
        {
          study_id: 'study-1',
          hypothesis_id: 'hyp-1',
          status: 'completed',
          verdict: 'criteria_met',
          evaluation_summary: 'Cascade reachability confirmed across 12 downstream targets.',
        },
      ],
      total_studies: 1,
      completed_count: 1,
      failed_count: 0,
      skipped_count: 0,
      start_time: '2026-10-28T12:00:00Z',
      summary: 'Campaign camp-101 executed 1 studies: 1 completed, 0 failed, 0 skipped.',
    };

    (api.previewResearchCampaign as any).mockResolvedValue(mockPreview);
    (api.executeResearchCampaign as any).mockResolvedValue(mockCampaign);

    render(<ResearchProgramStudio />);

    await waitFor(() => {
      expect(screen.getByText(/Campaign Execution/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Campaign Execution/i));

    await waitFor(() => {
      expect(screen.getByText(/Controlled Multi-Study Campaign Planner/i)).toBeDefined();
    });

    // Select the study
    const checkbox = screen.getByRole('checkbox', { name: /Downstream Cascade Verification/i });
    fireEvent.click(checkbox);

    // Dry Run Preview
    fireEvent.click(screen.getByText(/Dry-Run Preview/i));

    await waitFor(() => {
      expect(api.previewResearchCampaign).toHaveBeenCalledWith('proj-12', ['study-1']);
      expect(screen.getByText(/Campaign Dry-Run Execution Plan/i)).toBeDefined();
      expect(screen.getByText(/Estimated Scenarios:/i)).toBeDefined();
    });

    // Confirm checkbox
    const confirmBox = screen.getByRole('checkbox', {
      name: /I confirm and authorize the execution/i,
    });
    fireEvent.click(confirmBox);

    // Launch Campaign
    fireEvent.click(screen.getByText(/Launch Campaign/i));

    await waitFor(() => {
      expect(api.executeResearchCampaign).toHaveBeenCalledWith('proj-12', {
        study_ids: ['study-1'],
        stop_on_first_failure: false,
      });
      expect(screen.getByText(/Campaign Execution Results: camp-101/i)).toBeDefined();
      expect(screen.getByText(/completed \(criteria_met\)/i)).toBeDefined();
    });
  });
});
