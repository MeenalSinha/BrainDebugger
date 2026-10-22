import { describe, it, expect } from 'vitest';
import {
  validatePathForTrace,
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
} from './traceEngine';
import type { PathItem, PathNode, PathEdge } from './types';

// Fixture: 3-hop simple path A (10) -> B (20) -> C (30) -> D (40)
const mockNodes: PathNode[] = [
  { body_id: 10, type: 'DNp01', instance: 'DNp01_R', superclass: 'descending_neuron', hop: 0 },
  { body_id: 20, type: 'TTMn', instance: 'TTMn_R', superclass: 'interneuron', hop: 1 },
  { body_id: 30, type: 'IN01', instance: null, superclass: 'interneuron', hop: 2 },
  { body_id: 40, type: 'MN01', instance: 'MN01_R', superclass: 'motor_neuron', hop: 3 },
];

const mockEdges: PathEdge[] = [
  { body_pre: 10, body_post: 20, weight: 70, type_pre: 'DNp01', type_post: 'TTMn', instance_pre: null, instance_post: null, relative_weight_fraction: null },
  { body_pre: 20, body_post: 30, weight: 15, type_pre: 'TTMn', type_post: 'IN01', instance_pre: null, instance_post: null, relative_weight_fraction: null },
  { body_pre: 30, body_post: 40, weight: 5, type_pre: 'IN01', type_post: 'MN01', instance_pre: null, instance_post: null, relative_weight_fraction: null },
];

const mockPath: PathItem = {
  rank: 1,
  hops: 3,
  nodes: mockNodes,
  edges: mockEdges,
  score: 0.85,
  log_cost: 0.162,
  total_weight: 90,
  bottleneck_weight: 5,
};

describe('TraceEngine — Path Validation', () => {
  it('validates a correct multi-hop path', () => {
    const res = validatePathForTrace(mockPath, 10, 40);
    expect(res.valid).toBe(true);
  });

  it('validates a zero-hop path where source equals target', () => {
    const zeroHopPath: PathItem = {
      rank: 1,
      hops: 0,
      nodes: [mockNodes[0]],
      edges: [],
      score: 1.0,
      log_cost: 0,
      total_weight: 0,
      bottleneck_weight: 0,
    };
    const res = validatePathForTrace(zeroHopPath, 10, 10);
    expect(res.valid).toBe(true);
  });

  it('rejects path when source does not match', () => {
    const res = validatePathForTrace(mockPath, 999, 40);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('does not match requested source');
  });

  it('rejects path when target does not match', () => {
    const res = validatePathForTrace(mockPath, 10, 999);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('does not match requested target');
  });

  it('rejects path when edges do not match consecutive nodes', () => {
    const brokenPath: PathItem = {
      ...mockPath,
      edges: [
        { body_pre: 10, body_post: 99, weight: 5, type_pre: null, type_post: null, instance_pre: null, instance_post: null, relative_weight_fraction: null },
        mockEdges[1],
        mockEdges[2],
      ],
    };
    const res = validatePathForTrace(brokenPath, 10, 40);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('does not match path sequence');
  });

  it('rejects empty nodes list', () => {
    const emptyPath: PathItem = {
      rank: 1,
      hops: 0,
      nodes: [],
      edges: [],
      score: null,
      log_cost: null,
      total_weight: 0,
      bottleneck_weight: 0,
    };
    const res = validatePathForTrace(emptyPath, 10, 40);
    expect(res.valid).toBe(false);
  });
});

