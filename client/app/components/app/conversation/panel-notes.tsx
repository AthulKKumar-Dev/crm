import { useState, type KeyboardEvent } from "react";

import { Input } from "~/components/ui/input";
import { formatBubbleTime } from "~/lib/conversation-format";
import type { InternalNote } from "~/types/api";

/**
 * The notes list in the customer panel, with an inline add.
 *
 * The same notes the thread renders inline — one entity, two places. The
 * thread shows them in context; the panel is where an agent scans "what does
 * the team already know" without reading the whole conversation.
 *
 * Enter commits, Escape abandons. Same interaction as the customer TagsSection,
 * so the muscle memory carries across the app.
 */
export function PanelNotes({
  notes,
  onAddNote,
  isSaving,
}: {
  notes: InternalNote[];
  onAddNote: (body: string) => void;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const trimmed = draft.trim();
    if (!trimmed || isSaving) return;
    onAddNote(trimmed);
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      setDraft("");
      event.currentTarget.blur();
    }
  }

  // Newest first here, unlike the thread: the panel is a reference list, and
  // the most recent note is the one most likely to still be relevant.
  const ordered = [...notes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="space-y-2">
      {ordered.map((note) => (
        <div
          key={note.id}
          className="rounded-lg border-l-2 border-warning bg-warning-subtle px-2.5 py-2"
        >
          <p className="text-caption whitespace-pre-wrap break-words text-foreground">
            {note.body}
          </p>
          <p className="mt-1 text-micro text-muted-foreground">
            {note.author.name} · {formatBubbleTime(note.createdAt)}
          </p>
        </div>
      ))}

      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        disabled={isSaving}
        aria-label="Add an internal note"
        placeholder="Add a note — only your team sees it"
        className="text-caption"
      />
    </div>
  );
}
