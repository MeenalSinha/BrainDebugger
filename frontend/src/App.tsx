/**
 * BrainDebugger — Main Application (V3)
 *
 * Workspaces:
 * 1. Connectome Explorer: Three-panel neighborhood & connection explorer.
 * 2. Pathway Tracer: Directed shortest-path, alternative route discovery & downstream cascade analysis.
 * All neuron data comes from the real MaleCNS v1.0 dataset via the backend API.
 */
import React, { useCallback, useState } from 'react';
import { Network, GitBranch, Bug, FlaskConical, BookOpen, Sparkles } from 'lucide-react';
import { StatusPill } from './components/StatusPill';
import { ExplorerPanel } from './components/ExplorerPanel';
import { ConnectomeView } from './components/ConnectomeView';
import { InspectorPanel } from './components/InspectorPanel';
import { PathwayTracer } from './components/PathwayTracer';
import { PathwayGraphView } from './components/PathwayGraphView';
import { NeuralDebugger } from './components/NeuralDebugger';
import { PerturbationLab } from './components/PerturbationLab';
import { KnowledgeExplorer } from './components/KnowledgeExplorer';
import { AskNeuroQuery } from './components/AskNeuroQuery';
import type {
  NeuronSearchResult,
  PathwaySearchResponse,
  PathItem,
  DownstreamCascadeResponse,
} from './types';

export default function App() {
  const [workspace, setWorkspace] = useState<'explorer' | 'pathway' | 'debugger' | 'perturbation' | 'knowledge' | 'neuroquery'>('explorer');
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
          <button
            className={`btn btn-sm ${workspace === 'debugger' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setWorkspace('debugger')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Bug size={14} />
            <span>Neural Debugger</span>
          </button>
          <button
            className={`btn btn-sm ${workspace === 'perturbation' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setWorkspace('perturbation')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <FlaskConical size={14} />
            <span>Perturbation Lab</span>
          </button>
          <button
            className={`btn btn-sm ${workspace === 'knowledge' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setWorkspace('knowledge')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <BookOpen size={14} />
            <span>Knowledge Explorer</span>
          </button>
          <button
            id="btn-nav-neuroquery"
            className={`btn btn-sm ${workspace === 'neuroquery' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setWorkspace('neuroquery')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Sparkles size={14} />
            <span>Ask NeuroQuery</span>
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

      {/* Main Area */}
      <main className="main-area" role="main">
        {workspace === 'explorer' && (
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
        )}

        {workspace === 'pathway' && (
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
                onStartDebugging={(p) => {
                  setActivePath(p);
                  setWorkspace('debugger');
                }}
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

        {workspace === 'debugger' && (
          <>
            {/* Center/Left: Neural Debugger Canvas & Controls */}
            <section
              style={{
                flex: 1,
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
              }}
              aria-label="Neural Debugger Workspace"
            >
              <NeuralDebugger
                path={activePath || (pathwayData?.paths?.[0] ?? null)}
                sourceId={pathwaySourceId || pathwayData?.source_body_id || null}
                targetId={pathwayTargetId || pathwayData?.target_body_id || null}
                selectedBodyId={selectedBodyId}
                onSelectNeuron={handleSelectNode}
                onBackToPathway={() => setWorkspace('pathway')}
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

        {workspace === 'perturbation' && (
          <>
            {/* Center: Perturbation Lab Workspace */}
            <section
              style={{
                flex: 1,
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
              }}
              aria-label="Perturbation Lab Workspace"
            >
              <PerturbationLab
                selectedBodyId={selectedBodyId}
                onSelectNeuron={handleSelectNode}
                initialSourceId={pathwaySourceId}
                initialTargetId={pathwayTargetId}
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

        {workspace === 'knowledge' && (
          <>
            {/* Center/Left: Knowledge Explorer Workspace */}
            <section
              style={{
                gridColumn: '1 / 3',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
              }}
              aria-label="Knowledge Explorer Workspace"
            >
              <KnowledgeExplorer
                onSelectNeuron={handleSelectNode}
                onSetPathwaySource={handleSetPathwaySource}
                onNavigateToExplorer={(bodyId) => {
                  setSelectedBodyId(bodyId);
                  setWorkspace('explorer');
                }}
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

        {workspace === 'neuroquery' && (
          <>
            {/* Center/Left: Ask NeuroQuery Workspace */}
            <section
              style={{
                gridColumn: '1 / 3',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
              }}
              aria-label="Ask NeuroQuery Workspace"
            >
              <AskNeuroQuery
                onSelectNeuron={handleSelectNode}
                onNavigateToKnowledge={() => {
                  setWorkspace('knowledge');
                }}
                onNavigateToExplorer={(bodyId) => {
                  setSelectedBodyId(bodyId);
                  setWorkspace('explorer');
                }}
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
