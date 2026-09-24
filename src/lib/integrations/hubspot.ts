/**
 * M8 — HubSpot OAuth + CRM contacts API client (server-only).
 *
 * Plain `fetch` against HubSpot's REST APIs — no SDK, no npm packages.
 * Env-gated by HUBSPOT_CLIENT_ID / HUBSPOT_CLIENT_SECRET (both optional;
 * the integrations page renders the connect button disabled until they
 * are set) and NEXT_PUBLIC_APP_URL for the OAuth redirect_uri.
 *
 * Token refresh is intentionally out of scope for this milestone: an
 * expired access token marks the connection "error" and the owner/admin
 * reconnects.
 */

export const HUBSPOT_MAX_PAGES = 10;
export const HUBSPOT_CONTACTS_SCOPE = "crm.objects.contacts.read";

/** Readable, user-facing HubSpot API error. */
export class HubSpotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HubSpotError";
  }
}

/** True when both OAuth env keys are present (page + actions gate on this). */
export function hubspotEnvConfigured(): boolean {
  return Boolean(process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET);
}

/** Public base URL for redirect_uris / dashboard links. */
export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

/** HubSpot OAuth authorize URL for a one-time CSRF `state`. */
export function hubspotAuthorizeUrl(state: string): string {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  if (!clientId || !process.env.HUBSPOT_CLIENT_SECRET) {
    throw new HubSpotError("HubSpot OAuth is not configured.");
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appBaseUrl()}/api/integrations/hubspot/callback`,
    scope: HUBSPOT_CONTACTS_SCOPE,
    state,
  });
  return `https://app.hubspot.com/oauth/authorize?${params.toString()}`;
}

export interface HubSpotTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

/** Exchange the OAuth `code` for tokens (authorization_code grant). */
export async function exchangeHubspotCode(code: string): Promise<HubSpotTokenResponse> {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new HubSpotError("HubSpot OAuth is not configured.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: `${appBaseUrl()}/api/integrations/hubspot/callback`,
    code,
  });

  const res = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new HubSpotError("HubSpot couldn't complete the connection (token exchange failed).");
  }
  return (await res.json()) as HubSpotTokenResponse;
}

export interface HubSpotAccountInfo {
  /** Portal id — the stable per-account identifier used as providerAccountId. */
  hubId: string;
  user: { email: string | null; firstName: string | null } | null;
  scopes: string[];
}

/** Identity of the connected HubSpot account (who authorized us). */
export async function getHubspotAccountInfo(accessToken: string): Promise<HubSpotAccountInfo> {
  const res = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${accessToken}`);
  if (!res.ok) {
    throw new HubSpotError("HubSpot couldn't verify the connected account.");
  }
  const data = (await res.json()) as {
    hub_id?: unknown;
    user?: { email?: unknown; first_name?: unknown } | null;
    scopes?: unknown;
  };
  const user = data.user;
  return {
    hubId: data.hub_id == null ? "" : String(data.hub_id),
    user:
      user && typeof user === "object"
        ? {
            email: typeof user.email === "string" ? user.email : null,
            firstName: typeof user.first_name === "string" ? user.first_name : null,
          }
        : null,
    scopes: Array.isArray(data.scopes) ? data.scopes.map(String) : [],
  };
}

/** One normalized HubSpot contact (the properties we ask for). */
export interface HubSpotContactRecord {
  id: string;
  properties: {
    email?: string;
    firstname?: string;
    lastname?: string;
    phone?: string;
    company?: string;
    createdate?: string;
  };
  createdAt?: string;
}

/**
 * Fetch CRM contacts, paginated (100/page) up to HUBSPOT_MAX_PAGES pages.
 * Throws HubSpotError on any non-2xx so the import runner can mark the
 * connection "error".
 */
export async function fetchHubspotContacts(accessToken: string): Promise<HubSpotContactRecord[]> {
  const records: HubSpotContactRecord[] = [];
  let after: string | null = null;

  for (let page = 0; page < HUBSPOT_MAX_PAGES; page++) {
    const url = new URL("https://api.hubapi.com/crm/v3/objects/contacts");
    url.searchParams.set("limit", "100");
    url.searchParams.set("properties", "email,firstname,lastname,phone,company,createdate");
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new HubSpotError(
        res.status === 401 || res.status === 403
          ? "HubSpot rejected the connection — disconnect and reconnect HubSpot to refresh its token."
          : `HubSpot returned an error while fetching contacts (${res.status}).`,
      );
    }

    const data = (await res.json()) as {
      results?: Array<{ id?: unknown; properties?: Record<string, unknown>; createdAt?: unknown }>;
      paging?: { next?: { after?: unknown } };
    };

    for (const item of data.results ?? []) {
      const props = item.properties ?? {};
      const stringProp = (key: string): string | undefined =>
        typeof props[key] === "string" ? (props[key] as string) : undefined;
      records.push({
        id: item.id == null ? "" : String(item.id),
        properties: {
          email: stringProp("email"),
          firstname: stringProp("firstname"),
          lastname: stringProp("lastname"),
          phone: stringProp("phone"),
          company: stringProp("company"),
          createdate: stringProp("createdate"),
        },
        createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
      });
    }

    const next = data.paging?.next?.after;
    after = typeof next === "string" && next !== "" ? next : null;
    if (!after) break;
  }

  return records;
}

/** Turn an unknown error into a readable message for the UI. */
export function hubspotErrorMessage(err: unknown): string {
  if (err instanceof HubSpotError) return err.message;
  return "HubSpot is temporarily unavailable. Please try again.";
}
