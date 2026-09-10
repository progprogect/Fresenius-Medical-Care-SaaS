"use client";

import * as React from "react";
import { ArrowRight, CalendarCheck2, CircleCheck, CircleX, HeartPulse } from "lucide-react";

type OfferInfo = {
  status: string;
  expired: boolean;
  patientFirstName: string;
  service: string;
  clinic: string;
  currentWhen: string;
  proposedWhen: string;
  proposedDoctor: string;
};

export function OfferCard({ token }: { token: string }) {
  const [info, setInfo] = React.useState<OfferInfo | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "accepted" | "declined" | "error" | "closed">("loading");
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    fetch(`/api/offers/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("This offer link is invalid.");
        const data: OfferInfo = await r.json();
        setInfo(data);
        if (data.status === "ACCEPTED") setState("accepted");
        else if (data.expired || !["PENDING", "SENT"].includes(data.status)) setState("closed");
        else setState("ready");
      })
      .catch((e) => {
        setError(e.message);
        setState("error");
      });
  }, [token]);

  async function respond(action: "accept" | "decline") {
    setState("loading");
    const res = await fetch(`/api/offers/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.message ?? "This offer is no longer available.");
      setState("error");
      return;
    }
    setState(action === "accept" ? "accepted" : "declined");
  }

  return (
    <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-teal-700">
        <HeartPulse className="size-5" />
        <span className="text-sm font-semibold">Clinic appointment offer</span>
      </div>

      {state === "loading" && <p className="py-8 text-center text-sm text-neutral-500">Loading…</p>}

      {state === "error" && (
        <p className="py-6 text-center text-sm text-red-600">{error}</p>
      )}

      {state === "closed" && info && (
        <p className="py-6 text-center text-sm text-neutral-600">
          This offer has expired or was already handled. Your appointment on{" "}
          <span className="font-medium">{info.currentWhen}</span> stays unchanged.
        </p>
      )}

      {state === "ready" && info && (
        <>
          <p className="text-sm text-neutral-700">
            Hello {info.patientFirstName}! An earlier slot opened up for your{" "}
            <span className="font-medium">{info.service}</span> at {info.clinic}.
          </p>
          <div className="my-5 space-y-2 rounded-xl bg-neutral-50 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Current</span>
              <span>{info.currentWhen}</span>
            </div>
            <div className="flex items-center justify-center text-teal-600">
              <ArrowRight className="size-4 rotate-90" />
            </div>
            <div className="flex items-center justify-between font-medium">
              <span className="text-neutral-500">New</span>
              <span className="text-teal-700">{info.proposedWhen}</span>
            </div>
            {info.proposedDoctor && (
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>Doctor</span>
                <span>{info.proposedDoctor}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => respond("accept")}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
            >
              <CalendarCheck2 className="size-4" /> Move my appointment
            </button>
            <button
              onClick={() => respond("decline")}
              className="rounded-xl border px-4 py-2.5 text-sm text-neutral-600 hover:bg-neutral-50"
            >
              Keep current
            </button>
          </div>
        </>
      )}

      {state === "accepted" && (
        <div className="py-6 text-center">
          <CircleCheck className="mx-auto mb-3 size-10 text-teal-600" />
          <p className="font-medium">Your appointment has been moved.</p>
          <p className="mt-1 text-sm text-neutral-500">
            {info ? `See you on ${info.proposedWhen}.` : ""} You&apos;ll receive a confirmation shortly.
          </p>
        </div>
      )}

      {state === "declined" && (
        <div className="py-6 text-center">
          <CircleX className="mx-auto mb-3 size-10 text-neutral-400" />
          <p className="font-medium">No changes made.</p>
          <p className="mt-1 text-sm text-neutral-500">
            Your original appointment {info ? `on ${info.currentWhen}` : ""} stays as planned.
          </p>
        </div>
      )}
    </div>
  );
}
