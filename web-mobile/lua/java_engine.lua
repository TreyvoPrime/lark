--[[
  Lark Java engine (Lua) — indent/beautify, structure, diagnostics, snippets.

  Requires globals set by prior loads:
    JavaTokenizer (java_tokenizer.lua)
    JsonUtil      (json_util.lua)

  Public: JavaEngine.*  (also _G.JavaEngine)
]]

assert(JavaTokenizer, "JavaTokenizer must load before java_engine.lua")
assert(JsonUtil, "JsonUtil must load before java_engine.lua")

local JavaEngine = {}

local function normalize_newlines(s)
  s = tostring(s or "")
  s = s:gsub("\r\n", "\n"):gsub("\r", "\n")
  return s
end

local function split_lines(s)
  local lines = {}
  if s == "" then return lines end
  local start = 1
  while true do
    local i = s:find("\n", start, true)
    if not i then
      lines[#lines + 1] = s:sub(start)
      break
    end
    lines[#lines + 1] = s:sub(start, i - 1)
    start = i + 1
  end
  return lines
end

--- Walk tokens across the whole source. fn(tok) where tok has
--- style, text, from (0-based), to (0-based exclusive), line (1-based), col (1-based).
local function each_token(source, fn)
  source = normalize_newlines(source)
  local state = JavaTokenizer.start_state()
  local offset = 0
  local line_no = 1
  local lines = split_lines(source)
  for li = 1, #lines do
    local line = lines[li]
    local pos = 1
    local n = #line
    while pos <= n do
      local style, stop, newst = JavaTokenizer.next_token(line, pos, state)
      if not stop or stop <= pos then stop = pos + 1 end
      local text = line:sub(pos, stop - 1)
      fn({
        style = style,
        text = text,
        from = offset + pos - 1,
        to = offset + stop - 1,
        line = line_no,
        col = pos,
      })
      state = newst
      pos = stop
    end
    -- virtual newline between lines (except after last)
    if li < #lines then
      offset = offset + n + 1
      line_no = line_no + 1
    else
      offset = offset + n
    end
  end
end

local function is_code_style(style)
  return style ~= "comment" and style ~= "string"
end

--------------------------------------------------------------------------
-- Structure helpers
--------------------------------------------------------------------------

function JavaEngine.class_close_index(source)
  source = normalize_newlines(source)
  local depth = 0
  local opened = false
  local close_at = -1
  each_token(source, function(tok)
    if close_at >= 0 then return end
    if not is_code_style(tok.style) then return end
    for i = 1, #tok.text do
      local c = tok.text:sub(i, i)
      if c == "{" then
        depth = depth + 1
        opened = true
      elseif c == "}" then
        depth = depth - 1
        if opened and depth == 0 then
          close_at = tok.from + i - 1
          return
        end
      end
    end
  end)
  return close_at
end

function JavaEngine.enclosing_brace_range(source, offset)
  source = normalize_newlines(source)
  offset = math.floor(tonumber(offset) or 0)
  if offset < 0 then offset = 0 end
  if offset > #source then offset = #source end

  -- Build list of code-only brace positions (0-based index of the brace char).
  local braces = {} -- { pos, ch }
  each_token(source, function(tok)
    if not is_code_style(tok.style) then return end
    for i = 1, #tok.text do
      local c = tok.text:sub(i, i)
      if c == "{" or c == "}" then
        braces[#braces + 1] = { pos = tok.from + i - 1, ch = c }
      end
    end
  end)

  local depth = 0
  local open = -1
  for i = #braces, 1, -1 do
    local b = braces[i]
    if b.pos > offset then
      -- skip braces after cursor for the backward search start;
      -- still allow b.pos == offset (cursor on brace)
    end
    if b.pos > offset then
      -- ignore
    elseif b.ch == "}" then
      depth = depth + 1
    elseif b.ch == "{" then
      if depth == 0 then
        open = b.pos
        break
      end
      depth = depth - 1
    end
  end
  if open < 0 then return nil end

  depth = 0
  for i = 1, #braces do
    local b = braces[i]
    if b.pos < open then
      -- skip
    elseif b.ch == "{" then
      depth = depth + 1
    elseif b.ch == "}" then
      depth = depth - 1
      if depth == 0 then
        return { from = open, to = b.pos }
      end
    end
  end
  return nil
end

--------------------------------------------------------------------------
-- Diagnostics
--------------------------------------------------------------------------

local function warning(opts)
  return {
    severity = opts.severity or "warning",
    line = opts.line or 1,
    column = opts.column or 1,
    message = opts.message or "",
    plain = opts.plain or opts.message or "",
    hint = opts.hint or "",
    code = opts.code or "",
    importName = opts.importName,
    methodName = opts.methodName,
  }
end

function JavaEngine.brace_diagnostics(source)
  source = normalize_newlines(source)
  local depth, paren, bracket = 0, 0, 0
  local line = 1
  local out = {}
  local early = nil

  each_token(source, function(tok)
    if early then return end
    line = tok.line
    if not is_code_style(tok.style) then return end
    for i = 1, #tok.text do
      local c = tok.text:sub(i, i)
      if c == "{" then depth = depth + 1
      elseif c == "}" then depth = depth - 1
      elseif c == "(" then paren = paren + 1
      elseif c == ")" then paren = paren - 1
      elseif c == "[" then bracket = bracket + 1
      elseif c == "]" then bracket = bracket - 1
      end
      if depth < 0 or paren < 0 or bracket < 0 then
        early = warning({
          severity = "error",
          line = tok.line,
          column = tok.col + i - 1,
          message = "Unbalanced braces or parentheses near this line.",
          plain = "A `{`, `}`, `(`, `)`, `[`, or `]` does not match near this line.",
          hint = "Count braces from the top of the class. Every opener needs a closer.",
          code = "unbalanced",
        })
        return
      end
    end
  end)

  if early then return { early } end

  -- last line number
  local lines = split_lines(source)
  local max_line = math.max(1, #lines)

  if depth ~= 0 then
    out[#out + 1] = warning({
      severity = "error",
      line = max_line,
      message = depth > 0 and "Missing closing brace(s)." or "Extra closing brace(s).",
      plain = depth > 0
          and ("This file is missing " .. depth .. " closing brace(s) `}`.")
          or "This file has extra closing brace(s) `}`.",
      hint = "Scroll to the end of the class and add or remove `}` until the structure matches.",
      code = "unbalanced-brace",
    })
  end
  if paren ~= 0 then
    out[#out + 1] = warning({
      severity = "error",
      line = max_line,
      message = paren > 0 and "Missing closing parenthesis." or "Extra closing parenthesis.",
      plain = paren > 0
          and "A `(` was never closed with `)`."
          or "There is an extra `)` without a matching `(`.",
      hint = "Check method calls and if/for conditions on recent lines.",
      code = "unbalanced-paren",
    })
  end
  if bracket ~= 0 then
    out[#out + 1] = warning({
      severity = "error",
      line = max_line,
      message = bracket > 0 and "Missing closing bracket." or "Extra closing bracket.",
      plain = bracket > 0
          and "A `[` was never closed with `]`."
          or "There is an extra `]` without a matching `[`.",
      hint = "Check array indexes on recent lines.",
      code = "unbalanced-bracket",
    })
  end
  return out
end

local function collect_imports(source)
  local imports = {} -- { name=, line=, static= }
  local lines = split_lines(normalize_newlines(source))
  for i, line in ipairs(lines) do
    local static, name = line:match("^%s*import%s+(static%s+)([%w_%.%*]+)%s*;")
    if not name then
      name = line:match("^%s*import%s+([%w_%.%*]+)%s*;")
      static = nil
    end
    if name then
      imports[#imports + 1] = {
        name = name,
        line = i,
        static = static ~= nil,
        simple = name:match("([%w_]+)$") or name,
      }
    end
  end
  return imports
end

function JavaEngine.unused_import_diagnostics(source)
  source = normalize_newlines(source)
  local imports = collect_imports(source)
  local out = {}
  local import_lines = {}
  for _, imp in ipairs(imports) do
    import_lines[imp.line] = true
  end

  -- Identifiers on non-import lines only.
  local id_counts = {}
  each_token(source, function(tok)
    if import_lines[tok.line] then return end
    if tok.style ~= "variable" and tok.style ~= "variable-3" and tok.style ~= "type"
        and tok.style ~= "def" and tok.style ~= "property" then
      return
    end
    local w = tok.text
    if w and w:match("^[%a_$]") then
      id_counts[w] = (id_counts[w] or 0) + 1
    end
  end)

  for _, imp in ipairs(imports) do
    if not imp.name:match("%.%*$") then
      local simple = imp.simple
      if (id_counts[simple] or 0) <= 0 then
        out[#out + 1] = warning({
          severity = "warning",
          line = imp.line,
          message = "Unused import: " .. imp.name,
          plain = "`" .. simple .. "` is imported but never used in this file.",
          hint = "Remove the unused import, or use the type somewhere.",
          code = "unused-import",
          importName = imp.name,
        })
      end
    end
  end
  return out
