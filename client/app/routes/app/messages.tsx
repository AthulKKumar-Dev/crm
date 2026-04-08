import { useState } from "react";
import { Search, Send, Mail, MessageSquare, Smartphone, Phone } from "lucide-react";
import { SAMPLE_CONVERSATIONS, type Conversation, type MessageChannel } from "~/lib/placeholder-data";

export function meta() {
  return [{ title: "Messages | Collabo CRM" }];
}

/* ─── Channel display configuration ────────────────────────────── */

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
  whatsapp: "bg-[#CEF17B]/30 text-[#084734]",
  chat: "bg-purple-100 text-purple-700",
};

/* ─── Avatar helpers ───────────────────────────────────────────── */

/** Rotating palette for message avatar backgrounds. */
const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-[#CEF17B]/30 text-[#084734]",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-indigo-100 text-indigo-700",
];

/** Derive two-letter initials from a full name string. */
function getInitials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

/**
 * Messages page — two-panel messaging interface with a conversation
 * list on the left and a message thread on the right.
 */
export default function MessagesPage() {
  const [activeConversationId, setActiveConversationId] = useState<string>(SAMPLE_CONVERSATIONS[0].id);
  const [searchQuery, setSearchQuery] = useState("");

  /** Filter conversations by customer name or message preview. */
  const filteredConversations = SAMPLE_CONVERSATIONS.filter((conversation) =>
    conversation.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conversation.preview.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeConversation = SAMPLE_CONVERSATIONS.find((conversation) => conversation.id === activeConversationId) ?? SAMPLE_CONVERSATIONS[0];
  const activeConversationIndex = SAMPLE_CONVERSATIONS.findIndex((conversation) => conversation.id === activeConversationId);

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Messages</h1>
        <p className="text-sm text-muted-foreground">
          Unified inbox for all customer conversations across channels.
        </p>
      </div>

      {/* Two-panel layout */}
      <div className="flex h-[calc(100vh-200px)] min-h-[520px] overflow-hidden rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border">

        {/* ── Left sidebar — conversation list ── */}
        <div className="flex w-72 shrink-0 flex-col border-r">
          {/* Search */}
          <div className="border-b p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search conversations…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-gray-50 dark:bg-gray-800/60 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#CEF17B]/50"
              />
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.map((conversation, listIndex) => {
              const isSelected = conversation.id === activeConversationId;
              const avatarColor = AVATAR_COLORS[listIndex % AVATAR_COLORS.length];
              return (
                <button
                  key={conversation.id}
                  onClick={() => setActiveConversationId(conversation.id)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60 ${
                    isSelected ? "bg-[#CEF17B]/15 border-r-2 border-r-[#CEF17B]" : ""
                  }`}
                >
                  <div className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColor}`}>
                    {getInitials(conversation.customerName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className={`truncate text-xs font-semibold ${isSelected ? "text-[#084734]" : "text-gray-900 dark:text-gray-100"}`}>
                        {conversation.customerName}
                      </p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{conversation.time}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium ${CHANNEL_CLASS[conversation.channel]}`}>
                        {CHANNEL_ICON[conversation.channel]}
                        {CHANNEL_LABEL[conversation.channel]}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{conversation.preview}</p>
                  </div>
                  {conversation.unread > 0 && (
                    <span className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-[#CEF17B] text-[10px] font-bold text-gray-900">
                      {conversation.unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Right panel — active conversation view ── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Conversation header */}
          <div className="flex items-center gap-3 border-b px-5 py-4">
            <div className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${AVATAR_COLORS[activeConversationIndex % AVATAR_COLORS.length]}`}>
              {getInitials(activeConversation.customerName)}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{activeConversation.customerName}</p>
              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${CHANNEL_CLASS[activeConversation.channel]}`}>
                {CHANNEL_ICON[activeConversation.channel]}
                {CHANNEL_LABEL[activeConversation.channel]}
              </span>
            </div>
          </div>

          {/* Message thread */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {activeConversation.messages.map((message) => {
              const isAgentMessage = message.sender === "agent";
              return (
                <div
                  key={message.id}
                  className={`flex gap-2.5 ${isAgentMessage ? "flex-row-reverse" : ""}`}
                >
                  {!isAgentMessage && (
                    <div className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${AVATAR_COLORS[activeConversationIndex % AVATAR_COLORS.length]}`}>
                      {getInitials(activeConversation.customerName)}
                    </div>
                  )}
                  {isAgentMessage && (
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#CEF17B]/30 text-[10px] font-bold text-[#084734]">
                      Me
                    </div>
                  )}
                  <div className={`max-w-[70%] ${isAgentMessage ? "items-end" : "items-start"} flex flex-col gap-1`}>
                    <div className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      isAgentMessage
                        ? "bg-[#CEF17B] text-gray-900 rounded-tr-sm"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-sm"
                    }`}>
                      {message.text}
                    </div>
                    <span className="text-[10px] text-muted-foreground px-1">{message.time}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Compose area */}
          <div className="border-t px-4 py-3">
            <div className="flex items-center gap-2 rounded-xl border border-input bg-gray-50 dark:bg-gray-800/60 px-3 py-2">
              <input
                type="text"
                placeholder="Type a message…"
                className="flex-1 bg-transparent text-xs focus:outline-none placeholder:text-muted-foreground"
              />
              <button className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#CEF17B] text-gray-900 hover:bg-[#BADE6F] transition-colors">
                <Send className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
