import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { auth, createJWT, verifyJWT } from "./auth.js";

const app = new Hono();
app.route("/", auth);

describe("JWT utilities", () => {
  it("creates and verifies a JWT", async () => {
    const token = await createJWT("test@example.com");
    expect(token).toBeTypeOf("string");
    expect(token.split(".")).toHaveLength(3);

    const result = await verifyJWT(token);
    expect(result).toEqual({ email: "test@example.com" });
  });

  it("returns null for invalid JWT", async () => {
    expect(await verifyJWT("invalid.token.here")).toBeNull();
  });

  it("returns null for empty string", async () => {
    expect(await verifyJWT("")).toBeNull();
  });
});

describe("GET /auth/google", () => {
  it("returns 500 when Google OAuth not configured", async () => {
    const res = await app.request("/auth/google");
    // googleClientId is empty in test env
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("not configured");
  });
});

describe("GET /auth/callback", () => {
  it("returns 400 when missing code", async () => {
    const res = await app.request("/auth/callback");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing authorization code");
  });
});

describe("GET /auth/me", () => {
  it("returns 401 when no cookie", async () => {
    const res = await app.request("/auth/me");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
  });

  it("returns 401 for invalid JWT cookie", async () => {
    const res = await app.request("/auth/me", {
      headers: { Cookie: "cmp_session=invalid-token" },
    });
    expect(res.status).toBe(401);
  });

  it("returns user info for valid JWT cookie", async () => {
    const token = await createJWT("user@example.com");
    const res = await app.request("/auth/me", {
      headers: { Cookie: `cmp_session=${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.email).toBe("user@example.com");
  });
});

describe("GET /auth/logout", () => {
  it("clears session cookie and redirects", async () => {
    const res = await app.request("/auth/logout", { redirect: "manual" });
    expect(res.status).toBe(302);
    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).toContain("Max-Age=0");
  });
});
