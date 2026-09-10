/** Short, human result summary shown next to the filters. */
export function resultLabel(shown: number, capped?: number) {
  if (shown === 0) return "No matches";
  if (capped && shown >= capped) return `First ${shown} matches`;
  return `${shown} ${shown === 1 ? "result" : "results"}`;
}
