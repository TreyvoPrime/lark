package lark;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.MalformedInputException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/** Real folders on disk. One project is a directory of source files. */
public final class Projects {
    public record TextFile(String path, String content) {}

    private record Meta(String name, String mainClass, Json.Arr runConfigs) {
        Meta(String name, String mainClass) {
            this(name, mainClass, new Json.Arr());
        }
    }

    private final Settings settings;
    private final ConcurrentHashMap<String, Object> locks = new ConcurrentHashMap<>();

    public Projects(Settings settings) {
        this.settings = settings;
    }

    public Path root() {
        return settings.projectsDir();
    }

    public void ensureSample() {
        try {
            Files.createDirectories(root());
        } catch (IOException e) {
            throw new RequestFail(500, "Couldn't create the projects folder.");
        }
        if (settings.initialized) return;
        if (!list().isEmpty()) {
            settings.initialized = true;
            settings.save();
            return;
        }
        String id = create("Library checkout", "library");
        settings.lastProject = id;
        settings.initialized = true;
        settings.save();
    }

    public List<Json.Obj> list() {
        List<Json.Obj> out = new ArrayList<>();
        if (!Files.isDirectory(root())) return out;
        try (Stream<Path> dirs = Files.list(root())) {
            for (Path dir : dirs.filter(Files::isDirectory).sorted().toList()) {
                String id = dir.getFileName().toString();
                if (!idOk(id)) continue;
                Meta meta = readMeta(dir);
                out.add(new Json.Obj()
                        .put("id", id)
                        .put("name", meta.name)
                        .put("mainClass", meta.mainClass));
            }
        } catch (IOException e) {
            throw new RequestFail(500, "Couldn't list projects.");
        }
        out.sort(Comparator.comparing(o -> o.str("name", "").toLowerCase(Locale.ROOT)));
        return out;
    }

    public static final List<String> TEMPLATES = List.of(
            "empty", "library", "factorial", "quiz", "sorting", "recursion", "calculator", "grades"
    );

    public String create(String name, String template) {
        String clean = cleanName(name);
        String id = uniqueId(slug(clean));
        Path dir = root().resolve(id);
        String kind = template == null ? "empty" : template.trim().toLowerCase(Locale.ROOT);
        if (!TEMPLATES.contains(kind)) kind = "empty";
        synchronized (lock(id)) {
            try {
                Files.createDirectories(dir);
                List<TextFile> files = templateFiles(kind);
                for (TextFile file : files) {
                    writeUnlocked(dir, file.path, file.content);
                }
                writeMeta(dir, new Meta(clean, templateMain(kind)));
            } catch (IOException e) {
                throw new RequestFail(500, "Couldn't create the project.");
            }
        }
        settings.lastProject = id;
        settings.save();
        return id;
    }

    public static Json.Arr templateCatalog() {
        Json.Arr arr = new Json.Arr();
        arr.add(new Json.Obj().put("id", "empty").put("name", "Empty").put("blurb", "A single Main class — blank canvas."));
        arr.add(new Json.Obj().put("id", "library").put("name", "Library checkout").put("blurb", "Classes, an interface, and a short story to run."));
        arr.add(new Json.Obj().put("id", "factorial").put("name", "BigInteger factorial").put("blurb", "Exact factorials with java.math.BigInteger."));
        arr.add(new Json.Obj().put("id", "quiz").put("name", "Quiz").put("blurb", "Scanner questions and a running score."));
        arr.add(new Json.Obj().put("id", "sorting").put("name", "Sorting lab").put("blurb", "Bubble sort with printed passes."));
        arr.add(new Json.Obj().put("id", "recursion").put("name", "Recursion").put("blurb", "Countdown and Fibonacci side by side."));
        arr.add(new Json.Obj().put("id", "calculator").put("name", "Calculator").put("blurb", "A tiny four-function console calculator."));
        arr.add(new Json.Obj().put("id", "grades").put("name", "Grade book").put("blurb", "ArrayList of scores with average and letter grade."));
        return arr;
    }

