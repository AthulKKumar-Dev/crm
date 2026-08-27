/**
 * Seed data for the mocked inbox.
 *
 * Every timestamp is built RELATIVE at module init (`minutesAgo(4)`), never as
 * a fixed date. Fixed dates rot: within a week the newest conversation reads
 * "8 days ago" and every session window is permanently expired, which makes the
 * countdown and the folder counts look broken rather than merely fake.
 *
 * This file is pure data. Derivation (folders, lastMessage) lives in
 * conversation-store.ts so it applies identically to seeded records and to
 * ones created at runtime.
 */

import type { Assignee, ConversationDetail, ConversationTag } from "~/types/api";

/** Captured once, so every fixture in one page load shares a coherent clock. */
const T0 = Date.now();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function minutesAgo(n: number): string {
  return new Date(T0 - n * MINUTE).toISOString();
}
function hoursAgo(n: number): string {
  return new Date(T0 - n * HOUR).toISOString();
}
function hoursFromNow(n: number): string {
  return new Date(T0 + n * HOUR).toISOString();
}
function minutesFromNow(n: number): string {
  return new Date(T0 + n * MINUTE).toISOString();
}

// ── Agents ───────────────────────────────────────────────────────────────────

/**
 * The signed-in agent.
 *
 * A fixed id rather than the real session user: "Assigned to me" has to contain
 * something for the rail to be worth looking at, and the mock cannot know who
 * will be logged in. Components read this, not the auth store — swapping to the
 * real user is a one-line change when the API lands.
 */
export const MOCK_ME: Assignee = {
  id: "agent-me",
  name: "Steve R.",
  avatarUrl: null,
};

const NISHA: Assignee = { id: "agent-nisha", name: "Nisha K.", avatarUrl: null };
const ARJUN: Assignee = { id: "agent-arjun", name: "Arjun P.", avatarUrl: null };

export const MOCK_ASSIGNEES: Assignee[] = [MOCK_ME, NISHA, ARJUN];

// ── Tags ─────────────────────────────────────────────────────────────────────

export const MOCK_TAGS: ConversationTag[] = [
  { id: "tag-vip", label: "VIP", tone: "brand" },
  { id: "tag-payment", label: "Payment pending", tone: "warning" },
  { id: "tag-preorder", label: "Pre-order", tone: "info" },
  { id: "tag-shipping", label: "Shipping", tone: "neutral" },
  { id: "tag-cart", label: "Cart", tone: "info" },
];

const tag = (id: string): ConversationTag =>
  MOCK_TAGS.find((t) => t.id === id) ?? MOCK_TAGS[0];

// ── Conversations ────────────────────────────────────────────────────────────

/**
 * `folders` and `lastMessage` are placeholders here — conversation-store.ts
 * recomputes both on seed. Omitting them would mean typing these as a partial
 * and losing the compiler's field-by-field check on everything else.
 */
