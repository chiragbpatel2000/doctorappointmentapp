export const money = (n) => `$${n.toFixed(2)}`;

export const formatHour = (h) => `${String(h).padStart(2, '0')}:00`;
export const formatRange = (hours) => hours.map((h) => `${formatHour(h)}–${formatHour(h + 1)}`).join(', ');

// Local calendar day as 'YYYY-MM-DD' (toISOString would shift the day for users west/east of UTC).
export const toDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** [1,2,3,4,5] -> 'Mon–Fri'; [1,3,5] -> 'Mon, Wed, Fri' (runs of 3+ days collapse). */
export const formatDays = (days) => {
  const d = [...days].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < d.length;) {
    let j = i;
    while (j + 1 < d.length && d[j + 1] === d[j] + 1) j++;
    if (j - i >= 2) parts.push(`${DAY_NAMES[d[i]]}–${DAY_NAMES[d[j]]}`);
    else for (let k = i; k <= j; k++) parts.push(DAY_NAMES[d[k]]);
    i = j + 1;
  }
  return parts.join(', ');
};
