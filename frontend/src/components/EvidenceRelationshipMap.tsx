/**
 * EvidenceRelationshipMap — Cytoscape.js Relationship Visualizer (V11)
 *
 * Visually maps the research network connecting:
 * - Hypotheses
 * - Biological Concepts
 * - Target Neurons / Directed Edges
 * - Supporting vs Contradicting Evidence Records
 * - Planned / Executed Follow-Up Studies
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import cytoscape, { Core, ElementDefinition } from 'cytoscape';
import { ZoomIn, ZoomOut, Maximize2, Layers, Filter } from 'lucide-react';
import { HypothesisRecord } from '../types';

interface Props {
  hypothesis: HypothesisRecord;
  onSelectEntity?: (entity: { id: string; type: string; data: any }) => void;
}

const MAP_STYLES: cytoscape.StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'label': 'data(label)',
      'font-size': '11px',
      'font-family': 'Inter, system-ui, sans-serif',
      'color': '#f1f5f9',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': '120px',
      'border-width': 2,
    },
  },
  {
    selector: 'node[type = "hypothesis"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': '#4f46e5',
      'border-color': '#818cf8',
      'width': 130,
      'height': 60,
      'font-weight': 700,
      'font-size': '12px',
    } as any,
  },
  {
    selector: 'node[type = "concept"]',
    style: {
      'shape': 'ellipse',
      'background-color': '#059669',
      'border-color': '#34d399',
      'width': 85,
      'height': 85,
    } as any,
  },
  {
    selector: 'node[type = "neuron"]',
    style: {
      'shape': 'diamond',
      'background-color': '#d97706',
      'border-color': '#fbbf24',
      'width': 65,
      'height': 65,
    } as any,
  },
  {
    selector: 'node[type = "evidence_supporting"]',
    style: {
      'shape': 'rectangle',
      'background-color': '#166534',
      'border-color': '#22c55e',
      'width': 100,
      'height': 45,
    } as any,
  },
  {
    selector: 'node[type = "evidence_contradicting"]',
    style: {
      'shape': 'rectangle',
      'background-color': '#991b1b',
      'border-color': '#ef4444',
      'width': 100,
      'height': 45,
    } as any,
  },
  {
    selector: 'node[type = "evidence_contextual"]',
    style: {
      'shape': 'rectangle',
      'background-color': '#334155',
      'border-color': '#64748b',
      'width': 95,
      'height': 40,
    } as any,
  },
  {
    selector: 'node[type = "study"]',
    style: {
      'shape': 'hexagon',
      'background-color': '#7c3aed',
      'border-color': '#a78bfa',
      'width': 85,
      'height': 60,
    } as any,
  },
  {
    selector: 'edge',
    style: {
      'width': 2,
      'line-color': '#475569',
      'target-arrow-color': '#475569',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'label': 'data(label)',
      'font-size': '9px',
      'color': '#94a3b8',
      'text-background-opacity': 0.8,
      'text-background-color': '#0f172a',
      'text-background-padding': '2px',
    } as any,
  },
  {
    selector: 'edge[role = "supports"]',
    style: {
      'line-color': '#22c55e',
      'target-arrow-color': '#22c55e',
      'line-style': 'solid',
      'width': 2.5,
    } as any,
  },
  {
    selector: 'edge[role = "contradicts"]',
    style: {
      'line-color': '#ef4444',
      'target-arrow-color': '#ef4444',
      'line-style': 'dashed',
      'width': 2.5,
    } as any,
  },
  {
    selector: 'edge[role = "tests"]',
    style: {
      'line-color': '#a78bfa',
      'target-arrow-color': '#a78bfa',
      'line-style': 'dotted',
      'width': 2,
    } as any,
  },
  {
    selector: ':selected',
    style: {
      'border-color': '#38bdf8',
      'border-width': 4,
      'shadow-blur': 12,
      'shadow-color': '#38bdf8',
      'shadow-opacity': 0.8,
    } as any,
  },
];

export const EvidenceRelationshipMap: React.FC<Props> = ({ hypothesis, onSelectEntity }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [layoutMode, setLayoutMode] = useState<'cose' | 'concentric' | 'breadthfirst'>('cose');
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);
  const [filterSupporting, setFilterSupporting] = useState(true);
  const [filterContradicting, setFilterContradicting] = useState(true);
  const [filterStudies, setFilterStudies] = useState(true);

  // Build Cytoscape elements from hypothesis
  const buildElements = useCallback((): ElementDefinition[] => {
    const elements: ElementDefinition[] = [];

    // Central Hypothesis Node
    elements.push({
      data: {
        id: hypothesis.hypothesis_id,
        label: `[Hypothesis]\n${hypothesis.title.length > 25 ? hypothesis.title.slice(0, 25) + '…' : hypothesis.title}`,
        type: 'hypothesis',
        fullData: hypothesis,
      },
    });

    // Linked Concepts
    hypothesis.linked_concept_ids.forEach((cid) => {
      elements.push({
        data: {
          id: `concept-${cid}`,
          label: `Concept:\n${cid}`,
          type: 'concept',
          fullData: { concept_id: cid },
        },
      });
      elements.push({
        data: {
          id: `edge-${hypothesis.hypothesis_id}-concept-${cid}`,
          source: hypothesis.hypothesis_id,
          target: `concept-${cid}`,
          label: 'grounded in',
          role: 'grounded',
        },
      });
    });

    // Target Neurons
    hypothesis.target_neurons.forEach((bId) => {
      elements.push({
        data: {
          id: `neuron-${bId}`,
          label: `Neuron\n#${bId}`,
          type: 'neuron',
          fullData: { body_id: bId },
        },
      });
      elements.push({
        data: {
          id: `edge-${hypothesis.hypothesis_id}-neuron-${bId}`,
          source: hypothesis.hypothesis_id,
          target: `neuron-${bId}`,
          label: 'targets',
          role: 'targets',
        },
      });
    });

    // Evidence Records
    hypothesis.evidence_records.forEach((ev) => {
      if (ev.role === 'supporting' && !filterSupporting) return;
      if (ev.role === 'contradicting' && !filterContradicting) return;

      const evType =
        ev.role === 'supporting'
          ? 'evidence_supporting'
          : ev.role === 'contradicting'
          ? 'evidence_contradicting'
          : 'evidence_contextual';

      elements.push({
        data: {
          id: ev.evidence_id,
          label: `[${ev.evidence_type}]\n${ev.summary.length > 22 ? ev.summary.slice(0, 22) + '…' : ev.summary}`,
          type: evType,
          fullData: ev,
        },
      });

      elements.push({
        data: {
          id: `edge-${ev.evidence_id}-${hypothesis.hypothesis_id}`,
          source: ev.evidence_id,
          target: hypothesis.hypothesis_id,
          label: ev.role === 'supporting' ? 'supports' : ev.role === 'contradicting' ? 'contradicts' : 'context',
          role: ev.role,
        },
      });
    });

    // Follow-Up Studies
    if (filterStudies) {
      hypothesis.proposed_studies.forEach((st) => {
        elements.push({
          data: {
            id: st.study_id,
            label: `[Study: ${st.status}]\n${st.title.length > 20 ? st.title.slice(0, 20) + '…' : st.title}`,
            type: 'study',
            fullData: st,
          },
        });

        elements.push({
          data: {
            id: `edge-${st.study_id}-${hypothesis.hypothesis_id}`,
            source: st.study_id,
            target: hypothesis.hypothesis_id,
            label: 'tests',
            role: 'tests',
          },
        });
      });
    }

    return elements;
  }, [hypothesis, filterSupporting, filterContradicting, filterStudies]);

  // Initialize and update Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    if (!cyRef.current) {
      cyRef.current = cytoscape({
        container: containerRef.current,
        elements: buildElements(),
        style: MAP_STYLES,
        layout: { name: layoutMode, animate: false },
        minZoom: 0.2,
        maxZoom: 3.0,
      });

      cyRef.current.on('tap', 'node', (evt) => {
        const node = evt.target;
        const data = node.data();
        setSelectedEntity({ id: data.id, type: data.type, data: data.fullData });
        if (onSelectEntity) {
          onSelectEntity({ id: data.id, type: data.type, data: data.fullData });
        }
      });

      cyRef.current.on('tap', (evt) => {
        if (evt.target === cyRef.current) {
          setSelectedEntity(null);
        }
      });
    } else {
      const cy = cyRef.current;
      cy.elements().remove();
      cy.add(buildElements());
      cy.layout({ name: layoutMode, animate: false } as any).run();
      cy.fit(undefined, 30);
    }
  }, [buildElements, layoutMode, onSelectEntity]);

  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.25);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8);
  const handleFit = () => cyRef.current?.fit(undefined, 30);

  return (
    <div className="relative w-full h-[480px] bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex flex-col">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-slate-200">Evidence Relationship Topology</span>
          <span className="text-slate-500">({hypothesis.hypothesis_id})</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter Toggles */}
          <div className="flex items-center gap-1 text-[11px]">
            <Filter className="w-3 h-3 text-slate-400" />
            <label className="flex items-center gap-1 text-emerald-400 cursor-pointer">
              <input
                type="checkbox"
                checked={filterSupporting}
                onChange={(e) => setFilterSupporting(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-emerald-500"
              />
              Supporting
            </label>
            <label className="flex items-center gap-1 text-rose-400 cursor-pointer ml-1">
              <input
                type="checkbox"
                checked={filterContradicting}
                onChange={(e) => setFilterContradicting(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-rose-500"
              />
              Contradicting
            </label>
            <label className="flex items-center gap-1 text-purple-400 cursor-pointer ml-1">
              <input
                type="checkbox"
                checked={filterStudies}
                onChange={(e) => setFilterStudies(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-purple-500"
              />
              Studies
            </label>
          </div>

          {/* Layout Selector */}
          <select
            value={layoutMode}
            onChange={(e) => setLayoutMode(e.target.value as any)}
            className="bg-slate-800 text-slate-300 border border-slate-700 rounded px-2 py-0.5 text-xs focus:outline-none"
          >
            <option value="cose">Force-Directed (cose)</option>
            <option value="concentric">Concentric</option>
            <option value="breadthfirst">Hierarchical</option>
          </select>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-slate-800 rounded p-0.5 border border-slate-700">
            <button
              onClick={handleZoomIn}
              className="p-1 hover:bg-slate-700 text-slate-300 rounded"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-1 hover:bg-slate-700 text-slate-300 rounded"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleFit}
              className="p-1 hover:bg-slate-700 text-slate-300 rounded"
              title="Fit to Screen"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas */}
      <div className="relative flex-1 w-full h-full">
        <div ref={containerRef} className="w-full h-full" />

        {/* Selected Entity Inspector Overlay */}
        {selectedEntity && (
          <div className="absolute bottom-3 left-3 max-w-sm bg-slate-900/95 border border-slate-700 rounded-lg p-3 text-xs shadow-xl backdrop-blur-sm z-10">
            <div className="flex items-center justify-between pb-1 border-b border-slate-800 mb-1.5">
              <span className="font-semibold text-slate-200 capitalize">
                {selectedEntity.type.replace('_', ' ')}: {selectedEntity.id}
              </span>
              <button
                onClick={() => setSelectedEntity(null)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold"
              >
                ×
              </button>
            </div>
            {selectedEntity.type === 'hypothesis' && (
              <div className="space-y-1 text-slate-300">
                <p className="font-medium text-indigo-300">{selectedEntity.data.title}</p>
                <p className="text-[11px] text-slate-400 italic">"{selectedEntity.data.statement}"</p>
                <div className="flex gap-2 text-[10px] text-slate-400 mt-1">
                  <span>Status: <strong className="text-slate-200 uppercase">{selectedEntity.data.status}</strong></span>
                  <span>Evidence: {selectedEntity.data.evidence_records.length}</span>
                </div>
              </div>
            )}
            {selectedEntity.type.startsWith('evidence') && (
              <div className="space-y-1 text-slate-300">
                <p className="font-medium text-slate-200">{selectedEntity.data.summary}</p>
                <div className="text-[11px] text-slate-400">
                  <span>Type: <strong>{selectedEntity.data.evidence_type}</strong></span>
                  {selectedEntity.data.metric_name && (
                    <span className="ml-2">
                      {selectedEntity.data.metric_name}: <strong>{selectedEntity.data.metric_value}</strong>
                    </span>
                  )}
                </div>
                {selectedEntity.data.scientific_caveat && (
                  <p className="text-[10px] text-amber-400/90 italic mt-1">
                    Caveat: {selectedEntity.data.scientific_caveat}
                  </p>
                )}
              </div>
            )}
            {selectedEntity.type === 'study' && (
              <div className="space-y-1 text-slate-300">
                <p className="font-medium text-purple-300">{selectedEntity.data.title}</p>
                <p className="text-[11px] text-slate-400">{selectedEntity.data.objective}</p>
                <div className="flex gap-2 text-[10px] mt-1">
                  <span>Status: <strong className="uppercase">{selectedEntity.data.status}</strong></span>
                  {selectedEntity.data.evaluation_verdict && (
                    <span>Verdict: <strong className="text-emerald-400">{selectedEntity.data.evaluation_verdict}</strong></span>
                  )}
                </div>
              </div>
            )}
            {selectedEntity.type === 'neuron' && (
              <div className="text-slate-300 text-[11px]">
                Target Body ID: <strong>{selectedEntity.data.body_id}</strong>
              </div>
            )}
            {selectedEntity.type === 'concept' && (
              <div className="text-slate-300 text-[11px]">
                Biological Concept: <strong>{selectedEntity.data.concept_id}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-indigo-600 rounded-sm inline-block" />
            Hypothesis
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-emerald-700 rounded-full inline-block" />
            Concept
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-amber-600 rotate-45 inline-block" />
            Neuron
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-green-700 rounded-sm inline-block" />
            Supporting Ev.
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-red-700 rounded-sm inline-block" />
            Contradicting Ev.
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-purple-700 rounded-sm inline-block" />
            Study
          </span>
        </div>
        <div className="text-slate-500">Click node for details</div>
      </div>
    </div>
  );
};

