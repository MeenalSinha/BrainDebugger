import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PerturbationLab } from './components/PerturbationLab';
import { api } from './api';
import type {
  PerturbationComparisonResponse,
  ControlledExperimentResponse,
} from './types';

// Mock cytoscape to avoid canvas/DOM errors in jsdom
vi.mock('cytoscape', () => {
  const cyMock = {
    elements: vi.fn().mockReturnValue({ remove: vi.fn() }),
    add: vi.fn(),
    layout: vi.fn().mockReturnValue({ run: vi.fn(), stop: vi.fn() }),
    fit: vi.fn(),
    zoom: vi.fn().mockReturnValue(1),
    resize: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn(),
  };
  const cytoscapeFn = vi.fn().mockReturnValue(cyMock);
  return {
    default: cytoscapeFn,
    __esModule: true,
  };
});

// Mock API client
vi.mock('./api', () => ({
  api: {
    comparePerturbations: vi.fn(),
    runControlledExperiment: vi.fn(),
    validateInterventions: vi.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(public status: number, public detail: string) {
      super(detail);
    }
  },
}));

describe('PerturbationLab (V5) Component', () => {
  const mockComparisonResponse: PerturbationComparisonResponse = {
    experiment_id: 'exp-test-1234',
    timestamp: '2026-10-27T12:00:00Z',
    dataset: 'male-cns:v1.0',
    source_body_id: 10001,
    target_body_id: 814827,
    interventions: {
      disabled_neurons: [800146],
      disabled_edges: [{ body_pre: 10001, body_post: 800146 }],
    },
    path_comparison: {
      source_body_id: 10001,
      target_body_id: 814827,
      strategy: 'shortest',
      baseline_route_exists: true,
      baseline_hops: 2,
      baseline_total_weight: 90,
      baseline_paths_count: 2,
      perturbed_route_exists: true,
      perturbed_hops: 3,
      perturbed_total_weight: 45,
      perturbed_paths_count: 1,
      original_path_survived: false,
      alternative_path_found: true,
      delta_hops: 1,
      endpoint_disabled: false,
      disabled_endpoint_id: null,
      baseline_paths: [
        {
          rank: 1,
          hops: 2,
          total_weight: 90,
          bottleneck_weight: 20,
          score: null,
          log_cost: null,
          nodes: [
            { body_id: 10001, type: 'DNp01', instance: 'DNp01_L', superclass: 'descending', hop: 0 },
            { body_id: 800146, type: 'TTMn', instance: 'TTMn_R', superclass: 'vnc_motor', hop: 1 },
            { body_id: 814827, type: 'TargetType', instance: 'target_inst', superclass: 'vnc', hop: 2 },
          ],
          edges: [
            { body_pre: 10001, body_post: 800146, weight: 70, type_pre: 'DNp01', type_post: 'TTMn', instance_pre: null, instance_post: null, relative_weight_fraction: null },
            { body_pre: 800146, body_post: 814827, weight: 20, type_pre: 'TTMn', type_post: 'TargetType', instance_pre: null, instance_post: null, relative_weight_fraction: null },
          ],
        },
      ],
      perturbed_paths: [
        {
          rank: 1,
          hops: 3,
          total_weight: 45,
          bottleneck_weight: 10,
          score: null,
          log_cost: null,
          nodes: [
            { body_id: 10001, type: 'DNp01', instance: 'DNp01_L', superclass: 'descending', hop: 0 },
            { body_id: 999999, type: 'AltNode', instance: null, superclass: 'interneuron', hop: 1 },
            { body_id: 888888, type: 'AltNode2', instance: null, superclass: 'interneuron', hop: 2 },
            { body_id: 814827, type: 'TargetType', instance: 'target_inst', superclass: 'vnc', hop: 3 },
          ],
          edges: [
            { body_pre: 10001, body_post: 999999, weight: 20, type_pre: 'DNp01', type_post: 'AltNode', instance_pre: null, instance_post: null, relative_weight_fraction: null },
            { body_pre: 999999, body_post: 888888, weight: 15, type_pre: 'AltNode', type_post: 'AltNode2', instance_pre: null, instance_post: null, relative_weight_fraction: null },
            { body_pre: 888888, body_post: 814827, weight: 10, type_pre: 'AltNode2', type_post: 'TargetType', instance_pre: null, instance_post: null, relative_weight_fraction: null },
          ],
        },
      ],
    },
    reachability_comparison: {
      source_body_id: 10001,
      max_hops: 2,
      baseline_reachable_count: 50,
      perturbed_reachable_count: 35,
      delta_reachability: 15,
      retention_fraction: 0.7,
      lost_node_ids: [800146, 814827],
      lost_nodes_per_hop: { 1: 5, 2: 10 },
      baseline_layers: [
        { hop: 0, newly_reached_nodes: 1, cumulative_nodes: 1, layer_edges: 0, layer_weight: 0 },
        { hop: 1, newly_reached_nodes: 15, cumulative_nodes: 16, layer_edges: 15, layer_weight: 150 },
        { hop: 2, newly_reached_nodes: 34, cumulative_nodes: 50, layer_edges: 40, layer_weight: 340 },
      ],
      perturbed_layers: [
        { hop: 0, newly_reached_nodes: 1, cumulative_nodes: 1, layer_edges: 0, layer_weight: 0 },
        { hop: 1, newly_reached_nodes: 10, cumulative_nodes: 11, layer_edges: 10, layer_weight: 100 },
        { hop: 2, newly_reached_nodes: 24, cumulative_nodes: 35, layer_edges: 28, layer_weight: 240 },
      ],
      baseline_cascade: null,
      perturbed_cascade: null,
    },
    summary_text: 'Excluded 1 neuron and 1 directed edge. Reachability retained: 70.0%.',
    scientific_notice: 'Structural interventions represent non-destructive node/edge exclusions.',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial workspace controls and inputs', () => {
    render(
      <PerturbationLab
        selectedBodyId={10001}
        onSelectNeuron={vi.fn()}
      />
    );

    expect(screen.getByText(/Perturbation Lab/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/Source Body ID/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/Target Body ID/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Run Perturbation Analysis/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Exclude$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Exclude Directed Edge/i })).toBeTruthy();
  });

  it('allows adding and removing a neuron intervention', () => {
    render(
      <PerturbationLab
        selectedBodyId={null}
        onSelectNeuron={vi.fn()}
      />
    );

    const neuronInput = screen.getByPlaceholderText(/Neuron Body ID/i);
    fireEvent.change(neuronInput, { target: { value: '800146' } });

    const addBtn = screen.getByRole('button', { name: /^Exclude$/i });
    fireEvent.click(addBtn);

    // Active interventions should show #800146
    expect(screen.getByText(/Neuron #800146/i)).toBeTruthy();

    // Remove the intervention
    const restoreBtn = screen.getByTitle(/Restore this neuron/i);
    fireEvent.click(restoreBtn);

    // Should no longer be present
    expect(screen.queryByText(/Neuron #800146/i)).toBeNull();
  });

  it('allows adding and removing a directed edge intervention', () => {
    render(
      <PerturbationLab
        selectedBodyId={null}
        onSelectNeuron={vi.fn()}
      />
    );

    const preInput = screen.getByPlaceholderText(/Pre Body ID/i);
    const postInput = screen.getByPlaceholderText(/Post Body ID/i);

    fireEvent.change(preInput, { target: { value: '10001' } });
    fireEvent.change(postInput, { target: { value: '800146' } });

    const addEdgeBtn = screen.getByRole('button', { name: /Exclude Directed Edge/i });
    fireEvent.click(addEdgeBtn);

    // Should appear in active interventions
    expect(screen.getByText(/Edge: 10001 → 800146/i)).toBeTruthy();

    // Remove the edge
    const restoreEdgeBtn = screen.getByTitle(/Restore this directed edge/i);
    fireEvent.click(restoreEdgeBtn);

    expect(screen.queryByText(/Edge: 10001 → 800146/i)).toBeNull();
  });

  it('prevents adding duplicate interventions', () => {
    render(
      <PerturbationLab
        selectedBodyId={null}
        onSelectNeuron={vi.fn()}
      />
    );

    const neuronInput = screen.getByPlaceholderText(/Neuron Body ID/i);
    const addBtn = screen.getByRole('button', { name: /^Exclude$/i });

    fireEvent.change(neuronInput, { target: { value: '800146' } });
    fireEvent.click(addBtn);

    fireEvent.change(neuronInput, { target: { value: '800146' } });
    fireEvent.click(addBtn);

    expect(screen.getByText(/is already disabled/i)).toBeTruthy();
  });

  it('runs comparison analysis and displays before-and-after results', async () => {
    (api.comparePerturbations as any).mockResolvedValueOnce(mockComparisonResponse);

    render(
      <PerturbationLab
        selectedBodyId={10001}
        onSelectNeuron={vi.fn()}
      />
    );

    const runBtn = screen.getByRole('button', { name: /Run Perturbation Analysis/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(api.comparePerturbations).toHaveBeenCalled();
    });

    // Check metric cards
    expect(screen.getByText(/Reachability Retention \(ΔR\)/i)).toBeTruthy();
    expect(screen.getByText(/ΔR = -15 nodes lost/i)).toBeTruthy();
    expect(screen.getByText(/Target Pathway Availability/i)).toBeTruthy();
    expect(screen.getByText(/DETOUR FOUND/i)).toBeTruthy();
    expect(screen.getByText(/Per-Hop Structural Cascade Retention/i)).toBeTruthy();
    expect(screen.getByText(/Lost Reachable Neurons/i)).toBeTruthy();
  });

  it('allows undoing interventions and resetting to baseline', () => {
    render(
      <PerturbationLab
        selectedBodyId={null}
        onSelectNeuron={vi.fn()}
      />
    );

    const neuronInput = screen.getByPlaceholderText(/Neuron Body ID/i);
    const addBtn = screen.getByRole('button', { name: /^Exclude$/i });

    fireEvent.change(neuronInput, { target: { value: '800146' } });
    fireEvent.click(addBtn);
    expect(screen.getByText(/Neuron #800146/i)).toBeTruthy();

    const undoBtn = screen.getByTitle(/Revert most recent intervention change/i);
    fireEvent.click(undoBtn);
    expect(screen.queryByText(/Neuron #800146/i)).toBeNull();
  });

  it('runs a controlled experiment and displays results', async () => {
    const mockControlled: ControlledExperimentResponse = {
      experiment_id: 'ctrl-exp-999',
      experiment_type: 'random_nodes',
      random_seed: 42,
      selected_interventions: {
        disabled_neurons: [10002, 10003, 10004, 10005, 10006],
        disabled_edges: [],
      },
      comparison: mockComparisonResponse,
      multi_level_results: [
        {
          level: 1,
          disabled_neurons: [10002],
          reachable_count: 45,
          delta_reachability: 5,
          retention_fraction: 0.9,
          path_exists: true,
          path_hops: 2,
        },
      ],
    };

    (api.runControlledExperiment as any).mockResolvedValueOnce(mockControlled);

    render(
      <PerturbationLab
        selectedBodyId={10001}
        onSelectNeuron={vi.fn()}
      />
    );

    // Switch to Controlled Experiments tab
    const tabBtn = screen.getByRole('button', { name: /Controlled Experiments/i });
    fireEvent.click(tabBtn);

    expect(screen.getByText(/Automated Intervention Protocol/i)).toBeTruthy();

    const runExpBtn = screen.getByRole('button', { name: /Run Controlled Protocol/i });
    fireEvent.click(runExpBtn);

    await waitFor(() => {
      expect(api.runControlledExperiment).toHaveBeenCalled();
    });

    expect(screen.getByText(/Multi-Level Progressive Lesion Resilience Curve/i)).toBeTruthy();
  });
});
