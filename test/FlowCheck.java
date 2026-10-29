package lark;

import java.util.*;

/** Real javac AST + CFG contract checks. Run with java -cp ../classes lark.FlowCheck. */
public final class FlowCheck {
    static int checks;
    static void check(boolean value,String message) { checks++; if(!value) throw new AssertionError(message); }
    static List<Json.Obj> objects(Json.Arr a) { return a.values().stream().map(v->(Json.Obj)v).toList(); }
    static Json.Obj analyze(String code) { return Flow.analyze(new Json.Arr().add(new Json.Obj().put("path","FlowExample.java").put("content",code))); }
    static Json.Obj method(Json.Obj data,String name) { return objects(data.arr("methods")).stream().filter(m->m.str("name").equals(name)).findFirst().orElseThrow(); }
    static Json.Obj node(Json.Obj m,String label) { return objects(m.arr("nodes")).stream().filter(n->n.str("label").equals(label)).findFirst().orElseThrow(()->new AssertionError("Missing "+label)); }
    static boolean edge(Json.Obj m,String from,String to,String label) {return objects(m.arr("edges")).stream().anyMatch(e->e.str("from").equals(from)&&e.str("to").equals(to)&&(label==null||e.str("label").equals(label)));}
    static boolean path(Json.Obj m,String from,String to) {
        Set<String> seen=new HashSet<>();ArrayDeque<String> queue=new ArrayDeque<>();queue.add(from);
        while(!queue.isEmpty()) {String id=queue.remove();if(id.equals(to))return true;if(!seen.add(id))continue;objects(m.arr("edges")).stream().filter(e->e.str("from").equals(id)&&!e.str("label").equals("Possible exception")).forEach(e->queue.add(e.str("to")));}return false;
    }
    public static void main(String[] args) {
        String source="""
            class FlowExample {
              FlowExample() { System.out.println("new"); }
              int seq(int x) { int y=x+1; y++; return y; }
              int branch(int x) { if(x>0) return 1; else if(x<0) return -1; return 0; }
              int loops(int n) { int sum=0; for(int i=0;i<n;i++){ if(i==2) continue; while(sum<10){sum++; if(sum==5)break;} if(i==8) break; } return sum; }
              void each(int[] a) { for(int x:a) { if(x==0) continue; System.out.println(x); } }
              void repeat(int n) { do { n--; if(n==2)continue; } while(n>0); }
              int choose(int n) { switch(n) { case 0: n++; case 1: n+=2; break; default: n=7; } return n; }
              int expr(int n) { return switch(n) { case 0 -> 3; default -> { yield 9; } }; }
              int guarded(int x) { try { if(x==0)return 1; throw new IllegalArgumentException(); } catch(IllegalArgumentException e) { return 2; } finally { System.out.println("cleanup"); } }
              int override() { try { return 1; } finally { return 2; } }
              void nested() { try { try { throw new RuntimeException(); } finally { System.out.println("inner"); } } catch(Exception e) { System.out.println("catch"); } }
              int recurse(int n) { if(n==0)return 0; return recurse(n-1); }
              void external() { Other.call(); }
              void resource() throws Exception { try(var r=new java.io.StringReader("x")){r.read();} }
            }
            class Other { static void call() {} }
            """;
        Json.Obj all=analyze(source);check(all.bool("valid"),"valid source");check(all.arr("methods").size()==15,"methods and constructor across classes");
        Json.Obj seq=method(all,"seq");
        check(path(seq,node(seq,"int y=x+1;").str("id"),node(seq,"return y;").str("id")),"sequence to return");
        for(Json.Obj m:objects(all.arr("methods"))) {
            Set<String> ids=new HashSet<>();for(Json.Obj n:objects(m.arr("nodes"))) {check(ids.add(n.str("id")),"unique stable id");check(n.longVal("end")>=n.longVal("start"),"valid source range");}
            for(Json.Obj e:objects(m.arr("edges")))check(ids.contains(e.str("from"))&&ids.contains(e.str("to")),"no dangling edge");
        }
        Json.Obj branch=method(all,"branch");check(objects(branch.arr("nodes")).stream().filter(n->n.str("kind").equals("decision")).count()==2,"else-if decisions");
        check(!path(branch,node(branch,"return 1;").str("id"),node(branch,"return 0;").str("id")),"early return has no fallthrough");
        Json.Obj loops=method(all,"loops");
        check(edge(loops,node(loops,"continue;").str("id"),node(loops,"i++").str("id"),""),"for continue targets update");
        check(objects(loops.arr("nodes")).stream().filter(n->n.str("label").equals("break;")).count()==2,"nested breaks represented");
        Json.Obj each=method(all,"each");check(edge(each,node(each,"continue;").str("id"),node(each,"More elements?").str("id"),""),"enhanced continue targets iterator");
        Json.Obj repeat=method(all,"repeat");check(path(repeat,repeat.str("entry"),node(repeat,"n--;").str("id")),"do body first");
        check(edge(repeat,node(repeat,"continue;").str("id"),node(repeat,"(n>0)").str("id"),""),"do continue targets condition");
        Json.Obj choose=method(all,"choose");check(edge(choose,node(choose,"n++;").str("id"),node(choose,"n+=2;").str("id"),""),"colon switch fallthrough");
        check(edge(choose,node(choose,"break;").str("id"),node(choose,"return n;").str("id"),""),"switch break exits");
        Json.Obj expr=method(all,"expr");check(objects(expr.arr("edges")).stream().anyMatch(e->e.str("label").equals("default")),"switch expression default");
        check(objects(expr.arr("nodes")).stream().anyMatch(n->n.str("label").equals("yield 9;")),"yield represented");
        Json.Obj guarded=method(all,"guarded");
        for(String label:List.of("return 1;","return 2;")) {
            String ret=node(guarded,label).str("id");Json.Obj out=objects(guarded.arr("edges")).stream().filter(e->e.str("from").equals(ret)&&e.str("label").isEmpty()).findFirst().orElseThrow();
            check(objects(guarded.arr("nodes")).stream().anyMatch(n->n.str("id").equals(out.str("to"))&&n.str("label").contains("cleanup")),"finally before return");
        }
        Json.Obj override=method(all,"override");check(objects(override.arr("nodes")).stream().filter(n->n.str("label").equals("return 2;")).anyMatch(n->path(override,node(override,"return 1;").str("id"),n.str("id"))),"finally return overrides pending return");
        Json.Obj nested=method(all,"nested");String thrown=node(nested,"throw new RuntimeException();").str("id");
        Json.Obj out=objects(nested.arr("edges")).stream().filter(e->e.str("from").equals(thrown)).findFirst().orElseThrow();
        check(objects(nested.arr("nodes")).stream().anyMatch(n->n.str("id").equals(out.str("to"))&&n.str("label").contains("inner")),"nested throw executes inner finally before outer catch");
        Json.Obj recursive=method(all,"recurse");check(objects(recursive.arr("calls")).stream().anyMatch(c->recursive.str("id").equals(c.str("target"))),"recursive call resolved");
        check(objects(method(all,"external").arr("calls")).stream().anyMatch(c->method(all,"call").str("id").equals(c.str("target"))),"cross-class call resolved");
        check(method(all,"resource").arr("warnings").size()>0,"unsupported resource cleanup visible");
        check(analyze(source)==all,"cache reuses graph");
        check(!analyze("class Broken { void x( {").bool("valid"),"syntax error detected");
        Json.Obj spaced=analyze(source.replace("int seq", "\n\n int seq"));check(node(seq,"return y;").str("id").equals(node(method(spaced,"seq"),"return y;").str("id")),"IDs survive whitespace changes");
        long start=System.nanoTime();Json.Obj large=analyze("class Big { void big(){int x=0;"+"x++;".repeat(1800)+"} }");
        check(method(large,"big").arr("nodes").size()==1,"large method gives explicit overview");
        Json.Obj forever=method(analyze("class Constant { void forever(){while(true){}} }"),"forever");
        check(objects(forever.arr("edges")).stream().noneMatch(e->e.str("label").equals("False")),"literal-true loop has no invented exit");
        Json.Obj jumps=method(analyze("class Jumps { void jump(int n){for(int i=0;i<n;i++){try {if(i==2)continue; if(i==4)break;} finally {System.out.println(i);}}} }"),"jump");
        for(String label:List.of("continue;","break;")) {
            String id=node(jumps,label).str("id");Json.Obj e=objects(jumps.arr("edges")).stream().filter(x->x.str("from").equals(id)&&x.str("label").isEmpty()).findFirst().orElseThrow();
            check(objects(jumps.arr("nodes")).stream().anyMatch(n->n.str("id").equals(e.str("to"))&&n.str("label").contains("System.out.println")),"finally runs before "+label);
        }
        System.out.println("FlowCheck: "+checks+" checks passed; large source "+((System.nanoTime()-start)/1_000_000)+" ms");
    }
}
