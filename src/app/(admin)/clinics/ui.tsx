"use client";

import * as React from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { saveClinicAction } from "./actions";

const TIMEZONES = [
  "Europe/Berlin", "Europe/Paris", "Europe/Madrid", "Europe/Rome",
  "Europe/Warsaw", "Europe/Amsterdam", "Europe/Vienna", "Europe/Lisbon",
  "Europe/London", "Europe/Prague",
];

type Clinic = {
  id?: string; name: string; city: string; country: string; address: string;
  phone: string; timezone: string; active: boolean; doctors?: number; appointments?: number;
};

const EMPTY: Clinic = {
  name: "", city: "", country: "", address: "", phone: "",
  timezone: "Europe/Berlin", active: true,
};

export function ClinicsTable({ clinics }: { clinics: Clinic[] }) {
  const [editing, setEditing] = React.useState<Clinic | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    if (!editing) return;
    setBusy(true);
    const res = await saveClinicAction({ ...editing, id: editing.id });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Clinic saved");
    setEditing(null);
  }

  return (
    <>
      <div className="flex justify-end py-3">
        <Button size="sm" onClick={() => setEditing({ ...EMPTY })}>
          <Plus className="size-4" /> Add clinic
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Country</TableHead>
            <TableHead>Timezone</TableHead>
            <TableHead className="text-right">Doctors</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {clinics.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell>{c.city}</TableCell>
              <TableCell>{c.country}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{c.timezone}</TableCell>
              <TableCell className="text-right">{c.doctors}</TableCell>
              <TableCell>
                <Badge variant={c.active ? "secondary" : "outline"}>
                  {c.active ? "active" : "inactive"}
                </Badge>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" onClick={() => setEditing({ ...c })}>
                  <Pencil className="size-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit clinic" : "Add clinic"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={editing.city} onChange={(e) => setEditing({ ...editing, city: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Input value={editing.country} onChange={(e) => setEditing({ ...editing, country: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Address</Label>
                <Input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select value={editing.timezone} onValueChange={(v) => setEditing({ ...editing, timezone: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Switch
                  id="clinic-active"
                  checked={editing.active}
                  onCheckedChange={(v) => setEditing({ ...editing, active: v })}
                />
                <Label htmlFor="clinic-active">Accepting bookings</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={busy || !editing?.name}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
