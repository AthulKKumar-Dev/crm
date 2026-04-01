import { useState } from "react";
import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import {
  Building2, Lock, Bell, CreditCard, Palette, Users, Shield, Smartphone,
  Check, ChevronRight, AlertTriangle, Loader2, Plus, X, Mail, Trash2,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";
import { useAuthStore } from "~/stores/auth.store";
import { useCurrentOrg, useOrgMembers, useOrgInvites } from "~/hooks/use-org-queries";
import {
  useUpdateOrganizationMutation,
  useDeleteOrganizationMutation,
  useUpdateMemberRoleMutation,
  useRemoveMemberMutation,
  useSendInviteMutation,
  useRevokeInviteMutation,
} from "~/hooks/use-org-mutations";
import { userService } from "~/services/user.service";
import type { UserRole } from "~/types/api";

export function meta() {
  return [{ title: "Settings | Collabo CRM" }];
}

// ── Sidebar tabs ─────────────────────────────────────────────────────────────

const TABS = [
  { id: "general",       label: "General",        icon: Building2 },
  { id: "security",      label: "Security",        icon: Lock },
  { id: "notifications", label: "Notifications",   icon: Bell },
  { id: "members",       label: "Team Members",    icon: Users },
  { id: "billing",       label: "Billing & Plan",  icon: CreditCard },
  { id: "appearance",    label: "Appearance",       icon: Palette },
];

const INDUSTRIES = [
  "Retail", "E-commerce", "Fashion", "Electronics", "Food & Beverage",
  "Health & Beauty", "Home & Garden", "Sports & Outdoors", "Technology",
  "Education", "Finance", "Healthcare", "Real Estate", "Travel & Hospitality", "Other",
];

const TIMEZONES = [
  { label: "UTC", value: "UTC" },
  { label: "America/New_York (EST)", value: "America/New_York" },
  { label: "America/Chicago (CST)", value: "America/Chicago" },
  { label: "America/Los_Angeles (PST)", value: "America/Los_Angeles" },
  { label: "Europe/London (GMT)", value: "Europe/London" },
  { label: "Europe/Paris (CET)", value: "Europe/Paris" },
  { label: "Asia/Kolkata (IST)", value: "Asia/Kolkata" },
  { label: "Asia/Tokyo (JST)", value: "Asia/Tokyo" },
  { label: "Asia/Dubai (GST)", value: "Asia/Dubai" },
  { label: "Australia/Sydney (AEST)", value: "Australia/Sydney" },
];

const CURRENCIES = [
  { label: "USD — US Dollar", value: "USD" },
  { label: "EUR — Euro", value: "EUR" },
  { label: "GBP — British Pound", value: "GBP" },
  { label: "INR — Indian Rupee", value: "INR" },
  { label: "JPY — Japanese Yen", value: "JPY" },
  { label: "CAD — Canadian Dollar", value: "CAD" },
  { label: "AUD — Australian Dollar", value: "AUD" },
  { label: "NGN — Nigerian Naira", value: "NGN" },
  { label: "AED — UAE Dirham", value: "AED" },
];

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "ADMIN",   label: "Admin" },
  { value: "MANAGER", label: "Manager" },
  { value: "AGENT",   label: "Agent" },
  { value: "VIEWER",  label: "Viewer" },
];

const AVATAR_COLORS = [
  "bg-[#cdff8c] text-gray-900",
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-cyan-100 text-cyan-700",
];

// ── Reusable components ──────────────────────────────────────────────────────

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
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

// ── Password schema ──────────────────────────────────────────────────────────

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Required"),
  newPassword: z.string().min(8, "Min. 8 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords do not match", path: ["confirmPassword"],
});
type PasswordForm = z.infer<typeof passwordSchema>;

// ── Invite dialog inline ─────────────────────────────────────────────────────

