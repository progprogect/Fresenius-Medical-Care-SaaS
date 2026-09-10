import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/admin/page-header";
import { ChannelsForm } from "./ui";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
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
      <ChannelsForm twilio={twilio} backfill={backfill} widget={widget} baseUrl={baseUrl} />
    </div>
  );
}
