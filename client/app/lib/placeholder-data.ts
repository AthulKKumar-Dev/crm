export interface StatCardData {
  label: string;
  value: string;
  change: number;
  changeLabel: string;
}

// ─── Bar Chart Data ───────────────────────────────────────────────────────────

/** Monthly revenue vs. profit data for the bar chart widget. */
export const PROFIT_CHART_DATA = [
  { month: "Jan", revenue: 62000, profit: 38000 },
  { month: "Mar", revenue: 48000, profit: 28000 },
  { month: "May", revenue: 71000, profit: 45000 },
  { month: "Jul", revenue: 55000, profit: 32000 },
  { month: "Sep", revenue: 83000, profit: 54000 },
  { month: "Nov", revenue: 96000, profit: 61000 },
  { month: "Dec", revenue: 110000, profit: 72000 },
];

// ─── Donut Chart Data ─────────────────────────────────────────────────────────

/** Sales distribution by category for the donut chart widget. */
export const SALES_CHART_DATA = [
  { name: "Electronics", value: 37715, color: "#a78bfa" },
  { name: "Furniture", value: 29153, color: "#fbbf24" },
  { name: "Clothes", value: 11682, color: "#fb923c" },
  { name: "Shoes", value: 35715, color: "#818cf8" },
];

// ─── Analytics Stats ──────────────────────────────────────────────────────────

/** Summary statistics shown on the analytics page. */
export const ANALYTICS_STATS: StatCardData[] = [
  { label: "Total Revenue", value: "$96,715", change: 18, changeLabel: "vs last month" },
  { label: "Conversion Rate", value: "3.24%", change: -5, changeLabel: "vs last month" },
  { label: "Avg. Order Value", value: "$148.30", change: 12, changeLabel: "vs last month" },
  { label: "Returning Customers", value: "41.8%", change: 7, changeLabel: "vs last month" },
];

/** Month-over-month trend data (revenue, sessions, orders) for the analytics line chart. */
export const ANALYTICS_TREND_DATA = [
  { month: "Jan", revenue: 62000, sessions: 18400, orders: 419 },
  { month: "Feb", revenue: 54000, sessions: 16200, orders: 364 },
  { month: "Mar", revenue: 48000, sessions: 14800, orders: 324 },
  { month: "Apr", revenue: 70000, sessions: 21000, orders: 472 },
  { month: "May", revenue: 71000, sessions: 22500, orders: 479 },
  { month: "Jun", revenue: 65000, sessions: 20100, orders: 438 },
  { month: "Jul", revenue: 55000, sessions: 17300, orders: 371 },
  { month: "Aug", revenue: 78000, sessions: 24000, orders: 526 },
  { month: "Sep", revenue: 83000, sessions: 25800, orders: 560 },
  { month: "Oct", revenue: 91000, sessions: 27600, orders: 614 },
  { month: "Nov", revenue: 96000, sessions: 29200, orders: 648 },
  { month: "Dec", revenue: 110000, sessions: 33500, orders: 742 },
];

/** Traffic acquisition channel breakdown for the analytics table. */
export const ANALYTICS_CHANNEL_DATA = [
  { channel: "Organic", sessions: 12400, orders: 298, revenue: 44200 },
  { channel: "Paid Search", sessions: 8900, orders: 214, revenue: 31800 },
  { channel: "Social", sessions: 6200, orders: 149, revenue: 22100 },
  { channel: "Email", sessions: 3800, orders: 91, revenue: 13500 },
  { channel: "Direct", sessions: 2100, orders: 50, revenue: 7400 },
  { channel: "Referral", sessions: 1500, orders: 36, revenue: 5300 },
];

// ─── Customers Stats ────────────────────────────────────────────────────────

/** Summary statistics shown on the customers page. */
export const CUSTOMER_STATS: StatCardData[] = [
  { label: "Total Customers", value: "12,847", change: 23, changeLabel: "vs last month" },
  { label: "Active Customers", value: "9,312", change: 11, changeLabel: "vs last month" },
  { label: "New This Month", value: "842", change: 34, changeLabel: "vs last month" },
  { label: "At Risk", value: "391", change: -8, changeLabel: "vs last month" },
];

// ─── Messages / Conversations ─────────────────────────────────────────────────

export type MessageChannel = "email" | "sms" | "whatsapp" | "chat";

export interface Message {
  id: string;
  sender: "customer" | "agent";
  text: string;
  time: string;
}

export interface Conversation {
  id: string;
  customerName: string;
  channel: MessageChannel;
  preview: string;
  time: string;
  unread: number;
  messages: Message[];
}

