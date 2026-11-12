import type { Metadata } from "next";

import { safeNextPath } from "@/lib/safe-redirect";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  return <LoginForm nextPath={safeNextPath(params.next)} />;
}
