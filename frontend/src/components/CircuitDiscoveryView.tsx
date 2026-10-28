/**
 * BrainDebugger — NeuroQuery Circuit Discovery View (V8)
 *
 * Interactive visual exploration of evidence-grounded neural circuits:
 * - Renders authentic directed neural subgraphs using Cytoscape.js.
 * - Displays transparent candidate rankings (evidence tier + in-circuit synaptic connectivity).
 * - Surfaces computed graph metrics, verified evidence citations with DOIs,
 *   and explicit scientific limitations (traced-only subset, structural vs physiological).
 * - Integrates directly with Neuron Inspector, Pathway Tracer, and Perturbation Lab.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
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
} from 'lucide-react';
import type {
  CircuitDiscoveryResult,
  DiscoveredCandidateNeuron,
  CircuitSubgraphNode,
  CircuitSubgraphEdge,
} from '../types';

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

  const [selectedBodyId, setSelectedBodyId] = useState<number | null>(
    result.candidate_neurons.length > 0 ? result.candidate_neurons[0].body_id : null
  );
  const [selectedEdge, setSelectedEdge] = useState<CircuitSubgraphEdge | null>(null);

  // Initialize and update Cytoscape graph
  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up previous instance
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    if (result.subgraph_nodes.length === 0) return;

    const elements: cytoscape.ElementDefinition[] = [
      ...result.subgraph_nodes.map((node) => ({
        data: {
          id: String(node.body_id),
          label: node.cell_type || (node.instance ? String(node.instance) : `#${node.body_id}`),
          body_id: node.body_id,
          cell_type: node.cell_type || '',
          instance: node.instance || '',
          is_candidate: node.is_candidate ? 'true' : 'false',
          evidence_status: node.evidence_status || 'partner',
          degree: node.degree,
          total_weight: node.total_weight,
          is_selected: node.body_id === selectedBodyId ? 'true' : 'false',
        },
      })),
      ...result.subgraph_edges.map((edge) => ({
        data: {
          id: edge.id,
          source: String(edge.source),
          target: String(edge.target),
          weight: edge.weight,
          label: String(edge.weight),
          is_inter_candidate: edge.is_inter_candidate ? 'true' : 'false',
        },
      })),
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
            selector: 'node[is_selected = "true"]',
            style: {
              'background-color': '#f59e0b',
              'border-color': '#b45309',
              'border-width': 3.5,
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
            selector: 'edge:selected',
            style: {
              'line-color': '#f59e0b',
              'target-arrow-color': '#f59e0b',
              'width': 4,
              'opacity': 1,
            },
          },
        ],
        layout: {
          name: 'cose',
          animate: false,
          nodeRepulsion: () => 8000,
          idealEdgeLength: () => 60,
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
        const edgeData = evt.target.data();
        const matched = result.subgraph_edges.find((e) => e.id === edgeData.id);
        if (matched) {
          setSelectedEdge(matched);
        }
      });

      cyRef.current = cy;
    } catch (e) {
      // In headless environments (such as jsdom without canvas), cytoscape warns but UI gracefully falls back
      console.warn('Cytoscape canvas initialization skipped (e.g. headless test environment):', e);
    }

    return () => {
      if (cyRef.current) {
        try {
          cyRef.current.destroy();
        } catch (_) {}
        cyRef.current = null;
      }
    };
  }, [result, onSelectNeuron]);


  // Handle node selection from table
  const handleSelectCandidate = useCallback((bid: number) => {
    setSelectedBodyId(bid);
    setSelectedEdge(null);
    onSelectNeuron?.(bid);

    if (cyRef.current) {
      cyRef.current.nodes().forEach((n) => {
        n.data('is_selected', n.data('body_id') === bid ? 'true' : 'false');
      });
      const targetNode = cyRef.current.$(`node[body_id = ${bid}]`);
      if (targetNode.length > 0) {
        cyRef.current.animate({
          center: { eles: targetNode },
          zoom: Math.max(1.5, cyRef.current.zoom()),
          duration: 350,
        });
      }
    }
  }, [onSelectNeuron]);

  // Export discovery result to JSON
  const handleExportResult = useCallback(() => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `circuit-discovery-${result.execution_id}.json`;
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
      {/* ── 1. Summary Bar ──────────────────────────────────────────────── */}
      <div
        className="card"
        style={{
          padding: '14px 18px',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              backgroundColor: 'rgba(124, 58, 237, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#7c3aed',
            }}
          >
            <Network size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)' }}>
              Discovered Neural Circuit
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', gap: 8 }}>
              <span>Execution ID: <strong style={{ fontFamily: 'monospace' }}>{result.execution_id}</strong></span>
              <span>•</span>
              <span>Duration: <strong>{result.execution_duration_ms}ms</strong></span>
              <span>•</span>
              <span>Dataset: <strong>{result.dataset_version}</strong></span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className={`badge ${
              result.execution_status === 'completed'
                ? 'badge-emerald'
                : result.execution_status === 'partially_completed'
                ? 'badge-yellow'
                : 'badge-rose'
            }`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textTransform: 'capitalize' }}
          >
            {result.execution_status === 'completed' ? (
              <CheckCircle2 size={12} />
            ) : (
              <AlertTriangle size={12} />
            )}
            {result.execution_status.replace('_', ' ')}
          </span>

          <button
            id="btn-export-discovery-json"
            className="btn btn-sm btn-outline"
            onClick={handleExportResult}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            title="Export full reproducible investigation result as JSON"
          >
            <Download size={14} />
            <span>Export Result JSON</span>
          </button>

          {onResetExecution && (
            <button
              className="btn btn-sm btn-outline"
              onClick={onResetExecution}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              title="Return to planning view"
            >
              <RotateCcw size={14} />
              <span>Back to Plan</span>
            </button>
          )}
        </div>
      </div>

      {/* Partial Result Warning Banner */}
      {result.is_partial && result.partial_reason && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 6,
            fontSize: 12,
            color: '#d97706',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertTriangle size={16} />
          <span>
            <strong>Bounded Subgraph Notice:</strong> {result.partial_reason}
          </span>
        </div>
      )}

      {/* ── 2. Graph & Inspector Actions Grid ────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 16 }}>
        {/* Cytoscape Circuit View */}
        <div
          className="card"
          style={{
            height: 480,
            position: 'relative',
            backgroundColor: '#ffffff',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          {result.subgraph_nodes.length > 0 ? (
            <>
              <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

              {/* Graph Toolbar Controls */}
              <div
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  display: 'flex',
                  gap: 6,
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  padding: 4,
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
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
                  onClick={() => cyRef.current?.layout({ name: 'cose', animate: true }).run()}
                  title="Re-layout Graph"
                >
                  <RefreshCw size={14} />
                </button>
              </div>

              {/* Graph Legend */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 10,
                  left: 10,
                  display: 'flex',
                  gap: 12,
                  backgroundColor: 'rgba(255, 255, 255, 0.92)',
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  fontSize: 11,
                  color: 'var(--color-text-secondary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#8b5cf6' }} />
                  <span>Candidate Neuron</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#64748b' }} />
                  <span>Connected Partner</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                  <span>Selected</span>
                </div>
              </div>
            </>
          ) : (
            <div
              style={{
                display: 'flex',
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-secondary)',
                fontSize: 13,
              }}
            >
              No active graph elements to display for this investigation category.
            </div>
          )}
        </div>

        {/* Selected Element & Tool Handoff Panel */}
        <div
          className="card"
          style={{
            padding: 16,
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)', marginBottom: 10 }}>
              Selected Circuit Element
            </div>

            {selectedBodyId ? (
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>NEURON BODY ID:</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: '#7c3aed' }}>
                  {selectedBodyId}
                </div>

                {(() => {
                  const node = result.subgraph_nodes.find((n) => n.body_id === selectedBodyId);
                  const cand = result.candidate_neurons.find((c) => c.body_id === selectedBodyId);
                  return (
                    <div style={{ marginTop: 8, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div>Type: <strong>{node?.cell_type || '(unspecified)'}</strong></div>
                      <div>Instance: <strong>{node?.instance || '(none)'}</strong></div>
                      <div>Superclass: <strong>{node?.superclass || '(none)'}</strong></div>
                      <div>NT Prediction: <strong>{node?.consensus_nt || '(none)'}</strong></div>
                      <div>In-Circuit Degree: <strong>{node?.degree || 0} connections</strong></div>
                      <div>In-Circuit Weight: <strong>{node?.total_weight || 0} synapses</strong></div>
                      {cand && (
                        <div style={{ marginTop: 6, padding: '6px 8px', backgroundColor: 'var(--color-bg)', borderRadius: 4 }}>
                          <span style={{ fontWeight: 600, color: '#7c3aed' }}>{cand.evidence_tier}</span>
                          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                            {cand.explanation}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : selectedEdge ? (
              <div style={{ fontSize: 12 }}>
                <div style={{ color: 'var(--color-text-secondary)' }}>DIRECTED CONNECTION:</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                  {selectedEdge.source} → {selectedEdge.target}
                </div>
                <div style={{ marginTop: 8 }}>
                  Recorded Weight: <strong>{selectedEdge.weight} synapses</strong>
                </div>
                <div>
                  Inter-candidate: <strong>{selectedEdge.is_inter_candidate ? 'Yes' : 'No'}</strong>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                Click any neuron node or synaptic edge in the circuit graph to inspect its properties.
              </div>
            )}
          </div>

          {/* Deep-link Action Buttons */}
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
              INVESTIGATION ACTIONS:
            </span>

            {selectedBodyId && (
              <button
                className="btn btn-sm btn-primary"
                onClick={() => onNavigateToExplorer?.(selectedBodyId)}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <span>Inspect in Neuron Inspector</span>
                <ArrowRight size={14} />
              </button>
            )}

            {result.candidate_neurons.length >= 2 && onNavigateToPathway && (
              <button
                className="btn btn-sm btn-outline"
                onClick={() =>
                  onNavigateToPathway(
                    result.candidate_neurons[0].body_id,
                    result.candidate_neurons[1].body_id
                  )
                }
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <span>Trace Pathway (Top 2 Candidates)</span>
                <ArrowRight size={14} />
              </button>
            )}

            {selectedBodyId && onNavigateToPerturbation && (
              <button
                className="btn btn-sm btn-outline"
                onClick={() => onNavigateToPerturbation(selectedBodyId)}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <span>Test Lesion in Perturbation Lab</span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. Candidate Neurons Transparent Rankings Table ──────────────── */}
      {result.candidate_neurons.length > 0 && (
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
            <Award size={18} style={{ color: '#7c3aed' }} />
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
              Transparent Candidate Neuron Rankings
            </h2>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Body ID</th>
                  <th>Type</th>
                  <th>Instance</th>
                  <th>Evidence Tier</th>
                  <th>In-Degree</th>
                  <th>Out-Degree</th>
                  <th>Total Weight</th>
                  <th>Score</th>
                  <th>Explanation & Provenance</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.candidate_neurons.map((cand, idx) => (
                  <tr
                    key={cand.body_id}
                    style={{
                      backgroundColor:
                        selectedBodyId === cand.body_id ? 'rgba(124, 58, 237, 0.08)' : undefined,
                    }}
                  >
                    <td style={{ fontWeight: 700, color: '#7c3aed' }}>#{idx + 1}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{cand.body_id}</td>
                    <td>{cand.cell_type || '—'}</td>
                    <td>{cand.instance || '—'}</td>
                    <td>
                      <span
                        className={`badge ${
                          cand.evidence_tier.includes('Verified')
                            ? 'badge-emerald'
                            : cand.evidence_tier.includes('Partially')
                            ? 'badge-blue'
                            : 'badge-amber'
                        }`}
                        style={{ fontSize: 10 }}
                      >
                        {cand.evidence_tier}
                      </span>
                    </td>
                    <td>{cand.subgraph_in_degree}</td>
                    <td>{cand.subgraph_out_degree}</td>
                    <td><strong>{cand.subgraph_total_weight}</strong></td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{cand.ranking_score}</td>
                    <td style={{ fontSize: 11, color: 'var(--color-text-secondary)', maxWidth: 320 }}>
                      {cand.explanation}
                    </td>
                    <td>
                      <button
                        className="btn btn-xs btn-outline"
                        onClick={() => handleSelectCandidate(cand.body_id)}
                      >
                        Focus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 4. Structural Metrics & Scientific Provenance Grid ─────────────── */}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
            <div style={{ padding: '8px 10px', backgroundColor: 'var(--color-bg)', borderRadius: 6 }}>
              <div style={{ color: 'var(--color-text-secondary)' }}>Total Nodes:</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{result.structural_metrics.total_nodes}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                {result.structural_metrics.candidate_nodes_count} candidates, {result.structural_metrics.partner_nodes_count} partners
              </div>
            </div>

            <div style={{ padding: '8px 10px', backgroundColor: 'var(--color-bg)', borderRadius: 6 }}>
              <div style={{ color: 'var(--color-text-secondary)' }}>Directed Connections:</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{result.structural_metrics.total_edges}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                Density: {result.structural_metrics.density}
              </div>
            </div>

            <div style={{ padding: '8px 10px', backgroundColor: 'var(--color-bg)', borderRadius: 6 }}>
              <div style={{ color: 'var(--color-text-secondary)' }}>Average Synaptic Weight:</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{result.structural_metrics.average_weight}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                Max weight: {result.structural_metrics.max_weight}
              </div>
            </div>

            <div style={{ padding: '8px 10px', backgroundColor: 'var(--color-bg)', borderRadius: 6 }}>
              <div style={{ color: 'var(--color-text-secondary)' }}>Top Hub Neuron:</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace' }}>
                {result.structural_metrics.top_hub_body_id || '(none)'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                Components: {result.structural_metrics.connected_components}
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

      {/* ── 5. Scientific Limitations & Boundaries Notice ─────────────────── */}
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
