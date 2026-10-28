/**
 * BrainDebugger — Ask NeuroQuery (Version 7)
 *
 * Natural-Language Understanding & Structured Investigation Planning:
 * - Translates biological questions asked in natural language into structured,
 *   evidence-aware investigation plans grounded in the V6 biological catalog.
 * - Enforces strict V7 scope boundaries: prepares and validates investigation plans
 *   without falsely claiming that neural circuits have been discovered.
 * - Handles ambiguity with interactive clarification questions, preserves context,
 *   detects unsupported biological queries honestly, and exports validated JSON plans.
 */

import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  Sparkles,
  Send,
  HelpCircle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  ShieldCheck,
  BookOpen,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Layers,
  FileText,
  Compass,
  Cpu,
  Info,
  Play,
} from 'lucide-react';
import { api, ApiClientError } from '../api';
import type {
  InvestigationPlan,
  IntentType,
  PlanSupportStatus,
  PlannedOperation,
  PlanValidationResponse,
  NeuroQueryConfigResponse,
  BiologicalConcept,
  EvidenceSource,
  CircuitDiscoveryResult,
} from '../types';
import { CircuitDiscoveryView } from './CircuitDiscoveryView';

interface AskNeuroQueryProps {
  onSelectNeuron?: (bodyId: number) => void;
  onNavigateToKnowledge?: (conceptId?: string) => void;
  onNavigateToExplorer?: (bodyId: number) => void;
  onNavigateToPathway?: (sourceId?: number, targetId?: number) => void;
  onNavigateToPerturbation?: (sourceId?: number, targetId?: number) => void;
}


const EXAMPLE_QUESTIONS = [
  {
    label: 'Visual Motion (T4/T5)',
    query: 'How does the fly visual system detect directional motion?',
  },
  {
    label: 'Giant Fiber Escape',
    query: 'What is the neural circuit underlying the giant fiber escape reflex in Drosophila?',
  },
  {
    label: 'Visual Looming (LC4/LPLC2)',
    query: 'How do visual looming projection neurons trigger evasive takeoff?',
  },
  {
    label: 'Pathway Search (DNp01 to motor)',
    query: 'Find the synaptic pathway from descending neuron 10001 to motor neuron 800146.',
  },
  {
    label: 'Color Vision (Tm5/Dm8)',
    query: 'How does a fruit fly process color-related visual information in the medulla?',
  },
  {
    label: 'In-Silico Lesion',
    query: 'What happens to downstream connectivity if we disable the giant fiber neuron 10001?',
  },
  {
    label: 'Ambiguous Query',
    query: 'Show me the visual circuit.',
  },
  {
    label: 'Unsupported Biological Query',
    query: 'Can you map the antennal mechanosensory courtship song subcircuits in MaleCNS?',
  },
];

