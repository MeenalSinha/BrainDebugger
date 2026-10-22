/**
 * BrainDebugger — Trace Execution Engine (V4)
 *
 * Deterministic, pure state-machine engine for stepping through
 * structural neural pathways with breakpoint evaluation and event logging.
 *
 * Scientific Principle:
 * Traversal steps through recorded directed connectome edges (u → v).
 * Breakpoints and state transitions are application-level graph debugging tools;
 * they do NOT simulate biological action potentials or temporal neural dynamics.
 */
import type {
  Breakpoint,
  BreakpointType,
  ExportedTraceData,
  PathEdge,
  PathItem,
  PathNode,
  TraceEvent,
  TraceEventType,
  TraceSession,
  TraceStatus,
} from './types';

export const SCIENTIFIC_QUALIFICATIONS = [
  'Structural Traversal: Steps through the recorded MaleCNS v1.0 connectome graph subset. Each step represents a directed synaptic connection (presynaptic → postsynaptic).',
  'No Temporal Simulation: Graph hops and traversal sequences do not represent biological firing latency, physiological conduction delays, or time in milliseconds.',
  'Synaptic Weight Caveat: Edge weights represent physical synapse counts identified in Janelia EM imagery, not electrical conductance or transmission probability.',
  'Breakpoint Semantics: Breakpoints pause application-level structural inspection based on graph criteria; they do not predict physiological action potential thresholds.',
  'Traced-Only Scope: All routes derive from connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather.',
];

/**
 * Validate a path before initializing a debug session.
 */
export function validatePathForTrace(
  path: PathItem,
  sourceId: number,
  targetId: number,
): { valid: boolean; error?: string } {
  if (!path) {
    return { valid: false, error: 'Path object is null or undefined.' };
  }
  if (!path.nodes || path.nodes.length === 0) {
    return { valid: false, error: 'Path must contain at least one node.' };
  }

  // Zero-hop path (source == target)
  if (path.nodes.length === 1 && path.edges.length === 0) {
    if (path.nodes[0].body_id !== sourceId || sourceId !== targetId) {
      return {
        valid: false,
        error: `Zero-hop path node #${path.nodes[0].body_id} does not match source/target #${sourceId}.`,
      };
    }
    return { valid: true };
  }

  // Multi-hop path validation
  if (path.nodes[0].body_id !== sourceId) {
    return {
      valid: false,
      error: `Path source node #${path.nodes[0].body_id} does not match requested source #${sourceId}.`,
    };
  }
  const lastNode = path.nodes[path.nodes.length - 1];
  if (lastNode.body_id !== targetId) {
    return {
      valid: false,
      error: `Path target node #${lastNode.body_id} does not match requested target #${targetId}.`,
    };
  }

  if (path.edges.length !== path.nodes.length - 1) {
    return {
      valid: false,
      error: `Edge count (${path.edges.length}) must equal hop count (${path.nodes.length - 1}).`,
    };
  }

  // Verify directed edge continuity: edge[i] connects nodes[i] → nodes[i+1]
  for (let i = 0; i < path.edges.length; i++) {
    const e = path.edges[i];
    const u = path.nodes[i].body_id;
    const v = path.nodes[i + 1].body_id;
    if (e.body_pre !== u || e.body_post !== v) {
      return {
        valid: false,
        error: `Edge #${i} (${e.body_pre} → ${e.body_post}) does not match path sequence (${u} → ${v}).`,
      };
    }
  }

  return { valid: true };
}

/**
 * Helper to produce a structured TraceEvent with UTC timestamp and sequence number.
 */
function createEvent(
  session: { sessionId: string; runId: string; events: TraceEvent[] },
  type: TraceEventType,
  step: number,
  hopIndex: number,
  description: string,
  traceStatus: TraceStatus,
  extra?: {
    currentNodeId?: number;
    currentEdgeKey?: string;
    breakpointId?: string;
    breakpointDetails?: string;
  },
): TraceEvent {
  const seq = session.events.length + 1;
  return {
    id: `ev_${session.sessionId}_${seq}`,
    sessionId: session.sessionId,
    runId: session.runId,
    sequenceNumber: seq,
    timestamp: new Date().toISOString(),
    type,
    step,
    hopIndex,
    currentNodeId: extra?.currentNodeId,
    currentEdgeKey: extra?.currentEdgeKey,
    breakpointId: extra?.breakpointId,
    breakpointDetails: extra?.breakpointDetails,
    description,
    traceStatus,
  };
}

