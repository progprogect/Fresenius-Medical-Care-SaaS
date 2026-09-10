import { redirect } from "next/navigation";
import { getSettings } from "@/lib/settings";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/admin/page-header";
import { ChannelsForm } from "./ui";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  // These settings hold the Twilio credentials, so they are admin-only.
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const [twilio, backfill, widget] = await Promise.all([
    getSettings("twilio"),
    getSettings("backfill"),
    getSettings("widget"),
  ]);
  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Channels & widget"
        description="Twilio connection, automatic earlier-slot offers and the website widget"
      />
      <ChannelsForm
        // The auth token never leaves the server: a masked input still ships
        // its value to the browser in the page payload.
        twilio={{ ...twilio, authToken: "" }}
        authTokenSet={Boolean(twilio.authToken)}
        backfill={backfill}
        widget={widget}
        baseUrl={baseUrl}
      />
    </div>
  );
}
