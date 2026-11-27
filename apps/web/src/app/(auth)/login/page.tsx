import type { Metadata } from "next";

import { safeNextPath } from "@/lib/safe-redirect";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const params = await searchParams;
  const initialEmail =
    typeof params.email === "string" ? params.email.trim().slice(0, 160) : "";

  return <LoginForm nextPath={safeNextPath(params.next)} initialEmail={initialEmail} />;
}
