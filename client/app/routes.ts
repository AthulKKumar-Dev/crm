import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),

  layout("routes/auth/_layout.tsx", [
    route("auth/login", "routes/auth/login.tsx"),
    route("auth/signup", "routes/auth/signup.tsx"),
    route("auth/verify-email", "routes/auth/verify-email.tsx"),
    route("auth/forgot-password", "routes/auth/forgot-password.tsx"),
    route("auth/reset-password", "routes/auth/reset-password.tsx"),
    route("auth/invite", "routes/auth/invite.tsx"),
  ]),

  layout("routes/onboarding/_layout.tsx", [
    route("onboarding/choose-plan", "routes/onboarding/choose-plan.tsx"),
    route("onboarding/account-type", "routes/onboarding/account-type.tsx"),
    route("onboarding/create-organization", "routes/onboarding/create-organization.tsx"),
    route("onboarding/invite-team", "routes/onboarding/invite-team.tsx"),
  ]),

  layout("routes/app/_layout.tsx", [
    route("dashboard", "routes/app/dashboard.tsx"),
    // Orders section. Drafts / Customers / Invoices live under /orders/* so the
    // navbar can present them as one section. Static segments outrank ":id" in
    // React Router's route ranking, so "orders/drafts" never hits "orders/:id".
    route("orders", "routes/app/orders.tsx"),
    route("orders/new", "routes/app/orders/new.tsx"),
    route("orders/drafts", "routes/app/orders/drafts.tsx"),
    route("orders/drafts/new", "routes/app/orders/drafts/new.tsx"),
    route("orders/drafts/:id", "routes/app/orders/drafts/$id.tsx"),
    route("orders/customers", "routes/app/orders/customers.tsx"),
    route("orders/invoices", "routes/app/orders/invoices.tsx"),
    route("orders/invoices/:id/print", "routes/app/orders/invoices/print.tsx"),
    route("orders/:id", "routes/app/orders/$id.tsx"),
    route("orders/:id/packing-slip", "routes/app/orders/packing-slip.tsx"),
    route("orders/:id/pick-slip", "routes/app/orders/pick-slip.tsx"),

    // Pre-move URLs. The splat also matches zero segments, so bare "/drafts"
    // redirects as well as "/drafts/<id>".
    route("drafts/*", "routes/app/legacy-redirect.tsx", { id: "legacy-drafts" }),
    route("customers/*", "routes/app/legacy-redirect.tsx", { id: "legacy-customers" }),
    route("invoices/*", "routes/app/legacy-redirect.tsx", { id: "legacy-invoices" }),
    route("inventory/*", "routes/app/legacy-redirect.tsx", { id: "legacy-inventory" }),
    route("channel/*", "routes/app/legacy-redirect.tsx", { id: "legacy-channel" }),
    // Products section. Inventory (and its ledger / warehouses / label sheets)
    // lives under /products/* so the navbar can present them as one section.
    route("products", "routes/app/products.tsx"),
    route("products/inventory", "routes/app/products/inventory.tsx"),
    route("products/inventory/ledger", "routes/app/products/inventory/ledger.tsx"),
    route("products/inventory/warehouses", "routes/app/products/inventory/warehouses.tsx"),
    // Ends in /print → the app layout renders it chrome-free (same regex as
    // packing-slip / pick-slip / invoice print).
    route("products/inventory/labels/print", "routes/app/products/inventory/labels-print.tsx"),
    route("products/:id", "routes/app/products/$id.tsx"),
    // Visual previews with no backend yet — each renders a PreviewNotice.
    route("marketing", "routes/app/marketing.tsx"),
    route("logistics", "routes/app/logistics.tsx"),
    route("conversation", "routes/app/conversation.tsx"),
    route("analytics", "routes/app/analytics.tsx"),
    route("profile", "routes/app/profile.tsx"),
    route("settings", "routes/app/settings.tsx"),
    route("settings/:tab", "routes/app/settings.tsx", { id: "settings-tab" }),
    // Super admin (Collabo team only) — guarded inside the route components.
    route("admin/users", "routes/app/admin/users.tsx"),
    route("admin/users/:userId", "routes/app/admin/user-detail.tsx"),
  ]),
] satisfies RouteConfig;
