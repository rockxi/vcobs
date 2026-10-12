import net from 'node:net';

// Fixed upstream: never accept a destination from a browser or HTTP parameter.
const host = process.env.VCOBS_XRAY_HOST || '172.31.0.1';
const port = Number(process.env.VCOBS_XRAY_PORT || 10809);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Xray port');
const server = net.createServer((client) => {
  const upstream = net.connect({ host, port });
  const close = () => { client.destroy(); upstream.destroy(); };
  client.on('error', close);
  upstream.on('error', close);
  client.on('close', close);
  upstream.on('close', close);
  // Bound stalled connections, but allow quiet long inference requests.
  client.setTimeout(180_000, close);
  upstream.setTimeout(180_000, close);
  upstream.once('connect', () => { client.pipe(upstream); upstream.pipe(client); });
});
server.maxConnections = 64;
server.listen(3091, '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
