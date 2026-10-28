import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ResearchNotebook } from './components/ResearchNotebook';
import { api } from './api';
import type { HypothesisRecord, ResearchProject, ResearchNotebookExport } from './types';

vi.mock('./api', () => ({
  api: {
    listResearchProjects: vi.fn(),
    createResearchProject: vi.fn(),
    getResearchProject: vi.fn(),
    listHypotheses: vi.fn(),
    exportResearchNotebook: vi.fn(),
    importResearchNotebook: vi.fn(),
  },
}));

describe('ResearchNotebook (V11) Component', () => {
  const mockHypothesis: HypothesisRecord = {
    hypothesis_id: 'hyp-test-202',
    project_id: 'proj-1',
    title: 'T4a Directional Tuning Stability',
    statement: 'Visual motion detector T4a (#20001) retains stable connectivity across parameter sweeps.',
    category: 'candidate_stability',
    scope: 'visual_motion_detection_t4_t5',
    rationale: 'Observed in MaleCNS v1.0.',
    linked_execution_ids: [],
    linked_robustness_ids: [],
    linked_concept_ids: [],
    target_neurons: [20001],
    target_edges: [],
    evidence_records: [],
    alternative_explanations: [],
    assumptions: [],
    limitations: [],
    proposed_studies: [],
    status: 'draft',
    status_history: [],
    created_at: '2026-10-28T12:00:00Z',
    updated_at: '2026-10-28T12:00:00Z',
  };

  const mockProject: ResearchProject = {
    project_id: 'proj-1',
    title: 'Visual Circuit Investigation',
    description: 'Investigating motion detection circuits.',
    objective: 'Empirically verify T4a stability.',
    linked_concept_ids: ['visual_motion_detection_t4_t5'],
    hypotheses: [mockHypothesis],
    timeline: [
      {
        event_id: 'evt-1',
        event_type: 'hypothesis_created',
        timestamp: '2026-10-28T12:00:00Z',
        title: 'Formulated Hypothesis: T4a Directional Tuning',
        description: 'Initial hypothesis logged.',
      },
    ],
    notes: [],
    created_at: '2026-10-28T12:00:00Z',
    updated_at: '2026-10-28T12:00:00Z',
  };

  const mockExport: ResearchNotebookExport = {
    export_version: '1.0.0',
    schema_version: '1.0.0',
    exported_at: '2026-10-28T12:00:00Z',
    dataset_version: 'male-cns:v1.0',
    projects: [mockProject],
    hypotheses: [mockHypothesis],
    metadata: {
      project_count: 1,
      hypothesis_count: 1,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.listResearchProjects as any).mockResolvedValue([mockProject]);
    (api.listHypotheses as any).mockResolvedValue([mockHypothesis]);
    (api.exportResearchNotebook as any).mockResolvedValue(mockExport);
  });

  it('renders research notebook header and project selector', async () => {
    render(
      <ResearchNotebook
        onOpenHypothesis={vi.fn()}
        onNavigateToWorkbench={vi.fn()}
      />
    );

    expect(screen.getByText(/Reproducible Research Notebook/i)).toBeDefined();

    await waitFor(() => {
      expect(screen.getAllByText(/Visual Circuit Investigation/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays Kanban columns and hypothesis card', async () => {
    render(
      <ResearchNotebook
        onOpenHypothesis={vi.fn()}
        onNavigateToWorkbench={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Draft/i)).toBeDefined();
      expect(screen.getByText(/Ready For Testing/i)).toBeDefined();
      expect(screen.getByText(/Supported/i)).toBeDefined();
    });

    expect(screen.getByText(/T4a Directional Tuning Stability/i)).toBeDefined();
  });

  it('switches to research timeline view', async () => {
    render(
      <ResearchNotebook
        onOpenHypothesis={vi.fn()}
        onNavigateToWorkbench={vi.fn()}
      />
    );

    const timelineBtn = await screen.findByRole('button', { name: /Research Timeline/i });
    expect(timelineBtn).toBeDefined();

    fireEvent.click(timelineBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Chronological Research Timeline/i })).toBeDefined();
      expect(screen.getByText(/Formulated Hypothesis: T4a Directional Tuning/i)).toBeDefined();
    });
  });

  it('switches to project provenance notes view', async () => {
    render(
      <ResearchNotebook
        onOpenHypothesis={vi.fn()}
        onNavigateToWorkbench={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Project Provenance/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Project Provenance/i));

    await waitFor(() => {
      expect(screen.getByText(/Project Provenance & MaleCNS v1\.0 Linkages/i)).toBeDefined();
      expect(screen.getByText(/Strict Scientific Provenance Guarantee/i)).toBeDefined();
    });
  });
});