/**
 * Initialize a new TraceSession from a valid V3 PathItem.
 */
export function createTraceSession(
  path: PathItem,
  sourceId: number,
  targetId: number,
  initialBreakpoints: Breakpoint[] = [],
  playbackSpeedMs: number = 750,
): TraceSession {
  const validation = validatePathForTrace(path, sourceId, targetId);
  if (!validation.valid) {
    throw new Error(`Cannot initialize trace session: ${validation.error}`);
  }

  const sessionId = `trace_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const runId = 'run_1';
  const now = new Date().toISOString();

  let session: TraceSession = {
    sessionId,
    runId,
    dataset: 'male-cns:v1.0',
    sourceBodyId: sourceId,
    targetBodyId: targetId,
    pathRank: path.rank,
    path,
    currentStep: 0,
    status: 'ready',
    breakpoints: [...initialBreakpoints],
    events: [],
    createdAt: now,
    lastTransitionAt: now,
    playbackSpeedMs: Math.max(100, Math.min(playbackSpeedMs, 5000)),
  };

  // Record session creation
  const evCreated = createEvent(
    session,
    'session_created',
    0,
    0,
    `Debug session initialized for path #${path.rank} (${sourceId} → ${targetId}, ${path.hops} hops).`,
    'ready',
    { currentNodeId: sourceId },
  );
  session.events.push(evCreated);

  // Record entry into source node
  const sourceNode = path.nodes[0];
  const evSource = createEvent(
    session,
    'node_entered',
    0,
    0,
    `Entered source neuron #${sourceNode.body_id}${sourceNode.type ? ` (${sourceNode.type})` : ''} at Hop 0.`,
    'ready',
    { currentNodeId: sourceNode.body_id },
  );
  session.events.push(evSource);

  // Evaluate initial breakpoints at source node (Hop 0)
  const initialMatches = evaluateBreakpoints(session.breakpoints, 0, sourceNode, undefined, true);
  if (initialMatches.length > 0) {
    session.status = 'paused';
    session.lastPausedReason = `Initial breakpoint hit: ${initialMatches.map((b) => b.name).join(', ')}`;
    for (const bp of initialMatches) {
      bp.hitCount = (bp.hitCount || 0) + 1;
      bp.lastHitStep = 0;
      session.events.push(
        createEvent(
          session,
          'breakpoint_triggered',
          0,
          0,
          `Initial breakpoint "${bp.name}" (${bp.type}) triggered at source neuron #${sourceNode.body_id}.`,
          'paused',
          {
            currentNodeId: sourceNode.body_id,
            breakpointId: bp.id,
            breakpointDetails: formatBreakpointMatchDetails(bp, sourceNode, undefined),
          },
        ),
      );
    }
  }

  return session;
}

/**
 * Format human-readable details for a triggered breakpoint.
 */
function formatBreakpointMatchDetails(
  bp: Breakpoint,
  node: PathNode,
  edge?: PathEdge,
): string {
  switch (bp.type) {
    case 'neuron':
      return `Matched neuron body ID #${node.body_id}`;
    case 'hop':
      return `Matched hop index ${node.hop}`;
    case 'annotation': {
      const field = bp.annotationField || 'type';
      const val = node[field] || '(none)';
      return `Annotation field "${field}" value "${val}" matched "${bp.annotationValue}"`;
    }
    case 'weight':
      return `Traversed edge weight ${edge ? edge.weight : 0} syn >= threshold ${bp.minWeightThreshold || 0}`;
    default:
      return 'Breakpoint matched.';
  }
}

/**
 * Evaluate enabled breakpoints against a specific path node and traversed edge.
 */
