/**
 * Status pill — displays the live data-provider connection status.
 */
import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { HealthResponse } from '../types';

type PillStatus = 'loading' | 'ok' | 'degraded' | 'error';

export function StatusPill() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [pillStatus, setPillStatus] = useState<PillStatus>('loading');

  const fetchHealth = async () => {
    setPillStatus('loading');
    try {
      const h = await api.health();
      setHealth(h);
      setPillStatus(h.status === 'ok' ? 'ok' : h.status === 'degraded' ? 'degraded' : 'error');
    } catch {
      setHealth(null);
      setPillStatus('error');
    }
  };

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, 30_000);
    return () => clearInterval(id);
  }, []);

  const labels: Record<PillStatus, string> = {
    loading: 'Connecting…',
    ok: 'Data Live',
    degraded: 'Partial',
    error: 'Unavailable',
  };

  const dot: Record<PillStatus, string> = {
    loading: '○',
    ok: '●',
    degraded: '◐',
    error: '●',
  };

  const className = `status-pill status-pill--${
    pillStatus === 'loading' ? 'loading' : pillStatus
  }`;

  const title = health?.data_source?.detail ?? '';

  return (
    <span
      className={className}
      title={title}
      style={{ cursor: 'default' }}
    >
      <span>{dot[pillStatus]}</span>
      {labels[pillStatus]}
      {health?.dataset ? ` · ${health.dataset}` : ''}
    </span>
  );
}
