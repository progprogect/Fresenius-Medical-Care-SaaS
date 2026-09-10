"use client";

import * as React from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { minutesToHHMM } from "@/lib/format";
import { saveDoctorAction } from "./actions";

type HoursRow = { weekday: number; startMin: number; endMin: number };
type Doctor = {
  id?: string; name: string; title: string; specialty: string; bio: string;
  languages: string[]; color: string; clinicId: string; active: boolean;
  clinicLabel?: string; serviceIds: string[]; hours: HoursRow[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COLORS = ["#0d9488", "#0284c7", "#7c3aed", "#dc2626", "#d97706", "#059669", "#db2777"];

function hhmmToMin(v: string) {
  const [h, m] = v.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function DoctorsTable({
  doctors, clinics, services,
}: {
  doctors: Doctor[];
  clinics: Array<{ id: string; label: string }>;
  services: Array<{ id: string; name: string }>;
}) {
  const [editing, setEditing] = React.useState<Doctor | null>(null);
  const [busy, setBusy] = React.useState(false);

  const EMPTY: Doctor = {
    name: "", title: "Dr.", specialty: "Nephrology", bio: "", languages: ["en"],
    color: COLORS[0], clinicId: clinics[0]?.id ?? "", active: true, serviceIds: [],
    hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMin: 480, endMin: 960 })),
  };

  async function save() {
    if (!editing) return;
    setBusy(true);
    const res = await saveDoctorAction(editing);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Doctor saved");
    setEditing(null);
  }

  function setHours(weekday: number, patch: Partial<HoursRow> | null) {
    if (!editing) return;
    const rest = editing.hours.filter((h) => h.weekday !== weekday);
    if (patch === null) return setEditing({ ...editing, hours: rest });
    const current = editing.hours.find((h) => h.weekday === weekday) ?? {
      weekday, startMin: 480, endMin: 960,
    };
    setEditing({ ...editing, hours: [...rest, { ...current, ...patch }] });
  }

  return (
    <>
      <div className="flex justify-end py-3">
        <Button size="sm" onClick={() => setEditing({ ...EMPTY })}>
          <Plus className="size-4" /> Add doctor
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Doctor</TableHead>
            <TableHead>Specialty</TableHead>
            <TableHead>Clinic</TableHead>
            <TableHead>Languages</TableHead>
            <TableHead className="text-right">Services</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {doctors.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-medium">
                <span className="mr-2 inline-block size-2 rounded-full" style={{ background: d.color }} />
                {d.title} {d.name}
              </TableCell>
              <TableCell>{d.specialty}</TableCell>
              <TableCell className="text-muted-foreground">{d.clinicLabel}</TableCell>
              <TableCell className="uppercase text-xs text-muted-foreground">{d.languages.join(", ")}</TableCell>
              <TableCell className="text-right">{d.serviceIds.length}</TableCell>
              <TableCell>
                <Badge variant={d.active ? "secondary" : "outline"}>{d.active ? "active" : "inactive"}</Badge>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" onClick={() => setEditing({ ...d, hours: [...d.hours], serviceIds: [...d.serviceIds], languages: [...d.languages] })}>
                  <Pencil className="size-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit doctor" : "Add doctor"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-[100px_1fr]">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Full name</Label>
                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Specialty</Label>
                  <Input value={editing.specialty} onChange={(e) => setEditing({ ...editing, specialty: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Clinic</Label>
                  <Select value={editing.clinicId} onValueChange={(v) => setEditing({ ...editing, clinicId: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {clinics.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Bio (the AI uses this to recommend the doctor)</Label>
                <Textarea rows={2} value={editing.bio} onChange={(e) => setEditing({ ...editing, bio: e.target.value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Languages (comma-separated codes)</Label>
                  <Input
                    value={editing.languages.join(", ")}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        languages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Calendar color</Label>
                  <div className="flex items-center gap-1.5 pt-1">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="size-6 rounded-full border-2"
                        style={{ background: c, borderColor: editing.color === c ? "var(--foreground)" : "transparent" }}
                        onClick={() => setEditing({ ...editing, color: c })}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Services provided</Label>
                <div className="grid gap-1.5 rounded-md border p-3 sm:grid-cols-2">
                  {services.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={editing.serviceIds.includes(s.id)}
                        onCheckedChange={(v) =>
                          setEditing({
                            ...editing,
                            serviceIds: v
                              ? [...editing.serviceIds, s.id]
                              : editing.serviceIds.filter((id) => id !== s.id),
                          })
                        }
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Working hours (clinic local time)</Label>
                <div className="space-y-1.5 rounded-md border p-3">
                  {[1, 2, 3, 4, 5, 6, 0].map((weekday) => {
                    const row = editing.hours.find((h) => h.weekday === weekday);
                    return (
                      <div key={weekday} className="flex items-center gap-3 text-sm">
                        <label className="flex w-16 items-center gap-2">
                          <Checkbox
                            checked={!!row}
                            onCheckedChange={(v) => setHours(weekday, v ? {} : null)}
                          />
                          {WEEKDAYS[weekday]}
                        </label>
                        {row ? (
                          <>
                            <Input
                              type="time"
                              className="w-28"
                              value={minutesToHHMM(row.startMin)}
                              onChange={(e) => setHours(weekday, { startMin: hhmmToMin(e.target.value) })}
                            />
                            <span className="text-muted-foreground">—</span>
                            <Input
                              type="time"
                              className="w-28"
                              value={minutesToHHMM(row.endMin)}
                              onChange={(e) => setHours(weekday, { endMin: hhmmToMin(e.target.value) })}
                            />
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">day off</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="doc-active"
                  checked={editing.active}
                  onCheckedChange={(v) => setEditing({ ...editing, active: v })}
                />
                <Label htmlFor="doc-active">Accepting appointments</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={busy || !editing?.name || !editing?.clinicId}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
