import React from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDownToLine, Database, Download, Network, Search, Settings2, Split, X } from 'lucide-react';
import cytoscape from 'cytoscape';
import { Stat } from './components/Stat';
import { Landing } from './features/landing/Landing';
import { ScopePanel } from './features/science/ScopePanel';
import { api } from './services/api';
import { useDebouncedValue } from './lib/useDebouncedValue';
import type { Connection, DatasetSummary, Neighborhood, Neuron, Region, Statistics } from './types/connectome';
import './styles.css';

type ConnectionSort = 'weight_desc' | 'weight_asc' | 'source_region' | 'target_region' | 'neuron_id';

function isAbortError(error: unknown) {
  return (error instanceof DOMException && error.name === 'AbortError')
    || (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError');
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
        <button aria-label="Fit graph to view" onClick={() => cyRef.current?.fit(undefined, 36)}>Fit</button>
        <button aria-label="Reset graph layout" onClick={() => cyRef.current?.layout({ name: 'cose', animate: true, fit: true, padding: 36 }).run()}>Reset</button>
      </div>
      <div className="graph-canvas" ref={containerRef}>
        {!neighborhood && <div className="empty-state">Select a neuron to render its local structural neighborhood.</div>}
      </div>
      <div className="graph-legend" aria-label="Graph legend">
        <span><i className="legend-node selected" /> Selected neuron</span>
        <span><i className="legend-node" /> Connected neuron</span>
        <span><i className="legend-edge" /> Source {'->'} target structural synapse count</span>
      </div>
      {neighborhood?.truncated && <div className="truncate-note">Showing {neighborhood.showing} of {neighborhood.available.toLocaleString()} connected neurons.</div>}
    </div>
  );
}

