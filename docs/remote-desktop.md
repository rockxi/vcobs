# Remote desktop for a Mac

The Mac agent makes one **outbound, encrypted `wss://`** connection to vcobs. It then carries Screen Sharing's local VNC traffic inside that connection. Do not expose TCP port 5900 to the internet or your LAN firewall.

## Server setup on Asus

On Asus, deploy the current vcobs checkout in `~/vcobs` using the normal coordinator-controlled rollout. The Compose service already binds the relay to `127.0.0.1:3081`; add the [`ops/nginx-vcobs-remote.conf`](../ops/nginx-vcobs-remote.conf) location snippet to the existing **HTTPS** `vcobs.rockxi.ru` server block, validate nginx, and reload it. This makes both `wss://vcobs.rockxi.ru/remote/agent` and the authenticated browser relay path available over TLS without publishing the relay port.

Provision a device from Asus, supplying absolute paths. The command generates the per-device secret locally, adds or updates only `VCOBS_REMOTE_DEVICES_JSON` in the existing `~/vcobs/.env.local`, preserves unrelated env lines, and writes the Mac config at the exact path requested. It never prints the secret. Repeating it for the same device ID retains that device's token.

```sh
cd ~/vcobs
node scripts/provision-remote-device.mjs \
  --env "$PWD/.env.local" \
  --device-id mac-office \
  --name "Office Mac" \
  --agent-config /absolute/staging/path/remote-agent.json \
  --remote-url wss://vcobs.rockxi.ru/remote/agent
```

Copy the resulting file to the Mac via a trusted channel, for example to `~/.config/vcobs/remote-agent.json`; the utility writes it with mode `0600`. It refuses a symlink or group/world-readable target, and refuses an unsafe `.env.local`. Do not commit either file or paste the resulting JSON into chat, tickets, or shell history.

## Configure Screen Sharing

On the Mac, open **System Settings → General → Sharing**, enable **Screen Sharing**, and use the information button to choose who may access the screen. In **Computer Settings**, enable “VNC viewers may control screen with password” and set a long, unique VNC password. Apple documents these settings in [Set up Screen Sharing on Mac](https://support.apple.com/guide/mac-help/set-up-screen-sharing-on-mac-mh11848/mac).

This agent intentionally connects only to `127.0.0.1:5900`, so Screen Sharing must be running on the same Mac. It does not enable Screen Sharing, change system settings, install a launch agent, request administrator privileges, or start automatically.

## Install and run

Copy `remote-agent/` to the Mac, then run `npm install --omit=dev` in that directory. Create the configuration directory and file:

```sh
mkdir -p ~/.config/vcobs
chmod 700 ~/.config/vcobs
```

Put the following in `~/.config/vcobs/remote-agent.json` (replace every placeholder):

```json
{
  "remoteUrl": "wss://vcobs.rockxi.ru/remote/agent",
  "deviceId": "mac-office",
  "token": "the-per-device-secret-from-the-server"
}
```

Then lock down the finished file: `chmod 600 ~/.config/vcobs/remote-agent.json`.

Run it explicitly in a terminal with `npm start`. To use another file, set `VCOBS_REMOTE_AGENT_CONFIG` to its path; that file must also be readable only by its owner (`chmod 600`). The secret is read from the file, sent only as an HTTPS WebSocket Authorization header, and never accepted as a command-line parameter or written to logs.

## Security and operations

Use a real TLS certificate: the agent rejects `ws://`, URLs with credentials/query strings, and URLs other than `/remote/agent`. Device IDs are restricted to letters, digits, `_`, and `-`; tokens must be at least 16 characters. The agent accepts only relay control messages, permits one local VNC connection at a time, caps relay buffering at 4 MiB, and retries an interrupted relay connection with a bounded 1/2/5/10/30-second backoff.

**Screen Sharing may listen on the Mac's LAN interfaces.** Restrict allowed Screen Sharing users in macOS and use the Mac firewall/network policy to limit access. Never port-forward TCP 5900. The VNC viewer password is separate from the macOS login password; make it long, unique, and store it as a separate credential.

Press Ctrl-C (or send `SIGTERM`) to stop it; it closes both relay and local VNC sockets. The vcobs admin session and relay authorization remain essential controls—treat the configuration file and VNC password as sensitive credentials.

## Troubleshooting

- **Agent never appears online:** confirm the `wss://` hostname/certificate, device ID, and token match the server configuration. Check that the config file is `0600`.
- **A browser opens but cannot view/control:** enable Screen Sharing and the VNC password option above; from the Mac, confirm a listener exists on `127.0.0.1:5900` with `lsof -nP -iTCP:5900 -sTCP:LISTEN`.
- **`vnc_unavailable` in relay diagnostics:** Screen Sharing is stopped, not listening locally, or denied a VNC connection. Restart Screen Sharing and verify its settings.
- **Browser gets 404/1006 on `/remote/ws`:** select `HTTPS-поток` in `/admin/remote`, or leave `Авто` selected to retry over an authenticated HTTPS stream after a blocked WebSocket upgrade. `HTTPS-опрос` remains available if a proxy blocks streaming responses too. The Mac agent still needs outbound `wss://` to Asus; it never falls back to unencrypted `ws://`.
- **Keyboard does not respond:** click inside the remote screen or use the `Захватить клавиатуру` button. If a browser or corporate environment prevents canvas focus, type into the `Прямой ввод с клавиатуры` field, which sends keys directly to noVNC. Browser-reserved shortcuts may remain local.
- **Frequent reconnects:** investigate TLS/proxy connectivity and network stability for both the browser and the agent.
