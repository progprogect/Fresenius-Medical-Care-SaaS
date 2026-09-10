"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resolveConversationAction } from "./actions";

export function ResolveButton({ conversationId }: { conversationId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await resolveConversationAction(conversationId);
          toast.success("Marked as resolved");
        })
      }
    >
      Mark resolved
    </Button>
  );
}
