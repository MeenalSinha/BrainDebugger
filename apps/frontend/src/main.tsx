import React from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDownToLine, Database, Download, Info, Network, Search, Settings2, Split, X } from 'lucide-react';
import cytoscape from 'cytoscape';
import { api } from './services/api';
import { useDebouncedValue } from './lib/useDebouncedValue';
import type { Connection, DatasetSummary, Neighborhood, Neuron, Region, Statistics } from './types/connectome';
import './styles.css';

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScopePanel() {
  return (
    <section className="scope-panel">
      <div className="section-title"><Info size={15} /> Scientific Scope & Limitations</div>
      <p>BrainDebugger v1.0 explores graph-based structural connectivity in the Janelia MaleCNS dataset.</p>
      <ul>
        <li>Synapse counts are not automatically physiological signal strengths.</li>
        <li>Predicted neurotransmitters do not necessarily establish excitatory or inhibitory effects.</li>
        <li>Graph paths are computational exploration aids, not validated biological signal routes.</li>
      </ul>
    </section>
  );
}

function Landing({ summary, onStart }: { summary: DatasetSummary | null; onStart: () => void }) {
  return (
    <div className="landing">
      <div className="landing-copy">
        <div className="eyebrow"><Database size={16} /> Janelia MaleCNS v1.0</div>
        <h1>Explore the hidden wiring of a biological neural network.</h1>
        <p>
          BrainDebugger lets you inspect neurons, explore synaptic relationships, and understand connectome structure through
          an interface inspired by developer tools.
        </p>
        <button className="primary-action" onClick={onStart}><Search size={18} /> Start Exploring</button>
      </div>
      <div className="overview-grid">
        <Stat label="Indexed neurons" value={summary ? summary.indexedNeurons.toLocaleString() : 'Loading'} />
        <Stat label="Indexed connections" value={summary ? summary.indexedConnections.toLocaleString() : 'Loading'} />
        <Stat label="Available regions" value={summary ? summary.availableRegions.toLocaleString() : 'Loading'} />
        <Stat label="Data status" value={summary?.mode ?? 'Loading'} />
        <Stat label="Last indexed" value={summary ? new Date(summary.indexedAt).toLocaleString() : 'Loading'} />
        <Stat label="API index load" value={summary ? `${summary.apiIndexLoadSeconds}s` : 'Loading'} />
      </div>
      <div className="workflow">
        <span>Search a neuron</span><b>↓</b><span>Inspect connections</span><b>↓</b><span>Explore local network</span><b>↓</b><span>Understand structural role</span>
      </div>
    </div>
  );
}

