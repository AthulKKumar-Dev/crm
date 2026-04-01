import { useState } from "react";
import {
  Building2,
  Lock,
  Bell,
  CreditCard,
  Palette,
  Users,
  Shield,
  Smartphone,
  Check,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { cn } from "~/lib/utils";

export function meta() {
  return [{ title: "Settings | Collabo CRM" }];
}

// ── Sidebar tabs ─────────────────────────────────────────────────────────────

const TABS = [
  { id: "general",       label: "General",       icon: Building2 },
  { id: "security",      label: "Security",      icon: Lock },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "members",       label: "Team Members",  icon: Users },
  { id: "billing",       label: "Billing & Plan",icon: CreditCard },
  { id: "appearance",    label: "Appearance",    icon: Palette },
];

// ── Toggle component ──────────────────────────────────────────────────────────

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
        enabled ? "bg-[#cdff8c]" : "bg-gray-200"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200",
          enabled ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-border">
      <div className="mb-5 border-b pb-4">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

// ── Field row ─────────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:items-start">
      <div>
        <p className="text-xs font-medium text-gray-700">{label}</p>
        {hint && <p className="mt-0.5 text-[10px] text-muted-foreground leading-snug">{hint}</p>}
      </div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

function FieldInput({ defaultValue, type = "text", placeholder }: { defaultValue?: string; type?: string; placeholder?: string }) {
  return (
    <input
      type={type}
      defaultValue={defaultValue}
      placeholder={placeholder}
      className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#cdff8c]/50"
    />
  );
}

function FieldSelect({ options, defaultValue }: { options: string[]; defaultValue?: string }) {
  return (
    <select
      defaultValue={defaultValue}
      className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#cdff8c]/50"
    >
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}

// ── Notification row ──────────────────────────────────────────────────────────

function NotifRow({ label, hint, email, push }: { label: string; hint: string; email: boolean; push: boolean }) {
  const [e, setE] = useState(email);
  const [p, setP] = useState(push);
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-900">{label}</p>
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      </div>
      <div className="flex items-center gap-6 shrink-0">
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Email</span>
          <Toggle enabled={e} onChange={() => setE((v) => !v)} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Push</span>
          <Toggle enabled={p} onChange={() => setP((v) => !v)} />
        </div>
      </div>
    </div>
  );
}

// ── Team member row ───────────────────────────────────────────────────────────

const MEMBERS = [
  { name: "Steve Rogers",   email: "steve@collabo.io",   role: "Owner",  initials: "SR", active: true },
  { name: "Tony Stark",     email: "tony@collabo.io",    role: "Admin",  initials: "TS", active: true },
  { name: "Natasha Romanov",email: "natasha@collabo.io", role: "Member", initials: "NR", active: true },
  { name: "Bruce Banner",   email: "bruce@collabo.io",   role: "Member", initials: "BB", active: false },
];

const AVATAR_COLORS = [
  "bg-[#cdff8c] text-gray-900",
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-orange-100 text-orange-700",
];

