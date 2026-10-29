/* RGA wire protocol v2. UTF-16 matches CodeMirror; no clock or network dependency. */
(function (root) {
  'use strict';
  class Document {
    constructor(seed) {
      this.seed = seed; this.nodes = new Map([['', { id: '', value: '', children: [], deleted: true }]]);
      this.seen = new Set(); this.clock = seed.length; this.cache = null;
      let parent = '';
      for (let i = 0; i < seed.length; i++) { const id = `${i + 1}@seed`; this.nodes.set(id, { id, value: seed[i], children: [], deleted: false }); this.nodes.get(parent).children.push(id); parent = id; }
    }
    static compare(a, b) {
      const [ac, aa] = a.split('@'), [bc, ba] = b.split('@');
      return Number(bc) - Number(ac) || (ba < aa ? -1 : ba > aa ? 1 : 0);
    }
    apply(op) {
      const key = `${op.seq}@${op.actor}`;
      if (this.seen.has(key)) return false;
      if (!this.nodes.has(op.after)) throw new Error('Missing shared document dependency. Export recovery before leaving.');
      for (const id of op.remove) if (!this.nodes.has(id)) throw new Error('Unknown shared character.');
      op.remove.forEach(id => { this.nodes.get(id).deleted = true; });
      let parent = op.after;
      for (let i = 0; i < op.text.length; i++) {
        const id = `${op.seq + i}@${op.actor}`;
        this.nodes.set(id, { id, value: op.text[i], children: [], deleted: false });
        const children = this.nodes.get(parent).children; children.push(id); children.sort(Document.compare); parent = id;
      }
      this.clock = Math.max(this.clock, op.seq + Math.max(1, op.text.length) - 1);
      this.seen.add(key); this.cache = null; return true;
    }
    visible() {
      if (this.cache) return this.cache;
      const ids = [], all = [], text = [], stack = [this.nodes.get('').children[Symbol.iterator]()];
      while (stack.length) {
        const item = stack[stack.length - 1].next();
        if (item.done) { stack.pop(); continue; }
        const n = this.nodes.get(item.value); all.push(n.id);
        if (!n.deleted) { ids.push(n.id); text.push(n.value); }
        if (n.children.length) stack.push(n.children[Symbol.iterator]());
      }
      return this.cache = { ids, all, text: text.join('') };
    }
    text() { return this.visible().text; }
    anchor(index) { return index > 0 ? this.visible().ids[Math.min(index, this.visible().ids.length) - 1] : ''; }
    index(anchor) {
      if (!anchor) return 0;
      const data = this.visible(); let position = 0;
      for (const id of data.all) { if (!this.nodes.get(id).deleted) position++; if (id === anchor) return position; }
      return Math.min(position, data.ids.length);
    }
    edit(start, count, text, actor) {
      const data = this.visible(), remove = data.ids.slice(start, start + count), after = this.anchor(start), operations = [];
      // Delete by stable identity, then insert bounded runs. Ordered and retry-idempotent.
      for (let i = 0; i < remove.length; i += 128) {
        const op = { seq: ++this.clock, actor, after, text: '', remove: remove.slice(i, i + 128) }; this.apply(op); operations.push(op);
      }
      let parent = after;
      for (let i = 0; i < text.length; i += 512) {
        const part = text.slice(i, i + 512), seq = this.clock + 1;
        const op = { seq, actor, after: parent, text: part, remove: [] }; this.apply(op); operations.push(op); parent = `${seq + part.length - 1}@${actor}`;
      }
      return operations;
    }
  }
  if (typeof module !== 'undefined') module.exports = Document;
  else root.LarkShareDocument = Document;
})(typeof window !== 'undefined' ? window : globalThis);
