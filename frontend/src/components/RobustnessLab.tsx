/**
 * BrainDebugger — Circuit Robustness & Sensitivity Analysis Lab (V10)
 *
 * Systematic perturbation and sensitivity evaluation over the Janelia MaleCNS v1.0
 * connectome and NeuroQuery knowledge catalog.
 *
 * Core Features:
 * 1. Baseline Investigation overview (frozen plan, concepts, and dataset).
 * 2. Parameter Builder (One-Factor-at-a-Time and Bounded Multi-Parameter Grid).
 * 3. Scenario Preview & Budget Enforcement.
 * 4. Candidate-Ranking Stability Analysis (Inclusion fraction I(v), median rank, rank spread, top-k retention).
 * 5. Directed-Connection and Circuit Topology Stability (Strict u → v direction-sensitive semantics).
 * 6. Metric & Parameter Sensitivity (Scenario matrix, structural deltas, sensitivity plots).
 * 7. Reproducibility Manifest (schema 1.0.0, provenance, limits, source fingerprints).
 * 8. Multi-Format Exports (JSON, Candidates CSV, Edges CSV, Metrics CSV, Markdown Report).
 * 9. LocalStorage persistence for saving and restoring robustness runs.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sliders,
  Activity,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Download,
  FileText,
  RefreshCw,
  TrendingUp,
  Info,
  HelpCircle,
  Network,
  Award,
  Layers,
  ArrowRight,
  GitBranch,
  BarChart2,
  Bookmark,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import type {
  CircuitDiscoveryResult,
  RankingProfile,
  RobustnessAnalysisRequest,
  RobustnessAnalysisResponse,
  CandidateStabilityItem,
  EdgeStabilityItem,
  MetricSensitivityItem,
  RobustnessScenarioSummary,
  SavedRobustnessAnalysisRecord,
} from '../types';
import { api } from '../api';

const SAVED_ROBUSTNESS_KEY = 'braindebugger_saved_robustness_v10';

interface RobustnessLabProps {
  baselineResult: CircuitDiscoveryResult;
  onSelectNeuron?: (bodyId: number) => void;
  onReturnToExplorer?: () => void;
}

export function RobustnessLab({
  baselineResult,
  onSelectNeuron,
  onReturnToExplorer,
}: RobustnessLabProps) {
  // ── Mode & Parameter Configuration State ──────────────────────────────────
  const [mode, setMode] = useState<'one_factor_at_a_time' | 'grid'>('one_factor_at_a_time');
  const [selectedWeights, setSelectedWeights] = useState<number[]>([1, 2, 5, 10]);
  const [selectedNodeCaps, setSelectedNodeCaps] = useState<number[]>([20, 40, 60]);
  const [selectedCandidateCaps, setSelectedCandidateCaps] = useState<number[]>([10, 20]);
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>(['baseline_default', 'connectivity_heavy']);
  const [topKCutoff, setTopKCutoff] = useState<number>(5);

  // Available profiles from backend
  const [availableProfiles, setAvailableProfiles] = useState<RankingProfile[]>([
    {
      profile_name: 'baseline_default',
      tier_weight_mult: 1.0,
      synaptic_weight_mult: 0.5,
      degree_mult: 10.0,
      description: 'Authoritative V8/V9 default ranking (Tier + 0.5*Syn + 10*Deg)',
    },
    {
      profile_name: 'connectivity_heavy',
      tier_weight_mult: 0.5,
      synaptic_weight_mult: 1.5,
      degree_mult: 10.0,
      description: 'High emphasis on total synaptic weight (1.5x) with reduced tier influence (0.5x)',
    },
    {
      profile_name: 'hub_topology',
      tier_weight_mult: 0.5,
      synaptic_weight_mult: 0.5,
      degree_mult: 25.0,
      description: 'High emphasis on subgraph in/out degree (25x) identifying hub interneurons',
    },
    {
      profile_name: 'evidence_prioritized',
      tier_weight_mult: 2.0,
      synaptic_weight_mult: 0.2,
      degree_mult: 5.0,
      description: 'Strict biological tier prioritization (2.0x) with reduced structural weight',
    },
  ]);

  // ── Execution & Analysis Result State ─────────────────────────────────────
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisResponse, setAnalysisResponse] = useState<RobustnessAnalysisResponse | null>(null);

  // ── Sub-Tab Navigation ───────────────────────────────────────────────────
  const [labTab, setLabTab] = useState<'candidates' | 'connections' | 'sensitivity' | 'matrix' | 'manifest'>('candidates');

  // Search & Filter within results
  const [candidateSearchQuery, setCandidateSearchQuery] = useState<string>('');
  const [candidateTierFilter, setCandidateTierFilter] = useState<string>('all');
  const [selectedScenarioForDetail, setSelectedScenarioForDetail] = useState<string | null>(null);

  // Saved Robustness Runs
  const [savedRuns, setSavedRuns] = useState<SavedRobustnessAnalysisRecord[]>([]);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // Load available profiles from backend on mount
  useEffect(() => {
    let mounted = true;
    api.getRobustnessProfiles()
      .then((profs) => {
        if (mounted && profs && profs.length > 0) {
          setAvailableProfiles(profs);
        }
      })
      .catch(() => {
        // Fallback to default profiles if offline
      });

    // Load saved runs from local storage
    try {
      const stored = localStorage.getItem(SAVED_ROBUSTNESS_KEY);
      if (stored) {
        setSavedRuns(JSON.parse(stored));
      }
    } catch {
      // Ignore local storage parsing error
    }

    return () => {
      mounted = false;
    };
  }, []);

  // ── Scenario Count Preview Calculation ────────────────────────────────────
  const estimatedScenarioCount = useMemo(() => {
    if (mode === 'one_factor_at_a_time') {
      let count = 1; // baseline
      count += Math.max(0, selectedWeights.filter((w) => w !== 1).length);
      count += Math.max(0, selectedNodeCaps.filter((n) => n !== 40).length);
      count += Math.max(0, selectedCandidateCaps.filter((c) => c !== 20).length);
      count += Math.max(0, selectedProfiles.filter((p) => p !== 'baseline_default').length);
      return Math.min(count, 25);
    } else {
      const w = Math.max(1, selectedWeights.length);
      const n = Math.max(1, selectedNodeCaps.length);
      const c = Math.max(1, selectedCandidateCaps.length);
      const p = Math.max(1, selectedProfiles.length);
      return w * n * c * p;
    }
  }, [mode, selectedWeights, selectedNodeCaps, selectedCandidateCaps, selectedProfiles]);

  const exceedsBudget = estimatedScenarioCount > 25;

  // ── Trigger Analysis ──────────────────────────────────────────────────────
  const handleRunAnalysis = async () => {
    if (exceedsBudget) {
      setAnalysisError(`Requested parameter combinations (${estimatedScenarioCount}) exceed maximum analysis budget limit of 25.`);
      return;
    }

    setIsRunning(true);
    setAnalysisError(null);

    const profilesToInclude = availableProfiles.filter((p) => selectedProfiles.includes(p.profile_name));

    const req: RobustnessAnalysisRequest = {
      execution_id: baselineResult.execution_id,
      mode,
      min_edge_weights: selectedWeights,
      max_subgraph_nodes_list: selectedNodeCaps,
      max_candidates_list: selectedCandidateCaps,
      ranking_profiles: profilesToInclude,
      top_k_cutoff: topKCutoff,
    };

    try {
      const res = await api.analyzeCircuitRobustness(req);
      setAnalysisResponse(res);
      setSelectedScenarioForDetail(res.scenarios.length > 0 ? res.scenarios[0].scenario_id : null);
    } catch (err: any) {
      setAnalysisError(err?.message || 'Robustness analysis execution failed.');
    } finally {
      setIsRunning(false);
    }
  };

  // ── Save and Restore Runs ─────────────────────────────────────────────────
  const handleSaveAnalysis = useCallback(() => {
    if (!analysisResponse) return;
    const newRecord: SavedRobustnessAnalysisRecord = {
      id: analysisResponse.analysis_id,
      saved_at: new Date().toISOString(),
      schema_version: '1.0.0',
      name: `Robustness (${mode}) — ${new Date().toLocaleTimeString()}`,
      response: analysisResponse,
    };
    const updated = [newRecord, ...savedRuns.filter((r) => r.id !== newRecord.id)].slice(0, 10);
    setSavedRuns(updated);
    try {
      localStorage.setItem(SAVED_ROBUSTNESS_KEY, JSON.stringify(updated));
      setSaveSuccessNotice('Analysis record saved to local storage.');
      setTimeout(() => setSaveSuccessNotice(null), 3000);
    } catch {
      // Storage quota
    }
  }, [analysisResponse, mode, savedRuns]);

  const handleRestoreSavedRun = (rec: SavedRobustnessAnalysisRecord) => {
    setAnalysisResponse(rec.response);
    setSelectedScenarioForDetail(rec.response.scenarios.length > 0 ? rec.response.scenarios[0].scenario_id : null);
  };

  const handleDeleteSavedRun = (id: string) => {
    const updated = savedRuns.filter((r) => r.id !== id);
    setSavedRuns(updated);
    try {
      localStorage.setItem(SAVED_ROBUSTNESS_KEY, JSON.stringify(updated));
    } catch {
      // Storage quota
    }
  };

  // ── Export Generators ─────────────────────────────────────────────────────
  const handleExportJSON = useCallback(() => {
    if (!analysisResponse) return;
    const blob = new Blob([JSON.stringify(analysisResponse, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `braindebugger-robustness-${analysisResponse.analysis_id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [analysisResponse]);

  const handleExportCandidatesCSV = useCallback(() => {
    if (!analysisResponse) return;
    const headers = [
      'Body_ID',
      'Cell_Type',
      'Instance',
      'Evidence_Tier',
      'Baseline_Rank',
      'Median_Rank',
      'Min_Rank',
      'Max_Rank',
      'Rank_Spread',
      'Inclusion_Count',
      'Total_Scenarios',
      'Inclusion_Fraction',
      'In_Baseline',
      'Top_K_Retained',
    ];
    const rows = analysisResponse.candidate_stability.map((c) => [
      c.body_id,
      `"${c.cell_type || ''}"`,
      `"${c.instance || ''}"`,
      `"${c.evidence_tier}"`,
      c.baseline_rank ?? '',
      c.median_rank,
      c.min_rank,
      c.max_rank,
      c.rank_spread,
      c.inclusion_count,
      c.total_scenarios,
      c.inclusion_fraction,
      c.in_baseline ? 'true' : 'false',
      c.top_k_retained ? 'true' : 'false',
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `braindebugger-candidate-stability-${analysisResponse.analysis_id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [analysisResponse]);

  const handleExportEdgesCSV = useCallback(() => {
    if (!analysisResponse) return;
    const headers = [
      'Presynaptic_Source',
      'Postsynaptic_Target',
      'Synaptic_Weight',
      'Inclusion_Count',
      'Total_Scenarios',
      'Inclusion_Fraction',
      'In_Baseline',
      'Survives_Strict_Threshold',
    ];
    const rows = analysisResponse.edge_stability.map((e) => [
      e.source,
      e.target,
      e.weight,
      e.inclusion_count,
      e.total_scenarios,
      e.inclusion_fraction,
      e.in_baseline ? 'true' : 'false',
      e.survives_strict_threshold ? 'true' : 'false',
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `braindebugger-edge-stability-${analysisResponse.analysis_id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [analysisResponse]);

  const handleExportMetricsCSV = useCallback(() => {
    if (!analysisResponse) return;
    const headers = [
      'Scenario_ID',
      'Parameter_Label',
      'Min_Edge_Weight',
      'Max_Subgraph_Nodes',
      'Max_Candidates',
      'Ranking_Profile',
      'Node_Count',
      'Edge_Count',
      'Candidate_Count',
      'Density',
      'Average_Weight',
      'Delta_Nodes',
      'Delta_Edges',
      'Execution_Duration_MS',
    ];
    const rows = analysisResponse.metric_sensitivity.map((m) => [
      `"${m.scenario_id}"`,
      `"${m.parameter_label}"`,
      m.min_edge_weight,
      m.max_subgraph_nodes,
      m.max_candidates,
      `"${m.ranking_profile_name}"`,
      m.node_count,
      m.edge_count,
      m.candidate_count,
      m.density,
      m.average_weight,
      m.delta_nodes,
      m.delta_edges,
      m.execution_duration_ms,
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `braindebugger-metric-sensitivity-${analysisResponse.analysis_id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [analysisResponse]);

  const handleExportMarkdownReport = useCallback(() => {
    if (!analysisResponse) return;
    const m = analysisResponse.manifest;
    const s = analysisResponse.stability_summary;
    const md = [
      `# BrainDebugger V10 — Circuit Robustness & Sensitivity Report`,
      `**Analysis ID:** \`${analysisResponse.analysis_id}\`  `,
      `**Baseline Execution ID:** \`${analysisResponse.baseline_execution_id}\`  `,
      `**Research Question:** ${m.research_question}  `,
      `**Date:** ${m.created_at}  `,
      `**Dataset:** ${m.dataset_version} (${m.dataset_fingerprint || 'male-cns:v1.0'})  `,
      `**Catalog Version:** ${m.catalog_version}  `,
      `**Ranking Formula:** ${m.ranking_formula_version}  `,
      `**Strategy:** ${m.scenario_strategy}  `,
      ``,
      `---`,
      `## 1. Executive Stability Summary`,
      `- **Total Scenarios Evaluated:** ${s.completed_scenarios} of ${s.requested_scenarios} (${s.failed_scenarios} failed)`,
      `- **Evaluated Candidate Neurons:** ${s.evaluated_candidate_count}`,
      `- **Stable Candidates (≥ 80% scenarios):** ${s.stable_candidate_count}`,
      `- **Retained in Top-${s.top_k_cutoff}:** ${s.top_k_retained_count}`,
      `- **Evaluated Directed Synaptic Edges:** ${s.evaluated_edge_count}`,
      `- **Stable Directed Edges (≥ 80% scenarios):** ${s.stable_edge_count}`,
      ``,
      `---`,
      `## 2. Candidate-Ranking Stability Table`,
      `| Body ID | Cell Type | Evidence Tier | Base Rank | Median Rank | Spread | Inclusion (I(v)) | Top-${s.top_k_cutoff} Retained |`,
      `| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |`,
      ...analysisResponse.candidate_stability.map((c) =>
        `| #${c.body_id} | ${c.cell_type || 'Unknown'} | ${c.evidence_tier} | ${c.baseline_rank ?? '—'} | ${c.median_rank} | ${c.rank_spread} | ${(c.inclusion_fraction * 100).toFixed(1)}% (${c.inclusion_count}/${c.total_scenarios}) | ${c.top_k_retained ? '✓ YES' : 'NO'} |`
      ),
      ``,
      `---`,
      `## 3. Directed Edge Stability Table (Presynaptic → Postsynaptic)`,
      `| Presynaptic | Postsynaptic | Recorded Weight | Inclusion | Baseline | Survives Strict Threshold |`,
      `| :---: | :---: | :---: | :---: | :---: | :---: |`,
      ...analysisResponse.edge_stability.slice(0, 30).map((e) =>
        `| #${e.source} | #${e.target} | ${e.weight} syn | ${(e.inclusion_fraction * 100).toFixed(1)}% (${e.inclusion_count}/${e.total_scenarios}) | ${e.in_baseline ? 'Yes' : 'No'} | ${e.survives_strict_threshold ? 'Yes (wt≥10)' : 'No'} |`
      ),
      ``,
      `---`,
      `## 4. Scientific Limitations & Boundaries`,
      ...m.scientific_limitations.map((lim) => `- ${lim}`),
      ``,
      `*Report generated deterministically by BrainDebugger V10 Robustness Lab.*`,
    ].join('\n');

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `braindebugger-robustness-report-${analysisResponse.analysis_id}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [analysisResponse]);

  // Filtered candidate stability list
  const filteredCandidates = useMemo(() => {
    if (!analysisResponse) return [];
    return analysisResponse.candidate_stability.filter((c) => {
      const matchesQuery =
        !candidateSearchQuery ||
        String(c.body_id).includes(candidateSearchQuery.trim()) ||
        (c.cell_type && c.cell_type.toLowerCase().includes(candidateSearchQuery.toLowerCase()));
      const matchesTier = candidateTierFilter === 'all' || c.evidence_tier.toLowerCase().includes(candidateTierFilter.toLowerCase());
      return matchesQuery && matchesTier;
    });
  }, [analysisResponse, candidateSearchQuery, candidateTierFilter]);

  // Selected scenario details
  const activeScenarioDetail = useMemo(() => {
    if (!analysisResponse || !selectedScenarioForDetail) return null;
    return analysisResponse.scenarios.find((s) => s.scenario_id === selectedScenarioForDetail) || null;
  }, [analysisResponse, selectedScenarioForDetail]);

  return (
    <div
      className="robustness-lab-view"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        paddingBottom: 24,
      }}
    >
      {/* ── 1. Top Baseline Banner & Navigation Controls ─────────────────────── */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981',
            }}
          >
            <Sliders size={24} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Circuit Robustness & Sensitivity Analysis Lab</span>
              <span className="badge badge-sm badge-success" style={{ fontSize: 11 }}>V10 Engine</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
              <span>Baseline: <strong style={{ fontFamily: 'monospace' }}>{baselineResult.execution_id}</strong></span>
              <span>•</span>
              <span>Question: <em>"{baselineResult.question}"</em></span>
              <span>•</span>
              <span>Dataset: <strong>{baselineResult.dataset_version}</strong></span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onReturnToExplorer && (
            <button
              id="btn-return-explorer"
              className="btn btn-sm btn-ghost"
              onClick={onReturnToExplorer}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Network size={14} />
              <span>Back to Circuit</span>
            </button>
          )}

          {analysisResponse && (
            <button
              id="btn-save-robustness"
              className="btn btn-sm btn-outline"
              onClick={handleSaveAnalysis}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              title="Save current robustness analysis to browser storage"
            >
              <Bookmark size={14} />
              <span>Save Analysis</span>
            </button>
          )}
        </div>
      </div>

      {saveSuccessNotice && (
        <div
          style={{
            padding: '8px 14px',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 6,
            fontSize: 12,
            color: '#10b981',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <CheckCircle2 size={14} />
          <span>{saveSuccessNotice}</span>
        </div>
      )}

      {/* ── 2. Parameter Builder & Scenario Preview (Collapsible) ─────────────── */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>
              1. Parameter Configuration & Sensitivity Sweeps
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              Choose analysis strategy and specify discrete parameter values to evaluate result stability.
            </div>
          </div>

          {/* Strategy Mode Toggle */}
          <div style={{ display: 'flex', gap: 6, backgroundColor: 'var(--color-bg)', padding: 4, borderRadius: 6 }}>
            <button
              id="mode-one-factor"
              className={`btn btn-xs ${mode === 'one_factor_at_a_time' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMode('one_factor_at_a_time')}
            >
              One-Factor-at-a-Time (Recommended)
            </button>
            <button
              id="mode-grid"
              className={`btn btn-xs ${mode === 'grid' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMode('grid')}
            >
              Bounded Multi-Parameter Grid
            </button>
          </div>
        </div>

        {/* Parameter Selector Controls Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
            padding: 12,
            backgroundColor: 'var(--color-bg)',
            borderRadius: 6,
          }}
        >
          {/* Synaptic Weight Thresholds */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--color-text)' }}>
              Min Synaptic Weight Thresholds:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[1, 2, 5, 10, 15, 20].map((w) => {
                const active = selectedWeights.includes(w);
                return (
                  <button
                    key={w}
                    className={`btn btn-xs ${active ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => {
                      if (active && selectedWeights.length > 1) {
                        setSelectedWeights(selectedWeights.filter((x) => x !== w));
                      } else if (!active) {
                        setSelectedWeights([...selectedWeights, w].sort((a, b) => a - b));
                      }
                    }}
                  >
                    ≥ {w} syn
                  </button>
                );
              })}
            </div>
          </div>

          {/* Max Subgraph Nodes */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--color-text)' }}>
              Max Subgraph Nodes (Graph Scope):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[20, 30, 40, 50, 60].map((n) => {
                const active = selectedNodeCaps.includes(n);
                return (
                  <button
                    key={n}
                    className={`btn btn-xs ${active ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => {
                      if (active && selectedNodeCaps.length > 1) {
                        setSelectedNodeCaps(selectedNodeCaps.filter((x) => x !== n));
                      } else if (!active) {
                        setSelectedNodeCaps([...selectedNodeCaps, n].sort((a, b) => a - b));
                      }
                    }}
                  >
                    {n} nodes
                  </button>
                );
              })}
            </div>
          </div>

          {/* Max Candidates */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--color-text)' }}>
              Max Discovered Candidates:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[5, 10, 20, 30].map((c) => {
                const active = selectedCandidateCaps.includes(c);
                return (
                  <button
                    key={c}
                    className={`btn btn-xs ${active ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => {
                      if (active && selectedCandidateCaps.length > 1) {
                        setSelectedCandidateCaps(selectedCandidateCaps.filter((x) => x !== c));
                      } else if (!active) {
                        setSelectedCandidateCaps([...selectedCandidateCaps, c].sort((a, b) => a - b));
                      }
                    }}
                  >
                    {c} cands
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ranking Profiles */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--color-text)' }}>
              Candidate Ranking Profiles:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {availableProfiles.map((p) => {
                const active = selectedProfiles.includes(p.profile_name);
                return (
                  <label
                    key={p.profile_name}
                    style={{
                      fontSize: 11,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedProfiles([...selectedProfiles, p.profile_name]);
                        } else if (selectedProfiles.length > 1) {
                          setSelectedProfiles(selectedProfiles.filter((x) => x !== p.profile_name));
                        }
                      }}
                    />
                    <span><strong>{p.profile_name}</strong></span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Scenario Preview & Run Button */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            borderTop: '1px solid var(--color-border)',
            paddingTop: 12,
          }}
        >
          <div style={{ fontSize: 12, color: exceedsBudget ? '#ef4444' : 'var(--color-text-secondary)' }}>
            <span>Estimated scenarios: <strong>{estimatedScenarioCount}</strong> (Limit: max 25). </span>
            {exceedsBudget && <span><strong>Warning:</strong> Parameter space exceeds analysis budget. Please deselect some values.</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)' }}>
              <span>Top-k Retention Cutoff:</span>
              <input
                type="number"
                min="1"
                max="20"
                value={topKCutoff}
                onChange={(e) => setTopKCutoff(Math.max(1, parseInt(e.target.value) || 5))}
                style={{
                  width: 50,
                  padding: '2px 6px',
                  borderRadius: 4,
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-bg)',
                  fontSize: 12,
                  color: 'var(--color-text)',
                }}
              />
            </label>

            <button
              id="btn-run-robustness"
              className="btn btn-primary"
              onClick={handleRunAnalysis}
              disabled={isRunning || exceedsBudget}
              style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}
            >
              {isRunning ? (
                <>
                  <RefreshCw size={15} className="spin" />
                  <span>Evaluating Scenarios...</span>
                </>
              ) : (
                <>
                  <Activity size={15} />
                  <span>Run Robustness Analysis</span>
                </>
              )}
            </button>
          </div>
        </div>

        {analysisError && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 6,
              fontSize: 12,
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertTriangle size={16} />
            <span>{analysisError}</span>
          </div>
        )}
      </div>

      {/* ── 3. Saved Runs Drawer (if available) ─────────────────────────────── */}
      {savedRuns.length > 0 && !analysisResponse && (
        <div
          className="card"
          style={{
            padding: '14px 18px',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Bookmark size={14} color="#3b82f6" />
            <span>Saved Robustness Analysis Runs ({savedRuns.length})</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {savedRuns.map((rec) => (
              <div
                key={rec.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 12px',
                  backgroundColor: 'var(--color-bg)',
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                <div>
                  <strong>{rec.name}</strong> • <span style={{ fontFamily: 'monospace' }}>{rec.id}</span> •{' '}
                  <span style={{ color: 'var(--color-text-secondary)' }}>{rec.response.scenarios.length} scenarios evaluated</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-xs btn-outline"
                    onClick={() => handleRestoreSavedRun(rec)}
                  >
                    Restore
                  </button>
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => handleDeleteSavedRun(rec.id)}
                    title="Delete record"
                  >
                    <Trash2 size={12} color="#ef4444" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 4. Robustness Analysis Results Workspace ─────────────────────────── */}
      {analysisResponse && (
        <>
          {/* Summary KPI Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
            }}
          >
            <div
              className="card"
              style={{
                padding: '12px 16px',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Evaluated Scenarios
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)', marginTop: 4 }}>
                {analysisResponse.stability_summary.completed_scenarios}
                <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-text-secondary)', marginLeft: 6 }}>
                  / {analysisResponse.stability_summary.requested_scenarios}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#10b981', marginTop: 2 }}>
                100% completed successfully
              </div>
            </div>

            <div
              className="card"
              style={{
                padding: '12px 16px',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Stable Candidates (≥ 80%)
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981', marginTop: 4 }}>
                {analysisResponse.stability_summary.stable_candidate_count}
                <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-text-secondary)', marginLeft: 6 }}>
                  / {analysisResponse.stability_summary.evaluated_candidate_count}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                Retained across ≥ 80% configurations
              </div>
            </div>

            <div
              className="card"
              style={{
                padding: '12px 16px',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Top-{topKCutoff} Retention
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6', marginTop: 4 }}>
                {analysisResponse.stability_summary.top_k_retained_count}
                <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-text-secondary)', marginLeft: 6 }}>
                  candidates
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                Consistently in top {topKCutoff} rankings
              </div>
            </div>

            <div
              className="card"
              style={{
                padding: '12px 16px',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Stable Directed Connections
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#8b5cf6', marginTop: 4 }}>
                {analysisResponse.stability_summary.stable_edge_count}
                <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-text-secondary)', marginLeft: 6 }}>
                  / {analysisResponse.stability_summary.evaluated_edge_count}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                Directed edges surviving ≥ 80% scenarios
              </div>
            </div>
          </div>

          {/* Scientific Disclaimer Card */}
          <div
            style={{
              padding: '10px 16px',
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: 6,
              fontSize: 12,
              color: 'var(--color-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Info size={18} color="#3b82f6" style={{ flexShrink: 0 }} />
            <span>
              <strong>Scientific Boundaries:</strong> Computational robustness indicates how consistently candidate rankings and directed connections survive across alternative parameter thresholds. It does <em>not</em> calibrate biological certainty, physiological activity, or experimental verification.
            </span>
          </div>

          {/* Results Navigation Tabs & Export Toolbar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              borderBottom: '1px solid var(--color-border)',
              paddingBottom: 8,
            }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                id="tab-candidate-stability"
                className={`btn btn-sm ${labTab === 'candidates' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setLabTab('candidates')}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Award size={14} />
                <span>Candidate Stability ({analysisResponse.candidate_stability.length})</span>
              </button>
              <button
                id="tab-connection-stability"
                className={`btn btn-sm ${labTab === 'connections' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setLabTab('connections')}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <GitBranch size={14} />
                <span>Directed Edge Stability ({analysisResponse.edge_stability.length})</span>
              </button>
              <button
                id="tab-metric-sensitivity"
                className={`btn btn-sm ${labTab === 'sensitivity' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setLabTab('sensitivity')}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <BarChart2 size={14} />
                <span>Metric Sensitivity</span>
              </button>
              <button
                id="tab-scenario-matrix"
                className={`btn btn-sm ${labTab === 'matrix' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setLabTab('matrix')}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Layers size={14} />
                <span>Scenario Matrix ({analysisResponse.scenarios.length})</span>
              </button>
              <button
                id="tab-manifest-view"
                className={`btn btn-sm ${labTab === 'manifest' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setLabTab('manifest')}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <FileText size={14} />
                <span>Reproducibility Manifest</span>
              </button>
            </div>

            {/* Export Dropdown / Buttons */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                id="btn-export-manifest-json"
                className="btn btn-xs btn-outline"
                onClick={handleExportJSON}
                title="Export complete robustness results as JSON"
              >
                <Download size={12} /> JSON
              </button>
              <button
                id="btn-export-candidates-csv"
                className="btn btn-xs btn-outline"
                onClick={handleExportCandidatesCSV}
                title="Export candidate stability table as CSV"
              >
                <Download size={12} /> Candidates CSV
              </button>
              <button
                id="btn-export-edges-csv"
                className="btn btn-xs btn-outline"
                onClick={handleExportEdgesCSV}
                title="Export directed edge stability table as CSV"
              >
                <Download size={12} /> Edges CSV
              </button>
              <button
                id="btn-export-metrics-csv"
                className="btn btn-xs btn-outline"
                onClick={handleExportMetricsCSV}
                title="Export scenario metrics sensitivity table as CSV"
              >
                <Download size={12} /> Metrics CSV
              </button>
              <button
                id="btn-export-robustness-report"
                className="btn btn-xs btn-primary"
                onClick={handleExportMarkdownReport}
                title="Export reproducible Markdown robustness report"
              >
                <FileText size={12} /> Report (.md)
              </button>
            </div>
          </div>

          {/* ── Sub-Tab 1: Candidate Stability ──────────────────────────────── */}
          {labTab === 'candidates' && (
            <div
              className="card"
              style={{
                padding: '16px 20px',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
              }}
            >
              {/* Filter controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  Evaluating rank variability, inclusion frequency ($I(v)$), and top-{topKCutoff} retention across tested configurations.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Search candidate body ID or cell type..."
                    value={candidateSearchQuery}
                    onChange={(e) => setCandidateSearchQuery(e.target.value)}
                    style={{
                      padding: '4px 8px',
                      fontSize: 12,
                      borderRadius: 4,
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-bg)',
                      color: 'var(--color-text)',
                      width: 200,
                    }}
                  />
                  <select
                    value={candidateTierFilter}
                    onChange={(e) => setCandidateTierFilter(e.target.value)}
                    style={{
                      padding: '4px 8px',
                      fontSize: 12,
                      borderRadius: 4,
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-bg)',
                      color: 'var(--color-text)',
                    }}
                  >
                    <option value="all">All Tiers</option>
                    <option value="tier 1">Tier 1 (Verified)</option>
                    <option value="tier 2">Tier 2 (Supported)</option>
                    <option value="tier 3">Tier 3 (Review)</option>
                  </select>
                </div>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px' }}>Candidate Body ID</th>
                      <th style={{ padding: '8px 10px' }}>Cell Type</th>
                      <th style={{ padding: '8px 10px' }}>Evidence Tier</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Base Rank</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Median Rank</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Rank Spread</th>
                      <th style={{ padding: '8px 10px' }}>Inclusion Fraction $I(v)$</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Top-{topKCutoff} Retained</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCandidates.map((c) => {
                      const pct = Math.round(c.inclusion_fraction * 100);
                      const isHighStability = c.inclusion_fraction >= 0.8;
                      return (
                        <tr
                          key={c.body_id}
                          style={{
                            borderBottom: '1px solid var(--color-border)',
                            backgroundColor: c.in_baseline ? 'transparent' : 'rgba(59, 130, 246, 0.03)',
                          }}
                        >
                          <td style={{ padding: '8px 10px', fontWeight: 600, fontFamily: 'monospace' }}>
                            #{c.body_id}
                            {!c.in_baseline && (
                              <span className="badge badge-xs badge-info" style={{ marginLeft: 6, fontSize: 10 }}>
                                What-if Only
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px' }}>{c.cell_type || '—'}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: 11,
                                backgroundColor: c.evidence_tier.includes('Tier 1')
                                  ? 'rgba(16, 185, 129, 0.12)'
                                  : 'rgba(59, 130, 246, 0.12)',
                                color: c.evidence_tier.includes('Tier 1') ? '#10b981' : '#3b82f6',
                              }}
                            >
                              {c.evidence_tier}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            {c.baseline_rank ? `#${c.baseline_rank}` : '—'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>
                            #{c.median_rank}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <span style={{ color: c.rank_spread <= 2 ? '#10b981' : '#f59e0b' }}>
                              ±{c.rank_spread}
                            </span>
                            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                              ({c.min_rank}–{c.max_rank})
                            </div>
                          </td>
                          <td style={{ padding: '8px 10px', minWidth: 140 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div
                                style={{
                                  flex: 1,
                                  height: 6,
                                  backgroundColor: 'rgba(255,255,255,0.08)',
                                  borderRadius: 3,
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  style={{
                                    width: `${pct}%`,
                                    height: '100%',
                                    backgroundColor: isHighStability ? '#10b981' : '#f59e0b',
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 600 }}>
                                {pct}% ({c.inclusion_count}/{c.total_scenarios})
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            {c.top_k_retained ? (
                              <span className="badge badge-xs badge-success" style={{ fontSize: 10 }}>
                                ✓ Retained
                              </span>
                            ) : (
                              <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>
                                Variable
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                            {onSelectNeuron && (
                              <button
                                className="btn btn-xs btn-outline"
                                onClick={() => onSelectNeuron(c.body_id)}
                                title="Inspect neuron details in Neuron Inspector"
                              >
                                Inspect
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Sub-Tab 2: Directed Connection Stability ────────────────────── */}
          {labTab === 'connections' && (
            <div
              className="card"
              style={{
                padding: '16px 20px',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
                Evaluating directed synaptic connections ($u \to v$). Directionality is strictly preserved ($u \to v \neq v \to u$).
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px' }}>Presynaptic Source</th>
                      <th style={{ padding: '8px 10px' }}>Postsynaptic Target</th>
                      <th style={{ padding: '8px 10px' }}>Recorded Synaptic Weight</th>
                      <th style={{ padding: '8px 10px' }}>In Baseline Subgraph</th>
                      <th style={{ padding: '8px 10px' }}>Inclusion Fraction</th>
                      <th style={{ padding: '8px 10px' }}>Threshold Resilience</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysisResponse.edge_stability.slice(0, 50).map((e) => {
                      const pct = Math.round(e.inclusion_fraction * 100);
                      const isHighStability = e.inclusion_fraction >= 0.8;
                      return (
                        <tr key={e.edge_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 600 }}>
                            #{e.source}
                          </td>
                          <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 600 }}>
                            <span style={{ color: 'var(--color-text-secondary)', marginRight: 4 }}>→</span>
                            #{e.target}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <strong>{e.weight}</strong> <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>synapses</span>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {e.in_baseline ? (
                              <span className="badge badge-xs badge-success" style={{ fontSize: 10 }}>Yes</span>
                            ) : (
                              <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>Permissive only</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px', minWidth: 140 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div
                                style={{
                                  flex: 1,
                                  height: 6,
                                  backgroundColor: 'rgba(255,255,255,0.08)',
                                  borderRadius: 3,
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  style={{
                                    width: `${pct}%`,
                                    height: '100%',
                                    backgroundColor: isHighStability ? '#10b981' : '#8b5cf6',
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 600 }}>
                                {pct}% ({e.inclusion_count}/{e.total_scenarios})
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {e.survives_strict_threshold ? (
                              <span style={{ color: '#10b981', fontWeight: 600, fontSize: 11 }}>
                                Survives Strict (wt ≥ 10)
                              </span>
                            ) : (
                              <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>
                                Filtered at ≥ 10 syn
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Sub-Tab 3: Metric Sensitivity & Visualization ───────────────── */}
          {labTab === 'sensitivity' && (
            <div
              className="card"
              style={{
                padding: '16px 20px',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Structural metric response across alternative parameter configurations relative to baseline.
              </div>

              {/* Sensitivity Bar Chart (SVG-based, zero extra dependencies) */}
              <div
                style={{
                  padding: 16,
                  backgroundColor: 'var(--color-bg)',
                  borderRadius: 6,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', marginBottom: 12 }}>
                  Subgraphs by Parameter Setting (Node & Edge Counts)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {analysisResponse.metric_sensitivity.map((m) => {
                    const maxNodes = 60;
                    const maxEdges = Math.max(1, ...analysisResponse.metric_sensitivity.map((x) => x.edge_count));
                    const nodePct = Math.min(100, Math.round((m.node_count / maxNodes) * 100));
                    const edgePct = Math.min(100, Math.round((m.edge_count / maxEdges) * 100));

                    return (
                      <div
                        key={m.scenario_id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '220px 1fr 100px',
                          alignItems: 'center',
                          gap: 12,
                          fontSize: 11,
                        }}
                      >
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <strong>{m.parameter_label}</strong>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {/* Node bar */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${nodePct}%`, height: '100%', backgroundColor: '#3b82f6' }} />
                            </div>
                            <span style={{ width: 60, color: 'var(--color-text-secondary)' }}>{m.node_count} nodes</span>
                          </div>
                          {/* Edge bar */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${edgePct}%`, height: '100%', backgroundColor: '#8b5cf6' }} />
                            </div>
                            <span style={{ width: 60, color: 'var(--color-text-secondary)' }}>{m.edge_count} edges</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                          ΔN: <span style={{ color: m.delta_nodes >= 0 ? '#10b981' : '#ef4444' }}>{m.delta_nodes >= 0 ? `+${m.delta_nodes}` : m.delta_nodes}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sensitivity Metrics Data Table */}
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px' }}>Scenario</th>
                      <th style={{ padding: '8px 10px' }}>Weight Threshold</th>
                      <th style={{ padding: '8px 10px' }}>Node Scope</th>
                      <th style={{ padding: '8px 10px' }}>Total Nodes</th>
                      <th style={{ padding: '8px 10px' }}>Total Edges</th>
                      <th style={{ padding: '8px 10px' }}>Density</th>
                      <th style={{ padding: '8px 10px' }}>Avg Weight</th>
                      <th style={{ padding: '8px 10px' }}>ΔNodes</th>
                      <th style={{ padding: '8px 10px' }}>ΔEdges</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Runtime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysisResponse.metric_sensitivity.map((m) => (
                      <tr key={m.scenario_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{m.parameter_label}</td>
                        <td style={{ padding: '8px 10px' }}>≥ {m.min_edge_weight} syn</td>
                        <td style={{ padding: '8px 10px' }}>{m.max_subgraph_nodes} max</td>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{m.node_count}</td>
                        <td style={{ padding: '8px 10px' }}>{m.edge_count}</td>
                        <td style={{ padding: '8px 10px' }}>{(m.density * 100).toFixed(2)}%</td>
                        <td style={{ padding: '8px 10px' }}>{m.average_weight.toFixed(1)}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ color: m.delta_nodes >= 0 ? '#10b981' : '#ef4444' }}>
                            {m.delta_nodes >= 0 ? `+${m.delta_nodes}` : m.delta_nodes}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ color: m.delta_edges >= 0 ? '#10b981' : '#ef4444' }}>
                            {m.delta_edges >= 0 ? `+${m.delta_edges}` : m.delta_edges}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace' }}>
                          {m.execution_duration_ms}ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Sub-Tab 4: Scenario Matrix ──────────────────────────────────── */}
          {labTab === 'matrix' && (
            <div
              className="card"
              style={{
                padding: '16px 20px',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
                Matrix of evaluated discrete parameter scenarios with top discovered candidates and graph topologies.
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 12,
                }}
              >
                {analysisResponse.scenarios.map((sc) => {
                  const isSelected = sc.scenario_id === selectedScenarioForDetail;
                  return (
                    <div
                      key={sc.scenario_id}
                      onClick={() => setSelectedScenarioForDetail(sc.scenario_id)}
                      style={{
                        padding: '12px 14px',
                        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'var(--color-bg)',
                        border: isSelected ? '1px solid #3b82f6' : '1px solid var(--color-border)',
                        borderRadius: 6,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>
                          {sc.parameter_label}
                        </span>
                        {sc.is_baseline && (
                          <span className="badge badge-xs badge-success" style={{ fontSize: 10 }}>Baseline</span>
                        )}
                      </div>

                      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                        W≥{sc.min_edge_weight} • N={sc.node_count} nodes • {sc.edge_count} edges
                      </div>

                      <div style={{ marginTop: 8, fontSize: 11 }}>
                        <div style={{ color: 'var(--color-text-secondary)', marginBottom: 2 }}>Top Candidates:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {sc.top_candidate_ids.map((bid) => (
                            <span
                              key={bid}
                              style={{
                                fontFamily: 'monospace',
                                padding: '1px 5px',
                                borderRadius: 3,
                                backgroundColor: 'rgba(255,255,255,0.06)',
                              }}
                            >
                              #{bid}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Sub-Tab 5: Reproducibility Manifest ─────────────────────────── */}
          {labTab === 'manifest' && (
            <div
              className="card"
              style={{
                padding: '16px 20px',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>
                Reproducibility Manifest (Schema v{analysisResponse.manifest.manifest_version})
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                Contains all parameters, source dataset versions, execution metadata, and scientific limits to guarantee exact reproducibility.
              </div>

              <div
                style={{
                  padding: 14,
                  backgroundColor: 'var(--color-bg)',
                  borderRadius: 6,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div><strong>analysis_id:</strong> {analysisResponse.manifest.analysis_id}</div>
                <div><strong>baseline_execution_id:</strong> {analysisResponse.manifest.baseline_execution_id}</div>
                <div><strong>baseline_plan_id:</strong> {analysisResponse.manifest.baseline_plan_id}</div>
                <div><strong>dataset_version:</strong> {analysisResponse.manifest.dataset_version}</div>
                <div><strong>dataset_fingerprint:</strong> {analysisResponse.manifest.dataset_fingerprint}</div>
                <div><strong>catalog_version:</strong> {analysisResponse.manifest.catalog_version}</div>
                <div><strong>ranking_formula_version:</strong> {analysisResponse.manifest.ranking_formula_version}</div>
                <div><strong>scenario_strategy:</strong> {analysisResponse.manifest.scenario_strategy}</div>
                <div><strong>scenarios_evaluated:</strong> {analysisResponse.manifest.completed_scenarios} / {analysisResponse.manifest.requested_scenarios}</div>
                <div><strong>total_duration_ms:</strong> {analysisResponse.manifest.execution_duration_total_ms}ms</div>
                <div><strong>created_at:</strong> {analysisResponse.manifest.created_at}</div>
              </div>

              <div>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--color-text)', marginBottom: 6 }}>
                  Scientific Limitations & Disclosures:
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {analysisResponse.manifest.scientific_limitations.map((lim, idx) => (
                    <li key={idx}>{lim}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
