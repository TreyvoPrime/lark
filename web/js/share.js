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
  element('p', 'Encrypted LAN collaboration · Save and review source before running collaborator-modified code.', dialog);
  const status = element('p', 'Disconnected', dialog); status.setAttribute('role', 'status');
  const notice = element('p', '', dialog); notice.setAttribute('role', 'status'); notice.className = 'share-presence-notice';
  let knownPeople = null, noticeTimer = null;
  const popup = element('div', '', document.body); popup.className = 'share-presence-popup'; popup.setAttribute('role', 'status'); popup.hidden = true;
  const error = element('p', '', dialog); error.className = 'share-error'; error.setAttribute('role', 'alert');
  const navigation = element('div', null, dialog); navigation.className = 'share-actions';
  const content = element('div', null, dialog);
  document.body.append(dialog);
  let latest = {}, timer = null, busy = false, polling = false, page = 'home', generation = 0, navigationKey = '';

  async function api(action, values = {}) {
    const response = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lark': '1' }, body: JSON.stringify({ ...values, action }) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Share request failed.');
    return data;
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
  function showInvitation(data) {
    element('p', 'Send this private invitation to the intended participant over a trusted channel. Verify its fingerprint directly with the host. Anyone holding it can request approval. End the session to invalidate it.', content);
    const invite = field(content, 'Private invitation', 'textarea', data.invitation); invite.readOnly = true;
    action(content, 'Copy invitation', async () => {
      try { await navigator.clipboard.writeText(data.invitation); }
      catch (_) { invite.focus(); invite.select(); document.execCommand('copy'); }
    });
    if (/^127\./.test(data.address || '')) element('p', 'This session listens on 127.0.0.1, so only this computer can join. Host on a Wi-Fi or Ethernet address to invite another computer.', content).className = 'share-error';
    element('p', 'SHA-256: ' + data.fingerprint, content).className = 'share-fingerprint';
    showCode(latest || data);
  }
  // Short LAN code: found over this network only, never broadcast; the host still approves each guest.
  function showCode(data) {
    const box = element('div', null, content); box.className = 'share-code';
    element('h3', 'Short Lark code (same network only)', box);
    if (data.codeState === 'active' && data.code) {
      const code = element('p', data.code, box); code.className = 'share-fingerprint';
      element('p', 'Expires in about ' + Math.max(1, Math.round((data.codeExpiresIn || 0) / 60)) + ' min. Anyone with it can ask to join; you still approve them.', box);
      action(box, 'Copy code', async () => { try { await navigator.clipboard.writeText(data.code); } catch (_) { toastError('Copy the code by hand: ' + data.code); } });
      action(box, 'Revoke code', async () => { latest = await api('code-revoke'); content.replaceChildren(); showInvitation(await api('invitation')); });
    } else {
      if (data.codeState === 'expired') element('p', 'The last code expired.', box);
      if (data.codeState === 'revoked') element('p', 'The last code was revoked.', box);
      action(box, 'Create Private Invitation code', async () => { latest = await api('code', { minutes: 15 }); content.replaceChildren(); showInvitation(await api('invitation')); });
      if (!data.discovery) element('p', 'Needs LAN discovery turned on. The long invitation above works without it.', box);
    }
  }
  function toastError(text) { error.textContent = text; }
  async function hostPage() {
    startPage('host'); const current = generation;
    const [projects, interfaces] = await Promise.all([
      fetch('/api/projects').then(r => { if (!r.ok) throw new Error('Cannot list projects.'); return r.json(); }), api('interfaces')
    ]);
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
    const address = field(form, 'Listen on this interface', 'select');
    interfaces.addresses.forEach(item => { const option = element('option', item.address === '127.0.0.1' ? '127.0.0.1 (this computer only)' : item.address + (item.name ? ' (' + item.name + ')' : ''), address); option.value = item.address; });
    const lan = interfaces.addresses.find(item => item.address !== '127.0.0.1');
    if (lan) address.value = lan.address;
    const port = field(form, 'Port (0 chooses an available port)', 'number', '0'); port.min = '0'; port.max = '65535'; port.required = true;
    const discovery = field(form, 'Advertise on the selected LAN interface', 'checkbox'); discovery.checked = true;
    element('p', 'TLS 1.3 and host approval are mandatory. Only existing Java source is shared. File structure changes are locked during collaboration; firewall access is never changed automatically.', form);
    const submit = element('button', 'Host session', form); submit.type = 'submit';
    form.onsubmit = async event => {
      event.preventDefault(); if (busy) return; busy = true; submit.disabled = true;
      try {
        await window.LarkEditorShare.flush();
        const data = await api('host', { discovery: discovery.checked, project: project.value, name: name.value, displayName: displayName.value, bird: window.LarkBirds.selected(), address: address.value, port: Number(port.value) });
        latest = data; startPage('invitation'); showInvitation(data); await refresh();
      } catch (err) { report(err); } finally { busy = false; submit.disabled = false; }
    };
  }
  function joinPage() {
    startPage('join');
    const form = element('form', null, content);
    const invitation = field(form, 'Lark code (like LARK-K7M2Q9X) or private invitation from the host', 'textarea'); invitation.maxLength = 8192; invitation.required = true;
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
        identity.textContent = `Host: ${data.address}:${data.port} · SHA-256: ${data.fingerprint}`;
      } catch (_) { identity.textContent = 'Invalid invitation. Ask the host for a new private invitation.'; }
    };
    const verified = field(form, 'I verified this invitation and host fingerprint directly with the intended host over a trusted channel.', 'checkbox'); verified.required = true;
    const verifiedRow = verified.closest('label') || verified.parentElement;
    element('p', 'The invitation includes the host IP, port, session identity and certificate fingerprint. A changed or unverified certificate is rejected. Never use an invitation from an unknown sender.', form);
    const submit = element('button', 'Request access', form); submit.type = 'submit';
    form.onsubmit = async event => {
      event.preventDefault(); if (busy) return; busy = true; submit.disabled = true;
      try {
        status.textContent = 'Connecting';
        latest = await api('join', { invitation: invitation.value, displayName: displayName.value, bird: window.LarkBirds.selected(), verified: verified.checked });
        startPage('home'); await refresh();
      } catch (err) { report(err); status.textContent = 'Connection Lost'; }
      finally { busy = false; submit.disabled = false; }
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
      element('span', `${person.status === 'pending' ? 'wants to join' : person.status} · ${person.role} · ${person.connected ? 'Connected' : 'Connection Lost'}${person.file ? ' · ' + person.file + ' · ' + window.LarkShareEditing.position(person) : ''}`, row);
      if (latest.hosting && person.status === 'pending') action(row, 'Approve as Editor', async () => { latest = await api('decide', { device: person.id, approve: true, role: 'editor' }); await refresh(); });
      if (latest.hosting && person.status === 'pending') action(row, 'Approve as Viewer', async () => { latest = await api('decide', { device: person.id, approve: true, role: 'viewer' }); await refresh(); });
      if (person.status === 'approved' && person.id !== latest.identity) action(row, 'Follow ' + person.name, () => { window.LarkShareEditing.follow(person.id); dialog.close(); });
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
      action(form, 'Apply security settings', async () => { latest = await api('security', { role: role.value, minutes: Number(minutes.value), discovery: discovery.checked }); await refresh(); });
      element('p', latest.discoveryError || (latest.discovery ? 'Advertising on the selected interface.' : 'Discovery is off; private invitations still work.'), form);
    }
    if (latest.fingerprint) element('p', 'Host SHA-256: ' + latest.fingerprint, content).className = 'share-fingerprint';
  }
  // Nearby Sessions: rescans every few seconds while open; one card per session id.
  let nearbyTimer = null, nearbyName = '';
  async function nearby() {
    startPage('nearby'); const current = generation;
    element('h3', 'Nearby sessions', content);
    const name = field(content, 'Your display name', 'text', nearbyName); name.oninput = () => { nearbyName = name.value; };
    const bar = element('div', null, content); bar.className = 'share-actions';
    const list = element('div', null, content); element('p', 'Searching the local network…', list);
    const scan = async () => {
      if (page !== 'nearby' || generation !== current) { clearInterval(nearbyTimer); nearbyTimer = null; return; }
      if (busy) return;
      let data; try { data = await api('nearby'); } catch (err) { report(err); return; }
      if (page !== 'nearby' || generation !== current) return;
      drawNearby(list, data.sessions || [], name);
    };
    action(bar, 'Refresh', scan);
    clearInterval(nearbyTimer); nearbyTimer = setInterval(scan, 6000);
    await scan();
  }
  function drawNearby(list, sessions, name) {
    list.replaceChildren();
    if (!sessions.length) {
      element('p', 'No sessions found yet. Make sure the host turned on "Advertise on the selected LAN interface" and both computers are on the same Wi-Fi or wired network.', list);
      element('p', 'School, hotel and guest networks often stop computers from seeing each other. If so, ask the host for a Lark code or the long private invitation.', list);
      return;
    }
    const labels = { available: 'Available', full: 'Full', pending: 'Waiting for host approval', connected: 'Connected', denied: 'Denied by host', unavailable: 'Not answering' };
    sessions.forEach(item => {
      const row = element('div', null, list); row.className = 'share-device share-nearby';
      row.append(window.LarkBirds.make(item.bird, 32));
      const text = element('div', null, row);
      element('strong', item.name || 'Lark session', text);
      element('span', ` ${item.host || 'Host'} · ${item.count || '?'} in session · ${item.address}`, text);
      const badge = element('span', labels[item.status] || item.status, row); badge.className = 'share-status share-status-' + item.status;
      if (item.status === 'available') {
        const btn = action(row, 'Request Access', async () => {
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
      action(content, 'Apply reviewed merge', () => {
        if (window.confirm('Replace the currently opened shared file with this reviewed merge? Other participants will see the resulting edits.')) window.LarkShareEditing.mergeRecovery(draft.key, text.value);
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
  }
  function renderNavigation() {
    const key = JSON.stringify([!!latest.hosting, !!latest.joined, latest.session?.status]);
    if (navigationKey === key) return;
    navigationKey = key;
    navigation.replaceChildren();
    if (!latest.hosting && !latest.joined) {
      action(navigation, 'Host Session', hostPage); action(navigation, 'Join Session', joinPage);
    }
    if (latest.hosting) action(navigation, 'Invitation', async () => { const data = await api('invitation'); startPage('invitation'); showInvitation(data); });
    if (!latest.hosting && !latest.joined) action(navigation, 'Nearby Sessions', nearby);
    action(navigation, 'Choose Your Bird', chooseBird);
    action(navigation, 'Recovery', recovery);
    action(navigation, 'Participants', participants); action(navigation, 'Security', security);
    if (latest.hosting) action(navigation, 'Review Changes', review);
    if (latest.hosting || latest.joined && latest.session?.status === 'approved') action(navigation, 'Shared Project', () => dialog.close());
    if (latest.hosting || latest.joined) action(navigation, latest.hosting ? 'End Session' : 'Leave Session', async () => {
      if (!window.confirm(latest.hosting ? 'End this Share session and revoke all invitations and devices?' : 'Leave this Share session?')) return;
      if (window.LarkShareEditing.pending()) window.LarkShareEditing.exportRecovery();
      latest = await api(latest.hosting ? 'end' : 'leave'); await window.LarkShareEditing.stop(); startPage('home'); await refresh(); home();
    });
    action(navigation, 'Refresh', refresh);
  }
  async function refresh() {
    if (polling) return; polling = true;
    try {
      latest = await api('status');
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
      status.textContent = latest.connection + (latest.session?.name ? ' · ' + latest.session.name : '') + (latest.hosting ? ` · Port ${latest.port} · TLS 1.3` : '');
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
      if (latest.hosting || latest.joined) { if (!timer) timer = setInterval(() => refresh().catch(report), 4000); }
      else if (timer) { clearInterval(timer); timer = null; }
    } finally { polling = false; }
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
        const row = action(explorerPeople, person.name + (person.file ? ' — ' + person.file : ''), () => { window.LarkShareEditing.follow(person.id); unfollow.hidden = false; }); row.prepend(window.LarkBirds.make(person.bird, 24)); row.title = 'Follow participant';
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
  document.addEventListener('lark-share-follow', event => { unfollow.hidden = !event.detail; });
  document.addEventListener('lark-share-state', event => { button.dataset.connection = event.detail; button.title = 'Lark Share: ' + event.detail; });
  document.addEventListener('lark-share-error', event => { error.textContent = event.detail; });
  button.onclick = async () => {
    if (!dialog.open) dialog.showModal();
    try { await refresh(); home(); } catch (err) { report(err); }
  };
  // Reattach to an active backend session after a page reload without waiting
  // for the user to reopen the Share dialog.
  if (window.LarkEditorReady) refresh().catch(report);
  else document.addEventListener('lark-editor-ready', () => refresh().catch(report), { once: true });
})();
