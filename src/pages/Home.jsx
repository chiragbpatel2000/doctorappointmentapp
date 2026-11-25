import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchResources } from '../api/resources';
import { money } from '../utils/format';

export default function Home() {
  const [resources, setResources] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('featured');

  useEffect(() => { fetchResources().then(setResources).catch((e) => setLoadError(e.message)); }, []);

  const categories = useMemo(() => ['All', ...new Set((resources ?? []).map((r) => r.category))], [resources]);

  const shown = useMemo(() => {
    if (!resources) return [];
    const list = resources.filter(
      (r) => (category === 'All' || r.category === category) &&
        r.name.toLowerCase().includes(query.trim().toLowerCase())
    );
    if (sort === 'low') return [...list].sort((a, b) => a.price - b.price);
    if (sort === 'high') return [...list].sort((a, b) => b.price - a.price);
    if (sort === 'rating') return [...list].sort((a, b) => b.rating - a.rating);
    return list;
  }, [resources, query, category, sort]);

  if (loadError) return <p className="empty">Could not load: {loadError}</p>;
  if (!resources) return <p className="empty">Loading…</p>;

  return (
    <>
      <div className="toolbar">
        <input placeholder="Search…" aria-label="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="featured">Featured</option>
          <option value="low">Price: low to high</option>
          <option value="high">Price: high to low</option>
          <option value="rating">Top rated</option>
        </select>
      </div>
      <div className="chips">
        {categories.map((c) => (
          <button key={c} className={`chip${c === category ? ' active' : ''}`} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>
      {shown.length === 0 ? <p className="empty">Nothing matches your search.</p> : (
        <div className="grid">
          {shown.map((r) => (
            <Link key={r.id} to={`/resource/${r.id}`} className="card">
              <div className="thumb" style={{ background: r.color }}>{r.emoji}</div>
              <h3>{r.name}</h3>
              <div className="meta"><span>{r.category}</span><span className="rating">★ {r.rating.toFixed(1)}</span></div>
              <div className="row"><strong>{money(r.price)}</strong><small>/ visit</small></div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