export function evaluateBreakpoints(
  breakpoints: Breakpoint[],
  step: number,
  node: PathNode,
  traversedEdge?: PathEdge,
  isInitialNode: boolean = false,
): Breakpoint[] {
  const matches: Breakpoint[] = [];

  for (const bp of breakpoints) {
    if (!bp.enabled) continue;

    let matched = false;

    switch (bp.type) {
      case 'neuron':
        if (bp.neuronBodyId !== undefined && bp.neuronBodyId === node.body_id) {
          matched = true;
        }
        break;

      case 'hop':
        if (bp.hopIndex !== undefined && bp.hopIndex === step) {
          matched = true;
        }
        break;

      case 'annotation':
        if (bp.annotationValue && bp.annotationValue.trim()) {
          const field = bp.annotationField || 'type';
          const nodeVal = node[field];
          if (nodeVal && typeof nodeVal === 'string') {
            const query = bp.annotationValue.trim().toLowerCase();
            if (nodeVal.toLowerCase().includes(query)) {
              matched = true;
            }
          }
        }
        break;

      case 'weight':
        if (
          !isInitialNode &&
          traversedEdge &&
          bp.minWeightThreshold !== undefined &&
          traversedEdge.weight >= bp.minWeightThreshold
        ) {
          matched = true;
        }
        break;
    }

    if (matched) {
      matches.push(bp);
    }
  }

  return matches;
}

/**
 * Step forward by one directed edge along the selected pathway.
 */
export function stepForward(session: TraceSession): {
  session: TraceSession;
  triggeredBreakpoints: Breakpoint[];
} {
  const totalNodes = session.path.nodes.length;

  // Zero-hop edge case or already at destination
  if (totalNodes <= 1 || session.currentStep >= totalNodes - 1) {
    if (session.status !== 'completed') {
      const updated: TraceSession = {
        ...session,
        status: 'completed',
        lastTransitionAt: new Date().toISOString(),
        lastPausedReason: 'Trace reached target neuron.',
        events: [...session.events],
      };
      updated.events.push(
        createEvent(
          updated,
          'trace_completed',
          session.currentStep,
          session.currentStep,
          `Trace completed at target neuron #${session.path.nodes[session.currentStep].body_id}.`,
          'completed',
          { currentNodeId: session.path.nodes[session.currentStep].body_id },
        ),
      );
      return { session: updated, triggeredBreakpoints: [] };
    }
    return { session, triggeredBreakpoints: [] };
  }

  const nextStep = session.currentStep + 1;
  const edge = session.path.edges[session.currentStep];
  const nextNode = session.path.nodes[nextStep];
  const edgeKey = `${edge.body_pre}_${edge.body_post}`;

  const updatedBreakpoints = session.breakpoints.map((b) => ({ ...b }));
  const updatedEvents = [...session.events];
  const now = new Date().toISOString();

  const nextSessionDraft: TraceSession = {
    ...session,
    currentStep: nextStep,
    breakpoints: updatedBreakpoints,
    events: updatedEvents,
    lastTransitionAt: now,
  };

  // 1. Record edge traversal event
  updatedEvents.push(
    createEvent(
      nextSessionDraft,
      'edge_traversed',
      nextStep,
      nextStep,
      `Traversed directed connection #${edge.body_pre} → #${edge.body_post} (${edge.weight} synapses recorded).`,
      'running',
      {
        currentNodeId: edge.body_post,
        currentEdgeKey: edgeKey,
      },
    ),
  );

  // 2. Record node entry event
  updatedEvents.push(
    createEvent(
      nextSessionDraft,
      'node_entered',
      nextStep,
      nextStep,
      `Entered neuron #${nextNode.body_id}${nextNode.type ? ` (${nextNode.type})` : ''} at Hop ${nextStep}.`,
      'running',
      { currentNodeId: nextNode.body_id },
    ),
  );

  // 3. Record step advanced event
  updatedEvents.push(
    createEvent(
      nextSessionDraft,
      'step_advanced',
      nextStep,
      nextStep,
      `Advanced to Step ${nextStep} of ${totalNodes - 1}.`,
      'running',
      { currentNodeId: nextNode.body_id },
    ),
  );

  // 4. Evaluate Breakpoints
  const matches = evaluateBreakpoints(updatedBreakpoints, nextStep, nextNode, edge, false);
  let nextStatus: TraceStatus = 'paused';
  let pausedReason: string | undefined = undefined;

  if (matches.length > 0) {
    nextStatus = 'paused';
    pausedReason = `Breakpoint triggered: ${matches.map((b) => b.name).join(', ')}`;
    for (const m of matches) {
      m.hitCount = (m.hitCount || 0) + 1;
      m.lastHitStep = nextStep;
      updatedEvents.push(
        createEvent(
          nextSessionDraft,
          'breakpoint_triggered',
          nextStep,
          nextStep,
          `Breakpoint "${m.name}" (${m.type}) triggered at neuron #${nextNode.body_id}.`,
          'paused',
          {
            currentNodeId: nextNode.body_id,
            currentEdgeKey: edgeKey,
            breakpointId: m.id,
            breakpointDetails: formatBreakpointMatchDetails(m, nextNode, edge),
          },
        ),
      );
    }
  } else if (nextStep === totalNodes - 1) {
    nextStatus = 'completed';
    pausedReason = 'Trace reached target neuron.';
    updatedEvents.push(
      createEvent(
        nextSessionDraft,
        'trace_completed',
        nextStep,
        nextStep,
        `Trace reached target neuron #${nextNode.body_id} (${nextNode.type || 'untyped'}). Path completed.`,
        'completed',
        { currentNodeId: nextNode.body_id },
      ),
    );
  }

  const finalSession: TraceSession = {
    ...nextSessionDraft,
    status: nextStatus,
    lastPausedReason: pausedReason,
  };

  return { session: finalSession, triggeredBreakpoints: matches };
}

