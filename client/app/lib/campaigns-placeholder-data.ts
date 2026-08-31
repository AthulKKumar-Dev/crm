import type { StatCardData } from "~/lib/placeholder-data";

/**
 * Sample data for the Campaigns section.
 *
 * A sibling of `placeholder-data.ts` rather than an append to it: that file is
 * already a grab bag serving four unrelated preview routes, and keeping this
 * feature's samples in one place makes the eventual deletion a single `rm` once
 * a real campaigns API lands.
 *
 * Every shape here mirrors something that already exists server-side, so wiring
 * a backend later is a type swap rather than a redesign:
 *   - `WhatsAppMessageLogSample`  the `WhatsAppMessageLog` Prisma model
 *   - `WhatsAppTemplate`          the `template` object `sendTemplate()` posts
 *                                 to the Meta Graph API
 *   - `Automation`                what `whatsapp-trigger.service.ts` does in
 *                                 hardcoded form today
 *
 * Nothing in this file is sent anywhere.
 */

/* ─── WhatsApp message log ─────────────────────────────────────────────── */

/**
 * Mirrors the `status` column comment on `WhatsAppMessageLog`:
 * "queued | sent | delivered | read | failed".
 *
 * These are terminal buckets, not cumulative counters — a row holds exactly one
 * status, so a groupBy over the table partitions the recipients. Every count in
 * this file honours that, which is why `sum(counts) === recipients`.
 */
export type WhatsAppMessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

/**
 * One `WhatsAppMessageLog` row. Field names and nullability match
 * `server/prisma/schema.prisma` exactly; the `DateTime` columns are ISO strings
 * because that is what the API will serialise them to.
 *
 * `requestPayload` / `responsePayload` are omitted deliberately — they are raw
 * Meta Graph envelopes and nothing in this UI renders them.
 */
export interface WhatsAppMessageLogSample {
  id: string;
  organizationId: string;
  channelId: string;
  customerId: string | null;
  orderId: string | null;
  templateName: string;
  templateLanguage: string;
  /** "order_placed" | "manual" | "broadcast" — free-form server-side. */
  triggerType: string | null;
  /** E.164, as produced by `normalizePhone()`. */
  toPhone: string;
  /** WhatsApp message id, "wamid.*". Null until the Graph call returns. */
  externalId: string | null;
  status: WhatsAppMessageStatus;
  /** Meta error code as a string — see `NON_RETRYABLE_ERROR_CODES`. */
  errorCode: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  createdAt: string;
}

/** The shape of `groupBy({ by: ['status'], _count: true })` over the logs. */
export type WhatsAppStatusCounts = Record<WhatsAppMessageStatus, number>;

/* ─── Templates ────────────────────────────────────────────────────────── */

export interface WhatsAppTemplateVariable {
  /** 1-based, matching the {{1}} placeholders in the approved body. */
  index: number;
  /** A merge field like "customer.firstName", or null for a literal. */
  mappedTo: string | null;
  sampleValue: string;
}

/**
 * A Meta-approved message template. Templates are authored and approved on
 * Meta's side; the app only ever references one by `name` + `language.code`,
 * which is exactly what `sendTemplate()` puts on the wire.
 */
export interface WhatsAppTemplate {
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  status: "APPROVED" | "PENDING" | "REJECTED";
  /** Approved copy with its {{n}} placeholders intact. */
  body: string;
  variables: WhatsAppTemplateVariable[];
  headerText?: string;
  footerText?: string;
}

/** Merge fields offered for variable mapping in the composer. */
export const MERGE_FIELDS = [
  { value: "customer.firstName", label: "Customer first name" },
  { value: "customer.lastName", label: "Customer last name" },
  { value: "order.number", label: "Order number" },
  { value: "order.total", label: "Order total" },
  { value: "product.title", label: "Product title" },
] as const;

/**
 * `hello_world` / en_US is not filler — it is the literal template the live
 * order-placed trigger sends today (`whatsapp-trigger.service.ts`). The PENDING
 * entry exists so the composer's "you cannot pick an unapproved template" rule
 * has something to disable; that rule is real, since Meta rejects unapproved
 * sends with error 132.
 */
