export type ApiResponse<T> = {
  data: T;
  metadata: {
    source: string;
    computed: boolean;
    mode: string;
    timestamp: string;
    query_ms?: number;
    truncated?: boolean;
    total?: number;
  };
};

export type DatasetSummary = {
  dataset: string;
  mode: string;
  indexedAt: string;
  indexedNeurons: number;
  indexedConnections: number;
  availableRegions: number;
  sourceRows: Record<string, number>;
  scientificScope: string[];
  apiIndexLoadSeconds: number;
};

export type Neuron = {
  id: string;
  bodyId: number;
  cellType: string;
  instance?: string | null;
  region: string;
  hemisphere?: string | null;
  superclass?: string | null;
  status?: string | null;
  incomingPartners: number;
  outgoingPartners: number;
  totalIncomingWeight?: number;
  totalOutgoingWeight?: number;
  predictedNt?: string | null;
  predictedNtConfidence?: number | null;
  provenance?: Record<string, string>;
};

export type Connection = {
  source: number;
  target: number;
  weight: number;
  sourceRegion: string;
  targetRegion: string;
  sourceCellType: string;
  targetCellType: string;
  predictedNt?: string | null;
  sourcePredictedNt?: string | null;
  provenance?: string;
  scopeNote?: string;
};

export type Neighborhood = {
  nodes: Neuron[];
  edges: Connection[];
  showing: number;
  available: number;
  truncated: boolean;
};

export type Region = {
  name: string;
  neuronCount: number;
  connectionCount: number;
  mostCommonCellTypes: { cellType: string; count: number }[];
};

export type Statistics = {
  inDegree: number;
  outDegree: number;
  totalDegree: number;
  averageConnectionWeight: number;
  maxConnectionWeight: number;
  uniqueConnectedRegions: number;
  uniqueConnectedCellTypes: number;
  incomingOutgoingRatio: number | null;
  metricScope: string;
};
