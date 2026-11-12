import type { NextConfig } from "next";

/**
 * `output: "standalone"` membuat Next menyalin dependency lewat symlink. Di
 * Windows itu butuh Developer Mode / hak admin, jadi build lokal gagal dengan
 * EPERM. Produksi berjalan di Linux, jadi di sana standalone aktif otomatis.
 *
 * Paksa lewat env `NEXT_OUTPUT=standalone` atau `NEXT_OUTPUT=default`.
 */
const output =
  process.env.NEXT_OUTPUT ?? (process.platform === "win32" ? "default" : "standalone");

const nextConfig: NextConfig = {
  output: output === "standalone" ? "standalone" : undefined,
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
