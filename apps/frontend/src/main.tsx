import React from 'react';
import { createRoot } from 'react-dom/client';
import { Split } from 'lucide-react';
import { ConnectionTable } from './features/connections/ConnectionTable';
import { ExplorerControls } from './features/explorer/ExplorerControls';
import { ExplorerSidebar } from './features/explorer/ExplorerSidebar';
import { GraphView } from './features/graph/GraphView';
import { Inspector } from './features/inspector/Inspector';
import { Landing } from './features/landing/Landing';
import { RegionExplorer } from './features/regions/RegionExplorer';
import { ScopePanel } from './features/science/ScopePanel';
import { isAbortError } from './lib/isAbortError';
import { useDebouncedValue } from './lib/useDebouncedValue';
import { api } from './services/api';
import type { Connection, DatasetSummary, Neighborhood, Neuron, Region, Statistics } from './types/connectome';
import type { ConnectionSort } from './types/ui';
import './styles.css';

function App() {
  const [summary, setSummary] = React.useState<DatasetSummary | null>(null);
  const [regions, setRegions] = React.useState<Region[]>([]);
  const [query, setQuery] = React.useState('');
  const [cellType, setCellType] = React.useState('');
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
  const debouncedCellType = useDebouncedValue(cellType, 250);
  const neuronRequestSeq = React.useRef(0);
  const neuronAbortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    Promise.all([api.summary(controller.signal), api.regions(controller.signal)])
      .then(([summaryResponse, regionResponse]) => { setSummary(summaryResponse.data); setRegions(regionResponse.data); })
      .catch((err) => { if (!isAbortError(err)) setError(err.message); });
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    setSearchLoading(true);
    api.search(debouncedQuery, selectedRegion, debouncedCellType, 30, controller.signal)
      .then((response) => setResults(response.data))
      .catch((err) => { if (!isAbortError(err)) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setSearchLoading(false); });
    return () => controller.abort();
  }, [debouncedQuery, debouncedCellType, selectedRegion]);

  const openNeuron = React.useCallback((id: string) => {
    const requestId = ++neuronRequestSeq.current;
    neuronAbortRef.current?.abort();
    const controller = new AbortController();
    neuronAbortRef.current = controller;
    setError(''); setNeuronLoading(true); setIncomingPage(1); setOutgoingPage(1);
    Promise.all([api.neuron(id, controller.signal), api.statistics(id, controller.signal), api.neighborhood(id, direction, maxNodes, controller.signal)])
      .then(([neuronResponse, statsResponse, neighborhoodResponse]) => {
        if (requestId !== neuronRequestSeq.current) return;
        setSelected(neuronResponse.data); setStats(statsResponse.data); setNeighborhood(neighborhoodResponse.data); setSelectedConnection(null);
        setHistory((items) => [neuronResponse.data, ...items.filter((item) => item.id !== id)].slice(0, 8));
      })
      .catch((err) => { if (!isAbortError(err) && requestId === neuronRequestSeq.current) setError(err.message); })
      .finally(() => { if (requestId === neuronRequestSeq.current) setNeuronLoading(false); if (neuronAbortRef.current === controller) neuronAbortRef.current = null; });
  }, [direction, maxNodes]);

  React.useEffect(() => () => neuronAbortRef.current?.abort(), []);

  React.useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    api.neighborhood(selected.id, direction, maxNodes, controller.signal).then((response) => setNeighborhood(response.data)).catch((err) => { if (!isAbortError(err)) setError(err.message); });
    return () => controller.abort();
  }, [direction, maxNodes, selected?.id]);

  React.useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setTableLoading(true);
    Promise.all([api.incoming(selected.id, incomingPage, incomingSearch, incomingSort, controller.signal), api.outgoing(selected.id, outgoingPage, outgoingSearch, outgoingSort, controller.signal)])
      .then(([incomingResponse, outgoingResponse]) => { setIncoming(incomingResponse.data); setOutgoing(outgoingResponse.data); setIncomingTotal(incomingResponse.metadata.total ?? incomingResponse.data.length); setOutgoingTotal(outgoingResponse.metadata.total ?? outgoingResponse.data.length); })
      .catch((err) => { if (!isAbortError(err)) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setTableLoading(false); });
    return () => controller.abort();
  }, [incomingPage, incomingSearch, incomingSort, outgoingPage, outgoingSearch, outgoingSort, selected?.id]);

  const resetDemo = React.useCallback(() => { setSelected(null); setStats(null); setIncoming([]); setOutgoing([]); setNeighborhood(null); setSelectedConnection(null); setQuery(''); setCellType(''); setSelectedRegion(''); setIncomingSearch(''); setOutgoingSearch(''); setIncomingPage(1); setOutgoingPage(1); }, []);
  const runDemo = React.useCallback(() => { openNeuron('10001'); document.getElementById('explorer')?.scrollIntoView({ behavior: 'smooth' }); }, [openNeuron]);
  const selectRegion = React.useCallback((name: string) => { setQuery(''); setSelectedRegion(name); }, []);

  return <main className="app">
    <header className="topbar"><div className="brand"><Split size={21} /> <span>BrainDebugger</span><small>Developer tools for biological neural networks</small></div><div className="status-pill">{summary?.mode ?? 'loading'}</div></header>
    <Landing summary={summary} onStart={() => document.getElementById('explorer')?.scrollIntoView({ behavior: 'smooth' })} />
    <section className="workspace" id="explorer">
      <ExplorerSidebar query={query} cellType={cellType} selectedRegion={selectedRegion} regions={regions} results={results} selectedId={selected?.id ?? null} history={history} loading={searchLoading} onQueryChange={setQuery} onCellTypeChange={setCellType} onRegionChange={setSelectedRegion} onOpenNeuron={openNeuron} onRunDemo={runDemo} onResetDemo={resetDemo} />
      <section className="center">
        {error && <div className="error">{error}</div>}{neuronLoading && <div className="inline-status">Loading neuron profile and local graph...</div>}
        <ExplorerControls direction={direction} maxNodes={maxNodes} onDirectionChange={setDirection} onMaxNodesChange={setMaxNodes} />
        <GraphView neighborhood={neighborhood} selectedId={selected?.id ?? null} onSelectNeuron={openNeuron} onSelectConnection={setSelectedConnection} />
        <div className="tables"><ConnectionTable title="Incoming Connections" rows={incoming} direction="incoming" selectedNeuronId={selected?.id ?? null} page={incomingPage} total={incomingTotal} search={incomingSearch} sort={incomingSort} loading={tableLoading} onSearch={(value) => { setIncomingSearch(value); setIncomingPage(1); }} onSort={(value) => { setIncomingSort(value); setIncomingPage(1); }} onPage={setIncomingPage} onInspect={setSelectedConnection} onNeuron={openNeuron} /><ConnectionTable title="Outgoing Connections" rows={outgoing} direction="outgoing" selectedNeuronId={selected?.id ?? null} page={outgoingPage} total={outgoingTotal} search={outgoingSearch} sort={outgoingSort} loading={tableLoading} onSearch={(value) => { setOutgoingSearch(value); setOutgoingPage(1); }} onSort={(value) => { setOutgoingSort(value); setOutgoingPage(1); }} onPage={setOutgoingPage} onInspect={setSelectedConnection} onNeuron={openNeuron} /></div>
        <RegionExplorer regions={regions} selectedRegion={selectedRegion} results={results} onSelectRegion={selectRegion} onSelectCellType={setCellType} onOpenNeuron={openNeuron} />
        <ScopePanel />
      </section>
      <Inspector neuron={selected} stats={stats} connection={selectedConnection} />
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
