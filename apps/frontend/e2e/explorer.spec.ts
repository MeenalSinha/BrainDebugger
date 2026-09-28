import { expect, test } from '@playwright/test';

const metadata = { source: 'test', computed: false, mode: 'demo-subset', timestamp: '2026-09-28T00:00:00Z' };
const neuron = { id: '10001', bodyId: 10001, cellType: 'CT1_L', region: 'optic lobe', incomingPartners: 2, outgoingPartners: 3, status: 'traced' };
const regions = Array.from({ length: 36 }, (_, index) => ({ name: index === 0 ? 'optic lobe' : `region-${index + 1}`, neuronCount: 10 + index, connectionCount: 20 + index, mostCommonCellTypes: [{ cellType: 'CT1_L', count: 3 }] }));

test('renders the full region explorer and sends the cell-type filter', async ({ page }) => {
  const searchRequests: string[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/neurons/search')) searchRequests.push(url.search);
    const data = url.pathname.endsWith('/dataset/summary')
      ? { dataset: 'MaleCNS', mode: 'demo-subset', indexedAt: metadata.timestamp, indexedNeurons: 1, indexedConnections: 0, availableRegions: 36, sourceRows: {}, scientificScope: [], apiIndexLoadSeconds: 0 }
      : url.pathname.endsWith('/regions') ? regions : [neuron];
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data, metadata }) });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Start Exploring' }).click();
  await expect(page.getByText('36 regions')).toBeVisible();
  await expect(page.getByRole('button', { name: /region-36/ })).toBeVisible();
  await page.locator('#cell-type-filter').fill('CT1_L');
  await expect.poll(() => searchRequests.some((search) => search.includes('cell_type=CT1_L'))).toBeTruthy();
});
