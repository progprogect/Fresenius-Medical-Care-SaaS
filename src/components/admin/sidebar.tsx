"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Building2,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  Send,
  Settings,
  Stethoscope,
  Syringe,
  Users,
  UserRound,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";

const groups = [
  {
    label: "Operations",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/appointments", label: "Appointments", icon: ClipboardList },
      { href: "/patients", label: "Patients", icon: UserRound },
      { href: "/conversations", label: "Conversations", icon: MessageSquare },
      { href: "/backfill", label: "Slot offers", icon: Send, hint: "Fill gaps from cancellations" },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/clinics", label: "Clinics", icon: Building2 },
      { href: "/doctors", label: "Doctors", icon: Stethoscope },
      { href: "/services", label: "Services", icon: Syringe },
    ],
  },
  {
    label: "Configuration",
    items: [
      { href: "/settings/agent", label: "AI agent", icon: Bot },
      { href: "/settings/channels", label: "Channels & widget", icon: Globe },
      { href: "/settings/users", label: "Users", icon: Users, adminOnly: true },
    ],
  },
];

export function AdminSidebar({ role }: { role: string }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar lg:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Stethoscope className="size-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold leading-4">Fresenius<br />Medical Care</div>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items
                .filter((i) => !("adminOnly" in i && i.adminOnly) || role === "ADMIN")
                .map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                      )}
                    >
                      <item.icon className="size-4" />
                      <span title={"hint" in item ? (item.hint as string) : undefined}>
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t px-4 py-3 text-[11px] text-muted-foreground">
        <Settings className="mr-1 inline size-3" />
        Demo environment
      </div>
    </aside>
  );
}
