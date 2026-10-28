/**
 * BrainDebugger — Evidence-Grounded Hypothesis Workbench (V11)
 *
 * Primary interactive workspace for:
 * 1. Formulating cautious, testable computational connectomic hypotheses.
 * 2. Surfacing automated suggestions from actual discovery & robustness sweeps.
 * 3. Maintaining a bidirectional evidence ledger (supporting vs contradicting).
 * 4. Tracking confounding methodological biases and alternative explanations.
 * 5. Planning and running follow-up computational studies with criteria evaluation.
 * 6. Managing hypothesis lifecycle transitions with audit logs.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  Lightbulb,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  FileText,
  Trash2,
  ChevronRight,
  RefreshCw,
  Search,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  Clock,
  Sparkles,
} from 'lucide-react';
import { api } from '../api';
import { notebookStorage } from '../services/notebookStorage';
import {
  HypothesisRecord,
  HypothesisSuggestion,
  HypothesisCategory,
  HypothesisStatus,
  FollowupStudy,
  StudyEvaluationResult,
  ResearchProject,
} from '../types';
import { EvidenceRelationshipMap } from './EvidenceRelationshipMap';

interface Props {
  initialExecutionId?: string | null;
  initialRobustnessId?: string | null;
  onNavigateToNeuron?: (bodyId: number) => void;
  onNavigateToPathway?: (sourceId: number, targetId: number) => void;
  onNavigateToDiscovery?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  structural_connectivity: 'Structural Connectivity',
  candidate_stability: 'Candidate Stability',
  parameter_sensitivity: 'Parameter Sensitivity',
  comparative_circuit: 'Comparative Circuit',
  evidence_coverage: 'Evidence Coverage',
  pathway_structure: 'Pathway Structure',
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  draft: { bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-700' },
  ready_for_testing: { bg: 'bg-blue-950', text: 'text-blue-300', border: 'border-blue-700' },
  under_investigation: { bg: 'bg-purple-950', text: 'text-purple-300', border: 'border-purple-700' },
  supported_by_computational_evidence: { bg: 'bg-emerald-950', text: 'text-emerald-300', border: 'border-emerald-600' },
  contradicted_by_computational_evidence: { bg: 'bg-rose-950', text: 'text-rose-300', border: 'border-rose-600' },
  inconclusive: { bg: 'bg-amber-950', text: 'text-amber-300', border: 'border-amber-600' },
  archived: { bg: 'bg-slate-900', text: 'text-slate-500', border: 'border-slate-800' },
};

export const HypothesisWorkbench: React.FC<Props> = ({
  initialExecutionId,
  initialRobustnessId,
  onNavigateToNeuron,
  onNavigateToPathway,
  onNavigateToDiscovery,
}) => {
  const [hypotheses, setHypotheses] = useState<HypothesisRecord[]>([]);
  const [selectedHypothesis, setSelectedHypothesis] = useState<HypothesisRecord | null>(null);
  const [suggestions, setSuggestions] = useState<HypothesisSuggestion[]>([]);
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [activeTab, setActiveTab] = useState<'evidence' | 'alternatives' | 'studies' | 'map' | 'limitations'>('evidence');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals & Forms
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddEvidenceModal, setShowAddEvidenceModal] = useState(false);
  const [showAddAlternativeModal, setShowAddAlternativeModal] = useState(false);
  const [showPlanStudyModal, setShowPlanStudyModal] = useState(false);
  const [executingStudyId, setExecutingStudyId] = useState<string | null>(null);
  const [lastStudyResult, setLastStudyResult] = useState<StudyEvaluationResult | null>(null);

  // New Hypothesis Form state
  const [newTitle, setNewTitle] = useState('');
  const [newStatement, setNewStatement] = useState('');
  const [newCategory, setNewCategory] = useState<HypothesisCategory>('structural_connectivity');
  const [newRationale, setNewRationale] = useState('');
  const [newTargetNeurons, setNewTargetNeurons] = useState('');

  // New Evidence Form state
  const [newEvRole, setNewEvRole] = useState<'supporting' | 'contradicting' | 'contextual'>('supporting');
  const [newEvType, setNewEvType] = useState('candidate_stability');
  const [newEvSummary, setNewEvSummary] = useState('');
  const [newEvMetric, setNewEvMetric] = useState('');
  const [newEvValue, setNewEvValue] = useState('');
  const [newEvCaveat, setNewEvCaveat] = useState('');

  // New Alternative Form state
  const [newAltTitle, setNewAltTitle] = useState('');
  const [newAltDescription, setNewAltDescription] = useState('');
  const [newAltBias, setNewAltBias] = useState('threshold_artifact');

  // New Study Form state
  const [newStudyTitle, setNewStudyTitle] = useState('');
  const [newStudyType, setNewStudyType] = useState('pathway_search');
  const [newStudyObjective, setNewStudyObjective] = useState('');
  const [newStudyNull, setNewStudyNull] = useState('');
  const [newStudyMetric, setNewStudyMetric] = useState('path_count');
  const [newStudyOp, setNewStudyOp] = useState('>=');
  const [newStudyVal, setNewStudyVal] = useState('1');

  // Load hypotheses and suggestions
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch hypotheses from backend
      const list = await api.listHypotheses();
      setHypotheses(list);
      if (list.length > 0 && !selectedHypothesis) {
        setSelectedHypothesis(list[0]);
      } else if (selectedHypothesis) {
        const updated = list.find((h) => h.hypothesis_id === selectedHypothesis.hypothesis_id);
        if (updated) setSelectedHypothesis(updated);
      }

      // Sync to local storage
      list.forEach((h) => notebookStorage.saveHypothesis(h));

      // 2. Fetch projects
      const projs = await api.listResearchProjects();
      setProjects(projs);

      // 3. Fetch suggestions from context
      const sugs = await api.suggestHypotheses({
        execution_id: initialExecutionId,
        robustness_id: initialRobustnessId,
      });
      setSuggestions(sugs);
    } catch (err: any) {
      console.warn('Backend load failed, loading from local storage', err);
      const localHyp = await notebookStorage.getHypotheses();
      setHypotheses(localHyp);
      if (localHyp.length > 0 && !selectedHypothesis) setSelectedHypothesis(localHyp[0]);
      setError('Operating in offline/local-cache mode.');
    } finally {
      setLoading(false);
    }
  }, [initialExecutionId, initialRobustnessId, selectedHypothesis]);

  useEffect(() => {
    loadData();
  }, []);

  // Handle Suggestion Acceptance
  const handleApplySuggestion = (sug: HypothesisSuggestion) => {
    setNewTitle(sug.title);
    setNewStatement(sug.statement);
    setNewCategory(sug.category as any);
    setNewRationale(sug.rationale);
    setNewTargetNeurons(sug.target_neurons.join(', '));
    setShowCreateModal(true);
  };

  // Submit Create Hypothesis
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newStatement.trim()) return;

    const targetIds = newTargetNeurons
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));

    try {
      const created = await api.createHypothesis({
        title: newTitle.trim(),
        statement: newStatement.trim(),
        category: newCategory,
        rationale: newRationale.trim() || undefined,
        target_neurons: targetIds,
        linked_execution_ids: initialExecutionId ? [initialExecutionId] : [],
        linked_robustness_ids: initialRobustnessId ? [initialRobustnessId] : [],
      });

      await notebookStorage.saveHypothesis(created);
      setHypotheses((prev) => [created, ...prev]);
      setSelectedHypothesis(created);
      setShowCreateModal(false);

      // Reset form
      setNewTitle('');
      setNewStatement('');
      setNewRationale('');
      setNewTargetNeurons('');
    } catch (err: any) {
      alert(`Failed to create hypothesis: ${err.message}`);
    }
  };

  // Handle Status Transition
  const handleTransitionStatus = async (newStatus: string) => {
    if (!selectedHypothesis) return;
    const reason = prompt(`Enter rationale for transitioning status to ${newStatus}:`, 'Empirical evaluation completed.');
    if (!reason) return;

    try {
      const updated = await api.transitionHypothesisStatus(selectedHypothesis.hypothesis_id, {
        new_status: newStatus,
        reason: reason.trim(),
      });
      await notebookStorage.saveHypothesis(updated);
      setSelectedHypothesis(updated);
      setHypotheses((prev) => prev.map((h) => (h.hypothesis_id === updated.hypothesis_id ? updated : h)));
    } catch (err: any) {
      alert(`Status transition failed: ${err.message}`);
    }
  };

  // Submit Evidence
  const handleAddEvidenceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHypothesis || !newEvSummary.trim()) return;

    try {
      const created = await api.attachEvidence(selectedHypothesis.hypothesis_id, {
        role: newEvRole,
        evidence_type: newEvType,
        summary: newEvSummary.trim(),
        metric_name: newEvMetric.trim() || undefined,
        metric_value: newEvValue ? parseFloat(newEvValue) : undefined,
        scientific_caveat: newEvCaveat.trim() || undefined,
      });

      const updated = {
        ...selectedHypothesis,
        evidence_records: [...selectedHypothesis.evidence_records, created],
      };
      setSelectedHypothesis(updated);
      setHypotheses((prev) => prev.map((h) => (h.hypothesis_id === updated.hypothesis_id ? updated : h)));
      await notebookStorage.saveHypothesis(updated);

      setShowAddEvidenceModal(false);
      setNewEvSummary('');
      setNewEvMetric('');
      setNewEvValue('');
      setNewEvCaveat('');
    } catch (err: any) {
      alert(`Failed to attach evidence: ${err.message}`);
    }
  };

  // Submit Alternative Explanation
  const handleAddAlternativeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHypothesis || !newAltTitle.trim()) return;

    try {
      const created = await api.addAlternative(selectedHypothesis.hypothesis_id, {
        title: newAltTitle.trim(),
        description: newAltDescription.trim(),
        bias_category: newAltBias,
      });

      const updated = {
        ...selectedHypothesis,
        alternative_explanations: [...selectedHypothesis.alternative_explanations, created],
      };
      setSelectedHypothesis(updated);
      setHypotheses((prev) => prev.map((h) => (h.hypothesis_id === updated.hypothesis_id ? updated : h)));
      await notebookStorage.saveHypothesis(updated);

      setShowAddAlternativeModal(false);
      setNewAltTitle('');
      setNewAltDescription('');
    } catch (err: any) {
      alert(`Failed to add alternative: ${err.message}`);
    }
  };

  // Submit Follow-Up Study
  const handlePlanStudySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHypothesis || !newStudyTitle.trim()) return;

    try {
      const created = await api.createFollowupStudy(selectedHypothesis.hypothesis_id, {
        title: newStudyTitle.trim(),
        analysis_type: newStudyType,
        objective: newStudyObjective.trim(),
        expected_null_outcome: newStudyNull.trim() || 'No significant structural effect observed.',
        testable_criteria: [
          {
            metric: newStudyMetric,
            operator: newStudyOp,
            value: parseFloat(newStudyVal) || 0,
          },
        ],
      });

      const updated = {
        ...selectedHypothesis,
        proposed_studies: [...selectedHypothesis.proposed_studies, created],
        status:
          selectedHypothesis.status === 'draft' ? 'ready_for_testing' : selectedHypothesis.status,
      };
      setSelectedHypothesis(updated);
      setHypotheses((prev) => prev.map((h) => (h.hypothesis_id === updated.hypothesis_id ? updated : h)));
      await notebookStorage.saveHypothesis(updated);

      setShowPlanStudyModal(false);
      setNewStudyTitle('');
      setNewStudyObjective('');
      setNewStudyNull('');
    } catch (err: any) {
      alert(`Failed to plan study: ${err.message}`);
    }
  };

  // Execute Follow-Up Study
  const handleExecuteStudy = async (study: FollowupStudy) => {
    if (!selectedHypothesis) return;
    setExecutingStudyId(study.study_id);
    setLastStudyResult(null);

    try {
      const result = await api.executeFollowupStudy(selectedHypothesis.hypothesis_id, study.study_id, {});
      setLastStudyResult(result);

      // Refresh full hypothesis
      const updated = await api.getHypothesis(selectedHypothesis.hypothesis_id);
      setSelectedHypothesis(updated);
      setHypotheses((prev) => prev.map((h) => (h.hypothesis_id === updated.hypothesis_id ? updated : h)));
      await notebookStorage.saveHypothesis(updated);
    } catch (err: any) {
      alert(`Study execution failed: ${err.message}`);
    } finally {
      setExecutingStudyId(null);
    }
  };

  // Export Markdown Report
  const handleExportMarkdown = async () => {
    if (!selectedHypothesis) return;
    try {
      const md = await api.getHypothesisMarkdownReport(selectedHypothesis.hypothesis_id);
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedHypothesis.hypothesis_id}-report.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Report download failed: ${err.message}`);
    }
  };

  // Filtered list
  const filteredHypotheses = hypotheses.filter((h) => {
    if (statusFilter !== 'all' && h.status !== statusFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        h.title.toLowerCase().includes(q) ||
        h.statement.toLowerCase().includes(q) ||
        h.hypothesis_id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-950 border border-indigo-700 rounded-lg text-indigo-400">
            <Lightbulb className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Evidence-Grounded Hypothesis Workbench
              <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-300 border border-indigo-700/60">
                V11
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Formulate, test, and preserve cautious computational connectome hypotheses with strict provenance.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded shadow"
          >
            <Plus className="w-4 h-4" />
            Formulate Hypothesis
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Hypothesis List & Suggestions */}
        <div className="w-96 border-r border-slate-800 flex flex-col bg-slate-900/40">
          {/* Search & Filter */}
          <div className="p-3 border-b border-slate-800 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search hypotheses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex items-center gap-1 overflow-x-auto text-[11px] pb-1">
              {['all', 'draft', 'ready_for_testing', 'supported_by_computational_evidence'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2 py-0.5 rounded whitespace-nowrap capitalize ${
                    statusFilter === st
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {st.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* List & Suggestions */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-2 space-y-2">
            {/* Suggestions Drawer Banner */}
            {suggestions.length > 0 && (
              <div className="p-2.5 bg-indigo-950/40 border border-indigo-800/60 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    Surfaced Data Suggestions ({suggestions.length})
                  </span>
                </div>
                <div className="space-y-1.5">
                  {suggestions.map((sug) => (
                    <div
                      key={sug.suggestion_id}
                      className="p-2 bg-slate-900/80 hover:bg-indigo-900/30 border border-slate-800 hover:border-indigo-700/60 rounded cursor-pointer transition text-left"
                      onClick={() => handleApplySuggestion(sug)}
                    >
                      <p className="text-xs font-medium text-slate-200">{sug.title}</p>
                      <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">{sug.statement}</p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                        <span className="capitalize text-indigo-400">{sug.source_type}</span>
                        <span className="text-emerald-400 font-semibold">
                          {(sug.confidence_score * 100).toFixed(0)}% confidence
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hypotheses List */}
            {filteredHypotheses.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No hypotheses found. Formulate a new one or accept a suggestion above.
              </div>
            ) : (
              filteredHypotheses.map((hyp) => {
                const isSelected = selectedHypothesis?.hypothesis_id === hyp.hypothesis_id;
                const statusStyle = STATUS_COLORS[hyp.status] || STATUS_COLORS.draft;
                return (
                  <div
                    key={hyp.hypothesis_id}
                    onClick={() => setSelectedHypothesis(hyp)}
                    className={`p-3 rounded-lg border transition cursor-pointer text-left ${
                      isSelected
                        ? 'bg-indigo-950/30 border-indigo-600/80'
                        : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-200 line-clamp-1">{hyp.title}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border uppercase font-medium whitespace-nowrap ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                      >
                        {hyp.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 italic">"{hyp.statement}"</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2">
                      <span>{CATEGORY_LABELS[hyp.category] || hyp.category}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400">
                          {hyp.evidence_records.filter((e) => e.role === 'supporting').length} sup.
                        </span>
                        <span className="text-rose-400">
                          {hyp.evidence_records.filter((e) => e.role === 'contradicting').length} con.
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Main Panel: Hypothesis Detail & Tools */}
        {selectedHypothesis ? (
          <div className="flex-1 flex flex-col overflow-y-auto bg-slate-950 p-6 space-y-6">
            {/* Hypothesis Header Card */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-indigo-400">{selectedHypothesis.hypothesis_id}</span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded border uppercase font-bold tracking-wider ${
                        STATUS_COLORS[selectedHypothesis.status]?.bg
                      } ${STATUS_COLORS[selectedHypothesis.status]?.text} ${
                        STATUS_COLORS[selectedHypothesis.status]?.border
                      }`}
                    >
                      {selectedHypothesis.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-100">{selectedHypothesis.title}</h2>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedHypothesis.status}
                    onChange={(e) => handleTransitionStatus(e.target.value)}
                    className="bg-slate-800 text-slate-200 border border-slate-700 rounded px-2.5 py-1 text-xs font-medium focus:outline-none focus:border-indigo-500"
                  >
                    <option value="draft">draft</option>
                    <option value="ready_for_testing">ready_for_testing</option>
                    <option value="under_investigation">under_investigation</option>
                    <option value="supported_by_computational_evidence">supported_by_computational_evidence</option>
                    <option value="contradicted_by_computational_evidence">contradicted_by_computational_evidence</option>
                    <option value="inconclusive">inconclusive</option>
                    <option value="archived">archived</option>
                  </select>
                  <button
                    onClick={handleExportMarkdown}
                    className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs text-slate-300"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Report
                  </button>
                </div>
              </div>

              {/* Statement Blockquote */}
              <blockquote className="p-3 bg-slate-950/80 border-l-4 border-indigo-500 text-slate-300 text-sm leading-relaxed rounded-r italic">
                "{selectedHypothesis.statement}"
              </blockquote>

              {/* Rationale & Target Entities */}
              <div className="grid grid-cols-2 gap-4 text-xs pt-1">
                <div>
                  <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Rationale</span>
                  <p className="text-slate-300 mt-0.5">{selectedHypothesis.rationale || 'Not specified.'}</p>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Target Entities</span>
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {selectedHypothesis.target_neurons.map((bId) => (
                      <button
                        key={bId}
                        onClick={() => onNavigateToNeuron && onNavigateToNeuron(bId)}
                        className="px-2 py-0.5 bg-amber-950/40 text-amber-300 border border-amber-800 rounded font-mono hover:bg-amber-900/60"
                      >
                        #{bId}
                      </button>
                    ))}
                    {selectedHypothesis.target_edges.map(([p, q], idx) => (
                      <button
                        key={idx}
                        onClick={() => onNavigateToPathway && onNavigateToPathway(p, q)}
                        className="px-2 py-0.5 bg-pink-950/40 text-pink-300 border border-pink-800 rounded font-mono hover:bg-pink-900/60"
                      >
                        #{p} → #{q}
                      </button>
                    ))}
                    {selectedHypothesis.target_neurons.length === 0 && selectedHypothesis.target_edges.length === 0 && (
                      <span className="text-slate-500">None specified</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-800 text-xs font-medium">
              {[
                { id: 'evidence', label: `Evidence Ledger (${selectedHypothesis.evidence_records.length})` },
                { id: 'alternatives', label: `Alternative Explanations (${selectedHypothesis.alternative_explanations.length})` },
                { id: 'studies', label: `Follow-Up Studies (${selectedHypothesis.proposed_studies.length})` },
                { id: 'map', label: 'Relationship Topology Map' },
                { id: 'limitations', label: 'Assumptions & Caveats' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`pb-2 px-3 border-b-2 transition ${
                    activeTab === tab.id
                      ? 'border-indigo-500 text-indigo-400 font-bold'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab 1: Evidence Ledger */}
            {activeTab === 'evidence' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-200">Empirical & Literature Evidence Ledger</h3>
                  <button
                    onClick={() => setShowAddEvidenceModal(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-400 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800 rounded"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Attach Evidence
                  </button>
                </div>

                {selectedHypothesis.evidence_records.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 bg-slate-900/40 border border-slate-800 rounded-lg">
                    No evidence records logged yet. Attach findings or execute follow-up studies.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedHypothesis.evidence_records.map((ev) => (
                      <div
                        key={ev.evidence_id}
                        className={`p-3 rounded-lg border flex items-start justify-between gap-3 ${
                          ev.role === 'supporting'
                            ? 'bg-emerald-950/20 border-emerald-800/40'
                            : ev.role === 'contradicting'
                            ? 'bg-rose-950/20 border-rose-800/40'
                            : 'bg-slate-900 border-slate-800'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                                ev.role === 'supporting'
                                  ? 'bg-emerald-900 text-emerald-300'
                                  : ev.role === 'contradicting'
                                  ? 'bg-rose-900 text-rose-300'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {ev.role}
                            </span>
                            <span className="text-xs font-semibold text-slate-300 capitalize">
                              {ev.evidence_type.replace(/_/g, ' ')}
                            </span>
                            {ev.metric_name && (
                              <span className="text-xs text-indigo-400 font-mono">
                                {ev.metric_name}: {ev.metric_value}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-200">{ev.summary}</p>
                          {ev.scientific_caveat && (
                            <p className="text-[11px] text-amber-400/90 italic flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                              Caveat: {ev.scientific_caveat}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Alternative Explanations */}
            {activeTab === 'alternatives' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-200">Alternative Explanations & Confounding Biases</h3>
                  <button
                    onClick={() => setShowAddAlternativeModal(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-400 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800 rounded"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Alternative
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {selectedHypothesis.alternative_explanations.map((alt) => (
                    <div
                      key={alt.explanation_id}
                      className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200">{alt.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-400 border border-amber-700/50 uppercase">
                          {alt.bias_category.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{alt.description}</p>
                      <div className="pt-1 text-[11px] text-slate-500 flex items-center justify-between">
                        <span>Status: <strong className="text-slate-300 uppercase">{alt.status}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 3: Follow-Up Studies */}
            {activeTab === 'studies' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-200">Follow-Up Computational Investigations</h3>
                  <button
                    onClick={() => setShowPlanStudyModal(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-purple-400 bg-purple-950/40 hover:bg-purple-900/50 border border-purple-800 rounded"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Plan Follow-Up Study
                  </button>
                </div>

                {/* Last Study Evaluation Notice */}
                {lastStudyResult && (
                  <div className={`p-4 rounded-lg border ${
                    lastStudyResult.verdict === 'criteria_met'
                      ? 'bg-emerald-950/30 border-emerald-700 text-emerald-200'
                      : lastStudyResult.verdict === 'criteria_failed'
                      ? 'bg-rose-950/30 border-rose-700 text-rose-200'
                      : 'bg-amber-950/30 border-amber-700 text-amber-200'
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-sm">
                      {lastStudyResult.verdict === 'criteria_met' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-rose-400" />
                      )}
                      Study Evaluation: {lastStudyResult.verdict.toUpperCase()}
                    </div>
                    <p className="text-xs mt-1">{lastStudyResult.summary}</p>
                    <p className="text-[11px] mt-1 italic text-slate-400">{lastStudyResult.scientific_caveat}</p>
                  </div>
                )}

                {selectedHypothesis.proposed_studies.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 bg-slate-900/40 border border-slate-800 rounded-lg">
                    No computational studies planned. Design a study to test this hypothesis.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedHypothesis.proposed_studies.map((st) => (
                      <div
                        key={st.study_id}
                        className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-100">{st.title}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-mono">
                                {st.analysis_type}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                                {st.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 mt-1">{st.objective}</p>
                          </div>

                          <button
                            onClick={() => handleExecuteStudy(st)}
                            disabled={executingStudyId === st.study_id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 rounded disabled:opacity-50"
                          >
                            <Play className={`w-3.5 h-3.5 ${executingStudyId === st.study_id ? 'animate-spin' : ''}`} />
                            {executingStudyId === st.study_id ? 'Executing...' : 'Run Experiment'}
                          </button>
                        </div>

                        <div className="p-2.5 bg-slate-950 rounded border border-slate-800/80 text-[11px] space-y-1">
                          <p className="text-slate-400">
                            <strong>Expected Null Outcome:</strong> {st.expected_null_outcome}
                          </p>
                          {st.testable_criteria && st.testable_criteria.length > 0 && (
                            <div className="flex items-center gap-2 text-indigo-300 font-mono">
                              <span>Quantitative Criteria:</span>
                              {st.testable_criteria.map((c, i) => (
                                <span key={i} className="px-1.5 py-0.5 bg-slate-900 rounded border border-slate-700">
                                  {c.metric} {c.operator} {c.value}
                                </span>
                              ))}
                            </div>
                          )}
                          {st.evaluation_summary && (
                            <p className="text-emerald-400 font-medium pt-1">
                              <strong>Outcome:</strong> {st.evaluation_summary}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Topology Map */}
            {activeTab === 'map' && (
              <div className="space-y-2">
                <EvidenceRelationshipMap hypothesis={selectedHypothesis} />
              </div>
            )}

            {/* Tab 5: Limitations & Assumptions */}
            {activeTab === 'limitations' && (
              <div className="space-y-4">
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    Boundary Conditions & Scientific Limitations
                  </h4>
                  <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                    {selectedHypothesis.limitations.map((lim, i) => (
                      <li key={i}>{lim}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Core Connectomic Assumptions
                  </h4>
                  <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                    {selectedHypothesis.assumptions.map((ass, i) => (
                      <li key={i}>{ass}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-slate-400" />
                    Status Transition History
                  </h4>
                  <div className="space-y-1.5 text-xs text-slate-400">
                    {selectedHypothesis.status_history.map((rec, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-500">
                          {new Date(rec.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="font-semibold text-slate-300 uppercase">
                          {rec.from_status} → {rec.to_status}
                        </span>
                        <span>({rec.reason})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            Select a hypothesis from the sidebar or formulate a new one.
          </div>
        )}
      </div>

      {/* Modal: Formulate New Hypothesis */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-indigo-400" />
              Formulate New Connectomic Hypothesis
            </h3>

            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DNp01 Acts as an Indispensable Escape Bottleneck"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Scientific Statement (Cautious, Testable)
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="State the formal computational claim explicitly distinguishing structural survival from physiological necessity..."
                  value={newStatement}
                  onChange={(e) => setNewStatement(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Target Body IDs (comma-separated)</label>
                  <input
                    type="text"
                    placeholder="e.g. 10001, 800146"
                    value={newTargetNeurons}
                    onChange={(e) => setNewTargetNeurons(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Scientific Rationale & Background</label>
                <input
                  type="text"
                  placeholder="Why is this hypothesis motivated by recent findings?"
                  value={newRationale}
                  onChange={(e) => setNewRationale(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold shadow"
                >
                  Save Hypothesis
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Attach Evidence */}
      {showAddEvidenceModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" />
              Attach Empirical Evidence Record
            </h3>

            <form onSubmit={handleAddEvidenceSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Evidence Role</label>
                  <select
                    value={newEvRole}
                    onChange={(e) => setNewEvRole(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200"
                  >
                    <option value="supporting">Supporting</option>
                    <option value="contradicting">Contradicting</option>
                    <option value="contextual">Contextual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Evidence Type</label>
                  <select
                    value={newEvType}
                    onChange={(e) => setNewEvType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200"
                  >
                    <option value="candidate_stability">Candidate Stability</option>
                    <option value="edge_survival">Edge Survival</option>
                    <option value="pathway_continuity">Pathway Continuity</option>
                    <option value="perturbation_resilience">Perturbation Resilience</option>
                    <option value="metric_sensitivity">Metric Sensitivity</option>
                    <option value="literature_curation">Literature Curation</option>
                    <option value="manual_observation">Manual Observation</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Evidence Summary</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Describe empirical finding..."
                  value={newEvSummary}
                  onChange={(e) => setNewEvSummary(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Metric Name (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. inclusion_fraction"
                    value={newEvMetric}
                    onChange={(e) => setNewEvMetric(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Metric Value</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 1.0"
                    value={newEvValue}
                    onChange={(e) => setNewEvValue(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Scientific Caveat / Limitation</label>
                <input
                  type="text"
                  placeholder="e.g. High stability does not guarantee electrophysiological firing..."
                  value={newEvCaveat}
                  onChange={(e) => setNewEvCaveat(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddEvidenceModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold"
                >
                  Attach Evidence
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Alternative Explanation */}
      {showAddAlternativeModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Add Alternative Explanation or Confounding Factor
            </h3>

            <form onSubmit={handleAddAlternativeSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. High-Degree Centrality Bias"
                  value={newAltTitle}
                  onChange={(e) => setNewAltTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Bias Category</label>
                <select
                  value={newAltBias}
                  onChange={(e) => setNewAltBias(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200"
                >
                  <option value="em_reconstruction_bias">EM Reconstruction / Truncation Bias</option>
                  <option value="threshold_artifact">Synaptic Weight Threshold Artifact</option>
                  <option value="hub_degree_bias">Hub Degree Centrality Bias</option>
                  <option value="recurrent_feedback_omission">Recurrent Feedback Omission</option>
                  <option value="classification_uncertainty">Classification Uncertainty</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Description</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Explain why this methodological or biological factor could account for the observation..."
                  value={newAltDescription}
                  onChange={(e) => setNewAltDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddAlternativeModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded font-bold"
                >
                  Save Alternative
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Plan Follow-Up Study */}
      {showPlanStudyModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Play className="w-5 h-5 text-purple-400" />
              Plan Follow-Up Computational Study
            </h3>

            <form onSubmit={handlePlanStudySubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Study Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Targeted Knockout of Bottleneck Neuron"
                  value={newStudyTitle}
                  onChange={(e) => setNewStudyTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Analysis Type</label>
                  <select
                    value={newStudyType}
                    onChange={(e) => setNewStudyType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200"
                  >
                    <option value="pathway_search">Structural Pathway Search</option>
                    <option value="perturbation">Targeted Lesion / Perturbation</option>
                    <option value="robustness_sweep">Parameterized Robustness Sweep</option>
                    <option value="circuit_discovery">Concept Circuit Discovery</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Expected Null Outcome</label>
                  <input
                    type="text"
                    placeholder="e.g. Reachability unaffected..."
                    value={newStudyNull}
                    onChange={(e) => setNewStudyNull(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Objective</label>
                <textarea
                  required
                  rows={2}
                  placeholder="State the explicit quantitative goal of the computational investigation..."
                  value={newStudyObjective}
                  onChange={(e) => setNewStudyObjective(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200"
                />
              </div>

              {/* Testable Criteria */}
              <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-2">
                <label className="block text-indigo-400 font-bold uppercase tracking-wider text-[10px]">
                  Quantitative Evaluation Criteria
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newStudyMetric}
                    onChange={(e) => setNewStudyMetric(e.target.value)}
                    placeholder="metric name"
                    className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200"
                  />
                  <select
                    value={newStudyOp}
                    onChange={(e) => setNewStudyOp(e.target.value)}
                    className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200"
                  >
                    <option value=">=">&gt;=</option>
                    <option value="<=">&lt;=</option>
                    <option value="==">==</option>
                    <option value="!=">!=</option>
                  </select>
                  <input
                    type="number"
                    step="any"
                    value={newStudyVal}
                    onChange={(e) => setNewStudyVal(e.target.value)}
                    placeholder="threshold"
                    className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPlanStudyModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold"
                >
                  Register Study
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

