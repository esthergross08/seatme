"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Plus,
  Trash2,
  Wand2,
  Users,
  LayoutGrid,
  Table2,
  X,
  AlertTriangle,
  Check,
  Sparkles,
  Upload,
  Palette,
  Download,
  FileImage,
  FileText,
  StickyNote,
  Link2,
  Shuffle,
  Undo2,
  Search,
  Share2,
  ClipboardCheck,
  Copy,
  Minus,
  Maximize2,
  Minimize2,
  Move,
  Pencil,
  MapPin,
  RotateCw,
  MessageCircle,
  LayoutDashboard,
} from "lucide-react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";
import InviteForm from "./InviteForm";
import AgentChat from "./AgentChat";
import DecorPanel from "./DecorPanel";
import { useMapViewport } from "./useMapViewport";
import type { AgentOperation, AgentOperationType, AgentApplyResult } from "@/lib/agentOperations";
import {
  getPosterLayout,
  getPosterPalette,
  getPosterFont,
  migrateLegacyPosterTemplate,
  DEFAULT_POSTER_LAYOUT,
  DEFAULT_POSTER_PALETTE,
  DEFAULT_POSTER_FONT,
} from "@/lib/posterTemplates";
import { C, FONT } from "@/lib/theme";
import { SignedImg, SignedLink } from "@/components/StorageFile";
import EventOverview from "@/components/EventOverview";
import {
  escapeHtml,
  eventInitials,
  formatPosterDate,
  genId,
  guestContextLine,
  guestInitials,
} from "@/lib/planner/utils";
import {
  Constraint,
  FIXTURE_DEFAULTS,
  FIXTURE_MIN_M,
  FillMode,
  Fixture,
  FixtureType,
  FloorPlan,
  GROUP_COLORS,
  Group,
  Guest,
  MenuCourse,
  PX_PER_M,
  RULE_SHORT,
  RsvpStatus,
  RuleType,
  SeatAssignment,
  SeatingPlannerProps,
  TableGroup,
  TableShape,
  fixtureSizeM,
  formatM,
  mergeRemoteRsvps,
  roundM,
} from "@/lib/planner/types";
import {
  FloorBox,
  Seat,
  Table,
  buildSeats,
  buildTables,
  computeLayout,
  makeRoom,
  minSeatSpacing,
  normDeg,
  rectSeatRoles,
  rotateOffset,
  rotatedHalfExtents,
  seatOffset,
  shapeRadius,
  snapDeg,
} from "@/lib/planner/layout";
import {
  aggregateConstraintStatus,
  buildAutoGroupPairs,
  computeFlatViolations,
  expandAllConstraints,
  pickConsolidatedTables,
  solveSeating,
} from "@/lib/planner/rules";
import {
  parseGuestRows,
} from "@/lib/planner/guestImport";
import { PlannerContext, usePlannerState } from "@/components/planner/usePlannerState";
import { IconBtn, SectionTitle, MapMenuButton, FixtureSizeEditor, SettingRow } from "@/components/planner/ui";
import OverviewTab from "@/components/planner/OverviewTab";
import TablesTab from "@/components/planner/TablesTab";
import GuestsTab from "@/components/planner/GuestsTab";
import SeatingTab from "@/components/planner/SeatingTab";
import DecorTab from "@/components/planner/DecorTab";

