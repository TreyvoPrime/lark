package lark;
import java.nio.file.*;
/** Ensures a child that stops reading cannot block input calls or cancellation. */
public final class TerminalCancellationCheck {
  public static void main(String[] args) throws Exception {
    if (args.length != 0) { System.out.println("PROCESS_STARTED"); System.out.flush(); Thread.sleep(30000); return; }
    Path dir = Files.createTempDirectory("lark-cancel-"); Terminal terminal = new Terminal();
    String id = terminal.start(dir).str("id");
    try {
      String javaExe = Path.of(System.getProperty("java.home"), "bin", System.getProperty("os.name").toLowerCase().contains("win") ? "java.exe" : "java").toString();
      String classes = java.util.Arrays.stream(System.getProperty("java.class.path").split(java.util.regex.Pattern.quote(java.io.File.pathSeparator)))
              .map(entry -> Path.of(entry).toAbsolutePath().toString()).collect(java.util.stream.Collectors.joining(java.io.File.pathSeparator));
      terminal.write(id, "\"" + javaExe + "\" -cp \"" + classes + "\" lark.TerminalCancellationCheck child", false);
      long deadline = System.nanoTime() + 10_000_000_000L;
      while (!terminal.snapshot(id).str("output", "").contains("PROCESS_STARTED")) { if (System.nanoTime() > deadline) throw new AssertionError("child did not start"); Thread.sleep(20); }
      String input = "x".repeat(20000); long start = System.nanoTime(); boolean full = false;
      for (int i = 0; i < 64; i++) try { terminal.write(id, input, true); } catch (RequestFail e) { if (e.status != 429) throw e; full = true; break; }
      if (!full || System.nanoTime() - start > 2_000_000_000L) throw new AssertionError("input queue did not remain responsive and bounded");
      start = System.nanoTime(); terminal.stop(id);
      if (System.nanoTime() - start > 4_000_000_000L) throw new AssertionError("cancellation stalled");
      System.out.println("Terminal cancellation and bounded input passed");
    } finally { terminal.shutdown(); }
  }
}
