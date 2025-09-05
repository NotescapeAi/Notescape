import React, { useEffect, useState } from "react";

type Card = {
  id: string; class_id: number; source_chunk_id?: number;
  question: string; answer: string; hint?: string;
  difficulty?: string; tags?: string[];
};

export default function FlashcardsPanel({ classId }: { classId: number }) {
  const [topic, setTopic] = useState("");
  const [nCards, setNCards] = useState(10);
  const [topK, setTopK] = useState(12);
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    const r = await fetch(`/flashcards/${classId}`);
    if (!r.ok) { setError(await r.text()); return; }
    setCards(await r.json());
  }
  useEffect(() => { refresh(); }, [classId]);

  async function ensureEmbeddings() {
    await fetch(`/flashcards/ensure-embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 1000 }),
    });
  }

  async function generate() {
    try {
      setLoading(true); setError(null);
      // build embeddings for this class + backfill any missing ones
      await fetch(`/api/embeddings/build?class_id=${classId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_size: 64 }),
      });
      await ensureEmbeddings();
      // generate cards
      const r = await fetch(`/flashcards/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: classId,
          topic: topic || undefined,
          top_k: topK,
          n_cards: nCards,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      await refresh();
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/flashcards/${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div className="mt-8">
      <h2 className="text-xl font-semibold mb-3">Flashcards</h2>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="border rounded px-3 py-2 flex-1 min-w-[260px]"
          placeholder="Optional topic to steer"
          value={topic} onChange={e=>setTopic(e.target.value)}
        />
        <label className="text-sm">n_cards</label>
        <input type="number" min={1} max={50} className="w-20 border rounded px-2 py-2"
          value={nCards} onChange={e=>setNCards(parseInt(e.target.value||"10"))}/>
        <label className="text-sm">top_k</label>
        <input type="number" min={1} max={100} className="w-20 border rounded px-2 py-2"
          value={topK} onChange={e=>setTopK(parseInt(e.target.value||"12"))}/>
        <button className="px-4 py-2 rounded bg-purple-600 text-white disabled:opacity-50"
          onClick={generate} disabled={loading}>
          {loading ? "Working..." : "Generate Flashcards"}
        </button>
        <button className="px-3 py-2 rounded border" onClick={refresh}>Refresh</button>
      </div>

      {error && <div className="mt-3 text-red-600 text-sm whitespace-pre-wrap">{error}</div>}

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(c => <FlipCard key={c.id} card={c} onDelete={() => remove(c.id)} />)}
        {!cards.length && <div className="text-gray-500">No flashcards yet.</div>}
      </div>
    </div>
  );
}

function FlipCard({ card, onDelete }: { card: Card; onDelete: () => void }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className="relative" onClick={()=>setFlipped(!flipped)}>
      <style>
        {`.flip{perspective:1000px}.flip-inner{transition:transform .6s;transform-style:preserve-3d;position:relative;}
          .flipped .flip-inner{transform:rotateY(180deg)}
          .flip-face{backface-visibility:hidden;position:absolute;inset:0}
          .flip-back{transform:rotateY(180deg)}`}
      </style>
      <div className={`flip ${flipped ? "flipped" : ""}`}>
        <div className="flip-inner">
          <div className="flip-face rounded-xl shadow p-4 bg-white border">
            <div className="text-xs uppercase text-gray-500 mb-2">{card.difficulty || "medium"}</div>
            <div className="font-medium">{card.question}</div>
            <div className="mt-3 text-xs text-gray-500">Click to flip</div>
            <button className="absolute top-2 right-2 text-xs border rounded px-2 py-1"
              onClick={(e)=>{e.stopPropagation(); onDelete();}}>Delete</button>
          </div>
          <div className="flip-face flip-back rounded-xl shadow p-4 bg-white border">
            <div className="font-semibold">Answer</div>
            <div className="mt-2 whitespace-pre-wrap">{card.answer}</div>
            {card.hint && <div className="mt-3 text-sm text-gray-600 italic">Hint: {card.hint}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
