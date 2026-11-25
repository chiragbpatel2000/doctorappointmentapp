// Seed data, inserted on first start when `resources` is empty. Resources are doctors:
// category = specialty, price = consultation fee per 1-hour appointment slot.
// workStart/workEnd: bookable hours, end exclusive. workDays: 0=Sun .. 6=Sat.
const r = (id, name, category, price, emoji, color, rating, description, workStart, workEnd, workDays) =>
  ({ id, name, category, price, emoji, color, rating, description, workStart, workEnd, workDays });
const MF = [1, 2, 3, 4, 5];

export const resources = [
  r(1, 'Dr. Priya Sharma', 'General Practice', 60, '🩺', '#dcfce7', 4.8, 'Family doctor for check-ups, minor illness and long-term care.', 8, 16, MF),
  r(2, 'Dr. James Carter', 'General Practice', 55, '🩺', '#d1fae5', 4.5, 'Friendly GP with a focus on preventive health.', 12, 20, [1, 2, 3, 4, 5, 6]),
  r(3, 'Dr. Aisha Khan', 'Cardiology', 120, '❤️', '#fee2e2', 4.9, 'Heart health, blood pressure and cholesterol management.', 9, 15, [1, 3, 5]),
  r(4, 'Dr. Liam O\'Brien', 'Dermatology', 95, '🧴', '#fed7aa', 4.6, 'Skin, hair and nail conditions, including mole checks.', 10, 18, [2, 3, 4, 5, 6]),
  r(5, 'Dr. Mei Tan', 'Paediatrics', 80, '🧸', '#dbeafe', 4.9, 'Care for babies, children and teenagers.', 8, 14, MF),
  r(6, 'Dr. Carlos Mendes', 'Orthopaedics', 110, '🦴', '#e0e7ff', 4.4, 'Joint, bone and sports-injury assessment.', 13, 19, [1, 2, 3, 4]),
  r(7, 'Dr. Hannah Weiss', 'Psychiatry', 100, '🧠', '#f3e8ff', 4.7, 'Confidential support for anxiety, depression and sleep.', 10, 18, MF),
  r(8, 'Dr. Omar Haddad', 'Dentistry', 70, '🦷', '#cffafe', 4.5, 'General dentistry, check-ups and cleanings.', 8, 17, [1, 2, 3, 4, 5, 6]),
];
