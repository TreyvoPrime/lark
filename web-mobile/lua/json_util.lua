--[[
  Minimal JSON encoder for Lark Lua → JS bridges.
  Supports nil, boolean, number, string, array-tables, map-tables.
]]

local JsonUtil = {}

local function is_array(t)
  local n = #t
  if n == 0 then
    -- empty table: treat as array if no string keys
    for k in pairs(t) do
      if type(k) ~= "number" then return false end
    end
    return true
  end
  for k in pairs(t) do
    if type(k) ~= "number" or k < 1 or k > n or k % 1 ~= 0 then
      return false
    end
  end
  return true
end

local function esc(s)
  s = tostring(s)
  s = s:gsub("\\", "\\\\")
  s = s:gsub("\"", "\\\"")
  s = s:gsub("\n", "\\n")
  s = s:gsub("\r", "\\r")
  s = s:gsub("\t", "\\t")
  s = s:gsub("[%z\1-\31]", function(c)
    return string.format("\\u%04x", c:byte())
  end)
  return s
end

function JsonUtil.encode(v)
  local tv = type(v)
  if v == nil then
    return "null"
  elseif tv == "boolean" then
    return v and "true" or "false"
  elseif tv == "number" then
    if v ~= v or v == math.huge or v == -math.huge then return "null" end
    return tostring(v)
  elseif tv == "string" then
    return "\"" .. esc(v) .. "\""
  elseif tv == "table" then
    if is_array(v) then
      local parts = {}
      for i = 1, #v do
        parts[i] = JsonUtil.encode(v[i])
      end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    local parts = {}
    for k, val in pairs(v) do
      if type(k) == "string" then
        parts[#parts + 1] = "\"" .. esc(k) .. "\":" .. JsonUtil.encode(val)
      end
    end
    table.sort(parts)
    return "{" .. table.concat(parts, ",") .. "}"
  end
  return "null"
end

_G.JsonUtil = JsonUtil
return JsonUtil
