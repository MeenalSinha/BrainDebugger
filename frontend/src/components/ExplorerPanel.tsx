/**
 * ExplorerPanel — Left panel with search input and results list.
 *
 * Search queries the real MaleCNS API. No fake results.
 */
import React, { useCallback, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { api, ApiClientError } from '../api';
import type { AsyncState, NeuronSearchResult } from '../types';

interface Props {
  selectedBodyId: number | null;
  onSelect: (result: NeuronSearchResult) => void;
}

export function ExplorerPanel({ selectedBodyId, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<AsyncState<{
    results: NeuronSearchResult[];
    total: number;
    query: string;
  }>>({ status: 'idle' });
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;
  const lastQueryRef = useRef<string>('');

  const doSearch = useCallback(async (q: string, off: number) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    // Avoid duplicate requests
    if (lastQueryRef.current === `${trimmed}:${off}` && searchState.status === 'loading') return;
    lastQueryRef.current = `${trimmed}:${off}`;

    setSearchState({ status: 'loading' });
    try {
      const res = await api.searchNeurons({ q: trimmed, limit: LIMIT, offset: off });
      setSearchState({ status: 'success', data: { results: res.results, total: res.total, query: trimmed } });
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.detail : 'Search failed. Check that the backend is running.';
      setSearchState({ status: 'error', message: msg });
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    doSearch(query, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setOffset(0);
      doSearch(query, 0);
    }
  };

  const loadMore = () => {
    const next = offset + LIMIT;
    setOffset(next);
    if (searchState.status === 'success') {
      doSearch(searchState.data.query, next);
    }
  };

  const results = searchState.status === 'success' ? searchState.data.results : [];
  const total = searchState.status === 'success' ? searchState.data.total : 0;

  return (
    <>
      <div className="panel-header">
        <h2>Explorer</h2>
      </div>

      <form className="search-bar" onSubmit={handleSubmit}>
        <input
          id="neuron-search-input"
          className="search-input"
          type="text"
          placeholder="Body ID, cell type, instance…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Search neurons"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          id="neuron-search-btn"
          type="submit"
          className="btn btn-primary"
          disabled={searchState.status === 'loading' || !query.trim()}
          aria-label="Submit search"
        >
          <Search size={13} />
        </button>
      </form>

      <div className="panel-body" style={{ padding: '8px' }}>
        {searchState.status === 'idle' && (
          <div className="state-box">
            <span style={{ fontSize: 28, opacity: 0.3 }}>⬡</span>
            <span className="state-box__title">Search to begin</span>
            <span>Enter a neuron body ID, cell type, or instance name.</span>
          </div>
        )}

        {searchState.status === 'loading' && (
          <div className="state-box">
            <span style={{ fontSize: 22 }}>⟳</span>
            <span className="loading-dots">Searching</span>
          </div>
        )}

        {searchState.status === 'error' && (
          <div className="state-box">
            <span style={{ fontSize: 22, color: 'var(--color-error)' }}>✕</span>
            <span className="state-box__title" style={{ color: 'var(--color-error)' }}>Search failed</span>
            <span style={{ fontSize: 12 }}>{searchState.message}</span>
            <button
              id="retry-search-btn"
              className="btn btn-sm"
              onClick={() => doSearch(query, offset)}
            >
              Retry
            </button>
          </div>
        )}

        {searchState.status === 'success' && results.length === 0 && (
          <div className="state-box">
            <span style={{ fontSize: 22, opacity: 0.35 }}>∅</span>
            <span className="state-box__title">No results</span>
            <span>
              No neurons matched <strong>"{searchState.data.query}"</strong> in
              the MaleCNS v1.0 dataset.
            </span>
          </div>
        )}

        {searchState.status === 'success' && results.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 6, padding: '0 2px' }}>
              {total.toLocaleString()} match{total !== 1 ? 'es' : ''} · showing {Math.min(offset + LIMIT, total).toLocaleString()}
            </div>
            {results.map(r => (
              <div
                key={r.body_id}
                id={`result-${r.body_id}`}
                className={`result-item${r.body_id === selectedBodyId ? ' selected' : ''}`}
                onClick={() => onSelect(r)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && onSelect(r)}
                aria-label={`Select neuron ${r.body_id}`}
              >
                <div className="result-item__id">#{r.body_id}</div>
                <div className="result-item__type">{r.cell_type ?? r.instance ?? '—'}</div>
                {r.superclass && (
                  <div className="result-item__meta">{r.superclass}</div>
                )}
              </div>
            ))}

            {offset + LIMIT < total && (() => {
              const isLoading = (searchState as {status: string}).status === 'loading';
              return (
                <button
                  id="load-more-btn"
                  className="btn btn-sm"
                  style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
                  onClick={loadMore}
                  disabled={isLoading}
                >
                  Load more
                </button>
              );
            })()}
          </>
        )}
      </div>
    </>
  );
}
