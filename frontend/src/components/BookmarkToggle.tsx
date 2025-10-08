// src/components/BookmarkToggle.tsx
import React from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import useBookmarks from "../lib/bookmarks"; // your path

export default function BookmarkToggle({ id }: { id: string | number }) {
  const bm = useBookmarks();
  const marked = bm.isBookmarked(id);

  return (
    <button
      onClick={() => bm.toggle(id)}
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-[12px] hover:bg-slate-50"
      title={marked ? "Remove bookmark" : "Bookmark this card"}
    >
      {marked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
      <span>{marked ? "Bookmarked" : "Bookmark"}</span>
    </button>
  );
}
