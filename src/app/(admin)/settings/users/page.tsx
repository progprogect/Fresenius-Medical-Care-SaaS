import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { UsersTable } from "./ui";
import { fmtClinic } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const users = await db.user.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Users"
        description="Staff accounts for this admin panel — admins can invite and remove users"
      />
      <Card>
        <CardContent className="pt-0">
          <UsersTable
            currentUserId={session.id}
            users={users.map((u) => ({
              id: u.id, name: u.name, email: u.email, role: u.role,
              createdAt: fmtClinic(u.createdAt, "Europe/Berlin", "d MMM yyyy"),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
