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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { saveServiceAction } from "./actions";

type Service = {
  id?: string; name: string; category: string; durationMin: number; priceEur: number;
  description: string; prepInstructions: string; active: boolean; doctors?: number;
};

const EMPTY: Service = {
  name: "", category: "Consultations", durationMin: 30, priceEur: 100,
  description: "", prepInstructions: "", active: true,
};

export function ServicesTable({ services }: { services: Service[] }) {
  const [editing, setEditing] = React.useState<Service | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    if (!editing) return;
    setBusy(true);
    const res = await saveServiceAction({
      ...editing,
      durationMin: Number(editing.durationMin),
      priceEur: Number(editing.priceEur),
    });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Service saved");
    setEditing(null);
  }

  return (
    <>
      <div className="flex justify-end py-3">
        <Button size="sm" onClick={() => setEditing({ ...EMPTY })}>
          <Plus className="size-4" /> Add service
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Service</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Duration</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Doctors</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {services.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell className="text-muted-foreground">{s.category}</TableCell>
              <TableCell className="text-right">{s.durationMin} min</TableCell>
              <TableCell className="text-right">{formatMoney(s.priceEur * 100)}</TableCell>
              <TableCell className="text-right">{s.doctors}</TableCell>
              <TableCell>
                <Badge variant={s.active ? "secondary" : "outline"}>{s.active ? "active" : "inactive"}</Badge>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" onClick={() => setEditing({ ...s })}>
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
            <DialogTitle>{editing?.id ? "Edit service" : "Add service"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Duration (min)</Label>
                  <Input
                    type="number"
                    value={editing.durationMin}
                    onChange={(e) => setEditing({ ...editing, durationMin: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Price (EUR)</Label>
                  <Input
                    type="number"
                    value={editing.priceEur}
                    onChange={(e) => setEditing({ ...editing, priceEur: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Description (the AI reads this to patients)</Label>
                <Textarea
                  rows={2}
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Preparation instructions</Label>
                <Textarea
                  rows={2}
                  value={editing.prepInstructions}
                  onChange={(e) => setEditing({ ...editing, prepInstructions: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Switch
                  id="svc-active"
                  checked={editing.active}
                  onCheckedChange={(v) => setEditing({ ...editing, active: v })}
                />
                <Label htmlFor="svc-active">Bookable</Label>
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
