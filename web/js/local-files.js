/* Browser-owned filesystem handles keep local test builds on the visible desktop. */
(() => {
  const cache = new Map();
  const versions = new Map();
  function database() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("lark-local-files", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("projects");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function record(id, value) {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("projects", value ? "readwrite" : "readonly");
        const req = value ? tx.objectStore("projects").put(value, id) : tx.objectStore("projects").get(id);
        tx.oncomplete = () => resolve(value || req.result || null);
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  async function get(id) {
    if (!cache.has(id)) cache.set(id, await record(id));
    return cache.get(id);
  }
  async function permission(entry) {
    if (await entry.handle.queryPermission({mode:"readwrite"}) === "granted") return;
    if (await entry.handle.requestPermission({mode:"readwrite"}) !== "granted") throw new Error("Allow access to the selected file or folder to continue.");
  }
  async function fileHandle(entry, path, create) {
    if (entry.handle.kind === "file") {
      if (path !== entry.handle.name) throw new Error("Only the selected file belongs to this workspace.");
      return entry.handle;
    }
    const parts = path.split("/");
    if (parts.some(p => !p || p === "." || p === ".." || p.includes("\\"))) throw new Error("Invalid file path.");
    let dir = entry.handle;
    for (const part of parts.slice(0,-1)) dir = await dir.getDirectoryHandle(part,{create});
    return dir.getFileHandle(parts.at(-1),{create});
  }
  async function write(id, entry, path, content) {
    await permission(entry);
    const handle = await fileHandle(entry,path,true);
    const before = await handle.getFile();
    const key = id + "/" + path;
    const old = versions.get(key);
    if (!old && before.size > 0) throw new Error(path + " already exists. Reopen the project before changing it.");
    if (old && (old.size !== before.size || old.lastModified !== before.lastModified)) throw new Error(path + " changed outside Lark. Reopen the project before saving to avoid overwriting it.");
    const stream = await handle.createWritable();
    try { await stream.write(content); await stream.close(); }
    catch(error) { try { await stream.abort(); } catch(_) {} throw error; }
    const saved = await handle.getFile();
    versions.set(key,{size:saved.size,lastModified:saved.lastModified});
  }
  async function attach(id, handle, initialFiles) {
    const entry = {handle};
    await permission(entry);
    for (const file of initialFiles || []) await write(id,entry,file.path,file.content);
    await record(id,entry); cache.set(id,entry);
  }
  async function read(id, entry) {
    await permission(entry);
    const files = [];
    async function visit(handle,prefix) {
      if (handle.kind === "file") {
        const f = await handle.getFile();
        if (f.size > 20000000) throw new Error(f.name + " exceeds the 20 MB limit.");
        const content = await f.text();
        if (content.includes("\0")) return;
        const path = prefix || handle.name;
        files.push({path,content});
        versions.set(id + "/" + path,{size:f.size,lastModified:f.lastModified});
      } else {
        for await (const [name,child] of handle.entries()) {
          if (name.startsWith(".") || ["node_modules","build","out","bin"].includes(name)) continue;
          await visit(child,prefix ? prefix + "/" + name : name);
          if (files.length > 200) throw new Error("This folder has more than 200 text files.");
        }
      }
    }
    await visit(entry.handle,"");
    return files;
  }
  async function before(method,url,body) {
    const match = /^\/api\/projects\/([^/]+)(?:\/(.*))?$/.exec(url.split("?")[0]);
    if (!match) return null;
    const id=decodeURIComponent(match[1]), entry=await get(id);
    if (!entry) return null;
    if (method === "DELETE" && !match[2]) {
      await permission(entry);
      if (typeof entry.handle.remove !== "function") throw new Error("This browser cannot delete the selected folder. Delete it in File Explorer, then remove the project in Lark.");
      await entry.handle.remove({recursive: true});
    }
    else if (method === "PUT" && match[2] === "file") await write(id,entry,body.path,body.content);
    else if (method === "POST" && match[2] === "mkdir") {
      await permission(entry);
      if (entry.handle.kind !== "directory") throw new Error("Open a folder project to add folders.");
      let dir = entry.handle;
      for (const part of body.path.split("/")) {
        if (!part || part === "." || part === ".." || part.includes("\\")) throw new Error("Invalid folder path.");
        dir = await dir.getDirectoryHandle(part,{create:true});
      }
    } else if (method !== "GET" && !(method === "PUT" && !match[2])) {
      throw new Error("Use File Explorer to rename or delete linked files, then reopen the project.");
    }
    return {id,entry};
  }
  window.LarkLocalFiles={get,attach,read,before};
})();