export function AskNeuroQuery({
  onSelectNeuron,
  onNavigateToKnowledge,
  onNavigateToExplorer,
  onNavigateToPathway,
  onNavigateToPerturbation,
}: AskNeuroQueryProps) {
  // Input State
  const [question, setQuestion] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Active Plan State
  const [plan, setPlan] = useState<InvestigationPlan | null>(null);
  const [clarificationAnswer, setClarificationAnswer] = useState<string>('');
  const [validationReport, setValidationReport] = useState<PlanValidationResponse | null>(null);
  const [validating, setValidating] = useState<boolean>(false);

  // V8 Circuit Discovery Execution State
  const [executionResult, setExecutionResult] = useState<CircuitDiscoveryResult | null>(null);
  const [executing, setExecuting] = useState<boolean>(false);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Provider Config
  const [providerConfig, setProviderConfig] = useState<NeuroQueryConfigResponse | null>(null);


  // Abort controller ref to cancel stale requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch provider config on mount
  useEffect(() => {
    let active = true;
    api.getNeuroQueryConfig()
      .then((cfg) => {
        if (active) setProviderConfig(cfg);
      })
      .catch((err) => {
        console.warn('Failed to load NeuroQuery provider config:', err);
      });
    return () => {
      active = false;
    };
  }, []);

  // Submit Question for Planning
  const handleGeneratePlan = useCallback(
    async (
      overrideQuery?: string,
      clarificationContext?: Record<string, unknown>
    ) => {
      const q = (overrideQuery ?? question).trim();
      if (!q) return;

      // Cancel any ongoing request to prevent stale responses
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);
      setValidationReport(null);
      setExecutionResult(null);
      setExecutionError(null);

      try {
        const generated = await api.generateInvestigationPlan(
          {
            question: q,
            clarification_context: clarificationContext || (plan ? { previous_question: plan.original_question } : undefined),
          },
          controller.signal
        );
        setPlan(generated);
        setClarificationAnswer('');
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        if (err instanceof ApiClientError) {
          setError(`API Error (${err.status}): ${err.detail}`);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('An unexpected error occurred during plan generation.');
        }
      } finally {
        setLoading(false);
      }
    },
    [question, plan]
  );

  // Clarification Submission
  const handleClarificationSubmit = useCallback(
    (chosenAnswer?: string) => {
      const ans = (chosenAnswer ?? clarificationAnswer).trim();
      if (!ans || !plan) return;

      const refinedContext: Record<string, unknown> = {
        previous_question: plan.original_question,
        clarification_response: ans,
      };

      // Combine original intent with clarification
      const refinedQuestion = `${plan.original_question} (Clarification: ${ans})`;
      setQuestion(refinedQuestion);
      handleGeneratePlan(refinedQuestion, refinedContext);
    },
    [clarificationAnswer, plan, handleGeneratePlan]
  );

  // Validate Plan with backend /api/neuroquery/validate
  const handleValidatePlan = useCallback(async () => {
    if (!plan) return;
    setValidating(true);
    try {
      const report = await api.validateInvestigationPlan({ plan });
      setValidationReport(report);
    } catch (err) {
      console.error('Validation request failed:', err);
    } finally {
      setValidating(false);
    }
  }, [plan]);

  // Export Plan to JSON
  const handleExportPlan = useCallback(() => {
    if (!plan) return;
    const blob = new Blob([JSON.stringify(plan, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investigation-plan-${plan.plan_id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [plan]);

  // Execute Investigation (V8)
  const handleExecuteInvestigation = useCallback(async () => {
    if (!plan) return;
    setExecuting(true);
    setExecutionError(null);
    try {
      const res = await api.executeInvestigationPlan({
        plan,
        max_candidates: 25,
        max_subgraph_nodes: 50,
        min_edge_weight: 1,
      });
      setExecutionResult(res);
    } catch (err: unknown) {
      console.error('Investigation execution failed:', err);
      if (err instanceof ApiClientError) {
        setExecutionError(`Execution Error (${err.status}): ${err.detail}`);
      } else if (err instanceof Error) {
        setExecutionError(err.message);
      } else {
        setExecutionError('An unexpected error occurred during circuit discovery execution.');
      }
    } finally {
      setExecuting(false);
    }
  }, [plan]);


  // Helper for Status Badge styling
  const renderSupportStatusBadge = (status: PlanSupportStatus) => {
    switch (status) {
      case 'ready_for_review':
        return (
          <span className="badge badge-emerald" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle2 size={12} /> Ready for Review
          </span>
        );
      case 'needs_clarification':
        return (
          <span className="badge badge-amber" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <HelpCircle size={12} /> Clarification Needed
          </span>
        );
      case 'partially_supported':
        return (
          <span className="badge badge-yellow" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle size={12} /> Partially Supported
          </span>
        );
      case 'unsupported':
        return (
          <span className="badge badge-rose" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <XCircle size={12} /> Unsupported Query
          </span>
        );
      case 'validation_failed':
        return (
          <span className="badge badge-rose" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle size={12} /> Validation Failed
          </span>
        );
      case 'provider_unavailable':
        return (
          <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Clock size={12} /> Provider Unavailable
          </span>
        );
      default:
        return <span className="badge">{status}</span>;
    }
  };

  // Helper for Intent Badge
  const renderIntentBadge = (intent: IntentType) => {
    const labels: Record<IntentType, string> = {
      circuit_discovery: 'Circuit Discovery (V8 Execution)',
      inspect_neuron: 'Neuron Inspection',
      structural_pathway_search: 'Structural Pathway Search',
      downstream_reachability: 'Downstream Reachability',
      structural_intervention_analysis: 'Structural Intervention Analysis',
      general_question: 'General Neurobiology Question',
      unsupported_biological_question: 'Unsupported Biological Query',
      ambiguous_question: 'Ambiguous Query',
    };
    return (
      <span className="badge badge-blue" style={{ fontWeight: 600 }}>
        {labels[intent] || intent}
      </span>
    );
  };

  return (
    <div
      className="neuroquery-workspace"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
        padding: '20px 28px',
        backgroundColor: 'var(--color-bg)',
        gap: 20,
      }}
    >
      {/* ── 1. Header & Configuration Notice ──────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={22} style={{ color: 'var(--color-primary)' }} />
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
              Ask NeuroQuery
            </h1>
            <span className="badge badge-purple" style={{ fontSize: 11, fontWeight: 600 }}>
              Version 7.0
            </span>
          </div>
          <p style={{ margin: '6px 0 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Natural-language understanding & structured investigation planning grounded in MaleCNS v1.0 and verified scientific literature.
          </p>
        </div>

        {/* Provider Status Pill */}
        {providerConfig && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              backgroundColor: 'var(--color-surface)',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              fontSize: 12,
            }}
          >
            <Cpu size={14} style={{ color: 'var(--color-primary)' }} />
            <span style={{ fontWeight: 600 }}>Provider:</span>
            <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>
              {providerConfig.provider} ({providerConfig.model})
            </span>
            <span
              className={`status-dot ${providerConfig.is_configured ? 'online' : 'degraded'}`}
              title={providerConfig.notice}
            />
          </div>
        )}
      </div>

      {/* ── 2. Natural Language Question Input ────────────────────────────── */}
      <div
        className="card"
        style={{
          padding: 16,
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <label
          htmlFor="neuroquery-question-input"
          style={{
            display: 'block',
            fontWeight: 600,
            fontSize: 13,
            marginBottom: 8,
            color: 'var(--color-text)',
          }}
        >
          Ask a Biological or Structural Question:
        </label>

        <div style={{ display: 'flex', gap: 10 }}>
          <textarea
            id="neuroquery-question-input"
            rows={2}
            className="input-textarea"
            placeholder="e.g. How does the fruit fly visual system detect directional motion? Or: Find paths from DNp01 to motor neurons."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleGeneratePlan();
              }
            }}
            disabled={loading}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              fontSize: 14,
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              id="btn-interpret-question"
              className="btn btn-primary"
              onClick={() => handleGeneratePlan()}
              disabled={loading || !question.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 16px',
                height: '100%',
                fontWeight: 600,
              }}
            >
              {loading ? (
                <>
                  <RefreshCw size={15} className="spin" />
                  <span>Planning...</span>
                </>
              ) : (
                <>
                  <Send size={15} />
                  <span>Interpret Question</span>
                </>
              )}
            </button>
            {loading && (
              <button
                className="btn btn-sm btn-outline"
                onClick={() => {
                  if (abortControllerRef.current) {
                    abortControllerRef.current.abort();
                    setLoading(false);
                  }
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Example prompts for quick exploration */}
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginRight: 4 }}>
            Sample questions:
          </span>
          {EXAMPLE_QUESTIONS.map((item, idx) => (
            <button
              key={idx}
              className="btn btn-xs btn-outline"
              onClick={() => {
                setQuestion(item.query);
                handleGeneratePlan(item.query);
              }}
              disabled={loading}
              style={{ fontSize: 11, borderRadius: 12 }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: '8px 12px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 6,
              color: '#ef4444',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* ── 3. Plan Preview & Interpretation ──────────────────────────────── */}
      {plan && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Top Bar of Active Plan */}
          <div
            className="card"
            style={{
              padding: 16,
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
                borderBottom: '1px solid var(--color-border)',
                paddingBottom: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  PLAN IDENTIFIER:
                </span>{' '}
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{plan.plan_id}</span>
                <span style={{ margin: '0 8px', color: 'var(--color-border)' }}>•</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  Catalog v{plan.knowledge_catalog_version} | Dataset {plan.dataset_version}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {renderSupportStatusBadge(plan.support_status)}
                <button
                  id="btn-validate-plan"
                  className="btn btn-sm btn-outline"
                  onClick={handleValidatePlan}
                  disabled={validating}
                  style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <ShieldCheck size={14} />
                  <span>{validating ? 'Auditing...' : 'Validate Plan'}</span>
                </button>
                <button
                  id="btn-run-investigation"
                  className="btn btn-sm btn-primary"
                  onClick={handleExecuteInvestigation}
                  disabled={executing || plan.support_status !== 'ready_for_review'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    backgroundColor: plan.support_status === 'ready_for_review' ? '#059669' : undefined,
                    borderColor: plan.support_status === 'ready_for_review' ? '#047857' : undefined,
                    color: '#ffffff',
                    fontWeight: 600,
                  }}
                  title={
                    plan.support_status === 'ready_for_review'
                      ? 'Execute investigation and discover neural circuit from MaleCNS data'
                      : 'Investigation plan must be ready for review before execution'
                  }
                >
                  {executing ? (
                    <>
                      <RefreshCw size={14} className="spin" />
                      <span>Executing V8...</span>
                    </>
                  ) : (
                    <>
                      <Play size={14} />
                      <span>Run Investigation (V8)</span>
                    </>
                  )}
                </button>
                <button
                  id="btn-export-plan-json"
                  className="btn btn-sm btn-outline"
                  onClick={handleExportPlan}
                  style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <Download size={14} />
                  <span>Export JSON</span>
                </button>
              </div>
            </div>

            {/* Execution Error Banner (if any) */}
            {executionError && (
              <div
                style={{
                  marginBottom: 12,
                  padding: '10px 14px',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 6,
                  color: '#dc2626',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <XCircle size={16} />
                <span>{executionError}</span>
              </div>
            )}

            {/* Natural-Language Interpretation Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  INTERPRETED INTENT:
                </span>
                <div style={{ marginTop: 4 }}>{renderIntentBadge(plan.intent)}</div>
                {plan.confidence_score !== undefined && plan.confidence_score !== null && (
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    Model Confidence: <strong>{(plan.confidence_score * 100).toFixed(0)}%</strong> —{' '}
                    <span>{plan.confidence_explanation}</span>
                  </div>
                )}
              </div>

              <div>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  RESOLVED BIOLOGICAL CONCEPTS (V6):
                </span>
                <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {plan.resolved_concepts.length > 0 ? (
                    plan.resolved_concepts.map((c) => (
                      <button
                        key={c.concept_id}
                        className="badge badge-indigo"
                        onClick={() => onNavigateToKnowledge?.(c.concept_id)}
                        title={`Domain: ${c.domain} | Status: ${c.evidence_status}`}
                        style={{
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          border: 'none',
                        }}
                      >
                        <BookOpen size={11} />
                        <span>{c.display_name}</span>
                      </button>
                    ))
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                      No cataloged concepts resolved for this query.
                    </span>
                  )}
                </div>
              </div>

              {plan.investigation && (
                <div>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                    PROPOSED INVESTIGATION PIPELINE:
                  </span>
                  <div style={{ marginTop: 4, fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>
                    {plan.investigation.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                    {plan.investigation.graph_scope_constraints}
                  </div>
                </div>
              )}
            </div>

            {/* Explanation text */}
            {plan.explanation && (
              <div
                style={{
                  marginTop: 14,
                  padding: '10px 14px',
                  backgroundColor: 'var(--color-bg)',
                  borderRadius: 6,
                  borderLeft: '3px solid var(--color-primary)',
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: 'var(--color-text)',
                }}
              >
                <strong>Scientific Interpretation:</strong> {plan.explanation}
              </div>
            )}
          </div>

          {/* ── 4. Clarification Panel (if needed) ───────────────────────── */}
          {(plan.clarification_needed || plan.intent === 'ambiguous_question') && (
            <div
              className="card"
              style={{
                padding: 16,
                backgroundColor: 'rgba(245, 158, 11, 0.05)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#d97706', fontWeight: 600, fontSize: 14 }}>
                <HelpCircle size={18} />
                <span>Clarification Required to Proceed</span>
              </div>
              <p style={{ margin: '8px 0 12px 0', fontSize: 13, color: 'var(--color-text)' }}>
                Your biological question is ambiguous or underspecified. Please clarify your specific area of interest:
              </p>

              {plan.clarification_questions.length > 0 && (
                <ul style={{ margin: '0 0 12px 18px', padding: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  {plan.clarification_questions.map((cq, idx) => (
                    <li key={idx} style={{ marginBottom: 4 }}>
                      <strong>{cq}</strong>
                    </li>
                  ))}
                </ul>
              )}

              {/* Quick Select Options for Visual Ambiguity */}
              {plan.original_question.toLowerCase().includes('visual') && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  <button
                    className="btn btn-xs btn-outline"
                    onClick={() => handleClarificationSubmit('Directional motion detection in T4/T5')}
                  >
                    Directional motion detection (T4/T5)
                  </button>
                  <button
                    className="btn btn-xs btn-outline"
                    onClick={() => handleClarificationSubmit('Color processing in medulla Tm5/Dm8')}
                  >
                    Color vision (Tm5/Dm8)
                  </button>
                  <button
                    className="btn btn-xs btn-outline"
                    onClick={() => handleClarificationSubmit('Looming escape detection in LC4/LPLC2')}
                  >
                    Looming collision detection (LC4/LPLC2)
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  className="input-text"
                  placeholder="Type your clarification (e.g. 'I want to focus on color vision' or 'Start from descending neuron 10001')..."
                  value={clarificationAnswer}
                  onChange={(e) => setClarificationAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleClarificationSubmit();
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--color-border)',
                    fontSize: 13,
                  }}
                />
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => handleClarificationSubmit()}
                  disabled={!clarificationAnswer.trim()}
                >
                  Refine Plan
                </button>
              </div>
            </div>
          )}

          {/* ── V8 Discovered Circuit View (when executed) ────────────────── */}
          {executionResult && (
            <CircuitDiscoveryView
              result={executionResult}
              onSelectNeuron={onSelectNeuron}
              onNavigateToKnowledge={onNavigateToKnowledge}
              onNavigateToExplorer={onNavigateToExplorer}
              onNavigateToPathway={onNavigateToPathway}
              onNavigateToPerturbation={onNavigateToPerturbation}
              onResetExecution={() => setExecutionResult(null)}
            />
          )}

          {/* ── 5. Planned Operations Table ──────────────────────────────── */}
          <div

            className="card"
            style={{
              padding: 16,
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Layers size={16} style={{ color: 'var(--color-primary)' }} />
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                Structured Operations Pipeline
              </h2>
            </div>

            {plan.planned_operations.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px' }}>#</th>
                      <th style={{ padding: '8px 10px' }}>Tool / Service</th>
                      <th style={{ padding: '8px 10px' }}>Description</th>
                      <th style={{ padding: '8px 10px' }}>Parameters</th>
                      <th style={{ padding: '8px 10px' }}>Scope Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.planned_operations.map((op: PlannedOperation, idx: number) => (
                      <tr key={op.operation_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{idx + 1}</td>
                        <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                          {op.tool_name}
                        </td>
                        <td style={{ padding: '8px 10px' }}>{op.description}</td>
                        <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11 }}>
                          {JSON.stringify(op.parameters)}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          {op.is_v8_execution ? (
                            <span className="badge badge-purple" style={{ fontSize: 10 }}>
                              V8 Execution
                            </span>
                          ) : (
                            <span className="badge badge-emerald" style={{ fontSize: 10 }}>
                              V7 Prepared
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                No active graph operations required for this query category.
              </p>
            )}

            {/* Parameters & Entities Details */}
            <div
              style={{
                marginTop: 14,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 12,
                fontSize: 12,
                padding: '10px 12px',
                backgroundColor: 'var(--color-bg)',
                borderRadius: 6,
              }}
            >
              <div>
                <strong>Bound Parameters:</strong>
                <div style={{ marginTop: 4, fontFamily: 'monospace' }}>
                  {Object.keys(plan.parameters).length > 0
                    ? JSON.stringify(plan.parameters)
                    : '(defaults applied)'}
                </div>
              </div>
              <div>
                <strong>Requested Entities:</strong>
                <div style={{ marginTop: 4 }}>
                  {Object.keys(plan.requested_entities).length > 0 ? (
                    Object.entries(plan.requested_entities).map(([k, v]) => (
                      <span key={k} style={{ marginRight: 8 }}>
                        {k}: <strong>{String(v)}</strong>
                        {k === 'body_id' && typeof v === 'number' && (
                          <button
                            className="btn btn-xs btn-outline"
                            onClick={() => onNavigateToExplorer?.(v)}
                            style={{ marginLeft: 4, fontSize: 10, padding: '1px 5px' }}
                          >
                            Inspect
                          </button>
                        )}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: 'var(--color-text-secondary)' }}>(none specified)</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── 6. Evidence Sources & Scientific Citations ────────────────── */}
          <div
            className="card"
            style={{
              padding: 16,
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <BookOpen size={16} style={{ color: 'var(--color-primary)' }} />
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                Scientific Evidence & Literature Provenance
              </h2>
            </div>

            {plan.evidence_sources.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {plan.evidence_sources.map((src: EvidenceSource) => (
                  <div
                    key={src.source_id}
                    style={{
                      padding: '10px 12px',
                      backgroundColor: 'var(--color-bg)',
                      borderRadius: 6,
                      border: '1px solid var(--color-border)',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{src.title}</div>
                    <div style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
                      {src.authors} ({src.year}) — <em>{src.journal || 'Connectome Report'}</em>
                    </div>
                    {src.doi && (
                      <div style={{ marginTop: 4 }}>
                        <a
                          href={`https://doi.org/${src.doi}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: 'var(--color-primary)',
                            textDecoration: 'none',
                            fontWeight: 500,
                          }}
                        >
                          <span>doi:{src.doi}</span>
                          <ExternalLink size={10} />
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                No literature references linked for this query.
              </p>
            )}
          </div>

          {/* ── 7. Validation Findings & Limitations ───────────────────────── */}
          <div
            className="card"
            style={{
              padding: 16,
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <ShieldCheck size={16} style={{ color: 'var(--color-primary)' }} />
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                Plan Validation & Scope Boundaries
              </h2>
            </div>

            {validationReport && (
              <div
                style={{
                  marginBottom: 12,
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: validationReport.valid
                    ? '1px solid rgba(16, 185, 129, 0.3)'
                    : '1px solid rgba(239, 68, 68, 0.3)',
                  backgroundColor: validationReport.valid
                    ? 'rgba(16, 185, 129, 0.05)'
                    : 'rgba(239, 68, 68, 0.05)',
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 600, color: validationReport.valid ? '#059669' : '#dc2626' }}>
                  {validationReport.summary}
                </div>
                {validationReport.errors.length > 0 && (
                  <ul style={{ margin: '6px 0 0 16px', padding: 0, color: '#dc2626' }}>
                    {validationReport.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
                {validationReport.warnings.length > 0 && (
                  <ul style={{ margin: '6px 0 0 16px', padding: 0, color: '#d97706' }}>
                    {validationReport.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Validation Findings */}
            {plan.validation_findings.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>
                  Backend Audit Findings:
                </span>
                <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {plan.validation_findings.map((finding, idx) => (
                    <li key={idx}>{finding}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Limitations */}
            {plan.limitations.length > 0 && (
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>
                  Known Scientific & Version Limitations:
                </span>
                <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {plan.limitations.map((lim, idx) => (
                    <li key={idx}>{lim}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
