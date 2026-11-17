package lark;

import java.nio.file.Files;
import java.nio.file.Path;

public final class RunnerLongRunCheck {
    public static void main(String[] args) throws Exception {
        Path project = Files.createTempDirectory("lark-long-run-");
        Runner runner = new Runner();
        String id = null;
        try {
            Files.writeString(project.resolve("Main.java"),
                    "public class Main { public static void main(String[] args) throws Exception { "
                    + "System.out.println(\"READY\"); System.out.println(new java.util.Scanner(System.in).nextLine()); "
                    + "while (true) Thread.sleep(1000); } }");
            id = runner.start(project, "Main", "", "");
            long deadline = System.currentTimeMillis() + 20000;
            while (!runner.snapshot(id).bool("acceptsInput") && System.currentTimeMillis() < deadline) Thread.sleep(50);
            if (!runner.snapshot(id).bool("acceptsInput")) throw new AssertionError("Program did not start");
            runner.writeInput(id, "hello");
            while (!runner.snapshot(id).str("output").contains("hello") && System.currentTimeMillis() < deadline) Thread.sleep(50);
            Thread.sleep(1500);
            if (runner.snapshot(id).bool("done")) throw new AssertionError("Long-running program stopped early");
            runner.stop(id);
            while (!runner.snapshot(id).bool("done") && System.currentTimeMillis() < deadline) Thread.sleep(50);
            if (!runner.snapshot(id).bool("done")) throw new AssertionError("Stop did not end the program");
            System.out.println("Long-running program, input, and manual stop checks passed.");
        } finally {
            if (id != null) runner.stop(id);
            Projects.deleteTree(project);
        }
    }
}
