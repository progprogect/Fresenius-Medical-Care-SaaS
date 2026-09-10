export function ResultCount({ shown, capped }: { shown: number; capped?: number }) {
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {shown === 0
        ? "No results — try clearing a filter."
        : capped && shown >= capped
          ? `Showing the first ${shown} results. Narrow the filters to see more.`
          : `${shown} result${shown === 1 ? "" : "s"}`}
    </p>
  );
}
