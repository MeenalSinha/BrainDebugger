/**
 * BrainDebugger — Main Application
 *
 * Three-panel Connectome Explorer with bottom connection table.
 * All neuron data comes from the real MaleCNS v1.0 dataset via the backend API.
 */
import React, { useCallback, useState } from 'react';
import { StatusPill } from './components/StatusPill';
import { ExplorerPanel } from './components/ExplorerPanel';
import { ConnectomeView } from './components/ConnectomeView';
import { InspectorPanel } from './components/InspectorPanel';
import type { NeuronSearchResult } from './types';

export default function App() {
  const [selectedBodyId, setSelectedBodyId] = useState<number | null>(null);

  const handleSelectResult = useCallback((result: NeuronSearchResult) => {
    setSelectedBodyId(result.body_id);
  }, []);

  const handleSelectNode = useCallback((bodyId: number) => {
    setSelectedBodyId(bodyId);
  }, []);

  const handleSelectPartner = useCallback((bodyId: number) => {
    setSelectedBodyId(bodyId);
  }, []);

  return (
    <div className="app-shell">
      {/* Topbar */}
      <header className="topbar" role="banner">
        <span style={{
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: '-0.01em',
          color: 'var(--color-text)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ color: 'var(--color-primary)', fontSize: 18 }}>⬡</span>
          BrainDebugger
        </span>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', borderLeft: '1px solid var(--color-border)', paddingLeft: 14 }}>
          Connectome Explorer
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {selectedBodyId !== null && (
            <button
              id="btn-clear-selection"
              className="btn btn-sm"
              onClick={() => setSelectedBodyId(null)}
              aria-label="Clear current neuron selection"
            >
              Clear selection
            </button>
          )}
          <StatusPill />
        </div>
      </header>

      {/* Three-panel main area */}
      <main className="main-area" role="main">
        {/* Left: Explorer */}
        <section className="panel" aria-label="Explorer panel">
          <ExplorerPanel
            selectedBodyId={selectedBodyId}
            onSelect={handleSelectResult}
          />
        </section>

        {/* Centre: Graph */}
        <section style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} aria-label="Connectome graph">
          <ConnectomeView
            selectedBodyId={selectedBodyId}
            onSelectNode={handleSelectNode}
          />
        </section>

        {/* Right: Inspector */}
        <section className="panel" style={{ display: 'flex', flexDirection: 'column' }} aria-label="Neuron inspector panel">
          <InspectorPanel
            bodyId={selectedBodyId}
            onSelectPartner={handleSelectPartner}
          />
        </section>
      </main>
    </div>
  );
}
