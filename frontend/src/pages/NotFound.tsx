import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

export default function NotFoundPage() {
  return (
    <div className="py-10">
      <PageHeader title="Page not found" lede="The page you are looking for does not exist or has moved." />
      <Link
        to="/"
        className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white no-underline hover:bg-indigo-700 hover:no-underline dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        Back to the overview
      </Link>
    </div>
  );
}
