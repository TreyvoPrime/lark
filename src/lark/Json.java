package lark;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** A small JSON reader and writer. Enough for Lark's API and the GitHub API. */
public final class Json {
    private Json() {}

    public interface Value {
        String write();
    }

    public static final class Obj implements Value {
        private final LinkedHashMap<String, Value> map = new LinkedHashMap<>();

        public Obj put(String key, String value) {
            map.put(key, value == null ? Null.INSTANCE : new Str(value));
            return this;
        }

        public Obj put(String key, boolean value) {
            map.put(key, value ? Bool.TRUE : Bool.FALSE);
            return this;
        }

        public Obj put(String key, int value) {
            map.put(key, new Num(Integer.toString(value)));
            return this;
        }

        public Obj put(String key, long value) {
            map.put(key, new Num(Long.toString(value)));
            return this;
        }

        public Obj put(String key, Value value) {
            map.put(key, value == null ? Null.INSTANCE : value);
            return this;
        }

        public boolean has(String key) {
            return map.containsKey(key);
        }

        public Value get(String key) {
            return map.get(key);
        }

        public String str(String key) {
            Value value = map.get(key);
            return value instanceof Str s ? s.value : null;
        }

        public String str(String key, String fallback) {
            String value = str(key);
            return value == null ? fallback : value;
        }

        public boolean bool(String key) {
            return map.get(key) == Bool.TRUE;
        }

        public Obj obj(String key) {
            Value value = map.get(key);
            return value instanceof Obj o ? o : null;
        }

        public Arr arr(String key) {
            Value value = map.get(key);
            return value instanceof Arr a ? a : null;
        }

        public long longVal(String key) {
            Value value = map.get(key);
            return value instanceof Num n ? n.longValue() : 0L;
        }

        @Override
        public String write() {
            StringBuilder out = new StringBuilder();
            out.append('{');
            boolean first = true;
            for (Map.Entry<String, Value> entry : map.entrySet()) {
                if (!first) out.append(',');
                first = false;
                out.append(Str.escape(entry.getKey())).append(':').append(entry.getValue().write());
            }
            out.append('}');
            return out.toString();
        }
    }

    public static final class Arr implements Value {
        private final List<Value> list = new ArrayList<>();

        public Arr add(Value value) {
            list.add(value == null ? Null.INSTANCE : value);
            return this;
        }

        public Arr add(String value) {
            list.add(value == null ? Null.INSTANCE : new Str(value));
            return this;
        }

        public int size() {
            return list.size();
        }

        public Value get(int index) {
            return list.get(index);
        }

        public List<Value> values() {
            return list;
        }

        @Override
        public String write() {
            StringBuilder out = new StringBuilder();
            out.append('[');
            for (int i = 0; i < list.size(); i++) {
                if (i > 0) out.append(',');
                out.append(list.get(i).write());
            }
            out.append(']');
            return out.toString();
        }
    }

    public static final class Str implements Value {
        final String value;

        Str(String value) {
            this.value = value;
        }

        @Override
        public String write() {
            return escape(value);
        }

        static String escape(String value) {
            StringBuilder out = new StringBuilder(value.length() + 2);
            out.append('"');
            for (int i = 0; i < value.length(); i++) {
                char c = value.charAt(i);
                switch (c) {
                    case '"' -> out.append("\\\"");
                    case '\\' -> out.append("\\\\");
                    case '\b' -> out.append("\\b");
                    case '\f' -> out.append("\\f");
                    case '\n' -> out.append("\\n");
                    case '\r' -> out.append("\\r");
                    case '\t' -> out.append("\\t");
                    default -> {
                        if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
                        else out.append(c);
                    }
                }
            }
            out.append('"');
            return out.toString();
        }
    }

    public static final class Num implements Value {
        final String raw;

        Num(String raw) {
            this.raw = raw;
        }

        public long longValue() {
            try {
                return Long.parseLong(raw);
            } catch (NumberFormatException e) {
                return (long) Double.parseDouble(raw);
            }
        }

        @Override
        public String write() {
            return raw;
        }
    }

    public enum Bool implements Value {
        TRUE, FALSE;

        @Override
        public String write() {
            return this == TRUE ? "true" : "false";
        }
    }

    public enum Null implements Value {
        INSTANCE;

        @Override
        public String write() {
            return "null";
        }
    }

    public static Value parse(String text) {
        Parser parser = new Parser(text == null ? "" : text);
        Value value = parser.parseValue();
        parser.skip();
        if (parser.i < parser.n) throw new RequestFail(400, "Unexpected extra data in JSON.");
        return value;
    }

