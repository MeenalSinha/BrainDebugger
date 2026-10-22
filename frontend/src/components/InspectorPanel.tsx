/**
 * BrainDebugger — Enhanced Neuron Inspector & Connectivity Intelligence (V2)
 *
 * Implements structured neuron profile, connectivity intelligence summaries,
 * sortable/filterable/paginated incoming and outgoing connection tables,
 * data provenance, and race-condition-safe async state management.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '../api';
import type {
  AsyncState,
  Connection,
  ConnectionListResponse,
  ConnectivitySummaryResponse,
  Neuron,
} from '../types';

interface Props {
  bodyId: number | null;
  onSelectPartner: (bodyId: number) => void;
  onSetPathwaySource?: (bodyId: number) => void;
  onSetPathwayTarget?: (bodyId: number) => void;
  onTraceCascade?: (bodyId: number) => void;
}

// ── Helper: Format a field or show unavailable ────────────────────────────────
function Field({
  label,
  value,
  mono = true,
  helpText,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
  helpText?: string;
}) {
  return (
    <div className="field-row">
      <div className="field-header">
        <span className="field-label">{label}</span>
        {helpText && <span className="field-help" title={helpText}>ⓘ</span>}
      </div>
      {value != null && String(value).trim() !== '' ? (
        <span className={mono ? 'field-value mono' : 'field-value'}>
          {typeof value === 'number' ? value.toLocaleString() : String(value)}
        </span>
      ) : (
        <span className="field-value--unavailable">—</span>
      )}
    </div>
  );
}

// ── Collapsible Section Component ─────────────────────────────────────────────
function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
  badge,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string | number;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`collapsible-section ${isOpen ? 'open' : 'closed'}`}>
      <button
        type="button"
        className="collapsible-header"
        onClick={() => setIsOpen(prev => !prev)}
        aria-expanded={isOpen}
      >
        <span className="collapsible-chevron">{isOpen ? '▾' : '▸'}</span>
        <span className="collapsible-title">{title}</span>
        {badge != null && <span className="collapsible-badge">{badge}</span>}
      </button>
      {isOpen && <div className="collapsible-content">{children}</div>}
    </div>
  );
}

// ── Connectivity Summary Card Component ───────────────────────────────────────
function ConnectivityOverview({
  summary,
}: {
  summary: ConnectivitySummaryResponse;
}) {
  return (
    <div className="connectivity-overview">
      <div className="summary-cards-grid">
        {/* Outgoing Summary */}
        <div className="summary-card outgoing-card">
          <div className="summary-card__header">
            <span className="summary-direction-indicator out-tag">Outgoing</span>
            <span className="summary-scope-badge">Presynaptic</span>
          </div>
          <div className="summary-metric-group">
            <div className="summary-metric">
              <span className="metric-value mono">
                {summary.outgoing.partner_count.toLocaleString()}
              </span>
              <span className="metric-label">Partners</span>
            </div>
            <div className="summary-metric">
              <span className="metric-value mono">
                {summary.outgoing.total_weight.toLocaleString()}
              </span>
              <span className="metric-label">Total Weight</span>
            </div>
          </div>
          <div className="summary-card__footer">
            <span>
              {summary.outgoing.record_count.toLocaleString()} connection records
            </span>
            {summary.outgoing.body_stat_synapses != null && (
              <span title="Presynaptic sites recorded in body-stats">
                • {summary.outgoing.body_stat_synapses.toLocaleString()} pre-sites
              </span>
            )}
          </div>
        </div>

        {/* Incoming Summary */}
        <div className="summary-card incoming-card">
          <div className="summary-card__header">
            <span className="summary-direction-indicator in-tag">Incoming</span>
            <span className="summary-scope-badge">Postsynaptic</span>
          </div>
          <div className="summary-metric-group">
            <div className="summary-metric">
              <span className="metric-value mono">
                {summary.incoming.partner_count.toLocaleString()}
              </span>
              <span className="metric-label">Partners</span>
            </div>
            <div className="summary-metric">
              <span className="metric-value mono">
                {summary.incoming.total_weight.toLocaleString()}
              </span>
              <span className="metric-label">Total Weight</span>
            </div>
          </div>
          <div className="summary-card__footer">
            <span>
              {summary.incoming.record_count.toLocaleString()} connection records
            </span>
            {summary.incoming.body_stat_synapses != null && (
              <span title="Postsynaptic sites recorded in body-stats">
                • {summary.incoming.body_stat_synapses.toLocaleString()} post-sites
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="source-disclaimer-banner">
        <span className="disclaimer-icon">ℹ</span>
        <span>
          Connections represent the <strong>{summary.dataset}</strong> traced-only subset
          (min-confidence 0.5). Synapse counts reflect dataset records, not complete biological degree.
        </span>
      </div>
    </div>
  );
}

