'use client';

import clsx from 'clsx';
import SplitText from '../bits/SplitText';
import { useMotion } from '../preferences';

/**
 * A page's main heading. With animations on, its words rise into place once (React Bits SplitText); the heading
 * keeps its full text as its accessible name. With animations off it is a plain heading.
 */
export function PageTitle({ children, className }: { children: string; className?: string }) {
  const motion = useMotion();
  if (!motion) return <h1 className={className}>{children}</h1>;
  return (
    <SplitText
      key={children}
      tag="h1"
      text={children}
      splitType="words"
      effect="rise"
      trigger="load"
      textAlign="left"
      delay={70}
      duration={0.9}
      className={clsx('!block', className)}
    />
  );
}
