export type OrderStatus = "COMPLETED" | "IN_PROGRESS" | "WAITING" | "CANCELLED";

export interface Order {
  id: string;
  productName: string;
  productImage: string;
  variantCount: number;
  customerName: string;
  date: string;
  payment: "Mastercard" | "Visa" | "Paypal";
  amount: number;
  status: OrderStatus;
}

export interface StatCardData {
  label: string;
  value: string;
  change: number;
  changeLabel: string;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  price: number;
  stockCount: number;
  sold: number;
  image: string;
  sparkline: number[];
}

// ─── Dashboard Stats ────────────────────────────────────────────────────────

/** Summary statistics shown on the main dashboard overview. */
export const DASHBOARD_STATS: StatCardData[] = [
  { label: "Total Products Sales", value: "118,594", change: -10, changeLabel: "vs last month" },
  { label: "Total Volume of Products", value: "257,361", change: 54, changeLabel: "vs last month" },
  { label: "Total Revenue", value: "$96,715.28", change: 54, changeLabel: "vs last month" },
  { label: "Total Customers", value: "12,847", change: 23, changeLabel: "vs last month" },
];

// ─── Orders Stats ────────────────────────────────────────────────────────────

/** Summary statistics shown on the orders page. */
export const ORDER_STATS: StatCardData[] = [
  { label: "Total New Orders", value: "594", change: 54, changeLabel: "vs last week" },
  { label: "Total Orders Pending", value: "257,361", change: -10, changeLabel: "vs last week" },
  { label: "Total Products Sales", value: "8,594", change: 54, changeLabel: "vs last month" },
  { label: "Total Volume of Products", value: "257,361", change: -10, changeLabel: "vs last month" },
];

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

// ─── Sample Orders ────────────────────────────────────────────────────────────

/** Placeholder order rows for the orders table. */
export const SAMPLE_ORDERS: Order[] = [
  { id: "#302012", productName: "Wall Clock Special Edition", productImage: "", variantCount: 3, customerName: "Cameron Williamson", date: "22 Jan 2022", payment: "Mastercard", amount: 121.0, status: "COMPLETED" },
  { id: "#302011", productName: "Airpods Max 2024 Edition", productImage: "", variantCount: 0, customerName: "Brooklyn Simmons", date: "20 Jan 2022", payment: "Visa", amount: 590.0, status: "IN_PROGRESS" },
  { id: "#302002", productName: "Nike Shoes", productImage: "", variantCount: 1, customerName: "Darlene Robertson", date: "24 Jan 2022", payment: "Paypal", amount: 348.0, status: "WAITING" },
  { id: "#301900", productName: "Wooden Stylish Chair", productImage: "", variantCount: 0, customerName: "Courtney Henry", date: "26 Jan 2022", payment: "Mastercard", amount: 607.0, status: "COMPLETED" },
  { id: "#301899", productName: "PS 5 Pro Special Edition", productImage: "", variantCount: 1, customerName: "Kathryn Murphy", date: "26 Jan 2022", payment: "Paypal", amount: 607.0, status: "WAITING" },
  { id: "#301898", productName: "Xiaomi 360° CC Camera", productImage: "", variantCount: 7, customerName: "Ronald Richards", date: "26 Jan 2022", payment: "Mastercard", amount: 607.0, status: "IN_PROGRESS" },
  { id: "#301897", productName: "Winter Jacket", productImage: "", variantCount: 0, customerName: "Savannah Nguyen", date: "26 Jan 2022", payment: "Visa", amount: 607.0, status: "CANCELLED" },
  { id: "#301896", productName: "MacBook Air M3", productImage: "", variantCount: 2, customerName: "Jerome Bell", date: "25 Jan 2022", payment: "Visa", amount: 1299.0, status: "COMPLETED" },
  { id: "#301895", productName: "Samsung 4K Monitor", productImage: "", variantCount: 0, customerName: "Bessie Cooper", date: "25 Jan 2022", payment: "Mastercard", amount: 449.0, status: "IN_PROGRESS" },
  { id: "#301894", productName: "Leather Handbag", productImage: "", variantCount: 4, customerName: "Arlene McCoy", date: "24 Jan 2022", payment: "Paypal", amount: 189.0, status: "COMPLETED" },
  { id: "#301893", productName: "Running Shoes Pro", productImage: "", variantCount: 3, customerName: "Floyd Miles", date: "24 Jan 2022", payment: "Visa", amount: 210.0, status: "WAITING" },
  { id: "#301892", productName: "Wireless Keyboard", productImage: "", variantCount: 1, customerName: "Guy Hawkins", date: "23 Jan 2022", payment: "Mastercard", amount: 89.0, status: "COMPLETED" },
  { id: "#301891", productName: "Gaming Mouse RGB", productImage: "", variantCount: 0, customerName: "Wade Warren", date: "23 Jan 2022", payment: "Paypal", amount: 65.0, status: "COMPLETED" },
  { id: "#301890", productName: "Coffee Maker Deluxe", productImage: "", variantCount: 2, customerName: "Esther Howard", date: "22 Jan 2022", payment: "Visa", amount: 175.0, status: "IN_PROGRESS" },
  { id: "#301889", productName: "Yoga Mat Premium", productImage: "", variantCount: 0, customerName: "Jenny Wilson", date: "22 Jan 2022", payment: "Mastercard", amount: 55.0, status: "COMPLETED" },
  { id: "#301888", productName: "Smart Watch Series 9", productImage: "", variantCount: 5, customerName: "Kristin Watson", date: "21 Jan 2022", payment: "Paypal", amount: 399.0, status: "COMPLETED" },
  { id: "#301887", productName: "Office Desk Chair", productImage: "", variantCount: 1, customerName: "Cody Fisher", date: "21 Jan 2022", payment: "Visa", amount: 320.0, status: "WAITING" },
  { id: "#301886", productName: "Bluetooth Speaker", productImage: "", variantCount: 2, customerName: "Theresa Webb", date: "20 Jan 2022", payment: "Mastercard", amount: 129.0, status: "COMPLETED" },
  { id: "#301885", productName: "Desk Lamp LED", productImage: "", variantCount: 0, customerName: "Albert Flores", date: "20 Jan 2022", payment: "Paypal", amount: 42.0, status: "CANCELLED" },
  { id: "#301884", productName: "Sunglasses UV400", productImage: "", variantCount: 6, customerName: "Eleanor Pena", date: "19 Jan 2022", payment: "Visa", amount: 95.0, status: "COMPLETED" },
];

