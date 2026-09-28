import { ArrowDownToLine } from 'lucide-react';
import { api } from '../../services/api';
import type { Connection } from '../../types/connectome';
import type { ConnectionSort } from '../../types/ui';

type ConnectionTableProps = {
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
};

export function ConnectionTable({ title, rows, direction, selectedNeuronId, page, total, search, sort, loading, onSearch, onSort, onPage, onInspect, onNeuron }: ConnectionTableProps) {
  const pageCount = Math.max(1, Math.ceil(total / 25));
  return <div className="table-card">
    <div className="table-header">
      <div className="section-title"><ArrowDownToLine size={15} /> {title}</div>
      {selectedNeuronId && <a href={api.connectionsExportUrl(selectedNeuronId, direction, search, sort)} target="_blank" rel="noreferrer">Export CSV</a>}
    </div>
    <div className="table-controls">
      <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search within connections" aria-label={`${title} search`} />
      <select value={sort} onChange={(event) => onSort(event.target.value as ConnectionSort)} aria-label={`${title} sort`}>
        <option value="weight_desc">Highest synapse count</option><option value="weight_asc">Lowest synapse count</option>
        <option value="source_region">Source region</option><option value="target_region">Target region</option><option value="neuron_id">Neuron ID</option>
      </select>
    </div>
    <table><thead><tr><th>{direction === 'incoming' ? 'Source neuron' : 'Target neuron'}</th><th>Cell type</th><th>Region</th><th>Synapse count</th><th>Predicted NT</th><th /></tr></thead>
      <tbody>{rows.map((row) => {
        const id = direction === 'incoming' ? row.source : row.target;
        return <tr key={`${row.source}-${row.target}`}><td><button className="link-button" onClick={() => onNeuron(String(id))}>{id}</button></td><td>{direction === 'incoming' ? row.sourceCellType : row.targetCellType}</td><td>{direction === 'incoming' ? row.sourceRegion : row.targetRegion}</td><td className="mono">{row.weight.toLocaleString()}</td><td>{direction === 'incoming' ? row.sourcePredictedNt || 'unknown' : row.targetPredictedNt || 'unknown'}</td><td><button onClick={() => onInspect(row)}>Inspect</button></td></tr>;
      })}{!rows.length && <tr><td colSpan={6} className="empty-cell">No connections were found in the indexed dataset.</td></tr>}</tbody>
    </table>
    <div className="pager"><span>{loading ? 'Loading connections' : `${total.toLocaleString()} connections`}</span><button disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>Previous</button><span>Page {page} of {pageCount}</span><button disabled={page >= pageCount || loading} onClick={() => onPage(page + 1)}>Next</button></div>
  </div>;
}
