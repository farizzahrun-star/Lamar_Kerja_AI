import { Brand } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(circle at 12% 18%, rgba(31,111,92,0.5), transparent 45%), radial-gradient(circle at 85% 70%, rgba(185,112,28,0.3), transparent 45%), linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: "auto, auto, 44px 44px, 44px 44px",
          }}
        />

        <Brand tone="light" />

        <div className="relative max-w-md">
          <p className="mb-5 text-xs font-semibold tracking-[0.2em] text-white/50 uppercase">
            Proses lamaran, bukan tebak-tebakan
          </p>
          <h1 className="font-serif text-4xl leading-[1.15] tracking-tight">
            Profil yang rapi. CV yang jujur. Lamaran yang Anda kendalikan.
          </h1>
          <ul className="mt-9 space-y-4 text-sm text-white/70">
            <li className="flex gap-3">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-soft" />
              Data hanya dari apa yang Anda isi atau setujui.
            </li>
            <li className="flex gap-3">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-soft" />
              AI lokal membantu merapikan, tidak pernah mengarang.
            </li>
            <li className="flex gap-3">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-soft" />
              Kirim hanya setelah Anda meninjau.
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-white/40">
          Internal tool · target 10 pengguna · biaya infrastruktur $0
        </p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-9 lg:hidden">
            <Brand />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
