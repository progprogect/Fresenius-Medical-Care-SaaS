import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/admin/page-header";
import { AgentSettingsForm } from "./ui";

export const dynamic = "force-dynamic";

export default async function AgentSettingsPage() {
  const agent = await getSettings("agent");
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="AI agent"
        description="Persona and behavior shared by the chat brain and the ElevenLabs voice agent"
      />
      <AgentSettingsForm initial={agent} />
    </div>
  );
}
