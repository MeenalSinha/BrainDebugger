import React from 'react';
import cytoscape from 'cytoscape';
import { Network } from 'lucide-react';
import type { Connection, Neighborhood } from '../../types/connectome';

type GraphViewProps = {
  neighborhood: Neighborhood | null;
  selectedId: string | null;
  onSelectNeuron: (id: string) => void;
  onSelectConnection: (edge: Connection) => void;
};

export function GraphView({ neighborhood, selectedId, onSelectNeuron, onSelectConnection }: GraphViewProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const cyRef = React.useRef<cytoscape.Core | null>(null);

  React.useEffect(() => {
    if (!containerRef.current || !neighborhood) return;
    cyRef.current?.destroy();
    const cy = cytoscape({
      container: containerRef.current,
      elements: [
        ...neighborhood.nodes.map((node) => ({ data: { id: node.id, label: node.cellType || node.id, selected: node.id === selectedId } })),
        ...neighborhood.edges.map((edge) => ({ data: { id: `${edge.source}-${edge.target}`, source: String(edge.source), target: String(edge.target), weight: edge.weight } }))
      ],
      layout: { name: 'cose', animate: false, fit: true, padding: 36 },
      style: [
        { selector: 'node', style: { 'background-color': '#64748b', label: 'data(label)', color: '#1f2937', 'font-size': 9, 'text-outline-width': 2, 'text-outline-color': '#f8fafc', width: 22, height: 22 } },
        { selector: 'node[?selected]', style: { 'background-color': '#0f766e', width: 34, height: 34, 'border-width': 3, 'border-color': '#99f6e4' } },
        { selector: 'edge', style: { width: 'mapData(weight, 1, 2600, 1, 8)', 'line-color': '#94a3b8', 'target-arrow-color': '#94a3b8', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', opacity: 0.75 } },
        { selector: 'edge:selected', style: { 'line-color': '#b45309', 'target-arrow-color': '#b45309', width: 6 } }
      ]
    });
    cy.on('tap', 'node', (event) => onSelectNeuron(event.target.id()));
    cy.on('tap', 'edge', (event) => {
      const edge = neighborhood.edges.find((item) => `${item.source}-${item.target}` === event.target.data('id'));
      if (edge) onSelectConnection(edge);
    });
    cyRef.current = cy;
    return () => cy.destroy();
  }, [neighborhood, onSelectConnection, onSelectNeuron, selectedId]);

  return <div className="graph-shell">
    <div className="graph-toolbar">
      <span><Network size={15} /> Local Neighborhood</span>
      <button aria-label="Fit graph to view" onClick={() => cyRef.current?.fit(undefined, 36)}>Fit</button>
      <button aria-label="Reset graph layout" onClick={() => cyRef.current?.layout({ name: 'cose', animate: true, fit: true, padding: 36 }).run()}>Reset</button>
    </div>
    <div className="graph-canvas" ref={containerRef}>{!neighborhood && <div className="empty-state">Select a neuron to render its local structural neighborhood.</div>}</div>
    <div className="graph-legend" aria-label="Graph legend">
      <span><i className="legend-node selected" /> Selected neuron</span>
      <span><i className="legend-node" /> Connected neuron</span>
      <span><i className="legend-edge" /> Source {'->'} target structural synapse count</span>
    </div>
    {neighborhood?.truncated && <div className="truncate-note">Showing {neighborhood.showing} of {neighborhood.available.toLocaleString()} connected neurons.</div>}
  </div>;
}