function InviteForm({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("AGENT");
  const sendInvite = useSendInviteMutation(orgId);

  function handleSend() {
    if (!email.trim()) return;
    sendInvite.mutate({ email: email.trim(), role }, {
      onSuccess: () => { setEmail(""); onDone(); },
    });
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-[#cdff8c] bg-[#cdff8c]/5 p-3">
      <div className="relative flex-1">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-gray-400" />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@company.com"
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-xs text-gray-900 placeholder:text-gray-400 shadow-sm outline-none focus:border-[#cdff8c] focus:ring-2 focus:ring-[#cdff8c]/40"
        />
      </div>
      <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
        <SelectTrigger className="w-[110px] h-9 shrink-0 border-gray-200 bg-white text-xs shadow-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((r) => (
            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        type="button"
        onClick={handleSend}
        disabled={sendInvite.isPending || !email.trim()}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-3 text-xs font-medium text-gray-900 hover:bg-[#b8e87a] transition-colors disabled:opacity-50"
      >
        {sendInvite.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Send"}
      </button>
      <button type="button" onClick={onDone} className="text-gray-400 hover:text-gray-600">
        <X className="size-4" />
      </button>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("general");
  const [showInvite, setShowInvite] = useState(false);

  const authUser = useAuthStore((s) => s.user);
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const logout = useAuthStore((s) => s.logout);

  // Org data
  const { data: org, isLoading: orgLoading } = useCurrentOrg();
  const { data: members, isLoading: membersLoading } = useOrgMembers(currentOrgId);
  const { data: invites } = useOrgInvites(currentOrgId);

  // Mutations
  const updateOrg = useUpdateOrganizationMutation(currentOrgId ?? "");
  const deleteOrg = useDeleteOrganizationMutation();
  const updateRole = useUpdateMemberRoleMutation(currentOrgId ?? "");
  const removeMember = useRemoveMemberMutation(currentOrgId ?? "");
  const revokeInvite = useRevokeInviteMutation(currentOrgId ?? "");

  // General form state
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgWebsite, setOrgWebsite] = useState<string | null>(null);
  const [orgIndustry, setOrgIndustry] = useState<string | null>(null);
  const [orgTimezone, setOrgTimezone] = useState<string | null>(null);
  const [orgCurrency, setOrgCurrency] = useState<string | null>(null);

  const displayName = orgName ?? org?.name ?? "";
  const displayWebsite = orgWebsite ?? org?.website ?? "";
  const displayIndustry = orgIndustry ?? org?.industry ?? "";
  const displayTimezone = orgTimezone ?? org?.timezone ?? "UTC";
  const displayCurrency = orgCurrency ?? org?.currency ?? "USD";

  function handleSaveGeneral() {
    updateOrg.mutate({
      name: orgName ?? org?.name,
      website: orgWebsite ?? org?.website ?? undefined,
      industry: orgIndustry ?? org?.industry ?? undefined,
    });
  }

  function handleSaveLocalization() {
    updateOrg.mutate({
      timezone: orgTimezone ?? org?.timezone,
      currency: orgCurrency ?? org?.currency,
    });
  }

  function handleDeleteOrg() {
    if (!currentOrgId) return;
    if (!window.confirm("Are you sure? This will permanently delete this workspace and all its data.")) return;
    deleteOrg.mutate(currentOrgId);
  }

  // Password form
  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const changePassword = useMutation({
    mutationFn: (data: PasswordForm) =>
      userService.changePassword({ currentPassword: data.currentPassword, newPassword: data.newPassword }),
    onSuccess: () => {
      toast.success("Password changed. All other sessions revoked.");
      passwordForm.reset();
    },
    onError: (error) => {
      if (isAxiosError(error)) {
        toast.error(error.response?.data?.message || "Failed to change password.");
      } else {
        toast.error("Something went wrong.");
      }
    },
  });

  // Delete account
  const deleteAccount = useMutation({
    mutationFn: () => userService.deleteAccount(),
    onSuccess: () => {
      toast.success("Account deleted.");
      logout();
      navigate("/auth/login");
    },
    onError: () => toast.error("Failed to delete account."),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your workspace configuration, security, and preferences.
        </p>
      </div>

      <div className="flex gap-6 items-start">
        {/* Sidebar */}
        <aside className="hidden w-52 shrink-0 md:block">
          <div className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-border">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left",
                  activeTab === id
                    ? "bg-[#cdff8c] text-gray-900"
                    : "text-gray-500 hover:bg-[#f1f7fa] hover:text-gray-900"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
                {activeTab === id && <ChevronRight className="ml-auto size-3.5" />}
              </button>
            ))}
          </div>
        </aside>

        {/* Mobile tabs */}
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

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-4">

          {/* ─── GENERAL ─── */}
          {activeTab === "general" && (
            <>
              <Section title="Organization" description="Basic information about your workspace.">
                {orgLoading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
                    <Loader2 className="size-4 animate-spin" /> Loading…
                  </div>
                ) : (
                  <>
                    <div className="space-y-4 divide-y divide-border">
                      <Field label="Organization Name" hint="The name shown across your CRM.">
                        <input
                          value={displayName}
                          onChange={(e) => setOrgName(e.target.value)}
                          className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#cdff8c]/50"
                        />
                      </Field>
                      <div className="pt-4">
                        <Field label="Industry" hint="Your primary business vertical.">
                          <Select value={displayIndustry || undefined} onValueChange={setOrgIndustry}>
                            <SelectTrigger className="w-full h-9 border-input bg-transparent">
                              <SelectValue placeholder="Select industry" />
                            </SelectTrigger>
                            <SelectContent>
                              {INDUSTRIES.map((i) => (
                                <SelectItem key={i} value={i}>{i}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>
                      <div className="pt-4">
                        <Field label="Website" hint="Your company's public website.">
                          <input
                            value={displayWebsite}
                            onChange={(e) => setOrgWebsite(e.target.value)}
                            placeholder="https://yourstore.com"
                            className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#cdff8c]/50"
                          />
                        </Field>
                      </div>
                      {org?.type === "ORGANIZATION" && (
                        <div className="pt-4">
                          <Field label="Workspace Type" hint="This workspace is a team organization.">
                            <span className="inline-flex rounded-full bg-[#cdff8c]/30 px-2.5 py-1 text-xs font-semibold text-[#4d7a00]">
                              Organization
                            </span>
                          </Field>
                        </div>
                      )}
                      {org?.type === "PERSONAL" && (
                        <div className="pt-4">
                          <Field label="Workspace Type" hint="This is your personal workspace.">
                            <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                              Personal
                            </span>
                          </Field>
                        </div>
                      )}
                    </div>
                    <div className="mt-5 flex justify-end">
                      <button
                        onClick={handleSaveGeneral}
                        disabled={updateOrg.isPending}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-4 text-xs font-medium text-gray-900 hover:bg-[#b8e87a] transition-colors disabled:opacity-50"
                      >
                        {updateOrg.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                        Save Changes
                      </button>
                    </div>
                  </>
                )}
              </Section>

              <Section title="Localization" description="Timezone, currency, and regional settings.">
                <div className="space-y-4 divide-y divide-border">
                  <Field label="Timezone">
                    <Select value={displayTimezone} onValueChange={setOrgTimezone}>
                      <SelectTrigger className="w-full h-9 border-input bg-transparent">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="pt-4">
                    <Field label="Currency">
                      <Select value={displayCurrency} onValueChange={setOrgCurrency}>
                        <SelectTrigger className="w-full h-9 border-input bg-transparent">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </div>
                <div className="mt-5 flex justify-end">
                  <button
                    onClick={handleSaveLocalization}
                    disabled={updateOrg.isPending}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-4 text-xs font-medium text-gray-900 hover:bg-[#b8e87a] transition-colors disabled:opacity-50"
                  >
                    {updateOrg.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                    Save Changes
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
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Permanently delete this workspace and all its data. This action cannot be undone.
                    </p>
                    <button
                      onClick={handleDeleteOrg}
                      disabled={deleteOrg.isPending}
                      className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 px-4 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {deleteOrg.isPending && <Loader2 className="size-3.5 animate-spin" />}
                      Delete Workspace
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ─── SECURITY ─── */}
          {activeTab === "security" && (
            <>
              <Section title="Change Password" description="Update your account password regularly.">
                <form onSubmit={passwordForm.handleSubmit((d) => changePassword.mutate(d))} className="space-y-3">
                  <Field label="Current Password">
                    <input
                      type="password"
                      placeholder="••••••••"
                      {...passwordForm.register("currentPassword")}
                      className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#cdff8c]/50"
                    />
                    {passwordForm.formState.errors.currentPassword && (
                      <p className="mt-1 text-xs text-red-500">{passwordForm.formState.errors.currentPassword.message}</p>
                    )}
                  </Field>
                  <Field label="New Password" hint="Minimum 8 characters.">
                    <input
                      type="password"
                      placeholder="••••••••"
                      {...passwordForm.register("newPassword")}
                      className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#cdff8c]/50"
                    />
                    {passwordForm.formState.errors.newPassword && (
                      <p className="mt-1 text-xs text-red-500">{passwordForm.formState.errors.newPassword.message}</p>
                    )}
                  </Field>
                  <Field label="Confirm New Password">
                    <input
                      type="password"
                      placeholder="••••••••"
                      {...passwordForm.register("confirmPassword")}
                      className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#cdff8c]/50"
                    />
                    {passwordForm.formState.errors.confirmPassword && (
                      <p className="mt-1 text-xs text-red-500">{passwordForm.formState.errors.confirmPassword.message}</p>
                    )}
                  </Field>
                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={changePassword.isPending}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-4 text-xs font-medium text-gray-900 hover:bg-[#b8e87a] transition-colors disabled:opacity-50"
                    >
                      {changePassword.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                      Update Password
                    </button>
                  </div>
                </form>
              </Section>

              <Section title="Two-Factor Authentication" description="Add an extra layer of security.">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-[#cdff8c]/25">
                      <Smartphone className="size-5 text-[#4d7a00]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Authenticator App</p>
                      <p className="text-xs text-muted-foreground">
                        {authUser?.twoFactorEnabled ? "Two-factor is enabled." : "Use Google Authenticator or similar app."}
                      </p>
                    </div>
                  </div>
                  <button className="inline-flex h-8 items-center rounded-lg border border-input bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                    {authUser?.twoFactorEnabled ? "Disable 2FA" : "Enable 2FA"}
                  </button>
                </div>
              </Section>

              <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-red-100">
                <div className="flex items-start gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-100">
                    <AlertTriangle className="size-4 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">Delete Account</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Permanently delete your account. This cannot be undone.
                    </p>
                    <button
                      onClick={() => {
                        if (window.confirm("Are you sure you want to delete your account? This cannot be undone.")) {
                          deleteAccount.mutate();
                        }
                      }}
                      disabled={deleteAccount.isPending}
                      className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 px-4 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {deleteAccount.isPending && <Loader2 className="size-3.5 animate-spin" />}
                      Delete My Account
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ─── NOTIFICATIONS ─── */}
          {activeTab === "notifications" && (
            <Section title="Notification Preferences" description="Choose which events trigger email or push notifications.">
              <div className="divide-y divide-border">
                <NotifRow label="New Order" hint="When a new order is placed." email push />
                <NotifRow label="Order Status Changed" hint="When an order moves to a new status." email push={false} />
                <NotifRow label="New Customer" hint="When a new customer is added." email={false} push />
                <NotifRow label="Low Stock Alert" hint="When a product falls below threshold." email push />
                <NotifRow label="New Message" hint="When a customer sends a message." email push />
                <NotifRow label="Weekly Summary" hint="A weekly digest of your CRM activity." email push={false} />
                <NotifRow label="Team Updates" hint="When a team member joins or changes role." email={false} push={false} />
              </div>
              <div className="mt-5 flex justify-end">
                <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-4 text-xs font-medium text-gray-900 hover:bg-[#b8e87a] transition-colors">
                  <Check className="size-3.5" /> Save Preferences
                </button>
              </div>
            </Section>
          )}

          {/* ─── TEAM MEMBERS ─── */}
          {activeTab === "members" && (
            <>
              <Section title="Team Members" description="Manage who has access to your workspace.">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {membersLoading ? "Loading…" : `${members?.length ?? 0} member${(members?.length ?? 0) !== 1 ? "s" : ""}`}
                  </p>
                  <button
                    onClick={() => setShowInvite(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-3 text-xs font-medium text-gray-900 hover:bg-[#b8e87a] transition-colors"
                  >
                    <Plus className="size-3.5" /> Invite Member
                  </button>
                </div>

                {showInvite && currentOrgId && (
                  <div className="mb-4">
                    <InviteForm orgId={currentOrgId} onDone={() => setShowInvite(false)} />
                  </div>
                )}

                {membersLoading ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-gray-400">
                    <Loader2 className="size-4 animate-spin" /> Loading members…
                  </div>
                ) : (
                  <div className="space-y-2">
                    {members?.map((m, i) => {
                      const initials = `${m.user.firstName[0]}${m.user.lastName[0]}`.toUpperCase();
                      const isOwner = m.role === "OWNER";
                      const isCurrentUser = m.user.id === authUser?.id;

                      return (
                        <div key={m.id} className="flex items-center gap-3 rounded-lg bg-[#f1f7fa] px-4 py-3">
                          <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold", AVATAR_COLORS[i % AVATAR_COLORS.length])}>
                            {initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-gray-900">
                              {m.user.firstName} {m.user.lastName}
                              {isCurrentUser && <span className="ml-1.5 text-[10px] text-gray-400">(you)</span>}
                            </p>
                            <p className="text-[10px] text-muted-foreground">{m.user.email}</p>
                          </div>

                          {isOwner ? (
                            <span className="shrink-0 rounded-full bg-[#cdff8c]/30 px-2 py-0.5 text-[10px] font-semibold text-[#4d7a00]">
                              Owner
                            </span>
                          ) : (
                            <Select
                              value={m.role}
                              onValueChange={(v) =>
                                updateRole.mutate({ memberId: m.id, data: { role: v as UserRole } })
                              }
                            >
                              <SelectTrigger className="h-7 w-[100px] shrink-0 border-input bg-white text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLE_OPTIONS.map((r) => (
                                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}

                          {!isOwner && !isCurrentUser && (
                            <button
                              onClick={() => {
                                if (window.confirm(`Remove ${m.user.firstName} from this workspace?`)) {
                                  removeMember.mutate(m.id);
                                }
                              }}
                              className="shrink-0 text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              {/* Pending invites */}
              {invites && invites.length > 0 && (
                <Section title="Pending Invitations" description="Invitations that haven't been accepted yet.">
                  <div className="space-y-2">
                    {invites.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#f1f7fa] px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex size-8 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
                            <Mail className="size-3.5" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-900">{inv.email}</p>
                            <p className="text-[10px] text-muted-foreground">
                              Invited as {inv.role.toLowerCase()} · Expires {new Date(inv.expiresAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => revokeInvite.mutate(inv.id)}
                          className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}

          {/* ─── BILLING ─── */}
          {activeTab === "billing" && (
            <>
              <Section title="Current Plan" description={`You are on the ${org?.billingPlan?.toLowerCase() ?? "free"} plan.`}>
                <div className="flex items-center justify-between gap-4 rounded-lg bg-[#f1f7fa] p-4">
                  <div>
                    <p className="text-sm font-bold text-gray-900 capitalize">
                      {org?.billingPlan ?? "Free"} Plan
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {org?.billingPlan === "FREE" ? "No charge — upgrade to unlock more features." : "Managed via Stripe."}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {["Unlimited orders", `${members?.length ?? 1} team member${(members?.length ?? 1) !== 1 ? "s" : ""}`, "Analytics", "Email support"].map((f) => (
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
                <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-input px-3 text-xs text-muted-foreground hover:border-[#cdff8c] hover:text-gray-900 transition-colors">
                  + Add Payment Method
                </button>
              </Section>
            </>
          )}

          {/* ─── APPEARANCE ─── */}
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
                  <select className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#cdff8c]/50">
                    <option>Top navigation (current)</option>
                    <option>Left sidebar</option>
                    <option>Compact sidebar</option>
                  </select>
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