/**
 * Navigate backward to inspect an earlier step.
 * Note: This is an inspection operation; it does NOT traverse edges in reverse.
 */
export function stepBackward(session: TraceSession): TraceSession {
  if (session.currentStep <= 0) {
    return session;
  }

  const prevStep = session.currentStep - 1;
  const prevNode = session.path.nodes[prevStep];
  const now = new Date().toISOString();

  const updatedEvents = [...session.events];
  const updatedSession: TraceSession = {
    ...session,
    currentStep: prevStep,
    status: 'paused',
    lastPausedReason: `Navigated back to step ${prevStep}`,
    lastTransitionAt: now,
    events: updatedEvents,
  };

  updatedEvents.push(
    createEvent(
      updatedSession,
      'history_navigation',
      prevStep,
      prevStep,
      `Inspected previous step #${prevStep} (neuron #${prevNode.body_id}).`,
      'paused',
      { currentNodeId: prevNode.body_id },
    ),
  );

  return updatedSession;
}

/**
 * Jump inspection cursor to a specific step.
 */
export function jumpToStep(session: TraceSession, targetStep: number): TraceSession {
  const maxStep = session.path.nodes.length - 1;
  const clampedStep = Math.max(0, Math.min(targetStep, maxStep));
  if (clampedStep === session.currentStep) {
    return session;
  }

  const node = session.path.nodes[clampedStep];
  const now = new Date().toISOString();
  const updatedEvents = [...session.events];

  const updatedSession: TraceSession = {
    ...session,
    currentStep: clampedStep,
    status: 'paused',
    lastPausedReason: `Inspecting step #${clampedStep}`,
    lastTransitionAt: now,
    events: updatedEvents,
  };

  updatedEvents.push(
    createEvent(
      updatedSession,
      'history_navigation',
      clampedStep,
      clampedStep,
      `Inspection cursor moved to step #${clampedStep} (neuron #${node.body_id}).`,
      'paused',
      { currentNodeId: node.body_id },
    ),
  );

  return updatedSession;
}

/**
 * Transition session into 'running' state.
 */
