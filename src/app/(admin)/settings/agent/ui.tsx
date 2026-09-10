"use client";

import * as React from "react";
import { toast } from "sonner";
import { Bot, RefreshCw, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { AgentSettings } from "@/lib/settings";
import { saveAgentSettingsAction } from "./actions";

import { SUPPORTED_LANGUAGES } from "@/lib/languages";

const LANGUAGES = SUPPORTED_LANGUAGES.map((l) => ({ code: l.code, label: l.label }));

export function AgentSettingsForm({ initial }: { initial: AgentSettings }) {
  const [form, setForm] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [voices, setVoices] = React.useState<
    Array<{ voiceId: string; name: string; labels: string; category: string; saved: boolean }>
  >([]);
  const [agentId, setAgentId] = React.useState(initial.elevenLabsAgentId);
  const [languages, setLanguages] = React.useState<string[]>([]);

  React.useEffect(() => {
    fetch("/api/elevenlabs/voices")
      .then((r) => r.json())
      .then((d) => setVoices(d.voices ?? []))
      .catch(() => {});
  }, []);

  const savedVoices = voices.filter((v) => v.saved);
  const libraryVoices = voices.filter((v) => !v.saved);
  const selectedVoice = voices.find((v) => v.voiceId === form.voiceId);
  const [previewing, setPreviewing] = React.useState(false);

  async function previewVoice() {
    setPreviewing(true);
    try {
      const res = await fetch(`/api/elevenlabs/preview?voiceId=${encodeURIComponent(form.voiceId)}`);
      if (!res.ok) throw new Error("preview failed");
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      await audio.play();
    } catch {
      toast.error("Could not play a preview for this voice");
    } finally {
      setPreviewing(false);
    }
  }

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
    if (!res.ok) return void toast.error(data.error ?? "Sync failed", { duration: 8000 });
    setAgentId(data.agentId);
    setLanguages(data.languages ?? []);
    toast.success(
      `${data.created ? "Voice agent created" : "Voice agent updated"} — speaks ${(data.languages ?? []).join(", ")}`
    );
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
              <p className="text-xs text-muted-foreground">
                The language a call opens in. The assistant switches as soon as it hears the patient.
              </p>
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
              <p className="text-xs text-muted-foreground">
                Smaller models drift into long, formal answers. Downgrade only if cost matters more
                than how the conversation reads.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Voice model (runs inside ElevenLabs)</Label>
              <Input value={form.voiceLlm} onChange={(e) => setForm({ ...form, voiceLlm: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Voice (ElevenLabs)</Label>
              <Select value={form.voiceId} onValueChange={(v) => setForm({ ...form, voiceId: v })}>
                <SelectTrigger><SelectValue placeholder="Select voice" /></SelectTrigger>
                <SelectContent>
                  {voices.length === 0 && form.voiceId && (
                    <SelectItem value={form.voiceId}>{form.voiceId}</SelectItem>
                  )}
                  {savedVoices.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Your saved voices</SelectLabel>
                      {savedVoices.map((v) => (
                        <SelectItem key={v.voiceId} value={v.voiceId}>
                          {v.name}{v.labels ? ` · ${v.labels}` : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {libraryVoices.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Library</SelectLabel>
                      {libraryVoices.map((v) => (
                        <SelectItem key={v.voiceId} value={v.voiceId}>
                          {v.name}{v.labels ? ` · ${v.labels}` : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
              {selectedVoice && (
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={previewVoice} disabled={previewing}>
                    <Volume2 className="size-3.5" />
                    {previewing ? "Loading..." : "Preview voice"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {selectedVoice.saved ? "saved voice" : "library voice"}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Additional languages the assistant speaks</Label>
            <div className="flex flex-wrap gap-3 rounded-md border p-3">
              {LANGUAGES.filter((l) => l.code !== form.language).map((l) => (
                <label key={l.code} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.extraLanguages.includes(l.code)}
                    onCheckedChange={(v) =>
                      setForm({
                        ...form,
                        extraLanguages: v
                          ? [...form.extraLanguages, l.code]
                          : form.extraLanguages.filter((c) => c !== l.code),
                      })
                    }
                  />
                  {l.label}
                </label>
              ))}
            </div>
            {form.language === "en" && form.extraLanguages.length > 0 && (
              <p className="text-xs text-destructive">
                ElevenLabs locks an English-first agent to its English-only voice model, so the other
                languages would sound wrong. Pick a non-English primary language — German, for
                instance — and keep English in this list.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              The same voice speaks every language; only the greeting is translated.
            </p>
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
          {languages.length > 0 && (
            <div className="text-sm">
              <span className="text-muted-foreground">Speaks: </span>
              {languages.join(", ")}
            </div>
          )}
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
