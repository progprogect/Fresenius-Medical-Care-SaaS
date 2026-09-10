"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, HandHelping, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  claimConversationAction,
  releaseConversationAction,
  resolveConversationAction,
} from "./actions";

type Result = { ok: boolean; message?: string; error?: string };

function useAction() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (action: () => Promise<Result>) =>
    start(async () => {
      const res = await action();
      if (res.ok) toast.success(res.message ?? "Done");
      else toast.error(res.error ?? "Failed");
      router.refresh();
    });
  return { pending, run };
}

/** Take an escalated conversation, straight from the queue. */
export function ClaimButton({
  conversationId,
  size = "sm",
  label = "Take it",
}: {
  conversationId: string;
  size?: "sm" | "default";
  label?: string;
}) {
  const { pending, run } = useAction();
  return (
    <Button
      size={size}
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        run(() => claimConversationAction(conversationId));
      }}
    >
      <HandHelping className="size-3.5" />
      {label}
    </Button>
  );
}

export function ReleaseButton({ conversationId }: { conversationId: string }) {
  const { pending, run } = useAction();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        run(() => releaseConversationAction(conversationId));
      }}
    >
      <Undo2 className="size-3.5" />
      Put back
    </Button>
  );
}

export function ResolveButton({ conversationId }: { conversationId: string }) {
  const { pending, run } = useAction();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        run(() => resolveConversationAction(conversationId));
      }}
    >
      <Check className="size-3.5" />
      Mark handled
    </Button>
  );
}
