import type { ApiResponse, Connection, DatasetSummary, Neighborhood, Neuron, Region, Statistics } from '../types/connectome';

async function request<T>(path: string, signal?: AbortSignal): Promise<ApiResponse<T>> {
  const response = await fetch(path, { signal });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json();
}

export const api = {
  summary: (signal?: AbortSignal) => request<DatasetSummary>('/api/dataset/summary', signal),
  regions: (signal?: AbortSignal) => request<Region[]>('/api/regions', signal),
  search: (query: string, region = '', cellType = '', limit = 25, signal?: AbortSignal) =>
    request<Neuron[]>(`/api/neurons/search?q=${encodeURIComponent(query)}&region=${encodeURIComponent(region)}&cell_type=${encodeURIComponent(cellType)}&limit=${limit}`, signal),
  neuron: (id: string, signal?: AbortSignal) => request<Neuron>(`/api/neurons/${id}`, signal),
  statistics: (id: string, signal?: AbortSignal) => request<Statistics>(`/api/neurons/${id}/statistics`, signal),
  incoming: (id: string, page = 1, search = '', sort = 'weight_desc', signal?: AbortSignal) =>
    request<Connection[]>(`/api/neurons/${id}/incoming?page=${page}&page_size=25&search=${encodeURIComponent(search)}&sort=${encodeURIComponent(sort)}`, signal),
  outgoing: (id: string, page = 1, search = '', sort = 'weight_desc', signal?: AbortSignal) =>
    request<Connection[]>(`/api/neurons/${id}/outgoing?page=${page}&page_size=25&search=${encodeURIComponent(search)}&sort=${encodeURIComponent(sort)}`, signal),
  neighborhood: (id: string, direction: string, maxNodes: number, signal?: AbortSignal) =>
    request<Neighborhood>(`/api/neurons/${id}/neighborhood?direction=${direction}&max_nodes=${maxNodes}`, signal),
  connection: (source: number, target: number, signal?: AbortSignal) => request<Connection>(`/api/connections/${source}/${target}`, signal),
  exportUrl: (id: string, format: string) => `/api/neurons/${id}/export?format=${format}`,
  connectionsExportUrl: (id: string, direction: 'incoming' | 'outgoing', search = '', sort = 'weight_desc') =>
    `/api/neurons/${id}/connections/${direction}/export?search=${encodeURIComponent(search)}&sort=${encodeURIComponent(sort)}`
};
