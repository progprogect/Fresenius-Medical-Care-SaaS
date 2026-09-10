import type { Metadata } from "next";
import { ChatWidget } from "@/components/widget/chat-widget";

export const metadata: Metadata = { title: "Clinic Assistant" };
export const dynamic = "force-dynamic";

export default function WidgetPage() {
  return <ChatWidget />;
}
