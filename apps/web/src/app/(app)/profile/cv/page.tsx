import type { Metadata } from "next";

export const metadata: Metadata = { title: "CV" };

export default function CvPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs font-semibold tracking-[0.18em] text-ink-soft uppercase">CV</p>
      <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink">Template & unduhan</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        Pilihan template A/B, preview, dan unduhan PDF akan hadir pada milestone M2.
      </p>
    </div>
  );
}
