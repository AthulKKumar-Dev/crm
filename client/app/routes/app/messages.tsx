import { useState } from "react";
import { Search, Send, Mail, MessageSquare, Smartphone, Phone } from "lucide-react";
import { SAMPLE_CONVERSATIONS, type Conversation, type MessageChannel } from "~/lib/placeholder-data";

export function meta() {
  return [{ title: "Messages | Collabo CRM" }];
}

const CHANNEL_ICON: Record<MessageChannel, React.ReactNode> = {
  email: <Mail className="size-3" />,
  sms: <Phone className="size-3" />,
  whatsapp: <Smartphone className="size-3" />,
  chat: <MessageSquare className="size-3" />,
};

const CHANNEL_LABEL: Record<MessageChannel, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  chat: "Live Chat",
};

const CHANNEL_CLASS: Record<MessageChannel, string> = {
  email: "bg-blue-100 text-blue-700",
  sms: "bg-orange-100 text-orange-700",
  whatsapp: "bg-[#cdff8c]/30 text-[#4d7a00]",
  chat: "bg-purple-100 text-purple-700",
};

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-[#cdff8c]/30 text-[#4d7a00]",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-indigo-100 text-indigo-700",
];

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

export default function MessagesPage() {
  const [activeId, setActiveId] = useState<string>(SAMPLE_CONVERSATIONS[0].id);
  const [search, setSearch] = useState("");

  const filtered = SAMPLE_CONVERSATIONS.filter((c) =>
    c.customerName.toLowerCase().includes(search.toLowerCase()) ||
    c.preview.toLowerCase().includes(search.toLowerCase())
  );

  const active = SAMPLE_CONVERSATIONS.find((c) => c.id === activeId) ?? SAMPLE_CONVERSATIONS[0];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Messages</h1>
        <p className="text-sm text-muted-foreground">
          Unified inbox for all customer conversations across channels.
        </p>
      </div>

      {/* Two-panel layout */}
      <div className="flex h-[calc(100vh-200px)] min-h-[520px] overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-border">
        {/* Left sidebar — conversation list */}
        <div className="flex w-72 shrink-0 flex-col border-r">
          {/* Search */}
          <div className="border-b p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search conversations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-gray-50 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#cdff8c]/50"
              />
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {filtered.map((conv, idx) => {
              const isActive = conv.id === activeId;
              const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
              return (
                <button
                  key={conv.id}
                  onClick={() => setActiveId(conv.id)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                    isActive ? "bg-[#cdff8c]/15 border-r-2 border-r-[#cdff8c]" : ""
                  }`}
                >
                  <div className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColor}`}>
                    {getInitials(conv.customerName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className={`truncate text-xs font-semibold ${isActive ? "text-[#4d7a00]" : "text-gray-900"}`}>
                        {conv.customerName}
                      </p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{conv.time}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium ${CHANNEL_CLASS[conv.channel]}`}>
                        {CHANNEL_ICON[conv.channel]}
                        {CHANNEL_LABEL[conv.channel]}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{conv.preview}</p>
                  </div>
                  {conv.unread > 0 && (
                    <span className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-[#cdff8c] text-[10px] font-bold text-gray-900">
                      {conv.unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right panel — conversation view */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Conversation header */}
          <div className="flex items-center gap-3 border-b px-5 py-4">
            <div className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${AVATAR_COLORS[SAMPLE_CONVERSATIONS.findIndex((c) => c.id === activeId) % AVATAR_COLORS.length]}`}>
              {getInitials(active.customerName)}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{active.customerName}</p>
              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${CHANNEL_CLASS[active.channel]}`}>
                {CHANNEL_ICON[active.channel]}
                {CHANNEL_LABEL[active.channel]}
              </span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {active.messages.map((msg) => {
              const isAgent = msg.sender === "agent";
              return (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 ${isAgent ? "flex-row-reverse" : ""}`}
                >
                  {!isAgent && (
                    <div className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${AVATAR_COLORS[SAMPLE_CONVERSATIONS.findIndex((c) => c.id === activeId) % AVATAR_COLORS.length]}`}>
                      {getInitials(active.customerName)}
                    </div>
                  )}
                  {isAgent && (
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#cdff8c]/30 text-[10px] font-bold text-[#4d7a00]">
                      Me
                    </div>
                  )}
                  <div className={`max-w-[70%] ${isAgent ? "items-end" : "items-start"} flex flex-col gap-1`}>
                    <div className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      isAgent
                        ? "bg-[#cdff8c] text-gray-900 rounded-tr-sm"
                        : "bg-gray-100 text-gray-900 rounded-tl-sm"
                    }`}>
                      {msg.text}
                    </div>
                    <span className="text-[10px] text-muted-foreground px-1">{msg.time}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Compose area */}
          <div className="border-t px-4 py-3">
            <div className="flex items-center gap-2 rounded-xl border border-input bg-gray-50 px-3 py-2">
              <input
                type="text"
                placeholder="Type a message…"
                className="flex-1 bg-transparent text-xs focus:outline-none placeholder:text-muted-foreground"
              />
              <button className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#cdff8c] text-gray-900 hover:bg-[#b8e87a] transition-colors">
                <Send className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
