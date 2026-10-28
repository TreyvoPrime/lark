/* Lark Extras — UML diagrams + assignment field/getter helper (local only). */
(function (global) {
  function escapeXml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function collectClasses(files) {
    const classes = [];
    (files || []).forEach((file) => {
      if (!file || !file.path || !file.path.endsWith(".java")) return;
      if (typeof LarkJava === "undefined" || !LarkJava.parseJava) return;
      const parsed = LarkJava.parseJava(file.content || "");
      const types = (parsed.symbols || []).filter((s) =>
        s.indent === 0 && (s.kind === "class" || s.kind === "interface" || s.kind === "enum" || s.kind === "record"));
      types.forEach((t, typeIndex) => {
        const startLine = Number(t.line) || 1;
        const endLine = typeIndex + 1 < types.length ? (Number(types[typeIndex + 1].line) || Infinity) : Infinity;
        const belongsToType = (s) => {
          const line = Number(s.line) || startLine;
          return s.indent === 1 && line >= startLine && line < endLine;
        };
        const fields = (parsed.symbols || []).filter((s) => s.kind === "field" && belongsToType(s));
        const methods = (parsed.symbols || []).filter((s) =>
          (s.kind === "method" || s.kind === "ctor") && belongsToType(s));
        const src = file.content || "";
        const ext = src.match(new RegExp("\\b(?:class|interface)\\s+" + t.name + "\\s+extends\\s+([A-Za-z_]\\w*)"));
        const impl = src.match(new RegExp("\\bclass\\s+" + t.name + "[^{]*\\bimplements\\s+([^{]+)\\{"));
        const cleanType = (value) => String(value || "").replace(/<.*>/, "").trim().split(".").pop();
        const interfaces = impl
          ? impl[1].split(",").map(cleanType).filter(Boolean)
          : [];
        classes.push({
          name: t.name,
          kind: t.kind,
          pkg: parsed.pkg || "",
          path: file.path,
          fields: fields,
          methods: methods,
          extends: ext ? cleanType(ext[1]) : "",
          interfaces: interfaces
        });
      });
    });
    return classes;
  }

  function vis(mods) {
    const m = mods || [];
    if (m.indexOf("private") >= 0) return "−";
    if (m.indexOf("protected") >= 0) return "#";
    if (m.indexOf("public") >= 0) return "+";
    return "~";
  }

  function fieldLine(f) {
    return vis(f.mods) + " " + f.name + " : " + (f.type || f.detail || "?");
  }

  function methodLine(m) {
    if (m.kind === "ctor") return vis(m.mods) + " " + m.name + "(" + (m.params || "") + ")";
    return vis(m.mods) + " " + m.name + "(" + (m.params || "") + ") : " + (m.ret || "void");
  }

  function measureBox(cls) {
    const lines = [cls.name]
      .concat(cls.fields.map(fieldLine))
      .concat(cls.methods.map(methodLine));
    let max = cls.name.length + 2;
    lines.forEach((l) => { if (l.length > max) max = l.length; });
    const charW = 7.2;
    const lineH = 16;
    const padX = 14;
    const padY = 10;
    const headerH = 28;
    const w = Math.min(360, Math.max(160, Math.ceil(max * charW) + padX * 2));
    const bodyLines = cls.fields.length + cls.methods.length;
    const h = headerH + padY + bodyLines * lineH + (cls.fields.length && cls.methods.length ? 8 : 0) + padY;
    return { w: w, h: Math.max(72, h), lineH: lineH, headerH: headerH, padX: padX, padY: padY };
  }

  function layoutClasses(classes) {
    const gapX = 48;
    const gapY = 36;
    const colW = 380;
    let x = 24;
    let y = 24;
    let rowH = 0;
    let maxX = 0;
    let maxY = 0;
    const placed = classes.map((cls, i) => {
      const box = measureBox(cls);
      if (x > 24 && x + box.w > 24 + colW * 2.2) {
        x = 24;
        y += rowH + gapY;
        rowH = 0;
      }
      const item = Object.assign({ x: x, y: y }, cls, { box: box });
      x += box.w + gapX;
      rowH = Math.max(rowH, box.h);
      maxX = Math.max(maxX, item.x + box.w);
      maxY = Math.max(maxY, item.y + box.h);
      return item;
    });
    return { classes: placed, width: maxX + 40, height: maxY + 40 };
  }

  function renderSvg(model) {
    const { classes, width, height } = model;
    const byName = {};
    classes.forEach((c) => { byName[c.name] = c; });
    let arrows = "";
    classes.forEach((c) => {
      const targets = [];
      if (c.extends && byName[c.extends]) targets.push({ name: c.extends, kind: "extends" });
      (c.interfaces || []).forEach((n) => {
        if (byName[n]) targets.push({ name: n, kind: "implements" });
      });
      targets.forEach((t) => {
        const parent = byName[t.name];
        const x1 = c.x + c.box.w / 2;
        const y1 = c.y;
        const x2 = parent.x + parent.box.w / 2;
        const y2 = parent.y + parent.box.h;
        const midY = (y1 + y2) / 2;
        const dash = t.kind === "implements" ? ' stroke-dasharray="5 4"' : "";
        arrows += '<path d="M' + x1 + " " + y1 + " C " + x1 + " " + midY + ", " + x2 + " " + midY + ", " + x2 + " " + y2
          + '" fill="none" stroke="currentColor" stroke-width="1.25"' + dash + ' marker-end="url(#uml-arrow)"/>';
      });
    });

    let bodies = "";
    classes.forEach((c) => {
      const b = c.box;
      let y = c.y + b.padY + 14;
      bodies += '<g class="uml-class" data-name="' + escapeXml(c.name) + '">';
      bodies += '<rect x="' + c.x + '" y="' + c.y + '" width="' + b.w + '" height="' + b.h
        + '" rx="6" class="uml-box"/>';
      bodies += '<text x="' + (c.x + b.w / 2) + '" y="' + y + '" text-anchor="middle" class="uml-title">'
        + (c.kind !== "class" ? "«" + escapeXml(c.kind) + "» " : "") + escapeXml(c.name) + "</text>";
      y = c.y + b.headerH;
      bodies += '<line x1="' + c.x + '" y1="' + y + '" x2="' + (c.x + b.w) + '" y2="' + y + '" class="uml-rule"/>';
      y += b.padY + 4;
      c.fields.forEach((f) => {
        bodies += '<text x="' + (c.x + b.padX) + '" y="' + y + '" class="uml-member">'
          + escapeXml(fieldLine(f)) + "</text>";
        y += b.lineH;
      });
      if (c.fields.length && c.methods.length) {
        bodies += '<line x1="' + c.x + '" y1="' + (y - 6) + '" x2="' + (c.x + b.w) + '" y2="' + (y - 6) + '" class="uml-rule"/>';
        y += 2;
      }
      c.methods.forEach((m) => {
        bodies += '<text x="' + (c.x + b.padX) + '" y="' + y + '" class="uml-member">'
          + escapeXml(methodLine(m)) + "</text>";
        y += b.lineH;
      });
      bodies += "</g>";
    });

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + " " + height
      + '" width="' + width + '" height="' + height + '" class="uml-svg">'
      + "<defs><marker id=\"uml-arrow\" markerWidth=\"8\" markerHeight=\"8\" refX=\"6\" refY=\"3\" orient=\"auto\">"
      + '<path d="M0,0 L6,3 L0,6 Z" fill="var(--bg, white)" stroke="currentColor" stroke-width="1.2"/></marker></defs>'
      + arrows + bodies + "</svg>";
  }

  function toPlantUml(classes) {
    let out = "@startuml\nskinparam classAttributeIconSize 0\n";
    classes.forEach((c) => {
      out += (c.kind === "interface" ? "interface " : "class ") + c.name + " {\n";
      c.fields.forEach((f) => { out += "  " + fieldLine(f) + "\n"; });
      c.methods.forEach((m) => { out += "  " + methodLine(m) + "\n"; });
      out += "}\n";
      if (c.extends) out += c.extends + " <|-- " + c.name + "\n";
      (c.interfaces || []).forEach((n) => { out += n + " <|.. " + c.name + "\n"; });
    });
    out += "@enduml\n";
    return out;
  }

  function buildUml(files) {
    const classes = collectClasses(files);
    if (!classes.length) {
      return { svg: "", plantuml: "", empty: true, classes: [] };
    }
    const model = layoutClasses(classes);
    return {
      svg: renderSvg(model),
      plantuml: toPlantUml(classes),
      empty: false,
      classes: classes
    };
  }

  /* —— Assignment helper (heuristic, offline) —— */

  const TYPE_ALIASES = [
    [/string|text|title|name|word|label/i, "String"],
    [/int(?:eger)?|count|pages?|age|year|id\b|number of|qty|quantity|score|index/i, "int"],
    [/double|price|cost|balance|rate|average|gpa|weight|height/i, "double"],
    [/boolean|flag|whether|is |has |checked|available|active|done/i, "boolean"],
    [/arraylist|list of|collection of/i, "ArrayList"],
    [/array of int|int\s*\[\]/i, "int[]"],
    [/scanner/i, "Scanner"],
    [/char\b/i, "char"],
    [/long\b/i, "long"]
  ];

  const FIELD_STOP = /^(a|an|the|with|and|or|class|create|write|implement|include|includes|for|from|into|using|your|its?|their|this|that|whether)$/i;

  function cleanFieldPhrase(chunk) {
    let parts = String(chunk || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim().split(/\s+/).filter(Boolean);
    while (parts.length && FIELD_STOP.test(parts[0])) parts.shift();
    while (parts.length && FIELD_STOP.test(parts[parts.length - 1])) parts.pop();
    // Prefer the last 1–2 content words (“page count”, “title”)
    if (parts.length > 2) parts = parts.slice(-2);
    if (parts.length === 2 && /^(is|has|was|been)$/i.test(parts[0])) {
      /* keep both for boolean-ish names */
    } else if (parts.length === 2 && FIELD_STOP.test(parts[0])) {
      parts = parts.slice(1);
    }
    return parts.join(" ");
  }

  function toCamel(words) {
    const parts = String(words || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim().split(/\s+/).filter(Boolean)
      .filter((w) => !FIELD_STOP.test(w) || /^(is|has)$/i.test(w));
    if (!parts.length) return "value";
    return parts[0] + parts.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  }

  function toPascal(words) {
    const c = toCamel(words);
    return c.charAt(0).toUpperCase() + c.slice(1);
  }

  function guessType(chunk) {
    for (let i = 0; i < TYPE_ALIASES.length; i++) {
      if (TYPE_ALIASES[i][0].test(chunk)) return TYPE_ALIASES[i][1];
    }
    return "String";
  }

  function analyzeAssignment(text) {
    const raw = String(text || "").trim();
    if (!raw) return { error: "Paste the assignment text first." };

    let className = "Homework";
    const classMatch = raw.match(/\b(?:class|create(?:\s+a)?|write(?:\s+a)?|implement(?:\s+a)?)\s+([A-Z][A-Za-z0-9_]*)\b/)
      || raw.match(/\b([A-Z][a-zA-Z0-9_]{2,})\s+class\b/);
    if (classMatch) className = classMatch[1];

    const fields = [];
    const seen = new Set();

    function fieldKey(name, type) {
      let n = String(name || "").replace(/[^A-Za-z0-9_]/g, "");
      if (!n) return "";
      n = n.charAt(0).toLowerCase() + n.slice(1);
      if (type === "boolean") n = n.replace(/^is([A-Z])/, (_, c) => c.toLowerCase());
      return n.toLowerCase();
    }

    function addField(name, type, note) {
      let n = name.replace(/[^A-Za-z0-9_]/g, "");
      if (!n) return;
      n = n.charAt(0).toLowerCase() + n.slice(1);
      const key = fieldKey(n, type);
      if (!key) return;
      // Prefer isCheckedOut over checkedOut when both phrasings appear
      if (type === "boolean" && /^is[A-Z]/.test(n)) {
        const idx = fields.findIndex((f) => f.type === "boolean" && fieldKey(f.name, "boolean") === key);
        if (idx >= 0) {
          fields[idx] = { name: n, type: type, note: note || fields[idx].note };
          seen.add(key);
          return;
        }
      }
      if (seen.has(key)) return;
      seen.add(key);
      fields.push({ name: n, type: type, note: note || "" });
    }

    // Explicit Java-ish declarations in the prompt
    const declRe = /\b(private|protected|public)?\s*(static\s+)?(final\s+)?(String|int|double|boolean|long|char|float|ArrayList(?:\s*<[^>]+>)?|List(?:\s*<[^>]+>)?|int\[\])\s+([A-Za-z_]\w*)/g;
    let m;
    while ((m = declRe.exec(raw))) {
      addField(m[5], m[4].replace(/\s+/g, ""), "from declaration in prompt");
    }

    // "a title (String)", "page count (int)", "checked out (boolean)"
    const parenRe = /\b([A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z][A-Za-z0-9]*){0,4})\s*\(\s*(String|int|Integer|double|boolean|long|char|float)\s*\)/gi;
    while ((m = parenRe.exec(raw))) {
      const phrase = cleanFieldPhrase(m[1]);
      if (!phrase) continue;
      addField(toCamel(phrase), m[2] === "Integer" ? "int" : m[2], "from parenthetical type");
    }

    // "field/attribute/variable called X" / "stores the title"
    const storeRe = /\b(?:field|attribute|variable|property)\s+(?:called|named|for)?\s*([A-Za-z][\w\s]{0,24})/gi;
    while ((m = storeRe.exec(raw))) {
      const chunk = m[1].trim();
      addField(toCamel(chunk), guessType(chunk + " " + raw.slice(Math.max(0, m.index - 40), m.index + 80)), "mentioned as field");
    }

    const store2 = /\b(?:stores?|holds?|tracks?|keeps?|represents?)\s+(?:the\s+|a\s+|an\s+)?([^.;\n]+?)(?=\.\s|\.\n|$|\.\s*Provide|\.\s*Include|\.\s*Also)/gi;
    while ((m = store2.exec(raw))) {
      const list = m[1].trim();
      list.split(/,|\/|\band\b/i).forEach((part) => {
        const chunk = cleanFieldPhrase(part);
        if (!chunk || /^(class|object|value|data|information)$/i.test(chunk)) return;
        addField(toCamel(chunk), guessType(chunk + " " + part), "from “stores/holds” phrasing");
      });
    }

    // boolean from "whether it is checked out"
    const whether = /\bwhether\s+(?:it\s+|the\s+\w+\s+)?(?:is|has)\s+([a-z][a-z0-9\s]{0,24}?)(?=\s*\(|\s*[,.;]|\s+and\b|$)/gi;
    while ((m = whether.exec(raw))) {
      const phrase = cleanFieldPhrase(m[1]);
      if (!phrase) continue;
      const name = /^is[A-Z]/.test(toPascal(phrase)) || /^is\s/i.test(phrase)
        ? toCamel(phrase)
        : toCamel("is " + phrase);
      addField(name, "boolean", "from whether-is phrasing");
    }

    const wantGetters = /\bgetters?\b/i.test(raw) || /\baccessors?\b/i.test(raw) || /\bget\s+methods?\b/i.test(raw) || fields.length > 0;
    const wantSetters = /\bsetters?\b/i.test(raw) || /\bmutators?\b/i.test(raw) || /\bset\s+methods?\b/i.test(raw);
    const wantCtor = /\bconstructors?\b/i.test(raw) || /\bcreate(?:s|d)?\s+with\b/i.test(raw);
    const wantToString = /\btoString\b/i.test(raw);
    const wantMain = /\bmain\s+method\b/i.test(raw) || /\bdriver\b/i.test(raw) || /\btest\s+your\s+class\b/i.test(raw);

    if (!fields.length) {
      // soft fallback: capitalized nouns after "with"
      const withList = raw.match(/\bwith\s+([^.;\n]+)/i);
      if (withList) {
        withList[1].split(/,| and /i).forEach((part) => {
          const p = part.trim();
          if (p.length > 2 && p.length < 40) addField(toCamel(p), guessType(p), "from “with …” list");
        });
      }
    }

    const sketch = buildClassSketch(className, fields, {
      getters: wantGetters || true,
      setters: wantSetters,
      ctor: wantCtor || fields.length > 0,
      toString: wantToString,
      main: wantMain
    });

    return {
      className: className,
      fields: fields,
      wantGetters: wantGetters || true,
      wantSetters: wantSetters,
      wantCtor: wantCtor || fields.length > 0,
      wantToString: wantToString,
      wantMain: wantMain,
      sketch: sketch,
      summaryHtml: renderAssignSummary(className, fields, {
        getters: wantGetters || true,
        setters: wantSetters,
        ctor: wantCtor || fields.length > 0,
        toString: wantToString,
        main: wantMain
      })
    };
  }

  function buildClassSketch(className, fields, opts) {
    let out = "public class " + className + " {\n";
    fields.forEach((f) => {
      out += "    private " + f.type + " " + f.name + ";\n";
    });
    if (fields.length) out += "\n";
    if (opts.ctor) {
      const params = fields.map((f) => f.type + " " + f.name).join(", ");
      out += "    public " + className + "(" + params + ") {\n";
      fields.forEach((f) => { out += "        this." + f.name + " = " + f.name + ";\n"; });
      out += "    }\n\n";
    }
    if (opts.getters) {
      fields.forEach((f) => {
        const cap = f.name.charAt(0).toUpperCase() + f.name.slice(1);
        let method;
        if (f.type === "boolean") {
          method = /^is[A-Z]/.test(f.name) || /^has[A-Z]/.test(f.name) ? f.name : "is" + cap;
        } else {
          method = "get" + cap;
        }
        out += "    public " + f.type + " " + method + "() {\n        return " + f.name + ";\n    }\n\n";
      });
    }
    if (opts.setters) {
      fields.forEach((f) => {
        if (f.type === "boolean" && /^is[A-Z]/.test(f.name)) return;
        const cap = f.name.charAt(0).toUpperCase() + f.name.slice(1);
        out += "    public void set" + cap + "(" + f.type + " " + f.name + ") {\n"
          + "        this." + f.name + " = " + f.name + ";\n    }\n\n";
      });
    }
    if (opts.toString) {
      out += "    @Override\n    public String toString() {\n"
        + "        return \"" + className + "{\" +\n";
      fields.forEach((f, i) => {
        out += "            \"" + (i ? ", " : "") + f.name + "=\" + " + f.name + " +\n";
      });
      out += "            '}';\n    }\n";
    }
    out += "}\n";
    return out;
  }

  function renderAssignSummary(className, fields, opts) {
    let html = "<h3>Class: <code>" + escapeXml(className) + "</code></h3>";
    if (!fields.length) {
      html += "<p>No clear fields found — try listing them like <code>title (String)</code> or <code>private int pages</code>.</p>";
      return html;
    }
    html += "<h4>Fields to store</h4><ul>";
    fields.forEach((f) => {
      html += "<li><code>private " + escapeXml(f.type) + " " + escapeXml(f.name) + ";</code>"
        + (f.note ? " <span class=\"muted\">(" + escapeXml(f.note) + ")</span>" : "") + "</li>";
    });
    html += "</ul><h4>Methods the prompt asks for</h4><ul>";
    if (opts.ctor) html += "<li>Constructor taking " + fields.map((f) => f.name).join(", ") + "</li>";
    if (opts.getters) {
      html += "<li>Getters: "
        + fields.map((f) => {
          const cap = f.name.charAt(0).toUpperCase() + f.name.slice(1);
          return f.type === "boolean" ? ( /^is/.test(f.name) ? f.name + "()" : "is" + cap + "()" ) : "get" + cap + "()";
        }).join(", ") + "</li>";
    }
    if (opts.setters) {
      html += "<li>Setters: "
        + fields.filter((f) => !(f.type === "boolean" && /^is/.test(f.name)))
          .map((f) => "set" + f.name.charAt(0).toUpperCase() + f.name.slice(1) + "()")
          .join(", ") + "</li>";
    } else {
      html += "<li>Setters: not clearly required (add if the prompt says “change” / “set” / “update”).</li>";
    }
    if (opts.toString) html += "<li><code>toString()</code></li>";
    if (opts.main) html += "<li>A <code>main</code> / driver to test the class</li>";
    html += "</ul><h4>How to use getters / setters</h4>"
      + "<p>Keep fields <code>private</code>. Other classes should call "
      + "<code>obj.getName()</code> to read and <code>obj.setName(value)</code> to change — "
      + "never <code>obj.name</code> from outside.</p>";
    return html;
  }

  global.LarkExtras = {
    buildUml: buildUml,
    analyzeAssignment: analyzeAssignment
  };
})(window);