    public static Obj parseObj(String text) {
        Value value = parse(text);
        if (value instanceof Obj obj) return obj;
        throw new RequestFail(400, "Expected a JSON object.");
    }

    private static final class Parser {
        final String s;
        final int n;
        int i;

        Parser(String s) {
            this.s = s;
            this.n = s.length();
        }

        Value parseValue() {
            skip();
            if (i >= n) throw error("The JSON ended early.");
            char c = s.charAt(i);
            if (c == '{') return parseObj();
            if (c == '[') return parseArr();
            if (c == '"') return new Str(parseString());
            if (c == 't') return literal("true", Bool.TRUE);
            if (c == 'f') return literal("false", Bool.FALSE);
            if (c == 'n') return literal("null", Null.INSTANCE);
            if (c == '-' || (c >= '0' && c <= '9')) return parseNum();
            throw error("Unexpected character in JSON.");
        }

        Obj parseObj() {
            expect('{');
            Obj obj = new Obj();
            skip();
            if (peek('}')) {
                i++;
                return obj;
            }
            while (true) {
                skip();
                if (i >= n || s.charAt(i) != '"') throw error("Expected a string key.");
                String key = parseString();
                skip();
                expect(':');
                obj.put(key, parseValue());
                skip();
                if (peek('}')) {
                    i++;
                    return obj;
                }
                expect(',');
            }
        }

        Arr parseArr() {
            expect('[');
            Arr arr = new Arr();
            skip();
            if (peek(']')) {
                i++;
                return arr;
            }
            while (true) {
                arr.add(parseValue());
                skip();
                if (peek(']')) {
                    i++;
                    return arr;
                }
                expect(',');
            }
        }

        Num parseNum() {
            int start = i;
            if (peek('-')) i++;
            if (i >= n || !digit(s.charAt(i))) throw error("Invalid number.");
            if (s.charAt(i) == '0') i++;
            else while (i < n && digit(s.charAt(i))) i++;
            if (i < n && s.charAt(i) == '.') {
                i++;
                if (i >= n || !digit(s.charAt(i))) throw error("Invalid number.");
                while (i < n && digit(s.charAt(i))) i++;
            }
            if (i < n && (s.charAt(i) == 'e' || s.charAt(i) == 'E')) {
                i++;
                if (i < n && (s.charAt(i) == '+' || s.charAt(i) == '-')) i++;
                if (i >= n || !digit(s.charAt(i))) throw error("Invalid number.");
                while (i < n && digit(s.charAt(i))) i++;
            }
            return new Num(s.substring(start, i));
        }

        String parseString() {
            expect('"');
            StringBuilder out = new StringBuilder();
            while (i < n) {
                char c = s.charAt(i++);
                if (c == '"') return out.toString();
                if (c == '\\') {
                    if (i >= n) throw error("Bad escape in a string.");
                    char escaped = s.charAt(i++);
                    switch (escaped) {
                        case '"', '\\', '/' -> out.append(escaped);
                        case 'b' -> out.append('\b');
                        case 'f' -> out.append('\f');
                        case 'n' -> out.append('\n');
                        case 'r' -> out.append('\r');
                        case 't' -> out.append('\t');
                        case 'u' -> {
                            if (i + 4 > n) throw error("Bad unicode escape.");
                            int code = 0;
                            for (int k = 0; k < 4; k++) {
                                char h = s.charAt(i++);
                                code <<= 4;
                                if (h >= '0' && h <= '9') code += h - '0';
                                else if (h >= 'a' && h <= 'f') code += h - 'a' + 10;
                                else if (h >= 'A' && h <= 'F') code += h - 'A' + 10;
                                else throw error("Bad unicode escape.");
                            }
                            out.append((char) code);
                        }
                        default -> throw error("Bad escape in a string.");
                    }
                } else if (c < 0x20) {
                    throw error("Unescaped control character in a string.");
                } else {
                    out.append(c);
                }
            }
            throw error("Unterminated string.");
        }

        void skip() {
            while (i < n) {
                char c = s.charAt(i);
                if (c == ' ' || c == '\n' || c == '\r' || c == '\t') i++;
                else break;
            }
        }

        boolean peek(char c) {
            return i < n && s.charAt(i) == c;
        }

        void expect(char c) {
            if (!peek(c)) throw error("Expected '" + c + "' in JSON.");
            i++;
        }

        Value literal(String word, Value value) {
            if (!s.startsWith(word, i)) throw error("Invalid JSON value.");
            i += word.length();
            return value;
        }

        boolean digit(char c) {
            return c >= '0' && c <= '9';
        }

        RequestFail error(String message) {
            return new RequestFail(400, message);
        }
    }
}
