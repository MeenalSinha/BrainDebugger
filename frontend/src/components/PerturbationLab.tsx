/**
 * BrainDebugger — Perturbation Lab (Version 5)
 *
 * Controlled environment for performing non-destructive computational interventions
 * on the MaleCNS connectome. Allows researchers to disable neurons or synaptic
 * connections, measure structural changes, compare baseline vs perturbed networks,
 * discover surviving alternative routes, and run reproducible controlled experiments.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import cytoscape, { Core } from 'cytoscape';
import {
  FlaskConical,
  Play,
  RotateCcw,
  Undo2,
  Download,
  AlertTriangle,
  Plus,
  Trash2,
  ShieldAlert,
  GitBranch,
  Network,
  Dice5,
  TrendingDown,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { api, ApiClientError } from '../api';
import type {
  DisabledEdge,
  InterventionConfig,
  PerturbationComparisonRequest,
  PerturbationComparisonResponse,
  ControlledExperimentRequest,
  ControlledExperimentResponse,
  CascadeNode,
} from '../types';

interface PerturbationLabProps {
  selectedBodyId: number | null;
  onSelectNeuron: (bodyId: number) => void;
  initialSourceId?: number | null;
  initialTargetId?: number | null;
}

export function PerturbationLab({
  selectedBodyId,
  onSelectNeuron,
  initialSourceId,
  initialTargetId,
}: PerturbationLabProps) {
  // ── Experiment Scope & Parameters ──────────────────────────────────────────
  const [sourceId, setSourceId] = useState<string>(
    initialSourceId ? String(initialSourceId) : (selectedBodyId ? String(selectedBodyId) : '10001')
  );
  const [targetId, setTargetId] = useState<string>(
    initialTargetId ? String(initialTargetId) : ''
  );
  const [maxHops, setMaxHops] = useState<number>(3);
  const [minWeight, setMinWeight] = useState<string>('');

  // ── Interventions State ───────────────────────────────────────────────────
  const [disabledNeurons, setDisabledNeurons] = useState<number[]>([]);
  const [disabledEdges, setDisabledEdges] = useState<DisabledEdge[]>([]);
  const [history, setHistory] = useState<InterventionConfig[]>([]);

  // ── Manual Input Form ─────────────────────────────────────────────────────
  const [neuronInput, setNeuronInput] = useState<string>('');
  const [edgePreInput, setEdgePreInput] = useState<string>('');
  const [edgePostInput, setEdgePostInput] = useState<string>('');

  // ── Controlled Experiments Form ───────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'manual' | 'controlled'>('manual');
  const [ctrlType, setCtrlType] = useState<'random_nodes' | 'high_degree_nodes' | 'random_edges' | 'multi_level'>('random_nodes');
  const [ctrlRemovalCount, setCtrlRemovalCount] = useState<number>(2);
  const [ctrlDegreeType, setCtrlDegreeType] = useState<'in' | 'out' | 'total'>('total');
  const [ctrlSeed, setCtrlSeed] = useState<number>(42);

  // ── Analysis Results & Status ─────────────────────────────────────────────
  const [comparison, setComparison] = useState<PerturbationComparisonResponse | null>(null);
  const [controlledRes, setControlledRes] = useState<ControlledExperimentResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // ── Cytoscape Graph ───────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  // Snapshot interventions for Undo
  const pushHistory = useCallback(() => {
    setHistory((prev) => [
      ...prev.slice(-15),
      { disabled_neurons: [...disabledNeurons], disabled_edges: [...disabledEdges] },
    ]);
  }, [disabledNeurons, disabledEdges]);

  // Add Neuron intervention
  const handleAddNeuron = useCallback(() => {
    const bid = parseInt(neuronInput.trim(), 10);
    if (isNaN(bid) || bid <= 0) {
      setError('Please enter a valid positive integer Body ID.');
      return;
    }
    if (disabledNeurons.includes(bid)) {
      setStatusMessage(`Neuron ${bid} is already disabled.`);
      return;
    }
    pushHistory();
    setDisabledNeurons((prev) => [...prev, bid]);
    setNeuronInput('');
    setError(null);
    setStatusMessage(`Added neuron ${bid} to intervention overlay.`);
  }, [neuronInput, disabledNeurons, pushHistory]);

  // Remove Neuron intervention
  const handleRemoveNeuron = useCallback((bid: number) => {
    pushHistory();
    setDisabledNeurons((prev) => prev.filter((id) => id !== bid));
    setStatusMessage(`Restored neuron ${bid}.`);
  }, [pushHistory]);

  // Add Edge intervention
  const handleAddEdge = useCallback(() => {
    const pre = parseInt(edgePreInput.trim(), 10);
    const post = parseInt(edgePostInput.trim(), 10);
    if (isNaN(pre) || isNaN(post) || pre <= 0 || post <= 0) {
      setError('Please enter valid positive integer Pre and Post Body IDs.');
      return;
    }
    const exists = disabledEdges.some((e) => e.body_pre === pre && e.body_post === post);
    if (exists) {
      setStatusMessage(`Directed edge ${pre} → ${post} is already disabled.`);
      return;
    }
    pushHistory();
    setDisabledEdges((prev) => [...prev, { body_pre: pre, body_post: post }]);
    setEdgePreInput('');
    setEdgePostInput('');
    setError(null);
    setStatusMessage(`Added edge ${pre} → ${post} to intervention overlay.`);
  }, [edgePreInput, edgePostInput, disabledEdges, pushHistory]);

  // Remove Edge intervention
  const handleRemoveEdge = useCallback((pre: number, post: number) => {
    pushHistory();
    setDisabledEdges((prev) =>
      prev.filter((e) => !(e.body_pre === pre && e.body_post === post))
    );
    setStatusMessage(`Restored edge ${pre} → ${post}.`);
  }, [pushHistory]);

  // Undo most recent intervention
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setDisabledNeurons(last.disabled_neurons);
    setDisabledEdges(last.disabled_edges);
    setHistory((prev) => prev.slice(0, -1));
    setStatusMessage('Reverted to previous intervention state.');
  }, [history]);

  // Reset all interventions
  const handleReset = useCallback(() => {
    if (disabledNeurons.length === 0 && disabledEdges.length === 0) return;
    pushHistory();
    setDisabledNeurons([]);
    setDisabledEdges([]);
    setComparison(null);
    setControlledRes(null);
    setStatusMessage('Reset all interventions to baseline graph.');
  }, [disabledNeurons, disabledEdges, pushHistory]);

  // Run Perturbation Comparison Analysis
  const handleRunComparison = useCallback(async () => {
    const src = parseInt(sourceId.trim(), 10);
    if (isNaN(src) || src <= 0) {
      setError('Please provide a valid source neuron Body ID.');
      return;
    }
    const tgt = targetId.trim() ? parseInt(targetId.trim(), 10) : null;
    const mw = minWeight.trim() ? parseInt(minWeight.trim(), 10) : null;

    setLoading(true);
    setError(null);
    setStatusMessage('Computing baseline and perturbed graph analysis...');

    try {
      const payload: PerturbationComparisonRequest = {
        interventions: {
          disabled_neurons: disabledNeurons,
          disabled_edges: disabledEdges,
          experiment_name: `manual_${src}`,
        },
        source_body_id: src,
        target_body_id: tgt,
        max_hops: maxHops,
        max_paths: 3,
        strategy: 'shortest',
        min_weight: mw,
        max_cascade_nodes: 300,
        include_cascade_graph: true,
      };

      const res = await api.comparePerturbations(payload);
      setComparison(res);
      setStatusMessage('Perturbation comparison complete.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.detail : (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sourceId, targetId, maxHops, minWeight, disabledNeurons, disabledEdges]);

  // Run Controlled Experiment
  const handleRunControlledExperiment = useCallback(async () => {
    const src = parseInt(sourceId.trim(), 10);
    if (isNaN(src) || src <= 0) {
      setError('Please provide a valid source neuron Body ID for experiment scope.');
      return;
    }
    const tgt = targetId.trim() ? parseInt(targetId.trim(), 10) : null;

    setLoading(true);
    setError(null);
    setStatusMessage(`Running controlled experiment (${ctrlType})...`);

    try {
      const req: ControlledExperimentRequest = {
        experiment_type: ctrlType,
        scope_source_id: src,
        scope_target_id: tgt,
        max_hops: maxHops,
        removal_count: ctrlRemovalCount,
        degree_type: ctrlDegreeType,
        random_seed: ctrlSeed,
        levels: ctrlType === 'multi_level' ? [1, 2, 5, 10] : null,
      };

      const res = await api.runControlledExperiment(req);
      setControlledRes(res);
      setComparison(res.comparison);
      // Synchronize active interventions with what the experiment selected
      setDisabledNeurons(res.selected_interventions.disabled_neurons);
      setDisabledEdges(res.selected_interventions.disabled_edges);
      setStatusMessage(`Controlled experiment completed. Selected ${res.selected_interventions.disabled_neurons.length} neuron(s).`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.detail : (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sourceId, targetId, maxHops, ctrlType, ctrlRemovalCount, ctrlDegreeType, ctrlSeed]);

  // Export Experiment JSON
  const handleExportJSON = useCallback(() => {
    if (!comparison) return;
    const exportData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      dataset: 'male-cns:v1.0',
      experiment_id: comparison.experiment_id,
      scope: {
        source_body_id: comparison.source_body_id,
        target_body_id: comparison.target_body_id,
        max_hops: maxHops,
      },
      interventions: comparison.interventions,
      metrics: {
        path: comparison.path_comparison,
        reachability: comparison.reachability_comparison
          ? {
              baseline_reachable_count: comparison.reachability_comparison.baseline_reachable_count,
              perturbed_reachable_count: comparison.reachability_comparison.perturbed_reachable_count,
              delta_reachability: comparison.reachability_comparison.delta_reachability,
              retention_fraction: comparison.reachability_comparison.retention_fraction,
              lost_nodes_per_hop: comparison.reachability_comparison.lost_nodes_per_hop,
              lost_node_ids: comparison.reachability_comparison.lost_node_ids,
            }
          : null,
      },
      summary: comparison.summary_text,
      scientific_notice: comparison.scientific_notice,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `braindebugger-perturbation-${comparison.experiment_id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusMessage('Exported experiment record to JSON.');
  }, [comparison, maxHops]);

  // ── Render Cytoscape Graph on Comparison Update ───────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    if (!cyRef.current) {
      cyRef.current = cytoscape({
        container: containerRef.current,
        elements: [],
        style: [
          {
            selector: 'node',
            style: {
              'background-color': '#0ea5e9',
              'label': 'data(label)',
              'color': '#ffffff',
              'font-size': '10px',
              'text-valign': 'center',
              'text-halign': 'center',
              'width': 36,
              'height': 36,
              'border-width': 2,
              'border-color': '#0284c7',
            },
          },
          {
            selector: 'node[?is_source]',
            style: {
              'background-color': '#10b981',
              'border-color': '#059669',
              'border-width': 3,
              'width': 44,
              'height': 44,
            },
          },
          {
            selector: 'node[?is_target]',
            style: {
              'background-color': '#8b5cf6',
              'border-color': '#7c3aed',
              'border-width': 3,
              'width': 44,
              'height': 44,
            },
          },
          {
            selector: 'node[?is_disabled]',
            style: {
              'background-color': '#f87171',
              'border-color': '#dc2626',
              'border-style': 'dashed',
              'border-width': 3,
              'opacity': 0.85,
            },
          },
          {
            selector: 'node[?is_lost]',
            style: {
              'background-color': '#fbbf24',
              'border-color': '#d97706',
              'border-width': 3,
            },
          },
          {
            selector: 'edge',
            style: {
              'width': 2,
              'line-color': '#64748b',
              'target-arrow-color': '#64748b',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'arrow-scale': 1.1,
              'opacity': 0.6,
            },
          },
          {
            selector: 'edge[?is_disabled]',
            style: {
              'line-color': '#ef4444',
              'target-arrow-color': '#ef4444',
              'line-style': 'dashed',
              'width': 3,
              'opacity': 0.9,
            },
          },
          {
            selector: 'edge[?is_surviving_path]',
            style: {
              'line-color': '#10b981',
              'target-arrow-color': '#10b981',
              'width': 4,
              'opacity': 0.95,
            },
          },
        ],
        layout: { name: 'breadthfirst', directed: true, padding: 25 },
      });

      cyRef.current.on('tap', 'node', (evt) => {
        const bid = evt.target.data('body_id');
        if (bid) onSelectNeuron(bid);
      });
    }

    const cy = cyRef.current;
    cy.elements().remove();

    if (!comparison) {
      if (typeof cy.resize === 'function') {
        cy.resize();
      }
      return;
    }

    const baseCascade = comparison.reachability_comparison?.baseline_cascade;
    const pertCascade = comparison.reachability_comparison?.perturbed_cascade;
    const pathComp = comparison.path_comparison;
    const lostSet = new Set(comparison.reachability_comparison?.lost_node_ids || []);
    const disNeuronSet = new Set(comparison.interventions.disabled_neurons);
    const disEdgeSet = new Set(
      comparison.interventions.disabled_edges.map((e) => `${e.body_pre}_${e.body_post}`)
    );

    // Collect surviving path edges if path exists
    const survivingEdgeKeys = new Set<string>();
    if (pathComp && pathComp.perturbed_paths.length > 0) {
      for (const e of pathComp.perturbed_paths[0].edges) {
        survivingEdgeKeys.add(`${e.body_pre}_${e.body_post}`);
      }
    }

    // Nodes
    const nodeMap = new Map<number, CascadeNode>();
    if (baseCascade) {
      for (const n of baseCascade.nodes) nodeMap.set(n.body_id, n);
    }
    // Also include explicitly disabled neurons even if they weren't in base cascade
    for (const bid of disNeuronSet) {
      if (!nodeMap.has(bid)) {
        nodeMap.set(bid, {
          body_id: bid,
          type: null,
          instance: null,
          superclass: null,
          hop: 1,
          in_degree: 0,
          out_degree: 0,
        });
      }
    }

    const cyNodes = Array.from(nodeMap.values()).map((n) => {
      const isSrc = n.body_id === comparison.source_body_id;
      const isTgt = n.body_id === comparison.target_body_id;
      const isDis = disNeuronSet.has(n.body_id);
      const isLost = lostSet.has(n.body_id);

      let lbl = n.type || n.instance || String(n.body_id);
      if (isDis) lbl = `⛔ ${lbl}`;
      else if (isSrc) lbl = `SRC: ${lbl}`;
      else if (isTgt) lbl = `TGT: ${lbl}`;
      else if (isLost) lbl = `⚠ ${lbl}`;

      return {
        data: {
          id: String(n.body_id),
          body_id: n.body_id,
          label: lbl,
          is_source: isSrc,
          is_target: isTgt,
          is_disabled: isDis,
          is_lost: isLost,
        },
      };
    });

    // Edges
    const edgeMap = new Map<string, { pre: number; post: number; weight: number }>();
    if (baseCascade) {
      for (const e of baseCascade.edges) {
        edgeMap.set(`${e.body_pre}_${e.body_post}`, {
          pre: e.body_pre,
          post: e.body_post,
          weight: e.weight,
        });
      }
    }
    for (const de of comparison.interventions.disabled_edges) {
      edgeMap.set(`${de.body_pre}_${de.body_post}`, {
        pre: de.body_pre,
        post: de.body_post,
        weight: de.weight || 1,
      });
    }

    const cyEdges = Array.from(edgeMap.values())
      .filter((e) => nodeMap.has(e.pre) && nodeMap.has(e.post))
      .map((e) => {
        const k = `${e.pre}_${e.post}`;
        const isDis = disEdgeSet.has(k) || disNeuronSet.has(e.pre) || disNeuronSet.has(e.post);
        const isSurv = survivingEdgeKeys.has(k);

        return {
          data: {
            id: k,
            source: String(e.pre),
            target: String(e.post),
            weight: e.weight,
            is_disabled: isDis,
            is_surviving_path: isSurv,
          },
        };
      });

    cy.add([...cyNodes, ...cyEdges]);
    cy.layout({ name: 'breadthfirst', directed: true, padding: 30, animate: false }).run();
    cy.fit();
  }, [comparison, onSelectNeuron]);

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 overflow-hidden font-sans">
      {/* ── Top Header & Scientific Disclaimer ─────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-slate-800/90 border-b border-slate-700/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <FlaskConical className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
              Perturbation Lab
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                MaleCNS v1.0
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Simulated Neural Damage, Connectivity Analysis & Network Resilience
            </p>
          </div>
        </div>

        {/* Global Controls & Status */}
        <div className="flex items-center gap-2 flex-wrap">
          {disabledNeurons.length > 0 || disabledEdges.length > 0 ? (
            <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              {disabledNeurons.length} neuron(s), {disabledEdges.length} edge(s) excluded
            </span>
          ) : (
            <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Baseline Network (0 interventions)
            </span>
          )}

          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            className="px-2.5 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 transition"
            title="Revert most recent intervention change"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Undo
          </button>

          <button
            onClick={handleReset}
            disabled={disabledNeurons.length === 0 && disabledEdges.length === 0}
            className="px-2.5 py-1 text-xs rounded bg-slate-700 hover:bg-rose-900/60 text-slate-200 hover:text-rose-200 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 transition"
            title="Clear all interventions and restore baseline"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset All
          </button>

          <button
            onClick={handleExportJSON}
            disabled={!comparison}
            className="px-3 py-1 text-xs font-medium rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none text-white flex items-center gap-1.5 transition shadow-sm"
            title="Export experiment configuration, baseline/perturbed metrics, and history as JSON"
          >
            <Download className="w-3.5 h-3.5" />
            Export Experiment
          </button>
        </div>
      </header>

      {/* Scientific Notice Banner */}
      <div className="bg-amber-950/40 border-b border-amber-900/50 px-4 py-1.5 flex items-center gap-2 text-xs text-amber-300/90">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span>
          <strong>Scientific Caveat:</strong> Structural interventions represent non-destructive node/edge exclusions in a computational graph representation. They do not simulate physiological action potential dynamics, neurotransmitter changes, behavioral impairment, or biological regeneration.
        </span>
      </div>

      {/* ── Main Two-Column Layout ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Left Sidebar: Interventions Manager & Controlled Experiments */}
        <div className="w-full md:w-80 lg:w-96 flex flex-col border-r border-slate-700 bg-slate-800/60 overflow-y-auto">
          {/* Tabs: Manual vs Controlled */}
          <div className="flex border-b border-slate-700 bg-slate-800">
            <button
              onClick={() => setActiveTab('manual')}
              className={`flex-1 py-2 text-xs font-medium text-center border-b-2 transition ${
                activeTab === 'manual'
                  ? 'border-rose-500 text-rose-400 bg-slate-800/80'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Manual Interventions
            </button>
            <button
              onClick={() => setActiveTab('controlled')}
              className={`flex-1 py-2 text-xs font-medium text-center border-b-2 transition ${
                activeTab === 'controlled'
                  ? 'border-indigo-500 text-indigo-400 bg-slate-800/80'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Controlled Experiments
            </button>
          </div>

          <div className="p-3 space-y-4">
            {activeTab === 'manual' ? (
              <>
                {/* Add Neuron Intervention */}
                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700">
                  <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Disable Neuron</span>
                    {selectedBodyId && (
                      <button
                        onClick={() => setNeuronInput(String(selectedBodyId))}
                        className="text-[10px] text-sky-400 hover:underline lowercase font-normal"
                      >
                        use #{selectedBodyId}
                      </button>
                    )}
                  </h3>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Neuron Body ID (e.g. 10001)"
                      value={neuronInput}
                      onChange={(e) => setNeuronInput(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-rose-500"
                    />
                    <button
                      onClick={handleAddNeuron}
                      className="px-3 py-1.5 text-xs font-medium rounded bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Exclude
                    </button>
                  </div>
                </div>

                {/* Add Connection Intervention */}
                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700">
                  <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-2">
                    Disable Directed Connection
                  </h3>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input
                      type="number"
                      placeholder="Pre Body ID"
                      value={edgePreInput}
                      onChange={(e) => setEdgePreInput(e.target.value)}
                      className="px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-rose-500"
                    />
                    <input
                      type="number"
                      placeholder="Post Body ID"
                      value={edgePostInput}
                      onChange={(e) => setEdgePostInput(e.target.value)}
                      className="px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-rose-500"
                    />
                  </div>
                  <button
                    onClick={handleAddEdge}
                    className="w-full py-1.5 text-xs font-medium rounded bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center gap-1 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Exclude Directed Edge
                  </button>
                </div>

                {/* Active Interventions List */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Active Interventions ({disabledNeurons.length + disabledEdges.length})
                  </h3>

                  {disabledNeurons.length === 0 && disabledEdges.length === 0 ? (
                    <p className="text-xs text-slate-500 italic p-3 bg-slate-800/40 rounded border border-slate-800 text-center">
                      No interventions active. Baseline connectome untouched.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {disabledNeurons.map((bid) => (
                        <div
                          key={`n-${bid}`}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded bg-rose-950/40 border border-rose-900/60 text-xs"
                        >
                          <span className="font-mono text-rose-300 font-medium">
                            Neuron #{bid}
                          </span>
                          <button
                            onClick={() => handleRemoveNeuron(bid)}
                            className="text-slate-400 hover:text-rose-400 p-1 transition"
                            title="Restore this neuron"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}

                      {disabledEdges.map((e) => (
                        <div
                          key={`e-${e.body_pre}-${e.body_post}`}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded bg-rose-950/40 border border-rose-900/60 text-xs"
                        >
                          <span className="font-mono text-rose-300">
                            Edge: {e.body_pre} → {e.body_post}
                          </span>
                          <button
                            onClick={() => handleRemoveEdge(e.body_pre, e.body_post)}
                            className="text-slate-400 hover:text-rose-400 p-1 transition"
                            title="Restore this directed edge"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Controlled Experiments Form */
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700 space-y-3">
                  <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Dice5 className="w-4 h-4 text-indigo-400" />
                    Automated Intervention Protocol
                  </h3>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Experiment Strategy</label>
                    <select
                      value={ctrlType}
                      onChange={(e) => setCtrlType(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="random_nodes">Random Neuron Removal (Reproducible)</option>
                      <option value="high_degree_nodes">High-Degree Bottleneck Removal</option>
                      <option value="random_edges">Random Connection Removal</option>
                      <option value="multi_level">Multi-Level Progressive Lesions</option>
                    </select>
                  </div>

                  {ctrlType !== 'multi_level' ? (
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>Number of Elements to Exclude</span>
                        <span className="font-mono text-indigo-300">{ctrlRemovalCount}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={15}
                        value={ctrlRemovalCount}
                        onChange={(e) => setCtrlRemovalCount(parseInt(e.target.value, 10))}
                        className="w-full accent-indigo-500"
                      />
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">
                      Progressively assesses network resilience at 1, 2, 5, and 10 random neuron exclusions.
                    </p>
                  )}

                  {ctrlType === 'high_degree_nodes' && (
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Degree Metric</label>
                      <select
                        value={ctrlDegreeType}
                        onChange={(e) => setCtrlDegreeType(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="total">Total Degree (In + Out)</option>
                        <option value="out">Out-Degree (Divergence)</option>
                        <option value="in">In-Degree (Convergence)</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Random Seed (Reproducibility)</label>
                    <input
                      type="number"
                      value={ctrlSeed}
                      onChange={(e) => setCtrlSeed(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <button
                    onClick={handleRunControlledExperiment}
                    disabled={loading}
                    className="w-full py-2 text-xs font-semibold rounded bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-1.5 transition shadow"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Run Controlled Protocol
                  </button>
                </div>
              </div>
            )}

            {/* Status / Error Notifications */}
            {statusMessage && (
              <p className="text-xs text-sky-400 bg-sky-950/40 p-2 rounded border border-sky-800">
                {statusMessage}
              </p>
            )}
            {error && (
              <p className="text-xs text-rose-400 bg-rose-950/40 p-2 rounded border border-rose-800">
                {error}
              </p>
            )}
          </div>
        </div>

        {/* ── Center & Right Area: Parameters Bar, Metrics Dashboard, Graph ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* Analysis Scope Parameters Bar */}
          <div className="p-3 bg-slate-800/80 border-b border-slate-700 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-slate-300">Source:</label>
              <input
                type="number"
                placeholder="Source Body ID"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="w-28 px-2 py-1 text-xs rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-rose-500 font-mono"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-slate-300">Target (opt):</label>
              <input
                type="number"
                placeholder="Target Body ID"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-28 px-2 py-1 text-xs rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-rose-500 font-mono"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-slate-300">Hops:</label>
              <select
                value={maxHops}
                onChange={(e) => setMaxHops(parseInt(e.target.value, 10))}
                className="px-2 py-1 text-xs rounded bg-slate-900 border border-slate-700 text-slate-100"
              >
                {[1, 2, 3, 4, 5, 6].map((h) => (
                  <option key={h} value={h}>
                    {h} hops
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-slate-300">Min Wt:</label>
              <input
                type="number"
                placeholder="e.g. 10"
                value={minWeight}
                onChange={(e) => setMinWeight(e.target.value)}
                className="w-20 px-2 py-1 text-xs rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-rose-500 font-mono"
              />
            </div>

            <button
              onClick={handleRunComparison}
              disabled={loading}
              className="ml-auto px-4 py-1.5 text-xs font-semibold rounded bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 transition shadow"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {loading ? 'Analyzing...' : 'Run Perturbation Analysis'}
            </button>
          </div>

          {/* Metrics Comparison Cards (if comparison is ready) */}
          {comparison && (
            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 border-b border-slate-700 bg-slate-800/40">
              {/* Card 1: Downstream Reachability */}
              <div className="p-3 rounded-lg bg-slate-800 border border-slate-700 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                    <Network className="w-3.5 h-3.5 text-sky-400" />
                    Reachability Retention (ΔR)
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-200">
                    {(comparison.reachability_comparison?.retention_fraction || 0) * 100}%
                  </span>
                </div>
                <div className="my-2">
                  <div className="text-xl font-bold font-mono text-white flex items-baseline gap-2">
                    <span>
                      {comparison.reachability_comparison?.perturbed_reachable_count}
                    </span>
                    <span className="text-xs font-normal text-slate-400">
                      / {comparison.reachability_comparison?.baseline_reachable_count} baseline nodes
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-400 mt-1">
                    ΔR = -{comparison.reachability_comparison?.delta_reachability} nodes lost
                  </p>
                </div>
                <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-sky-500 h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(comparison.reachability_comparison?.retention_fraction || 0) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {/* Card 2: Pathway Survival & Detours */}
              <div className="p-3 rounded-lg bg-slate-800 border border-slate-700 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                    <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
                    Target Pathway Availability
                  </span>
                  {comparison.path_comparison ? (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                        comparison.path_comparison.endpoint_disabled
                          ? 'bg-red-950 text-red-300 border border-red-800'
                          : comparison.path_comparison.original_path_survived
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : comparison.path_comparison.alternative_path_found
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-red-950 text-red-300 border border-red-800'
                      }`}
                    >
                      {comparison.path_comparison.endpoint_disabled
                        ? 'ENDPOINT DISABLED'
                        : comparison.path_comparison.original_path_survived
                        ? 'ORIGINAL INTACT'
                        : comparison.path_comparison.alternative_path_found
                        ? 'DETOUR FOUND'
                        : 'SEVERED'}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500">NO TARGET SET</span>
                  )}
                </div>
                <div className="my-2">
                  {comparison.path_comparison ? (
                    <div>
                      <div className="text-base font-semibold text-white font-mono">
                        {comparison.path_comparison.perturbed_hops !== null ? (
                          <span>
                            {comparison.path_comparison.perturbed_hops} hops{' '}
                            <span className="text-xs font-normal text-slate-400">
                              (baseline: {comparison.path_comparison.baseline_hops} hops)
                            </span>
                          </span>
                        ) : (
                          <span className="text-rose-400">No Surviving Route</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 mt-1">
                        {comparison.path_comparison.delta_hops !== null && comparison.path_comparison.delta_hops > 0
                          ? `Detour penalty: +${comparison.path_comparison.delta_hops} additional hop(s)`
                          : comparison.path_comparison.original_path_survived
                          ? 'Zero hop penalty; path survives intact'
                          : 'Connection completely severed'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      Specify target Body ID above to evaluate route survival and alternate path detours.
                    </p>
                  )}
                </div>
              </div>

              {/* Card 3: Structural Exclusions Summary */}
              <div className="p-3 rounded-lg bg-slate-800 border border-slate-700 flex flex-col justify-between">
                <span className="text-xs font-medium text-slate-400 flex items-center gap-1 mb-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                  Intervention Overlay
                </span>
                <div className="my-1">
                  <div className="text-xs space-y-1 text-slate-200">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Excluded Neurons:</span>
                      <span className="font-mono font-medium">{comparison.interventions.disabled_neurons.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Excluded Directed Edges:</span>
                      <span className="font-mono font-medium">{comparison.interventions.disabled_edges.length}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 italic line-clamp-2">
                    {comparison.summary_text}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Cytoscape Network Visualizer */}
          <div className="relative flex-1 min-h-[380px] bg-slate-950 flex flex-col">
            <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-slate-800/90 p-1.5 rounded-lg border border-slate-700 shadow">
              <button
                onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.25)}
                className="p-1 hover:bg-slate-700 text-slate-300 rounded"
                title="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)}
                className="p-1 hover:bg-slate-700 text-slate-300 rounded"
                title="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => cyRef.current?.fit()}
                className="p-1 hover:bg-slate-700 text-slate-300 rounded"
                title="Fit to view"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>

            {/* Canvas Legend */}
            <div className="absolute bottom-3 left-3 z-10 bg-slate-900/90 backdrop-blur px-3 py-2 rounded-lg border border-slate-800 text-[11px] space-y-1 shadow">
              <div className="font-semibold text-slate-300 mb-1">Visual Legend</div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                <span className="text-slate-300">Source Neuron</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 border border-rose-300 inline-block" />
                <span className="text-slate-300">Disabled Neuron (Excluded)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                <span className="text-slate-300">Lost Reachable Neuron</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-0.5 bg-emerald-400 inline-block" />
                <span className="text-slate-300">Surviving Route</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-0.5 border-b border-dashed border-rose-500 inline-block" />
                <span className="text-slate-300">Severed / Excluded Edge</span>
              </div>
            </div>

            <div ref={containerRef} className="w-full h-full min-h-[380px]" />
          </div>

          {/* Hop Breakdown Table & Lost Nodes Details */}
          {comparison && comparison.reachability_comparison && (
            <div className="p-4 bg-slate-800/80 border-t border-slate-700 space-y-3">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                Per-Hop Structural Cascade Retention
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="py-1 px-2">Hop Layer</th>
                      <th className="py-1 px-2">Baseline Reach</th>
                      <th className="py-1 px-2">Perturbed Reach</th>
                      <th className="py-1 px-2">Lost at Hop</th>
                      <th className="py-1 px-2">Retention %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.reachability_comparison.baseline_layers.map((l) => {
                      const pertLayer = comparison.reachability_comparison?.perturbed_layers.find(
                        (pl) => pl.hop === l.hop
                      );
                      const pertCount = pertLayer ? pertLayer.newly_reached_nodes : 0;
                      const lostCount = l.newly_reached_nodes - pertCount;
                      const retPct =
                        l.newly_reached_nodes > 0
                          ? ((pertCount / l.newly_reached_nodes) * 100).toFixed(1)
                          : '100.0';

                      return (
                        <tr key={l.hop} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                          <td className="py-1 px-2 text-slate-300">Layer {l.hop}</td>
                          <td className="py-1 px-2 text-slate-200">{l.newly_reached_nodes}</td>
                          <td className="py-1 px-2 text-slate-200">{pertCount}</td>
                          <td className="py-1 px-2 text-rose-400">{lostCount > 0 ? `-${lostCount}` : '0'}</td>
                          <td className="py-1 px-2 text-sky-300">{retPct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Lost Nodes Chips */}
              {comparison.reachability_comparison.lost_node_ids.length > 0 && (
                <div className="pt-2">
                  <span className="text-[11px] font-medium text-rose-300 block mb-1">
                    Lost Reachable Neurons ({comparison.reachability_comparison.lost_node_ids.length} total):
                  </span>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {comparison.reachability_comparison.lost_node_ids.map((bid) => (
                      <button
                        key={bid}
                        onClick={() => onSelectNeuron(bid)}
                        className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 hover:border-amber-400 hover:text-amber-300 text-[10px] font-mono transition"
                        title="Click to inspect this disconnected neuron"
                      >
                        #{bid}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Multi-Level Experiment Results Table (if present) */}
          {controlledRes && controlledRes.multi_level_results && (
            <div className="p-4 bg-slate-800/90 border-t border-slate-700">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <TrendingDown className="w-3.5 h-3.5 text-indigo-400" />
                Multi-Level Progressive Lesion Resilience Curve
              </h3>
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="py-1 px-2">Lesion Level (Nodes Removed)</th>
                    <th className="py-1 px-2">Retained Reachable</th>
                    <th className="py-1 px-2">Lost Reachable</th>
                    <th className="py-1 px-2">Retention %</th>
                    <th className="py-1 px-2">Route Status</th>
                  </tr>
                </thead>
                <tbody>
                  {controlledRes.multi_level_results.map((ml) => (
                    <tr key={ml.level} className="border-b border-slate-700/50">
                      <td className="py-1 px-2 text-indigo-300">{ml.level} neuron(s)</td>
                      <td className="py-1 px-2 text-slate-200">{ml.reachable_count}</td>
                      <td className="py-1 px-2 text-rose-400">-{ml.delta_reachability}</td>
                      <td className="py-1 px-2 text-slate-200">{(ml.retention_fraction * 100).toFixed(1)}%</td>
                      <td className="py-1 px-2">
                        {ml.path_exists === null ? (
                          <span className="text-slate-500">—</span>
                        ) : ml.path_exists ? (
                          <span className="text-emerald-400">Surviving ({ml.path_hops} hops)</span>
                        ) : (
                          <span className="text-rose-400">Severed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