export function startOrContinueTrace(session: TraceSession): TraceSession {
  const maxStep = session.path.nodes.length - 1;
  if (session.currentStep >= maxStep) {
    return session;
  }

  const isResuming = session.status === 'paused';
  const now = new Date().toISOString();
  const updatedEvents = [...session.events];

  const updatedSession: TraceSession = {
    ...session,
    status: 'running',
    lastPausedReason: undefined,
    lastTransitionAt: now,
    events: updatedEvents,
  };

  updatedEvents.push(
    createEvent(
      updatedSession,
      isResuming ? 'trace_resumed' : 'trace_started',
      session.currentStep,
      session.currentStep,
      isResuming
        ? `Trace resumed from step #${session.currentStep} (neuron #${session.path.nodes[session.currentStep].body_id}).`
        : `Trace started from source neuron #${session.sourceBodyId}.`,
      'running',
      { currentNodeId: session.path.nodes[session.currentStep].body_id },
    ),
  );

  return updatedSession;
}

/**
 * Pause automatic progression.
 */
export function pauseTrace(session: TraceSession, reason: string = 'Paused by user'): TraceSession {
  if (session.status !== 'running') {
    return session;
  }

  const now = new Date().toISOString();
  const updatedEvents = [...session.events];

  const updatedSession: TraceSession = {
    ...session,
    status: 'paused',
    lastPausedReason: reason,
    lastTransitionAt: now,
    events: updatedEvents,
  };

  updatedEvents.push(
    createEvent(
      updatedSession,
      'trace_paused',
      session.currentStep,
      session.currentStep,
      `Trace paused at step #${session.currentStep}: ${reason}.`,
      'paused',
      { currentNodeId: session.path.nodes[session.currentStep].body_id },
    ),
  );

  return updatedSession;
}

/**
 * Stop execution session.
 */
export function stopTrace(session: TraceSession): TraceSession {
  if (session.status === 'stopped') {
    return session;
  }

  const now = new Date().toISOString();
  const updatedEvents = [...session.events];

  const updatedSession: TraceSession = {
    ...session,
    status: 'stopped',
    lastPausedReason: 'Stopped by user.',
    lastTransitionAt: now,
    events: updatedEvents,
  };

  updatedEvents.push(
    createEvent(
      updatedSession,
      'trace_stopped',
      session.currentStep,
      session.currentStep,
      `Trace stopped at step #${session.currentStep} (neuron #${session.path.nodes[session.currentStep].body_id}).`,
      'stopped',
      { currentNodeId: session.path.nodes[session.currentStep].body_id },
    ),
  );

  return updatedSession;
}

/**
 * Reset execution cursor to source node, incrementing runId while retaining history.
 */
export function resetTrace(session: TraceSession): TraceSession {
  const runNum = parseInt((session.runId || 'run_1').replace('run_', ''), 10) || 1;
  const newRunId = `run_${runNum + 1}`;
  const now = new Date().toISOString();

  const updatedEvents = [...session.events];
  const sourceNode = session.path.nodes[0];

  const updatedBreakpoints = session.breakpoints.map((b) => ({
    ...b,
    hitCount: 0,
    lastHitStep: undefined,
  }));

  const draftSession: TraceSession = {
    ...session,
    runId: newRunId,
    currentStep: 0,
    status: 'ready',
    lastPausedReason: undefined,
    lastTransitionAt: now,
    breakpoints: updatedBreakpoints,
    events: updatedEvents,
  };

  updatedEvents.push(
    createEvent(
      draftSession,
      'trace_reset',
      0,
      0,
      `Trace cursor reset to source neuron #${sourceNode.body_id}. Starting ${newRunId}.`,
      'ready',
      { currentNodeId: sourceNode.body_id },
    ),
  );

  // Check initial breakpoint on reset
  const initialMatches = evaluateBreakpoints(updatedBreakpoints, 0, sourceNode, undefined, true);
  if (initialMatches.length > 0) {
    draftSession.status = 'paused';
    draftSession.lastPausedReason = `Initial breakpoint hit: ${initialMatches.map((b) => b.name).join(', ')}`;
    for (const bp of initialMatches) {
      bp.hitCount = (bp.hitCount || 0) + 1;
      bp.lastHitStep = 0;
      updatedEvents.push(
        createEvent(
          draftSession,
          'breakpoint_triggered',
          0,
          0,
          `Initial breakpoint "${bp.name}" (${bp.type}) triggered at source neuron #${sourceNode.body_id}.`,
          'paused',
          {
            currentNodeId: sourceNode.body_id,
            breakpointId: bp.id,
            breakpointDetails: formatBreakpointMatchDetails(bp, sourceNode, undefined),
          },
        ),
      );
    }
  }

  return draftSession;
}