// ── Enhanced Connection Table with Pagination, Sorting & Filtering ───────────
function ConnectionTableSection({
  bodyId,
  direction,
  onSelectPartner,
}: {
  bodyId: number;
  direction: 'incoming' | 'outgoing';
  onSelectPartner: (id: number) => void;
}) {
  const [page, setPage] = useState(0);
  const [pageSize] = useState(25);
  const [sortBy, setSortBy] = useState<'weight' | 'partner_id' | 'partner_type'>('weight');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [filterText, setFilterText] = useState('');
  const [debouncedFilter, setDebouncedFilter] = useState('');

  const [state, setState] = useState<AsyncState<ConnectionListResponse>>({ status: 'idle' });
  const reqIdRef = useRef(0);

  // Debounce filter input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilter(filterText);
      setPage(0); // reset page on new filter
    }, 250);
    return () => clearTimeout(timer);
  }, [filterText]);

  // Reset page on sort change
  const handleSortChange = (newSortBy: 'weight' | 'partner_id' | 'partner_type') => {
    if (sortBy === newSortBy) {
      setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(newSortBy);
      setSortOrder(newSortBy === 'weight' ? 'desc' : 'asc');
    }
    setPage(0);
  };

  const loadConnections = useCallback(async () => {
    const curReq = ++reqIdRef.current;
    setState({ status: 'loading' });

    try {
      const partnerIdParam = /^\d+$/.test(debouncedFilter.trim())
        ? parseInt(debouncedFilter.trim(), 10)
        : undefined;
      const partnerTypeParam = partnerIdParam === undefined && debouncedFilter.trim().length > 0
        ? debouncedFilter.trim()
        : undefined;

      const data = await api.getConnections({
        bodyId,
        direction,
        limit: pageSize,
        offset: page * pageSize,
        sortBy,
        sortOrder,
        partnerId: partnerIdParam,
        partnerType: partnerTypeParam,
      });

      if (curReq === reqIdRef.current) {
        setState({ status: 'success', data });
      }
    } catch (err) {
      if (curReq === reqIdRef.current) {
        const msg = err instanceof ApiClientError ? err.detail : 'Failed to load connections.';
        setState({ status: 'error', message: msg });
      }
    }
  }, [bodyId, direction, page, pageSize, sortBy, sortOrder, debouncedFilter]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const maxWeight = state.status === 'success' && state.data.connections.length > 0
    ? Math.max(...state.data.connections.map(c => c.weight), 1)
    : 1;

  return (
    <div className="connection-section-container">
      {/* Search & Sort Controls */}
      <div className="table-controls-bar">
        <div className="search-filter-input-wrapper">
          <input
            type="text"
            className="filter-input"
            placeholder="Filter by partner type or ID..."
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            aria-label="Filter connections"
          />
          {filterText && (
            <button
              type="button"
              className="clear-filter-btn"
              onClick={() => setFilterText('')}
              title="Clear filter"
            >
              ✕
            </button>
          )}
        </div>

        <div className="sort-controls-group">
          <span className="sort-label">Sort:</span>
          <button
            type="button"
            className={`sort-pill ${sortBy === 'weight' ? 'active' : ''}`}
            onClick={() => handleSortChange('weight')}
            title="Sort by connection synapse weight"
          >
            Weight {sortBy === 'weight' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
          </button>
          <button
            type="button"
            className={`sort-pill ${sortBy === 'partner_id' ? 'active' : ''}`}
            onClick={() => handleSortChange('partner_id')}
            title="Sort numerically by partner body ID"
          >
            ID {sortBy === 'partner_id' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
          </button>
          <button
            type="button"
            className={`sort-pill ${sortBy === 'partner_type' ? 'active' : ''}`}
            onClick={() => handleSortChange('partner_type')}
            title="Sort alphabetically by partner cell type"
          >
            Type {sortBy === 'partner_type' ? (sortOrder === 'desc' ? '↓' : '↑') : ''}
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="table-scroll-area">
        {state.status === 'loading' && (
          <div className="state-box" style={{ padding: '24px 16px' }}>
            <span className="loading-spinner" />
            <span className="loading-dots">Loading connections</span>
          </div>
        )}

        {state.status === 'error' && (
          <div className="state-box" style={{ padding: '24px 16px' }}>
            <span style={{ color: 'var(--color-error)', fontSize: 20 }}>✕</span>
            <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>Error loading connections</span>
            <span style={{ fontSize: 12 }}>{state.message}</span>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              style={{ marginTop: 8 }}
              onClick={loadConnections}
            >
              Retry
            </button>
          </div>
        )}

        {state.status === 'success' && state.data.connections.length === 0 && (
          <div className="state-box" style={{ padding: '28px 16px' }}>
            <span style={{ fontSize: 24, opacity: 0.3 }}>∅</span>
            <span className="state-box__title">
              {debouncedFilter ? 'No matching partners found' : `No ${direction} connections in loaded dataset`}
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {debouncedFilter
                ? 'Try a different partner ID or cell type query.'
                : 'This neuron has no recorded traced connections in the loaded subset.'}
            </span>
          </div>
        )}

        {state.status === 'success' && state.data.connections.length > 0 && (
          <table className="conn-table" aria-label={`${direction} connections table`}>
            <thead>
              <tr>
                <th style={{ width: '90px' }}>Partner ID</th>
                <th>Cell Type & Instance</th>
                <th style={{ width: '80px' }}>Superclass</th>
                <th style={{ width: '100px', textAlign: 'right' }}>Synapses</th>
              </tr>
            </thead>
            <tbody>
              {state.data.connections.map(c => {
                const partnerId = direction === 'outgoing' ? c.body_post : c.body_pre;
                const partnerType = direction === 'outgoing' ? c.type_post : c.type_pre;
                const partnerInstance = direction === 'outgoing' ? c.instance_post : c.instance_pre;
                const partnerSuperclass = direction === 'outgoing' ? c.superclass_post : c.superclass_pre;
                const weightRatio = Math.min(100, Math.max(8, (c.weight / maxWeight) * 100));

                return (
                  <tr
                    key={`${c.body_pre}_${c.body_post}`}
                    onClick={() => onSelectPartner(partnerId)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select partner neuron ${partnerId}`}
                    onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelectPartner(partnerId)}
                  >
                    <td>
                      <div className="partner-id-cell">
                        <span className="mono partner-id">#{partnerId}</span>
                        <span className="direction-glyph" title={direction === 'outgoing' ? 'Outgoing to partner' : 'Incoming from partner'}>
                          {direction === 'outgoing' ? '→' : '←'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="partner-type-cell">
                        <span className="partner-type">{partnerType ?? '—'}</span>
                        {partnerInstance && (
                          <span className="partner-instance">{partnerInstance}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {partnerSuperclass ? (
                        <span className="superclass-badge" title={partnerSuperclass}>
                          {partnerSuperclass}
                        </span>
                      ) : (
                        <span className="field-value--unavailable">—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="weight-cell">
                        <span className="mono weight-value">{c.weight.toLocaleString()}</span>
                        <div className="weight-bar-bg" title={`${c.weight} synapses`}>
                          <div
                            className={`weight-bar-fill ${direction === 'outgoing' ? 'out' : 'in'}`}
                            style={{ width: `${weightRatio}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      {state.status === 'success' && state.data.total_matched > 0 && (
        <div className="table-pagination-footer">
          <div className="pagination-info">
            Showing <strong className="mono">{page * pageSize + 1}</strong>–
            <strong className="mono">{page * pageSize + state.data.connections.length}</strong> of{' '}
            <strong className="mono">{state.data.total_matched.toLocaleString()}</strong>
            {state.data.total_matched !== state.data.total_in_source && (
              <span className="pagination-filter-note">
                {' '}(filtered from {state.data.total_in_source.toLocaleString()})
              </span>
            )}
          </div>

          <div className="pagination-buttons">
            <button
              type="button"
              className="btn btn-sm"
              disabled={page === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              aria-label="Previous page"
            >
              Previous
            </button>
            <span className="page-indicator mono">
              Page {page + 1} of {Math.max(1, Math.ceil(state.data.total_matched / pageSize))}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!state.data.has_more}
              onClick={() => setPage(p => p + 1)}
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main InspectorPanel Component ─────────────────────────────────────────────
export function InspectorPanel({
  bodyId,
  onSelectPartner,
  onSetPathwaySource,
  onSetPathwayTarget,
  onTraceCascade,
}: Props) {
  const [neuronState, setNeuronState] = useState<AsyncState<Neuron>>({ status: 'idle' });
  const [summaryState, setSummaryState] = useState<AsyncState<ConnectivitySummaryResponse>>({ status: 'idle' });
  const [activeTab, setActiveTab] = useState<'outgoing' | 'incoming'>('outgoing');

  // Tracking request ID to prevent race conditions
  const loadCountRef = useRef(0);

  const fetchNeuronData = useCallback(async () => {
    if (bodyId === null) {
      setNeuronState({ status: 'idle' });
      setSummaryState({ status: 'idle' });
      return;
    }

    const currentLoad = ++loadCountRef.current;
    setNeuronState({ status: 'loading' });
    setSummaryState({ status: 'loading' });

    // Fetch neuron profile metadata
    api.getNeuron(bodyId)
      .then(data => {
        if (currentLoad === loadCountRef.current) {
          setNeuronState({ status: 'success', data });
        }
      })
      .catch(err => {
        if (currentLoad === loadCountRef.current) {
          const msg = err instanceof ApiClientError ? err.detail : 'Failed to load neuron profile.';
          setNeuronState({ status: 'error', message: msg });
        }
      });

    // Fetch connectivity intelligence summary
    api.getConnectivitySummary(bodyId)
      .then(data => {
        if (currentLoad === loadCountRef.current) {
          setSummaryState({ status: 'success', data });
        }
      })
      .catch(err => {
        if (currentLoad === loadCountRef.current) {
          const msg = err instanceof ApiClientError ? err.detail : 'Failed to calculate connectivity summary.';
          setSummaryState({ status: 'error', message: msg });
        }
      });
  }, [bodyId]);

  useEffect(() => {
    fetchNeuronData();
  }, [fetchNeuronData]);

  if (bodyId === null) {
    return (
      <>
        <div className="panel-header">
          <h2>Neuron Inspector</h2>
        </div>
        <div className="panel-body">
          <div className="state-box">
            <span style={{ fontSize: 32, opacity: 0.25 }}>◎</span>
            <span className="state-box__title">No Neuron Selected</span>
            <span>Select a neuron from search results or click a graph node to inspect.</span>
          </div>
        </div>
      </>
    );
  }

  const neuron = neuronState.status === 'success' ? neuronState.data : null;
  const summary = summaryState.status === 'success' ? summaryState.data : null;

  return (
    <div className="inspector-panel-container">
      {/* Identity Header */}
      <div className="panel-header inspector-header">
        <div className="header-identity">
          <h2>Neuron Inspector</h2>
          <span className="header-body-id mono">#{bodyId}</span>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-refresh"
          onClick={fetchNeuronData}
          title="Refresh neuron and connectivity from server"
          aria-label="Refresh neuron data"
        >
          ⟳ Refresh
        </button>
      </div>

      <div className="inspector-scroll-container">
        {/* Profile Card Header */}
        <div className="profile-identity-card">
          <div className="identity-title-row">
            <span className="identity-type">
              {neuron?.cell_type || neuron?.instance || `#${bodyId} (untyped)`}
            </span>
            {neuron?.status && (
              <span className={`status-tag status-${neuron.status.toLowerCase().replace(/\s+/g, '-')}`}>
                {neuron.status}
              </span>
            )}
          </div>

          {neuron?.instance && neuron.instance !== neuron.cell_type && (
            <div className="identity-sub-row">
              <span className="instance-name">{neuron.instance}</span>
            </div>
          )}

          <div className="identity-badges-row">
            {neuron?.consensus_nt && (
              <span className="nt-badge" title="Predicted consensus neurotransmitter">
                NT: {neuron.consensus_nt}
              </span>
            )}
            {neuron?.superclass && (
              <span className="meta-badge" title="Superclass">
                {neuron.superclass}
              </span>
            )}
            {neuron?.subclass && (
              <span className="meta-badge" title="Subclass">
                {neuron.subclass}
              </span>
            )}
            {neuron?.soma_side && (
              <span className="meta-badge" title={`Soma side: ${neuron.soma_side}`}>
                Side: {neuron.soma_side}
              </span>
            )}
          </div>

          {(onSetPathwaySource || onSetPathwayTarget || onTraceCascade) && bodyId && (
            <div className="identity-actions-row" style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {onSetPathwaySource && (
                <button
                  type="button"
                  className="btn btn-xs btn-outline"
                  onClick={() => onSetPathwaySource(bodyId)}
                  title="Use as Pathway Source"
                >
                  Set Source
                </button>
              )}
              {onSetPathwayTarget && (
                <button
                  type="button"
                  className="btn btn-xs btn-outline"
                  onClick={() => onSetPathwayTarget(bodyId)}
                  title="Use as Pathway Target"
                >
                  Set Target
                </button>
              )}
              {onTraceCascade && (
                <button
                  type="button"
                  className="btn btn-xs btn-outline"
                  onClick={() => onTraceCascade(bodyId)}
                  title="Trace Downstream Cascade"
                >
                  Trace Cascade
                </button>
              )}
            </div>
          )}
        </div>

        {/* Connectivity Intelligence Overview */}
        {summaryState.status === 'loading' && (
          <div className="state-box" style={{ padding: '16px 8px' }}>
            <span className="loading-spinner" />
            <span className="loading-dots">Calculating connectivity intelligence</span>
          </div>
        )}

        {summaryState.status === 'error' && (
          <div className="state-box" style={{ padding: '12px', background: '#fee2e2', borderRadius: 4 }}>
            <span style={{ color: 'var(--color-error)', fontSize: 12 }}>
              Summary unavailable: {summaryState.message}
            </span>
          </div>
        )}

        {summary && <ConnectivityOverview summary={summary} />}

        {/* Profile Metadata Sections */}
        {neuronState.status === 'loading' && (
          <div className="state-box" style={{ padding: '16px' }}>
            <span className="loading-spinner" />
            <span className="loading-dots">Loading neuron profile</span>
          </div>
        )}

        {neuronState.status === 'error' && (
          <div className="state-box" style={{ padding: '16px' }}>
            <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>Failed to load profile</span>
            <span style={{ fontSize: 12 }}>{neuronState.message}</span>
            <button type="button" className="btn btn-sm btn-primary" onClick={fetchNeuronData}>
              Retry
            </button>
          </div>
        )}

        {neuron && (
          <div className="profile-sections-wrapper">
            {/* Identity & Classification */}
            <CollapsibleSection title="Identity & Classification" defaultOpen={true}>
              <Field label="Body ID" value={neuron.body_id} />
              <Field label="Cell Type" value={neuron.cell_type} mono={false} />
              <Field label="Instance Name" value={neuron.instance} mono={false} />
              <Field label="Superclass" value={neuron.superclass} mono={false} />
              <Field label="Subclass" value={neuron.subclass} mono={false} />
              <Field label="Hemibrain Type" value={neuron.hemi_brain_type} mono={false} />
              <Field label="Status" value={neuron.status} mono={false} />
              <Field label="Status Label" value={neuron.status_label} mono={false} />
              <Field label="Dimorphism" value={neuron.dimorphism} mono={false} />
              <Field label="Group" value={neuron.group} mono={false} />
            </CollapsibleSection>

            {/* Anatomical Annotations */}
            <CollapsibleSection title="Anatomical Annotations" defaultOpen={false}>
              <Field label="Soma Side" value={neuron.soma_side} />
              <Field label="Soma Neuromere" value={neuron.soma_neuromere} />
              <Field label="Entry Nerve" value={neuron.entry_nerve} mono={false} />
              <Field label="Exit Nerve" value={neuron.exit_nerve} mono={false} />
            </CollapsibleSection>

            {/* Neurotransmitter & Physiology */}
            <CollapsibleSection title="Neurotransmitter & Physiology" defaultOpen={false}>
              <Field label="Consensus NT" value={neuron.consensus_nt} />
              <div className="section-note">
                Predicted neurotransmitter describes presynaptic release chemistry. Physiological
                effect (excitation/inhibition) depends on specific postsynaptic receptor expression.
              </div>
            </CollapsibleSection>

            {/* Recorded Synapse Statistics */}
            <CollapsibleSection title="Recorded Synapse Statistics" defaultOpen={false}>
              <Field
                label="Pre-Synaptic Sites"
                value={neuron.pre_synapses}
                helpText="Recorded presynaptic T-bar sites in body-stats"
              />
              <Field
                label="Post-Synaptic Sites"
                value={neuron.post_synapses}
                helpText="Recorded postsynaptic density sites in body-stats"
              />
              <Field
                label="Total Synweight"
                value={neuron.synweight}
                helpText="Overall synaptic weight recorded in body-stats"
              />
              <div className="section-note">
                Body-level statistics reflect full segmented body sites. Connection tables below reflect
                the traced-only connectome weights subset.
              </div>
            </CollapsibleSection>

            {/* Data Provenance & Scope */}
            <CollapsibleSection title="Data Provenance & Scope" defaultOpen={false}>
              <Field label="Dataset" value={neuron.dataset || 'male-cns:v1.0'} mono={false} />
              <Field
                label="Citation"
                value="Schlegel et al., Nature 634, 139–152 (2024)"
                mono={false}
              />
              <Field label="License" value="Creative Commons BY 4.0" mono={false} />
              <div className="section-note">
                Loaded files: body-annotations, body-neurotransmitters, body-stats (filtered),
                connectome-weights (traced-only minconf 0.5).
              </div>
            </CollapsibleSection>
          </div>
        )}

        {/* Connections Section */}
        <div className="connections-container">
          <div className="tab-bar">
            <button
              id="tab-outgoing"
              type="button"
              className={`tab ${activeTab === 'outgoing' ? 'active' : ''}`}
              onClick={() => setActiveTab('outgoing')}
              aria-selected={activeTab === 'outgoing'}
            >
              Outgoing {summary ? `(${summary.outgoing.partner_count.toLocaleString()})` : ''}
            </button>
            <button
              id="tab-incoming"
              type="button"
              className={`tab ${activeTab === 'incoming' ? 'active' : ''}`}
              onClick={() => setActiveTab('incoming')}
              aria-selected={activeTab === 'incoming'}
            >
              Incoming {summary ? `(${summary.incoming.partner_count.toLocaleString()})` : ''}
            </button>
          </div>

          <ConnectionTableSection
            bodyId={bodyId}
            direction={activeTab}
            onSelectPartner={onSelectPartner}
          />
        </div>
      </div>
    </div>
  );
}
