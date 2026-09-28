import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionTable } from './ConnectionTable';
import type { Connection } from '../../types/connectome';

const row: Connection = { source: 10001, target: 10002, weight: 42, sourceRegion: 'optic lobe', targetRegion: 'central brain', sourceCellType: 'CT1_L', targetCellType: 'APL', sourcePredictedNt: 'acetylcholine', targetPredictedNt: 'gaba' };

describe('ConnectionTable', () => {
  it('routes filtering, sorting, pagination, neuron selection, and inspection callbacks', () => {
    const onSearch = vi.fn(); const onSort = vi.fn(); const onPage = vi.fn(); const onInspect = vi.fn(); const onNeuron = vi.fn();
    render(<ConnectionTable title="Incoming Connections" rows={[row]} direction="incoming" selectedNeuronId="10002" page={2} total={60} search="" sort="weight_desc" loading={false} onSearch={onSearch} onSort={onSort} onPage={onPage} onInspect={onInspect} onNeuron={onNeuron} />);

    fireEvent.change(screen.getByLabelText('Incoming Connections search'), { target: { value: 'CT1' } });
    fireEvent.change(screen.getByLabelText('Incoming Connections sort'), { target: { value: 'weight_asc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    fireEvent.click(screen.getByRole('button', { name: '10001' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));

    expect(onSearch).toHaveBeenCalledWith('CT1');
    expect(onSort).toHaveBeenCalledWith('weight_asc');
    expect(onPage).toHaveBeenCalledWith(1);
    expect(onNeuron).toHaveBeenCalledWith('10001');
    expect(onInspect).toHaveBeenCalledWith(row);
  });
});
