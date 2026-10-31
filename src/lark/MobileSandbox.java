package lark;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** Fail-closed Linux process isolation for Java tools invoked by a LAN Mobile host. */
final class MobileSandbox {
    static boolean required() {
        return Mobile.isMobile() && (Mobile.lanEnabled() || Boolean.getBoolean("lark.mobile.isolate"));
    }
    static void configure(ProcessBuilder builder) throws IOException {
        if (!required()) return;
        if (!System.getProperty("os.name", "").toLowerCase(java.util.Locale.ROOT).contains("linux")
                || !Files.isExecutable(Path.of("/usr/bin/bwrap")) || !Files.isExecutable(Path.of("/usr/bin/prlimit")))
            throw new IOException("Remote Java execution requires a Linux host with bubblewrap and util-linux. Editing and Share remain available; local-only hosts can run trusted code directly.");
        Path project = builder.directory().toPath().toRealPath();
        Path jdk = Path.of(System.getProperty("java.home")).toRealPath();
        List<String> args = new ArrayList<>(List.of("/usr/bin/prlimit", "--as=4294967296", "--cpu=60", "--nproc=256", "--nofile=256", "--fsize=134217728", "--",
                "/usr/bin/bwrap", "--unshare-all", "--die-with-parent", "--new-session", "--cap-drop", "ALL",
                "--ro-bind", "/usr", "/usr"));
        for (String path : List.of("/lib", "/lib64", "/etc/ld.so.cache", "/etc/java-17-openjdk", "/etc/java-21-openjdk"))
            if (Files.exists(Path.of(path))) args.addAll(List.of("--ro-bind", path, path));
        args.addAll(List.of("--tmpfs", "/tmp", "--proc", "/proc", "--dev", "/dev"));
        if (!jdk.startsWith("/usr")) args.addAll(List.of("--ro-bind", jdk.toString(), jdk.toString()));
        args.addAll(List.of("--bind", project.toString(), project.toString(), "--chdir", project.toString(),
                "--clearenv", "--setenv", "HOME", "/tmp", "--setenv", "TMPDIR", "/tmp", "--setenv", "LANG", "C.UTF-8",
                "--setenv", "PATH", jdk.resolve("bin") + ":/usr/bin", "--"));
        List<String> command = new ArrayList<>(builder.command());
        String tool = Path.of(command.get(0)).getFileName().toString();
        if (tool.equals("javac") || tool.equals("jdb")) command.addAll(1, List.of("-J-Xmx256m", "-J-XX:CompressedClassSpaceSize=128m", "-J-XX:ActiveProcessorCount=2"));
        if (tool.equals("jdb")) command.addAll(1, List.of("-Xmx256m", "-XX:CompressedClassSpaceSize=128m", "-XX:ActiveProcessorCount=2"));
        args.addAll(command); builder.command(args);
        // The wrapper also receives no host credentials or Java injection options.
        builder.environment().clear(); builder.environment().put("LANG", "C.UTF-8");
    }
}
