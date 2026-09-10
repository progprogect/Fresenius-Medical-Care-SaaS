import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { fmtClinic } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const patients = await db.patient.findMany({
    where: q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: {
      appointments: {
        where: { startsAt: { gte: new Date() }, status: { in: ["BOOKED", "CONFIRMED"] } },
        orderBy: { startsAt: "asc" },
        take: 1,
        include: { clinic: true, service: true },
      },
      _count: { select: { appointments: true, conversations: true } },
    },
    orderBy: { lastName: "asc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader title="Patients" description="Patient registry used by the AI for identity verification" />
      <form>
        <Input name="q" defaultValue={q} placeholder="Search name, phone or email..." className="w-72" />
      </form>
      <Card className="mt-4">
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Next visit</TableHead>
                <TableHead className="text-right">Visits</TableHead>
                <TableHead className="text-right">Conversations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link href={`/patients/${p.id}`} className="hover:underline">
                      {p.firstName} {p.lastName}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.phone}</TableCell>
                  <TableCell className="uppercase text-xs text-muted-foreground">{p.language}</TableCell>
                  <TableCell className="text-sm">
                    {p.appointments[0]
                      ? `${fmtClinic(p.appointments[0].startsAt, p.appointments[0].clinic.timezone, "d MMM HH:mm")} · ${p.appointments[0].service.name}`
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">{p._count.appointments}</TableCell>
                  <TableCell className="text-right">{p._count.conversations}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
