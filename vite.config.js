import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Dev-only: serve /api/* with the same handlers Vercel runs, so `npm run dev` is fully playable.
// Set TD_LOCAL_DB=./.local.sqlite to use a local database instead of Cloudflare D1.
function apiDevServer() {
  return {
    name: 'td-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://local');
        const m = url.pathname.match(/^\/api\/([a-z]+)$/);
        if (!m) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.js`);
          let raw = '';
          for await (const chunk of req) raw += chunk;
          const vreq = { method: req.method, query: Object.fromEntries(url.searchParams), body: raw ? JSON.parse(raw) : {}, headers: req.headers };
          const vres = {
            statusCode: 200,
            setHeader: (k, v) => res.setHeader(k, v),
            status(c) { this.statusCode = c; return this; },
            json(d) { res.statusCode = this.statusCode; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(d)); },
          };
          await mod.default(vreq, vres);
        } catch (e) {
          res.statusCode = 500; res.end(JSON.stringify({ error: e.message }));
        }
      });
    },
  };
}

// TD_ART_STUB=1 swaps in placeholder art (tests only, while real art is being drawn).
const artStub = process.env.TD_ART_STUB ? {
  alias: [
    { find: /.*\/art\/portrait\.js$/, replacement: resolve(import.meta.dirname, 'tests/stubs/portrait.js') },
    { find: /.*\/art\/icons\.js$/, replacement: resolve(import.meta.dirname, 'tests/stubs/icons.js') },
  ],
} : {};

export default defineConfig({
  plugins: [apiDevServer()],
  resolve: artStub,
  build: {
    target: 'es2020',
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html') },
    },
  },
});
