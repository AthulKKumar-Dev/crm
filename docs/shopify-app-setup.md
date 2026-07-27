# Shopify Public App Setup

The CRM connects to Shopify stores through a **public Shopify app** (created in the
[Partner Dashboard](https://partners.shopify.com)). The merchant enters only their
store domain in the CRM's channel connection dialog; installing the app grants the
CRM a permanent **offline access token** which is encrypted and stored per channel.

There are two codebases involved:

| Codebase | Role |
|---|---|
| This repo (`server/` + `client/`) | OAuth flow, token storage, sync, webhooks — all business logic |
| The Shopify CLI (Remix) app repo | Minimal **embedded** admin UI + the `shopify.app.toml` config (scopes, webhooks, URLs) |

## 1. Partner Dashboard / `shopify.app.toml`

The TOML in the Shopify app repo is the source of truth (deployed with
`shopify app deploy`, `include_config_on_deploy = true`):

```toml
application_url = "https://<hosted-remix-app>"        # the embedded UI, NOT this API
embedded = true

[build]
automatically_update_urls_on_dev = false               # protect prod URLs from `shopify app dev`

[webhooks]
api_version = "2026-01"

  [[webhooks.subscriptions]]
  compliance_topics = [ "customers/data_request", "customers/redact", "shop/redact" ]
  uri = "https://<API_HOST>/api/v1/webhooks/shopify"

[access_scopes]
scopes = "..."                                         # must equal SHOPIFY_SCOPES env exactly

[auth]
redirect_urls = [ "https://<API_HOST>/api/v1/channels/shopify/callback" ]
```

Important:
- **Scopes**: with `include_config_on_deploy`, Shopify grants what the deployed TOML
  declares — the `scope` param in the authorize URL is informational. Keep the
  server's `SHOPIFY_SCOPES` env identical to the TOML list.
- **`read_all_orders`** (orders older than 60 days) requires separate approval from
  Shopify — request it in the Partner Dashboard if needed.
- **GraphQL only**: apps created after Shopify's REST Admin API sunset get **403 on
  every REST endpoint**. All CRM ↔ Shopify calls (shop info, webhooks, product /
  order / customer / inventory / collection sync, pushes) go through the GraphQL
  Admin API. Legacy custom-app tokens work with GraphQL too.
- **Protected customer data**: reading customer PII (the customers sync, customer
  fields on orders) requires enabling **"Protected customer data access"** for the
  app: Partner Dashboard → App → API access → Protected customer data access →
  request access for "Protected customer data" (and the name/email/phone/address
  fields). Without it, customer queries return access errors.
- **Expiring offline tokens**: public apps created on/after **April 1, 2026** must
  use expiring tokens — the CRM's token exchange sends `expiring=1` and stores an
  encrypted **1-hour access token + 90-day rotating refresh token** per channel.
  `ShopifyOAuthService.getAccessToken()` transparently refreshes before expiry
  (Redis-locked so concurrent sync workers don't race the rotating refresh token).
  Every refresh resets the 90-day clock; a store completely idle for 90+ days
  drops to DISCONNECTED and recovers via the Reconnect button. Legacy
  custom-app channels keep their non-expiring tokens (Shopify exempts them).
- Use a **separate dev app config** (`shopify.app.dev.toml` via `shopify app config link`)
  for `shopify app dev`; never run dev against the production app config.

## 2. Server environment

```bash
SHOPIFY_CLIENT_ID=...        # Partner Dashboard → app → API credentials
SHOPIFY_CLIENT_SECRET=...    # also the webhook HMAC signing key
SHOPIFY_SCOPES=...           # mirror of the TOML [access_scopes]
SHOPIFY_API_VERSION=2026-01
APP_URL=https://<API_HOST>   # must be public HTTPS (webhook + callback URLs)
FRONTEND_URL=https://<CRM_FRONTEND>
```

## 3. Install flows

**CRM-initiated** (primary): merchant enters their domain in the connect dialog →
`POST /channels/shopify/install` returns the authorize URL → browser redirect →
merchant approves → `GET /channels/shopify/callback` verifies state + HMAC,
exchanges the code, stores the encrypted token, registers webhooks, enqueues the
initial sync, and redirects to `{FRONTEND_URL}/channel?connected=shopify`.

**Shopify-initiated**: merchant installs the app from Shopify's side → lands in
the embedded Remix UI → its "Open CRM" button opens
`{FRONTEND_URL}/channel?install_shop=<domain>` in a new tab → the CRM's connect
dialog auto-opens pre-filled → same flow as above (Shopify auto-approves silently
since the app is already installed with identical scopes).

**Reconnect**: if the merchant uninstalls the app (or the token dies), the
`app/uninstalled` webhook — plus an `AUTH_FAILED` catch in the sync worker — flips
the channel to `DISCONNECTED`; the channels page then shows a **Reconnect** button
which re-runs the install and updates the existing channel row.

**Legacy custom-app connect**: still available behind the dialog's
"Advanced" toggle (`POST /channels/shopify/manual-connect`). Channels connected
this way keep a per-merchant `apiSecret` in credentials, which the webhook
controller accepts as an HMAC fallback.

## 4. Webhooks

- Endpoint: `POST /api/v1/webhooks/shopify` (public, raw-body HMAC verified).
- Verification order: app-level `SHOPIFY_CLIENT_SECRET` first, then the channel's
  legacy `apiSecret` (custom-app installs). Invalid HMAC → **401** (a Shopify
  app-review requirement).
- Sync topics (products/orders/customers/inventory/drafts/carts/checkouts +
  `app/uninstalled`) are registered per-store via the Admin API after connect.
- GDPR compliance topics are **not** API-registered — they come from the TOML and
  all point at the same endpoint:
  - `customers/data_request` → logged for operational follow-up (30-day deadline)
  - `customers/redact` → anonymizes that customer's PII
  - `shop/redact` (~48h after uninstall) → anonymizes all customer PII from that
    shop; orders/products are retained as non-personal business records

## 5. Local testing

1. Run an HTTPS tunnel to the API: `ngrok http 5000` → set `APP_URL=https://<tunnel>`.
2. Add `https://<tunnel>/api/v1/channels/shopify/callback` to the **dev** app's
   redirect allowlist, and use the dev app's client ID/secret in env.
3. Use a Partner development store; connect via the dialog with all three domain
   input forms (`my-store`, `my-store.myshopify.com`, full URL).
4. Verify: webhooks registered (incl. `app/uninstalled`), forged-HMAC POST → 401,
   uninstall from the store admin → channel DISCONNECTED → Reconnect works and
   updates (not duplicates) the channel row.
5. Send the Partner Dashboard's test compliance webhooks and confirm 200s.