// ─── Top Products ─────────────────────────────────────────────────────────────

/** Top-selling products displayed on the dashboard. */
export const TOP_PRODUCTS: Product[] = [
  { id: "1", name: "Apple Watch Series 10 46mm GPS", brand: "Apple", price: 799.0, stockCount: 5800, sold: 20618, image: "", sparkline: [30, 40, 35, 50, 45, 55, 60, 58, 65, 70, 68, 72] },
  { id: "2", name: "Sony WH-1000XM5 Headphones", brand: "Sony", price: 349.99, stockCount: 2300, sold: 14200, image: "", sparkline: [20, 30, 28, 35, 40, 38, 45, 42, 48, 50, 52, 55] },
  { id: "3", name: "Samsung Galaxy S25 Ultra", brand: "Samsung", price: 1199.0, stockCount: 8100, sold: 18450, image: "", sparkline: [40, 45, 42, 55, 60, 58, 65, 62, 70, 68, 72, 78] },
  { id: "4", name: "Nike Air Max 270", brand: "Nike", price: 150.0, stockCount: 12500, sold: 32100, image: "", sparkline: [50, 48, 55, 52, 60, 58, 62, 68, 65, 72, 70, 75] },
  { id: "5", name: "Dyson V15 Detect Vacuum", brand: "Dyson", price: 749.99, stockCount: 1900, sold: 9830, image: "", sparkline: [25, 30, 28, 32, 35, 38, 36, 40, 42, 45, 44, 48] },
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

// ─── Product Catalog ──────────────────────────────────────────────────────────

export type ProductStatus = "ACTIVE" | "DRAFT" | "OUT_OF_STOCK" | "ARCHIVED";

export interface CatalogProduct {
  id: string;
  name: string;
  category: string;
  sku: string;
  price: number;
  stock: number;
  sold: number;
  status: ProductStatus;
}

/** Summary statistics shown on the product catalog page. */
export const CATALOG_STATS: StatCardData[] = [
  { label: "Total Products", value: "1,284", change: 8, changeLabel: "vs last month" },
  { label: "Active Listings", value: "1,047", change: 5, changeLabel: "vs last month" },
  { label: "Out of Stock", value: "93", change: -12, changeLabel: "vs last month" },
  { label: "Low Stock Items", value: "144", change: 22, changeLabel: "vs last month" },
];

/** Placeholder product catalog rows for the products table. */
export const SAMPLE_CATALOG: CatalogProduct[] = [
  { id: "1", name: "Apple Watch Series 10 46mm GPS", category: "Electronics", sku: "APL-AW10-46", price: 799.0, stock: 5800, sold: 20618, status: "ACTIVE" },
  { id: "2", name: "Sony WH-1000XM5 Headphones", category: "Electronics", sku: "SNY-WH1000XM5", price: 349.99, stock: 2300, sold: 14200, status: "ACTIVE" },
  { id: "3", name: "Samsung Galaxy S25 Ultra", category: "Electronics", sku: "SAM-GS25U", price: 1199.0, stock: 8100, sold: 18450, status: "ACTIVE" },
  { id: "4", name: "Nike Air Max 270", category: "Shoes", sku: "NK-AM270", price: 150.0, stock: 12500, sold: 32100, status: "ACTIVE" },
  { id: "5", name: "Dyson V15 Detect Vacuum", category: "Home Appliances", sku: "DYS-V15D", price: 749.99, stock: 1900, sold: 9830, status: "ACTIVE" },
  { id: "6", name: "Levi's 511 Slim Jeans", category: "Clothes", sku: "LV-511-32", price: 69.99, stock: 0, sold: 5420, status: "OUT_OF_STOCK" },
  { id: "7", name: "IKEA KALLAX Shelf Unit", category: "Furniture", sku: "IKA-KALLAX-2X4", price: 129.0, stock: 340, sold: 7810, status: "ACTIVE" },
  { id: "8", name: "MacBook Air M3 13-inch", category: "Electronics", sku: "APL-MBA-M3-13", price: 1099.0, stock: 0, sold: 4200, status: "OUT_OF_STOCK" },
  { id: "9", name: "Adidas Ultraboost 22", category: "Shoes", sku: "ADI-UB22-44", price: 189.0, stock: 85, sold: 11200, status: "ACTIVE" },
  { id: "10", name: "Herman Miller Aeron Chair", category: "Furniture", sku: "HM-AERON-B", price: 1495.0, stock: 0, sold: 1800, status: "ARCHIVED" },
  { id: "11", name: "Zara Oversized Blazer", category: "Clothes", sku: "ZR-OVB-M-BLK", price: 89.99, stock: 620, sold: 3900, status: "DRAFT" },
  { id: "12", name: "Instant Pot Duo 7-in-1", category: "Home Appliances", sku: "IP-DUO-7N1-6Q", price: 99.95, stock: 2400, sold: 22100, status: "ACTIVE" },
];

// ─── Customers ────────────────────────────────────────────────────────────────

export type CustomerStatus = "ACTIVE" | "INACTIVE" | "VIP" | "AT_RISK";

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  location: string;
  orders: number;
  totalSpent: number;
  lastOrderDate: string;
  status: CustomerStatus;
}

