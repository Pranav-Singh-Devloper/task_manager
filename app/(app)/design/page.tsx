import { notFound } from 'next/navigation';
import { KitDemo } from './kit-demo';

/** A page that shows every UI building block. Available in development and mock mode only. */
export default function DesignPage() {
  if (process.env.NODE_ENV === 'production' && process.env.GOOGLE_MODE !== 'mock') notFound();
  return <KitDemo />;
}
