import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NeuralDebugger } from './components/NeuralDebugger';
import type { PathItem } from './types';

// Mock PathwayGraphView since Cytoscape requires canvas context not present in pure jsdom
vi.mock('./components/PathwayGraphView', () => ({
  PathwayGraphView: () => <div data-testid="pathway-graph-mock">Pathway Graph Mock</div>,
}));

const mockPath: PathItem = {
  rank: 1,
  hops: 2,
  nodes: [
    { body_id: 10001, type: 'DNp01', instance: 'DNp01_R', superclass: 'descending_neuron', hop: 0 },
    { body_id: 800146, type: 'TTMn', instance: 'TTMn_R', superclass: 'interneuron', hop: 1 },
    { body_id: 814827, type: 'IN21A033', instance: null, superclass: 'interneuron', hop: 2 },
  ],
  edges: [
    { body_pre: 10001, body_post: 800146, weight: 70, type_pre: 'DNp01', type_post: 'TTMn', instance_pre: null, instance_post: null, relative_weight_fraction: null },
    { body_pre: 800146, body_post: 814827, weight: 5, type_pre: 'TTMn', type_post: 'IN21A033', instance_pre: null, instance_post: null, relative_weight_fraction: null },
  ],
  score: 0.9,
  log_cost: 0.1,
  total_weight: 75,
  bottleneck_weight: 5,
};

describe('NeuralDebugger Component', () => {
  it('renders notice when no path is supplied', () => {
    render(
      <NeuralDebugger
        path={null}
        sourceId={null}
        targetId={null}
        selectedBodyId={null}
        onSelectNeuron={vi.fn()}
      />
    );
    expect(screen.getByText(/Neural Debugger/i)).toBeTruthy();
    expect(screen.getByText(/No path loaded/i)).toBeTruthy();
  });

  it('initializes and renders controls with valid path', () => {
    const onSelect = vi.fn();
    render(
      <NeuralDebugger
        path={mockPath}
        sourceId={10001}
        targetId={814827}
        selectedBodyId={10001}
        onSelectNeuron={onSelect}
      />
    );

    expect(screen.getByText(/Neural Debugger/i)).toBeTruthy();
    expect(screen.getAllByText(/#10001/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/#814827/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^Step$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Continue$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Stop$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Restart$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Export JSON/i })).toBeTruthy();
    expect(screen.getByTestId('pathway-graph-mock')).toBeTruthy();
  });

  it('clicking Step advances cursor and calls onSelectNeuron', () => {
    const onSelect = vi.fn();
    render(
      <NeuralDebugger
        path={mockPath}
        sourceId={10001}
        targetId={814827}
        selectedBodyId={10001}
        onSelectNeuron={onSelect}
      />
    );

    const stepBtn = screen.getByRole('button', { name: /^Step$/i });
    fireEvent.click(stepBtn);

    // Selected body ID should be intermediate node 800146
    expect(onSelect).toHaveBeenCalledWith(800146);
  });

  it('switches between Route Steps and Breakpoints subtabs', () => {
    render(
      <NeuralDebugger
        path={mockPath}
        sourceId={10001}
        targetId={814827}
        selectedBodyId={10001}
        onSelectNeuron={vi.fn()}
      />
    );

    const bpTab = screen.getByRole('button', { name: /Breakpoints \(/i });
    fireEvent.click(bpTab);

    expect(screen.getByText(/Configured Breakpoints/i)).toBeTruthy();
    expect(screen.getAllByText(/Add Breakpoint/i).length).toBeGreaterThan(0);
  });
});
