# Lark 4.1.0

This release improves Lark Desktop startup, compiler diagnostics, appearance,
and Lark Share on local networks.

- Desktop retries opening its window with a separate browser profile when the
  first window does not check in. Each launcher uses its own temporary app file,
  and startup output is recorded in the Desktop boot log for troubleshooting.
- Java compiler errors underline the relevant token where javac provides a
  position, rather than coloring the entire line.
- Five new Share avatars: Parrot, Puffin, Kingfisher, Flamingo, and Woodpecker.
- Two new themes: Lark Twilight and Lark Meadow.
- Lark Share uses shorter six-character LAN codes, retains the private
  invitation option, and improves editor synchronization and recovery.

Lark Share still requires host approval. Short codes work on networks where LAN
discovery and direct connections are permitted; no relay is included. The
current code exchange permits offline guessing from a captured proof, and the
shorter code provides less resistance than before. Hosts should verify who is
requesting access before approving. Independent LAN hosts may generate the same
code. The Desktop startup changes address identified failure paths but do not
guarantee a window opens on every computer.
