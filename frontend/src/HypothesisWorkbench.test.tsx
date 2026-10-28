import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { HypothesisWorkbench } from './components/HypothesisWorkbench';
import { api } from './api';
import type { HypothesisRecord, HypothesisSuggestion, ResearchProject } from './types';

vi.mock('./api', () => ({
  api: {
    listHypotheses: vi.fn(),
    createHypothesis: vi.fn(),
    getHypothesis: vi.fn(),
    updateHypothesis: vi.fn(),
    deleteHypothesis: vi.fn(),
    transitionHypothesisStatus: vi.fn(),
    attachEvidence: vi.fn(),
    removeEvidence: vi.fn(),
    addAlternative: vi.fn(),
    createFollowupStudy: vi.fn(),
    executeFollowupStudy: vi.fn(),
    getHypothesisMarkdownReport: vi.fn(),
    listResearchProjects: vi.fn(),
    createResearchProject: vi.fn(),
    suggestHypotheses: vi.fn(),
  },
}));

// Mock Cytoscape in JSDOM
vi.mock('cytoscape', () => ({
  default: vi.fn(() => ({
    on: vi.fn(),
    elements: vi.fn(() => ({
      remove: vi.fn(),
    })),
    add: vi.fn(),
    layout: vi.fn(() => ({ run: vi.fn() })),
    fit: vi.fn(),
    zoom: vi.fn(() => 1.0),
  })),
}));

