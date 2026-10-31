/* Paired HTTPS browser -> independent guest bridge -> pinned TLS desktop host. */
(() => {
  const $ = id => document.getElementById(id);
  const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
  let joined = false, busy = false, timer = null, generation = 0;
  const message = text => { $('share-status').textContent = text; };
  async function request(action, body = {}) {
    const response = await fetch('/api/mobile/share', {method:'POST',headers:{'Content-Type':'application/json','X-Lark':'1','X-Lark-Share-Client':key},body:JSON.stringify({action,...body})});
    const data = await response.json();
    if (!response.ok || !data.ok) { const error = new Error(data.error || 'Share request failed'); error.code = response.status; throw error; }
    return data;
  }
  async function poll() {
    if (!joined || busy) return;
    busy = true; const token = generation;
    try {
      const data = await request('status'); if (generation !== token) return;
      message(data.error || data.connection);
      if (data.session?.status === 'approved') {
        if (!window.LarkShareEditing.sessionActive()) await window.LarkShareEditing.start({id:data.sessionId,identity:data.identity,hosting:false,name:data.session.name});
        if (generation !== token) return;
        window.LarkShareEditing.updateRole(data.session.role);
      } else if (window.LarkShareEditing.sessionActive()) {
        // Retain pending operations for recovery but stop accepting local edits.
        window.LarkShareEditing.updateRole('viewer');
      }
    } catch (error) { if (generation === token) message('Reconnecting · ' + error.message); }
    finally { busy = false; }
  }
  function recoveries() {
    const select = $('share-recovery'); select.replaceChildren();
    for (const saved of window.LarkShareEditing.recoveries()) {
      const option = document.createElement('option'); option.value = saved.key;
      option.textContent = saved.path + ' · ' + new Date(saved.at).toLocaleString(); select.appendChild(option);
    }
  }
  $('share-restore').onclick = () => {
    try {
      const key = $('share-recovery').value;
      const saved = window.LarkShareEditing.recoveries().find(item => item.key === key);
      if (!saved) return message('No saved recovery draft.');
      if (!confirm('Replace the current shared file with this saved draft? Review it before running.')) return;
      window.LarkShareEditing.mergeRecovery(key, saved.text); recoveries();
    } catch (error) { message(error.message); }
  };
  recoveries();
  window.LarkMobileShare = {request};
  $('share-test').onclick = async () => {
    try { const data = await request('test',{invitation:$('share-invitation').value.trim()});message(data.message); }
    catch(error) { message(error.message); }
  };
  $('share-join').onclick = async () => {
    if (joined) return message('Leave your current session before joining another.');
    $('share-join').disabled = true; const token = ++generation;
    try {
      await window.LarkEditorShare.flush();
      if (generation !== token) return;
      await request('join',{invitation:$('share-invitation').value.trim(),displayName:$('share-name').value,verified:$('share-verified').checked});
      if (generation !== token) { await request('leave'); return; }
      joined = true; $('share-invitation').value = ''; $('share-verified').checked = false;
      timer = setInterval(poll,1500); await poll();
    } catch(error) { message(error.message); }
    finally { $('share-join').disabled = false; }
  };
  $('share-leave').onclick = async () => {
    ++generation; joined = false; clearInterval(timer);
    await window.LarkShareEditing.stop(); recoveries();
    try { await request('leave');message('Disconnected'); } catch(error) {message(error.message);}
  };
  $('share-export').onclick = () => window.LarkShareEditing.exportRecovery();
  document.addEventListener('lark-share-summary', event => {
    const d=event.detail;message(`${d.connection} · ${d.pending} pending · ${d.collaborators} connected · ${d.role}`);
  });
  document.addEventListener('lark-share-presence', event => {
    $('share-presence').textContent=event.detail.filter(p=>p.connected).map(p=>`${p.name} (${p.role})`).join(', ');
  });
  document.addEventListener('lark-share-error', event => message(event.detail));
})();
