package lark;

import com.sun.source.tree.*;
import com.sun.source.util.*;
import javax.tools.*;
import javax.lang.model.element.Element;
import java.net.URI;
import java.util.*;

/** Static, conservative source-level control flow. Never compiles or executes user code. */
public final class Flow {
    private Flow() {}
    private static final Map<String, Json.Obj> CACHE = new LinkedHashMap<>();

    public static synchronized Json.Obj analyze(Json.Arr files) {
        if (files == null || files.size() > 250) throw new RequestFail(400, "Flow supports up to 250 Java files per analysis.");
        String key = files.write();
        if (key.length() > 2_000_000) throw new RequestFail(400, "Flow source limit is 2 MB. Open a smaller project.");
        if (CACHE.containsKey(key)) return CACHE.get(key);
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) throw new RequestFail(400, "Lark Flow needs a full JDK. Restart Lark using a Java development kit.");
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        List<JavaFileObject> inputs = new ArrayList<>();
        Map<URI, String> paths = new HashMap<>();
        for (Json.Value v : files.values()) {
            if (!(v instanceof Json.Obj f) || !f.str("path", "").endsWith(".java")) continue;
            String path = f.str("path"), content = f.str("content", "");
            URI uri = URI.create("string:///source" + inputs.size() + "/" + path.substring(path.lastIndexOf('/') + 1).replace(" ", "%20"));
            paths.put(uri, path);
            inputs.add(new SimpleJavaFileObject(uri, JavaFileObject.Kind.SOURCE) {
                @Override public CharSequence getCharContent(boolean ignored) { return content; }
            });
        }
        try (StandardJavaFileManager fm = compiler.getStandardFileManager(diagnostics, Locale.ROOT, null)) {
            JavacTask task = (JavacTask) compiler.getTask(null, fm, diagnostics, List.of("-proc:none", "--release", "17"), null, inputs);
            List<CompilationUnitTree> units = new ArrayList<>();
            if (!inputs.isEmpty()) task.parse().forEach(units::add);
            Json.Arr errors = new Json.Arr();
            for (Diagnostic<? extends JavaFileObject> d : diagnostics.getDiagnostics()) {
                if (d.getKind() == Diagnostic.Kind.ERROR) errors.add(new Json.Obj().put("path", d.getSource() == null ? "" : paths.get(d.getSource().toUri())).put("line", d.getLineNumber()).put("message", d.getMessage(Locale.ROOT)));
            }
            if (errors.size() > 0) return new Json.Obj().put("ok", true).put("valid", false).put("diagnostics", errors);
            Trees trees = Trees.instance(task);
            List<Builder> methods = new ArrayList<>();
            for (CompilationUnitTree unit : units) {
                String source = unit.getSourceFile().getCharContent(true).toString();
                new TreePathScanner<Void, String>() {
                    @Override public Void visitClass(ClassTree t, String owner) {
                        String name = (owner == null ? (unit.getPackageName() == null ? "" : unit.getPackageName() + ".") : owner + ".") + t.getSimpleName();
                        return super.visitClass(t, name);
                    }
                    @Override public Void visitMethod(MethodTree t, String owner) {
                        if (t.getBody() != null) methods.add(new Builder(unit, trees, source, paths.get(unit.getSourceFile().toUri()), owner, t, getCurrentPath()));
                        // Local/anonymous classes are reported by their containing statement, not mistaken for outer methods.
                        return null;
                    }
                }.scan(unit, null);
            }
            // Attribution resolves calls (including overloads) when project dependencies are available.
            // Semantic errors do not invalidate a syntactically valid diagram.
            if (!inputs.isEmpty()) try { task.analyze(); } catch (RuntimeException ignored) { }
            Map<Element, String> symbols = new HashMap<>();
            for (Builder b : methods) { Element e = trees.getElement(b.methodPath); if (e != null) symbols.put(e, b.id); }
            Json.Arr result = new Json.Arr();
            for (Builder b : methods) result.add(b.build(symbols));
            Json.Obj response = new Json.Obj().put("ok", true).put("valid", true).put("methods", result);
            if (CACHE.size() >= 3) CACHE.remove(CACHE.keySet().iterator().next());
            CACHE.put(key, response);
            return response;
        } catch (java.io.IOException e) { throw new RequestFail(500, "Flow could not read Java source."); }
    }

    private record Context(String brk, String cont, String ret, String thrown, String yielded) {}
    private static final class Builder {
        final CompilationUnitTree unit; final Trees trees; final String source, path, owner, id;
        final MethodTree method; final TreePath methodPath;
        final List<Json.Obj> nodes = new ArrayList<>(); final Json.Arr edges = new Json.Arr(), warnings = new Json.Arr(), calls = new Json.Arr();
        final IdentityHashMap<Tree, Integer> treeIds = new IdentityHashMap<>();
        final Map<String, Integer> copies = new HashMap<>();
        final Set<String> exceptionTargets = new HashSet<>();
        int count;
        Builder(CompilationUnitTree u, Trees t, String s, String p, String o, MethodTree m, TreePath mp) {
            unit=u; trees=t; source=s; path=p; owner=o; method=m; methodPath=mp;
            id=p+"#"+o+"."+m.getName()+"("+String.join(",", m.getParameters().stream().map(v->v.getType().toString()).toList())+")";
            new TreeScanner<Void, Void>() { @Override public Void scan(Tree tr, Void v) { if(tr!=null) treeIds.put(tr, treeIds.size()); return super.scan(tr,v); } }.scan(m,null);
        }
        long start(Tree t) { return Math.max(0, trees.getSourcePositions().getStartPosition(unit,t)); }
        long end(Tree t) { return Math.max(start(t), trees.getSourcePositions().getEndPosition(unit,t)); }
        String text(Tree t) { return source.substring((int)Math.min(source.length(),start(t)), (int)Math.min(source.length(),end(t))).replaceAll("\\s+", " ").trim(); }
        String node(Tree t, String kind, String label) {
            if (++count > 1200) throw new TooLarge();
            String base=id+":"+treeIds.getOrDefault(t,-1)+":"+kind;
            String nid=base+":"+copies.merge(base,1,Integer::sum);
            nodes.add(new Json.Obj().put("id",nid).put("kind",kind).put("label", label.length()>180 ? label.substring(0,177)+"…" : label).put("start",start(t)).put("end",end(t)).put("line",unit.getLineMap().getLineNumber(start(t))));
            return nid;
        }
        void edge(String a, String b, String label) { if(a!=null && b!=null) edges.add(new Json.Obj().put("from",a).put("to",b).put("label",label)); }
        String step(Tree t,String kind,String label,String next) { String n=node(t,kind,label); edge(n,next,""); return n; }
        String unsupported(Tree t,String why,String next) { warnings.add(why); return step(t,"unsupported",why+": "+text(t),next); }
        Json.Obj build(Map<Element,String> symbols) {
            String entry;
            if(method.getName().contentEquals("<init>")) warnings.add("Constructor body only; implicit super calls and field/instance initializers are not expanded.");
            try {
                String finish=node(method,"end","End"), thrown=node(method,"end","Exception leaves method");
                String body=statement(method.getBody(),finish,new Context(null,null,finish,thrown,null));
                entry=step(method,"start",method.getName().contentEquals("<init>") ? "Constructor" : "Start · "+method.getName(),body);
            } catch(TooLarge limit) {
                nodes.clear(); count=0;
                // Discard partial edges: a large method is an explicit summary, never a truncated CFG.
                Json.Arr summaryNodes=new Json.Arr().add(new Json.Obj().put("id",id+":summary").put("kind","unsupported").put("label","Large method — detail exceeds 1,200 nodes").put("start",start(method)).put("end",end(method)).put("line",unit.getLineMap().getLineNumber(start(method))));
                return metadata().put("nodes",summaryNodes).put("edges",new Json.Arr()).put("entry",id+":summary").put("warnings",new Json.Arr().add("Method shown as an overview to keep navigation responsive.")).put("calls",calls);
            }
            new TreePathScanner<Void,Void>() {
                @Override public Void visitMethodInvocation(MethodInvocationTree t,Void v) {
                    Element e=trees.getElement(getCurrentPath());
                    calls.add(new Json.Obj().put("label",t.getMethodSelect().toString()).put("target",symbols.get(e)).put("start",start(t)));
                    return super.visitMethodInvocation(t,v);
                }
                @Override public Void visitClass(ClassTree t,Void v) { return null; }
                @Override public Void visitLambdaExpression(LambdaExpressionTree t,Void v) { return null; }
            }.scan(methodPath,null);
            Json.Arr ns=new Json.Arr(); nodes.forEach(ns::add);
            return metadata().put("nodes",ns).put("edges",edges).put("entry",entry).put("warnings",warnings).put("calls",calls);
        }
        Json.Obj metadata() { return new Json.Obj().put("id",id).put("name",method.getName().contentEquals("<init>") ? owner.substring(owner.lastIndexOf('.')+1) : method.getName().toString()).put("signature",id.substring(id.indexOf('#')+1).replace(".<init>", "")).put("owner",owner).put("path",path).put("start",start(method)).put("end",end(method)); }
        String sequence(List<? extends StatementTree> list,String next,Context c) {
            for(int i=list.size()-1;i>=0;i--) next=statement(list.get(i),next,c);
            return next;
        }
        String statement(Tree t,String next,Context c) {
            if(t==null) return next;
            if(trees.getSourcePositions().getEndPosition(unit,t)<0) return next; // javac's synthetic constructor calls
            switch(t.getKind()) {
                case BLOCK: return sequence(((BlockTree)t).getStatements(),next,c);
                case IF: {
                    IfTree s=(IfTree)t; String n=node(s.getCondition(),"decision",text(s.getCondition()));
                    exceptional(n,s.getCondition(),c);
                    if(!Boolean.FALSE.equals(literal(s.getCondition()))) edge(n,statement(s.getThenStatement(),next,c),"True");
                    if(!Boolean.TRUE.equals(literal(s.getCondition()))) edge(n,statement(s.getElseStatement(),next,c),"False"); return n;
                }
                case WHILE_LOOP: {
                    WhileLoopTree s=(WhileLoopTree)t; String n=node(s.getCondition(),"decision",text(s.getCondition()));
                    exceptional(n,s.getCondition(),c);
                    if(!Boolean.FALSE.equals(literal(s.getCondition()))) edge(n,statement(s.getStatement(),n,new Context(next,n,c.ret,c.thrown,c.yielded)),"True");
                    if(!Boolean.TRUE.equals(literal(s.getCondition()))) edge(n,next,"False"); return n;
                }
                case DO_WHILE_LOOP: {
                    DoWhileLoopTree s=(DoWhileLoopTree)t; String n=node(s.getCondition(),"decision",text(s.getCondition()));
                    exceptional(n,s.getCondition(),c);
                    String b=statement(s.getStatement(),n,new Context(next,n,c.ret,c.thrown,c.yielded));
                    if(!Boolean.FALSE.equals(literal(s.getCondition()))) edge(n,b,"True");
                    if(!Boolean.TRUE.equals(literal(s.getCondition()))) edge(n,next,"False"); return b;
                }
                case FOR_LOOP: {
                    ForLoopTree s=(ForLoopTree)t; String n=node(s.getCondition()==null?s:s.getCondition(),"decision",s.getCondition()==null?"Always true":text(s.getCondition()));
                    exceptional(n,s.getCondition(),c);
                    String update=sequence(s.getUpdate(),n,c);
                    if(!Boolean.FALSE.equals(literal(s.getCondition()))) edge(n,statement(s.getStatement(),update,new Context(next,update,c.ret,c.thrown,c.yielded)),"True");
                    if(s.getCondition()!=null && !Boolean.TRUE.equals(literal(s.getCondition()))) edge(n,next,"False");
                    return sequence(s.getInitializer(),n,c);
                }
                case ENHANCED_FOR_LOOP: {
                    EnhancedForLoopTree s=(EnhancedForLoopTree)t;
                    String n=node(s,"decision","More elements?");
                    String b=statement(s.getStatement(),n,new Context(next,n,c.ret,c.thrown,c.yielded));
                    edge(n,step(s.getVariable(),"process","Next element → "+s.getVariable().getName(),b),"Yes"); edge(n,next,"No");
                    return step(s.getExpression(),"process","Iterate "+text(s.getExpression()),n);
                }
                case RETURN: {
                    ReturnTree s=(ReturnTree)t;
                    String n=step(t,"process",s.getExpression() instanceof SwitchExpressionTree ? "Return switch result" : text(t),c.ret);
                    exceptional(n,s.getExpression(),c);
                    return s.getExpression() instanceof SwitchExpressionTree sw ? switches(sw,sw.getExpression(),sw.getCases(),n,c,true) : n;
                }
                case THROW: return step(t,"process",text(t),c.thrown);
                case BREAK: return ((BreakTree)t).getLabel()==null && c.brk!=null ? step(t,"process",text(t),c.brk) : unsupported(t,"Labeled break not expanded",null);
                case CONTINUE: return ((ContinueTree)t).getLabel()==null && c.cont!=null ? step(t,"process",text(t),c.cont) : unsupported(t,"Labeled continue not expanded",null);
                case YIELD: return step(t,"process",text(t),c.yielded);
                case SWITCH: { SwitchTree s=(SwitchTree)t; return switches(s,s.getExpression(),s.getCases(),next,c,false); }
                case TRY: return tryFlow((TryTree)t,next,c);
                case EMPTY_STATEMENT: return next;
                case ASSERT: return unsupported(t,"Assertion behavior depends on runtime flags",next);
                case LABELED_STATEMENT: return unsupported(t,"Labeled control flow not expanded",next);
                case SYNCHRONIZED: { SynchronizedTree s=(SynchronizedTree)t; return unsupported(t,"Monitor acquisition/release not expanded",statement(s.getBlock(),next,c)); }
                case CLASS: return step(t,"process","Local class declaration (body not executed here)",next);
                default: {
                    ExpressionTree value=t instanceof VariableTree v ? v.getInitializer() : t instanceof ExpressionStatementTree e && e.getExpression() instanceof AssignmentTree a ? a.getExpression() : null;
                    String label=text(t); String kind=label.contains("System.out.")||label.contains("System.err.")?"io":contains(t,Tree.Kind.METHOD_INVOCATION)?"call":"process";
                    if(value instanceof SwitchExpressionTree) label=t instanceof VariableTree v ? "Declare "+v.getName()+" = switch result" : "Assign switch result";
                    if(contains(t,Tree.Kind.LAMBDA_EXPRESSION)||contains(t,Tree.Kind.MEMBER_REFERENCE)||contains(t,Tree.Kind.CLASS)) warnings.add("Deferred lambda, method-reference and anonymous-class bodies are not executed in this statement's flow.");
                    String n=step(t,kind,label,next);
                    exceptional(n,t,c);
                    if(value instanceof SwitchExpressionTree sw) return switches(sw,sw.getExpression(),sw.getCases(),n,c,true);
                    if(contains(t,Tree.Kind.SWITCH_EXPRESSION)||contains(t,Tree.Kind.CONDITIONAL_EXPRESSION)) warnings.add("Expression-internal branching is summarized inside statement nodes.");
                    return n;
                }
            }
        }
        boolean contains(Tree t, Tree.Kind kind) { return Boolean.TRUE.equals(new TreeScanner<Boolean,Void>() {
            @Override public Boolean scan(Tree x,Void v) { return x!=null && (x.getKind()==kind || Boolean.TRUE.equals(super.scan(x,v))); }
            @Override public Boolean reduce(Boolean a,Boolean b) { return Boolean.TRUE.equals(a)||Boolean.TRUE.equals(b); }
            @Override public Boolean visitLambdaExpression(LambdaExpressionTree t,Void v) { return false; }
            @Override public Boolean visitClass(ClassTree t,Void v) { return false; }
        }.scan(t,null)); }
        Boolean literal(Tree t) {
            while(t instanceof ParenthesizedTree p) t=p.getExpression();
            return t instanceof LiteralTree l && l.getValue() instanceof Boolean b ? b : null;
        }
        void exceptional(String n,Tree t,Context c) {
            if(t==null) return;
            if(contains(t,Tree.Kind.CONDITIONAL_EXPRESSION)||contains(t,Tree.Kind.CONDITIONAL_AND)||contains(t,Tree.Kind.CONDITIONAL_OR)) warnings.add("Short-circuit and conditional expressions are summarized; their internal branches are not expanded.");
            if(exceptionTargets.contains(c.thrown)) edge(n,c.thrown,"Possible exception");
        }
        String switches(Tree tree,ExpressionTree expression,List<? extends CaseTree> cases,String next,Context c,boolean value) {
            String n=node(expression,"decision","switch "+text(expression)); String fall=next; boolean hasDefault=false;
            exceptional(n,expression,c);
            Context inner=new Context(value?c.brk:next,c.cont,c.ret,c.thrown,value?next:c.yielded);
            for(int i=cases.size()-1;i>=0;i--) {
                CaseTree cs=cases.get(i); String label=cs.getExpressions().isEmpty()?"default":String.join(", ",cs.getExpressions().stream().map(this::text).toList());
                hasDefault|=label.equals("default");
                String b=cs.getCaseKind()==CaseTree.CaseKind.RULE ? statement(cs.getBody(),next,inner) : sequence(cs.getStatements(),fall,inner);
                edge(n,b,label); fall=b;
            }
            if(!hasDefault) edge(n,value?c.thrown:next,value?"No matching case (exception)":"No match");
            return n;
        }
        String tryFlow(TryTree s,String next,Context outer) {
            if(!s.getResources().isEmpty()) return unsupported(s,"Try-with-resources cleanup is not expanded",next);
            // Clone finally for each completion: abrupt completion in finally overrides the pending one.
            java.util.function.Function<String,String> finish=dest->dest==null?null:statement(s.getFinallyBlock(),dest,outer);
            String normal=finish.apply(next), ret=finish.apply(outer.ret), thrown=finish.apply(outer.thrown);
            Context exits=new Context(finish.apply(outer.brk),finish.apply(outer.cont),ret,thrown,finish.apply(outer.yielded));
            String dispatch=s.getCatches().isEmpty()?thrown:node(s,"decision","Exception dispatch · first matching catch");
            exceptionTargets.add(dispatch); exceptionTargets.add(thrown);
            for(CatchTree ct:s.getCatches()) edge(dispatch,statement(ct.getBlock(),normal,exits),ct.getParameter().getType().toString());
            if(!s.getCatches().isEmpty()) edge(dispatch,thrown,"Uncaught");
            String body=statement(s.getBlock(),normal,new Context(exits.brk,exits.cont,ret,dispatch,exits.yielded));
            warnings.add("Exception paths are conservative: catch types and implicit exceptions are not predicted at runtime.");
            return body;
        }
    }
    private static final class TooLarge extends RuntimeException {}
}
