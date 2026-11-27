import type { Metadata } from "next";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Daftar" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const initialEmail =
    typeof params.email === "string" ? params.email.trim().slice(0, 160) : "";

  return <RegisterForm initialEmail={initialEmail} />;
}
