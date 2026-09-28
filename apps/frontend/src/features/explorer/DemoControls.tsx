type DemoControlsProps = { onRun: () => void; onReset: () => void };

export function DemoControls({ onRun, onReset }: DemoControlsProps) {
  return <div className="demo-box"><div><strong>Demo Mode</strong><span>Real subset example workflow</span></div><button onClick={onRun}>Inspect example</button><button onClick={onReset}>Reset demo</button></div>;
}
