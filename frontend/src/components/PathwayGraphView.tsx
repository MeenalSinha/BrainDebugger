/**
 * PathwayGraphView — Interactive graph visualization for Pathways & Cascades using Cytoscape.js
 *
 * Renders:
 * 1. Directed pathway routes (Source -> Intermediate -> Target) with path highlighting.
 * 2. Downstream structural reachability cascades organized by graph distance hop layers.
 * Preserves exact edge direction and displays verified synaptic weights.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import cytoscape from 'cytoscape';
import type { Core, ElementDefinition, EventObject } from 'cytoscape';
import { ZoomIn, ZoomOut, Maximize2, RefreshCw } from 'lucide-react';
import type {
  PathwaySearchResponse,
  PathItem,
  DownstreamCascadeResponse,
} from '../types';

interface Props {
  mode: 'pathway' | 'cascade';
  pathwayData: PathwaySearchResponse | null;
  activePath: PathItem | null;
  cascadeData: DownstreamCascadeResponse | null;
  selectedBodyId: number | null;
  onSelectNode: (bodyId: number) => void;
  onSetSource?: (bodyId: number) => void;
  onSetTarget?: (bodyId: number) => void;
  onSetCascadeRoot?: (bodyId: number) => void;
}

const CY_STYLE: cytoscape.StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'background-color': '#0ea5e9',
      'label': 'data(label)',
      'font-size': '10px',
      'font-family': 'Inter, system-ui, sans-serif',
      'color': '#f8fafc',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 4,
      'width': 22,
      'height': 22,
      'border-width': 2,
      'border-color': '#38bdf8',
      'border-opacity': 0.8,
    },
  },
  {
    selector: 'node[role = "source"]',
    style: {
      'background-color': '#10b981',
      'border-color': '#34d399',
      'border-width': 3,
      'width': 28,
      'height': 28,
      'font-size': '11px',
      'font-weight': 700,
    } as never,
  },
  {
    selector: 'node[role = "target"]',
    style: {
      'background-color': '#f43f5e',
      'border-color': '#fb7185',
      'border-width': 3,
      'width': 28,
      'height': 28,
      'font-size': '11px',
      'font-weight': 700,
    } as never,
  },
  {
    selector: 'node[role = "hop0"]',
    style: {
      'background-color': '#10b981',
      'border-color': '#34d399',
      'border-width': 3.5,
      'width': 30,
      'height': 30,
      'font-weight': 700,
    } as never,
  },
  {
    selector: 'node[role = "hop1"]',
    style: {
      'background-color': '#06b6d4',
      'border-color': '#22d3ee',
      'width': 24,
      'height': 24,
    } as never,
  },
  {
    selector: 'node[role = "hop2"]',
    style: {
      'background-color': '#3b82f6',
      'border-color': '#60a5fa',
      'width': 20,
      'height': 20,
    } as never,
  },
  {
    selector: 'node[role = "hop3"]',
    style: {
      'background-color': '#8b5cf6',
      'border-color': '#a78bfa',
      'width': 18,
      'height': 18,
    } as never,
  },
  {
    selector: 'node[role = "hop4"]',
    style: {
      'background-color': '#f59e0b',
      'border-color': '#fbbf24',
      'width': 16,
      'height': 16,
    } as never,
  },
  {
    selector: 'node[is_active_path = "true"]',
    style: {
      'border-color': '#fbbf24',
      'border-width': 3,
      'border-opacity': 1,
    } as never,
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#38bdf8',
      'border-width': 4,
      'border-opacity': 1,
    },
  },
  {
    selector: 'edge',
    style: {
      'width': 1.8,
      'line-color': '#475569',
      'target-arrow-color': '#475569',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.9,
      'curve-style': 'bezier',
      'opacity': 0.6,
      'label': 'data(label)',
      'font-size': '9px',
      'color': '#94a3b8',
      'text-rotation': 'autorotate',
      'text-margin-y': -6,
    },
  },
  {
    selector: 'edge[is_active = "true"]',
    style: {
      'width': 3.2,
      'line-color': '#f59e0b',
      'target-arrow-color': '#f59e0b',
      'arrow-scale': 1.1,
      'opacity': 1,
      'color': '#fef08a',
      'font-weight': 700,
    } as never,
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': '#38bdf8',
      'target-arrow-color': '#38bdf8',
      'width': 3.5,
      'opacity': 1,
    },
  },
];

export const PathwayGraphView: React.FC<Props> = ({
  mode,
  pathwayData,
  activePath,
  cascadeData,
  selectedBodyId,
  onSelectNode,
  onSetSource,
  onSetTarget,
  onSetCascadeRoot,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [clickedNode, setClickedNode] = useState<{
    bodyId: number;
    label: string;
    type: string | null;
  } | null>(null);

  // Initialize Cytoscape core
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      style: CY_STYLE,
      elements: [],
      layout: { name: 'preset' },
      minZoom: 0.15,
      maxZoom: 4,
      wheelSensitivity: 0.25,
      boxSelectionEnabled: false,
    });
    cyRef.current = cy;

    cy.on('tap', 'node', (evt: EventObject) => {
      const node = evt.target;
      const bId = Number(node.data('body_id'));
      if (bId) {
        setClickedNode({
          bodyId: bId,
          label: node.data('label') || `#${bId}`,
          type: node.data('cell_type') || null,
        });
        onSelectNode(bId);
      }
    });

    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        setClickedNode(null);
      }
    });

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [onSelectNode]);

  // Build Elements for Pathway Mode
  const buildPathwayElements = useCallback((): ElementDefinition[] => {
    if (!pathwayData || pathwayData.paths.length === 0) return [];
    const elements: ElementDefinition[] = [];
    const nodeSet = new Map<number, { role: string; label: string; cellType: string | null; isActive: boolean }>();
    const activeEdgeKeys = new Set<string>();

    if (activePath) {
      for (const e of activePath.edges) {
        activeEdgeKeys.add(`${e.body_pre}_${e.body_post}`);
      }
    }

    const activeNodeIds = new Set(activePath ? activePath.nodes.map(n => n.body_id) : []);

    // Collect all nodes from all discovered paths
    for (const p of pathwayData.paths) {
      for (let i = 0; i < p.nodes.length; i++) {
        const n = p.nodes[i];
        if (!nodeSet.has(n.body_id)) {
          let role = 'intermediate';
          if (n.body_id === pathwayData.source_body_id) role = 'source';
          else if (n.body_id === pathwayData.target_body_id) role = 'target';
          const label = n.type ? `${n.type} (#${n.body_id})` : `#${n.body_id}`;
          nodeSet.set(n.body_id, {
            role,
            label,
            cellType: n.type,
            isActive: activeNodeIds.has(n.body_id),
          });
        }
      }
    }

    // Add Nodes
    for (const [bid, info] of nodeSet.entries()) {
      elements.push({
        group: 'nodes',
        data: {
          id: String(bid),
          body_id: bid,
          label: info.label,
          cell_type: info.cellType,
          role: info.role,
          is_active_path: info.isActive ? 'true' : 'false',
        },
      });
    }

    // Add Edges
    const edgeSet = new Set<string>();
    for (const p of pathwayData.paths) {
      for (const e of p.edges) {
        const key = `${e.body_pre}_${e.body_post}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          const isActive = activeEdgeKeys.has(key);
          elements.push({
            group: 'edges',
            data: {
              id: key,
              source: String(e.body_pre),
              target: String(e.body_post),
              weight: e.weight,
              label: `${e.weight} syn`,
              is_active: isActive ? 'true' : 'false',
            },
          });
        }
      }
    }

    return elements;
  }, [pathwayData, activePath]);

  // Build Elements for Cascade Mode
  const buildCascadeElements = useCallback((): ElementDefinition[] => {
    if (!cascadeData || cascadeData.nodes.length === 0) return [];
    const elements: ElementDefinition[] = [];
    const nodeIds = new Set<string>();

    // Nodes
    for (const n of cascadeData.nodes) {
      const sId = String(n.body_id);
      nodeIds.add(sId);
      const isRoot = n.body_id === cascadeData.source_body_id;
      const role = isRoot ? 'source' : `hop${Math.min(n.hop, 4)}`;
      const label = n.type ? `${n.type} (H${n.hop})` : `#${n.body_id} (H${n.hop})`;
      elements.push({
        group: 'nodes',
        data: {
          id: sId,
          body_id: n.body_id,
          label,
          cell_type: n.type,
          role,
          hop: n.hop,
        },
      });
    }

    // Edges — ensure both endpoints exist in nodes and deduplicate keys
    const edgeSet = new Set<string>();
    for (const e of cascadeData.edges) {
      const s = String(e.body_pre);
      const t = String(e.body_post);
      if (!nodeIds.has(s) || !nodeIds.has(t)) continue;
      const key = `${s}_${t}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      elements.push({
        group: 'edges',
        data: {
          id: key,
          source: s,
          target: t,
          weight: e.weight,
          label: `${e.weight} syn`,
          is_active: 'false',
        },
      });
    }

    return elements;
  }, [cascadeData]);

  // Update Cytoscape Graph
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    try {
      cy.elements().remove();
      const elems = mode === 'pathway' ? buildPathwayElements() : buildCascadeElements();

      if (elems.length === 0) {
        return;
      }

      cy.add(elems);

    // Layout
    if (mode === 'pathway') {
      cy.layout({
        name: 'breadthfirst',
        directed: true,
        roots: pathwayData ? [String(pathwayData.source_body_id)] : undefined,
        padding: 50,
        spacingFactor: 1.4,
        animate: false,
      } as cytoscape.BreadthFirstLayoutOptions).run();
    } else {
      cy.layout({
        name: 'breadthfirst',
        directed: true,
        roots: cascadeData ? [String(cascadeData.source_body_id)] : undefined,
        padding: 50,
        spacingFactor: 1.25,
        animate: false,
      } as cytoscape.BreadthFirstLayoutOptions).run();
    }

    cy.fit(undefined, 40);
    } catch (err) {
      console.error('Cytoscape graph rendering error:', err);
    }
  }, [mode, buildPathwayElements, buildCascadeElements, pathwayData, cascadeData]);

  // Synchronize selection highlight
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().unselect();
    if (selectedBodyId) {
      const target = cy.getElementById(String(selectedBodyId));
      if (target.length > 0) {
        target.select();
      }
    }
  }, [selectedBodyId]);

  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.3);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() / 1.3);
  const handleFit = () => cyRef.current?.fit(undefined, 40);
  const handleResetLayout = () => {
    const cy = cyRef.current;
    if (!cy) return;
    const rootId = mode === 'pathway' ? pathwayData?.source_body_id : cascadeData?.source_body_id;
    cy.layout({
      name: 'breadthfirst',
      directed: true,
      roots: rootId ? [String(rootId)] : undefined,
      padding: 50,
      spacingFactor: 1.3,
      animate: true,
      animationDuration: 300,
    } as cytoscape.BreadthFirstLayoutOptions).run();
  };

  return (
    <div className="pathway-graph-container" style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Cytoscape Canvas */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Graph Toolbar */}
      <div className="graph-toolbar" style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex', gap: 6 }}>
        <button className="btn btn-sm btn-icon" onClick={handleZoomIn} title="Zoom In">
          <ZoomIn size={15} />
        </button>
        <button className="btn btn-sm btn-icon" onClick={handleZoomOut} title="Zoom Out">
          <ZoomOut size={15} />
        </button>
        <button className="btn btn-sm btn-icon" onClick={handleFit} title="Fit to Viewport">
          <Maximize2 size={15} />
        </button>
        <button className="btn btn-sm btn-icon" onClick={handleResetLayout} title="Rearrange Layout">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Selected Node Action Card */}
      {clickedNode && (
        <div
          className="graph-node-action-popover"
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 15,
            background: 'var(--color-surface, #1e293b)',
            border: '1px solid var(--color-border, #334155)',
            borderRadius: 8,
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary, #f8fafc)' }}>
              {clickedNode.label}
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted, #94a3b8)' }}>
              Body #{clickedNode.bodyId}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {onSetSource && (
              <button
                className="btn btn-xs btn-outline"
                onClick={() => onSetSource(clickedNode.bodyId)}
                title="Use as Pathway Source"
              >
                Set Source
              </button>
            )}
            {onSetTarget && (
              <button
                className="btn btn-xs btn-outline"
                onClick={() => onSetTarget(clickedNode.bodyId)}
                title="Use as Pathway Target"
              >
                Set Target
              </button>
            )}
            {onSetCascadeRoot && (
              <button
                className="btn btn-xs btn-outline"
                onClick={() => onSetCascadeRoot(clickedNode.bodyId)}
                title="Analyze Downstream Cascade"
              >
                Cascade Root
              </button>
            )}
          </div>
        </div>
      )}

      {/* Graph Legend */}
      <div
        className="graph-legend"
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          zIndex: 10,
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(4px)',
          border: '1px solid #334155',
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 11,
          color: '#94a3b8',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {mode === 'pathway' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#10b981' }} />
              <span>Source Neuron</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#0ea5e9' }} />
              <span>Intermediate Node</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#f43f5e' }} />
              <span>Target Neuron</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 2, backgroundColor: '#f59e0b' }} />
              <span>Active Path Edge</span>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#10b981' }} />
              <span>Hop 0 (Root)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#06b6d4' }} />
              <span>Hop 1 (Direct)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#3b82f6' }} />
              <span>Hop 2</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#8b5cf6' }} />
              <span>Hop 3+</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
