package lark;
import java.nio.file.*;
/** Real shell and local Git smoke test, with no network or production repository. */
public final class TerminalGitCheck {
  static String await(Terminal t, String id, String marker) throws Exception {
    for (int i = 0; i < 200; i++) { String out=t.snapshot(id).str("output", ""); if(out.contains(marker)) return out; Thread.sleep(50); }
    throw new AssertionError("Timed out waiting for " + marker + ": " + t.snapshot(id).str("output", ""));
  }
  public static void main(String[] args) throws Exception {
    Path dir=Files.createTempDirectory("lark-git-"); Files.writeString(dir.resolve("Main.java"), "class Main {}\n");
    Terminal t=new Terminal(); String id=t.start(dir).str("id");
    try {
      if (!t.snapshot(id).str("output", "").contains("Git detected on PATH")) throw new AssertionError("Git detection failed");
      t.write(id, "git init", false); await(t,id,"Initialized empty Git repository");
      t.write(id, "git add Main.java", false);
      t.write(id, "git -c user.name=Test -c user.email=test@example.invalid commit -m \"Quoted message\"", false);
      await(t,id,"Quoted message");
      for(int i=0;i<100 && !Files.exists(dir.resolve(".git/refs/heads/master")) && !Files.exists(dir.resolve(".git/refs/heads/main"));i++) Thread.sleep(50);
      t.write(id, "git status --short", false); t.write(id, "git log -1 --format=COMMIT:%s", false);
      await(t,id,"COMMIT:Quoted message");
      Path remote = dir.resolve("remote repo.git"), clone = dir.resolve("clone repo");
      Process init = new ProcessBuilder("git", "init", "--bare", remote.toString()).redirectErrorStream(true).start();
      String initOutput = new String(init.getInputStream().readAllBytes());
      if (init.waitFor() != 0) throw new AssertionError(initOutput);
      t.write(id, "git remote add origin \"" + remote + "\"", false);
      t.write(id, "git push origin HEAD:refs/heads/lark-test && echo LARK_PUSH_OK", false);
      await(t,id,"\nLARK_PUSH_OK");
      t.write(id, "git clone --branch lark-test \"" + remote + "\" \"" + clone + "\" && echo LARK_CLONE_OK", false);
      await(t,id,"\nLARK_CLONE_OK");
      t.write(id, "git -C \"" + clone + "\" pull origin lark-test && echo LARK_PULL_OK", false);
      await(t,id,"\nLARK_PULL_OK");
      if (!Files.readString(clone.resolve("Main.java")).contains("class Main")) throw new AssertionError("clone content");
      t.write(id, "git switch -c lark-base && git switch -c lark-work && echo LARK_BRANCH_OK", false);
      await(t,id,"\nLARK_BRANCH_OK");
      t.write(id, "echo // branch >> Main.java", false);
      t.write(id, "git -c user.name=Test -c user.email=test@example.invalid commit -am \"Branch update\" && echo LARK_BRANCH_COMMIT_OK", false);
      await(t,id,"\nLARK_BRANCH_COMMIT_OK");
      t.write(id, "git switch lark-base && git merge --ff-only lark-work && echo LARK_MERGE_OK", false);
      await(t,id,"\nLARK_MERGE_OK");
      t.write(id, "echo // temporary >> Main.java", false);
      t.write(id, "git stash push -- Main.java && git stash pop && git restore Main.java && echo LARK_STASH_OK", false);
      await(t,id,"\nLARK_STASH_OK");
      if (!Files.readString(dir.resolve("Main.java")).contains("// branch") || Files.readString(dir.resolve("Main.java")).contains("// temporary")) throw new AssertionError("merge, stash or restore");
      System.out.println("Terminal Git smoke test passed");
    } finally { t.shutdown(); }
  }
}