export const SAMPLE_TEMPLATES: WhatsAppTemplate[] = [
  {
    name: "hello_world",
    language: "en_US",
    category: "UTILITY",
    status: "APPROVED",
    body: "Hello World",
    variables: [],
    footerText: "Sent from Collabo CRM",
  },
  {
    name: "order_confirmation",
    language: "en_US",
    category: "UTILITY",
    status: "APPROVED",
    headerText: "Your order is confirmed",
    body: "Hi {{1}}, thanks for your order {{2}}. We will message you again the moment it ships.",
    variables: [
      { index: 1, mappedTo: "customer.firstName", sampleValue: "Priya" },
      { index: 2, mappedTo: "order.number", sampleValue: "#1042" },
    ],
    footerText: "Reply STOP to opt out",
  },
  {
    name: "back_in_stock",
    language: "en_US",
    category: "MARKETING",
    status: "APPROVED",
    body: "Good news {{1}} — the item you were waiting for is back in stock. Tap below to order before it goes again.",
    variables: [{ index: 1, mappedTo: "customer.firstName", sampleValue: "Priya" }],
  },
  {
    name: "festive_offer",
    language: "en_US",
    category: "MARKETING",
    status: "PENDING",
    body: "{{1}}, our festive sale is live — 25% off everything until Sunday.",
    variables: [{ index: 1, mappedTo: "customer.firstName", sampleValue: "Priya" }],
  },
];

/* ─── Audiences ────────────────────────────────────────────────────────── */

export interface BroadcastAudience {
  id: string;
  label: string;
  /** Human summary of what would become a filter object server-side. */
  description: string;
  /**
   * Already net of the two gates the real trigger applies before enqueueing:
   * marketing consent, and a phone that normalises to E.164.
   */
  size: number;
}

export const SAMPLE_AUDIENCES: BroadcastAudience[] = [
  {
    id: "aud_all_optin",
    label: "All opted-in customers",
    description: "Everyone with marketing consent and a reachable number.",
    size: 2431,
  },
  {
    id: "aud_repeat",
    label: "Repeat buyers",
    description: "Two or more completed orders, any time.",
    size: 612,
  },
  {
    id: "aud_recent",
    label: "Ordered in the last 30 days",
    description: "At least one order placed in the last 30 days.",
    size: 388,
  },
  {
    id: "aud_vip",
    label: "Gold and Platinum VIPs",
    description: "Customers on the top two VIP tiers.",
    size: 94,
  },
];

/* ─── Broadcasts ───────────────────────────────────────────────────────── */

export type BroadcastStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "failed";

export interface Broadcast {
  id: string;
  name: string;
  status: BroadcastStatus;
  templateName: string;
  templateLanguage: string;
  audience: BroadcastAudience;
  /**
   * The audience estimate while a broadcast is still a draft; equal to
   * `sum(counts)` from the moment sending starts. Both this and the five count
   * columns show in the list because for a draft the counts are all zero and
   * this is the only cell carrying information.
   */
  recipients: number;
  counts: WhatsAppStatusCounts;
  scheduledFor: string | null;
  sentAt: string | null;
  createdAt: string;
  createdBy: string;
}

const audience = (id: string): BroadcastAudience =>
  SAMPLE_AUDIENCES.find((a) => a.id === id)!;

