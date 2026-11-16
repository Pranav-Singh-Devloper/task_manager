import type { ReactNode } from 'react';
import { Reveal } from '@/components/motion';

/** A template (not a layout) is made fresh on every page change, so each new page fades in. */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <Reveal>{children}</Reveal>;
}
