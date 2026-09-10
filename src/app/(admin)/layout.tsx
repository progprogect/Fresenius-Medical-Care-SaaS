import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminHeader } from "@/components/admin/header";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen bg-muted/40">
      <AdminSidebar role={session.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader userName={session.name} role={session.role} />
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
