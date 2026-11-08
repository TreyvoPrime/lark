package lark;

import java.io.*;
import java.nio.file.*;
import java.util.concurrent.*;

/** Owns the Windows RFCOMM bridge process for the lifetime of a Share session. */
final class ShareBluetooth implements AutoCloseable {
    private final Process process;
    private volatile long sentRate = -1, receivedRate = -1;
    final String[] ready;
    private ShareBluetooth(Process process, String[] ready) { this.process = process; this.ready = ready; }
    private void readStats(BufferedReader input) {
        long previousSent = 0, previousReceived = 0, previousTime = System.nanoTime();
        try {
            for (String line; (line = input.readLine()) != null;) {
                String[] parts = line.split(" ");
                if (parts.length != 3 || !parts[0].equals("STATS")) continue;
                try {
                    long sent = Long.parseLong(parts[1]), received = Long.parseLong(parts[2]), now = System.nanoTime();
                    long elapsed = now - previousTime;
                    if (elapsed > 0 && sent >= previousSent && received >= previousReceived) {
                        sentRate = (long) ((sent - previousSent) * 1_000_000_000.0 / elapsed);
                        receivedRate = (long) ((received - previousReceived) * 1_000_000_000.0 / elapsed);
                    }
                    previousSent = sent; previousReceived = received; previousTime = now;
                } catch (NumberFormatException ignored) { }
            }
        } catch (IOException ignored) { }
    }
    long sentRate() { return process.isAlive() ? sentRate : -1; }
    long receivedRate() { return process.isAlive() ? receivedRate : -1; }
    private static Path helper() throws Exception {
        if (!System.getProperty("os.name", "").toLowerCase().contains("windows"))
            throw new RequestFail(503, "Bluetooth Share is currently available on Windows only.");
        Path jar = Paths.get(ShareBluetooth.class.getProtectionDomain().getCodeSource().getLocation().toURI());
        Path helper = findHelper(Updates.installDir(), jar);
        if (helper == null) throw new RequestFail(503, "Bluetooth Share is missing its Windows helper. Install the full Lark Desktop installer or extract the complete Executable package, then restart Lark.");
        return helper;
    }
    static Path findHelper(Path installDir, Path codeLocation) {
        if (installDir != null) {
            Path installed = installDir.resolve("app").resolve("lark-bluetooth.exe");
            if (Files.isRegularFile(installed)) return installed;
            Path portable = installDir.resolve("lark-bluetooth.exe");
            if (Files.isRegularFile(portable)) return portable;
        }
        if (codeLocation != null) {
            Path parent = Files.isDirectory(codeLocation) ? codeLocation : codeLocation.getParent();
            if (parent != null) {
                Path adjacent = parent.resolve("lark-bluetooth.exe");
                if (Files.isRegularFile(adjacent)) return adjacent;
            }
        }
        return null;
    }
    static Json.Arr discover() throws Exception {
        Process process = new ProcessBuilder(helper().toString(), "discover").redirectErrorStream(true).start();
        try {
            if (!process.waitFor(15, TimeUnit.SECONDS)) throw new IOException("Bluetooth scan timed out.");
            String result = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            if (process.exitValue() != 0) throw new IOException(result.trim());
            Json.Value value = Json.parse(result);
            if (!(value instanceof Json.Arr devices)) throw new IOException("Invalid Bluetooth scan result.");
            return devices;
        } finally { process.destroyForcibly(); }
    }
    static void pair(String address) throws Exception {
        if (!address.matches("[a-fA-F0-9]{12}")) throw new RequestFail(400, "Invalid Bluetooth device address.");
        Process process = new ProcessBuilder(helper().toString(), "pair", address).redirectErrorStream(true).start();
        try {
            if (!process.waitFor(90, TimeUnit.SECONDS)) throw new IOException("Bluetooth pairing timed out.");
            String result = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8).trim();
            if (process.exitValue() != 0 || !result.equals("PAIRED")) throw new IOException(result.isBlank() ? "Bluetooth pairing failed." : result);
        } finally { process.destroyForcibly(); }
    }
    static ShareBluetooth start(String... args) throws Exception {
        Path helper = helper();
        java.util.ArrayList<String> command = new java.util.ArrayList<>(); command.add(helper.toString());
        java.util.Collections.addAll(command, args);
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        ExecutorService reader = Executors.newSingleThreadExecutor(ShareTransport.daemon("lark-bluetooth-start"));
        try {
            BufferedReader input = new BufferedReader(new InputStreamReader(process.getInputStream(), java.nio.charset.StandardCharsets.UTF_8));
            Future<String> line = reader.submit(input::readLine);
            String result = line.get(10, TimeUnit.SECONDS);
            if (result == null || !result.startsWith("READY ")) throw new IOException(result == null ? "Bluetooth helper stopped." : result);
            ShareBluetooth bridge = new ShareBluetooth(process, result.split(" "));
            ShareTransport.daemon("lark-bluetooth-stats").newThread(() -> bridge.readStats(input)).start();
            return bridge;
        } catch (Exception e) { process.destroyForcibly(); throw new RequestFail(503, "Couldn't start Bluetooth Share: " + (e.getMessage() == null ? "try again" : e.getMessage())); }
        finally { reader.shutdownNow(); }
    }
    public void close() { process.destroyForcibly(); }
}
