import "server-only";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export function getAdminAccess(user: Pick<User, "email">): {
  isAdmin: boolean;
  openDevMode: boolean;
} {
  if (env.ADMIN_EMAILS.length === 0) {
    return { isAdmin: true, openDevMode: true };
  }
  const email = user.email?.trim().toLowerCase() ?? "";
  return {
    isAdmin: email !== "" && env.ADMIN_EMAILS.includes(email),
    openDevMode: false,
  };
}
