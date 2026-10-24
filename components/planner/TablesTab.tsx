"use client";

// The planner's setup tab. Reads everything it needs from PlannerContext.


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
import { IconBtn, SectionTitle, MapMenuButton, FixtureSizeEditor, SettingRow, Stepper } from "@/components/planner/ui";

export default function TablesTab() {
  const {
    readOnly,
    maxCapacity,
    tableGroups,
    guests,
    fixtures,
    setDeletedTableIds,
    floorPlan,
    floorPlanUploading,
    floorPlanError,
    floorPlanSuggesting,
    floorPlanSuggestion,
    setFloorPlanSuggestion,
    tables,
    deletedTables,
    seats,
    totalSeats,
    activeGuests,
    addTableGroup,
    updateTableGroup,
    removeTableGroupWithUndo,
    addFixture,
    renameFixture,
    removeFixtureWithUndo,
    handleFloorPlanUpload,
    handleFloorPlanRemove,
    handleSuggestFromFloorPlan,
    applyFloorPlanSuggestion,
    seatsShort,
    capacityExceeded,
  } = usePlanner();

  return (
    <div className="max-w-2xl">
      <SectionTitle eyebrow="Step one" title="Configure your tables" />
      <p className="text-sm mb-6" style={{ color: C.muted }}>
        Define the table types available for this event — how many of each, and how many seats per table.
      </p>

      <div className="space-y-3">
        {tableGroups.map((g) => {
          const isRect = g.shape === "square" || g.shape === "rectangle";
          const count = Number(g.count) || 0;
          const seatsEach = Number(g.capacity) || 0;
          const fieldLabel = "text-[11px] font-semibold uppercase tracking-wide";
          return (
          <div key={g.id} className="p-3 sm:p-4 rounded-xl border" style={{ backgroundColor: C.card, borderColor: C.line }}>
            {/* Name + remove */}
            <div className="flex items-center gap-2 mb-3">
              <input
                value={g.label}
                onChange={(e) => updateTableGroup(g.id, { label: e.target.value })}
                disabled={readOnly}
                className="flex-1 min-w-0 bg-transparent outline-none text-base font-medium py-1"
                style={{ color: C.ink }}
                placeholder="Table type name"
                aria-label="Table type name"
              />
              <IconBtn danger title="Remove table type" onClick={() => removeTableGroupWithUndo(g.id)} disabled={readOnly}>
                <Trash2 size={16} />
              </IconBtn>
            </div>

            {/* Count, seats, shape — labelled, touch-sized */}
            <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
              <div className="flex flex-col gap-1">
                <span className={fieldLabel} style={{ color: C.muted }}>
                  Tables
                </span>
                <Stepper
                  label="Number of tables of this type"
                  value={g.count}
                  disabled={readOnly}
                  onChange={(v) => updateTableGroup(g.id, { count: v })}
                  onBlur={() => {
                    if (g.count === "") updateTableGroup(g.id, { count: 0 });
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className={fieldLabel} style={{ color: C.muted }}>
                  Seats each
                </span>
                <Stepper
                  label="Seats per table"
                  value={g.capacity}
                  min={1}
                  disabled={readOnly}
                  onChange={(v) => updateTableGroup(g.id, { capacity: v })}
                  onBlur={() => {
                    if (g.capacity === "") updateTableGroup(g.id, { capacity: 1 });
                  }}
                />
              </div>
              <label className="flex flex-col gap-1">
                <span className={fieldLabel} style={{ color: C.muted }}>
                  Shape
                </span>
                <select
                  value={g.shape || "round"}
                  disabled={readOnly}
                  onChange={(e) => updateTableGroup(g.id, { shape: e.target.value as TableShape })}
                  aria-label="Table shape"
                  className="h-11 px-3 rounded-lg border text-sm"
                  style={{ borderColor: C.line, color: C.ink, backgroundColor: C.card }}
                >
                  <option value="round">Round</option>
                  <option value="oval">Oval</option>
                  <option value="square">Square</option>
                  <option value="rectangle">Rectangle</option>
                </select>
              </label>
              {isRect && (
                <>
                  <div className="flex flex-col gap-1" title="Seats at the head (short end)">
                    <span className={fieldLabel} style={{ color: C.muted }}>
                      Head
                    </span>
                    <Stepper
                      label="Seats at the head"
                      value={g.headCount ?? 1}
                      max={g.capacity === "" ? undefined : g.capacity}
                      disabled={readOnly}
                      onChange={(v) => updateTableGroup(g.id, { headCount: v })}
                      onBlur={() => {
                        if (g.headCount === "" || g.headCount === undefined) updateTableGroup(g.id, { headCount: 1 });
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1" title="Seats at the foot (opposite short end)">
                    <span className={fieldLabel} style={{ color: C.muted }}>
                      Foot
                    </span>
                    <Stepper
                      label="Seats at the foot"
                      value={g.footCount ?? 1}
                      max={g.capacity === "" ? undefined : g.capacity}
                      disabled={readOnly}
                      onChange={(v) => updateTableGroup(g.id, { footCount: v })}
                      onBlur={() => {
                        if (g.footCount === "" || g.footCount === undefined) updateTableGroup(g.id, { footCount: 1 });
                      }}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="text-xs mt-3" style={{ color: C.muted }}>
              {count} {count === 1 ? "table" : "tables"} × {seatsEach} = <strong style={{ color: C.ink }}>{count * seatsEach} seats</strong>
            </div>
            {(() => {
              const removed = deletedTables.filter((t) => t.groupId === g.id);
              if (removed.length === 0) return null;
              return (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs mt-2" style={{ color: C.muted }}>
                  {removed.length} of these removed from the floor plan ({removed.map((t) => t.label).join(", ")})
                  {!readOnly && (
                    <button
                      onClick={() => setDeletedTableIds((ids) => ids.filter((id) => !removed.some((t) => t.id === id)))}
                      className="font-semibold underline"
                      style={{ color: C.gold }}
                    >
                      Add back
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
          );
        })}
      </div>

      <button
        onClick={addTableGroup}
        disabled={readOnly}
        className="mt-3 flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-40"
        style={{ color: C.gold, border: `1px dashed ${C.gold}` }}
      >
        <Plus size={14} /> Add table type
      </button>

      <div className="mt-8">
        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.muted }}>
          Fixtures
        </div>
        <p className="text-sm mb-3" style={{ color: C.muted }}>
          Mark non-seating areas on your floor plan — dance floor, bar, stage — so you can plan around them.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {(Object.keys(FIXTURE_DEFAULTS) as FixtureType[]).map((type) => (
            <button
              key={type}
              onClick={() => addFixture(type)}
              disabled={readOnly}
              className="text-xs font-medium px-3 py-1.5 rounded-full border disabled:opacity-40"
              style={{
                borderColor: FIXTURE_DEFAULTS[type].border,
                color: FIXTURE_DEFAULTS[type].border,
                backgroundColor: FIXTURE_DEFAULTS[type].fill,
              }}
            >
              + {FIXTURE_DEFAULTS[type].label}
            </button>
          ))}
        </div>
        {fixtures.length > 0 && (
          <div className="space-y-2">
            {fixtures.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 p-2.5 rounded-xl border"
                style={{ backgroundColor: C.card, borderColor: C.line }}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: FIXTURE_DEFAULTS[f.type].border }}
                />
                <input
                  value={f.label ?? FIXTURE_DEFAULTS[f.type].label}
                  onChange={(e) => renameFixture(f.id, e.target.value)}
                  disabled={readOnly}
                  aria-label="Fixture name"
                  className="flex-1 bg-transparent outline-none text-sm"
                  style={{ color: C.ink }}
                />
                <IconBtn danger title="Remove fixture" onClick={() => removeFixtureWithUndo(f.id)} disabled={readOnly}>
                  <Trash2 size={15} />
                </IconBtn>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        className="mt-8 p-4 rounded-xl text-sm flex items-center gap-2"
        style={{ backgroundColor: seatsShort ? "#F3E4E4" : "#EEF2EA", color: seatsShort ? C.wine : C.sage }}
      >
        {seatsShort ? <AlertTriangle size={16} /> : <Check size={16} />}
        {seatsShort
          ? `You have ${activeGuests.length} guests coming (declined not counted) but only ${totalSeats} seats. Add more tables before generating a plan.`
          : `${totalSeats} seats for ${activeGuests.length} guests (declined not counted) — ${totalSeats - activeGuests.length} spare.`}
      </div>

      {maxCapacity !== "" && (
        <div
          className="mt-3 p-4 rounded-xl text-sm flex items-center gap-2"
          style={{ backgroundColor: capacityExceeded ? "#F3E4E4" : "#EEF2EA", color: capacityExceeded ? C.wine : C.sage }}
        >
          {capacityExceeded ? <AlertTriangle size={16} /> : <Check size={16} />}
          {capacityExceeded
            ? `${activeGuests.length} guests exceeds your venue's max capacity of ${maxCapacity}.`
            : `${activeGuests.length} of ${maxCapacity} max capacity.`}
        </div>
      )}

      <div className="mt-8">
        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.muted }}>
          Venue floor plan
        </div>
        {floorPlan ? (
          <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ backgroundColor: C.card, borderColor: C.line }}>
            {/\.(png|jpe?g|webp)$/i.test(floorPlan.path) ? (
              <SignedImg bucket="floor-plans" path={floorPlan.path} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
            ) : (
              <FileText size={22} style={{ color: C.gold }} className="shrink-0" />
            )}
            <SignedLink
              bucket="floor-plans"
              path={floorPlan.path}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm truncate flex-1"
              style={{ color: C.ink }}
            >
              {floorPlan.name}
            </SignedLink>
            {!readOnly && (
              <IconBtn danger title="Remove floor plan" onClick={handleFloorPlanRemove}>
                <Trash2 size={15} />
              </IconBtn>
            )}
          </div>
        ) : (
          !readOnly && (
            <label
              className="flex items-center justify-center gap-2 p-4 rounded-xl border border-dashed text-sm cursor-pointer"
              style={{ borderColor: C.line, color: C.muted }}
            >
              <Upload size={15} />
              {floorPlanUploading ? "Uploading…" : "Upload a PDF or image of the venue's seat plan"}
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                disabled={floorPlanUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFloorPlanUpload(file);
                  e.target.value = "";
                }}
                style={{ display: "none" }}
              />
            </label>
          )
        )}
        {floorPlan && !readOnly && !floorPlanSuggestion && (
          <button
            onClick={handleSuggestFromFloorPlan}
            disabled={floorPlanSuggesting}
            className="mt-2 flex items-center gap-1.5 text-xs font-semibold disabled:opacity-60"
            style={{ color: C.gold, background: "none", border: "none", cursor: "pointer" }}
          >
            <Sparkles size={13} />
            {floorPlanSuggesting ? "Reading floor plan…" : "Suggest table setup from this floor plan"}
          </button>
        )}
        {floorPlanError && (
          <p className="text-xs mt-1.5" style={{ color: C.wine }}>
            {floorPlanError}
          </p>
        )}
        {floorPlanSuggestion && (
          <div className="mt-2 p-3 rounded-xl text-sm" style={{ backgroundColor: "#FBF3E4", color: C.ink }}>
            <div className="flex items-start gap-1.5 mb-2">
              <Sparkles size={14} style={{ color: C.gold, marginTop: 2 }} className="shrink-0" />
              <span>
                {floorPlanSuggestion.note && <span className="block mb-1">{floorPlanSuggestion.note}</span>}
                {floorPlanSuggestion.tables
                  .map((t) => `${t.count}× ${(t.shape || "round")[0].toUpperCase()}${(t.shape || "round").slice(1)} (${t.capacity} seats)`)
                  .join(" · ")}{" "}
                — this replaces your current table types.
              </span>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setFloorPlanSuggestion(null)}
                className="text-xs font-medium"
                style={{ color: C.muted, background: "none", border: "none", cursor: "pointer" }}
              >
                Dismiss
              </button>
              <button
                onClick={applyFloorPlanSuggestion}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: C.gold, color: "#fff", border: "none", cursor: "pointer" }}
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
