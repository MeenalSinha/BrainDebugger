/**
 * BrainDebugger — Knowledge Explorer (Version 6)
 *
 * NeuroQuery Foundation & Biological Knowledge Layer:
 * Browse versioned biological concepts, verify scientific provenance through
 * peer-reviewed citations (with DOIs), inspect verified concept-to-annotation mappings,
 * retrieve real candidate neurons from the MaleCNS dataset, and review catalog audit reports.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Search,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  FileText,
  GitBranch,
  Eye,
  Activity,
  Layers,
  Sparkles,
  Info,
  X,
  RefreshCw,
} from 'lucide-react';
import { api, ApiClientError } from '../api';
import type {
  BiologicalConcept,
  ConceptCandidateNeuron,
  ConceptDetailResponse,
  EvidenceSource,
  KnowledgeStatusResponse,
  KnowledgeValidationReport,
  SupportedInvestigation,
} from '../types';

interface KnowledgeExplorerProps {
  onSelectNeuron: (bodyId: number) => void;
  onSetPathwaySource?: (bodyId: number) => void;
  onNavigateToExplorer?: (bodyId: number) => void;
}

export function KnowledgeExplorer({
  onSelectNeuron,
  onSetPathwaySource,
  onNavigateToExplorer,
}: KnowledgeExplorerProps) {
  // ── Catalog State ──────────────────────────────────────────────────────────
  const [status, setStatus] = useState<KnowledgeStatusResponse | null>(null);
  const [concepts, setConcepts] = useState<BiologicalConcept[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // ── Filters & Search ───────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCompatibility, setSelectedCompatibility] = useState<string>('all');

  // ── Active Concept Selection ───────────────────────────────────────────────
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [conceptDetail, setConceptDetail] = useState<ConceptDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── Candidate Neurons ──────────────────────────────────────────────────────
  const [candidates, setCandidates] = useState<ConceptCandidateNeuron[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState<boolean>(false);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);

  // ── Audit Diagnostics Modal ────────────────────────────────────────────────
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);
  const [auditReport, setAuditReport] = useState<KnowledgeValidationReport | null>(null);
  const [auditLoading, setAuditLoading] = useState<boolean>(false);

  // ── 1. Initial Load: Catalog Status & Concepts ────────────────────────────
  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, conceptsRes] = await Promise.all([
        api.getKnowledgeStatus(),
        api.listConcepts(),
      ]);
      setStatus(statusRes);
      setConcepts(conceptsRes);
      // Select first verified concept if none selected
      if (!selectedConceptId && conceptsRes.length > 0) {
        const firstVerified = conceptsRes.find((c) => c.evidence_status === 'verified') || conceptsRes[0];
        setSelectedConceptId(firstVerified.concept_id);
      }
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.detail : (err as Error).message;
      setError(msg || 'Failed to load biological knowledge catalog.');
    } finally {
      setLoading(false);
    }
  }, [selectedConceptId]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // ── 2. Load Selected Concept Detail & Candidates ──────────────────────────
  useEffect(() => {
    if (!selectedConceptId) {
      setConceptDetail(null);
      setCandidates([]);
      return;
    }

    const abortController = new AbortController();
    const signal = abortController.signal;

    setDetailLoading(true);
    setDetailError(null);
    setCandidatesLoading(true);
    setCandidatesError(null);

    // Fetch Concept Detail
    api
      .getConceptDetail(selectedConceptId, signal)
      .then((detail) => {
        setConceptDetail(detail);
      })
      .catch((err) => {
        if (!signal.aborted) {
          const msg = err instanceof ApiClientError ? err.detail : (err as Error).message;
          setDetailError(msg || 'Failed to load concept details.');
        }
      })
      .finally(() => {
        if (!signal.aborted) setDetailLoading(false);
      });

    // Fetch Candidate Neurons
    api
      .getConceptCandidates(selectedConceptId, { limit: 100 }, signal)
      .then((cands) => {
        setCandidates(cands);
      })
      .catch((err) => {
        if (!signal.aborted) {
          const msg = err instanceof ApiClientError ? err.detail : (err as Error).message;
          setCandidatesError(msg || 'Failed to retrieve candidate neurons.');
        }
      })
      .finally(() => {
        if (!signal.aborted) setCandidatesLoading(false);
      });

    return () => {
      abortController.abort();
    };
  }, [selectedConceptId]);

  // ── 3. Filtered Concepts List ──────────────────────────────────────────────
  const filteredConcepts = useMemo(() => {
    return concepts.filter((c) => {
      if (selectedDomain !== 'all' && c.domain !== selectedDomain) return false;
      if (selectedStatus !== 'all' && c.evidence_status !== selectedStatus) return false;
      if (selectedCompatibility !== 'all' && c.dataset_compatibility !== selectedCompatibility) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = c.display_name.toLowerCase().includes(q);
        const matchDesc = c.description.toLowerCase().includes(q);
        const matchId = c.concept_id.toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchId) return false;
      }
      return true;
    });
  }, [concepts, selectedDomain, selectedStatus, selectedCompatibility, searchQuery]);

  // ── 4. Audit Modal Handler ────────────────────────────────────────────────
  const handleOpenAudit = async () => {
    setShowAuditModal(true);
    setAuditLoading(true);
    try {
      const rep = await api.auditKnowledgeCatalog();
      setAuditReport(rep);
    } catch (err) {
      console.error('Audit failed:', err);
    } finally {
      setAuditLoading(false);
    }
  };

  // Helper for evidence status styling
  const renderStatusBadge = (evidenceStatus: string) => {
    switch (evidenceStatus) {
      case 'verified':
        return (
          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle2 size={11} /> Verified
          </span>
        );
      case 'partially_supported':
        return (
          <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Info size={11} /> Partially Supported
          </span>
        );
      case 'requires_review':
        return (
          <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <AlertCircle size={11} /> Requires Review
          </span>
        );
      default:
        return <span className="badge badge-neutral">{evidenceStatus}</span>;
    }
  };

  // Helper for dataset compatibility styling
  const renderCompatibilityBadge = (compatibility: string) => {
    switch (compatibility) {
      case 'compatible':
        return (
          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ShieldCheck size={11} /> MaleCNS Compatible
          </span>
        );
      case 'partial_coverage':
        return (
          <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Layers size={11} /> Partial Coverage
          </span>
        );
      case 'incompatible':
        return (
          <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <AlertCircle size={11} /> Incompatible
          </span>
        );
      default:
        return <span className="badge badge-neutral">{compatibility}</span>;
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '340px 1fr',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: 'var(--color-bg)',
      }}
    >
      {/* ── LEFT COLUMN: Concept Browser ─────────────────────────────────── */}
      <aside
        style={{
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-surface)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 14px',
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={16} style={{ color: 'var(--color-primary)' }} />
            <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>NeuroQuery Catalog</h2>
          </div>
          <button
            className="btn btn-sm btn-outline"
            onClick={handleOpenAudit}
            title="Inspect Knowledge Catalog Audit & Diagnostic Report"
            style={{ fontSize: 11, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <ShieldCheck size={12} />
            <span>Audit</span>
          </button>
        </div>

        {/* Search & Filters */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={13}
              style={{
                position: 'absolute',
                left: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="Search concepts or descriptions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px 6px 26px',
                fontSize: 12,
                borderRadius: 4,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
              }}
            />
          </div>

          {/* Domain Pills */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['all', 'visual_processing', 'motor_control', 'olfactory', 'mechanosensory'].map((d) => (
              <button
                key={d}
                className={`btn btn-xs ${selectedDomain === d ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setSelectedDomain(d)}
                style={{ fontSize: 10, padding: '2px 6px', textTransform: 'capitalize' }}
              >
                {d === 'all' ? 'All Domains' : d.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Status & Compatibility dropdowns */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{
                fontSize: 11,
                padding: '4px',
                borderRadius: 4,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
              }}
            >
              <option value="all">All Statuses</option>
              <option value="verified">Verified</option>
              <option value="partially_supported">Partial</option>
              <option value="requires_review">Needs Review</option>
            </select>
            <select
              value={selectedCompatibility}
              onChange={(e) => setSelectedCompatibility(e.target.value)}
              style={{
                fontSize: 11,
                padding: '4px',
                borderRadius: 4,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
              }}
            >
              <option value="all">All Compatibilities</option>
              <option value="compatible">Compatible</option>
              <option value="partial_coverage">Partial Coverage</option>
              <option value="incompatible">Incompatible</option>
            </select>
          </div>
        </div>

        {/* Concept Cards List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-muted)' }}>
              <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto 8px' }} />
              <div>Loading biological concepts...</div>
            </div>
          )}

          {error && (
            <div className="alert alert-error" style={{ fontSize: 12, margin: 8 }}>
              {error}
            </div>
          )}

          {!loading && !error && filteredConcepts.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-muted)', fontSize: 12 }}>
              No concepts match the selected filters.
            </div>
          )}

          {!loading &&
            filteredConcepts.map((c) => {
              const isSelected = c.concept_id === selectedConceptId;
              return (
                <div
                  key={c.concept_id}
                  onClick={() => setSelectedConceptId(c.concept_id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 6,
                    border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: isSelected ? 'var(--color-primary-light)' : 'var(--color-surface)',
                    marginBottom: 8,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 12,
                        color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
                      }}
                    >
                      {c.display_name}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {c.domain.replace('_', ' ')}
                    </span>
                  </div>

                  <p
                    style={{
                      fontSize: 11,
                      color: 'var(--color-text-muted)',
                      margin: '0 0 8px 0',
                      lineHeight: 1.35,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {c.description}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {renderStatusBadge(c.evidence_status)}
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 5px',
                        borderRadius: 3,
                        background: 'var(--color-surface-2)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {c.mapping_ids.length} {c.mapping_ids.length === 1 ? 'mapping' : 'mappings'}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      </aside>

      {/* ── RIGHT COLUMN: Concept Detail, Evidence & Candidates ──────────── */}
      <main
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflowY: 'auto',
          padding: '20px 28px',
          background: 'var(--color-bg)',
        }}
      >
        {!selectedConceptId && (
          <div
            style={{
              margin: 'auto',
              textAlign: 'center',
              maxWidth: 420,
              color: 'var(--color-text-muted)',
            }}
          >
            <BookOpen size={48} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 }}>
              Select a Biological Concept
            </h3>
            <p style={{ fontSize: 13, lineHeight: 1.5 }}>
              Choose a concept from the NeuroQuery catalog to inspect its verified scientific references,
              MaleCNS dataset mappings, supported graph investigations, and real candidate neurons.
            </p>
          </div>
        )}

        {selectedConceptId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1080 }}>
            {/* Concept Header Card */}
            <div
              style={{
                background: 'var(--color-surface)',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                padding: '18px 22px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                      {conceptDetail?.concept.display_name || selectedConceptId}
                    </h1>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: 'var(--color-surface-2)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-muted)',
                        fontWeight: 500,
                      }}
                    >
                      {conceptDetail?.concept.domain.replace('_', ' ')}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5, margin: 0 }}>
                    {conceptDetail?.concept.description}
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  {conceptDetail && renderStatusBadge(conceptDetail.concept.evidence_status)}
                  {conceptDetail && renderCompatibilityBadge(conceptDetail.concept.dataset_compatibility)}
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                    Catalog v{conceptDetail?.concept.catalog_version || '1.0.0'}
                  </span>
                </div>
              </div>

              {/* Scientific Limitations / Coverage Notes */}
              {conceptDetail?.concept.limitations && (
                <div
                  style={{
                    marginTop: 14,
                    padding: '8px 12px',
                    borderRadius: 4,
                    background: '#fef3c7',
                    border: '1px solid #fde68a',
                    fontSize: 12,
                    color: '#92400e',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                  }}
                >
                  <AlertCircle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <strong>Scientific Notice & Limitations:</strong> {conceptDetail.concept.limitations}
                  </div>
                </div>
              )}
            </div>

            {/* Peer-Reviewed Scientific Sources */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <FileText size={16} style={{ color: 'var(--color-primary)' }} />
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Scientific Evidence Sources ({conceptDetail?.sources.length || 0})
                </h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
                {conceptDetail?.sources.map((src) => (
                  <div
                    key={src.source_id}
                    style={{
                      background: 'var(--color-surface)',
                      borderRadius: 6,
                      border: '1px solid var(--color-border)',
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>
                        {src.title}
                      </span>
                      {src.doi && (
                        <a
                          href={`https://doi.org/${src.doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: 11,
                            color: 'var(--color-primary)',
                            textDecoration: 'none',
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          DOI <ExternalLink size={11} />
                        </a>
                      )}
                    </div>

                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {Array.isArray(src.authors) ? src.authors.join(', ') : String(src.authors || '')} {src.year ? `(${src.year})` : ''}
                    </div>

                    {(src.key_findings || src.relevant_section || src.notes) && (
                      <p style={{ fontSize: 11, color: 'var(--color-text)', margin: '4px 0 0', lineHeight: 1.4 }}>
                        <strong>Key Finding:</strong> {src.key_findings || src.relevant_section || src.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Validated Concept Mappings */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <GitBranch size={16} style={{ color: 'var(--color-primary)' }} />
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Dataset Mapping Rules ({conceptDetail?.mappings.length || 0})
                </h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {conceptDetail?.mappings.map((m) => (
                  <div
                    key={m.mapping_id}
                    style={{
                      background: 'var(--color-surface)',
                      borderRadius: 6,
                      border: '1px solid var(--color-border)',
                      padding: '12px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: 'var(--color-primary)' }}>
                          {m.mapping_id}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                          Target Field: <code>{m.target_field}</code> ({m.match_type})
                        </span>
                      </div>
                      <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                        {m.dataset_version}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 10px' }}>
                      {m.target_values.map((v) => (
                        <span
                          key={v}
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: 'var(--color-surface-2)',
                            border: '1px solid var(--color-border)',
                            fontWeight: 600,
                          }}
                        >
                          {v}
                        </span>
                      ))}
                    </div>

                    <p style={{ fontSize: 12, color: 'var(--color-text)', margin: '0 0 6px', lineHeight: 1.45 }}>
                      <strong>Rationale:</strong> {m.rationale}
                    </p>

                    {m.known_limitations && (
                      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
                        <em>Limitation:</em> {m.known_limitations}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Supported Connectome Investigations */}
            {conceptDetail?.supported_investigations && conceptDetail.supported_investigations.length > 0 && (
              <section>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Activity size={16} style={{ color: 'var(--color-primary)' }} />
                  <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Supported Connectome Investigations ({conceptDetail.supported_investigations.length})
                  </h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                  {conceptDetail.supported_investigations.map((inv) => (
                    <div
                      key={inv.investigation_id}
                      style={{
                        background: 'var(--color-surface)',
                        borderRadius: 6,
                        border: '1px solid var(--color-border)',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600, fontSize: 12 }}>{inv.name}</span>
                        <span className="badge badge-success" style={{ fontSize: 9 }}>
                          {inv.status}
                        </span>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
                        {inv.description}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Candidate Neurons Table */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Layers size={16} style={{ color: 'var(--color-primary)' }} />
                  <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Candidate Neurons ({candidates.length})
                  </h3>
                </div>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                  Dataset: {status?.dataset_version || 'male-cns:v1.0'}
                </span>
              </div>

              {candidatesLoading && (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-muted)' }}>
                  <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                  <div>Retrieving matching neurons from connectome dataset...</div>
                </div>
              )}

              {candidatesError && (
                <div className="alert alert-error" style={{ fontSize: 12 }}>
                  {candidatesError}
                </div>
              )}

              {!candidatesLoading && !candidatesError && candidates.length === 0 && (
                <div
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px dashed var(--color-border)',
                    borderRadius: 6,
                    padding: 24,
                    textAlign: 'center',
                    color: 'var(--color-text-muted)',
                    fontSize: 12,
                  }}
                >
                  <AlertCircle size={24} style={{ margin: '0 auto 8px', color: 'var(--color-warning)' }} />
                  <div>No candidate neurons match the configured mappings in MaleCNS v1.0.</div>
                  <div style={{ marginTop: 4, fontSize: 11 }}>
                    {conceptDetail?.concept.dataset_compatibility === 'incompatible'
                      ? 'This concept requires annotations not present in the current connectome release.'
                      : 'Review the mapping rule or check dataset coverage.'}
                  </div>
                </div>
              )}

              {!candidatesLoading && !candidatesError && candidates.length > 0 && (
                <div
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 6,
                    overflow: 'hidden',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                        <th style={{ padding: '8px 12px', fontWeight: 600 }}>Body ID</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600 }}>Cell Type</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600 }}>Instance</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600 }}>Superclass</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600 }}>Neurotransmitter</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600 }}>Matched Field</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.slice(0, 50).map((cand) => (
                        <tr
                          key={cand.body_id}
                          style={{
                            borderBottom: '1px solid var(--color-border)',
                            transition: 'background 0.1s ease',
                          }}
                        >
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600 }}>
                            {cand.body_id}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span className="badge badge-neutral" style={{ fontFamily: 'monospace' }}>
                              {cand.cell_type || '—'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--color-text-muted)' }}>
                            {cand.instance || '—'}
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--color-text-muted)' }}>
                            {cand.superclass || '—'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {cand.consensus_nt ? (
                              <span style={{ textTransform: 'capitalize', fontSize: 11 }}>
                                {cand.consensus_nt}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--color-text-muted)' }}>
                            <code>{cand.matched_field}</code> = <strong>{cand.matched_value}</strong>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              <button
                                className="btn btn-xs btn-outline"
                                onClick={() => onSelectNeuron(cand.body_id)}
                                title="Inspect neuron profile and connectivity"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
                              >
                                <Eye size={11} /> Inspect
                              </button>
                              {onNavigateToExplorer && (
                                <button
                                  className="btn btn-xs btn-primary"
                                  onClick={() => onNavigateToExplorer(cand.body_id)}
                                  title="Open in Connectome Explorer"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                >
                                  <Layers size={11} /> Explorer
                                </button>
                              )}
                              {onSetPathwaySource && (
                                <button
                                  className="btn btn-xs btn-outline"
                                  onClick={() => onSetPathwaySource(cand.body_id)}
                                  title="Trace neural pathway from this neuron"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                >
                                  <GitBranch size={11} /> Trace
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {candidates.length > 50 && (
                    <div style={{ padding: '8px 12px', background: 'var(--color-surface-2)', fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center' }}>
                      Showing top 50 of {candidates.length} matching candidate neurons.
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* ── AUDIT DIAGNOSTICS MODAL ─────────────────────────────────────── */}
      {showAuditModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowAuditModal(false)}
        >
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              width: 580,
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '12px 18px',
                borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-surface-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={18} style={{ color: 'var(--color-primary)' }} />
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
                  Knowledge Catalog Validation Audit
                </h3>
              </div>
              <button
                className="btn btn-xs btn-outline"
                onClick={() => setShowAuditModal(false)}
                style={{ padding: 4 }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {auditLoading && (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-muted)' }}>
                  <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                  <div>Running automated catalog and compatibility audit...</div>
                </div>
              )}

              {!auditLoading && auditReport && (
                <>
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: 6,
                      background: auditReport.valid ? '#dcfce7' : '#fee2e2',
                      border: `1px solid ${auditReport.valid ? '#86efac' : '#fca5a5'}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    {auditReport.valid ? (
                      <CheckCircle2 size={20} style={{ color: '#16a34a', flexShrink: 0 }} />
                    ) : (
                      <AlertCircle size={20} style={{ color: '#dc2626', flexShrink: 0 }} />
                    )}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: auditReport.valid ? '#166534' : '#991b1b' }}>
                        {auditReport.valid ? 'Catalog Integrity & Schema Valid' : 'Catalog Validation Errors Detected'}
                      </div>
                      <div style={{ fontSize: 11, color: auditReport.valid ? '#15803d' : '#b91c1c' }}>
                        {auditReport.summary}
                      </div>
                    </div>
                  </div>

                  {/* Metrics grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    <div style={{ padding: '10px', background: 'var(--color-surface-2)', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{auditReport.concept_count}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Concepts</div>
                    </div>
                    <div style={{ padding: '10px', background: 'var(--color-surface-2)', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a' }}>
                        {auditReport.compatible_mapping_count}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Compatible</div>
                    </div>
                    <div style={{ padding: '10px', background: 'var(--color-surface-2)', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#d97706' }}>
                        {auditReport.incompatible_mapping_count}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Incompatible</div>
                    </div>
                  </div>

                  {/* Versions */}
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Catalog Version: <strong>v{auditReport.catalog_version}</strong></span>
                    <span>Target Dataset: <strong>{auditReport.dataset_version}</strong></span>
                  </div>

                  {/* Warnings & Notes */}
                  {auditReport.warnings.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#92400e' }}>
                        Coverage & Compatibility Notes:
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                        {auditReport.warnings.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Errors if any */}
                  {auditReport.errors.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#dc2626' }}>
                        Validation Errors:
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: '#dc2626', lineHeight: 1.5 }}>
                        {auditReport.errors.map((e, idx) => (
                          <li key={idx}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '10px 18px',
                borderTop: '1px solid var(--color-border)',
                background: 'var(--color-surface-2)',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button className="btn btn-sm btn-primary" onClick={() => setShowAuditModal(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
