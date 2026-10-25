--[[
  Lark Java syntax tokenizer (Lua).

  Pure Lua 5.3/5.4 — no JS deps. The browser bridge (java-lua-mode.js) runs this
  via Fengari and feeds styles into CodeMirror (.cm-keyword, .cm-string, …).

  API:
    JavaTokenizer.start_state() -> state table
    JavaTokenizer.next_token(line, pos, state) -> style|nil, new_pos, state
      style is a CodeMirror token class name (without the "cm-" prefix), or nil
      for unstyled spans (whitespace / plain punctuation).
    JavaTokenizer.tokenize_line(line, state) -> { {style, text}, ... }, state
]]

local JavaTokenizer = {}

-- Keys that are Lua reserved words must be quoted (break, do, for, …).
local KEYWORDS = {
  abstract = true, assert = true, ["break"] = true, case = true, catch = true,
  class = true, const = true, continue = true, ["default"] = true, ["do"] = true,
  ["else"] = true, enum = true, extends = true, final = true, finally = true,
  ["for"] = true, ["goto"] = true, ["if"] = true, implements = true, import = true,
  instanceof = true, interface = true, native = true, new = true,
  package = true, private = true, protected = true, public = true,
  ["return"] = true, static = true, strictfp = true, super = true, switch = true,
  synchronized = true, this = true, ["throw"] = true, throws = true,
  transient = true, try = true, volatile = true, ["while"] = true,
  -- modern Java
  var = true, yield = true, record = true, sealed = true, permits = true,
  when = true, exports = true, module = true, open = true, opens = true,
  provides = true, requires = true, to = true, transitive = true, uses = true,
  ["with"] = true,
}

local ATOMS = {
  ["true"] = true, ["false"] = true, ["null"] = true,
}

local TYPES = {
  boolean = true, byte = true, char = true, double = true, float = true,
  int = true, long = true, short = true, void = true,
}

-- Byte-based checks (Fengari/JS interop can make relational string compares flaky).
local function is_alpha_byte(b)
  return b and ((b >= 65 and b <= 90) or (b >= 97 and b <= 122) or b == 95 or b == 36)
end

local function is_digit_byte(b)
  return b and b >= 48 and b <= 57
end

local function is_alnum_byte(b)
  return is_alpha_byte(b) or is_digit_byte(b)
end

local function is_hex_byte(b)
  return is_digit_byte(b)
      or (b and b >= 97 and b <= 102)
      or (b and b >= 65 and b <= 70)
end

local function peek(line, i)
  return line:sub(i, i)
end

local function peek_byte(line, i)
  return line:byte(i)
end

