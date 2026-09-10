"use client";

import { useTransition } from "react";
import { RefreshCw, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { scanBackfillAction, simulateOfferResponseAction } from "./actions";

export function BackfillToolbar() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await scanBackfillAction();
          toast.success(
            res.created > 0
              ? `Created and sent ${res.created} offer(s)`
              : "No freed slots without offers right now"
          );
        })
      }
    >
      <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
      Scan for freed slots
    </Button>
  );
}

export function OfferRowActions({ token }: { token: string }) {
  const [pending, start] = useTransition();
  function respond(action: "accept" | "decline") {
    start(async () => {
      const res = await simulateOfferResponseAction(token, action);
      if (!res.ok) toast.error(res.error);
      else toast.success(action === "accept" ? "Offer accepted — appointment moved" : "Offer declined");
    });
  }
  return (
    <div className="flex gap-1.5">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => respond("accept")}>
        <Check className="size-3.5" /> Simulate accept
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => respond("decline")}>
        <X className="size-3.5" /> Decline
      </Button>
    </div>
  );
}
