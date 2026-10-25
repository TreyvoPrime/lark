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
    { id: "matrix", trigger: "matrix", label: "matrix print (nested loops)", text:
      "int[][] matrix = {\n    {1, 2, 3},\n    {4, 5, 6},\n    {7, 8, 9}\n};\n" +
      "for (int i = 0; i < matrix.length; i++) {\n" +
      "    for (int j = 0; j < matrix[i].length; j++) {\n" +
      "        System.out.print(matrix[i][j] + \" \");\n" +
      "    }\n" +
      "    System.out.println();\n" +
      "}" },
    { id: "matblock", trigger: "matblock", label: "matrix print loops only", text:
      "for (int i = 0; i < matrix.length; i++) {\n" +
      "    for (int j = 0; j < matrix[i].length; j++) {\n" +
      "        System.out.print(matrix[i][j] + \" \");\n" +
      "    }\n" +
      "    System.out.println();\n" +
      "}" },
    { id: "arrfill", trigger: "arrfill", label: "fill + print 1D array (Scanner)", text: null },
    { id: "arrstats", trigger: "arrstats", label: "array sum / average / min / max", text: null },
    { id: "linsearch", trigger: "linsearch", label: "linear search", text: null },
    { id: "countocc", trigger: "countocc", label: "count occurrences", text: null },
    { id: "sentinel", trigger: "sentinel", label: "read until sentinel", text: null },
    { id: "menu", trigger: "menu", label: "menu loop (do / switch)", text: null },
    { id: "fileio", trigger: "fileio", label: "file read / write", text: null },
    { id: "splitloop", trigger: "splitloop", label: "String split + loop", text: null },
    { id: "matfill", trigger: "matfill", label: "2D array fill (nested loops)", text: null },
    { id: "arrcopy", trigger: "arrcopy", label: "copy array", text: null },
    { id: "arrrev", trigger: "arrrev", label: "reverse array", text: null },
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
          hint: "Use Assist → Generate getters / setters, or Assist → Quick fix: missing accessors.",
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
          hint: "Add `" + info.getter + "()` via Assist → Generate getters / setters.",
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
      // Allow `;` inside for(;;) headers — only flag a trailing `;` after the closing `)`.
      if (/\b(if|for|while)\s*\([\s\S]*\)\s*;\s*$/.test(line) && !/\b(if|for|while)\s*\([\s\S]*\)\s*\{\s*$/.test(line)) {
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
    const warnings = braceWarnings(source)
      .concat(styleWarnings(source))
      .concat(unusedImportWarnings(source, imports, clean))
      .concat(overrideWarnings(source, symbols, lines))
      .concat(accessorWarnings(symbols));
    return {
      pkg: pkg,
      imports: imports,
      symbols: symbols,
      mains: mains,
      warnings: warnings,
      accessors: analyzeAccessors(symbols)
    };
  }

  function unusedImportWarnings(source, imports, clean) {
    const out = [];
    const lines = (source || "").split("\n");
    imports.forEach((imp) => {
      if (!imp || imp.endsWith(".*")) return;
      const simple = imp.includes(".") ? imp.slice(imp.lastIndexOf(".") + 1) : imp;
      if (!simple || KEYWORDS.has(simple)) return;
      const re = new RegExp("\\b" + simple.replace(/\$/g, "\\$") + "\\b");
      let uses = 0;
      const importLineRe = new RegExp("import\\s+(?:static\\s+)?" + imp.replace(/\./g, "\\.") + "\\s*;");
      lines.forEach((line) => {
        if (importLineRe.test(line)) return;
        if (re.test(blankNoise(line))) uses++;
      });
      if (uses > 0) return;
      let lineNo = 1;
      for (let i = 0; i < lines.length; i++) {
        if (importLineRe.test(lines[i])) {
          lineNo = i + 1;
          break;
        }
      }
      out.push({
        severity: "warning",
        line: lineNo,
        column: 1,
        message: "Unused import: " + imp,
        plain: "`" + simple + "` is imported but never used in this file.",
        hint: "Remove the unused import, or use the type somewhere.",
        code: "unused-import",
        importName: imp
      });
    });
    return out;
  }

  function overrideWarnings(source, symbols, lines) {
    const out = [];
    const methods = (symbols || []).filter((s) => s.kind === "method");
    const common = new Set(["toString", "equals", "hashCode", "compareTo", "clone", "finalize"]);
    methods.forEach((m) => {
      if (!common.has(m.name)) return;
      const line = lines[m.line - 1] || "";
      const prev = lines[m.line - 2] || "";
      if (/@Override\b/.test(line) || /@Override\b/.test(prev)) return;
      out.push({
        severity: "warning",
        line: m.line,
        column: 1,
        message: "Method " + m.name + " looks like an override without @Override.",
        plain: "`" + m.name + "` usually overrides a parent method — add `@Override`.",
        hint: "Put `@Override` on the line above this method.",
        code: "missing-override",
        methodName: m.name
      });
    });
    return out;
  }

  function wordAt(source, line, column) {
    const lines = (source || "").split("\n");
    const text = lines[Math.max(0, line - 1)] || "";
    const ch = Math.max(0, Math.min(column - 1, text.length));
    let start = ch;
    let end = ch;
    while (start > 0 && /[A-Za-z0-9_$]/.test(text[start - 1])) start--;
    while (end < text.length && /[A-Za-z0-9_$]/.test(text[end])) end++;
    const word = text.slice(start, end);
    return { word: word, start: start + 1, end: end + 1, line: line };
  }

  function buildIndex(files) {
    const defs = [];
    (files || []).forEach((file) => {
      if (!file || !file.path || !String(file.path).endsWith(".java")) return;
      const parsed = parseJava(file.content || "");
      const typeName = (() => {
        const t = parsed.symbols.find((s) => s.indent === 0 && (s.kind === "class" || s.kind === "interface" || s.kind === "enum" || s.kind === "record"));
        return t ? t.name : "";
      })();
      const qualified = parsed.pkg && typeName ? parsed.pkg + "." + typeName : typeName;
      parsed.symbols.forEach((sym) => {
        defs.push({
          name: sym.name,
          kind: sym.kind,
          file: file.path,
          line: sym.line,
          detail: sym.detail || "",
          signature: sym.signature || "",
          typeName: typeName,
          qualified: qualified,
          pkg: parsed.pkg || ""
        });
      });
      if (typeName) {
        defs.push({
          name: typeName,
          kind: "type",
          file: file.path,
          line: (parsed.symbols.find((s) => s.name === typeName) || { line: 1 }).line,
          detail: qualified,
          signature: "",
          typeName: typeName,
          qualified: qualified,
          pkg: parsed.pkg || ""
        });
      }
    });
    return defs;
  }

  function findDefinitions(files, name, preferFile) {
    if (!name) return [];
    const index = buildIndex(files);
    const exact = index.filter((d) => d.name === name);
    if (!exact.length) return [];
    const prefer = preferFile
      ? exact.filter((d) => d.file === preferFile).concat(exact.filter((d) => d.file !== preferFile))
      : exact;
    // Prefer type/method/field over duplicate type entries
    const rank = { class: 0, interface: 0, enum: 0, record: 0, type: 1, ctor: 2, method: 3, field: 4 };
    prefer.sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9));
    const seen = new Set();
    return prefer.filter((d) => {
      const key = d.file + ":" + d.line + ":" + d.kind + ":" + d.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function findUsages(files, name) {
    if (!name || KEYWORDS.has(name)) return [];
    const re = new RegExp("\\b" + name.replace(/\$/g, "\\$") + "\\b", "g");
    const hits = [];
    (files || []).forEach((file) => {
      if (!file || !file.path || !String(file.path).endsWith(".java")) return;
      const lines = (file.content || "").split("\n");
      const cleanLines = blankNoise(file.content || "").split("\n");
      for (let i = 0; i < lines.length; i++) {
        const clean = cleanLines[i] || "";
        let m;
        re.lastIndex = 0;
        while ((m = re.exec(clean))) {
          hits.push({
            file: file.path,
            line: i + 1,
            column: m.index + 1,
            text: lines[i].trim()
          });
        }
      }
    });
    return hits;
  }

  function renameInSource(source, oldName, newName) {
    if (!oldName || !newName || oldName === newName) return source;
    if (!/^[A-Za-z_][\w$]*$/.test(newName) || KEYWORDS.has(newName)) return source;
    if (!/^[A-Za-z_][\w$]*$/.test(oldName)) return source;
    const re = new RegExp("\\b" + oldName.replace(/\$/g, "\\$") + "\\b", "g");
    return replaceOutsideStrings(source || "", re, newName);
  }

  function renameAcross(files, oldName, newName) {
    const changes = [];
    (files || []).forEach((file) => {
      if (!file || !file.path || !String(file.path).endsWith(".java")) return;
      const next = renameInSource(file.content || "", oldName, newName);
      if (next !== (file.content || "")) {
        changes.push({ path: file.path, content: next, before: file.content || "" });
      }
    });
    return changes;
  }

  function fuzzyScore(query, text) {
    const q = (query || "").toLowerCase();
    const t = (text || "").toLowerCase();
    if (!q) return 1;
    if (t === q) return 1000;
    if (t.startsWith(q)) return 800 - (t.length - q.length);
    if (t.includes(q)) return 500 - t.indexOf(q);
    let ti = 0;
    let score = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const ch = q[qi];
      const found = t.indexOf(ch, ti);
      if (found < 0) return 0;
      score += 10 - Math.min(9, found - ti);
      ti = found + 1;
    }
    const base = text.includes("/") ? text.slice(text.lastIndexOf("/") + 1) : text;
    if (base.toLowerCase().startsWith(q)) score += 40;
    return score;
  }

  /** Index of the top-level type's closing `}`, ignoring braces in strings/comments. */
  function classCloseIndex(source) {
    const clean = blankNoise(source || "");
    let depth = 0;
    let opened = false;
    for (let i = 0; i < clean.length; i++) {
      const c = clean[i];
      if (c === "{") {
        depth++;
        opened = true;
      } else if (c === "}") {
        depth--;
        if (opened && depth === 0) return i;
      }
    }
    return -1;
  }

  function lineIndexNear(lines, preferredLine, predicate, windowSize) {
    const n = lines.length;
    if (!n) return -1;
    const prefer = Math.max(1, Math.min(n, preferredLine || 1)) - 1;
    if (predicate(lines[prefer], prefer)) return prefer;
    const span = windowSize == null ? 12 : windowSize;
    for (let d = 1; d <= span; d++) {
      const a = prefer - d;
      const b = prefer + d;
      if (a >= 0 && predicate(lines[a], a)) return a;
      if (b < n && predicate(lines[b], b)) return b;
    }
    for (let i = 0; i < n; i++) {
      if (predicate(lines[i], i)) return i;
    }
    return -1;
  }

  function importNameFromProblem(problem) {
    if (problem && problem.importName) return problem.importName;
    const msg = ((problem && (problem.message || problem.plain)) || "");
    const m = msg.match(/Unused import:\s*([A-Za-z_][\w.]*)/i)
      || msg.match(/import\s+([A-Za-z_][\w.]*)\s+is never used/i)
      || msg.match(/`([A-Za-z_][\w.]*)` is imported but never used/i);
    return m ? m[1] : "";
  }

  function symbolFromCannotFind(problem) {
    if (problem && problem.symbol) return { kind: problem.symbolKind || "class", name: problem.symbol };
    const msg = ((problem && problem.message) || "");
    const m = msg.match(/symbol:\s*(variable|method|class|interface|enum|package|constructor)\s+(\S+)/i);
    if (m) {
      let name = m[2].trim();
      if (name.includes("(")) name = name.slice(0, name.indexOf("(")).trim();
      return { kind: m[1].toLowerCase(), name: name };
    }
    const plain = ((problem && problem.plain) || "");
    const p = plain.match(/cannot find the \w+ `([^`]+)`/i);
    if (p) return { kind: "class", name: p[1].replace(/\(.*$/, "").trim() };
    return null;
  }

  /** Infer a fixable code for javac diagnostics that arrive without one. */
  function inferQuickFixCode(problem) {
    if (!problem) return "";
    if (problem.code) return problem.code;
    const msg = (problem.message || "") + "\n" + (problem.plain || "") + "\n" + (problem.hint || "");
    if (/cannot find symbol/i.test(msg) || /cannot find the (class|interface|enum)/i.test(msg)) {
      const sym = symbolFromCannotFind(problem);
      if (sym && (sym.kind === "class" || sym.kind === "interface" || sym.kind === "enum")) {
        return "add-import";
      }
    }
    if (/Comparing Strings with ==|compare text with `==`|\.equals\(/i.test(msg) && /==/.test(msg)) {
      return "string-eq";
    }
    if (/Empty statement after if\/for\/while|;\s*right after `if`/i.test(msg)) return "empty-control";
    if (/Unused import/i.test(msg)) return "unused-import";
    if (/@Override|looks like an override/i.test(msg)) return "missing-override";
    if (/no getter or setter|missing accessors/i.test(msg)) return "missing-accessors";
    if (/has no getter/i.test(msg)) return "missing-getter";
    if (/is private inside|has private access/i.test(msg)) return "missing-accessors";
    if (/';' expected|expected a semicolon/i.test(msg)) return "add-semicolon";
    if (/missing return statement/i.test(msg)) return "missing-return";
    if (/unreported exception/i.test(msg)) return "add-throws";
    if (/non-static\s+(variable|method).+cannot be referenced from a static context/i.test(msg)
        || /cannot use the instance/i.test(msg)) {
      return "make-static";
    }
    if (/possible lossy conversion from\s+\w+\s+to\s+\w+/i.test(msg)) return "add-cast";
    return "";
  }

  function fixStringEqLine(line) {
    if (!line) return line;
    let next = line;
    // Prefer replacing == with .equals while leaving null checks alone.
    next = next.replace(/(!\s*)?(["'][^"']*["'])\s*==\s*([A-Za-z_]\w*(?:\.\w+)*)/g, function (_, bang, lit, id) {
      if (id === "null") return _;
      return (bang || "") + id + ".equals(" + lit + ")";
    });
    next = next.replace(/(!\s*)?([A-Za-z_]\w*(?:\.\w+)*)\s*==\s*(["'][^"']*["'])/g, function (_, bang, id, lit) {
      if (id === "null") return _;
      return (bang || "") + id + ".equals(" + lit + ")";
    });
    next = next.replace(/(!\s*)?(["'][^"']*["'])\s*!=\s*([A-Za-z_]\w*(?:\.\w+)*)/g, function (_, bang, lit, id) {
      if (id === "null") return _;
      return (bang ? "" : "!") + id + ".equals(" + lit + ")";
    });
    next = next.replace(/(!\s*)?([A-Za-z_]\w*(?:\.\w+)*)\s*!=\s*(["'][^"']*["'])/g, function (_, bang, id, lit) {
      if (id === "null") return _;
      return (bang ? "" : "!") + id + ".equals(" + lit + ")";
    });
    return next;
  }

  /**
   * Apply an automatic fix. Returns { source, note } or null when nothing changed.
   * projectTypes: optional [{name, pkg}] for add-import.
   */
  function applyQuickFix(source, problem, projectTypes) {
    if (!problem) return null;
    const code = inferQuickFixCode(problem) || problem.code || "";
    if (!code) return null;
    const text = source == null ? "" : String(source);
    const lines = text.split("\n");

    if (code === "unused-import") {
      const imp = importNameFromProblem(Object.assign({}, problem, { code: code }));
      if (!imp) return null;
      const re = new RegExp("^\\s*import\\s+(?:static\\s+)?" + imp.replace(/\./g, "\\.") + "\\s*;\\s*$");
      let idx = lineIndexNear(lines, problem.line, (line) => re.test(line));
      if (idx < 0) idx = lineIndexNear(lines, problem.line, (line) => line.indexOf(imp) >= 0 && /^\s*import\b/.test(line));
      if (idx < 0) return null;
      const copy = lines.slice();
      copy.splice(idx, 1);
      if (copy[idx] === "" && (idx === 0 || copy[idx - 1] === "" || /^\s*import\b/.test(copy[idx - 1] || ""))) {
        // keep a single blank between import block and code — drop doubles
        if (copy[idx] === "" && copy[idx - 1] === "") copy.splice(idx, 1);
      }
      return { source: copy.join("\n"), note: "Removed unused import " + imp + "." };
    }

    if (code === "missing-override") {
      const methodName = problem.methodName || "";
      const idx = lineIndexNear(lines, problem.line, (line) => {
        if (methodName) return new RegExp("\\b" + methodName + "\\s*\\(").test(line);
        return /^\s*(?:(?:public|protected|private|static|final)\s+)+.+\(.*\)\s*\{?\s*$/.test(line.trim())
          || /\b(toString|equals|hashCode|compareTo|clone)\s*\(/.test(line);
      });
      if (idx < 0) return null;
      if (/@Override\b/.test(lines[idx]) || (idx > 0 && /@Override\b/.test(lines[idx - 1]))) {
        return null;
      }
      const indent = (lines[idx].match(/^\s*/) || [""])[0];
      const copy = lines.slice();
      copy.splice(idx, 0, indent + "@Override");
      return { source: copy.join("\n"), note: "Added @Override." };
    }

    if (code === "string-eq") {
      const idx = lineIndexNear(lines, problem.line, (line) => {
        return /(["'][^"']*["'])\s*[!=]=\s*\w|\w\s*[!=]=\s*(["'][^"']*["'])/.test(line)
          && !(/[!=]=\s*null|null\s*[!=]=/.test(line) && !/(["'][^"']*["'])/.test(line));
      });
      if (idx < 0) return null;
      const fixed = fixStringEqLine(lines[idx]);
      if (fixed === lines[idx]) return null;
      const copy = lines.slice();
      copy[idx] = fixed;
      return { source: copy.join("\n"), note: "Replaced == with .equals for String text." };
    }

    if (code === "empty-control") {
      const idx = lineIndexNear(lines, problem.line, (line) =>
        /\b(if|for|while)\s*\([\s\S]*\)\s*;\s*$/.test(line));
      if (idx < 0) return null;
      const copy = lines.slice();
      copy[idx] = copy[idx].replace(/\)\s*;\s*$/, ") {");
      const indent = (copy[idx].match(/^\s*/) || [""])[0];
      copy.splice(idx + 1, 0, indent + "    ", indent + "}");
      return { source: copy.join("\n"), note: "Wrapped the empty control statement in braces." };
    }

    if (code === "add-semicolon") {
      const idx = lineIndexNear(lines, problem.line, (line, i) => {
        const t = line.trim();
        if (!t || t.endsWith(";") || t.endsWith("{") || t.endsWith("}") || t.endsWith(",")) return false;
        // Prefer the line above the reported error (javac often points at the next token).
        return true;
      }, 3);
      // Usually the missing ; is on the previous line.
      let target = (problem.line >= 2) ? problem.line - 2 : idx;
      if (target < 0 || target >= lines.length) target = idx;
      if (target < 0) return null;
      // Walk upward from reported line to find a statement missing ;
      for (let i = Math.min(lines.length - 1, (problem.line || 1) - 1); i >= Math.max(0, (problem.line || 1) - 4); i--) {
        const t = lines[i].trim();
        if (!t) continue;
        if (t.endsWith(";") || t.endsWith("{") || t.endsWith("}") || t.endsWith(",") || t.startsWith("@")) continue;
        if (/^(if|for|while|else|try|catch|finally|switch|do)\b/.test(t)) continue;
        const copy = lines.slice();
        copy[i] = lines[i].replace(/\s*$/, ";");
        return { source: copy.join("\n"), note: "Added missing semicolon." };
      }
      return null;
    }

    if (code === "add-import") {
      const sym = symbolFromCannotFind(problem);
      if (!sym || !sym.name) return null;
      const suggestions = suggestImports(sym.name, projectTypes || []);
      if (!suggestions.length) return null;
      const next = ensureImports(text, [suggestions[0]]);
      if (!next) return null;
      return { source: next, note: "Added import " + suggestions[0] + "." };
    }

    if (code === "missing-accessors" || code === "missing-getter") {
      // Caller should generate accessors via generateGetterSetter; we only signal.
      return { source: text, note: "accessors", meta: { field: problem.field || "" } };
    }

    if (code === "missing-return") {
      const idx = lineIndexNear(lines, problem.line, (line) => /\}\s*$/.test(line.trim()), 8);
      // Find the enclosing method signature above the error line.
      let sig = -1;
      const start = Math.max(0, (problem.line || lines.length) - 1);
      for (let i = start; i >= 0; i--) {
        if (/\b(public|protected|private|static|final)\b/.test(lines[i]) && /\(/.test(lines[i]) && !/^\s*if\b/.test(lines[i])) {
          sig = i;
          break;
        }
      }
      if (sig < 0) return null;
      const sigLine = lines[sig];
      let ret = "null";
      if (/\bvoid\b/.test(sigLine)) return null;
      if (/\bboolean\b/.test(sigLine)) ret = "false";
      else if (/\b(int|long|short|byte|char)\b/.test(sigLine)) ret = "0";
      else if (/\b(float|double)\b/.test(sigLine)) ret = "0.0";
      else if (/\bString\b/.test(sigLine)) ret = "\"\"";
      // Insert before the closing brace of the method — prefer the reported line's `}`.
      let close = idx;
      if (close < 0) {
        for (let i = start; i < lines.length; i++) {
          if (/^\s*\}\s*$/.test(lines[i])) { close = i; break; }
        }
      }
      if (close < 0) return null;
      const indent = (lines[close].match(/^\s*/) || [""])[0] + "    ";
      const copy = lines.slice();
      copy.splice(close, 0, indent + "return " + ret + ";");
      return { source: copy.join("\n"), note: "Added a return " + ret + " before the method ends." };
    }

    if (code === "add-throws") {
      const msg = problem.message || "";
      const m = msg.match(/unreported exception\s+([A-Za-z_][\w.]*)/i);
      if (!m) return null;
      const fq = m[1];
      const ex = fq.includes(".") ? fq.slice(fq.lastIndexOf(".") + 1) : fq;
      let sig = -1;
      for (let i = Math.max(0, (problem.line || 1) - 1); i >= Math.max(0, (problem.line || 1) - 40); i--) {
        const t = lines[i].trim();
        if (!t || /^\s*(if|for|while|switch|catch|else|try)\b/.test(t)) continue;
        if (/\(.*\)/.test(lines[i]) && (/\b(void|int|boolean|String|[A-Z]\w*)\b/.test(lines[i]) || /\b(public|private|protected)\b/.test(lines[i]))) {
          sig = i;
          break;
        }
      }
      if (sig < 0) return null;
      const original = lines[sig];
      if (new RegExp("\\bthrows\\b[^{]*\\b" + ex + "\\b").test(original)) return null;
      let rewritten;
      if (/\bthrows\b/.test(original)) {
        rewritten = original.replace(/\bthrows\s+([^{]+)/, function (_, list) {
          const brace = /\{/.test(list) ? " {" : "";
          const parts = list.replace(/\{/, "").split(",").map((s) => s.trim()).filter(Boolean);
          if (parts.indexOf(ex) < 0) parts.push(ex);
          return "throws " + parts.join(", ") + brace;
        });
      } else if (/\{/.test(original)) {
        rewritten = original.replace(/\s*\{/, " throws " + ex + " {");
      } else {
        rewritten = original.replace(/\s*$/, " throws " + ex);
      }
      const copy = lines.slice();
      copy[sig] = rewritten;
      let withImport = copy.join("\n");
      if (fq.includes(".") && !fq.startsWith("java.lang.")) {
        const added = ensureImports(withImport, [fq]);
        if (added) withImport = added;
      }
      return { source: withImport, note: "Declared throws " + ex + "." };
    }

    if (code === "make-static") {
      const msg = problem.message || "";
      const m = msg.match(/non-static\s+(?:variable|method)\s+(\S+)/i)
        || msg.match(/instance (?:variable|method) `([^`]+)`/i);
      const name = m ? m[1].replace(/\(.*$/, "").trim() : "";
      if (!name) return null;
      const idx = lineIndexNear(lines, problem.line, (line) => {
        return new RegExp("\\b" + name.replace(/\$/g, "\\$") + "\\b").test(line)
          && /\b(private|public|protected|int|boolean|void|String|[A-Z]\w*)\b/.test(line)
          && !/\bstatic\b/.test(line);
      }, 80);
      // Search whole file for the field/method declaration.
      let decl = idx;
      if (decl < 0) {
        decl = lineIndexNear(lines, 1, (line) => {
          return new RegExp("\\b" + name.replace(/\$/g, "\\$") + "\\s*[;=(\\[]").test(line)
            && !/\bstatic\b/.test(line)
            && !/^\s*\//.test(line);
        }, 500);
      }
      if (decl < 0) return null;
      const copy = lines.slice();
      if (/\bstatic\b/.test(copy[decl])) return null;
      if (/\b(private|public|protected)\b/.test(copy[decl])) {
        copy[decl] = copy[decl].replace(/\b(private|public|protected)\b/, "$1 static");
      } else {
        copy[decl] = copy[decl].replace(/^(\s*)/, "$1static ");
      }
      return { source: copy.join("\n"), note: "Made `" + name + "` static so main can use it." };
    }

    if (code === "add-cast") {
      const msg = problem.message || "";
      const m = msg.match(/possible lossy conversion from\s+(\w+)\s+to\s+(\w+)/i);
      if (!m) return null;
      const toType = m[2];
      const idx = lineIndexNear(lines, problem.line, () => true, 2);
      if (idx < 0) return null;
      const copy = lines.slice();
      const line = copy[idx];
      // Cast the RHS of an assignment or return when it isn't already cast.
      let next = line.replace(/=\s*(?!\()([^;]+);/, function (_, rhs) {
        if (new RegExp("^\\(\\s*" + toType + "\\s*\\)").test(rhs.trim())) return "= " + rhs + ";";
        return "= (" + toType + ") (" + rhs.trim() + ");";
      });
      if (next === line) {
        next = line.replace(/\breturn\s+(?!\()([^;]+);/, function (_, rhs) {
          return "return (" + toType + ") (" + rhs.trim() + ");";
        });
      }
      if (next === line) return null;
      copy[idx] = next;
      return { source: copy.join("\n"), note: "Added a (" + toType + ") cast." };
    }

    return null;
  }

  /** True when the Problems panel should offer a Quick fix button. */
  function isQuickFixable(problem) {
    const code = inferQuickFixCode(problem);
    return !!code && [
      "unused-import", "missing-override", "string-eq", "empty-control",
      "missing-accessors", "missing-getter", "add-import", "add-semicolon",
      "missing-return", "add-throws", "make-static", "add-cast"
    ].indexOf(code) >= 0;
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

  function ident(name, fallback) {
    const s = String(name == null ? "" : name).replace(/[^\w$]/g, "");
    return s || fallback;
  }

  function intOr(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  /** Nested for-loops that print a 2D int matrix (sample data + print, or loops only). */
  function generateMatrixPrint(varName, includeSample) {
    const name = ident(varName, "matrix");
    const sample =
      "int[][] " + name + " = {\n" +
      "    {1, 2, 3},\n" +
      "    {4, 5, 6},\n" +
      "    {7, 8, 9}\n" +
      "};\n";
    const loops =
      "for (int i = 0; i < " + name + ".length; i++) {\n" +
      "    for (int j = 0; j < " + name + "[i].length; j++) {\n" +
      "        System.out.print(" + name + "[i][j] + \" \");\n" +
      "    }\n" +
      "    System.out.println();\n" +
      "}";
    return (includeSample === false ? "" : sample) + loops;
  }

  const HOMEWORK_BLOCK_IDS = [
    "arrfill", "arrstats", "linsearch", "countocc", "sentinel",
    "menu", "fileio", "splitloop", "matfill", "arrcopy", "arrrev"
  ];

  /** Homework-style multi-line blocks (array fill, search, menu, file I/O, …). */
  function generateHomeworkBlock(kind, options) {
    const opts = options || {};
    switch (String(kind || "")) {
      case "arrfill": {
        const name = ident(opts.name, "nums");
        const size = intOr(opts.size, 10);
        return (
          "Scanner in = new Scanner(System.in);\n" +
          "int[] " + name + " = new int[" + size + "];\n" +
          "System.out.println(\"Enter " + size + " integers:\");\n" +
          "for (int i = 0; i < " + name + ".length; i++) {\n" +
          "    " + name + "[i] = in.nextInt();\n" +
          "}\n" +
          "System.out.print(\"Array: \");\n" +
          "for (int i = 0; i < " + name + ".length; i++) {\n" +
          "    System.out.print(" + name + "[i] + \" \");\n" +
          "}\n" +
          "System.out.println();"
        );
      }
      case "arrstats": {
        const name = ident(opts.name, "nums");
        return (
          "int sum = 0;\n" +
          "int min = " + name + "[0];\n" +
          "int max = " + name + "[0];\n" +
          "for (int i = 0; i < " + name + ".length; i++) {\n" +
          "    sum += " + name + "[i];\n" +
          "    if (" + name + "[i] < min) min = " + name + "[i];\n" +
          "    if (" + name + "[i] > max) max = " + name + "[i];\n" +
          "}\n" +
          "double average = (double) sum / " + name + ".length;\n" +
          "System.out.println(\"Sum: \" + sum);\n" +
          "System.out.println(\"Average: \" + average);\n" +
          "System.out.println(\"Min: \" + min);\n" +
          "System.out.println(\"Max: \" + max);"
        );
      }
      case "linsearch": {
        const name = ident(opts.name, "nums");
        const target = ident(opts.target, "target");
        return (
          "int " + target + " = 0; // value to find\n" +
          "int index = -1;\n" +
          "for (int i = 0; i < " + name + ".length; i++) {\n" +
          "    if (" + name + "[i] == " + target + ") {\n" +
          "        index = i;\n" +
          "        break;\n" +
          "    }\n" +
          "}\n" +
          "if (index >= 0) {\n" +
          "    System.out.println(\"Found at index \" + index);\n" +
          "} else {\n" +
          "    System.out.println(\"Not found\");\n" +
          "}"
        );
      }
      case "countocc": {
        if (String(opts.mode || "array").toLowerCase().indexOf("string") >= 0) {
          const text = ident(opts.name, "text");
          const needle = ident(opts.needle, "ch");
          return (
            "String " + text + " = \"hello\";\n" +
            "char " + needle + " = 'l';\n" +
            "int count = 0;\n" +
            "for (int i = 0; i < " + text + ".length(); i++) {\n" +
            "    if (" + text + ".charAt(i) == " + needle + ") {\n" +
            "        count++;\n" +
            "    }\n" +
            "}\n" +
            "System.out.println(\"Count: \" + count);"
          );
        }
        const name = ident(opts.name, "nums");
        const target = ident(opts.target, "target");
        return (
          "int " + target + " = 0; // value to count\n" +
          "int count = 0;\n" +
          "for (int i = 0; i < " + name + ".length; i++) {\n" +
          "    if (" + name + "[i] == " + target + ") {\n" +
          "        count++;\n" +
          "    }\n" +
          "}\n" +
          "System.out.println(\"Count: \" + count);"
        );
      }
      case "sentinel": {
        if (String(opts.mode || "int").toLowerCase().indexOf("string") >= 0 ||
            String(opts.mode || "").toLowerCase().indexOf("quit") >= 0) {
          return (
            "Scanner in = new Scanner(System.in);\n" +
            "System.out.println(\"Enter words (quit to stop):\");\n" +
            "String word = in.next();\n" +
            "while (!word.equalsIgnoreCase(\"quit\")) {\n" +
            "    System.out.println(\"You typed: \" + word);\n" +
            "    word = in.next();\n" +
            "}"
          );
        }
        return (
          "Scanner in = new Scanner(System.in);\n" +
          "System.out.println(\"Enter integers (-1 to stop):\");\n" +
          "int value = in.nextInt();\n" +
          "while (value != -1) {\n" +
          "    System.out.println(\"You entered: \" + value);\n" +
          "    value = in.nextInt();\n" +
          "}"
        );
      }
      case "menu":
        return (
          "Scanner in = new Scanner(System.in);\n" +
          "boolean done = false;\n" +
          "do {\n" +
          "    System.out.println(\"1) Option A\");\n" +
          "    System.out.println(\"2) Option B\");\n" +
          "    System.out.println(\"3) Quit\");\n" +
          "    System.out.print(\"Choice: \");\n" +
          "    int choice = in.nextInt();\n" +
          "    switch (choice) {\n" +
          "        case 1:\n" +
          "            System.out.println(\"You picked A\");\n" +
          "            break;\n" +
          "        case 2:\n" +
          "            System.out.println(\"You picked B\");\n" +
          "            break;\n" +
          "        case 3:\n" +
          "            done = true;\n" +
          "            break;\n" +
          "        default:\n" +
          "            System.out.println(\"Invalid choice\");\n" +
          "            break;\n" +
          "    }\n" +
          "} while (!done);"
        );
      case "fileio": {
        const mode = String(opts.mode || "both").toLowerCase();
        const readBlock =
          "try (Scanner fileIn = new Scanner(new java.io.File(\"input.txt\"))) {\n" +
          "    while (fileIn.hasNextLine()) {\n" +
          "        String line = fileIn.nextLine();\n" +
          "        System.out.println(line);\n" +
          "    }\n" +
          "}";
        const writeBlock =
          "try (java.io.PrintWriter fileOut = new java.io.PrintWriter(\"output.txt\")) {\n" +
          "    fileOut.println(\"Hello, file!\");\n" +
          "}";
        if (mode.indexOf("read") >= 0 && mode.indexOf("write") < 0 && mode.indexOf("both") < 0) {
          return readBlock;
        }
        if (mode.indexOf("write") >= 0 && mode.indexOf("read") < 0 && mode.indexOf("both") < 0) {
          return writeBlock;
        }
        return readBlock + "\n\n" + writeBlock;
      }
      case "splitloop":
        return (
          "String line = \"apple,banana,cherry\";\n" +
          "String[] parts = line.split(\",\");\n" +
          "for (String part : parts) {\n" +
          "    System.out.println(part);\n" +
          "}"
        );
      case "matfill": {
        const name = ident(opts.name, "matrix");
        const rows = intOr(opts.rows, 3);
        const cols = intOr(opts.cols, 3);
        return (
          "Scanner in = new Scanner(System.in);\n" +
          "int[][] " + name + " = new int[" + rows + "][" + cols + "];\n" +
          "System.out.println(\"Enter " + rows + "x" + cols + " integers:\");\n" +
          "for (int i = 0; i < " + name + ".length; i++) {\n" +
          "    for (int j = 0; j < " + name + "[i].length; j++) {\n" +
          "        " + name + "[i][j] = in.nextInt();\n" +
          "    }\n" +
          "}"
        );
      }
      case "arrcopy": {
        const name = ident(opts.name, "nums");
        const copy = ident(opts.copy, name + "Copy");
        return (
          "int[] " + copy + " = new int[" + name + ".length];\n" +
          "for (int i = 0; i < " + name + ".length; i++) {\n" +
          "    " + copy + "[i] = " + name + "[i];\n" +
          "}"
        );
      }
      case "arrrev": {
        const name = ident(opts.name, "nums");
        return (
          "for (int i = 0; i < " + name + ".length / 2; i++) {\n" +
          "    int temp = " + name + "[i];\n" +
          "    " + name + "[i] = " + name + "[" + name + ".length - 1 - i];\n" +
          "    " + name + "[" + name + ".length - 1 - i] = temp;\n" +
          "}"
        );
      }
      default:
        return "";
    }
  }

  // Fill homework snippet bodies from generators (keeps Ctrl+Space text in sync).
  SNIPPETS.forEach((s) => {
    if (s.text == null && HOMEWORK_BLOCK_IDS.indexOf(s.id) >= 0) {
      s.text = generateHomeworkBlock(s.id, {});
    }
  });

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
      LinkedList: "java.util.LinkedList",
      Map: "java.util.Map",
      HashMap: "java.util.HashMap",
      TreeMap: "java.util.TreeMap",
      Set: "java.util.Set",
      HashSet: "java.util.HashSet",
      TreeSet: "java.util.TreeSet",
      Optional: "java.util.Optional",
      Arrays: "java.util.Arrays",
      Collections: "java.util.Collections",
      Objects: "java.util.Objects",
      LocalDate: "java.time.LocalDate",
      LocalDateTime: "java.time.LocalDateTime",
      LocalTime: "java.time.LocalTime",
      Path: "java.nio.file.Path",
      Paths: "java.nio.file.Paths",
      Files: "java.nio.file.Files",
      Random: "java.util.Random",
      Comparator: "java.util.Comparator",
      StringBuilder: "java.lang.StringBuilder",
      StringBuffer: "java.lang.StringBuffer",
      IOException: "java.io.IOException",
      File: "java.io.File",
      FileReader: "java.io.FileReader",
      FileWriter: "java.io.FileWriter",
      BufferedReader: "java.io.BufferedReader",
      PrintWriter: "java.io.PrintWriter",
      BigInteger: "java.math.BigInteger",
      BigDecimal: "java.math.BigDecimal",
      Matcher: "java.util.regex.Matcher",
      Pattern: "java.util.regex.Pattern",
      Queue: "java.util.Queue",
      Deque: "java.util.Deque",
      ArrayDeque: "java.util.ArrayDeque",
      PriorityQueue: "java.util.PriorityQueue",
      Iterator: "java.util.Iterator",
      Stream: "java.util.stream.Stream",
      Collectors: "java.util.stream.Collectors",
      Function: "java.util.function.Function",
      Predicate: "java.util.function.Predicate",
      Consumer: "java.util.function.Consumer",
      Supplier: "java.util.function.Supplier",
      Instant: "java.time.Instant",
      Duration: "java.time.Duration",
      ChronoUnit: "java.time.temporal.ChronoUnit",
      InputMismatchException: "java.util.InputMismatchException",
      NoSuchElementException: "java.util.NoSuchElementException",
      IllegalArgumentException: "java.lang.IllegalArgumentException",
      IllegalStateException: "java.lang.IllegalStateException",
      NullPointerException: "java.lang.NullPointerException",
      IndexOutOfBoundsException: "java.lang.IndexOutOfBoundsException",
      URI: "java.net.URI",
      URL: "java.net.URL",
      HttpClient: "java.net.http.HttpClient",
      HttpRequest: "java.net.http.HttpRequest",
      HttpResponse: "java.net.http.HttpResponse"
    };
    const out = [];
    if (known[token]) {
      // java.lang types do not need an import — skip those.
      if (!known[token].startsWith("java.lang.")) out.push(known[token]);
    }
    (projectTypes || []).forEach((t) => {
      if (t.name === token && t.pkg) out.push(t.pkg + "." + t.name);
    });
    return [...new Set(out)];
  }

  /** Ensure import lines exist; returns updated source or null if unchanged. */
  function ensureImports(source, importNames) {
    const text = source || "";
    const needed = (importNames || []).filter(Boolean);
    if (!needed.length) return null;
    const missing = needed.filter((imp) => {
      const re = new RegExp("(?:^|\\n)\\s*import\\s+" + imp.replace(/\./g, "\\.") + "\\s*;");
      return !re.test(text);
    });
    if (!missing.length) return null;
    const lines = text.split("\n");
    let insertAt = 0;
    let lastImport = -1;
    let pkgLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*package\s+/.test(lines[i])) pkgLine = i;
      if (/^\s*import\s+/.test(lines[i])) lastImport = i;
      if (/^\s*(public\s+|protected\s+|private\s+)?(class|interface|enum|record)\b/.test(lines[i])) {
        insertAt = lastImport >= 0 ? lastImport + 1 : (pkgLine >= 0 ? pkgLine + 1 : 0);
        break;
      }
    }
    if (insertAt === 0 && lastImport >= 0) insertAt = lastImport + 1;
    if (insertAt === 0 && pkgLine >= 0) insertAt = pkgLine + 1;
    const block = missing.map((imp) => "import " + imp + ";");
    if (insertAt < lines.length && lines[insertAt].trim() !== "") block.push("");
    lines.splice(insertAt, 0, ...block);
    return lines.join("\n");
  }

  function introduceVariable(source, selected, varName, typeHint) {
    let sel = (selected || "").trim();
    // Allow a trailing semicolon the student highlighted by accident.
    if (sel.endsWith(";")) sel = sel.slice(0, -1).trim();
    // Collapse simple wrapped expressions; reject multi-statement selections.
    if (!sel || /;/.test(sel)) return null;
    if (/\n/.test(sel)) {
      const collapsed = sel.replace(/\s*\n\s*/g, " ").trim();
      if (/;/.test(collapsed) || collapsed.length > 180) return null;
      sel = collapsed;
    }
    const name = varName || "value";
    if (!/^[A-Za-z_][\w$]*$/.test(name) || KEYWORDS.has(name)) return null;
    let type = typeHint || "var";
    if (!typeHint) {
      if (/^".*"$/.test(sel) || /^'.*'$/.test(sel)) type = "String";
      else if (/^\d+L$/i.test(sel)) type = "long";
      else if (/^\d+$/.test(sel)) type = "int";
      else if (/^\d+\.\d+[fF]?$/.test(sel)) type = "double";
      else if (/^(true|false)$/.test(sel)) type = "boolean";
      else if (/\.size\s*\(\s*\)$/.test(sel) || /\.length\s*\(\s*\)$/.test(sel) || /\.indexOf\s*\(/.test(sel)) type = "int";
      else if (/\.isEmpty\s*\(\s*\)$/.test(sel) || /\.contains\s*\(/.test(sel) || /\.equals\s*\(/.test(sel)) type = "boolean";
      else if (/\.toString\s*\(\s*\)$/.test(sel) || /\.trim\s*\(\s*\)$/.test(sel) || /\.nextLine\s*\(\s*\)$/.test(sel)) type = "String";
      else if (/\.nextInt\s*\(\s*\)$/.test(sel)) type = "int";
      else if (/\.nextDouble\s*\(\s*\)$/.test(sel)) type = "double";
      else {
        const neu = sel.match(/^new\s+([A-Za-z_][\w.]*)\s*[(\[]/);
        if (neu) type = neu[1].replace(/<.*>/, "").split(".").pop();
      }
    }
    const hints = [];
    const simple = String(type).replace(/<.*>/, "").split(".").pop();
    const auto = {
      BigInteger: "java.math.BigInteger",
      BigDecimal: "java.math.BigDecimal",
      Scanner: "java.util.Scanner",
      ArrayList: "java.util.ArrayList",
      LinkedList: "java.util.LinkedList",
      HashMap: "java.util.HashMap",
      HashSet: "java.util.HashSet",
      Optional: "java.util.Optional",
      List: "java.util.List",
      Map: "java.util.Map",
      Set: "java.util.Set"
    };
    if (auto[simple]) hints.push(auto[simple]);
    return {
      declaration: type + " " + name + " = " + sel + ";",
      replacement: name,
      importHints: hints
    };
  }

  function extractMethod(source, selected, methodName, indentUnit) {
    const body = (selected || "").replace(/\s+$/g, "");
    if (!body.trim()) return null;
    const name = methodName || "extracted";
    if (!/^[A-Za-z_][\w$]*$/.test(name) || KEYWORDS.has(name)) return null;
    const unit = indentUnit || "    ";
    const rawLines = body.split("\n");
    // Collect identifiers used in the selection that look like free variables.
    const declared = new Set();
    rawLines.forEach((line) => {
      const decl = line.match(/^\s*(?:final\s+)?([A-Za-z_][\w.<>,\[\]?]*)\s+([A-Za-z_]\w*)\s*(?:=|;)/);
      if (decl && !KEYWORDS.has(decl[2])) declared.add(decl[2]);
      const forDecl = line.match(/\bfor\s*\(\s*(?:final\s+)?(?:[A-Za-z_][\w.<>,\[\]?]*)\s+([A-Za-z_]\w*)\s*[:=]/);
      if (forDecl) declared.add(forDecl[1]);
    });
    const used = [];
    const seen = new Set();
    const idRe = /\b([A-Za-z_][\w]*)\b/g;
    let m;
    const blank = blankNoise(body);
    const builtins = new Set(["System", "Math", "String", "Object", "Integer", "Double", "Boolean", "Arrays", "Collections", "Objects"]);
    while ((m = idRe.exec(blank)) !== null) {
      const id = m[1];
      if (KEYWORDS.has(id) || TYPE_WORDS.has(id) || declared.has(id) || seen.has(id) || builtins.has(id)) continue;
      if (id === name || id === "this" || id === "super") continue;
      // Skip member names: anything after a `.` (out / println in System.out.println).
      let k = m.index - 1;
      while (k >= 0 && /\s/.test(blank[k])) k--;
      if (k >= 0 && blank[k] === ".") continue;
      // Skip method names being called: foo(
      let j = m.index + id.length;
      while (j < blank.length && /\s/.test(blank[j])) j++;
      const called = j < blank.length && blank[j] === "(";
      // Capitalized bare type names (new ArrayList) — skip unless clearly a var.
      if (/^[A-Z]/.test(id) && !declared.has(id)) continue;
      // Method call with no qualifier is still local — keep as param only if not called,
      // or keep if it's a simple name used as a value. Prefer values over callees.
      if (called) continue;
      seen.add(id);
      used.push(id);
      if (used.length >= 6) break;
    }
    const params = used.map((id) => "Object " + id).join(", ");
    const args = used.join(", ");
    const indented = rawLines.map((line) => (line.trim() ? unit + unit + line.replace(/^\s+/, "") : "")).join("\n");
    const returnsValue = /^\s*return\b/m.test(body) && !/^\s*return\s*;/m.test(body);
    let retType = "void";
    let call;
    if (returnsValue) {
      retType = "Object";
      call = name + "(" + args + ")";
    } else {
      call = name + "(" + args + ");";
    }
    const stub =
      "\n" + unit + "private static " + retType + " " + name + "(" + params + ") {\n" +
      (indented || unit + unit + "// …\n") +
      unit + "}\n";
    return {
      call: call,
      method: stub,
      note: returnsValue
        ? "Extracted with return type Object — tighten the type if you know it."
        : (used.length ? ("Passed " + used.join(", ") + " as parameters.") : "")
    };
  }

  function enclosingBraceRange(source, offset) {
    const text = source || "";
    if (offset < 0 || offset > text.length) return null;
    let depth = 0;
    let open = -1;
    for (let i = offset; i >= 0; i--) {
      const c = text[i];
      if (c === "}") depth++;
      else if (c === "{") {
        if (depth === 0) { open = i; break; }
        depth--;
      }
    }
    if (open < 0) return null;
    depth = 0;
    for (let i = open; i < text.length; i++) {
      const c = text[i];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return { from: open, to: i };
      }
    }
    return null;
  }

  function matchingSnippets(prefix) {
    const lower = (prefix || "").toLowerCase();
    return SNIPPETS.filter((s) => !lower || s.trigger.startsWith(lower) || s.label.toLowerCase().includes(lower));
  }

  /**
   * Re-indent Java source using brace depth. Tracks strings / text blocks /
   * comments across lines so braces inside them never bump indent.
   * Only light spacing fixes (if(, ){, } else) — no aggressive rewrites.
   */
  function beautifyJava(source, options) {
    options = options || {};
    const indentSize = options.indentSize === 2 || options.indentSize === 8 ? options.indentSize : 4;
    const useTabs = !!options.indentWithTabs;
    const unit = useTabs ? "\t" : " ".repeat(indentSize);
    const raw = String(source == null ? "" : source).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!raw) return "";

    const lines = raw.split("\n");
    const out = [];
    let depth = 0;
    let mode = "code"; // code | line | block | sq | dq | tq
    let blankRun = 0;

    for (let li = 0; li < lines.length; li++) {
      const original = lines[li];
      const scan = scanLine(original, mode);
      mode = scan.modeEnd;

      const trimmed = original.trim();
      if (!trimmed) {
        blankRun += 1;
        if (blankRun <= 2) out.push("");
        continue;
      }
      blankRun = 0;

      // Inside a string / text-block / comment continuation — do not re-indent
      // (re-indenting would change string contents and javadoc layout).
      if (scan.wasNonCodeLine) {
        out.push(original.replace(/[ \t]+$/g, ""));
        continue;
      }

      const opens = scan.opens;
      const closes = scan.closes;
      let lineDepth = depth;
      // Closing brace / bracket at the start of the line sits one level out.
      if (/^[}\])]/.test(trimmed)) {
        const leadCloses = countLeadingClosers(scan.codeMask);
        lineDepth = Math.max(0, depth - Math.max(1, leadCloses));
      } else if (/^(case\b|default\s*:)/.test(trimmed)) {
        // case / default align with switch body start (one less than statements).
        lineDepth = Math.max(0, depth - 1);
      }

      const tidied = tidyCodeSpaces(trimmed);
      out.push(unit.repeat(Math.max(0, lineDepth)) + tidied);
      depth = Math.max(0, depth + opens - closes);
    }

    while (out.length && out[out.length - 1] === "") out.pop();
    return out.join("\n") + "\n";
  }

  /** Scan one physical line given starting lexer mode; return brace counts in code only. */
  function scanLine(line, modeStart) {
    let mode = modeStart;
    let opens = 0;
    let closes = 0;
    let i = 0;
    let codeMask = "";
    let sawCode = mode === "code";
    let wasNonCodeLine = mode !== "code";

    while (i < line.length) {
      const c = line[i];
      const n = line[i + 1];
      const n2 = line[i + 2];

      if (mode === "line") {
        // rest of line is comment
        break;
      }
      if (mode === "block") {
        if (c === "*" && n === "/") { mode = "code"; i += 2; continue; }
        i++;
        continue;
      }
      if (mode === "sq") {
        if (c === "\\") { i += 2; continue; }
        if (c === "'") { mode = "code"; i++; continue; }
        i++;
        continue;
      }
      if (mode === "dq") {
        if (c === "\\") { i += 2; continue; }
        if (c === '"') { mode = "code"; i++; continue; }
        i++;
        continue;
      }
      if (mode === "tq") {
        if (c === '"' && n === '"' && n2 === '"') { mode = "code"; i += 3; continue; }
        i++;
        continue;
      }

      // code
      sawCode = true;
      wasNonCodeLine = false;
      if (c === "/" && n === "/") { mode = "line"; break; }
      if (c === "/" && n === "*") { mode = "block"; i += 2; continue; }
      if (c === "'") { mode = "sq"; i++; continue; }
      if (c === '"') {
        if (n === '"' && n2 === '"') { mode = "tq"; i += 3; continue; }
        mode = "dq";
        i++;
        continue;
      }
      if (c === "{") { opens++; codeMask += "{"; }
      else if (c === "}") { closes++; codeMask += "}"; }
      else if (c === "(" || c === ")") codeMask += c;
      else if (c === "[" || c === "]") codeMask += c;
      else codeMask += " ";
      i++;
    }

    // If we never left a non-code mode and never hit code, treat as continuation.
    if (!sawCode && modeStart !== "code") wasNonCodeLine = true;
    // Line comment mode ends at newline.
    const modeEnd = mode === "line" ? "code" : mode;
    return { opens: opens, closes: closes, modeEnd: modeEnd, wasNonCodeLine: wasNonCodeLine && !sawCode, codeMask: codeMask };
  }

  function countLeadingClosers(codeMask) {
    let n = 0;
    for (let i = 0; i < codeMask.length; i++) {
      const c = codeMask[i];
      if (c === " " || c === "\t") continue;
      if (c === "}" || c === ")" || c === "]") { n++; continue; }
      break;
    }
    return n;
  }

  function tidyCodeSpaces(line) {
    let s = line.replace(/[ \t]+$/g, "");
    // Conservative: only keyword/brace spacing people expect. Never touch = or <>
    // (those broke generics / annotations / made lines look worse).
    s = replaceOutsideStrings(s, /\b(if|for|while|switch|catch|synchronized)\(/g, "$1 (");
    s = replaceOutsideStrings(s, /\)\s*\{/g, ") {");
    s = replaceOutsideStrings(s, /([A-Za-z0-9_])\{/g, "$1 {");
    s = replaceOutsideStrings(s, /\}\s*else\b/g, "} else");
    s = replaceOutsideStrings(s, /\belse\s*\{/g, "else {");
    s = replaceOutsideStrings(s, /\btry\s*\{/g, "try {");
    s = replaceOutsideStrings(s, /\bfinally\s*\{/g, "finally {");
    s = replaceOutsideStrings(s, /\bdo\s*\{/g, "do {");
    s = replaceOutsideStrings(s, /,\s*/g, ", ");
    s = replaceOutsideStrings(s, / {2,}/g, " ");
    return s;
  }

  function replaceOutsideStrings(text, regex, replacement) {
    const parts = [];
    let i = 0;
    let mode = "code";
    let buf = "";
    while (i < text.length) {
      const c = text[i];
      const n = text[i + 1];
      const n2 = text[i + 2];
      if (mode === "code") {
        if (c === "/" && n === "/") {
          parts.push(buf.replace(regex, replacement));
          parts.push(text.slice(i));
          return parts.join("");
        }
        if (c === "/" && n === "*") {
          parts.push(buf.replace(regex, replacement));
          buf = "";
          let j = i + 2;
          while (j < text.length && !(text[j] === "*" && text[j + 1] === "/")) j++;
          j = Math.min(text.length, j + 2);
          parts.push(text.slice(i, j));
          i = j;
          continue;
        }
        if (c === "'") {
          parts.push(buf.replace(regex, replacement));
          buf = "'"; mode = "sq"; i++; continue;
        }
        if (c === '"') {
          parts.push(buf.replace(regex, replacement));
          buf = "";
          if (n === '"' && n2 === '"') { buf = '"""'; mode = "tq"; i += 3; continue; }
          buf = '"'; mode = "dq"; i++; continue;
        }
        buf += c; i++;
      } else if (mode === "sq") {
        buf += c;
        if (c === "\\" && i + 1 < text.length) { buf += text[i + 1]; i += 2; continue; }
        if (c === "'") { parts.push(buf); buf = ""; mode = "code"; }
        i++;
      } else if (mode === "dq") {
        buf += c;
        if (c === "\\" && i + 1 < text.length) { buf += text[i + 1]; i += 2; continue; }
        if (c === '"') { parts.push(buf); buf = ""; mode = "code"; }
        i++;
      } else if (mode === "tq") {
        buf += c;
        if (c === '"' && n === '"' && n2 === '"') {
          buf += '""';
          parts.push(buf); buf = ""; mode = "code";
          i += 3; continue;
        }
        i++;
      }
    }
    if (buf) {
      if (mode === "code") parts.push(buf.replace(regex, replacement));
      else parts.push(buf);
    }
    return parts.join("");
  }

  /** Split camelCase / snake_name into words for readable docs. */
  function splitIdent(name) {
    if (!name) return [];
    return String(name)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .replace(/[_$]+/g, " ")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
  }

  function articleFor(word) {
    if (!word) return "a";
    return /^[aeiou]/i.test(word) ? "an" : "a";
  }

  function humanType(type) {
    if (!type) return "value";
    let t = String(type).trim();
    t = t.replace(/\s+/g, " ");
    if (t.endsWith("[]")) return "array of " + humanType(t.slice(0, -2));
    if (/^List\s*</i.test(t) || /^ArrayList\s*</i.test(t)) {
      const inner = t.replace(/^[^<]*<\s*/, "").replace(/\s*>$/, "");
      return "list of " + humanType(inner || "items");
    }
    if (/^Set\s*</i.test(t) || /^HashSet\s*</i.test(t)) {
      const inner = t.replace(/^[^<]*<\s*/, "").replace(/\s*>$/, "");
      return "set of " + humanType(inner || "items");
    }
    if (/^Map\s*</i.test(t) || /^HashMap\s*</i.test(t)) return "map";
    if (/^Optional\s*</i.test(t)) {
      const inner = t.replace(/^[^<]*<\s*/, "").replace(/\s*>$/, "");
      return "optional " + humanType(inner || "value");
    }
    const simple = t.includes(".") ? t.slice(t.lastIndexOf(".") + 1) : t;
    const base = simple.replace(/<.*>/, "");
    const known = {
      String: "text",
      int: "integer",
      Integer: "integer",
      long: "long integer",
      Long: "long integer",
      double: "number",
      Double: "number",
      float: "number",
      Float: "number",
      boolean: "true/false value",
      Boolean: "true/false value",
      char: "character",
      Character: "character",
      byte: "byte",
      short: "short integer",
      void: "nothing",
      Object: "object",
      Scanner: "Scanner for reading input"
    };
    if (known[base]) return known[base];
    const words = splitIdent(base);
    if (!words.length) return "value";
    return words.join(" ");
  }

  function humanName(name) {
    const words = splitIdent(name);
    if (!words.length) return "value";
    // Drop noisy leading verbs when describing a parameter itself.
    return words.join(" ");
  }

  function paramDescription(type, name) {
    const n = humanName(name);
    const t = humanType(type);
    const words = splitIdent(name);
    const first = words[0] || "";
    if (/^(is|has|can|should|was|were)$/.test(first) || type === "boolean" || type === "Boolean") {
      if (/^(is|has|can|should|was|were)$/.test(first)) {
        return "true if " + words.slice(1).join(" ") + (words.length > 1 ? "" : " the condition holds");
      }
      return "true if " + n;
    }
    if (name === "args" && /String\s*(\[\s*\]|\.\.\.)/.test(type || "")) {
      return "command-line arguments passed to the program";
    }
    if (name === "o" || name === "obj" || name === "other") {
      return "the object to compare with this one";
    }
    if (/^(in|input|sc|scanner)$/i.test(name) && /Scanner/i.test(type || "")) {
      return "the Scanner used to read input";
    }
    // "the shelf to borrow from" style when name already includes a noun
    return "the " + n + (t && t !== n && t !== "value" && t !== "object" ? " (" + t + ")" : "");
  }

  function thirdPerson(verb) {
    if (!verb) return "";
    if (/ies$/i.test(verb)) return verb;
    if (/[sxz]$/i.test(verb) || /[cs]h$/i.test(verb)) return verb + "es";
    if (/[^aeiou]y$/i.test(verb)) return verb.slice(0, -1) + "ies";
    return verb + "s";
  }

  function returnDescription(retType, methodName, params) {
    if (!retType || retType === "void") return "";
    const words = splitIdent(methodName);
    const first = words[0] || "";
    const rest = words.slice(1).join(" ");
    if (first === "get" && rest) return "the " + rest;
    if (first === "is" && rest) return "true if this is " + rest + ", otherwise false";
    if (first === "has" && rest) return "true if this has " + rest + ", otherwise false";
    if (first === "can" && rest) return "true if this can " + rest + ", otherwise false";
    if (first === "to" && rest === "string") return "a text description of this object";
    if (methodName === "hashCode") return "a hash code for this object";
    if (methodName === "equals") return "true if the other object equals this one";
    if (methodName === "compareTo") return "a negative number, zero, or a positive number when comparing this object to another";
    if (methodName === "indexOf" || (first === "index" && words[1] === "of")) {
      return "the index of " + (params[0] ? "the given " + humanName(params[0].name) : "the item")
        + ", or -1 if not found";
    }
    if (first === "find" || first === "search" || first === "lookup") {
      return "the matching " + (rest || humanType(retType)) + ", or null if none is found";
    }
    if (first === "create" || first === "make" || first === "build" || first === "new") {
      return "the new " + (rest || humanType(retType));
    }
    if (first === "parse" || first === "read" || first === "load") {
      return "the " + (rest || humanType(retType)) + " that was " + first;
    }
    if (retType === "boolean" || retType === "Boolean") {
      if (rest) return "true if " + (first ? first + " " : "") + rest + ", otherwise false";
      return "true or false depending on the result";
    }
    if (retType === "int" || retType === "Integer" || retType === "long" || retType === "Long") {
      if (first === "size" || first === "length" || first === "count") return "the " + (rest ? rest + " " : "") + "count";
    }
    const ht = humanType(retType);
    if (rest) return "the " + rest + " (" + ht + ")";
    return "the " + ht;
  }

  function methodSummary(kind, typeName, methodName, retType, params) {
    const words = splitIdent(methodName);
    const first = words[0] || "";
    const rest = words.slice(1).join(" ");
    if (kind === "ctor") {
      const typeWords = splitIdent(typeName || methodName).join(" ");
      if (params.length) {
        const bits = params.map((p) => humanName(p.name)).filter(Boolean);
        return "Creates " + articleFor(typeWords) + " " + typeWords
          + (bits.length ? " using the given " + bits.join(", ") : "") + ".";
      }
      return "Creates " + articleFor(typeWords) + " " + typeWords + ".";
    }
    if (methodName === "main") {
      return "Starts the program.";
    }
    if (methodName === "toString") return "Returns a text description of this object.";
    if (methodName === "equals") return "Checks whether another object equals this one.";
    if (methodName === "hashCode") return "Returns a hash code for this object.";
    if (methodName === "indexOf" || (first === "index" && words[1] === "of")) {
      return "Finds the index of " + (params[0] ? "the given " + humanName(params[0].name) : "an item") + ".";
    }
    if (first === "get" && rest) return "Returns the " + rest + ".";
    if (first === "set" && rest) {
      const p0 = params[0] ? humanName(params[0].name) : rest;
      return "Sets the " + rest + (params[0] ? " to the given " + p0 : "") + ".";
    }
    if (first === "is" && rest) return "Checks whether this is " + rest + ".";
    if (first === "has" && rest) return "Checks whether this has " + rest + ".";
    if (first === "can" && rest) return "Checks whether this can " + rest + ".";
    if (first === "add") return "Adds " + (rest || (params[0] ? "the given " + humanName(params[0].name) : "an item")) + ".";
    if (first === "remove") return "Removes " + (rest || (params[0] ? "the given " + humanName(params[0].name) : "an item")) + ".";
    if (first === "clear") return "Clears " + (rest ? "the " + rest : "the contents") + ".";
    if (first === "print" || first === "println" || first === "show" || first === "display") {
      return "Prints " + (rest || "information") + ".";
    }
    if (first === "find" || first === "search") return "Finds " + (rest || "a matching item") + ".";
    if (first === "update") return "Updates " + (rest || "this object") + ".";
    if (first === "load" || first === "save" || first === "write" || first === "read") {
      return capitalize(thirdPerson(first)) + " " + (rest || "data") + ".";
    }
    // Generic: "Borrows a book." from borrow / borrowBook
    if (words.length) {
      const verb = capitalize(thirdPerson(words[0]));
      let obj = words.slice(1).join(" ");
      if (!obj && params[0]) {
        const n = humanName(params[0].name);
        obj = articleFor(n) + " " + n;
      }
      return verb + (obj ? " " + obj : "") + ".";
    }
    return "Performs this operation.";
  }

  function parseParams(raw) {
    const out = [];
    if (!raw || !raw.trim()) return out;
    // Split on commas not inside generics
    let depth = 0;
    let buf = "";
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c === "<") depth++;
      else if (c === ">") depth = Math.max(0, depth - 1);
      if (c === "," && depth === 0) {
        out.push(buf.trim());
        buf = "";
      } else buf += c;
    }
    if (buf.trim()) out.push(buf.trim());
    return out.map((part) => {
      let p = part.replace(/^final\s+/, "").trim();
      p = p.replace(/\s*\.\.\.\s*/g, "... ");
      const bits = p.split(/\s+/).filter(Boolean);
      if (!bits.length) return null;
      const name = bits[bits.length - 1].replace(/^\.\.\./, "");
      const type = bits.slice(0, -1).join(" ").replace(/\s*\.\.\.\s*$/, "...");
      return { name: name, type: type };
    }).filter(Boolean);
  }

  /**
   * Build a filled Javadoc block from the signature under a /** opener.
   * Returns { text, cursorLineOffset, cursorCh } relative to the opener line.
   */
  function generateJavadoc(signatureLine, indent, typeHint) {
    indent = indent || "";
    let joined = String(signatureLine || "").replace(/\s+/g, " ").trim();
    // Strip modifiers so "public Book(...)" is a constructor, not a method named Book.
    while (/^(public|protected|private|static|final|synchronized|native|abstract|default)\s+/.test(joined)) {
      joined = joined.replace(/^(public|protected|private|static|final|synchronized|native|abstract|default)\s+/, "");
    }
    const method = joined.match(
      /^([A-Za-z_][\w.<>,\[\]?]*(?:\[\s*\])?)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/
    );
    const ctor = joined.match(/^([A-Za-z_]\w*)\s*\(([^)]*)\)/);
    let kind = "unknown";
    let retType = "";
    let name = "";
    let params = [];
    let typeName = typeHint || "";
    // Prefer constructor when the only identifier before "(" matches the enclosing type.
    if (ctor && (!method || (typeHint && ctor[1] === typeHint) || (method && method[1] === method[2]))) {
      kind = "ctor";
      name = ctor[1];
      typeName = typeName || ctor[1];
      params = parseParams(ctor[2]);
    } else if (method) {
      kind = "method";
      retType = method[1].replace(/\s+/g, "");
      name = method[2];
      params = parseParams(method[3]);
    } else if (ctor) {
      kind = "ctor";
      name = ctor[1];
      typeName = typeName || ctor[1];
      params = parseParams(ctor[2]);
    }

    const lines = [indent + "/**"];
    if (kind === "unknown") {
      lines.push(indent + " * ");
      lines.push(indent + " */");
      return { text: lines.join("\n"), summary: "", params: [], ret: "" };
    }

    const summary = methodSummary(kind, typeName, name, retType, params);
    lines.push(indent + " * " + summary);
    if (params.length) lines.push(indent + " *");
    params.forEach((p) => {
      lines.push(indent + " * @param " + p.name + " " + paramDescription(p.type, p.name));
    });
    if (kind === "method" && retType && retType !== "void") {
      lines.push(indent + " * @return " + returnDescription(retType, name, params));
    }
    lines.push(indent + " */");
    return {
      text: lines.join("\n"),
      summary: summary,
      params: params,
      ret: retType
    };
  }

  return {
    parseJava: parseJava,
    blankNoise: blankNoise,
    keywords: Array.from(KEYWORDS).sort(),
    typeWords: Array.from(TYPE_WORDS).sort(),
    snippets: SNIPPETS.slice(),
    matchingSnippets: matchingSnippets,
    beautifyJava: beautifyJava,
    explain: explain,
    generateGetterSetter: generateGetterSetter,
    generateConstructor: generateConstructor,
    generateMain: generateMain,
    generateMatrixPrint: generateMatrixPrint,
    generateHomeworkBlock: generateHomeworkBlock,
    homeworkBlockIds: HOMEWORK_BLOCK_IDS.slice(),
    generateToString: generateToString,
    generateEqualsHashCode: generateEqualsHashCode,
    classSummary: classSummary,
    suggestImports: suggestImports,
    ensureImports: ensureImports,
    introduceVariable: introduceVariable,
    extractMethod: extractMethod,
    enclosingBraceRange: enclosingBraceRange,
    getterName: getterName,
    setterName: setterName,
    capitalize: capitalize,
    wordAt: wordAt,
    buildIndex: buildIndex,
    findDefinitions: findDefinitions,
    findUsages: findUsages,
    renameInSource: renameInSource,
    renameAcross: renameAcross,
    fuzzyScore: fuzzyScore,
    applyQuickFix: applyQuickFix,
    inferQuickFixCode: inferQuickFixCode,
    isQuickFixable: isQuickFixable,
    classCloseIndex: classCloseIndex,
    accessorWarnings: accessorWarnings,
    generateJavadoc: generateJavadoc,
    humanType: humanType,
    paramDescription: paramDescription
  };
});
