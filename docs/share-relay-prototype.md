# Lark Share relay

The relay lets Lark Share work when participant computers cannot connect directly. Lark hosts and guests make outbound HTTPS requests to the same service. Lark defaults to `https://larrk-relay.onrender.com`; a normal host or guest does not need to enter this address. The host still owns the project and decides who can join, which role they receive, and which Java source files are shared. The existing LAN invitation path remains available.

## Connecting and recovery

When someone opens Share, Lark sends one bounded readiness request so a sleeping relay can start while they prepare the session. When a host starts or a guest joins, Lark checks `/health`, waits for the service to wake, and continues automatically. The **Deploying Relay** panel displays elapsed time, connection stages, and a cancellable wait. The estimate starts at approximately 60 seconds when no previous timing is available and uses the last successful startup on that device afterward; actual times can vary. This wakes an existing service; it does not create a Render deployment.

Readiness checks use bounded retries with backoff and jitter. Hosting starts only after the relay registers its room. If a host connection is interrupted, Lark attempts to restore the same room with bounded retries. The Share diagnostics page shows status and a small in-memory, credential-free connection log; retry there if automatic recovery stops. Guest edits retain their operation identities and recovery copies while reconnecting. Existing custom relay addresses are retained. For advanced use, **Share → Connection** allows another HTTPS relay or a direct LAN session.

## Deploy on Render

1. Push this repository to GitHub and open Render's **New → Blueprint** flow for the repository. The root `render.yaml` creates a Node web service named `lark-share-relay` on the free plan.
2. Wait for the service health check to pass, then copy its HTTPS address, for example `https://lark-share-relay.onrender.com`.
3. Lark uses `https://larrk-relay.onrender.com` by default. To use a different approved service, enter its address under **Lark → Share → Connection** on each computer; choose **Local network** for direct LAN sessions.
4. The host copies the private invitation. The guest chooses **Join Session**, pastes the invitation and verifies it with the host over a trusted channel. The host must still approve the participant.

The relay address is a service endpoint, not a secret. Invitations are secrets: share them only with the intended person, and end the session to close the relay room. Lark does not send short LAN codes through the relay; use the private invitation.

## School network requirements

This connection uses HTTPS requests over TLS to the configured relay domain. It does not tunnel through a blocked domain, override a school proxy, or bypass network restrictions. Ask the school's IT team to approve and allow the exact Render service hostname if needed. Some networks allow only approved destinations or require a proxy configuration. Test only on networks where Lark Share is permitted.

## Privacy and trust

Share requests and responses are encrypted between the guest and host using ephemeral X25519 key agreement and AES-GCM. The host public key is part of the private invitation; verify the displayed fingerprint with the host through a trusted channel before joining. The relay can see connection metadata and invitation capability, and can refuse or delay messages. The host must verify and approve each participant. The encryption implementation has not yet had an independent security review; avoid confidential or student source until that review and a real deployment test are complete.

Room data exists only in service memory. Rooms expire after 45 seconds without a host poll or after eight hours. A restart or free-service sleep loses rooms; Lark attempts to re-register the same session when the service returns. If a restart also interrupts the guests, start a new session and send a fresh invitation. The host application keeps its normal local recovery behavior for edits. The relay limits message sizes, pending requests, rooms, and request rates. The service does not offer a short-code directory or persist projects.

## Run and test locally

Node.js 20 or newer is required. From the `relay` folder:

```sh
npm test
npm start
```

The local relay uses HTTP for local development only. Lark intentionally accepts **HTTPS addresses only** in its Share connection controls. It uses HTTPS long polling, not WebSockets. Deploy the service first or use a local HTTPS test setup to exercise the complete Java-client flow. Run `python test/share-relay-lifecycle.py` from the repository root after building the app to test cold starts, cancellation, room recovery and edit replay with local TLS mocks; this requires Node, Java and OpenSSL.

Render free service sleep, bandwidth, and account limits can change. An inactive service can take time to wake; retries cannot guarantee availability. Lark does not send background requests solely to keep an unused relay awake. Review Render's current plan terms before using the service with a group. A school may require its own hosted endpoint or a domain administrator to approve the service. The relay server changes must be deployed to Render and the client changes distributed in a new Lark build before users receive them.