end

function JavaEngine.style_diagnostics(source)
  source = normalize_newlines(source)
  local out = {}
  local lines = split_lines(source)

  for i, line in ipairs(lines) do
    -- Build a code-only mask for this line via tokenizer (single-line state).
    local state = JavaTokenizer.start_state()
    local code = {}
    local pos = 1
    while pos <= #line do
      local style, stop, newst = JavaTokenizer.next_token(line, pos, state)
      if not stop or stop <= pos then stop = pos + 1 end
      local text = line:sub(pos, stop - 1)
      if is_code_style(style) then
        code[#code + 1] = text
      else
        code[#code + 1] = string.rep(" ", #text)
      end
      state = newst
      pos = stop
    end
    local mask = table.concat(code)

    if mask:find("==") and not mask:find("==%s*null") and not mask:find("null%s*==") then
      -- string literal compared with ==
      if line:find("\"[^\"]*\"%s*==") or line:find("==%s*\"[^\"]*\"")
          or line:find("'[^']*'%s*==") or line:find("==%s*'[^']*'") then
        out[#out + 1] = warning({
          severity = "warning",
          line = i,
          message = "Comparing Strings with == checks the same object, not the same text.",
          plain = "You are comparing text with `==`. That often fails even when the words look the same.",
          hint = "Use `.equals(\"text\")` (or `Objects.equals(a, b)`) for String content.",
          code = "string-eq",
        })
      end
    end

    if mask:match("%f[%w](if|for|while)%f[^%w]%s*%b()%s*;%s*$")
        and not mask:match("%f[%w](if|for|while)%f[^%w]%s*%b()%s*%{%s*$") then
      out[#out + 1] = warning({
        severity = "warning",
        line = i,
        message = "Empty statement after if/for/while — the next line is not inside the loop.",
        plain = "There is a `;` right after `if`/`for`/`while`, so the body never runs as part of it.",
        hint = "Remove that semicolon and put `{ ... }` on the following lines.",
        code = "empty-control",
      })
    end
  end
  return out
