package lark;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.function.Supplier;

/** Minimal DNS-SD PTR/SRV/TXT/A responder. Discovery is untrusted metadata, never authorization. */
final class ShareDiscovery implements AutoCloseable {
    static final String SERVICE = "_larkshare._tcp.local.";
    private static final InetAddress GROUP;
    static { try { GROUP = InetAddress.getByName("224.0.0.251"); } catch (Exception e) { throw new ExceptionInInitializerError(e); } }
    private final MulticastSocket socket;
    private final NetworkInterface network;
    private final Supplier<Json.Obj> metadata;
    private final InetAddress address;
    private final int port;
    private final String instance;
    private volatile boolean closed;

    ShareDiscovery(InetAddress address, int port, String session, Supplier<Json.Obj> metadata) throws IOException {
        this.address = address; this.port = port; this.metadata = metadata;
        this.instance = "Lark-" + session.substring(0, 12) + "." + SERVICE;
        network = NetworkInterface.getByInetAddress(address);
        if (network == null || !network.supportsMulticast()) throw new IOException("This interface does not support multicast discovery.");
        socket = multicast(network);
        try { send(answer(instance, address, port, metadata.get(), 120)); }
        catch (Exception e) { socket.close(); throw new IOException("Could not advertise Share on this interface.", e); }
        ShareTransport.daemon("lark-share-mdns").newThread(this::listen).start();
    }
    private static MulticastSocket multicast(NetworkInterface network) throws IOException {
        MulticastSocket socket = new MulticastSocket(null);
        try {
            socket.setReuseAddress(true); socket.bind(new InetSocketAddress(5353));
            socket.setNetworkInterface(network); socket.setTimeToLive(255); socket.setSoTimeout(500);
            socket.joinGroup(new InetSocketAddress(GROUP, 5353), network); return socket;
        } catch (IOException e) { socket.close(); throw e; }
    }
    private void send(byte[] bytes) throws IOException { socket.send(new DatagramPacket(bytes, bytes.length, GROUP, 5353)); }
    private void listen() {
        long last = System.currentTimeMillis(), lastResponse = 0;
        while (!closed) {
            try {
                DatagramPacket packet = new DatagramPacket(new byte[4096], 4096); socket.receive(packet);
                if (packet.getLength() < 12 || packet.getLength() > 4000) continue;
                byte[] data = Arrays.copyOf(packet.getData(), packet.getLength());
                if ((data[2] & 0x80) == 0 && queryForService(data) && System.currentTimeMillis() - lastResponse > 500) {
                    send(answer(instance, address, port, metadata.get(), 120)); lastResponse = System.currentTimeMillis();
                }
            } catch (SocketTimeoutException ignored) { }
            catch (Exception ignored) { /* A malformed multicast datagram cannot affect the IDE. */ }
            if (System.currentTimeMillis() - last > 60_000 && !closed) {
                try { send(answer(instance, address, port, metadata.get(), 120)); } catch (Exception ignored) { }
                last = System.currentTimeMillis();
            }
        }
    }
    static Json.Arr nearby(InetAddress address) throws IOException {
        NetworkInterface network = NetworkInterface.getByInetAddress(address);
        if (network == null || !network.supportsMulticast()) throw new IOException("LAN discovery is unavailable on this interface. Use a private invitation.");
        Map<String, Json.Obj> found = new LinkedHashMap<>();
        try (MulticastSocket socket = multicast(network)) {
            byte[] query = query(); long end = System.currentTimeMillis() + 1800, next = 0;
            int packets = 0;
            while (System.currentTimeMillis() < end && packets < 200 && found.size() < 32) {
                if (System.currentTimeMillis() >= next) { socket.send(new DatagramPacket(query, query.length, GROUP, 5353)); next = System.currentTimeMillis() + 600; }
                try {
                    DatagramPacket packet = new DatagramPacket(new byte[4096], 4096); socket.receive(packet); packets++;
                    for (Json.Obj item : parse(Arrays.copyOf(packet.getData(), packet.getLength()))) found.put(item.str("instance"), item);
                } catch (SocketTimeoutException ignored) { }
                catch (RuntimeException | IOException ignored) { }
            }
        }
        Json.Arr list = new Json.Arr(); found.values().forEach(list::add); return list;
    }
    static byte[] query() throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(); DataOutputStream out = new DataOutputStream(bytes);
        out.writeShort(0); out.writeShort(0); out.writeShort(1); out.writeShort(0); out.writeShort(0); out.writeShort(0);
        name(out, SERVICE); out.writeShort(12); out.writeShort(1); return bytes.toByteArray();
    }
    static boolean queryForService(byte[] bytes) throws IOException {
        Reader reader = new Reader(bytes); reader.at = 4; int questions = reader.u16(); reader.at = 12;
        if (questions > 16) return false;
        for (int i = 0; i < questions; i++) { String name = reader.name(); int type = reader.u16(); reader.u16(); if (SERVICE.equalsIgnoreCase(name) && (type == 12 || type == 255)) return true; }
        return false;
    }
    private static void name(DataOutputStream out, String name) throws IOException {
        for (String label : name.split("\\.")) { byte[] b = label.getBytes(StandardCharsets.UTF_8); if (b.length > 63) throw new IOException("Invalid DNS name."); out.writeByte(b.length); out.write(b); }
        out.writeByte(0);
    }
    private static byte[] named(String text) throws IOException { ByteArrayOutputStream bytes = new ByteArrayOutputStream(); name(new DataOutputStream(bytes), text); return bytes.toByteArray(); }
    private static void record(DataOutputStream out, String owner, int type, byte[] data, int ttl) throws IOException {
        name(out, owner); out.writeShort(type); out.writeShort(type == 12 ? 1 : 0x8001); out.writeInt(ttl); out.writeShort(data.length); out.write(data);
    }
    static byte[] answer(String instance, InetAddress address, int port, Json.Obj metadata, int ttl) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(); DataOutputStream out = new DataOutputStream(bytes);
        out.writeShort(0); out.writeShort(0x8400); out.writeShort(0); out.writeShort(4); out.writeShort(0); out.writeShort(0);
        String hostname = instance.substring(0, instance.indexOf('.')).toLowerCase(Locale.ROOT) + ".local.";
        record(out, SERVICE, 12, named(instance), ttl);
        ByteArrayOutputStream srvBytes = new ByteArrayOutputStream(); DataOutputStream srv = new DataOutputStream(srvBytes);
        srv.writeShort(0); srv.writeShort(0); srv.writeShort(port); name(srv, hostname); record(out, instance, 33, srvBytes.toByteArray(), ttl);
        ByteArrayOutputStream txt = new ByteArrayOutputStream();
        for (String field : List.of("version=" + ShareSession.VERSION, "name=" + metadata.str("name", "Lark"), "host=" + metadata.str("host", "Host"), "approval=true", "count=" + metadata.longVal("count"), "status=" + metadata.str("status", "available"))) {
            byte[] text = field.getBytes(StandardCharsets.UTF_8); if (text.length > 255) continue; txt.write(text.length); txt.write(text);
        }
        record(out, instance, 16, txt.toByteArray(), ttl); record(out, hostname, 1, address.getAddress(), ttl); return bytes.toByteArray();
    }
    static List<Json.Obj> parse(byte[] bytes) throws IOException {
        if (bytes.length < 12 || bytes.length > 4096 || (bytes[2] & 0x80) == 0) return List.of();
        Reader r = new Reader(bytes); r.at = 4; int q = r.u16(), count = r.u16() + r.u16() + r.u16();
        if (q > 16 || count > 64) throw new IOException("Too many DNS records.");
        for (int i = 0; i < q; i++) { r.name(); r.u16(); r.u16(); }
        Set<String> advertised = new HashSet<>(); Map<String, Json.Obj> instances = new HashMap<>(); Map<String, String> addresses = new HashMap<>();
        for (int i = 0; i < count; i++) {
            String owner = r.name(); int type = r.u16(); r.u16(); long ttl = r.u32(); int length = r.u16(), end = r.at + length; r.require(length);
            if (ttl == 0) { r.at = end; continue; }
            if (type == 12 && SERVICE.equalsIgnoreCase(owner)) advertised.add(r.name());
            else if (type == 33 && owner.endsWith("." + SERVICE)) {
                r.u16(); r.u16(); int port = r.u16(); String host = r.name();
                instances.computeIfAbsent(owner, k -> new Json.Obj().put("instance", k)).put("port", port).put("target", host);
            } else if (type == 16 && owner.endsWith("." + SERVICE)) {
                Json.Obj item = instances.computeIfAbsent(owner, k -> new Json.Obj().put("instance", k));
                while (r.at < end) { int n = r.u8(); if (r.at + n > end) throw new IOException("Truncated TXT."); String text = new String(bytes, r.at, n, StandardCharsets.UTF_8); r.at += n;
                    int split = text.indexOf('='); if (split > 0 && Set.of("name", "host", "version", "approval", "count", "status").contains(text.substring(0, split))) item.put(text.substring(0, split), text.substring(split + 1)); }
            } else if (type == 1 && length == 4) addresses.put(owner, InetAddress.getByAddress(Arrays.copyOfRange(bytes, r.at, end)).getHostAddress());
            if (r.at > end) throw new IOException("Invalid DNS record length."); r.at = end;
        }
        List<Json.Obj> out = new ArrayList<>();
        for (String instance : advertised) {
            Json.Obj item = instances.get(instance); if (item == null || !addresses.containsKey(item.str("target"))) continue;
            String address = addresses.get(item.str("target"));
            try { ShareTransport.lanAddress(address); } catch (Exception e) { continue; }
            out.add(item.put("address", address));
        }
        return out;
    }
    private static final class Reader {
        final byte[] bytes; int at;
        Reader(byte[] bytes) { this.bytes = bytes; }
        void require(int n) throws IOException { if (n < 0 || at + n > bytes.length) throw new IOException("Truncated DNS packet."); }
        int u8() throws IOException { require(1); return bytes[at++] & 255; }
        int u16() throws IOException { return (u8() << 8) | u8(); }
        long u32() throws IOException { return ((long) u16() << 16) | u16(); }
        String name() throws IOException {
            StringBuilder name = new StringBuilder(); int jumps = 0, saved = -1;
            while (true) {
                int n = u8(); if (n == 0) break;
                if ((n & 0xc0) == 0xc0) { int pointer = ((n & 63) << 8) | u8(); if (++jumps > 16 || pointer >= bytes.length) throw new IOException("Invalid DNS compression."); if (saved < 0) saved = at; at = pointer; continue; }
                if (n > 63) throw new IOException("Invalid DNS label."); require(n); name.append(new String(bytes, at, n, StandardCharsets.UTF_8)).append('.'); at += n;
                if (name.length() > 255) throw new IOException("DNS name too long.");
            }
            if (saved >= 0) at = saved; return name.toString();
        }
    }
    @Override public void close() {
        if (closed) return; closed = true;
        try { send(answer(instance, address, port, metadata.get(), 0)); } catch (Exception ignored) { }
        socket.close();
    }
}
