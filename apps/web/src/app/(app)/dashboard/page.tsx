import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

const STEPS = [
  {
    label: "Lengkapi profil",
    description: "Identitas, pendidikan, pengalaman, dan skill.",
    phase: "M1",
    href: "/onboarding",
    cta: "Buka wizard →",
  },
  {
    label: "Buat CV PDF",
    description: "Pilih template A atau B, tinjau, lalu unduh.",
    phase: "M2",
    href: "/profile/cv",
    cta: "Kelola CV →",
  },
  {
    label: "Impor CV lama",
    description: "Ekstraksi otomatis dengan persetujuan eksplisit.",
    phase: "M3",
    href: null,
    cta: null,
  },
] as const;

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, onboarding_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? "Anda";
  const isComplete = Boolean(profile?.onboarding_completed_at);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-semibold tracking-[0.18em] text-ink-soft uppercase">
        Dashboard
      </p>
      <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink">
        Selamat datang, {firstName}.
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">
        Lengkapi data diri Anda lalu render CV PDF siap kirim dari template internal.
      </p>

      <div className="mt-8 rounded-2xl border border-line bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Status profil</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {isComplete ? "Profil sudah ditandai lengkap." : "Profil belum lengkap."}
            </p>
          </div>
          <span
            className={[
              "rounded-full px-3 py-1 text-xs font-semibold",
              isComplete ? "bg-accent-soft text-accent-deep" : "bg-amber/10 text-amber",
            ].join(" ")}
          >
            {isComplete ? "Lengkap" : "Perlu dilengkapi"}
          </span>
        </div>

        <ol className="mt-6 space-y-3">
          {STEPS.map((step, index) => (
            <li
              key={step.label}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/70 bg-paper px-4 py-3"
            >
              <span className="flex items-start gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-line bg-white text-[11px] font-semibold text-ink-soft">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{step.label}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold tracking-wide text-ink-soft uppercase">
                      {step.phase}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-soft">{step.description}</span>
                </span>
              </span>

              {step.href ? (
                <Link href={step.href} className="btn-ghost">
                  {step.cta}
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
