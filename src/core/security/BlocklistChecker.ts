/**
 * Blocklist Checker
 *
 * Checks bash commands against user-defined blocklist patterns.
 * Patterns are treated as case-insensitive regex with fallback to substring match.
 */

export function isCommandBlocked(
  command: string,
  patterns: string[],
  enableBlocklist: boolean
): boolean {
  if (!enableBlocklist) {
    return false;
  }

  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern, 'i').test(command);
    } catch {
      // Invalid regex - fall back to substring match
      return command.toLowerCase().includes(pattern.toLowerCase());
    }
  });
}
