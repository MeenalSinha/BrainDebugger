/**
 * PathwayTracer — Workspace for Pathfinding and Downstream Cascade Analysis
 *
 * Provides:
 * 1. Directed shortest-path & alternative-route search between two neurons.
 * 2. Downstream reachability cascade analysis grouped by hop distance.
 * 3. Clear scientific disclaimers and source-scope metadata.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  GitBranch,
  Layers,
  ArrowRight,
  RotateCcw,
  AlertCircle,
  HelpCircle,
  Info,
  CheckCircle,
  Hash,
} from 'lucide-react';
import { api, ApiClientError } from '../api';
import type {
  PathwaySearchResponse,
  PathItem,
  DownstreamCascadeResponse,
  PathRankingStrategy,
} from '../types';

interface Props {
  selectedBodyId: number | null;
  onSelectNeuron: (bodyId: number) => void;
  onPathwayCalculated: (data: PathwaySearchResponse | null) => void;
  onActivePathChanged: (path: PathItem | null) => void;
  onCascadeCalculated: (data: DownstreamCascadeResponse | null) => void;
  onModeChanged: (mode: 'pathway' | 'cascade') => void;
  externalSourceId?: number | null;
  externalTargetId?: number | null;
  externalCascadeRootId?: number | null;
}

export const PathwayTracer: React.FC<Props> = ({
  selectedBodyId,
  onSelectNeuron,
  onPathwayCalculated,
  onActivePathChanged,
  onCascadeCalculated,
  onModeChanged,
  externalSourceId,
  externalTargetId,
  externalCascadeRootId,
}) => {
  const [activeTab, setActiveTab] = useState<'pathway' | 'cascade'>('pathway');

  // Pathway search parameters
  const [sourceId, setSourceId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [maxHops, setMaxHops] = useState<number>(5);
  const [maxPaths, setMaxPaths] = useState<number>(3);
  const [strategy, setStrategy] = useState<PathRankingStrategy>('shortest');
  const [minWeight, setMinWeight] = useState<string>('');

  // Cascade parameters
  const [cascadeRootId, setCascadeRootId] = useState<string>('');
  const [cascadeMaxHops, setCascadeMaxHops] = useState<number>(3);
  const [cascadeMaxNodes, setCascadeMaxNodes] = useState<number>(300);
  const [cascadeMaxEdges, setCascadeMaxEdges] = useState<number>(600);
  const [cascadeMinWeight, setCascadeMinWeight] = useState<string>('');

  // Pathway search state
  const [pathwayLoading, setPathwayLoading] = useState<boolean>(false);
  const [pathwayError, setPathwayError] = useState<string | null>(null);
  const [pathwayResult, setPathwayResult] = useState<PathwaySearchResponse | null>(null);
  const [selectedPathIndex, setSelectedPathIndex] = useState<number>(0);

  // Cascade state
  const [cascadeLoading, setCascadeLoading] = useState<boolean>(false);
  const [cascadeError, setCascadeError] = useState<string | null>(null);
  const [cascadeResult, setCascadeResult] = useState<DownstreamCascadeResponse | null>(null);

  // Request cancellation controllers
  const pathAbortRef = useRef<AbortController | null>(null);
  const cascadeAbortRef = useRef<AbortController | null>(null);

  // Sync external ID setting
  useEffect(() => {
    if (externalSourceId !== undefined && externalSourceId !== null) {
      setSourceId(String(externalSourceId));
    }
  }, [externalSourceId]);

  useEffect(() => {
    if (externalTargetId !== undefined && externalTargetId !== null) {
      setTargetId(String(externalTargetId));
    }
  }, [externalTargetId]);

  useEffect(() => {
    if (externalCascadeRootId !== undefined && externalCascadeRootId !== null) {
      setCascadeRootId(String(externalCascadeRootId));
      setActiveTab('cascade');
      onModeChanged('cascade');
    }
  }, [externalCascadeRootId, onModeChanged]);

  // Tab switch
  const handleTabSwitch = (tab: 'pathway' | 'cascade') => {
    setActiveTab(tab);
    onModeChanged(tab);
  };

  // Run Pathway Search
  const handleTracePathway = async () => {
    const sId = parseInt(sourceId.trim(), 10);
    const tId = parseInt(targetId.trim(), 10);

    if (isNaN(sId) || isNaN(tId)) {
      setPathwayError('Please enter valid numeric Body IDs for both Source and Target.');
      return;
    }

    if (pathAbortRef.current) {
      pathAbortRef.current.abort();
    }
    const controller = new AbortController();
    pathAbortRef.current = controller;

    setPathwayLoading(true);
    setPathwayError(null);

    const mw = minWeight.trim() ? parseInt(minWeight.trim(), 10) : undefined;
    const clampedHops = Math.min(Math.max(maxHops || 5, 1), 10);
    const clampedPaths = Math.min(Math.max(maxPaths || 3, 1), 20);

    try {
      const res = await api.findPaths(
        {
          sourceBodyId: sId,
          targetBodyId: tId,
          maxHops: clampedHops,
          maxPaths: clampedPaths,
          strategy,
          minWeight: mw,
        },
        controller.signal,
      );
      setPathwayResult(res);
      setSelectedPathIndex(0);
      onPathwayCalculated(res);
      if (res.paths.length > 0) {
        onActivePathChanged(res.paths[0]);
      } else {
        onActivePathChanged(null);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = err instanceof ApiClientError ? err.message : (err instanceof Error ? err.message : 'Path search failed.');
      setPathwayError(msg);
      setPathwayResult(null);
      onPathwayCalculated(null);
      onActivePathChanged(null);
    } finally {
      setPathwayLoading(false);
    }
  };

  // Run Cascade Analysis
  const handleRunCascade = async () => {
    const rId = parseInt(cascadeRootId.trim(), 10);
    if (isNaN(rId)) {
      setCascadeError('Please enter a valid numeric Body ID for the root neuron.');
      return;
    }

    if (cascadeAbortRef.current) {
      cascadeAbortRef.current.abort();
    }
    const controller = new AbortController();
    cascadeAbortRef.current = controller;

    setCascadeLoading(true);
    setCascadeError(null);

    const mw = cascadeMinWeight.trim() ? parseInt(cascadeMinWeight.trim(), 10) : undefined;
    const clampedHops = Math.min(Math.max(cascadeMaxHops || 3, 1), 6);
    const clampedNodes = Math.min(Math.max(cascadeMaxNodes || 300, 10), 2000);
    const clampedEdges = Math.min(Math.max(cascadeMaxEdges || 600, 10), 5000);

    try {
      const res = await api.getDownstreamCascade(
        {
          bodyId: rId,
          maxHops: clampedHops,
          maxNodes: clampedNodes,
          maxEdges: clampedEdges,
          minWeight: mw,
        },
        controller.signal,
      );
      setCascadeResult(res);
      onCascadeCalculated(res);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = err instanceof ApiClientError ? err.message : (err instanceof Error ? err.message : 'Cascade calculation failed.');
      setCascadeError(msg);
      setCascadeResult(null);
      onCascadeCalculated(null);
    } finally {
      setCascadeLoading(false);
    }
  };

  // Reset actions
  const handleResetPathway = () => {
    setSourceId('');
    setTargetId('');
    setPathwayResult(null);
    setPathwayError(null);
    onPathwayCalculated(null);
    onActivePathChanged(null);
  };

  const handleResetCascade = () => {
    setCascadeRootId('');
    setCascadeResult(null);
    setCascadeError(null);
    onCascadeCalculated(null);
  };

  const handleSelectPathRow = (idx: number) => {
    setSelectedPathIndex(idx);
    if (pathwayResult && pathwayResult.paths[idx]) {
      onActivePathChanged(pathwayResult.paths[idx]);
    }
  };

  return (
    <div className="pathway-tracer-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Workspace Subtabs */}
      <div className="pathway-tabs-bar" style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <button
          className={`tab-btn ${activeTab === 'pathway' ? 'active' : ''}`}
          onClick={() => handleTabSwitch('pathway')}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: activeTab === 'pathway' ? '2px solid var(--color-primary)' : '2px solid transparent', color: activeTab === 'pathway' ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: 600, fontSize: 13 }}
        >
          <GitBranch size={15} />
          <span>Pathway Search</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'cascade' ? 'active' : ''}`}
          onClick={() => handleTabSwitch('cascade')}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: activeTab === 'cascade' ? '2px solid var(--color-primary)' : '2px solid transparent', color: activeTab === 'cascade' ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: 600, fontSize: 13 }}
        >
          <Layers size={15} />
          <span>Downstream Cascade</span>
        </button>
      </div>

      <div className="pathway-content-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* ── Tab 1: Pathway Search ── */}
        {activeTab === 'pathway' && (
          <div className="pathway-view">
            {/* Search Controls Card */}
            <div className="card control-card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <GitBranch size={16} />
                <span>Structural Pathway Parameters</span>
              </h3>

              {/* Source & Target Inputs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                    Source Neuron (Presynaptic)
                  </label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      type="number"
                      placeholder="e.g. 10001"
                      className="form-control"
                      value={sourceId}
                      onChange={(e) => setSourceId(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    {selectedBodyId && (
                      <button
                        type="button"
                        className="btn btn-xs btn-outline"
                        title={`Use selected #${selectedBodyId} as source`}
                        onClick={() => setSourceId(String(selectedBodyId))}
                      >
                        Use #{selectedBodyId}
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                    Target Neuron (Postsynaptic)
                  </label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      type="number"
                      placeholder="e.g. 814827"
                      className="form-control"
                      value={targetId}
                      onChange={(e) => setTargetId(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    {selectedBodyId && (
                      <button
                        type="button"
                        className="btn btn-xs btn-outline"
                        title={`Use selected #${selectedBodyId} as target`}
                        onClick={() => setTargetId(String(selectedBodyId))}
                      >
                        Use #{selectedBodyId}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Strategy & Limits */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 0.8fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                    Ranking Strategy
                  </label>
                  <select
                    className="form-control"
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value as PathRankingStrategy)}
                  >
                    <option value="shortest">Shortest Structural Paths (fewest hops)</option>
                    <option value="weight_prioritized">Weight-Prioritized (transition fraction product)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                    Max Hops
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    className="form-control"
                    value={maxHops}
                    onChange={(e) => setMaxHops(parseInt(e.target.value, 10) || 5)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                    Max Paths
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    className="form-control"
                    value={maxPaths}
                    onChange={(e) => setMaxPaths(parseInt(e.target.value, 10) || 3)}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleTracePathway}
                  disabled={pathwayLoading || !sourceId.trim() || !targetId.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {pathwayLoading ? (
                    <>
                      <span className="spinner-border spinner-border-sm" />
                      <span>Tracing Paths...</span>
                    </>
                  ) : (
                    <>
                      <GitBranch size={14} />
                      <span>Trace Pathway</span>
                    </>
                  )}
                </button>

                <button
                  className="btn btn-outline"
                  onClick={handleResetPathway}
                  disabled={pathwayLoading}
                  title="Clear inputs and results"
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <RotateCcw size={14} />
                  <span>Reset</span>
                </button>
              </div>

              {pathwayError && (
                <div className="alert alert-danger" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={16} />
                  <span style={{ fontSize: 12 }}>{pathwayError}</span>
                </div>
              )}
            </div>

            {/* Results Section */}
            {pathwayResult && (
              <div className="pathway-results">
                {/* Result Status Header */}
                <div
                  className="results-summary-card"
                  style={{
                    background: pathwayResult.status === 'no_path_found' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                    border: `1px solid ${pathwayResult.status === 'no_path_found' ? '#ef4444' : '#10b981'}`,
                    borderRadius: 8,
                    padding: '12px 16px',
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {pathwayResult.status === 'no_path_found' ? (
                      <AlertCircle size={18} color="#ef4444" />
                    ) : (
                      <CheckCircle size={18} color="#10b981" />
                    )}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>
                        {pathwayResult.status === 'same_node'
                          ? 'Zero-hop path: Source and Target are the same neuron.'
                          : pathwayResult.status === 'no_path_found'
                          ? 'No qualifying route found within the configured search limits.'
                          : `Discovered ${pathwayResult.returned_count} distinct structural route${pathwayResult.returned_count > 1 ? 's' : ''}.`}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                        Searched up to {pathwayResult.max_hops} hops • Explored {pathwayResult.explored_nodes} nodes, {pathwayResult.explored_edges} edges.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Path Comparison Table */}
                {pathwayResult.paths.length > 0 && (
                  <div className="card comparison-table-card" style={{ marginBottom: 16 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                      Discovered Alternative Routes
                    </h4>
                    <table className="connections-table" style={{ width: '100%', fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Hops</th>
                          <th>Route Structure</th>
                          {pathwayResult.strategy === 'weight_prioritized' && <th>Score P(route)</th>}
                          <th>Total Synapses</th>
                          <th>Min Synapse</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pathwayResult.paths.map((p, idx) => {
                          const isSelected = idx === selectedPathIndex;
                          return (
                            <tr
                              key={idx}
                              onClick={() => handleSelectPathRow(idx)}
                              style={{
                                cursor: 'pointer',
                                background: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                              }}
                            >
                              <td style={{ fontWeight: 700 }}>#{p.rank}</td>
                              <td><span className="badge badge-info">{p.hops} hops</span></td>
                              <td>
                                <span className="mono" style={{ fontSize: 11 }}>
                                  {p.nodes.map(n => n.type || `#${n.body_id}`).join(' → ')}
                                </span>
                              </td>
                              {pathwayResult.strategy === 'weight_prioritized' && (
                                <td className="mono" title={`Log-cost: ${p.log_cost?.toFixed(3)}`}>
                                  {p.score !== null ? (p.score < 0.001 ? p.score.toExponential(2) : p.score.toFixed(4)) : '—'}
                                </td>
                              )}
                              <td className="mono">{p.total_weight}</td>
                              <td className="mono">{p.bottleneck_weight}</td>
                              <td>
                                <button
                                  className={`btn btn-xs ${isSelected ? 'btn-primary' : 'btn-outline'}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectPathRow(idx);
                                  }}
                                >
                                  {isSelected ? 'Active' : 'Highlight'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Active Path Node Progression */}
                {pathwayResult.paths[selectedPathIndex] && (
                  <div className="card active-path-details" style={{ marginBottom: 16 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                      Path #{pathwayResult.paths[selectedPathIndex].rank} Step-by-Step Breakdown
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {pathwayResult.paths[selectedPathIndex].nodes.map((node, nIdx) => {
                        const edge = pathwayResult.paths[selectedPathIndex].edges[nIdx];
                        return (
                          <div key={node.body_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '4px 8px',
                                background: 'var(--color-bg-secondary)',
                                borderRadius: 6,
                                cursor: 'pointer',
                              }}
                              onClick={() => onSelectNeuron(node.body_id)}
                              title="Click to inspect this neuron in Inspector"
                            >
                              <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                                #{node.body_id}
                              </span>
                              {node.type && <span style={{ color: 'var(--color-text-muted)' }}>({node.type})</span>}
                              {node.instance && <span style={{ fontSize: 10, color: '#94a3b8' }}>• {node.instance}</span>}
                            </div>

                            {edge && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)', fontSize: 11 }}>
                                <ArrowRight size={14} color="#f59e0b" />
                                <span className="mono" style={{ color: '#f59e0b', fontWeight: 600 }}>
                                  {edge.weight} syn
                                </span>
                                {edge.relative_weight_fraction !== null && (
                                  <span style={{ fontSize: 10, color: '#94a3b8' }}>
                                    ({(edge.relative_weight_fraction * 100).toFixed(1)}% of pre)
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Scientific Disclaimer Card */}
                <div
                  className="card scientific-caveat-card"
                  style={{
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 11,
                    color: '#94a3b8',
                    display: 'flex',
                    gap: 8,
                  }}
                >
                  <Info size={16} color="#38bdf8" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 2 }}>
                      Scientific Provenance & Structural Traversal Semantics
                    </div>
                    <div>
                      {pathwayResult.scientific_qualification}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab 2: Downstream Cascade ── */}
        {activeTab === 'cascade' && (
          <div className="cascade-view">
            {/* Cascade Controls Card */}
            <div className="card control-card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Layers size={16} />
                <span>Downstream Reachability Parameters</span>
              </h3>

              {/* Starting Root Neuron */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                  Starting Root Neuron (Body ID)
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="number"
                    placeholder="e.g. 10001"
                    className="form-control"
                    value={cascadeRootId}
                    onChange={(e) => setCascadeRootId(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  {selectedBodyId && (
                    <button
                      type="button"
                      className="btn btn-xs btn-outline"
                      title={`Use selected #${selectedBodyId} as root`}
                      onClick={() => setCascadeRootId(String(selectedBodyId))}
                    >
                      Use Selected (#{selectedBodyId})
                    </button>
                  )}
                </div>
              </div>

              {/* Cascade Limits */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                    Max Hop Depth (1–6)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    className="form-control"
                    value={cascadeMaxHops}
                    onChange={(e) => setCascadeMaxHops(parseInt(e.target.value, 10) || 3)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                    Max Visited Nodes
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    className="form-control"
                    value={cascadeMaxNodes}
                    onChange={(e) => setCascadeMaxNodes(parseInt(e.target.value, 10) || 300)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                    Max Edges
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="2000"
                    className="form-control"
                    value={cascadeMaxEdges}
                    onChange={(e) => setCascadeMaxEdges(parseInt(e.target.value, 10) || 600)}
                  />
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleRunCascade}
                  disabled={cascadeLoading || !cascadeRootId.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {cascadeLoading ? (
                    <>
                      <span className="spinner-border spinner-border-sm" />
                      <span>Computing Cascade...</span>
                    </>
                  ) : (
                    <>
                      <Layers size={14} />
                      <span>Run Cascade Analysis</span>
                    </>
                  )}
                </button>

                <button
                  className="btn btn-outline"
                  onClick={handleResetCascade}
                  disabled={cascadeLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <RotateCcw size={14} />
                  <span>Reset</span>
                </button>
              </div>

              {cascadeError && (
                <div className="alert alert-danger" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={16} />
                  <span style={{ fontSize: 12 }}>{cascadeError}</span>
                </div>
              )}
            </div>

            {/* Cascade Results */}
            {cascadeResult && (
              <div className="cascade-results">
                {/* Cascade Summary Box */}
                <div
                  className="results-summary-card"
                  style={{
                    background: 'rgba(14, 165, 233, 0.1)',
                    border: '1px solid #0ea5e9',
                    borderRadius: 8,
                    padding: '12px 16px',
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        Downstream Reachability: {cascadeResult.total_unique_nodes} Nodes, {cascadeResult.total_edges} Edges
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                        Root neuron: #{cascadeResult.source_body_id} • Explored up to {cascadeResult.max_hops} synaptic hops
                      </div>
                    </div>

                    {cascadeResult.is_truncated && (
                      <span className="badge badge-warning" title={`Cascade traversal stopped early because ${cascadeResult.truncation_reason} was reached.`}>
                        Partial: {cascadeResult.truncation_reason}
                      </span>
                    )}
                  </div>
                </div>

                {/* Hop Layer Breakdown Table */}
                <div className="card layers-breakdown-card" style={{ marginBottom: 16 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                    Hop Distance Layer Distribution
                  </h4>
                  <table className="connections-table" style={{ width: '100%', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>Hop Distance</th>
                        <th>Newly Discovered</th>
                        <th>Cumulative Reachable</th>
                        <th>Layer Edges</th>
                        <th>Layer Synapses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cascadeResult.layers.map((layer) => (
                        <tr key={layer.hop}>
                          <td>
                            <span className="badge badge-info" style={{ fontWeight: 700 }}>
                              {layer.hop === 0 ? 'Hop 0 (Root)' : `Hop ${layer.hop}`}
                            </span>
                          </td>
                          <td className="mono" style={{ fontWeight: 600 }}>
                            {layer.newly_reached_nodes.toLocaleString()}
                          </td>
                          <td className="mono">
                            {layer.cumulative_nodes.toLocaleString()}
                          </td>
                          <td className="mono">
                            {layer.layer_edges.toLocaleString()}
                          </td>
                          <td className="mono">
                            {layer.layer_weight.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Scientific Disclaimer */}
                <div
                  className="card scientific-caveat-card"
                  style={{
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 11,
                    color: '#94a3b8',
                    display: 'flex',
                    gap: 8,
                  }}
                >
                  <Info size={16} color="#38bdf8" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 2 }}>
                      Graph Distance Semantics & Biological Interpretation
                    </div>
                    <div>
                      {cascadeResult.scientific_qualification}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
