"use client";

// Small UI pieces shared by the planner's tabs (moved out of SeatingPlanner.tsx).


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





// ---------- small UI atoms ----------
export function IconBtn({
  onClick,
  title,
  children,
  danger,
  disabled,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className="p-1.5 rounded-md transition-colors"
      style={{ color: danger ? C.wine : C.muted, opacity: disabled ? 0.4 : 1, cursor: disabled ? "default" : "pointer" }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = danger ? "#F3E4E4" : C.goldSoft;
      }}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <div className="text-xs tracking-[0.18em] uppercase font-semibold" style={{ color: C.gold, fontFamily: FONT.body }}>
        {eyebrow}
      </div>
      <h2 className="text-2xl mt-1" style={{ fontFamily: FONT.display, color: C.ink }}>
        {title}
      </h2>
    </div>
  );
}

// ---------- main component ----------

// One button in a table/fixture's on-map selection menu. Sized for fingers
// (36px tall, on-screen size independent of zoom since the menu is counter-scaled).
export function MapMenuButton({
  icon,
  label,
  onClick,
  hideLabel = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  hideLabel?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      className="h-9 flex items-center justify-center gap-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ color: "#F7F3EA", minWidth: 36, padding: hideLabel ? 0 : "0 12px" }}
    >
      {icon}
      {!hideLabel && label}
    </button>
  );
}

// "Type the exact size" box under a fixture's tap menu — the non-drag way to set
// width and length, e.g. straight from the venue's spec sheet. Commits on Enter
// or when a field loses focus.
export function FixtureSizeEditor({
  wM,
  hM,
  zoom,
  border,
  onChange,
  onAuto,
  autoLabel,
}: {
  wM: number;
  hM: number;
  zoom: number;
  border: string;
  onChange: (wM: number, hM: number) => void;
  onAuto?: () => void;
  autoLabel: string;
}) {
  const [w, setW] = useState(String(Math.round(wM * 10) / 10));
  const [h, setH] = useState(String(Math.round(hM * 10) / 10));
  const commit = () => {
    const nw = parseFloat(w.replace(",", "."));
    const nh = parseFloat(h.replace(",", "."));
    if (nw > 0 && nh > 0 && (Math.abs(nw - wM) > 0.05 || Math.abs(nh - hM) > 0.05)) onChange(nw, nh);
  };
  const field = (value: string, set: (v: string) => void, label: string) => (
    <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#736D5F" }}>
      {label}
      <span className="flex items-center gap-1">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => set(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label={`${label} in metres`}
          className="w-16 px-2 py-1.5 rounded-md border text-sm font-normal normal-case tracking-normal"
          style={{ borderColor: "#E4DCC9", color: "#221F2B", userSelect: "text", WebkitUserSelect: "text" }}
        />
        <span className="text-xs font-normal normal-case tracking-normal">m</span>
      </span>
    </label>
  );
  return (
    <div
      data-map-control
      className="absolute z-20 rounded-xl border p-3 shadow-lg flex flex-col gap-2"
      style={{
        left: 0,
        top: 0,
        transform: `translateX(-50%) scale(${1 / zoom})`,
        transformOrigin: "50% 0",
        backgroundColor: "#fff",
        borderColor: border,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-end gap-2">
        {field(w, setW, "Width")}
        <span className="pb-2 text-sm" style={{ color: "#736D5F" }}>
          ×
        </span>
        {field(h, setH, "Length")}
      </div>
      {onAuto && (
        <button type="button" onClick={onAuto} className="text-xs font-semibold text-left" style={{ color: border }}>
          {autoLabel}
        </button>
      )}
    </div>
  );
}

// One on/off setting: full label (wraps if it must, never cut off) with a
// switch on the right.
export function SettingRow({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={`px-4 py-3 flex items-center justify-between gap-3 border-b ${disabled ? "opacity-50" : "cursor-pointer"}`}
      style={{ borderColor: "#E4DCC9" }}
    >
      <span className="min-w-0 flex flex-col">
        <span className="text-sm leading-snug" style={{ color: "#221F2B" }}>
          {label}
        </span>
        {hint && (
          <span className="text-xs leading-snug" style={{ color: "#736D5F" }}>
            {hint}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
        className="relative shrink-0 rounded-full transition-colors"
        style={{ width: 40, height: 24, backgroundColor: checked ? "#A8823C" : "#D9D1BF" }}
      >
        <span
          className="absolute top-0.5 rounded-full bg-white shadow transition-all"
          style={{ width: 20, height: 20, left: checked ? 18 : 2 }}
        />
      </button>
    </label>
  );
}

// A number field with − / + buttons, sized for touch (44px tall). Typing still
// works; the buttons save phone users from the numeric keyboard.
export function Stepper({
  value,
  onChange,
  onBlur,
  min = 0,
  max,
  disabled,
  label,
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  onBlur?: () => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  label: string;
}) {
  const n = value === "" ? min : value;
  const clamp = (v: number) => Math.max(min, max === undefined ? v : Math.min(max, v));
  const btn = "w-9 h-11 flex items-center justify-center text-lg leading-none disabled:opacity-30";
  return (
    <div className="flex items-center rounded-lg border overflow-hidden" style={{ borderColor: C.line, backgroundColor: C.card }}>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={disabled || n <= min}
        onClick={() => onChange(clamp(n - 1))}
        className={btn}
        style={{ color: C.gold }}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.value === "" ? "" : clamp(Number(e.target.value)))}
        onBlur={onBlur}
        className="w-10 h-11 text-center text-sm bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        style={{ color: C.ink }}
      />
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={disabled || (max !== undefined && n >= max)}
        onClick={() => onChange(clamp(n + 1))}
        className={btn}
        style={{ color: C.gold }}
      >
        +
      </button>
    </div>
  );
}
