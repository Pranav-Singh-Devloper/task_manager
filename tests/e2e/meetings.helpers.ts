import { expect, type Page } from '@playwright/test';

export const uid = () => Math.random().toString(36).slice(2, 8);

/** A fresh ULID-shaped id for creating a meeting through the API. */
export function ulid(): string {
  const C = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let t = Date.now();
  let s = '';
  for (let i = 0; i < 10; i += 1) {
    s = C[t % 32] + s;
    t = Math.floor(t / 32);
  }
  for (let i = 0; i < 16; i += 1) s += C[Math.floor(Math.random() * 32)];
  return s;
}

/** Makes a meeting through the API, signed in as the test user, and returns it. Faster than the form when the form is not the point. */
export async function createViaApi(
  page: Page,
  category: string,
  values: Record<string, unknown>,
): Promise<{ id: string; rev: number; title: string }> {
  const id = ulid();
  const res = await page.request.post('/api/meetings', {
    headers: { 'X-Requested-With': 'mm' },
    data: { id, category, values },
  });
  expect(res.status(), await res.text()).toBe(201);
  const { meeting } = await res.json();
  return { id: meeting.id, rev: meeting.rev, title: meeting.title };
}

export const ccie = (over: Record<string, unknown> = {}) => ({
  date: '2027-06-15',
  start_time: '10:30',
  case_id: `C-${uid()}`,
  project_name: `NH-${uid()} Widening`,
  state: 'Kerala',
  ...over,
});

export const others = (over: Record<string, unknown> = {}) => ({
  date: '2027-06-15',
  start_time: '10:30',
  topic: `Review ${uid()}`,
  ...over,
});

/** The field's own input, by its stable address. */
export const field = (page: Page, key: string) => page.locator(`#input-${key}`);
