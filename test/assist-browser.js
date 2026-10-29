/* Open assist-browser.html in a browser. Exercises the real bundled CodeMirror. */
const editor = CodeMirror(document.getElementById("editor"), { mode: "text/x-java", theme: "lark", lineNumbers: true, indentUnit: 4 });
const original = 'class Demo {\n    void greet() {\n        System.out.println("existing");\n    }\n}\n';
const snippet = { code: 'if (true) {\n    System.out.println("ghost");\n}', imports: ["java.util.List"], place: "body" };
let payload = null;
const controller = LarkAssist.controller(() => payload, (ed, prepared, meta) => LarkAssist.commit(ed, prepared, meta), () => { payload = null; });
controller.wire(editor);
const tick = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
function check(value, label) { if (!value) throw Error(label); document.getElementById("result").textContent += "PASS " + label + "\n"; }
function reset(value = original) { editor.setValue(value); editor.clearHistory(); editor.scrollTo(0, 0); }
function dragAt(line, type = "dragover") {
  const at = editor.charCoords({ line, ch: 0 }, "window");
  const transfer = new DataTransfer(); transfer.setData("text/lark-assist", "{}");
  editor.getWrapperElement().dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: at.left + 40, clientY: at.top + 2, dataTransfer: transfer }));
}
document.getElementById("run").onclick = async () => {
  document.getElementById("result").textContent = "";
  try {
    reset();
    const prepared = LarkAssist.plan(editor, { line: 2 }, snippet);
    check(prepared.text === '        if (true) {\n            System.out.println("ghost");\n        }\n', "multiline indentation");
    check(LarkAssist.commit(editor, prepared, snippet), "commit succeeds");
    const inserted = editor.getValue();
    check(inserted.includes("import java.util.List;") && inserted.includes(prepared.text), "snippet and imports inserted");
    editor.undo(); check(editor.getValue() === original, "single Undo restores exact document");
    editor.redo(); check(editor.getValue() === inserted, "Redo restores snippet and imports");
    reset(); payload = snippet; dragAt(2); await tick();
    check(editor.getValue() === original, "preview never mutates document");
    check(document.querySelector(".assist-ghost .cm-keyword") && document.querySelector(".assist-ghost").textContent.includes("ghost"), "actual syntax-colored ghost code");
    dragAt(2, "drop"); await tick();
    check(editor.getValue().includes(prepared.text) && !document.querySelector(".assist-ghost"), "drop matches preview and cleans up");
    reset(); payload = snippet; dragAt(2); await tick(); window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    check(!payload && !document.querySelector(".assist-ghost") && editor.getValue() === original, "Escape cancellation");
    editor.setOption("readOnly", true); check(!!LarkAssist.plan(editor, { line: 2 }, snippet).error, "read-only target rejected"); editor.setOption("readOnly", false);
    check(!!LarkAssist.plan(editor, { line: 0 }, snippet).error, "top-level statements rejected");
    check(!!LarkAssist.plan(editor, { line: 2 }, { ...snippet, place: "member" }).error, "member inside method rejected");
    check(!LarkAssist.plan(editor, { line: 4 }, { ...snippet, place: "member" }).error, "member at chosen class boundary accepted");
    reset('class Demo {\n    void greet() {\n        /* comment\n        still comment\n        */\n    }\n}');
    check(!!LarkAssist.plan(editor, { line: 3 }, snippet).error, "block comment rejected");
    reset('class Demo {\n    void greet() {\n        String s = """\n            text\n            """;\n    }\n}');
    check(!!LarkAssist.plan(editor, { line: 3 }, snippet).error, "Java text block rejected");
    reset(); payload = snippet; dragAt(2); await tick(); editor.swapDoc(new CodeMirror.Doc(original, "text/x-java"));
    check(!payload && !document.querySelector(".assist-ghost"), "document switching cancels preview");
    reset(); editor.setOption("indentWithTabs", true); editor.setValue('class Demo {\n\tvoid greet() {\n\t\tfoo();\n\t}\n}');
    check(LarkAssist.plan(editor, { line: 2 }, snippet).text.includes('\t\t\tSystem'), "tab indentation"); editor.setOption("indentWithTabs", false);
    reset('class Demo {\n    void greet() {\n' + '        foo();\n'.repeat(10000) + '    }\n}');
    const start = performance.now(); for (let line = 100; line < 200; line++) LarkAssist.plan(editor, { line }, snippet);
    check(performance.now() - start < 1000, "100 placements in a 10,000-line file under one second");
    reset(); editor.setSelection({line:2,ch:0},{line:3,ch:0});
    check(LarkAssist.commit(editor, LarkAssist.plan(editor, {line:2}, snippet), snippet, true), "explicit replace selection");
    check(!editor.getValue().includes('"existing"') && editor.getValue().includes(prepared.text), "replacement preserves indentation and next line");
    editor.undo(); check(editor.getValue() === original, "replacement Undo");
    reset(); check(!!LarkAssist.plan(editor, {line:2}, {code:""}).error, "empty snippet rejected");
    const stale = LarkAssist.plan(editor, {line:2}, snippet); editor.replaceRange("// changed\n", {line:0,ch:0});
    check(!LarkAssist.commit(editor, stale, snippet), "stale document plan rejected");
    reset(original.replace('        System.out.println("existing");', '        foo();\n'.repeat(150)));
    payload = snippet;
    const rect = editor.getWrapperElement().getBoundingClientRect();
    editor.getWrapperElement().dispatchEvent(new DragEvent("dragover", {bubbles:true,cancelable:true,clientX:rect.left+100,clientY:rect.bottom-5,dataTransfer:new DataTransfer()}));
    await new Promise(resolve => setTimeout(resolve, 150));
    check(editor.getScrollInfo().top > 0, "edge auto-scroll without pointer movement");
    document.dispatchEvent(new Event("dragend")); check(!document.querySelector(".assist-ghost"), "outside drop/dragend cleanup");
    reset(); payload = snippet; dragAt(2); await tick();
    document.getElementById("result").textContent += "ALL CHECKS PASSED\n";
  } catch (error) { document.getElementById("result").textContent += "FAIL " + error.stack; throw error; }
};
reset();