function GraphView({
  neighborhood,
  selectedId,
  onSelectNeuron,
  onSelectConnection
}: {
  neighborhood: Neighborhood | null;
  selectedId: string | null;
  onSelectNeuron: (id: string) => void;
  onSelectConnection: (edge: Connection) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const cyRef = React.useRef<cytoscape.Core | null>(null);

  React.useEffect(() => {
    if (!containerRef.current || !neighborhood) return;
    cyRef.current?.destroy();
    const elements = [
      ...neighborhood.nodes.map((node) => ({
        data: { id: node.id, label: node.cellType || node.id, region: node.region, selected: node.id === selectedId }
      })),
      ...neighborhood.edges.map((edge) => ({
        data: { id: `${edge.source}-${edge.target}`, source: String(edge.source), target: String(edge.target), weight: edge.weight }
      }))
    ];
    const cy = cytoscape({
      container: containerRef.current,
      elements,
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
      const data = event.target.data();
      const edge = neighborhood.edges.find((item) => `${item.source}-${item.target}` === data.id);
      if (edge) onSelectConnection(edge);
    });
    cy.on('dbltap', 'node', (event) => onSelectNeuron(event.target.id()));
    cyRef.current = cy;
    return () => cy.destroy();
  }, [neighborhood, onSelectConnection, onSelectNeuron, selectedId]);

  return (
    <div className="graph-shell">
      <div className="graph-toolbar">
        <span><Network size={15} /> Local Neighborhood</span>
        <button onClick={() => cyRef.current?.fit(undefined, 36)}>Fit</button>
        <button onClick={() => cyRef.current?.layout({ name: 'cose', animate: true, fit: true, padding: 36 }).run()}>Reset</button>
      </div>
      <div className="graph-canvas" ref={containerRef}>
        {!neighborhood && <div className="empty-state">Select a neuron to render its local structural neighborhood.</div>}
      </div>
      {neighborhood?.truncated && <div className="truncate-note">Showing {neighborhood.showing} of {neighborhood.available.toLocaleString()} connected neurons.</div>}
    </div>
  );
}

function ConnectionTable({
  title,
  rows,
  direction,
  onInspect,
  onNeuron
}: {
  title: string;
  rows: Connection[];
  direction: 'incoming' | 'outgoing';
  onInspect: (edge: Connection) => void;
  onNeuron: (id: string) => void;
}) {
  return (
    <div className="table-card">
      <div className="section-title"><ArrowDownToLine size={15} /> {title}</div>
      <table>
        <thead>
          <tr>
            <th>{direction === 'incoming' ? 'Source neuron' : 'Target neuron'}</th>
            <th>Cell type</th>
            <th>Region</th>
            <th>Synapse count</th>
            <th>Predicted NT</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = direction === 'incoming' ? row.source : row.target;
            return (
              <tr key={`${row.source}-${row.target}`}>
                <td><button className="link-button" onClick={() => onNeuron(String(id))}>{id}</button></td>
                <td>{direction === 'incoming' ? row.sourceCellType : row.targetCellType}</td>
                <td>{direction === 'incoming' ? row.sourceRegion : row.targetRegion}</td>
                <td className="mono">{row.weight.toLocaleString()}</td>
                <td>{row.sourcePredictedNt || row.predictedNt || 'unknown'}</td>
                <td><button onClick={() => onInspect(row)}>Inspect</button></td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={6} className="empty-cell">No connections were found in the indexed dataset.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Inspector({ neuron, stats, connection }: { neuron: Neuron | null; stats: Statistics | null; connection: Connection | null }) {
  if (!neuron) {
    return <aside className="inspector"><div className="empty-state">Search for a neuron to open the inspector.</div></aside>;
  }
  return (
    <aside className="inspector">
      <div className="panel-header">
        <span>Neuron Inspector</span>
        <code>{neuron.id}</code>
      </div>
      <div className="inspector-section">
        <h3>Overview</h3>
        <Stat label="Cell type" value={neuron.cellType || 'unclassified'} />
        <Stat label="Brain region" value={neuron.region || 'unclassified'} />
        <Stat label="Hemisphere" value={neuron.hemisphere || 'unknown'} />
        <Stat label="Predicted neurotransmitter" value={neuron.predictedNt || 'unknown'} />
      </div>
      <div className="inspector-section">
        <h3>Connectivity</h3>
        <Stat label="Incoming partners" value={neuron.incomingPartners?.toLocaleString()} />
        <Stat label="Outgoing partners" value={neuron.outgoingPartners?.toLocaleString()} />
        <Stat label="Incoming synapse count" value={(neuron.totalIncomingWeight ?? 0).toLocaleString()} />
        <Stat label="Outgoing synapse count" value={(neuron.totalOutgoingWeight ?? 0).toLocaleString()} />
      </div>
      {stats && (
        <div className="inspector-section">
          <h3>Structural Graph Metrics</h3>
          <Stat label="Total degree" value={stats.totalDegree} />
          <Stat label="Average weight" value={stats.averageConnectionWeight} />
          <Stat label="Maximum weight" value={stats.maxConnectionWeight.toLocaleString()} />
          <Stat label="Connected regions" value={stats.uniqueConnectedRegions} />
        </div>
      )}
      {connection && (
        <div className="inspector-section selected-edge">
          <h3>Selected Connection</h3>
          <Stat label="Source" value={connection.source} />
          <Stat label="Target" value={connection.target} />
          <Stat label="Synapse count" value={connection.weight.toLocaleString()} />
          <p>{connection.scopeNote}</p>
        </div>
      )}
      <div className="inspector-section">
        <h3>Provenance</h3>
        <p>Metadata: MaleCNS neuron annotation table.</p>
        <p>Connectivity: MaleCNS connectome weights table.</p>
        <p>Neurotransmitter: MaleCNS body neurotransmitter prediction table.</p>
      </div>
      <div className="export-row">
        <a href={api.exportUrl(neuron.id, 'markdown')} target="_blank" rel="noreferrer"><Download size={15} /> Markdown</a>
        <a href={api.exportUrl(neuron.id, 'json')} target="_blank" rel="noreferrer">JSON</a>
        <a href={api.exportUrl(neuron.id, 'csv')} target="_blank" rel="noreferrer">CSV</a>
      </div>
    </aside>
  );
}

function App() {
  const [summary, setSummary] = React.useState<DatasetSummary | null>(null);
  const [regions, setRegions] = React.useState<Region[]>([]);
  const [query, setQuery] = React.useState('');
  const [selectedRegion, setSelectedRegion] = React.useState('');
  const [results, setResults] = React.useState<Neuron[]>([]);
  const [selected, setSelected] = React.useState<Neuron | null>(null);
  const [stats, setStats] = React.useState<Statistics | null>(null);
  const [incoming, setIncoming] = React.useState<Connection[]>([]);
  const [outgoing, setOutgoing] = React.useState<Connection[]>([]);
  const [neighborhood, setNeighborhood] = React.useState<Neighborhood | null>(null);
  const [direction, setDirection] = React.useState('both');
  const [maxNodes, setMaxNodes] = React.useState(50);
  const [selectedConnection, setSelectedConnection] = React.useState<Connection | null>(null);
  const [history, setHistory] = React.useState<Neuron[]>([]);
  const [error, setError] = React.useState('');
  const debouncedQuery = useDebouncedValue(query, 250);

  React.useEffect(() => {
    Promise.all([api.summary(), api.regions()])
      .then(([summaryResponse, regionResponse]) => {
        setSummary(summaryResponse.data);
        setRegions(regionResponse.data);
      })
      .catch((err) => setError(err.message));
  }, []);

  React.useEffect(() => {
    api.search(debouncedQuery, selectedRegion, 30)
      .then((response) => setResults(response.data))
      .catch((err) => setError(err.message));
  }, [debouncedQuery, selectedRegion]);

  const openNeuron = React.useCallback((id: string) => {
    setError('');
    Promise.all([api.neuron(id), api.statistics(id), api.incoming(id), api.outgoing(id), api.neighborhood(id, direction, maxNodes)])
      .then(([neuronResponse, statsResponse, incomingResponse, outgoingResponse, neighborhoodResponse]) => {
        setSelected(neuronResponse.data);
        setStats(statsResponse.data);
        setIncoming(incomingResponse.data);
        setOutgoing(outgoingResponse.data);
        setNeighborhood(neighborhoodResponse.data);
        setSelectedConnection(null);
        setHistory((items) => [neuronResponse.data, ...items.filter((item) => item.id !== id)].slice(0, 8));
      })
      .catch((err) => setError(err.message));
  }, [direction, maxNodes]);

  React.useEffect(() => {
    if (selected) {
      api.neighborhood(selected.id, direction, maxNodes).then((response) => setNeighborhood(response.data)).catch((err) => setError(err.message));
    }
  }, [direction, maxNodes, selected?.id]);

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand"><Split size={21} /> <span>BrainDebugger</span><small>Developer tools for biological neural networks</small></div>
        <div className="status-pill">{summary?.mode ?? 'loading'}</div>
      </header>
      <Landing summary={summary} onStart={() => document.getElementById('explorer')?.scrollIntoView({ behavior: 'smooth' })} />
      <section className="workspace" id="explorer">
        <aside className="sidebar">
          <div className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search neuron ID, cell type, region" />
            {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}
          </div>
          <label className="field-label">Region filter</label>
          <select value={selectedRegion} onChange={(event) => setSelectedRegion(event.target.value)}>
            <option value="">All indexed regions</option>
            {regions.map((region) => <option key={region.name} value={region.name}>{region.name}</option>)}
          </select>
          <div className="section-title"><Activity size={15} /> Neuron Browser</div>
          <div className="result-list">
            {results.map((neuron) => (
              <button className={selected?.id === neuron.id ? 'result active' : 'result'} key={neuron.id} onClick={() => openNeuron(neuron.id)}>
                <code>{neuron.id}</code>
                <span>{neuron.cellType}</span>
                <small>{neuron.region} · in {neuron.incomingPartners} / out {neuron.outgoingPartners}</small>
              </button>
            ))}
          </div>
          <div className="section-title"><Settings2 size={15} /> Recently Viewed</div>
          <div className="history">
            {history.map((neuron) => <button key={neuron.id} onClick={() => openNeuron(neuron.id)}>{neuron.id} · {neuron.cellType}</button>)}
          </div>
        </aside>
        <section className="center">
          {error && <div className="error">{error}</div>}
          <div className="controls-row">
            <label>Neighborhood</label>
            <select value={direction} onChange={(event) => setDirection(event.target.value)}>
              <option value="both">Bidirectional</option>
              <option value="incoming">Incoming only</option>
              <option value="outgoing">Outgoing only</option>
            </select>
            <label>Maximum nodes</label>
            <select value={maxNodes} onChange={(event) => setMaxNodes(Number(event.target.value))}>
              {[25, 50, 100, 250].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <GraphView neighborhood={neighborhood} selectedId={selected?.id ?? null} onSelectNeuron={openNeuron} onSelectConnection={setSelectedConnection} />
          <div className="tables">
            <ConnectionTable title="Incoming Connections" rows={incoming} direction="incoming" onInspect={setSelectedConnection} onNeuron={openNeuron} />
            <ConnectionTable title="Outgoing Connections" rows={outgoing} direction="outgoing" onInspect={setSelectedConnection} onNeuron={openNeuron} />
          </div>
          <div className="regions-panel">
            <div className="section-title"><Database size={15} /> Region Explorer</div>
            <div className="region-grid">
              {regions.slice(0, 12).map((region) => (
                <button key={region.name} className="region-card" onClick={() => setSelectedRegion(region.name)}>
                  <strong>{region.name}</strong>
                  <span>{region.neuronCount.toLocaleString()} neurons</span>
                  <span>{region.connectionCount.toLocaleString()} indexed connections</span>
                </button>
              ))}
            </div>
          </div>
          <ScopePanel />
        </section>
        <Inspector neuron={selected} stats={stats} connection={selectedConnection} />
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