export const SAMPLE_BROADCASTS: Broadcast[] = [
  {
    id: "bc_festive",
    name: "Festive greeting",
    status: "sent",
    templateName: "back_in_stock",
    templateLanguage: "en_US",
    audience: audience("aud_all_optin"),
    recipients: 2431,
    counts: { queued: 0, sent: 41, delivered: 1180, read: 1174, failed: 36 },
    scheduledFor: null,
    sentAt: "2026-08-18T09:30:00.000Z",
    createdAt: "2026-08-17T14:05:00.000Z",
    createdBy: "Athul K Kumar",
  },
  {
    id: "bc_repeat_buyers",
    name: "Repeat buyer thank-you",
    status: "sending",
    templateName: "order_confirmation",
    templateLanguage: "en_US",
    audience: audience("aud_repeat"),
    recipients: 612,
    counts: { queued: 401, sent: 96, delivered: 108, read: 4, failed: 3 },
    scheduledFor: null,
    sentAt: "2026-08-24T06:15:00.000Z",
    createdAt: "2026-08-24T06:10:00.000Z",
    createdBy: "Athul K Kumar",
  },
  {
    id: "bc_restock",
    name: "Restock announcement",
    status: "scheduled",
    templateName: "back_in_stock",
    templateLanguage: "en_US",
    audience: audience("aud_recent"),
    recipients: 388,
    counts: { queued: 0, sent: 0, delivered: 0, read: 0, failed: 0 },
    scheduledFor: "2026-08-26T04:30:00.000Z",
    sentAt: null,
    createdAt: "2026-08-23T11:20:00.000Z",
    createdBy: "Athul K Kumar",
  },
  {
    id: "bc_vip_preview",
    name: "VIP early access",
    status: "draft",
    templateName: "order_confirmation",
    templateLanguage: "en_US",
    audience: audience("aud_vip"),
    recipients: 94,
    counts: { queued: 0, sent: 0, delivered: 0, read: 0, failed: 0 },
    scheduledFor: null,
    sentAt: null,
    createdAt: "2026-08-22T08:45:00.000Z",
    createdBy: "Athul K Kumar",
  },
  {
    id: "bc_flash_sale",
    name: "Flash sale blast",
    status: "failed",
    templateName: "festive_offer",
    templateLanguage: "en_US",
    audience: audience("aud_recent"),
    recipients: 240,
    counts: { queued: 0, sent: 0, delivered: 0, read: 0, failed: 240 },
    scheduledFor: null,
    sentAt: null,
    createdAt: "2026-08-20T05:00:00.000Z",
    createdBy: "Athul K Kumar",
  },
];

/* ─── Message logs ─────────────────────────────────────────────────────── */

const ORG = "org_sample";
const WA_CHANNEL = "chan_whatsapp_sample";

/** Keeps the sample rows readable — every log row shares most of its columns. */
function logRow(
  partial: Pick<
    WhatsAppMessageLogSample,
    "id" | "toPhone" | "status" | "templateName" | "createdAt"
  > &
    Partial<WhatsAppMessageLogSample>,
): WhatsAppMessageLogSample {
  return {
    organizationId: ORG,
    channelId: WA_CHANNEL,
    customerId: null,
    orderId: null,
    templateLanguage: "en_US",
    triggerType: "broadcast",
    externalId: null,
    errorCode: null,
    errorMessage: null,
    sentAt: null,
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    ...partial,
  };
}

/**
 * Keyed by broadcast id. The error codes are real: 132 (template not approved),
 * 131026 (recipient not on WhatsApp) and 131047 (outside the 24-hour window)
 * are all in the send worker's `NON_RETRYABLE_ERROR_CODES` set.
 */
