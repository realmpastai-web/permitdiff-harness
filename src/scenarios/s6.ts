import type { ScenarioDef } from "./types";

/**
 * @requiresRealCli
 * S6 -p --yolo with disableBypassPermissionsMode. The local managed-settings
 * mechanism is UNPROVEN in the spec, so CI skips this scenario.
 */
export const s6: ScenarioDef = {
  id: "S6",
  title: "yolo with disableBypassPermissionsMode",
  effect: "yolo-touch",
  extraCliArgs: ["-p", "--yolo"],
  requiresRealCli: true,
  skipReason:
    "skipped in CI: requires a real managed-settings file (disableBypassPermissionsMode, #4528); local managed-settings mechanism is UNPROVEN",
  prompt(ctx) {
    return `touch ${ctx.workdir}/yolo-touched.txt`;
  },
  rawInput() {
    return {
      flags: ["-p", "--yolo"],
      managedSetting: "disableBypassPermissionsMode",
      managedSettingState: "UNPROVEN",
    };
  },
};
