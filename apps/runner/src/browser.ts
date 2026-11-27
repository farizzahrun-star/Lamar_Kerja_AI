import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

export interface GuestBrowserSession {
  page: Page;
  close: () => Promise<void>;
}

/**
 * Membuka satu browser Playwright dengan profil guest (`profile-guest`) dan
 * satu tab aktif sekuensial — tanpa sesi akun pribadi.
 */
export async function openGuestBrowserSession(params: {
  browserProfilesDir: string;
  headless: boolean;
}): Promise<GuestBrowserSession> {
  const guestDir = path.resolve(params.browserProfilesDir, "profile-guest");
  await mkdir(guestDir, { recursive: true });

  const context: BrowserContext = await chromium.launchPersistentContext(guestDir, {
    headless: params.headless,
    viewport: { width: 1280, height: 800 },
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
  });

  const existingPages = context.pages();
  const page = existingPages[0] ?? (await context.newPage());

  return {
    page,
    close: () => context.close(),
  };
}
