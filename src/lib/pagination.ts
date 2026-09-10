/** Clamps a `page` query param to a page that actually exists. */
export function parsePage(raw: string | undefined, total: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const asked = Number(raw ?? 1);
  if (!Number.isFinite(asked) || asked < 1) return 1;
  return Math.min(Math.trunc(asked), pages);
}
