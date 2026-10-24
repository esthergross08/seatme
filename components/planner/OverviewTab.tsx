"use client";

// The planner's overview tab. Reads everything it needs from PlannerContext.


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

export default function OverviewTab() {
  const {
    readOnly,
    eventName,
    eventDate,
    location,
    maxCapacity,
    rsvpEnabled,
    setTab,
    guests,
    constraints,
    setShowRsvpPanel,
    tables,
    totalSeats,
    activeGuests,
    seatedCount,
    notedGuests,
    notedGuestCount,
    mealStats,
    violatedCount,
  } = usePlanner();

  return (
    <EventOverview
      eventName={eventName}
      eventDate={eventDate}
      location={location}
      readOnly={readOnly}
      guestsTotal={guests.length}
      activeGuests={activeGuests.length}
      attending={guests.filter((g) => g.rsvpStatus === "attending").length}
      pending={guests.filter((g) => !g.rsvpStatus || g.rsvpStatus === "pending").length}
      declined={guests.length - activeGuests.length}
      seated={seatedCount}
      totalSeats={totalSeats}
      tablesCount={tables.length}
      maxCapacity={maxCapacity === "" ? null : Number(maxCapacity)}
      rulesCount={constraints.length}
      rulesBroken={violatedCount}
      notedGuests={notedGuestCount}
      rsvpEnabled={rsvpEnabled}
      meals={mealStats}
      onGoTo={setTab}
      onOpenRsvpSettings={() => {
        setShowRsvpPanel(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
    />
  );
}
