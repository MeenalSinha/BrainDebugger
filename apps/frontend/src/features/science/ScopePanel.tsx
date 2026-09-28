import { Info } from 'lucide-react';

export function ScopePanel() {
  return (
    <section className="scope-panel">
      <div className="section-title"><Info size={15} /> Scientific Scope & Limitations</div>
      <p>BrainDebugger explores graph-based structural connectivity in an indexed demo subset derived from Janelia MaleCNS v1.0.</p>
      <ul>
        <li>Synapse counts are dataset-derived structural weights, not physiological signal strengths.</li>
        <li>Predicted neurotransmitter annotations do not by themselves establish excitatory or inhibitory effects.</li>
        <li>Graph paths are computational exploration routes, not validated biological pathways.</li>
      </ul>
    </section>
  );
}
