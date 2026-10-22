/**
 * BrainDebugger — Neural Debugger Workspace (V4)
 *
 * Interactive step-by-step pathway debugging environment:
 * 1. Execution controls (Previous, Step, Continue, Pause, Stop, Restart).
 * 2. Breakpoint Manager (Neuron ID, Hop index, Annotation, Synapse weight).
 * 3. Route step checklist & history navigation.
 * 4. Transparent event log with JSON export.
 * 5. Full Cytoscape graph & Neuron Inspector synchronization.
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Square,
  RotateCcw,
  Bug,
  Plus,
  Trash2,
  Download,
  Info,
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowRight,
  Filter,
  Layers,
  Activity,
  Sliders,
} from 'lucide-react';
import type {
  Breakpoint,
  BreakpointType,
  PathEdge,
  PathItem,
  PathNode,
  TraceEvent,
  TraceSession,
} from '../types';
import {
  createTraceSession,
  stepForward,
  stepBackward,
  jumpToStep,
  startOrContinueTrace,
  pauseTrace,
  stopTrace,
  resetTrace,
  addBreakpoint,
  toggleBreakpoint,
  removeBreakpoint,
  exportTraceSessionJson,
} from '../traceEngine';
import { PathwayGraphView } from './PathwayGraphView';

interface Props {
  path: PathItem | null;
  sourceId: number | null;
  targetId: number | null;
  selectedBodyId: number | null;
  onSelectNeuron: (bodyId: number) => void;
  onBackToPathway?: () => void;
}

export const NeuralDebugger: React.FC<Props> = ({
  path,
  sourceId,
  targetId,
  selectedBodyId,
  onSelectNeuron,
  onBackToPathway,
}) => {
  const [session, setSession] = useState<TraceSession | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [playbackSpeedMs, setPlaybackSpeedMs] = useState<number>(750);
  const [activeTab, setActiveTab] = useState<'steps' | 'breakpoints' | 'events'>('steps');
  const [eventFilter, setEventFilter] = useState<'all' | 'traversal' | 'breakpoint' | 'lifecycle'>('all');

  // Breakpoint creator form state
  const [showBpForm, setShowBpForm] = useState<boolean>(false);
  const [newBpName, setNewBpName] = useState<string>('');
  const [newBpType, setNewBpType] = useState<BreakpointType>('neuron');
  const [newBpBodyId, setNewBpBodyId] = useState<string>('');
  const [newBpHop, setNewBpHop] = useState<number>(1);
  const [newBpField, setNewBpField] = useState<'type' | 'superclass' | 'instance'>('type');
  const [newBpVal, setNewBpVal] = useState<string>('');
  const [newBpWeight, setNewBpWeight] = useState<string>('10');

  // Timer ref for automatic playback
  const autoRunTimerRef = useRef<number | null>(null);

  // Initialize session whenever active path changes
  useEffect(() => {
    if (!path || sourceId === null || targetId === null) {
      setSession(null);
      setInitError('No path loaded. Please select or calculate a pathway in the Pathway Tracer first.');
      return;
    }

    try {
      const newSession = createTraceSession(path, sourceId, targetId, [], playbackSpeedMs);
      setSession(newSession);
      setInitError(null);
      // Select source neuron
      if (newSession.path.nodes.length > 0) {
        onSelectNeuron(newSession.path.nodes[0].body_id);
      }
    } catch (err: unknown) {
      setSession(null);
      setInitError(err instanceof Error ? err.message : 'Failed to initialize trace session.');
    }

    return () => {
      if (autoRunTimerRef.current !== null) {
        window.clearInterval(autoRunTimerRef.current);
        autoRunTimerRef.current = null;
      }
    };
  }, [path, sourceId, targetId]);

  // Clean up auto-run timer on unmount
  useEffect(() => {
    return () => {
      if (autoRunTimerRef.current !== null) {
        window.clearInterval(autoRunTimerRef.current);
        autoRunTimerRef.current = null;
      }
    };
  }, []);

  // Update speed in session
  const handleSpeedChange = (ms: number) => {
    setPlaybackSpeedMs(ms);
    if (session) {
      setSession({ ...session, playbackSpeedMs: ms });
    }
  };

  // Stop auto-run timer
  const stopAutoRun = () => {
    if (autoRunTimerRef.current !== null) {
      window.clearInterval(autoRunTimerRef.current);
      autoRunTimerRef.current = null;
    }
  };

  // Execution Control Handlers
  const handleStep = () => {
    if (!session) return;
    stopAutoRun();

    const { session: nextSession } = stepForward(session);
    setSession(nextSession);

    const currentNode = nextSession.path.nodes[nextSession.currentStep];
    if (currentNode) {
      onSelectNeuron(currentNode.body_id);
    }
  };

  const handleStepBack = () => {
    if (!session) return;
    stopAutoRun();

    const nextSession = stepBackward(session);
    setSession(nextSession);

    const currentNode = nextSession.path.nodes[nextSession.currentStep];
    if (currentNode) {
      onSelectNeuron(currentNode.body_id);
    }
  };

  const handleJumpToStep = (stepIdx: number) => {
    if (!session) return;
    stopAutoRun();

    const nextSession = jumpToStep(session, stepIdx);
    setSession(nextSession);

    const currentNode = nextSession.path.nodes[nextSession.currentStep];
    if (currentNode) {
      onSelectNeuron(currentNode.body_id);
    }
  };

  const handleContinue = () => {
    if (!session) return;
    if (session.status === 'completed') return;
    stopAutoRun();

    const runningSession = startOrContinueTrace(session);
    setSession(runningSession);

    // Start auto-run interval
    autoRunTimerRef.current = window.setInterval(() => {
      setSession((prevSession) => {
        if (!prevSession || prevSession.status !== 'running') {
          stopAutoRun();
          return prevSession;
        }

        const { session: nextS, triggeredBreakpoints } = stepForward(prevSession);

        const currNode = nextS.path.nodes[nextS.currentStep];
        if (currNode) {
          onSelectNeuron(currNode.body_id);
        }

        if (triggeredBreakpoints.length > 0 || nextS.status === 'completed' || nextS.status === 'paused') {
          stopAutoRun();
        }

        return nextS;
      });
    }, playbackSpeedMs);
  };

  const handlePause = () => {
    if (!session) return;
    stopAutoRun();
    const paused = pauseTrace(session, 'Paused by user');
    setSession(paused);
  };

  const handleStop = () => {
    if (!session) return;
    stopAutoRun();
    const stopped = stopTrace(session);
    setSession(stopped);
  };

  const handleRestart = () => {
    if (!session) return;
    stopAutoRun();
    const restarted = resetTrace(session);
    setSession(restarted);
    if (restarted.path.nodes.length > 0) {
      onSelectNeuron(restarted.path.nodes[0].body_id);
    }
  };

  // Breakpoint Management
  const handleAddBreakpointSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    const name = newBpName.trim() || `${newBpType.toUpperCase()} BP`;
    let bpData: Omit<Breakpoint, 'id' | 'hitCount' | 'lastHitStep'> = {
      name,
      type: newBpType,
      enabled: true,
    };

    if (newBpType === 'neuron') {
      const bId = parseInt(newBpBodyId.trim(), 10);
      if (isNaN(bId)) return;
      bpData.neuronBodyId = bId;
    } else if (newBpType === 'hop') {
      bpData.hopIndex = Math.max(0, Math.min(newBpHop, session.path.hops));
    } else if (newBpType === 'annotation') {
      if (!newBpVal.trim()) return;
      bpData.annotationField = newBpField;
      bpData.annotationValue = newBpVal.trim();
    } else if (newBpType === 'weight') {
      const w = parseInt(newBpWeight.trim(), 10);
      if (isNaN(w)) return;
      bpData.minWeightThreshold = w;
    }

    const updated = addBreakpoint(session, bpData);
    setSession(updated);
    setShowBpForm(false);
    setNewBpName('');
    setNewBpVal('');
  };

  const handleToggleBp = (id: string) => {
    if (!session) return;
    setSession(toggleBreakpoint(session, id));
  };

  const handleRemoveBp = (id: string) => {
    if (!session) return;
    setSession(removeBreakpoint(session, id));
  };

  // Export JSON
  const handleExportJson = () => {
    if (!session) return;
    const jsonStr = exportTraceSessionJson(session);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `braindebugger-trace-${session.sessionId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filtered Events
  const filteredEvents = useMemo(() => {
    if (!session) return [];
    if (eventFilter === 'all') return session.events;
    if (eventFilter === 'traversal') {
      return session.events.filter((e) =>
        ['node_entered', 'edge_traversed', 'step_advanced', 'history_navigation'].includes(e.type),
      );
    }
    if (eventFilter === 'breakpoint') {
      return session.events.filter((e) =>
        ['breakpoint_created', 'breakpoint_toggled', 'breakpoint_removed', 'breakpoint_triggered'].includes(e.type),
      );
    }
    if (eventFilter === 'lifecycle') {
      return session.events.filter((e) =>
        ['session_created', 'trace_started', 'trace_paused', 'trace_resumed', 'trace_stopped', 'trace_completed', 'trace_reset'].includes(e.type),
      );
    }
    return session.events;
  }, [session, eventFilter]);

  // Derived current step details
  const currentNode: PathNode | undefined = session ? session.path.nodes[session.currentStep] : undefined;
  const currentEdge: PathEdge | undefined =
    session && session.currentStep > 0 ? session.path.edges[session.currentStep - 1] : undefined;

  // Set of node IDs with active breakpoints
  const bpNodeIds = useMemo(() => {
    if (!session) return new Set<number>();
    const s = new Set<number>();
    for (const b of session.breakpoints) {
      if (b.enabled && b.type === 'neuron' && b.neuronBodyId !== undefined) {
        s.add(b.neuronBodyId);
      }
    }
    return s;
  }, [session]);

  if (initError || !session) {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center', margin: 24 }}>
        <Bug size={40} color="#f59e0b" style={{ margin: '0 auto 16px auto' }} />
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Neural Debugger</h3>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13, maxWidth: 500, margin: '0 auto 20px auto' }}>
          {initError || 'Please compute and select a pathway in the Pathway Tracer workspace first.'}
        </p>
        {onBackToPathway && (
          <button className="btn btn-primary" onClick={onBackToPathway}>
            Go to Pathway Tracer
          </button>
        )}
      </div>
    );
  }

  const isRunning = session.status === 'running';
  const isCompleted = session.status === 'completed';
  const isAtSource = session.currentStep === 0;
  const isAtEnd = session.currentStep >= session.path.nodes.length - 1;

  // Status badge styling
  const statusBadge = () => {
    switch (session.status) {
      case 'running':
        return <span className="badge badge-success" style={{ animation: 'pulse 1.5s infinite' }}>● RUNNING</span>;
      case 'paused':
        return <span className="badge badge-warning">⏸ PAUSED</span>;
      case 'completed':
        return <span className="badge badge-info">✓ COMPLETED</span>;
      case 'stopped':
        return <span className="badge" style={{ background: '#64748b', color: '#fff' }}>⏹ STOPPED</span>;
      case 'ready':
      default:
        return <span className="badge badge-outline">READY</span>;
    }
  };

  return (
    <div className="neural-debugger-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── Top Header Bar ── */}
      <div
        className="debugger-header-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Bug size={18} color="#f59e0b" />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Neural Debugger</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'var(--color-bg-secondary)', padding: '4px 10px', borderRadius: 6 }}>
            <span style={{ fontWeight: 600, color: '#10b981' }}>#{session.sourceBodyId}</span>
            <ArrowRight size={13} color="#94a3b8" />
            <span style={{ fontWeight: 600, color: '#f43f5e' }}>#{session.targetBodyId}</span>
            <span style={{ color: 'var(--color-text-muted)', marginLeft: 4 }}>
              (Route #{session.pathRank} • {session.path.hops} hops • {session.path.total_weight} synapses)
            </span>
          </div>

          {statusBadge()}
        </div>

        {/* Playback & History Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Speed Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-muted)' }}>
            <Sliders size={13} />
            <span>Speed:</span>
            <select
              className="form-control"
              style={{ padding: '2px 6px', fontSize: 11, height: 26 }}
              value={playbackSpeedMs}
              onChange={(e) => handleSpeedChange(parseInt(e.target.value, 10))}
              disabled={isRunning}
            >
              <option value={250}>Fast (250ms)</option>
              <option value={500}>Medium (500ms)</option>
              <option value={750}>Default (750ms)</option>
              <option value={1200}>Slow (1.2s)</option>
              <option value={2000}>Very Slow (2.0s)</option>
            </select>
          </div>

          {/* Action Buttons */}
          <button
            id="dbg-step-prev-btn"
            className="btn btn-sm btn-outline"
            title="Step Back / Inspect Previous"
            disabled={isAtSource || isRunning}
            onClick={handleStepBack}
          >
            <SkipBack size={14} />
            <span>Previous</span>
          </button>

          <button
            id="dbg-step-next-btn"
            className="btn btn-sm btn-outline"
            title="Step Forward One Directed Edge"
            disabled={isAtEnd || isRunning}
            onClick={handleStep}
          >
            <SkipForward size={14} />
            <span>Step</span>
          </button>

          {isRunning ? (
            <button id="dbg-pause-btn" className="btn btn-sm btn-warning" title="Pause automatic execution" onClick={handlePause}>
              <Pause size={14} />
              <span>Pause</span>
            </button>
          ) : (
            <button
              id="dbg-continue-btn"
              className="btn btn-sm btn-primary"
              title="Continue automatic execution"
              disabled={isCompleted}
              onClick={handleContinue}
            >
              <Play size={14} />
              <span>Continue</span>
            </button>
          )}

          <button id="dbg-stop-btn" className="btn btn-sm btn-outline" title="Stop trace session" disabled={session.status === 'stopped'} onClick={handleStop}>
            <Square size={14} />
            <span>Stop</span>
          </button>

          <button id="dbg-restart-btn" className="btn btn-sm btn-outline" title="Restart to Source Node" onClick={handleRestart}>
            <RotateCcw size={14} />
            <span>Restart</span>
          </button>

          <button id="dbg-export-json-btn" className="btn btn-sm btn-outline" title="Export trace history as JSON" onClick={handleExportJson}>
            <Download size={14} />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* ── Status Explanation Banner (When paused or completed) ── */}
      {session.lastPausedReason && (
        <div
          style={{
            padding: '6px 16px',
            background: session.status === 'completed' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
            borderBottom: '1px solid var(--color-border)',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: session.status === 'completed' ? '#10b981' : '#f59e0b',
          }}
        >
          {session.status === 'completed' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          <span>
            <strong>Trace Notice:</strong> {session.lastPausedReason}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-muted)' }}>
            Step {session.currentStep} of {session.path.nodes.length - 1} • Hop {currentNode?.hop || 0}
          </span>
        </div>
      )}

      {/* ── Main Debugger Content (3-column layout) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* ── Left Column: Route Steps & Breakpoints ── */}
        <div
          style={{
            borderRight: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--color-surface)',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Subtabs: Route Steps vs Breakpoints */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)' }}>
            <button
              id="dbg-tab-steps"
              className={`tab-btn ${activeTab === 'steps' ? 'active' : ''}`}
              style={{
                flex: 1,
                padding: '8px 10px',
                fontSize: 12,
                fontWeight: 600,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                borderBottom: activeTab === 'steps' ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: activeTab === 'steps' ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}
              onClick={() => setActiveTab('steps')}
            >
              Route Steps ({session.path.nodes.length})
            </button>
            <button
              id="dbg-tab-breakpoints"
              className={`tab-btn ${activeTab === 'breakpoints' ? 'active' : ''}`}
              style={{
                flex: 1,
                padding: '8px 10px',
                fontSize: 12,
                fontWeight: 600,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                borderBottom: activeTab === 'breakpoints' ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: activeTab === 'breakpoints' ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}
              onClick={() => setActiveTab('breakpoints')}
            >
              Breakpoints ({session.breakpoints.length})
            </button>
          </div>

          {/* Subtab 1: Route Steps Progression */}
          {activeTab === 'steps' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {session.path.nodes.map((node, idx) => {
                  const isCurrent = idx === session.currentStep;
                  const isVisited = idx < session.currentStep;
                  const isDestination = idx === session.path.nodes.length - 1;
                  const edgeIn = idx > 0 ? session.path.edges[idx - 1] : null;

                  return (
                    <div key={node.body_id} style={{ display: 'flex', flexDirection: 'column' }}>
                      {/* Edge Connector */}
                      {edgeIn && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '2px 0 2px 24px',
                            fontSize: 10,
                            color: idx <= session.currentStep ? '#f59e0b' : '#64748b',
                          }}
                        >
                          <div style={{ width: 2, height: 12, background: idx <= session.currentStep ? '#f59e0b' : 'var(--color-border)' }} />
                          <span>↓ {edgeIn.weight} synapses</span>
                        </div>
                      )}

                      {/* Node Card */}
                      <div
                        onClick={() => handleJumpToStep(idx)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 10px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: isCurrent ? 'rgba(245, 158, 11, 0.15)' : 'var(--color-bg-secondary)',
                          border: isCurrent ? '1px solid #f59e0b' : '1px solid var(--color-border)',
                        }}
                      >
                        {/* Step Marker */}
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 10,
                            fontWeight: 700,
                            background: isCurrent
                              ? '#f59e0b'
                              : isVisited
                              ? '#10b981'
                              : 'var(--color-border)',
                            color: '#fff',
                            flexShrink: 0,
                          }}
                        >
                          {isVisited ? '✓' : idx}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600, fontSize: 12 }}>
                              {node.type || `#${node.body_id}`}
                            </span>
                            {idx === 0 && <span className="badge badge-success" style={{ fontSize: 9 }}>SRC</span>}
                            {isDestination && <span className="badge badge-danger" style={{ fontSize: 9 }}>TGT</span>}
                            {bpNodeIds.has(node.body_id) && (
                              <span className="badge badge-warning" style={{ fontSize: 9 }}>BP</span>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                            #{node.body_id} • Hop {node.hop}
                          </div>
                        </div>

                        {isCurrent && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>
                            ACTIVE
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Subtab 2: Breakpoint Manager */}
          {activeTab === 'breakpoints' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Configured Breakpoints</span>
                <button
                  id="dbg-add-bp-toggle-btn"
                  className="btn btn-xs btn-primary"
                  onClick={() => setShowBpForm(!showBpForm)}
                >
                  <Plus size={12} />
                  <span>{showBpForm ? 'Cancel' : 'Add Breakpoint'}</span>
                </button>
              </div>

              {/* Add Breakpoint Form */}
              {showBpForm && (
                <form
                  onSubmit={handleAddBreakpointSubmit}
                  style={{
                    background: 'var(--color-bg-secondary)',
                    padding: 10,
                    borderRadius: 6,
                    border: '1px solid var(--color-border)',
                    marginBottom: 12,
                    fontSize: 11,
                  }}
                >
                  <div style={{ marginBottom: 6 }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: 2 }}>Breakpoint Name</label>
                    <input
                      id="dbg-bp-name-input"
                      type="text"
                      className="form-control"
                      placeholder="e.g. Stop at interneuron"
                      value={newBpName}
                      onChange={(e) => setNewBpName(e.target.value)}
                      style={{ fontSize: 11, padding: '4px 6px' }}
                    />
                  </div>

                  <div style={{ marginBottom: 6 }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: 2 }}>Type</label>
                    <select
                      id="dbg-bp-type-select"
                      className="form-control"
                      value={newBpType}
                      onChange={(e) => setNewBpType(e.target.value as BreakpointType)}
                      style={{ fontSize: 11, padding: '4px 6px' }}
                    >
                      <option value="neuron">Neuron Body ID</option>
                      <option value="hop">Hop Distance Index</option>
                      <option value="annotation">Anatomical Annotation</option>
                      <option value="weight">Synapse Weight Threshold</option>
                    </select>
                  </div>

                  {newBpType === 'neuron' && (
                    <div style={{ marginBottom: 6 }}>
                      <label style={{ display: 'block', fontWeight: 600, marginBottom: 2 }}>Neuron Body ID</label>
                      <input
                        id="dbg-bp-body-id"
                        type="number"
                        className="form-control"
                        placeholder="e.g. 800146"
                        value={newBpBodyId}
                        onChange={(e) => setNewBpBodyId(e.target.value)}
                        style={{ fontSize: 11, padding: '4px 6px', marginBottom: 4 }}
                      />
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {session.path.nodes.map((n) => (
                          <button
                            key={n.body_id}
                            type="button"
                            className="btn btn-xs btn-outline"
                            style={{ fontSize: 9, padding: '1px 4px' }}
                            onClick={() => setNewBpBodyId(String(n.body_id))}
                          >
                            #{n.body_id}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {newBpType === 'hop' && (
                    <div style={{ marginBottom: 6 }}>
                      <label style={{ display: 'block', fontWeight: 600, marginBottom: 2 }}>
                        Hop Index (0 to {session.path.hops})
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={session.path.hops}
                        className="form-control"
                        value={newBpHop}
                        onChange={(e) => setNewBpHop(parseInt(e.target.value, 10) || 0)}
                        style={{ fontSize: 11, padding: '4px 6px' }}
                      />
                    </div>
                  )}

                  {newBpType === 'annotation' && (
                    <div style={{ marginBottom: 6 }}>
                      <label style={{ display: 'block', fontWeight: 600, marginBottom: 2 }}>Field & Value Match</label>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                        <select
                          className="form-control"
                          value={newBpField}
                          onChange={(e) => setNewBpField(e.target.value as any)}
                          style={{ fontSize: 11, padding: '4px 6px' }}
                        >
                          <option value="type">Cell Type</option>
                          <option value="superclass">Superclass</option>
                          <option value="instance">Instance</option>
                        </select>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="e.g. motor"
                          value={newBpVal}
                          onChange={(e) => setNewBpVal(e.target.value)}
                          style={{ fontSize: 11, padding: '4px 6px', flex: 1 }}
                        />
                      </div>
                    </div>
                  )}

                  {newBpType === 'weight' && (
                    <div style={{ marginBottom: 6 }}>
                      <label style={{ display: 'block', fontWeight: 600, marginBottom: 2 }}>
                        Traversed Synapse Weight Threshold (&ge; X)
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="form-control"
                        placeholder="e.g. 50"
                        value={newBpWeight}
                        onChange={(e) => setNewBpWeight(e.target.value)}
                        style={{ fontSize: 11, padding: '4px 6px' }}
                      />
                    </div>
                  )}

                  <button id="dbg-save-bp-btn" type="submit" className="btn btn-xs btn-primary" style={{ width: '100%', marginTop: 4 }}>
                    Save Breakpoint
                  </button>
                </form>
              )}

              {/* Breakpoint List */}
              {session.breakpoints.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center', padding: '16px 0' }}>
                  No breakpoints configured. Click "+ Add Breakpoint" to pause on specific neurons or thresholds.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {session.breakpoints.map((bp) => (
                    <div
                      key={bp.id}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 6,
                        background: bp.enabled ? 'var(--color-bg-secondary)' : 'rgba(0,0,0,0.2)',
                        border: '1px solid var(--color-border)',
                        fontSize: 11,
                        opacity: bp.enabled ? 1 : 0.6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={bp.enabled}
                            onChange={() => handleToggleBp(bp.id)}
                            title="Toggle enable/disable"
                          />
                          <span style={{ fontWeight: 600 }}>{bp.name}</span>
                          <span className="badge badge-outline" style={{ fontSize: 9 }}>{bp.type}</span>
                        </div>
                        <button
                          className="btn btn-xs btn-outline"
                          style={{ padding: '2px 4px', color: '#f43f5e', border: 'none' }}
                          title="Delete breakpoint"
                          onClick={() => handleRemoveBp(bp.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      <div style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>
                        {bp.type === 'neuron' && `Stop at #${bp.neuronBodyId}`}
                        {bp.type === 'hop' && `Stop at Hop #${bp.hopIndex}`}
                        {bp.type === 'annotation' && `Match ${bp.annotationField} ~ "${bp.annotationValue}"`}
                        {bp.type === 'weight' && `Edge weight ≥ ${bp.minWeightThreshold} syn`}
                        {bp.hitCount > 0 && (
                          <span style={{ marginLeft: 6, color: '#f59e0b', fontWeight: 600 }}>
                            (Triggered {bp.hitCount}x)
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Center & Bottom Column: Graph Canvas + Event Log ── */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {/* Active Connection Context Card */}
          {currentEdge && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '6px 14px',
                background: 'rgba(245, 158, 11, 0.08)',
                borderBottom: '1px solid var(--color-border)',
                fontSize: 11,
              }}
            >
              <Activity size={14} color="#f59e0b" />
              <span>
                <strong>Active Directed Synapse:</strong> #{currentEdge.body_pre}{' '}
                {currentEdge.type_pre ? `(${currentEdge.type_pre})` : ''} → #{currentEdge.body_post}{' '}
                {currentEdge.type_post ? `(${currentEdge.type_post})` : ''}
              </span>
              <span className="badge badge-warning" style={{ fontSize: 10 }}>
                {currentEdge.weight} recorded synapses
              </span>
            </div>
          )}

          {/* Graph Visualization */}
          <div style={{ flex: 1, minHeight: 280, position: 'relative' }}>
            <PathwayGraphView
              mode="pathway"
              pathwayData={{
                source_body_id: session.sourceBodyId,
                target_body_id: session.targetBodyId,
                strategy: 'shortest',
                max_hops: session.path.hops,
                max_paths: 1,
                paths: [session.path],
                returned_count: 1,
                status: 'found',
                is_partial: false,
                limit_reason: null,
                explored_nodes: session.path.nodes.length,
                explored_edges: session.path.edges.length,
                dataset: session.dataset,
                source_file: 'traced-only',
                coverage_notice: 'traced-only subset',
                scientific_qualification: 'Structural traversal only.',
              }}
              activePath={session.path}
              cascadeData={null}
              selectedBodyId={currentNode ? currentNode.body_id : selectedBodyId}
              onSelectNode={(bId) => {
                onSelectNeuron(bId);
                // Also jump cursor if clicked node is on the path
                const nodeIdx = session.path.nodes.findIndex((n) => n.body_id === bId);
                if (nodeIdx !== -1) {
                  handleJumpToStep(nodeIdx);
                }
              }}
            />
          </div>

          {/* ── Event Log Collapsible Drawer ── */}
          <div
            className="debugger-event-log"
            style={{
              height: 180,
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              display: 'flex',
              flexDirection: 'column',
              fontSize: 11,
            }}
          >
            {/* Event Log Header & Filters */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-bg-secondary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                <Clock size={13} color="#38bdf8" />
                <span>Execution Event Log ({filteredEvents.length} events)</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Filter size={11} color="#94a3b8" />
                <button
                  className={`btn btn-xs ${eventFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: 9, padding: '2px 6px' }}
                  onClick={() => setEventFilter('all')}
                >
                  All
                </button>
                <button
                  className={`btn btn-xs ${eventFilter === 'traversal' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: 9, padding: '2px 6px' }}
                  onClick={() => setEventFilter('traversal')}
                >
                  Steps
                </button>
                <button
                  className={`btn btn-xs ${eventFilter === 'breakpoint' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: 9, padding: '2px 6px' }}
                  onClick={() => setEventFilter('breakpoint')}
                >
                  Breakpoints
                </button>
                <button
                  className={`btn btn-xs ${eventFilter === 'lifecycle' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: 9, padding: '2px 6px' }}
                  onClick={() => setEventFilter('lifecycle')}
                >
                  Lifecycle
                </button>
              </div>
            </div>

            {/* Event Log Table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table className="connections-table" style={{ fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ width: 45 }}>#</th>
                    <th style={{ width: 90 }}>Time</th>
                    <th style={{ width: 130 }}>Event Type</th>
                    <th style={{ width: 70 }}>Step</th>
                    <th>Description & Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((ev) => (
                    <tr
                      key={ev.id}
                      onClick={() => handleJumpToStep(ev.step)}
                      style={{ cursor: 'pointer', background: ev.type === 'breakpoint_triggered' ? 'rgba(245, 158, 11, 0.08)' : undefined }}
                    >
                      <td className="mono" style={{ color: 'var(--color-text-muted)' }}>
                        #{ev.sequenceNumber}
                      </td>
                      <td className="mono" style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                        {ev.timestamp.split('T')[1].replace('Z', '')}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            ev.type === 'breakpoint_triggered'
                              ? 'badge-warning'
                              : ev.type === 'trace_completed'
                              ? 'badge-info'
                              : ev.type === 'edge_traversed'
                              ? 'badge-outline'
                              : 'badge-secondary'
                          }`}
                          style={{ fontSize: 9 }}
                        >
                          {ev.type}
                        </span>
                      </td>
                      <td className="mono" style={{ fontWeight: 600 }}>
                        Step {ev.step}
                      </td>
                      <td>
                        <span>{ev.description}</span>
                        {ev.breakpointDetails && (
                          <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 1 }}>
                            ↳ {ev.breakpointDetails}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
