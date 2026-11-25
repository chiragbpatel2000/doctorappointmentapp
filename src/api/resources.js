import { request } from './client';

export const fetchResources = () => request('/resources');
export const fetchAvailability = (id, day) =>
  request(`/resources/${encodeURIComponent(id)}/availability?day=${encodeURIComponent(day)}`);
// Resolves to null when the resource doesn't exist; any other failure rejects (pages must catch it).
export const fetchResource = (id) =>
  request(`/resources/${encodeURIComponent(id)}`).catch((e) => {
    if (e.message === 'Resource not found' || e.message === 'Invalid id') return null;
    throw e;
  });
