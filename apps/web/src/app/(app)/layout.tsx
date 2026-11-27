import { Brand } from "@/components/brand";
import { SidebarNav } from "@/components/nav/sidebar-nav";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { logoutAction } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const displayName = profile?.full_name || user.email || "Pengguna";
  const initial = displayName.trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="flex flex-col border-b border-line bg-white px-5 py-5 lg:min-h-dvh lg:border-r lg:border-b-0">
        <div className="mb-7">
          <Brand />
        </div>

        <SidebarNav />

        <div className="mt-6 lg:mt-auto lg:pt-6">
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-xs font-bold text-accent-deep">
              {initial}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-ink">{displayName}</span>
              <span className="block truncate text-[11px] text-ink-soft">{user.email}</span>
            </span>
          </div>

          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink"
            >
              Keluar
            </button>
          </form>
        </div>
      </aside>

      <main className="px-5 py-8 sm:px-8 lg:px-12 lg:py-10">{children}</main>
    </div>
  );
}
