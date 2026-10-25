#!/usr/bin/env lua5.4
-- Tests for java_engine.lua (requires tokenizer + json_util).

local function load_rel(path)
  local chunk, err = loadfile(path)
  assert(chunk, err)
  return chunk()
end

local root = arg[1] or "web/lua"
load_rel(root .. "/java_tokenizer.lua")
load_rel(root .. "/json_util.lua")
local E = load_rel(root .. "/java_engine.lua")
assert(E and E.beautify and E.diagnostics)

local failures = 0
local function fail(msg)
  failures = failures + 1
  io.stderr:write("FAIL: " .. msg .. "\n")
end

local function eq(a, b, label)
  if a ~= b then fail((label or "eq") .. ": expected " .. tostring(b) .. " got " .. tostring(a)) end
end

-- Beautify indents a simple class
local pretty = E.beautify("public class A{\nvoid m(){\nint x=1;\n}\n}\n", { indentSize = 4 })
if not pretty.text:find("    void m") then fail("beautify should indent method: " .. pretty.text) end
if not pretty.text:find("        int x") then fail("beautify should indent body: " .. pretty.text) end

-- Beautify does not rewrite braces inside strings
local withStr = E.beautify('String s = \"{\";\n', { indentSize = 4 })
if not withStr.text:find('\"{\"') then fail("beautify must keep brace inside string") end

-- Brace diagnostics catch missing close
local braces = E.brace_diagnostics("class A {\n  void m() {\n")
local codes = {}
for _, w in ipairs(braces) do codes[#codes + 1] = w.code end
local joined = table.concat(codes, ",")
if not joined:find("unbalanced") then fail("expected unbalanced warning, got " .. joined) end

-- Unused import
local unused = E.unused_import_diagnostics(
  "import java.util.List;\nimport java.util.Map;\npublic class A { List x; }\n"
)
local names = {}
for _, w in ipairs(unused) do names[#names + 1] = w.importName end
local njoin = table.concat(names, ",")
if not njoin:find("java.util.Map") then fail("Map should be unused: " .. njoin) end
if njoin:find("java.util.List") then fail("List should be used: " .. njoin) end

-- Enclosing brace range
local src = "class A { void m() { int x = 1; } }\n"
local inner = src:find("{", 1, true)
-- offset inside method body
local body = src:find("int", 1, true)
local range = E.enclosing_brace_range(src, body)
if not range then
  fail("enclosing brace missing")
else
  local slice = src:sub(range.from + 1, range.to + 1)
  if not slice:find("int x") then fail("enclosing slice wrong: " .. slice) end
end

-- class close index
local close = E.class_close_index("class A { int x; }\n")
eq(close, #"class A { int x; ", "class close") -- 0-based index of final }

-- Snippets
local hits = E.match_snippets("sou")
local found = false
for _, s in ipairs(hits.snippets) do
  if s.id == "sout" then found = true end
end
if not found then fail("match_snippets sou should find sout") end

local exp = E.expand_snippet("sout", "    ")
if not exp.text:find("System.out.println") then fail("expand sout") end
if not exp.text:match("^    ") then fail("expand should apply indent") end

-- JSON dispatch
local json = E.dispatch_json("beautify", { source = "class A{\n}\n", indentSize = 4 })
if not json:find("\"text\"") then fail("dispatch_json missing text: " .. json) end

if failures > 0 then
  io.stderr:write(failures .. " failure(s)\n")
  os.exit(1)
end
print("java_engine_test ok")
