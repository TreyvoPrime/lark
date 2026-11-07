package lark;
import java.nio.file.*;
public class FileWorkflowCheck {
 public static void main(String[] args) throws Exception {
  if(System.getenv("LARK_HOME")==null) throw new AssertionError("Isolated home required");
  Path fixture=Files.createTempDirectory(Settings.home().getParent(),"file-workflow-");
  Path original=fixture.resolve("Notes.txt"), sibling=fixture.resolve("untouched.txt");
  Files.writeString(original,"hello\n"); Files.writeString(sibling,"unchanged");
  Projects p=new Projects(Settings.load()); String id=p.openSingleFile(original);
  if(p.read(id).arr("files").size()!=1) throw new AssertionError("single file isolation");
  if(!p.read(id).str("path","").equals(original.toString())) throw new AssertionError("visible original path");
  p.writeFile(id,"Notes.txt","edited\n");
  if(!Files.readString(original).equals("edited\n")) throw new AssertionError("original not saved");
  if(!Files.readString(sibling).equals("unchanged")) throw new AssertionError("sibling modified");
  if(p.projectDir(id).equals(fixture)) throw new AssertionError("run workspace includes siblings");
  try { p.writeFile(id,"untouched.txt","wrong"); throw new AssertionError("sibling write accepted"); } catch(RequestFail expected) {}
  if(!p.openSingleFile(original).equals(id)) throw new AssertionError("duplicate entry");
  if(new Projects(Settings.load()).read(id).arr("files").size()!=1) throw new AssertionError("reopen");
  p.delete(id);
  if(Files.exists(original) || !Files.readString(sibling).equals("unchanged")) throw new AssertionError("single-file deletion affected wrong file");
  System.out.println("Single-file open, original save, isolation, reopen, and confirmed deletion passed.");
 }
}
