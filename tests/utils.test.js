import { formatHour, formatRange, money, toDay } from '../src/utils/format';

describe('format', () => {
  it('formats money, hours and ranges', () => {
    expect(money(5)).toBe('$5.00');
    expect(formatHour(9)).toBe('09:00');
    expect(formatRange([9, 10])).toBe('09:00–10:00, 10:00–11:00');
  });

  it('uses the local calendar day', () => {
    expect(toDay(new Date(2030, 0, 5, 23, 30))).toBe('2030-01-05');
    expect(toDay()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
