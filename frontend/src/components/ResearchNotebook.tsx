/**
 * BrainDebugger — Reproducible Research Notebook Component (V11)
 *
 * Provides:
 * 1. Project Collections grouping hypotheses, executions, and notes.
 * 2. Hypothesis Board (Kanban / status-organized workflow cards).
 * 3. Chronological Research Timeline tracking all milestones and evaluations.
 * 4. Durable Versioned JSON Export & Import (Schema 1.0.0).
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  BookOpen,
  FolderPlus,
  Download,
  Upload,
  Calendar,
  Layers,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Filter,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { api } from '../api';
import { notebookStorage } from '../services/notebookStorage';
import {
  ResearchProject,
  HypothesisRecord,
  ResearchTimelineEvent,
  ResearchNotebookExport,
} from '../types';

interface Props {
  onOpenHypothesis: (hypothesisId: string) => void;
  onNavigateToWorkbench: () => void;
}

const BOARD_COLUMNS = [
  { id: 'draft', label: 'Draft', color: 'border-slate-700 bg-slate-900/40 text-slate-300' },
  { id: 'ready_for_testing', label: 'Ready For Testing', color: 'border-blue-700 bg-blue-950/20 text-blue-300' },
  { id: 'under_investigation', label: 'Under Investigation', color: 'border-purple-700 bg-purple-950/20 text-purple-300' },
  { id: 'supported_by_computational_evidence', label: 'Supported', color: 'border-emerald-700 bg-emerald-950/20 text-emerald-300' },
  { id: 'contradicted_by_computational_evidence', label: 'Contradicted', color: 'border-rose-700 bg-rose-950/20 text-rose-300' },
  { id: 'inconclusive', label: 'Inconclusive', color: 'border-amber-700 bg-amber-950/20 text-amber-300' },
];

export const ResearchNotebook: React.FC<Props> = ({ onOpenHypothesis, onNavigateToWorkbench }) => {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('proj-default');
  const [hypotheses, setHypotheses] = useState<HypothesisRecord[]>([]);
  const [timeline, setTimeline] = useState<ResearchTimelineEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'board' | 'timeline' | 'notes'>('board');
  const [loading, setLoading] = useState(false);

  // Modals
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectObjective, setNewProjectObjective] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');

  // Import file ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadNotebook = useCallback(async () => {
    setLoading(true);
    try {
      const projs = await api.listResearchProjects();
      setProjects(projs);

      const hyps = await api.listHypotheses();
      setHypotheses(hyps);

      const curProj = projs.find((p) => p.project_id === selectedProjectId) || projs[0];
      if (curProj) {
        setSelectedProjectId(curProj.project_id);
        setTimeline(curProj.timeline || []);
      }
    } catch (e) {
      console.warn('Backend load failed, fetching from local storage', e);
      const localProjs = await notebookStorage.getProjects();
      setProjects(localProjs);
      const localHyps = await notebookStorage.getHypotheses();
      setHypotheses(localHyps);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    loadNotebook();
  }, []);

  const currentProject = projects.find((p) => p.project_id === selectedProjectId) || projects[0];

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectTitle.trim()) return;

    try {
      const created = await api.createResearchProject({
        title: newProjectTitle.trim(),
        objective: newProjectObjective.trim(),
        description: newProjectDescription.trim(),
      });
      await notebookStorage.saveProject(created);
      setProjects((prev) => [...prev, created]);
      setSelectedProjectId(created.project_id);
      setShowCreateProjectModal(false);
      setNewProjectTitle('');
      setNewProjectObjective('');
      setNewProjectDescription('');
    } catch (err: any) {
      alert(`Failed to create project: ${err.message}`);
    }
  };

  const handleExportJSON = async () => {
    try {
      const exportDoc = await api.exportResearchNotebook(selectedProjectId);
      const blob = new Blob([JSON.stringify(exportDoc, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `braindebugger-notebook-${selectedProjectId}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    }
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed: ResearchNotebookExport = JSON.parse(text);

      if (!parsed.schema_version || !parsed.projects) {
        throw new Error('Invalid notebook schema: missing schema_version or projects array.');
      }

      const res = await api.importResearchNotebook(parsed);
      alert(`Notebook imported successfully: ${res.imported_projects} project(s), ${res.imported_hypotheses} hypothesis(es).`);
      await loadNotebook();
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-950 border border-indigo-700 rounded-lg text-indigo-400">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Reproducible Research Notebook
              <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-300 border border-indigo-700/60">
                V11
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Project workspaces, Hypothesis Kanban board, and immutable chronological research timeline.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Project Selector */}
          <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded border border-slate-700">
            <span className="text-[11px] text-slate-400 font-medium">Project:</span>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-transparent text-xs text-slate-200 font-semibold focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.project_id} value={p.project_id} className="bg-slate-900 text-slate-200">
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowCreateProjectModal(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700"
            title="Create Project Workspace"
          >
            <FolderPlus className="w-3.5 h-3.5 text-indigo-400" />
            New Project
          </button>

          <button
            onClick={handleExportJSON}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700"
            title="Export Versioned JSON"
          >
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </button>

          <label className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            Import JSON
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportFileChange}
              accept=".json"
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Project Subheader & Navigation */}
      <div className="px-6 py-2 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-200">{currentProject?.title}</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400 italic">"{currentProject?.objective || 'No objective specified'}"</span>
        </div>

        <div className="flex items-center gap-2">
          {[
            { id: 'board', label: 'Hypothesis Board', icon: Layers },
            { id: 'timeline', label: 'Research Timeline', icon: Clock },
            { id: 'notes', label: 'Project Provenance', icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded transition ${
                  activeTab === tab.id
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-x-auto overflow-y-auto p-6 bg-slate-950">
        {/* View 1: Hypothesis Kanban Board */}
        {activeTab === 'board' && (
          <div className="flex gap-4 min-w-max h-full pb-4">
            {BOARD_COLUMNS.map((col) => {
              const colHypotheses = hypotheses.filter((h) => h.status === col.id);
              return (
                <div
                  key={col.id}
                  className={`w-72 flex flex-col rounded-xl border ${col.color} p-3 bg-slate-900/40`}
                >
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80">
                    <span className="font-bold text-xs uppercase tracking-wider">{col.label}</span>
                    <span className="text-xs px-1.5 py-0.2 bg-slate-800 rounded font-mono text-slate-300">
                      {colHypotheses.length}
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                    {colHypotheses.length === 0 ? (
                      <div className="p-4 text-center text-[11px] text-slate-600 italic">
                        No hypotheses in this state
                      </div>
                    ) : (
                      colHypotheses.map((hyp) => (
                        <div
                          key={hyp.hypothesis_id}
                          onClick={() => {
                            onOpenHypothesis(hyp.hypothesis_id);
                            onNavigateToWorkbench();
                          }}
                          className="p-3 bg-slate-900 hover:bg-indigo-950/40 border border-slate-800 hover:border-indigo-600 rounded-lg cursor-pointer transition shadow-sm space-y-1.5 text-left"
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-xs font-semibold text-slate-100 line-clamp-1">{hyp.title}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 line-clamp-2 italic">"{hyp.statement}"</p>
                          <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500">
                            <span className="text-indigo-400">{hyp.category.replace(/_/g, ' ')}</span>
                            <div className="flex items-center gap-1.5 font-mono">
                              <span className="text-emerald-400">
                                +{hyp.evidence_records.filter((e) => e.role === 'supporting').length}
                              </span>
                              <span className="text-rose-400">
                                -{hyp.evidence_records.filter((e) => e.role === 'contradicting').length}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* View 2: Research Timeline */}
        {activeTab === 'timeline' && (
          <div className="max-w-3xl mx-auto space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              Chronological Research Timeline
            </h3>

            {timeline.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 bg-slate-900 border border-slate-800 rounded-lg">
                No timeline events logged yet. Activities will automatically record milestones here.
              </div>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                {timeline.map((evt) => (
                  <div key={evt.event_id} className="relative group">
                    {/* Bullet */}
                    <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-slate-950" />
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200">{evt.title}</span>
                        <span className="font-mono text-[10px] text-slate-500">
                          {new Date(evt.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px]">{evt.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* View 3: Project Notes & Provenance */}
        {activeTab === 'notes' && (
          <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4 text-xs">
            <h3 className="text-base font-bold text-slate-100">Project Provenance & MaleCNS v1.0 Linkages</h3>
            <div className="space-y-2 text-slate-300">
              <p>
                <strong>Project ID:</strong> <span className="font-mono text-indigo-400">{currentProject?.project_id}</span>
              </p>
              <p>
                <strong>Dataset:</strong> <span className="font-mono text-slate-200">Janelia MaleCNS v1.0 (male-cns:v1.0)</span>
              </p>
              <p>
                <strong>Created:</strong> {currentProject?.created_at}
              </p>
              <p>
                <strong>Description:</strong> {currentProject?.description || 'None'}
              </p>
            </div>

            <div className="pt-4 border-t border-slate-800 space-y-2">
              <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                Strict Scientific Provenance Guarantee
              </h4>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                BrainDebugger Version 11 guarantees that all hypothesis statements, evidence ledger items, and
                investigation outcomes trace directly to local Janelia MaleCNS v1.0 Feather data or curated peer-reviewed
                neuroscience publications. No synthetic citations, synthetic neuron IDs, or fabricated biological claims
                are ever generated.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modal: New Project */}
      {showCreateProjectModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-indigo-400" />
              Create Research Project Workspace
            </h3>

            <form onSubmit={handleCreateProject} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Project Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Visual Motion Circuit Stability"
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Objective</label>
                <input
                  type="text"
                  placeholder="e.g. Characterize T4/T5 robustness under variable synaptic thresholds"
                  value={newProjectObjective}
                  onChange={(e) => setNewProjectObjective(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Project scope and scientific goals..."
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateProjectModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

