import { Hono } from "hono";
import { SignJWT, jwtVerify } from "jose";
import { config } from "../config.js";

const auth = new Hono();

const JWT_ALG = "HS256";
const JWT_EXPIRY = "7d";

function getJwtSecret() {
  return new TextEncoder().encode(config.jwtSecret);
}

export async function createJWT(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getJwtSecret());
}

export async function verifyJWT(
  token: string,
): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return { email: payload.email as string };
  } catch {
    return null;
  }
}

/**
 * GET /auth/google — Redirect to Google OAuth consent screen.
 */
auth.get("/auth/google", (c) => {
  if (!config.googleClientId) {
    return c.json({ error: "Google OAuth not configured" }, 500);
  }

  const redirectUri = `${config.publicUrl}/auth/callback`;
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email",
    access_type: "offline",
    prompt: "select_account",
  });

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

/**
 * GET /auth/callback — Handle Google OAuth callback.
 * Exchanges code for tokens, verifies email, sets JWT cookie.
 */
auth.get("/auth/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) {
    return c.json({ error: "Missing authorization code" }, 400);
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: `${config.publicUrl}/auth/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return c.json({ error: "Token exchange failed" }, 401);
    }

    const tokenData = (await tokenRes.json()) as { id_token?: string };
    if (!tokenData.id_token) {
      return c.json({ error: "No id_token in response" }, 401);
    }

    // Decode the ID token to get email (Google's JWT)
    const parts = tokenData.id_token.split(".");
    if (parts.length !== 3) {
      return c.json({ error: "Invalid id_token" }, 401);
    }

    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString(),
    ) as { email?: string; email_verified?: boolean };

    if (!payload.email || !payload.email_verified) {
      return c.json({ error: "Email not verified" }, 401);
    }

    // Check allowed emails
    if (
      config.allowedEmails.length > 0 &&
      !config.allowedEmails.includes(payload.email)
    ) {
      return c.json({ error: "Access denied" }, 403);
    }

    // Create JWT and set cookie
    const jwt = await createJWT(payload.email);

    c.header(
      "Set-Cookie",
      `session=${jwt}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`,
    );

    return c.redirect("/dashboard");
  } catch {
    return c.json({ error: "Authentication failed" }, 500);
  }
});

/**
 * GET /auth/me — Returns current user info from JWT cookie.
 */
auth.get("/auth/me", async (c) => {
  const cookie = c.req.header("Cookie");
  if (!cookie) {
    return c.json({ authenticated: false }, 401);
  }

  const match = cookie.match(/session=([^;]+)/);
  if (!match) {
    return c.json({ authenticated: false }, 401);
  }

  const user = await verifyJWT(match[1]);
  if (!user) {
    return c.json({ authenticated: false }, 401);
  }

  return c.json({ authenticated: true, email: user.email });
});

/**
 * GET /auth/logout — Clear session cookie.
 */
auth.get("/auth/logout", (c) => {
  c.header(
    "Set-Cookie",
    "session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax",
  );
  return c.redirect("/");
});

export { auth };
