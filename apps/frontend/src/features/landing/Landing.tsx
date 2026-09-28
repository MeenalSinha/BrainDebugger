import { Database, Search } from 'lucide-react';
import { Stat } from '../../components/Stat';
import type { DatasetSummary } from '../../types/connectome';

export function Landing({ summary, onStart }: { summary: DatasetSummary | null; onStart: () => void }) {
  return (
    <div className="landing">
      <div className="landing-copy">
        <div className="eyebrow"><Database size={16} /> Janelia MaleCNS v1.0</div>
        <h1>BrainDebugger</h1>
        <p>
          Developer-tool-style exploration for graph-based structural connectivity in a real Janelia MaleCNS-derived demo index.
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
        <span>Search</span><b>↓</b><span>Inspect</span><b>↓</b><span>Trace local structure</span><b>↓</b><span>Analyze</span><b>↓</b><span>Export</span>
      </div>
    </div>
  );
}
