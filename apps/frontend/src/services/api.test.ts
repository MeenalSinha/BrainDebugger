import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

describe('api.search', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the backend cell_type filter with other search parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [], metadata: {} }) });
    vi.stubGlobal('fetch', fetchMock);

    await api.search('CT1', 'optic lobe', 'CT1_L', 30);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/neurons/search?q=CT1&region=optic%20lobe&cell_type=CT1_L&limit=30',
      { signal: undefined }
    );
  });
});
