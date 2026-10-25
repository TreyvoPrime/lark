#!/usr/bin/env lua5.4
-- Unit tests for web/lua/java_tokenizer.lua (no browser required).

local path = arg[1] or "web/lua/java_tokenizer.lua"
local chunk, err = loadfile(path)
assert(chunk, err)
local T = chunk()
assert(T and T.next_token and T.tokenize_line)

local failures = 0

local function fail(msg)
  failures = failures + 1
  io.stderr:write("FAIL: " .. msg .. "\n")
end

local function styles_of(line, state)
  local tokens, st = T.tokenize_line(line, state or T.start_state())
  local out = {}
  for _, tok in ipairs(tokens) do
    if tok.text:match("%S") then
      out[#out + 1] = (tok.style or "punct") .. ":" .. tok.text
    end
  end
  return out, st
end

local function expect_styles(line, expected, label)
  local got = styles_of(line)
  local g = table.concat(got, " ")
  local e = table.concat(expected, " ")
  if g ~= e then
    fail((label or line) .. "\n  expected: " .. e .. "\n  got:      " .. g)
  end
end

expect_styles(
  "public class Hello {",
  { "keyword:public", "keyword:class", "variable-3:Hello", "punct:{" },
  "class decl"
)

expect_styles(
  "  return 42;",
  { "keyword:return", "number:42", "punct:;" },
  "return number"
)

expect_styles(
  'String s = "hi\\n";',
  { "variable-3:String", "variable:s", "operator:=", 'string:"hi\\n"', "punct:;" },
  "string escape"
)

expect_styles(
  "boolean ok = true;",
  { "type:boolean", "variable:ok", "operator:=", "atom:true", "punct:;" },
  "boolean atom"
)

expect_styles(
  "// only a comment",
  { "comment:// only a comment" },
  "line comment"
)

expect_styles(
  "int x = 0xFF_0a;",
  { "type:int", "variable:x", "operator:=", "number:0xFF_0a", "punct:;" },
  "hex underscores"
)

expect_styles(
  "@Override public void run() {}",
  { "meta:@Override", "keyword:public", "type:void", "variable:run", "punct:(", "punct:)", "punct:{", "punct:}" },
  "annotation"
)

expect_styles(
  "non-sealed class A {}",
  { "keyword:non-sealed", "keyword:class", "variable-3:A", "punct:{", "punct:}" },
  "non-sealed"
)

expect_styles(
  "list.stream().map(x -> x);",
  { "variable:list", "operator:.", "variable:stream", "punct:(", "punct:)", "operator:.", "variable:map",
    "punct:(", "variable:x", "operator:->", "variable:x", "punct:)", "punct:;" },
  "arrow"
)

-- Block comment spanning lines
local st = T.start_state()
local t1, st = T.tokenize_line("int a; /* start", st)
local joined = {}
for _, tok in ipairs(t1) do
  if tok.style == "comment" then joined[#joined + 1] = tok.text end
end
local t2, st = T.tokenize_line(" still * / comment */ int b;", st)
local saw_comment, saw_type = false, false
for _, tok in ipairs(t2) do
  if tok.style == "comment" then saw_comment = true end
  if tok.style == "type" and tok.text == "int" then saw_type = true end
end
if not saw_comment then fail("block comment continuation missing") end
if not saw_type then fail("code after block comment should tokenize") end
if st.mode ~= "code" then fail("should leave block comment mode, got " .. tostring(st.mode)) end

-- Text block
st = T.start_state()
local _, st = T.tokenize_line('String t = """', st)
if st.mode ~= "text_block" then fail("expected text_block mode") end
local _, st = T.tokenize_line("line two", st)
if st.mode ~= "text_block" then fail("text block should continue") end
local toks, st = T.tokenize_line('end """;', st)
local last_styles = {}
for _, tok in ipairs(toks) do
  if tok.text:match("%S") then last_styles[#last_styles + 1] = tok.style or "punct" end
end
local ok_tb = false
for i, s in ipairs(last_styles) do
  if s == "string" then ok_tb = true end
end
if not ok_tb then fail("text block closing line should include string tokens") end
if st.mode ~= "code" then fail("text block should end") end

if failures > 0 then
  io.stderr:write(failures .. " failure(s)\n")
  os.exit(1)
end
print("java_tokenizer_test ok")
