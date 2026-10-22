import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { InspectorPanel } from './components/InspectorPanel';
import { api } from './api';
import type { Neuron, ConnectivitySummaryResponse, ConnectionListResponse } from './types';

// Mock API module
vi.mock('./api', () => ({
  api: {
    getNeuron: vi.fn(),
    getConnectivitySummary: vi.fn(),
    getConnections: vi.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(public status: number, public detail: string) {
      super(detail);
    }
  },
}));

describe('InspectorPanel V2 Component', () => {
  const mockNeuron: Neuron = {
    body_id: 10001,
    cell_type: 'DNp01',
    instance: 'DNp01_L',
    superclass: 'descending',
    status: 'Traced',
    status_label: 'Traced',
    soma_side: 'L',
    soma_neuromere: 'T1',
    subclass: null,
    hemi_brain_type: null,
    consensus_nt: 'acetylcholine',
    pre_synapses: 1500,
    post_synapses: 4200,
    synweight: 5700,
    entry_nerve: null,
    exit_nerve: 'CV',
    dimorphism: null,
    group: 'DNp',
    dataset: 'male-cns:v1.0',
    dataset_attribution: 'Schlegel et al. 2024',
  };

  const mockSummary: ConnectivitySummaryResponse = {
    body_id: 10001,
    incoming: {
      direction: 'incoming',
      partner_count: 695,
      record_count: 695,
      total_weight: 16051,
      body_stat_synapses: 4200,
    },
    outgoing: {
      direction: 'outgoing',
      partner_count: 313,
      record_count: 313,
      total_weight: 1480,
      body_stat_synapses: 1500,
    },
    source_file: 'connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather',
    is_traced_only_subset: true,
    coverage_notice: 'Traced-only subset',
    dataset: 'male-cns:v1.0',
  };

  const mockOutgoingConnections: ConnectionListResponse = {
    body_id: 10001,
    direction: 'outgoing',
    connections: [
      {
        body_pre: 10001,
        body_post: 800146,
        weight: 70,
        type_pre: 'DNp01',
        type_post: 'TTMn',
        instance_pre: 'DNp01_L',
        instance_post: 'TTMn_L',
        superclass_pre: 'descending',
        superclass_post: 'motor',
      },
      {
        body_pre: 10001,
        body_post: 800178,
        weight: 32,
        type_pre: 'DNp01',
        type_post: 'IN11A001',
        instance_pre: 'DNp01_L',
        instance_post: null,
        superclass_pre: 'descending',
        superclass_post: 'interneuron',
      },
    ],
    returned_count: 2,
    total_matched: 313,
    total_in_source: 313,
    unique_partners: 313,
    total: 313,
    limit: 25,
    offset: 0,
    has_more: true,
    sort_by: 'weight',
    sort_order: 'desc',
    dataset: 'male-cns:v1.0',
    source_file: 'connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather',
    is_traced_only_subset: true,
    coverage_notice: 'Traced-only subset',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when bodyId is null', () => {
    render(<InspectorPanel bodyId={null} onSelectPartner={vi.fn()} />);
    expect(screen.getByText('No Neuron Selected')).toBeDefined();
    expect(screen.getByText(/Select a neuron from search results/)).toBeDefined();
  });

  it('renders structured identity header, neurotransmitter, and status', async () => {
    vi.mocked(api.getNeuron).mockResolvedValue(mockNeuron);
    vi.mocked(api.getConnectivitySummary).mockResolvedValue(mockSummary);
    vi.mocked(api.getConnections).mockResolvedValue(mockOutgoingConnections);

    render(<InspectorPanel bodyId={10001} onSelectPartner={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('#10001')).toBeDefined();
    });

    const dnpMatches = screen.getAllByText('DNp01');
    expect(dnpMatches.length).toBeGreaterThan(0);
    expect(screen.getAllByText('DNp01_L').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Traced').length).toBeGreaterThan(0);
    expect(screen.getByText('NT: acetylcholine')).toBeDefined();
  });

  it('renders connectivity intelligence overview cards with accurate metrics', async () => {
    vi.mocked(api.getNeuron).mockResolvedValue(mockNeuron);
    vi.mocked(api.getConnectivitySummary).mockResolvedValue(mockSummary);
    vi.mocked(api.getConnections).mockResolvedValue(mockOutgoingConnections);

    render(<InspectorPanel bodyId={10001} onSelectPartner={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getAllByText('313').length).toBeGreaterThan(0);
      expect(screen.getAllByText('695').length).toBeGreaterThan(0);
      expect(screen.getByText('1,480')).toBeDefined();
      expect(screen.getByText('16,051')).toBeDefined();
    });

    expect(screen.getByText(/traced-only subset/i)).toBeDefined();
  });

  it('displays honest unavailable states for missing optional annotations', async () => {
    const sparseNeuron: Neuron = {
      body_id: 20002,
      cell_type: null,
      instance: null,
      superclass: null,
      status: null,
      status_label: null,
      soma_side: null,
      soma_neuromere: null,
      subclass: null,
      hemi_brain_type: null,
      consensus_nt: null,
      pre_synapses: null,
      post_synapses: null,
      synweight: null,
    };

    vi.mocked(api.getNeuron).mockResolvedValue(sparseNeuron);
    vi.mocked(api.getConnectivitySummary).mockResolvedValue(mockSummary);
    vi.mocked(api.getConnections).mockResolvedValue(mockOutgoingConnections);

    render(<InspectorPanel bodyId={20002} onSelectPartner={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('#20002 (untyped)')).toBeDefined();
    });

    const unavailables = screen.getAllByText('—');
    expect(unavailables.length).toBeGreaterThan(0);
  });

  it('renders connection table with direction, partner IDs, weights, and partner navigation', async () => {
    const handleSelectPartner = vi.fn();
    vi.mocked(api.getNeuron).mockResolvedValue(mockNeuron);
    vi.mocked(api.getConnectivitySummary).mockResolvedValue(mockSummary);
    vi.mocked(api.getConnections).mockResolvedValue(mockOutgoingConnections);

    render(<InspectorPanel bodyId={10001} onSelectPartner={handleSelectPartner} />);

    await waitFor(() => {
      expect(screen.getByText('#800146')).toBeDefined();
      expect(screen.getByText('TTMn')).toBeDefined();
      expect(screen.getByText('70')).toBeDefined();
    });

    const partnerRow = screen.getByText('#800146').closest('tr');
    expect(partnerRow).toBeDefined();
    if (partnerRow) {
      fireEvent.click(partnerRow);
      expect(handleSelectPartner).toHaveBeenCalledWith(800146);
    }
  });

  it('supports keyboard activation for partner navigation', async () => {
    const handleSelectPartner = vi.fn();
    vi.mocked(api.getNeuron).mockResolvedValue(mockNeuron);
    vi.mocked(api.getConnectivitySummary).mockResolvedValue(mockSummary);
    vi.mocked(api.getConnections).mockResolvedValue(mockOutgoingConnections);

    render(<InspectorPanel bodyId={10001} onSelectPartner={handleSelectPartner} />);

    await waitFor(() => {
      expect(screen.getByText('#800178')).toBeDefined();
    });

    const partnerRow = screen.getByText('#800178').closest('tr');
    if (partnerRow) {
      fireEvent.keyDown(partnerRow, { key: 'Enter', code: 'Enter' });
      expect(handleSelectPartner).toHaveBeenCalledWith(800178);
    }
  });

  it('shows retry button when profile fetch fails and executes retry on click', async () => {
    vi.mocked(api.getNeuron).mockRejectedValueOnce(new Error('Network offline'));
    vi.mocked(api.getConnectivitySummary).mockResolvedValue(mockSummary);
    vi.mocked(api.getConnections).mockResolvedValue(mockOutgoingConnections);

    render(<InspectorPanel bodyId={10001} onSelectPartner={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load profile')).toBeDefined();
    });

    vi.mocked(api.getNeuron).mockResolvedValue(mockNeuron);
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getAllByText('DNp01').length).toBeGreaterThan(0);
    });
  });
});
