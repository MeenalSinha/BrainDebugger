import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PathwayTracer } from './components/PathwayTracer';
import { api } from './api';
import type { PathwaySearchResponse, DownstreamCascadeResponse } from './types';

vi.mock('./api', () => ({
  api: {
    findPaths: vi.fn(),
    getDownstreamCascade: vi.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(public status: number, public detail: string) {
      super(detail);
    }
  },
}));

describe('PathwayTracer V3 Component', () => {
  const mockPathwayResponse: PathwaySearchResponse = {
    source_body_id: 10001,
    target_body_id: 814827,
    strategy: 'shortest',
    max_hops: 5,
    max_paths: 3,
    returned_count: 2,
    status: 'found',
    is_partial: false,
    limit_reason: null,
    explored_nodes: 45,
    explored_edges: 90,
    dataset: 'male-cns:v1.0',
    source_file: 'connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather',
    coverage_notice: 'traced-only dataset',
    scientific_qualification: 'Shortest structural paths reflect fewest recorded synaptic hops.',
    paths: [
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
          { body_pre: 10001, body_post: 800146, weight: 70, type_pre: 'DNp01', type_post: 'TTMn', instance_pre: 'DNp01_L', instance_post: 'TTMn_R', relative_weight_fraction: 0.059 },
          { body_pre: 800146, body_post: 814827, weight: 20, type_pre: 'TTMn', type_post: 'TargetType', instance_pre: 'TTMn_R', instance_post: 'target_inst', relative_weight_fraction: 0.156 },
        ],
      },
      {
        rank: 2,
        hops: 3,
        total_weight: 120,
        bottleneck_weight: 15,
        score: null,
        log_cost: null,
        nodes: [
          { body_id: 10001, type: 'DNp01', instance: 'DNp01_L', superclass: 'descending', hop: 0 },
          { body_id: 811606, type: 'InterType', instance: 'inter_inst', superclass: 'vnc', hop: 1 },
          { body_id: 800146, type: 'TTMn', instance: 'TTMn_R', superclass: 'vnc_motor', hop: 2 },
          { body_id: 814827, type: 'TargetType', instance: 'target_inst', superclass: 'vnc', hop: 3 },
        ],
        edges: [
          { body_pre: 10001, body_post: 811606, weight: 30, type_pre: 'DNp01', type_post: 'InterType', instance_pre: 'DNp01_L', instance_post: 'inter_inst', relative_weight_fraction: 0.025 },
          { body_pre: 811606, body_post: 800146, weight: 15, type_pre: 'InterType', type_post: 'TTMn', instance_pre: 'inter_inst', instance_post: 'TTMn_R', relative_weight_fraction: 0.100 },
          { body_pre: 800146, body_post: 814827, weight: 20, type_pre: 'TTMn', type_post: 'TargetType', instance_pre: 'TTMn_R', instance_post: 'target_inst', relative_weight_fraction: 0.156 },
        ],
      },
    ],
  };

  const mockCascadeResponse: DownstreamCascadeResponse = {
    source_body_id: 10001,
    max_hops: 2,
    max_nodes: 300,
    max_edges: 600,
    min_weight: null,
    total_unique_nodes: 314,
    total_edges: 320,
    is_truncated: false,
    truncation_reason: null,
    dataset: 'male-cns:v1.0',
    source_file: 'connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather',
    coverage_notice: 'traced-only subset',
    scientific_qualification: 'Hop distance is a structural graph metric.',
    layers: [
      { hop: 0, newly_reached_nodes: 1, cumulative_nodes: 1, layer_edges: 0, layer_weight: 0 },
      { hop: 1, newly_reached_nodes: 313, cumulative_nodes: 314, layer_edges: 313, layer_weight: 1480 },
    ],
    nodes: [
      { body_id: 10001, type: 'DNp01', instance: 'DNp01_L', superclass: 'descending', hop: 0, in_degree: 0, out_degree: 313 },
      { body_id: 800146, type: 'TTMn', instance: 'TTMn_R', superclass: 'vnc_motor', hop: 1, in_degree: 1, out_degree: 20 },
    ],
    edges: [
      { body_pre: 10001, body_post: 800146, weight: 70, pre_hop: 0, post_hop: 1 },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders pathway search controls properly', () => {
    render(
      <PathwayTracer
        selectedBodyId={null}
        onSelectNeuron={vi.fn()}
        onPathwayCalculated={vi.fn()}
        onActivePathChanged={vi.fn()}
        onCascadeCalculated={vi.fn()}
        onModeChanged={vi.fn()}
      />
    );

    expect(screen.getByText('Structural Pathway Parameters')).toBeDefined();
    expect(screen.getByPlaceholderText('e.g. 10001')).toBeDefined();
    expect(screen.getByPlaceholderText('e.g. 814827')).toBeDefined();
    expect(screen.getByText('Trace Pathway')).toBeDefined();
  });

  it('executes path search and renders comparison table and details', async () => {
    vi.mocked(api.findPaths).mockResolvedValue(mockPathwayResponse);
    const onPathwayCalculated = vi.fn();
    const onActivePathChanged = vi.fn();

    render(
      <PathwayTracer
        selectedBodyId={null}
        onSelectNeuron={vi.fn()}
        onPathwayCalculated={onPathwayCalculated}
        onActivePathChanged={onActivePathChanged}
        onCascadeCalculated={vi.fn()}
        onModeChanged={vi.fn()}
      />
    );

    const srcInput = screen.getByPlaceholderText('e.g. 10001');
    const dstInput = screen.getByPlaceholderText('e.g. 814827');

    fireEvent.change(srcInput, { target: { value: '10001' } });
    fireEvent.change(dstInput, { target: { value: '814827' } });

    const searchBtn = screen.getByText('Trace Pathway');
    fireEvent.click(searchBtn);

    await waitFor(() => {
      expect(api.findPaths).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceBodyId: 10001,
          targetBodyId: 814827,
          strategy: 'shortest',
        }),
        expect.any(AbortSignal),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Discovered 2 distinct structural routes.')).toBeDefined();
      expect(screen.getByText('Discovered Alternative Routes')).toBeDefined();
      expect(screen.getByText('#1')).toBeDefined();
      expect(screen.getByText('#2')).toBeDefined();
    });

    expect(onPathwayCalculated).toHaveBeenCalledWith(mockPathwayResponse);
    expect(onActivePathChanged).toHaveBeenCalledWith(mockPathwayResponse.paths[0]);
  });

  it('renders honest no-route message when no qualifying path exists', async () => {
    const noPathResponse: PathwaySearchResponse = {
      ...mockPathwayResponse,
      returned_count: 0,
      status: 'no_path_found',
      paths: [],
    };
    vi.mocked(api.findPaths).mockResolvedValue(noPathResponse);

    render(
      <PathwayTracer
        selectedBodyId={null}
        onSelectNeuron={vi.fn()}
        onPathwayCalculated={vi.fn()}
        onActivePathChanged={vi.fn()}
        onCascadeCalculated={vi.fn()}
        onModeChanged={vi.fn()}
      />
    );

    const srcInput = screen.getByPlaceholderText('e.g. 10001');
    const dstInput = screen.getByPlaceholderText('e.g. 814827');
    fireEvent.change(srcInput, { target: { value: '10001' } });
    fireEvent.change(dstInput, { target: { value: '999999' } });
    fireEvent.click(screen.getByText('Trace Pathway'));

    await waitFor(() => {
      expect(screen.getByText('No qualifying route found within the configured search limits.')).toBeDefined();
    });
  });

  it('switches to Downstream Cascade tab and executes cascade analysis', async () => {
    vi.mocked(api.getDownstreamCascade).mockResolvedValue(mockCascadeResponse);
    const onCascadeCalculated = vi.fn();
    const onModeChanged = vi.fn();

    render(
      <PathwayTracer
        selectedBodyId={null}
        onSelectNeuron={vi.fn()}
        onPathwayCalculated={vi.fn()}
        onActivePathChanged={vi.fn()}
        onCascadeCalculated={onCascadeCalculated}
        onModeChanged={onModeChanged}
      />
    );

    // Switch to cascade tab
    const cascadeTabBtn = screen.getByText('Downstream Cascade');
    fireEvent.click(cascadeTabBtn);

    expect(onModeChanged).toHaveBeenCalledWith('cascade');
    expect(screen.getByText('Downstream Reachability Parameters')).toBeDefined();

    // Input root neuron
    const rootInput = screen.getByPlaceholderText('e.g. 10001');
    fireEvent.change(rootInput, { target: { value: '10001' } });

    // Run cascade
    const runBtn = screen.getByText('Run Cascade Analysis');
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(api.getDownstreamCascade).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyId: 10001,
          maxHops: 3,
        }),
        expect.any(AbortSignal),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Downstream Reachability: 314 Nodes, 320 Edges')).toBeDefined();
      expect(screen.getByText('Hop Distance Layer Distribution')).toBeDefined();
      expect(screen.getByText('Hop 0 (Root)')).toBeDefined();
      expect(screen.getByText('Hop 1')).toBeDefined();
    });

    expect(onCascadeCalculated).toHaveBeenCalledWith(mockCascadeResponse);
  });
});
