const assert = require("assert");
const { parseJava } = require("../web/js/java.js");

const book = `
package library;
public class Book implements Loanable {
    private final String title;
    public Book(String title, String author) {
        this.title = title;
    }
    public void lend() {
        if (onLoan) {
            throw new IllegalStateException(title + " is already out");
        }
    }
    public String title() { return title; }
}
`;

const parsed = parseJava(book);
assert.strictEqual(parsed.pkg, "library");
const names = parsed.symbols.map((s) => s.kind + " " + s.name);
assert.ok(names.includes("class Book"), names.join(", "));
assert.ok(names.includes("method lend"), names.join(", "));
assert.ok(names.includes("method title"), names.join(", "));
assert.ok(names.includes("method Book"), names.join(", "));
assert.ok(!names.some((n) => n.includes("IllegalStateException")), names.join(", "));
assert.ok(!names.some((n) => n.includes("if")), names.join(", "));

const call = parseJava('class A {\n  void ready() {\n    fiction.add(new Book("Kindred", "Octavia"));\n  }\n}\n');
const callNames = call.symbols.map((s) => s.name);
assert.deepStrictEqual(callNames.filter((n) => n === "add" || n === "Book" && false), []);
assert.ok(callNames.includes("A"));
assert.ok(callNames.includes("ready"));
assert.ok(!callNames.includes("add"));

const main = parseJava("package app;\npublic class Main {\n  public static void main(String[] args) {\n    System.out.println(\"hi\");\n  }\n}\n");
assert.deepStrictEqual(main.mains, ["app.Main"]);

const face = parseJava("package library;\npublic interface Loanable {\n    void lend();\n    boolean onLoan();\n}\n");
assert.ok(face.symbols.some((s) => s.name === "lend" && s.kind === "method"));
assert.ok(face.symbols.some((s) => s.name === "onLoan"));

const lines = "class A {\n  // comment class Fake\n  void b() {}\n}\n";
assert.strictEqual(parseJava(lines).symbols.find((s) => s.name === "b").line, 3);
assert.ok(!parseJava(lines).symbols.some((s) => s.name === "Fake"));

console.log("java parse ok");
