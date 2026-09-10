"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type FilterOption = { value: string; label: string };

export type FilterDef =
  | { kind: "search"; key: string; placeholder: string; width?: string }
  | { kind: "select"; key: string; allLabel: string; options: FilterOption[]; width?: string }
  | { kind: "date"; key: string; label: string; width?: string };

/**
 * URL-driven filter bar shared by every list page: filters live in the query
 * string, so a filtered view is linkable, survives refresh and back/forward.
 */
export function FilterBar({ filters }: { filters: FilterDef[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const searchKeys = filters.filter((f) => f.kind === "search").map((f) => f.key);

  const [drafts, setDrafts] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(searchKeys.map((k) => [k, search.get(k) ?? ""]))
  );

  const setParam = React.useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(search.toString());
      if (value && value !== "all") params.set(key, value);
      else params.delete(key);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, search]
  );

  // Debounce free-text inputs so typing doesn't fire a request per keystroke.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      for (const key of searchKeys) {
        const draft = drafts[key] ?? "";
        if ((search.get(key) ?? "") !== draft) setParam(key, draft);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [drafts, searchKeys, search, setParam]);

  const activeCount = filters.filter((f) => {
    const v = search.get(f.key);
    return v && v !== "all";
  }).length;

  function clearAll() {
    setDrafts(Object.fromEntries(searchKeys.map((k) => [k, ""])));
    const params = new URLSearchParams(search.toString());
    for (const f of filters) params.delete(f.key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f) => {
        if (f.kind === "search")
          return (
            <Input
              key={f.key}
              placeholder={f.placeholder}
              className={f.width ?? "w-60"}
              value={drafts[f.key] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [f.key]: e.target.value }))}
            />
          );
        if (f.kind === "date")
          return (
            <div key={f.key} className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{f.label}</span>
              <Input
                type="date"
                className={f.width ?? "w-40"}
                value={search.get(f.key) ?? ""}
                onChange={(e) => setParam(f.key, e.target.value)}
              />
            </div>
          );
        return (
          <Select
            key={f.key}
            value={search.get(f.key) ?? "all"}
            onValueChange={(v) => setParam(f.key, v)}
          >
            <SelectTrigger className={f.width ?? "w-44"}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{f.allLabel}</SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })}
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <X className="size-3.5" />
          Clear {activeCount}
        </Button>
      )}
    </div>
  );
}
