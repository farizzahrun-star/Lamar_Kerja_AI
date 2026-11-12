import type { Metadata } from "next";
import Link from "next/link";

import { ResumeBuilder } from "@/components/resume/resume-builder";
import { requireUser } from "@/lib/auth";
import { loadProfileBundle, loadUserResumes } from "@/lib/profile-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "CV" };

export default async function CvPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [bundle, resumes] = await Promise.all([
    loadProfileBundle(supabase, user.id),
    loadUserResumes(supabase, user.id),
  ]);

  const counts = [
    `${bundle.educations.length} pendidikan`,
    `${bundle.experiences.length} pengalaman`,
    `${bundle.skills.length} skill`,
    `${bundle.certifications.length} sertifikasi`,
    `${bundle.languages.length} bahasa`,
  ].join(" · ");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-ink-soft uppercase">CV</p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink">Template & unduhan</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
            Render CV A4 dari profil Anda memakai Template A (fresh graduate) atau Template B
            (berpengalaman), tinjau hasilnya, lalu unduh sebagai PDF.
          </p>
        </div>

        <Link href="/profile" className="btn-secondary">
          Edit data profil →
        </Link>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-white px-5 py-3.5 text-sm">
        <span className="font-semibold text-ink">
          {bundle.profile.full_name || user.email || "Kandidat"}
        </span>
        <span className="text-xs text-ink-soft">{counts}</span>
      </div>

      <ResumeBuilder initialResumes={resumes} />
    </div>
  );
}
