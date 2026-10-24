"use client";

// The event's Overview tab: a countdown, the key numbers, what needs
// attention and the next steps — the "home" of an event. Everything is
// computed by SeatingPlanner from its live state and passed in, so this
// updates as you work and holds no state of its own.

import type { ReactNode } from "react";
import { AlertTriangle, CalendarDays, Check, ChevronRight, MapPin } from "lucide-react";
import { C, FONT } from "@/lib/theme";

export type OverviewTab = "setup" | "guests" | "seating" | "decor";

export interface EventOverviewProps {
  eventName: string;
  eventDate: string; // "YYYY-MM-DD" or ""
  location: string;
  readOnly: boolean;
  guestsTotal: number;
  activeGuests: number; // not declined
  attending: number;
  pending: number;
  declined: number;
  seated: number;
  totalSeats: number;
  tablesCount: number;
  maxCapacity: number | null;
  rulesCount: number;
  rulesBroken: number;
  notedGuests: number;
  rsvpEnabled: boolean;
  meals: { choice: string; count: number }[];
  onGoTo: (tab: OverviewTab) => void;
  onOpenRsvpSettings: () => void;
}

// Days from today to a plain calendar date (no timezone shift).
function daysUntil(dateStr: string): number | null {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / (24 * 60 * 60 * 1000));
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function countdownText(days: number | null): string {
  if (days === null) return "";
  if (days > 1) return `${days} days to go`;
  if (days === 1) return "Tomorrow";
  if (days === 0) return "Today";
  if (days === -1) return "Yesterday";
  return `${-days} days ago`;
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border p-4 ${className}`} style={{ backgroundColor: C.card, borderColor: C.line }}>
      {children}
    </div>
  );
}

function Stat({ label, value, sub, progress }: { label: string; value: string; sub?: string; progress?: number }) {
  return (
    <Card>
      <div className="text-[11px] uppercase tracking-wide font-semibold mb-1" style={{ color: C.muted }}>
        {label}
      </div>
      <div className="text-2xl" style={{ fontFamily: FONT.display, color: C.ink }}>
        {value}
      </div>
      {progress !== undefined && (
        <div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{ backgroundColor: C.line }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`, backgroundColor: progress >= 1 ? C.sage : C.gold }}
          />
        </div>
      )}
      {sub && (
        <div className="text-xs mt-1.5" style={{ color: C.muted }}>
          {sub}
        </div>
      )}
    </Card>
  );
}

interface Item {
  key: string;
  text: string;
  action?: string;
  onClick?: () => void;
  tone: "warn" | "info";
}

