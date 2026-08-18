// ---------- Pinterest v5 API helper ----------
// Docs: https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/
//
// Auth model: Authorization Code grant (per-user OAuth). Tokens are stored per
// event in the `pinterest_connections` table and are only ever touched
// server-side — API routes never return raw access/refresh tokens to the
// client.

const OAUTH_AUTHORIZE_URL = "https://www.pinterest.com/oauth/";
const OAUTH_TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";
const API_BASE = "https://api.pinterest.com/v5";

// Request both public and secret board/pin read access, since a couple's
// wedding inspiration board may be kept private.
export const PINTEREST_SCOPES = "boards:read,boards:read_secret,pins:read,pins:read_secret";

function basicAuthHeader() {
  const clientId = process.env.PINTEREST_CLIENT_ID;
  const clientSecret = process.env.PINTEREST_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Pinterest isn't configured yet (missing PINTEREST_CLIENT_ID/PINTEREST_CLIENT_SECRET).");
  }
  const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  return `Basic ${encoded}`;
}

export function buildAuthorizeUrl(redirectUri: string, state: string) {
  const clientId = process.env.PINTEREST_CLIENT_ID;
  if (!clientId) {
    throw new Error("Pinterest isn't configured yet (missing PINTEREST_CLIENT_ID).");
  }
  const url = new URL(OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", PINTEREST_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

export interface PinterestTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_token_expires_in?: number;
  scope: string;
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<PinterestTokenResponse> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pinterest token exchange failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<PinterestTokenResponse> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pinterest token refresh failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

export interface PinterestConnectionRow {
  event_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  refresh_token_expires_at: string | null;
  board_id: string | null;
  board_name: string | null;
}

// Returns a valid access token for the event's Pinterest connection,
// transparently refreshing (and persisting the refreshed tokens) if the
// current access token is expired or close to expiring.
export async function getValidAccessToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  eventId: string
): Promise<{ accessToken: string; connection: PinterestConnectionRow } | null> {
  const { data: connection } = await supabase
    .from("pinterest_connections")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();
  if (!connection) return null;

  const expiresAt = new Date(connection.token_expires_at).getTime();
  const bufferMs = 5 * 60 * 1000; // refresh 5 minutes early
  if (Date.now() < expiresAt - bufferMs) {
    return { accessToken: connection.access_token, connection };
  }

  const refreshed = await refreshAccessToken(connection.refresh_token);
  const nowMs = Date.now();
  const updated: PinterestConnectionRow = {
    ...connection,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || connection.refresh_token,
    token_expires_at: new Date(nowMs + refreshed.expires_in * 1000).toISOString(),
    refresh_token_expires_at: refreshed.refresh_token_expires_in
      ? new Date(nowMs + refreshed.refresh_token_expires_in * 1000).toISOString()
      : connection.refresh_token_expires_at,
  };
  await supabase
    .from("pinterest_connections")
    .update({
      access_token: updated.access_token,
      refresh_token: updated.refresh_token,
      token_expires_at: updated.token_expires_at,
      refresh_token_expires_at: updated.refresh_token_expires_at,
      updated_at: new Date(nowMs).toISOString(),
    })
    .eq("event_id", eventId);

  return { accessToken: updated.access_token, connection: updated };
}

export interface PinterestBoard {
  id: string;
  name: string;
  description?: string;
  pinCount?: number;
  privacy?: string;
}

export async function listBoards(accessToken: string): Promise<PinterestBoard[]> {
  const res = await fetch(`${API_BASE}/boards?page_size=100`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Couldn't list Pinterest boards (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const items: Array<Record<string, unknown>> = data.items || [];
  return items.map((b) => ({
    id: String(b.id),
    name: String(b.name ?? "Untitled board"),
    description: typeof b.description === "string" ? b.description : undefined,
    pinCount: typeof b.pin_count === "number" ? b.pin_count : undefined,
    privacy: typeof b.privacy === "string" ? b.privacy : undefined,
  }));
}

export interface PinterestPin {
  id: string;
  imageUrl: string | null;
  title?: string;
  description?: string;
}

function bestImageUrl(media: unknown): string | null {
  if (!media || typeof media !== "object") return null;
  const images = (media as Record<string, unknown>).images;
  if (!images || typeof images !== "object") return null;
  const sizes = images as Record<string, { url?: string }>;
  // Prefer a mid-size image; fall back to whatever's available.
  return sizes["600x"]?.url || sizes["400x300"]?.url || sizes["originals"]?.url || Object.values(sizes)[0]?.url || null;
}

export async function listBoardPins(accessToken: string, boardId: string, pageSize = 25): Promise<PinterestPin[]> {
  const res = await fetch(`${API_BASE}/boards/${encodeURIComponent(boardId)}/pins?page_size=${pageSize}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Couldn't list pins for that board (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const items: Array<Record<string, unknown>> = data.items || [];
  return items.map((p) => ({
    id: String(p.id),
    imageUrl: bestImageUrl(p.media),
    title: typeof p.title === "string" ? p.title : undefined,
    description: typeof p.description === "string" ? p.description : undefined,
  }));
}

export interface DownloadedImage {
  mediaType: string;
  base64: string;
}

// Downloads pin images ourselves (rather than handing raw URLs to a
// third-party AI API) since Pinterest's image CDN disallows fetch-by-url
// via robots.txt for at least one provider we call. Used by both the
// text-suggestion and mockup-image routes.
export async function downloadPinImages(pins: PinterestPin[], limit = 8): Promise<DownloadedImage[]> {
  const urls = pins.map((p) => p.imageUrl).filter((u): u is string => !!u).slice(0, limit);
  const images: DownloadedImage[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const mediaType = res.headers.get("content-type") || "image/jpeg";
      if (!mediaType.startsWith("image/")) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      images.push({ mediaType, base64: buffer.toString("base64") });
    } catch {
      // Skip pins we can't download; callers work with whatever succeeded.
    }
  }
  return images;
}