    private static String templateMain(String kind) {
        return switch (kind) {
            case "library" -> "app.Main";
            case "factorial" -> "mathlab.Factorial";
            case "quiz" -> "quiz.QuizApp";
            case "sorting" -> "lab.SortDemo";
            case "recursion" -> "lab.RecursionLab";
            case "calculator" -> "tools.Calculator";
            case "grades" -> "school.GradeBook";
            default -> "Main";
        };
    }

    private static List<TextFile> templateFiles(String kind) {
        return switch (kind) {
            case "library" -> librarySample();
            case "factorial" -> factorialSample();
            case "quiz" -> quizSample();
            case "sorting" -> sortingSample();
            case "recursion" -> recursionSample();
            case "calculator" -> calculatorSample();
            case "grades" -> gradesSample();
            default -> emptySample();
        };
    }

    public String importFiles(String name, List<TextFile> files) {
        if (files == null || files.isEmpty()) throw new RequestFail(400, "That import didn't include any files.");
        if (files.size() > 200) throw new RequestFail(400, "Lark can import up to 200 files at a time.");
        String clean = cleanName(name);
        String id = uniqueId(slug(clean));
        Path dir = root().resolve(id);
        synchronized (lock(id)) {
            try {
                Files.createDirectories(dir);
                for (TextFile file : files) {
                    checkRelative(file.path);
                    if (file.content != null && file.content.length() > 400_000) {
                        throw new RequestFail(400, "One of those files is too large to import.");
                    }
                    writeUnlocked(dir, file.path, file.content == null ? "" : file.content);
                }
                writeMeta(dir, new Meta(clean, ""));
            } catch (IOException e) {
                throw new RequestFail(500, "Couldn't import the project.");
            }
        }
        settings.lastProject = id;
        settings.save();
        return id;
    }

