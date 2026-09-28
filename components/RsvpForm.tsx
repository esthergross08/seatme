"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";

const C = {
  ink: "#221F2B",
  gold: "#A8823C",
  goldSoft: "#E7D9B8",
  line: "#E4DCC9",
  muted: "#736D5F",
  sage: "#54704F",
  wine: "#8C3B3B",
};

type Step = "name" | "details" | "done";

// The single `note` field on a guest record (also used elsewhere in the planner,
// e.g. seat-map tooltips) is where dietary + open-comment answers both end up —
// there's no separate column for each. When both are collected we combine them
// with a "Dietary: " label so they stay distinguishable; splitting them back out
// for editing is best-effort only, since a planner could toggle these on/off
// between visits.
function splitExistingNote(raw: string, collectDietary: boolean, collectComments: boolean) {
  if (!raw) return { dietary: "", comments: "" };
  if (collectDietary && collectComments) {
    const match = raw.match(/^Dietary:\s*([\s\S]*?)(?:\s*\|\s*([\s\S]*))?$/);
    if (match) return { dietary: match[1] || "", comments: match[2] || "" };
    return { dietary: "", comments: raw };
  }
  if (collectDietary) return { dietary: raw.replace(/^Dietary:\s*/, ""), comments: "" };
  if (collectComments) return { dietary: "", comments: raw };
  return { dietary: "", comments: "" };
}

function combineNote(dietary: string, comments: string, collectDietary: boolean, collectComments: boolean) {
  const parts: string[] = [];
  if (collectDietary && dietary.trim()) parts.push(`Dietary: ${dietary.trim()}`);
  if (collectComments && comments.trim()) parts.push(collectDietary ? `| ${comments.trim()}` : comments.trim());
  return parts.join(" ");
}

export default function RsvpForm({
  eventId,
  collectDietary,
  collectComments,
  mealOptions,
}: {
  eventId: string;
  collectDietary: boolean;
  collectComments: boolean;
  mealOptions: string[];
}) {
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [guestId, setGuestId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [attending, setAttending] = useState<"attending" | "declined" | null>(null);
  const [mealChoice, setMealChoice] = useState("");
  const [dietary, setDietary] = useState("");
  const [comments, setComments] = useState("");

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rsvp/${eventId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "lookup", name }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Something went wrong.");
        return;
      }
      setGuestId(json.guestId);
      setGuestName(json.name);
      setAttending(json.rsvpStatus === "declined" ? "declined" : json.rsvpStatus === "attending" ? "attending" : null);
      setMealChoice(mealOptions.includes(json.mealChoice) ? json.mealChoice : "");
      const split = splitExistingNote(json.note || "", collectDietary, collectComments);
      setDietary(split.dietary);
      setComments(split.comments);
      setStep("details");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!attending || !guestId) return;
    setLoading(true);
    setError(null);
    try {
      const note = combineNote(dietary, comments, collectDietary, collectComments);
      const res = await fetch(`/api/rsvp/${eventId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "submit", guestId, rsvpStatus: attending, mealChoice, note }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Something went wrong.");
        return;
      }
      setStep("done");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "done") {
    return (
      <div className="text-center py-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: C.goldSoft, color: C.gold }}
        >
          <Check size={22} />
        </div>
        <h2 className="text-lg mb-1" style={{ fontFamily: "Fraunces, serif", color: C.ink }}>
          Thanks, {guestName.split(" ")[0]}!
        </h2>
        <p className="text-sm" style={{ color: C.muted }}>
          {attending === "attending" ? "You're all set — see you there." : "Thanks for letting us know."}
        </p>
        <button
          onClick={() => setStep("details")}
          className="text-xs mt-4 underline"
          style={{ color: C.muted }}
        >
          Need to change something?
        </button>
      </div>
    );
  }

  if (step === "details") {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm" style={{ color: C.ink }}>
          Hi {guestName.split(" ")[0]}! Will you be able to make it?
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAttending("attending")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border text-sm font-medium"
            style={{
              borderColor: attending === "attending" ? C.sage : C.line,
              backgroundColor: attending === "attending" ? "#EEF2EA" : "transparent",
              color: attending === "attending" ? C.sage : C.ink,
            }}
          >
            <Check size={14} /> Attending
          </button>
          <button
            type="button"
            onClick={() => setAttending("declined")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border text-sm font-medium"
            style={{
              borderColor: attending === "declined" ? C.wine : C.line,
              backgroundColor: attending === "declined" ? "#F3E4E4" : "transparent",
              color: attending === "declined" ? C.wine : C.ink,
            }}
          >
            <X size={14} /> Can't make it
          </button>
        </div>

        {attending === "attending" && (
          <>
            {mealOptions.length > 0 && (
              <label className="text-sm">
                <span className="block mb-1 font-medium" style={{ color: C.ink }}>
                  Meal choice
                </span>
                <select
                  value={mealChoice}
                  onChange={(e) => setMealChoice(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none bg-white"
                  style={{ borderColor: C.line, color: C.ink }}
                >
                  <option value="">Select…</option>
                  {mealOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {collectDietary && (
              <label className="text-sm">
                <span className="block mb-1 font-medium" style={{ color: C.ink }}>
                  Dietary restrictions (optional)
                </span>
                <textarea
                  value={dietary}
                  onChange={(e) => setDietary(e.target.value)}
                  placeholder="Allergies, gluten-free, vegetarian…"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                  style={{ borderColor: C.line, color: C.ink }}
                />
              </label>
            )}
            {collectComments && (
              <label className="text-sm">
                <span className="block mb-1 font-medium" style={{ color: C.ink }}>
                  Anything else? (optional)
                </span>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="High chair, accessibility needs, a note for the couple…"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                  style={{ borderColor: C.line, color: C.ink }}
                />
              </label>
            )}
          </>
        )}

        {error && (
          <p className="text-xs" style={{ color: C.wine }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!attending || loading}
          className="py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ backgroundColor: C.gold, color: "#fff" }}
        >
          {loading ? "Sending…" : "Send RSVP"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleLookup} className="flex flex-col gap-3">
      <label className="text-sm">
        <span className="block mb-1 font-medium" style={{ color: C.ink }}>
          Your full name
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="As it appears on your invitation"
          autoFocus
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
          style={{ borderColor: C.line, color: C.ink }}
        />
      </label>
      {error && (
        <p className="text-xs" style={{ color: C.wine }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!name.trim() || loading}
        className="py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
        style={{ backgroundColor: C.gold, color: "#fff" }}
      >
        {loading ? "Looking…" : "Find my invitation"}
      </button>
    </form>
  );
}
