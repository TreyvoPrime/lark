/* Lark Share milestone 1. Read-only snapshots; no editor/save interception. */
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
  element('p', 'Preview · Secure, read-only Java source snapshots. Live editing and nearby discovery are not implemented yet.', dialog);
  const status = element('p', 'Disconnected', dialog); status.setAttribute('role', 'status');
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
      if (busy) return;
      busy = true; node.disabled = true; error.textContent = '';
      try { await run(); } catch (err) { report(err); }
      finally { busy = false; node.disabled = false; }
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
  function startPage(next) { page = next; generation++; content.replaceChildren(); error.textContent = ''; }
  function showInvitation(data) {
    element('p', 'Send this private invitation to the intended participant over a trusted channel. Verify its fingerprint directly with the host. Anyone holding it can request approval. End the session to invalidate it.', content);
    const invite = field(content, 'Private invitation', 'textarea', data.invitation); invite.readOnly = true;
    action(content, 'Copy invitation', () => navigator.clipboard.writeText(data.invitation));
    element('p', 'SHA-256: ' + data.fingerprint, content).className = 'share-fingerprint';
  }
  async function hostPage() {
    startPage('host'); const current = generation;
    const [projects, interfaces] = await Promise.all([
      fetch('/api/projects').then(r => { if (!r.ok) throw new Error('Cannot list projects.'); return r.json(); }), api('interfaces')
    ]);
    if (current !== generation) return;
    const form = element('form', null, content);
    const project = field(form, 'Project to snapshot', 'select');
    (projects.projects || []).forEach(p => { const option = element('option', p.name, project); option.value = p.id; });
    const selected = $('project-pick-label')?.textContent;
    const match = (projects.projects || []).find(p => p.name === selected);
    if (match) project.value = match.id;
    const name = field(form, 'Session name', 'text', match?.name || projects.projects?.[0]?.name || 'Java source review'); name.required = true;
    project.onchange = () => { name.value = project.selectedOptions[0]?.textContent || ''; };
    const displayName = field(form, 'Your display name'); displayName.required = true;
    const address = field(form, 'Listen on this interface', 'select');
    interfaces.addresses.forEach(item => { const option = element('option', item.address === '127.0.0.1' ? '127.0.0.1 (this computer only)' : item.address, address); option.value = item.address; });
    const lan = interfaces.addresses.find(item => item.address !== '127.0.0.1');
    if (lan) address.value = lan.address;
    const port = field(form, 'Port (0 chooses an available port)', 'number', '0'); port.min = '0'; port.max = '65535'; port.required = true;
    element('p', 'TLS 1.3 and host approval are mandatory. Approved devices are Viewers. Snapshot only: save your project first; later edits are not shared. Only existing, non-hidden Java source is included (96 KiB/file, 16 MiB/session). Firewall access is never changed automatically.', form);
    const submit = element('button', 'Host read-only session', form); submit.type = 'submit';
    form.onsubmit = async event => {
      event.preventDefault(); if (busy) return; busy = true; submit.disabled = true;
      try {
        const data = await api('host', { project: project.value, name: name.value, displayName: displayName.value, address: address.value, port: Number(port.value) });
        latest = data; startPage('invitation'); showInvitation(data); await refresh();
      } catch (err) { report(err); } finally { busy = false; submit.disabled = false; }
    };
  }
  function joinPage() {
    startPage('join');
    const form = element('form', null, content);
    const invitation = field(form, 'Private invitation from the host', 'textarea'); invitation.maxLength = 2048; invitation.required = true;
    const displayName = field(form, 'Your display name'); displayName.required = true;
    const identity = element('p', 'Paste the invitation to inspect the host identity before connecting.', form);
    identity.className = 'share-fingerprint';
    invitation.oninput = () => {
      try {
        if (invitation.value.length > 2048) throw new Error();
        const data = JSON.parse(atob(invitation.value.trim().replace(/-/g, '+').replace(/_/g, '/')));
        if (!/^[a-f0-9]{64}$/i.test(data.fingerprint) || typeof data.address !== 'string' || data.address.length > 64) throw new Error();
        identity.textContent = `Host: ${data.address}:${data.port} · SHA-256: ${data.fingerprint}`;
      } catch (_) { identity.textContent = 'Invalid invitation. Ask the host for a new private invitation.'; }
    };
    const verified = field(form, 'I verified this invitation and host fingerprint directly with the intended host over a trusted channel.', 'checkbox'); verified.required = true;
    element('p', 'The invitation includes the host IP, port, session identity and certificate fingerprint. A changed or unverified certificate is rejected. Never use an invitation from an unknown sender.', form);
    const submit = element('button', 'Request access', form); submit.type = 'submit';
    form.onsubmit = async event => {
      event.preventDefault(); if (busy) return; busy = true; submit.disabled = true;
      try {
        status.textContent = 'Connecting';
        latest = await api('join', { invitation: invitation.value.trim(), displayName: displayName.value, verified: verified.checked });
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
    list.forEach(person => {
      const row = element('div', null, content); row.className = 'share-device';
      element('strong', person.name, row);
      element('span', `${person.status} · Viewer`, row);
      if (latest.hosting && person.status === 'pending') action(row, 'Approve as Viewer', async () => { latest = await api('decide', { device: person.id, approve: true }); await refresh(); });
      if (latest.hosting && person.status !== 'revoked') action(row, person.status === 'pending' ? 'Reject' : 'Revoke access', async () => { latest = await api('decide', { device: person.id, approve: false }); await refresh(); });
    });
  }
  function security() {
    startPage('security');
    element('h3', 'Connection security', content);
    [ 'Encryption: TLS 1.3, always enabled.', 'Authentication: pinned SHA-256 host certificate and random session/device credentials.',
      'Host approval: always required. Permission: Viewer only in this milestone.',
      'Discovery: not available. Invitations provide manual LAN connection.',
      'Expiration: 30 minutes without authenticated participant activity, or 8 hours maximum. New sessions use new identities and credentials.',
      'Access: an immutable snapshot of this project’s Java files. No writes, execution, terminal, settings, dependency installation or unrelated project access.',
      'Revoke a device in Participants. End the session to invalidate every invitation and device.'
    ].forEach(text => element('p', text, content));
    if (latest.fingerprint) element('p', 'Host SHA-256: ' + latest.fingerprint, content).className = 'share-fingerprint';
  }
  async function files() {
    startPage('files'); const current = generation;
    const data = await api('files'); if (current !== generation) return;
    element('h3', 'Shared Java source snapshot', content);
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
    element('p', latest.hosting ? 'Hosting a read-only snapshot. Open Participants to approve or revoke devices.' : latest.joined ? 'Joined a pinned host. Open Shared Source after the host approves access.' : 'Host a saved Java project, or join using a private invitation.', content);
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
    action(navigation, 'Participants', participants); action(navigation, 'Security', security);
    if (latest.joined && latest.session?.status === 'approved') action(navigation, 'Shared Source', files);
    if (latest.hosting || latest.joined) action(navigation, latest.hosting ? 'End Session' : 'Leave Session', async () => {
      if (!window.confirm(latest.hosting ? 'End this Share session and revoke all invitations and devices?' : 'Leave this Share session?')) return;
      latest = await api(latest.hosting ? 'end' : 'leave'); startPage('home'); await refresh(); home();
    });
    action(navigation, 'Refresh', refresh);
  }
  async function refresh() {
    if (polling) return; polling = true;
    try {
      latest = await api('status');
      const pending = latest.session?.participants?.filter(p => p.status === 'pending').length || 0;
      button.textContent = 'Share' + (pending ? ` (${pending} requests)` : latest.hosting || latest.joined ? ' •' : '');
      button.title = 'Lark Share: ' + latest.connection;
      status.textContent = latest.connection + (latest.session?.name ? ' · ' + latest.session.name : '') + (latest.hosting ? ` · Port ${latest.port} · TLS 1.3` : '');
      if (latest.error) error.textContent = latest.error;
      else if (!busy) error.textContent = '';
      renderNavigation();
      // Do not replace focused controls while a keyboard user is interacting.
      if (page === 'participants' && !content.contains(document.activeElement)) drawParticipants();
      if (latest.hosting || latest.joined) { if (!timer) timer = setInterval(() => refresh().catch(report), 4000); }
      else if (timer) { clearInterval(timer); timer = null; }
    } finally { polling = false; }
  }
  button.onclick = async () => {
    if (!dialog.open) dialog.showModal();
    try { await refresh(); home(); } catch (err) { report(err); }
  };
})();