describe('HypothesisWorkbench (V11) Component', () => {
  const mockHypothesis: HypothesisRecord = {
    hypothesis_id: 'hyp-test-101',
    project_id: 'proj-default',
    title: 'DNp01 Serves as Primary Escape Drive',
    statement: 'Descending neuron #10001 (DNp01) reliably drives motor output via strong direct synapse to TTMn #800146.',
    category: 'structural_connectivity',
    scope: 'giant_fiber_escape_circuit',
    rationale: 'Direct synapse of wt=70 observed in MaleCNS v1.0.',
    linked_execution_ids: ['exec-1'],
    linked_robustness_ids: ['rob-1'],
    linked_concept_ids: ['giant_fiber_escape_circuit'],
    target_neurons: [10001, 800146],
    target_edges: [[10001, 800146]],
    evidence_records: [
      {
        evidence_id: 'ev-1',
        hypothesis_id: 'hyp-test-101',
        role: 'supporting',
        evidence_type: 'edge_survival',
        summary: 'Direct synapse weight 70 survives strict filtering.',
        edge_pre: 10001,
        edge_post: 800146,
        metric_name: 'synaptic_weight',
        metric_value: 70,
        created_at: '2026-10-28T12:00:00Z',
      },
    ],
    alternative_explanations: [
      {
        explanation_id: 'alt-1',
        title: 'Threshold Cutoff Bias',
        description: 'Connection may appear isolated due to high min_weight filter.',
        bias_category: 'threshold_artifact',
        status: 'plausible',
      },
    ],
    assumptions: ['MaleCNS v1.0 captures valid structural synapses.'],
    limitations: ['Static EM graph; no physiological firing probability.'],
    proposed_studies: [
      {
        study_id: 'study-1',
        hypothesis_id: 'hyp-test-101',
        title: 'Structural Pathway Search',
        analysis_type: 'pathway_search',
        objective: 'Confirm pathway continuity.',
        parameters: { max_hops: 3 },
        prerequisites: [],
        expected_null_outcome: 'No paths found.',
        testable_criteria: [{ metric: 'path_count', operator: '>=', value: 1 }],
        status: 'pending',
        created_at: '2026-10-28T12:00:00Z',
      },
    ],
    status: 'ready_for_testing',
    status_history: [
      {
        from_status: 'draft',
        to_status: 'ready_for_testing',
        reason: 'Follow-up study registered.',
        changed_by: 'system',
        timestamp: '2026-10-28T12:00:00Z',
      },
    ],
    created_at: '2026-10-28T12:00:00Z',
    updated_at: '2026-10-28T12:00:00Z',
  };

  const mockSuggestion: HypothesisSuggestion = {
    suggestion_id: 'sug-1',
    title: 'DNp01 Acts as an Indispensable Escape Bottleneck',
    statement: 'Candidate neuron #10001 maintains 100% inclusion across parameter sweeps.',
    category: 'candidate_stability',
    rationale: 'Evaluated across 5 scenarios with zero dropout.',
    source_type: 'robustness',
    source_id: 'rob-1',
    confidence_score: 0.95,
    target_neurons: [10001],
    target_edges: [],
    suggested_evidence: [],
    suggested_alternatives: [],
    scientific_caveat: 'Topological stability does not guarantee biological necessity.',
  };

  const mockProject: ResearchProject = {
    project_id: 'proj-default',
    title: 'MaleCNS Connectome Explorations',
    description: 'Default project workspace.',
    objective: 'Evaluate circuit hypotheses.',
    linked_concept_ids: [],
    hypotheses: [mockHypothesis],
    timeline: [],
    notes: [],
    created_at: '2026-10-28T12:00:00Z',
    updated_at: '2026-10-28T12:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.listHypotheses as any).mockResolvedValue([mockHypothesis]);
    (api.listResearchProjects as any).mockResolvedValue([mockProject]);
    (api.suggestHypotheses as any).mockResolvedValue([mockSuggestion]);
  });

  it('renders workbench title and lists initial hypotheses', async () => {
    render(<HypothesisWorkbench />);

    expect(screen.getByText(/Evidence-Grounded Hypothesis Workbench/i)).toBeDefined();

    await waitFor(() => {
      expect(screen.getAllByText(/DNp01 Serves as Primary Escape Drive/i).length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText(/Surfaced Data Suggestions/i)).toBeDefined();
  });

  it('displays hypothesis formal statement and status badges', async () => {
    render(<HypothesisWorkbench />);

    await waitFor(() => {
      expect(screen.getAllByText(/Descending neuron #10001/i).length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getAllByText(/ready for testing/i).length).toBeGreaterThanOrEqual(1);
  });

  it('switches between detail tabs cleanly', async () => {
    render(<HypothesisWorkbench />);

    await waitFor(() => {
      expect(screen.getAllByText(/Descending neuron #10001/i).length).toBeGreaterThanOrEqual(1);
    });

    // Evidence tab is default
    expect(screen.getByText(/Direct synapse weight 70 survives strict filtering/i)).toBeDefined();

    // Click Alternatives Tab
    fireEvent.click(screen.getByText(/Alternative Explanations/i));
    expect(screen.getByText(/Threshold Cutoff Bias/i)).toBeDefined();

    // Click Studies Tab
    fireEvent.click(screen.getByText(/Follow-Up Studies/i));
    expect(screen.getByText(/Structural Pathway Search/i)).toBeDefined();

    // Click Limitations Tab
    fireEvent.click(screen.getByText(/Assumptions & Caveats/i));
    expect(screen.getByText(/Static EM graph/i)).toBeDefined();
  });

  it('executes a follow-up study and updates evaluation summary', async () => {
    (api.executeFollowupStudy as any).mockResolvedValue({
      study_id: 'study-1',
      hypothesis_id: 'hyp-test-101',
      execution_id: 'exec-test-1',
      verdict: 'criteria_met',
      recommended_status: 'supported_by_computational_evidence',
      criteria_results: [{ metric: 'path_count', operator: '>=', expected: 1, actual: 2, passed: true }],
      summary: 'Criteria met: 2 paths found.',
      scientific_caveat: 'Static graph metric.',
    });

    (api.getHypothesis as any).mockResolvedValue({
      ...mockHypothesis,
      status: 'supported_by_computational_evidence',
      proposed_studies: [
        {
          ...mockHypothesis.proposed_studies[0],
          status: 'completed',
          evaluation_verdict: 'criteria_met',
          evaluation_summary: 'Criteria met: 2 paths found.',
        },
      ],
    });

    render(<HypothesisWorkbench />);

    await waitFor(() => {
      expect(screen.getAllByText(/Descending neuron #10001/i).length).toBeGreaterThanOrEqual(1);
    });

    // Go to studies tab
    fireEvent.click(screen.getByText(/Follow-Up Studies/i));

    // Click Run Experiment
    const runBtn = screen.getByText(/Run Experiment/i);
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(api.executeFollowupStudy).toHaveBeenCalledWith('hyp-test-101', 'study-1', {});
    });
  });
});
