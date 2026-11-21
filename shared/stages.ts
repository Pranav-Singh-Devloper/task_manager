/**
 * Track's "States" column. In the app it is a list; in the Sheet it is one state per line, with the date it was
 * reached in brackets: "Sent to Member (2026-11-12)". A state not reached yet has no date.
 */

export interface Stage {
  name: string;
  /** YYYY-MM-DD, or null when the state has not been reached yet. */
  date: string | null;
}

const WITH_DATE = /^(.*?)\s*\((\d{4}-\d{2}-\d{2})\)\s*$/;

export function parseStage(line: string): Stage {
  const m = WITH_DATE.exec(line.trim());
  if (m) return { name: (m[1] as string).trim(), date: m[2] as string };
  return { name: line.trim(), date: null };
}

export function formatStage(s: Stage): string {
  const name = s.name.trim();
  return s.date ? `${name} (${s.date})` : name;
}

export const parseStages = (lines: readonly string[]): Stage[] =>
  lines.map(parseStage).filter((s) => s.name !== '');

/** The latest state reached: the last one with a date. Null when none has been reached. */
export function currentStage(stages: Stage[]): { stage: Stage; index: number } | null {
  for (let i = stages.length - 1; i >= 0; i--) {
    const s = stages[i] as Stage;
    if (s.date) return { stage: s, index: i };
  }
  return null;
}

/** The most recent date any state was reached. */
export function lastMoved(stages: Stage[]): string | null {
  let best: string | null = null;
  for (const s of stages) if (s.date && (!best || s.date > best)) best = s.date;
  return best;
}
