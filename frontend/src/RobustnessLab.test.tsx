import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { RobustnessLab } from './components/RobustnessLab';
import { api } from './api';
import type { CircuitDiscoveryResult, RobustnessAnalysisResponse } from './types';

vi.mock('./api', () => ({
  api: {
    getRobustnessProfiles: vi.fn(),
    analyzeCircuitRobustness: vi.fn(),
    getRobustnessAnalysis: vi.fn(),
  },
}));

describe('RobustnessLab (V10) Component', () => {
  const mockBaselineResult: CircuitDiscoveryResult = {
    execution_id: 'exec-test-v10',
    plan_id: 'plan-test-v10',
    question: 'How does the fly visual system detect directional motion?',
    intent: 'circuit_discovery',
    resolved_concepts: [],
    candidate_neurons: [
      {
        body_id: 32764,
        cell_type: 'T4a',
        instance: 'T4a_1',
        matched_concept_ids: ['visual_motion'],
        matched_mapping_ids: ['map-1'],
        matched_field: 'type',
        matched_value: 'T4a',
        evidence_status: 'verified',
        evidence_tier: 'Tier 1 (Verified)',
        subgraph_in_degree: 10,
        subgraph_out_degree: 10,
        subgraph_total_weight: 120,
        ranking_score: 1200.0,
        explanation: 'Matched concept visual_motion',
      },
    ],
    subgraph_nodes: [
      {
        id: '32764',
        body_id: 32764,
        cell_type: 'T4a',
        is_candidate: true,
        matched_concept_ids: ['visual_motion'],
        degree: 20,
        total_weight: 120,
      },
      {
        id: '10001',
        body_id: 10001,
        cell_type: 'DNp01',
        is_candidate: false,
        matched_concept_ids: [],
        degree: 5,
        total_weight: 40,
      },
    ],
    subgraph_edges: [
      {
        id: '32764_10001',
        source: 32764,
        target: 10001,
        weight: 25,
        is_inter_candidate: false,
      },
    ],
    structural_metrics: {
      total_nodes: 2,
      total_edges: 1,
      candidate_nodes_count: 1,
      partner_nodes_count: 1,
      density: 0.5,
      average_weight: 25.0,
      max_weight: 25.0,
      connected_components: 1,
    },
    ranking_method: 'dual_criteria',
    evidence_sources: [],
    dataset_version: 'male-cns:v1.0',
    catalog_version: '1.0.0',
    source_coverage: 'Janelia MaleCNS v1.0',
    limitations: ['Traced-only synaptic connectivity'],
    warnings: [],
    execution_status: 'completed',
    execution_duration_ms: 45.0,
    completed_at: '2026-10-28T00:00:00Z',
    is_partial: false,
  };

  const mockRobustnessResponse: RobustnessAnalysisResponse = {
    analysis_id: 'robustness-test-999',
    baseline_execution_id: 'exec-test-v10',
    baseline_summary: {
      scenario_id: 'scenario-baseline',
      is_baseline: true,
      parameter_label: 'Baseline Configuration',
      min_edge_weight: 1,
      max_subgraph_nodes: 40,
      max_candidates: 20,
      ranking_profile: {
        profile_name: 'baseline_default',
        tier_weight_mult: 1.0,
        synaptic_weight_mult: 0.5,
        degree_mult: 10.0,
      },
      candidate_count: 1,
      node_count: 2,
      edge_count: 1,
      density: 0.5,
      average_weight: 25.0,
      status: 'completed',
      execution_duration_ms: 10.0,
      top_candidate_ids: [32764],
    },
    scenarios: [
      {
        scenario_id: 'scenario-baseline',
        is_baseline: true,
        parameter_label: 'Baseline Configuration',
        min_edge_weight: 1,
        max_subgraph_nodes: 40,
        max_candidates: 20,
        ranking_profile: {
          profile_name: 'baseline_default',
          tier_weight_mult: 1.0,
          synaptic_weight_mult: 0.5,
          degree_mult: 10.0,
        },
        candidate_count: 1,
        node_count: 2,
        edge_count: 1,
        density: 0.5,
        average_weight: 25.0,
        status: 'completed',
        execution_duration_ms: 10.0,
        top_candidate_ids: [32764],
      },
      {
        scenario_id: 'scenario-weight-5',
        is_baseline: false,
        parameter_label: 'Weight Threshold: ≥ 5',
        min_edge_weight: 5,
        max_subgraph_nodes: 40,
        max_candidates: 20,
        ranking_profile: {
          profile_name: 'baseline_default',
          tier_weight_mult: 1.0,
          synaptic_weight_mult: 0.5,
          degree_mult: 10.0,
        },
        candidate_count: 1,
        node_count: 2,
        edge_count: 1,
        density: 0.5,
        average_weight: 25.0,
        status: 'completed',
        execution_duration_ms: 12.0,
        top_candidate_ids: [32764],
      },
    ],
    candidate_stability: [
      {
        body_id: 32764,
        cell_type: 'T4a',
        instance: 'T4a_1',
        evidence_tier: 'Tier 1 (Verified)',
        baseline_rank: 1,
        median_rank: 1.0,
        min_rank: 1,
        max_rank: 1,
        rank_spread: 0,
        inclusion_count: 2,
        total_scenarios: 2,
        inclusion_fraction: 1.0,
        in_baseline: true,
        top_k_retained: true,
        observed_ranks: { 'scenario-baseline': 1, 'scenario-weight-5': 1 },
      },
    ],
    edge_stability: [
      {
        edge_id: '32764_10001',
        source: 32764,
        target: 10001,
        weight: 25,
        inclusion_count: 2,
        total_scenarios: 2,
        inclusion_fraction: 1.0,
        in_baseline: true,
        survives_strict_threshold: true,
      },
    ],
    metric_sensitivity: [
      {
        scenario_id: 'scenario-baseline',
        parameter_label: 'Baseline Configuration',
        min_edge_weight: 1,
        max_subgraph_nodes: 40,
        max_candidates: 20,
        ranking_profile_name: 'baseline_default',
        node_count: 2,
        edge_count: 1,
        candidate_count: 1,
        density: 0.5,
        average_weight: 25.0,
        delta_nodes: 0,
        delta_edges: 0,
        execution_duration_ms: 10.0,
        status: 'completed',
      },
      {
        scenario_id: 'scenario-weight-5',
        parameter_label: 'Weight Threshold: ≥ 5',
        min_edge_weight: 5,
        max_subgraph_nodes: 40,
        max_candidates: 20,
        ranking_profile_name: 'baseline_default',
        node_count: 2,
        edge_count: 1,
        candidate_count: 1,
        density: 0.5,
        average_weight: 25.0,
        delta_nodes: 0,
        delta_edges: 0,
        execution_duration_ms: 12.0,
        status: 'completed',
      },
    ],
    manifest: {
      manifest_version: '1.0.0',
      analysis_id: 'robustness-test-999',
      baseline_execution_id: 'exec-test-v10',
      baseline_plan_id: 'plan-test-v10',
      research_question: 'How does the fly visual system detect directional motion?',
      dataset_version: 'male-cns:v1.0',
      dataset_fingerprint: 'male-cns:v1.0-feather-211577-traced',
      catalog_version: '1.0.0',
      ranking_formula_version: 'v10.0',
      scenario_strategy: 'one_factor_at_a_time',
      requested_scenarios: 2,
      completed_scenarios: 2,
      failed_scenarios: 0,
      created_at: '2026-10-28T00:00:00Z',
      execution_duration_total_ms: 22.0,
      scientific_limitations: [
        'Sensitivity analysis evaluates computational robustness across bounded parameter scenarios.',
        'Candidate inclusion stability indicates survival under tested thresholds, not calibrated physiological probability.',
      ],
    },
    stability_summary: {
      requested_scenarios: 2,
      completed_scenarios: 2,
      failed_scenarios: 0,
      evaluated_candidate_count: 1,
      stable_candidate_count: 1,
      top_k_retained_count: 1,
      evaluated_edge_count: 1,
      stable_edge_count: 1,
      top_k_cutoff: 5,
      stability_threshold_pct: 80.0,
    },
    warnings: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getRobustnessProfiles as any).mockResolvedValue([
      { profile_name: 'baseline_default', tier_weight_mult: 1.0, synaptic_weight_mult: 0.5, degree_mult: 10.0 },
    ]);
    (api.analyzeCircuitRobustness as any).mockResolvedValue(mockRobustnessResponse);
  });

  it('renders Robustness Lab header with baseline information', () => {
    render(<RobustnessLab baselineResult={mockBaselineResult} />);

    expect(screen.getByText('Circuit Robustness & Sensitivity Analysis Lab')).toBeDefined();
    expect(screen.getByText('V10 Engine')).toBeDefined();
    expect(screen.getByText('exec-test-v10')).toBeDefined();
    expect(screen.getByText('Run Robustness Analysis')).toBeDefined();
  });

  it('switches between one-factor and grid strategy modes', () => {
    render(<RobustnessLab baselineResult={mockBaselineResult} />);

    const oneFactorBtn = screen.getByText('One-Factor-at-a-Time (Recommended)');
    const gridBtn = screen.getByText('Bounded Multi-Parameter Grid');

    expect(oneFactorBtn).toBeDefined();
    expect(gridBtn).toBeDefined();

    fireEvent.click(gridBtn);
    expect(screen.getByText(/Estimated scenarios:/)).toBeDefined();
  });

  it('triggers robustness analysis execution and displays KPI summary cards', async () => {
    render(<RobustnessLab baselineResult={mockBaselineResult} />);

    const runBtn = screen.getByRole('button', { name: /Run Robustness Analysis/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(api.analyzeCircuitRobustness).toHaveBeenCalledTimes(1);
    });

    // Check KPI summary cards
    expect(screen.getByText('Evaluated Scenarios')).toBeDefined();
    expect(screen.getByText('Stable Candidates (≥ 80%)')).toBeDefined();
    expect(screen.getByText('Stable Directed Connections')).toBeDefined();
  });

  it('renders candidate stability table with inclusion fractions and ranks', async () => {
    render(<RobustnessLab baselineResult={mockBaselineResult} />);

    const runBtn = screen.getByRole('button', { name: /Run Robustness Analysis/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText('#32764')).toBeDefined();
    });

    expect(screen.getByText('T4a')).toBeDefined();
    expect(screen.getByText('100% (2/2)')).toBeDefined();
    expect(screen.getByText('✓ Retained')).toBeDefined();
  });

  it('navigates to Directed Edge Stability sub-tab and renders connections', async () => {
    render(<RobustnessLab baselineResult={mockBaselineResult} />);

    const runBtn = screen.getByRole('button', { name: /Run Robustness Analysis/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText(/Directed Edge Stability/i)).toBeDefined();
    });

    const edgeTab = screen.getByText(/Directed Edge Stability/i);
    fireEvent.click(edgeTab);

    expect(screen.getByText('Presynaptic Source')).toBeDefined();
    expect(screen.getByText('Postsynaptic Target')).toBeDefined();
    expect(screen.getByText('25')).toBeDefined();
    expect(screen.getByText('Survives Strict (wt ≥ 10)')).toBeDefined();
  });

  it('displays reproducibility manifest with schema 1.0.0', async () => {
    render(<RobustnessLab baselineResult={mockBaselineResult} />);

    const runBtn = screen.getByRole('button', { name: /Run Robustness Analysis/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText(/Reproducibility Manifest/i)).toBeDefined();
    });

    const manifestTab = screen.getByText(/Reproducibility Manifest/i);
    fireEvent.click(manifestTab);

    expect(screen.getByText(/Reproducibility Manifest \(Schema v1\.0\.0\)/i)).toBeDefined();
    expect(screen.getByText(/robustness-test-999/)).toBeDefined();
    expect(screen.getAllByText(/male-cns:v1\.0/i).length).toBeGreaterThanOrEqual(1);
  });
});
