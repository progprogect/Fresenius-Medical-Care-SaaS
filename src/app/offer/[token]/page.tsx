import type { Metadata } from "next";
import { OfferCard } from "./ui";

export const metadata: Metadata = { title: "Appointment Offer" };
export const dynamic = "force-dynamic";

export default async function OfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <OfferCard token={token} />
    </div>
  );
}