    public String importZip(String name, InputStream in) {
        List<TextFile> files = new ArrayList<>();
        long total = 0;
        try (ZipInputStream zip = new ZipInputStream(in)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.isDirectory()) continue;
                String rel = entry.getName().replace('\\', '/');
                while (rel.startsWith("/")) rel = rel.substring(1);
                try {
                    checkRelative(rel);
                } catch (RequestFail ignored) {
                    continue;
                }
                if (skip(rel)) continue;
                byte[] data = zip.readNBytes(400_001);
                if (data.length > 400_000) throw new RequestFail(400, "A file in that zip is too large.");
                total += data.length;
                if (total > 5_000_000) throw new RequestFail(400, "That zip is too large.");
                if (files.size() >= 200) throw new RequestFail(400, "That zip has too many files.");
                if (!isUtf8(data)) continue;
                files.add(new TextFile(rel, new String(data, StandardCharsets.UTF_8)));
            }
        } catch (IOException e) {
            throw new RequestFail(400, "That zip couldn't be read.");
        }
        return importFiles(name == null || name.isBlank() ? "Imported" : name, files);
    }

    public Json.Obj read(String id) {
        Path dir = projectDir(id);
        synchronized (lock(id)) {
            Meta meta = readMeta(dir);
            Json.Arr files = new Json.Arr();
            Json.Arr dirs = new Json.Arr();
            try (Stream<Path> walk = Files.walk(dir)) {
                for (Path path : walk.sorted().toList()) {
                    if (path.equals(dir)) continue;
                    String rel = rel(dir, path);
                    if (skip(rel)) continue;
                    if (Files.isDirectory(path)) {
                        dirs.add(rel);
                    } else if (Files.isRegularFile(path)) {
                        Json.Obj file = new Json.Obj().put("path", rel);
                        if (Files.size(path) > 400_000) {
                            file.put("tooBig", true);
                        } else {
                            try {
                                file.put("content", Files.readString(path));
                            } catch (MalformedInputException e) {
                                file.put("binary", true);
                            }
                        }
                        files.add(file);
                    }
                }
            } catch (IOException e) {
                throw new RequestFail(500, "Couldn't read the project.");
            }
            return new Json.Obj()
                    .put("id", id)
                    .put("name", meta.name)
                    .put("mainClass", meta.mainClass)
                    .put("runConfigs", meta.runConfigs == null ? new Json.Arr() : meta.runConfigs)
                    .put("path", dir.toAbsolutePath().toString())
                    .put("dirs", dirs)
                    .put("files", files);
        }
    }

    public List<TextFile> texts(String id) {
        Path dir = projectDir(id);
        synchronized (lock(id)) {
            List<TextFile> files = new ArrayList<>();
            try (Stream<Path> walk = Files.walk(dir)) {
                for (Path path : walk.filter(Files::isRegularFile).sorted().toList()) {
                    String rel = rel(dir, path);
                    if (skip(rel) || Files.size(path) > 400_000) continue;
                    try {
                        files.add(new TextFile(rel, Files.readString(path)));
                    } catch (MalformedInputException ignored) {
                        // Binary files stay on disk and are not pushed.
                    }
                }
            } catch (IOException e) {
                throw new RequestFail(500, "Couldn't read the project.");
            }
            return files;
        }
    }

    public void writeFile(String id, String rel, String content) {
        if (content == null) content = "";
        if (content.length() > 400_000) throw new RequestFail(400, "That file is too large for Lark.");
        checkRelative(rel);
        Path dir = projectDir(id);
        synchronized (lock(id)) {
            try {
                writeUnlocked(dir, rel, content);
            } catch (IOException e) {
                throw new RequestFail(500, "Couldn't save " + rel + ".");
            }
        }
    }

    public void mkdir(String id, String rel) {
        checkRelative(rel);
        Path dir = projectDir(id);
        synchronized (lock(id)) {
            try {
                Files.createDirectories(resolve(dir, rel));
            } catch (IOException e) {
                throw new RequestFail(500, "Couldn't create that folder.");
            }
        }
    }

    public void deletePath(String id, String rel) {
        checkRelative(rel);
        Path dir = projectDir(id);
        synchronized (lock(id)) {
            Path path = resolve(dir, rel);
            if (!Files.exists(path)) throw new RequestFail(404, "That file isn't in the project.");
            try {
                deleteTree(path);
            } catch (IOException e) {
                throw new RequestFail(500, "Couldn't delete that.");
            }
        }
    }

    public void move(String id, String from, String to) {
        checkRelative(from);
        checkRelative(to);
        if (from.equals(to)) return;
        Path dir = projectDir(id);
        synchronized (lock(id)) {
            Path source = resolve(dir, from);
            Path target = resolve(dir, to);
            if (!Files.exists(source)) throw new RequestFail(404, "That file isn't in the project.");
            if (Files.exists(target)) throw new RequestFail(400, "There's already something at that path.");
            if (target.startsWith(source)) throw new RequestFail(400, "Can't move a folder into itself.");
            try {
                Files.createDirectories(target.getParent());
                Files.move(source, target);
            } catch (IOException e) {
                throw new RequestFail(500, "Couldn't rename that.");
            }
        }
    }

    public void updateMeta(String id, String name, String mainClass, boolean hasName, boolean hasMain) {
        updateMeta(id, name, mainClass, null, hasName, hasMain, false);
    }

    public void updateMeta(String id, String name, String mainClass, Json.Arr runConfigs,
                           boolean hasName, boolean hasMain, boolean hasConfigs) {
        Path dir = projectDir(id);
        synchronized (lock(id)) {
            Meta meta = readMeta(dir);
            if (hasName) meta = new Meta(cleanName(name), meta.mainClass, meta.runConfigs);
            if (hasMain) {
                if (mainClass == null) mainClass = "";
                if (!mainClass.isBlank() && !mainClass.matches("[A-Za-z_][\\w$]*(\\.[A-Za-z_][\\w$]*)*")) {
                    throw new RequestFail(400, "That doesn't look like a Java class name.");
                }
                meta = new Meta(meta.name, mainClass, meta.runConfigs);
            }
            if (hasConfigs) {
                meta = new Meta(meta.name, meta.mainClass, sanitizeConfigs(runConfigs));
            }
            try {
                writeMeta(dir, meta);
            } catch (IOException e) {
                throw new RequestFail(500, "Couldn't update the project.");
            }
        }
    }

    private static Json.Arr sanitizeConfigs(Json.Arr raw) {
        Json.Arr out = new Json.Arr();
        if (raw == null) return out;
        int n = Math.min(raw.size(), 20);
        for (int i = 0; i < n; i++) {
            if (!(raw.get(i) instanceof Json.Obj obj)) continue;
            String cfgName = obj.str("name", "").trim();
            String main = obj.str("mainClass", "").trim();
            String args = obj.str("args", "");
            if (cfgName.isBlank()) cfgName = "Run " + (i + 1);
            if (cfgName.length() > 80) cfgName = cfgName.substring(0, 80);
            if (args.length() > 2_000) args = args.substring(0, 2_000);
            if (!main.isBlank() && !main.matches("[A-Za-z_][\\w$]*(\\.[A-Za-z_][\\w$]*)*")) continue;
            out.add(new Json.Obj()
                    .put("name", cfgName)
                    .put("mainClass", main)
                    .put("args", args == null ? "" : args));
        }
        return out;
    }

    public void delete(String id) {
        Path dir = projectDir(id);
        synchronized (lock(id)) {
            try {
                deleteTree(dir);
            } catch (IOException e) {
                throw new RequestFail(500, "Couldn't delete the project.");
            }
        }
        locks.remove(id);
        if (id.equals(settings.lastProject)) {
            settings.lastProject = "";
            settings.save();
        }
    }

    public void exportZip(String id, OutputStream out) {
        Path dir = projectDir(id);
        synchronized (lock(id)) {
            try (ZipOutputStream zip = new ZipOutputStream(out);
                 Stream<Path> walk = Files.walk(dir)) {
                for (Path file : walk.filter(Files::isRegularFile).sorted().toList()) {
                    String rel = rel(dir, file);
                    if (skip(rel)) continue;
                    zip.putNextEntry(new ZipEntry(rel));
                    Files.copy(file, zip);
                    zip.closeEntry();
                }
            } catch (IOException e) {
                throw new RequestFail(500, "Couldn't build the zip.");
            }
        }
    }

    public Path projectDir(String id) {
        if (!idOk(id)) throw new RequestFail(400, "That project name isn't valid.");
        Path dir = root().resolve(id).normalize();
        if (!dir.startsWith(root().normalize()) || !Files.isDirectory(dir)) {
            throw new RequestFail(404, "That project isn't here.");
        }
        return dir;
    }

    public static String slug(String name) {
        String s = name.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-");
        s = s.replaceAll("^-+|-+$", "");
        if (s.isBlank()) s = "project";
        if (s.length() > 48) s = s.substring(0, 48).replaceAll("-+$", "");
        if (s.isBlank()) s = "project";
        return s;
    }

    public static void checkRelative(String rel) {
        if (rel == null || rel.isBlank()) throw new RequestFail(400, "Missing a path.");
        if (rel.length() > 240) throw new RequestFail(400, "That path is too long.");
        String norm = rel.replace('\\', '/');
        if (norm.startsWith("/") || norm.contains("\0") || norm.contains(":")) {
            throw new RequestFail(400, "That path isn't allowed.");
        }
        for (String part : norm.split("/")) {
            if (part.isBlank() || part.equals(".") || part.equals("..")) {
                throw new RequestFail(400, "That path isn't allowed.");
            }
            if (part.length() > 120) throw new RequestFail(400, "That file name is too long.");
        }
    }

    public static boolean skip(String rel) {
        for (String part : rel.split("/")) {
            if (part.equals(".lark-out") || part.equals(".lark-check") || part.equals("out") || part.equals("bin")
                    || part.equals(".git") || part.equals(".idea") || part.equals(".vscode")) {
                return true;
            }
            if (part.startsWith(".")) return true;
        }
        return rel.endsWith(".class");
    }

    public static List<TextFile> librarySample() {
        return List.of(
                new TextFile("README.txt", """
                        Library checkout

                        Book is something you can lend. Shelf is what you still have.
                        Member is a person who borrows. Main ties them together.

                        Press Run.
                        """),
                new TextFile("src/library/Loanable.java", """
                        package library;

                        public interface Loanable {
                            void lend();

                            void returned();

                            boolean onLoan();
                        }
                        """),
                new TextFile("src/library/Book.java", """
                        package library;

                        public class Book implements Loanable {
                            private final String title;
                            private final String author;
                            private boolean onLoan;

                            public Book(String title, String author) {
                                this.title = title;
                                this.author = author;
                            }

                            public String title() {
                                return title;
                            }

                            public String author() {
                                return author;
                            }

                            @Override
                            public boolean onLoan() {
                                return onLoan;
                            }

                            @Override
                            public void lend() {
                                if (onLoan) {
                                    throw new IllegalStateException(title + " is already out");
                                }
                                onLoan = true;
                            }

                            @Override
                            public void returned() {
                                onLoan = false;
                            }

                            @Override
                            public String toString() {
                                return title + " — " + author + (onLoan ? " (out)" : "");
                            }
                        }
                        """),
                new TextFile("src/library/Member.java", """
                        package library;

                        import java.util.ArrayList;
                        import java.util.List;

                        public class Member {
                            private final String name;
                            private final List<Book> borrowed = new ArrayList<>();

                            public Member(String name) {
                                this.name = name;
                            }

                            public String name() {
                                return name;
                            }

                            public void borrow(Book book) {
                                book.lend();
                                borrowed.add(book);
                            }

                            public int holding() {
                                return borrowed.size();
                            }

                            public List<Book> borrowed() {
                                return List.copyOf(borrowed);
                            }
                        }
                        """),
                new TextFile("src/library/Shelf.java", """
                        package library;

                        import java.util.ArrayList;
                        import java.util.List;

                        public class Shelf {
                            private final String label;
                            private final List<Book> books = new ArrayList<>();

                            public Shelf(String label) {
                                this.label = label;
                            }

                            public String label() {
                                return label;
                            }

                            public void add(Book book) {
                                books.add(book);
                            }

                            public List<Book> available() {
                                List<Book> open = new ArrayList<>();
                                for (Book book : books) {
                                    if (!book.onLoan()) open.add(book);
                                }
                                return open;
                            }

                            public int size() {
                                return books.size();
                            }
                        }
                        """),
                new TextFile("src/app/Main.java", """
                        package app;

                        import library.Book;
                        import library.Member;
                        import library.Shelf;

                        public class Main {
                            public static void main(String[] args) {
                                Shelf fiction = new Shelf("Fiction");
                                fiction.add(new Book("Kindred", "Octavia E. Butler"));
                                fiction.add(new Book("The Left Hand of Darkness", "Ursula K. Le Guin"));
                                fiction.add(new Book("Parable of the Sower", "Octavia E. Butler"));

                                Member ada = new Member("Ada");
                                Book first = fiction.available().get(0);
                                ada.borrow(first);

                                System.out.println(fiction.label() + " holds " + fiction.size() + " books.");
                                System.out.println(ada.name() + " has " + first + ".");
                                System.out.println("Still on the shelf:");
                                for (Book book : fiction.available()) {
                                    System.out.println("  " + book);
                                }
                            }
                        }
                        """)
        );
    }

    public static List<TextFile> emptySample() {
        return List.of(new TextFile("src/Main.java", """
                public class Main {
                    public static void main(String[] args) {
                        System.out.println("Hello from Lark.");
                    }
                }
                """));
    }

    public static List<TextFile> factorialSample() {
        return List.of(
                new TextFile("README.txt", """
                        BigInteger factorial

                        Computes n! exactly — no long overflow.
                        Try 20, then 100.
                        """),
                new TextFile("src/mathlab/Factorial.java", """
                        package mathlab;

                        import java.math.BigInteger;
                        import java.util.Scanner;

                        public class Factorial {
                            public static BigInteger factorial(int n) {
                                if (n < 0) {
                                    throw new IllegalArgumentException("n must be >= 0");
                                }
                                BigInteger result = BigInteger.ONE;
                                for (int i = 2; i <= n; i++) {
                                    result = result.multiply(BigInteger.valueOf(i));
                                }
                                return result;
                            }

                            public static void main(String[] args) {
                                Scanner in = new Scanner(System.in);
                                System.out.print("n = ");
                                int n = in.nextInt();
                                System.out.println(n + "! = " + factorial(n));
                            }
                        }
                        """)
        );
    }

    public static List<TextFile> quizSample() {
        return List.of(
                new TextFile("README.txt", """
                        Quiz

                        Answer a few questions. Type under Output when asked.
                        """),
                new TextFile("src/quiz/QuizApp.java", """
                        package quiz;

                        import java.util.Scanner;

                        public class QuizApp {
                            public static void main(String[] args) {
                                Scanner in = new Scanner(System.in);
                                int score = 0;

                                System.out.print("What keyword starts a class? ");
                                if (in.nextLine().trim().equalsIgnoreCase("class")) score++;

                                System.out.print("True or false: int is a reference type. ");
                                String ans = in.nextLine().trim().toLowerCase();
                                if (ans.equals("false") || ans.equals("f")) score++;

                                System.out.print("How many bits in a Java byte? ");
                                if (in.nextLine().trim().equals("8")) score++;

                                System.out.println("Score: " + score + " / 3");
                            }
                        }
                        """)
        );
    }

    public static List<TextFile> sortingSample() {
        return List.of(
                new TextFile("README.txt", """
                        Sorting lab

                        Watch bubble sort swap its way through an array.
                        """),
                new TextFile("src/lab/SortDemo.java", """
                        package lab;

                        import java.util.Arrays;

                        public class SortDemo {
                            public static void bubbleSort(int[] nums) {
                                for (int pass = 0; pass < nums.length - 1; pass++) {
                                    for (int i = 0; i < nums.length - 1 - pass; i++) {
                                        if (nums[i] > nums[i + 1]) {
                                            int tmp = nums[i];
                                            nums[i] = nums[i + 1];
                                            nums[i + 1] = tmp;
                                        }
                                    }
                                    System.out.println("pass " + (pass + 1) + ": " + Arrays.toString(nums));
                                }
                            }

                            public static void main(String[] args) {
                                int[] data = { 5, 1, 4, 2, 8 };
                                System.out.println("start: " + Arrays.toString(data));
                                bubbleSort(data);
                                System.out.println("done:  " + Arrays.toString(data));
                            }
                        }
                        """)
        );
    }

    public static List<TextFile> recursionSample() {
        return List.of(
                new TextFile("README.txt", """
                        Recursion lab

                        Countdown and Fibonacci — same idea, different shapes.
                        """),
                new TextFile("src/lab/RecursionLab.java", """
                        package lab;

                        public class RecursionLab {
                            public static void countdown(int n) {
                                if (n <= 0) {
                                    System.out.println("liftoff");
                                    return;
                                }
                                System.out.println(n);
                                countdown(n - 1);
                            }

                            public static int fib(int n) {
                                if (n <= 1) return n;
                                return fib(n - 1) + fib(n - 2);
                            }

                            public static void main(String[] args) {
                                countdown(5);
                                System.out.println("fib(10) = " + fib(10));
                            }
                        }
                        """)
        );
    }

    public static List<TextFile> calculatorSample() {
        return List.of(
                new TextFile("README.txt", """
                        Calculator

                        Enter: number operator number
                        Example: 12 / 5
                        """),
                new TextFile("src/tools/Calculator.java", """
                        package tools;

                        import java.util.Scanner;

                        public class Calculator {
                            public static double apply(double a, String op, double b) {
                                return switch (op) {
                                    case "+" -> a + b;
                                    case "-" -> a - b;
                                    case "*" -> a * b;
                                    case "/" -> {
                                        if (b == 0) throw new ArithmeticException("Division by zero");
                                        yield a / b;
                                    }
                                    default -> throw new IllegalArgumentException("Unknown operator: " + op);
                                };
                            }

                            public static void main(String[] args) {
                                Scanner in = new Scanner(System.in);
                                System.out.print("Expression (a op b): ");
                                double a = in.nextDouble();
                                String op = in.next();
                                double b = in.nextDouble();
                                System.out.println("= " + apply(a, op, b));
                            }
                        }
                        """)
        );
    }

    public static List<TextFile> gradesSample() {
        return List.of(
                new TextFile("README.txt", """
                        Grade book

                        Stores scores in an ArrayList and prints the average.
                        """),
                new TextFile("src/school/GradeBook.java", """
                        package school;

                        import java.util.ArrayList;
                        import java.util.List;

                        public class GradeBook {
                            private final List<Integer> scores = new ArrayList<>();

                            public void add(int score) {
                                scores.add(score);
                            }

                            public double average() {
                                if (scores.isEmpty()) return 0;
                                int sum = 0;
                                for (int score : scores) sum += score;
                                return sum / (double) scores.size();
                            }

                            public String letter() {
                                double avg = average();
                                if (avg >= 90) return "A";
                                if (avg >= 80) return "B";
                                if (avg >= 70) return "C";
                                if (avg >= 60) return "D";
                                return "F";
                            }

                            public static void main(String[] args) {
                                GradeBook book = new GradeBook();
                                book.add(88);
                                book.add(92);
                                book.add(79);
                                System.out.println("Average: " + book.average());
                                System.out.println("Letter:  " + book.letter());
                            }
                        }
                        """)
        );
    }

    public static void deleteTree(Path path) throws IOException {
        if (!Files.exists(path)) return;
        if (Files.isDirectory(path)) {
            try (Stream<Path> walk = Files.walk(path)) {
                for (Path child : walk.sorted(Comparator.reverseOrder()).toList()) {
                    Files.deleteIfExists(child);
                }
            }
        } else {
            Files.deleteIfExists(path);
        }
    }

    private Object lock(String id) {
        return locks.computeIfAbsent(id, k -> new Object());
    }

    private String uniqueId(String base) {
        String id = base;
        int n = 2;
        while (Files.exists(root().resolve(id))) {
            id = base + "-" + n++;
            if (n > 500) throw new RequestFail(400, "Too many projects with that name.");
        }
        return id;
    }

    private static String cleanName(String name) {
        if (name == null) throw new RequestFail(400, "Give the project a name.");
        String clean = name.trim().replaceAll("\\s+", " ");
        if (clean.isBlank()) throw new RequestFail(400, "Give the project a name.");
        if (clean.length() > 80) clean = clean.substring(0, 80).trim();
        return clean;
    }

    private static boolean idOk(String id) {
        return id != null && id.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,80}");
    }

    private static String rel(Path root, Path path) {
        return root.relativize(path).toString().replace('\\', '/');
    }

    public static Path resolve(Path root, String rel) {
        checkRelative(rel);
        Path path = root.resolve(rel.replace('\\', '/')).normalize();
        if (!path.startsWith(root.normalize())) throw new RequestFail(400, "That path isn't allowed.");
        return path;
    }

    private static void writeUnlocked(Path root, String rel, String content) throws IOException {
        Path file = resolve(root, rel);
        Files.createDirectories(file.getParent());
        Path tmp = file.resolveSibling(file.getFileName().toString() + ".larktmp");
        Files.writeString(tmp, content, StandardCharsets.UTF_8);
        try {
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private Meta readMeta(Path dir) {
        String fallback = dir.getFileName().toString();
        Path file = dir.resolve(".lark.json");
        if (!Files.isRegularFile(file)) return new Meta(fallback, "");
        try {
            Json.Obj obj = Json.parseObj(Files.readString(file));
            String name = obj.str("name", fallback);
            if (name == null || name.isBlank()) name = fallback;
            Json.Arr configs = obj.arr("runConfigs");
            return new Meta(name, obj.str("mainClass", ""),
                    configs == null ? new Json.Arr() : sanitizeConfigs(configs));
        } catch (RuntimeException | IOException e) {
            return new Meta(fallback, "");
        }
    }

    private void writeMeta(Path dir, Meta meta) throws IOException {
        Json.Obj obj = new Json.Obj()
                .put("name", meta.name)
                .put("mainClass", meta.mainClass == null ? "" : meta.mainClass)
                .put("runConfigs", meta.runConfigs == null ? new Json.Arr() : meta.runConfigs);
        Files.writeString(dir.resolve(".lark.json"), obj.write());
    }

    static boolean isUtf8(byte[] data) {
        try {
            CharsetDecoder decoder = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT);
            decoder.decode(ByteBuffer.wrap(data));
            return true;
        } catch (CharacterCodingException e) {
            return false;
        }
    }
}
