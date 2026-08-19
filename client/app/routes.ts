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
    route("orders", "routes/app/orders.tsx"),
    route("orders/new", "routes/app/orders/new.tsx"),
    route("orders/:id", "routes/app/orders/$id.tsx"),
    route("orders/:id/packing-slip", "routes/app/orders/packing-slip.tsx"),
    route("orders/:id/pick-slip", "routes/app/orders/pick-slip.tsx"),
    route("drafts", "routes/app/drafts.tsx"),
    route("drafts/new", "routes/app/drafts/new.tsx"),
    route("drafts/:id", "routes/app/drafts/$id.tsx"),
    route("invoices/:id/print", "routes/app/invoices/print.tsx"),
    route("products", "routes/app/products.tsx"),
    route("products/:id", "routes/app/products/$id.tsx"),
    route("inventory", "routes/app/inventory.tsx"),
    route("inventory/ledger", "routes/app/inventory/ledger.tsx"),
    route("inventory/warehouses", "routes/app/inventory/warehouses.tsx"),
    // Ends in /print → the app layout renders it chrome-free (same regex as
    // packing-slip / pick-slip / invoice print).
    route("inventory/labels/print", "routes/app/inventory/labels-print.tsx"),
    route("marketing", "routes/app/marketing.tsx"),
    route("channel", "routes/app/channel.tsx"),
    route("conversation", "routes/app/conversation.tsx"),
    route("customers", "routes/app/customers.tsx"),
    route("analytics", "routes/app/analytics.tsx"),
    route("messages", "routes/app/messages.tsx"),
    route("profile", "routes/app/profile.tsx"),
    route("settings", "routes/app/settings.tsx"),
    route("invoices", "routes/app/invoices.tsx"),
    // Super admin (Collabo team only) — guarded inside the route components.
    route("admin/users", "routes/app/admin/users.tsx"),
    route("admin/users/:userId", "routes/app/admin/user-detail.tsx"),
  ]),
] satisfies RouteConfig;
