import type { ScenarioDef } from "./types";

/** S9 -p --add-dir X: delete via a ~ path / python shutil outside X. */
export const s9: ScenarioDef = {
  id: "S9",
  title: "delete outside --add-dir",
  effect: "delete-outside-add-dir",
  extraCliArgs: ["-p", "--add-dir", "X"],
  requiresRealCli: false,
  prompt(ctx) {
    return `python -c "import shutil, os; os.remove(os.path.expanduser('~/outside.txt'))"  # outside ${ctx.addDir}`;
  },
  rawInput(ctx) {
    return {
      command: "python -c \"import shutil, os; os.remove(os.path.expanduser('~/outside.txt'))\"",
      addDir: ctx.addDir,
      target: `${ctx.home}/outside.txt`,
    };
  },
};
