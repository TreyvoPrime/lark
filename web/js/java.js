/* Parses Java well enough for an outline, main-class list, and completion. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LarkJava = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const KEYWORDS = new Set([
    "if", "for", "while", "switch", "catch", "try", "do", "return", "new",
    "throw", "else", "synchronized", "package", "import", "class", "interface",
    "enum", "record"
  ]);

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
    const match = stripped.match(/^\s*((?:(?:public|protected|private|static|final|abstract|synchronized|native|default)\s+)*)(?:<[^;]+>\s*)?([A-Za-z_][\w.<>,\[\]?]*)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:throws\s+[^{;]+)?\s*(?:[{;].*)?$/);
    if (match && match[2] && !KEYWORDS.has(match[3])) {
      const mods = match[1].trim().split(/\s+/).filter(Boolean);
      return {
        name: match[3],
        params: match[4].trim(),
        ret: match[2].trim(),
        mods: mods,
        detail: shortParams(match[4])
      };
    }
    if (!stack.length) return null;
    const ctor = stripped.match(/^\s*((?:(?:public|protected|private)\s+)*)([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:throws\s+[^{;]+)?\s*(?:[{;].*)?$/);
    if (!ctor || KEYWORDS.has(ctor[2]) || ctor[2] !== stack[stack.length - 1].name) return null;
    return {
      name: ctor[2],
      params: ctor[3].trim(),
      ret: "",
      mods: ctor[1].trim().split(/\s+/).filter(Boolean),
      detail: shortParams(ctor[3])
    };
  }

  function matchField(line) {
    const head = line.split("=")[0];
    if (head.includes("(") || head.includes(")")) return null;
    const match = head.match(/^\s*(?:@[\w.]+\s*)*(?:(?:public|protected|private|static|final|transient|volatile)\s+)*([A-Za-z_][\w.<>,\[\]?]*)\s+([A-Za-z_]\w*)\s*;?\s*$/);
    if (!match || KEYWORDS.has(match[1]) || KEYWORDS.has(match[2])) return null;
    return { type: match[1], name: match[2] };
  }

  function parseJava(source) {
    const clean = blankNoise(source || "");
    const lines = clean.split("\n");
    let pkg = "";
    const pkgMatch = clean.match(/(?:^|\n)\s*package\s+([A-Za-z_][\w.]*)\s*;/);
    if (pkgMatch) pkg = pkgMatch[1];
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
          kind: "method",
          name: method.name,
          line: lineNo,
          indent: stack.length,
          detail: method.detail,
          mods: method.mods,
          ret: method.ret,
          params: method.params
        });
        const isMain = method.name === "main"
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
          detail: field.type
        });
      }
      depth += countChar(line, "{") - countChar(line, "}");
      if (depth < 0) depth = 0;
      while (stack.length && depth <= stack[stack.length - 1].depth) stack.pop();
    }
    return { pkg: pkg, symbols: symbols, mains: mains };
  }

  return { parseJava: parseJava, blankNoise: blankNoise };
});
