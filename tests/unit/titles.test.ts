import { describe, expect, it } from 'vitest';
import { renderTitle } from '../../shared/titles';

const CCIE = 'CCIE — {project_name} ({case_id})';

describe('renderTitle', () => {
  it('fills every placeholder', () => {
    expect(renderTitle(CCIE, { project_name: 'NH-44', case_id: 'C-101' })).toBe(
      'CCIE — NH-44 (C-101)',
    );
  });

  it('drops a bracketed group when its value is missing', () => {
    expect(renderTitle(CCIE, { project_name: 'NH-44' })).toBe('CCIE — NH-44');
  });

  it('trims dangling separators when everything is missing', () => {
    expect(renderTitle(CCIE, {})).toBe('CCIE');
  });

  it('handles a simple template', () => {
    expect(renderTitle('AT — {name_of_project}', { name_of_project: 'Ring Road' })).toBe(
      'AT — Ring Road',
    );
  });
});
