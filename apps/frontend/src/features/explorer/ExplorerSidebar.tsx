import { Activity, Search, X } from 'lucide-react';
import type { Neuron, Region } from '../../types/connectome';
import { DemoControls } from './DemoControls';
import { HistoryPanel } from './HistoryPanel';

type ExplorerSidebarProps = {
  query: string;
  cellType: string;
  selectedRegion: string;
  regions: Region[];
  results: Neuron[];
  selectedId: string | null;
  history: Neuron[];
  loading: boolean;
  onQueryChange: (value: string) => void;
  onCellTypeChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  onOpenNeuron: (id: string) => void;
  onRunDemo: () => void;
  onResetDemo: () => void;
};

export function ExplorerSidebar({ query, cellType, selectedRegion, regions, results, selectedId, history, loading, onQueryChange, onCellTypeChange, onRegionChange, onOpenNeuron, onRunDemo, onResetDemo }: ExplorerSidebarProps) {
  const knownCellTypes = Array.from(new Set([...results.map((neuron) => neuron.cellType), ...regions.flatMap((region) => region.mostCommonCellTypes.map((item) => item.cellType))].filter(Boolean))).sort();
  return <aside className="sidebar">
    <div className="search-box"><Search size={16} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search neuron ID, cell type, region" aria-label="Neuron search" />{query && <button onClick={() => onQueryChange('')} aria-label="Clear search"><X size={15} /></button>}</div>
    <DemoControls onRun={onRunDemo} onReset={onResetDemo} />
    <label className="field-label" htmlFor="region-filter">Region filter</label><select id="region-filter" value={selectedRegion} onChange={(event) => onRegionChange(event.target.value)}><option value="">All indexed regions</option>{regions.map((region) => <option key={region.name} value={region.name}>{region.name}</option>)}</select>
    <label className="field-label" htmlFor="cell-type-filter">Exact cell type filter</label><input id="cell-type-filter" className="filter-input" list="cell-type-options" value={cellType} onChange={(event) => onCellTypeChange(event.target.value)} placeholder="Optional exact cell type" /><datalist id="cell-type-options">{knownCellTypes.map((type) => <option key={type} value={type} />)}</datalist>
    <div className="section-title"><Activity size={15} /> Neuron Browser</div>{loading && <div className="inline-status">Searching indexed neurons...</div>}
    <div className="result-list">{results.map((neuron) => <button className={selectedId === neuron.id ? 'result active' : 'result'} key={neuron.id} onClick={() => onOpenNeuron(neuron.id)}><code>{neuron.id}</code><span>{neuron.cellType}</span><small>{neuron.region} · in {neuron.incomingPartners} / out {neuron.outgoingPartners}</small></button>)}</div>
    <HistoryPanel history={history} onOpenNeuron={onOpenNeuron} />
  </aside>;
}
