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
    this: "this refers to the current object. Use it when a parameter name matches a field, like this.title = title."
  };

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
          code: "missing-accessors",
          field: field.name
        });
      } else if (!info.hasGetter) {
        warnings.push({
          severity: "warning",
          line: field.line,
          column: 1,
          message: "Private field '" + field.name + "' has no getter (" + info.getter + ").",
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
        code: "unbalanced-brace"
      });
    }
    if (paren !== 0) {
      out.push({
        severity: "error",
        line: maxLine,
        column: 1,
        message: paren > 0 ? "Missing closing parenthesis." : "Extra closing parenthesis.",
        code: "unbalanced-paren"
      });
    }
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
    const warnings = accessorWarnings(symbols).concat(braceWarnings(source));
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
      Files: "java.nio.file.Files"
    };
    const out = [];
    if (known[token]) out.push(known[token]);
    (projectTypes || []).forEach((t) => {
      if (t.name === token && t.pkg) out.push(t.pkg + "." + t.name);
    });
    return out;
  }

  return {
    parseJava: parseJava,
    blankNoise: blankNoise,
    keywords: Array.from(KEYWORDS).sort(),
    typeWords: Array.from(TYPE_WORDS).sort(),
    explain: explain,
    generateGetterSetter: generateGetterSetter,
    generateConstructor: generateConstructor,
    classSummary: classSummary,
    suggestImports: suggestImports,
    getterName: getterName,
    setterName: setterName,
    capitalize: capitalize
  };
});
