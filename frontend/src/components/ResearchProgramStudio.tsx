/**
 * BrainDebugger — Research Program Studio Workspace (V12)
 *
 * Project-Level Research Synthesis, Evidence Gap Analysis & Multi-Study Campaign Execution.
 * Built for Janelia MaleCNS v1.0.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  FolderKanban,
  RefreshCw,
  GitMerge,
  AlertTriangle,
  HelpCircle,
  ListOrdered,
  Workflow,
  PlayCircle,
  FileDown,
  CheckCircle2,
  Plus,
  Trash2,
  ShieldAlert,
  Sliders,
} from 'lucide-react';
import { api } from '../api';
import type {
  ResearchProject,
  ResearchSynthesis,
  ResearchAgenda,
  StudyDependency,
  ContradictionRecord,
  EvidenceGap,
  CampaignPreviewResponse,
  ResearchCampaign,
  StudyDependencyType,
  ContradictionReviewStatus,
  GapStatus,
} from '../types';

interface Props {
  onNavigateToHypothesis?: (hypothesisId: string) => void;
  onNavigateToWorkbench?: () => void;
}

export const ResearchProgramStudio: React.FC<Props> = ({
  onNavigateToHypothesis,
  onNavigateToWorkbench,
}) => {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('proj-default');
  const [synthesis, setSynthesis] = useState<ResearchSynthesis | null>(null);
  const [agenda, setAgenda] = useState<ResearchAgenda | null>(null);
  const [dependencies, setDependencies] = useState<StudyDependency[]>([]);
  const [campaign, setCampaign] = useState<ResearchCampaign | null>(null);
  const [campaignPreview, setCampaignPreview] = useState<CampaignPreviewResponse | null>(null);

  const [activeTab, setActiveTab] = useState<
    'synthesis' | 'contradictions' | 'gaps' | 'agenda' | 'dependencies' | 'campaigns' | 'reports'
  >('synthesis');

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // New Project modal state
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectObjective, setNewProjectObjective] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');

  // Contradiction Review modal
  const [reviewContradiction, setReviewContradiction] = useState<ContradictionRecord | null>(null);
  const [reviewStatus, setReviewStatus] = useState<ContradictionReviewStatus>('confirmed_inconsistency');
  const [reviewRationale, setReviewRationale] = useState<string>('');

  // Evidence Gap Update modal
  const [selectedGap, setSelectedGap] = useState<EvidenceGap | null>(null);
  const [gapStatus, setGapStatus] = useState<GapStatus>('in_progress');
  const [gapNotes, setGapNotes] = useState<string>('');

  // Agenda weights
  const [weightGap, setWeightGap] = useState<number>(0.35);
  const [weightHyp, setWeightHyp] = useState<number>(0.25);
  const [weightUnc, setWeightUnc] = useState<number>(0.20);
  const [weightFeas, setWeightFeas] = useState<number>(0.15);
  const [weightCost, setWeightCost] = useState<number>(0.15);

  // Dependencies form
  const [depStudyId, setDepStudyId] = useState<string>('');
  const [depPrereqId, setDepPrereqId] = useState<string>('');
  const [depType, setDepType] = useState<StudyDependencyType>('required_prerequisite');

  // Campaigns state
  const [selectedStudyIds, setSelectedStudyIds] = useState<string[]>([]);
  const [confirmExecute, setConfirmExecute] = useState(false);

  // Markdown Report Preview
  const [reportMarkdown, setReportMarkdown] = useState<string>('');
  const [showReportModal, setShowReportModal] = useState(false);

  // Load Projects
  const loadProjects = useCallback(async () => {
    try {
      const projs = await api.listResearchProjects();
      setProjects(projs);
      setSelectedProjectId((current) => {
        if (projs.length > 0 && !projs.some((p) => p.project_id === current)) {
          return projs[0].project_id;
        }
        return current;
      });
    } catch (err: any) {
      console.error('Failed to load projects:', err);
    }
  }, []);

  // Load Project Data (Synthesis, Agenda, Dependencies)
  const loadProjectData = useCallback(async (projectId: string, refreshSynthesis: boolean = false) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const [syn, ag, deps] = await Promise.all([
        api.generateProjectSynthesis(projectId, { refresh: refreshSynthesis }),
        api.getProjectAgenda(projectId).catch(() => null),
        api.listProjectStudyDependencies(projectId).catch(() => []),
      ]);
      setSynthesis(syn);
      setAgenda(ag);
      setDependencies(deps);
    } catch (err: any) {
      setError(err?.detail || err?.message || 'Failed to load project synthesis data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectData(selectedProjectId, false);
    }
  }, [selectedProjectId, loadProjectData]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectTitle.trim()) return;
    setActionLoading(true);
    try {
      const created = await api.createResearchProject({
        title: newProjectTitle.trim(),
        objective: newProjectObjective.trim(),
        description: newProjectDescription.trim(),
      });
      setShowNewProjectModal(false);
      setNewProjectTitle('');
      setNewProjectObjective('');
      setNewProjectDescription('');
      await loadProjects();
      setSelectedProjectId(created.project_id);
      setNotice(`Project "${created.title}" created successfully.`);
    } catch (err: any) {
      setError(err?.detail || err?.message || 'Failed to create project');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReviewContradiction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewContradiction || !selectedProjectId) return;
    setActionLoading(true);
    try {
      await api.reviewProjectContradiction(selectedProjectId, reviewContradiction.contradiction_id, {
        review_status: reviewStatus,
        resolution_rationale: reviewRationale.trim() || 'Reviewed by researcher',
      });
      setReviewContradiction(null);
      setReviewRationale('');
      setNotice('Contradiction review saved.');
      await loadProjectData(selectedProjectId, false);
    } catch (err: any) {
      setError(err?.detail || err?.message || 'Failed to review contradiction');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateGap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGap || !selectedProjectId) return;
    setActionLoading(true);
    try {
      await api.updateProjectEvidenceGap(selectedProjectId, selectedGap.gap_id, {
        status: gapStatus,
        resolution_notes: gapNotes.trim() || undefined,
      });
      setSelectedGap(null);
      setGapNotes('');
      setNotice('Evidence gap updated.');
      await loadProjectData(selectedProjectId, false);
    } catch (err: any) {
      setError(err?.detail || err?.message || 'Failed to update evidence gap');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecalculateAgenda = async () => {
    if (!selectedProjectId) return;
    setActionLoading(true);
    setError(null);
    try {
      const generated = await api.generateProjectAgenda(selectedProjectId, {
        weight_gap_importance: weightGap,
        weight_hypothesis_coverage: weightHyp,
        weight_uncertainty_reduction: weightUnc,
        weight_feasibility: weightFeas,
        weight_cost_penalty: weightCost,
      });
      setAgenda(generated);
      setNotice('Research agenda updated with custom prioritization criteria.');
    } catch (err: any) {
      setError(err?.detail || err?.message || 'Failed to calculate research agenda');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddDependency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depStudyId.trim() || !depPrereqId.trim() || !selectedProjectId) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.createProjectStudyDependency(selectedProjectId, {
        study_id: depStudyId.trim(),
        prerequisite_study_id: depPrereqId.trim(),
        dependency_type: depType,
      });
      setDepStudyId('');
      setDepPrereqId('');
      const updatedDeps = await api.listProjectStudyDependencies(selectedProjectId);
      setDependencies(updatedDeps);
      setNotice('Prerequisite dependency registered.');
      await handleRecalculateAgenda();
    } catch (err: any) {
      setError(err?.detail || err?.message || 'Failed to add dependency (cycle or invalid link)');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteDependency = async (depId: string) => {
    if (!selectedProjectId) return;
    setActionLoading(true);
    try {
      await api.deleteProjectStudyDependency(selectedProjectId, depId);
      const updatedDeps = await api.listProjectStudyDependencies(selectedProjectId);
      setDependencies(updatedDeps);
      setNotice('Dependency removed.');
      await handleRecalculateAgenda();
    } catch (err: any) {
      setError(err?.detail || err?.message || 'Failed to remove dependency');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleStudySelection = (studyId: string) => {
    setSelectedStudyIds((prev) =>
      prev.includes(studyId) ? prev.filter((id) => id !== studyId) : [...prev, studyId]
    );
  };

  const handlePreviewCampaign = async () => {
    if (!selectedProjectId || selectedStudyIds.length === 0) return;
    setActionLoading(true);
    setError(null);
    try {
      const preview = await api.previewResearchCampaign(selectedProjectId, selectedStudyIds);
      setCampaignPreview(preview);
    } catch (err: any) {
      setError(err?.detail || err?.message || 'Failed to generate campaign preview');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecuteCampaign = async () => {
    if (!selectedProjectId || selectedStudyIds.length === 0 || !confirmExecute) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await api.executeResearchCampaign(selectedProjectId, {
        study_ids: selectedStudyIds,
        stop_on_first_failure: false,
      });
      setCampaign(res);
      setNotice(`Campaign executed: ${res.completed_count} completed, ${res.failed_count} failed.`);
      await loadProjectData(selectedProjectId, true);
    } catch (err: any) {
      setError(err?.detail || err?.message || 'Campaign execution failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenMarkdownReport = async () => {
    if (!selectedProjectId) return;
    setActionLoading(true);
    try {
      const md = await api.getProjectSynthesisMarkdownReport(selectedProjectId);
      setReportMarkdown(md);
      setShowReportModal(true);
    } catch (err: any) {
      setError(err?.detail || err?.message || 'Failed to generate Markdown report');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadCsv = (tableType: 'gaps' | 'contradictions' | 'agenda' | 'campaigns') => {
    if (!selectedProjectId) return;
    window.open(
      `/api/research/projects/${encodeURIComponent(selectedProjectId)}/export/csv?table_type=${tableType}`,
      '_blank'
    );
  };

  // Compile available study candidates from project hypotheses & agenda recommendations
  const candidateStudiesMap = new Map<string, { study_id: string; title: string; hypothesis_id: string }>();

  const currentProject = projects.find((p) => p.project_id === selectedProjectId);
  if (currentProject && currentProject.hypotheses) {
    for (const h of currentProject.hypotheses) {
      if (h.proposed_studies) {
        for (const s of h.proposed_studies) {
          candidateStudiesMap.set(s.study_id, {
            study_id: s.study_id,
            title: s.title,
            hypothesis_id: h.hypothesis_id,
          });
        }
      }
    }
  }

  if (agenda) {
    for (const act of agenda.recommended_actions) {
      if (!candidateStudiesMap.has(act.action_id)) {
        candidateStudiesMap.set(act.action_id, {
          study_id: act.action_id,
          title: act.title,
          hypothesis_id: act.target_hypothesis_ids?.[0] || 'proj',
        });
      }
    }
  }

  const allCandidateStudies = Array.from(candidateStudiesMap.values());

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        overflow: 'hidden',
      }}
    >
      {/* Top Header Bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 20px',
          borderBottom: '1px solid #1e293b',
          backgroundColor: '#0b1120',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderKanban size={20} color="#38bdf8" />
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
              Research Program Studio
            </h1>
            <span
              style={{
                fontSize: 10,
                textTransform: 'uppercase',
                padding: '2px 6px',
                borderRadius: 4,
                backgroundColor: '#1e293b',
                color: '#38bdf8',
                border: '1px solid #0284c7',
                fontWeight: 600,
              }}
            >
              V12 Program Synthesis
            </span>
          </div>

          {/* Project Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label htmlFor="project-select" style={{ fontSize: 12, color: '#94a3b8' }}>
              Project:
            </label>
            <select
              id="project-select"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              style={{
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 13,
              }}
            >
              {projects.map((p) => (
                <option key={p.project_id} value={p.project_id}>
                  {p.title} ({p.hypotheses?.length || 0} hyp)
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowNewProjectModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 4,
                backgroundColor: '#1e293b',
                color: '#94a3b8',
                border: '1px solid #334155',
                fontSize: 12,
                cursor: 'pointer',
              }}
              title="Create new research project"
            >
              <Plus size={13} />
              <span>New</span>
            </button>
          </div>
        </div>

        {/* Action Controls & Freshness Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {synthesis && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: synthesis.is_fresh ? '#10b981' : '#f59e0b',
                }}
              />
              <span style={{ color: synthesis.is_fresh ? '#10b981' : '#f59e0b', fontWeight: 500 }}>
                {synthesis.is_fresh ? 'Synthesis Fresh' : 'Outdated'}
              </span>
            </div>
          )}

          <button
            onClick={() => loadProjectData(selectedProjectId, true)}
            disabled={loading || actionLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 6,
              backgroundColor: '#0284c7',
              color: '#ffffff',
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: loading || actionLoading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Regenerate Synthesis</span>
          </button>
        </div>
      </header>

      {/* Notifications & Error banner */}
      {error && (
        <div
          style={{
            padding: '8px 16px',
            backgroundColor: '#7f1d1d',
            color: '#fecaca',
            borderBottom: '1px solid #b91c1c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={15} />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', color: '#fecaca', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {notice && (
        <div
          style={{
            padding: '8px 16px',
            backgroundColor: '#064e3b',
            color: '#a7f3d0',
            borderBottom: '1px solid #059669',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={15} />
            <span>{notice}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            style={{ background: 'none', border: 'none', color: '#a7f3d0', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Overview Status Strip */}
      {synthesis && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 20px',
            backgroundColor: '#131d33',
            borderBottom: '1px solid #1e293b',
            fontSize: 12,
            color: '#94a3b8',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span>
              <strong style={{ color: '#f1f5f9' }}>{synthesis.total_hypotheses}</strong> Hypotheses
            </span>
            <span>•</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {Object.entries(synthesis.status_distribution).map(([status, count]) => (
                <span
                  key={status}
                  style={{
                    backgroundColor: '#1e293b',
                    padding: '2px 6px',
                    borderRadius: 4,
                    color: '#e2e8f0',
                    fontSize: 11,
                  }}
                >
                  {status.replace(/_/g, ' ')}: <strong style={{ color: '#38bdf8' }}>{count}</strong>
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: '#f59e0b' }}>
              <strong>{synthesis.active_contradictions.length}</strong> Contradictions
            </span>
            <span>•</span>
            <span style={{ color: '#ec4899' }}>
              <strong>{synthesis.open_gaps.length}</strong> Open Gaps
            </span>
            <span>•</span>
            <span style={{ color: '#10b981' }}>
              <strong>{synthesis.completed_studies_count}</strong> Completed Studies
            </span>
          </div>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <nav
        style={{
          display: 'flex',
          backgroundColor: '#0b1120',
          borderBottom: '1px solid #1e293b',
          padding: '0 20px',
          gap: 4,
          flexShrink: 0,
        }}
      >
        <button
          className={`tab-btn ${activeTab === 'synthesis' ? 'active' : ''}`}
          onClick={() => setActiveTab('synthesis')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: activeTab === 'synthesis' ? 600 : 400,
            color: activeTab === 'synthesis' ? '#38bdf8' : '#94a3b8',
            borderBottom: activeTab === 'synthesis' ? '2px solid #38bdf8' : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
          }}
        >
          <GitMerge size={15} />
          <span>Evidence Synthesis</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'contradictions' ? 'active' : ''}`}
          onClick={() => setActiveTab('contradictions')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: activeTab === 'contradictions' ? 600 : 400,
            color: activeTab === 'contradictions' ? '#f59e0b' : '#94a3b8',
            borderBottom: activeTab === 'contradictions' ? '2px solid #f59e0b' : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
          }}
        >
          <ShieldAlert size={15} />
          <span>Contradictions ({synthesis?.active_contradictions.length || 0})</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'gaps' ? 'active' : ''}`}
          onClick={() => setActiveTab('gaps')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: activeTab === 'gaps' ? 600 : 400,
            color: activeTab === 'gaps' ? '#ec4899' : '#94a3b8',
            borderBottom: activeTab === 'gaps' ? '2px solid #ec4899' : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
          }}
        >
          <HelpCircle size={15} />
          <span>Evidence Gaps ({synthesis?.open_gaps.length || 0})</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'agenda' ? 'active' : ''}`}
          onClick={() => setActiveTab('agenda')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: activeTab === 'agenda' ? 600 : 400,
            color: activeTab === 'agenda' ? '#818cf8' : '#94a3b8',
            borderBottom: activeTab === 'agenda' ? '2px solid #818cf8' : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
          }}
        >
          <ListOrdered size={15} />
          <span>Prioritized Agenda</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'dependencies' ? 'active' : ''}`}
          onClick={() => setActiveTab('dependencies')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: activeTab === 'dependencies' ? 600 : 400,
            color: activeTab === 'dependencies' ? '#34d399' : '#94a3b8',
            borderBottom: activeTab === 'dependencies' ? '2px solid #34d399' : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
          }}
        >
          <Workflow size={15} />
          <span>Dependencies (DAG)</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'campaigns' ? 'active' : ''}`}
          onClick={() => setActiveTab('campaigns')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: activeTab === 'campaigns' ? 600 : 400,
            color: activeTab === 'campaigns' ? '#a855f7' : '#94a3b8',
            borderBottom: activeTab === 'campaigns' ? '2px solid #a855f7' : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
          }}
        >
          <PlayCircle size={15} />
          <span>Campaign Execution</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: activeTab === 'reports' ? 600 : 400,
            color: activeTab === 'reports' ? '#38bdf8' : '#94a3b8',
            borderBottom: activeTab === 'reports' ? '2px solid #38bdf8' : '2px solid transparent',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
          }}
        >
          <FileDown size={15} />
          <span>Reports & Exports</span>
        </button>
      </nav>

      {/* Main Tab Content */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 20,
          backgroundColor: '#0f172a',
        }}
      >
        {/* TAB 1: EVIDENCE SYNTHESIS */}
        {activeTab === 'synthesis' && synthesis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Scientific Warning on Shared Evidence */}
            <div
              style={{
                padding: 16,
                backgroundColor: '#1e1b4b',
                border: '1px solid #4338ca',
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#c7d2fe' }}>
                <ShieldAlert size={18} color="#818cf8" />
                <strong style={{ fontSize: 14 }}>
                  Cross-Hypothesis Evidence Provenance Policy
                </strong>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#e0e7ff', lineHeight: 1.5 }}>
                When multiple hypotheses cite the exact same execution artifact, pipeline run, or
                literature DOI, they do <strong>NOT</strong> constitute independent biological
                replications. The Evidence Relationship Index below segregates shared vs independent
                sources to eliminate false confirmation inflation.
              </p>
            </div>

            {/* Shared vs Independent Evidence Sources */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Shared Sources Card */}
              <div
                style={{
                  backgroundColor: '#1e293b',
                  borderRadius: 8,
                  padding: 16,
                  border: '1px solid #334155',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#f59e0b' }}>
                    Shared Evidence Sources ({synthesis.shared_evidence_sources.length})
                  </h3>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    Multi-Hypothesis Provenance
                  </span>
                </div>

                {synthesis.shared_evidence_sources.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic' }}>
                    No shared evidence sources detected across hypotheses.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {synthesis.shared_evidence_sources.map((src, idx) => (
                      <div
                        key={idx}
                        style={{
                          backgroundColor: '#0f172a',
                          border: '1px solid #475569',
                          borderRadius: 6,
                          padding: 10,
                          fontSize: 12,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontFamily: 'monospace', color: '#f8fafc', fontWeight: 600 }}>
                            {src.source_identifier}
                          </span>
                          <span
                            style={{
                              backgroundColor: '#451a03',
                              color: '#fbbf24',
                              padding: '1px 6px',
                              borderRadius: 4,
                              fontSize: 11,
                            }}
                          >
                            Citations: {src.citation_count}
                          </span>
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>
                          Cited by hypotheses: {src.citing_hypothesis_ids.join(', ')}
                        </div>
                        <div
                          style={{
                            color: '#f59e0b',
                            fontSize: 11,
                            backgroundColor: '#291807',
                            padding: '4px 6px',
                            borderRadius: 4,
                          }}
                        >
                          ⚠️ {src.scientific_warning}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Independent Sources Card */}
              <div
                style={{
                  backgroundColor: '#1e293b',
                  borderRadius: 8,
                  padding: 16,
                  border: '1px solid #334155',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#10b981' }}>
                    Independent Evidence Sources ({synthesis.independent_evidence_sources.length})
                  </h3>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>Single Citation Provenance</span>
                </div>

                {synthesis.independent_evidence_sources.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic' }}>
                    No unique independent sources found.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {synthesis.independent_evidence_sources.map((src, idx) => (
                      <div
                        key={idx}
                        style={{
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: 6,
                          padding: 10,
                          fontSize: 12,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontFamily: 'monospace', color: '#f8fafc', fontWeight: 600 }}>
                            {src.source_identifier}
                          </span>
                          <span
                            style={{
                              backgroundColor: '#064e3b',
                              color: '#34d399',
                              padding: '1px 6px',
                              borderRadius: 4,
                              fontSize: 11,
                            }}
                          >
                            Unique
                          </span>
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: 11 }}>
                          Hypothesis: {src.citing_hypothesis_ids[0]}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Overlapping Concepts & Structural Entities */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Biological Concepts Overlap */}
              <div
                style={{
                  backgroundColor: '#1e293b',
                  borderRadius: 8,
                  padding: 16,
                  border: '1px solid #334155',
                }}
              >
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px 0', color: '#38bdf8' }}>
                  Concept Overlap ({synthesis.shared_concepts.length} shared / {synthesis.distinct_concepts.length} distinct)
                </h3>
                {synthesis.shared_concepts.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic' }}>
                    No biological concepts shared between hypotheses.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {synthesis.shared_concepts.map((c) => (
                      <div
                        key={c.concept_id}
                        style={{
                          backgroundColor: '#0f172a',
                          padding: 10,
                          borderRadius: 6,
                          fontSize: 12,
                          border: '1px solid #334155',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <strong style={{ color: '#38bdf8' }}>{c.name}</strong>
                          <span style={{ color: '#94a3b8', fontSize: 11 }}>
                            ID: {c.concept_id} ({c.citation_count} citing hyps)
                          </span>
                        </div>
                        <p style={{ margin: 0, color: '#94a3b8', fontSize: 11 }}>{c.caveat}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Candidate Neurons & Directed Edges */}
              <div
                style={{
                  backgroundColor: '#1e293b',
                  borderRadius: 8,
                  padding: 16,
                  border: '1px solid #334155',
                }}
              >
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px 0', color: '#a78bfa' }}>
                  Structural Overlap (Neurons & Directed Edges)
                </h3>
                <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <span style={{ color: '#94a3b8' }}>Shared Candidate Neurons: </span>
                    <strong style={{ color: '#f8fafc' }}>
                      {synthesis.shared_candidate_neuron_ids.length > 0
                        ? synthesis.shared_candidate_neuron_ids.join(', ')
                        : 'None'}
                    </strong>
                  </div>

                  <div>
                    <span style={{ color: '#94a3b8' }}>Shared Directed Synaptic Edges: </span>
                    {synthesis.shared_directed_edges.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        {synthesis.shared_directed_edges.map(([u, v], i) => (
                          <span
                            key={i}
                            style={{
                              backgroundColor: '#0f172a',
                              border: '1px solid #6366f1',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontFamily: 'monospace',
                              color: '#a5b4fc',
                            }}
                          >
                            {u} → {v}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <strong style={{ color: '#f8fafc' }}> None</strong>
                    )}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      padding: 8,
                      backgroundColor: '#0b1120',
                      borderRadius: 6,
                      fontSize: 11,
                      color: '#94a3b8',
                      border: '1px solid #1e293b',
                    }}
                  >
                    ℹ️ <em>In Janelia MaleCNS v1.0, synaptic connections are strictly directed.</em> Connection
                    [u, v] does not imply [v, u].
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CONTRADICTIONS REVIEW QUEUE */}
        {activeTab === 'contradictions' && synthesis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px 0', color: '#f59e0b' }}>
                  Contradiction & Inconsistency Review Queue
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
                  Deterministic discrepancy detection identifies conflicting findings and configuration
                  mismatches across hypotheses.
                </p>
              </div>
            </div>

            {synthesis.active_contradictions.length === 0 ? (
              <div
                style={{
                  backgroundColor: '#1e293b',
                  borderRadius: 8,
                  padding: 32,
                  textAlign: 'center',
                  color: '#94a3b8',
                }}
              >
                <CheckCircle2 size={36} color="#10b981" style={{ margin: '0 auto 12px auto' }} />
                <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', margin: '0 0 6px 0' }}>
                  No Active Contradictions Detected
                </h3>
                <p style={{ fontSize: 13, margin: 0 }}>
                  All hypotheses in this project have mutually consistent statuses and configurations.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {synthesis.active_contradictions.map((c) => (
                  <div
                    key={c.contradiction_id}
                    style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #475569',
                      borderRadius: 8,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            textTransform: 'uppercase',
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 4,
                            backgroundColor: '#78350f',
                            color: '#fde68a',
                          }}
                        >
                          {c.category.replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>Rule: {c.detection_rule}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 4,
                            backgroundColor: '#0f172a',
                            color: '#38bdf8',
                            border: '1px solid #334155',
                          }}
                        >
                          Status: {c.review_status}
                        </span>
                        <button
                          onClick={() => {
                            setReviewContradiction(c);
                            setReviewStatus(
                              c.review_status === 'open' ? 'confirmed_inconsistency' : c.review_status
                            );
                            setReviewRationale(c.resolution_rationale || '');
                          }}
                          style={{
                            padding: '4px 10px',
                            backgroundColor: '#0284c7',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Review & Classify
                        </button>
                      </div>
                    </div>

                    <p style={{ margin: 0, fontSize: 13, color: '#f8fafc', lineHeight: 1.4 }}>
                      {c.description}
                    </p>

                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      Involved Hypotheses:{' '}
                      <strong style={{ color: '#38bdf8' }}>
                        {c.affected_hypothesis_ids.join(' vs ')}
                      </strong>
                    </div>

                    {c.resolution_rationale && (
                      <div
                        style={{
                          backgroundColor: '#0f172a',
                          padding: 8,
                          borderRadius: 4,
                          fontSize: 12,
                          color: '#cbd5e1',
                          border: '1px solid #334155',
                        }}
                      >
                        <strong>Review Rationale:</strong> {c.resolution_rationale}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: EVIDENCE GAPS */}
        {activeTab === 'gaps' && synthesis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px 0', color: '#ec4899' }}>
                  Evidence Gap Inventory & Actionability Assessment
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
                  Identifies 8 categories of empirical gaps across hypotheses, missing follow-up
                  studies, and robustness unverified claims.
                </p>
              </div>
            </div>

            {synthesis.open_gaps.length === 0 ? (
              <div
                style={{
                  backgroundColor: '#1e293b',
                  borderRadius: 8,
                  padding: 32,
                  textAlign: 'center',
                  color: '#94a3b8',
                }}
              >
                <CheckCircle2 size={36} color="#10b981" style={{ margin: '0 auto 12px auto' }} />
                <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', margin: '0 0 6px 0' }}>
                  No Open Evidence Gaps
                </h3>
                <p style={{ fontSize: 13, margin: 0 }}>
                  All hypotheses have verified evidence, completed follow-up studies, and robustness validations.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {synthesis.open_gaps.map((gap) => (
                  <div
                    key={gap.gap_id}
                    style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #475569',
                      borderRadius: 8,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 4,
                            backgroundColor: gap.is_actionable ? '#831843' : '#1e293b',
                            color: gap.is_actionable ? '#fbcfe8' : '#cbd5e1',
                          }}
                        >
                          {gap.is_actionable ? 'Actionable' : 'Informational'}
                        </span>
                        <span style={{ fontSize: 12, color: '#f472b6', fontWeight: 600 }}>
                          {gap.category.replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>
                          Status: <strong>{gap.status}</strong>
                        </span>
                      </div>

                      <button
                        onClick={() => {
                          setSelectedGap(gap);
                          setGapStatus(gap.status);
                          setGapNotes(gap.resolution_notes || '');
                        }}
                        style={{
                          padding: '4px 10px',
                          backgroundColor: '#be185d',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Update Gap
                      </button>
                    </div>

                    <p style={{ margin: 0, fontSize: 13, color: '#f8fafc', lineHeight: 1.4 }}>
                      {gap.description}
                    </p>

                    <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', gap: 16 }}>
                      <span>
                        Affected Hypotheses:{' '}
                        <strong style={{ color: '#38bdf8' }}>{gap.affected_hypothesis_ids.join(', ')}</strong>
                      </span>
                    </div>

                    {gap.suggested_action_description && (
                      <div
                        style={{
                          backgroundColor: '#0f172a',
                          padding: 8,
                          borderRadius: 4,
                          fontSize: 12,
                          color: '#e2e8f0',
                          border: '1px solid #334155',
                        }}
                      >
                        <strong style={{ color: '#f472b6' }}>Suggested Action:</strong>{' '}
                        {gap.suggested_action_description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: PRIORITIZED RESEARCH AGENDA */}
        {activeTab === 'agenda' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Weight Configuration Controls */}
            <div
              style={{
                backgroundColor: '#1e293b',
                borderRadius: 8,
                padding: 16,
                border: '1px solid #334155',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sliders size={16} color="#818cf8" />
                  <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#f1f5f9' }}>
                    Transparent Priority Scoring Parameters (S = Σ wᵢ · Fᵢ)
                  </h3>
                </div>
                <button
                  onClick={handleRecalculateAgenda}
                  disabled={actionLoading}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#6366f1',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Recalculate Agenda
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: 16,
                  fontSize: 12,
                  marginTop: 6,
                }}
              >
                <div>
                  <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>
                    Gap Importance (w_gap): {weightGap.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={weightGap}
                    onChange={(e) => setWeightGap(parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>
                    Hyp Coverage (w_hyp): {weightHyp.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={weightHyp}
                    onChange={(e) => setWeightHyp(parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>
                    Uncertainty Red. (w_unc): {weightUnc.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={weightUnc}
                    onChange={(e) => setWeightUnc(parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>
                    Feasibility (w_feas): {weightFeas.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={weightFeas}
                    onChange={(e) => setWeightFeas(parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>
                    Cost Penalty (w_cost): {weightCost.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={weightCost}
                    onChange={(e) => setWeightCost(parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
            </div>

            {/* Ranked Action List */}
            {agenda && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#818cf8' }}>
                    Ranked Research Action Recommendations ({agenda.total_actions} actions, {agenda.ready_actions} ready)
                  </h3>
                </div>

                {agenda.recommended_actions.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic' }}>
                    No planned actions found for prioritization. Create follow-up studies in the Hypothesis Workbench.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {agenda.recommended_actions.map((act, index) => (
                      <div
                        key={act.action_id}
                        style={{
                          backgroundColor: '#1e293b',
                          border: act.is_ready ? '1px solid #4338ca' : '1px solid #475569',
                          borderRadius: 8,
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 28,
                                height: 28,
                                borderRadius: '50%',
                                backgroundColor: '#312e81',
                                color: '#c7d2fe',
                                fontWeight: 700,
                                fontSize: 13,
                              }}
                            >
                              #{index + 1}
                            </span>
                            <div>
                              <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#f1f5f9' }}>
                                {act.title}
                              </h4>
                              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                Target Hypotheses: {act.target_hypothesis_ids?.join(', ') || 'N/A'} | Tool: {act.target_tool}
                              </span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: 4,
                                backgroundColor: act.is_ready ? '#064e3b' : '#451a03',
                                color: act.is_ready ? '#34d399' : '#fbbf24',
                              }}
                            >
                              {act.is_ready ? '✓ Ready' : '⏳ Blocked'}
                            </span>
                            <span
                              style={{
                                fontSize: 15,
                                fontWeight: 700,
                                color: '#818cf8',
                                fontFamily: 'monospace',
                              }}
                            >
                              Score: {act.priority_score.toFixed(3)}
                            </span>
                          </div>
                        </div>

                        <p style={{ margin: 0, fontSize: 12, color: '#cbd5e1' }}>{act.description}</p>

                        {/* Breakdown Factors Pill Strip */}
                        {act.priority_breakdown && (
                          <div
                            style={{
                              display: 'flex',
                              gap: 12,
                              fontSize: 11,
                              backgroundColor: '#0f172a',
                              padding: '6px 12px',
                              borderRadius: 6,
                            }}
                          >
                            <span style={{ color: '#94a3b8' }}>
                              F_gap:{' '}
                              <strong style={{ color: '#f472b6' }}>
                                {act.priority_breakdown.gap_importance?.toFixed(2) || '0.00'}
                              </strong>
                            </span>
                            <span style={{ color: '#94a3b8' }}>
                              F_hyp:{' '}
                              <strong style={{ color: '#38bdf8' }}>
                                {act.priority_breakdown.hypothesis_coverage?.toFixed(2) || '0.00'}
                              </strong>
                            </span>
                            <span style={{ color: '#94a3b8' }}>
                              F_unc:{' '}
                              <strong style={{ color: '#a78bfa' }}>
                                {act.priority_breakdown.uncertainty_reduction?.toFixed(2) || '0.00'}
                              </strong>
                            </span>
                            <span style={{ color: '#94a3b8' }}>
                              F_feas:{' '}
                              <strong style={{ color: '#34d399' }}>
                                {act.priority_breakdown.feasibility?.toFixed(2) || '0.00'}
                              </strong>
                            </span>
                            <span style={{ color: '#94a3b8' }}>
                              F_cost:{' '}
                              <strong style={{ color: '#fbbf24' }}>
                                {act.priority_breakdown.cost_penalty?.toFixed(2) || '0.00'}
                              </strong>
                            </span>
                          </div>
                        )}

                        {!act.is_ready && act.blocking_reasons && act.blocking_reasons.length > 0 && (
                          <div style={{ fontSize: 11, color: '#f59e0b' }}>
                            Blocking Prerequisite: {act.blocking_reasons.join('; ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: STUDY DEPENDENCY DAG */}
        {activeTab === 'dependencies' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Create Dependency Form */}
            <div
              style={{
                backgroundColor: '#1e293b',
                borderRadius: 8,
                padding: 16,
                border: '1px solid #334155',
              }}
            >
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px 0', color: '#34d399' }}>
                Add Prerequisite Dependency (With Cycle Prevention)
              </h3>
              <form
                onSubmit={handleAddDependency}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 2fr 2fr 1fr',
                  gap: 12,
                  alignItems: 'flex-end',
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                    Target Study ID (Dependent):
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. study-01"
                    value={depStudyId}
                    onChange={(e) => setDepStudyId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 6,
                      backgroundColor: '#0f172a',
                      color: '#f8fafc',
                      border: '1px solid #334155',
                      fontSize: 12,
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                    Prerequisite Study ID:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. study-02"
                    value={depPrereqId}
                    onChange={(e) => setDepPrereqId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 6,
                      backgroundColor: '#0f172a',
                      color: '#f8fafc',
                      border: '1px solid #334155',
                      fontSize: 12,
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                    Dependency Type:
                  </label>
                  <select
                    value={depType}
                    onChange={(e) => setDepType(e.target.value as StudyDependencyType)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 6,
                      backgroundColor: '#0f172a',
                      color: '#f8fafc',
                      border: '1px solid #334155',
                      fontSize: 12,
                    }}
                  >
                    <option value="required_prerequisite">required_prerequisite</option>
                    <option value="optional_reference">optional_reference</option>
                    <option value="comparison_dependency">comparison_dependency</option>
                    <option value="evidence_dependency">evidence_dependency</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={actionLoading || !depStudyId.trim() || !depPrereqId.trim()}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Link DAG
                </button>
              </form>
            </div>

            {/* Registered Dependencies Table */}
            <div
              style={{
                backgroundColor: '#1e293b',
                borderRadius: 8,
                padding: 16,
                border: '1px solid #334155',
              }}
            >
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px 0', color: '#f1f5f9' }}>
                Active Dependency Relationships ({dependencies.length})
              </h3>

              {dependencies.length === 0 ? (
                <p style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic' }}>
                  No prerequisite dependencies registered. All follow-up studies are unconstrained.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dependencies.map((dep) => (
                    <div
                      key={dep.dependency_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        backgroundColor: '#0f172a',
                        borderRadius: 6,
                        border: '1px solid #334155',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontFamily: 'monospace', color: '#38bdf8', fontWeight: 600 }}>
                          {dep.study_id}
                        </span>
                        <span style={{ color: '#94a3b8' }}>depends on</span>
                        <span style={{ fontFamily: 'monospace', color: '#34d399', fontWeight: 600 }}>
                          {dep.prerequisite_study_id}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            backgroundColor: '#1e293b',
                            color: '#e2e8f0',
                            padding: '2px 6px',
                            borderRadius: 4,
                          }}
                        >
                          {dep.dependency_type}
                        </span>
                      </div>

                      <button
                        onClick={() => handleDeleteDependency(dep.dependency_id)}
                        disabled={actionLoading}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#f87171',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 12,
                        }}
                      >
                        <Trash2 size={13} />
                        <span>Remove</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 6: MULTI-STUDY CAMPAIGN EXECUTION */}
        {activeTab === 'campaigns' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div
              style={{
                backgroundColor: '#1e293b',
                borderRadius: 8,
                padding: 16,
                border: '1px solid #334155',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#a855f7' }}>
                Controlled Multi-Study Campaign Planner
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
                Select candidate studies for coordinated batch execution. Campaigns compute a
                topological order, respect prerequisite dependencies, and execute with strict failure
                isolation.
              </p>

              {/* Study Selection Checkboxes */}
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 12, color: '#f1f5f9', fontWeight: 600 }}>
                  Available Candidate Studies ({allCandidateStudies.length}):
                </span>

                {allCandidateStudies.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', marginTop: 4 }}>
                    No follow-up studies found in project hypotheses or agenda recommendations.
                  </p>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 8,
                      marginTop: 8,
                    }}
                  >
                    {allCandidateStudies.map((st) => (
                      <label
                        key={st.study_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          backgroundColor: '#0f172a',
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: '1px solid #334155',
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedStudyIds.includes(st.study_id)}
                          onChange={() => handleToggleStudySelection(st.study_id)}
                        />
                        <div>
                          <strong style={{ color: '#f8fafc' }}>{st.title}</strong>
                          <span style={{ display: 'block', color: '#94a3b8', fontSize: 11 }}>
                            ID: {st.study_id} ({st.hypothesis_id})
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Campaign Actions */}
              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <button
                  onClick={handlePreviewCampaign}
                  disabled={actionLoading || selectedStudyIds.length === 0}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#7c3aed',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: actionLoading || selectedStudyIds.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Dry-Run Preview
                </button>
              </div>
            </div>

            {/* Campaign Preview Output */}
            {campaignPreview && (
              <div
                style={{
                  backgroundColor: '#1e293b',
                  borderRadius: 8,
                  padding: 16,
                  border: '1px solid #6d28d9',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#c084fc' }}>
                    Campaign Dry-Run Execution Plan
                  </h4>
                  <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                    <span style={{ backgroundColor: '#064e3b', color: '#34d399', padding: '2px 8px', borderRadius: 4 }}>
                      Ready: {campaignPreview.ready_studies}
                    </span>
                    <span style={{ backgroundColor: '#451a03', color: '#fbbf24', padding: '2px 8px', borderRadius: 4 }}>
                      Blocked: {campaignPreview.blocked_studies}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                  Estimated Scenarios: <strong>{campaignPreview.estimated_scenarios}</strong>
                </div>

                {/* Ordered Studies */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {campaignPreview.ordered_studies.map((st, i) => (
                    <div
                      key={st.study_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        backgroundColor: '#0f172a',
                        borderRadius: 6,
                        border: '1px solid #334155',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#c084fc', fontWeight: 700 }}>#{i + 1}</span>
                        <span style={{ color: '#f8fafc', fontWeight: 600 }}>{st.title}</span>
                        <span style={{ color: '#94a3b8', fontSize: 11 }}>({st.study_id})</span>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          padding: '1px 6px',
                          borderRadius: 4,
                          backgroundColor: st.is_ready ? '#064e3b' : '#451a03',
                          color: st.is_ready ? '#34d399' : '#fbbf24',
                        }}
                      >
                        {st.is_ready ? 'Ready to run' : 'Blocked by prerequisite'}
                      </span>
                    </div>
                  ))}
                </div>

                {campaignPreview.warnings && campaignPreview.warnings.length > 0 && (
                  <div style={{ backgroundColor: '#291807', padding: 8, borderRadius: 6, fontSize: 11, color: '#fbbf24' }}>
                    {campaignPreview.warnings.join('; ')}
                  </div>
                )}

                {/* Execution Confirmation Box */}
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    backgroundColor: '#0b1120',
                    borderRadius: 6,
                    border: '1px solid #334155',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={confirmExecute}
                      onChange={(e) => setConfirmExecute(e.target.checked)}
                    />
                    <span style={{ color: '#f8fafc' }}>
                      I confirm and authorize the execution of this multi-study campaign.
                    </span>
                  </label>

                  <button
                    onClick={handleExecuteCampaign}
                    disabled={!confirmExecute || actionLoading || !campaignPreview.can_execute}
                    style={{
                      alignSelf: 'flex-start',
                      padding: '8px 16px',
                      backgroundColor: confirmExecute && campaignPreview.can_execute ? '#9333ea' : '#475569',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: confirmExecute && campaignPreview.can_execute ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Launch Campaign
                  </button>
                </div>
              </div>
            )}

            {/* Campaign Execution Results */}
            {campaign && (
              <div
                style={{
                  backgroundColor: '#1e293b',
                  borderRadius: 8,
                  padding: 16,
                  border: '1px solid #34d399',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#34d399' }}>
                    Campaign Execution Results: {campaign.campaign_id}
                  </h4>
                  <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                    <span style={{ backgroundColor: '#064e3b', color: '#34d399', padding: '2px 8px', borderRadius: 4 }}>
                      Completed: {campaign.completed_count}
                    </span>
                    <span style={{ backgroundColor: '#7f1d1d', color: '#fca5a5', padding: '2px 8px', borderRadius: 4 }}>
                      Failed: {campaign.failed_count}
                    </span>
                    <span style={{ backgroundColor: '#1e293b', color: '#cbd5e1', padding: '2px 8px', borderRadius: 4 }}>
                      Skipped: {campaign.skipped_count}
                    </span>
                  </div>
                </div>

                <p style={{ margin: 0, fontSize: 12, color: '#e2e8f0' }}>{campaign.summary}</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {campaign.study_results.map((r) => (
                    <div
                      key={r.study_id}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#0f172a',
                        borderRadius: 6,
                        border: '1px solid #334155',
                        fontSize: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong style={{ color: '#f8fafc' }}>Study: {r.study_id}</strong>
                        <span
                          style={{
                            fontSize: 11,
                            padding: '1px 6px',
                            borderRadius: 4,
                            backgroundColor:
                              r.status === 'completed'
                                ? '#064e3b'
                                : r.status === 'failed'
                                ? '#7f1d1d'
                                : '#1e293b',
                            color:
                              r.status === 'completed'
                                ? '#34d399'
                                : r.status === 'failed'
                                ? '#fca5a5'
                                : '#cbd5e1',
                          }}
                        >
                          {r.status} {r.verdict ? `(${r.verdict})` : ''}
                        </span>
                      </div>
                      {r.evaluation_summary && (
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{r.evaluation_summary}</span>
                      )}
                      {r.error_message && (
                        <span style={{ fontSize: 11, color: '#f87171' }}>Error: {r.error_message}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 7: REPORTS & EXPORTS */}
        {activeTab === 'reports' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div
              style={{
                backgroundColor: '#1e293b',
                borderRadius: 8,
                padding: 16,
                border: '1px solid #334155',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#38bdf8' }}>
                Reproducible Project Synthesis Reports & Exports
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
                Generate project-level research reports, gap inventories, and evidence synthesis summaries
                in structured Markdown and CSV tabular formats.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
                <button
                  onClick={handleOpenMarkdownReport}
                  disabled={actionLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  <FileDown size={14} />
                  <span>View Markdown Synthesis Report</span>
                </button>

                <button
                  onClick={() => handleDownloadCsv('gaps')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    backgroundColor: '#1e293b',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  <span>Export Gaps (CSV)</span>
                </button>

                <button
                  onClick={() => handleDownloadCsv('contradictions')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    backgroundColor: '#1e293b',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  <span>Export Contradictions (CSV)</span>
                </button>

                <button
                  onClick={() => handleDownloadCsv('agenda')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    backgroundColor: '#1e293b',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  <span>Export Agenda (CSV)</span>
                </button>

                <button
                  onClick={() => handleDownloadCsv('campaigns')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    backgroundColor: '#1e293b',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  <span>Export Campaigns (CSV)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Contradiction Review Modal */}
      {reviewContradiction && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              padding: 24,
              borderRadius: 8,
              border: '1px solid #475569',
              width: 500,
              maxWidth: '90vw',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
              Review Contradiction Record
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1' }}>
              {reviewContradiction.description}
            </p>

            <form onSubmit={handleReviewContradiction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                  Classification / Status:
                </label>
                <select
                  value={reviewStatus}
                  onChange={(e) => setReviewStatus(e.target.value as ContradictionReviewStatus)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: '#0f172a',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                >
                  <option value="confirmed_inconsistency">confirmed_inconsistency</option>
                  <option value="explained_by_configuration">explained_by_configuration</option>
                  <option value="explained_by_scope">explained_by_scope</option>
                  <option value="insufficient_information">insufficient_information</option>
                  <option value="not_a_contradiction">not_a_contradiction</option>
                  <option value="resolved">resolved</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                  Resolution Rationale / Explanation:
                </label>
                <textarea
                  rows={3}
                  value={reviewRationale}
                  onChange={(e) => setReviewRationale(e.target.value)}
                  placeholder="Explain why this inconsistency is expected or how it was resolved..."
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: '#0f172a',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setReviewContradiction(null)}
                  style={{
                    padding: '6px 14px',
                    backgroundColor: '#334155',
                    color: '#cbd5e1',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{
                    padding: '6px 14px',
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Save Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Evidence Gap Update Modal */}
      {selectedGap && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              padding: 24,
              borderRadius: 8,
              border: '1px solid #475569',
              width: 500,
              maxWidth: '90vw',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
              Update Evidence Gap Status
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1' }}>
              {selectedGap.description}
            </p>

            <form onSubmit={handleUpdateGap} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                  Gap Status:
                </label>
                <select
                  value={gapStatus}
                  onChange={(e) => setGapStatus(e.target.value as GapStatus)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: '#0f172a',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                >
                  <option value="open">open</option>
                  <option value="in_progress">in_progress</option>
                  <option value="resolved">resolved</option>
                  <option value="not_actionable">not_actionable</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                  Resolution Notes:
                </label>
                <textarea
                  rows={3}
                  value={gapNotes}
                  onChange={(e) => setGapNotes(e.target.value)}
                  placeholder="Record investigation findings or justification..."
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: '#0f172a',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setSelectedGap(null)}
                  style={{
                    padding: '6px 14px',
                    backgroundColor: '#334155',
                    color: '#cbd5e1',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{
                    padding: '6px 14px',
                    backgroundColor: '#be185d',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Update Gap
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Project Modal */}
      {showNewProjectModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              padding: 24,
              borderRadius: 8,
              border: '1px solid #475569',
              width: 500,
              maxWidth: '90vw',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
              Create New Research Project
            </h3>

            <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                  Project Title:
                </label>
                <input
                  type="text"
                  required
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  placeholder="e.g. Visual P9 Feedback Modulation"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: '#0f172a',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                  Scientific Objective:
                </label>
                <textarea
                  rows={2}
                  value={newProjectObjective}
                  onChange={(e) => setNewProjectObjective(e.target.value)}
                  placeholder="Primary scientific question or circuit investigation goal..."
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: '#0f172a',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                  Description:
                </label>
                <textarea
                  rows={2}
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder="Detailed notes or scope..."
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: '#0f172a',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowNewProjectModal(false)}
                  style={{
                    padding: '6px 14px',
                    backgroundColor: '#334155',
                    color: '#cbd5e1',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{
                    padding: '6px 14px',
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Markdown Report Modal */}
      {showReportModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              padding: 24,
              borderRadius: 8,
              border: '1px solid #475569',
              width: 750,
              maxWidth: '92vw',
              height: '80vh',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
                Project Synthesis Markdown Report
              </h3>
              <button
                onClick={() => setShowReportModal(false)}
                style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 16 }}
              >
                ✕
              </button>
            </div>

            <textarea
              readOnly
              value={reportMarkdown}
              style={{
                flex: 1,
                padding: 12,
                backgroundColor: '#0f172a',
                color: '#e2e8f0',
                border: '1px solid #334155',
                borderRadius: 6,
                fontFamily: 'monospace',
                fontSize: 12,
                resize: 'none',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(reportMarkdown);
                  setNotice('Report copied to clipboard.');
                }}
                style={{
                  padding: '6px 14px',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Copy to Clipboard
              </button>
              <button
                onClick={() => setShowReportModal(false)}
                style={{
                  padding: '6px 14px',
                  backgroundColor: '#334155',
                  color: '#cbd5e1',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