export default function SeatingPlanner(props: SeatingPlannerProps) {
  const planner = usePlannerState(props);
  const {
    eventId,
    role,
    members,
    readOnly,
    eventName,
    setEventName,
    eventDate,
    setEventDate,
    location,
    setLocation,
    maxCapacity,
    setMaxCapacity,
    rsvpEnabled,
    setRsvpEnabled,
    tab,
    setTab,
    tableGroups,
    guests,
    groups,
    constraints,
    seatAssignment,
    fillMode,
    tableNameOverrides,
    deletedTableIds,
    collectComments,
    setCollectComments,
    courses,
    setCourses,
    newCourseOption,
    setNewCourseOption,
    menuUploading,
    menuError,
    menuNote,
    undo,
    showShare,
    setShowShare,
    showRsvpPanel,
    setShowRsvpPanel,
    rsvpLinkCopied,
    setRsvpLinkCopied,
    saveStatus,
    tables,
    totalSeats,
    map,
    activeGuests,
    violatedCount,
    performUndo,
    handleMenuUpload,
    applyAgentOperations,
    seatsShort,
    capacityExceeded,
    prevPane,
    nextPane,
  } = planner;

  return (
    <PlannerContext.Provider value={planner}>
      <div className="min-h-screen w-full flex flex-col" style={{ backgroundColor: C.paper, fontFamily: FONT.body }}>

        {/* header — compact, all breakpoints: badge + name + date/venue/capacity, stats, save status, share */}
        <header className="border-b" style={{ borderColor: C.line, backgroundColor: C.card }}>
          <div className="px-4 sm:px-8 py-4 flex flex-wrap items-start gap-4">
            <a
              href="/events"
              className="text-[10px] tracking-[0.2em] uppercase font-semibold shrink-0 mt-1.5"
              style={{ color: C.gold, textDecoration: "none" }}
            >
              ← My events
            </a>

            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                style={{ backgroundColor: C.goldSoft, color: C.gold, fontFamily: FONT.display }}
                aria-hidden
              >
                {eventInitials(eventName)}
              </div>
              <div className="min-w-0">
                <input
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  disabled={readOnly}
                  aria-label="Event name"
                  className="w-full bg-transparent outline-none text-lg leading-tight"
                  style={{ fontFamily: FONT.display, color: C.ink }}
                />
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-0.5">
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    disabled={readOnly}
                    aria-label="Event date"
                    className="text-[11px] bg-transparent outline-none rounded"
                    style={{ color: C.muted }}
                  />
                  <span className="text-[11px]" style={{ color: C.line }}>
                    ·
                  </span>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={readOnly}
                    placeholder="Venue, city…"
                    aria-label="Location"
                    className="text-[11px] bg-transparent outline-none rounded w-28"
                    style={{ color: C.muted }}
                  />
                </div>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
              <div className="flex items-center gap-3 text-[11px] px-3 py-1.5 rounded-full" style={{ backgroundColor: C.paper, color: C.muted }}>
                <span>
                  Guests <b style={{ color: capacityExceeded ? C.wine : C.ink }}>{guests.length}</b>
                </span>
                <span>
                  Tables <b style={{ color: C.ink }}>{tables.length}</b>
                </span>
                <span>
                  Seats <b style={{ color: seatsShort ? C.wine : C.ink }}>{totalSeats}</b>
                </span>
                <span className="flex items-center gap-0.5">
                  Capacity <b style={{ color: capacityExceeded ? C.wine : C.ink }}>{activeGuests.length}</b>/
                  <input
                    type="number"
                    min={0}
                    value={maxCapacity}
                    onChange={(e) => setMaxCapacity(e.target.value === "" ? "" : Number(e.target.value))}
                    disabled={readOnly}
                    placeholder="–"
                    aria-label="Max capacity"
                    className="bg-transparent outline-none font-bold text-center"
                    style={{ color: capacityExceeded ? C.wine : C.ink, width: 26 }}
                  />
                </span>
              </div>

              {(readOnly || saveStatus !== "idle") && (
                <span
                  className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full"
                  style={{
                    backgroundColor: saveStatus === "error" ? "#F3E4E4" : "#EEF2EA",
                    color: saveStatus === "error" ? C.wine : C.sage,
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: saveStatus === "error" ? C.wine : C.sage }} />
                  {readOnly ? "View only" : saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Save failed" : "All changes saved"}
                </span>
              )}

              {role === "owner" && (
                <button
                  onClick={() => setShowRsvpPanel((v) => !v)}
                  className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border"
                  style={{ borderColor: C.line, color: C.ink }}
                >
                  <ClipboardCheck size={12} /> Guest RSVP
                </button>
              )}

              {role === "owner" && (
                <button
                  onClick={() => setShowShare((v) => !v)}
                  className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border"
                  style={{ borderColor: C.line, color: C.ink }}
                >
                  <Share2 size={12} /> Share
                </button>
              )}
            </div>
          </div>

          {showShare && role === "owner" && (
            <div className="px-4 sm:px-8 pb-4">
              <InviteForm eventId={eventId} initialMembers={members} />
            </div>
          )}

          {showRsvpPanel && role === "owner" && (
            <div className="px-4 sm:px-8 pb-4">
              <div className="rounded-xl border p-4 flex flex-col sm:flex-row gap-4" style={{ borderColor: C.line, backgroundColor: C.paper }}>
                <div className="flex-1 min-w-0">
                  <label className="flex items-center gap-2 text-sm font-medium mb-2 cursor-pointer" style={{ color: C.ink }}>
                    <input
                      type="checkbox"
                      checked={rsvpEnabled}
                      onChange={(e) => setRsvpEnabled(e.target.checked)}
                      disabled={readOnly}
                    />
                    Accept guest RSVPs online
                  </label>
                  <p className="text-xs mb-3" style={{ color: C.muted }}>
                    Share this link (or the QR code) with guests. They'll type their own name, confirm attending or not, and add a meal choice or dietary note — no account needed.
                  </p>
                  {rsvpEnabled && (
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={`${typeof window !== "undefined" ? window.location.origin : ""}/rsvp/${eventId}`}
                        onFocus={(e) => e.target.select()}
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border text-xs outline-none"
                        style={{ borderColor: C.line, backgroundColor: C.card, color: C.muted }}
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/rsvp/${eventId}`).then(() => {
                            setRsvpLinkCopied(true);
                            setTimeout(() => setRsvpLinkCopied(false), 2000);
                          });
                        }}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg shrink-0"
                        style={{ backgroundColor: C.gold, color: "#fff" }}
                      >
                        <Copy size={12} /> {rsvpLinkCopied ? "Copied!" : "Copy link"}
                      </button>
                    </div>
                  )}
                </div>
                {rsvpEnabled && typeof window !== "undefined" && (
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(
                        `${window.location.origin}/rsvp/${eventId}`
                      )}`}
                      alt="QR code linking to the guest RSVP form"
                      width={110}
                      height={110}
                      className="rounded-lg border"
                      style={{ borderColor: C.line }}
                    />
                    <span className="text-[10px]" style={{ color: C.muted }}>
                      Scan to RSVP
                    </span>
                  </div>
                )}
              </div>

              {rsvpEnabled && (
                <div className="rounded-xl border p-4 mt-3" style={{ borderColor: C.line, backgroundColor: C.paper }}>
                  <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: C.muted }}>
                    What guests are asked
                  </div>
                  <p className="text-xs mb-3" style={{ color: C.muted }}>
                    By default guests only confirm attending or not. Turn on anything else you want to collect.
                  </p>
                  <div className="mb-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: C.ink }}>
                      <input
                        type="checkbox"
                        checked={collectComments}
                        onChange={(e) => setCollectComments(e.target.checked)}
                        disabled={readOnly}
                      />
                      Ask for comments (dietary needs, allergies, anything else)
                    </label>
                  </div>

                  <div className="text-sm font-medium mb-1" style={{ color: C.ink }}>
                    Menu
                  </div>
                  <p className="text-xs mb-3" style={{ color: C.muted }}>
                    Build the menu course by course — guests pick one option per course you define, never freeform text. A course with no options yet just won't show up on the guest form.
                  </p>

                  {courses.length > 0 && (
                    <div className="flex flex-col gap-3 mb-3">
                      {courses.map((course) => (
                        <div key={course.id} className="rounded-lg border p-3" style={{ borderColor: C.line, backgroundColor: C.card }}>
                          <div className="flex items-center gap-2 mb-2">
                            <input
                              value={course.name}
                              onChange={(e) =>
                                setCourses((prev) => prev.map((c) => (c.id === course.id ? { ...c, name: e.target.value } : c)))
                              }
                              disabled={readOnly}
                              placeholder="Course name — e.g. Starter, Main, Dessert"
                              className="flex-1 min-w-0 text-sm font-medium outline-none bg-transparent"
                              style={{ color: C.ink }}
                            />
                            {!readOnly && (
                              <button
                                onClick={() => {
                                  setCourses((prev) => prev.filter((c) => c.id !== course.id));
                                  setNewCourseOption((prev) => {
                                    const next = { ...prev };
                                    delete next[course.id];
                                    return next;
                                  });
                                }}
                                aria-label={`Remove ${course.name || "course"}`}
                                className="shrink-0"
                                style={{ color: C.muted }}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>

                          {course.options.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                              {course.options.map((opt, i) => (
                                <span
                                  key={`${opt}-${i}`}
                                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border"
                                  style={{ borderColor: C.line, backgroundColor: C.paper, color: C.ink }}
                                >
                                  {opt}
                                  {!readOnly && (
                                    <button
                                      onClick={() =>
                                        setCourses((prev) =>
                                          prev.map((c) =>
                                            c.id === course.id ? { ...c, options: c.options.filter((_, idx) => idx !== i) } : c
                                          )
                                        )
                                      }
                                      aria-label={`Remove ${opt}`}
                                      style={{ color: C.muted }}
                                    >
                                      <X size={12} />
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}

                          {!readOnly && (
                            <div className="flex items-center gap-2">
                              <input
                                value={newCourseOption[course.id] ?? ""}
                                onChange={(e) => setNewCourseOption((prev) => ({ ...prev, [course.id]: e.target.value }))}
                                onKeyDown={(e) => {
                                  const text = (newCourseOption[course.id] ?? "").trim();
                                  if (e.key === "Enter" && text) {
                                    e.preventDefault();
                                    setCourses((prev) =>
                                      prev.map((c) => (c.id === course.id ? { ...c, options: [...c.options, text] } : c))
                                    );
                                    setNewCourseOption((prev) => ({ ...prev, [course.id]: "" }));
                                  }
                                }}
                                placeholder="e.g. Herb-Roasted Chicken"
                                className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border text-sm outline-none"
                                style={{ borderColor: C.line, backgroundColor: C.paper, color: C.ink }}
                              />
                              <button
                                onClick={() => {
                                  const text = (newCourseOption[course.id] ?? "").trim();
                                  if (!text) return;
                                  setCourses((prev) =>
                                    prev.map((c) => (c.id === course.id ? { ...c, options: [...c.options, text] } : c))
                                  );
                                  setNewCourseOption((prev) => ({ ...prev, [course.id]: "" }));
                                }}
                                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg shrink-0"
                                style={{ backgroundColor: C.gold, color: "#fff" }}
                              >
                                <Plus size={12} /> Add
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {!readOnly && (
                    <>
                      <button
                        onClick={() => setCourses((prev) => [...prev, { id: genId(), name: "", options: [] }])}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border mb-3"
                        style={{ borderColor: C.line, color: C.ink }}
                      >
                        <Plus size={12} /> Add a course
                      </button>

                      <label
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg cursor-pointer"
                        style={{ backgroundColor: C.card, color: C.ink, border: `1px solid ${C.line}` }}
                      >
                        <Upload size={12} />
                        {menuUploading ? "Reading menu…" : "Upload menu from caterer (PDF, Word, or Excel)"}
                        <input
                          type="file"
                          accept=".pdf,.docx,.xlsx,.xls,.csv"
                          className="hidden"
                          disabled={menuUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) handleMenuUpload(file);
                          }}
                        />
                      </label>
                      {menuError && (
                        <p className="text-xs mt-2" style={{ color: C.wine }}>
                          {menuError}
                        </p>
                      )}
                      {!menuError && menuNote && (
                        <p className="text-xs mt-2" style={{ color: C.muted }}>
                          {menuNote}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* tab nav — horizontal pills on larger screens; mobile keeps the fixed bottom icon bar */}
          <div className="hidden sm:flex items-center gap-2 px-4 sm:px-8 pb-3 overflow-x-auto">
            {[
              { id: "overview", label: "Overview", icon: LayoutDashboard },
              { id: "setup", label: "Tables", icon: Table2 },
              { id: "guests", label: "Guests & rules", icon: Users },
              { id: "seating", label: "Seating map", icon: LayoutGrid },
              { id: "decor", label: "Decor ideas", icon: Palette },
            ].map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium shrink-0 transition-colors"
                  style={{
                    backgroundColor: active ? C.ink : "transparent",
                    color: active ? C.paper : C.ink,
                    border: active ? "none" : `1px solid ${C.line}`,
                  }}
                >
                  <Icon size={14} />
                  {t.label}
                  {t.id === "seating" && violatedCount > 0 && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: active ? C.wine : "#F3E4E4", color: active ? "#fff" : C.wine }}
                    >
                      {violatedCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </header>

        {/* mobile tab bar */}
        <div className="sm:hidden fixed bottom-0 left-0 right-0 flex justify-around p-2 border-t z-20" style={{ backgroundColor: C.card, borderColor: C.line }}>
          {[
            { id: "overview", icon: LayoutDashboard, label: "Overview" },
            { id: "setup", icon: Table2, label: "Tables" },
            { id: "guests", icon: Users, label: "Guests & rules" },
            { id: "seating", icon: LayoutGrid, label: "Seating map" },
            { id: "decor", icon: Palette, label: "Decor ideas" },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-label={t.label}
                aria-current={tab === t.id ? "page" : undefined}
                className="p-2 rounded-lg"
                style={{ color: tab === t.id ? C.gold : C.muted }}
              >
                <Icon size={20} />
              </button>
            );
          })}
        </div>

        {/* main */}
        <main className="flex-1 p-6 sm:p-10 pb-36 sm:pb-10 overflow-auto">
          {tab === "overview" && <OverviewTab />}
          {tab === "setup" && <TablesTab />}

          {tab === "guests" && <GuestsTab />}

          {tab === "seating" && <SeatingTab />}

          {tab === "decor" && <DecorTab />}

          {(prevPane || nextPane) && (
            <div className="flex items-center justify-between gap-3 mt-10 pt-6 border-t" style={{ borderColor: C.line }}>
              {prevPane ? (
                <button
                  onClick={() => setTab(prevPane.id)}
                  className="text-sm font-medium px-3 py-2 rounded-lg border"
                  style={{ borderColor: C.line, color: C.ink }}
                >
                  ← {prevPane.label}
                </button>
              ) : (
                <span />
              )}
              {nextPane && (
                <button
                  onClick={() => setTab(nextPane.id)}
                  className="text-sm font-semibold px-4 py-2 rounded-lg"
                  style={{ backgroundColor: C.gold, color: "#fff" }}
                >
                  Next: {nextPane.label} →
                </button>
              )}
            </div>
          )}
        </main>

        {undo && (
          <div
            className="fixed z-40 left-4 right-24 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 bottom-20 sm:bottom-6 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl shadow-lg"
            style={{ backgroundColor: C.ink, color: C.paper, maxWidth: 420 }}
          >
            <span className="text-sm">{undo.message}</span>
            <button
              onClick={performUndo}
              className="flex items-center gap-1.5 text-sm font-semibold shrink-0"
              style={{ color: C.goldSoft }}
            >
              <Undo2 size={14} /> Undo
            </button>
          </div>
        )}

        <AgentChat
          eventId={eventId}
          role={role}
          getState={() => ({ tableGroups, guests, groups, constraints, seatAssignment, fillMode, tableNameOverrides, deletedTableIds })}
          onApply={applyAgentOperations}
        />
      </div>
    </PlannerContext.Provider>
  );
}
