package lark;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns javac and common runtime messages into plain English plus a fix hint
 * so programmers can act on the error instead of guessing.
 */
public final class Errors {
    private Errors() {}

    public record Explained(String plain, String hint) {
        public static Explained of(String plain, String hint) {
            return new Explained(plain, hint);
        }
    }

    private static final Pattern CANNOT_FIND = Pattern.compile(
            "cannot find symbol", Pattern.CASE_INSENSITIVE);
    private static final Pattern SYMBOL = Pattern.compile(
            "symbol:\\s*(variable|method|class|interface|enum|package|constructor)\\s+(\\S+)");
    private static final Pattern INCOMPATIBLE = Pattern.compile(
            "incompatible types:\\s*(.+?)\\s+cannot be converted to\\s+(.+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern MISSING_SEMI = Pattern.compile("';' expected");
    private static final Pattern ILLEGAL_START = Pattern.compile(
            "illegal start of (expression|type|statement)", Pattern.CASE_INSENSITIVE);
    private static final Pattern PUBLIC_FILE = Pattern.compile(
            "class\\s+(\\w+)\\s+is public, should be declared in a file named\\s+(\\w+\\.java)");
    private static final Pattern ALREADY_DEFINED = Pattern.compile(
            "variable\\s+(\\w+)\\s+is already defined");
    private static final Pattern METHOD_ALREADY = Pattern.compile(
            "method\\s+(\\w+)\\([^)]*\\)\\s+is already defined");
    private static final Pattern NOT_INITIALIZED = Pattern.compile(
            "variable\\s+(\\w+)\\s+might not have been initialized");
    private static final Pattern MISSING_RETURN = Pattern.compile("missing return statement");
    private static final Pattern NON_STATIC = Pattern.compile(
            "non-static\\s+(variable|method)\\s+(\\S+)\\s+cannot be referenced from a static context");
    private static final Pattern PACKAGE_MISSING = Pattern.compile(
            "package\\s+([\\w.]+)\\s+does not exist");
    private static final Pattern METHOD_APPLY = Pattern.compile(
            "method\\s+(.+?)\\s+cannot be applied to given types");
    private static final Pattern CONSTRUCTOR_APPLY = Pattern.compile(
            "constructor\\s+(\\w+)\\s+in class\\s+[\\w.]+\\s+cannot be applied");
    private static final Pattern BAD_OPERAND = Pattern.compile(
            "bad operand types for binary operator\\s+'([^']+)'");
    private static final Pattern LOSSY = Pattern.compile(
            "possible lossy conversion from\\s+(\\w+)\\s+to\\s+(\\w+)");
    private static final Pattern UNREPORTED = Pattern.compile(
            "unreported exception\\s+([\\w.]+)");
    private static final Pattern ARRAY_REQUIRED = Pattern.compile(
            "array required, but\\s+(.+)\\s+found");
    private static final Pattern EOF = Pattern.compile(
            "reached end of file while parsing");
    private static final Pattern NOT_A_STATEMENT = Pattern.compile("not a statement");
    private static final Pattern ELSE_WITHOUT_IF = Pattern.compile("'else' without 'if'");
    private static final Pattern VOID_RETURN = Pattern.compile(
            "incompatible types:\\s*void\\s+cannot be converted");
    private static final Pattern ABSTRACT = Pattern.compile(
            "(.+)\\s+is abstract; cannot be instantiated");
    private static final Pattern ACCESS = Pattern.compile(
            "(.+)\\s+has private access in\\s+(.+)");

    /** Explain a single javac diagnostic message. */
    public static Explained explainCompile(String message) {
        if (message == null || message.isBlank()) {
            return Explained.of("Something went wrong while compiling.", "Open Problems and jump to the marked line.");
        }
        String msg = message.trim();

        Matcher m = PUBLIC_FILE.matcher(msg);
        if (m.find()) {
            return Explained.of(
                    "The public class `" + m.group(1) + "` must live in a file named `" + m.group(2) + "`.",
                    "Rename the file to match the class, or rename the class to match the file.");
        }
        if (MISSING_SEMI.matcher(msg).find()) {
            return Explained.of(
                    "Java expected a semicolon (`;`) near this line.",
                    "Finish the statement ending on the line above, or check for a missing `)` / `}` that confused the parser.");
        }
        m = ILLEGAL_START.matcher(msg);
        if (m.find()) {
            return Explained.of(
                    "Java got confused reading this " + m.group(1) + " — something before it is unfinished.",
                    "Check the previous line for a missing `;`, `)`, or `}`. Extra keywords can also cause this.");
        }
        if (EOF.matcher(msg).find()) {
            return Explained.of(
                    "The file ended while Java was still expecting more code (usually a closing `}`).",
                    "Count your braces — every `{` needs a matching `}`.");
        }
        if (CANNOT_FIND.matcher(msg).find()) {
            Matcher sym = SYMBOL.matcher(msg);
            if (sym.find()) {
                String kind = sym.group(1);
                String name = sym.group(2).trim();
                return Explained.of(
                        "Java cannot find the " + kind + " `" + name + "`.",
                        hintForMissingSymbol(kind, name));
            }
            return Explained.of(
                    "Java cannot find a name used on this line.",
                    "Check spelling, create the variable/method first, or add an import for the type.");
        }
        m = INCOMPATIBLE.matcher(msg);
        if (m.find()) {
            return Explained.of(
                    "You are mixing types: `" + m.group(1).trim() + "` cannot become `" + m.group(2).trim() + "`.",
                    "Change one side so both types match, or cast carefully if you really mean it.");
        }
        m = NOT_INITIALIZED.matcher(msg);
        if (m.find()) {
            return Explained.of(
                    "The variable `" + m.group(1) + "` might be used before it gets a value.",
                    "Assign it when you declare it, or set it on every path before reading it.");
        }
        if (MISSING_RETURN.matcher(msg).find()) {
            return Explained.of(
                    "This method promises a return value, but some path never returns one.",
                    "Add a `return ...;` at the end, or return inside every branch of your if/switch.");
        }
        m = NON_STATIC.matcher(msg);
        if (m.find()) {
            return Explained.of(
                    "`main` (and other static methods) cannot use the instance " + m.group(1) + " `" + m.group(2) + "` directly.",
                    "Create an object first (`MyClass obj = new MyClass();`) then call `obj." + m.group(2) + "`, or make that member static if it truly belongs to the class.");
        }
        m = PACKAGE_MISSING.matcher(msg);
        if (m.find()) {
            return Explained.of(
                    "The package `" + m.group(1) + "` is not on the classpath.",
                    "Fix the import spelling, or remove the import if you meant a class in this project.");
        }
        m = METHOD_APPLY.matcher(msg);
        if (m.find()) {
            return Explained.of(
                    "You called `" + m.group(1).trim() + "` with the wrong arguments.",
                    "Compare the parameter types and count with the method signature (hover the status bar or check the outline).");
        }
        m = CONSTRUCTOR_APPLY.matcher(msg);
        if (m.find()) {
            return Explained.of(
                    "`new " + m.group(1) + "(...)` does not match any constructor.",
                    "Check the argument types/order, or generate a constructor from the Java menu.");
        }
        m = ALREADY_DEFINED.matcher(msg);
        if (m.find()) {
            return Explained.of(
                    "The variable `" + m.group(1) + "` is declared twice in this scope.",
                    "Rename one of them, or reuse the existing variable instead of declaring it again.");
        }
        m = METHOD_ALREADY.matcher(msg);
        if (m.find()) {
            return Explained.of(
                    "A method named `" + m.group(1) + "` with the same parameters already exists.",
                    "Rename one method, or change the parameter list so the overloads differ.");
        }
        m = BAD_OPERAND.matcher(msg);
        if (m.find()) {
            return Explained.of(
                    "The operator `" + m.group(1) + "` cannot be used with these value types.",
                    "Both sides need compatible types — for Strings use `+` for joining, and compare with `.equals`, not `==`.");
        }
        m = LOSSY.matcher(msg);
        if (m.find()) {
            return Explained.of(
                    "Putting a `" + m.group(1) + "` into a `" + m.group(2) + "` may lose data.",
                    "Use a wider type, or cast on purpose: `(" + m.group(2) + ") value`.");
        }
        m = UNREPORTED.matcher(msg);
        if (m.find()) {
            return Explained.of(
                    "This code can throw `" + simpleName(m.group(1)) + "`, and you must handle it.",
                    "Wrap the call in try/catch, or add `throws " + simpleName(m.group(1)) + "` on the method.");
        }
        m = ARRAY_REQUIRED.matcher(msg);
        if (m.find()) {
            return Explained.of(
                    "You used `[...]` on something that is not an array (`" + m.group(1).trim() + "`).",
                    "Use an array type, or call a List method like `.get(i)` instead of `[i]`.");
        }
        if (NOT_A_STATEMENT.matcher(msg).find()) {
            return Explained.of(
                    "This line is not a complete Java statement.",
                    "Assign the result to a variable, call a method, or remove the leftover expression.");
        }
        if (ELSE_WITHOUT_IF.matcher(msg).find()) {
            return Explained.of(
                    "`else` must follow an `if`.",
                    "Check braces — an `else` may have been separated from its `if` by an extra `}`.");
        }
        if (VOID_RETURN.matcher(msg).find()) {
            return Explained.of(
                    "A `void` method returns nothing, so you cannot use its result as a value.",
                    "Call it on its own line, or change the method to return a real type.");
        }
        m = ABSTRACT.matcher(msg);
        if (m.find()) {
            return Explained.of(
                    "`" + m.group(1).trim() + "` is abstract — you cannot `new` it directly.",
                    "Instantiate a concrete subclass, or remove `abstract` if this class should be creatable.");
        }
        m = ACCESS.matcher(msg);
        if (m.find()) {
            return Explained.of(
                    "`" + m.group(1).trim() + "` is private inside `" + m.group(2).trim() + "`.",
                    "Use a public getter/setter (Java → Generate getters/setters) or widen the access modifier.");
        }
        if (msg.toLowerCase(Locale.ROOT).contains("expected")) {
            return Explained.of(
                    "Java expected different syntax here: " + msg,
                    "Look one line above for a missing character, and match braces/parentheses.");
        }
        return Explained.of(
                "Compile error: " + msg,
                "Jump to the marked line, read the code around it, and fix the smallest thing that looks unfinished or misspelled.");
    }

    /** Explain a common runtime exception line from program output. */
    public static Explained explainRuntime(String line) {
        if (line == null || line.isBlank()) return null;
        String text = line.trim();
        String lower = text.toLowerCase(Locale.ROOT);
        if (lower.contains("nullpointerexception")) {
            return Explained.of(
                    "Something was `null` when the program tried to use it.",
                    "Find what you called a method on, and make sure you created/assigned it before using it.");
        }
        if (lower.contains("arrayindexoutofboundsexception") || lower.contains("index  ") && lower.contains("outofbounds")) {
            return Explained.of(
                    "The program used an array index that does not exist.",
                    "Valid indexes are `0` through `length - 1`. Check your loop bounds.");
        }
        if (lower.contains("stringindexoutofboundsexception")) {
            return Explained.of(
                    "A String index was out of range.",
                    "Use indexes from `0` to `length() - 1`, and check `length()` before `charAt` / `substring`.");
        }
        if (lower.contains("inputmismatchexception")) {
            return Explained.of(
                    "Scanner expected a different kind of input (for example an int, but got text).",
                    "Match `nextInt`/`nextDouble`/`nextLine` to what the user types, or read a line and parse it yourself.");
        }
        if (lower.contains("nosuchelementexception")) {
            return Explained.of(
                    "The program tried to read more input than was available.",
                    "Provide the needed input in the Output reply box, or check for an extra `next...()` call.");
        }
        if (lower.contains("arithmeticexception")) {
            return Explained.of(
                    "A math error happened (often dividing by zero).",
                    "Guard against a zero divisor before dividing.");
        }
        if (lower.contains("numberformatexception")) {
            return Explained.of(
                    "Text could not be turned into a number.",
                    "Trim the string and confirm it only contains digits (and an optional decimal) before parsing.");
        }
        if (lower.contains("classcastexception")) {
            return Explained.of(
                    "An object was cast to the wrong type.",
                    "Check `instanceof` before casting, or store the value with the correct type.");
        }
        if (lower.contains("concurrentmodificationexception")) {
            return Explained.of(
                    "A collection was changed while being looped over.",
                    "Do not add/remove inside a for-each; use an Iterator or collect changes and apply them after.");
        }
        if (lower.contains("stackoverflowerror")) {
            return Explained.of(
                    "Too many nested method calls — often endless recursion.",
                    "Add a base case that stops calling itself, or fix a method that calls itself by accident.");
        }
        return null;
    }

    private static String hintForMissingSymbol(String kind, String name) {
        String simple = name.contains("(") ? name.substring(0, name.indexOf('(')).trim() : name.trim();
        return switch (kind.toLowerCase(Locale.ROOT)) {
            case "variable" -> "Declare `" + simple + "` before using it, or fix a typo in the name.";
            case "method" -> "Define the method, fix the spelling, or check the argument list matches.";
            case "class", "interface", "enum" -> "Add `import ...." + simple + ";` (Java → Suggest import), or create that type in your project.";
            case "package" -> "Fix the package name in the import, or remove a bad import.";
            case "constructor" -> "Add a constructor that matches these arguments, or change `new` to match an existing one.";
            default -> "Check spelling, imports, and that the name is in scope.";
        };
    }

    private static String simpleName(String qname) {
        int dot = qname.lastIndexOf('.');
        return dot >= 0 ? qname.substring(dot + 1) : qname;
    }
}
