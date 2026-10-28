/**
 * BrainDebugger — NeuroQuery Circuit Discovery & Comparative Analysis Studio (V9)
 *
 * Interactive visual exploration, explainability, directed pathway tracing,
 * and authentic comparative analysis of evidence-grounded neural circuits:
 * - Interactive Cytoscape.js canvas with search, filtering, layouts, and zoom/pan controls.
 * - Bounded neighborhood expansion (+1 hop) querying authentic Janelia MaleCNS v1.0 connections.
 * - Explainable neuron inspector: "Why is this neuron included?", transparent ranking formulas, and DOIs.
 * - Directed pathway exploration & in-graph route highlighting with handoff to Pathway Tracer.
 * - Investigation Narrative: 9-step traceable reasoning cards with scientific categories.
 * - Comparative Circuit Analysis Studio: save/reopen results, candidate overlap, direction-sensitive edge diff,
 *   and scientific compatibility warnings.
 * - Multi-format reproducible exports: JSON, Candidate CSV, Edge CSV, and Markdown Investigation Report.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import cytoscape from 'cytoscape';
import {
  Network,
  Award,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  ExternalLink,
  BookOpen,
  ShieldAlert,
  ArrowRight,
  Download,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Search,
  Sliders,
  Eye,
  EyeOff,
  GitCompare,
  FileText,
  PlusCircle,
  GitCommit,
  Bookmark,
  Trash2,
  HelpCircle,
  Route,
  Share2,
} from 'lucide-react';
import type {
  CircuitDiscoveryResult,
  DiscoveredCandidateNeuron,
  CircuitSubgraphNode,
  CircuitSubgraphEdge,
  CircuitComparisonResult,
  SavedInvestigationRecord,
} from '../types';
import { api } from '../api';
import { RobustnessLab } from './RobustnessLab';

const SAVED_INVESTIGATIONS_KEY = 'braindebugger_saved_investigations_v9';

interface CircuitDiscoveryViewProps {
  result: CircuitDiscoveryResult;
  onSelectNeuron?: (bodyId: number) => void;
  onNavigateToKnowledge?: (conceptId?: string) => void;
  onNavigateToExplorer?: (bodyId: number) => void;
  onNavigateToPathway?: (sourceId?: number, targetId?: number) => void;
  onNavigateToPerturbation?: (sourceId?: number, targetId?: number) => void;
  onResetExecution?: () => void;
}

export function CircuitDiscoveryView({
  result,
  onSelectNeuron,
  onNavigateToKnowledge,
  onNavigateToExplorer,
  onNavigateToPathway,
  onNavigateToPerturbation,
  onResetExecution,
}: CircuitDiscoveryViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  // ── Tab Navigation ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'explorer' | 'narrative' | 'compare' | 'robustness'>('explorer');

  // ── Graph State & Dynamic Expansions ──────────────────────────────────────
  const [dynamicNodes, setDynamicNodes] = useState<CircuitSubgraphNode[]>(result.subgraph_nodes);
  const [dynamicEdges, setDynamicEdges] = useState<CircuitSubgraphEdge[]>(result.subgraph_edges);
  const [isExpanding, setIsExpanding] = useState(false);
  const [expansionMessage, setExpansionMessage] = useState<string | null>(null);

  // Reset dynamic state if the input result changes
  useEffect(() => {
    setDynamicNodes(result.subgraph_nodes);
    setDynamicEdges(result.subgraph_edges);
    setSelectedBodyId(result.candidate_neurons.length > 0 ? result.candidate_neurons[0].body_id : null);
    setSelectedEdge(null);
    setPathwaySourceId(null);
    setPathwayTargetId(null);
    setActivePathNodes(new Set());
    setActivePathEdges(new Set());
  }, [result]);

  // ── Selection State ───────────────────────────────────────────────────────
  const [selectedBodyId, setSelectedBodyId] = useState<number | null>(
    result.candidate_neurons.length > 0 ? result.candidate_neurons[0].body_id : null
  );
  const [selectedEdge, setSelectedEdge] = useState<CircuitSubgraphEdge | null>(null);

  // ── Graph Filters & Search ────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [minWeightFilter, setMinWeightFilter] = useState<number>(1);
  const [evidenceTierFilter, setEvidenceTierFilter] = useState<string>('all');
  const [superclassFilter, setSuperclassFilter] = useState<string>('all');
  const [showPartners, setShowPartners] = useState(true);
  const [candidateOnlyEdges, setCandidateOnlyEdges] = useState(false);
  const [showEdgeWeights, setShowEdgeWeights] = useState(false);
  const [graphLayout, setGraphLayout] = useState<'cose' | 'concentric' | 'breadthfirst' | 'circle' | 'grid'>('cose');

  // ── Directed Pathway Exploration ──────────────────────────────────────────
  const [pathwaySourceId, setPathwaySourceId] = useState<number | null>(null);
  const [pathwayTargetId, setPathwayTargetId] = useState<number | null>(null);
  const [isPathfinding, setIsPathfinding] = useState(false);
  const [pathwayInfo, setPathwayInfo] = useState<string | null>(null);
  const [activePathNodes, setActivePathNodes] = useState<Set<number>>(new Set());
  const [activePathEdges, setActivePathEdges] = useState<Set<string>>(new Set());

  // ── Saved Investigations & Comparative Studio ─────────────────────────────
  const [savedInvestigations, setSavedInvestigations] = useState<SavedInvestigationRecord[]>(() => {
    try {
      const raw = localStorage.getItem(SAVED_INVESTIGATIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [saveName, setSaveName] = useState('');
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [compareInvestAId, setCompareInvestAId] = useState<string>(result.execution_id);
  const [compareInvestBId, setCompareInvestBId] = useState<string>('');
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<CircuitComparisonResult | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  // Persist saved investigations
  const saveInvestigationRecord = (investigation: CircuitDiscoveryResult, customName?: string) => {
    const record: SavedInvestigationRecord = {
      id: investigation.execution_id,
      saved_at: new Date().toISOString(),
      schema_version: '1.0.0',
      name: customName?.trim() || investigation.question || `Investigation ${investigation.execution_id}`,
      result: investigation,
    };
    const updated = [record, ...savedInvestigations.filter((i) => i.id !== record.id)];
    setSavedInvestigations(updated);
    try {
      localStorage.setItem(SAVED_INVESTIGATIONS_KEY, JSON.stringify(updated));
      setSaveFeedback('Investigation saved locally.');
      setTimeout(() => setSaveFeedback(null), 3000);
    } catch (err) {
      setSaveFeedback('Failed to save to local storage.');
    }
  };

  const deleteSavedInvestigation = (id: string) => {
    const updated = savedInvestigations.filter((i) => i.id !== id);
    setSavedInvestigations(updated);
    try {
      localStorage.setItem(SAVED_INVESTIGATIONS_KEY, JSON.stringify(updated));
    } catch {}
  };

  // ── Candidate & Node Lookups ──────────────────────────────────────────────
  const candidateMap = useMemo(() => {
    const m = new Map<number, DiscoveredCandidateNeuron>();
    for (const c of result.candidate_neurons) {
      m.set(c.body_id, c);
    }
    return m;
  }, [result.candidate_neurons]);

  const selectedCandidate = selectedBodyId ? candidateMap.get(selectedBodyId) : null;
  const selectedNode = selectedBodyId ? dynamicNodes.find((n) => n.body_id === selectedBodyId) : null;

  // ── Filtered Nodes and Edges for Cytoscape ─────────────────────────────────
  const { visibleNodes, visibleEdges } = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    // 1. Filter Nodes
    const filteredNodes = dynamicNodes.filter((node) => {
      // Search filter
      if (query) {
        const matchesId = String(node.body_id).includes(query);
        const matchesType = node.cell_type && node.cell_type.toLowerCase().includes(query);
        const matchesInst = node.instance && node.instance.toLowerCase().includes(query);
        if (!matchesId && !matchesType && !matchesInst) return false;
      }

      // Partner toggle
      if (!showPartners && !node.is_candidate) return false;

      // Evidence tier filter
      if (evidenceTierFilter !== 'all') {
        const cand = candidateMap.get(node.body_id);
        if (!cand || cand.evidence_tier !== evidenceTierFilter) return false;
      }

      // Superclass filter
      if (superclassFilter !== 'all') {
        if (!node.superclass || node.superclass.toLowerCase() !== superclassFilter.toLowerCase()) return false;
      }

      return true;
    });

    const visibleNodeIds = new Set(filteredNodes.map((n) => n.body_id));

    // 2. Filter Edges
    const filteredEdges = dynamicEdges.filter((edge) => {
      if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) return false;
      if (edge.weight < minWeightFilter) return false;
      if (candidateOnlyEdges && !edge.is_inter_candidate) return false;
      return true;
    });

    return { visibleNodes: filteredNodes, visibleEdges: filteredEdges };
  }, [
    dynamicNodes,
    dynamicEdges,
    searchQuery,
    showPartners,
    evidenceTierFilter,
    superclassFilter,
    minWeightFilter,
    candidateOnlyEdges,
    candidateMap,
  ]);

  // ── Cytoscape Initialization & Sync ───────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    if (visibleNodes.length === 0) return;

    const elements: cytoscape.ElementDefinition[] = [
      ...visibleNodes.map((node) => {
        const isPath = activePathNodes.has(node.body_id);
        return {
          data: {
            id: String(node.body_id),
            label: node.cell_type || (node.instance ? String(node.instance) : `#${node.body_id}`),
            body_id: node.body_id,
            cell_type: node.cell_type || '',
            instance: node.instance || '',
            is_candidate: node.is_candidate ? 'true' : 'false',
            is_expanded: node.is_expanded ? 'true' : 'false',
            is_pathway: isPath ? 'true' : 'false',
            degree: node.degree,
            total_weight: node.total_weight,
            is_selected: node.body_id === selectedBodyId ? 'true' : 'false',
          },
        };
      }),
      ...visibleEdges.map((edge) => {
        const isPath = activePathEdges.has(edge.id);
        return {
          data: {
            id: edge.id,
            source: String(edge.source),
            target: String(edge.target),
            weight: edge.weight,
            label: showEdgeWeights ? String(edge.weight) : '',
            is_inter_candidate: edge.is_inter_candidate ? 'true' : 'false',
            is_expanded: edge.is_expanded ? 'true' : 'false',
            is_pathway: isPath ? 'true' : 'false',
          },
        };
      }),
    ];

    let cy: cytoscape.Core | null = null;
    try {
      cy = cytoscape({
        container: containerRef.current,
        elements,
        style: [
          {
            selector: 'node',
            style: {
              'background-color': '#64748b',
              'label': 'data(label)',
              'font-size': '10px',
              'font-family': 'Inter, system-ui, sans-serif',
              'color': '#0f172a',
              'text-valign': 'bottom',
              'text-halign': 'center',
              'text-margin-y': 4,
              'width': 22,
              'height': 22,
              'border-width': 1.5,
              'border-color': '#cbd5e1',
            },
          },
          {
            selector: 'node[is_candidate = "true"]',
            style: {
              'background-color': '#8b5cf6',
              'border-color': '#6d28d9',
              'border-width': 2.5,
              'width': 28,
              'height': 28,
              'font-weight': 700,
            } as never,
          },
          {
            selector: 'node[is_expanded = "true"]',
            style: {
              'background-color': '#10b981',
              'border-color': '#047857',
              'border-width': 2,
              'width': 24,
              'height': 24,
            } as never,
          },
          {
            selector: 'node[is_pathway = "true"]',
            style: {
              'background-color': '#eab308',
              'border-color': '#ca8a04',
              'border-width': 4,
              'width': 32,
              'height': 32,
            } as never,
          },
          {
            selector: 'node[is_selected = "true"]',
            style: {
              'background-color': '#f59e0b',
              'border-color': '#b45309',
              'border-width': 4,
              'width': 34,
              'height': 34,
              'font-weight': 700,
              'color': '#b45309',
            } as never,
          },
          {
            selector: 'edge',
            style: {
              'width': 'mapData(weight, 1, 50, 1.5, 6)',
              'line-color': '#94a3b8',
              'target-arrow-color': '#94a3b8',
              'target-arrow-shape': 'triangle',
              'arrow-scale': 0.8,
              'curve-style': 'bezier',
              'opacity': 0.75,
              'label': 'data(label)',
              'font-size': '8px',
              'color': '#64748b',
              'text-background-opacity': 0.8,
              'text-background-color': '#ffffff',
              'text-background-padding': '1px',
            },
          },
          {
            selector: 'edge[is_inter_candidate = "true"]',
            style: {
              'line-color': '#7c3aed',
              'target-arrow-color': '#7c3aed',
              'width': 'mapData(weight, 1, 50, 2.5, 8)',
              'opacity': 0.9,
            } as never,
          },
          {
            selector: 'edge[is_expanded = "true"]',
            style: {
              'line-color': '#10b981',
              'target-arrow-color': '#10b981',
              'line-style': 'dashed',
            } as never,
          },
          {
            selector: 'edge[is_pathway = "true"]',
            style: {
              'line-color': '#eab308',
              'target-arrow-color': '#eab308',
              'width': 5,
              'opacity': 1,
            } as never,
          },
          {
            selector: 'edge:selected',
            style: {
              'line-color': '#f59e0b',
              'target-arrow-color': '#f59e0b',
              'width': 5,
              'opacity': 1,
            },
          },
        ],
        layout: {
          name: graphLayout,
          animate: false,
          ...(graphLayout === 'cose'
            ? {
                nodeRepulsion: () => 8000,
                idealEdgeLength: () => 60,
              }
            : {}),
        },
      });

      cy.on('tap', 'node', (evt) => {
        const bid = evt.target.data('body_id');
        setSelectedBodyId(bid);
        setSelectedEdge(null);
        onSelectNeuron?.(bid);

        cy?.nodes().forEach((n) => {
          n.data('is_selected', n.data('body_id') === bid ? 'true' : 'false');
        });
      });

      cy.on('tap', 'edge', (evt) => {
        const edgeId = evt.target.id();
        const found = dynamicEdges.find((e) => e.id === edgeId);
        if (found) {
          setSelectedEdge(found);
          setSelectedBodyId(null);
        }
      });

      cy.on('tap', (evt) => {
        if (evt.target === cy) {
          setSelectedEdge(null);
        }
      });

      cyRef.current = cy;
    } catch (e) {
      // Cytoscape headless context fallback
    }

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [visibleNodes, visibleEdges, graphLayout, showEdgeWeights, activePathNodes, activePathEdges]);

  // ── Bounded Neighborhood Expansion ────────────────────────────────────────
  const handleExpandSelected = async (direction: 'both' | 'incoming' | 'outgoing' = 'both') => {
    if (!selectedBodyId) return;
    setIsExpanding(true);
    setExpansionMessage(null);
    try {
      const existingIds = dynamicNodes.map((n) => n.body_id);
      const resp = await api.expandCircuitSubgraph({
        body_id: selectedBodyId,
        direction,
        max_nodes: 15,
        min_weight: minWeightFilter,
        existing_node_ids: existingIds,
      });

      if (resp.new_nodes.length === 0) {
        setExpansionMessage(resp.message || 'No additional connected partners found with current constraints.');
      } else {
        setDynamicNodes((prev) => [...prev, ...resp.new_nodes]);
        setDynamicEdges((prev) => [...prev, ...resp.new_edges]);
        setExpansionMessage(resp.message);
      }
    } catch (err: any) {
      setExpansionMessage(`Expansion failed: ${err.message || err}`);
    } finally {
      setIsExpanding(false);
    }
  };

  // ── Directed Pathway Exploration ──────────────────────────────────────────
  const handleExplorePathway = async () => {
    if (!pathwaySourceId || !pathwayTargetId) return;
    setIsPathfinding(true);
    setPathwayInfo(null);
    try {
      const resp = await api.findPaths({
        sourceBodyId: pathwaySourceId,
        targetBodyId: pathwayTargetId,
        maxHops: 5,
        maxPaths: 1,
        strategy: 'shortest',
      });

      if (!resp.paths || resp.paths.length === 0) {
        setPathwayInfo(`No directed anatomical path found from ${pathwaySourceId} to ${pathwayTargetId} within 5 hops.`);
        setActivePathNodes(new Set());
        setActivePathEdges(new Set());
      } else {
        const path = resp.paths[0];
        const pathNodeIds = path.nodes.map((n) => n.body_id);
        const pathNodeSet = new Set<number>(pathNodeIds);
        const pathEdgeSet = new Set<string>();

        // Build edge IDs along the path
        for (let i = 0; i < pathNodeIds.length - 1; i++) {
          pathEdgeSet.add(`${pathNodeIds[i]}_${pathNodeIds[i + 1]}`);
        }

        setActivePathNodes(pathNodeSet);
        setActivePathEdges(pathEdgeSet);
        setPathwayInfo(
          `Found ${path.hops}-hop directed path: ${pathNodeIds.join(' → ')} (Total weight: ${path.total_weight})`
        );
      }
    } catch (err: any) {
      setPathwayInfo(`Pathway search failed: ${err.message || err}`);
    } finally {
      setIsPathfinding(false);
    }
  };

  // ── Comparative Analysis ──────────────────────────────────────────────────
  const handleRunComparison = async () => {
    const investA =
      compareInvestAId === result.execution_id
        ? result
        : savedInvestigations.find((i) => i.id === compareInvestAId)?.result;
    const investB =
      compareInvestBId === result.execution_id
        ? result
        : savedInvestigations.find((i) => i.id === compareInvestBId)?.result;

    if (!investA || !investB) {
      setComparisonError('Please select two valid investigation results to compare.');
      return;
    }

    setIsComparing(true);
    setComparisonError(null);
    try {
      const comp = await api.compareCircuitInvestigations({ result_a: investA, result_b: investB });
      setComparisonResult(comp);
    } catch (err: any) {
      setComparisonError(`Comparison failed: ${err.message || err}`);
    } finally {
      setIsComparing(false);
    }
  };

  // ── Exports (JSON, Candidates CSV, Edges CSV, Markdown Report) ────────────
  const handleExportResultJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `braindebugger-circuit-${result.execution_id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result]);

  const handleExportCandidatesCSV = useCallback(() => {
    const headers = [
      'Rank',
      'Body_ID',
      'Cell_Type',
      'Instance',
      'Superclass',
      'Evidence_Tier',
      'Evidence_Status',
      'Ranking_Score',
      'Tier_Score',
      'Synaptic_Weight_Contrib',
      'Degree_Contrib',
      'In_Degree',
      'Out_Degree',
      'Total_Synapses',
      'Matched_Concepts',
    ];

    const rows = result.candidate_neurons.map((c, idx) => {
      const bd = c.ranking_breakdown || {};
      return [
        idx + 1,
        c.body_id,
        `"${c.cell_type || ''}"`,
        `"${c.instance || ''}"`,
        `"${c.superclass || ''}"`,
        `"${c.evidence_tier}"`,
        `"${c.evidence_status}"`,
        c.ranking_score,
        bd.evidence_tier_weight ?? '',
        bd.synaptic_weight_contribution ?? '',
        bd.degree_contribution ?? '',
        c.subgraph_in_degree,
        c.subgraph_out_degree,
        c.subgraph_total_weight,
        `"${c.matched_concept_ids.join('; ')}"`,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `braindebugger-candidates-${result.execution_id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result]);

  const handleExportEdgesCSV = useCallback(() => {
    const headers = ['Source_Pre', 'Target_Post', 'Synaptic_Weight', 'Connection_Type', 'Is_Expanded'];
    const rows = dynamicEdges.map((e) =>
      [
        e.source,
        e.target,
        e.weight,
        e.is_inter_candidate ? 'inter_candidate' : 'partner_connection',
        e.is_expanded ? 'true' : 'false',
      ].join(',')
    );

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `braindebugger-edges-${result.execution_id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [dynamicEdges, result.execution_id]);

  const handleExportMarkdownReport = useCallback(() => {
    const md = [
      `# BrainDebugger NeuroQuery Investigation Report`,
      `**Execution ID:** \`${result.execution_id}\`  `,
      `**Plan ID:** \`${result.plan_id || 'N/A'}\`  `,
      `**Date:** ${new Date().toISOString()}  `,
      `**Dataset:** ${result.dataset_version} (${result.source_coverage})  `,
      `**Catalog Version:** ${result.catalog_version}  `,
      ``,
      `## 1. Research Question`,
      `> "${result.question}"`,
      `* **Intent:** \`${result.intent}\``,
      `* **Resolved Biological Concepts:** ${result.resolved_concepts.map((c) => c.display_name).join(', ') || 'None'}`,
      ``,
      `## 2. Discovered Circuit Candidates`,
      `| Rank | Body ID | Type | Evidence Tier | Ranking Score | In-Circuit Synapses |`,
      `| :--- | :--- | :--- | :--- | :--- | :--- |`,
      ...result.candidate_neurons.map(
        (c, idx) =>
          `| #${idx + 1} | ${c.body_id} | ${c.cell_type || 'N/A'} | ${c.evidence_tier} | ${c.ranking_score} | ${c.subgraph_total_weight} |`
      ),
      ``,
      `## 3. Structural Circuit Metrics`,
      `* **Total Nodes:** ${result.structural_metrics.total_nodes} (${result.structural_metrics.candidate_nodes_count} candidates, ${result.structural_metrics.partner_nodes_count} contextual partners)`,
      `* **Directed Edges:** ${result.structural_metrics.total_edges}`,
      `* **Graph Density:** ${result.structural_metrics.density}`,
      `* **Average Synaptic Weight:** ${result.structural_metrics.average_weight}`,
      `* **Maximum Synaptic Weight:** ${result.structural_metrics.max_weight}`,
      `* **Top Hub Body ID:** ${result.structural_metrics.top_hub_body_id || 'N/A'}`,
      ``,
      `## 4. Supporting Literature Evidence`,
      ...result.evidence_sources.map(
        (s) => `* **${s.title}** (${s.year}) — ${s.authors} [doi:${s.doi || 'N/A'}](https://doi.org/${s.doi || ''})`
      ),
      ``,
      `## 5. Scientific Limitations & Caveats`,
      ...result.limitations.map((lim) => `* ${lim}`),
      ``,
      `---`,
      `*Generated by BrainDebugger V9 (Janelia MaleCNS v1.0 Studio)*`,
    ].join('\n');

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `braindebugger-report-${result.execution_id}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result]);

  return (
    <div
      className="circuit-discovery-view"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        paddingBottom: 24,
      }}
    >
      {/* ── 1. Header & Navigation Toolbar ──────────────────────────────── */}
      <div
        className="card"
        style={{
          padding: '12px 18px',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              backgroundColor: 'rgba(124, 58, 237, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#7c3aed',
            }}
          >
            <Network size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-text)' }}>
              Discovered Neural Circuit
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', gap: 8 }}>
              <span>Execution: <strong style={{ fontFamily: 'monospace' }}>{result.execution_id}</strong></span>
              <span>•</span>
              <span>Duration: <strong>{result.execution_duration_ms}ms</strong></span>
              <span>•</span>
              <span>Dataset: <strong>{result.dataset_version}</strong></span>
            </div>
          </div>
        </div>

        {/* Studio View Tabs */}
        <div style={{ display: 'flex', gap: 6, backgroundColor: 'var(--color-bg)', padding: 4, borderRadius: 6 }}>
          <button
            id="tab-circuit-explorer"
            className={`btn btn-xs ${activeTab === 'explorer' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('explorer')}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <Network size={13} />
            <span>Circuit Explorer</span>
          </button>
          <button
            id="tab-investigation-narrative"
            className={`btn btn-xs ${activeTab === 'narrative' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('narrative')}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <GitCommit size={13} />
            <span>Reasoning Trace</span>
          </button>
          <button
            id="tab-comparative-studio"
            className={`btn btn-xs ${activeTab === 'compare' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('compare')}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <GitCompare size={13} />
            <span>Compare Investigations</span>
          </button>
          <button
            id="tab-robustness-lab"
            className={`btn btn-xs ${activeTab === 'robustness' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('robustness')}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <Sliders size={13} />
            <span>Robustness Lab (V10)</span>
          </button>
        </div>

        {/* Global Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            id="btn-analyze-robustness-quick"
            className="btn btn-sm btn-outline"
            onClick={() => setActiveTab('robustness')}
            title="Evaluate circuit robustness across systematic parameter sweeps"
            style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.4)' }}
          >
            <Sliders size={14} />
            <span>Analyze Robustness</span>
          </button>

          <button
            id="btn-save-investigation-quick"
            className="btn btn-sm btn-outline"
            onClick={() => saveInvestigationRecord(result)}
            title="Save this investigation result locally for comparative analysis"
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <Bookmark size={14} />
            <span>Save Result</span>
          </button>

          {/* Export Dropdown / Actions */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              id="btn-export-discovery-json"
              className="btn btn-sm btn-outline"
              onClick={handleExportResultJSON}
              title="Export full reproducible result as JSON"
            >
              <Download size={14} />
              <span>JSON</span>
            </button>
            <button
              id="btn-export-candidates-csv"
              className="btn btn-sm btn-outline"
              onClick={handleExportCandidatesCSV}
              title="Export candidate neurons as CSV"
            >
              <span>Candidates CSV</span>
            </button>
            <button
              id="btn-export-edges-csv"
              className="btn btn-sm btn-outline"
              onClick={handleExportEdgesCSV}
              title="Export directed connections as CSV"
            >
              <span>Edges CSV</span>
            </button>
            <button
              id="btn-export-markdown-report"
              className="btn btn-sm btn-outline"
              onClick={handleExportMarkdownReport}
              title="Export human-readable Markdown investigation report"
            >
              <FileText size={14} />
              <span>Report (MD)</span>
            </button>
          </div>

          {onResetExecution && (
            <button
              className="btn btn-sm btn-outline"
              onClick={onResetExecution}
              title="Return to natural-language planning view"
            >
              <RotateCcw size={14} />
              <span>Back to Plan</span>
            </button>
          )}
        </div>
      </div>

      {saveFeedback && (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid #10b981',
            borderRadius: 6,
            color: '#065f46',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <CheckCircle2 size={14} />
          <span>{saveFeedback}</span>
        </div>
      )}

      {/* ── TAB 1: CIRCUIT EXPLORER ─────────────────────────────────────── */}
      {activeTab === 'explorer' && (
        <>
          {/* Controls Bar: Search, Filters, and Layout */}
          <div
            className="card"
            style={{
              padding: '12px 16px',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {/* Search Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 240, flex: 1 }}>
              <Search size={15} style={{ color: 'var(--color-text-secondary)' }} />
              <input
                id="input-circuit-search"
                type="text"
                placeholder="Search Body ID, Cell Type, or Instance..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  fontSize: 12,
                  backgroundColor: 'var(--color-bg)',
                }}
              />
            </div>

            {/* Layout Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Layout:</span>
              <select
                id="select-graph-layout"
                value={graphLayout}
                onChange={(e) => setGraphLayout(e.target.value as any)}
                style={{
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  fontSize: 12,
                  backgroundColor: 'var(--color-bg)',
                }}
              >
                <option value="cose">Force-Directed (Cose)</option>
                <option value="concentric">Concentric</option>
                <option value="breadthfirst">Hierarchical (Breadthfirst)</option>
                <option value="circle">Circle</option>
                <option value="grid">Grid</option>
              </select>
            </div>

            {/* Min Weight Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Min Synapses:</span>
              <input
                type="range"
                min="1"
                max="50"
                value={minWeightFilter}
                onChange={(e) => setMinWeightFilter(Number(e.target.value))}
                style={{ width: 80 }}
              />
              <span style={{ fontFamily: 'monospace', fontWeight: 700, minWidth: 20 }}>{minWeightFilter}</span>
            </div>

            {/* Evidence Tier Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Tier:</span>
              <select
                value={evidenceTierFilter}
                onChange={(e) => setEvidenceTierFilter(e.target.value)}
                style={{
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  fontSize: 12,
                  backgroundColor: 'var(--color-bg)',
                }}
              >
                <option value="all">All Tiers</option>
                <option value="Tier 1 (Verified)">Tier 1 (Verified)</option>
                <option value="Tier 2 (Partially Supported)">Tier 2 (Partially Supported)</option>
                <option value="Tier 3 (Under Review)">Tier 3 (Under Review)</option>
                <option value="Tier 4 (Exploratory)">Tier 4 (Exploratory)</option>
              </select>
            </div>

            {/* Toggles */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className={`btn btn-xs ${showPartners ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setShowPartners(!showPartners)}
                title="Toggle visibility of contextual partner neurons"
              >
                {showPartners ? <Eye size={12} /> : <EyeOff size={12} />}
                <span>Partners</span>
              </button>

              <button
                className={`btn btn-xs ${candidateOnlyEdges ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setCandidateOnlyEdges(!candidateOnlyEdges)}
                title="Isolate connections joining candidate neurons"
              >
                <span>Candidate-Only</span>
              </button>

              <button
                className={`btn btn-xs ${showEdgeWeights ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setShowEdgeWeights(!showEdgeWeights)}
                title="Display numerical synapse count labels on edges"
              >
                <span>Weights</span>
              </button>
            </div>
          </div>

          {/* Graph & Inspector Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 16 }}>
            {/* Cytoscape Circuit View */}
            <div
              className="card"
              style={{
                height: 520,
                position: 'relative',
                backgroundColor: '#ffffff',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              {visibleNodes.length > 0 ? (
                <>
                  <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

                  {/* Cytoscape Toolbar Controls */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      display: 'flex',
                      gap: 6,
                      backgroundColor: 'rgba(255, 255, 255, 0.92)',
                      padding: 4,
                      borderRadius: 6,
                      border: '1px solid var(--color-border)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      zIndex: 10,
                    }}
                  >
                    <button
                      className="btn btn-xs btn-outline"
                      onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.25)}
                      title="Zoom In"
                    >
                      <ZoomIn size={14} />
                    </button>
                    <button
                      className="btn btn-xs btn-outline"
                      onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)}
                      title="Zoom Out"
                    >
                      <ZoomOut size={14} />
                    </button>
                    <button
                      className="btn btn-xs btn-outline"
                      onClick={() => cyRef.current?.fit()}
                      title="Fit to Viewport"
                    >
                      <Maximize2 size={14} />
                    </button>
                    <button
                      className="btn btn-xs btn-outline"
                      onClick={() => cyRef.current?.center()}
                      title="Center Graph"
                    >
                      <Layers size={14} />
                    </button>
                    <button
                      className="btn btn-xs btn-outline"
                      onClick={() => cyRef.current?.layout({ name: graphLayout, animate: true }).run()}
                      title="Reset Layout"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>

                  {/* Graph Visual Legend */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 10,
                      left: 10,
                      display: 'flex',
                      gap: 10,
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--color-border)',
                      fontSize: 11,
                      color: 'var(--color-text-secondary)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      zIndex: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#8b5cf6' }} />
                      Candidate
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#64748b' }} />
                      Context Partner
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#10b981' }} />
                      Expanded (+1 Hop)
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                      Selected
                    </span>
                    {activePathNodes.size > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#eab308' }} />
                        Pathway Route
                      </span>
                    )}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <ArrowRight size={12} style={{ color: '#94a3b8' }} />
                      Presynaptic → Postsynaptic
                    </span>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: 8,
                    color: 'var(--color-text-secondary)',
                    padding: 24,
                  }}
                >
                  <Activity size={32} style={{ opacity: 0.5 }} />
                  <div style={{ fontWeight: 600 }}>No Nodes Visible With Current Filters</div>
                  <div style={{ fontSize: 12 }}>Try lowering the min synaptic weight or enabling partner neurons.</div>
                </div>
              )}
            </div>

            {/* Explainable Details Inspector */}
            <div
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                padding: 16,
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                overflowY: 'auto',
                maxHeight: 520,
              }}
            >
              {selectedNode ? (
                <>
                  {/* Node Identity */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="badge badge-indigo">
                        {selectedNode.is_candidate
                          ? 'Candidate Neuron'
                          : selectedNode.is_expanded
                          ? 'Expanded Neighborhood'
                          : 'Contextual Partner'}
                      </span>
                      <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>
                        #{selectedNode.body_id}
                      </span>
                    </div>

                    <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4, color: 'var(--color-text)' }}>
                      {selectedNode.cell_type || (selectedNode.instance ? String(selectedNode.instance) : `Neuron ${selectedNode.body_id}`)}
                    </div>
                    {selectedNode.instance && selectedNode.cell_type && (
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        Instance: <strong>{selectedNode.instance}</strong>
                      </div>
                    )}
                    {selectedNode.superclass && (
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        Superclass: <strong>{selectedNode.superclass}</strong>
                      </div>
                    )}
                    {selectedNode.consensus_nt && (
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        Predicted NT: <span className="badge badge-slate">{selectedNode.consensus_nt}</span>
                      </div>
                    )}
                  </div>

                  {/* "Why is this neuron included?" Section */}
                  <div
                    style={{
                      padding: 10,
                      backgroundColor: 'var(--color-bg)',
                      borderRadius: 6,
                      fontSize: 12,
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <HelpCircle size={13} style={{ color: 'var(--color-primary)' }} />
                      <span>Why is this neuron included?</span>
                    </div>
                    {selectedCandidate ? (
                      <div>
                        Matched biological mapping: <strong>{selectedCandidate.matched_mapping_ids.join(', ')}</strong> on annotation field{' '}
                        <code>{selectedCandidate.matched_field}={selectedCandidate.matched_value}</code> with support tier{' '}
                        <strong>{selectedCandidate.evidence_tier}</strong>.
                      </div>
                    ) : selectedNode.is_expanded ? (
                      <div>
                        Discovered through controlled <strong>+1 hop bounded expansion</strong> from neuron{' '}
                        <strong>{selectedBodyId}</strong>.
                      </div>
                    ) : (
                      <div>
                        Contextual synaptic partner directly connected to circuit candidates with{' '}
                        <strong>{selectedNode.total_weight}</strong> recorded synapses.
                      </div>
                    )}
                  </div>

                  {/* Transparent Ranking Breakdown (if candidate) */}
                  {selectedCandidate && (
                    <div
                      style={{
                        padding: 10,
                        backgroundColor: 'rgba(124, 58, 237, 0.05)',
                        border: '1px solid rgba(124, 58, 237, 0.2)',
                        borderRadius: 6,
                        fontSize: 11,
                      }}
                    >
                      <div style={{ fontWeight: 700, color: '#7c3aed', marginBottom: 4 }}>
                        Transparent Ranking Formula
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                        Score = Tier Weight + (Synapses × 0.5) + (Degree × 10.0)
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, textAlign: 'center' }}>
                        <div style={{ padding: 4, backgroundColor: '#ffffff', borderRadius: 4, border: '1px solid var(--color-border)' }}>
                          <div style={{ fontSize: 9, color: 'var(--color-text-secondary)' }}>Tier Weight</div>
                          <div style={{ fontWeight: 700 }}>{selectedCandidate.ranking_breakdown?.evidence_tier_weight ?? 0}</div>
                        </div>
                        <div style={{ padding: 4, backgroundColor: '#ffffff', borderRadius: 4, border: '1px solid var(--color-border)' }}>
                          <div style={{ fontSize: 9, color: 'var(--color-text-secondary)' }}>Synapses</div>
                          <div style={{ fontWeight: 700 }}>+{selectedCandidate.ranking_breakdown?.synaptic_weight_contribution ?? 0}</div>
                        </div>
                        <div style={{ padding: 4, backgroundColor: '#ffffff', borderRadius: 4, border: '1px solid var(--color-border)' }}>
                          <div style={{ fontSize: 9, color: 'var(--color-text-secondary)' }}>Degree</div>
                          <div style={{ fontWeight: 700 }}>+{selectedCandidate.ranking_breakdown?.degree_contribution ?? 0}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', marginTop: 6, fontWeight: 700, fontSize: 12 }}>
                        Total Score: <span style={{ color: '#7c3aed' }}>{selectedCandidate.ranking_score}</span>
                      </div>
                    </div>
                  )}

                  {/* Bounded Neighborhood Expansion Action */}
                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Bounded Graph Expansion</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-xs btn-outline"
                        onClick={() => handleExpandSelected('both')}
                        disabled={isExpanding}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                      >
                        <PlusCircle size={12} />
                        <span>+1 Hop (Both)</span>
                      </button>
                      <button
                        className="btn btn-xs btn-outline"
                        onClick={() => handleExpandSelected('outgoing')}
                        disabled={isExpanding}
                        title="Expand postsynaptic partners"
                      >
                        Out
                      </button>
                      <button
                        className="btn btn-xs btn-outline"
                        onClick={() => handleExpandSelected('incoming')}
                        disabled={isExpanding}
                        title="Expand presynaptic partners"
                      >
                        In
                      </button>
                    </div>
                    {expansionMessage && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                        {expansionMessage}
                      </div>
                    )}
                  </div>

                  {/* Directed Pathway Exploration Controls */}
                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Directed Pathway Tracing</div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <button
                        className={`btn btn-xs ${pathwaySourceId === selectedNode.body_id ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setPathwaySourceId(selectedNode.body_id)}
                        style={{ flex: 1 }}
                      >
                        Set as Source (A)
                      </button>
                      <button
                        className={`btn btn-xs ${pathwayTargetId === selectedNode.body_id ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setPathwayTargetId(selectedNode.body_id)}
                        style={{ flex: 1 }}
                      >
                        Set as Target (B)
                      </button>
                    </div>

                    {pathwaySourceId && pathwayTargetId && (
                      <button
                        id="btn-trace-directed-pathway"
                        className="btn btn-xs btn-primary"
                        onClick={handleExplorePathway}
                        disabled={isPathfinding}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                      >
                        <Route size={12} />
                        <span>{isPathfinding ? 'Tracing Path...' : `Trace Path: #${pathwaySourceId} → #${pathwayTargetId}`}</span>
                      </button>
                    )}

                    {pathwayInfo && (
                      <div style={{ fontSize: 11, marginTop: 6, color: '#ca8a04', fontWeight: 600 }}>
                        {pathwayInfo}
                      </div>
                    )}
                  </div>

                  {/* External Workspace Handoffs */}
                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {onNavigateToExplorer && (
                      <button
                        className="btn btn-xs btn-outline"
                        onClick={() => onNavigateToExplorer(selectedNode.body_id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                      >
                        <ExternalLink size={12} />
                        <span>Open in Connectome Explorer</span>
                      </button>
                    )}
                    {onNavigateToPathway && (
                      <button
                        className="btn btn-xs btn-outline"
                        onClick={() => onNavigateToPathway(pathwaySourceId || selectedNode.body_id, pathwayTargetId || undefined)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                      >
                        <Route size={12} />
                        <span>Open in Pathway Tracer</span>
                      </button>
                    )}
                    {onNavigateToPerturbation && (
                      <button
                        className="btn btn-xs btn-outline"
                        onClick={() => onNavigateToPerturbation(selectedNode.body_id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                      >
                        <Activity size={12} />
                        <span>Simulate Lesion in Perturbation Lab</span>
                      </button>
                    )}
                  </div>
                </>
              ) : selectedEdge ? (
                <>
                  {/* Selected Edge Details */}
                  <div>
                    <span className="badge badge-slate">Synaptic Connection</span>
                    <div style={{ fontWeight: 700, fontSize: 15, marginTop: 6, color: 'var(--color-text)' }}>
                      #{selectedEdge.source} → #{selectedEdge.target}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                      Presynaptic Neuron → Postsynaptic Target
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 10,
                      backgroundColor: 'var(--color-bg)',
                      borderRadius: 6,
                      fontSize: 12,
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span>Recorded Synaptic Weight:</span>
                      <strong>{selectedEdge.weight}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span>Connection Class:</span>
                      <strong>{selectedEdge.is_inter_candidate ? 'Inter-Candidate' : 'Partner Connection'}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Origin:</span>
                      <strong>{selectedEdge.is_expanded ? 'Expanded Neighborhood' : 'Original Subgraph'}</strong>
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                    *Synaptic weights represent recorded anatomical synapse counts from Janelia MaleCNS v1.0 traced-only dataset.
                    Direction reflects chemical synapse orientation (presynaptic T-bar to postsynaptic density).
                  </div>
                </>
              ) : (
                <div
                  style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: 8,
                    color: 'var(--color-text-secondary)',
                    textAlign: 'center',
                  }}
                >
                  <HelpCircle size={28} style={{ opacity: 0.5 }} />
                  <div style={{ fontWeight: 600 }}>No Element Selected</div>
                  <div style={{ fontSize: 12 }}>Click any neuron or directed connection in the circuit to inspect evidence and provenance.</div>
                </div>
              )}
            </div>
          </div>

          {/* Candidate Neurons Table */}
          <div
            className="card"
            style={{
              padding: 16,
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Award size={16} style={{ color: 'var(--color-primary)' }} />
                <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                  Transparent Candidate Neuron Rankings
                </h2>
              </div>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                Sorted by transparent evidence-grounded score ({result.candidate_neurons.length} candidates)
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>Rank</th>
                    <th style={{ padding: '8px 10px' }}>Body ID</th>
                    <th style={{ padding: '8px 10px' }}>Cell Type</th>
                    <th style={{ padding: '8px 10px' }}>Instance</th>
                    <th style={{ padding: '8px 10px' }}>Evidence Tier</th>
                    <th style={{ padding: '8px 10px' }}>Score</th>
                    <th style={{ padding: '8px 10px' }}>In-Circuit Synapses</th>
                    <th style={{ padding: '8px 10px' }}>Explanation</th>
                    <th style={{ padding: '8px 10px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {result.candidate_neurons.map((cand, idx) => {
                    const isSelected = cand.body_id === selectedBodyId;
                    return (
                      <tr
                        key={cand.body_id}
                        onClick={() => setSelectedBodyId(cand.body_id)}
                        style={{
                          borderBottom: '1px solid var(--color-border)',
                          backgroundColor: isSelected ? 'rgba(124, 58, 237, 0.08)' : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <td style={{ padding: '8px 10px', fontWeight: 700 }}>#{idx + 1}</td>
                        <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 600 }}>{cand.body_id}</td>
                        <td style={{ padding: '8px 10px' }}>{cand.cell_type || '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--color-text-secondary)' }}>{cand.instance || '—'}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span className={`badge ${cand.evidence_tier.includes('Tier 1') ? 'badge-emerald' : 'badge-slate'}`}>
                            {cand.evidence_tier}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--color-primary)' }}>
                          {cand.ranking_score}
                        </td>
                        <td style={{ padding: '8px 10px' }}>{cand.subgraph_total_weight}</td>
                        <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                          {cand.explanation}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <button
                            className="btn btn-xs btn-outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBodyId(cand.body_id);
                              cyRef.current?.nodes(`[body_id = ${cand.body_id}]`).select();
                            }}
                          >
                            Focus
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Structural Metrics & Evidence Grid ────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {/* Structural Metrics Card */}
            <div
              className="card"
              style={{
                padding: 16,
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Activity size={16} style={{ color: 'var(--color-primary)' }} />
                <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                  Calculated Structural Graph Metrics
                </h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <div style={{ padding: '8px 10px', backgroundColor: 'var(--color-bg)', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Total Nodes</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
                    {result.structural_metrics.total_nodes}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                    {result.structural_metrics.candidate_nodes_count} cand, {result.structural_metrics.partner_nodes_count} part
                  </div>
                </div>

                <div style={{ padding: '8px 10px', backgroundColor: 'var(--color-bg)', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Directed Edges</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
                    {result.structural_metrics.total_edges}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                    density: {result.structural_metrics.density}
                  </div>
                </div>

                <div style={{ padding: '8px 10px', backgroundColor: 'var(--color-bg)', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Avg Weight</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
                    {result.structural_metrics.average_weight}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                    max: {result.structural_metrics.max_weight}
                  </div>
                </div>

                <div style={{ padding: '8px 10px', backgroundColor: 'var(--color-bg)', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Top Hub Body ID</div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                    {result.structural_metrics.top_hub_body_id ? `#${result.structural_metrics.top_hub_body_id}` : 'None'}
                  </div>
                </div>

                <div style={{ padding: '8px 10px', backgroundColor: 'var(--color-bg)', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Connected Comp.</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
                    {result.structural_metrics.connected_components}
                  </div>
                </div>

                <div style={{ padding: '8px 10px', backgroundColor: 'var(--color-bg)', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Coverage Scope</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>
                    {result.dataset_version}
                  </div>
                </div>
              </div>
            </div>

            {/* Evidence Sources Card */}
            <div
              className="card"
              style={{
                padding: 16,
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <BookOpen size={16} style={{ color: 'var(--color-primary)' }} />
                <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                  Supporting Evidence & Peer-Reviewed Sources
                </h2>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                {result.evidence_sources.length > 0 ? (
                  result.evidence_sources.map((src) => (
                    <div
                      key={src.source_id}
                      style={{
                        padding: '8px 10px',
                        backgroundColor: 'var(--color-bg)',
                        borderRadius: 6,
                        fontSize: 11,
                      }}
                    >
                      <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{src.title}</div>
                      <div style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
                        {src.authors} ({src.year}) — <em>{src.journal || 'Connectome Report'}</em>
                      </div>
                      {src.doi && (
                        <div style={{ marginTop: 2 }}>
                          <a
                            href={`https://doi.org/${src.doi}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                          >
                            doi:{src.doi} <ExternalLink size={10} style={{ display: 'inline' }} />
                          </a>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    No literature references linked for this query.
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── TAB 2: INVESTIGATION NARRATIVE & REASONING TRACE ─────────────── */}
      {activeTab === 'narrative' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            className="card"
            style={{
              padding: 16,
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <GitCommit size={18} style={{ color: 'var(--color-primary)' }} />
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                Investigation Reasoning Trace & Provenance
              </h2>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
              Every step from natural-language question to biological discovery is traceable to recorded dataset records,
              the biological knowledge catalog, or authoritative reproducible calculations.
            </div>

            {/* Trace Timeline Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Step 1 */}
              <div style={{ padding: 12, backgroundColor: 'var(--color-bg)', borderRadius: 6, borderLeft: '4px solid #3b82f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13 }}>Step 1: Research Question Formulation</strong>
                  <span className="badge badge-blue">Recorded Data</span>
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  User asked: <em>"{result.question}"</em>
                </div>
              </div>

              {/* Step 2 */}
              <div style={{ padding: 12, backgroundColor: 'var(--color-bg)', borderRadius: 6, borderLeft: '4px solid #06b6d4' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13 }}>Step 2: Intent Classification</strong>
                  <span className="badge badge-cyan">Computed Result</span>
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  Classified into typed intent: <code>{result.intent}</code>
                </div>
              </div>

              {/* Step 3 */}
              <div style={{ padding: 12, backgroundColor: 'var(--color-bg)', borderRadius: 6, borderLeft: '4px solid #8b5cf6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13 }}>Step 3: Biological Concept Resolution</strong>
                  <span className="badge badge-purple">Catalog Evidence</span>
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  Resolved concepts from NeuroQuery Biological Catalog v{result.catalog_version}:{' '}
                  <strong>{result.resolved_concepts.map((c) => `${c.display_name} (${c.concept_id})`).join(', ') || 'None'}</strong>
                </div>
              </div>

              {/* Step 4 */}
              <div style={{ padding: 12, backgroundColor: 'var(--color-bg)', borderRadius: 6, borderLeft: '4px solid #06b6d4' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13 }}>Step 4: Plan Validation & Security Audit</strong>
                  <span className="badge badge-cyan">Computed Result</span>
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  Audited plan parameters and operations against strict allowlist. Revalidated immediately before execution.
                </div>
              </div>

              {/* Step 5 */}
              <div style={{ padding: 12, backgroundColor: 'var(--color-bg)', borderRadius: 6, borderLeft: '4px solid #3b82f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13 }}>Step 5: Biological Candidate Neuron Resolution</strong>
                  <span className="badge badge-blue">Recorded Data</span>
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  Queried Janelia MaleCNS v1.0 annotations; identified <strong>{result.candidate_neurons.length} candidate neurons</strong>{' '}
                  matching validated concept mapping criteria.
                </div>
              </div>

              {/* Step 6 */}
              <div style={{ padding: 12, backgroundColor: 'var(--color-bg)', borderRadius: 6, borderLeft: '4px solid #8b5cf6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13 }}>Step 6: Evidence Mapping & DOI Verification</strong>
                  <span className="badge badge-purple">Catalog Evidence</span>
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  Mapped candidates to <strong>{result.evidence_sources.length} peer-reviewed scientific publications</strong> with verified DOIs.
                </div>
              </div>

              {/* Step 7 */}
              <div style={{ padding: 12, backgroundColor: 'var(--color-bg)', borderRadius: 6, borderLeft: '4px solid #3b82f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13 }}>Step 7: Directed Subgraph Extraction</strong>
                  <span className="badge badge-blue">Recorded Data</span>
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  Extracted {result.structural_metrics.total_nodes} nodes and {result.structural_metrics.total_edges} authentic presynaptic-to-postsynaptic
                  connections from MaleCNS connectome weights.
                </div>
              </div>

              {/* Step 8 */}
              <div style={{ padding: 12, backgroundColor: 'var(--color-bg)', borderRadius: 6, borderLeft: '4px solid #06b6d4' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13 }}>Step 8: Transparent Dual-Criteria Ranking</strong>
                  <span className="badge badge-cyan">Computed Result</span>
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  Scored candidates deterministically using evidence tier weight + in-circuit synaptic connectivity.
                </div>
              </div>

              {/* Step 9 */}
              <div style={{ padding: 12, backgroundColor: 'var(--color-bg)', borderRadius: 6, borderLeft: '4px solid #f59e0b' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13 }}>Step 9: Scientific Caveats & Suggested Next Steps</strong>
                  <span className="badge badge-amber">Interpretation</span>
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  {result.limitations.join(' ')}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: COMPARATIVE ANALYSIS STUDIO ──────────────────────────── */}
      {activeTab === 'compare' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Comparison Setup Card */}
          <div
            className="card"
            style={{
              padding: 16,
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <GitCompare size={18} style={{ color: 'var(--color-primary)' }} />
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                Compare Two Completed NeuroQuery Investigations
              </h2>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
              Compare candidate overlap, rank shifts, strictly direction-sensitive edge differences (u → v ≠ v → u), and evidence coverage.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Investigation A (Baseline)
                </label>
                <select
                  id="select-compare-invest-a"
                  value={compareInvestAId}
                  onChange={(e) => setCompareInvestAId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--color-border)',
                    fontSize: 12,
                    backgroundColor: 'var(--color-bg)',
                  }}
                >
                  <option value={result.execution_id}>Current: {result.question} ({result.execution_id})</option>
                  {savedInvestigations.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name} ({inv.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Investigation B (Comparison Target)
                </label>
                <select
                  id="select-compare-invest-b"
                  value={compareInvestBId}
                  onChange={(e) => setCompareInvestBId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--color-border)',
                    fontSize: 12,
                    backgroundColor: 'var(--color-bg)',
                  }}
                >
                  <option value="">-- Choose an investigation to compare --</option>
                  <option value={result.execution_id}>Current: {result.question} ({result.execution_id})</option>
                  {savedInvestigations.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name} ({inv.id})
                    </option>
                  ))}
                </select>
              </div>

              <button
                id="btn-run-comparative-analysis"
                className="btn btn-primary"
                onClick={handleRunComparison}
                disabled={isComparing || !compareInvestBId}
                style={{ height: 38, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <GitCompare size={14} />
                <span>{isComparing ? 'Comparing...' : 'Run Comparative Analysis'}</span>
              </button>
            </div>

            {comparisonError && (
              <div style={{ marginTop: 12, padding: '8px 12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', borderRadius: 6, fontSize: 12 }}>
                {comparisonError}
              </div>
            )}
          </div>

          {/* Comparison Output Display */}
          {comparisonResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Compatibility Warnings (if any) */}
              {comparisonResult.compatibility_warnings.length > 0 && (
                <div
                  style={{
                    padding: 12,
                    backgroundColor: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid #f59e0b',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#d97706', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <AlertTriangle size={15} />
                    <span>Scientific Compatibility Warnings</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, color: '#b45309' }}>
                    {comparisonResult.compatibility_warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Side-by-Side Metadata Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="card" style={{ padding: 14, backgroundColor: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                  <span className="badge badge-blue">Investigation A</span>
                  <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>"{comparisonResult.investigation_a.question}"</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    Intent: <code>{comparisonResult.investigation_a.intent}</code> • Dataset: {comparisonResult.investigation_a.dataset_version}
                  </div>
                </div>

                <div className="card" style={{ padding: 14, backgroundColor: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                  <span className="badge badge-indigo">Investigation B</span>
                  <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>"{comparisonResult.investigation_b.question}"</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    Intent: <code>{comparisonResult.investigation_b.intent}</code> • Dataset: {comparisonResult.investigation_b.dataset_version}
                  </div>
                </div>
              </div>

              {/* Candidate Overlap Metrics */}
              <div className="card" style={{ padding: 16, backgroundColor: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Candidate Neuron Overlap</div>
                  <span className="badge badge-emerald">
                    Jaccard Similarity: {(comparisonResult.candidate_comparison.jaccard_similarity * 100).toFixed(1)}%
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center', marginBottom: 14 }}>
                  <div style={{ padding: 8, backgroundColor: 'var(--color-bg)', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Candidates in A</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{comparisonResult.candidate_comparison.candidates_a_count}</div>
                  </div>
                  <div style={{ padding: 8, backgroundColor: 'var(--color-bg)', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Candidates in B</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{comparisonResult.candidate_comparison.candidates_b_count}</div>
                  </div>
                  <div style={{ padding: 8, backgroundColor: 'var(--color-bg)', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Shared Candidates</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-primary)' }}>
                      {comparisonResult.candidate_comparison.shared_candidate_count}
                    </div>
                  </div>
                  <div style={{ padding: 8, backgroundColor: 'var(--color-bg)', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Unique (A / B)</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>
                      {comparisonResult.candidate_comparison.unique_a_candidate_count} / {comparisonResult.candidate_comparison.unique_b_candidate_count}
                    </div>
                  </div>
                </div>

                {/* Candidate Rank Shift Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                        <th style={{ padding: '6px 8px' }}>Body ID</th>
                        <th style={{ padding: '6px 8px' }}>Cell Type</th>
                        <th style={{ padding: '6px 8px' }}>Rank in A</th>
                        <th style={{ padding: '6px 8px' }}>Rank in B</th>
                        <th style={{ padding: '6px 8px' }}>Score A</th>
                        <th style={{ padding: '6px 8px' }}>Score B</th>
                        <th style={{ padding: '6px 8px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonResult.candidate_comparison.rank_deltas.map((r) => {
                        const status =
                          r.rank_a && r.rank_b ? 'Shared' : r.rank_a ? 'Unique to A' : 'Unique to B';
                        return (
                          <tr key={r.body_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{r.body_id}</td>
                            <td style={{ padding: '6px 8px' }}>{r.cell_type || '—'}</td>
                            <td style={{ padding: '6px 8px' }}>{r.rank_a ? `#${r.rank_a}` : '—'}</td>
                            <td style={{ padding: '6px 8px' }}>{r.rank_b ? `#${r.rank_b}` : '—'}</td>
                            <td style={{ padding: '6px 8px' }}>{r.score_a ?? '—'}</td>
                            <td style={{ padding: '6px 8px' }}>{r.score_b ?? '—'}</td>
                            <td style={{ padding: '6px 8px' }}>
                              <span
                                className={`badge ${
                                  status === 'Shared' ? 'badge-emerald' : status === 'Unique to A' ? 'badge-blue' : 'badge-indigo'
                                }`}
                              >
                                {status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Subgraph Topology Overlap */}
              <div className="card" style={{ padding: 16, backgroundColor: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Directed Graph Topology Overlap</div>
                  <span className="badge badge-emerald">
                    Edge Jaccard: {(comparisonResult.graph_comparison.edge_jaccard_similarity * 100).toFixed(1)}%
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
                  <div style={{ padding: 8, backgroundColor: 'var(--color-bg)', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Edges in A</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{comparisonResult.graph_comparison.edges_a_count}</div>
                  </div>
                  <div style={{ padding: 8, backgroundColor: 'var(--color-bg)', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Edges in B</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{comparisonResult.graph_comparison.edges_b_count}</div>
                  </div>
                  <div style={{ padding: 8, backgroundColor: 'var(--color-bg)', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Shared Directed Edges</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-primary)' }}>
                      {comparisonResult.graph_comparison.shared_edge_count}
                    </div>
                  </div>
                  <div style={{ padding: 8, backgroundColor: 'var(--color-bg)', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Unique Edges (A / B)</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>
                      {comparisonResult.graph_comparison.unique_a_edge_count} / {comparisonResult.graph_comparison.unique_b_edge_count}
                    </div>
                  </div>
                </div>

                {comparisonResult.graph_comparison.weight_deltas.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Weight Shifts on Shared Connections:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {comparisonResult.graph_comparison.weight_deltas.map((wd) => (
                        <div
                          key={wd.id}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: 'var(--color-bg)',
                            borderRadius: 4,
                            fontSize: 11,
                            fontFamily: 'monospace',
                          }}
                        >
                          #{wd.source} → #{wd.target}: A={wd.weight_a}, B={wd.weight_b} (Δ={wd.delta_weight})
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Saved Investigations List */}
          <div
            className="card"
            style={{
              padding: 16,
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Bookmark size={16} style={{ color: 'var(--color-primary)' }} />
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                Saved Investigations ({savedInvestigations.length})
              </h2>
            </div>

            {savedInvestigations.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {savedInvestigations.map((inv) => (
                  <div
                    key={inv.id}
                    style={{
                      padding: '10px 14px',
                      backgroundColor: 'var(--color-bg)',
                      borderRadius: 6,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{inv.name}</div>
                      <div style={{ color: 'var(--color-text-secondary)', fontSize: 11, marginTop: 2 }}>
                        ID: <code>{inv.id}</code> • Saved: {new Date(inv.saved_at).toLocaleString()} •{' '}
                        {inv.result.candidate_neurons.length} candidates, {inv.result.subgraph_nodes.length} nodes
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-xs btn-outline"
                        onClick={() => {
                          setCompareInvestBId(inv.id);
                        }}
                      >
                        Set as Target (B)
                      </button>
                      <button
                        className="btn btn-xs btn-outline"
                        onClick={() => deleteSavedInvestigation(inv.id)}
                        title="Delete saved investigation"
                        style={{ color: '#dc2626' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                No saved investigations yet. Click "Save Result" at the top to bookmark completed NeuroQuery investigations.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 4: ROBUSTNESS LAB (V10) ─────────────────────────────────── */}
      {activeTab === 'robustness' && (
        <RobustnessLab
          baselineResult={result}
          onSelectNeuron={onSelectNeuron}
          onReturnToExplorer={() => setActiveTab('explorer')}
        />
      )}

      {/* ── 4. Scientific Limitations & Boundaries Notice ─────────────────── */}
      <div
        className="card"
        style={{
          padding: 14,
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--color-text)' }}>
          <ShieldAlert size={14} style={{ color: '#d97706' }} />
          <span>Scientific Boundaries & Data Limitations</span>
        </div>
        <ul style={{ margin: '6px 0 0 18px', padding: 0, color: 'var(--color-text-secondary)' }}>
          {result.limitations.map((lim, idx) => (
            <li key={idx} style={{ marginBottom: 3 }}>
              {lim}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