/**
 * Breakpoint management: Add
 */
export function addBreakpoint(
  session: TraceSession,
  bpData: Omit<Breakpoint, 'id' | 'hitCount' | 'lastHitStep'>,
): TraceSession {
  const id = `bp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const newBp: Breakpoint = {
    ...bpData,
    id,
    hitCount: 0,
    lastHitStep: undefined,
  };

  const updatedBreakpoints = [...session.breakpoints, newBp];
  const updatedEvents = [...session.events];

  const updatedSession: TraceSession = {
    ...session,
    breakpoints: updatedBreakpoints,
    events: updatedEvents,
  };

  updatedEvents.push(
    createEvent(
      updatedSession,
      'breakpoint_created',
      session.currentStep,
      session.currentStep,
      `Created breakpoint "${newBp.name}" [${newBp.type}].`,
      session.status,
      { breakpointId: id },
    ),
  );

  return updatedSession;
}

/**
 * Breakpoint management: Toggle enable/disable
 */
export function toggleBreakpoint(session: TraceSession, bpId: string): TraceSession {
  const target = session.breakpoints.find((b) => b.id === bpId);
  if (!target) return session;

  const nextEnabled = !target.enabled;
  const updatedBreakpoints = session.breakpoints.map((b) =>
    b.id === bpId ? { ...b, enabled: nextEnabled } : b,
  );
  const updatedEvents = [...session.events];

  const updatedSession: TraceSession = {
    ...session,
    breakpoints: updatedBreakpoints,
    events: updatedEvents,
  };

  updatedEvents.push(
    createEvent(
      updatedSession,
      'breakpoint_toggled',
      session.currentStep,
      session.currentStep,
      `${nextEnabled ? 'Enabled' : 'Disabled'} breakpoint "${target.name}".`,
      session.status,
      { breakpointId: bpId },
    ),
  );

  return updatedSession;
}

/**
 * Breakpoint management: Remove
 */
export function removeBreakpoint(session: TraceSession, bpId: string): TraceSession {
  const target = session.breakpoints.find((b) => b.id === bpId);
  if (!target) return session;

  const updatedBreakpoints = session.breakpoints.filter((b) => b.id !== bpId);
  const updatedEvents = [...session.events];

  const updatedSession: TraceSession = {
    ...session,
    breakpoints: updatedBreakpoints,
    events: updatedEvents,
  };

  updatedEvents.push(
    createEvent(
      updatedSession,
      'breakpoint_removed',
      session.currentStep,
      session.currentStep,
      `Removed breakpoint "${target.name}".`,
      session.status,
      { breakpointId: bpId },
    ),
  );

  return updatedSession;
}

/**
 * Export complete trace session data as formatted JSON.
 */
export function exportTraceSessionJson(session: TraceSession): string {
  const exportPayload: ExportedTraceData = {
    exportVersion: 'v4.0',
    exportedAt: new Date().toISOString(),
    session: {
      sessionId: session.sessionId,
      runId: session.runId,
      dataset: session.dataset,
      sourceBodyId: session.sourceBodyId,
      targetBodyId: session.targetBodyId,
      pathRank: session.pathRank,
      totalHops: session.path.hops,
      totalSynapticWeight: session.path.total_weight,
      finalStatus: session.status,
      createdAt: session.createdAt,
      lastTransitionAt: session.lastTransitionAt,
    },
    path: session.path,
    breakpoints: session.breakpoints,
    events: session.events,
    scientificQualifications: SCIENTIFIC_QUALIFICATIONS,
  };

  return JSON.stringify(exportPayload, null, 2);
}
