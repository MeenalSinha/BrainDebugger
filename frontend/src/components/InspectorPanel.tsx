/**
 * InspectorPanel — Right panel showing selected neuron metadata and connections.
 */
import React, { useEffect, useState } from 'react';
import { api, ApiClientError } from '../api';
import type { AsyncState, Connection, ConnectionListResponse, Neuron } from '../types';

interface Props {
  bodyId: number | null;
  onSelectPartner: (bodyId: number) => void;
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="field-row">
      <span className="field-label">{label}</span>
      {value != null ? (
        <span className="field-value">{String(value)}</span>
      ) : (
        <span className="field-value--unavailable">—</span>
      )}
    </div>
  );
}

function ConnectionTable({
  connections,
  direction,
  bodyId,
  onSelectPartner,
}: {
  connections: Connection[];
  direction: 'incoming' | 'outgoing';
  bodyId: number;
  onSelectPartner: (id: number) => void;
}) {
  if (connections.length === 0) {
    return (
      <div className="state-box" style={{ padding: '16px 8px' }}>
        <span style={{ fontSize: 18, opacity: 0.3 }}>∅</span>
        <span>No {direction} connections found within the query limit.</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          This does not mean the neuron has no connections in the full dataset.
        </span>
      </div>
    );
  }

  return (
    <table className="conn-table" aria-label={`${direction} connections`}>
      <thead>
        <tr>
          <th>Partner ID</th>
          <th>{direction === 'outgoing' ? 'Post-type' : 'Pre-type'}</th>
          <th style={{ textAlign: 'right' }}>Weight</th>
        </tr>
      </thead>
      <tbody>
        {connections.map(c => {
          const partnerId = direction === 'outgoing' ? c.body_post : c.body_pre;
          const partnerType = direction === 'outgoing' ? c.type_post : c.type_pre;
          return (
            <tr
              key={`${c.body_pre}_${c.body_post}`}
              onClick={() => onSelectPartner(partnerId)}
              role="button"
              tabIndex={0}
              aria-label={`Select neuron ${partnerId}`}
              onKeyDown={e => e.key === 'Enter' && onSelectPartner(partnerId)}
            >
              <td className="mono" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                #{partnerId}
              </td>
              <td style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
                {partnerType ?? '—'}
              </td>
              <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                {c.weight.toLocaleString()}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function InspectorPanel({ bodyId, onSelectPartner }: Props) {
  const [neuronState, setNeuronState] = useState<AsyncState<Neuron>>({ status: 'idle' });
  const [connState, setConnState] = useState<AsyncState<{ incoming: Connection[]; outgoing: Connection[] }>>({ status: 'idle' });
  const [connTab, setConnTab] = useState<'incoming' | 'outgoing'>('outgoing');

  useEffect(() => {
    if (bodyId === null) {
      setNeuronState({ status: 'idle' });
      setConnState({ status: 'idle' });
      return;
    }

    let cancelled = false;

    const loadNeuron = async () => {
      setNeuronState({ status: 'loading' });
      setConnState({ status: 'loading' });
      try {
        const [n, inc, out] = await Promise.all([
          api.getNeuron(bodyId),
          api.getConnections({ bodyId, direction: 'incoming', limit: 100 }),
          api.getConnections({ bodyId, direction: 'outgoing', limit: 100 }),
        ]);
        if (cancelled) return;
        setNeuronState({ status: 'success', data: n });
        setConnState({ status: 'success', data: { incoming: inc.connections, outgoing: out.connections } });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof ApiClientError ? err.detail : 'Failed to load neuron.';
        setNeuronState({ status: 'error', message: msg });
        setConnState({ status: 'error', message: msg });
      }
    };

    loadNeuron();
    return () => { cancelled = true; };
  }, [bodyId]);

  if (bodyId === null) {
    return (
      <>
        <div className="panel-header">
          <h2>Inspector</h2>
        </div>
        <div className="panel-body">
          <div className="state-box">
            <span style={{ fontSize: 28, opacity: 0.25 }}>◎</span>
            <span className="state-box__title">No selection</span>
            <span>Select a neuron from the search results or graph.</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="panel-header">
        <h2>Inspector</h2>
        {neuronState.status === 'success' && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--color-primary)', marginLeft: 'auto' }}>
            #{bodyId}
          </span>
        )}
      </div>

      <div className="panel-body" style={{ padding: '10px 14px' }}>
        {neuronState.status === 'loading' && (
          <div className="state-box">
            <span style={{ fontSize: 18 }}>⟳</span>
            <span className="loading-dots">Loading neuron</span>
          </div>
        )}

        {neuronState.status === 'error' && (
          <div className="state-box">
            <span style={{ fontSize: 20, color: 'var(--color-error)' }}>✕</span>
            <span className="state-box__title" style={{ color: 'var(--color-error)' }}>Load failed</span>
            <span style={{ fontSize: 12 }}>{neuronState.message}</span>
          </div>
        )}

        {neuronState.status === 'success' && (
          <>
            <Field label="Body ID" value={neuronState.data.body_id} />
            <Field label="Cell Type" value={neuronState.data.cell_type} />
            <Field label="Instance" value={neuronState.data.instance} />
            <Field label="Superclass" value={neuronState.data.superclass} />
            <Field label="Status" value={neuronState.data.status} />
            <Field label="Soma Side" value={neuronState.data.soma_side} />
            <Field label="Soma Neuromere" value={neuronState.data.soma_neuromere} />
            {neuronState.data.consensus_nt && (
              <div className="field-row">
                <span className="field-label">Neurotransmitter</span>
                <span>
                  <span className="nt-tag">{neuronState.data.consensus_nt}</span>
                </span>
              </div>
            )}
            <Field label="Pre-synapses" value={neuronState.data.pre_synapses?.toLocaleString() ?? null} />
            <Field label="Post-synapses" value={neuronState.data.post_synapses?.toLocaleString() ?? null} />
          </>
        )}
      </div>

      {/* Connections section */}
      {connState.status !== 'idle' && (
        <>
          <div className="tab-bar">
            <button
              id="tab-outgoing"
              className={`tab${connTab === 'outgoing' ? ' active' : ''}`}
              onClick={() => setConnTab('outgoing')}
            >
              Outgoing
            </button>
            <button
              id="tab-incoming"
              className={`tab${connTab === 'incoming' ? ' active' : ''}`}
              onClick={() => setConnTab('incoming')}
            >
              Incoming
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {connState.status === 'loading' && (
              <div className="state-box" style={{ padding: '16px' }}>
                <span className="loading-dots">Loading connections</span>
              </div>
            )}
            {connState.status === 'error' && (
              <div className="state-box" style={{ padding: '16px' }}>
                <span style={{ color: 'var(--color-error)' }}>Failed to load connections.</span>
              </div>
            )}
            {connState.status === 'success' && (
              <ConnectionTable
                connections={connState.data[connTab]}
                direction={connTab}
                bodyId={bodyId}
                onSelectPartner={onSelectPartner}
              />
            )}
          </div>
        </>
      )}
    </>
  );
}
