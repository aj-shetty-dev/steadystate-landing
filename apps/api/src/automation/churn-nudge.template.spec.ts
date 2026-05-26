import { describe, expect, it } from 'vitest';
import { firstNameFromFullName, renderChurnNudgeBody } from './churn-nudge.template';

describe('churn nudge template', () => {
  it('renders body with first name and day count', () => {
    const body = renderChurnNudgeBody({ firstName: 'Aisha', daysSinceLastCheckin: 6 });
    expect(body).toContain('Hi Aisha');
    expect(body).toContain('6 days');
    expect(body).toContain('Reply YES');
  });

  it('falls back to "there" when first name is empty', () => {
    expect(renderChurnNudgeBody({ firstName: '', daysSinceLastCheckin: 5 })).toContain('Hi there');
  });

  it('extracts the first token from a full name', () => {
    expect(firstNameFromFullName('Aisha Al Mansoori')).toBe('Aisha');
    expect(firstNameFromFullName('   Omar    Khalifa  ')).toBe('Omar');
    expect(firstNameFromFullName('')).toBe('');
  });

  it('renders Arabic body when locale=ar', () => {
    const body = renderChurnNudgeBody({ firstName: 'عائشة', daysSinceLastCheckin: 5, locale: 'ar' });
    expect(body).toMatch(/[\u0600-\u06FF]/);
    expect(body).toContain('عائشة');
    expect(body).toContain('5');
  });
});