local function starts_with(line, i, s)
  return line:sub(i, i + #s - 1) == s
end

function JavaTokenizer.start_state()
  return {
    -- "code" | "block_comment" | "string" | "char" | "text_block"
    mode = "code",
    -- for string / char: the opening quote character
    quote = "",
  }
end

local function copy_state(state)
  return {
    mode = state.mode or "code",
    quote = state.quote or "",
  }
end

--- Skip a Java string escape sequence starting at backslash index `i`.
local function skip_escape(line, i)
  local n = #line
  if i > n or peek(line, i) ~= "\\" then return i end
  i = i + 1
  if i > n then return i end
  local b = peek_byte(line, i)
  -- octal \0..\377
  if b and b >= 48 and b <= 55 then
    i = i + 1
    for _ = 1, 2 do
      local d = peek_byte(line, i)
      if not (d and d >= 48 and d <= 55) then break end
      i = i + 1
    end
    return i
  end
  -- unicode \uXXXX (and Java allows multiple u)
  if peek(line, i) == "u" then
    i = i + 1
    while peek(line, i) == "u" do i = i + 1 end
    for _ = 1, 4 do
      if not is_hex_byte(peek_byte(line, i)) then break end
      i = i + 1
    end
    return i
  end
  return i + 1
end

local function finish_block_comment(line, pos, state)
  local n = #line
  local i = pos
  while i <= n do
    if starts_with(line, i, "*/") then
      state.mode = "code"
      return "comment", i + 2, state
    end
    i = i + 1
  end
  return "comment", n + 1, state
end

local function finish_string(line, pos, state)
  local n = #line
  local i = pos
  local q = state.quote
  while i <= n do
    local c = peek(line, i)
    if c == "\\" then
      i = skip_escape(line, i)
    elseif c == q then
      state.mode = "code"
      state.quote = ""
      return "string", i + 1, state
    else
      i = i + 1
    end
  end
  -- Unclosed string — stay in string mode across the line break only for
  -- text blocks; ordinary " / ' strings end at EOL in our highlighter.
  if state.mode ~= "text_block" then
    state.mode = "code"
    state.quote = ""
  end
  return "string", n + 1, state
end

local function finish_text_block(line, pos, state)
  local n = #line
  local i = pos
  while i <= n do
    if starts_with(line, i, '"""') then
      state.mode = "code"
      state.quote = ""
      return "string", i + 3, state
    end
    local c = peek(line, i)
    if c == "\\" then
      i = skip_escape(line, i)
    else
      i = i + 1
    end
  end
  return "string", n + 1, state
end

local function scan_number(line, pos)
  local n = #line
  local i = pos
  local c0 = peek(line, i)
  if c0 == "0" then
    local nx = peek(line, i + 1)
    if nx == "x" or nx == "X" then
      i = i + 2
      local saw = false
      while i <= n do
        local c = peek(line, i)
        if c == "_" then i = i + 1
        elseif is_hex_byte(peek_byte(line, i)) then saw = true; i = i + 1
        else break end
      end
      if not saw then return pos + 1 end
    elseif nx == "b" or nx == "B" then
      i = i + 2
      local saw = false
      while i <= n do
        local c = peek(line, i)
        if c == "_" then i = i + 1
        elseif c == "0" or c == "1" then saw = true; i = i + 1
        else break end
      end
      if not saw then return pos + 1 end
    else
      -- decimal / octal-ish — scan digits and fraction below
      i = i + 1
      while i <= n do
        local c = peek(line, i)
        if c == "_" then i = i + 1
        elseif is_digit_byte(peek_byte(line, i)) then i = i + 1
        else break end
      end
    end
  else
    while i <= n do
      local c = peek(line, i)
      if c == "_" then i = i + 1
      elseif is_digit_byte(peek_byte(line, i)) then i = i + 1
      else break end
    end
  end

  -- fraction
  if peek(line, i) == "." and is_digit_byte(peek_byte(line, i + 1)) then
    i = i + 1
    while i <= n do
      local c = peek(line, i)
      if c == "_" then i = i + 1
      elseif is_digit_byte(peek_byte(line, i)) then i = i + 1
      else break end
    end
  end

  -- exponent
  local e = peek(line, i)
  if e == "e" or e == "E" or e == "p" or e == "P" then
    local j = i + 1
    local s = peek(line, j)
    if s == "+" or s == "-" then j = j + 1 end
    if is_digit_byte(peek_byte(line, j)) then
      i = j
      while i <= n do
        local c = peek(line, i)
        if c == "_" then i = i + 1
        elseif is_digit_byte(peek_byte(line, i)) then i = i + 1
        else break end
      end
    end
  end

  -- type suffix
  local suf = peek(line, i)
  if suf == "f" or suf == "F" or suf == "d" or suf == "D"
      or suf == "l" or suf == "L" then
    i = i + 1
  end
  return i
end

local function scan_operator(line, pos)
  local n = #line
  -- longest-match operators
  local multi = {
    ">>>=", ">>=", "<<=", "...", "::", "->",
    "==", "!=", "<=", ">=", "&&", "||", "++", "--",
    "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=",
    "<<", ">>", ">>>",
  }
  for _, op in ipairs(multi) do
    if starts_with(line, pos, op) then
      return pos + #op
    end
  end
  local c = peek(line, pos)
  local singles = "+-*/%<>=!&|^~?:."
  if c ~= "" and singles:find(c, 1, true) then
    return pos + 1
  end
  return pos
end

local function style_for_word(word)
  if KEYWORDS[word] then return "keyword" end
  if ATOMS[word] then return "atom" end
  if TYPES[word] then return "type" end
  -- Capitalized identifier → type-ish (matches CodeMirror clike Java heuristic).
  local first = word:byte(1)
  if first and first >= 65 and first <= 90 then return "variable-3" end
  return "variable"
end

function JavaTokenizer.next_token(line, pos, state)
  state = copy_state(state or JavaTokenizer.start_state())
  -- Fengari may pass JS values — normalize to plain Lua string/number.
  if type(line) ~= "string" then line = tostring(line or "") end
  pos = math.floor(tonumber(pos) or 1)
  if pos < 1 then pos = 1 end
  local n = #line
  if pos > n then return nil, pos, state end

  if state.mode == "block_comment" then
    return finish_block_comment(line, pos, state)
  end
  if state.mode == "string" or state.mode == "char" then
    return finish_string(line, pos, state)
  end
  if state.mode == "text_block" then
    return finish_text_block(line, pos, state)
  end

  local c = peek(line, pos)
  local b = peek_byte(line, pos)

  -- whitespace
  if c == " " or c == "\t" or c == "\r" or c == "\f" then
    local i = pos + 1
    while i <= n do
      local w = peek(line, i)
      if w ~= " " and w ~= "\t" and w ~= "\r" and w ~= "\f" then break end
      i = i + 1
    end
    return nil, i, state
  end

  -- line comment
  if starts_with(line, pos, "//") then
    return "comment", n + 1, state
  end

  -- block comment
  if starts_with(line, pos, "/*") then
    state.mode = "block_comment"
    return finish_block_comment(line, pos + 2, state)
  end

  -- text block
  if starts_with(line, pos, '"""') then
    state.mode = "text_block"
    return finish_text_block(line, pos + 3, state)
  end

  -- string / char
  if c == '"' or c == "'" then
    state.mode = (c == "'") and "char" or "string"
    state.quote = c
    return finish_string(line, pos + 1, state)
  end

  -- annotation
  if c == "@" then
    local i = pos + 1
    if is_alpha_byte(peek_byte(line, i)) then
      i = i + 1
      while i <= n and is_alnum_byte(peek_byte(line, i)) do i = i + 1 end
      return "meta", i, state
    end
    return "meta", pos + 1, state
  end

  -- non-sealed (single keyword with hyphen)
  if starts_with(line, pos, "non-sealed") then
    local after_b = peek_byte(line, pos + #"non-sealed")
    if not after_b or not is_alnum_byte(after_b) then
      return "keyword", pos + #"non-sealed", state
    end
  end

  -- identifier / keyword
  if is_alpha_byte(b) then
    local i = pos + 1
    while i <= n and is_alnum_byte(peek_byte(line, i)) do i = i + 1 end
    local word = line:sub(pos, i - 1)
    return style_for_word(word), i, state
  end

  -- number (including .5)
  if is_digit_byte(b) or (c == "." and is_digit_byte(peek_byte(line, pos + 1))) then
    return "number", scan_number(line, pos), state
  end

  -- operators
  local op_end = scan_operator(line, pos)
  if op_end > pos then
    return "operator", op_end, state
  end

  -- punctuation / unknown single char
  return nil, pos + 1, state
end

function JavaTokenizer.tokenize_line(line, state)
  state = copy_state(state or JavaTokenizer.start_state())
  line = line or ""
  local tokens = {}
  local pos = 1
  local n = #line
  while pos <= n do
    local style, next_pos, new_state = JavaTokenizer.next_token(line, pos, state)
    if next_pos <= pos then next_pos = pos + 1 end
    tokens[#tokens + 1] = {
      style = style,
      text = line:sub(pos, next_pos - 1),
    }
    state = new_state
    pos = next_pos
  end
  return tokens, state
end

-- Module table for Fengari / require-style loaders.
_G.JavaTokenizer = JavaTokenizer
return JavaTokenizer
