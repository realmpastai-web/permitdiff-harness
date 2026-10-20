/**
 * Mock stand-in for `copilot --version`.
 * Returns the --prefer-version argument. Does not spawn a binary.
 */
export function mockCopilotVersion(cliArgs: readonly string[]): string {
  const index = cliArgs.indexOf("--prefer-version");
  const version = index >= 0 ? cliArgs[index + 1] : undefined;
  if (!version || version.startsWith("--")) {
    throw new Error("mock copilot --version requires --prefer-version <V>");
  }
  return version;
}
