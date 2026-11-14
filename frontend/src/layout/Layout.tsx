import clsx from 'clsx';
import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Loading } from '../components/States';
import { ROUTES } from '../routes';
import { useTheme } from '../theme/themeContext';

const secondaryRoutes = ROUTES.filter((r) => !r.primary);
const primaryRoute = ROUTES.find((r) => r.primary);

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light theme' : 'Dark theme'}
    >
      {isDark ? (
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2Zm0 13a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15Zm0-9a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm5.657-1.596a.75.75 0 1 0-1.061-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.061l1.062-1.06ZM6.464 14.596a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.06l1.061-1.06ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM5 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 10Zm9.596 5.657a.75.75 0 0 0 1.06-1.061l-1.06-1.061a.75.75 0 1 0-1.061 1.06l1.06 1.062ZM5.404 6.464a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.061 1.06l1.06 1.061Z" />
        </svg>
      ) : (
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </button>
  );
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap no-underline hover:no-underline',
    isActive
      ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200'
      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
  );

const predictLinkClass = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white no-underline shadow-sm hover:no-underline',
    isActive
      ? 'bg-indigo-800 ring-2 ring-indigo-300 dark:bg-indigo-500 dark:ring-indigo-300'
      : 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400',
  );

function PredictIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h6.572l-1.305 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 17.25 8h-6.572l1.305-6.093Z" />
    </svg>
  );
}

/** App shell: sticky header with nav + theme toggle, main outlet, footer. */
export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the mobile menu and scroll to top on navigation.
  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-indigo-600 px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 font-semibold text-slate-900 no-underline hover:no-underline dark:text-white"
          >
            <img src="/favicon.svg" alt="" className="h-7 w-7 shrink-0" />
            <span className="truncate">Student Dropout XAI</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {primaryRoute && (
              <NavLink to={primaryRoute.path} className={(s) => clsx(predictLinkClass(s), 'max-sm:hidden')}>
                <PredictIcon />
                {primaryRoute.label}
              </NavLink>
            )}
            <ThemeToggle />
            <button
              type="button"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                {menuOpen ? (
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                ) : (
                  <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Desktop nav */}
        <nav aria-label="Main" className="hidden border-t border-slate-100 lg:block dark:border-slate-900">
          <ul className="mx-auto flex max-w-7xl items-center gap-1 px-4 py-1.5 sm:px-6 lg:px-8">
            {secondaryRoutes.map((r) => (
              <li key={r.path}>
                <NavLink to={r.path} end={r.path === '/'} className={navLinkClass}>
                  {r.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Mobile nav */}
        {menuOpen && (
          <nav id="mobile-nav" aria-label="Main" className="border-t border-slate-200 lg:hidden dark:border-slate-800">
            <ul className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3 sm:px-6">
              {primaryRoute && (
                <li className="mb-1">
                  <NavLink to={primaryRoute.path} className={(s) => clsx(predictLinkClass(s), 'w-full justify-center')}>
                    <PredictIcon />
                    {primaryRoute.label} a student’s risk
                  </NavLink>
                </li>
              )}
              {secondaryRoutes.map((r) => (
                <li key={r.path}>
                  <NavLink to={r.path} end={r.path === '/'} className={(s) => clsx(navLinkClass(s), 'block')}>
                    {r.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 outline-none sm:px-6 lg:px-8">
        <Suspense fallback={<Loading label="Loading page…" />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <p className="mx-auto max-w-7xl px-4">
          Student Dropout XAI · UCI “Predict Students’ Dropout and Academic Success” dataset (4,424 students). For
          research and teaching; not for automated decisions about individuals.
        </p>
      </footer>
    </div>
  );
}
