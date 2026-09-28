import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RegionExplorer } from './RegionExplorer';
import type { Region } from '../../types/connectome';

const regions: Region[] = [
  { name: 'optic lobe', neuronCount: 12, connectionCount: 48, mostCommonCellTypes: [{ cellType: 'CT1_L', count: 4 }] },
  { name: 'central brain', neuronCount: 9, connectionCount: 32, mostCommonCellTypes: [{ cellType: 'APL', count: 2 }] }
];

describe('RegionExplorer', () => {
  it('renders every supplied region and routes region and cell-type selections', () => {
    const onSelectRegion = vi.fn();
    const onSelectCellType = vi.fn();
    render(<RegionExplorer regions={regions} selectedRegion="optic lobe" results={[]} onSelectRegion={onSelectRegion} onSelectCellType={onSelectCellType} onOpenNeuron={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /central brain/i }));
    fireEvent.click(screen.getByRole('button', { name: /CT1_L/i }));

    expect(onSelectRegion).toHaveBeenCalledWith('central brain');
    expect(onSelectCellType).toHaveBeenCalledWith('CT1_L');
    expect(screen.getByText('2 regions')).toBeInTheDocument();
  });
});
