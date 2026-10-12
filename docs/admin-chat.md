# Personal admin Codex chat

`/admin/chat` is a private client for the owner's Codex account. Every browser
request requires the existing admin session. It is not a public or multi-user AI
service. Codex app-server's managed authentication is documented for local and
open-source applications; for distribution as a hosted/commercial service use
[Sign in with ChatGPT](https://developers.openai.com/siwc) instead.

## One-time setup on Asus

1. Run `node scripts/provision-admin-chat.mjs .env.local` in `~/vcobs` to add an
   independent `VCOBS_CHAT_SERVICE_SECRET` atomically, preserving all existing
   settings and backing up the previous file. It prints no credentials.
2. The default upstream is the existing private Xray relay at
   `172.31.0.1:10809`. Set `VCOBS_XRAY_HOST` and `VCOBS_XRAY_PORT` if that relay
   changes. The underlying Xray listener is loopback-only on Asus.
3. Build/start with `docker compose --env-file .env.local up -d --build`.
   The explicit `--env-file` is required for Compose interpolation; the service's
   `env_file` alone does not populate `${VCOBS_CHAT_SERVICE_SECRET}`. The GitHub
   deployment workflow uses this same flag. No new public port or nginx
   WebSocket configuration is needed.
4. Sign in to `/admin`, open **Чат**, connect ChatGPT and complete its one-time
   authorization in the OpenAI page. Device login may need enabling in the
   account's security settings. Connecting the account requires its owner's
   action; the application does not copy credentials from a laptop.
5. Choose a returned model and send a message. Availability and usage are
   governed by the connected account's Codex plan; this feature has no paid API
   key fallback. The model catalog alone does not prove model entitlement.

## Network and storage

Browser → public HTTPS → existing admin authentication → private chat-service
→ Codex app-server over stdio → HTTP CONNECT → Asus Xray → OpenAI.

The browser exchanges short JSON requests, polling for progress rather than
requiring WebSockets or a persistent chunked HTTP stream. Chat-service is on an
`internal: true` Docker network with no public ports or direct Internet route.
Only chat-egress has an outbound route; it forwards TCP to the fixed Xray
listener. A failed proxy cannot silently fall back to direct model requests.

The chat image explicitly installs Debian's `ca-certificates`: the native Codex
HTTPS client needs system trust roots even though Node itself bundles CAs.
A successful Node proxy probe alone therefore does not verify Codex device login.
Keep TLS certificate verification enabled; never work around trust errors by
disabling it. Verify `account/login/start` with isolated temporary Codex state
after changing the image, and report only success/verification host, not codes or
tokens. This checks authorization transport without completing login or inference.

The `vcobs-chat` named volume holds the service's local history and Codex state,
including private account credentials. Do not publish, log or commit its contents.
Back it up as sensitive data. Restarting containers preserves this volume; never
use `docker compose down -v` for an update. The chat container is separate from
the application and receives neither CouchDB credentials nor the site's admin
password/session secret. Shell access, MCP and filesystem tools are disabled
for chats.

## Verification

- Guests must receive `401` on `/api/admin/chat/*`; `/admin/chat` redirects to login.
- Mutating requests must have the correct same-origin `Origin` header.
- No service secret, OAuth token or raw upstream diagnostic belongs in HTML,
  browser errors or logs.
- Confirm a model reply after account authorization. Automated tests use a fake
  app-server and do not spend the owner's quota.
- Stop a reply, change chats during polling, refresh, and restart the sidecar;
  completed history should remain available.

Official protocol: [Codex app-server](https://learn.chatgpt.com/docs/app-server).
