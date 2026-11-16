'use client';

import clsx from 'clsx';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import BlurText from '../bits/BlurText';
import ClickSpark from '../bits/ClickSpark';
import FadeContent from '../bits/FadeContent';
import GlareHover from '../bits/GlareHover';
import Grainient from '../bits/Grainient';
import ShinyText from '../bits/ShinyText';
import SpotlightCard from '../bits/SpotlightCard';
import { useMotion } from '../preferences';

/**
 * The warm colours of the moving background. Near-black text stays above 11:1 on the darkest of them, and the
 * terracotta greeting (large text) above 5:1.
 */
const WARM = ['#fffaf3', '#fde4cb', '#f9d7b8', '#fdeedd', '#f6d6bd'];
const SPARKS = ['#8f3812', '#c2611f', '#e0913f'];

/**
 * A slowly drifting, grainy warm gradient (React Bits Grainient) that fills its parent. Decoration only: hidden from
 * screen readers, and a still warm wash when animations are off.
 */
export function WarmBackground({ className }: { className?: string }) {
  const motion = useMotion();
  return (
    <div aria-hidden="true" className={clsx('pointer-events-none absolute inset-0', className)}>
      <div className="warm-wash absolute inset-0" />
      {motion && (
        <Grainient
          className="absolute inset-0"
          colors={WARM}
          type="linear"
          angle={120}
          speed={0.35}
          flow={0.6}
          softness={0.85}
          grainAmount={0.05}
          grainAnimated={false}
          interactive
          stir={0.6}
          clickSwirl={false}
          intro
        />
      )}
    </div>
  );
}

/**
 * Fades a page in as it opens (React Bits FadeContent). Only on moving between pages: the first page of a visit is
 * shown straight away, so there is never a blank screen while the app starts.
 */
let firstPageShown = false;
export function Reveal({ children }: { children: ReactNode }) {
  const motion = useMotion();
  const [animate] = useState(() => firstPageShown);
  useEffect(() => {
    firstPageShown = true;
  }, []);
  if (!motion || !animate) return <>{children}</>;
  return (
    <FadeContent trigger="mount" duration={0.45} ease="power2.out" initialOpacity={0}>
      {children}
    </FadeContent>
  );
}

/** A small burst of warm sparks wherever the person clicks or taps (React Bits ClickSpark). */
export function Sparkles({ children, className }: { children: ReactNode; className?: string }) {
  const motion = useMotion();
  return (
    <ClickSpark
      sparkColor={SPARKS}
      sparkSize={9}
      sparkRadius={22}
      sparkCount={8}
      duration={420}
      disabled={!motion}
      className={clsx('!h-auto', className)}
    >
      {children}
    </ClickSpark>
  );
}

/**
 * A card with a soft warm spotlight that follows the pointer (React Bits SpotlightCard). With animations off it is
 * the same card without the light.
 */
export function GlowCard({
  children,
  className,
  as,
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div';
}) {
  const motion = useMotion();
  const base = 'rounded-2xl border-ui border-soft bg-surface p-5 shadow-sm md:p-6';
  if (!motion) {
    const Tag = as ?? 'div';
    return <Tag className={clsx(base, className)}>{children}</Tag>;
  }
  return (
    <SpotlightCard
      theme="light"
      spotlightColor="#e9a46b"
      intensity={0.45}
      spotlightSize={320}
      borderGlow={0.9}
      className={clsx('!rounded-2xl !p-5 md:!p-6', 'border-ui border-soft', className)}
      style={
        {
          '--spotlight-card-surface': 'var(--surface)',
          '--spotlight-card-border': 'transparent',
          '--spotlight-card-shadow': 'var(--shadow-sm)',
        } as CSSProperties
      }
    >
      {children}
    </SpotlightCard>
  );
}

/** The app's name with a slow, warm sheen passing over it (React Bits ShinyText). */
export function Shine({ children }: { children: string }) {
  const motion = useMotion();
  if (!motion) return <>{children}</>;
  return (
    <ShinyText color="#2a1f16" shineColor="#c2611f" speed={3.2} delay={2.5} shineWidth={18}>
      {children}
    </ShinyText>
  );
}

/**
 * A light streak sweeps across the wrapped button when the pointer passes (React Bits GlareHover). The wrapper is
 * always there and the streak is simply made invisible when animations are off. Swapping the wrapper in and out
 * would rebuild the button just after the page loads (the server cannot know about reduced motion), which can lose
 * keyboard focus. GlareHover itself does not sweep on devices that ask for reduced motion.
 */
export function Glare({ children, block }: { children: ReactNode; block?: boolean }) {
  const motion = useMotion();
  return (
    <GlareHover
      width={block ? '100%' : 'auto'}
      borderRadius="1rem"
      glareColor="#fff3e6"
      glareOpacity={motion ? 0.55 : 0}
      glareSize={45}
      variant="sheen"
      blendMode="soft-light"
      rimGlint={false}
      style={{ border: 0 }}
      className={block ? 'w-full' : undefined}
    >
      {children}
    </GlareHover>
  );
}

/** A line of text that comes into focus word by word (React Bits BlurText). Plain text with animations off. */
export function FocusText({ text, className }: { text: string; className?: string }) {
  const motion = useMotion();
  if (!motion) return <p className={className}>{text}</p>;
  return (
    <BlurText
      key={text}
      text={text}
      animateBy="words"
      direction="bottom"
      delay={60}
      trigger="load"
      className={className}
    />
  );
}
