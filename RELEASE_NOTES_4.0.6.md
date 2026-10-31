# Lark 4.0.6

Lark Share now includes selectable bird avatars, synchronized participant badges and remote cursor labels. This release also improves terminal Git use and cancellation, tray resizing, minimap defaults, and light themes.

Git commands run in a real shell in the project directory. The terminal uses pipes rather than a full pseudo-terminal, so some interactive SSH and credential prompts may require an external terminal or a configured credential helper. Private input masks entry and omits it from Lark history, but a running program can still echo input.

Share uses the existing authenticated, encrypted LAN protocol and host approval. Collaboration was exercised between local instances and through a local network interface; testing across separate physical computers remains recommended. Windows runtime checks are included in the release workflow; individual macOS and Linux installations still require platform verification.