// ── Main component ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your workspace configuration, security, and preferences.
        </p>
      </div>

      <div className="flex gap-6 items-start">

        {/* ── Sidebar ──────────────────────────────────── */}
        <aside className="hidden w-52 shrink-0 md:block">
          <div className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-border">
            {TABS.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left",
                    isActive
                      ? "bg-[#cdff8c] text-gray-900"
                      : "text-gray-500 hover:bg-[#f1f7fa] hover:text-gray-900"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {label}
                  {isActive && <ChevronRight className="ml-auto size-3.5" />}
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── Tab bar (mobile) ─────────────────────────── */}
        <div className="flex gap-1 overflow-x-auto md:hidden">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                activeTab === id
                  ? "bg-[#cdff8c] text-gray-900"
                  : "bg-white text-gray-500 ring-1 ring-border"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Content ──────────────────────────────────── */}
        <div className="min-w-0 flex-1 space-y-4">

          {/* GENERAL */}
          {activeTab === "general" && (
            <>
              <Section title="Organization" description="Basic information about your workspace.">
                <div className="space-y-4 divide-y divide-border">
                  <Field label="Organization Name" hint="The name shown across your CRM.">
                    <FieldInput defaultValue="Collabo Digital Network" />
                  </Field>
                  <div className="pt-4">
                    <Field label="Industry" hint="Your primary business vertical.">
                      <FieldSelect options={["E-commerce", "Retail", "SaaS", "Healthcare", "Finance", "Other"]} defaultValue="E-commerce" />
                    </Field>
                  </div>
                  <div className="pt-4">
                    <Field label="Website" hint="Your company's public website.">
                      <FieldInput defaultValue="https://collabo.io" />
                    </Field>
                  </div>
                </div>
                <div className="mt-5 flex justify-end">
                  <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-4 text-xs font-medium text-gray-900 hover:bg-[#b8e87a] transition-colors">
                    <Check className="size-3.5" /> Save Changes
                  </button>
                </div>
              </Section>

              <Section title="Localization" description="Timezone, currency, and language settings.">
                <div className="space-y-4 divide-y divide-border">
                  <Field label="Timezone">
                    <FieldSelect options={["UTC-5 (Eastern Time)", "UTC-6 (Central Time)", "UTC-7 (Mountain Time)", "UTC-8 (Pacific Time)", "UTC+0 (GMT)", "UTC+1 (CET)"]} defaultValue="UTC-5 (Eastern Time)" />
                  </Field>
                  <div className="pt-4">
                    <Field label="Currency">
                      <FieldSelect options={["USD — US Dollar", "EUR — Euro", "GBP — British Pound", "CAD — Canadian Dollar", "AUD — Australian Dollar"]} defaultValue="USD — US Dollar" />
                    </Field>
                  </div>
                  <div className="pt-4">
                    <Field label="Date Format">
                      <FieldSelect options={["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]} defaultValue="MM/DD/YYYY" />
                    </Field>
                  </div>
                </div>
                <div className="mt-5 flex justify-end">
                  <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-4 text-xs font-medium text-gray-900 hover:bg-[#b8e87a] transition-colors">
                    <Check className="size-3.5" /> Save Changes
                  </button>
                </div>
              </Section>

              <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-red-100">
                <div className="flex items-start gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-100">
                    <AlertTriangle className="size-4 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">Danger Zone</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Permanently delete this workspace and all its data. This action cannot be undone.</p>
                    <button className="mt-3 inline-flex h-8 items-center rounded-lg border border-red-200 px-4 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">
                      Delete Workspace
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* SECURITY */}
          {activeTab === "security" && (
            <>
              <Section title="Change Password" description="Update your account password regularly to stay secure.">
                <div className="space-y-3">
                  <Field label="Current Password">
                    <FieldInput type="password" placeholder="••••••••" />
                  </Field>
                  <Field label="New Password" hint="Minimum 8 characters.">
                    <FieldInput type="password" placeholder="••••••••" />
                  </Field>
                  <Field label="Confirm New Password">
                    <FieldInput type="password" placeholder="••••••••" />
                  </Field>
                </div>
                <div className="mt-5 flex justify-end">
                  <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-4 text-xs font-medium text-gray-900 hover:bg-[#b8e87a] transition-colors">
                    <Check className="size-3.5" /> Update Password
                  </button>
                </div>
              </Section>

              <Section title="Two-Factor Authentication" description="Add an extra layer of security to your account.">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-[#cdff8c]/25">
                      <Smartphone className="size-5 text-[#4d7a00]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Authenticator App</p>
                      <p className="text-xs text-muted-foreground">Use Google Authenticator or similar app.</p>
                    </div>
                  </div>
                  <button className="inline-flex h-8 items-center rounded-lg border border-input bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                    Enable 2FA
                  </button>
                </div>
              </Section>

              <Section title="Active Sessions" description="Devices currently logged into your account.">
                <div className="space-y-3">
                  {[
                    { device: "Chrome on macOS", location: "New York, US", time: "Active now", current: true },
                    { device: "Safari on iPhone 15", location: "New York, US", time: "2 hours ago", current: false },
                    { device: "Firefox on Windows", location: "Brooklyn, US", time: "3 days ago", current: false },
                  ].map((s) => (
                    <div key={s.device} className="flex items-center justify-between gap-3 rounded-lg bg-[#f1f7fa] px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-full bg-white ring-1 ring-border">
                          <Shield className="size-3.5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-900">{s.device}</p>
                          <p className="text-[10px] text-muted-foreground">{s.location} · {s.time}</p>
                        </div>
                      </div>
                      {s.current ? (
                        <span className="rounded-full bg-[#cdff8c]/30 px-2 py-0.5 text-[10px] font-semibold text-[#4d7a00]">
                          This device
                        </span>
                      ) : (
                        <button className="text-[10px] font-medium text-red-500 hover:text-red-700">
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}

          {/* NOTIFICATIONS */}
          {activeTab === "notifications" && (
            <Section title="Notification Preferences" description="Choose which events trigger email or push notifications.">
              <div className="divide-y divide-border">
                <NotifRow label="New Order" hint="When a new order is placed." email={true} push={true} />
                <NotifRow label="Order Status Changed" hint="When an order moves to a new status." email={true} push={false} />
                <NotifRow label="New Customer" hint="When a new customer is added." email={false} push={true} />
                <NotifRow label="Low Stock Alert" hint="When a product falls below threshold." email={true} push={true} />
                <NotifRow label="New Message" hint="When a customer sends a message." email={true} push={true} />
                <NotifRow label="Weekly Summary" hint="A weekly digest of your CRM activity." email={true} push={false} />
                <NotifRow label="Team Updates" hint="When a team member joins or changes role." email={false} push={false} />
              </div>
              <div className="mt-5 flex justify-end">
                <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-4 text-xs font-medium text-gray-900 hover:bg-[#b8e87a] transition-colors">
                  <Check className="size-3.5" /> Save Preferences
                </button>
              </div>
            </Section>
          )}

          {/* TEAM MEMBERS */}
          {activeTab === "members" && (
            <Section title="Team Members" description="Manage who has access to your workspace.">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">{MEMBERS.length} members</p>
                <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-3 text-xs font-medium text-gray-900 hover:bg-[#b8e87a] transition-colors">
                  + Invite Member
                </button>
              </div>
              <div className="space-y-2">
                {MEMBERS.map((m, i) => (
                  <div key={m.email} className="flex items-center gap-3 rounded-lg bg-[#f1f7fa] px-4 py-3">
                    <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold", AVATAR_COLORS[i % AVATAR_COLORS.length])}>
                      {m.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-900">{m.name}</p>
                      <p className="text-[10px] text-muted-foreground">{m.email}</p>
                    </div>
                    <select
                      defaultValue={m.role}
                      className="h-7 rounded-md border border-input bg-white px-2 text-xs focus:outline-none"
                    >
                      <option>Owner</option>
                      <option>Admin</option>
                      <option>Member</option>
                      <option>Viewer</option>
                    </select>
                    <span className={cn("size-2 shrink-0 rounded-full", m.active ? "bg-[#cdff8c]" : "bg-gray-300")} />
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* BILLING */}
          {activeTab === "billing" && (
            <>
              <Section title="Current Plan" description="You are on the Pro plan.">
                <div className="flex items-center justify-between gap-4 rounded-lg bg-[#f1f7fa] p-4">
                  <div>
                    <p className="text-sm font-bold text-gray-900">Pro Plan</p>
                    <p className="text-xs text-muted-foreground">$49/month · Renews on Feb 1, 2027</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {["Unlimited orders", "5 team members", "Analytics", "Priority support"].map((f) => (
                        <span key={f} className="inline-flex items-center gap-1 rounded-full bg-[#cdff8c]/30 px-2 py-0.5 text-[10px] font-medium text-[#4d7a00]">
                          <Check className="size-2.5" /> {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button className="shrink-0 inline-flex h-8 items-center rounded-lg border border-input bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                    Upgrade
                  </button>
                </div>
              </Section>

              <Section title="Payment Method" description="Manage your billing information.">
                <div className="flex items-center justify-between gap-3 rounded-lg bg-[#f1f7fa] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-white ring-1 ring-border text-xs font-bold text-blue-700">
                      VISA
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-900">Visa ending in 4242</p>
                      <p className="text-[10px] text-muted-foreground">Expires 12/2028</p>
                    </div>
                  </div>
                  <button className="text-xs font-medium text-[#4d7a00] hover:text-[#3d6000]">
                    Update
                  </button>
                </div>
                <button className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-input px-3 text-xs text-muted-foreground hover:border-[#cdff8c] hover:text-gray-900 transition-colors">
                  + Add Payment Method
                </button>
              </Section>

              <Section title="Billing History" description="Your past invoices and receipts.">
                <div className="divide-y divide-border">
                  {[
                    { date: "Jan 1, 2026",  amount: "$49.00", status: "Paid" },
                    { date: "Dec 1, 2025",  amount: "$49.00", status: "Paid" },
                    { date: "Nov 1, 2025",  amount: "$49.00", status: "Paid" },
                  ].map((inv) => (
                    <div key={inv.date} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-xs font-medium text-gray-900">Pro Plan — {inv.date}</p>
                        <p className="text-[10px] text-muted-foreground">{inv.amount}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-[#cdff8c]/30 px-2 py-0.5 text-[10px] font-semibold text-[#4d7a00]">
                          {inv.status}
                        </span>
                        <button className="text-xs font-medium text-[#4d7a00] hover:text-[#3d6000]">Download</button>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}

          {/* APPEARANCE */}
          {activeTab === "appearance" && (
            <Section title="Appearance" description="Customize how your CRM looks and feels.">
              <div className="space-y-5">
                <Field label="Theme" hint="Choose your preferred color mode.">
                  <div className="flex gap-2">
                    {["Light", "Dark", "System"].map((t) => (
                      <button
                        key={t}
                        className={cn(
                          "flex-1 rounded-lg border py-2 text-xs font-medium transition-colors",
                          t === "Light"
                            ? "border-[#cdff8c] bg-[#cdff8c]/20 text-[#4d7a00]"
                            : "border-input bg-white text-gray-500 hover:border-gray-300"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Accent Color" hint="Used for buttons, highlights, and active states.">
                  <div className="flex items-center gap-2">
                    {["#cdff8c", "#60a5fa", "#f472b6", "#fb923c", "#a78bfa", "#34d399"].map((c) => (
                      <button
                        key={c}
                        className={cn(
                          "size-7 rounded-full ring-2 ring-offset-2 transition-all",
                          c === "#cdff8c" ? "ring-gray-900" : "ring-transparent hover:ring-gray-300"
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </Field>

                <Field label="Sidebar Layout" hint="How the navigation is displayed.">
                  <FieldSelect options={["Top navigation (current)", "Left sidebar", "Compact sidebar"]} defaultValue="Top navigation (current)" />
                </Field>

                <Field label="Font Size" hint="Base font size for the interface.">
                  <FieldSelect options={["Small (13px)", "Default (14px)", "Large (16px)"]} defaultValue="Default (14px)" />
                </Field>
              </div>
              <div className="mt-5 flex justify-end">
                <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-4 text-xs font-medium text-gray-900 hover:bg-[#b8e87a] transition-colors">
                  <Check className="size-3.5" /> Apply
                </button>
              </div>
            </Section>
          )}

        </div>
      </div>
    </div>
  );
}
