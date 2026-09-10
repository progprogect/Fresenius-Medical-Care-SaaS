"use client";

import * as React from "react";
import { toast } from "sonner";
import { Bot, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { AgentSettings } from "@/lib/settings";
import { saveAgentSettingsAction } from "./actions";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
  { code: "pl", label: "Polish" },
];

export function AgentSettingsForm({ initial }: { initial: AgentSettings }) {
  const [form, setForm] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [voices, setVoices] = React.useState<Array<{ voiceId: string; name: string; labels: string }>>([]);
  const [agentId, setAgentId] = React.useState(initial.elevenLabsAgentId);

  React.useEffect(() => {
    fetch("/api/elevenlabs/voices")
      .then((r) => r.json())
      .then((d) => setVoices(d.voices ?? []))
      .catch(() => {});
  }, []);

  async function save() {
    setBusy(true);
    const res = await saveAgentSettingsAction(form);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Agent settings saved");
  }

  async function sync() {
    setSyncing(true);
    const saveRes = await saveAgentSettingsAction(form);
    if (!saveRes.ok) {
      setSyncing(false);
      return void toast.error(saveRes.error);
    }
    const res = await fetch("/api/elevenlabs/sync", { method: "POST" });
    const data = await res.json();
    setSyncing(false);
    if (!res.ok) return void toast.error(data.error ?? "Sync failed");
    setAgentId(data.agentId);
    toast.success(data.created ? "Voice agent created in ElevenLabs" : "Voice agent updated");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Persona</CardTitle>
          <CardDescription>How the assistant introduces itself and behaves</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Assistant name</Label>
              <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Primary language</Label>
              <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Personality & instructions</Label>
            <Textarea
              rows={4}
              value={form.persona}
              onChange={(e) => setForm({ ...form, persona: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Safety rules (identity verification, confirmation before changes, clinical escalation) are
              always appended automatically and cannot be disabled here.
            </p>
          </div>
          <div className="space-y-2">
            <Label>First message</Label>
            <Textarea
              rows={2}
              value={form.firstMessage}
              onChange={(e) => setForm({ ...form, firstMessage: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Chat model (OpenAI)</Label>
              <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Voice (ElevenLabs)</Label>
              <Select value={form.voiceId} onValueChange={(v) => setForm({ ...form, voiceId: v })}>
                <SelectTrigger><SelectValue placeholder="Select voice" /></SelectTrigger>
                <SelectContent>
                  {voices.length === 0 && form.voiceId && (
                    <SelectItem value={form.voiceId}>{form.voiceId}</SelectItem>
                  )}
                  {voices.map((v) => (
                    <SelectItem key={v.voiceId} value={v.voiceId}>
                      {v.name}{v.labels ? ` · ${v.labels}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={save} disabled={busy}>Save settings</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-4 text-primary" /> ElevenLabs voice agent
          </CardTitle>
          <CardDescription>
            Provisions a conversational voice agent in your ElevenLabs workspace with the persona above
            and webhook tools pointing to this deployment. Re-sync after changing clinics, services or
            the persona.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Agent status:</span>
            {agentId ? (
              <>
                <Badge variant="secondary">provisioned</Badge>
                <span className="font-mono text-xs text-muted-foreground">{agentId}</span>
              </>
            ) : (
              <Badge variant="outline">not created yet</Badge>
            )}
          </div>
          <Button onClick={sync} disabled={syncing} variant={agentId ? "outline" : "default"}>
            <RefreshCw className={syncing ? "size-4 animate-spin" : "size-4"} />
            {agentId ? "Re-sync agent" : "Create voice agent"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Voice tools call this deployment&apos;s public URL. On localhost the voice conversation works,
            but ElevenLabs cannot reach local webhook tools — deploy to Railway for full voice booking.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
