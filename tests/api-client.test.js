import { afterEach, vi } from 'vitest';

// The global setup mocks the client; here we want the real one.
const { request } = await vi.importActual('../src/api/client.js');

const reply = (status, body, { json = true } = {}) =>
  Promise.resolve({
    ok: status < 400,
    status,
    json: () => (json ? Promise.resolve(body) : Promise.reject(new Error('not json'))),
  });

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('prefixes /api, sends GET without a body and returns parsed JSON', async () => {
    const fetchMock = vi.fn(() => reply(200, [{ id: 1 }]));
    vi.stubGlobal('fetch', fetchMock);
    await expect(request('/resources')).resolves.toEqual([{ id: 1 }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/resources');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('serialises JSON bodies and sets the content type', async () => {
    const fetchMock = vi.fn(() => reply(201, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await request('/bookings', { method: 'POST', body: { a: 1 } });
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('creates an anonymous client id once and reuses it', async () => {
    const fetchMock = vi.fn(() => reply(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    await request('/bookings');
    await request('/bookings');
    const [a, b] = fetchMock.mock.calls.map((c) => c[1].headers['X-Client-Id']);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(b).toBe(a);
    expect(localStorage.getItem('docbook.clientId')).toBe(a);
  });

  it('reuses an id that is already stored', async () => {
    localStorage.setItem('docbook.clientId', 'existing-client-id');
    const fetchMock = vi.fn(() => reply(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    await request('/bookings');
    expect(fetchMock.mock.calls[0][1].headers['X-Client-Id']).toBe('existing-client-id');
  });

  it('throws the server error message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply(409, { error: 'Slot taken' })));
    await expect(request('/bookings', { method: 'POST', body: {} })).rejects.toThrow('Slot taken');
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply(502, null, { json: false })));
    await expect(request('/bookings')).rejects.toThrow('Request failed (502)');
  });
});
