"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { BackfillSettings, TwilioSettings, WidgetSettings } from "@/lib/settings";
import { saveBackfillAction, saveTwilioAction, saveWidgetAction } from "./actions";

export function ChannelsForm({
  twilio: twilioInitial,
  backfill: backfillInitial,
  widget: widgetInitial,
  baseUrl,
}: {
  twilio: TwilioSettings;
  backfill: BackfillSettings;
  widget: WidgetSettings;
  baseUrl: string;
}) {
  const [twilio, setTwilio] = React.useState(twilioInitial);
  const [backfill, setBackfill] = React.useState(backfillInitial);
  const [widget, setWidget] = React.useState(widgetInitial);

  async function run(p: Promise<{ ok: boolean; error?: string }>, msg: string) {
    const res = await p;
    if (!res.ok) toast.error(res.error ?? "Failed");
    else toast.success(msg);
  }

  const embedSnippet = `<script src="${baseUrl}/embed.js" async></script>`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Twilio
            <Badge variant={twilio.mode === "live" ? "secondary" : "outline"}>
              {twilio.mode === "live" ? "live" : "demo mode"}
            </Badge>
          </CardTitle>
          <CardDescription>
            WhatsApp and SMS delivery for earlier-slot offers and inbound patient messages. In demo mode
            messages are simulated and shown in the Slot offers page — perfect for showcasing without a
            configured account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Switch
              id="twilio-live"
              checked={twilio.mode === "live"}
              onCheckedChange={(v) => setTwilio({ ...twilio, mode: v ? "live" : "demo" })}
            />
            <Label htmlFor="twilio-live">Send real messages through Twilio</Label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Account SID</Label>
              <Input value={twilio.accountSid} onChange={(e) => setTwilio({ ...twilio, accountSid: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Auth token</Label>
              <Input type="password" value={twilio.authToken} onChange={(e) => setTwilio({ ...twilio, authToken: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Phone number (SMS)</Label>
              <Input value={twilio.phoneNumber} onChange={(e) => setTwilio({ ...twilio, phoneNumber: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp sender</Label>
              <Input value={twilio.whatsappFrom} onChange={(e) => setTwilio({ ...twilio, whatsappFrom: e.target.value })} />
            </div>
          </div>
          <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Inbound messages: point the Twilio messaging webhook to{" "}
            <code className="font-mono">{baseUrl}/api/twilio/inbound</code> (POST). Patients can then
            write in WhatsApp to book, move or cancel appointments.
          </div>
          <Button onClick={() => run(saveTwilioAction(twilio), "Twilio settings saved")}>Save Twilio</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Earlier-slot offers (backfill)</CardTitle>
          <CardDescription>
            When a slot frees up, patients with later appointments for the same service automatically get
            an offer to move earlier. First accept wins.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Switch
              id="bf-enabled"
              checked={backfill.enabled}
              onCheckedChange={(v) => setBackfill({ ...backfill, enabled: v })}
            />
            <Label htmlFor="bf-enabled">Enabled</Label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Look-ahead (days)</Label>
              <Input
                type="number"
                value={backfill.horizonDays}
                onChange={(e) => setBackfill({ ...backfill, horizonDays: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Offer lifetime (min)</Label>
              <Input
                type="number"
                value={backfill.offerTtlMinutes}
                onChange={(e) => setBackfill({ ...backfill, offerTtlMinutes: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Max offers per slot</Label>
              <Input
                type="number"
                value={backfill.maxOffersPerSlot}
                onChange={(e) => setBackfill({ ...backfill, maxOffersPerSlot: Number(e.target.value) })}
              />
            </div>
          </div>
          <Button onClick={() => run(saveBackfillAction(backfill), "Backfill settings saved")}>
            Save backfill
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Website widget</CardTitle>
          <CardDescription>
            Embeddable chat + voice assistant for any clinic website. Paste one script tag before the
            closing body tag.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Widget title</Label>
              <Input value={widget.title} onChange={(e) => setWidget({ ...widget, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Position</Label>
              <Select
                value={widget.position}
                onValueChange={(v) => setWidget({ ...widget, position: v as WidgetSettings["position"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottom-right">Bottom right</SelectItem>
                  <SelectItem value="bottom-left">Bottom left</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Launcher greeting</Label>
            <Textarea rows={2} value={widget.greeting} onChange={(e) => setWidget({ ...widget, greeting: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Accent color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-9 w-12 cursor-pointer rounded-md border"
                  value={widget.primaryColor}
                  onChange={(e) => setWidget({ ...widget, primaryColor: e.target.value })}
                />
                <Input
                  className="w-32 font-mono"
                  value={widget.primaryColor}
                  onChange={(e) => setWidget({ ...widget, primaryColor: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                id="w-voice"
                checked={widget.allowVoice}
                onCheckedChange={(v) => setWidget({ ...widget, allowVoice: v })}
              />
              <Label htmlFor="w-voice">Enable voice calls in the widget</Label>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Embed code</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs">
                {embedSnippet}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(embedSnippet);
                  toast.success("Copied");
                }}
              >
                <Copy className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Try it live on the <a href="/demo-site" target="_blank" className="underline">demo site</a>.
            </p>
          </div>
          <Button onClick={() => run(saveWidgetAction(widget), "Widget settings saved")}>Save widget</Button>
        </CardContent>
      </Card>
    </div>
  );
}
