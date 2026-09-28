import { Database } from 'lucide-react';
import { Stat } from '../../components/Stat';
import type { Neuron, Region } from '../../types/connectome';

type RegionExplorerProps = { regions: Region[]; selectedRegion: string; results: Neuron[]; onSelectRegion: (name: string) => void; onSelectCellType: (cellType: string) => void; onOpenNeuron: (id: string) => void };

export function RegionExplorer({ regions, selectedRegion, results, onSelectRegion, onSelectCellType, onOpenNeuron }: RegionExplorerProps) {
  const selected = regions.find((region) => region.name === selectedRegion);
  const representatives = results.filter((neuron) => neuron.region === selectedRegion).slice(0, 5);
  return <div className="regions-panel">
    <div className="section-title"><Database size={15} /> Region Explorer <span className="region-count">{regions.length} regions</span></div>
    {selected && <div className="region-detail"><div><strong>{selected.name}</strong><span>Indexed demo subset region</span></div><Stat label="Indexed neurons" value={selected.neuronCount.toLocaleString()} /><Stat label="Indexed connections" value={selected.connectionCount.toLocaleString()} /><div className="region-cell-types"><span>Top cell types</span>{selected.mostCommonCellTypes.map((item) => <button key={item.cellType} onClick={() => onSelectCellType(item.cellType)}>{item.cellType} · {item.count}</button>)}</div><div className="region-cell-types"><span>Representative neurons</span>{representatives.map((neuron) => <button key={neuron.id} onClick={() => onOpenNeuron(neuron.id)}>{neuron.id} · {neuron.cellType}</button>)}</div></div>}
    <div className="region-grid">{regions.map((region) => <button key={region.name} className={region.name === selectedRegion ? 'region-card active' : 'region-card'} onClick={() => onSelectRegion(region.name)}><strong>{region.name}</strong><span>{region.neuronCount.toLocaleString()} neurons</span><span>{region.connectionCount.toLocaleString()} indexed connections</span></button>)}</div>
  </div>;
}
