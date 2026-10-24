"use client";

// The planner's guests tab. Reads everything it needs from PlannerContext.


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
  ChevronDown,
  MessageCircle,
  LayoutDashboard,
} from "lucide-react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";
import InviteForm from "@/components/InviteForm";
import AgentChat from "@/components/AgentChat";
import DecorPanel from "@/components/DecorPanel";
import { useMapViewport } from "@/components/useMapViewport";
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
import { usePlanner } from "@/components/planner/usePlannerState";
import { IconBtn, SectionTitle, MapMenuButton, FixtureSizeEditor, SettingRow } from "@/components/planner/ui";

export default function GuestsTab() {
  const {
    readOnly,
    guests,
    groups,
    constraints,
    newGuestName,
    setNewGuestName,
    guestSearch,
    setGuestSearch,
    compactGuestRows,
    setCompactGuestRows,
    addRuleForGuestId,
    setAddRuleForGuestId,
    addRuleType,
    setAddRuleType,
    addRuleTargetType,
    setAddRuleTargetType,
    addRuleTargetId,
    setAddRuleTargetId,
    showGroupRuleForm,
    setShowGroupRuleForm,
    groupRuleType,
    setGroupRuleType,
    groupRuleAId,
    setGroupRuleAId,
    groupRuleBId,
    setGroupRuleBId,
    rsvpFilter,
    setRsvpFilter,
    pendingImport,
    setPendingImport,
    importError,
    importSuccess,
    showImportHelp,
    setShowImportHelp,
    fileInputRef,
    tables,
    tableById,
    seatsById,
    visibleGuests,
    guestLetterIndex,
    groupById,
    seatOfGuest,
    sideLabel,
    constraintTagsByGuestId,
    addGuest,
    renameGuest,
    updateGuestNote,
    updateGuestMealChoice,
    cycleRsvpStatus,
    removeGuestWithUndo,
    toggleGuestGroup,
    handleImportFile,
    confirmImport,
    addGroup,
    renameGroup,
    removeGroupWithUndo,
    toggleGroupSeatingMode,
    addConstraintFor,
    addGroupConstraint,
    removeConstraintWithUndo,
    setRsvpStatus,
  } = usePlanner();
  // Which guest row is open for editing (one at a time keeps long lists tidy).
  const [openGuestId, setOpenGuestId] = useState<string | null>(null);

  return (
    <div className="max-w-2xl">
      <div>
        <SectionTitle eyebrow="Step two" title="Guest list" />

        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={readOnly}
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border disabled:opacity-40"
            style={{ borderColor: C.line, color: C.ink }}
          >
            <Upload size={13} /> Import from Excel or CSV
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFile} style={{ display: "none" }} />
          <button
            onClick={() => setShowImportHelp((v) => !v)}
            className="text-xs font-medium underline underline-offset-2"
            style={{ color: C.muted }}
          >
            {showImportHelp ? "Hide" : "Where do I get this file?"}
          </button>
        </div>

        {showImportHelp && (
          <div className="mb-3 p-3 rounded-lg text-xs leading-relaxed space-y-2" style={{ backgroundColor: C.card, border: `1px solid ${C.line}`, color: C.ink }}>
            <div>
              <strong>Partiful:</strong> open your event → Guest List → tap "Export CSV" in the top right, then choose which RSVP statuses to include.
            </div>
            <div>
              <strong>The Knot:</strong> go to your Guest List Manager → "Download List" → "Entire Guest List" to get a CSV. If the button doesn't respond, try it in Chrome.
            </div>
            <div>
              <strong>Bliss &amp; Bone:</strong> from your dashboard, open your guest list / RSVP tracker and use the export option to download your RSVP data.
            </div>
            <div style={{ color: C.muted }}>
              Any of these CSVs will import cleanly. If the file has an RSVP status column, SeatMe reads it — declined guests won't count toward your seating totals. If it has an email or meal/entree column, SeatMe picks that up too — use "Sync RSVPs" to update your existing guest list from a new export instead of starting over.
            </div>
          </div>
        )}

        {importError && (
          <div className="mb-3 p-2.5 rounded-lg text-xs" style={{ backgroundColor: "#F3E4E4", color: C.wine }}>
            {importError}
          </div>
        )}
        {importSuccess && (
          <div className="mb-3 p-2.5 rounded-lg text-xs" style={{ backgroundColor: "#EEF2EA", color: C.sage }}>
            {importSuccess}
          </div>
        )}
        {pendingImport && (
          <div className="mb-3 p-3 rounded-lg text-xs" style={{ backgroundColor: C.goldSoft, color: C.ink }}>
            Found {pendingImport.guests.length} guest{pendingImport.guests.length === 1 ? "" : "s"} in the file
            {pendingImport.groupNames.length > 0 && (
              <>
                {" "}
                ({pendingImport.groupNames.length} group{pendingImport.groupNames.length === 1 ? "" : "s"}: {pendingImport.groupNames.join(", ")})
              </>
            )}
            .
            {pendingImport.declinedCount > 0 && (
              <> {pendingImport.declinedCount} marked as declined.</>
            )}
            {pendingImport.withRsvpData > 0 && (
              <> {pendingImport.withRsvpData} row{pendingImport.withRsvpData === 1 ? "" : "s"} with an RSVP status.</>
            )}
            {pendingImport.withMealData > 0 && (
              <> {pendingImport.withMealData} row{pendingImport.withMealData === 1 ? "" : "s"} with a meal choice.</>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              {guests.length > 0 && (
                <button onClick={() => confirmImport("sync")} className="px-2.5 py-1 rounded-md font-semibold" style={{ backgroundColor: C.sage, color: "#fff" }}>
                  Sync RSVPs
                </button>
              )}
              <button onClick={() => confirmImport("add")} className="px-2.5 py-1 rounded-md font-semibold" style={{ backgroundColor: C.gold, color: "#fff" }}>
                Add to list
              </button>
              <button onClick={() => confirmImport("replace")} className="px-2.5 py-1 rounded-md font-semibold border" style={{ borderColor: C.wine, color: C.wine }}>
                Replace list
              </button>
              <button onClick={() => setPendingImport(null)} className="px-2.5 py-1 rounded-md" style={{ color: C.muted }}>
                Cancel
              </button>
            </div>
            {guests.length > 0 && (
              <div className="mt-1.5" style={{ color: C.muted }}>
                "Sync RSVPs" matches by email (or name) and updates existing guests without touching your seating — best for re-importing after an RSVP deadline.
              </div>
            )}
          </div>
        )}

        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {groups.map((gr) => {
            const mixed = gr.seatingMode === "mixed";
            return (
              <div key={gr.id} className="flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs" style={{ backgroundColor: gr.color, color: "#fff" }}>
                <input
                  value={gr.name}
                  onChange={(e) => renameGroup(gr.id, e.target.value)}
                  disabled={readOnly}
                  aria-label="Group name"
                  className="bg-transparent outline-none"
                  style={{ color: "#fff", width: `${Math.max(60, gr.name.length * 6.5)}px` }}
                />
                <button
                  onClick={() => toggleGroupSeatingMode(gr.id)}
                  disabled={readOnly}
                  title={
                    mixed
                      ? "Mixed — deliberately spread across tables. Click to seat together instead."
                      : "Seated together by default. Click to mix this group across tables instead."
                  }
                  aria-label={mixed ? `${gr.name}: mixed seating, click to seat together` : `${gr.name}: seated together, click to mix`}
                  className="p-0.5 rounded-full hover:bg-black/10 disabled:opacity-60"
                >
                  {mixed ? <Shuffle size={10} /> : <Link2 size={10} />}
                </button>
                {!readOnly && (
                  <button
                    onClick={() => removeGroupWithUndo(gr.id)}
                    title="Remove group"
                    aria-label={`Remove group ${gr.name}`}
                    className="p-0.5 rounded-full hover:bg-black/10"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            );
          })}
          <button onClick={addGroup} disabled={readOnly} className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full disabled:opacity-40" style={{ color: C.gold, border: `1px dashed ${C.gold}` }}>
            <Plus size={11} /> Group
          </button>
        </div>
        <div className="mb-3 text-[11px]" style={{ color: C.muted }}>
          <Link2 size={10} className="inline mr-1 -mt-0.5" /> together (default) · <Shuffle size={10} className="inline mr-1 -mt-0.5" /> mixed — click a group's icon to switch. Applied automatically on generate/regenerate.
        </div>

        {groups.length > 1 && (
          <div className="mb-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: C.muted }}>
                Group rules
              </div>
              {!readOnly && !showGroupRuleForm && (
                <button
                  onClick={() => {
                    setShowGroupRuleForm(true);
                    setGroupRuleType("must");
                    setGroupRuleAId(groups[0]?.id ?? "");
                    setGroupRuleBId(groups[1]?.id ?? "");
                  }}
                  className="inline-flex items-center gap-0.5 text-[10px] font-medium"
                  style={{ color: C.gold }}
                >
                  <Plus size={10} /> Add
                </button>
              )}
            </div>
            {(() => {
              const groupConstraints = constraints.filter((c) => c.aType === "group" && c.bType === "group");
              if (groupConstraints.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-1 mt-1">
                  {groupConstraints.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1 text-[10px] pl-1.5 pr-1 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: c.type === "must" ? "#EEF2EA" : "#F3E4E4",
                        color: c.type === "must" ? C.sage : C.wine,
                      }}
                    >
                      {sideLabel("group", c.aId)} {RULE_SHORT[c.type]} {sideLabel("group", c.bId)}
                      {!readOnly && (
                        <button
                          onClick={() => removeConstraintWithUndo(c.id)}
                          aria-label={`Remove rule: ${sideLabel("group", c.aId)} ${RULE_SHORT[c.type]} ${sideLabel("group", c.bId)}`}
                          className="rounded-full hover:opacity-70"
                        >
                          <X size={9} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              );
            })()}
            {showGroupRuleForm && (
              <div
                className="flex flex-wrap items-center gap-1 mt-1 p-1.5 rounded-lg border"
                style={{ borderColor: C.line, backgroundColor: C.card }}
              >
                <select
                  value={groupRuleAId}
                  onChange={(e) => setGroupRuleAId(e.target.value)}
                  className="text-xs bg-transparent outline-none min-w-0"
                >
                  {groups.map((gr) => (
                    <option key={gr.id} value={gr.id}>
                      {gr.name}
                    </option>
                  ))}
                </select>
                <select
                  value={groupRuleType}
                  onChange={(e) => setGroupRuleType(e.target.value as RuleType)}
                  className="text-[10px] font-semibold rounded-md px-1.5 py-1"
                  style={{
                    color: groupRuleType === "must" ? C.sage : C.wine,
                    backgroundColor: groupRuleType === "must" ? "#EEF2EA" : "#F3E4E4",
                  }}
                >
                  <option value="must">must sit with</option>
                  <option value="cannot">not at the same table as</option>
                  <option value="notNextTo">not next to</option>
                </select>
                <select
                  value={groupRuleBId}
                  onChange={(e) => setGroupRuleBId(e.target.value)}
                  className="flex-1 min-w-0 text-xs bg-transparent outline-none"
                >
                  {groups
                    .filter((gr) => gr.id !== groupRuleAId)
                    .map((gr) => (
                      <option key={gr.id} value={gr.id}>
                        {gr.name}
                      </option>
                    ))}
                </select>
                <IconBtn
                  title="Add rule"
                  onClick={() => {
                    addGroupConstraint(groupRuleAId, groupRuleBId, groupRuleType);
                    setShowGroupRuleForm(false);
                  }}
                >
                  <Check size={13} />
                </IconBtn>
                <IconBtn title="Cancel" onClick={() => setShowGroupRuleForm(false)}>
                  <X size={13} />
                </IconBtn>
              </div>
            )}
          </div>
        )}

        {guests.length > 5 && (
          <div className="mb-2 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-1.5 px-3 h-11 rounded-lg border" style={{ borderColor: C.line, backgroundColor: C.card }}>
                <Search size={14} style={{ color: C.muted }} />
                <input
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                  placeholder="Search guests…"
                  aria-label="Search guests"
                  className="flex-1 bg-transparent outline-none text-sm"
                  style={{ color: C.ink }}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["all", "attending", "pending", "declined"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setRsvpFilter(f)}
                  className="text-xs font-medium px-3 py-1.5 rounded-full border"
                  style={{
                    borderColor: rsvpFilter === f ? C.ink : C.line,
                    backgroundColor: rsvpFilter === f ? C.ink : "transparent",
                    color: rsvpFilter === f ? C.paper : C.muted,
                  }}
                >
                  {f === "all" ? "All" : f === "attending" ? "Attending" : f === "pending" ? "Pending" : "Declined"}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-start gap-1.5">
        <div className="flex-1 rounded-xl border overflow-hidden" style={{ borderColor: C.line, backgroundColor: C.card }}>
          {visibleGuests.length === 0 && (
            <div className="px-3 py-3 text-xs" style={{ color: C.muted }}>
              No guests match &quot;{guestSearch}&quot;.
            </div>
          )}
          {visibleGuests.map((g) => {
            const avatarColor = g.groupIds?.map((gid) => groupById[gid]?.color).find(Boolean) ?? null;
            const contextLine = guestContextLine(g);
            const seatLabel = seatOfGuest[g.id]
              ? `Seated · ${tableById[seatsById[seatOfGuest[g.id]]?.tableId ?? ""]?.label ?? ""}`
              : g.rsvpStatus === "declined"
              ? "Not seated (declined)"
              : "Unseated";
            const tags = constraintTagsByGuestId[g.id] ?? [];
            const otherGuests = guests.filter((x) => x.id !== g.id);
            const canAddRule = !readOnly && (otherGuests.length > 0 || groups.length > 0);
            const open = openGuestId === g.id;
            const status = g.rsvpStatus ?? "pending";
            const statusColor = status === "declined" ? C.wine : status === "attending" ? C.sage : C.muted;
            const fieldLabel = "text-[11px] font-semibold uppercase tracking-wide";
            return (
            <div key={g.id} id={`guest-row-${g.id}`} className="border-b last:border-b-0 scroll-mt-24" style={{ borderColor: C.line }}>
              {/* Summary row: tap to open the guest's details */}
              <button
                type="button"
                onClick={() => setOpenGuestId(open ? null : g.id)}
                aria-expanded={open}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left min-h-[56px]"
                style={{ backgroundColor: open ? C.paper : "transparent" }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold"
                  style={{ backgroundColor: avatarColor ?? C.goldSoft, color: avatarColor ? "#fff" : C.gold }}
                  aria-hidden
                >
                  {guestInitials(g.name || "?")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ color: C.ink, fontFamily: FONT.display }}>
                    {g.name || "Unnamed guest"}
                  </div>
                  <div className="text-[11px] truncate" style={{ color: C.muted }}>
                    <span style={{ color: seatOfGuest[g.id] ? C.sage : C.muted }}>{seatLabel}</span>
                    {contextLine && contextLine !== "RSVP pending" && contextLine !== "Declined" ? ` · ${contextLine}` : ""}
                  </div>
                </div>
                {tags.length > 0 && (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ backgroundColor: C.goldSoft, color: C.ink }}
                    title={`${tags.length} seating ${tags.length === 1 ? "rule" : "rules"}`}
                  >
                    {tags.length} {tags.length === 1 ? "rule" : "rules"}
                  </span>
                )}
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0"
                  style={{ borderColor: status === "pending" ? C.line : statusColor, color: statusColor }}
                >
                  {status === "declined" ? "Declined" : status === "attending" ? "Attending" : "Pending"}
                </span>
                <ChevronDown
                  size={16}
                  className="shrink-0 transition-transform"
                  style={{ color: C.muted, transform: open ? "rotate(180deg)" : "none" }}
                />
              </button>

              {/* Details */}
              {open && (
                <div className="px-3 pb-3 pt-1 flex flex-col gap-3" style={{ backgroundColor: C.paper }}>
                  <label className="flex flex-col gap-1">
                    <span className={fieldLabel} style={{ color: C.muted }}>
                      Name
                    </span>
                    <input
                      value={g.name}
                      onChange={(e) => renameGuest(g.id, e.target.value)}
                      disabled={readOnly}
                      aria-label="Guest name"
                      className="h-11 px-3 rounded-lg border text-sm outline-none"
                      style={{ borderColor: C.line, color: C.ink, backgroundColor: C.card, fontFamily: FONT.display }}
                    />
                  </label>

                  <div className="flex flex-col gap-1">
                    <span className={fieldLabel} style={{ color: C.muted }}>
                      RSVP
                    </span>
                    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="RSVP status">
                      {(["attending", "pending", "declined"] as const).map((st) => {
                        const selected = status === st;
                        const col = st === "declined" ? C.wine : st === "attending" ? C.sage : C.ink;
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setRsvpStatus(g.id, st)}
                            disabled={readOnly}
                            aria-pressed={selected}
                            className="h-10 rounded-lg border text-xs font-semibold disabled:opacity-60"
                            style={{
                              borderColor: selected ? col : C.line,
                              backgroundColor: selected ? col : C.card,
                              color: selected ? "#fff" : col,
                            }}
                          >
                            {st === "attending" ? "Attending" : st === "pending" ? "Pending" : "Declined"}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="flex flex-col gap-1">
                    <span className={fieldLabel} style={{ color: C.muted }}>
                      Meal
                    </span>
                    <input
                      value={g.mealChoice ?? ""}
                      onChange={(e) => updateGuestMealChoice(g.id, e.target.value)}
                      disabled={readOnly}
                      placeholder="Meal choice"
                      className="h-11 px-3 rounded-lg border text-sm outline-none"
                      style={{ borderColor: C.line, color: C.ink, backgroundColor: C.card }}
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className={`${fieldLabel} inline-flex items-center gap-1`} style={{ color: C.muted }}>
                      <StickyNote size={11} style={{ color: g.note ? C.gold : C.muted }} /> Note · only you and your collaborators see this
                    </span>
                    <input
                      value={g.note ?? ""}
                      onChange={(e) => updateGuestNote(g.id, e.target.value)}
                      disabled={readOnly}
                      placeholder="Dietary need, high chair, wheelchair access…"
                      className="h-11 px-3 rounded-lg border text-sm outline-none"
                      style={{ borderColor: C.line, color: C.ink, backgroundColor: C.card }}
                    />
                  </label>

                  {g.rsvpComment && (
                    <div className="flex items-start gap-1.5 text-xs" style={{ color: C.muted }}>
                      <MessageCircle size={12} className="shrink-0 mt-[2px]" style={{ color: C.sage }} />
                      <span>
                        <span className="font-medium" style={{ color: C.sage }}>
                          From their RSVP:
                        </span>{" "}
                        {g.rsvpComment}
                      </span>
                    </div>
                  )}

                  {groups.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <span className={fieldLabel} style={{ color: C.muted }}>
                        Groups
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {groups.map((gr) => {
                          const active = g.groupIds?.includes(gr.id);
                          return (
                            <button
                              key={gr.id}
                              type="button"
                              onClick={() => toggleGuestGroup(g.id, gr.id)}
                              disabled={readOnly}
                              aria-pressed={active}
                              className="text-xs px-3 py-1.5 rounded-full border font-medium disabled:opacity-60"
                              style={{
                                borderColor: gr.color,
                                backgroundColor: active ? gr.color : C.card,
                                color: active ? "#fff" : gr.color,
                              }}
                            >
                              {gr.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(tags.length > 0 || canAddRule) && (
                    <div className="flex flex-col gap-1">
                      <span className={fieldLabel} style={{ color: C.muted }}>
                        Seating rules
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {tags.map((t) => (
                          <span
                            key={t.constraintId}
                            className="inline-flex items-center gap-1 text-xs pl-2.5 pr-1 py-1 rounded-full font-medium"
                            style={{
                              backgroundColor: t.type === "must" ? "#EEF2EA" : "#F3E4E4",
                              color: t.type === "must" ? C.sage : C.wine,
                            }}
                          >
                            {RULE_SHORT[t.type]} {t.label}
                            {!readOnly && (
                              <button
                                type="button"
                                onClick={() => removeConstraintWithUndo(t.constraintId)}
                                aria-label={`Remove rule: ${RULE_SHORT[t.type]} ${t.label}`}
                                className="w-6 h-6 rounded-full flex items-center justify-center hover:opacity-70"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </span>
                        ))}
                        {canAddRule && addRuleForGuestId !== g.id && (
                          <button
                            type="button"
                            onClick={() => {
                              setAddRuleForGuestId(g.id);
                              setAddRuleType("must");
                              const firstTargetType = otherGuests.length > 0 ? "guest" : "group";
                              setAddRuleTargetType(firstTargetType);
                              setAddRuleTargetId((firstTargetType === "guest" ? otherGuests[0]?.id : groups[0]?.id) ?? "");
                            }}
                            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border font-medium"
                            style={{ borderColor: C.gold, color: C.gold, backgroundColor: C.card }}
                          >
                            <Plus size={12} /> Add rule
                          </button>
                        )}
                      </div>
                      {addRuleForGuestId === g.id && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-1 p-2 rounded-lg border" style={{ borderColor: C.line, backgroundColor: C.card }}>
                          <select
                            value={addRuleType}
                            onChange={(e) => setAddRuleType(e.target.value as RuleType)}
                            aria-label="Rule type"
                            className="h-10 text-xs font-semibold rounded-md px-2"
                            style={{
                              color: addRuleType === "must" ? C.sage : C.wine,
                              backgroundColor: addRuleType === "must" ? "#EEF2EA" : "#F3E4E4",
                            }}
                          >
                            <option value="must">must sit with</option>
                            <option value="cannot">not at the same table as</option>
                            <option value="notNextTo">not next to</option>
                          </select>
                          <div className="flex gap-2 flex-1 min-w-0">
                            <select
                              value={addRuleTargetType}
                              onChange={(e) => {
                                const newType = e.target.value as "guest" | "group";
                                setAddRuleTargetType(newType);
                                const opts = newType === "group" ? groups : guests.filter((x) => x.id !== g.id);
                                setAddRuleTargetId(opts[0]?.id ?? "");
                              }}
                              aria-label="Rule applies to a person or a group"
                              className="h-10 text-xs rounded-md px-2 border"
                              style={{ borderColor: C.line, color: C.muted }}
                            >
                              <option value="guest">Person</option>
                              <option value="group">Group</option>
                            </select>
                            <select
                              value={addRuleTargetId}
                              onChange={(e) => setAddRuleTargetId(e.target.value)}
                              aria-label="Who the rule is with"
                              className="h-10 flex-1 min-w-0 text-sm rounded-md px-2 border"
                              style={{ borderColor: C.line, color: C.ink }}
                            >
                              {(addRuleTargetType === "group" ? groups : guests.filter((x) => x.id !== g.id)).map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => setAddRuleForGuestId(null)}
                              className="h-10 px-3 text-xs font-medium rounded-md"
                              style={{ color: C.muted }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                addConstraintFor(g.id, addRuleType, addRuleTargetType, addRuleTargetId);
                                setAddRuleForGuestId(null);
                              }}
                              className="h-10 px-4 text-xs font-semibold rounded-md"
                              style={{ backgroundColor: C.gold, color: "#fff" }}
                            >
                              Add rule
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!readOnly && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setOpenGuestId(null);
                          removeGuestWithUndo(g.id);
                        }}
                        className="inline-flex items-center gap-1.5 h-10 px-3 text-xs font-semibold rounded-lg"
                        style={{ color: C.wine }}
                      >
                        <Trash2 size={14} /> Remove guest
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })}
          <div className="flex items-center gap-2 px-3 py-2">
            <input
              value={newGuestName}
              onChange={(e) => setNewGuestName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGuest()}
              disabled={readOnly}
              placeholder="Add a guest, press Enter"
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: C.ink }}
            />
            <IconBtn title="Add guest" onClick={addGuest} disabled={readOnly}>
              <Plus size={15} />
            </IconBtn>
          </div>
        </div>
        {guests.length > 20 && (
          <div className="hidden sm:flex flex-col shrink-0 sticky top-4 select-none">
            {"ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("").map((letter) => {
              const targetId = guestLetterIndex[letter];
              return (
                <button
                  key={letter}
                  type="button"
                  disabled={!targetId}
                  onClick={() =>
                    document.getElementById(`guest-row-${targetId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  aria-label={`Jump to guests starting with ${letter}`}
                  className="text-[9px] leading-none px-1 py-[1.5px] font-semibold disabled:opacity-25"
                  style={{ color: targetId ? C.gold : C.muted, background: "none", border: "none", cursor: targetId ? "pointer" : "default" }}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
