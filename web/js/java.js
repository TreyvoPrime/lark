/* Parses Java for outline, mains, completion, accessors, and light warnings. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LarkJava = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const KEYWORDS = new Set([
    "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
    "class", "const", "continue", "default", "do", "double", "else", "enum",
    "extends", "final", "finally", "float", "for", "goto", "if", "implements",
    "import", "instanceof", "int", "interface", "long", "native", "new",
    "package", "private", "protected", "public", "return", "short", "static",
    "strictfp", "super", "switch", "synchronized", "this", "throw", "throws",
    "transient", "try", "void", "volatile", "while", "var", "record", "yield",
    "sealed", "permits", "non-sealed", "true", "false", "null"
  ]);

  const TYPE_WORDS = new Set([
    "void", "boolean", "byte", "char", "short", "int", "long", "float", "double",
    "String", "Object", "Integer", "Double", "Boolean", "Long", "Character",
    "Float", "Short", "Byte", "List", "ArrayList", "Map", "HashMap", "Set",
    "HashSet", "Optional", "Scanner", "System", "Math", "Arrays", "Collections"
  ]);

  const EXPLAIN = {
    private: "private means only code inside this class can use the member. Other classes must go through public methods.",
    public: "public means any class can use this member. Use it for constructors and methods you want callers to reach.",
    static: "static belongs to the class itself, not one object. Call it with ClassName.method() without creating an instance.",
    this: "this refers to the current object. Use it when a parameter name matches a field, like this.title = title.",
    override: "@Override tells the compiler you mean to replace a superclass method — it catches typos in the method name.",
    final: "final means the variable can be assigned only once. On a class it means no subclasses; on a method it means no overrides.",
    extends: "extends means this class inherits fields and methods from another class (one parent only).",
    implements: "implements means this class promises to provide the methods listed in an interface.",
    super: "super refers to the parent class — use super() in a constructor or super.method() to call the parent's version."
  };

  /** Autofill snippets: trigger prefix → insert text + short label. */
  const SNIPPETS = [
    { id: "main", trigger: "main", label: "main method", text:
      "public static void main(String[] args) {\n    \n}" },
    { id: "sout", trigger: "sout", label: "println", text: "System.out.println();" },
    { id: "souf", trigger: "souf", label: "printf", text: "System.out.printf(\"%s%n\", );" },
    { id: "serr", trigger: "serr", label: "print error", text: "System.err.println();" },
    { id: "fori", trigger: "fori", label: "for i loop", text:
      "for (int i = 0; i < n; i++) {\n    \n}" },
    { id: "foreach", trigger: "foreach", label: "for-each loop", text:
      "for (Type item : collection) {\n    \n}" },
    { id: "while", trigger: "while", label: "while loop", text:
      "while (condition) {\n    \n}" },
    { id: "dowhile", trigger: "dowhile", label: "do-while loop", text:
      "do {\n    \n} while (condition);" },
    { id: "if", trigger: "if", label: "if statement", text:
      "if (condition) {\n    \n}" },
    { id: "ife", trigger: "ife", label: "if / else", text:
      "if (condition) {\n    \n} else {\n    \n}" },
    { id: "switch", trigger: "switch", label: "switch", text:
      "switch (value) {\n    case 1:\n        break;\n    default:\n        break;\n}" },
    { id: "try", trigger: "try", label: "try / catch", text:
      "try {\n    \n} catch (Exception e) {\n    System.out.println(e.getMessage());\n}" },
    { id: "tryr", trigger: "tryr", label: "try-with-resources", text:
      "try (Scanner in = new Scanner(System.in)) {\n    \n}" },
    { id: "scanner", trigger: "scanner", label: "Scanner input", text:
      "Scanner in = new Scanner(System.in);\nString line = in.nextLine();" },
    { id: "list", trigger: "list", label: "ArrayList", text:
      "List<String> list = new ArrayList<>();" },
    { id: "map", trigger: "map", label: "HashMap", text:
      "Map<String, Integer> map = new HashMap<>();" },
    { id: "arr", trigger: "arr", label: "int array", text:
      "int[] nums = new int[10];" },
    { id: "class", trigger: "class", label: "simple class", text:
      "public class Name {\n    \n}" },
    { id: "record", trigger: "record", label: "record", text:
      "public record Name(String field) {\n}" },
    { id: "equalshash", trigger: "equalshash", label: "equals + hashCode stubs", text:
      "@Override\npublic boolean equals(Object o) {\n    if (this == o) return true;\n    if (o == null || getClass() != o.getClass()) return false;\n    Name other = (Name) o;\n    return true;\n}\n\n@Override\npublic int hashCode() {\n    return Objects.hash();\n}" },
    { id: "tostring", trigger: "tostring", label: "toString stub", text:
      "@Override\npublic String toString() {\n    return \"Name{}\";\n}" },
    { id: "javadoc", trigger: "javadoc", label: "Javadoc", text:
      "/**\n * \n * @param \n * @return \n */" }
  ];

  function blankNoise(source) {
    const out = source.split("");
    let i = 0;
    const n = out.length;
    while (i < n) {
      const c = out[i];
      const next = out[i + 1];
      if (c === "/" && next === "/") {
        out[i] = out[i + 1] = " ";
        i += 2;
        while (i < n && out[i] !== "\n") out[i++] = " ";
        continue;
      }
      if (c === "/" && next === "*") {
        out[i] = out[i + 1] = " ";
        i += 2;
        while (i < n && !(out[i] === "*" && out[i + 1] === "/")) {
          if (out[i] !== "\n") out[i] = " ";
          i++;
        }
        if (i < n) out[i++] = " ";
        if (i < n) out[i++] = " ";
        continue;
      }
      if (c === '"') {
        if (out[i + 1] === '"' && out[i + 2] === '"') {
          out[i] = out[i + 1] = out[i + 2] = " ";
          i += 3;
          while (i < n && !(out[i] === '"' && out[i + 1] === '"' && out[i + 2] === '"')) {
            if (out[i] !== "\n") out[i] = " ";
            i++;
          }
          if (i < n) out[i++] = " ";
          if (i < n) out[i++] = " ";
          if (i < n) out[i++] = " ";
          continue;
        }
        out[i++] = " ";
        while (i < n && out[i] !== '"' && out[i] !== "\n") {
          if (out[i] === "\\") {
            out[i++] = " ";
            if (i < n && out[i] !== "\n") out[i++] = " ";
          } else out[i++] = " ";
        }
        if (i < n && out[i] === '"') out[i++] = " ";
        continue;
      }
      if (c === "'") {
        out[i++] = " ";
        while (i < n && out[i] !== "'" && out[i] !== "\n") {
          if (out[i] === "\\") {
            out[i++] = " ";
            if (i < n) out[i++] = " ";
          } else out[i++] = " ";
        }
        if (i < n && out[i] === "'") out[i++] = " ";
        continue;
      }
      i++;
    }
    return out.join("");
  }

  function countChar(line, ch) {
    let n = 0;
    for (let i = 0; i < line.length; i++) if (line[i] === ch) n++;
    return n;
  }

  function shortParams(params) {
    if (!params || !params.trim()) return "()";
    const nice = params.split(",").map(function (part) {
      const bits = part.trim().replace(/^final\s+/, "").split(/\s+/).filter(Boolean);
      if (bits.length >= 2) return bits.slice(0, -1).join(" ");
      return bits[0] || "";
    });
    return "(" + nice.join(", ") + ")";
  }

  function matchType(line) {
    const match = line.match(/^\s*(?:@[\w.]+\s*)*(?:(?:public|protected|private|abstract|final|static|sealed|non-sealed)\s+)*(class|interface|enum|record)\s+([A-Za-z_]\w*)/);
    if (!match) return null;
    return { kind: match[1], name: match[2] };
  }

  function matchMethod(line, stack) {
    const stripped = line.replace(/^(?:\s*@[\w.]+\s*)+/, "");
    if (/\b(class|interface|enum|record)\b/.test(stripped)) return null;
    // Constructors first: ClassName(...) with no return type.
    if (stack.length) {
      const ctor = stripped.match(/^\s*((?:(?:public|protected|private)\s+)*)([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:throws\s+[^{;]+)?\s*(?:[{;].*)?$/);
      if (ctor && !KEYWORDS.has(ctor[2]) && ctor[2] === stack[stack.length - 1].name) {
        return {
          kind: "ctor",
          name: ctor[2],
          params: ctor[3].trim(),
          ret: "",
          mods: ctor[1].trim().split(/\s+/).filter(Boolean),
          detail: shortParams(ctor[3]),
          signature: ctor[2] + shortParams(ctor[3])
        };
      }
    }
    const match = stripped.match(/^\s*((?:(?:public|protected|private|static|final|abstract|synchronized|native|default)\s+)*)(?:<[^;]+>\s*)?([A-Za-z_][\w.<>,\[\]?]*)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:throws\s+[^{;]+)?\s*(?:[{;].*)?$/);
    if (match && match[2] && !KEYWORDS.has(match[3])) {
      const mods = match[1].trim().split(/\s+/).filter(Boolean);
      return {
        kind: "method",
        name: match[3],
        params: match[4].trim(),
        ret: match[2].trim(),
        mods: mods,
        detail: shortParams(match[4]),
        signature: match[2].trim() + " " + match[3] + shortParams(match[4])
      };
    }
    return null;
  }

  function matchField(line) {
    const head = line.split("=")[0];
    if (head.includes("(") || head.includes(")")) return null;
    const match = head.match(/^\s*(?:@[\w.]+\s*)*((?:(?:public|protected|private|static|final|transient|volatile)\s+)*)([A-Za-z_][\w.<>,\[\]?]*)\s+([A-Za-z_]\w*)\s*;?\s*$/);
    if (!match) return null;
    // Type names may be primitives (int, boolean). Only reject bad field names.
    if (KEYWORDS.has(match[3])) return null;
    if (match[2] === match[3]) return null;
    return {
      type: match[2],
      name: match[3],
      mods: match[1].trim().split(/\s+/).filter(Boolean)
    };
  }

  function capitalize(name) {
    if (!name) return name;
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function getterName(field) {
    const isBool = field.type === "boolean" || field.type === "Boolean";
    const base = capitalize(field.name);
    if (isBool && /^is[A-Z]/.test(field.name)) return field.name;
    return isBool ? "is" + base : "get" + base;
  }

  function setterName(field) {
    return "set" + capitalize(field.name);
  }

  function analyzeAccessors(symbols) {
    const methods = symbols.filter((s) => s.kind === "method");
    const fields = symbols.filter((s) => s.kind === "field");
    return fields.map((field) => {
      const get = getterName(field);
      const set = setterName(field);
      const hasGetter = methods.some((m) => m.name === get && (!m.params || !m.params.trim()));
      const hasSetter = methods.some((m) => m.name === set);
      return {
        field: field,
        getter: get,
        setter: set,
        hasGetter: hasGetter,
        hasSetter: hasSetter
      };
    });
  }

  function accessorWarnings(symbols) {
    const warnings = [];
    analyzeAccessors(symbols).forEach((info) => {
      const field = info.field;
      const isPrivate = (field.mods || []).indexOf("private") >= 0;
      if (!isPrivate) return;
      if ((field.mods || []).indexOf("static") >= 0) return;
      if (!info.hasGetter && !info.hasSetter) {
        warnings.push({
          severity: "warning",
          line: field.line,
          column: 1,
          message: "Private field '" + field.name + "' has no getter or setter. Other classes cannot read or change it.",
          plain: "`" + field.name + "` is private, so other classes cannot reach it yet.",
          hint: "Use Java → Generate getters / setters, or Java → Quick fix: missing accessors.",
          code: "missing-accessors",
          field: field.name
        });
      } else if (!info.hasGetter) {
        warnings.push({
          severity: "warning",
          line: field.line,
          column: 1,
          message: "Private field '" + field.name + "' has no getter (" + info.getter + ").",
          plain: "`" + field.name + "` is private and has no getter method.",
          hint: "Add `" + info.getter + "()` via Java → Generate getters / setters.",
          code: "missing-getter",
          field: field.name
        });
      }
    });
    return warnings;
  }

  function braceWarnings(source) {
    const clean = blankNoise(source || "");
    let depth = 0;
    let paren = 0;
    let maxLine = 1;
    for (let i = 0; i < clean.length; i++) {
      const c = clean[i];
      if (c === "\n") maxLine++;
      if (c === "{") depth++;
      if (c === "}") depth--;
      if (c === "(") paren++;
      if (c === ")") paren--;
      if (depth < 0 || paren < 0) {
        return [{
          severity: "error",
          line: maxLine,
          column: 1,
          message: "Unbalanced braces or parentheses near this line.",
          plain: "A `{`, `}`, `(`, or `)` does not match near this line.",
          hint: "Count braces from the top of the class. Every opener needs a closer.",
          code: "unbalanced"
        }];
      }
    }
    const out = [];
    if (depth !== 0) {
      out.push({
        severity: "error",
        line: maxLine,
        column: 1,
        message: depth > 0 ? "Missing closing brace(s)." : "Extra closing brace(s).",
        plain: depth > 0
          ? "This file is missing " + depth + " closing brace(s) `}`."
          : "This file has extra closing brace(s) `}`.",
        hint: "Scroll to the end of the class and add or remove `}` until the structure matches.",
        code: "unbalanced-brace"
      });
    }
    if (paren !== 0) {
      out.push({
        severity: "error",
        line: maxLine,
        column: 1,
        message: paren > 0 ? "Missing closing parenthesis." : "Extra closing parenthesis.",
        plain: paren > 0
          ? "A `(` was never closed with `)`."
          : "There is an extra `)` without a matching `(`.",
        hint: "Check method calls and if/for conditions on recent lines.",
        code: "unbalanced-paren"
      });
    }
    return out;
  }

  function styleWarnings(source) {
    const out = [];
    const lines = (source || "").split("\n");
    lines.forEach((line, i) => {
      const lineNo = i + 1;
      // String compared with == "literal" or "literal" ==
      if (/(["'][^"']*["'])\s*==\s*\w|\w\s*==\s*(["'][^"']*["'])/.test(line) && !/==\s*null|null\s*==/.test(line)) {
        out.push({
          severity: "warning",
          line: lineNo,
          column: 1,
          message: "Comparing Strings with == checks the same object, not the same text.",
          plain: "You are comparing text with `==`. That often fails even when the words look the same.",
          hint: "Use `.equals(\"text\")` (or `Objects.equals(a, b)`) for String content.",
          code: "string-eq"
        });
      }
      if (/\b(if|for|while)\s*\([^;]*\)\s*;\s*$/.test(line)) {
        out.push({
          severity: "warning",
          line: lineNo,
          column: 1,
          message: "Empty statement after if/for/while — the next line is not inside the loop.",
          plain: "There is a `;` right after `if`/`for`/`while`, so the body never runs as part of it.",
          hint: "Remove that semicolon and put `{ ... }` on the following lines.",
          code: "empty-control"
        });
      }
    });
    return out;
  }

  function parseJava(source) {
    const clean = blankNoise(source || "");
    const lines = clean.split("\n");
    let pkg = "";
    const pkgMatch = clean.match(/(?:^|\n)\s*package\s+([A-Za-z_][\w.]*)\s*;/);
    if (pkgMatch) pkg = pkgMatch[1];
    const imports = [];
    const importRe = /(?:^|\n)\s*import\s+(static\s+)?([A-Za-z_][\w.]*(?:\.\*)?)\s*;/g;
    let imp;
    while ((imp = importRe.exec(clean))) imports.push(imp[2]);
    const symbols = [];
    const mains = [];
    const stack = [];
    let depth = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNo = i + 1;
      const type = matchType(line);
      const method = type ? null : matchMethod(line, stack);
      const field = type || method ? null : matchField(line);
      if (type) {
        symbols.push({ kind: type.kind, name: type.name, line: lineNo, indent: stack.length, detail: "" });
        stack.push({ name: type.name, depth: depth, kind: type.kind });
      } else if (method && stack.length) {
        symbols.push({
          kind: method.kind,
          name: method.name,
          line: lineNo,
          indent: stack.length,
          detail: method.detail,
          mods: method.mods,
          ret: method.ret,
          params: method.params,
          signature: method.signature
        });
        const isMain = method.kind === "method"
          && method.name === "main"
          && method.mods.indexOf("static") >= 0
          && method.ret === "void"
          && /String\s*(?:\[\s*\]|\.\.\.)/.test(method.params);
        if (isMain) {
          const current = stack[stack.length - 1].name;
          const qualified = pkg ? pkg + "." + current : current;
          if (mains.indexOf(qualified) < 0) mains.push(qualified);
        }
      } else if (field && stack.length) {
        symbols.push({
          kind: "field",
          name: field.name,
          line: lineNo,
          indent: stack.length,
          detail: field.type,
          type: field.type,
          mods: field.mods
        });
      }
      depth += countChar(line, "{") - countChar(line, "}");
      if (depth < 0) depth = 0;
      while (stack.length && depth <= stack[stack.length - 1].depth) stack.pop();
    }
    const warnings = accessorWarnings(symbols)
      .concat(braceWarnings(source))
      .concat(styleWarnings(source));
    return {
      pkg: pkg,
      imports: imports,
      symbols: symbols,
      mains: mains,
      warnings: warnings,
      accessors: analyzeAccessors(symbols)
    };
  }

  function explain(word) {
    return EXPLAIN[word] || null;
  }

  function generateGetterSetter(fields, wantGetters, wantSetters) {
    const chunks = [];
    fields.forEach((field) => {
      const type = field.type || field.detail || "Object";
      const name = field.name;
      if (wantGetters) {
        const get = getterName({ type: type, name: name });
        chunks.push(
          "    public " + type + " " + get + "() {\n" +
          "        return " + name + ";\n" +
          "    }\n"
        );
      }
      if (wantSetters && (field.mods || []).indexOf("final") < 0) {
        const set = setterName({ name: name });
        chunks.push(
          "    public void " + set + "(" + type + " " + name + ") {\n" +
          "        this." + name + " = " + name + ";\n" +
          "    }\n"
        );
      }
    });
    return chunks.join("\n");
  }

  function generateConstructor(className, fields) {
    const params = fields.map((f) => (f.type || f.detail || "Object") + " " + f.name).join(", ");
    const body = fields.map((f) => "        this." + f.name + " = " + f.name + ";").join("\n");
    return (
      "    public " + className + "(" + params + ") {\n" +
      (body ? body + "\n" : "") +
      "    }\n"
    );
  }

  function generateMain() {
    return (
      "    public static void main(String[] args) {\n" +
      "        \n" +
      "    }\n"
    );
  }

  function generateToString(className, fields) {
    const list = fields || [];
    let expr;
    if (!list.length) {
      expr = "\"" + className + "{}\"";
    } else {
      const chunks = ["\"" + className + "{\""];
      list.forEach((f, i) => {
        if (i > 0) chunks.push("\", \"");
        chunks.push("\"" + f.name + "=\" + " + f.name);
      });
      chunks.push("\"}\"");
      expr = chunks.join(" + ");
    }
    return (
      "    @Override\n" +
      "    public String toString() {\n" +
      "        return " + expr + ";\n" +
      "    }\n"
    );
  }

  function generateEqualsHashCode(className, fields) {
    const list = fields || [];
    const eqs = list.map((f) => {
      const t = f.type || f.detail || "";
      if (/^(int|long|short|byte|char|boolean|float|double)$/.test(t)) {
        return "                " + f.name + " == other." + f.name;
      }
      return "                Objects.equals(" + f.name + ", other." + f.name + ")";
    });
    const eqBody = eqs.length ? eqs.join(" &&\n") : "                true";
    const hashArgs = list.map((f) => f.name).join(", ");
    return (
      "    @Override\n" +
      "    public boolean equals(Object o) {\n" +
      "        if (this == o) return true;\n" +
      "        if (o == null || getClass() != o.getClass()) return false;\n" +
      "        " + className + " other = (" + className + ") o;\n" +
      "        return\n" + eqBody + ";\n" +
      "    }\n\n" +
      "    @Override\n" +
      "    public int hashCode() {\n" +
      "        return Objects.hash(" + hashArgs + ");\n" +
      "    }\n"
    );
  }

  function classSummary(parsed) {
    const types = parsed.symbols.filter((s) => s.kind === "class" || s.kind === "interface" || s.kind === "enum" || s.kind === "record");
    const fields = parsed.symbols.filter((s) => s.kind === "field");
    const ctors = parsed.symbols.filter((s) => s.kind === "ctor");
    const methods = parsed.symbols.filter((s) => s.kind === "method");
    return {
      types: types,
      fields: fields,
      constructors: ctors,
      methods: methods
    };
  }

  function suggestImports(token, projectTypes) {
    const known = {
      Scanner: "java.util.Scanner",
      List: "java.util.List",
      ArrayList: "java.util.ArrayList",
      Map: "java.util.Map",
      HashMap: "java.util.HashMap",
      Set: "java.util.Set",
      HashSet: "java.util.HashSet",
      Optional: "java.util.Optional",
      Arrays: "java.util.Arrays",
      Collections: "java.util.Collections",
      Objects: "java.util.Objects",
      LocalDate: "java.time.LocalDate",
      LocalDateTime: "java.time.LocalDateTime",
      Path: "java.nio.file.Path",
      Files: "java.nio.file.Files",
      Random: "java.util.Random",
      Comparator: "java.util.Comparator",
      StringBuilder: "java.lang.StringBuilder",
      IOException: "java.io.IOException",
      File: "java.io.File",
      PrintWriter: "java.io.PrintWriter"
    };
    const out = [];
    if (known[token]) out.push(known[token]);
    (projectTypes || []).forEach((t) => {
      if (t.name === token && t.pkg) out.push(t.pkg + "." + t.name);
    });
    return out;
  }

  function matchingSnippets(prefix) {
    const lower = (prefix || "").toLowerCase();
    return SNIPPETS.filter((s) => !lower || s.trigger.startsWith(lower) || s.label.toLowerCase().includes(lower));
  }

  return {
    parseJava: parseJava,
    blankNoise: blankNoise,
    keywords: Array.from(KEYWORDS).sort(),
    typeWords: Array.from(TYPE_WORDS).sort(),
    snippets: SNIPPETS.slice(),
    matchingSnippets: matchingSnippets,
    explain: explain,
    generateGetterSetter: generateGetterSetter,
    generateConstructor: generateConstructor,
    generateMain: generateMain,
    generateToString: generateToString,
    generateEqualsHashCode: generateEqualsHashCode,
    classSummary: classSummary,
    suggestImports: suggestImports,
    getterName: getterName,
    setterName: setterName,
    capitalize: capitalize
  };
});
