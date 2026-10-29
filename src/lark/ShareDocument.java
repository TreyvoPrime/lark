package lark;

import java.util.*;

/** RGA sequence CRDT over UTF-16 units (CodeMirror offsets). Descending Lamport siblings. */
final class ShareDocument {
    private static final class Node {
        final String id; final char value;
        final TreeSet<String> children = new TreeSet<>(ShareDocument::compare);
        boolean deleted;
        Node(String id, char value) { this.id = id; this.value = value; }
    }
    final String seed;
    private final Map<String, Node> nodes = new HashMap<>();
    private final List<Json.Obj> log = new ArrayList<>();
    private final Map<String, Json.Obj> seen = new HashMap<>();
    private final Map<String, Long> clocks = new HashMap<>();
    private int visible;
    private String cached;

    ShareDocument(String seed) {
        this.seed = seed; this.visible = seed.length(); this.cached = seed;
        nodes.put("", new Node("", '\0'));
        String parent = "";
        for (int i = 0; i < seed.length(); i++) {
            String id = (i + 1) + "@seed";
            nodes.put(id, new Node(id, seed.charAt(i))); nodes.get(parent).children.add(id); parent = id;
        }
    }
    static int compare(String a, String b) {
        int splitA = a.indexOf('@'), splitB = b.indexOf('@');
        int counter = Long.compare(Long.parseLong(b.substring(0, splitB)), Long.parseLong(a.substring(0, splitA)));
        return counter != 0 ? counter : b.substring(splitB + 1).compareTo(a.substring(splitA + 1));
    }
    synchronized int revision() { return log.size(); }
    synchronized int nodeCount() { return nodes.size(); }
    synchronized boolean apply(Json.Obj op, String actor) {
        if (op == null) throw new RequestFail(400, "Missing CRDT operation.");
        long seq = op.longVal("seq");
        String text = op.str("text", ""), after = op.str("after", "");
        Json.Arr removes = op.arr("remove");
        if (!actor.equals(op.str("actor")) || seq < 1 || seq > 2_000_000_000L || text.length() > 512 || removes == null || removes.size() > 128)
            throw new RequestFail(400, "Invalid CRDT operation.");
        String key = seq + "@" + actor;
        Json.Obj duplicate = seen.get(key);
        if (duplicate != null) {
            if (!duplicate.write().equals(op.write())) throw new RequestFail(409, "Operation identity collision. Export local recovery text.");
            return false;
        }
        if (seq <= clocks.getOrDefault(actor, 0L) || !nodes.containsKey(after)) throw new RequestFail(409, "Missing CRDT dependency or stale writer clock.");
        if (log.size() >= 10_000 || nodes.size() + text.length() > 250_000) throw new RequestFail(409, "Document history limit reached. Save, end and rehost; export pending edits first.");
        Set<String> unique = new HashSet<>();
        for (Json.Value value : removes.values()) {
            if (!(value instanceof Json.Str str) || str.value.isEmpty() || !nodes.containsKey(str.value)) throw new RequestFail(400, "Unknown deleted character.");
            unique.add(str.value);
        }
        int deleting = (int) unique.stream().filter(id -> !nodes.get(id).deleted).count();
        if (visible - deleting + text.length() > ShareSession.MAX_FILE) throw new RequestFail(413, "Shared file is too large.");
        // Validate the complete operation before changing state.
        for (int i = 0; i < text.length(); i++) if (nodes.containsKey((seq + i) + "@" + actor)) throw new RequestFail(409, "Character identity collision.");
        for (String id : unique) nodes.get(id).deleted = true;
        String parent = after;
        for (int i = 0; i < text.length(); i++) {
            String id = (seq + i) + "@" + actor;
            nodes.put(id, new Node(id, text.charAt(i))); nodes.get(parent).children.add(id); parent = id;
        }
        visible += text.length() - deleting; cached = null;
        clocks.put(actor, seq + Math.max(1, text.length()) - 1);
        log.add(op); seen.put(key, op); return true;
    }
    synchronized Json.Obj page(long since, boolean opening) {
        if (since < 0 || since > log.size()) throw new RequestFail(409, "Invalid document revision; reopen and reconcile.");
        Json.Arr operations = new Json.Arr();
        int end = Math.min(log.size(), (int) since + (opening ? 4 : 24));
        for (int i = (int) since; i < end; i++) operations.add(log.get(i));
        Json.Obj out = ShareSession.ok().put("operations", operations).put("revision", end).put("head", log.size());
        if (opening) out.put("seed", seed);
        return out;
    }
    synchronized String text() {
        if (cached != null) return cached;
        StringBuilder text = new StringBuilder(visible);
        ArrayDeque<Iterator<String>> stack = new ArrayDeque<>(); stack.push(nodes.get("").children.iterator());
        while (!stack.isEmpty()) {
            if (!stack.peek().hasNext()) { stack.pop(); continue; }
            Node n = nodes.get(stack.peek().next());
            if (!n.deleted) text.append(n.value);
            if (!n.children.isEmpty()) stack.push(n.children.iterator());
        }
        return cached = text.toString();
    }
}
