/* Lark Share: authenticated LAN collaboration and host controls. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const button = $('share-open');
  if (!button) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'share-dialog';
  dialog.setAttribute('aria-labelledby', 'share-title');
  const element = (tag, text, parent) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (parent) parent.append(node);
    return node;
  };
  const heading = element('div', null, dialog); heading.className = 'share-heading';
  element('h2', 'Lark Share', heading).id = 'share-title';
  const close = element('button', 'Close', heading); close.type = 'button'; close.onclick = () => dialog.close();
  element('p', 'Encrypted collaboration · Save and review source before running collaborator-modified code.', dialog);
  const status = element('p', 'Disconnected', dialog); status.setAttribute('role', 'status');
  const bluetoothStats = element('p', '', dialog); bluetoothStats.hidden = true;
  const bluetoothTest = element('button', 'Test connection', dialog); bluetoothTest.type = 'button'; bluetoothTest.hidden = true;
  const bluetoothTestResult = element('p', '', dialog); bluetoothTestResult.setAttribute('role', 'status');
  bluetoothTest.onclick = async () => {
    bluetoothTest.disabled = true; bluetoothTestResult.textContent = 'Testing the Bluetooth connection…';
    try {
      const result = await api('bluetooth-test');
      bluetoothTestResult.textContent = `Test received ${(result.bytes / 1024).toFixed(0)} KiB in ${(result.elapsedMs / 1000).toFixed(2)} seconds: ${(result.bytesPerSecond / 1024).toFixed(1)} KiB/s, including connection overhead.`;
    } catch (err) { bluetoothTestResult.textContent = 'Connection test failed: ' + err.message; }
    finally { bluetoothTest.disabled = false; }
  };
  const notice = element('p', '', dialog); notice.setAttribute('role', 'status'); notice.className = 'share-presence-notice';
  let knownPeople = null, noticeTimer = null;
  const popup = element('div', '', document.body); popup.className = 'share-presence-popup'; popup.setAttribute('role', 'status'); popup.hidden = true;
  const error = element('p', '', dialog); error.className = 'share-error'; error.setAttribute('role', 'alert');
  const retry = element('button', 'Retry connection', dialog); retry.type = 'button'; retry.hidden = true;
  retry.onclick = () => { statusFailures = 0; statusRetryAfter = 0; statusPaused = false; retry.hidden = true; window.LarkShareEditing.retry(); refresh().catch(report); };
  const navigation = element('div', null, dialog); navigation.className = 'share-actions';
  const content = element('div', null, dialog);
  document.body.append(dialog);
  let latest = {}, timer = null, busy = false, polling = false, page = 'home', generation = 0, navigationKey = '';
  let statusFailures = 0, statusRetryAfter = 0, statusPaused = false, editorPaused = false;
  function statusFailure(terminal = false) {
    statusFailures++; statusRetryAfter = Date.now() + Math.min(8000, 250 * 2 ** Math.min(statusFailures - 1, 5)) + Math.floor(Math.random() * 250);
    if (terminal || statusFailures >= 8) { statusPaused = true; retry.hidden = false; if (timer) clearInterval(timer); timer = null; }
  }

  async function api(action, values = {}) {
    const response = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lark': '1' }, body: JSON.stringify({ ...values, action }) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Share request failed.');
    return data;
  }
  function chooseAction(title, message, choices) {
    return new Promise(resolve => {
      const modal = document.createElement('dialog'); modal.className = 'share-confirm-dialog';
      element('h2', title, modal); element('p', message, modal);
      const actions = element('div', null, modal); actions.className = 'share-actions';
      let answered = false;
      const finish = value => { if (answered) return; answered = true; modal.close(); modal.remove(); resolve(value); };
      choices.forEach(choice => { const b = element('button', choice.label, actions); b.type = 'button'; b.onclick = () => finish(choice.value); });
      modal.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
      document.body.append(modal); modal.showModal();
    });
  }
  const report = err => { error.textContent = err.message; };
  function action(parent, text, run) {
    const node = element('button', text, parent); node.type = 'button';
    node.onclick = async () => {
      const locks = parent !== navigation;
      if (locks && busy) return;
      if (locks) busy = true;
      node.disabled = true; error.textContent = '';
      try { await run(); } catch (err) { report(err); }
      finally { if (locks) busy = false; node.disabled = false; }
    };
    return node;
  }
  function field(parent, label, type = 'text', value = '') {
    const wrap = element('label', label, parent);
    const input = element(type === 'select' ? 'select' : type === 'textarea' ? 'textarea' : 'input', null, wrap);
    input.setAttribute('aria-label', label);
    if (input.tagName === 'INPUT') input.type = type;
    input.value = value;
    if (type === 'text') input.maxLength = 80;
    return input;
  }
  // Mirrors Share.normalizeInvitation: chat apps wrap lines and add zero-width or quote characters.
  function normalizeInvitation(raw) {
    let text = String(raw || '');
    if (text.length > 8192) throw new Error();
    if (text.includes('%')) { try { text = decodeURIComponent(text.replace(/\+/g, '%2B')); } catch (_) { } }
    text = text.replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF\u00AD]/g, '').replace(/\s+/g, '');
    const runs = text.match(/[A-Za-z0-9_\-+/]+/g) || [];
    const best = runs.reduce((a, b) => b.length > a.length ? b : a, '');
    return best.replace(/\+/g, '-').replace(/\//g, '_');
  }
  function startPage(next) { page = next; generation++; content.replaceChildren(); error.textContent = ''; }
  function bluetoothProgress(parent, message) {
    const box = element('div', null, parent); box.className = 'share-connection-progress';
    const label = element('p', message, box); label.setAttribute('role', 'status');
    const bar = element('progress', null, box); bar.setAttribute('aria-label', 'Bluetooth connection progress');
    const elapsed = element('p', '', box); const started = performance.now();
    const update = () => { elapsed.textContent = `Elapsed: ${Math.floor((performance.now() - started) / 1000)}s · Transfer speed: unavailable`; };
    const interval = setInterval(update, 1000); update();
    return () => { clearInterval(interval); box.remove(); return Math.round(performance.now() - started); };
  }
  function showInvitation(data) {
    element('p', 'Send this private invitation to the intended participant over a trusted channel. Anyone holding it can request approval. End the session to invalidate it.', content);
    if (data.relay) element('p', 'This invitation uses encrypted Share through the HTTPS relay. Verify the host fingerprint over a trusted channel.', content);
    if (latest.relayError) element('p', latest.relayError, content).className = 'share-error';
    const invite = field(content, 'Private invitation', 'textarea', data.invitation); invite.readOnly = true;
    action(content, 'Copy invitation', async () => {
      try { await navigator.clipboard.writeText(data.invitation); }
      catch (_) { invite.focus(); invite.select(); document.execCommand('copy'); }
    });
    if (!data.bluetooth && /^127\./.test(data.address || '')) element('p', 'This session listens on 127.0.0.1, so only this computer can join. Host on a Wi-Fi or Ethernet address to invite another computer.', content).className = 'share-error';
    element('p', 'SHA-256: ' + data.fingerprint, content).className = 'share-fingerprint';
    if (data.relay) element('p', 'Relay sessions use private invitations. LAN discovery and short codes are turned off.', content);
    else if (!data.bluetooth) showCode(latest || data);
    if (data.bluetooth) element('p', 'Pair the computers in Windows Bluetooth settings, then send this invitation to the guest.', content);
  }
  // Short LAN code: found over this network only, never broadcast; the host still approves each guest.
  function showCode(data) {
    const box = element('div', null, content); box.className = 'share-code';
    element('h3', 'Share Code' + (data.codeState === 'active' && data.code ? ': ' + data.code : ''), box);
    if (data.codeState === 'active' && data.code) {
      element('p', 'Expires in about ' + Math.max(1, Math.round((data.codeExpiresIn || 0) / 60)) + ' min. Anyone with it can ask to join; you still approve them.', box);
      action(box, 'Copy code', async () => { try { await navigator.clipboard.writeText(data.code); } catch (_) { toastError('Copy the code by hand: ' + data.code); } });
      action(box, 'Revoke code', async () => { latest = await api('code-revoke'); content.replaceChildren(); showInvitation(await api('invitation')); });
    } else {
      if (data.codeState === 'expired') element('p', 'The last code expired.', box);
      if (data.codeState === 'revoked') element('p', 'The last code was revoked.', box);
      action(box, 'Create Lark code', async () => { latest = await api('code', { minutes: 15 }); content.replaceChildren(); showInvitation(await api('invitation')); });
      if (!data.discovery) element('p', 'Needs LAN discovery turned on. The long invitation above works without it.', box);
    }
  }
  function toastError(text) { error.textContent = text; }
  function showRelayProgress(parent) {
    const box = element('section', null, parent); box.className = 'share-code';
    element('h3', 'Deploying Relay', box);
    element('p', 'Connecting to the existing Lark Share relay…', box);
    const elapsed = element('p', 'Elapsed: 0 seconds', box);
    const estimate = element('p', 'Estimated remaining: approximately 60 seconds', box);
    const stage = element('p', 'Status: Checking relay', box); stage.setAttribute('role', 'status');
    const progress = element('progress', null, box); progress.setAttribute('aria-label', 'Connecting to relay');
    const cancel = element('button', 'Cancel connection', box); cancel.type = 'button'; cancel.disabled = true;
    let cancelling = false;
    cancel.onclick = async () => { cancelling = true; cancel.disabled = true; stage.textContent = 'Status: Cancelling…'; try { await api('relay-cancel'); } catch (err) { report(err); } };
    const started = Date.now(); let stopped = false, pending = false, previous = 0;
    try { previous = Number(localStorage.getItem('lark-share-relay-startup-ms')) || 0; } catch (_) { }
    const estimateMs = previous > 0 && previous <= 120000 ? Math.max(5000, previous) : 60000;
    const labels = {CHECKING:'Checking Relay',WAKING:'Waking Relay',WAITING:'Waiting for Relay',CONNECTING:'Establishing Secure Connection',AUTHENTICATING:'Authenticating',REGISTERING:'Registering Hosting Session',CONNECTED:'Relay Connected',FAILED:'Connection failed'};
    const tick = async () => {
      elapsed.textContent = 'Elapsed: ' + Math.floor((Date.now() - started) / 1000) + ' seconds';
      const remaining = Math.ceil((estimateMs - (Date.now() - started)) / 1000);
      estimate.textContent = remaining > 0 ? 'Estimated remaining: approximately ' + remaining + ' seconds' : 'Estimated remaining: taking longer than estimated';
      if (pending || stopped) return; pending = true;
      try { const state = await api('relay-progress'); if (!stopped && !cancelling && labels[state.state]) { stage.textContent = 'Status: ' + labels[state.state]; cancel.disabled = !['CHECKING','WAKING','WAITING','CONNECTING','AUTHENTICATING','REGISTERING'].includes(state.state); } } catch (_) { }
      finally { pending = false; }
    };
    const timer = setInterval(tick, 1000); tick();
    return success => { if (stopped) return; stopped = true; clearInterval(timer); if (success) { try { localStorage.setItem('lark-share-relay-startup-ms', String(Date.now() - started)); } catch (_) { } } box.remove(); };
  }
  async function hostPage() {
    startPage('host'); const current = generation;
    const projects = await fetch('/api/projects').then(r => { if (!r.ok) throw new Error('Cannot list projects.'); return r.json(); });
    if (current !== generation) return;
    const form = element('form', null, content);
    const project = field(form, 'Project to share', 'select');
    (projects.projects || []).forEach(p => { const option = element('option', p.name, project); option.value = p.id; });
    const selected = $('project-pick-label')?.textContent;
    const match = (projects.projects || []).find(p => p.name === selected);
    if (match) project.value = match.id;
    const name = field(form, 'Session name', 'text', match?.name || projects.projects?.[0]?.name || 'Java source review'); name.required = true;
    project.onchange = () => { name.value = project.selectedOptions[0]?.textContent || ''; };
    const displayName = field(form, 'Your display name'); displayName.required = true;
    const connection = field(form, 'Connection', 'select');
    [['bluetooth','Bluetooth'],['existing','Existing network connection']].forEach(([v,l]) => { const o = element('option', l, connection); o.value = v; });
    const group = field(form, 'Bluetooth session size', 'select');
    [['direct','Two people'],['group','Small group (up to four people)']].forEach(([v,l]) => { const o = element('option', l, group); o.value = v; });
    const submit = element('button', 'Host session', form); submit.type = 'submit';
    form.onsubmit = async event => {
      event.preventDefault(); if (busy) return; busy = true; submit.disabled = true;
      let stopProgress = () => {};
      try {
        status.textContent = 'Starting Share…';
        await window.LarkEditorShare.flush();
        if (connection.value === 'bluetooth') stopProgress = bluetoothProgress(form, 'Starting Bluetooth Share…');
        else if (latest.relayUrl) stopProgress = showRelayProgress(form);
        const data = await api('host', { project: project.value, name: name.value, displayName: displayName.value, bird: window.LarkBirds.selected(), connection: connection.value, group: group.value });
        stopProgress(true);
        latest = data; startPage('invitation'); showInvitation(data); await refresh();
      } catch (err) { report(err); status.textContent = 'Disconnected'; } finally { stopProgress(); busy = false; submit.disabled = false; }
    };
  }
  function joinPage() {
    startPage('join');
    const form = element('form', null, content);
    element('p', 'For Bluetooth, pair both computers in Windows, then paste the host’s private invitation below.', form);
    action(form, 'Open Windows Bluetooth pairing', async () => { try { await api('bluetooth-settings'); } catch (err) { report(err); } });
    const devices = element('div', null, form);
    action(form, 'Find nearby Bluetooth devices', async () => {
      devices.replaceChildren(); element('p', 'Searching for Bluetooth devices…', devices);
      const finishScan = bluetoothProgress(devices, 'Finding nearby devices and Lark sessions…');
      try {
        const result = await api('bluetooth-discover'); finishScan(); devices.replaceChildren();
        if (!result.devices.length) element('p', 'No Bluetooth devices found. Make sure the other computer is discoverable in Windows.', devices);
        result.devices.forEach(device => {
          const row = element('div', null, devices);
          const label = element('span', `${device.name || 'Unnamed device'} · ${device.address} · ${device.paired ? 'Paired' : 'Not paired'}${device.lark ? ' · Lark Share available' : ''}`, row);
          if (!device.paired) {
            const button = action(row, 'Pair', async () => {
              button.disabled = true; label.textContent = 'Complete the pairing prompt in Windows on both computers…';
              try { await api('bluetooth-pair', { address: device.address }); label.textContent = `${device.name || 'Device'} · Paired`; button.remove(); }
              catch (err) { label.textContent = `${device.name || 'Device'} · Pairing failed`; button.disabled = false; report(err); }
            });
          }
          if (device.lark) {
            const join = action(row, 'Request to join', async () => {
              if (!displayName.value.trim()) { displayName.focus(); error.textContent = 'Enter your display name first.'; return; }
              join.disabled = true;
              const finishConnection = bluetoothProgress(row, 'Connecting over Bluetooth and requesting host approval…');
              try {
                latest = await api('request', { bluetooth: true, address: device.address, displayName: displayName.value });
                const duration = finishConnection();
                startPage('home'); await refresh();
                element('p', 'Ask the host to compare this verification code before approving: ' + (latest.verification || '?'), content).className = 'share-fingerprint';
                element('p', `Connection request completed in ${(duration / 1000).toFixed(1)} seconds. Waiting for host approval.`, content);
              } catch (err) { finishConnection(); join.disabled = false; report(err); }
            });
          }
        });
        element('p', 'Ask the host to verify the matching code before approving your request.', devices);
      } catch (err) { finishScan(); devices.replaceChildren(); report(err); }
    });
    const invitation = field(form, 'Share code (like 7K9M2P) or private invitation from the host', 'textarea'); invitation.maxLength = 8192; invitation.required = true;
    const displayName = field(form, 'Your display name'); displayName.required = true;
    const identity = element('p', 'Paste the invitation to inspect the host identity before connecting.', form);
    identity.className = 'share-fingerprint';
    const isCode = () => { const t = invitation.value.replace(/[^A-Za-z0-9]/g, ''); return t.length > 0 && t.length <= 16; };
    invitation.oninput = () => {
      verified.required = !isCode(); verifiedRow.hidden = isCode();
      if (isCode()) { identity.textContent = 'Lark code: Lark will look for this host on your network and check it knows the code.'; return; }
      try {
        const data = JSON.parse(atob(normalizeInvitation(invitation.value).replace(/-/g, '+').replace(/_/g, '/')));
        if (!/^[a-f0-9]{64}$/i.test(data.fingerprint) || typeof data.address !== 'string' || data.address.length > 64) throw new Error();
        identity.textContent = data.relay ? `Relay: ${data.relay} · Host SHA-256: ${data.fingerprint}` : `Host: ${data.address}:${data.port} · SHA-256: ${data.fingerprint}`;
      } catch (_) { identity.textContent = 'Invalid invitation. Ask the host for a new private invitation.'; }
    };
    const verified = field(form, 'I verified this private invitation and host identity directly with the intended host over a trusted channel.', 'checkbox'); verified.required = true;
    const verifiedRow = verified.closest('label') || verified.parentElement;
    element('p', 'The invitation is private and grants a request to join; the host still approves each device. Verify the host identity with them over a trusted channel. Never use an invitation from an unknown sender.', form);
    const submit = element('button', 'Request access', form); submit.type = 'submit';
    form.onsubmit = async event => {
      event.preventDefault(); if (busy) return; busy = true; submit.disabled = true;
      let stopProgress = () => {};
      try {
        status.textContent = 'Connecting';
        try { const decoded = JSON.parse(atob(normalizeInvitation(invitation.value).replace(/-/g, '+').replace(/_/g, '/'))); if (decoded.bluetooth) stopProgress = bluetoothProgress(form, 'Connecting over Bluetooth and requesting host approval…'); else if (decoded.relay) stopProgress = showRelayProgress(form); } catch (_) { }
        latest = await api('join', { invitation: invitation.value, displayName: displayName.value, bird: window.LarkBirds.selected(), verified: verified.checked });
        stopProgress(true);
        startPage('home'); await refresh();
      } catch (err) { report(err); status.textContent = 'Connection Lost'; }
      finally { stopProgress(); busy = false; submit.disabled = false; }
    };
  }
  function participants() {
    startPage('participants'); drawParticipants();
  }
  function drawParticipants() {
    content.replaceChildren();
    element('h3', 'Connected devices and access requests', content);
    const list = latest.session?.participants || [];
    if (!list.length) element('p', 'No participants yet.', content);
    if (latest.verification) element('p', (latest.hosting ? 'Your check code: ' : 'Host check code: ') + latest.verification + (latest.hosting ? ' — a guest who used Request Access sees this same code. If theirs is different, deny them.' : ' — the host sees the same code. Ask them to confirm it matches.'), content).className = 'share-fingerprint';
    list.forEach(person => {
      const row = element('div', null, content); row.className = 'share-device';
      row.append(window.LarkBirds.make(person.bird, 32));
      element('strong', person.name, row);
      if (person.device) element('span', person.device, row);
      element('span', `${person.status === 'pending' ? 'wants to join' : person.status} · ${person.role} · ${person.connected ? 'Connected' : 'Connection Lost'}${person.file && localStorage.getItem('lark-share-show-positions') !== 'false' ? ' · ' + person.file + ' · ' + window.LarkShareEditing.position(person) : ''}`, row);
      if (latest.hosting && person.status === 'pending') action(row, 'Approve as Editor', async () => { latest = await api('decide', { device: person.id, approve: true, role: 'editor' }); await refresh(); });
      if (latest.hosting && person.status === 'pending') action(row, 'Approve as Viewer', async () => { latest = await api('decide', { device: person.id, approve: true, role: 'viewer' }); await refresh(); });
      if (person.status === 'approved' && person.id !== latest.identity) action(row, 'Follow ' + person.name, () => { window.LarkShareEditing.follow(person.id, person.name); dialog.close(); });
      if (latest.hosting && person.id !== 'host' && person.status === 'approved') action(row, person.role === 'editor' ? 'Make Viewer' : 'Make Editor', async () => { latest = await api('decide', { device: person.id, approve: true, role: person.role === 'editor' ? 'viewer' : 'editor' }); await refresh(); });
      if (latest.hosting && person.id !== 'host' && person.status !== 'revoked') action(row, person.status === 'pending' ? 'Deny' : 'Remove from session', async () => { latest = await api('decide', { device: person.id, approve: false }); await refresh(); });
    });
  }
  function chooseBird() {
    startPage('birds'); element('h3', 'Choose Your Bird', content);
    const preview=element('div', null, content); preview.className='share-bird-preview';
    const grid=element('div', null, content); grid.className='share-bird-grid';
    function draw() {
      const selected=window.LarkBirds.selected(); preview.replaceChildren(window.LarkBirds.make(selected, 64));
      element('strong', window.LarkBirds.birds.find(b=>b[0]===selected)[1], preview);
      grid.replaceChildren();
      window.LarkBirds.birds.forEach(b => {
        const tile=action(grid, '', async () => {
          await api('avatar', {bird:b[0]});
          window.LarkBirds.save(b[0]); draw(); grid.querySelector('[data-bird="' + b[0] + '"]')?.focus(); await refresh();
        });
        tile.className='share-bird-tile'; tile.dataset.bird=b[0]; tile.setAttribute('aria-pressed', String(selected===b[0]));
        tile.append(window.LarkBirds.make(b[0], 48)); element('span',b[1],tile);
      });
    }
    draw();
  }
  function security() {
    startPage('security');
    element('h3', 'Connection security', content);
    element('p', 'TLS 1.3 and authentication are always enabled. Every new device requires host approval. Participants cannot run programs, access terminals, change settings or browse other projects on the host.', content);
    element('p', 'Sessions end after eight hours at most. Roles are enforced by the host backend. Invitations must be verified over a trusted channel; discovery metadata does not prove identity.', content);
    if (latest.hosting) {
      const form = element('form', null, content);
      const role = field(form, 'Suggested participant role', 'select');
      ['editor', 'viewer'].forEach(value => { const option = element('option', value, role); option.value = value; }); role.value = latest.session.defaultRole;
      const minutes = field(form, 'Inactivity expiration (minutes)', 'number', String(latest.session.idleMinutes)); minutes.min = '5'; minutes.max = '120';
      const discovery = field(form, 'LAN discovery', 'checkbox'); discovery.checked = !!latest.discovery;
      discovery.disabled = !!latest.relay;
      action(form, 'Apply security settings', async () => { latest = await api('security', { role: role.value, minutes: Number(minutes.value), discovery: discovery.checked }); await refresh(); });
      element('p', latest.relay ? 'HTTPS relay is active. Share a private invitation; LAN discovery and short codes are off.' : latest.discoveryError || (latest.discovery ? 'Advertising on the selected interface.' : 'Discovery is off; private invitations still work.'), form);
    }
    if (latest.fingerprint) element('p', 'Host SHA-256: ' + latest.fingerprint, content).className = 'share-fingerprint';
  }
  // Nearby Sessions: rescans every few seconds while open; one card per session id.
  let nearbyTimer = null, nearbyName = '', nearbyScanning = false;
  dialog.addEventListener('close', () => { clearInterval(nearbyTimer); nearbyTimer = null; });
  async function nearby() {
    startPage('nearby'); const current = generation;
    element('h3', 'Nearby sessions', content);
    const name = field(content, 'Your display name', 'text', nearbyName); name.oninput = () => { nearbyName = name.value; };
    const bar = element('div', null, content); bar.className = 'share-actions';
    const list = element('div', null, content); element('p', 'Searching the local network…', list);
    const scan = async () => {
      if (!dialog.open || page !== 'nearby' || generation !== current) { clearInterval(nearbyTimer); nearbyTimer = null; return; }
      if (busy || nearbyScanning) return;
      nearbyScanning = true;
      try {
        const data = await api('nearby');
        if (dialog.open && page === 'nearby' && generation === current) drawNearby(list, data.sessions || [], name);
      } catch (err) { if (dialog.open && page === 'nearby' && generation === current) report(err); }
      finally { nearbyScanning = false; }
    };
    action(bar, 'Refresh', scan);
    clearInterval(nearbyTimer); nearbyTimer = setInterval(scan, 10000);
    await scan();
  }
  function drawNearby(list, sessions, name) {
    list.replaceChildren();
    if (!sessions.length) {
      element('p', 'No nearby sessions found. You can also join using a share code.', list);
      return;
    }
    const labels = { available: 'Available', full: 'Full', pending: 'Waiting for host approval', connected: 'Connected', denied: 'Denied by host', unavailable: 'Not answering' };
    sessions.forEach(item => {
      const row = element('div', null, list); row.className = 'share-device share-nearby';
      row.append(window.LarkBirds.make(item.bird, 32));
      const text = element('div', null, row);
      element('strong', item.name || 'Lark session', text);
      element('span', ` ${item.host || 'Host'} · ${item.count || '?'} in session`, text);
      const badge = element('span', labels[item.status] || item.status, row); badge.className = 'share-status share-status-' + item.status;
      if (item.status === 'available') {
        const btn = action(row, 'Join', async () => {
          if (!name.value.trim()) { name.focus(); error.textContent = 'Enter your display name first.'; return; }
          btn.disabled = true; badge.textContent = 'Asking host…';
          try {
            latest = await api('request', { address: item.address, port: item.port, displayName: name.value });
            clearInterval(nearbyTimer); nearbyTimer = null;
            startPage('home'); await refresh();
            element('p', 'Request sent. Host check code: ' + (latest.verification || '?') + '. Ask the host to confirm it matches theirs before they approve.', content).className = 'share-fingerprint';
          } catch (err) { report(err); btn.disabled = false; badge.textContent = labels.available; }
        });
      }
    });
  }
  async function review() {
    startPage('review'); const data = await api('review');
    element('h3', 'Review shared changes before running', content);
    data.changes.forEach(change => { element('h4', change.path, content); element('p', 'Before', content); element('pre', change.before, content).className = 'share-source'; element('p', 'Current shared source', content); element('pre', change.after, content).className = 'share-source'; });
    if (data.conflicts.length) element('p', 'External changes or save failures exist. Do not run. Export recovery, end Share, then reconcile the disk and recovery versions.', content);
    else action(content, 'I reviewed these changes — allow local execution', async () => { latest = await api('acknowledge'); await refresh(); home(); });
  }
  function recovery() {
    startPage('recovery'); element('h3', 'Recover local edits', content);
    const drafts = window.LarkShareEditing.recoveries();
    if (!drafts.length) element('p', 'No persisted drafts. Pending edits remain in the active session until acknowledged.', content);
    action(content, 'Export current recovery text', () => window.LarkShareEditing.exportRecovery());
    drafts.forEach(draft => {
      element('h4', draft.path, content);
      element('p', 'Saved local draft. Compare it with the current editor and review your merge; replacing source is never automatic.', content);
      const text = field(content, 'Reviewed merged source for ' + draft.path, 'textarea', draft.text);
      action(content, 'Apply reviewed merge', async () => {
        const answer = await chooseAction('Apply reviewed merge?', 'Other participants will see the resulting edits.', [{label:'Cancel',value:false},{label:'Apply merge',value:true}]);
        if (answer) window.LarkShareEditing.mergeRecovery(draft.key, text.value);
      });
    });
  }
  async function files() {
    startPage('files'); const current = generation;
    const data = await api('files'); if (current !== generation) return;
    element('h3', 'Shared Java source', content);
    const select = field(content, 'File', 'select');
    data.files.forEach(file => { const option = element('option', file.path, select); option.value = file.path; });
    const source = element('pre', '', content); source.className = 'share-source'; source.tabIndex = 0; source.setAttribute('aria-label', 'Read-only shared source');
    const read = async () => {
      const path = select.value;
      const data = await api('source', { path });
      if (page === 'files' && select.value === path && current === generation) source.textContent = data.content;
    };
    select.onchange = () => read().catch(report);
    if (select.value) await read();
  }
  function home() {
    startPage('home');
    element('p', latest.hosting ? 'Hosting a collaborative Java project. Open Participants to approve or revoke devices.' : latest.joined ? 'Joined a pinned host. Open Shared Project after approval to collaborate in the editor.' : 'Host a saved Java project, or join using a private invitation.', content);
    if (!latest.hosting && !latest.joined) element('p', latest.relayUrl ? 'Connection: Lark relay' : 'Connection: local network', content);
  }
  function connectionPage() {
    startPage('connection');
    element('h3', 'Share connection', content);
    element('p', 'Use the Lark relay to connect across networks, or choose a direct local network connection.', content);
    const form = element('form', null, content);
    const mode = field(form, 'Connection method', 'select');
    [['relay', 'Relay'], ['local', 'Local network']].forEach(([value, label]) => { const option = element('option', label, mode); option.value = value; });
    mode.value = latest.relayUrl ? 'relay' : 'local';
    const url = field(form, 'Relay HTTPS address', 'url', latest.relayUrl || latest.defaultRelayUrl || 'https://larrk-relay.onrender.com');
    url.maxLength = 512; url.spellcheck = false;
    const updateMode = () => { url.disabled = mode.value !== 'relay'; url.required = mode.value === 'relay'; };
    mode.onchange = updateMode; updateMode();
    action(form, 'Use Lark relay address', async () => { mode.value = 'relay'; url.value = latest.defaultRelayUrl || 'https://larrk-relay.onrender.com'; updateMode(); });
    const save = element('button', 'Save connection', form); save.type = 'submit';
    form.onsubmit = async event => {
      event.preventDefault(); if (busy) return; busy = true; save.disabled = true; error.textContent = '';
      try { latest = await api('relay-settings', { url: mode.value === 'relay' ? url.value.trim() : '' }); home(); await refresh(); }
      catch (err) { report(err); }
      finally { busy = false; save.disabled = false; }
    };
  }
  async function diagnostics() {
    startPage('diagnostics');
    const info = await api('relay-progress');
    element('h3', 'Share connection diagnostics', content);
    element('p', 'Relay: ' + (latest.relayUrl || 'Local network'), content);
    element('p', 'Status: ' + (info.state || 'DISCONNECTED'), content);
    element('p', 'Last connected: ' + (info.lastConnected ? new Date(info.lastConnected).toLocaleString() : 'Not yet'), content);
    element('p', 'Startup time: ' + (info.startupDuration ? (info.startupDuration / 1000).toFixed(1) + ' seconds' : info.started ? Math.floor((Date.now() - info.started) / 1000) + ' seconds elapsed' : 'Not started'), content);
    element('p', 'Relay response time: ' + (info.latency >= 0 ? info.latency + ' ms' : 'Not measured'), content);
    element('p', 'Reconnect attempts: ' + (info.attempts || 0), content);
    element('p', 'Hosting: ' + (latest.hosting ? (info.state === 'CONNECTED' ? 'Registered' : 'Reconnecting') : 'Not hosting'), content);
    if (info.error) element('p', info.error, content).className = 'share-error';
    if (info.log?.length) { element('h4', 'Connection log', content); const log = element('pre', info.log.join('\n'), content); log.className = 'share-source'; }
    if (latest.hosting && latest.relay && info.state === 'FAILED') action(content, 'Retry connection', async () => { latest = await api('relay-retry'); await diagnostics(); });
    action(content, 'Refresh diagnostics', diagnostics);
  }
  function renderNavigation() {
    const key = JSON.stringify([!!latest.hosting, !!latest.joined, latest.session?.status, latest.relayState]);
    if (navigationKey === key) return;
    navigationKey = key;
    navigation.replaceChildren();
    if (!latest.hosting && !latest.joined) {
      action(navigation, 'Host Session', hostPage); action(navigation, 'Join Session', joinPage);
      action(navigation, 'Nearby Sessions', nearby); action(navigation, 'Connection', connectionPage); action(navigation, 'Diagnostics', diagnostics); action(navigation, 'Change Avatar', chooseBird);
      return;
    }
    if (latest.hosting) action(navigation, 'Invitation', async () => { const data = await api('invitation'); startPage('invitation'); showInvitation(data); });
    action(navigation, 'Change Avatar', chooseBird);
    action(navigation, 'Recovery', recovery);
    action(navigation, 'Participants', participants); action(navigation, 'Security', security); action(navigation, 'Diagnostics', diagnostics);
    if (latest.hosting) action(navigation, 'Review Changes', review);
    if (latest.hosting && latest.relay && latest.relayState === 'FAILED') action(navigation, 'Retry relay', async () => { latest = await api('relay-retry'); await refresh(); });
    if (latest.hosting || latest.joined && latest.session?.status === 'approved') action(navigation, 'Shared Project', () => dialog.close());
    if (latest.hosting || latest.joined) action(navigation, latest.hosting ? 'End Session' : 'Leave Session', async () => {
      const hosting = latest.hosting;
      const choice = await chooseAction(hosting ? 'End Share session?' : 'Leave Share session?', hosting ? 'This ends the session and revokes invitations and devices.' : 'Would you like to save the shared files as your own project before leaving?', hosting ? [{label:'Cancel',value:'cancel'},{label:'End session',value:'leave'}] : [{label:'Cancel',value:'cancel'},{label:'Leave without saving',value:'leave'},{label:'Save a project and leave',value:'save'}]);
      if (!choice || choice === 'cancel') return;
      const copy = choice === 'save' ? await window.LarkShareEditing.snapshot() : null;
      const copyName = latest.session?.name || latest.name || 'Shared project';
      const copyId = copy ? await window.LarkEditorShare.saveCopy(copyName, copy) : null;
      if (window.LarkShareEditing.pending()) window.LarkShareEditing.exportRecovery();
      latest = await api(hosting ? 'end' : 'leave'); await window.LarkShareEditing.stop();
      if (copyId) { dialog.close(); await window.LarkEditorShare.openCopy(copyId); }
      startPage('home'); await refresh(); home();
    });
    action(navigation, 'Refresh', refresh);
  }
  async function refresh() {
    if (polling) return; polling = true;
    try {
      latest = await api('status');
      if (latest.joined && (latest.connection === 'Reconnecting' || latest.connection === 'Connection Lost')) statusFailure(latest.connection === 'Connection Lost');
      else { statusFailures = 0; statusRetryAfter = 0; if (!editorPaused) { statusPaused = false; retry.hidden = true; } }
      window.LarkBirds.save(latest.bird || 'classic');
      const people = latest.session?.participants;
      if (people && (!latest.joined || latest.session?.status === 'approved')) {
        const connected = new Map(people.filter(p => p.status === 'approved' && p.connected && p.id !== latest.identity).map(p => [p.id, p]));
        if (knownPeople) {
          const joined = [...connected.values()].filter(p => !knownPeople.has(p.id));
          const left = [...knownPeople.values()].filter(p => !connected.has(p.id));
          const changed = joined[0] || left[0];
          if (changed) {
            const message = [joined.length ? joined.map(p => p.name).join(', ') + ' joined' : '', left.length ? left.map(p => p.name).join(', ') + ' left' : ''].filter(Boolean).join(' · ') + ' Lark Share';
            notice.replaceChildren(window.LarkBirds.make(changed.bird, 24), document.createTextNode(message));
            popup.replaceChildren(window.LarkBirds.make(changed.bird, 32), document.createTextNode(message));
            popup.hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { popup.hidden = true; }, 4500);
          }
        }
        knownPeople = connected;
        document.dispatchEvent(new CustomEvent('lark-share-presence', { detail: people }));
      } else if (!latest.hosting && (!latest.joined || latest.session?.status === 'pending')) { knownPeople = null; notice.replaceChildren(); document.dispatchEvent(new CustomEvent('lark-share-presence', { detail: [] })); }
      const pending = people?.filter(p => p.status === 'pending').length || 0;
      button.textContent = 'Share' + (pending ? ` (${pending} requests)` : latest.hosting || latest.joined ? ' •' : '');
      button.title = 'Lark Share: ' + latest.connection;
      status.textContent = latest.connection + (latest.session?.name ? ' · ' + latest.session.name : '');
      bluetoothStats.hidden = !latest.bluetoothActive;
      bluetoothTest.hidden = !(latest.bluetoothActive && latest.joined && latest.session?.status === 'approved');
      if (!latest.bluetoothActive) bluetoothTestResult.textContent = '';
      if (latest.bluetoothActive) {
        const rate = value => value < 0 ? 'Measuring…' : value === 0 ? 'Idle' : value < 1024 ? `${value} B/s` : `${(value / 1024).toFixed(1)} KiB/s`;
        const response = Number.isFinite(latest.bluetoothResponseMs) ? `${latest.bluetoothResponseMs} ms` : 'Unavailable';
        bluetoothStats.textContent = `Bluetooth · Sent: ${rate(latest.bluetoothSentBytesPerSecond)} · Received: ${rate(latest.bluetoothReceivedBytesPerSecond)} · Response: ${response}`;
      }
      if ((latest.hosting || latest.joined && latest.session?.status === 'approved') && !window.LarkShareEditing.sessionActive()) {
        await window.LarkShareEditing.start({ id: latest.sessionId, identity: latest.identity, hosting: latest.hosting, project: latest.project, name: latest.session.name });
      }
      if (latest.joined && latest.session?.role) window.LarkShareEditing.updateRole(latest.session.role);
      if (!latest.hosting && !latest.joined && window.LarkShareEditing.sessionActive()) await window.LarkShareEditing.stop();
      if (latest.session?.conflicts?.length) error.textContent = 'Source save conflict. Export recovery and review external changes before running.';
      else if (latest.error) error.textContent = latest.error;
      else if (!busy) error.textContent = '';
      renderNavigation();
      // Do not replace focused controls while a keyboard user is interacting.
      if (page === 'participants' && !content.contains(document.activeElement)) drawParticipants();
      if ((latest.hosting || latest.joined) && !statusPaused) { if (!timer) timer = setInterval(() => { if (Date.now() >= statusRetryAfter) refresh().catch(report); }, 4000); }
      else if (timer) { clearInterval(timer); timer = null; }
    } catch (err) { if (latest.joined) statusFailure(); throw err; }
    finally { polling = false; }
  }
  const avatars = element('div', null, button.parentElement); avatars.id = 'share-avatars';
  const explorer = element('details'); explorer.id = 'share-explorer'; explorer.hidden = true;
  element('summary', 'Lark Share', explorer); const explorerPeople = element('div', null, explorer);
  document.getElementById('tree')?.before(explorer);
  const unfollow = action(avatars, 'Stop following', () => { window.LarkShareEditing.follow(null); }); unfollow.hidden = true;
  let peopleKey = '';
  document.addEventListener('lark-share-presence', event => {
    const approved = event.detail.filter(p => p.status === 'approved');
    const key = JSON.stringify(approved.map(p => [p.id, p.name, p.bird, p.role, p.color, p.file, p.connected]));
    if (key !== peopleKey) {
      peopleKey = key; avatars.querySelectorAll('.share-avatar').forEach(node => node.remove()); explorerPeople.replaceChildren(); explorer.hidden = approved.length === 0;
      approved.forEach(person => {
        const color = /^#[a-f0-9]{6}$/i.test(person.color) ? person.color : '#6495ed';
        const avatar = action(avatars, '', () => { if (!dialog.open) dialog.showModal(); participants(); }); avatar.className = 'share-avatar'; avatar.append(window.LarkBirds.make(person.bird, 22)); avatar.style.borderColor = color; avatar.title = person.name + ' · ' + person.role + (person.file ? ' · ' + person.file : '') + (person.connected ? '' : ' · Connection lost'); avatar.setAttribute('aria-label', avatar.title);
        const row = action(explorerPeople, person.name + (person.file ? ' — ' + person.file : ''), () => { window.LarkShareEditing.follow(person.id, person.name); }); row.prepend(window.LarkBirds.make(person.bird, 24)); row.title = 'Follow participant';
      });
    }
    document.querySelectorAll('.tree-row[data-path]').forEach(row => {
      const editing = approved.filter(p => p.file === row.dataset.path && p.connected);
      if (editing.length) {
        if (!('shareOriginalTitle' in row.dataset)) row.dataset.shareOriginalTitle = row.title;
        row.title = editing.map(p => p.name).join(', ') + (editing.length === 1 ? ' is' : ' are') + ' editing this file.';
      } else if ('shareOriginalTitle' in row.dataset) { row.title = row.dataset.shareOriginalTitle; delete row.dataset.shareOriginalTitle; }
    });
  });
  document.addEventListener('lark-share-follow', event => { unfollow.hidden = !event.detail; unfollow.textContent = event.detail ? 'Stop following ' + event.detail.name : 'Stop following'; });
  document.addEventListener('lark-share-state', event => { button.dataset.connection = event.detail; button.title = 'Lark Share: ' + event.detail; });
  document.addEventListener('lark-share-error', event => { error.textContent = event.detail; });
  document.addEventListener('lark-share-retry', event => { editorPaused = !!event.detail; retry.hidden = !editorPaused && !statusPaused; if (editorPaused) { statusPaused = true; if (timer) clearInterval(timer); timer = null; } });
  button.onclick = async () => {
    if (!dialog.open) { dialog.showModal(); api('relay-wake').catch(() => {}); }
    try { await refresh(); home(); } catch (err) { report(err); }
  };
  // Reattach to an active backend session after a page reload without waiting
  // for the user to reopen the Share dialog.
  if (window.LarkEditorReady) refresh().catch(report);
  else document.addEventListener('lark-editor-ready', () => refresh().catch(report), { once: true });
})();
