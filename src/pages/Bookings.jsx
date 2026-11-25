import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { formatRange, money } from '../utils/format';

export default function Bookings() {
  const { bookings, cancelBooking } = useStore();
  const [params] = useSearchParams();
  const placed = params.get('placed');

  if (bookings.length === 0)
    return <p className="empty">No appointments yet. <Link to="/">Find a doctor</Link></p>;

  return (
    <>
      <h1>My appointments</h1>
      {placed && <div className="success" role="status">Appointment {placed} confirmed. See you soon!</div>}
      {bookings.map((b) => (
        <div className="order" key={b.id}>
          <div className="row">
            <strong>{b.resource.emoji} {b.resource.name}</strong>
            <span>{b.status === 'cancelled' ? 'Cancelled' : 'Confirmed'}</span>
          </div>
          <div>{b.day} · {formatRange(b.hours)}</div>
          <small>{b.id} · {money(b.total)}</small>
          {b.status === 'confirmed' && (
            <div><button className="link" onClick={() => cancelBooking(b.id)}>Cancel appointment</button></div>
          )}
        </div>
      ))}
    </>
  );
}