function ConnectionTable({
  title,
  rows,
  direction,
  selectedNeuronId,
  page,
  total,
  search,
  sort,
  loading,
  onSearch,
  onSort,
  onPage,
  onInspect,
  onNeuron
}: {
  title: string;
  rows: Connection[];
  direction: 'incoming' | 'outgoing';
  selectedNeuronId: string | null;
  page: number;
  total: number;
  search: string;
  sort: ConnectionSort;
  loading: boolean;
  onSearch: (value: string) => void;
  onSort: (value: ConnectionSort) => void;
  onPage: (value: number) => void;
  onInspect: (edge: Connection) => void;
  onNeuron: (id: string) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / 25));
  return (
    <div className="table-card">
      <div className="table-header">
        <div className="section-title"><ArrowDownToLine size={15} /> {title}</div>
        {selectedNeuronId && <a href={api.connectionsExportUrl(selectedNeuronId, direction, search, sort)} target="_blank" rel="noreferrer">Export CSV</a>}
      </div>
      <div className="table-controls">
        <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search within connections" />
        <select value={sort} onChange={(event) => onSort(event.target.value as ConnectionSort)}>
          <option value="weight_desc">Highest synapse count</option>
          <option value="weight_asc">Lowest synapse count</option>
          <option value="source_region">Source region</option>
          <option value="target_region">Target region</option>
          <option value="neuron_id">Neuron ID</option>
        </select>
      </div>
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
                <td>{direction === 'incoming' ? row.sourcePredictedNt || 'unknown' : row.targetPredictedNt || 'unknown'}</td>
                <td><button onClick={() => onInspect(row)}>Inspect</button></td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={6} className="empty-cell">No connections were found in the indexed dataset.</td></tr>}
        </tbody>
      </table>
      <div className="pager">
        <span>{loading ? 'Loading connections' : `${total.toLocaleString()} connections`}</span>
        <button disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>Previous</button>
        <span>Page {page} of {pageCount}</span>
        <button disabled={page >= pageCount || loading} onClick={() => onPage(page + 1)}>Next</button>
      </div>
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
        <h3>Identity</h3>
        <Stat label="Neuron ID" value={neuron.id} />
        <Stat label="Status" value={neuron.status || 'unknown'} />
      </div>
      <div className="inspector-section">
        <h3>Classification</h3>
        <Stat label="Cell type" value={neuron.cellType || 'unclassified'} />
        <Stat label="Brain region" value={neuron.region || 'unclassified'} />
        <Stat label="Hemisphere" value={neuron.hemisphere || 'unknown'} />
        <Stat label="Predicted NT annotation" value={neuron.predictedNt || 'unknown'} />
      </div>
      <div className="inspector-section">
        <h3>Dataset Connectivity</h3>
        <Stat label="Incoming partners" value={neuron.incomingPartners?.toLocaleString()} />
        <Stat label="Outgoing partners" value={neuron.outgoingPartners?.toLocaleString()} />
        <Stat label="Incoming structural weight" value={(neuron.totalIncomingWeight ?? 0).toLocaleString()} />
        <Stat label="Outgoing structural weight" value={(neuron.totalOutgoingWeight ?? 0).toLocaleString()} />
      </div>
      {stats && (
        <div className="inspector-section">
          <h3 title="Computed over connections present in the indexed demo subset.">Computed Structural Metrics</h3>
          <Stat label="Total degree" value={stats.totalDegree} />
          <Stat label="Average structural weight" value={stats.averageConnectionWeight} />
          <Stat label="Maximum structural weight" value={stats.maxConnectionWeight.toLocaleString()} />
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
  const [incomingTotal, setIncomingTotal] = React.useState(0);
  const [outgoingTotal, setOutgoingTotal] = React.useState(0);
  const [incomingPage, setIncomingPage] = React.useState(1);
  const [outgoingPage, setOutgoingPage] = React.useState(1);
  const [incomingSearch, setIncomingSearch] = React.useState('');
  const [outgoingSearch, setOutgoingSearch] = React.useState('');
  const [incomingSort, setIncomingSort] = React.useState<ConnectionSort>('weight_desc');
  const [outgoingSort, setOutgoingSort] = React.useState<ConnectionSort>('weight_desc');
  const [tableLoading, setTableLoading] = React.useState(false);
  const [neighborhood, setNeighborhood] = React.useState<Neighborhood | null>(null);
  const [direction, setDirection] = React.useState('both');
  const [maxNodes, setMaxNodes] = React.useState(50);
  const [selectedConnection, setSelectedConnection] = React.useState<Connection | null>(null);
  const [history, setHistory] = React.useState<Neuron[]>([]);
  const [error, setError] = React.useState('');
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [neuronLoading, setNeuronLoading] = React.useState(false);
  const debouncedQuery = useDebouncedValue(query, 250);
  const neuronRequestSeq = React.useRef(0);
  const neuronAbortRef = React.useRef<AbortController | null>(null);
  const selectedRegionDetail = regions.find((region) => region.name === selectedRegion);

  React.useEffect(() => {
    const controller = new AbortController();
    Promise.all([api.summary(controller.signal), api.regions(controller.signal)])
      .then(([summaryResponse, regionResponse]) => {
        setSummary(summaryResponse.data);
        setRegions(regionResponse.data);
      })
      .catch((err) => {
        if (!isAbortError(err)) setError(err.message);
      });
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    setSearchLoading(true);
    api.search(debouncedQuery, selectedRegion, 30, controller.signal)
      .then((response) => setResults(response.data))
      .catch((err) => {
        if (!isAbortError(err)) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearchLoading(false);
      });
    return () => controller.abort();
  }, [debouncedQuery, selectedRegion]);

  const openNeuron = React.useCallback((id: string) => {
    const requestId = ++neuronRequestSeq.current;
    neuronAbortRef.current?.abort();
    const controller = new AbortController();
    neuronAbortRef.current = controller;
    setError('');
    setNeuronLoading(true);
    setIncomingPage(1);
    setOutgoingPage(1);
    Promise.all([
      api.neuron(id, controller.signal),
      api.statistics(id, controller.signal),
      api.neighborhood(id, direction, maxNodes, controller.signal)
    ])
      .then(([neuronResponse, statsResponse, neighborhoodResponse]) => {
        if (requestId !== neuronRequestSeq.current) return;
        setSelected(neuronResponse.data);
        setStats(statsResponse.data);
        setNeighborhood(neighborhoodResponse.data);
        setSelectedConnection(null);
        setHistory((items) => [neuronResponse.data, ...items.filter((item) => item.id !== id)].slice(0, 8));
      })
      .catch((err) => {
        if (!isAbortError(err) && requestId === neuronRequestSeq.current) setError(err.message);
      })
      .finally(() => {
        if (requestId === neuronRequestSeq.current) setNeuronLoading(false);
        if (neuronAbortRef.current === controller) neuronAbortRef.current = null;
      });
  }, [direction, maxNodes]);

  React.useEffect(() => () => neuronAbortRef.current?.abort(), []);

  const resetDemo = React.useCallback(() => {
    setSelected(null);
    setStats(null);
    setIncoming([]);
    setOutgoing([]);
    setNeighborhood(null);
    setSelectedConnection(null);
    setQuery('');
    setSelectedRegion('');
    setIncomingSearch('');
    setOutgoingSearch('');
    setIncomingPage(1);
    setOutgoingPage(1);
  }, []);

  const runDemo = React.useCallback(() => {
    openNeuron('10001');
    document.getElementById('explorer')?.scrollIntoView({ behavior: 'smooth' });
  }, [openNeuron]);

  React.useEffect(() => {
    const controller = new AbortController();
    if (selected) {
      api.neighborhood(selected.id, direction, maxNodes, controller.signal)
        .then((response) => setNeighborhood(response.data))
        .catch((err) => {
          if (!isAbortError(err)) setError(err.message);
        });
    }
    return () => controller.abort();
  }, [direction, maxNodes, selected?.id]);

  React.useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setTableLoading(true);
    Promise.all([
      api.incoming(selected.id, incomingPage, incomingSearch, incomingSort, controller.signal),
      api.outgoing(selected.id, outgoingPage, outgoingSearch, outgoingSort, controller.signal)
    ])
      .then(([incomingResponse, outgoingResponse]) => {
        setIncoming(incomingResponse.data);
        setOutgoing(outgoingResponse.data);
        setIncomingTotal(incomingResponse.metadata.total ?? incomingResponse.data.length);
        setOutgoingTotal(outgoingResponse.metadata.total ?? outgoingResponse.data.length);
      })
      .catch((err) => {
        if (!isAbortError(err)) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setTableLoading(false);
      });
    return () => controller.abort();
  }, [incomingPage, incomingSearch, incomingSort, outgoingPage, outgoingSearch, outgoingSort, selected?.id]);

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
          <div className="demo-box">
            <div>
              <strong>Demo Mode</strong>
              <span>Real subset example workflow</span>
            </div>
            <button onClick={runDemo}>Inspect example</button>
            <button onClick={resetDemo}>Reset demo</button>
          </div>
          <label className="field-label">Region filter</label>
          <select value={selectedRegion} onChange={(event) => setSelectedRegion(event.target.value)}>
            <option value="">All indexed regions</option>
            {regions.map((region) => <option key={region.name} value={region.name}>{region.name}</option>)}
          </select>
          <div className="section-title"><Activity size={15} /> Neuron Browser</div>
          {searchLoading && <div className="inline-status">Searching indexed neurons...</div>}
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
          {neuronLoading && <div className="inline-status">Loading neuron profile and local graph...</div>}
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
            <ConnectionTable
              title="Incoming Connections"
              rows={incoming}
              direction="incoming"
              selectedNeuronId={selected?.id ?? null}
              page={incomingPage}
              total={incomingTotal}
              search={incomingSearch}
              sort={incomingSort}
              loading={tableLoading}
              onSearch={(value) => { setIncomingSearch(value); setIncomingPage(1); }}
              onSort={(value) => { setIncomingSort(value); setIncomingPage(1); }}
              onPage={setIncomingPage}
              onInspect={setSelectedConnection}
              onNeuron={openNeuron}
            />
            <ConnectionTable
              title="Outgoing Connections"
              rows={outgoing}
              direction="outgoing"
              selectedNeuronId={selected?.id ?? null}
              page={outgoingPage}
              total={outgoingTotal}
              search={outgoingSearch}
              sort={outgoingSort}
              loading={tableLoading}
              onSearch={(value) => { setOutgoingSearch(value); setOutgoingPage(1); }}
              onSort={(value) => { setOutgoingSort(value); setOutgoingPage(1); }}
              onPage={setOutgoingPage}
              onInspect={setSelectedConnection}
              onNeuron={openNeuron}
            />
          </div>
          <div className="regions-panel">
            <div className="section-title"><Database size={15} /> Region Explorer</div>
            {selectedRegionDetail && (
              <div className="region-detail">
                <div>
                  <strong>{selectedRegionDetail.name}</strong>
                  <span>Indexed demo subset region</span>
                </div>
                <Stat label="Indexed neurons" value={selectedRegionDetail.neuronCount.toLocaleString()} />
                <Stat label="Indexed connections" value={selectedRegionDetail.connectionCount.toLocaleString()} />
                <div className="region-cell-types">
                  <span>Top cell types</span>
                  {selectedRegionDetail.mostCommonCellTypes.map((item) => (
                    <button key={item.cellType} onClick={() => setQuery(item.cellType)}>{item.cellType} · {item.count}</button>
                  ))}
                </div>
                <div className="region-cell-types">
                  <span>Representative neurons</span>
                  {results.slice(0, 5).map((neuron) => (
                    <button key={neuron.id} onClick={() => openNeuron(neuron.id)}>{neuron.id} · {neuron.cellType}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="region-grid">
              {regions.slice(0, 12).map((region) => (
                <button key={region.name} className="region-card" onClick={() => { setQuery(''); setSelectedRegion(region.name); }}>
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