/** Summary statistics shown on the customers page. */
export const CUSTOMER_STATS: StatCardData[] = [
  { label: "Total Customers", value: "12,847", change: 23, changeLabel: "vs last month" },
  { label: "Active Customers", value: "9,312", change: 11, changeLabel: "vs last month" },
  { label: "New This Month", value: "842", change: 34, changeLabel: "vs last month" },
  { label: "At Risk", value: "391", change: -8, changeLabel: "vs last month" },
];

/** Placeholder customer rows for the customers table. */
export const SAMPLE_CUSTOMERS: Customer[] = [
  { id: "1", firstName: "Cameron", lastName: "Williamson", email: "cameron.w@email.com", location: "New York, US", orders: 24, totalSpent: 4280.50, lastOrderDate: "22 Jan 2022", status: "VIP" },
  { id: "2", firstName: "Brooklyn", lastName: "Simmons", email: "brooklyn.s@email.com", location: "Los Angeles, US", orders: 12, totalSpent: 1890.00, lastOrderDate: "20 Jan 2022", status: "ACTIVE" },
  { id: "3", firstName: "Darlene", lastName: "Robertson", email: "darlene.r@email.com", location: "Chicago, US", orders: 7, totalSpent: 760.00, lastOrderDate: "24 Jan 2022", status: "ACTIVE" },
  { id: "4", firstName: "Courtney", lastName: "Henry", email: "courtney.h@email.com", location: "Houston, US", orders: 3, totalSpent: 250.00, lastOrderDate: "10 Dec 2021", status: "AT_RISK" },
  { id: "5", firstName: "Kathryn", lastName: "Murphy", email: "kathryn.m@email.com", location: "Phoenix, US", orders: 31, totalSpent: 6720.00, lastOrderDate: "26 Jan 2022", status: "VIP" },
  { id: "6", firstName: "Ronald", lastName: "Richards", email: "ronald.r@email.com", location: "Philadelphia, US", orders: 9, totalSpent: 1100.00, lastOrderDate: "18 Jan 2022", status: "ACTIVE" },
  { id: "7", firstName: "Savannah", lastName: "Nguyen", email: "savannah.n@email.com", location: "San Antonio, US", orders: 1, totalSpent: 89.00, lastOrderDate: "26 Jan 2022", status: "INACTIVE" },
  { id: "8", firstName: "Jerome", lastName: "Bell", email: "jerome.b@email.com", location: "Dallas, US", orders: 18, totalSpent: 3450.00, lastOrderDate: "25 Jan 2022", status: "ACTIVE" },
  { id: "9", firstName: "Bessie", lastName: "Cooper", email: "bessie.c@email.com", location: "San Diego, US", orders: 5, totalSpent: 590.00, lastOrderDate: "21 Jan 2022", status: "AT_RISK" },
  { id: "10", firstName: "Arlene", lastName: "McCoy", email: "arlene.m@email.com", location: "Austin, US", orders: 22, totalSpent: 3890.00, lastOrderDate: "24 Jan 2022", status: "VIP" },
  { id: "11", firstName: "Floyd", lastName: "Miles", email: "floyd.m@email.com", location: "Jacksonville, US", orders: 6, totalSpent: 820.00, lastOrderDate: "23 Jan 2022", status: "ACTIVE" },
  { id: "12", firstName: "Guy", lastName: "Hawkins", email: "guy.h@email.com", location: "Columbus, US", orders: 14, totalSpent: 2100.00, lastOrderDate: "22 Jan 2022", status: "ACTIVE" },
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
