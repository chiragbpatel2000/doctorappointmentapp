import { formatDays, formatHour, formatRange, money, toDay } from '../src/utils/format';

describe('format', () => {
  it('formats money, hours and ranges', () => {
    expect(money(5)).toBe('$5.00');
    expect(formatHour(9)).toBe('09:00');
    expect(formatRange([9, 10])).toBe('09:00–10:00, 10:00–11:00');
  });

  it('formats working days', () => {
    expect(formatDays([1, 2, 3, 4, 5])).toBe('Mon–Fri');
    expect(formatDays([5, 1, 3])).toBe('Mon, Wed, Fri');
    expect(formatDays([0, 1, 2, 4])).toBe('Sun–Tue, Thu');
    expect(formatDays([1, 2])).toBe('Mon, Tue');
  });

  it('uses the local calendar day', () => {
    expect(toDay(new Date(2030, 0, 5, 23, 30))).toBe('2030-01-05');
    expect(toDay()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
