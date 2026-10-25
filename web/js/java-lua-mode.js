/**
 * CodeMirror mode powered by Lark's Lua Java tokenizer (Fengari).
 *
 * The real highlighter lives in lua/java_tokenizer.lua. This file only bridges
 * Lua tokens into CodeMirror styles (.cm-keyword, .cm-string, …).
 * Falls back to the bundled clike Java mode if Lua cannot load.
 */
(function (global) {
  "use strict";

  var MODE_NAME = "lark-java";
  var ready = false;
  var loadError = null;
  var nextTokenFn = null;
  var startStateFn = null;
  var clikeAliased = false;

  function aliasClikeJava() {
    if (clikeAliased || typeof CodeMirror === "undefined") return;
    try {
      var resolved = CodeMirror.resolveMode("text/x-java");
      if (resolved) {
        CodeMirror.defineMIME("text/x-java-clike-fallback", resolved);
        clikeAliased = true;
      }
    } catch (e) {
      /* clike not loaded */
    }
  }

  function fromLuaState(obj) {
    if (!obj) return { mode: "code", quote: "" };
    var mode = obj.mode;
    var quote = obj.quote;
    if ((mode === undefined || quote === undefined) && typeof obj.get === "function") {
      try {
        if (mode === undefined) mode = obj.get("mode");
        if (quote === undefined) quote = obj.get("quote");
      } catch (e) { /* ignore */ }
    }
    return { mode: mode || "code", quote: quote || "" };
  }

  function readField(obj, key) {
    if (!obj) return undefined;
    if (obj[key] !== undefined) return obj[key];
    if (typeof obj.get === "function") {
      try { return obj.get(key); } catch (e) { return undefined; }
    }
    return undefined;
  }

  function callNext(line, pos, state) {
    var luaPos = pos + 1; // Lua strings are 1-based
    var result = nextTokenFn({
      line: line,
      pos: luaPos,
      mode: state.mode || "code",
      quote: state.quote || ""
    });
    if (!result) return null;
    var style = readField(result, "style");
    var stop = readField(result, "stop");
    var newState = fromLuaState(readField(result, "state"));
    if (style === false || style === "") style = null;
    var end = (typeof stop === "number" ? stop : luaPos + 1) - 1;
    if (end <= pos) end = pos + 1;
    return { style: style, end: end, state: newState };
  }

  function defineMode() {
    if (typeof CodeMirror === "undefined") return;
    aliasClikeJava();
    CodeMirror.defineMode(MODE_NAME, function () {
      return {
        startState: function () {
          if (startStateFn) return fromLuaState(startStateFn());
          return { mode: "code", quote: "" };
        },
        copyState: function (state) {
          return { mode: state.mode || "code", quote: state.quote || "" };
        },
        token: function (stream, state) {
          if (!nextTokenFn) {
            stream.next();
            return null;
          }
          var hit = callNext(stream.string, stream.pos, state);
          if (!hit) {
            stream.next();
            return null;
          }
          // Advance the CodeMirror stream to the token end.
          var target = hit.end;
          while (stream.pos < target && !stream.eol()) stream.next();
          state.mode = hit.state.mode;
          state.quote = hit.state.quote;
          return hit.style;
        },
        blockCommentStart: "/*",
        blockCommentEnd: "*/",
        lineComment: "//",
        fold: "brace"
      };
    });
    CodeMirror.defineMIME("text/x-lark-java", MODE_NAME);
    CodeMirror.defineMIME("text/x-java", MODE_NAME);
    ready = true;
  }

  // Single-table request avoids Fengari pushing JS `this`/`null` as a Lua arg
  // (which became the string "null" and matched the Java atom!).
  var START_CHUNK = [
    "assert(JavaTokenizer, 'JavaTokenizer missing')",
    "return function()",
    "  return JavaTokenizer.start_state()",
    "end"
  ].join("\n");

  var NEXT_CHUNK = [
    "assert(JavaTokenizer, 'JavaTokenizer missing')",
    "local function field(obj, key)",
    "  if obj == nil then return nil end",
    "  local ok, v = pcall(function() return obj[key] end)",
    "  if ok and v ~= nil then return v end",
    "  ok, v = pcall(function()",
    "    if obj.get ~= nil then return obj:get(key) end",
    "  end)",
    "  if ok then return v end",
    "  return nil",
    "end",
    "local function pick_req(a, b)",
    "  -- Fengari may pass JS `this`/null first; JS objects may be userdata proxies.",
    "  if a ~= nil and a ~= 'null' and field(a, 'line') ~= nil then return a end",
    "  if b ~= nil and field(b, 'line') ~= nil then return b end",
    "  if a ~= nil and a ~= 'null' then return a end",
    "  return b",
    "end",
    "return function(a, b)",
    "  local req = pick_req(a, b)",
    "  local line = field(req, 'line')",
    "  if type(line) ~= 'string' then line = tostring(line or '') end",
    "  local pos = math.floor(tonumber(field(req, 'pos')) or 1)",
    "  local st = {",
    "    mode = tostring(field(req, 'mode') or 'code'),",
    "    quote = tostring(field(req, 'quote') or '')",
    "  }",
    "  local style, stop, newst = JavaTokenizer.next_token(line, pos, st)",
    "  return { style = style, stop = stop, state = newst }",
    "end"
  ].join("\n");

  function installFromSource(luaSource) {
    if (typeof fengari === "undefined" || typeof fengari.load !== "function") {
      throw new Error("Fengari is not available");
    }
    fengari.load(luaSource, "=java_tokenizer.lua")();
    var start = fengari.load(START_CHUNK, "=lark_java_start.lua")();
    var next = fengari.load(NEXT_CHUNK, "=lark_java_next.lua")();
    if (typeof start !== "function" || typeof next !== "function") {
      throw new Error("Lua bridge missing start/next functions");
    }
    startStateFn = function () { return start(); };
    nextTokenFn = function (req) { return next(req); };
    defineMode();
  }

  function loadTextSync(url) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, false);
    xhr.send(null);
    if (xhr.status > 0 && (xhr.status < 200 || xhr.status >= 300)) {
      throw new Error("HTTP " + xhr.status + " loading " + url);
    }
    if (!xhr.responseText) throw new Error("Empty response for " + url);
    return xhr.responseText;
  }

  function publish(ok) {
    global.LarkJavaLua = {
      ready: !!ok,
      mode: ok ? MODE_NAME : "text/x-java",
      error: ok ? null : loadError,
      start: startAsync,
      startSync: startSync,
      nextToken: nextTokenFn,
      startState: startStateFn
    };
  }

  function startSync(url) {
    url = url || "lua/java_tokenizer.lua";
    try {
      if (typeof fengari === "undefined") throw new Error("fengari-web.js not loaded");
      installFromSource(loadTextSync(url));
      publish(true);
      return true;
    } catch (err) {
      loadError = err && err.message ? err.message : String(err);
      console.warn("[Lark] Java Lua tokenizer unavailable — using clike:", loadError);
      publish(false);
      return false;
    }
  }

  function startAsync(url) {
    url = url || "lua/java_tokenizer.lua";
    if (typeof fengari === "undefined") {
      loadError = "fengari-web.js not loaded";
      publish(false);
      return Promise.resolve(false);
    }
    return fetch(url, { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
        return res.text();
      })
      .then(function (src) {
        installFromSource(src);
        publish(true);
        return true;
      })
      .catch(function (err) {
        loadError = err && err.message ? err.message : String(err);
        console.warn("[Lark] Java Lua tokenizer unavailable — using clike:", loadError);
        publish(false);
        return false;
      });
  }

  aliasClikeJava();
  publish(false);

  // Auto-boot once the DOM scripts above us have registered Fengari.
  // Kept out of index.html so CSP script-src 'self' stays intact.
  if (typeof document !== "undefined") {
    var bootUrl = "lua/java_tokenizer.lua";
    try {
      var me = document.currentScript && document.currentScript.src;
      if (me && /[?&]v=/.test(me)) {
        bootUrl += me.slice(me.indexOf("?"));
      }
    } catch (e) { /* ignore */ }
    startSync(bootUrl);
  }
})(typeof window !== "undefined" ? window : this);
