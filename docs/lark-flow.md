# Lark Flow

Open **Extras → Lark Flow**, a Java file's **Open in Lark Flow** context action, or the editor's **Open method in Lark Flow** action. `Ctrl+Shift+L` (`Cmd+Shift+L` on macOS) opens the current method. The command palette includes Open, Refresh, and Fit commands.

The workspace docks below the editor. Drag its top separator (or use the arrow keys while focused) to resize it. **Expand** gives the diagram the editor area; **Show code** restores the split. Click nodes to select their source ranges. **Follow editor** selects the corresponding diagram statement as the cursor moves. The method selector and Project / Class / Method breadcrumbs change detail level; double-click a method in an overview to open its control flow.

Drag the background to pan, drag nodes to reposition them, and use the wheel or zoom buttons to zoom. The small overview map recenters the canvas. **Auto layout** restores automatic positions; **Fit** shows the entire graph. SVG and PNG exports include the entire current diagram, including parts outside the viewport. PNG dimensions are bounded to protect browser memory; use SVG for very large exports.

**Trace path** is static exploration, not execution. Choose an arrow at each decision to extend a highlighted route. A cycle stops after one traversal rather than implying an unknown iteration count. Reset clears the choices. Exception paths are conservative possibilities, not runtime predictions.

## Implementation

Lark is a Java backend with a vanilla JavaScript/CodeMirror frontend. `Flow.java` uses the JDK compiler's syntax trees and source positions, then builds continuation-based control-flow graphs. Symbol attribution resolves project method calls when available; annotation processing is disabled, and no user code is executed. Unresolved/external calls are omitted from overview edges and counted in the workspace notice. Dynamic dispatch is not a whole-program call analysis.

`POST /api/flow` accepts the current in-memory Java sources, so unsaved editor changes are included. Syntax errors retain the previous graph and temporarily disable source navigation from stale ranges. Analysis runs on the server, debounced by 650 ms in the browser. Replacement requests abort the old fetch and reject stale results. A bounded three-entry server cache avoids repeated analysis. Server parsing already in progress is not interrupted by closing the browser request.

The compiler must be available in Lark's running JVM (a full JDK); a JRE-only launch receives a clear notice. Limits: 250 files / 2 MB per analysis, 1,200 generated nodes per method, and 350 displayed nodes per diagram. Larger diagrams show an explicit overview instead of silently truncating control flow. View state, selected method, and panel dimensions are remembered per project when Flow is reopened. Manual node positions and trace choices are intentionally transient.

## Represented and summarized behavior

Supported: method and explicit constructor bodies, sequential statements, calls, assignments, early returns, nested if/else, while/do/for/enhanced-for, unlabeled break/continue, switch statements (including colon fall-through), direct switch-expression returns/declarations/assignments, yield, explicit throws, and try/catch/finally. Finally paths preserve normal and abrupt completions, including return, break, continue, and throw; an abrupt finally completion replaces the pending one.

The workspace explicitly reports these limitations:

- Short-circuit operators, ternaries, and embedded expression branches are summarized inside statement nodes.
- Try-with-resources cleanup, labeled control flow, assertions, and synchronization semantics are not fully expanded.
- Constructor field/instance initializers and implicit super calls are not expanded.
- Lambda, method-reference, local-class, and anonymous-class bodies are deferred rather than treated as immediately executed methods.
- Implicit exceptions and catch dispatch are conservative; exact exception types and runtime values are not predicted.

## Validation

Compile production sources with `javac --release 17 -encoding UTF-8`, then compile and run `test/FlowCheck.java` as `lark.FlowCheck`. It covers source ranges and graph integrity plus branches, loops, break/continue, early returns, switches, exceptions/finally, recursive/cross-class calls, invalid source, stable IDs, caching, and large methods.

`test/flow-browser.js` runs through `playwright-cli run-code --filename=test/flow-browser.js` against the isolated Library checkout demo on port 8767. It exercises actual backend analysis, source navigation, zoom/layout/dragging, tracing, overview navigation, minimap, SVG/PNG downloads, invalid-edit recovery, follow-editor, closing, and session restoration. It temporarily edits the demo's Book source and restores it in a finally block. Do not run it on a user's working project.