export const SAMPLE_BROADCAST_LOGS: Record<string, WhatsAppMessageLogSample[]> = {
  bc_festive: [
    logRow({
      id: "log_f1",
      toPhone: "+919845012345",
      status: "read",
      templateName: "back_in_stock",
      externalId: "wamid.HBgMOTE5ODQ1MDEyMzQ1",
      createdAt: "2026-08-18T09:30:01.000Z",
      sentAt: "2026-08-18T09:30:03.000Z",
      deliveredAt: "2026-08-18T09:30:11.000Z",
      readAt: "2026-08-18T10:02:44.000Z",
    }),
    logRow({
      id: "log_f2",
      toPhone: "+919632178904",
      status: "delivered",
      templateName: "back_in_stock",
      externalId: "wamid.HBgMOTE5NjMyMTc4OTA0",
      createdAt: "2026-08-18T09:30:01.000Z",
      sentAt: "2026-08-18T09:30:04.000Z",
      deliveredAt: "2026-08-18T09:30:19.000Z",
    }),
    logRow({
      id: "log_f3",
      toPhone: "+447700900312",
      status: "sent",
      templateName: "back_in_stock",
      externalId: "wamid.HBgMNDQ3NzAwOTAwMzEy",
      createdAt: "2026-08-18T09:30:02.000Z",
      sentAt: "2026-08-18T09:30:06.000Z",
    }),
    logRow({
      id: "log_f4",
      toPhone: "+919900112233",
      status: "failed",
      templateName: "back_in_stock",
      createdAt: "2026-08-18T09:30:02.000Z",
      failedAt: "2026-08-18T09:30:07.000Z",
      errorCode: "131026",
      errorMessage: "Message undeliverable — recipient is not on WhatsApp.",
    }),
    logRow({
      id: "log_f5",
      toPhone: "+919812345670",
      status: "failed",
      templateName: "back_in_stock",
      createdAt: "2026-08-18T09:30:03.000Z",
      failedAt: "2026-08-18T09:30:08.000Z",
      errorCode: "131047",
      errorMessage:
        "Re-engagement message outside the 24-hour customer service window.",
    }),
    logRow({
      id: "log_f6",
      toPhone: "+919745098761",
      status: "read",
      templateName: "back_in_stock",
      externalId: "wamid.HBgMOTE5NzQ1MDk4NzYx",
      createdAt: "2026-08-18T09:30:03.000Z",
      sentAt: "2026-08-18T09:30:09.000Z",
      deliveredAt: "2026-08-18T09:30:22.000Z",
      readAt: "2026-08-18T09:58:10.000Z",
    }),
  ],
  bc_repeat_buyers: [
    logRow({
      id: "log_r1",
      toPhone: "+919845012345",
      status: "read",
      templateName: "order_confirmation",
      externalId: "wamid.HBgMOTE5ODQ1MDEyMzQ2",
      createdAt: "2026-08-24T06:15:01.000Z",
      sentAt: "2026-08-24T06:15:04.000Z",
      deliveredAt: "2026-08-24T06:15:12.000Z",
      readAt: "2026-08-24T06:21:30.000Z",
    }),
    logRow({
      id: "log_r2",
      toPhone: "+919632178904",
      status: "delivered",
      templateName: "order_confirmation",
      externalId: "wamid.HBgMOTE5NjMyMTc4OTA1",
      createdAt: "2026-08-24T06:15:01.000Z",
      sentAt: "2026-08-24T06:15:05.000Z",
      deliveredAt: "2026-08-24T06:15:18.000Z",
    }),
    logRow({
      id: "log_r3",
      toPhone: "+919900112233",
      status: "sent",
      templateName: "order_confirmation",
      externalId: "wamid.HBgMOTE5OTAwMTEyMjMz",
      createdAt: "2026-08-24T06:15:02.000Z",
      sentAt: "2026-08-24T06:15:07.000Z",
    }),
    logRow({
      id: "log_r4",
      toPhone: "+919812345670",
      status: "queued",
      templateName: "order_confirmation",
      createdAt: "2026-08-24T06:15:02.000Z",
    }),
    logRow({
      id: "log_r5",
      toPhone: "+919745098761",
      status: "queued",
      templateName: "order_confirmation",
      createdAt: "2026-08-24T06:15:02.000Z",
    }),
    logRow({
      id: "log_r6",
      toPhone: "+918123456789",
      status: "failed",
      templateName: "order_confirmation",
      createdAt: "2026-08-24T06:15:03.000Z",
      failedAt: "2026-08-24T06:15:09.000Z",
      errorCode: "131026",
      errorMessage: "Message undeliverable — recipient is not on WhatsApp.",
    }),
  ],
  bc_flash_sale: [
    logRow({
      id: "log_x1",
      toPhone: "+919845012345",
      status: "failed",
      templateName: "festive_offer",
      createdAt: "2026-08-20T05:00:01.000Z",
      failedAt: "2026-08-20T05:00:02.000Z",
      errorCode: "132",
      errorMessage: "Template does not exist or has not been approved.",
    }),
    logRow({
      id: "log_x2",
      toPhone: "+919632178904",
      status: "failed",
      templateName: "festive_offer",
      createdAt: "2026-08-20T05:00:01.000Z",
      failedAt: "2026-08-20T05:00:02.000Z",
      errorCode: "132",
      errorMessage: "Template does not exist or has not been approved.",
    }),
    logRow({
      id: "log_x3",
      toPhone: "+919900112233",
      status: "failed",
      templateName: "festive_offer",
      createdAt: "2026-08-20T05:00:01.000Z",
      failedAt: "2026-08-20T05:00:03.000Z",
      errorCode: "132",
      errorMessage: "Template does not exist or has not been approved.",
    }),
  ],
  bc_restock: [],
  bc_vip_preview: [],
};

/* ─── Automations ──────────────────────────────────────────────────────── */

export type AutomationTriggerType =
  | "order_placed"
  | "order_fulfilled"
  | "order_cancelled"
  | "customer_created"
  | "abandoned_checkout";

export const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  order_placed: "When an order is placed",
  order_fulfilled: "When an order is fulfilled",
  order_cancelled: "When an order is cancelled",
  customer_created: "When a customer is created",
  abandoned_checkout: "When a checkout is abandoned",
};

