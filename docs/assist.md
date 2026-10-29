# Assist placement

Assist uses the existing CodeMirror 5 editor and menu theme tokens. Click a snippet
name to insert at the current line, drag it to preview a different line, or use
Actions for Copy and explicit Replace Selection. Existing Tools remain available.

`web/js/assist.js` owns placement, formatting, preview widgets and atomic edits.
`web/js/app.js` connects those behaviors to snippet metadata and the existing menu.
`web/css/app.css` and `web/index.html` provide the compact menu and preview styles.

The preview displays the actual formatted code in a syntax-colored line widget.
It does not edit the document. Imports are added only on commit using a minimal
range edit, in the same undo step. The menu becomes invisible during dragging so
it cannot obscure the preview. Escape, blur, document changes, option changes,
outside drops and dragend clear temporary state. Edge scrolling continues while
the pointer stays near the editor boundary.

Placement checks are conservative lexical checks, cached per document generation.
They reject comments, strings, text blocks, incomplete statements, top-level
statements, and member insertion inside methods. They are not a Java compiler:
names, types, duplicate declarations and snippet-specific semantics still require
the IDE's normal compile check. Blocks insert before the chosen line; arbitrary
mid-expression placement is intentionally unsupported. Long previews occupy real
editor space and may require scrolling. Required imports are listed in the preview
title but are not rendered at the top of the document during dragging.

## Validation

Run `node test/java-parse.test.js` for the existing parser tests. Serve the repository
over local HTTP, open `test/assist-browser.html`, and click Run checks. This suite
uses the actual bundled CodeMirror and exercises formatting, preview integrity,
drop/cleanup, Undo/Redo including imports, selection replacement, invalid targets,
tabs, text blocks, document changes, auto-scroll and a 10,000-line performance case.
It reports each assertion and fails visibly. It does not require npm dependencies.

Manual integration verification: build/run Lark, open the sample Java project,
open Assist, drag a loop into a method, drop, and undo. Check Slate and Daylight
themes and a narrow window. The test server must use an isolated `LARK_HOME` so
these checks do not edit a user's projects.
