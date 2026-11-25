// Single process: Express serves the JSON API and the React app.
//   dev:  `npm run dev`   -> Vite runs as middleware inside this server (hot reload, one port)
//   prod: `npm run build` then `npm start` -> serves the built files from dist/
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { initDb } from './db.js';
import { api } from './api.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');
const port = Number(process.env.PORT) || 3000;

await initDb();

const app = express();
app.disable('x-powered-by');
app.use('/api', api);

if (dev) {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  const dist = path.join(root, 'dist');
  app.use(express.static(dist));
  // SPA fallback so client-side routes (e.g. /cart) survive a refresh.
  app.use((req, res, next) =>
    req.method === 'GET' ? res.sendFile(path.join(dist, 'index.html')) : next()
  );
}

app.listen(port, () => console.log(`DocBook running on http://localhost:${port}${dev ? ' (dev)' : ''}`));