export default function EventOverview(p: EventOverviewProps) {
  const days = p.eventDate ? daysUntil(p.eventDate) : null;
  const spareSeats = p.totalSeats - p.activeGuests;
  const unseated = Math.max(0, p.activeGuests - p.seated);
  const hasRsvpData = p.attending + p.declined > 0 || p.rsvpEnabled;

  // What needs attention, most urgent first. Only actionable, current problems.
  const attention: Item[] = [];
  if (p.rulesBroken > 0)
    attention.push({
      key: "rules",
      tone: "warn",
      text: `${p.rulesBroken} seating ${p.rulesBroken === 1 ? "rule is" : "rules are"} broken by the current plan`,
      action: "Review",
      onClick: () => p.onGoTo("seating"),
    });
  if (p.tablesCount > 0 && spareSeats < 0)
    attention.push({
      key: "seats",
      tone: "warn",
      text: `${-spareSeats} more ${-spareSeats === 1 ? "seat is" : "seats are"} needed for everyone attending`,
      action: "Add tables",
      onClick: () => p.onGoTo("setup"),
    });
  if (p.maxCapacity !== null && p.activeGuests > p.maxCapacity)
    attention.push({
      key: "capacity",
      tone: "warn",
      text: `${p.activeGuests} guests, over the venue's capacity of ${p.maxCapacity}`,
      action: "Guest list",
      onClick: () => p.onGoTo("guests"),
    });
  if (p.seated > 0 && unseated > 0)
    attention.push({
      key: "unseated",
      tone: "info",
      text: `${unseated} ${unseated === 1 ? "guest isn't" : "guests aren't"} seated yet`,
      action: "Seat them",
      onClick: () => p.onGoTo("seating"),
    });
  if (p.rsvpEnabled && p.pending > 0)
    attention.push({
      key: "pending",
      tone: "info",
      text: `${p.pending} ${p.pending === 1 ? "RSVP is" : "RSVPs are"} still pending`,
      action: "See who",
      onClick: () => p.onGoTo("guests"),
    });

  // Getting-started steps, in the order the app works.
  const steps = [
    { key: "tables", done: p.tablesCount > 0, text: "Set up your tables", tab: "setup" as const },
    { key: "guests", done: p.guestsTotal > 0, text: "Add your guest list", tab: "guests" as const },
    { key: "plan", done: p.seated > 0, text: "Generate a seating plan", tab: "seating" as const },
    { key: "rsvp", done: p.rsvpEnabled, text: "Share an RSVP link with guests", tab: null },
  ];
  const stepsLeft = steps.filter((s) => !s.done);

  return (
    <div className="max-w-3xl flex flex-col gap-5">
      {/* Countdown + event details */}
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] font-semibold mb-1" style={{ color: C.gold }}>
          Overview
        </div>
        <h2 className="text-3xl leading-tight" style={{ fontFamily: FONT.display, color: C.ink }}>
          {p.eventDate ? countdownText(days) : p.eventName}
        </h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm" style={{ color: C.muted }}>
          {p.eventDate ? (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={14} /> {formatDate(p.eventDate)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={14} /> Add a date in the event details above to see a countdown
            </span>
          )}
          {p.location && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={14} /> {p.location}
            </span>
          )}
        </div>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Guests"
          value={String(p.activeGuests)}
          sub={p.declined > 0 ? `${p.declined} declined · ${p.guestsTotal} invited` : `${p.guestsTotal} invited`}
        />
        <Stat
          label="Seated"
          value={p.activeGuests > 0 ? `${p.seated} / ${p.activeGuests}` : "—"}
          progress={p.activeGuests > 0 ? p.seated / p.activeGuests : undefined}
        />
        <Stat
          label="Seats"
          value={String(p.totalSeats)}
          sub={
            p.tablesCount === 0
              ? "No tables yet"
              : `${p.tablesCount} ${p.tablesCount === 1 ? "table" : "tables"} · ${
                  spareSeats >= 0 ? `${spareSeats} spare` : `${-spareSeats} short`
                }`
          }
        />
        {hasRsvpData ? (
          <Stat
            label="RSVPs"
            value={`${p.attending} yes`}
            sub={`${p.pending} pending · ${p.declined} declined`}
            progress={p.guestsTotal > 0 ? (p.attending + p.declined) / p.guestsTotal : undefined}
          />
        ) : (
          <Stat label="Rules" value={String(p.rulesCount)} sub={p.rulesCount === 0 ? "None yet" : `${p.rulesBroken} broken`} />
        )}
      </div>

      {/* Needs attention */}
      {p.guestsTotal > 0 && (
        <Card>
          <div className="text-sm font-semibold mb-2" style={{ color: C.ink }}>
            {attention.length > 0 ? "Needs attention" : "Everything's on track"}
          </div>
          {attention.length === 0 ? (
            <p className="text-sm" style={{ color: C.muted }}>
              No broken rules, enough seats{p.seated > 0 ? ", and everyone attending has a seat" : ""}.
            </p>
          ) : (
            <ul className="flex flex-col divide-y" style={{ borderColor: C.line }}>
              {attention.map((it) => (
                <li key={it.key} className="flex items-center gap-3 py-2.5" style={{ borderColor: C.line }}>
                  <AlertTriangle size={15} className="shrink-0" style={{ color: it.tone === "warn" ? C.wine : C.gold }} />
                  <span className="text-sm flex-1" style={{ color: C.ink }}>
                    {it.text}
                  </span>
                  {it.onClick && (
                    <button
                      onClick={it.onClick}
                      className="text-xs font-semibold inline-flex items-center gap-0.5 shrink-0"
                      style={{ color: C.gold }}
                    >
                      {it.action} <ChevronRight size={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Next steps (hidden once all done) */}
      {stepsLeft.length > 0 && !p.readOnly && (
        <Card>
          <div className="text-sm font-semibold mb-2" style={{ color: C.ink }}>
            {stepsLeft.length === steps.length ? "Get started" : "Next steps"}
          </div>
          <ul className="flex flex-col gap-1">
            {steps.map((s) => (
              <li key={s.key}>
                <button
                  onClick={() => (s.tab ? p.onGoTo(s.tab) : p.onOpenRsvpSettings())}
                  disabled={s.done}
                  className="w-full flex items-center gap-2.5 py-1.5 text-left text-sm disabled:cursor-default"
                  style={{ color: s.done ? C.muted : C.ink }}
                >
                  <span
                    className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0"
                    style={{
                      borderColor: s.done ? C.sage : C.line,
                      backgroundColor: s.done ? C.sage : "transparent",
                    }}
                  >
                    {s.done && <Check size={12} color="#fff" />}
                  </span>
                  <span className={`flex-1 ${s.done ? "line-through" : ""}`}>{s.text}</span>
                  {!s.done && <ChevronRight size={14} style={{ color: C.gold }} />}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Meals and notes, for the caterer */}
      {(p.meals.length > 0 || p.notedGuests > 0) && (
        <Card>
          <div className="text-sm font-semibold mb-2" style={{ color: C.ink }}>
            For the caterer
          </div>
          {p.meals.length > 0 && (
            <ul className="text-sm flex flex-col gap-1 mb-2" style={{ color: C.ink }}>
              {p.meals.slice(0, 6).map((m) => (
                <li key={m.choice} className="flex justify-between gap-3">
                  <span className="truncate">{m.choice}</span>
                  <span style={{ color: C.muted }}>{m.count}</span>
                </li>
              ))}
            </ul>
          )}
          {p.notedGuests > 0 && (
            <button
              onClick={() => p.onGoTo("guests")}
              className="text-xs font-semibold inline-flex items-center gap-0.5"
              style={{ color: C.gold }}
            >
              {p.notedGuests} {p.notedGuests === 1 ? "guest has a note" : "guests have notes"} (dietary, access…){" "}
              <ChevronRight size={13} />
            </button>
          )}
        </Card>
      )}
    </div>
  );
}
