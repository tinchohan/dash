import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/healthz', (_req, res) => {
  console.log('Healthcheck called');
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get('/ping', (_req, res) => {
  console.log('Ping called');
  res.json({ pong: true, time: Date.now() });
});

app.get('/', (_req, res) => {
  console.log('Root called');
  res.json({ message: 'Dash API is running', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Simple server listening on 0.0.0.0:${PORT}`);
  console.log('Healthcheck: /healthz');
  console.log('Ping: /ping');
});

// Keep process alive
setInterval(() => {
  console.log('Heartbeat:', new Date().toISOString());
}, 30000);
