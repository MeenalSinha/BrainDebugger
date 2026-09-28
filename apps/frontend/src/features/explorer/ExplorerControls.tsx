type ExplorerControlsProps = { direction: string; maxNodes: number; onDirectionChange: (value: string) => void; onMaxNodesChange: (value: number) => void };

export function ExplorerControls({ direction, maxNodes, onDirectionChange, onMaxNodesChange }: ExplorerControlsProps) {
  return <div className="controls-row"><label htmlFor="neighborhood-direction">Neighborhood</label><select id="neighborhood-direction" value={direction} onChange={(event) => onDirectionChange(event.target.value)}><option value="both">Bidirectional</option><option value="incoming">Incoming only</option><option value="outgoing">Outgoing only</option></select><label htmlFor="max-nodes">Maximum nodes</label><select id="max-nodes" value={maxNodes} onChange={(event) => onMaxNodesChange(Number(event.target.value))}>{[25, 50, 100, 250].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>;
}
