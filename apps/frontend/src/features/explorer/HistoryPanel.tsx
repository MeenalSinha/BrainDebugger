import { Settings2 } from 'lucide-react';
import type { Neuron } from '../../types/connectome';

type HistoryPanelProps = { history: Neuron[]; onOpenNeuron: (id: string) => void };

export function HistoryPanel({ history, onOpenNeuron }: HistoryPanelProps) {
  return <><div className="section-title"><Settings2 size={15} /> Recently Viewed</div><div className="history">{history.map((neuron) => <button key={neuron.id} onClick={() => onOpenNeuron(neuron.id)}>{neuron.id} · {neuron.cellType}</button>)}</div></>;
}
