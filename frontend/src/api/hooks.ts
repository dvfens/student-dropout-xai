import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchJson, postJson, type ApiError } from './client';
import type {
  ExampleParams,
  ExampleResponse,
  FigureListResponse,
  FigureSection,
  LimeResponse,
  MetadataResponse,
  PredictRequest,
  PredictResponse,
  StageGroupMetricsResponse,
  StageShapSharesResponse,
  TableName,
  TableResponse,
  TableRow,
} from './types';

/** Static analysis results never change while the app is open. */
const STATIC = { staleTime: Infinity, gcTime: Infinity } as const;

export const queryKeys = {
  metadata: ['metadata'] as const,
  table: (name: TableName) => ['table', name] as const,
  figures: ['figures'] as const,
  stageGroupMetrics: ['stage_group_metrics'] as const,
  stageShapShares: ['stage_shap_shares'] as const,
};

/** GET /api/metadata: features, stages, classes, label TODOs and model metrics. */
export function useMetadata() {
  return useQuery<MetadataResponse, ApiError>({
    queryKey: queryKeys.metadata,
    queryFn: ({ signal }) => fetchJson<MetadataResponse>('/api/metadata', { signal }),
    ...STATIC,
  });
}

/**
 * GET /api/results/tables/{name}. Pass a row type for typed rows:
 * `useTable<StatTestRow>('statistical_tests')`.
 */
export function useTable<Row extends TableRow = TableRow>(name: TableName) {
  return useQuery<TableResponse<Row>, ApiError>({
    queryKey: queryKeys.table(name),
    queryFn: ({ signal }) =>
      fetchJson<TableResponse<Row>>(`/api/results/tables/${encodeURIComponent(name)}`, { signal }),
    ...STATIC,
  });
}

/** GET /api/results/figures, optionally filtered client-side to one section. */
export function useFigures(section?: FigureSection) {
  return useQuery<FigureListResponse, ApiError, FigureListResponse>({
    queryKey: queryKeys.figures,
    queryFn: ({ signal }) => fetchJson<FigureListResponse>('/api/results/figures', { signal }),
    select: section ? (figs) => figs.filter((f) => f.section === section) : undefined,
    ...STATIC,
  });
}

/** GET /api/results/stage_group_metrics */
export function useStageGroupMetrics() {
  return useQuery<StageGroupMetricsResponse, ApiError>({
    queryKey: queryKeys.stageGroupMetrics,
    queryFn: ({ signal }) =>
      fetchJson<StageGroupMetricsResponse>('/api/results/stage_group_metrics', { signal }),
    ...STATIC,
  });
}

/** GET /api/results/stage_shap_shares */
export function useStageShapShares() {
  return useQuery<StageShapSharesResponse, ApiError>({
    queryKey: queryKeys.stageShapShares,
    queryFn: ({ signal }) =>
      fetchJson<StageShapSharesResponse>('/api/results/stage_shap_shares', { signal }),
    ...STATIC,
  });
}

/** POST /api/predict. Errors are ValidationError (422) or ApiError. */
export function usePredict() {
  return useMutation<PredictResponse, ApiError, PredictRequest>({
    mutationKey: ['predict'],
    mutationFn: (body) => postJson<PredictResponse>('/api/predict', body),
  });
}

/** POST /api/explain/lime (can take a few seconds). */
export function useLime() {
  return useMutation<LimeResponse, ApiError, PredictRequest>({
    mutationKey: ['lime'],
    mutationFn: (body) => postJson<LimeResponse>('/api/explain/lime', body),
  });
}

/** Fetch an example row once, outside of React Query's cache. */
export function fetchExample({ cls, typical }: ExampleParams): Promise<ExampleResponse> {
  const params = new URLSearchParams({ cls });
  if (typical !== undefined) params.set('typical', String(typical));
  return fetchJson<ExampleResponse>(`/api/example?${params.toString()}`);
}

/**
 * GET /api/example on demand. Call `mutate({ cls: 'Dropout' })` / `mutateAsync(...)`
 * from a button; random rows are never cached so every click gives a new student.
 */
export function useExample() {
  return useMutation<ExampleResponse, ApiError, ExampleParams>({
    mutationKey: ['example'],
    mutationFn: fetchExample,
  });
}
