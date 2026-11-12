export function Brand({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const isLight = tone === "light";

  return (
    <div className="flex items-center gap-3">
      <span
        className={[
          "grid size-10 place-items-center rounded-xl border text-sm font-bold tracking-tight",
          isLight
            ? "border-white/15 bg-white/10 text-white"
            : "border-accent/20 bg-accent-soft text-accent-deep",
        ].join(" ")}
      >
        LK
      </span>
      <span className="leading-tight">
        <span
          className={[
            "block text-[15px] font-semibold tracking-tight",
            isLight ? "text-white" : "text-ink",
          ].join(" ")}
        >
          Lamar Kerja AI
        </span>
        <span
          className={[
            "block text-[11px] font-medium tracking-[0.14em] uppercase",
            isLight ? "text-white/60" : "text-ink-soft",
          ].join(" ")}
        >
          Kendali tetap di tangan Anda
        </span>
      </span>
    </div>
  );
}
