import { expect, test } from '@playwright/test';

test('explores a real FastAPI neuron workflow and exposes real exports', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Indexed neurons', { exact: true })).toBeVisible();

  const search = page.getByLabel('Neuron search');
  await search.fill('10001');
  const result = page.locator('.result').first();
  await expect(result).toBeVisible();
  const neuronId = await result.locator('code').textContent();
  await result.click();

  await expect(page.getByText('Neuron Inspector')).toBeVisible();
  await expect(page.locator('.inspector code').first()).toHaveText(neuronId ?? '');
  await expect(page.locator('.graph-canvas canvas').first()).toBeVisible();
  await expect(page.getByText('Incoming Connections')).toBeVisible();

  const incomingTable = page.locator('.table-card').first();
  const inspect = incomingTable.getByRole('button', { name: 'Inspect' }).first();
  await expect(inspect).toBeVisible();
  await inspect.click();
  await expect(page.getByText('Selected Connection')).toBeVisible();

  await expect(page.getByRole('link', { name: 'Export CSV' }).first()).toHaveAttribute('href', new RegExp(`/api/neurons/${neuronId}/connections/(incoming|outgoing)/export`));
  await expect(page.getByRole('link', { name: 'Markdown' })).toHaveAttribute('href', `/api/neurons/${neuronId}/export?format=markdown`);
});
