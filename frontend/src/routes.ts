import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface AppRoute {
  path: string;
  /** Nav label. */
  label: string;
  /** Visually emphasised in the nav (the Predict page). */
  primary?: boolean;
  Component: LazyExoticComponent<ComponentType>;
}

/** The 8 pages from docs/CONTRACT.md, in nav order. Each page is code-split. */
export const ROUTES: AppRoute[] = [
  { path: '/', label: 'Overview', Component: lazy(() => import('./pages/Overview')) },
  { path: '/statistics', label: 'Statistics', Component: lazy(() => import('./pages/Statistics')) },
  { path: '/feature-selection', label: 'Feature selection', Component: lazy(() => import('./pages/FeatureSelection')) },
  { path: '/models', label: 'Model comparison', Component: lazy(() => import('./pages/ModelComparison')) },
  { path: '/explainability', label: 'Explainability', Component: lazy(() => import('./pages/Explainability')) },
  { path: '/fairness', label: 'Fairness', Component: lazy(() => import('./pages/Fairness')) },
  { path: '/staged', label: 'Staged early warning', Component: lazy(() => import('./pages/Staged')) },
  { path: '/predict', label: 'Predict', primary: true, Component: lazy(() => import('./pages/Predict')) },
];

export const NotFoundPage = lazy(() => import('./pages/NotFound'));
