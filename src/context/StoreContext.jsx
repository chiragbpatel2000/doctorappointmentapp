import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { request } from '../api/client';

const StoreContext = createContext(null);
// eslint-disable-next-line react-refresh/only-export-components
export const useStore = () => useContext(StoreContext);

// Server is the source of truth: every mutation calls the API and stores what the server returns.
// No optimistic updates. bookings: [{ id, resource, day, hours, total, customer, status, createdAt }]
export function StoreProvider({ children }) {
  const [bookings, setBookings] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    request('/bookings')
      .then(setBookings)
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, []);

  // Run a mutation; surface failures in a banner instead of throwing into event handlers.
  const run = useCallback(async (fn) => {
    try {
      setError(null);
      await fn();
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // Throws on failure so the booking form can show the message next to the button.
  const createBooking = async (payload) => {
    const booking = await request('/bookings', { method: 'POST', body: payload });
    setBookings((b) => [booking, ...b]);
    return booking;
  };

  const cancelBooking = (id) =>
    run(async () => {
      const updated = await request(`/bookings/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
      setBookings((b) => b.map((x) => (x.id === id ? updated : x)));
    });

  const value = {
    bookings, ready, error, clearError: () => setError(null),
    upcomingCount: bookings.filter((b) => b.status === 'confirmed').length,
    createBooking, cancelBooking,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
