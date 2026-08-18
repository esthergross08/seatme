"use client";

import { useEffect, useState } from "react";
import { Sparkles, AlertTriangle, Loader2, Check, RefreshCw } from "lucide-react";

const C = {
  ink: "#221F2B",
  paper: "#F7F3EA",
  card: "#FFFFFF",
  gold: "#A8823C",
  goldSoft: "#E7D9B8",
  wine: "#8C3B3B",
  sage: "#54704F",
  line: "#E4DCC9",
  muted: "#8A8272",
};

interface Board {
  id: string;
  name: string;
  description?: string;
  pinCount?: number;
  privacy?: string;
}

interface Pin {
  id: string;
  imageUrl: string | null;
  title?: string;
  description?: string;
}

export interface DecorPanelProps {
  eventId: string;
  readOnly: boolean;
}

export default function DecorPanel({ eventId, readOnly }: DecorPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [selectedBoardName, setSelectedBoardName] = useState<string | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [pinsLoading, setPinsLoading] = useState(false);
  const [showAllPins, setShowAllPins] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  async function loadBoards() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pinterest/boards?eventId=${eventId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load Pinterest boards.");
      setConnected(!!data.connected);
      setBoards(data.boards || []);
      setSelectedBoardId(data.selectedBoardId || null);
      setSelectedBoardName(data.selectedBoardName || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load Pinterest boards.");
    } finally {
      setLoading(false);
    }
  }

  async function loadPins() {
    setPinsLoading(true);
    setShowAllPins(false);
    try {
      const res = await fetch(`/api/pinterest/pins?eventId=${eventId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load pins.");
      setPins(data.pins || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load pins.");
    } finally {
      setPinsLoading(false);
    }
  }

  useEffect(() => {
    // Show a one-time toast from the OAuth redirect, then clean the URL.
    const params = new URLSearchParams(window.location.search);
    const pinterestStatus = params.get("pinterest");
    if (pinterestStatus === "connected") {
      setBanner("Pinterest connected.");
    } else if (pinterestStatus === "error") {
      setError(`Couldn't connect Pinterest (${params.get("reason") || "unknown error"}). Try again.`);
    }
    if (pinterestStatus) {
      params.delete("pinterest");
      params.delete("reason");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
    loadBoards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useEffect(() => {
    if (connected && selectedBoardId) loadPins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, selectedBoardId]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  async function chooseBoard(board: Board) {
    setError(null);
    try {
      const res = await fetch("/api/pinterest/select-board", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, boardId: board.id, boardName: board.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save that board.");
      setSelectedBoardId(board.id);
      setSelectedBoardName(board.name);
      setSuggestion(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that board.");
    }
  }

  async function disconnect() {
    setError(null);
    try {
      const res = await fetch("/api/pinterest/disconnect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Couldn't disconnect.");
      }
      setConnected(false);
      setBoards([]);
      setSelectedBoardId(null);
      setSelectedBoardName(null);
      setPins([]);
      setSuggestion(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't disconnect.");
    }
  }

  async function suggestDecor() {
    setSuggestLoading(true);
    setError(null);
    setSuggestion(null);
    try {
      const res = await fetch("/api/pinterest/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't generate a suggestion.");
      setSuggestion(data.suggestion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate a suggestion.");
    } finally {
      setSuggestLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl flex items-center gap-2 text-sm" style={{ color: C.muted }}>
        <Loader2 size={15} className="animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <div className="text-xs tracking-[0.18em] uppercase font-semibold" style={{ color: C.gold, fontFamily: "Inter, sans-serif" }}>
          Step four
        </div>
        <h2 className="text-2xl mt-1" style={{ fontFamily: "Fraunces, serif", color: C.ink }}>
          Decor ideas
        </h2>
      </div>
      <p className="text-sm mb-6" style={{ color: C.muted }}>
        Connect your inspiration board on Pinterest and get table decor suggestions grounded in what you&apos;ve
        actually pinned. Decor inspiration image generation and shop recommendations coming soon!
      </p>

      {banner && (
        <div className="mb-4 p-2.5 rounded-lg text-xs flex items-center gap-2" style={{ backgroundColor: "#EEF2EA", color: C.sage }}>
          <Check size={14} /> {banner}
        </div>
      )}
      {error && (
        <div className="mb-4 p-2.5 rounded-lg text-xs flex items-center gap-2" style={{ backgroundColor: "#F3E4E4", color: C.wine }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {!connected && (
        <div className="p-5 rounded-xl border" style={{ borderColor: C.line, backgroundColor: C.card }}>
          <p className="text-sm mb-3" style={{ color: C.ink }}>
            No Pinterest board connected yet for this event.
          </p>
          {readOnly ? (
            <p className="text-xs" style={{ color: C.muted }}>
              Only an owner or editor can connect Pinterest.
            </p>
          ) : (
            <a
              href={`/api/pinterest/connect?eventId=${eventId}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg"
              style={{ backgroundColor: C.gold, color: "#fff", textDecoration: "none" }}
            >
              Connect Pinterest
            </a>
          )}
        </div>
      )}

      {connected && !selectedBoardId && (
        <div className="p-5 rounded-xl border" style={{ borderColor: C.line, backgroundColor: C.card }}>
          <p className="text-sm mb-3 font-medium" style={{ color: C.ink }}>
            Pick your event&apos;s board
          </p>
          {boards.length === 0 ? (
            <p className="text-xs" style={{ color: C.muted }}>
              No boards found on your Pinterest account.
            </p>
          ) : (
            <div className="space-y-2">
              {boards.map((b) => (
                <button
                  key={b.id}
                  onClick={() => chooseBoard(b)}
                  disabled={readOnly}
                  className="w-full text-left px-3 py-2 rounded-lg border text-sm disabled:opacity-40"
                  style={{ borderColor: C.line, color: C.ink }}
                >
                  <span className="font-medium">{b.name}</span>
                  {typeof b.pinCount === "number" && (
                    <span className="ml-2 text-xs" style={{ color: C.muted }}>
                      {b.pinCount} pin{b.pinCount === 1 ? "" : "s"}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {connected && selectedBoardId && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm" style={{ color: C.ink }}>
              Using board: <strong>{selectedBoardName}</strong>
            </div>
            {!readOnly && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setSelectedBoardId(null);
                    setSelectedBoardName(null);
                    setPins([]);
                    setSuggestion(null);
                  }}
                  className="text-xs font-medium underline underline-offset-2"
                  style={{ color: C.muted }}
                >
                  Change board
                </button>
                <button onClick={disconnect} className="text-xs font-medium underline underline-offset-2" style={{ color: C.wine }}>
                  Disconnect
                </button>
              </div>
            )}
          </div>

          {pinsLoading ? (
            <div className="flex items-center gap-2 text-sm mb-4" style={{ color: C.muted }}>
              <Loader2 size={14} className="animate-spin" /> Loading pins…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-2">
                {(() => {
                  const withImages = pins.filter((p) => p.imageUrl);
                  const visible = showAllPins ? withImages : withImages.slice(0, 3);
                  return visible.map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={p.id}
                      src={p.imageUrl!}
                      alt={p.title || p.description || "Pinned image"}
                      className="w-full aspect-square object-cover rounded-lg border"
                      style={{ borderColor: C.line }}
                    />
                  ));
                })()}
                {pins.length === 0 && (
                  <div className="col-span-full text-xs" style={{ color: C.muted }}>
                    No pins found on this board yet.
                  </div>
                )}
              </div>
              {pins.filter((p) => p.imageUrl).length > 3 && (
                <button
                  onClick={() => setShowAllPins((v) => !v)}
                  className="mb-4 text-xs font-medium underline underline-offset-2"
                  style={{ color: C.muted }}
                >
                  {showAllPins ? "Show fewer" : `Show all ${pins.filter((p) => p.imageUrl).length} pins`}
                </button>
              )}
              {pins.filter((p) => p.imageUrl).length <= 3 && <div className="mb-4" />}
            </>
          )}

          {!readOnly && (
            <button
              onClick={suggestDecor}
              disabled={suggestLoading || pins.length === 0}
              className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40 mb-4"
              style={{ backgroundColor: C.gold, color: "#fff" }}
            >
              {suggestLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {suggestLoading ? "Thinking…" : suggestion ? "Suggest again" : "Suggest decor"}
            </button>
          )}

          {suggestion &&
            (() => {
              const lines = suggestion.split("\n").map((l) => l.trim()).filter(Boolean);
              const bullets = lines.filter((l) => l.startsWith("-")).map((l) => l.replace(/^-+\s*/, ""));
              const intro = lines.find((l) => !l.startsWith("-"));
              return (
                <div className="p-4 rounded-xl text-sm leading-relaxed mb-4" style={{ backgroundColor: C.goldSoft, color: C.ink }}>
                  {intro && <p className="mb-2">{intro}</p>}
                  {bullets.length > 0 ? (
                    <ul className="list-disc pl-5 space-y-1">
                      {bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  ) : (
                    !intro && <p>{suggestion}</p>
                  )}
                </div>
              );
            })()}
        </div>
      )}

      {connected && (
        <button onClick={loadBoards} className="mt-4 flex items-center gap-1.5 text-xs" style={{ color: C.muted }}>
          <RefreshCw size={12} /> Refresh
        </button>
      )}
    </div>
  );
}
