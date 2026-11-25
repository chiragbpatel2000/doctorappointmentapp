import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Every frontend test talks to an in-memory fake of the backend instead of the network.
// (tests/api-client.test.js uses vi.importActual to exercise the real client.)
vi.mock('../src/api/client.js', async () => {
  const { fake } = await import('./helpers/fakeApi.js');
  return { request: (...args) => fake.request(...args) };
});

beforeEach(async () => {
  const { fake } = await import('./helpers/fakeApi.js');
  fake.reset();
});

afterEach(() => {
  cleanup();
  if (typeof window !== 'undefined') localStorage.clear();
});
