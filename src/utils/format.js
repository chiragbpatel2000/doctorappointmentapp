export const money = (n) => `$${n.toFixed(2)}`;

export const formatHour = (h) => `${String(h).padStart(2, '0')}:00`;
export const formatRange = (hours) => hours.map((h) => `${formatHour(h)}–${formatHour(h + 1)}`).join(', ');

// Local calendar day as 'YYYY-MM-DD' (toISOString would shift the day for users west/east of UTC).
export const toDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