export function buildFixtures(): ConversationDetail[] {
  return [
    {
      id: "conv-aarav",
      channel: "WHATSAPP",
      status: "OPEN",
      folders: [],
      customer: {
        customerId: "cust-aarav",
        name: "Aarav Mehta",
        phone: "+91 98200 41288",
        email: "aarav.mehta@example.in",
        avatarUrl: null,
      },
      assignee: MOCK_ME,
      tags: [tag("tag-vip")],
      lastMessage: null,
      unreadCount: 2,
      snoozedUntil: null,
      sessionWindow: {
        openedAt: hoursAgo(17),
        expiresAt: hoursFromNow(6.2),
        isOpen: true,
      },
      createdAt: hoursAgo(17),
      updatedAt: minutesAgo(2),
      messages: [
        {
          id: "msg-aarav-1",
          conversationId: "conv-aarav",
          clientId: null,
          direction: "INBOUND",
          kind: "TEXT",
          body: "Hi! Is the olive linen shirt back in stock in L?",
          attachments: [],
          products: [],
          status: "READ",
          author: null,
          createdAt: minutesAgo(38),
          deliveredAt: minutesAgo(38),
          readAt: minutesAgo(37),
          failureReason: null,
        },
        {
          id: "msg-aarav-2",
          conversationId: "conv-aarav",
          clientId: null,
          direction: "INBOUND",
          kind: "TEXT",
          body: "I ordered the M last month and it ran small.",
          attachments: [],
          products: [],
          status: "READ",
          author: null,
          createdAt: minutesAgo(37),
          deliveredAt: minutesAgo(37),
          readAt: minutesAgo(36),
          failureReason: null,
        },
        {
          id: "msg-aarav-3",
          conversationId: "conv-aarav",
          clientId: null,
          direction: "OUTBOUND",
          kind: "TEXT",
          body: "Hi Aarav — checking stock for you now.",
          attachments: [],
          products: [],
          status: "DELIVERED",
          author: MOCK_ME,
          createdAt: minutesAgo(35),
          deliveredAt: minutesAgo(35),
          readAt: null,
          failureReason: null,
        },
        {
          id: "msg-aarav-4",
          conversationId: "conv-aarav",
          clientId: null,
          direction: "OUTBOUND",
          kind: "TEXT",
          body: "Yes, L is back in stock. Want me to reserve one and send a payment link?",
          attachments: [],
          products: [],
          status: "READ",
          author: MOCK_ME,
          createdAt: minutesAgo(33),
          deliveredAt: minutesAgo(33),
          readAt: minutesAgo(32),
          failureReason: null,
        },
        {
          // A shared product, so the card renders before anything is dragged.
          // Its price and title are frozen copies — see MessageProduct.
          id: "msg-aarav-catalog",
          conversationId: "conv-aarav",
          clientId: null,
          direction: "OUTBOUND",
          kind: "CATALOG",
          body: "This is the one — still two left in L.",
          attachments: [],
          products: [
            {
              productId: "prod-olive-linen",
              variantId: "var-olive-linen-l",
              title: "Olive Linen Shirt",
              variantTitle: "L / Olive",
              sku: "OLS-L-OLV",
              price: 2499,
              priceRange: null,
              currency: "INR",
              imageUrl: null,
            },
          ],
          status: "READ",
          author: MOCK_ME,
          createdAt: minutesAgo(30),
          deliveredAt: minutesAgo(30),
          readAt: minutesAgo(29),
          failureReason: null,
        },
        {
          id: "msg-aarav-5",
          conversationId: "conv-aarav",
          clientId: null,
          direction: "INBOUND",
          kind: "TEXT",
          body: "Please. Same address as last time.",
          attachments: [],
          products: [],
          status: "DELIVERED",
          author: null,
          createdAt: minutesAgo(2),
          deliveredAt: minutesAgo(2),
          readAt: null,
          failureReason: null,
        },
      ],
      notes: [
        {
          id: "note-aarav-1",
          conversationId: "conv-aarav",
          body: "Wants the L reserved for Friday. Do not ship without confirming address.",
          author: MOCK_ME,
          createdAt: minutesAgo(34),
        },
      ],
      insights: {
        currency: "INR",
        lifetimeSpend: 42180,
        ordersCount: 7,
        lastOrder: {
          id: "order-10482",
          name: "#10482",
          financialStatus: "PAID",
          fulfillmentStatus: "UNFULFILLED",
          totalPrice: 2499,
          placedAt: hoursAgo(120),
          items: [
            {
              title: "Olive Linen Shirt",
              variantTitle: "M",
              quantity: 1,
              price: 2499,
              imageUrl: null,
            },
          ],
          shipping: {
            carrier: "Delhivery",
            trackingNumber: null,
            etaLabel: "Shipped 5 days ago",
          },
        },
      },
    },

    {
      id: "conv-priya",
      channel: "INSTAGRAM",
      status: "OPEN",
      folders: [],
      customer: {
        customerId: "cust-priya",
        name: "Priya Nair",
        phone: null,
        email: "priya.nair@example.in",
        avatarUrl: null,
      },
      assignee: null,
      tags: [tag("tag-payment")],
      lastMessage: null,
      unreadCount: 1,
      snoozedUntil: null,
      sessionWindow: null,
      createdAt: hoursAgo(6),
      updatedAt: minutesAgo(14),
      messages: [
        {
          id: "msg-priya-1",
          conversationId: "conv-priya",
          clientId: null,
          direction: "INBOUND",
          kind: "TEXT",
          body: "Hi, I placed an order but the payment page timed out.",
          attachments: [],
          products: [],
          status: "READ",
          author: null,
          createdAt: hoursAgo(5),
          deliveredAt: hoursAgo(5),
          readAt: hoursAgo(5),
          failureReason: null,
        },
        {
          id: "msg-priya-2",
          conversationId: "conv-priya",
          clientId: null,
          direction: "OUTBOUND",
          kind: "TEXT",
          body: "No problem — could you send a screenshot of the payment confirmation?",
          attachments: [],
          products: [],
          status: "READ",
          author: NISHA,
          createdAt: hoursAgo(4),
          deliveredAt: hoursAgo(4),
          readAt: hoursAgo(4),
          failureReason: null,
        },
        {
          id: "msg-priya-3",
          conversationId: "conv-priya",
          clientId: null,
          direction: "INBOUND",
          kind: "TEXT",
          body: "Sent the payment screenshot just now.",
          attachments: [],
          products: [],
          status: "DELIVERED",
          author: null,
          createdAt: minutesAgo(14),
          deliveredAt: minutesAgo(14),
          readAt: null,
          failureReason: null,
        },
      ],
      notes: [],
      insights: {
        currency: "INR",
        lifetimeSpend: 8940,
        ordersCount: 2,
        lastOrder: {
          id: "order-10501",
          name: "#10501",
          financialStatus: "PENDING",
          fulfillmentStatus: "UNFULFILLED",
          totalPrice: 4470,
          placedAt: hoursAgo(6),
          items: [
            {
              title: "Cotton Wide-Leg Trousers",
              variantTitle: "28",
              quantity: 1,
              price: 3200,
              imageUrl: null,
            },
            {
              title: "Ribbed Tank",
              variantTitle: "S",
              quantity: 1,
              price: 1270,
              imageUrl: null,
            },
          ],
          shipping: null,
        },
      },
    },

    {
      id: "conv-rohan",
      channel: "WHATSAPP",
      status: "OPEN",
      folders: [],
      customer: {
        customerId: "cust-rohan",
        name: "Rohan Das",
        phone: "+91 99870 22145",
        email: null,
        avatarUrl: null,
      },
      assignee: NISHA,
      tags: [tag("tag-shipping")],
      lastMessage: null,
      unreadCount: 0,
      snoozedUntil: null,
      sessionWindow: {
        openedAt: hoursAgo(1),
        expiresAt: hoursFromNow(23),
        isOpen: true,
      },
      createdAt: hoursAgo(30),
      updatedAt: hoursAgo(1),
      messages: [
        {
          id: "msg-rohan-1",
          conversationId: "conv-rohan",
          clientId: null,
          direction: "INBOUND",
          kind: "TEXT",
          body: "Order still shows unfulfilled?",
          attachments: [],
          products: [],
          status: "READ",
          author: null,
          createdAt: hoursAgo(1),
          deliveredAt: hoursAgo(1),
          readAt: hoursAgo(1),
          failureReason: null,
        },
      ],
      notes: [
        {
          id: "note-rohan-1",
          conversationId: "conv-rohan",
          body: "Warehouse says this ships tomorrow. Do not promise today.",
          author: ARJUN,
          createdAt: minutesAgo(50),
        },
      ],
      insights: {
        currency: "INR",
        lifetimeSpend: 15600,
        ordersCount: 4,
        lastOrder: {
          id: "order-10466",
          name: "#10466",
          financialStatus: "PAID",
          fulfillmentStatus: "UNFULFILLED",
          totalPrice: 3899,
          placedAt: hoursAgo(72),
          items: [
            {
              title: "Merino Crew Sweater",
              variantTitle: "L / Charcoal",
              quantity: 1,
              price: 3899,
              imageUrl: null,
            },
          ],
          shipping: {
            carrier: "Bluedart",
            trackingNumber: "BD8841203",
            etaLabel: "Est. 2 days",
          },
        },
      },
    },

    {
      id: "conv-meera",
      channel: "INSTAGRAM",
      status: "OPEN",
      folders: [],
      customer: {
        customerId: "cust-meera",
        name: "Meera Iyer",
        phone: null,
        email: "meera.i@example.in",
        avatarUrl: null,
      },
      assignee: MOCK_ME,
      tags: [tag("tag-cart")],
      lastMessage: null,
      unreadCount: 0,
      snoozedUntil: null,
      sessionWindow: null,
      createdAt: hoursAgo(9),
      updatedAt: hoursAgo(3),
      messages: [
        {
          id: "msg-meera-1",
          conversationId: "conv-meera",
          clientId: null,
          direction: "INBOUND",
          kind: "TEXT",
          body: "Can I add a second unit to my cart?",
          attachments: [],
          products: [],
          status: "READ",
          author: null,
          createdAt: hoursAgo(3),
          deliveredAt: hoursAgo(3),
          readAt: hoursAgo(3),
          failureReason: null,
        },
      ],
      notes: [],
      insights: {
        currency: "INR",
        lifetimeSpend: 3200,
        ordersCount: 1,
        lastOrder: null,
      },
    },

    {
      id: "conv-unknown",
      channel: "WHATSAPP",
      status: "OPEN",
      folders: [],
      customer: {
        // No Shopify identity — exercises the "link a customer first" path in
        // the right rail, which is the common real case for an inbound DM.
        customerId: null,
        name: "+91 90040 71122",
        phone: "+91 90040 71122",
        email: null,
        avatarUrl: null,
      },
      assignee: null,
      tags: [tag("tag-preorder")],
      lastMessage: null,
      unreadCount: 1,
      snoozedUntil: null,
      sessionWindow: {
        // Deliberately under an hour, so the countdown exercises its m:ss
        // branch and the closing-soon tone without waiting 23 hours.
        openedAt: hoursAgo(23.3),
        expiresAt: minutesFromNow(42),
        isOpen: true,
      },
      createdAt: hoursAgo(23.3),
      updatedAt: minutesAgo(40),
      messages: [
        {
          id: "msg-unknown-1",
          conversationId: "conv-unknown",
          clientId: null,
          direction: "INBOUND",
          kind: "TEXT",
          body: "When does the pre-order drop go live?",
          attachments: [],
          products: [],
          status: "DELIVERED",
          author: null,
          createdAt: minutesAgo(40),
          deliveredAt: minutesAgo(40),
          readAt: null,
          failureReason: null,
        },
      ],
      notes: [],
      insights: {
        currency: "INR",
        lifetimeSpend: 0,
        ordersCount: 0,
        lastOrder: null,
      },
    },

    {
      id: "conv-devika",
      channel: "WHATSAPP",
      status: "SNOOZED",
      folders: [],
      customer: {
        customerId: "cust-devika",
        name: "Devika Rao",
        phone: "+91 98111 55420",
        email: "devika.rao@example.in",
        avatarUrl: null,
      },
      assignee: MOCK_ME,
      tags: [],
      lastMessage: null,
      unreadCount: 0,
      snoozedUntil: hoursFromNow(3),
      sessionWindow: {
        openedAt: hoursAgo(20),
        expiresAt: hoursFromNow(4),
        isOpen: true,
      },
      createdAt: hoursAgo(48),
      updatedAt: hoursAgo(20),
      messages: [
        {
          id: "msg-devika-1",
          conversationId: "conv-devika",
          clientId: null,
          direction: "INBOUND",
          kind: "TEXT",
          body: "Following up on the exchange request from last week.",
          attachments: [],
          products: [],
          status: "READ",
          author: null,
          createdAt: hoursAgo(20),
          deliveredAt: hoursAgo(20),
          readAt: hoursAgo(20),
          failureReason: null,
        },
      ],
      notes: [],
      insights: {
        currency: "INR",
        lifetimeSpend: 27400,
        ordersCount: 5,
        lastOrder: {
          id: "order-10390",
          name: "#10390",
          financialStatus: "PARTIALLY_REFUNDED",
          fulfillmentStatus: "FULFILLED",
          totalPrice: 5600,
          placedAt: hoursAgo(200),
          items: [
            {
              title: "Silk Blend Scarf",
              variantTitle: null,
              quantity: 2,
              price: 2800,
              imageUrl: null,
            },
          ],
          shipping: {
            carrier: "Delhivery",
            trackingNumber: "DL5520118",
            etaLabel: "Delivered",
          },
        },
      },
    },

    {
      id: "conv-sana",
      channel: "WHATSAPP",
      status: "RESOLVED",
      folders: [],
      customer: {
        customerId: "cust-sana",
        name: "Sana Khan",
        phone: "+91 97600 30188",
        email: "sana.khan@example.in",
        avatarUrl: null,
      },
      assignee: NISHA,
      tags: [],
      lastMessage: null,
      unreadCount: 0,
      snoozedUntil: null,
      sessionWindow: {
        openedAt: hoursAgo(30),
        expiresAt: hoursAgo(6),
        isOpen: false,
      },
      createdAt: hoursAgo(52),
      updatedAt: hoursAgo(26),
      messages: [
        {
          id: "msg-sana-1",
          conversationId: "conv-sana",
          clientId: null,
          direction: "OUTBOUND",
          kind: "TEXT",
          body: "Your replacement has been dispatched — tracking is BD7741900.",
          attachments: [],
          products: [],
          status: "READ",
          author: NISHA,
          createdAt: hoursAgo(27),
          deliveredAt: hoursAgo(27),
          readAt: hoursAgo(27),
          failureReason: null,
        },
        {
          id: "msg-sana-2",
          conversationId: "conv-sana",
          clientId: null,
          direction: "INBOUND",
          kind: "TEXT",
          body: "Thanks, received!",
          attachments: [],
          products: [],
          status: "READ",
          author: null,
          createdAt: hoursAgo(26),
          deliveredAt: hoursAgo(26),
          readAt: hoursAgo(26),
          failureReason: null,
        },
      ],
      notes: [],
      insights: {
        currency: "INR",
        lifetimeSpend: 11250,
        ordersCount: 3,
        lastOrder: {
          id: "order-10412",
          name: "#10412",
          financialStatus: "PAID",
          fulfillmentStatus: "FULFILLED",
          totalPrice: 1890,
          placedAt: hoursAgo(180),
          items: [
            {
              title: "Canvas Tote",
              variantTitle: "Natural",
              quantity: 1,
              price: 1890,
              imageUrl: null,
            },
          ],
          shipping: {
            carrier: "Bluedart",
            trackingNumber: "BD7741900",
            etaLabel: "Delivered",
          },
        },
      },
    },

    {
      id: "conv-farhan",
      channel: "WHATSAPP",
      status: "RESOLVED",
      folders: [],
      customer: {
        customerId: "cust-farhan",
        name: "Farhan Qureshi",
        phone: "+91 93100 88214",
        email: null,
        avatarUrl: null,
      },
      assignee: ARJUN,
      tags: [tag("tag-shipping")],
      lastMessage: null,
      unreadCount: 0,
      snoozedUntil: null,
      sessionWindow: {
        openedAt: hoursAgo(60),
        expiresAt: hoursAgo(36),
        isOpen: false,
      },
      createdAt: hoursAgo(72),
      updatedAt: hoursAgo(49),
      messages: [
        {
          id: "msg-farhan-1",
          conversationId: "conv-farhan",
          clientId: null,
          direction: "INBOUND",
          kind: "TEXT",
          body: "Got it, thanks for sorting the address change.",
          attachments: [],
          products: [],
          status: "READ",
          author: null,
          createdAt: hoursAgo(49),
          deliveredAt: hoursAgo(49),
          readAt: hoursAgo(49),
          failureReason: null,
        },
      ],
      notes: [],
      insights: {
        currency: "INR",
        lifetimeSpend: 6300,
        ordersCount: 2,
        lastOrder: null,
      },
    },
  ];
}