export type ConditionField =
  | "customer.accepts_marketing"
  | "customer.phone"
  | "order.total"
  | "customer.vipLevel";

export const CONDITION_FIELD_LABELS: Record<ConditionField, string> = {
  "customer.accepts_marketing": "Customer accepts marketing",
  "customer.phone": "Customer phone number",
  "order.total": "Order total",
  "customer.vipLevel": "Customer VIP level",
};

export type ConditionOperator =
  | "is_true"
  | "is_false"
  | "is_set"
  | "is_not_set"
  | "gte"
  | "lte"
  | "equals";

export const CONDITION_OPERATOR_LABELS: Record<ConditionOperator, string> = {
  is_true: "is true",
  is_false: "is false",
  is_set: "is set",
  is_not_set: "is not set",
  gte: "is at least",
  lte: "is at most",
  equals: "equals",
};

export interface AutomationCondition {
  id: string;
  field: ConditionField;
  operator: ConditionOperator;
  value?: string | number | boolean;
  /** Enforced in code today — renders with a lock and is never editable. */
  locked?: boolean;
  helpText?: string;
}

export interface AutomationAction {
  id: string;
  /** A union of one for now; keeps the door open for other channels. */
  type: "send_whatsapp_template";
  templateName: string;
  templateLanguage: string;
  /** Carried through to `WhatsAppMessageJobData.triggerType`. */
  triggerType: string;
  /** 0 enqueues immediately. */
  delayMinutes: number;
}

export interface Automation {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  /**
   * "live" — actually runs today. "sample" — scaffold only, nothing behind it.
   * Drives the row badge, so a merchant can tell the one real rule apart from
   * the three that are illustration.
   */
  provenance: "live" | "sample";
  trigger: { type: AutomationTriggerType; source: string };
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  counts: WhatsAppStatusCounts;
  lastRunAt: string | null;
  createdAt: string;
}

export const SAMPLE_AUTOMATIONS: Automation[] = [
  {
    id: "auto_order_placed",
    name: "Order confirmation on WhatsApp",
    description:
      "Sends a WhatsApp template the moment a new order arrives from a connected store.",
    enabled: true,
    provenance: "live",
    trigger: { type: "order_placed", source: "Shopify webhook — orders/create" },
    conditions: [
      {
        id: "cond_optin",
        field: "customer.accepts_marketing",
        operator: "is_true",
        locked: true,
        helpText:
          "Meta requires marketing opt-in. Without it the send is skipped rather than attempted.",
      },
      {
        id: "cond_phone",
        field: "customer.phone",
        operator: "is_set",
        locked: true,
        helpText:
          "The number must normalise to E.164. The order's own phone is used when the customer record has none.",
      },
    ],
    actions: [
      {
        id: "act_send",
        type: "send_whatsapp_template",
        templateName: "hello_world",
        templateLanguage: "en_US",
        triggerType: "order_placed",
        delayMinutes: 0,
      },
    ],
    counts: { queued: 2, sent: 18, delivered: 604, read: 511, failed: 27 },
    lastRunAt: "2026-08-24T06:41:00.000Z",
    createdAt: "2026-04-22T06:25:00.000Z",
  },
  {
    id: "auto_shipped",
    name: "Shipping notification",
    description: "Tells the customer their parcel is on its way once it is fulfilled.",
    enabled: false,
    provenance: "sample",
    trigger: { type: "order_fulfilled", source: "Order fulfilment event" },
    conditions: [
      { id: "c1", field: "customer.accepts_marketing", operator: "is_true" },
    ],
    actions: [
      {
        id: "a1",
        type: "send_whatsapp_template",
        templateName: "order_confirmation",
        templateLanguage: "en_US",
        triggerType: "order_fulfilled",
        delayMinutes: 0,
      },
    ],
    counts: { queued: 0, sent: 0, delivered: 0, read: 0, failed: 0 },
    lastRunAt: null,
    createdAt: "2026-08-21T10:00:00.000Z",
  },
  {
    id: "auto_abandoned",
    name: "Abandoned checkout nudge",
    description: "Follows up an hour after a checkout is left unfinished.",
    enabled: false,
    provenance: "sample",
    trigger: { type: "abandoned_checkout", source: "Checkout abandonment event" },
    conditions: [
      { id: "c1", field: "customer.accepts_marketing", operator: "is_true" },
      { id: "c2", field: "order.total", operator: "gte", value: 1000 },
    ],
    actions: [
      {
        id: "a1",
        type: "send_whatsapp_template",
        templateName: "back_in_stock",
        templateLanguage: "en_US",
        triggerType: "abandoned_checkout",
        delayMinutes: 60,
      },
    ],
    counts: { queued: 0, sent: 0, delivered: 0, read: 0, failed: 0 },
    lastRunAt: null,
    createdAt: "2026-08-21T10:05:00.000Z",
  },
  {
    id: "auto_vip_welcome",
    name: "VIP welcome",
    description: "Greets a customer the first time they reach the Gold tier.",
    enabled: false,
    provenance: "sample",
    trigger: { type: "customer_created", source: "Customer record created" },
    conditions: [
      { id: "c1", field: "customer.vipLevel", operator: "equals", value: "GOLD" },
    ],
    actions: [
      {
        id: "a1",
        type: "send_whatsapp_template",
        templateName: "hello_world",
        templateLanguage: "en_US",
        triggerType: "customer_created",
        delayMinutes: 0,
      },
    ],
    counts: { queued: 0, sent: 0, delivered: 0, read: 0, failed: 0 },
    lastRunAt: null,
    createdAt: "2026-08-21T10:09:00.000Z",
  },
];