/** Placeholder conversation threads for the messaging inbox. */
export const SAMPLE_CONVERSATIONS: Conversation[] = [
  {
    id: "c1",
    customerName: "Cameron Williamson",
    channel: "chat",
    preview: "Hey, I haven't received my order yet...",
    time: "2m ago",
    unread: 2,
    messages: [
      { id: "m1", sender: "customer", text: "Hi there! I placed order #302012 about a week ago and haven't received it yet. Can you help?", time: "10:31 AM" },
      { id: "m2", sender: "agent", text: "Hi Cameron! I'm sorry to hear that. Let me look into order #302012 for you right away.", time: "10:33 AM" },
      { id: "m3", sender: "agent", text: "I can see your order is currently in transit. The estimated delivery date is tomorrow, Jan 23rd.", time: "10:34 AM" },
      { id: "m4", sender: "customer", text: "Hey, I haven't received my order yet. It was supposed to arrive yesterday.", time: "11:02 AM" },
      { id: "m5", sender: "customer", text: "Is there a way to get an update on the exact location?", time: "11:03 AM" },
    ],
  },
  {
    id: "c2",
    customerName: "Brooklyn Simmons",
    channel: "email",
    preview: "I'd like to return the headphones I bought...",
    time: "14m ago",
    unread: 1,
    messages: [
      { id: "m1", sender: "customer", text: "Hello, I'd like to return the headphones I bought last week. They don't fit properly.", time: "9:45 AM" },
      { id: "m2", sender: "agent", text: "Hi Brooklyn! Of course, we'd be happy to help with that. Could you confirm your order number?", time: "9:50 AM" },
      { id: "m3", sender: "customer", text: "I'd like to return the headphones I bought, order #302011.", time: "10:48 AM" },
    ],
  },
  {
    id: "c3",
    customerName: "Darlene Robertson",
    channel: "whatsapp",
    preview: "Do you have the Nike shoes in size 9?",
    time: "1h ago",
    unread: 0,
    messages: [
      { id: "m1", sender: "customer", text: "Hi! Do you have the Nike Air Max 270 in size 9?", time: "9:15 AM" },
      { id: "m2", sender: "agent", text: "Hi Darlene! Let me check the stock for you.", time: "9:18 AM" },
      { id: "m3", sender: "agent", text: "Yes, we do have size 9 available! Would you like to place an order?", time: "9:20 AM" },
      { id: "m4", sender: "customer", text: "Great! I'll place the order now. Thanks!", time: "9:22 AM" },
    ],
  },
  {
    id: "c4",
    customerName: "Courtney Henry",
    channel: "sms",
    preview: "My discount code isn't working...",
    time: "3h ago",
    unread: 0,
    messages: [
      { id: "m1", sender: "customer", text: "Hi, my discount code SAVE20 isn't working at checkout. Any idea why?", time: "7:30 AM" },
      { id: "m2", sender: "agent", text: "Hi Courtney! I'm sorry about that. The SAVE20 code expired yesterday. Here's a new code: SAVE15.", time: "7:45 AM" },
      { id: "m3", sender: "customer", text: "Oh thank you! That worked perfectly.", time: "7:50 AM" },
    ],
  },
  {
    id: "c5",
    customerName: "Kathryn Murphy",
    channel: "chat",
    preview: "Can I upgrade my order to express shipping?",
    time: "5h ago",
    unread: 0,
    messages: [
      { id: "m1", sender: "customer", text: "Hi! I just placed order #301899. Can I upgrade to express shipping?", time: "5:10 AM" },
      { id: "m2", sender: "agent", text: "Hi Kathryn! Since your order hasn't been dispatched yet, we can definitely upgrade that. The extra cost is $8.99.", time: "5:14 AM" },
      { id: "m3", sender: "customer", text: "Perfect, please go ahead with that!", time: "5:16 AM" },
      { id: "m4", sender: "agent", text: "Done! Your order has been upgraded to express shipping. You'll receive it within 1-2 business days.", time: "5:18 AM" },
    ],
  },
  {
    id: "c6",
    customerName: "Ronald Richards",
    channel: "email",
    preview: "Invoice request for order #301898",
    time: "Yesterday",
    unread: 0,
    messages: [
      { id: "m1", sender: "customer", text: "Hi, could you please send me an invoice for order #301898? I need it for expense reporting.", time: "Yesterday 2:00 PM" },
      { id: "m2", sender: "agent", text: "Hi Ronald! Sure thing. I've just emailed the invoice to your registered email address.", time: "Yesterday 2:15 PM" },
    ],
  },
];
