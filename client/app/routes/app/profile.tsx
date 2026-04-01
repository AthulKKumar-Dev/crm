import { useState } from "react";
import {
  Camera,
  Mail,
  Phone,
  MapPin,
  Globe,
  AtSign,
  Briefcase,
  GitBranch,
  Edit2,
  Check,
  ShoppingCart,
  Users,
  TrendingUp,
  Package,
} from "lucide-react";
import { useAuthStore } from "~/stores/auth.store";

export function meta() {
  return [{ title: "Profile | Collabo CRM" }];
}

/* ─── Static data ──────────────────────────────────────────────── */

/** Recent user actions displayed in the activity feed. */
const ACTIVITY_FEED = [
  { id: 1, action: "Created a new order", detail: "#302015 — MacBook Pro M4", time: "2 hours ago" },
  { id: 2, action: "Added a new customer", detail: "Jessica Thompson", time: "5 hours ago" },
  { id: 3, action: "Updated product listing", detail: "Sony WH-1000XM5 Headphones", time: "Yesterday at 3:42 PM" },
  { id: 4, action: "Exported CSV report", detail: "Orders — Jan 2026", time: "Yesterday at 11:00 AM" },
  { id: 5, action: "Changed order status", detail: "#302012 → Completed", time: "2 days ago" },
  { id: 6, action: "Invited a team member", detail: "michael@collabo.io", time: "3 days ago" },
];

/** Summary statistics shown on the profile sidebar. */
const PROFILE_STATS = [
  { label: "Orders Managed", value: "1,284", icon: ShoppingCart },
  { label: "Customers Added", value: "342", icon: Users },
  { label: "Revenue Tracked", value: "$96.7k", icon: TrendingUp },
  { label: "Products Listed", value: "128", icon: Package },
];

/** Social media links displayed on the profile sidebar. */
const SOCIAL_LINKS = [
  { icon: AtSign,    label: "Twitter",  handle: "@collabosteve" },
  { icon: Briefcase, label: "LinkedIn", handle: "linkedin.com/in/steverogers" },
  { icon: GitBranch, label: "GitHub",   handle: "github.com/steverogers" },
  { icon: Globe,    label: "Website",  handle: "steverogers.io" },
];

/**
 * Profile page — displays and allows editing of user personal information,
 * avatar, social links, activity stats, and recent activity feed.
 */