/** Recent sends for the one automation that genuinely runs. */
export const SAMPLE_AUTOMATION_LOGS: WhatsAppMessageLogSample[] = [
  logRow({
    id: "log_a1",
    toPhone: "+919845012345",
    status: "read",
    templateName: "hello_world",
    triggerType: "order_placed",
    orderId: "ord_1042",
    externalId: "wamid.HBgMOTE5ODQ1MDEyMzQ3",
    createdAt: "2026-08-24T06:41:00.000Z",
    sentAt: "2026-08-24T06:41:02.000Z",
    deliveredAt: "2026-08-24T06:41:09.000Z",
    readAt: "2026-08-24T06:47:31.000Z",
  }),
  logRow({
    id: "log_a2",
    toPhone: "+919632178904",
    status: "delivered",
    templateName: "hello_world",
    triggerType: "order_placed",
    orderId: "ord_1041",
    externalId: "wamid.HBgMOTE5NjMyMTc4OTA2",
    createdAt: "2026-08-24T05:12:00.000Z",
    sentAt: "2026-08-24T05:12:03.000Z",
    deliveredAt: "2026-08-24T05:12:14.000Z",
  }),
  logRow({
    id: "log_a3",
    toPhone: "+919900112233",
    status: "failed",
    templateName: "hello_world",
    triggerType: "order_placed",
    orderId: "ord_1039",
    createdAt: "2026-08-23T18:03:00.000Z",
    failedAt: "2026-08-23T18:03:04.000Z",
    errorCode: "131047",
    errorMessage:
      "Re-engagement message outside the 24-hour customer service window.",
  }),
];

/* ─── Overview page ────────────────────────────────────────────────────── */

/**
 * Recast from the old `CAMPAIGN_STATS`, which counted emails sent and open rate
 * — neither of which the app can measure. These four are all derivable from a
 * groupBy over `WhatsAppMessageLog`.
 */
export const CAMPAIGN_OVERVIEW_STATS: StatCardData[] = [
  { label: "Broadcasts sent (30d)", value: "4", change: 2, changeLabel: "vs last month" },
  { label: "Messages delivered", value: "3,896", change: 14, changeLabel: "vs last month" },
  { label: "Read rate", value: "62.1%", change: 4, changeLabel: "vs last month" },
  { label: "Failed sends", value: "306", change: -9, changeLabel: "vs last month" },
];

/**
 * Recast from `ENGAGEMENT_DATA`. Opens and clicks have no WhatsApp analogue;
 * delivered and read are two of the five real statuses, so the chart's shape
 * survives while its claim becomes something the platform could actually report.
 */
export const DELIVERY_TREND_DATA = [
  { month: "Feb", delivered: 71, read: 44 },
  { month: "Mar", delivered: 74, read: 47 },
  { month: "Apr", delivered: 69, read: 41 },
  { month: "May", delivered: 78, read: 52 },
  { month: "Jun", delivered: 81, read: 58 },
  { month: "Jul", delivered: 77, read: 55 },
  { month: "Aug", delivered: 83, read: 62 },
];
