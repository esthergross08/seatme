import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AGENT_OPERATION_TYPES, type AgentOperation } from "@/lib/agentOperations";

export const runtime = "nodejs";

interface TableGroupIn {
  id: string;
  label: string;
  count: number | "";
  capacity: number | "";
}
interface GuestIn {
  id: string;
  name: string;
  groupIds: string[];
  note?: string;
  rsvpStatus?: "attending" | "pending" | "declined";
  mealChoice?: string;
}
interface GroupIn {
  id: string;
  name: string;
  seatingMode?: "together" | "mixed";
}
interface ConstraintIn {
  id: string;
  aType: "guest" | "group";
  aId: string;
  bType: "guest" | "group";
  bId: string;
  type: "must" | "cannot";
}
type SeatAssignmentIn = Record<string, string>;

interface EventState {
  tableGroups: TableGroupIn[];
  guests: GuestIn[];
  groups: GroupIn[];
  constraints: ConstraintIn[];
  seatAssignment: SeatAssignmentIn;
  fillMode: "consolidate" | "spread";
  tableNameOverrides?: Record<string, string>;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

function buildTables(tableGroups: TableGroupIn[], nameOverrides: Record<string, string> = {}) {
  const tables: { id: string; label: string; capacity: number }[] = [];
  (tableGroups || []).forEach((g) => {
    const count = Number(g.count) > 0 ? Number(g.count) : 1;
    const capacity = Number(g.capacity) > 0 ? Number(g.capacity) : 1;
    for (let i = 0; i < count; i++) {
      const id = `${g.id}-${i}`;
      const autoLabel = count > 1 ? `${g.label} ${i + 1}` : g.label;
      const override = nameOverrides[id];
      tables.push({
        id,
        label: override && override.trim().length > 0 ? override : autoLabel,
        capacity,
      });
    }
  });
  return tables;
}

function buildContext(state: EventState): string {
  const tables = buildTables(state.tableGroups, state.tableNameOverrides || {});
  const tableById = Object.fromEntries(tables.map((t) => [t.id, t]));
  const seatCountByTable: Record<string, number> = {};
  const guestTableLabel: Record<string, string> = {};

  Object.entries(state.seatAssignment || {}).forEach(([seatId, guestId]) => {
    const tableId = seatId.split("#")[0];
    const t = tableById[tableId];
    if (t && guestId) {
      guestTableLabel[guestId] = t.label;
      seatCountByTable[tableId] = (seatCountByTable[tableId] || 0) + 1;
    }
  });

  const groupById = Object.fromEntries((state.groups || []).map((g) => [g.id, g.name]));
  const guestById = Object.fromEntries((state.guests || []).map((g) => [g.id, g.name]));

  const guestLines = (state.guests || []).map((g) => {
    const groupNames = (g.groupIds || []).map((gid) => groupById[gid]).filter(Boolean);
    const seat = guestTableLabel[g.id] ? `seated at ${guestTableLabel[g.id]}` : "unseated";
    const extras: string[] = [];
    if (g.rsvpStatus) extras.push(`RSVP: ${g.rsvpStatus}`);
    if (g.mealChoice) extras.push(`meal: ${g.mealChoice}`);
    if (g.note) extras.push(`note: ${g.note}`);
    return `- ${g.name}${groupNames.length ? ` [${groupNames.join(", ")}]` : ""} — ${seat}${extras.length ? ` (${extras.join("; ")})` : ""}`;
  });

  const tableLines = tables.map((t) => `- ${t.label}: ${seatCountByTable[t.id] || 0}/${t.capacity} seats filled`);

  const tableGroupLines = (state.tableGroups || []).map(
    (tg) => `- "${tg.label}": ${tg.count || 0} table(s) × ${tg.capacity || 0} seats each`
  );

  const nameOf = (type: "guest" | "group", id: string) => (type === "group" ? groupById[id] : guestById[id]) || "?";
  const constraintLines = (state.constraints || []).map(
    (c) => `- ${nameOf(c.aType, c.aId)} ${c.type === "must" ? "must sit with" : "cannot sit with"} ${nameOf(c.bType, c.bId)}`
  );

  const groupLines = (state.groups || []).map(
    (g) => `- ${g.name} (${g.seatingMode === "mixed" ? "mixed — deliberately spread across tables" : "together — seated at the same table by default"})`
  );

  return [
    `Guests (${state.guests?.length ?? 0}):`,
    guestLines.join("\n") || "(none)",
    "",
    "Groups (each has an automatic seating mode already applied on generate/regenerate — no manual constraint needed):",
    groupLines.join("\n") || "(none)",
    "",
    "Table types (category, used for add/update/remove_table_group):",
    tableGroupLines.join("\n") || "(none)",
    "",
    "Individual tables (specific instance, used for seat_guest):",
    tableLines.join("\n") || "(none)",
    "",
    "Constraints:",
    constraintLines.join("\n") || "(none)",
    "",
    `Fill mode: ${state.fillMode === "consolidate" ? "consolidate (fill fewest tables first)" : "spread (balance guests evenly across tables)"}`,
  ].join("\n");
}

const SYSTEM_PROMPT = `You are the seating-plan assistant inside SeatMe, a wedding/event seating planner. You help the event owner or an editor make changes to their guest list, groups, table setup, seating constraints, and seat assignments by proposing concrete changes for them to review and approve before anything is applied.

You will be given the current state of the event, then the user's message. Respond conversationally in plain text. If the user's request implies one or more concrete changes to the plan, call the propose_changes tool with a list of operations describing exactly what to change. If you're just answering a question, chatting, or need clarification, do not call the tool — just reply in text.

Critical: only call propose_changes when operations will contain at least one concrete, resolvable item and summary is a real, non-empty sentence. Never call the tool with an empty operations list or a blank/placeholder summary — if the request is too vague to resolve to a specific guest, table, or group (e.g. you can't tell who "them" refers to, or which table), do not call the tool at all; instead reply in plain text and ask exactly what you need to know.

Guidelines:
- Refer to guests, groups, and tables by the exact names shown in the current state.
- A "table type" (e.g. "Family Round") is a category with a count and a capacity, used in add_table_group/update_table_group/remove_table_group. An individual "table" (e.g. "Family Round 1") is one physical table used in seat_guest. If a table type has only one table, its table label equals its table type label.
- For add_guest or set_guest_groups, you can pass groupNames; any group name that doesn't already exist will be created automatically.
- If the user wants the whole plan optimized or re-balanced given current constraints, use regenerate_plan rather than manually placing everyone one by one. If the user wants to unseat everyone and start the floor plan over from a blank slate (without deleting the guest list, groups, tables, or constraints), use clear_seating instead.
- Every group already has an automatic seating mode ("together" by default, or "mixed") that the solver applies on its own during generate/regenerate — see the Groups list in the state above. If the user asks to seat a group together, keep a family/party together, mix a group up, or spread a group across tables, use set_group_seating_mode on that one group, then regenerate_plan if a plan already exists. Do NOT add a must/cannot constraint for every pair of guests in the group — that's what set_group_seating_mode replaces and it's already the default behavior for every group, so if a group is already "together" and the user just asks to seat it together, no operation may be needed at all beyond confirming it.
- Only use add_constraint/set_guest_groups-style pairwise constraints for specific guest-to-guest or guest-to-group requests that aren't just "keep this whole group together" (e.g. "seat Sara next to Tom", "keep the Chen family away from the Diaz family").
- Use set_guest_note for dietary needs, accessibility notes, or any other free-text comment/annotation on a guest ("add a note that X is allergic to nuts", "comment that Y needs a high chair"). Use set_guest_rsvp_status to mark a guest attending/pending/declined — declining automatically frees their seat. Use set_guest_meal_choice for entree/menu selections. Each guest's current note/RSVP/meal (if any) is shown in the state above.
- Never invent guest, group, or table names that weren't mentioned by the user or shown in the current state, except for genuinely new entities the user is explicitly asking you to create.
- Keep your text reply short — one or two sentences. The operations list itself will be shown to the user as a detailed, reviewable checklist, so don't repeat every detail in prose.
- Constraints are between two "sides", each either a specific guest or a whole group; "must" means seated at the same table (adjacent if both individual guests), "cannot" means must not be.`;

const TOOL = {
  name: "propose_changes",
  description:
    "Propose one or more concrete changes to the seating plan for the user to review and approve. Do not call this for clarifying questions or general chat — respond with plain text instead.",
  input_schema: {
    type: "object",
    properties: {
      operations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: AGENT_OPERATION_TYPES },
            name: { type: "string", description: "Name for a new guest (add_guest) or new group (add_group)" },
            newName: { type: "string", description: "New name, for rename_guest or rename_group" },
            guestName: { type: "string", description: "Exact name of an existing guest" },
            groupName: { type: "string", description: "Exact name of an existing group" },
            groupNames: {
              type: "array",
              items: { type: "string" },
              description: "Group names for add_guest or set_guest_groups; unrecognized names are created automatically",
            },
            note: {
              type: "string",
              description: "Free-text note for set_guest_note (dietary need, high chair, wheelchair access, etc.); pass an empty string to clear it",
            },
            rsvpStatus: {
              type: "string",
              enum: ["attending", "pending", "declined"],
              description: "For set_guest_rsvp_status. Marking a guest declined automatically frees their seat.",
            },
            mealChoice: {
              type: "string",
              description: "Free-text meal/entree choice for set_guest_meal_choice; pass an empty string to clear it",
            },
            seatingMode: {
              type: "string",
              enum: ["together", "mixed"],
              description: "For set_group_seating_mode. 'together' (the default) seats the whole group at the same table automatically on generate/regenerate; 'mixed' deliberately spreads them across different tables. Applies to every current and future member of the group — do not also add per-guest must/cannot constraints for this.",
            },
            tableGroupLabel: { type: "string", description: "Table type label, for add/update/remove_table_group" },
            newTableGroupLabel: { type: "string", description: "New label, for update_table_group" },
            count: { type: "number", description: "Number of tables of this type, for add/update_table_group" },
            capacity: { type: "number", description: "Seats per table, for add/update_table_group" },
            tableLabel: { type: "string", description: "Individual table label (e.g. 'Family Round 1'), for seat_guest" },
            guestNameA: { type: "string", description: "First guest, for swap_guests" },
            guestNameB: { type: "string", description: "Second guest, for swap_guests" },
            aType: { type: "string", enum: ["guest", "group"], description: "Type of the first side, for add_constraint" },
            aName: { type: "string", description: "Name of the first side, for add_constraint or remove_constraint" },
            bType: { type: "string", enum: ["guest", "group"], description: "Type of the second side, for add_constraint" },
            bName: { type: "string", description: "Name of the second side, for add_constraint or remove_constraint" },
            constraintType: { type: "string", enum: ["must", "cannot"], description: "For add_constraint" },
          },
          required: ["type"],
        },
      },
      summary: { type: "string", description: "One short sentence summarizing the proposed changes" },
    },
    required: ["operations", "summary"],
  },
};

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "The AI assistant isn't configured yet (missing API key)." }, { status: 500 });
  }

  let body: { eventId?: string; message?: string; history?: ChatTurn[]; state?: EventState };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { eventId, message, history, state } = body;
  if (!eventId || !message || !state) {
    return NextResponse.json({ error: "Missing eventId, message, or state." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, owner_id")
    .eq("id", eventId)
    .single();
  if (eventError || !event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  let role: "owner" | "editor" | "viewer" = "viewer";
  if (event.owner_id === user.id) {
    role = "owner";
  } else {
    const { data: members } = await supabase.from("event_members").select("email, role").eq("event_id", eventId);
    role = (members?.find((m) => m.email === user.email)?.role as "editor" | "viewer" | undefined) ?? "viewer";
  }
  if (role === "viewer") {
    return NextResponse.json({ error: "You have view-only access to this event." }, { status: 403 });
  }

  const context = buildContext(state);
  const messages = [
    ...(history || []).slice(-12).map((h) => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: `Current event state:\n${context}\n\nUser message: ${message}` },
  ];

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: [TOOL],
        messages,
      }),
    });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the AI service. Try again in a moment." }, { status: 502 });
  }

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text().catch(() => "");
    return NextResponse.json({ error: `AI service error (${anthropicRes.status}). ${errText.slice(0, 200)}` }, { status: 502 });
  }

  const data = await anthropicRes.json();
  const content: Array<{ type: string; text?: string; input?: { operations?: AgentOperation[]; summary?: string } }> =
    data.content || [];

  const reply = content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n")
    .trim();

  const toolBlock = content.find((b) => b.type === "tool_use");
  const validTypes = new Set(AGENT_OPERATION_TYPES);
  const operations = (toolBlock?.input?.operations || []).filter((op) => op && validTypes.has(op.type));

  // A tool call only counts as an actual proposal if it produced at least one
  // recognized operation. Otherwise, using its (possibly empty) summary as the
  // reply text is misleading — it can read as "here's what I'd suggest" with
  // nothing underneath to apply. In that case, fall back to the model's plain
  // text if it wrote any, or an honest message asking for specifics.
  const hasProposal = operations.length > 0;
  const finalReply =
    reply ||
    (hasProposal ? toolBlock?.input?.summary : undefined) ||
    (hasProposal
      ? "Here's what I'd suggest."
      : "I couldn't figure out a concrete change from that — could you tell me which guest(s), and where you'd like them seated or what should change?");

  return NextResponse.json({
    reply: finalReply,
    operations,
  });
}
