import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchAvailability, fetchResource } from '../api/resources';
import { useStore } from '../context/StoreContext';
import { formatHour, money, toDay } from '../utils/format';

export default function ResourceDetail() {
  const { id } = useParams();
  const { createBooking } = useStore();
  const nav = useNavigate();
  const [resource, setResource] = useState(undefined); // undefined = loading, null = not found
  const [loadError, setLoadError] = useState(null);
  const [day, setDay] = useState(toDay());
  const [avail, setAvail] = useState(null); // { key, slots } or { key, error }
  const [picked, setPicked] = useState([]);
  const [customer, setCustomer] = useState({ name: '', email: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let live = true;
    fetchResource(id)
      .then((r) => live && setResource(r))
      .catch((e) => live && setLoadError(e.message)); // every fetch needs a catch: no silent forever-"Loading…"
    return () => { live = false; };
  }, [id]);

  // Availability is keyed by (resource, day) so a slow response for a previous day is never shown.
  // State is only set from the async callback, never synchronously in the effect body.
  const key = `${id}|${day}`;
  const loadSlots = useCallback(() => {
    const k = `${id}|${day}`;
    fetchAvailability(id, day)
      .then((a) => setAvail({ key: k, slots: a.slots }))
      .catch((e) => setAvail({ key: k, error: e.message }));
  }, [id, day]);
  useEffect(() => { if (resource) loadSlots(); }, [resource, loadSlots]);
  const current = avail?.key === key ? avail : null;
  const slots = current?.slots ?? null;
  const slotsError = current?.error;

  if (loadError) return <p className="empty">Could not load: {loadError}</p>;
  if (resource === undefined) return <p className="empty">Loading…</p>;
  if (resource === null) return <p className="empty">Not found. <Link to="/">Back to doctors</Link></p>;

  const toggle = (h) => setPicked((p) => (p.includes(h) ? p.filter((x) => x !== h) : [...p, h]));
  const total = resource.price * picked.length;

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (picked.length === 0) errs.form = 'Pick an appointment time';
    if (!customer.name.trim()) errs.name = 'Name is required';
    if (!customer.email.trim()) errs.email = 'Email is required';
    else if (!/^\S+@\S+\.\S+$/.test(customer.email)) errs.email = 'Enter a valid email';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSubmitting(true);
    try {
      const b = await createBooking({ resourceId: resource.id, day, hours: picked, customer });
      nav(`/bookings?placed=${b.id}`);
    } catch (err) {
      setErrors({ form: err.message });
      setSubmitting(false);
      loadSlots(); // a 409 means someone else took a slot: refresh what is still free
      setPicked([]);
    }
  };

  return (
    <div className="detail">
      <div className="big-thumb" style={{ background: resource.color }}>{resource.emoji}</div>
      <form onSubmit={submit} noValidate>
        <Link to="/" className="back">← Back</Link>
        <h1>{resource.name}</h1>
        <div className="meta"><span>{resource.category}</span><span className="rating">★ {resource.rating.toFixed(1)}</span></div>
        <p>{resource.description}</p>
        <div className="price">{money(resource.price)} <small>/ visit</small></div>

        <label>Date
          <input type="date" value={day} min={toDay()} onChange={(e) => { if (e.target.value) { setDay(e.target.value); setPicked([]); } }} />
        </label>

        <h3>Available times</h3>
        {slotsError && <p className="err">{slotsError}</p>}
        {!slots && !slotsError &&<p className="empty">Loading times…</p>}
        {slots && (
          <div className="chips" role="group" aria-label="Time slots">
            {slots.map((s) => (
              <button
                type="button" key={s.hour} disabled={s.booked}
                className={`chip${picked.includes(s.hour) ? ' active' : ''}`}
                aria-pressed={picked.includes(s.hour)}
                onClick={() => toggle(s.hour)}
              >{formatHour(s.hour)}{s.booked ? ' (taken)' : ''}</button>
            ))}
          </div>
        )}

        <label>Your name
          <input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
          {errors.name && <span className="err">{errors.name}</span>}
        </label>
        <label>Email
          <input value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
          {errors.email && <span className="err">{errors.email}</span>}
        </label>

        <div className="summary"><div className="total"><span>Total</span><span>{money(total)}</span></div></div>
        {errors.form && <p className="err" role="alert">{errors.form}</p>}
        <button className="btn block" disabled={submitting}>{submitting ? 'Booking…' : 'Confirm appointment'}</button>
      </form>
    </div>
  );
}
