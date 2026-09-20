import type { ApiResponse, Connection, DatasetSummary, Neighborhood, Neuron, Region, Statistics } from '../types/connectome';

async function request<T>(path: string): Promise<ApiResponse<T>> {
  const response = await fetch(path);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json();
}

export const api = {
  summary: () => request<DatasetSummary>('/api/dataset/summary'),
  regions: () => request<Region[]>('/api/regions'),
  search: (query: string, region = '', limit = 25) =>
    request<Neuron[]>(`/api/neurons/search?q=${encodeURIComponent(query)}&region=${encodeURIComponent(region)}&limit=${limit}`),
  neuron: (id: string) => request<Neuron>(`/api/neurons/${id}`),
  statistics: (id: string) => request<Statistics>(`/api/neurons/${id}/statistics`),
  incoming: (id: string, page = 1, search = '') =>
    request<Connection[]>(`/api/neurons/${id}/incoming?page=${page}&page_size=25&search=${encodeURIComponent(search)}`),
  outgoing: (id: string, page = 1, search = '') =>
    request<Connection[]>(`/api/neurons/${id}/outgoing?page=${page}&page_size=25&search=${encodeURIComponent(search)}`),
  neighborhood: (id: string, direction: string, maxNodes: number) =>
    request<Neighborhood>(`/api/neurons/${id}/neighborhood?direction=${direction}&max_nodes=${maxNodes}`),
  connection: (source: number, target: number) => request<Connection>(`/api/connections/${source}/${target}`),
  exportUrl: (id: string, format: string) => `/api/neurons/${id}/export?format=${format}`
};
