import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { useStore } from './context/StoreContext';
import Home from './pages/Home';
import ResourceDetail from './pages/ResourceDetail';
import Bookings from './pages/Bookings';

export default function App() {
  const { ready, error, clearError, upcomingCount } = useStore();
  return (
    <>
      <header className="header">
        <Link to="/" className="logo">★ DocBook</Link>
        <nav>
          <NavLink to="/" end>Find a doctor</NavLink>
          <NavLink to="/bookings">
            My bookings
            {upcomingCount > 0 && <span className="badge">{upcomingCount}</span>}
          </NavLink>
        </nav>
      </header>
      <main>
        {error && (
          <div className="error-banner" role="alert">
            {error} <button className="link" onClick={clearError}>Dismiss</button>
          </div>
        )}
        {!ready ? <p className="empty">Loading…</p> : (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/resource/:id" element={<ResourceDetail />} />
            <Route path="/bookings" element={<Bookings />} />
            <Route path="*" element={<p className="empty">Page not found.</p>} />
          </Routes>
        )}
      </main>
    </>
  );
}
