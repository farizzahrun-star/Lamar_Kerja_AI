import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  extractAuthFieldErrors,
  mapLoginAuthError,
  mapRegisterAuthError,
} from "./auth-errors";

describe("auth-errors", () => {
  it("memetakan user_already_exists dan email_exists ke field email", () => {
    for (const sample of [
      { code: "email_exists", status: 422, message: "Email already exists" },
      {
        code: "user_already_exists",
        status: 400,
        message: "A user with this email address has already been registered",
      },
      { code: null, status: 409, message: "Conflict" },
    ]) {
      const mapped = mapRegisterAuthError(sample);
      expect(mapped.errorCode).toBe("email_exists");
      expect(mapped.fieldErrors?.email).toBeTruthy();
      expect(mapped.fieldErrors?.password).toBeUndefined();
    }
  });

  it("memetakan weak_password ke field password", () => {
    const mapped = mapRegisterAuthError({
      code: "weak_password",
      status: 422,
      message: "Password should be at least 8 characters",
    });
    expect(mapped.errorCode).toBe("weak_password");
    expect(mapped.fieldErrors?.password).toBeTruthy();
    expect(mapped.fieldErrors?.email).toBeUndefined();
  });

  it("memetakan email_address_invalid ke field email", () => {
    const mapped = mapRegisterAuthError({
      code: "email_address_invalid",
      status: 400,
      message: "Unable to validate email address",
    });
    expect(mapped.errorCode).toBe("email_invalid");
    expect(mapped.fieldErrors?.email).toBeTruthy();
  });

  it("memetakan error konfigurasi secret key server sebagai unavailable", () => {
    const mapped = mapRegisterAuthError({ code: "not_admin", status: 403 });
    expect(mapped.errorCode).toBe("unavailable");
    expect(mapped.fieldErrors).toBeUndefined();
  });

  it("memetakan error login invalid_credentials dan email_not_confirmed", () => {
    const invalid = mapLoginAuthError({ code: "invalid_credentials", status: 400 });
    expect(invalid.errorCode).toBe("invalid_credentials");
    expect(invalid.fieldErrors?.password).toBeTruthy();

    const unconfirmed = mapLoginAuthError({ code: "email_not_confirmed", status: 400 });
    expect(unconfirmed.errorCode).toBe("email_not_confirmed");
    expect(unconfirmed.fieldErrors?.email).toBeTruthy();
  });

  it("mengambil error per field dari ZodError", () => {
    const schema = z.object({
      fullName: z.string().min(2, "Nama pendek"),
      email: z.string().email("Email salah"),
      password: z.string().min(8, "Password pendek"),
    });
    const parsed = schema.safeParse({ fullName: "A", email: "x", password: "123" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(extractAuthFieldErrors(parsed.error)).toEqual({
        fullName: "Nama pendek",
        email: "Email salah",
        password: "Password pendek",
      });
    }
  });
});
