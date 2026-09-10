"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, Search, SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type FilterOption = { value: string; label: string };

type Common = {
  key: string;
  /** Short noun shown on the active-filter chip, e.g. "Clinic". */
  label: string;
  /** Keep this control on the toolbar instead of inside the Filters popover. */
  primary?: boolean;
};

export type FilterDef =
  | (Common & { kind: "search"; placeholder: string })
  | (Common & { kind: "select"; allLabel: string; options: FilterOption[] })
  | (Common & { kind: "date" })
  /** Sorting is not a filter: it sits apart and never counts as "active". */
  | (Common & { kind: "sort"; defaultLabel: string; options: FilterOption[] });

/**
 * List-page toolbar. Filters live in the URL, so a filtered view is linkable
 * and survives refresh and back/forward.
 *
 * Layout follows the usual data-table pattern: one search field, the two or
 * three filters people reach for most, everything else folded into a single
 * "Filters" popover, and the choices currently in effect restated as removable
 * chips — so an unexpected result set always explains itself.
 */
export function FilterBar({
  filters,
  resultLabel,
}: {
  filters: FilterDef[];
  resultLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const searchFilter = filters.find((f) => f.kind === "search");
  const sortFilter = filters.find((f) => f.kind === "sort");
  const choosers = filters.filter((f) => f.kind === "select" || f.kind === "date");
  const inline = choosers.filter((f) => f.primary);
  const folded = choosers.filter((f) => !f.primary);

  const [draft, setDraft] = React.useState(
    searchFilter ? (search.get(searchFilter.key) ?? "") : ""
  );

  const setParam = React.useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(search.toString());
      if (value && value !== "all") params.set(key, value);
      else params.delete(key);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, search]
  );

  // Debounced so typing does not fire a request per keystroke.
  React.useEffect(() => {
    if (!searchFilter) return;
    const key = searchFilter.key;
    const timer = setTimeout(() => {
      if ((search.get(key) ?? "") !== draft) setParam(key, draft);
    }, 350);
    return () => clearTimeout(timer);
  }, [draft, searchFilter, search, setParam]);

  function labelFor(f: FilterDef, value: string) {
    if (f.kind === "select") return f.options.find((o) => o.value === value)?.label ?? value;
    return value;
  }

  const active = choosers
    .map((f) => ({ filter: f, value: search.get(f.key) ?? "" }))
    .filter((a) => a.value && a.value !== "all");
  const foldedActive = active.filter((a) => !a.filter.primary).length;

  function clearAll() {
    setDraft("");
    const params = new URLSearchParams(search.toString());
    for (const f of filters) if (f.kind !== "sort") params.delete(f.key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const searchActive = Boolean(searchFilter && (search.get(searchFilter.key) ?? ""));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {searchFilter && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchFilter.placeholder}
              className="w-64 pl-8 pr-8"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={searchFilter.placeholder}
            />
            {draft && (
              <button
                type="button"
                onClick={() => setDraft("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}

        {inline.map((f) => (
          <FilterControl
            key={f.key}
            filter={f}
            value={search.get(f.key) ?? ""}
            onChange={(v) => setParam(f.key, v)}
          />
        ))}

        {folded.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-1.5">
                <SlidersHorizontal className="size-3.5" />
                Filters
                {foldedActive > 0 && (
                  <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 justify-center px-1 tabular-nums">
                    {foldedActive}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Filters</span>
                  {foldedActive > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        const params = new URLSearchParams(search.toString());
                        for (const f of folded) params.delete(f.key);
                        const qs = params.toString();
                        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
                      }}
                    >
                      Reset
                    </Button>
                  )}
                </div>
                <Separator />
                <div className="space-y-3">
                  {folded.map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{f.label}</Label>
                      <FilterControl
                        filter={f}
                        value={search.get(f.key) ?? ""}
                        onChange={(v) => setParam(f.key, v)}
                        full
                      />
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}

        <div className="ml-auto flex items-center gap-2">
          {resultLabel && (
            <span className="text-xs text-muted-foreground tabular-nums">{resultLabel}</span>
          )}
          {sortFilter && sortFilter.kind === "sort" && (
            <Select
              value={search.get(sortFilter.key) ?? "all"}
              onValueChange={(v) => setParam(sortFilter.key, v)}
            >
              <SelectTrigger className="w-44" aria-label="Sort order">
                <ArrowUpDown className="size-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{sortFilter.defaultLabel}</SelectItem>
                {sortFilter.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {(active.length > 0 || searchActive) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Filtered by</span>
          {searchActive && searchFilter && (
            <Chip label="Search" value={`"${search.get(searchFilter.key)}"`} onRemove={() => setDraft("")} />
          )}
          {active.map(({ filter, value }) => (
            <Chip
              key={filter.key}
              label={filter.label}
              value={labelFor(filter, value)}
              onRemove={() => setParam(filter.key, "")}
            />
          ))}
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearAll}>
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}

function Chip({
  label, value, onRemove,
}: {
  label: string;
  value: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-background py-0.5 pl-2.5 pr-1 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

function FilterControl({
  filter, value, onChange, full,
}: {
  filter: FilterDef;
  value: string;
  onChange: (value: string) => void;
  full?: boolean;
}) {
  if (filter.kind === "date")
    return (
      <Input
        type="date"
        className={full ? "w-full" : "w-40"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={filter.label}
      />
    );
  if (filter.kind !== "select") return null;
  return (
    <Select value={value || "all"} onValueChange={onChange}>
      <SelectTrigger className={full ? "w-full" : "w-auto min-w-36"} aria-label={filter.label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{filter.allLabel}</SelectItem>
        {filter.options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
