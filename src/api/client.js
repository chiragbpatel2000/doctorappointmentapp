// Thin fetch wrapper for the /api backend (same origin, so no CORS or base URL config).
// Until auth exists, each browser gets an anonymous id that scopes its bookings.
function clientId() {
  let id = localStorage.getItem('docbook.clientId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('docbook.clientId', id);
  }
  return id;
}

export async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'X-Client-Id': clientId(),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}
