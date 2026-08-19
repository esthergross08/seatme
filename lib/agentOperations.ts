// Shared types + helpers for the conversational seating assistant. Used by both
// the server-side API route (to build the tool schema) and the client
// components (to render and apply proposed changes).

export type AgentOperationType =
  | "add_guest"
  | "remove_guest"
  | "rename_guest"
  | "set_guest_groups"
  | "set_guest_note"
  | "set_guest_rsvp_status"
  | "set_guest_meal_choice"
  | "add_group"
  | "rename_group"
  | "remove_group"
  | "set_group_seating_mode"
  | "add_table_group"
  | "update_table_group"
  | "remove_table_group"
  | "seat_guest"
  | "unseat_guest"
  | "swap_guests"
  | "add_constraint"
  | "remove_constraint"
  | "regenerate_plan";

export const AGENT_OPERATION_TYPES: AgentOperationType[] = [
  "add_guest",
  "remove_guest",
  "rename_guest",
  "set_guest_groups",
  "set_guest_note",
  "set_guest_rsvp_status",
  "set_guest_meal_choice",
  "add_group",
  "rename_group",
  "remove_group",
  "set_group_seating_mode",
  "add_table_group",
  "update_table_group",
  "remove_table_group",
  "seat_guest",
  "unseat_guest",
  "swap_guests",
  "add_constraint",
  "remove_constraint",
  "regenerate_plan",
];

export interface AgentOperation {
  type: AgentOperationType;
  name?: string;
  newName?: string;
  guestName?: string;
  groupName?: string;
  groupNames?: string[];
  note?: string;
  rsvpStatus?: "attending" | "pending" | "declined";
  mealChoice?: string;
  seatingMode?: "together" | "mixed";
  tableGroupLabel?: string;
  newTableGroupLabel?: string;
  count?: number;
  capacity?: number;
  tableLabel?: string;
  guestNameA?: string;
  guestNameB?: string;
  aType?: "guest" | "group";
  aName?: string;
  bType?: "guest" | "group";
  bName?: string;
  constraintType?: "must" | "cannot";
}

export interface AgentApplyResult {
  index: number;
  ok: boolean;
  message?: string;
}

export function describeOperation(op: AgentOperation): string {
  switch (op.type) {
    case "add_guest":
      return `Add guest "${op.name ?? "?"}"${op.groupNames?.length ? ` to ${op.groupNames.join(", ")}` : ""}`;
    case "remove_guest":
      return `Remove guest "${op.guestName ?? "?"}"`;
    case "rename_guest":
      return `Rename "${op.guestName ?? "?"}" to "${op.newName ?? "?"}"`;
    case "set_guest_groups":
      return `Set "${op.guestName ?? "?"}"'s groups to: ${op.groupNames?.length ? op.groupNames.join(", ") : "(none)"}`;
    case "set_guest_note":
      return op.note?.trim()
        ? `Set note for "${op.guestName ?? "?"}": "${op.note.trim()}"`
        : `Clear note for "${op.guestName ?? "?"}"`;
    case "set_guest_rsvp_status":
      return `Set "${op.guestName ?? "?"}"'s RSVP status to ${op.rsvpStatus ?? "?"}`;
    case "set_guest_meal_choice":
      return op.mealChoice?.trim()
        ? `Set "${op.guestName ?? "?"}"'s meal choice to "${op.mealChoice.trim()}"`
        : `Clear "${op.guestName ?? "?"}"'s meal choice`;
    case "add_group":
      return `Add group "${op.name ?? "?"}"`;
    case "rename_group":
      return `Rename group "${op.groupName ?? "?"}" to "${op.newName ?? "?"}"`;
    case "remove_group":
      return `Remove group "${op.groupName ?? "?"}"`;
    case "set_group_seating_mode":
      return op.seatingMode === "mixed"
        ? `Mix "${op.groupName ?? "?"}" across different tables`
        : `Seat "${op.groupName ?? "?"}" together by default`;
    case "add_table_group":
      return `Add ${op.count ?? "?"} × "${op.tableGroupLabel ?? "?"}" table${(op.count ?? 0) === 1 ? "" : "s"} (seats ${op.capacity ?? "?"} each)`;
    case "update_table_group":
      return `Update "${op.tableGroupLabel ?? "?"}"${op.newTableGroupLabel ? ` → "${op.newTableGroupLabel}"` : ""}${
        op.count !== undefined ? `, ${op.count} table(s)` : ""
      }${op.capacity !== undefined ? `, capacity ${op.capacity}` : ""}`;
    case "remove_table_group":
      return `Remove table type "${op.tableGroupLabel ?? "?"}"`;
    case "seat_guest":
      return `Seat "${op.guestName ?? "?"}" at ${op.tableLabel ?? "?"}`;
    case "unseat_guest":
      return `Unseat "${op.guestName ?? "?"}"`;
    case "swap_guests":
      return `Swap seats of "${op.guestNameA ?? "?"}" and "${op.guestNameB ?? "?"}"`;
    case "add_constraint":
      return `${op.constraintType === "cannot" ? "Keep apart" : "Seat together"}: "${op.aName ?? "?"}" and "${op.bName ?? "?"}"`;
    case "remove_constraint":
      return `Remove constraint between "${op.aName ?? "?"}" and "${op.bName ?? "?"}"`;
    case "regenerate_plan":
      return "Regenerate the seating plan";
    default:
      return "Unknown change";
  }
}
