import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { isAxiosError } from "axios";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Loader2, Building2, Globe, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { orgService } from "~/services/org.service";
import { useAuthStore } from "~/stores/auth.store";
import { orgKeys } from "~/hooks/use-org-queries";

const INDUSTRIES = [
  "Retail", "E-commerce", "Fashion", "Electronics", "Food & Beverage",
  "Health & Beauty", "Home & Garden", "Sports & Outdoors", "Technology",
  "Education", "Finance", "Healthcare", "Real Estate", "Travel & Hospitality", "Other",
];

const TIMEZONES = [
  { label: "UTC (Coordinated Universal Time)", value: "UTC" },
  { label: "America/New_York (EST/EDT)", value: "America/New_York" },
  { label: "America/Chicago (CST/CDT)", value: "America/Chicago" },
  { label: "America/Los_Angeles (PST/PDT)", value: "America/Los_Angeles" },
  { label: "Europe/London (GMT/BST)", value: "Europe/London" },
  { label: "Europe/Paris (CET/CEST)", value: "Europe/Paris" },
  { label: "Asia/Kolkata (IST)", value: "Asia/Kolkata" },
  { label: "Asia/Tokyo (JST)", value: "Asia/Tokyo" },
  { label: "Asia/Dubai (GST)", value: "Asia/Dubai" },
  { label: "Australia/Sydney (AEST/AEDT)", value: "Australia/Sydney" },
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

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  industry: z.string().optional(),
  website: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
  logo: z.string().url("Please enter a valid logo URL").optional().or(z.literal("")),
  timezone: z.string().optional(),
  currency: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function meta() {
  return [{ title: "Create Organization | Collabo CRM" }];
}

export default function CreateOrganizationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setCurrentOrg = useAuthStore((s) => s.setCurrentOrg);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", industry: "", website: "", logo: "", timezone: "UTC", currency: "USD" },
  });

  const logoValue = watch("logo");

  const createOrg = useMutation({
    mutationFn: (data: FormValues) =>
      orgService.create({
        name: data.name,
        industry: data.industry || undefined,
        website: data.website || undefined,
        logo: data.logo || undefined,
        timezone: data.timezone || undefined,
        currency: data.currency || undefined,
      }),
    onSuccess: (org) => {
      queryClient.invalidateQueries({ queryKey: orgKeys.list() });
      setCurrentOrg(org.id);
      toast.success(`${org.name} created!`);
      // Navigate to invite step instead of dashboard
      navigate(`/onboarding/invite-team?orgId=${org.id}`);
    },
    onError: (error) => {
      if (isAxiosError(error)) {
        toast.error(error.response?.data?.message || "Failed to create organization.");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });

  function onSubmit(data: FormValues) {
    createOrg.mutate(data);
  }

  function handleLogoUrlBlur() {
    const url = logoValue?.trim();
    if (url && /^https?:\/\/.+/.test(url)) {
      setLogoPreview(url);
    } else {
      setLogoPreview(null);
    }
  }

  function clearLogo() {
    setValue("logo", "");
    setLogoPreview(null);
  }

  const serverError =
    createOrg.error && isAxiosError(createOrg.error)
      ? createOrg.error.response?.data?.message
      : null;

  return (
    <div>
      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className="size-2 rounded-full bg-gray-300" />
          <div className="h-px w-6 bg-gray-200" />
          <div className="size-2 rounded-full bg-[#cdff8c]" />
          <div className="h-px w-6 bg-gray-200" />
          <div className="size-2 rounded-full bg-gray-200" />
        </div>
        <span className="ml-2 text-xs text-gray-400">Step 2 of 3</span>
      </div>

      {/* Heading */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#cdff8c]/30">
          <Building2 className="size-5 text-[#4d7a00]" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Set up your organization</h2>
        <p className="mt-1.5 text-sm text-gray-500">
          Tell us about your business. You can update these details anytime.
        </p>
      </div>

      {/* Form card */}
      <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-black/[0.06]">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          {/* Logo + Org name row */}
          <div className="flex gap-4">
            {/* Logo */}
            <div className="shrink-0">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Logo</label>
              <div className="relative flex size-[72px] items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden transition hover:border-[#cdff8c]/60">
                {logoPreview ? (
                  <>
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="size-full object-cover"
                      onError={() => setLogoPreview(null)}
                    />
                    <button
                      type="button"
                      onClick={clearLogo}
                      className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-gray-900 text-white shadow-sm hover:bg-gray-700"
                    >
                      <X className="size-3" />
                    </button>
                  </>
                ) : (
                  <Upload className="size-5 text-gray-300" />
                )}
              </div>
            </div>

            {/* Name + Logo URL */}
            <div className="flex-1 space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Organization name <span className="text-red-500">*</span>
                </label>
                <input
                  id="name"
                  placeholder="Acme Store"
                  aria-invalid={!!errors.name}
                  {...register("name")}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus:border-[#cdff8c] focus:ring-2 focus:ring-[#cdff8c]/40 aria-[invalid=true]:border-red-400"
                />
                {errors.name && (
                  <p className="text-xs text-red-500">{errors.name.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="logo" className="block text-xs font-medium text-gray-500">
                  Logo URL <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="logo"
                  placeholder="https://example.com/logo.png"
                  {...register("logo")}
                  onBlur={handleLogoUrlBlur}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus:border-[#cdff8c] focus:ring-2 focus:ring-[#cdff8c]/40"
                />
                {errors.logo && (
                  <p className="text-xs text-red-500">{errors.logo.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Industry + Website */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Industry
              </label>
              <Select onValueChange={(v) => setValue("industry", v)}>
                <SelectTrigger className="w-full border-gray-200 bg-white shadow-sm focus:ring-[#cdff8c]/40">
                  <SelectValue placeholder="Select your industry" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((ind) => (
                    <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="website" className="block text-sm font-medium text-gray-700">
                Website
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                <input
                  id="website"
                  placeholder="https://yourstore.com"
                  {...register("website")}
                  className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3.5 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus:border-[#cdff8c] focus:ring-2 focus:ring-[#cdff8c]/40"
                />
              </div>
              {errors.website && (
                <p className="text-xs text-red-500">{errors.website.message}</p>
              )}
            </div>
          </div>

          {/* Timezone + Currency */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Timezone</label>
              <Select defaultValue="UTC" onValueChange={(v) => setValue("timezone", v)}>
                <SelectTrigger className="w-full border-gray-200 bg-white shadow-sm focus:ring-[#cdff8c]/40">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Currency</label>
              <Select defaultValue="USD" onValueChange={(v) => setValue("currency", v)}>
                <SelectTrigger className="w-full border-gray-200 bg-white shadow-sm focus:ring-[#cdff8c]/40">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Server error */}
          {serverError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-600">{serverError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Link
              to="/onboarding/account-type"
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="size-4" /> Back
            </Link>

            <button
              type="submit"
              disabled={createOrg.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-[#cdff8c] px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-[#b8e87a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createOrg.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating…
                </>
              ) : (
                "Continue"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
