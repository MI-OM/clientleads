"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  FolderOpen,
  LayoutDashboard,
  ListTodo,
  Mail,
  Menu,
  Megaphone,
  Plug,
  Search,
  Settings,
  Target,
  Users,
  Workflow,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/lib/auth/actions";

interface NavEntry {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Set for modules that are planned but not built yet (PRD phases). */
  milestone?: string;
}

const overviewNav: NavEntry[] = [{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboard }];

const moduleNav: NavEntry[] = [
  { title: "Contacts", href: "/dashboard/contacts", icon: Users },
  { title: "Leads", href: "/dashboard/leads", icon: Target },
  { title: "Appointments", href: "/dashboard/appointments", icon: CalendarDays },
  { title: "Calendar", href: "/dashboard/calendar", icon: CalendarDays },
  { title: "Services", href: "/dashboard/services", icon: Wrench },
  { title: "Tasks", href: "/dashboard/tasks", icon: ListTodo },
  { title: "Campaigns", href: "/dashboard/campaigns", icon: Megaphone },
  { title: "Templates", href: "/dashboard/templates", icon: Mail },
  { title: "Forms", href: "/dashboard/forms", icon: ClipboardList },
  { title: "Resources", href: "/dashboard/resources", icon: FolderOpen },
  { title: "Activities", href: "/dashboard/activities", icon: Activity },
  { title: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
];

const manageNav: NavEntry[] = [
  { title: "Availability", href: "/dashboard/availability", icon: CalendarDays },
  { title: "Automations", href: "/dashboard/automations", icon: Workflow },
  { title: "Settings", href: "/dashboard/settings", icon: Settings },
  { title: "Integrations", href: "/dashboard/integrations", icon: Plug },
  { title: "Custom fields", href: "/dashboard/settings/fields", icon: ListTodo },
];

function NavLink({ entry, active }: { entry: NavEntry; active: boolean }) {
  const Icon = entry.icon;
  return (
    <Link
      href={entry.href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {entry.title}
    </Link>
  );
}

function PlannedNavItem({ entry }: { entry: NavEntry }) {
  const Icon = entry.icon;
  return (
    <span
      title={`Planned — ${entry.milestone ?? "later milestone"}`}
      className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/70"
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">{entry.title}</span>
      <Badge variant="outline" className="text-[10px] font-normal">
        {entry.milestone}
      </Badge>
    </span>
  );
}

function SidebarContent({ orgName }: { orgName: string | null }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-4">
      <div className="flex flex-col gap-1 px-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            CL
          </span>
          ClientLeads
        </Link>
        {orgName ? <span className="truncate text-xs text-muted-foreground">{orgName}</span> : null}
      </div>

      <nav className="flex flex-1 flex-col gap-6">
        <div className="flex flex-col gap-1">
          {overviewNav.map((entry) => (
            <NavLink key={entry.href} entry={entry} active={pathname === entry.href} />
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <p className="px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Workspace
          </p>
          {moduleNav.map((entry) =>
            entry.milestone ? (
              <PlannedNavItem key={entry.title} entry={entry} />
            ) : (
              <NavLink key={entry.href} entry={entry} active={pathname === entry.href} />
            ),
          )}
        </div>

        <div className="flex flex-col gap-1">
          <p className="px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Manage
          </p>
          {manageNav.map((entry) => (
            <NavLink key={entry.href} entry={entry} active={pathname === entry.href} />
          ))}
        </div>
      </nav>

      <p className="px-3 text-xs text-muted-foreground">
        {overviewNav.length + manageNav.length + moduleNav.filter((n) => !n.milestone).length} built
        · {moduleNav.filter((n) => n.milestone).length} scheduled
      </p>
    </div>
  );
}

interface UserChip {
  name: string | null;
  email: string | null;
}

export function AppShell({
  children,
  user,
  orgName,
}: {
  children: React.ReactNode;
  user: UserChip | null;
  orgName: string | null;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r bg-card md:block">
        <SidebarContent orgName={orgName} />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 w-72 bg-card shadow-xl">
            <div className="flex justify-end p-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
              >
                <X className="size-4" />
              </Button>
            </div>
            <SidebarContent orgName={orgName} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-4" />
          </Button>

          <form
            action="/dashboard/search"
            method="GET"
            className="relative hidden max-w-md flex-1 sm:block"
          >
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              name="q"
              placeholder="Search…"
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm shadow-sm placeholder:text-muted-foreground"
            />
          </form>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Notifications" disabled>
              <Bell className="size-4" />
            </Button>

            {user ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-2 rounded-full border border-border px-2 py-1 text-sm">
                  <span className="grid size-6 place-items-center rounded-full bg-secondary text-xs font-semibold">
                    {user.name ? user.name.charAt(0).toUpperCase() : "?"}
                  </span>
                  <span className="hidden max-w-[10rem] truncate pr-1 sm:inline">
                    {user.name ?? user.email}
                  </span>
                </span>
                <form action={signOutAction}>
                  <Button variant="ghost" size="sm" type="submit">
                    Sign out
                  </Button>
                </form>
              </div>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-2 rounded-full border border-border px-2 py-1 text-sm"
              >
                <span className="grid size-6 place-items-center rounded-full bg-secondary text-xs font-semibold">
                  ?
                </span>
                <span className="hidden pr-1 sm:inline">Sign in</span>
              </Link>
            )}
          </div>
        </header>

        <main className="relative flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8" key={pathname}>
          {children}
        </main>
      </div>
    </div>
  );
}
