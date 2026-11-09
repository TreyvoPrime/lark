
**A welcoming place to learn and build with Java.**

Lark is a free, open-source Java development environment made for students, new programmers, and anyone who wants a focused place to write code. Its goal is simple: make it easier to start creating without getting lost in a complicated workspace.

## What you can do

- Write, run, and debug Java programs.
- Organize your code into projects and explore your files.
- Get help understanding and navigating your code.
- Make Lark feel like your own with themes and editor settings.
- Work together with others on the same network using Lark Share.

## Get Lark

Visit the [Lark website](https://lark.rocks/) to learn more and find downloads for Windows, macOS, and Linux. You can also browse the [GitHub releases](https://github.com/TreyvoPrime/lark/releases) for available downloads and release notes.

## Get involved 

Lark is built in the open. You can explore the code, share ideas, or [report an issue](https://github.com/TreyvoPrime/lark/issues) to help make it better.

Lark is available under the [MIT License](LICENSE).

## Rust host preview

`lark-host` is the first step in moving Lark's native host and backend to Rust without changing the browser IDE or its Java API. It starts the current Java backend, waits for its health endpoint, prevents ordinary duplicate launches, and opens the IDE window itself.

```text
./lark-host.sh --no-browser
lark-host.bat --port 43123
```

The Java backend remains the compatibility implementation in this phase. Rust owns the launch boundary and will progressively take ownership of API groups in later releases.