export default function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const [isEditing, setIsEditing] = useState(false);

  /* ── Derived user fields with fallback defaults ────────────────── */
  const firstName = user?.firstName ?? "Steve";
  const lastName  = user?.lastName  ?? "Rogers";
  const email     = user?.email     ?? "steve.rogers@collabo.io";
  const initials  = `${firstName[0]}${lastName[0]}`.toUpperCase();

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Profile</h1>
          <p className="text-sm text-muted-foreground">
            Manage your personal information and account preferences.
          </p>
        </div>
        <button
          onClick={() => setIsEditing((prev) => !prev)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-3 text-xs font-medium text-gray-900 shadow-sm hover:bg-[#b8e87a] transition-colors"
        >
          {isEditing ? <Check className="size-3.5" /> : <Edit2 className="size-3.5" />}
          {isEditing ? "Save Changes" : "Edit Profile"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* ── Left column — avatar card, stats, and social links ── */}
        <div className="flex flex-col gap-4">

          {/* Avatar card */}
          <div className="rounded-xl bg-white dark:bg-gray-900 p-6 shadow-sm ring-1 ring-border text-center">
            <div className="relative mx-auto mb-4 size-20 w-fit">
              <div className="flex size-20 items-center justify-center rounded-full bg-[#cdff8c] text-2xl font-bold text-gray-900">
                {initials}
              </div>
              {isEditing && (
                <button className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-gray-900 text-white shadow hover:bg-gray-700 transition-colors">
                  <Camera className="size-3.5" />
                </button>
              )}
            </div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{firstName} {lastName}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Super Admin</p>
            <span className="mt-2 inline-flex items-center rounded-full bg-[#cdff8c]/30 px-2.5 py-0.5 text-xs font-semibold text-[#4d7a00]">
              Active
            </span>
            <div className="mt-4 border-t pt-4 text-left space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="size-3.5 shrink-0" />
                <span className="truncate">{email}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Phone className="size-3.5 shrink-0" />
                <span>+1 (555) 012-3456</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" />
                <span>New York, United States</span>
              </div>
            </div>
          </div>

          {/* Activity stats grid */}
          <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
            <p className="mb-3 text-xs font-semibold text-gray-900 dark:text-gray-100">Activity Stats</p>
            <div className="grid grid-cols-2 gap-3">
              {PROFILE_STATS.map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-lg bg-[#f1f7fa] dark:bg-gray-800/60 p-3">
                  <div className="mb-1 flex size-7 items-center justify-center rounded-full bg-[#cdff8c]/40">
                    <Icon className="size-3.5 text-[#4d7a00]" />
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{value}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Social links */}
          <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
            <p className="mb-3 text-xs font-semibold text-gray-900 dark:text-gray-100">Social Links</p>
            <div className="space-y-2.5">
              {SOCIAL_LINKS.map(({ icon: Icon, label, handle }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <Icon className="size-3.5 text-gray-500 dark:text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                    {isEditing ? (
                      <input
                        defaultValue={handle}
                        className="mt-0.5 h-6 w-full rounded border border-input bg-transparent px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#cdff8c]"
                      />
                    ) : (
                      <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{handle}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right column — personal details form and activity feed ── */}
        <div className="flex flex-col gap-4 lg:col-span-2">

          {/* Personal information form */}
          <div className="rounded-xl bg-white dark:bg-gray-900 p-6 shadow-sm ring-1 ring-border">
            <p className="mb-5 text-sm font-semibold text-gray-900 dark:text-gray-100">Personal Information</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { label: "First Name",    value: firstName,           col: 1 },
                { label: "Last Name",     value: lastName,            col: 1 },
                { label: "Email Address", value: email,               col: 2 },
                { label: "Phone Number",  value: "+1 (555) 012-3456", col: 1 },
                { label: "Location",      value: "New York, US",      col: 1 },
                { label: "Timezone",      value: "UTC-5 (EST)",       col: 1 },
                { label: "Language",      value: "English (US)",      col: 1 },
              ].map(({ label, value, col }) => (
                <div key={label} className={col === 2 ? "sm:col-span-2" : ""}>
                  <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">{label}</label>
                  {isEditing ? (
                    <input
                      defaultValue={value}
                      className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#cdff8c]/50"
                    />
                  ) : (
                    <div className="flex h-9 items-center rounded-lg bg-[#f1f7fa] dark:bg-gray-800/60 px-3 text-sm text-gray-900 dark:text-gray-100">
                      {value}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Bio field */}
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-gray-700">Bio</label>
              {isEditing ? (
                <textarea
                  rows={3}
                  defaultValue="Super Admin at Collabo CRM. Passionate about building great products and helping teams succeed."
                  className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#cdff8c]/50 resize-none"
                />
              ) : (
                <div className="rounded-lg bg-[#f1f7fa] dark:bg-gray-800/60 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 leading-relaxed">
                  Super Admin at Collabo CRM. Passionate about building great products and helping teams succeed.
                </div>
              )}
            </div>
          </div>

          {/* Recent activity feed */}
          <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border overflow-hidden">
            <div className="border-b px-6 py-4">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Recent Activity</p>
              <p className="text-xs text-muted-foreground">Your latest actions across the platform.</p>
            </div>
            <div className="divide-y divide-border">
              {ACTIVITY_FEED.map((activityItem) => (
                <div key={activityItem.id} className="flex items-start gap-3 px-6 py-3.5">
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#cdff8c]/25">
                    <div className="size-1.5 rounded-full bg-[#4d7a00]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{activityItem.action}</p>
                    <p className="text-xs text-muted-foreground">{activityItem.detail}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{activityItem.time}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
