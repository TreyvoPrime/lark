package lark;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/** Plain assertions for the pieces that don't need a browser. */
public final class Check {
    public static void main(String[] args) throws Exception {
        json();
        paths();
        args();
        diagnostics();
        englishErrors();
        sampleCompiles();
        System.out.println("check ok");
    }

    private static void json() {
        String raw = "{\"name\":\"Ada\",\"ok\":true,\"n\":2,\"items\":[\"a\",null],\"note\":\"line\\n\\\"quote\\\"\"}";
        Json.Obj obj = Json.parseObj(raw);
        eq(obj.str("name"), "Ada");
        eq(obj.bool("ok"), true);
        eq(obj.longVal("n"), 2L);
        eq(obj.arr("items").size(), 2);
        String again = Json.parse(obj.write()).write();
        eq(again, obj.write());
        Json.Obj snow = Json.parseObj("{\"s\":\"\\u2603\"}");
        eq(snow.str("s"), "\u2603");
        try {
            Json.parse("{\"a\":1} trailing");
            throw new AssertionError("trailing junk was accepted");
        } catch (RequestFail expected) {
            // Good.
        }
    }

    private static void paths() {
        eq(Projects.slug("Library checkout"), "library-checkout");
        Projects.checkRelative("src/app/Main.java");
        String[] bad = {"../etc/passwd", "/etc/passwd", "src/../../x", "a\\..\\b", "foo:bar"};
        for (String path : bad) {
            try {
                Projects.checkRelative(path);
                throw new AssertionError("allowed " + path);
            } catch (RequestFail expected) {
                // Good.
            }
        }
    }

    private static void args() {
        eq(Runner.splitArgs("a b"), List.of("a", "b"));
        eq(Runner.splitArgs("\"a b\" c"), List.of("a b", "c"));
        eq(Runner.splitArgs(""), List.of());
    }

    private static void diagnostics() {
        String err = """
                src/app/Main.java:4: error: ';' expected
                        System.out.println("hi")
                                                 ^
                src/app/Main.java:4:12: warning: example
                1 error
                """;
        List<Runner.Problem> problems = Runner.parseDiagnostics(Path.of("/tmp/proj"), err);
        eq(problems.size(), 2);
        eq(problems.get(0).file(), "src/app/Main.java");
        eq(problems.get(0).line(), 4);
        eq(problems.get(0).severity(), "error");
        assertTrue(problems.get(0).plain().toLowerCase().contains("semicolon"), problems.get(0).plain());
        assertTrue(!problems.get(0).hint().isBlank(), "hint missing");
        eq(problems.get(1).column(), 12);
        eq(problems.get(1).severity(), "warning");
    }

    private static void englishErrors() {
        Errors.Explained missing = Errors.explainCompile("cannot find symbol symbol: variable count");
        assertTrue(missing.plain().contains("count"), missing.plain());
        assertTrue(missing.hint().toLowerCase().contains("declare") || missing.hint().toLowerCase().contains("typo"), missing.hint());
        Errors.Explained npe = Errors.explainRuntime("Exception in thread \"main\" java.lang.NullPointerException");
        assertTrue(npe != null && npe.plain().toLowerCase().contains("null"), String.valueOf(npe));
        String withSymbol = """
                src/Demo.java:8: error: cannot find symbol
                  symbol:   class Scanner
                  location: class Demo
                """;
        List<Runner.Problem> problems = Runner.parseDiagnostics(Path.of("/tmp"), withSymbol);
        eq(problems.size(), 1);
        assertTrue(problems.get(0).message().contains("symbol:"), problems.get(0).message());
        assertTrue(problems.get(0).plain().toLowerCase().contains("scanner")
                || problems.get(0).plain().toLowerCase().contains("class"), problems.get(0).plain());
    }

    private static void sampleCompiles() throws Exception {
        Path dir = Files.createTempDirectory("lark-sample");
        for (Projects.TextFile file : Projects.librarySample()) {
            if (!file.path().endsWith(".java")) continue;
            Path dest = dir.resolve(file.path());
            Files.createDirectories(dest.getParent());
            Files.writeString(dest, file.content());
        }
        Path out = dir.resolve("out");
        Files.createDirectories(out);
        List<String> cmd = new java.util.ArrayList<>();
        cmd.add(Runner.tool("javac").toString());
        cmd.add("--release");
        cmd.add("17");
        cmd.add("-encoding");
        cmd.add("UTF-8");
        cmd.add("-d");
        cmd.add(out.toString());
        try (var walk = Files.walk(dir)) {
            walk.filter(path -> path.toString().endsWith(".java")).forEach(path -> cmd.add(path.toString()));
        }
        Process compile = new ProcessBuilder(cmd).start();
        String compileErr = new String(compile.getErrorStream().readAllBytes());
        int code = compile.waitFor();
        if (code != 0) throw new AssertionError(compileErr);
        Process run = new ProcessBuilder(Runner.tool("java").toString(), "-cp", out.toString(), "app.Main")
                .start();
        String output = new String(run.getInputStream().readAllBytes());
        int runCode = run.waitFor();
        if (runCode != 0) throw new AssertionError(output + new String(run.getErrorStream().readAllBytes()));
        if (!output.contains("Ada has Kindred")) throw new AssertionError(output);
        if (!output.contains("The Left Hand of Darkness")) throw new AssertionError(output);
    }

    private static void eq(Object actual, Object expected) {
        if (actual == null ? expected != null : !actual.equals(expected)) {
            throw new AssertionError("expected <" + expected + "> but was <" + actual + ">");
        }
    }

    private static void assertTrue(boolean ok, String detail) {
        if (!ok) throw new AssertionError(detail == null ? "assertion failed" : detail);
    }
}