describe('TraceEngine — Session Lifecycle & Step Controls', () => {
  it('initializes session at step 0 with ready state and events', () => {
    const session = createTraceSession(mockPath, 10, 40);
    expect(session.currentStep).toBe(0);
    expect(session.status).toBe('ready');
    expect(session.sourceBodyId).toBe(10);
    expect(session.targetBodyId).toBe(40);
    expect(session.events.length).toBeGreaterThanOrEqual(2);
    expect(session.events[0].type).toBe('session_created');
    expect(session.events[1].type).toBe('node_entered');
    expect(session.events[1].currentNodeId).toBe(10);
  });

  it('advances one step forward along the directed edge', () => {
    const session = createTraceSession(mockPath, 10, 40);
    const { session: s1, triggeredBreakpoints } = stepForward(session);
    expect(s1.currentStep).toBe(1);
    expect(s1.status).toBe('paused'); // Single step pauses after advancing
    expect(triggeredBreakpoints).toHaveLength(0);

    // Verify events recorded
    const edgeEvent = s1.events.find((e) => e.type === 'edge_traversed');
    expect(edgeEvent).toBeDefined();
    expect(edgeEvent?.description).toContain('10 → #20');
    expect(edgeEvent?.currentEdgeKey).toBe('10_20');

    const nodeEvent = s1.events.find((e) => e.type === 'node_entered' && e.step === 1);
    expect(nodeEvent).toBeDefined();
    expect(nodeEvent?.currentNodeId).toBe(20);
  });

  it('completes the trace upon reaching the target node', () => {
    let session = createTraceSession(mockPath, 10, 40);
    // Step 0 -> 1
    session = stepForward(session).session;
    // Step 1 -> 2
    session = stepForward(session).session;
    // Step 2 -> 3 (target)
    session = stepForward(session).session;

    expect(session.currentStep).toBe(3);
    expect(session.status).toBe('completed');
    const completeEvent = session.events[session.events.length - 1];
    expect(completeEvent.type).toBe('trace_completed');
    expect(completeEvent.currentNodeId).toBe(40);

    // Further stepForward does not advance
    const { session: sFinal } = stepForward(session);
    expect(sFinal.currentStep).toBe(3);
  });

  it('navigates backward for history inspection without reverse edges', () => {
    let session = createTraceSession(mockPath, 10, 40);
    session = stepForward(session).session; // at step 1 (node 20)
    session = stepForward(session).session; // at step 2 (node 30)
    expect(session.currentStep).toBe(2);

    session = stepBackward(session);
    expect(session.currentStep).toBe(1);
    expect(session.status).toBe('paused');

    const lastEvent = session.events[session.events.length - 1];
    expect(lastEvent.type).toBe('history_navigation');
    expect(lastEvent.description).toContain('Inspected previous step #1');
    expect(lastEvent.currentNodeId).toBe(20);

    // At step 0, backward does not decrease below 0
    session = stepBackward(session);
    expect(session.currentStep).toBe(0);
    session = stepBackward(session);
    expect(session.currentStep).toBe(0);
  });

  it('jumps cursor to specific step for history inspection', () => {
    let session = createTraceSession(mockPath, 10, 40);
    session = jumpToStep(session, 2);
    expect(session.currentStep).toBe(2);
    const lastEvent = session.events[session.events.length - 1];
    expect(lastEvent.type).toBe('history_navigation');
    expect(lastEvent.currentNodeId).toBe(30);
  });

  it('supports start, continue, pause, and stop transitions', () => {
    let session = createTraceSession(mockPath, 10, 40);
    session = startOrContinueTrace(session);
    expect(session.status).toBe('running');

    session = pauseTrace(session, 'User hit pause');
    expect(session.status).toBe('paused');
    expect(session.lastPausedReason).toBe('User hit pause');

    session = stopTrace(session);
    expect(session.status).toBe('stopped');
  });

  it('resets cursor to source with new runId while preserving event history', () => {
    let session = createTraceSession(mockPath, 10, 40);
    session = stepForward(session).session;
    session = stepForward(session).session;
    expect(session.currentStep).toBe(2);
    const eventCountBefore = session.events.length;

    session = resetTrace(session);
    expect(session.currentStep).toBe(0);
    expect(session.status).toBe('ready');
    expect(session.runId).toBe('run_2');
    expect(session.events.length).toBeGreaterThan(eventCountBefore);

    const resetEvent = session.events[session.events.length - 1];
    expect(resetEvent.type).toBe('trace_reset');
    expect(resetEvent.description).toContain('Starting run_2');
  });
});