end

function JavaEngine.diagnostics(source)
  local warnings = {}
  local function append(list)
    for _, w in ipairs(list) do warnings[#warnings + 1] = w end
  end
  append(JavaEngine.brace_diagnostics(source))
  append(JavaEngine.unused_import_diagnostics(source))
  append(JavaEngine.style_diagnostics(source))
  return { warnings = warnings }
end

--------------------------------------------------------------------------
-- Beautify / indent
--------------------------------------------------------------------------

local function scan_line_for_indent(line, mode_start)
  -- Returns opens, closes, mode_end, was_non_code_line, code_mask, trimmed_should_preserve
  local mode = mode_start or "code"
  local opens, closes = 0, 0
  local code_mask = {}
  local saw_code = (mode == "code")
  local was_non_code = (mode ~= "code")
  local pos = 1
  local state = { mode = "code", quote = "" }
  if mode == "block_comment" or mode == "block" then
    state.mode = "block_comment"
  elseif mode == "string" or mode == "dq" then
    state.mode = "string"
    state.quote = "\""
  elseif mode == "char" or mode == "sq" then
    state.mode = "char"
    state.quote = "'"
  elseif mode == "text_block" or mode == "tq" then
    state.mode = "text_block"
  end

  -- Map engine modes to tokenizer modes
  local function export_mode(st)
    if st.mode == "block_comment" then return "block" end
    if st.mode == "string" then return "dq" end
    if st.mode == "char" then return "sq" end
    if st.mode == "text_block" then return "tq" end
    return "code"
  end

  while pos <= #line do
    local style, stop, newst = JavaTokenizer.next_token(line, pos, state)
    if not stop or stop <= pos then stop = pos + 1 end
    local text = line:sub(pos, stop - 1)
    state = newst

    if style == "comment" then
      -- line comment consumes rest; block may continue
      if state.mode == "code" and text:sub(1, 2) == "//" then
        break
      end
      -- otherwise skip
    elseif style == "string" then
      was_non_code = was_non_code and not saw_code
    else
      saw_code = true
      was_non_code = false
      for i = 1, #text do
        local c = text:sub(i, i)
        if c == "{" then
          opens = opens + 1
          code_mask[#code_mask + 1] = "{"
        elseif c == "}" then
          closes = closes + 1
          code_mask[#code_mask + 1] = "}"
        elseif c == "(" or c == ")" or c == "[" or c == "]" then
          code_mask[#code_mask + 1] = c
        else
          code_mask[#code_mask + 1] = " "
        end
      end
    end
    pos = stop
  end

  local mode_end = export_mode(state)
  if mode_end == "code" and state.mode == "code" then
    -- line comments end at newline already handled
  end
  if not saw_code and mode_start ~= "code" and mode_start ~= nil then
    was_non_code = true
  end
  return {
    opens = opens,
    closes = closes,
    mode_end = mode_end,
    was_non_code = was_non_code and not saw_code,
    code_mask = table.concat(code_mask),
    state = state,
  }
end

local function count_leading_closers(mask)
  local n = 0
  for i = 1, #mask do
    local c = mask:sub(i, i)
    if c == " " or c == "\t" then
      -- skip
    elseif c == "}" or c == ")" or c == "]" then
      n = n + 1
    else
      break
    end
  end
  return n
end

local function replace_outside_strings(text, pattern, repl)
  -- Apply gsub only on code segments; keep strings/comments intact.
  local out = {}
  local state = JavaTokenizer.start_state()
  local pos = 1
  local buf = {}
  local function flush_code()
    if #buf == 0 then return end
    local chunk = table.concat(buf)
    chunk = chunk:gsub(pattern, repl)
    out[#out + 1] = chunk
    buf = {}
  end
  while pos <= #text do
    local style, stop, newst = JavaTokenizer.next_token(text, pos, state)
    if not stop or stop <= pos then stop = pos + 1 end
    local piece = text:sub(pos, stop - 1)
    if style == "string" or style == "comment" then
      flush_code()
      out[#out + 1] = piece
    else
      buf[#buf + 1] = piece
    end
    state = newst
    pos = stop
  end
  flush_code()
  return table.concat(out)
end

local function tidy_code_spaces(line)
  local s = line:gsub("[ \t]+$", "")
  s = replace_outside_strings(s, "%f[%w](if|for|while|switch|catch|synchronized)%f[^%w]%(", "%1 (")
  s = replace_outside_strings(s, "%)%s*%{", ") {")
  s = replace_outside_strings(s, "([%w_])%{", "%1 {")
  s = replace_outside_strings(s, "%}%s*else%f[^%w]", "} else")
  s = replace_outside_strings(s, "%f[%w]else%f[^%w]%s*%{", "else {")
  s = replace_outside_strings(s, "%f[%w]try%f[^%w]%s*%{", "try {")
  s = replace_outside_strings(s, "%f[%w]finally%f[^%w]%s*%{", "finally {")
  s = replace_outside_strings(s, "%f[%w]do%f[^%w]%s*%{", "do {")
  s = replace_outside_strings(s, ",%s*", ", ")
  s = replace_outside_strings(s, "  +", " ")
  return s
end

function JavaEngine.beautify(source, options)
  options = options or {}
  local indent_size = tonumber(options.indentSize) or 4
  if indent_size ~= 2 and indent_size ~= 4 and indent_size ~= 8 then indent_size = 4 end
  local use_tabs = options.indentWithTabs == true or options.indentWithTabs == "true"
  local unit = use_tabs and "\t" or string.rep(" ", indent_size)
  local raw = normalize_newlines(source)
  if raw == "" then return { text = "" } end

  local lines = split_lines(raw)
  local out = {}
  local depth = 0
  local mode = "code"
  local tok_state = JavaTokenizer.start_state()
  local blank_run = 0

  for li = 1, #lines do
    local original = lines[li]
    -- Use tokenizer state carried across lines for accurate mode.
    local scan_opens, scan_closes = 0, 0
    local code_mask_parts = {}
    local saw_code = (tok_state.mode == "code")
    local was_non_code = (tok_state.mode ~= "code")
    local pos = 1
    local state = {
      mode = tok_state.mode,
      quote = tok_state.quote or "",
    }

    while pos <= #original do
      local style, stop, newst = JavaTokenizer.next_token(original, pos, state)
      if not stop or stop <= pos then stop = pos + 1 end
      local text = original:sub(pos, stop - 1)
      if style == "comment" then
        if newst.mode == "code" and text:sub(1, 2) == "//" then
          -- rest already consumed as one token by tokenizer? // eats to EOL as one token
          state = newst
          pos = stop
          break
        end
      elseif style == "string" then
        -- stay non-code if we started non-code
      else
        if style ~= nil or text:match("%S") then
          if is_code_style(style) or style == nil then
            if style == nil and text:match("^%s+$") then
              -- whitespace
            else
              saw_code = true
              was_non_code = false
            end
          end
        end
        if is_code_style(style) or (style == nil and not text:match("^%s+$")) then
          for i = 1, #text do
            local c = text:sub(i, i)
            if c == "{" then
              scan_opens = scan_opens + 1
              code_mask_parts[#code_mask_parts + 1] = "{"
            elseif c == "}" then
              scan_closes = scan_closes + 1
              code_mask_parts[#code_mask_parts + 1] = "}"
            elseif c == "(" or c == ")" or c == "[" or c == "]" then
              code_mask_parts[#code_mask_parts + 1] = c
            elseif not c:match("%s") then
              code_mask_parts[#code_mask_parts + 1] = " "
            else
              code_mask_parts[#code_mask_parts + 1] = " "
            end
          end
        end
      end
      state = newst
      pos = stop
    end
    tok_state = state

    local trimmed = original:match("^%s*(.-)%s*$") or ""
    if trimmed == "" then
      blank_run = blank_run + 1
      if blank_run <= 2 then out[#out + 1] = "" end
    else
      blank_run = 0
      if was_non_code and not saw_code then
        out[#out + 1] = original:gsub("[ \t]+$", "")
      else
        local line_depth = depth
        local code_mask = table.concat(code_mask_parts)
        if trimmed:match("^[}%])]") then
          local lead = count_leading_closers(code_mask)
          line_depth = math.max(0, depth - math.max(1, lead))
        elseif trimmed:match("^case%f[^%w]") or trimmed:match("^default%s*:") then
          line_depth = math.max(0, depth - 1)
        end
        local tidied = tidy_code_spaces(trimmed)
        out[#out + 1] = string.rep(unit, math.max(0, line_depth)) .. tidied
        depth = math.max(0, depth + scan_opens - scan_closes)
      end
    end
  end

  while #out > 0 and out[#out] == "" do
    out[#out] = nil
  end
  return { text = table.concat(out, "\n") .. "\n" }
end

--------------------------------------------------------------------------
-- Snippets / Assist templates
--------------------------------------------------------------------------

local SNIPPETS = {
  { id = "main", trigger = "main", label = "main method",
    text = "public static void main(String[] args) {\n    \n}" },
  { id = "sout", trigger = "sout", label = "println",
    text = "System.out.println();" },
  { id = "souf", trigger = "souf", label = "printf",
    text = "System.out.printf(\"%s%n\", );" },
  { id = "serr", trigger = "serr", label = "print error",
    text = "System.err.println();" },
  { id = "fori", trigger = "fori", label = "for i loop",
    text = "for (int i = 0; i < n; i++) {\n    \n}" },
  { id = "foreach", trigger = "foreach", label = "for-each loop",
    text = "for (Type item : collection) {\n    \n}" },
  { id = "while", trigger = "while", label = "while loop",
    text = "while (condition) {\n    \n}" },
  { id = "dowhile", trigger = "dowhile", label = "do-while loop",
    text = "do {\n    \n} while (condition);" },
  { id = "if", trigger = "if", label = "if statement",
    text = "if (condition) {\n    \n}" },
  { id = "ife", trigger = "ife", label = "if / else",
    text = "if (condition) {\n    \n} else {\n    \n}" },
  { id = "switch", trigger = "switch", label = "switch",
    text = "switch (value) {\n    case 1:\n        break;\n    default:\n        break;\n}" },
  { id = "try", trigger = "try", label = "try / catch",
    text = "try {\n    \n} catch (Exception e) {\n    System.out.println(e.getMessage());\n}" },
  { id = "tryr", trigger = "tryr", label = "try-with-resources",
    text = "try (Scanner in = new Scanner(System.in)) {\n    \n}" },
  { id = "scanner", trigger = "scanner", label = "Scanner input",
    text = "Scanner in = new Scanner(System.in);\nString line = in.nextLine();" },
  { id = "list", trigger = "list", label = "ArrayList",
    text = "List<String> list = new ArrayList<>();" },
  { id = "map", trigger = "map", label = "HashMap",
    text = "Map<String, Integer> map = new HashMap<>();" },
  { id = "arr", trigger = "arr", label = "int array",
    text = "int[] nums = new int[10];" },
  { id = "class", trigger = "class", label = "simple class",
    text = "public class Name {\n    \n}" },
  { id = "record", trigger = "record", label = "record",
    text = "public record Name(String field) {\n}" },
  { id = "tostring", trigger = "tostring", label = "toString stub",
    text = "@Override\npublic String toString() {\n    return \"Name{}\";\n}" },
  { id = "equalshash", trigger = "equalshash", label = "equals + hashCode stubs",
    text = "@Override\npublic boolean equals(Object o) {\n    if (this == o) return true;\n    if (o == null || getClass() != o.getClass()) return false;\n    Name other = (Name) o;\n    return true;\n}\n\n@Override\npublic int hashCode() {\n    return Objects.hash();\n}" },
  { id = "javadoc", trigger = "javadoc", label = "Javadoc",
    text = "/**\n * \n * @param \n * @return \n */" },
  { id = "matrix", trigger = "matrix", label = "matrix print (nested loops)",
    text = "int[][] matrix = {\n    {1, 2, 3},\n    {4, 5, 6},\n    {7, 8, 9}\n};\nfor (int i = 0; i < matrix.length; i++) {\n    for (int j = 0; j < matrix[i].length; j++) {\n        System.out.print(matrix[i][j] + \" \");\n    }\n    System.out.println();\n}" },
  { id = "matblock", trigger = "matblock", label = "matrix print loops only",
    text = "for (int i = 0; i < matrix.length; i++) {\n    for (int j = 0; j < matrix[i].length; j++) {\n        System.out.print(matrix[i][j] + \" \");\n    }\n    System.out.println();\n}" },
}

local function reindent_snippet(text, indent)
  indent = indent or ""
  local lines = split_lines(normalize_newlines(text))
  local out = {}
  for i, line in ipairs(lines) do
    if line == "" then
      out[i] = ""
    else
      out[i] = indent .. line
    end
  end
  return table.concat(out, "\n")
end

function JavaEngine.list_snippets()
  local list = {}
  for _, s in ipairs(SNIPPETS) do
    list[#list + 1] = {
      id = s.id,
      trigger = s.trigger,
      label = s.label,
      text = s.text,
    }
  end
  return { snippets = list }
end

function JavaEngine.match_snippets(prefix)
  prefix = tostring(prefix or ""):lower()
  local list = {}
  for _, s in ipairs(SNIPPETS) do
    local trig = s.trigger:lower()
    local label = s.label:lower()
    if prefix == "" or trig:sub(1, #prefix) == prefix or label:find(prefix, 1, true) then
      list[#list + 1] = {
        id = s.id,
        trigger = s.trigger,
        label = s.label,
        text = s.text,
      }
    end
  end
  return { snippets = list }
end

function JavaEngine.expand_snippet(id, indent)
  id = tostring(id or "")
  for _, s in ipairs(SNIPPETS) do
    if s.id == id or s.trigger == id then
      return { text = reindent_snippet(s.text, indent), id = s.id, label = s.label }
    end
  end
  return { text = "", id = id }
end

--------------------------------------------------------------------------
-- JSON-facing dispatch (single entry for the JS bridge)
--------------------------------------------------------------------------

function JavaEngine.dispatch(action, payload)
  action = tostring(action or "")
  payload = payload or {}
  local function p(key, default)
    local v = payload[key]
    if v == nil then return default end
    return v
  end

  if action == "beautify" then
    return JavaEngine.beautify(p("source", ""), {
      indentSize = tonumber(p("indentSize", 4)) or 4,
      indentWithTabs = p("indentWithTabs", false),
    })
  elseif action == "diagnostics" then
    return JavaEngine.diagnostics(p("source", ""))
  elseif action == "braceDiagnostics" then
    return { warnings = JavaEngine.brace_diagnostics(p("source", "")) }
  elseif action == "unusedImports" then
    return { warnings = JavaEngine.unused_import_diagnostics(p("source", "")) }
  elseif action == "enclosingBrace" then
    local r = JavaEngine.enclosing_brace_range(p("source", ""), p("offset", 0))
    if not r then return { ok = false } end
    return { ok = true, from = r.from, to = r.to }
  elseif action == "classCloseIndex" then
    return { index = JavaEngine.class_close_index(p("source", "")) }
  elseif action == "listSnippets" then
    return JavaEngine.list_snippets()
  elseif action == "matchSnippets" then
    return JavaEngine.match_snippets(p("prefix", ""))
  elseif action == "expandSnippet" then
    return JavaEngine.expand_snippet(p("id", ""), p("indent", ""))
  end
  return { error = "unknown action: " .. action }
end

function JavaEngine.dispatch_json(action, payload)
  local result = JavaEngine.dispatch(action, payload)
  return JsonUtil.encode(result)
end

_G.JavaEngine = JavaEngine
return JavaEngine
