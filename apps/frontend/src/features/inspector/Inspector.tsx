import { Download } from 'lucide-react';
import { Stat } from '../../components/Stat';
import { api } from '../../services/api';
import type { Connection, Neuron, Statistics } from '../../types/connectome';

type InspectorProps = { neuron: Neuron | null; stats: Statistics | null; connection: Connection | null };

export function Inspector({ neuron, stats, connection }: InspectorProps) {
  if (!neuron) return <aside className="inspector"><div className="empty-state">Search for a neuron to open the inspector.</div></aside>;
  return <aside className="inspector">
    <div className="panel-header"><span>Neuron Inspector</span><code>{neuron.id}</code></div>
    <div className="inspector-section"><h3>Identity</h3><Stat label="Neuron ID" value={neuron.id} /><Stat label="Status" value={neuron.status || 'unknown'} /></div>
    <div className="inspector-section"><h3>Classification</h3><Stat label="Cell type" value={neuron.cellType || 'unclassified'} /><Stat label="Brain region" value={neuron.region || 'unclassified'} /><Stat label="Hemisphere" value={neuron.hemisphere || 'unknown'} /><Stat label="Predicted NT annotation" value={neuron.predictedNt || 'unknown'} /></div>
    <div className="inspector-section"><h3>Dataset Connectivity</h3><Stat label="Incoming partners" value={neuron.incomingPartners?.toLocaleString()} /><Stat label="Outgoing partners" value={neuron.outgoingPartners?.toLocaleString()} /><Stat label="Incoming structural weight" value={(neuron.totalIncomingWeight ?? 0).toLocaleString()} /><Stat label="Outgoing structural weight" value={(neuron.totalOutgoingWeight ?? 0).toLocaleString()} /></div>
    {stats && <div className="inspector-section"><h3 title="Computed over connections present in the indexed demo subset.">Computed Structural Metrics</h3><Stat label="Total degree" value={stats.totalDegree} /><Stat label="Average structural weight" value={stats.averageConnectionWeight} /><Stat label="Maximum structural weight" value={stats.maxConnectionWeight.toLocaleString()} /><Stat label="Connected regions" value={stats.uniqueConnectedRegions} /></div>}
    {connection && <div className="inspector-section selected-edge"><h3>Selected Connection</h3><Stat label="Source" value={connection.source} /><Stat label="Target" value={connection.target} /><Stat label="Synapse count" value={connection.weight.toLocaleString()} /><p>{connection.scopeNote}</p></div>}
    <div className="inspector-section"><h3>Provenance</h3><p>Metadata: MaleCNS neuron annotation table.</p><p>Connectivity: MaleCNS connectome weights table.</p><p>Neurotransmitter: MaleCNS body neurotransmitter prediction table.</p></div>
    <div className="export-row"><a href={api.exportUrl(neuron.id, 'markdown')} target="_blank" rel="noreferrer"><Download size={15} /> Markdown</a><a href={api.exportUrl(neuron.id, 'json')} target="_blank" rel="noreferrer">JSON</a><a href={api.exportUrl(neuron.id, 'csv')} target="_blank" rel="noreferrer">CSV</a></div>
  </aside>;
}
