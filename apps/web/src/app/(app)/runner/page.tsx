import type { Metadata } from "next";

import { RunnerConsole } from "@/components/runner/runner-console";
import { requireUser } from "@/lib/auth";
import { loadRunnerDashboard } from "@/lib/runner/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Status Runner" };

export default async function RunnerPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const initialData = await loadRunnerDashboard(supabase, user);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-xs font-semibold tracking-[0.18em] text-ink-soft uppercase">
          Local Runner & Sumber
        </p>
        <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink">Status runner</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Pantau kesehatan scraping guest harian, kelola token Local Runner perangkat Anda, dan
          aktifkan atau jeda sumber lowongan lewat kill switch.
        </p>
      </header>

      <RunnerConsole initialData={initialData} />
    </div>
  );
}
