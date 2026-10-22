/**
 * BrainDebugger — Main Application (V3)
 *
 * Workspaces:
 * 1. Connectome Explorer: Three-panel neighborhood & connection explorer.
 * 2. Pathway Tracer: Directed shortest-path, alternative route discovery & downstream cascade analysis.
 * All neuron data comes from the real MaleCNS v1.0 dataset via the backend API.
 */
import React, { useCallback, useState } from 'react';
import { Network, GitBranch } from 'lucide-react';
import { StatusPill } from './components/StatusPill';
import { ExplorerPanel } from './components/ExplorerPanel';
import { ConnectomeView } from './components/ConnectomeView';
import { InspectorPanel } from './components/InspectorPanel';
import { PathwayTracer } from './components/PathwayTracer';
import { PathwayGraphView } from './components/PathwayGraphView';
import type {
  NeuronSearchResult,
  PathwaySearchResponse,
  PathItem,
  DownstreamCascadeResponse,
} from './types';

export default function App() {
  const [workspace, setWorkspace] = useState<'explorer' | 'pathway'>('explorer');
  const [selectedBodyId, setSelectedBodyId] = useState<number | null>(null);

  // Pathway & Cascade state
  const [pathwaySourceId, setPathwaySourceId] = useState<number | null>(null);
  const [pathwayTargetId, setPathwayTargetId] = useState<number | null>(null);
  const [cascadeRootId, setCascadeRootId] = useState<number | null>(null);
  const [pathwayData, setPathwayData] = useState<PathwaySearchResponse | null>(null);
  const [activePath, setActivePath] = useState<PathItem | null>(null);
  const [cascadeData, setCascadeData] = useState<DownstreamCascadeResponse | null>(null);
  const [pathwayGraphMode, setPathwayGraphMode] = useState<'pathway' | 'cascade'>('pathway');

  const handleSelectResult = useCallback((result: NeuronSearchResult) => {
    setSelectedBodyId(result.body_id);
  }, []);

  const handleSelectNode = useCallback((bodyId: number) => {
    setSelectedBodyId(bodyId);
  }, []);

  const handleSelectPartner = useCallback((bodyId: number) => {
    setSelectedBodyId(bodyId);
  }, []);

  const handleSetPathwaySource = useCallback((bodyId: number) => {
    setPathwaySourceId(bodyId);
    setWorkspace('pathway');
    setPathwayGraphMode('pathway');
  }, []);

  const handleSetPathwayTarget = useCallback((bodyId: number) => {
    setPathwayTargetId(bodyId);
    setWorkspace('pathway');
    setPathwayGraphMode('pathway');
  }, []);

  const handleTraceCascade = useCallback((bodyId: number) => {
    setCascadeRootId(bodyId);
    setWorkspace('pathway');
    setPathwayGraphMode('cascade');
  }, []);

  return (
    <div className="app-shell">
      {/* Topbar */}
      <header className="topbar" role="banner">
        <span
          style={{
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: '-0.01em',
            color: 'var(--color-text)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ color: 'var(--color-primary)', fontSize: 18 }}>⬡</span>
          BrainDebugger
        </span>

        {/* Workspace Navigation Switcher */}
        <div className="workspace-switcher" style={{ display: 'flex', marginLeft: 24, gap: 4 }}>
          <button
            className={`btn btn-sm ${workspace === 'explorer' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setWorkspace('explorer')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Network size={14} />
            <span>Connectome Explorer</span>
          </button>
          <button
            className={`btn btn-sm ${workspace === 'pathway' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setWorkspace('pathway')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <GitBranch size={14} />
            <span>Pathway Tracer</span>
          </button>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {selectedBodyId !== null && (
            <button
              id="btn-clear-selection"
              className="btn btn-sm"
              onClick={() => setSelectedBodyId(null)}
              aria-label="Clear current neuron selection"
            >
              Clear selection (#{selectedBodyId})
            </button>
          )}
          <StatusPill />
        </div>
      </header>

      {/* Main Area: Three-Panel Layout */}
      <main className="main-area" role="main">
        {workspace === 'explorer' ? (
          <>
            {/* Left: Explorer Panel */}
            <section className="panel" aria-label="Explorer panel">
              <ExplorerPanel
                selectedBodyId={selectedBodyId}
                onSelect={handleSelectResult}
              />
            </section>

            {/* Centre: Connectome Graph */}
            <section
              style={{
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
              aria-label="Connectome graph"
            >
              <ConnectomeView
                selectedBodyId={selectedBodyId}
                onSelectNode={handleSelectNode}
              />
            </section>

            {/* Right: Inspector */}
            <section
              className="panel"
              style={{ display: 'flex', flexDirection: 'column' }}
              aria-label="Neuron inspector panel"
            >
              <InspectorPanel
                bodyId={selectedBodyId}
                onSelectPartner={handleSelectPartner}
                onSetPathwaySource={handleSetPathwaySource}
                onSetPathwayTarget={handleSetPathwayTarget}
                onTraceCascade={handleTraceCascade}
              />
            </section>
          </>
        ) : (
          <>
            {/* Left: Pathway Tracer Controls & Comparison Tables */}
            <section className="panel" aria-label="Pathway tracer panel">
              <PathwayTracer
                selectedBodyId={selectedBodyId}
                onSelectNeuron={handleSelectNode}
                onPathwayCalculated={setPathwayData}
                onActivePathChanged={setActivePath}
                onCascadeCalculated={setCascadeData}
                onModeChanged={setPathwayGraphMode}
                externalSourceId={pathwaySourceId}
                externalTargetId={pathwayTargetId}
                externalCascadeRootId={cascadeRootId}
              />
            </section>

            {/* Centre: Pathway & Cascade Graph View */}
            <section
              style={{
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
              aria-label="Pathway and cascade graph visualization"
            >
              <PathwayGraphView
                mode={pathwayGraphMode}
                pathwayData={pathwayData}
                activePath={activePath}
                cascadeData={cascadeData}
                selectedBodyId={selectedBodyId}
                onSelectNode={handleSelectNode}
                onSetSource={handleSetPathwaySource}
                onSetTarget={handleSetPathwayTarget}
                onSetCascadeRoot={handleTraceCascade}
              />
            </section>

            {/* Right: Inspector */}
            <section
              className="panel"
              style={{ display: 'flex', flexDirection: 'column' }}
              aria-label="Neuron inspector panel"
            >
              <InspectorPanel
                bodyId={selectedBodyId}
                onSelectPartner={handleSelectPartner}
                onSetPathwaySource={handleSetPathwaySource}
                onSetPathwayTarget={handleSetPathwayTarget}
                onTraceCascade={handleTraceCascade}
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