describe('TraceEngine — Breakpoint System', () => {
  it('triggers a neuron body ID breakpoint and pauses trace', () => {
    let session = createTraceSession(mockPath, 10, 40);
    session = addBreakpoint(session, {
      name: 'Stop at TTMn',
      type: 'neuron',
      enabled: true,
      neuronBodyId: 20,
    });

    const { session: s1, triggeredBreakpoints } = stepForward(session);
    expect(s1.currentStep).toBe(1);
    expect(s1.status).toBe('paused');
    expect(triggeredBreakpoints).toHaveLength(1);
    expect(triggeredBreakpoints[0].name).toBe('Stop at TTMn');
    expect(s1.breakpoints[0].hitCount).toBe(1);

    const bpEvent = s1.events.find((e) => e.type === 'breakpoint_triggered');
    expect(bpEvent).toBeDefined();
    expect(bpEvent?.breakpointId).toBe(s1.breakpoints[0].id);
    expect(bpEvent?.breakpointDetails).toContain('Matched neuron body ID #20');
  });

  it('triggers a hop index breakpoint', () => {
    let session = createTraceSession(mockPath, 10, 40);
    session = addBreakpoint(session, {
      name: 'Pause at Hop 2',
      type: 'hop',
      enabled: true,
      hopIndex: 2,
    });

    // Step 0 -> 1 (hop 1, no match)
    session = stepForward(session).session;
    expect(session.breakpoints[0].hitCount).toBe(0);

    // Step 1 -> 2 (hop 2, matches!)
    const { session: s2, triggeredBreakpoints } = stepForward(session);
    expect(s2.currentStep).toBe(2);
    expect(s2.status).toBe('paused');
    expect(triggeredBreakpoints).toHaveLength(1);
    expect(s2.breakpoints[0].hitCount).toBe(1);
  });

  it('triggers an annotation breakpoint on cell type or superclass', () => {
    let session = createTraceSession(mockPath, 10, 40);
    session = addBreakpoint(session, {
      name: 'Pause on motor neuron',
      type: 'annotation',
      enabled: true,
      annotationField: 'superclass',
      annotationValue: 'motor_neuron',
    });

    // Step through to node 40 (superclass: motor_neuron)
    session = stepForward(session).session; // 1
    session = stepForward(session).session; // 2
    const { session: s3, triggeredBreakpoints } = stepForward(session); // 3

    expect(s3.currentStep).toBe(3);
    expect(triggeredBreakpoints).toHaveLength(1);
    expect(triggeredBreakpoints[0].name).toBe('Pause on motor neuron');
  });

  it('triggers a connection weight threshold breakpoint on traversed edge', () => {
    let session = createTraceSession(mockPath, 10, 40);
    session = addBreakpoint(session, {
      name: 'Strong synapse >= 50',
      type: 'weight',
      enabled: true,
      minWeightThreshold: 50,
    });

    // First edge 10 -> 20 has weight 70 >= 50
    const { session: s1, triggeredBreakpoints } = stepForward(session);
    expect(s1.currentStep).toBe(1);
    expect(triggeredBreakpoints).toHaveLength(1);
    expect(triggeredBreakpoints[0].name).toBe('Strong synapse >= 50');

    // Second edge 20 -> 30 has weight 15 < 50 (does NOT trigger)
    const { session: s2, triggeredBreakpoints: tb2 } = stepForward(s1);
    expect(s2.currentStep).toBe(2);
    expect(tb2).toHaveLength(0);
  });

  it('does not trigger a disabled breakpoint', () => {
    let session = createTraceSession(mockPath, 10, 40);
    session = addBreakpoint(session, {
      name: 'Disabled BP',
      type: 'neuron',
      enabled: false,
      neuronBodyId: 20,
    });

    const { session: s1, triggeredBreakpoints } = stepForward(session);
    expect(s1.currentStep).toBe(1);
    expect(triggeredBreakpoints).toHaveLength(0);
  });

  it('evaluates initial breakpoint at source neuron during creation', () => {
    const initialBps = [
      {
        id: 'bp_init',
        name: 'Stop at source',
        type: 'neuron' as const,
        enabled: true,
        neuronBodyId: 10,
        hitCount: 0,
      },
    ];
    const session = createTraceSession(mockPath, 10, 40, initialBps);
    expect(session.status).toBe('paused');
    expect(session.lastPausedReason).toContain('Initial breakpoint hit');
    expect(session.breakpoints[0].hitCount).toBe(1);
  });

  it('toggles and removes breakpoints cleanly', () => {
    let session = createTraceSession(mockPath, 10, 40);
    session = addBreakpoint(session, {
      name: 'Temp BP',
      type: 'neuron',
      enabled: true,
      neuronBodyId: 30,
    });
    const bpId = session.breakpoints[0].id;
    expect(session.breakpoints[0].enabled).toBe(true);

    session = toggleBreakpoint(session, bpId);
    expect(session.breakpoints[0].enabled).toBe(false);

    session = removeBreakpoint(session, bpId);
    expect(session.breakpoints).toHaveLength(0);
  });
});

describe('TraceEngine — Event Ordering & JSON Export', () => {
  it('maintains monotonically increasing sequence numbers and valid timestamps', () => {
    let session = createTraceSession(mockPath, 10, 40);
    session = stepForward(session).session;
    session = stepForward(session).session;
    session = stepBackward(session);

    for (let i = 0; i < session.events.length; i++) {
      expect(session.events[i].sequenceNumber).toBe(i + 1);
      expect(session.events[i].sessionId).toBe(session.sessionId);
      expect(session.events[i].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
  });

  it('exports complete trace session data with scientific caveats as valid JSON', () => {
    let session = createTraceSession(mockPath, 10, 40);
    session = stepForward(session).session;
    const jsonStr = exportTraceSessionJson(session);

    const parsed = JSON.parse(jsonStr);
    expect(parsed.exportVersion).toBe('v4.0');
    expect(parsed.session.sourceBodyId).toBe(10);
    expect(parsed.session.targetBodyId).toBe(40);
    expect(parsed.session.totalHops).toBe(3);
    expect(parsed.events.length).toBeGreaterThanOrEqual(4);
    expect(parsed.scientificQualifications).toBeDefined();
    expect(parsed.scientificQualifications[0]).toContain('Structural Traversal');
  });
});
