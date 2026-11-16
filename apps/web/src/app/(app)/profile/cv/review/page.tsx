import type { Metadata } from "next";
import Link from "next/link";

import { CvReview } from "@/components/cv/cv-review";
import { requireUser } from "@/lib/auth";
import { loadCvReviewData } from "@/lib/cv/review-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tinjau saran AI" };

export default async function CvReviewPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const data = await loadCvReviewData(supabase, user.id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-ink-soft uppercase">
            Tinjau CV
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink">Saran hasil AI</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Periksa setiap saran sebelum masuk ke profil. Saran berasal dari teks CV Anda dan tidak
            pernah diterapkan otomatis. Terima atau tolak per field, per bagian, atau sekaligus.
          </p>
        </div>

        <Link href="/profile/cv" className="btn-secondary">
          ← Kembali ke CV
        </Link>
      </header>

      <CvReview initialData={data} />
    </div>
  );
}
