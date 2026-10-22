/**
 * ConnectomeView — Central graph visualization using Cytoscape.js
 *
 * Renders directed graph from real API data.
 * All nodes and edges come from the backend; no hardcoded graph data.
 * Edge direction: source = body_pre (presynaptic), target = body_post (postsynaptic).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import type { Core, ElementDefinition, EventObject } from 'cytoscape';
import { ZoomIn, ZoomOut, Maximize2, RefreshCw, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { api, ApiClientError } from '../api';
import type { AsyncState, GraphEdge, GraphResponse } from '../types';

interface Props {
  selectedBodyId: number | null;
  onSelectNode: (bodyId: number) => void;
}

interface SelectedEdge {
  id: string;
  body_pre: number;
  body_post: number;
  weight: number;
  type_pre: string | null;
  type_post: string | null;
}

const CY_STYLE: cytoscape.StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'background-color': '#64748b',
      'label': 'data(label)',
      'font-size': '9px',
      'font-family': 'Inter, system-ui, sans-serif',
      'color': '#1a202c',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 3,
      'width': 18,
      'height': 18,
      'border-width': 1.5,
      'border-color': '#cbd5e1',
      'border-opacity': 0.6,
    },
  },
  {
    selector: 'node[is_selected = "true"]',
    style: {
      'background-color': '#2563eb',
      'border-color': '#1d4ed8',
      'border-width': 2.5,
      'border-opacity': 1,
      'width': 24,
      'height': 24,
      'font-size': '10px',
      'font-weight': 700,
    } as never,
  },
  {
    selector: 'node:selected',
    style: {
      'background-color': '#1d4ed8',
      'border-color': '#1e3a8a',
      'border-width': 3,
      'border-opacity': 1,
    },
  },
  {
    selector: 'edge',
    style: {
      'width': 1.5,
      'line-color': '#94a3b8',
      'target-arrow-color': '#94a3b8',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.8,
      'curve-style': 'bezier',
      'opacity': 0.7,
    },
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': '#2563eb',
      'target-arrow-color': '#2563eb',
      'width': 2.5,
      'opacity': 1,
    },
  },
];

function buildElements(graph: GraphResponse): ElementDefinition[] {
  const nodes: ElementDefinition[] = graph.nodes.map(n => ({
    group: 'nodes' as const,
    data: {
      id: n.id,
      label: n.label,
      body_id: n.body_id,
      cell_type: n.cell_type,
      instance: n.instance,
      superclass: n.superclass,
      status: n.status,
      consensus_nt: n.consensus_nt,
      is_selected: n.is_selected ? 'true' : 'false',
    },
  }));

  const edges: ElementDefinition[] = graph.edges.map(e => ({
    group: 'edges' as const,
    data: {
      id: e.id,
      source: e.source,
      target: e.target,
      body_pre: e.body_pre,
      body_post: e.body_post,
      weight: e.weight,
      type_pre: e.type_pre,
      type_post: e.type_post,
    },
  }));

  return [...nodes, ...edges];
}

export function ConnectomeView({ selectedBodyId, onSelectNode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [graphState, setGraphState] = useState<AsyncState<GraphResponse>>({ status: 'idle' });
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdge | null>(null);
  const [maxNodes, setMaxNodes] = useState(60);
  const currentBodyIdRef = useRef<number | null>(null);

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      style: CY_STYLE,
      layout: { name: 'cose', animate: false } as never,
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
    });

    cy.on('tap', 'node', (e: EventObject) => {
      const bid = e.target.data('body_id') as number;
      if (bid) onSelectNode(bid);
    });

    cy.on('tap', 'edge', (e: EventObject) => {
      setSelectedEdge({
        id: e.target.data('id'),
        body_pre: e.target.data('body_pre'),
        body_post: e.target.data('body_post'),
        weight: e.target.data('weight'),
        type_pre: e.target.data('type_pre'),
        type_post: e.target.data('type_post'),
      });
    });

    cy.on('tap', (e: EventObject) => {
      if (e.target === cy) setSelectedEdge(null);
    });

    cyRef.current = cy;
    return () => { cy.destroy(); cyRef.current = null; };
  }, [onSelectNode]);

  // Load neighborhood when selectedBodyId changes
  useEffect(() => {
    if (selectedBodyId === null) {
      setGraphState({ status: 'idle' });
      cyRef.current?.elements().remove();
      return;
    }

    let cancelled = false;
    currentBodyIdRef.current = selectedBodyId;
    setGraphState({ status: 'loading' });
    setSelectedEdge(null);

    api.getNeighborhood({ bodyId: selectedBodyId, maxNodes })
      .then(g => {
        if (cancelled) return;
        setGraphState({ status: 'success', data: g });
        // Update graph
        const cy = cyRef.current;
        if (!cy) return;
        const elements = buildElements(g);
        cy.elements().remove();
        cy.add(elements);
        cy.layout({
          name: 'cose',
          animate: false,
          nodeRepulsion: () => 8000,
          idealEdgeLength: () => 80,
        } as never).run();
        cy.fit(undefined, 32);
      })
      .catch(err => {
        if (cancelled) return;
        const msg = err instanceof ApiClientError ? err.detail : 'Failed to load graph.';
        setGraphState({ status: 'error', message: msg });
      });

    return () => { cancelled = true; };
  }, [selectedBodyId, maxNodes]);

  const expandNeighbors = useCallback(async (direction: 'incoming' | 'outgoing') => {
    if (!selectedBodyId) return;
    try {
      const resp = await api.getConnections({ bodyId: selectedBodyId, direction, limit: 30 });
      const cy = cyRef.current;
      if (!cy) return;

      // Add partner nodes that aren't already in the graph
      const newBodyIds = resp.connections.map(c =>
        direction === 'outgoing' ? c.body_post : c.body_pre,
      );

      for (const bid of newBodyIds) {
        if (!cy.$id(String(bid)).length) {
          // Fetch metadata for the new node
          try {
            const n = await api.getNeuron(bid);
            cy.add({
              group: 'nodes',
              data: {
                id: String(bid),
                label: n.cell_type ?? n.instance ?? String(bid),
                body_id: bid,
                cell_type: n.cell_type,
                instance: n.instance,
                superclass: n.superclass,
                status: n.status,
                consensus_nt: n.consensus_nt,
                is_selected: 'false',
              },
            });
          } catch {
            cy.add({
              group: 'nodes',
              data: { id: String(bid), label: String(bid), body_id: bid, is_selected: 'false' },
            });
          }
        }
      }

      // Add edges
      for (const c of resp.connections) {
        const eid = `${c.body_pre}_${c.body_post}`;
        if (!cy.$id(eid).length) {
          cy.add({
            group: 'edges',
            data: {
              id: eid,
              source: String(c.body_pre),
              target: String(c.body_post),
              body_pre: c.body_pre,
              body_post: c.body_post,
              weight: c.weight,
              type_pre: c.type_pre,
              type_post: c.type_post,
            },
          });
        }
      }

      cy.layout({ name: 'cose', animate: true, randomize: false } as never).run();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.detail : 'Expansion failed.';
      alert(`Expansion failed: ${msg}`);
    }
  }, [selectedBodyId]);

  const graphData = graphState.status === 'success' ? graphState.data : null;

  return (
    <div className="graph-container" style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
      {/* Graph Canvas */}
      <div ref={containerRef} id="cy" style={{ flex: 1 }} />

      {/* Graph Controls */}
      <div className="graph-controls">
        <button id="btn-zoom-in" className="btn btn-sm" title="Zoom In" onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.3)}>
          <ZoomIn size={13} />
        </button>
        <button id="btn-zoom-out" className="btn btn-sm" title="Zoom Out" onClick={() => cyRef.current?.zoom(cyRef.current.zoom() / 1.3)}>
          <ZoomOut size={13} />
        </button>
        <button id="btn-fit" className="btn btn-sm" title="Fit to view" onClick={() => cyRef.current?.fit(undefined, 32)}>
          <Maximize2 size={13} />
        </button>
        {selectedBodyId !== null && (
          <>
            <button id="btn-reload" className="btn btn-sm" title="Reload graph" onClick={() => {
              if (selectedBodyId) {
                setGraphState({ status: 'loading' });
                api.getNeighborhood({ bodyId: selectedBodyId, maxNodes })
                  .then(g => {
                    setGraphState({ status: 'success', data: g });
                    const cy = cyRef.current;
                    if (!cy) return;
                    cy.elements().remove();
                    cy.add(buildElements(g));
                    cy.layout({ name: 'cose', animate: false } as never).run();
                    cy.fit(undefined, 32);
                  })
                  .catch(err => setGraphState({ status: 'error', message: String(err) }));
              }
            }}>
              <RefreshCw size={13} />
            </button>
            <button id="btn-expand-in" className="btn btn-sm" title="Expand incoming partners" onClick={() => expandNeighbors('incoming')}>
              <ArrowDownLeft size={13} />
            </button>
            <button id="btn-expand-out" className="btn btn-sm" title="Expand outgoing partners" onClick={() => expandNeighbors('outgoing')}>
              <ArrowUpRight size={13} />
            </button>
          </>
        )}
      </div>

      {/* Loading / Error overlays */}
      {graphState.status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(248,249,251,0.8)', pointerEvents: 'none', zIndex: 3,
        }}>
          <div className="state-box">
            <span style={{ fontSize: 22 }}>⟳</span>
            <span className="loading-dots">Loading graph</span>
          </div>
        </div>
      )}

      {graphState.status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(248,249,251,0.9)', zIndex: 3,
        }}>
          <div className="state-box">
            <span style={{ fontSize: 22, color: 'var(--color-error)' }}>✕</span>
            <span className="state-box__title" style={{ color: 'var(--color-error)' }}>Graph load failed</span>
            <span style={{ fontSize: 12 }}>{graphState.message}</span>
            <button id="btn-retry-graph" className="btn btn-sm"
              onClick={() => selectedBodyId && api.getNeighborhood({ bodyId: selectedBodyId, maxNodes })
                .then(g => {
                  setGraphState({ status: 'success', data: g });
                  const cy = cyRef.current; if (!cy) return;
                  cy.elements().remove(); cy.add(buildElements(g));
                  cy.layout({ name: 'cose', animate: false } as never).run();
                  cy.fit(undefined, 32);
                }).catch(e => setGraphState({ status: 'error', message: String(e) }))
              }
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {graphState.status === 'idle' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 2,
        }}>
          <div className="state-box">
            <span style={{ fontSize: 36, opacity: 0.18 }}>⬡</span>
            <span className="state-box__title" style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>
              Select a neuron to view its local network
            </span>
          </div>
        </div>
      )}

      {/* Selected edge info */}
      {selectedEdge && (
        <div style={{
          position: 'absolute', top: 12, left: 12,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 12px',
          fontSize: 12,
          zIndex: 5,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          minWidth: 200,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--color-text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Edge</div>
          <div className="mono" style={{ marginBottom: 3 }}>
            #{selectedEdge.body_pre} <span style={{ color: 'var(--color-primary)' }}>→</span> #{selectedEdge.body_post}
          </div>
          <div style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
            {selectedEdge.type_pre ?? '—'} → {selectedEdge.type_post ?? '—'}
          </div>
          <div style={{ marginTop: 4, fontWeight: 700 }}>
            Weight: <span className="mono">{selectedEdge.weight.toLocaleString()}</span>
          </div>
          <button
            style={{ position: 'absolute', top: 6, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 14 }}
            onClick={() => setSelectedEdge(null)}
            aria-label="Close edge info"
          >×</button>
        </div>
      )}

      {/* Scope bar */}
      <div className="graph-scope-bar">
        <span>
          Dataset: <strong>{graphData?.dataset ?? 'male-cns:v1.0'}</strong>
          {graphData?.dataset_version ? ` (${graphData.dataset_version})` : ''}
        </span>
        {graphData && (
          <>
            <span>Nodes: <strong>{graphData.node_count}</strong></span>
            <span>Edges: <strong>{graphData.edge_count}</strong></span>
            {selectedBodyId && <span>Center: <strong className="mono">#{selectedBodyId}</strong></span>}
            {graphData.is_partial && (
              <span className="partial-badge">⚠ Partial — limit reached</span>
            )}
          </>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <label htmlFor="max-nodes-input" style={{ fontSize: 11 }}>Max nodes:</label>
          <input
            id="max-nodes-input"
            type="number"
            min={10}
            max={150}
            value={maxNodes}
            onChange={e => setMaxNodes(Math.min(150, Math.max(10, Number(e.target.value))))}
            style={{
              width: 52, padding: '2px 5px', border: '1px solid var(--color-border)',
              borderRadius: 3, fontSize: 11, background: 'var(--color-surface)',
            }}
            aria-label="Maximum graph nodes"
          />
        </div>
      </div>
    </div>
  );
}
