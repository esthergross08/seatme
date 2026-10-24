"use client";

// The planner's seating tab. Reads everything it needs from PlannerContext.


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
import { IconBtn, SectionTitle, MapMenuButton, FixtureSizeEditor, SettingRow } from "@/components/planner/ui";

export default function SeatingTab() {
  const {
    role,
    readOnly,
    tableGroups,
    guests,
    groups,
    constraints,
    seatAssignment,
    solving,
    justGenerated,
    seatingView,
    setSeatingView,
    highlightNotes,
    setHighlightNotes,
    showGuestNames,
    setShowGuestNames,
    picked,
    setPicked,
    hoveredGuest,
    setHoveredGuest,
    fillMode,
    setFillMode,
    minimizeChanges,
    setMinimizeChanges,
    hiddenTableIds,
    setHiddenTableIds,
    showAllTables,
    setShowAllTables,
    tableNameOverrides,
    setTableNameOverrides,
    fixtures,
    setFixtures,
    rotating,
    selectedTableId,
    setSelectedTableId,
    showRemovedTables,
    setShowRemovedTables,
    tableJustDragged,
    selectedFixtureId,
    setSelectedFixtureId,
    fixtureResize,
    setFixtureResize,
    sizeEditorId,
    setSizeEditorId,
    movingItem,
    setMovingItem,
    mapSearchOpen,
    setMapSearchOpen,
    mapSearchQuery,
    setMapSearchQuery,
    highlightSeatId,
    dragFixture,
    setDragFixture,
    exportMenuRef,
    dragTable,
    setDragTable,
    resizingGroupId,
    setResizingGroupId,
    resizePreviewScale,
    setResizePreviewScale,
    mapCaptureRef,
    exportingPdf,
    mapFullscreen,
    setMapFullscreen,
    tables,
    deletedTables,
    tableById,
    seats,
    seatsById,
    visibleTables,
    hiddenTableCount,
    emptyVisibleTableIds,
    layout,
    room,
    map,
    tableRot,
    fixtureRot,
    beginRotate,
    setTableRotation,
    setFixtureRotation,
    zoomedInForNames,
    namesOnMap,
    atOverview,
    zoomToTable,
    clearMapSelection,
    showGuestOnMap,
    placeMovingItem,
    startLongPress,
    guestById,
    groupById,
    seatOfGuest,
    mapSearchResults,
    activeGuests,
    unseatedGuests,
    seatedCount,
    notedGuests,
    notedGuestCount,
    mealStats,
    groupStats,
    occupiedCountByTable,
    underfilledTables,
    flatViolations,
    sideLabel,
    liveSummary,
    seatPixel,
    pushUndo,
    updateTableGroup,
    renameTable,
    moveTable,
    deleteTableWithUndo,
    restoreTable,
    restoreAllTables,
    setFixtureSizeM,
    resizeFixture,
    moveFixture,
    removeFixtureWithUndo,
    assignGuestToSeat,
    clearSeat,
    handleSeatClick,
    handlePoolClick,
    handleDragStart,
    handleDrop,
    clearAllSeatsWithUndo,
    runSolver,
    exportExcel,
    exportPosterPdf,
    seatsShort,
  } = usePlanner();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <SectionTitle eyebrow="Step three" title="Seating map" />
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: C.line }}>
          <button
            onClick={() => setSeatingView("map")}
            className="px-3 py-1.5 text-xs font-medium"
            style={{ backgroundColor: seatingView === "map" ? C.ink : C.card, color: seatingView === "map" ? C.paper : C.ink }}
          >
            Map
          </button>
          <button
            onClick={() => setSeatingView("table")}
            className="px-3 py-1.5 text-xs font-medium"
            style={{ backgroundColor: seatingView === "table" ? C.ink : C.card, color: seatingView === "table" ? C.paper : C.ink }}
          >
            Table
          </button>
        </div>
      </div>

      {/* Actions — wrap onto as many rows as the screen needs, never off the edge. */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => runSolver()}
          disabled={readOnly || seatsShort || solving || activeGuests.length === 0}
          className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg whitespace-nowrap disabled:opacity-40"
          style={{ backgroundColor: C.gold, color: "#fff" }}
        >
          <Wand2 size={15} />
          {solving ? "Generating…" : "Auto-generate seating"}
        </button>
        {seatedCount > 0 && (
          <button
            onClick={() => runSolver(true)}
            disabled={readOnly || seatsShort || solving || activeGuests.length === 0}
            title="Try a different arrangement from scratch, ignoring 'keep close to current plan'"
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border whitespace-nowrap disabled:opacity-40"
            style={{ borderColor: C.line, color: C.ink }}
          >
            <Shuffle size={15} />
            {solving ? "Shuffling…" : "Shuffle seating"}
          </button>
        )}
        <button
          onClick={clearAllSeatsWithUndo}
          disabled={readOnly || seatedCount === 0}
          title="Unseat everyone and start the floor plan from scratch — keeps your guest list, groups, tables, and constraints"
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border whitespace-nowrap disabled:opacity-40"
          style={{ borderColor: C.line, color: C.ink }}
        >
          <X size={14} /> Clear tables
        </button>
          <details ref={exportMenuRef} className="relative">
            <summary
              className="list-none flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border cursor-pointer whitespace-nowrap"
              style={{ borderColor: C.line, color: C.ink }}
            >
              <Download size={14} /> Export
            </summary>
            <div
              className="absolute left-0 sm:left-auto sm:right-0 mt-1 rounded-lg border shadow-lg overflow-hidden z-10"
              style={{ borderColor: C.line, backgroundColor: C.card, minWidth: 180 }}
            >
              <button
                onClick={() => {
                  exportExcel();
                  exportMenuRef.current?.removeAttribute("open");
                }}
                disabled={tables.length === 0}
                title="Download the seating list as an Excel file"
                className="flex items-center gap-1.5 w-full text-left px-3 py-2 text-sm disabled:opacity-40"
                style={{ color: C.ink }}
              >
                <Download size={14} /> Excel (.xlsx)
              </button>
              <button
                onClick={() => {
                  exportPosterPdf();
                  exportMenuRef.current?.removeAttribute("open");
                }}
                disabled={tables.length === 0 || exportingPdf}
                title="Download a designed, printable seating chart"
                className="flex items-center gap-1.5 w-full text-left px-3 py-2 text-sm border-t disabled:opacity-40"
                style={{ color: C.ink, borderColor: C.line }}
              >
                <FileImage size={14} /> {exportingPdf ? "Exporting…" : "Seating chart poster (PDF)"}
              </button>
            </div>
          </details>
      </div>

      {/* Settings — every on/off option on its own row with its full label. */}
      <div className="mb-6 rounded-xl border overflow-hidden" style={{ borderColor: C.line, backgroundColor: C.card }}>
      {/* -mb-px tucks the last row's divider under the panel's own border */}
      <div className="grid grid-cols-1 lg:grid-cols-2 -mb-px">
        <div className="px-4 py-3 flex flex-col gap-2 border-b lg:col-span-2" style={{ borderColor: C.line }}>
          <span className="text-sm" style={{ color: C.ink }}>
            If there are more seats than guests
          </span>
          <div className="grid grid-cols-2 rounded-lg border overflow-hidden w-full sm:w-auto sm:max-w-md" style={{ borderColor: C.line }}>
            <button
              onClick={() => setFillMode("consolidate")}
              disabled={readOnly}
              aria-pressed={fillMode === "consolidate"}
              title="Fill tables to capacity and leave extras empty"
              className="px-3 py-2 text-xs font-medium leading-snug"
              style={{ backgroundColor: fillMode === "consolidate" ? C.ink : C.card, color: fillMode === "consolidate" ? C.paper : C.ink }}
            >
              Consolidate tables
            </button>
            <button
              onClick={() => setFillMode("spread")}
              disabled={readOnly}
              aria-pressed={fillMode === "spread"}
              title="Spread guests evenly across every table"
              className="px-3 py-2 text-xs font-medium leading-snug border-l"
              style={{ borderColor: C.line, backgroundColor: fillMode === "spread" ? C.ink : C.card, color: fillMode === "spread" ? C.paper : C.ink }}
            >
              Spread across all tables
            </button>
          </div>
        </div>
        <SettingRow
          label="Keep close to current plan when regenerating"
          checked={minimizeChanges}
          disabled={readOnly}
          onChange={setMinimizeChanges}
        />
        {seatingView === "map" && (
          <SettingRow
            label="Show guest names on the map"
            hint={showGuestNames ? "Names appear once you zoom in" : "Coloured dots only"}
            checked={showGuestNames}
            onChange={setShowGuestNames}
          />
        )}
        {notedGuestCount > 0 && (
          <SettingRow
            label={`Highlight guests with notes (${notedGuestCount})`}
            hint="Marks their seats and lists them for a final check"
            checked={highlightNotes}
            onChange={setHighlightNotes}
          />
        )}
        {(hiddenTableCount > 0 || showAllTables) && (
          <SettingRow
            label={showAllTables ? "Showing unused tables" : `Show ${hiddenTableCount} unused table${hiddenTableCount > 1 ? "s" : ""}`}
            hint="Empty tables auto-generate left out"
            checked={showAllTables}
            onChange={setShowAllTables}
          />
        )}
        {!readOnly && !showAllTables && seatedCount > 0 && emptyVisibleTableIds.length > 0 && (
          <div className="px-4 py-3 flex items-center justify-between gap-3 border-b" style={{ borderColor: C.line }}>
            <span className="min-w-0 text-sm" style={{ color: C.ink }}>
              {emptyVisibleTableIds.length} empty table{emptyVisibleTableIds.length > 1 ? "s" : ""} on the map
            </span>
            <button
              onClick={() => {
                const prev = hiddenTableIds;
                setHiddenTableIds(Array.from(new Set([...hiddenTableIds, ...emptyVisibleTableIds])));
                pushUndo(`Hid ${emptyVisibleTableIds.length} empty table${emptyVisibleTableIds.length > 1 ? "s" : ""}.`, () => setHiddenTableIds(prev));
              }}
              className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border whitespace-nowrap"
              style={{ borderColor: C.gold, color: C.gold }}
            >
              Hide them
            </button>
          </div>
        )}
      </div>
      </div>

      {liveSummary && (
        <div
          className="mb-5 p-3 rounded-xl text-sm flex items-start gap-2"
          style={{ backgroundColor: liveSummary.violated.length ? "#F3E4E4" : "#EEF2EA", color: liveSummary.violated.length ? C.wine : C.sage }}
        >
          <Sparkles size={16} className="mt-0.5 shrink-0" />
          <div>
            {justGenerated && <span className="font-semibold">Generated. </span>}
            {liveSummary.satisfied} of {liveSummary.total} rules currently satisfied.
            {liveSummary.violated.length > 0 && (
              <> Still conflicting: {liveSummary.violated.map((v) => `${sideLabel(v.aType, v.aId)} / ${sideLabel(v.bType, v.bId)}`).join(", ")}.</>
            )}
            {liveSummary.violated.length === 0 && " Drag anyone and this updates instantly."}
          </div>
        </div>
      )}

      <div className="mb-2 flex items-center gap-2 text-sm" style={{ color: C.ink }}>
        <Users size={15} style={{ color: C.gold }} />
        <span>
          <strong>{seatedCount}</strong> of {activeGuests.length} guest{activeGuests.length === 1 ? "" : "s"} seated
          {unseatedGuests.length > 0 && <span style={{ color: C.muted }}> · {unseatedGuests.length} unseated</span>}
          {notedGuestCount > 0 && (
            <span style={{ color: C.muted }}>
              {" "}
              · {notedGuestCount} with note{notedGuestCount === 1 ? "" : "s"}
            </span>
          )}
          {guests.length > activeGuests.length && (
            <span style={{ color: C.muted }}>
              {" "}
              · {guests.length - activeGuests.length} declined
            </span>
          )}
        </span>
      </div>

      {(groupStats.byGroup.length > 0 || groupStats.ungrouped.total > 0) && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {groupStats.byGroup.map(({ group, total, seated }) => (
            <div
              key={group.id}
              className="text-[11px] px-2 py-0.5 rounded-full border font-medium"
              style={{ borderColor: group.color, color: group.color }}
            >
              {group.name}: {seated}/{total} seated
            </div>
          ))}
          {groupStats.ungrouped.total > 0 && (
            <div className="text-[11px] px-2 py-0.5 rounded-full border font-medium" style={{ borderColor: C.line, color: C.muted }}>
              No group: {groupStats.ungrouped.seated}/{groupStats.ungrouped.total} seated
            </div>
          )}
        </div>
      )}

      {mealStats.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {mealStats.map(({ choice, count }) => (
            <div
              key={choice}
              className="text-[11px] px-2 py-0.5 rounded-full border font-medium"
              style={{ borderColor: C.line, color: C.ink }}
            >
              {choice}: {count}
            </div>
          ))}
        </div>
      )}

      {highlightNotes && notedGuests.length > 0 && (
        <div className="mb-5 p-3 rounded-xl text-sm" style={{ backgroundColor: C.goldSoft, color: C.ink }}>
          <div className="flex items-center gap-2 font-semibold mb-1.5" style={{ color: C.gold }}>
            <StickyNote size={16} />
            {notedGuests.length} guest{notedGuests.length === 1 ? "" : "s"} with a note — highlighted on the map below
          </div>
          <ul className="space-y-1 pl-1">
            {notedGuests.map((g) => (
              <li key={g.id}>
                <strong style={{ fontFamily: FONT.display }}>{g.name}</strong>
                {seatOfGuest[g.id] ? ` (${tableById[seatsById[seatOfGuest[g.id]]?.tableId ?? ""]?.label ?? ""})` : " (unseated)"}
                : {g.note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {underfilledTables.length > 0 && (
        <div className="mb-5 p-3 rounded-xl text-sm" style={{ backgroundColor: "#FBF3E4", color: C.ink }}>
          <div className="flex items-center gap-2 font-semibold" style={{ color: C.gold }}>
            <AlertTriangle size={16} />
            {underfilledTables.length} table{underfilledTables.length === 1 ? "" : "s"} under half full
          </div>
          <ul className="mt-1.5 space-y-1 pl-1">
            {underfilledTables.map(({ table, occupied }) => (
              <li key={table.id}>
                <strong>{table.label}</strong>: {occupied}/{table.capacity} seated — move guests here from a fuller table, or shrink/remove this table type in Step 1.
              </li>
            ))}
          </ul>
        </div>
      )}

      {unseatedGuests.length > 0 && (
        <div className="mb-5">
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.muted }}>
            Unseated ({unseatedGuests.length}) — {picked ? "click a seat to place" : "click a guest, then a seat"}
          </div>
          <div className="flex flex-wrap gap-2">
            {unseatedGuests.map((g) => (
              <div
                key={g.id}
                draggable={!readOnly}
                onDragStart={(e) => handleDragStart(e, g.id)}
                onClick={() => handlePoolClick(g.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handlePoolClick(g.id);
                  }
                }}
                role="button"
                tabIndex={readOnly ? -1 : 0}
                aria-pressed={picked === g.id}
                title={g.note || undefined}
                className="px-3 py-1.5 rounded-lg text-sm cursor-pointer border select-none flex items-center gap-1.5"
                style={{
                  fontFamily: FONT.display,
                  backgroundColor: picked === g.id ? C.gold : C.card,
                  color: picked === g.id ? "#fff" : C.ink,
                  borderColor: C.goldSoft,
                }}
              >
                {g.name}
                {g.note && (
                  <StickyNote size={11} style={{ color: picked === g.id ? "#fff" : C.gold }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {seatingView === "map" && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]" style={{ color: C.muted }}>
          <span className="flex items-center gap-1.5">
            <span className="inline-block rounded" style={{ width: 14, height: 10, border: `1.5px dashed ${C.line}` }} />
            Empty
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block rounded" style={{ width: 14, height: 10, border: `1.5px solid ${C.gold}`, backgroundColor: "#fff" }} />
            Seated
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block rounded" style={{ width: 14, height: 10, border: `1.5px solid ${C.wine}`, backgroundColor: "#fff" }} />
            Rule conflict
          </span>
          {namesOnMap && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block rounded-full" style={{ width: 7, height: 7, backgroundColor: "#000" }} />
              Has a note
            </span>
          )}
          {groups.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block rounded-full" style={{ width: 7, height: 7, backgroundColor: C.muted }} />
              {namesOnMap ? "Group color" : "Group color (dot fill)"}
            </span>
          )}
          <span className="flex items-center gap-1.5 basis-full sm:basis-auto sm:ml-auto">
            <Move size={11} />
            Pinch or Ctrl+scroll to zoom · drag the floor to move around{readOnly ? "" : " · tap a table for options, or press and hold to drag it"}
          </span>
        </div>
      )}

      {seatingView === "map" ? (
        <div
          ref={map.viewportRef}
          {...map.handlers}
          onDragOver={(e) => e.preventDefault()}
          className={mapFullscreen ? "fixed inset-0 z-[60] overflow-hidden" : "relative rounded-2xl border overflow-hidden"}
          style={{
            borderColor: C.line,
            backgroundColor: "#FCFAF4",
            // Big enough to work in on a phone, but leaves a strip of page to
            // scroll past it (the map itself captures swipes for panning).
            ...(mapFullscreen ? {} : { height: "min(78dvh, 900px)", minHeight: 360 }),
            touchAction: "none",
            overscrollBehavior: "contain",
            userSelect: "none",
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
            cursor: movingItem ? "crosshair" : "grab",
            outlineColor: C.gold,
          }}
          // Long-press on a phone would otherwise pop the browser's context menu.
          onContextMenu={(e) => e.preventDefault()}
          // Tapping the map: places a "Move"d table/fixture, or (on empty floor)
          // clears the current selection.
          onClick={(e) => {
            const el = e.target as HTMLElement;
            if (el.closest("[data-map-control]")) return;
            if (movingItem) {
              placeMovingItem(e.clientX, e.clientY);
              return;
            }
            if (!el.closest("[data-map-item]")) clearMapSelection();
          }}
          tabIndex={0}
          role="region"
          aria-label="Seating map. Arrow keys move around, plus and minus zoom, 0 shows the whole room."
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              if (movingItem || selectedTableId || selectedFixtureId || mapSearchOpen) {
                setMovingItem(null);
                clearMapSelection();
                setMapSearchOpen(false);
                e.stopPropagation();
              }
              return;
            }
            map.handlers.onKeyDown(e);
          }}
        >
          {/* Pan/zoom transform is written onto this layer directly by useMapViewport. */}
          <div ref={map.contentRef} className="absolute left-0 top-0">
          <div ref={mapCaptureRef} className="relative" style={{ width: room.width, height: room.height, minWidth: room.width }}>
            <svg className="absolute inset-0 pointer-events-none" width={room.width} height={room.height}>
              {flatViolations
                .filter((v) => v.status !== "unseated")
                .filter((v) => v.status === "violated" || v.aId === hoveredGuest || v.bId === hoveredGuest || v.aId === picked || v.bId === picked)
                .map((v) => {
                  const p1 = seatPixel(seatOfGuest[v.aId]);
                  const p2 = seatPixel(seatOfGuest[v.bId]);
                  const bad = v.status === "violated";
                  return (
                    <line
                      key={`${v.parentId}-${v.aId}-${v.bId}`}
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke={bad ? C.wine : C.gold}
                      strokeWidth={bad ? 2 : 1.5}
                      strokeDasharray={bad ? "5,4" : "0"}
                      opacity={0.75}
                    />
                  );
                })}
            </svg>

            {fixtures.map((f) => {
              const def = FIXTURE_DEFAULTS[f.type];
              const fl = room.fixtures[f.id];
              if (!fl) return null;
              const live = fixtureResize?.id === f.id ? fixtureResize : null;
              const dims = live ? { w: live.w, h: live.h } : { w: fl.w, h: fl.h };
              const basePos = live ? { cx: live.cx, cy: live.cy } : { cx: fl.cx, cy: fl.cy };
              const pos = dragFixture && dragFixture.id === f.id ? { cx: dragFixture.x, cy: dragFixture.y } : basePos;
              const pxPerM = PX_PER_M * layout.scale;
              const rot = fixtureRot(f);
              const isRotatingThis = rotating?.kind === "fixture" && rotating.id === f.id;
              // Half-height of the area the turned fixture covers — where the menu and size box go.
              const coverHH = rotatedHalfExtents(dims.w / 2, dims.h / 2, rot).hh;
              const sizeLabel = `${formatM(dims.w / pxPerM)} × ${formatM(dims.h / pxPerM)} m`;

              // PowerPoint-style resize: drag a side to change one dimension, a
              // corner for both (hold Shift on a corner to keep the proportions).
              // The opposite side stays put.
              const beginFixtureResize = (e: React.PointerEvent<HTMLDivElement>, hx: -1 | 0 | 1, hy: -1 | 0 | 1) => {
                e.preventDefault();
                e.stopPropagation();
                const handle = e.currentTarget;
                handle.setPointerCapture(e.pointerId);
                const zoom = map.getScale();
                map.beginItemDrag();
                // Work in the fixture's own (turned) frame, centred on it.
                const start = { l: -dims.w / 2, r: dims.w / 2, t: -dims.h / 2, b: dims.h / 2 };
                const c0 = { x: pos.cx, y: pos.cy };
                const rr = (rot * Math.PI) / 180;
                const cosR = Math.cos(rr);
                const sinR = Math.sin(rr);
                const minPx = FIXTURE_MIN_M * pxPerM;
                const sx = e.clientX;
                const sy = e.clientY;
                const aspect = dims.w / dims.h;
                const compute = (clientX: number, clientY: number, keepAspect: boolean) => {
                  let { l, r, t, b } = start;
                  const sdx = (clientX - sx) / zoom;
                  const sdy = (clientY - sy) / zoom;
                  // Screen drag → the fixture's own axes.
                  const dx = sdx * cosR + sdy * sinR;
                  const dy = -sdx * sinR + sdy * cosR;
                  if (hx === -1) l = Math.min(r - minPx, l + dx);
                  if (hx === 1) r = Math.max(l + minPx, r + dx);
                  if (hy === -1) t = Math.min(b - minPx, t + dy);
                  if (hy === 1) b = Math.max(t + minPx, b + dy);
                  if (keepAspect && hx !== 0 && hy !== 0) {
                    const w = r - l;
                    const h = b - t;
                    if (w / h > aspect) {
                      const nh = w / aspect;
                      if (hy === -1) t = b - nh;
                      else b = t + nh;
                    } else {
                      const nw = h * aspect;
                      if (hx === -1) l = r - nw;
                      else r = l + nw;
                    }
                  }
                  const lc = rotateOffset((l + r) / 2, (t + b) / 2, rot);
                  return { id: f.id, cx: c0.x + lc.dx, cy: c0.y + lc.dy, w: r - l, h: b - t };
                };
                let last = compute(sx, sy, false);
                setFixtureResize(last);
                const onMove = (ev: PointerEvent) => {
                  last = compute(ev.clientX, ev.clientY, ev.shiftKey);
                  setFixtureResize(last);
                };
                const onUp = () => {
                  handle.removeEventListener("pointermove", onMove);
                  handle.removeEventListener("pointerup", onUp);
                  handle.removeEventListener("pointercancel", onUp);
                  map.endItemDrag();
                  setFixtures((list) =>
                    list.map((x) =>
                      x.id === f.id ? { ...x, wM: roundM(last.w / pxPerM), hM: roundM(last.h / pxPerM), sizeScale: undefined } : x
                    )
                  );
                  moveFixture(f.id, last.cx, last.cy);
                  setFixtureResize(null);
                };
                handle.addEventListener("pointermove", onMove);
                handle.addEventListener("pointerup", onUp);
                handle.addEventListener("pointercancel", onUp);
              };
              // Label grows with the fixture so a big dance floor isn't labelled in 11px type.
              const labelPx = Math.round(Math.max(11, Math.min(30, Math.min(dims.w, dims.h) * 0.14)));
              const beginFixtureDrag = (startClientX: number, startClientY: number) => {
                const startX = pos.cx;
                const startY = pos.cy;
                // Screen pixels → room pixels at the current zoom.
                const zoom = map.getScale();
                map.beginItemDrag();
                setDragFixture({ id: f.id, x: startX, y: startY });
                const compute = (clientX: number, clientY: number) => ({
                  x: Math.max(dims.w / 2, startX + (clientX - startClientX) / zoom),
                  y: Math.max(dims.h / 2, startY + (clientY - startClientY) / zoom),
                });
                const onMouseMove = (ev: MouseEvent) => setDragFixture({ id: f.id, ...compute(ev.clientX, ev.clientY) });
                const onMouseUp = (ev: MouseEvent) => {
                  const p = compute(ev.clientX, ev.clientY);
                  if (Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) > 4) {
                    tableJustDragged.current = true;
                    moveFixture(f.id, p.x, p.y);
                  }
                  cleanup();
                };
                const onTouchMove = (ev: TouchEvent) => {
                  const touch = ev.touches[0];
                  if (!touch) return;
                  ev.preventDefault();
                  setDragFixture({ id: f.id, ...compute(touch.clientX, touch.clientY) });
                };
                const onTouchEnd = (ev: TouchEvent) => {
                  const touch = ev.changedTouches[0];
                  if (touch) {
                    const p = compute(touch.clientX, touch.clientY);
                    moveFixture(f.id, p.x, p.y);
                  }
                  cleanup();
                };
                function cleanup() {
                  setDragFixture(null);
                  map.endItemDrag();
                  window.removeEventListener("mousemove", onMouseMove);
                  window.removeEventListener("mouseup", onMouseUp);
                  window.removeEventListener("touchmove", onTouchMove);
                  window.removeEventListener("touchend", onTouchEnd);
                  window.removeEventListener("touchcancel", cleanup);
                }
                window.addEventListener("mousemove", onMouseMove);
                window.addEventListener("mouseup", onMouseUp);
                window.addEventListener("touchmove", onTouchMove, { passive: false });
                window.addEventListener("touchend", onTouchEnd);
                window.addEventListener("touchcancel", cleanup);
              };
              const startFixtureDrag = (e: React.MouseEvent) => {
                if (readOnly) return;
                e.preventDefault();
                beginFixtureDrag(e.clientX, e.clientY);
              };
              const startFixtureDragTouch = (e: React.TouchEvent) => {
                if (readOnly) return;
                startLongPress(e, beginFixtureDrag);
              };
              const selectedHere = selectedFixtureId === f.id && !readOnly && dragFixture?.id !== f.id;
              const zoom = map.view.scale;
              return (
                // Zero-size anchor at the fixture's centre: the shape inside it turns,
                // while its menu, size box and readouts stay upright.
                <div key={f.id} className="absolute" style={{ left: pos.cx, top: pos.cy, width: 0, height: 0 }}>
                  <div
                    data-map-item
                    onMouseDown={startFixtureDrag}
                    onTouchStart={startFixtureDragTouch}
                    onClick={() => {
                      if (tableJustDragged.current) {
                        tableJustDragged.current = false;
                        return;
                      }
                      if (movingItem) return; // the map's click handler places the item
                      setSelectedTableId(null);
                      setSelectedFixtureId(f.id);
                    }}
                    className="absolute flex items-center justify-center text-center px-2 group"
                    style={{
                      boxShadow: selectedFixtureId === f.id ? `0 0 0 3px ${C.goldSoft}` : undefined,
                      left: -dims.w / 2,
                      top: -dims.h / 2,
                      width: dims.w,
                      height: dims.h,
                      transform: rot ? `rotate(${rot}deg)` : undefined,
                      borderRadius: Math.min(16, dims.h / 4),
                      border: `2px dashed ${def.border}`,
                      backgroundColor: def.fill,
                      cursor: readOnly ? "default" : "move",
                      touchAction: "none",
                    }}
                  >
                    <span className="font-semibold uppercase tracking-wide leading-tight" style={{ color: def.border, fontSize: labelPx }}>
                      {f.label ?? def.label}
                    </span>
                    {!readOnly && (
                      <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFixtureWithUndo(f.id);
                        }}
                        aria-label={`Remove ${f.label ?? def.label}`}
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ backgroundColor: "#fff", border: `1px solid ${def.border}`, color: def.border }}
                      >
                        <X size={11} />
                      </button>
                    )}
                    {(selectedHere || live || isRotatingThis) && (
                      <>
                        {/* eight PowerPoint-style resize handles — they turn with the shape */}
                        {(
                          [
                            [-1, -1, "nwse-resize"],
                            [0, -1, "ns-resize"],
                            [1, -1, "nesw-resize"],
                            [1, 0, "ew-resize"],
                            [1, 1, "nwse-resize"],
                            [0, 1, "ns-resize"],
                            [-1, 1, "nesw-resize"],
                            [-1, 0, "ew-resize"],
                          ] as [-1 | 0 | 1, -1 | 0 | 1, string][]
                        ).map(([hx, hy, cursor]) => (
                          <div
                            key={`${hx},${hy}`}
                            data-map-control
                            role="presentation"
                            onPointerDown={(e) => beginFixtureResize(e, hx, hy)}
                            onMouseDown={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute z-10 flex items-center justify-center"
                            style={{
                              // 32px finger target around a 12px visible square, constant on screen.
                              width: 32,
                              height: 32,
                              left: `${50 + hx * 50}%`,
                              top: `${50 + hy * 50}%`,
                              transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                              cursor,
                              touchAction: "none",
                            }}
                          >
                            <span
                              className="block rounded-sm"
                              style={{ width: 12, height: 12, backgroundColor: "#fff", border: `2px solid ${def.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }}
                            />
                          </div>
                        ))}
                        {/* rotate handle, below the bottom edge */}
                        <div
                          className="absolute pointer-events-none"
                          style={{ left: "50%", top: "100%", width: 2 / zoom, height: 30 / zoom, marginLeft: -1 / zoom, backgroundColor: def.border }}
                        />
                        <div
                          data-map-control
                          role="presentation"
                          title="Drag to turn (Shift: 15° steps)"
                          onPointerDown={(e) => beginRotate(e, "fixture", f.id, pos.cx, pos.cy, rot, (d) => setFixtureRotation(f.id, d))}
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute z-10 flex items-center justify-center"
                          style={{
                            width: 36,
                            height: 36,
                            left: "50%",
                            top: `calc(100% + ${30 / zoom}px)`,
                            transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                            cursor: "grab",
                            touchAction: "none",
                          }}
                        >
                          <span
                            className="flex items-center justify-center rounded-full"
                            style={{ width: 22, height: 22, backgroundColor: "#fff", border: `2px solid ${def.border}`, color: def.border, boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }}
                          >
                            <RotateCw size={12} />
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {selectedHere && !live && !isRotatingThis && (
                    <div
                      data-map-control
                      className="absolute z-30 flex flex-wrap justify-center items-center gap-1 rounded-3xl p-1 shadow-md"
                      style={{
                        left: 0,
                        // Clear of the top resize handles.
                        top: -coverHH - 24 / zoom,
                        transform: `translate(-50%, -100%) scale(${1 / zoom})`,
                        transformOrigin: "50% 100%",
                        backgroundColor: C.ink,
                        // Wraps onto two rows rather than running off a phone screen.
                        width: "max-content",
                        maxWidth: 320,
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MapMenuButton icon={<Minus size={13} />} label="Smaller" hideLabel onClick={() => resizeFixture(f.id, 1 / 1.15)} />
                      <MapMenuButton icon={<Plus size={13} />} label="Bigger" hideLabel onClick={() => resizeFixture(f.id, 1.15)} />
                      <MapMenuButton
                        icon={<Maximize2 size={13} />}
                        label={sizeLabel}
                        onClick={() => setSizeEditorId((cur) => (cur === f.id ? null : f.id))}
                      />
                      <MapMenuButton icon={<RotateCw size={13} />} label="Turn 90°" hideLabel onClick={() => setFixtureRotation(f.id, rot + 90)} />
                      <MapMenuButton
                        icon={<Move size={13} />}
                        label="Move"
                        onClick={() => {
                          setMovingItem({ kind: "fixture", id: f.id, label: f.label ?? def.label });
                          clearMapSelection();
                        }}
                      />
                      <MapMenuButton
                        icon={<Trash2 size={13} />}
                        label="Remove"
                        onClick={() => {
                          removeFixtureWithUndo(f.id);
                          clearMapSelection();
                        }}
                      />
                    </div>
                  )}
                  {selectedHere && sizeEditorId === f.id && !live && !isRotatingThis && (
                    <div className="absolute" style={{ left: 0, top: coverHH + 56 / zoom, width: 0, height: 0 }}>
                      <FixtureSizeEditor
                        key={`${f.id}-${dims.w}-${dims.h}`}
                        wM={dims.w / pxPerM}
                        hM={dims.h / pxPerM}
                        zoom={zoom}
                        border={def.border}
                        onChange={(w, h) => setFixtureSizeM(f.id, w, h)}
                        onAuto={
                          f.wM || f.sizeScale
                            ? () => {
                                setFixtures((list) => list.map((x) => (x.id === f.id ? { ...x, wM: undefined, hM: undefined, sizeScale: undefined } : x)));
                                setSizeEditorId(null);
                              }
                            : undefined
                        }
                        autoLabel={f.type === "danceFloor" ? "Auto (fits guest count)" : "Reset to standard size"}
                      />
                    </div>
                  )}
                  {(live || isRotatingThis) && (
                    <div
                      className="absolute z-20 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold pointer-events-none"
                      style={{
                        left: 0,
                        top: 0,
                        transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                        backgroundColor: C.ink,
                        color: "#fff",
                      }}
                    >
                      {isRotatingThis ? `${rot}°` : sizeLabel}
                    </div>
                  )}
                </div>
              );
            })}

            {visibleTables.map((t) => {
              const basePos = layout.positions[t.id];
              const dragAdjustedPos =
                dragTable && dragTable.id === t.id ? { ...basePos, cx: dragTable.x, cy: dragTable.y } : basePos;
              const pos = dragAdjustedPos;
              const seatRoles = t.shape === "square" || t.shape === "rectangle" ? rectSeatRoles(t.capacity, t.headCount, t.footCount) : null;
              // When seats are packed tightly enough that 68px-wide horizontal name
              // tags would actually overlap, switch those tags to a narrower vertical
              // layout. Threshold is intentionally below 68 (not just under it) so
              // ordinary tables — even fairly full 8-tops — keep the familiar
              // horizontal tag; only genuinely crowded tables switch.
              const tagsCrowded = namesOnMap && minSeatSpacing(t.shape, pos.w, pos.h, t.capacity, 34, t.headCount, t.footCount) < 64;
              const beginTableDrag = (startClientX: number, startClientY: number) => {
                const startX = basePos.cx;
                const startY = basePos.cy;
                const minCoord = basePos.seatR + 10;
                // Screen pixels → room pixels at the current zoom.
                const zoom = map.getScale();
                map.beginItemDrag();
                setDragTable({ id: t.id, x: startX, y: startY });
                const compute = (clientX: number, clientY: number) => ({
                  x: Math.max(minCoord, startX + (clientX - startClientX) / zoom),
                  y: Math.max(minCoord, startY + (clientY - startClientY) / zoom),
                });
                const onMouseMove = (ev: MouseEvent) => setDragTable({ id: t.id, ...compute(ev.clientX, ev.clientY) });
                const onMouseUp = (ev: MouseEvent) => {
                  const p = compute(ev.clientX, ev.clientY);
                  // A press that barely moved is a click (select the table), not a move.
                  if (Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) > 4) {
                    tableJustDragged.current = true;
                    moveTable(t.id, p.x, p.y);
                  }
                  cleanup();
                };
                const onTouchMove = (ev: TouchEvent) => {
                  const touch = ev.touches[0];
                  if (!touch) return;
                  ev.preventDefault();
                  setDragTable({ id: t.id, ...compute(touch.clientX, touch.clientY) });
                };
                const onTouchEnd = (ev: TouchEvent) => {
                  const touch = ev.changedTouches[0];
                  if (touch) {
                    const p = compute(touch.clientX, touch.clientY);
                    moveTable(t.id, p.x, p.y);
                  }
                  cleanup();
                };
                function cleanup() {
                  setDragTable(null);
                  map.endItemDrag();
                  window.removeEventListener("mousemove", onMouseMove);
                  window.removeEventListener("mouseup", onMouseUp);
                  window.removeEventListener("touchmove", onTouchMove);
                  window.removeEventListener("touchend", onTouchEnd);
                  window.removeEventListener("touchcancel", cleanup);
                }
                window.addEventListener("mousemove", onMouseMove);
                window.addEventListener("mouseup", onMouseUp);
                window.addEventListener("touchmove", onTouchMove, { passive: false });
                window.addEventListener("touchend", onTouchEnd);
                window.addEventListener("touchcancel", cleanup);
              };
              const startTableDrag = (e: React.MouseEvent) => {
                if (readOnly) return;
                e.preventDefault();
                beginTableDrag(e.clientX, e.clientY);
              };
              const startTableDragTouch = (e: React.TouchEvent) => {
                if (readOnly) return;
                startLongPress(e, beginTableDrag);
              };

              // Resizing changes how big the table *renders*, not its seat count —
              // a purely visual dial (t.sizeScale, default 1) independent of
              // capacity. Every physical table in this group shares one size
              // already, the same way they share one capacity, so dragging one
              // instance's edge resizes them all together. Doesn't try to
              // live-reflow the whole floor plan mid-drag (every other table's
              // auto-placement position depends on the biggest table's footprint,
              // so continuous reflow would make already-placed tables jump around)
              // — shows a "→ 130%" preview and commits the real layout change,
              // once, on release.
              const currentSizeScale = t.sizeScale;
              const beginTableResize = (startClientX: number) => {
                const startScale = currentSizeScale;
                const zoom = map.getScale();
                map.beginItemDrag();
                setResizingGroupId(t.groupId);
                setResizePreviewScale(startScale);
                const compute = (clientX: number) => {
                  const delta = (clientX - startClientX) / zoom / 160;
                  return Math.round(Math.max(0.5, Math.min(2.5, startScale + delta)) * 100) / 100;
                };
                const onMouseMove = (ev: MouseEvent) => setResizePreviewScale(compute(ev.clientX));
                const onMouseUp = (ev: MouseEvent) => {
                  const next = compute(ev.clientX);
                  if (next !== startScale) updateTableGroup(t.groupId, { sizeScale: next });
                  cleanup();
                };
                const onTouchMove = (ev: TouchEvent) => {
                  const touch = ev.touches[0];
                  if (!touch) return;
                  ev.preventDefault();
                  setResizePreviewScale(compute(touch.clientX));
                };
                const onTouchEnd = (ev: TouchEvent) => {
                  const touch = ev.changedTouches[0];
                  if (touch) {
                    const next = compute(touch.clientX);
                    if (next !== startScale) updateTableGroup(t.groupId, { sizeScale: next });
                  }
                  cleanup();
                };
                function cleanup() {
                  setResizingGroupId(null);
                  setResizePreviewScale(null);
                  map.endItemDrag();
                  window.removeEventListener("mousemove", onMouseMove);
                  window.removeEventListener("mouseup", onMouseUp);
                  window.removeEventListener("touchmove", onTouchMove);
                  window.removeEventListener("touchend", onTouchEnd);
                  window.removeEventListener("touchcancel", cleanup);
                }
                window.addEventListener("mousemove", onMouseMove);
                window.addEventListener("mouseup", onMouseUp);
                window.addEventListener("touchmove", onTouchMove, { passive: false });
                window.addEventListener("touchend", onTouchEnd);
                window.addEventListener("touchcancel", cleanup);
              };
              const isResizingThis = resizingGroupId === t.groupId;
              // While actively dragging this table's resize handle, render at the
              // live preview scale instead of the committed t.sizeScale — grows/
              // shrinks on screen as you pull, same as the drag-to-reposition
              // preview does for position. The real tableGroups update (and the
              // one-time layout recompute for every other table) still only
              // happens once, on release, in beginTableResize above.
              const liveResizeRatio =
                isResizingThis && resizePreviewScale != null ? resizePreviewScale / (t.sizeScale || 1) : 1;
              const renderPos = liveResizeRatio !== 1 ? { ...pos, w: pos.w * liveResizeRatio, h: pos.h * liveResizeRatio } : pos;
              const tRot = tableRot(t.id);
              // Which seats get a narrow rotated name tag instead of the normal
              // upright one. Only on crowded tables, and only for tags that would
              // really touch another one: each seat first gets the tag its edge
              // calls for (rotated on a top/bottom edge, after the table is
              // turned), then any rotated tag goes back upright if an upright tag
              // there wouldn't touch a neighbour. That keeps the head and foot of a
              // turned rectangle readable when only its long sides are packed.
              const tallTagOfSeat: boolean[] = (() => {
                const n = t.capacity;
                if (!tagsCrowded) return new Array(n).fill(false);
                const centers = Array.from({ length: n }, (_, i) => {
                  const o = seatOffset(t.shape, renderPos.w, renderPos.h, i, n, 34, t.headCount, t.footCount);
                  return { o, ...rotateOffset(o.dx, o.dy, tRot) };
                });
                const tall = centers.map(({ o }, i) => {
                  let nx: number;
                  let ny: number;
                  if (seatRoles) {
                    if (seatRoles.headIdxs.includes(i)) [nx, ny] = [-1, 0];
                    else if (seatRoles.footIdxs.includes(i)) [nx, ny] = [1, 0];
                    else if (seatRoles.sideTopIdxs.includes(i)) [nx, ny] = [0, -1];
                    else [nx, ny] = [0, 1];
                  } else {
                    // Outward normal of the elliptical seat ring.
                    const rw = renderPos.w / 2 + 34;
                    const rh = renderPos.h / 2 + 34;
                    nx = o.dx / (rw * rw);
                    ny = o.dy / (rh * rh);
                  }
                  const facing = rotateOffset(nx, ny, tRot);
                  return Math.abs(facing.dy) >= Math.abs(facing.dx);
                });
                const W = { w: 68, h: 30 };
                const T = { w: 22, h: 100 };
                const touches = (i: number, j: number, bi: { w: number; h: number }, bj: { w: number; h: number }) =>
                  Math.abs(centers[i].dx - centers[j].dx) < (bi.w + bj.w) / 2 + 2 &&
                  Math.abs(centers[i].dy - centers[j].dy) < (bi.h + bj.h) / 2 + 2;
                return tall.map((isTall, i) => {
                  if (!isTall) return false;
                  for (let j = 0; j < n; j++) {
                    if (j !== i && touches(i, j, W, tall[j] ? T : W)) return true;
                  }
                  return false;
                });
              })();
              const isRotatingThis = rotating?.kind === "table" && rotating.id === t.id;
              const canTurn = t.shape !== "round";
              // Half-height of what the turned table (with its seats) covers — menu sits above it.
              const coverHH = rotatedHalfExtents(renderPos.w / 2 + 34, renderPos.h / 2 + 34, tRot).hh;
              const rc = Math.abs(Math.cos((tRot * Math.PI) / 180));
              const rs = Math.abs(Math.sin((tRot * Math.PI) / 180));
              // Room for the upright table name inside the turned table.
              const nameWidth = Math.max(40, Math.min(renderPos.w * rc + renderPos.h * rs, renderPos.w / Math.max(rc, 0.01), renderPos.h / Math.max(rs, 0.01)) - 12);
              const resizeHandleOffset = rotateOffset(renderPos.w / 2, 0, tRot);
              const rotateHandleOffset = rotateOffset(0, renderPos.h / 2 + 34 + 46, tRot);
              return (
                <div key={t.id} className="group">
                  <div
                    data-map-item
                    onMouseDown={startTableDrag}
                    onTouchStart={startTableDragTouch}
                    onClick={() => {
                      if (tableJustDragged.current) {
                        tableJustDragged.current = false;
                        return;
                      }
                      if (movingItem) return; // the map's click handler places the item
                      if (atOverview) {
                        zoomToTable(t.id);
                        clearMapSelection();
                        return;
                      }
                      setSelectedFixtureId(null);
                      setSelectedTableId(t.id);
                    }}
                    className="absolute border-2 flex items-center justify-center text-center px-2"
                    style={{
                      boxShadow:
                        dragTable?.id === t.id
                          ? "0 8px 22px rgba(34,31,43,0.22)"
                          : selectedTableId === t.id
                          ? `0 0 0 3px ${C.goldSoft}`
                          : undefined,
                      left: renderPos.cx - renderPos.w / 2,
                      top: renderPos.cy - renderPos.h / 2,
                      width: renderPos.w,
                      height: renderPos.h,
                      transform: tRot ? `rotate(${tRot}deg)` : undefined,
                      borderRadius: shapeRadius(t.shape),
                      borderColor: selectedTableId === t.id ? C.gold : C.goldSoft,
                      backgroundColor: "#fff",
                      cursor: readOnly ? "default" : "move",
                      touchAction: "none",
                    }}
                  >
                    <input
                      id={`table-name-${t.id}`}
                      value={tableNameOverrides[t.id] ?? t.label}
                      onChange={(e) => renameTable(t.id, e.target.value)}
                      onBlur={(e) => {
                        if (e.target.value.trim().length === 0) {
                          setTableNameOverrides((m) => {
                            const next = { ...m };
                            delete next[t.id];
                            return next;
                          });
                        }
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      disabled={readOnly}
                      title="Click to rename this table"
                      className="text-[11px] font-medium leading-tight text-center bg-transparent outline-none shrink-0"
                      // Name stays upright and readable whichever way the table is turned.
                      style={{
                        color: C.muted,
                        fontFamily: FONT.body,
                        width: tRot ? nameWidth : "100%",
                        transform: tRot ? `rotate(${-tRot}deg)` : undefined,
                      }}
                    />
                    {isResizingThis && resizePreviewScale != null && (
                      <div
                        className="absolute text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none"
                        style={{
                          left: "50%",
                          bottom: renderPos.h / 2 + 6,
                          transform: "translateX(-50%)",
                          backgroundColor: C.ink,
                          color: "#fff",
                        }}
                      >
                        {Math.round(resizePreviewScale * 100)}%
                      </div>
                    )}
                  </div>
                  {!readOnly && (
                    <div
                      data-map-item
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        beginTableResize(e.clientX);
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        const touch = e.touches[0];
                        if (touch) beginTableResize(touch.clientX);
                      }}
                      title={`Drag to resize every "${t.label.replace(/\s\d+$/, "")}" table`}
                      className="absolute rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{
                        left: renderPos.cx + resizeHandleOffset.dx - 5,
                        top: renderPos.cy + resizeHandleOffset.dy - 9,
                        width: 10,
                        height: 18,
                        backgroundColor: C.gold,
                        border: "1.5px solid #fff",
                        cursor: "ew-resize",
                        touchAction: "none",
                      }}
                    />
                  )}
                  {selectedTableId === t.id && !readOnly && dragTable?.id !== t.id && canTurn && (
                    <>
                      <div
                        data-map-control
                        role="presentation"
                        title="Drag to turn (Shift: 15° steps)"
                        onPointerDown={(e) => beginRotate(e, "table", t.id, renderPos.cx, renderPos.cy, tRot, (d) => setTableRotation(t.id, d))}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute z-10 flex items-center justify-center"
                        style={{
                          left: renderPos.cx + rotateHandleOffset.dx,
                          top: renderPos.cy + rotateHandleOffset.dy,
                          width: 36,
                          height: 36,
                          transform: `translate(-50%, -50%) scale(${1 / map.view.scale})`,
                          cursor: "grab",
                          touchAction: "none",
                        }}
                      >
                        <span
                          className="flex items-center justify-center rounded-full"
                          style={{ width: 22, height: 22, backgroundColor: "#fff", border: `2px solid ${C.gold}`, color: C.gold, boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }}
                        >
                          <RotateCw size={12} />
                        </span>
                      </div>
                      {isRotatingThis && (
                        <div
                          className="absolute z-20 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold pointer-events-none"
                          style={{
                            left: renderPos.cx,
                            top: renderPos.cy,
                            transform: `translate(-50%, -50%) scale(${1 / map.view.scale})`,
                            backgroundColor: C.ink,
                            color: "#fff",
                          }}
                        >
                          {tRot}°
                        </div>
                      )}
                    </>
                  )}
                  {selectedTableId === t.id && !readOnly && dragTable?.id !== t.id && !isRotatingThis && (() => {
                    const seatedHere = occupiedCountByTable[t.id] || 0;
                    const group = tableGroups.find((g) => g.id === t.groupId);
                    const sharedSize = Number(group?.count) > 1;
                    const changeSize = (delta: number) =>
                      updateTableGroup(t.groupId, {
                        sizeScale: Math.round(Math.max(0.5, Math.min(2.5, (t.sizeScale || 1) + delta)) * 100) / 100,
                      });
                    return (
                      <div
                        data-map-control
                        className="absolute z-10 flex flex-col items-center gap-1"
                        style={{
                          left: renderPos.cx,
                          top: renderPos.cy - coverHH - 30,
                          // Constant on-screen size whatever the zoom level.
                          transform: `translate(-50%, -100%) scale(${1 / map.view.scale})`,
                          transformOrigin: "50% 100%",
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          className="flex flex-wrap justify-center items-center gap-1 rounded-3xl p-1 shadow-md"
                          style={{ backgroundColor: C.ink, width: "max-content", maxWidth: 320 }}
                        >
                          <MapMenuButton
                            icon={<Pencil size={13} />}
                            label="Rename"
                            onClick={() => {
                              const input = document.getElementById(`table-name-${t.id}`) as HTMLInputElement | null;
                              input?.focus();
                              input?.select();
                            }}
                          />
                          <MapMenuButton icon={<Minus size={13} />} label="Smaller" hideLabel onClick={() => changeSize(-0.15)} />
                          <MapMenuButton icon={<Plus size={13} />} label="Bigger" hideLabel onClick={() => changeSize(0.15)} />
                          {canTurn && (
                            <MapMenuButton
                              icon={<RotateCw size={13} />}
                              label={t.shape === "square" ? "Turn 45°" : "Turn 90°"}
                              hideLabel
                              onClick={() => setTableRotation(t.id, tRot + (t.shape === "square" ? 45 : 90))}
                            />
                          )}
                          <MapMenuButton
                            icon={<Move size={13} />}
                            label="Move"
                            onClick={() => {
                              setMovingItem({ kind: "table", id: t.id, label: t.label });
                              clearMapSelection();
                            }}
                          />
                          {seatedHere === 0 && (
                            <MapMenuButton icon={<Trash2 size={13} />} label="Remove" onClick={() => deleteTableWithUndo(t.id)} />
                          )}
                        </div>
                        {(seatedHere > 0 || sharedSize) && (
                          <div
                            className="whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium shadow-sm"
                            style={{ backgroundColor: C.card, color: C.muted, border: `1px solid ${C.line}` }}
                          >
                            {seatedHere > 0 ? `${seatedHere} seated — move them to remove this table` : `Size changes every "${group?.label}" table`}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {Array.from({ length: t.capacity }).map((_, i) => {
                    const seatId = `${t.id}#${i}`;
                    const o = seatOffset(t.shape, renderPos.w, renderPos.h, i, t.capacity, 34, t.headCount, t.footCount);
                    const { dx, dy } = rotateOffset(o.dx, o.dy, tRot);
                    const x = renderPos.cx + dx;
                    const y = renderPos.cy + dy;
                    const guestId = seatAssignment[seatId];
                    const guest = guestId ? guestById[guestId] : null;
                    const guestName = guest?.name ?? null;
                    const guestNote = guest?.note ?? null;
                    const guestGroupColor = guest?.groupIds?.map((gid) => groupById[gid]?.color).find(Boolean) ?? null;
                    const hasViolation = flatViolations.some((v) => v.status === "violated" && (v.seatA === seatId || v.seatB === seatId));
                    const emphasizeNote = highlightNotes && !!guestNote;
                    const seatRoleLabel =
                      seatRoles && seatRoles.headIdxs.includes(i)
                        ? "Head"
                        : seatRoles && seatRoles.footIdxs.includes(i)
                        ? "Foot"
                        : null;
                    const tallTag = tallTagOfSeat[i];
                    const boxW = namesOnMap ? (tallTag ? 22 : 68) : 16;
                    // Crowded (rotated) tags were capped at 58px tall — only room for
                    // a handful of characters before the ellipsis kicked in, so most
                    // full names were unreadable. 100px gives a rotated tag roughly
                    // twice the text room.
                    const boxH = namesOnMap ? (tallTag ? 100 : 30) : 16;
                    return (
                      <div key={seatId} data-map-item className="absolute" style={{ left: x - boxW / 2, top: y - boxH / 2 }}>
                      {seatRoleLabel && (
                        <span
                          className="absolute text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap"
                          style={{
                            color: C.gold,
                            left: boxW / 2,
                            ...(seatRoleLabel === "Head" ? { top: -13 } : { top: boxH + 3 }),
                            transform: "translateX(-50%)",
                          }}
                        >
                          {seatRoleLabel}
                        </span>
                      )}
                      <div
                        onClick={() => {
                          if (movingItem) return; // the map's click handler places the item
                          if (atOverview) {
                            zoomToTable(t.id);
                            return;
                          }
                          handleSeatClick(seatId);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleSeatClick(seatId);
                          }
                        }}
                        role="button"
                        tabIndex={readOnly ? -1 : 0}
                        aria-label={guestName ? (guestNote ? `${guestName} — ${guestNote}` : guestName) : "Empty seat"}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(e, seatId)}
                        onMouseEnter={() => guestId && setHoveredGuest(guestId)}
                        onMouseLeave={() => setHoveredGuest(null)}
                        draggable={!!guestId && !readOnly}
                        onDragStart={(e) => guestId && handleDragStart(e, guestId)}
                        className="absolute flex items-center justify-center text-center cursor-pointer transition-transform hover:scale-110"
                        style={
                          namesOnMap
                            ? {
                                left: 0,
                                top: 0,
                                width: boxW,
                                height: boxH,
                                borderRadius: 4,
                                border: `${emphasizeNote ? 2.5 : 1.5}px solid ${hasViolation ? C.wine : guestId ? C.gold : C.line}`,
                                backgroundColor: picked === guestId ? C.gold : emphasizeNote ? C.goldSoft : guestId ? "#fff" : "transparent",
                                borderStyle: guestId ? "solid" : "dashed",
                                boxShadow: emphasizeNote ? `0 0 0 2px ${C.goldSoft}` : "none",
                              }
                            : {
                                left: 0,
                                top: 0,
                                width: boxW,
                                height: boxH,
                                borderRadius: "50%",
                                border: `${emphasizeNote ? 2.5 : 1.5}px solid ${hasViolation ? C.wine : guestId ? guestGroupColor || C.gold : C.line}`,
                                backgroundColor: picked === guestId ? C.gold : guestId ? guestGroupColor || C.gold : "transparent",
                                borderStyle: guestId ? "solid" : "dashed",
                                boxShadow: emphasizeNote ? `0 0 0 2px ${C.goldSoft}` : "none",
                              }
                        }
                        title={guestName ? (guestNote ? `${guestName} — ${guestNote}` : guestName) : "Empty seat"}
                      >
                        {namesOnMap && guestGroupColor && (
                          <span
                            className="absolute rounded-full"
                            style={{
                              bottom: -3,
                              left: -3,
                              width: 7,
                              height: 7,
                              backgroundColor: guestGroupColor,
                              border: "1px solid #fff",
                            }}
                          />
                        )}
                        {namesOnMap && guestNote && (
                          <span
                            className="absolute rounded-full"
                            style={{
                              top: -3,
                              right: -3,
                              width: 7,
                              height: 7,
                              backgroundColor: picked === guestId ? "#fff" : "#000",
                              border: `1px solid ${picked === guestId ? "#000" : "#fff"}`,
                            }}
                          />
                        )}
                        {namesOnMap ? (
                          // Crowded tags use a CSS rotate transform rather than
                          // writing-mode: vertical-rl — html2canvas (used for the PDF
                          // export) rasterizes transforms reliably but doesn't render
                          // vertical writing-mode text at all, which was silently
                          // dropping every name from the exported seat map.
                          <span
                            className={
                              tallTag
                                ? "text-[10px] leading-none whitespace-nowrap overflow-hidden text-ellipsis inline-block"
                                : "text-[10px] px-1 truncate"
                            }
                            style={
                              tallTag
                                ? {
                                    fontFamily: guestId ? FONT.display : FONT.body,
                                    color: picked === guestId ? "#fff" : guestId ? C.ink : C.muted,
                                    width: boxH - 8,
                                    // Without this, the span is a flex child of the (deliberately
                                    // narrow, boxW-wide) seat box, and flexbox was shrinking it
                                    // back down to fit that width before the rotation ever
                                    // happened — silently undoing the `width` above and leaving
                                    // only a couple of characters visible. flexShrink: 0 lets the
                                    // tag keep its real length and overflow the box, same as the
                                    // Head/Foot role label already does above/below it.
                                    flexShrink: 0,
                                    transform: "rotate(-90deg)",
                                  }
                                : {
                                    fontFamily: guestId ? FONT.display : FONT.body,
                                    color: picked === guestId ? "#fff" : guestId ? C.ink : C.muted,
                                  }
                            }
                          >
                            {guestName || "+"}
                          </span>
                        ) : (
                          !guestId && (
                            <span className="text-[8px] leading-none" style={{ color: C.muted }}>
                              +
                            </span>
                          )
                        )}
                      </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {highlightSeatId && seatsById[highlightSeatId] && layout.positions[seatsById[highlightSeatId].tableId] && (() => {
              const p = seatPixel(highlightSeatId);
              return (
                <div className="absolute pointer-events-none" style={{ left: p.x - 26, top: p.y - 26, width: 52, height: 52 }}>
                  <div className="absolute inset-0 rounded-full motion-safe:animate-ping" style={{ border: `3px solid ${C.gold}` }} />
                  <div className="absolute inset-0 rounded-full" style={{ border: `3px solid ${C.gold}` }} />
                </div>
              );
            })()}
          </div>
          </div>

          {/* ---- On-map controls ---- */}
          {movingItem && (
            <div
              data-map-control
              className="absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full pl-3 pr-1 py-1 text-xs font-medium shadow-md max-w-[90%]"
              style={{ bottom: mapFullscreen ? "calc(max(16px, env(safe-area-inset-bottom)) + 52px)" : 64, backgroundColor: C.gold, color: "#fff" }}
            >
              <span className="truncate">Tap where {movingItem.label} should go</span>
              <button
                onClick={() => setMovingItem(null)}
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold shrink-0"
                style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
              >
                Cancel
              </button>
            </div>
          )}

          {mapSearchOpen && (
            <div
              data-map-control
              className="absolute z-30 rounded-xl border shadow-lg overflow-hidden"
              style={{
                top: mapFullscreen ? "max(12px, env(safe-area-inset-top))" : 12,
                left: 12,
                right: 64,
                maxWidth: 360,
                borderColor: C.line,
                backgroundColor: C.card,
              }}
            >
              <div className="flex items-center gap-2 px-3 h-10">
                <Search size={14} style={{ color: C.muted }} />
                <input
                  autoFocus
                  value={mapSearchQuery}
                  onChange={(e) => setMapSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && mapSearchResults[0]) showGuestOnMap(mapSearchResults[0].guest.id);
                    if (e.key === "Escape") setMapSearchOpen(false);
                  }}
                  placeholder="Find a guest…"
                  aria-label="Find a guest on the map"
                  className="flex-1 min-w-0 bg-transparent outline-none text-sm"
                  style={{ color: C.ink, userSelect: "text", WebkitUserSelect: "text" }}
                />
                <button onClick={() => setMapSearchOpen(false)} aria-label="Close search" style={{ color: C.muted }}>
                  <X size={14} />
                </button>
              </div>
              {mapSearchQuery.trim() && (
                <div className="border-t max-h-64 overflow-y-auto" style={{ borderColor: C.line }}>
                  {mapSearchResults.length === 0 ? (
                    <div className="px-3 py-2.5 text-xs" style={{ color: C.muted }}>
                      No guests match &quot;{mapSearchQuery.trim()}&quot;.
                    </div>
                  ) : (
                    mapSearchResults.map(({ guest, seatId }) => (
                      <button
                        key={guest.id}
                        onClick={() => showGuestOnMap(guest.id)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm border-b last:border-b-0"
                        style={{ borderColor: C.line, color: C.ink }}
                      >
                        <span className="truncate">{guest.name}</span>
                        <span className="shrink-0 text-xs" style={{ color: seatId ? C.gold : C.muted }}>
                          {seatId && seatsById[seatId] ? tableById[seatsById[seatId].tableId]?.label ?? "Seated" : readOnly ? "Not seated" : "Not seated · tap to seat"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          {picked && guestById[picked] && (
            <div
              data-map-control
              className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full pl-3 pr-1 py-1 text-xs font-medium shadow-md max-w-[90%]"
              style={{
                // Sits below the top-row buttons when the "removed tables" button is there too.
                top: deletedTables.length > 0 && !readOnly
                  ? mapFullscreen ? "calc(max(12px, env(safe-area-inset-top)) + 50px)" : 62
                  : mapFullscreen ? "max(12px, env(safe-area-inset-top))" : 12,
                backgroundColor: C.ink,
                color: C.paper,
              }}
            >
              <span className="truncate">Tap a seat for {guestById[picked].name}</span>
              <button
                onClick={() => setPicked(null)}
                aria-label="Cancel moving this guest"
                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
              >
                <X size={12} />
              </button>
            </div>
          )}

          {deletedTables.length > 0 && !readOnly && (
            <div
              data-map-control
              className="absolute"
              style={{ top: mapFullscreen ? "max(12px, env(safe-area-inset-top))" : 12, left: 12, maxWidth: "calc(100% - 80px)" }}
            >
              <button
                onClick={() => setShowRemovedTables((v) => !v)}
                aria-expanded={showRemovedTables}
                className="h-10 flex items-center gap-1.5 rounded-xl border px-3 text-xs font-medium shadow-sm"
                style={{ borderColor: C.line, backgroundColor: C.card, color: C.ink }}
              >
                <Plus size={14} />
                {deletedTables.length} removed table{deletedTables.length > 1 ? "s" : ""}
              </button>
              {showRemovedTables && (
                <div
                  className="mt-2 w-60 max-w-full rounded-xl border shadow-lg overflow-hidden"
                  style={{ borderColor: C.line, backgroundColor: C.card }}
                >
                  <div className="max-h-60 overflow-y-auto">
                    {deletedTables.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm border-b" style={{ borderColor: C.line, color: C.ink }}>
                        <span className="truncate">
                          {t.label}
                          <span className="ml-1.5 text-xs" style={{ color: C.muted }}>
                            {t.capacity} seats
                          </span>
                        </span>
                        <button
                          onClick={() => restoreTable(t.id)}
                          className="shrink-0 text-xs font-semibold px-2 py-1 rounded-md"
                          style={{ color: C.gold }}
                        >
                          Add back
                        </button>
                      </div>
                    ))}
                  </div>
                  {deletedTables.length > 1 && (
                    <button
                      onClick={restoreAllTables}
                      className="w-full px-3 py-2 text-xs font-semibold text-left"
                      style={{ color: C.ink, backgroundColor: C.paper }}
                    >
                      Add all {deletedTables.length} back
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            data-map-control
            onClick={() => setMapFullscreen((v) => !v)}
            aria-label={mapFullscreen ? "Exit full screen" : "Full screen map"}
            title={mapFullscreen ? "Exit full screen (Esc)" : "Full screen"}
            className="absolute w-10 h-10 rounded-xl border flex items-center justify-center shadow-sm"
            style={{
              top: mapFullscreen ? "max(12px, env(safe-area-inset-top))" : 12,
              right: 12,
              borderColor: C.line,
              backgroundColor: C.card,
              color: C.ink,
              cursor: "pointer",
            }}
          >
            {mapFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>

          <button
            data-map-control
            onClick={() => setMapSearchOpen((v) => !v)}
            aria-label="Find a guest on the map"
            title="Find a guest"
            className="absolute w-10 h-10 rounded-xl border flex items-center justify-center shadow-sm"
            style={{
              top: mapFullscreen ? "calc(max(12px, env(safe-area-inset-top)) + 48px)" : 60,
              right: 12,
              borderColor: C.line,
              backgroundColor: mapSearchOpen ? C.ink : C.card,
              color: mapSearchOpen ? C.paper : C.ink,
              cursor: "pointer",
            }}
          >
            <Search size={17} />
          </button>

          <div
            data-map-control
            className="absolute flex flex-col rounded-xl border overflow-hidden shadow-sm"
            style={{
              right: 12,
              bottom: mapFullscreen ? "max(16px, env(safe-area-inset-bottom))" : 12,
              borderColor: C.line,
              backgroundColor: C.card,
              cursor: "pointer",
            }}
          >
            <button
              onClick={() => map.zoomBy(1.4)}
              disabled={map.view.scale >= map.maxScale - 0.001}
              aria-label="Zoom in"
              className="w-10 h-10 flex items-center justify-center disabled:opacity-30"
              style={{ color: C.ink }}
            >
              <Plus size={18} />
            </button>
            <div style={{ height: 1, backgroundColor: C.line }} />
            <button
              onClick={() => map.zoomBy(1 / 1.4)}
              disabled={map.view.scale <= map.minScale + 0.001}
              aria-label="Zoom out"
              className="w-10 h-10 flex items-center justify-center disabled:opacity-30"
              style={{ color: C.ink }}
            >
              <Minus size={18} />
            </button>
            <div style={{ height: 1, backgroundColor: C.line }} />
            <button
              onClick={() => map.fit()}
              aria-label="Show the whole room"
              title="Show the whole room"
              className="w-10 h-10 flex items-center justify-center text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: C.ink }}
            >
              All
            </button>
          </div>

          <div
            className="absolute pointer-events-none text-[10px] font-medium px-2 py-1 rounded-md"
            style={{
              left: 12,
              bottom: mapFullscreen ? "max(16px, env(safe-area-inset-bottom))" : 12,
              backgroundColor: "rgba(255,255,255,0.85)",
              color: C.muted,
            }}
          >
            {Math.round(map.view.scale * 100)}%
            {showGuestNames && !zoomedInForNames && " · zoom in to see names"}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.line, backgroundColor: C.card }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: C.paper }}>
                <th className="text-left px-4 py-2 font-semibold" style={{ color: C.muted }}>
                  Table
                </th>
                <th className="text-left px-4 py-2 font-semibold" style={{ color: C.muted }}>
                  Seat
                </th>
                <th className="text-left px-4 py-2 font-semibold" style={{ color: C.muted }}>
                  Guest
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleTables.map((t) =>
                Array.from({ length: t.capacity }).map((_, i) => {
                  const seatId = `${t.id}#${i}`;
                  const guestId = seatAssignment[seatId] || "";
                  const hasViolation = flatViolations.some((v) => v.status === "violated" && (v.seatA === seatId || v.seatB === seatId));
                  return (
                    <tr key={seatId} className="border-t" style={{ borderColor: C.line }}>
                      <td className="px-4 py-1.5" style={{ color: C.ink }}>
                        {t.label}
                      </td>
                      <td className="px-4 py-1.5" style={{ color: C.muted }}>
                        {i + 1}
                      </td>
                      <td className="px-4 py-1.5">
                        <select
                          value={guestId}
                          disabled={readOnly}
                          onChange={(e) => {
                            if (e.target.value) assignGuestToSeat(e.target.value, seatId);
                            else clearSeat(seatId);
                          }}
                          className="text-sm outline-none bg-transparent"
                          style={{ color: hasViolation ? C.wine : C.ink }}
                        >
                          <option value="">— empty —</option>
                          {guests.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                        {hasViolation && <AlertTriangle size={12} className="inline ml-1" style={{ color: C.wine }} />}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
