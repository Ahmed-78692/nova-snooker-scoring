import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Monitor,
  Pencil,
  Plus,
  Radio,
  Search,
  RefreshCw,
  Settings,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react";

import type {
  AppView,
  ScheduledMatch,
  TableInfo,
  Tournament,
  LiveMatchState,
} from "./types";

import {
  calcStandings,
  completeTournamentMatch,
  deleteTournament,
  endMatch,
  loadAllMatchStates,
  loadTables,
  loadTournament,
  loadTournaments,
  saveTables,
  saveTournament,
  setActiveTournament,
} from "./sync";

interface OrgHubProps {
  onNavigate: (
    view: AppView,
    context?: {
      tableId?: string;
      scheduledMatchId?: string;
    }
  ) => void;
}

interface Room {
  id: string;
  name: string;
  code: string;
  venue?: string;
}

interface RoomTournamentSettings {
  title?: string;
  gameType?: string;
  bestOf?: number;
  shotSecs?: number;
  matchMode?: string;
}

const ROOM_KEY = "nova_match_rooms";
const ACTIVE_ROOM_KEY = "nova_active_room";
const ROOM_SETTINGS_KEY = "nova_room_tournament_settings";

/* ================================================================
   ROOM HELPERS
   ================================================================ */

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function readRooms(): Room[] {
  try {
    const raw = localStorage.getItem(ROOM_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getCurrentRoom(): Room | null {
  const rooms = readRooms();
  if (!rooms.length) return null;

  const activeId = localStorage.getItem(ACTIVE_ROOM_KEY);

  return (
    rooms.find((r) => r.id === activeId) ??
    rooms[0] ??
    null
  );
}

/*
 * Settings are also strictly room-scoped.
 * Older versions used one global object, which caused
 * tournament information to leak between rooms.
 */
function roomSettingsKey(roomId: string): string {
  return `${ROOM_SETTINGS_KEY}_${roomId}`;
}

function loadRoomSettings(roomId?: string): RoomTournamentSettings {
  if (!roomId) return {};

  try {
    const raw = localStorage.getItem(roomSettingsKey(roomId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveRoomSettings(
  roomId: string,
  settings: RoomTournamentSettings
): void {
  if (!roomId) return;

  try {
    localStorage.setItem(
      roomSettingsKey(roomId),
      JSON.stringify(settings)
    );
  } catch {}
}

/*
 * One-time repair for the specific contamination caused by
 * the earlier room migration bug:
 *
 * If a later room contains exactly the same tournament IDs as
 * the first room, those copies were created by the faulty
 * fallback migration and can safely be removed.
 *
 * We do NOT delete anything from the first room.
 */
function repairContaminatedRooms(): void {
  const rooms = readRooms();
  if (rooms.length < 2) return;

  const firstRoom = rooms[0];
  const firstTournaments = loadTournaments(firstRoom.id);
  const firstIds = new Set(firstTournaments.map((t) => t.id));

  if (!firstIds.size) return;

  rooms.slice(1).forEach((room) => {
    const current = loadTournaments(room.id);

    const copiedOnly =
      current.length > 0 &&
      current.every((t) => firstIds.has(t.id));

    if (copiedOnly) {
      current.forEach((t) => {
        deleteTournament(t.id, room.id);
      });
    }
  });
}

/* ================================================================
   DISPLAY HELPERS
   ================================================================ */

function playerName(
  tournament: Tournament | null,
  playerId: string
): string {
  return (
    tournament?.players.find((p) => p.id === playerId)?.name ??
    "Unknown"
  );
}

function matchLabel(
  tournament: Tournament,
  match: ScheduledMatch
): string {
  return `${playerName(tournament, match.player1Id)} vs ${playerName(
    tournament,
    match.player2Id
  )}`;
}

function winnerName(
  tournament: Tournament,
  match: ScheduledMatch
): string {
  if (!match.result) return "";

  if (match.result.winner === "player1") {
    return playerName(tournament, match.player1Id);
  }

  if (match.result.winner === "player2") {
    return playerName(tournament, match.player2Id);
  }

  return "Draw";
}

/* ================================================================
   COMPONENT
   ================================================================ */

export default function OrgHub({
  onNavigate,
}: OrgHubProps) {
  const [room, setRoom] = useState<Room | null>(() => getCurrentRoom());

  const [tables, setTables] = useState<TableInfo[]>([]);

  const [tournaments, setTournaments] = useState<Tournament[]>([]);

  const [tournament, setTournament] = useState<Tournament | null>(null);

  const [liveStates, setLiveStates] = useState<LiveMatchState[]>([]);

  const [roomSettings, setRoomSettings] =
    useState<RoomTournamentSettings>({});

  const [showAddTable, setShowAddTable] = useState(false);
  const [newTableName, setNewTableName] = useState("");

  const [editingTableId, setEditingTableId] =
    useState<string | null>(null);
  const [editingTableName, setEditingTableName] = useState("");

  const [deleteTableId, setDeleteTableId] =
    useState<string | null>(null);

  const [showTournamentSettings, setShowTournamentSettings] =
    useState(false);

  const [copiedRoomCode, setCopiedRoomCode] = useState(false);
  const [copiedAudienceTableId, setCopiedAudienceTableId] =
    useState<string | null>(null);

  const [expandedStandings, setExpandedStandings] = useState(true);
  const [expandedResults, setExpandedResults] = useState(true);

  const [tableBestOf, setTableBestOf] =
    useState<Record<string, number>>({});

  const [photoSearch, setPhotoSearch] =
    useState("");

  const [photoUploadingId, setPhotoUploadingId] =
    useState<string | null>(null);

  const photoInputRefs =
    useRef<Record<string, HTMLInputElement | null>>({});

  /*
   * Knockout tables are assigned directly to Player 1 and Player 2.
   * The selection is kept local until both players are chosen, then
   * a table match record is created and can be launched immediately.
   */
  const [tablePlayerSelections, setTablePlayerSelections] =
    useState<Record<string, [string, string]>>({});

  const [tablePlayerSearch, setTablePlayerSearch] =
    useState<Record<string, [string, string]>>({});

  const [openPlayerPicker, setOpenPlayerPicker] =
    useState<{
      tableId: string;
      position: 0 | 1;
    } | null>(null);

  /*
   * The room ID used for every read/write is captured once per
   * refresh. We never use stale React state while loading data.
   */
  function refreshForRoom(): void {
    const currentRoom = getCurrentRoom();
    const roomId = currentRoom?.id;

    setRoom(currentRoom);

    if (!roomId) {
      setTables([]);
      setTournaments([]);
      setTournament(null);
      setRoomSettings({});
      setLiveStates(loadAllMatchStates());
      return;
    }

    const roomTables = loadTables(roomId);
    const roomTournaments = loadTournaments(roomId);

    setTables(roomTables);
    setTournaments(roomTournaments);

    /*
     * Load ONLY the active tournament belonging to this room.
     * Never call loadTournament() without roomId here.
     */
    const selected = loadTournament(roomId);

    setTournament(selected);
    setRoomSettings(loadRoomSettings(roomId));
    setLiveStates(loadAllMatchStates());
  }

  useEffect(() => {
    /*
     * Repair data created by the earlier faulty migration before
     * the first render of room-specific content.
     */
    repairContaminatedRooms();
    refreshForRoom();

    const interval = window.setInterval(() => {
      refreshForRoom();
    }, 700);

    const handleStorage = () => {
      refreshForRoom();
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const activeTournament = tournament;

  const isKnockoutTournament =
    activeTournament?.format?.tournamentFormat === "knockout" ||
    (
      activeTournament?.format?.gameType === "snooker" ||
      activeTournament?.format?.gameType === "billiards"
    );

  const standings = useMemo(() => {
    if (!activeTournament) return [];

    return calcStandings(
      activeTournament.players.map((p) => p.id),
      activeTournament.schedule
    );
  }, [activeTournament]);

  const completedMatches = useMemo(() => {
    if (!activeTournament) return [];

    return activeTournament.schedule
      .filter(
        (match) =>
          match.status === "complete" && Boolean(match.result)
      )
      .slice()
      .reverse();
  }, [activeTournament]);

  const scheduledMatches = useMemo(() => {
    if (!activeTournament) return [];

    return activeTournament.schedule.filter(
      (match) => match.status === "scheduled"
    );
  }, [activeTournament]);

  /* ================================================================
     TABLE HELPERS
     ================================================================ */

  function liveForTable(tableId: string): LiveMatchState | null {
    return (
      liveStates.find(
        (state) =>
          state.status === "active" &&
          state.config.tableId === tableId
      ) ?? null
    );
  }

  function assignedForTable(
    tableId: string
  ): ScheduledMatch | null {
    if (!activeTournament) return null;

    return (
      activeTournament.schedule.find(
        (match) =>
          match.status === "scheduled" &&
          match.tableId === tableId
      ) ?? null
    );
  }

  function completedForTable(
    tableId: string
  ): ScheduledMatch | null {
    if (!activeTournament) return null;

    return (
      activeTournament.schedule
        .filter(
          (match) =>
            match.status === "complete" &&
            Boolean(match.result) &&
            match.tableId === tableId
        )
        .slice()
        .reverse()[0] ?? null
    );
  }

  function playerDisplayName(
    playerId: string
  ): string {
    return (
      activeTournament?.players.find(
        (player) => player.id === playerId
      )?.name ?? ""
    );
  }

  function directSelectionForTable(
    tableId: string
  ): [string, string] {
    /*
     * Local selection always wins once the operator starts
     * editing a table. This is important because an assigned
     * match must be editable before it is saved.
     */
    if (
      tablePlayerSelections[
        tableId
      ]
    ) {
      return tablePlayerSelections[
        tableId
      ];
    }

    const assigned =
      assignedForTable(tableId);

    if (assigned) {
      return [
        assigned.player1Id,
        assigned.player2Id,
      ];
    }

    return ["", ""];
  }

  useEffect(() => {
    if (!activeTournament) return;

    const nextSelections: Record<
      string,
      [string, string]
    > = {};

    tables.forEach((table) => {
      const assigned =
        assignedForTable(table.id);

      if (assigned) {
        nextSelections[table.id] = [
          assigned.player1Id,
          assigned.player2Id,
        ];
      }
    });

    setTablePlayerSelections(
      (current) => {
        const next = {
          ...nextSelections,
          ...current,
        };

        return next;
      }
    );
  }, [
    activeTournament?.id,
    activeTournament?.schedule,
    tables,
  ]);

  function updateDirectPlayerSelection(
    tableId: string,
    position: 0 | 1,
    value: string
  ): void {
    const current =
      directSelectionForTable(tableId);

    const next: [string, string] =
      position === 0
        ? [value, current[1]]
        : [current[0], value];

    setTablePlayerSelections(
      (currentSelections) => ({
        ...currentSelections,
        [tableId]: next,
      })
    );

  }

  function directPlayerSelectors(
    tableId: string
  ) {
    if (!activeTournament) {
      return null;
    }

    const [
      selectedPlayer1,
      selectedPlayer2,
    ] = directSelectionForTable(tableId);

    const searches =
      tablePlayerSearch[tableId] ?? ["", ""];

    const openPosition:
      0 | 1 | null =
      openPlayerPicker?.tableId ===
        tableId
        ? openPlayerPicker.position
        : null;

    const playerOptions =
      activeTournament.players;

    function filteredOptions(
      position: 0 | 1
    ) {
      const query =
        searches[position]
          .trim()
          .toLowerCase();

      if (!query) {
        return [];
      }

      const otherPlayer =
        position === 0
          ? selectedPlayer2
          : selectedPlayer1;

      return playerOptions
        .filter(
          (player) =>
            player.id !== otherPlayer
        )
        .filter((player) =>
          player.name
            .toLowerCase()
            .includes(query) ||
          (player.club ?? "")
            .toLowerCase()
            .includes(query) ||
          (player.country ?? "")
            .toLowerCase()
            .includes(query)
        )
        .slice(0, 30);
    }

    function setOpenPosition(
      position: 0 | 1 | null
    ) {
      setOpenPlayerPicker(
        position === null
          ? null
          : {
              tableId,
              position,
            }
      );
    }

    function updateSearch(
      position: 0 | 1,
      value: string
    ) {
      setTablePlayerSearch(
        (current) => {
          const existing =
            current[tableId] ?? ["", ""];

          const next: [string, string] =
            position === 0
              ? [value, existing[1]]
              : [existing[0], value];

          return {
            ...current,
            [tableId]: next,
          };
        }
      );

      setOpenPosition(
        position
      );
    }

    function playerSelect(
      position: 0 | 1,
      value: string
    ) {
      /*
       * If the table already has a match, update the
       * selection in place rather than creating a second
       * scheduled match.
       */
      const current =
        directSelectionForTable(
          tableId
        );

      const next: [string, string] =
        position === 0
          ? [value, current[1]]
          : [current[0], value];

      setTablePlayerSelections(
        (currentSelections) => ({
          ...currentSelections,
          [tableId]: next,
        })
      );

      setTablePlayerSearch(
        (current) => ({
          ...current,
          [tableId]: ["", ""],
        })
      );

      setOpenPlayerPicker(null);
    }

    function saveChangedPlayers() {
      const [
        player1Id,
        player2Id,
      ] = directSelectionForTable(
        tableId
      );

      if (
        !player1Id ||
        !player2Id
      ) {
        return;
      }

      /*
       * This deliberately updates the existing table match
       * when one is already assigned. It does NOT create a
       * new scheduled match.
       */
      const assigned =
        assignedForTable(tableId);

      if (
        assigned &&
        activeTournament
      ) {
        const updatedSchedule =
          activeTournament.schedule.map(
            (match) =>
              match.id === assigned.id
                ? {
                    ...match,
                    player1Id,
                    player2Id,
                    bestOfOverride:
                      bestOfForTable(tableId),
                  }
                : match
          );

        const updatedTournament:
          Tournament = {
            ...activeTournament,
            schedule:
              updatedSchedule,
          };

        saveTournament(
          updatedTournament,
          room?.id
        );

        setTournament(
          updatedTournament
        );

        setTournaments(
          loadTournaments(
            room?.id
          )
        );
      } else {
        assignPlayersToTable(
          tableId,
          player1Id,
          player2Id
        );
      }

      setOpenPosition(null);
    }

    function picker(
      position: 0 | 1,
      selected: string,
      label: string
    ) {
      const isOpen =
        openPosition === position;

      const selectedPlayer =
        playerOptions.find(
          (player) =>
            player.id === selected
        );

      const options =
        filteredOptions(position);

      return (
        <div className="relative z-[60]">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-white/30">
            {label}
          </div>

          <button
            type="button"
            onClick={() =>
              setOpenPosition(
                isOpen
                  ? null
                  : position
              )
            }
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-left transition hover:border-cyan-400/25"
          >
            <span
              className={
                selectedPlayer
                  ? "truncate text-xs font-semibold text-white"
                  : "truncate text-xs text-white/35"
              }
            >
              {selectedPlayer?.name ??
                `Select ${label}`}
            </span>

            <ChevronDown
              size={14}
              className={`flex-shrink-0 text-white/35 transition-transform ${
                isOpen
                  ? "rotate-180"
                  : ""
              }`}
            />
          </button>

          {isOpen && (
            <div className="absolute left-0 right-0 top-full z-[100] mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#101722] shadow-2xl">
              <div className="relative border-b border-white/10">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25"
                />

                <input
                  autoFocus
                  value={
                    searches[position]
                  }
                  onChange={(event) =>
                    updateSearch(
                      position,
                      event.target.value
                    )
                  }
                  placeholder="Type to search players..."
                  className="h-10 w-full bg-transparent pl-9 pr-3 text-xs text-white outline-none placeholder:text-white/25"
                />
              </div>

              {!searches[position].trim() ? (
                <div className="px-3 py-4 text-center text-[10px] leading-relaxed text-white/30">
                  Type a name, club or country
                  <br />
                  to search the player pool.
                </div>
              ) : options.length === 0 ? (
                <div className="px-3 py-4 text-center text-[10px] text-white/30">
                  No players found
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto">
                  {options.map(
                    (player) => (
                      <button
                        type="button"
                        key={player.id}
                        onClick={() =>
                          playerSelect(
                            position,
                            player.id
                          )
                        }
                        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs text-white/70 transition hover:bg-cyan-400/10 hover:text-white"
                      >
                        <span className="min-w-0 truncate font-semibold">
                          {player.name}
                        </span>

                        {(player.club ||
                          player.country) && (
                          <span className="max-w-[45%] truncate text-[9px] text-white/25">
                            {player.club ||
                              player.country}
                          </span>
                        )}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="mt-3 space-y-3">
        <div>
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-white/30">
            Match Format
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {[3, 5, 7, 9, 11].map(
              (value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setBestOfForTable(
                      tableId,
                      value
                    )
                  }
                  className={`rounded-lg border px-2 py-2 text-[10px] font-bold transition ${
                    bestOfForTable(tableId) ===
                    value
                      ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-300"
                      : "border-white/10 bg-white/[0.03] text-white/40 hover:border-white/20 hover:text-white/70"
                  }`}
                >
                  BO{value}
                </button>
              )
            )}
          </div>

          <div className="mt-1 text-[9px] text-white/25">
            This setting applies only to this knockout match.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {picker(
            0,
            selectedPlayer1,
            "Player 1"
          )}

          {picker(
            1,
            selectedPlayer2,
            "Player 2"
          )}
        </div>

        {selectedPlayer1 &&
          selectedPlayer2 && (
            <>
              <div className="rounded-lg border border-cyan-400/15 bg-cyan-400/[0.04] px-3 py-2 text-center text-[10px] font-semibold text-cyan-300">
                {playerDisplayName(
                  selectedPlayer1
                )}
                <span className="mx-2 text-white/20">
                  vs
                </span>
                {playerDisplayName(
                  selectedPlayer2
                )}
              </div>

              {assignedForTable(
                tableId
              ) && (
                <button
                  type="button"
                  onClick={
                    saveChangedPlayers
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300 transition hover:bg-cyan-400/15"
                >
                  <Check size={13} />
                  Save Player Change
                </button>
              )}
            </>
          )}
      </div>
    );
  }


  /* ================================================================
     TABLE ACTIONS
     ================================================================ */

  function addTable(): void {
    if (!room?.id) return;

    const name = newTableName.trim();
    if (!name) return;

    const nextNumber =
      tables.reduce(
        (max, table) => Math.max(max, table.number ?? 0),
        0
      ) + 1;

    const newTable: TableInfo = {
      id: `table-${uid()}`,
      name,
      number: nextNumber,
    };

    const updated = [...tables, newTable];

    saveTables(updated, room.id);

    if (activeTournament) {
      const updatedTournament: Tournament = {
        ...activeTournament,
        tables: updated,
      };

      saveTournament(updatedTournament, room.id);
      setTournament(updatedTournament);
    }

    setTables(updated);
    setNewTableName("");
    setShowAddTable(false);
  }

  function saveTableRename(tableId: string): void {
    if (!room?.id) return;

    const name = editingTableName.trim();
    if (!name) {
      setEditingTableId(null);
      setEditingTableName("");
      return;
    }

    const updated = tables.map((table) =>
      table.id === tableId ? { ...table, name } : table
    );

    saveTables(updated, room.id);

    if (activeTournament) {
      const updatedTournament: Tournament = {
        ...activeTournament,
        tables: updated,
      };

      saveTournament(updatedTournament, room.id);
      setTournament(updatedTournament);
    }

    setTables(updated);
    setEditingTableId(null);
    setEditingTableName("");
  }

  function confirmDeleteTable(): void {
    if (!room?.id || !deleteTableId) return;

    if (liveForTable(deleteTableId)) {
      setDeleteTableId(null);
      return;
    }

    const updated = tables.filter(
      (table) => table.id !== deleteTableId
    );

    saveTables(updated, room.id);

    if (activeTournament) {
      const updatedTournament: Tournament = {
        ...activeTournament,
        tables: updated,
      };

      saveTournament(updatedTournament, room.id);
      setTournament(updatedTournament);
    }

    setTables(updated);
    setDeleteTableId(null);
  }

  /* ================================================================
     MATCH ACTIONS
     ================================================================ */

  function launchTable(table: TableInfo): void {
    const live = liveForTable(table.id);

    if (live) {
      onNavigate("remote", {
        tableId: table.id,
        scheduledMatchId: live.config.scheduledMatchId,
      });
      return;
    }

    const assigned = assignedForTable(table.id);

    if (assigned) {
      onNavigate("remote", {
        tableId: table.id,
        scheduledMatchId: assigned.id,
      });
      return;
    }

    onNavigate("matchSetup", {
      tableId: table.id,
    });
  }

  function endLiveMatch(tableId: string): void {
    const live = liveForTable(tableId);
    if (!live) return;

    const p1 =
      live.config.matchMode === "doubles"
        ? live.config.teams?.[0]?.name ?? "Team 1"
        : live.config.players?.[0]?.name ?? "Player 1";

    const p2 =
      live.config.matchMode === "doubles"
        ? live.config.teams?.[1]?.name ?? "Team 2"
        : live.config.players?.[1]?.name ?? "Player 2";

    const s1 = live.matchPts?.[0] ?? 0;
    const s2 = live.matchPts?.[1] ?? 0;

    if (
      !window.confirm(
        `End this match now?\n\n${p1} ${s1} - ${s2} ${p2}\n\nThis will stop the live scoring session. The tournament result will not be recorded automatically.`
      )
    ) {
      return;
    }

    try {
      /*
       * The live state is removed by endMatch(), so the completed
       * tournament result must be saved FIRST.
       *
       * This is what allows the table to immediately change from
       * LIVE to MATCH ENDED with the final result, while keeping
       * the table available for the next scheduled match.
       */
      if (
        room?.id &&
        activeTournament &&
        live.config.scheduledMatchId
      ) {
        const winner =
          s1 > s2
            ? "player1"
            : s2 > s1
            ? "player2"
            : "draw";

        const updatedTournament =
          completeTournamentMatch(
            activeTournament,
            live.config.scheduledMatchId,
            winner,
            [s1, s2],
            room.id
          );

        setTournament(updatedTournament);
        setTournaments(loadTournaments(room.id));
      }

      /*
       * Only remove the live state AFTER the tournament result
       * has been persisted.
       */
      endMatch(tableId);
      setLiveStates(loadAllMatchStates());
    } catch (error) {
      console.error("Failed to end live match:", error);
    }
  }


  function defaultBestOf(): number {
    return (
      activeTournament?.format?.bestOf ??
      5
    );
  }

  function bestOfForTable(
    tableId: string
  ): number {
    if (
      tableBestOf[tableId]
    ) {
      return tableBestOf[tableId];
    }

    const assigned =
      assignedForTable(tableId);

    return (
      assigned?.bestOfOverride ??
      defaultBestOf()
    );
  }

  function setBestOfForTable(
    tableId: string,
    value: number
  ): void {
    setTableBestOf(
      (current) => ({
        ...current,
        [tableId]: value,
      })
    );
  }

  function compressPlayerPhoto(
    file: File
  ): Promise<string> {
    return new Promise(
      (resolve, reject) => {
        const reader =
          new FileReader();

        reader.onerror = () =>
          reject(
            new Error(
              "Unable to read the image."
            )
          );

        reader.onload = () => {
          const image =
            new Image();

          image.onerror = () =>
            reject(
              new Error(
                "The selected file is not a valid image."
              )
            );

          image.onload = () => {
            const maxSize = 600;

            const scale =
              Math.min(
                1,
                maxSize /
                  Math.max(
                    image.naturalWidth,
                    image.naturalHeight
                  )
              );

            const canvas =
              document.createElement(
                "canvas"
              );

            canvas.width = Math.max(
              1,
              Math.round(
                image.naturalWidth *
                  scale
              )
            );

            canvas.height = Math.max(
              1,
              Math.round(
                image.naturalHeight *
                  scale
              )
            );

            const context =
              canvas.getContext(
                "2d"
              );

            if (!context) {
              reject(
                new Error(
                  "Unable to process the image."
                )
              );
              return;
            }

            context.drawImage(
              image,
              0,
              0,
              canvas.width,
              canvas.height
            );

            resolve(
              canvas.toDataURL(
                "image/jpeg",
                0.78
              )
            );
          };

          image.src =
            String(
              reader.result
            );
        };

        reader.readAsDataURL(
          file
        );
      }
    );
  }

  async function uploadPlayerPhoto(
    playerId: string,
    file: File
  ): Promise<void> {
    if (
      !room?.id ||
      !activeTournament
    ) {
      return;
    }

    setPhotoUploadingId(
      playerId
    );

    try {
      const photo =
        await compressPlayerPhoto(
          file
        );

      const updatedTournament:
        Tournament = {
          ...activeTournament,
          players:
            activeTournament.players.map(
              (player) =>
                player.id === playerId
                  ? {
                      ...player,
                      photo,
                    }
                  : player
            ),
        };

      saveTournament(
        updatedTournament,
        room.id
      );

      setTournament(
        updatedTournament
      );

      setTournaments(
        loadTournaments(
          room.id
        )
      );
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Unable to upload the player photo."
      );
    } finally {
      setPhotoUploadingId(
        null
      );

      const input =
        photoInputRefs.current[
          playerId
        ];

      if (input) {
        input.value = "";
      }
    }
  }

  function removePlayerPhoto(
    playerId: string
  ): void {
    if (
      !room?.id ||
      !activeTournament
    ) {
      return;
    }

    const player =
      activeTournament.players.find(
        (item) =>
          item.id === playerId
      );

    if (!player?.photo) {
      return;
    }

    if (
      !window.confirm(
        `Remove ${player.name}'s photo?`
      )
    ) {
      return;
    }

    const updatedTournament:
      Tournament = {
        ...activeTournament,
        players:
          activeTournament.players.map(
            (item) =>
              item.id === playerId
                ? {
                    ...item,
                    photo: null,
                  }
                : item
          ),
      };

    saveTournament(
      updatedTournament,
      room.id
    );

    setTournament(
      updatedTournament
    );

    setTournaments(
      loadTournaments(
        room.id
      )
    );
  }

  function assignPlayersToTable(
    tableId: string,
    player1Id: string,
    player2Id: string,
    bestOf: number = bestOfForTable(tableId)
  ): string | null {
    if (!room?.id || !activeTournament) return null;

    if (!player1Id || !player2Id) return null;

    if (player1Id === player2Id) {
      window.alert("Player 1 and Player 2 must be different.");
      return null;
    }

    /*
     * Do not allow a player who is already involved in another
     * active table match to be assigned again.
     */
    const playerAlreadyPlaying = activeTournament.schedule.some(
      (match) =>
        match.status === "scheduled" &&
        match.tableId !== tableId &&
        (match.player1Id === player1Id ||
          match.player2Id === player1Id ||
          match.player1Id === player2Id ||
          match.player2Id === player2Id)
    );

    const livePlayerAlreadyPlaying = liveStates.some((state) => {
      if (state.status !== "active") return false;
      if (state.config.tableId === tableId) return false;

      return (
        state.config.players?.some(
          (player) =>
            player.id === player1Id ||
            player.id === player2Id
        ) ?? false
      );
    });

    if (playerAlreadyPlaying || livePlayerAlreadyPlaying) {
      window.alert(
        "One of these players is already assigned to another live or active table."
      );
      return null;
    }

    /*
     * A knockout table does not require the operator to choose
     * a pre-generated scheduled match. The table itself becomes
     * the match assignment.
     */
    const newMatch: ScheduledMatch = {
      id: `match-${tableId}-${uid()}`,
      round: 1,
      tableId,
      player1Id,
      player2Id,
      status: "scheduled",
      bestOfOverride: bestOf,
    };

    /*
     * Remove any previous scheduled match on this table and
     * release a completed match from the physical table while
     * preserving its result in tournament history.
     */
    const updatedSchedule = activeTournament.schedule
      .filter(
        (match) =>
          !(
            match.tableId === tableId &&
            match.status === "scheduled"
          )
      )
      .map((match) =>
        match.tableId === tableId &&
        match.status === "complete"
          ? { ...match, tableId: null }
          : match
      );

    const updatedTournament: Tournament = {
      ...activeTournament,
      schedule: [
        ...updatedSchedule,
        newMatch,
      ],
    };

    saveTournament(
      updatedTournament,
      room.id
    );

    setTournament(
      updatedTournament
    );

    setTournaments(
      loadTournaments(room.id)
    );

    setTablePlayerSelections(
      (current) => ({
        ...current,
        [tableId]: [
          player1Id,
          player2Id,
        ],
      })
    );

    return newMatch.id;
  }

  function assignMatch(tableId: string, matchId: string): void {
    if (!room?.id || !activeTournament) return;

    const selected = activeTournament.schedule.find(
      (match) => match.id === matchId
    );

    if (!selected) return;

    const updatedSchedule = activeTournament.schedule.map(
      (match) => {
        if (match.id === matchId) {
          return { ...match, tableId };
        }

        if (
          match.tableId === tableId &&
          match.status === "scheduled"
        ) {
          return { ...match, tableId: null };
        }

        /*
         * A completed match keeps its result in the tournament
         * history, but once a new match is assigned to this
         * physical table it must no longer occupy the table card.
         * Its result remains in Recent Results/standings.
         */
        if (
          match.tableId === tableId &&
          match.status === "complete"
        ) {
          return { ...match, tableId: null };
        }

        return match;
      }
    );

    const updatedTournament: Tournament = {
      ...activeTournament,
      schedule: updatedSchedule,
    };

    saveTournament(updatedTournament, room.id);
    setTournament(updatedTournament);
    setTournaments(loadTournaments(room.id));
  }


  /* ================================================================
     TOURNAMENT ACTIONS
     ================================================================ */

  function selectTournament(tournamentId: string): void {
    if (!room?.id) return;

    /*
     * Explicitly set the active tournament for THIS room and
     * immediately read it back using the same room ID.
     */
    setActiveTournament(tournamentId, room.id);

    const selected = loadTournament(room.id, tournamentId);

    setTournament(selected);
    setRoomSettings(loadRoomSettings(room.id));
    setTournaments(loadTournaments(room.id));
  }

  function startNewTournament(): void {
    try {
      localStorage.setItem("nova_plsetup_mode", "new");
    } catch {}

    onNavigate("plSetup");
  }

  function editCurrentTournament(): void {
    try {
      localStorage.setItem("nova_plsetup_mode", "edit");
    } catch {}

    onNavigate("plSetup");
  }

  function deleteCurrentTournament(): void {
    if (!room?.id || !activeTournament) return;

    if (
      !window.confirm(
        `Delete "${activeTournament.title}"?\n\nThis removes the tournament from ${room.name}.`
      )
    ) {
      return;
    }

    deleteTournament(activeTournament.id, room.id);

    try {
      localStorage.removeItem(roomSettingsKey(room.id));
    } catch {}

    const nextTournaments = loadTournaments(room.id);

    setTournaments(nextTournaments);

    const nextTournament = loadTournament(room.id);

    setTournament(nextTournament);
    setRoomSettings(loadRoomSettings(room.id));
  }

  /* ================================================================
     SETTINGS
     ================================================================ */

  function updateRoomTournamentSettings(
    patch: RoomTournamentSettings
  ): void {
    if (!room?.id) return;

    const updated = {
      ...roomSettings,
      ...patch,
    };

    saveRoomSettings(room.id, updated);
    setRoomSettings(updated);

    if (
      activeTournament &&
      patch.title !== undefined
    ) {
      const updatedTournament: Tournament = {
        ...activeTournament,
        title: patch.title,
      };

      saveTournament(updatedTournament, room.id);
      setTournament(updatedTournament);
      setTournaments(loadTournaments(room.id));
    }
  }

  /* ================================================================
     OUTPUTS
     ================================================================ */

  function outputUrl(
    view: "audience" | "obs" | "player",
    tableId?: string
  ): string {
    const url = new URL(window.location.href);

    url.search = "";
    url.hash = "";

    url.searchParams.set("view", view);

    if (tableId) {
      url.searchParams.set("table", tableId);
    }

    /*
     * Carry room ID into public outputs when possible.
     * Audience/OBS can use this to avoid showing another
     * room's table state in multi-room deployments.
     */
    if (room?.id) {
      url.searchParams.set("room", room.id);
    }

    return url.toString();
  }

  function openAudience(tableId: string): void {
    window.open(
      outputUrl("audience", tableId),
      "_blank",
      "noopener,noreferrer"
    );
  }

  function openOBS(tableId: string): void {
    window.open(
      outputUrl("obs", tableId),
      "_blank",
      "noopener,noreferrer"
    );
  }

  async function copyAudienceLink(tableId: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(
        outputUrl("audience", tableId)
      );

      setCopiedAudienceTableId(tableId);

      window.setTimeout(() => {
        setCopiedAudienceTableId((current) =>
          current === tableId ? null : current
        );
      }, 1500);
    } catch {}
  }

  async function copyRoomCode(): Promise<void> {
    if (!room?.code) return;

    try {
      await navigator.clipboard.writeText(room.code);
      setCopiedRoomCode(true);

      window.setTimeout(() => {
        setCopiedRoomCode(false);
      }, 1500);
    } catch {}
  }

  /* ================================================================
     RENDER
     ================================================================ */

  return (
    <div className="min-h-screen bg-[#070b12] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#090e16]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => onNavigate("landing")}
              className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white/65 transition hover:bg-white/[0.08] hover:text-white"
              title="Exit Match Rooms"
            >
              <ArrowLeft size={16} />
              <span>Exit Match Rooms</span>
            </button>

            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400">
                Match Room
              </div>
              <h1 className="mt-0.5 truncate text-xl font-bold">
                {room?.name ?? "Match Room"}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {room?.code && (
              <button
                onClick={copyRoomCode}
                className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/70 transition hover:bg-white/[0.08] hover:text-white sm:flex"
              >
                <span className="font-mono font-semibold tracking-wider">
                  {room.code}
                </span>
                {copiedRoomCode ? (
                  <Check size={15} />
                ) : (
                  <Copy size={15} />
                )}
              </button>
            )}

            <button
              onClick={refreshForRoom}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/60 transition hover:bg-white/[0.08] hover:text-white"
              title="Refresh"
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-5 py-6">
        {/* ROOM / TOURNAMENT SELECTOR */}
        <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                <Radio size={13} />
                Remote Scoring Room
              </div>

              <h2 className="mt-1 truncate text-2xl font-black">
                {room?.name ?? "Match Room"}
              </h2>

              {room?.venue && (
                <p className="mt-1 text-sm text-white/35">
                  {room.venue}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={activeTournament?.id ?? ""}
                onChange={(e) => {
                  if (e.target.value) {
                    selectTournament(e.target.value);
                  }
                }}
                className="min-w-[250px] rounded-xl border border-white/10 bg-[#101722] px-4 py-3 text-sm font-semibold text-white outline-none focus:border-cyan-400/40"
              >
                <option value="" disabled>
                  {tournaments.length
                    ? "Select Tournament"
                    : "No Tournament"}
                </option>

                {tournaments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>

              <button
                onClick={startNewTournament}
                className="flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-black transition hover:bg-cyan-400"
              >
                <Plus size={16} />
                Add Tournament
              </button>
            </div>
          </div>

          {tournaments.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {tournaments.map((item) => (
                <button
                  key={item.id}
                  onClick={() => selectTournament(item.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    item.id === activeTournament?.id
                      ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-400"
                      : "border-white/10 bg-white/[0.03] text-white/45 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {item.title}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* TOURNAMENT */}
        {activeTournament ? (
          <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-400">
                  <Trophy size={13} />
                  Active Tournament
                </div>

                <h2 className="mt-1 truncate text-2xl font-black">
                  {activeTournament.title}
                </h2>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-white/65">
                    {activeTournament.players.length} Players
                  </span>

                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-white/65">
                    {activeTournament.schedule.length} Matches
                  </span>

                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-white/65">
                    Best of {activeTournament.format.bestOf}
                  </span>

                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-white/65">
                    {activeTournament.format.gameType === "pl-mix"
                      ? "PL Mix"
                      : activeTournament.format.gameType === "snooker"
                      ? "Snooker"
                      : "Billiards"}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={editCurrentTournament}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.09] hover:text-white"
                >
                  <Pencil size={15} />
                  Edit Tournament
                </button>

                <button
                  onClick={() => setShowTournamentSettings(true)}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white/60 transition hover:bg-white/[0.09] hover:text-white"
                >
                  <Settings size={15} />
                  Settings
                </button>

                <button
                  onClick={deleteCurrentTournament}
                  className="flex items-center gap-2 rounded-xl border border-red-400/15 bg-red-400/[0.04] px-4 py-2.5 text-sm font-semibold text-red-400/75 transition hover:border-red-400/30 hover:bg-red-400/[0.08]"
                >
                  <Trash2 size={15} />
                  Delete
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="mb-6 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
            <Trophy
              className="mx-auto text-white/25"
              size={32}
            />
            <h2 className="mt-3 text-lg font-bold">
              No tournament configured in this room
            </h2>
            <p className="mx-auto mt-1 max-w-lg text-sm text-white/45">
              Create a tournament for this Match Room. It will remain
              completely separate from tournaments in other rooms.
            </p>
            <button
              onClick={startNewTournament}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-bold text-black transition hover:bg-cyan-400"
            >
              <Plus size={17} />
              Create Tournament
            </button>
          </section>
        )}

        {/* PLAYER PHOTOS */}
        {activeTournament && (
          <section className="mb-8 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold">
                  Player Photos
                </h2>
                <p className="mt-1 text-[10px] leading-relaxed text-white/30">
                  Upload once. The photo follows the player to the
                  Remote, Scoreboard, Audience and OBS.
                </p>
              </div>

              <div className="relative w-44 max-w-[45%] flex-shrink-0">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25"
                />
                <input
                  value={photoSearch}
                  onChange={(event) =>
                    setPhotoSearch(
                      event.target.value
                    )
                  }
                  placeholder="Search players..."
                  className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] pl-8 pr-2 text-[10px] text-white outline-none placeholder:text-white/25 focus:border-cyan-400/30"
                />
              </div>
            </div>

            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
              {activeTournament.players
                .filter((player) => {
                  const query =
                    photoSearch.trim().toLowerCase();

                  if (!query) return true;

                  return (
                    player.name
                      .toLowerCase()
                      .includes(query) ||
                    (player.club ?? "")
                      .toLowerCase()
                      .includes(query) ||
                    (player.country ?? "")
                      .toLowerCase()
                      .includes(query)
                  );
                })
                .map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/10 px-3 py-2"
                  >
                    <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
                      {player.photo ? (
                        <img
                          src={player.photo}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white/25">
                          {player.name
                            .slice(0, 1)
                            .toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-white">
                        {player.name}
                      </div>
                      <div className="mt-0.5 truncate text-[9px] text-white/25">
                        {player.club ||
                          player.country ||
                          "No club listed"}
                      </div>
                    </div>

                    <input
                      ref={(element) => {
                        photoInputRefs.current[
                          player.id
                        ] = element;
                      }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file =
                          event.target.files?.[0];

                        if (file) {
                          void uploadPlayerPhoto(
                            player.id,
                            file
                          );
                        }
                      }}
                    />

                    <button
                      type="button"
                      disabled={
                        photoUploadingId ===
                        player.id
                      }
                      onClick={() =>
                        photoInputRefs.current[
                          player.id
                        ]?.click()
                      }
                      className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-[9px] font-bold text-cyan-300 disabled:opacity-40"
                    >
                      {photoUploadingId ===
                      player.id
                        ? "Uploading..."
                        : player.photo
                        ? "Change Photo"
                        : "Upload Photo"}
                    </button>

                    {player.photo && (
                      <button
                        type="button"
                        onClick={() =>
                          removePlayerPhoto(
                            player.id
                          )
                        }
                        className="rounded-lg border border-white/10 px-2.5 py-2 text-[9px] font-bold text-white/35 hover:text-red-300"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}

              {activeTournament.players.filter(
                (player) => {
                  const query =
                    photoSearch.trim().toLowerCase();

                  if (!query) return true;

                  return (
                    player.name
                      .toLowerCase()
                      .includes(query) ||
                    (player.club ?? "")
                      .toLowerCase()
                      .includes(query) ||
                    (player.country ?? "")
                      .toLowerCase()
                      .includes(query)
                  );
                }
              ).length === 0 && (
                <div className="py-6 text-center text-xs text-white/25">
                  No players found.
                </div>
              )}
            </div>
          </section>
        )}

        {/* TABLES */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Tables</h2>
              <p className="mt-1 text-sm text-white/40">
                Tables belong to <strong className="text-white/60">
                  {room?.name ?? "this room"}
                </strong> only.
              </p>
            </div>

            <button
              onClick={() => setShowAddTable(true)}
              className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-cyan-400"
            >
              <Plus size={17} />
              Add Table
            </button>
          </div>

          {tables.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center">
              <Monitor
                className="mx-auto text-white/25"
                size={36}
              />
              <h3 className="mt-4 font-bold">No tables yet</h3>
              <p className="mt-1 text-sm text-white/40">
                Add the physical tables available in this Match Room.
              </p>
              <button
                onClick={() => setShowAddTable(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-bold text-black"
              >
                <Plus size={17} />
                Add First Table
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {tables.map((table) => {
                const live = liveForTable(table.id);
                const assigned = assignedForTable(table.id);
                const completed = completedForTable(table.id);

                return (
                  <div
                    key={table.id}
                    className={`relative overflow-visible rounded-2xl border border-white/10 bg-white/[0.025] ${
                      openPlayerPicker?.tableId === table.id
                        ? "z-50"
                        : "z-0"
                    }`}
                  >
                    <div className="relative flex items-center justify-between rounded-t-2xl border-b border-white/10 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/50">
                          <Monitor size={17} />
                        </div>

                        <div className="min-w-0">
                          {editingTableId === table.id ? (
                            <div className="flex gap-2">
                              <input
                                autoFocus
                                value={editingTableName}
                                onChange={(e) =>
                                  setEditingTableName(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    saveTableRename(table.id);
                                  }
                                  if (e.key === "Escape") {
                                    setEditingTableId(null);
                                    setEditingTableName("");
                                  }
                                }}
                                className="w-40 rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-sm outline-none focus:border-cyan-400/40"
                              />
                              <button
                                onClick={() =>
                                  saveTableRename(table.id)
                                }
                                className="text-cyan-400"
                              >
                                <Check size={15} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="truncate text-sm font-bold">
                                {table.name}
                              </div>
                              <div className="text-[10px] uppercase tracking-wider text-white/30">
                                Table {table.number ?? ""}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {live && (
                          <span className="flex items-center gap-1 rounded-full bg-cyan-400/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-cyan-400">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
                            Live
                          </span>
                        )}

                        <button
                          onClick={() => {
                            setEditingTableId(table.id);
                            setEditingTableName(table.name);
                          }}
                          className="rounded-lg p-2 text-white/30 hover:bg-white/[0.05] hover:text-white"
                          title="Rename table"
                        >
                          <Pencil size={14} />
                        </button>

                        <button
                          onClick={() => setDeleteTableId(table.id)}
                          className="rounded-lg p-2 text-white/30 hover:bg-red-400/10 hover:text-red-400"
                          title="Delete table"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {live ? (
                      <div className="p-4">
                        <div className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                          Match in progress
                        </div>

                        <div className="mt-3 rounded-xl border border-cyan-400/15 bg-black/20 p-4">
                          <div className="text-sm font-semibold">
                            {live.config.matchMode === "doubles"
                              ? live.config.teams?.[0]?.name ?? "Team 1"
                              : live.config.players?.[0]?.name ?? "Player 1"}

                            <span className="mx-2 text-white/20">
                              vs
                            </span>

                            {live.config.matchMode === "doubles"
                              ? live.config.teams?.[1]?.name ?? "Team 2"
                              : live.config.players?.[1]?.name ?? "Player 2"}
                          </div>

                          <div className="mt-3 text-3xl font-black">
                            {live.matchPts?.[0] ?? 0}
                            <span className="mx-2 text-white/20">-</span>
                            {live.matchPts?.[1] ?? 0}
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                          <button
                            onClick={() => launchTable(table)}
                            className="flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-black hover:bg-cyan-400"
                          >
                            <Radio size={16} />
                            Open Remote
                          </button>

                          <button
                            onClick={() => endLiveMatch(table.id)}
                            className="flex items-center justify-center gap-2 rounded-xl border border-red-400/25 bg-red-400/[0.06] px-4 py-3 text-sm font-bold text-red-400 hover:bg-red-400/10"
                          >
                            <X size={16} />
                            End
                          </button>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-4">
                          <button
                            onClick={() => openAudience(table.id)}
                            className="flex items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2.5 text-xs font-bold text-emerald-400"
                          >
                            <Monitor size={14} />
                            Audience
                          </button>

                          <button
                            onClick={() => openOBS(table.id)}
                            className="flex items-center justify-center gap-2 rounded-xl border border-violet-400/20 bg-violet-400/[0.06] px-3 py-2.5 text-xs font-bold text-violet-400"
                          >
                            <ExternalLink size={14} />
                            OBS
                          </button>
                        </div>

                        <button
                          onClick={() => copyAudienceLink(table.id)}
                          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-white/45"
                        >
                          {copiedAudienceTableId === table.id ? (
                            <Check size={12} />
                          ) : (
                            <Copy size={12} />
                          )}
                          {copiedAudienceTableId === table.id
                            ? "Copied"
                            : "Copy Audience Link"}
                        </button>
                      </div>
                    ) : completed && activeTournament ? (
                      <div className="p-4">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-amber-400">
                            <span className="h-2 w-2 rounded-full bg-amber-400" />
                            Match Ended
                          </span>
                          <Trophy size={16} className="text-amber-400" />
                        </div>

                        <div className="mt-4 rounded-xl border border-amber-400/15 bg-black/20 p-4">
                          <div className="text-xs text-white/35">
                            Final Result
                          </div>

                          <div className="mt-2 text-sm font-bold leading-6">
                            {matchLabel(activeTournament, completed)}
                          </div>

                          <div className="mt-4 flex items-center justify-between gap-4">
                            <div className="text-3xl font-black">
                              {completed.result?.score[0] ?? 0}
                              <span className="mx-2 text-white/20">-</span>
                              {completed.result?.score[1] ?? 0}
                            </div>

                            <div className="text-right">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                                Winner
                              </div>
                              <div className="mt-1 text-sm font-black text-amber-400">
                                {winnerName(activeTournament, completed)}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 border-t border-white/10 pt-4">
                          {isKnockoutTournament ? (
                            <>
                              <div className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                                Assign Next Match
                              </div>

                              <p className="mt-1 text-[10px] leading-relaxed text-white/30">
                                Choose the two players directly for this table.
                                No scheduled-match selection is required.
                              </p>

                              {directPlayerSelectors(
                                table.id
                              )}

                              <button
                                type="button"
                                disabled={
                                  !directSelectionForTable(
                                    table.id
                                  )[0] ||
                                  !directSelectionForTable(
                                    table.id
                                  )[1]
                                }
                                onClick={() => {
                                  const [
                                    player1Id,
                                    player2Id,
                                  ] =
                                    directSelectionForTable(
                                      table.id
                                    );

                                  const newMatchId =
                                    assignPlayersToTable(
                                      table.id,
                                      player1Id,
                                      player2Id
                                    );

                                  if (newMatchId) {
                                    onNavigate(
                                      "remote",
                                      {
                                        tableId:
                                          table.id,
                                        scheduledMatchId:
                                          newMatchId,
                                      }
                                    );
                                  }
                                }}
                                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-black transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <Radio size={16} />
                                Assign & Start Next Match
                              </button>
                            </>
                          ) : (
                            <>
                              <div className="text-xs font-semibold uppercase tracking-wider text-white/35">
                                Assign New Match
                              </div>

                              <div className="relative mt-2">
                                <select
                                  defaultValue=""
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      assignMatch(
                                        table.id,
                                        e.target.value
                                      );
                                      e.currentTarget.value = "";
                                    }
                                  }}
                                  className="w-full appearance-none rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] px-4 py-3 pr-10 text-sm font-semibold text-white outline-none transition focus:border-cyan-400/40"
                                >
                                  <option value="" disabled>
                                    Select next scheduled match
                                  </option>

                                  {scheduledMatches.map((match) => (
                                    <option
                                      key={match.id}
                                      value={match.id}
                                      className="bg-[#101722]"
                                    >
                                      R{match.round} —{" "}
                                      {matchLabel(activeTournament, match)}
                                    </option>
                                  ))}
                                </select>

                                <ChevronDown
                                  size={16}
                                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/35"
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-4">
                        <div className="text-xs font-semibold uppercase tracking-wider text-white/35">
                          {assigned
                            ? "Scheduled Match"
                            : "No Match Assigned"}
                        </div>

                        {assigned && activeTournament ? (
                          <>
                            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
                              <div className="text-sm font-bold">
                                {matchLabel(activeTournament, assigned)}
                              </div>
                              <div className="mt-2 text-xs text-white/35">
                                {isKnockoutTournament
                                  ? "Players assigned directly to table"
                                  : `Round ${assigned.round}`}
                              </div>
                            </div>

                            <button
                              onClick={() => launchTable(table)}
                              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-black hover:bg-cyan-400"
                            >
                              <Radio size={16} />
                              Start Match
                            </button>

                            {isKnockoutTournament && (
                              <div className="mt-4 border-t border-white/10 pt-4">
                                <div className="text-xs font-semibold uppercase tracking-wider text-white/35">
                                  Change Players
                                </div>

                                {directPlayerSelectors(
                                  table.id
                                )}
                              </div>
                            )}
                          </>
                        ) : activeTournament ? (
                          <>
                            {isKnockoutTournament ? (
                              <>
                                <div className="mt-3 rounded-xl border border-dashed border-cyan-400/15 bg-cyan-400/[0.025] p-4 text-center">
                                  <div className="text-sm font-semibold text-white/55">
                                    Assign players to this table
                                  </div>
                                  <div className="mt-1 text-[10px] leading-relaxed text-white/30">
                                    Select Player 1 and Player 2 directly.
                                  </div>
                                </div>

                                {directPlayerSelectors(
                                  table.id
                                )}

                                <button
                                  type="button"
                                  disabled={
                                    !directSelectionForTable(
                                      table.id
                                    )[0] ||
                                    !directSelectionForTable(
                                      table.id
                                    )[1]
                                  }
                                  onClick={() => {
                                    const [
                                      player1Id,
                                      player2Id,
                                    ] =
                                      directSelectionForTable(
                                        table.id
                                      );

                                    const newMatchId =
                                      assignPlayersToTable(
                                        table.id,
                                        player1Id,
                                        player2Id
                                      );

                                    if (newMatchId) {
                                      onNavigate(
                                        "remote",
                                        {
                                          tableId:
                                            table.id,
                                          scheduledMatchId:
                                            newMatchId,
                                        }
                                      );
                                    }
                                  }}
                                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-black transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-30"
                                >
                                  <Radio size={16} />
                                  Assign & Start Match
                                </button>
                              </>
                            ) : (
                              <>
                                <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/10 p-4 text-center">
                                  <div className="text-sm text-white/35">
                                    Choose a scheduled match below.
                                  </div>
                                </div>

                                <div className="relative mt-3">
                                  <select
                                    defaultValue=""
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        assignMatch(
                                          table.id,
                                          e.target.value
                                        );
                                        e.currentTarget.value = "";
                                      }
                                    }}
                                    className="w-full appearance-none rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 pr-10 text-sm text-white outline-none focus:border-cyan-400/40"
                                  >
                                    <option value="" disabled>
                                      Assign scheduled match
                                    </option>

                                    {scheduledMatches.map((match) => (
                                      <option
                                        key={match.id}
                                        value={match.id}
                                        className="bg-[#101722]"
                                      >
                                        R{match.round} —{" "}
                                        {matchLabel(activeTournament, match)}
                                      </option>
                                    ))}
                                  </select>

                                  <ChevronDown
                                    size={16}
                                    className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/35"
                                  />
                                </div>

                                {scheduledMatches.length === 0 && (
                                  <div className="mt-3 text-center text-xs text-white/30">
                                    No scheduled matches available.
                                  </div>
                                )}
                              </>
                            )}
                          </>
                        ) : (
                          <button
                            onClick={startNewTournament}
                            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white/70 hover:bg-white/[0.09]"
                          >
                            <Trophy size={16} />
                            Configure Tournament
                          </button>
                        )}

                        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-4">
                          <button
                            onClick={() => openAudience(table.id)}
                            className="flex items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2.5 text-xs font-bold text-emerald-400"
                          >
                            <Monitor size={14} />
                            Audience
                          </button>

                          <button
                            onClick={() => openOBS(table.id)}
                            className="flex items-center justify-center gap-2 rounded-xl border border-violet-400/20 bg-violet-400/[0.06] px-3 py-2.5 text-xs font-bold text-violet-400"
                          >
                            <ExternalLink size={14} />
                            OBS
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* STANDINGS */}
        {activeTournament && (
          <section className="mt-6">
            {isKnockoutTournament ? (
              /*
               * Knockout tournaments do not have league standings.
               * Keep this as a compact tournament-status strip instead
               * of showing a large P/W/D/L table.
               */
              <div className="rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400">
                      <Trophy size={15} />
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">
                        Knockout
                      </div>
                      <div className="truncate text-[9px] text-white/30">
                        {activeTournament.title}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-center">
                      <div className="text-xs font-black text-white">
                        {activeTournament.players.length}
                      </div>
                      <div className="text-[7px] uppercase tracking-wider text-white/25">
                        Players
                      </div>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-center">
                      <div className="text-xs font-black text-white">
                        {activeTournament.schedule.length}
                      </div>
                      <div className="text-[7px] uppercase tracking-wider text-white/25">
                        Matches
                      </div>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-center">
                      <div className="text-xs font-black text-amber-400">
                        {
                          activeTournament.schedule.filter(
                            (match) =>
                              match.status ===
                              "complete"
                          ).length
                        }
                      </div>
                      <div className="text-[7px] uppercase tracking-wider text-white/25">
                        Done
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              standings.length > 0 && (
                <div>
                  <button
                    onClick={() =>
                      setExpandedStandings(
                        (v) => !v
                      )
                    }
                    className="flex w-full items-center justify-between rounded-t-2xl border border-white/10 bg-white/[0.025] px-5 py-4 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400">
                        <BarChart3 size={18} />
                      </div>

                      <div>
                        <h2 className="font-bold">
                          Tournament Standings
                        </h2>
                        <p className="mt-0.5 text-xs text-white/35">
                          {activeTournament.title}
                        </p>
                      </div>
                    </div>

                    <ChevronDown
                      size={18}
                      className={`text-white/35 transition ${
                        expandedStandings
                          ? "rotate-180"
                          : ""
                      }`}
                    />
                  </button>

                  {expandedStandings && (
                    <div className="overflow-x-auto rounded-b-2xl border-x border-b border-white/10 bg-white/[0.015]">
                      <table className="w-full min-w-[620px] text-sm">
                        <thead>
                          <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-white/30">
                            <th className="px-5 py-3 text-left">#</th>
                            <th className="px-5 py-3 text-left">Player</th>
                            <th className="px-5 py-3 text-center">P</th>
                            <th className="px-5 py-3 text-center">W</th>
                            <th className="px-5 py-3 text-center">D</th>
                            <th className="px-5 py-3 text-center">L</th>
                            <th className="px-5 py-3 text-center">Pts</th>
                          </tr>
                        </thead>

                        <tbody>
                          {standings.map(
                            (
                              standing,
                              index
                            ) => {
                              const pl =
                                activeTournament.players.find(
                                  (p) =>
                                    p.id ===
                                    standing.playerId
                                );

                              if (!pl)
                                return null;

                              return (
                                <tr
                                  key={
                                    standing.playerId
                                  }
                                  className="border-b border-white/[0.06] last:border-0"
                                >
                                  <td className="px-5 py-4 font-mono text-white/35">
                                    {index + 1}
                                  </td>

                                  <td className="px-5 py-4 font-semibold">
                                    {pl.name}
                                  </td>

                                  <td className="px-5 py-4 text-center text-white/50">
                                    {standing.played}
                                  </td>

                                  <td className="px-5 py-4 text-center text-white/50">
                                    {standing.won}
                                  </td>

                                  <td className="px-5 py-4 text-center text-white/50">
                                    {standing.drawn}
                                  </td>

                                  <td className="px-5 py-4 text-center text-white/50">
                                    {standing.lost}
                                  </td>

                                  <td className="px-5 py-4 text-center font-black text-amber-400">
                                    {standing.points}
                                  </td>
                                </tr>
                              );
                            }
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            )}
          </section>
        )}

        {/* RESULTS */}
        {activeTournament && completedMatches.length > 0 && (
          <section className="mt-6">
            <button
              onClick={() => setExpandedResults((v) => !v)}
              className="flex w-full items-center justify-between rounded-t-2xl border border-white/10 bg-white/[0.025] px-5 py-4 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-white/50">
                  <Trophy size={17} />
                </div>

                <div>
                  <h2 className="font-bold">Recent Results</h2>
                  <p className="mt-0.5 text-xs text-white/35">
                    Completed tournament matches
                  </p>
                </div>
              </div>

              <ChevronDown
                size={18}
                className={`text-white/35 transition ${
                  expandedResults ? "rotate-180" : ""
                }`}
              />
            </button>

            {expandedResults && (
              <div className="rounded-b-2xl border-x border-b border-white/10 bg-white/[0.015]">
                {completedMatches.slice(0, 10).map((match) => (
                  <div
                    key={match.id}
                    className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="text-sm font-semibold">
                        {matchLabel(activeTournament, match)}
                      </div>
                      <div className="mt-1 text-xs text-white/30">
                        Round {match.round}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-lg font-black">
                        {match.result?.score[0] ?? 0}
                        <span className="mx-2 text-white/20">-</span>
                        {match.result?.score[1] ?? 0}
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                          Winner
                        </div>
                        <div className="text-sm font-bold text-amber-400">
                          {winnerName(activeTournament, match)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* NOVA OUTPUTS */}
        <section className="mt-6">
          <div className="mb-2">
            <h2 className="text-sm font-bold">Nova Outputs</h2>
            <p className="mt-0.5 text-[10px] text-white/30">
              Quick access
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onNavigate("landing")}
              className="flex min-w-0 items-center gap-2 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.035] px-2.5 py-2 text-left transition hover:bg-cyan-400/[0.07]"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cyan-400/10 text-cyan-400">
                <Radio size={13} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[11px] font-bold">
                  Operator
                </div>
                <div className="truncate text-[9px] text-white/30">
                  Event control
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                const target =
                  liveStates.find((s) =>
                    tables.some((t) => t.id === s.config.tableId)
                  )?.config.tableId ?? tables[0]?.id;

                if (target) openAudience(target);
              }}
              className="flex min-w-0 items-center gap-2 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.035] px-2.5 py-2 text-left transition hover:bg-emerald-400/[0.07]"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-400/10 text-emerald-400">
                <Monitor size={13} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[11px] font-bold">
                  Audience
                </div>
                <div className="truncate text-[9px] text-white/30">
                  Live public view
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                const target =
                  liveStates.find((s) =>
                    tables.some((t) => t.id === s.config.tableId)
                  )?.config.tableId ?? tables[0]?.id;

                if (target) openOBS(target);
              }}
              className="flex min-w-0 items-center gap-2 rounded-lg border border-violet-400/15 bg-violet-400/[0.035] px-2.5 py-2 text-left transition hover:bg-violet-400/[0.07]"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-400/10 text-violet-400">
                <ExternalLink size={13} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[11px] font-bold">
                  OBS
                </div>
                <div className="truncate text-[9px] text-white/30">
                  Broadcast
                </div>
              </div>
            </button>
          </div>
        </section>
      </main>

      {/* ADD TABLE */}
      {showAddTable && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddTable(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101722] p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                  {room?.name ?? "Match Room"}
                </div>
                <h2 className="mt-1 text-lg font-bold">Add Table</h2>
              </div>

              <button
                onClick={() => setShowAddTable(false)}
                className="text-white/35 hover:text-white"
              >
                <X size={19} />
              </button>
            </div>

            <p className="mt-2 text-sm text-white/40">
              This table will belong only to this Match Room.
            </p>

            <input
              autoFocus
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTable();
              }}
              placeholder="e.g. Table 1"
              className="mt-5 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-cyan-400/40"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowAddTable(false)}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/60 hover:bg-white/[0.05]"
              >
                Cancel
              </button>

              <button
                onClick={addTable}
                className="rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-bold text-black hover:bg-cyan-400"
              >
                Add Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE TABLE */}
      {deleteTableId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101722] p-6 shadow-2xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-400/10 text-red-400">
              <Trash2 size={19} />
            </div>

            <h2 className="mt-4 text-lg font-bold">
              Delete this table?
            </h2>

            <p className="mt-2 text-sm leading-6 text-white/45">
              The table will be removed from this Match Room.
              A table with a live match cannot be deleted.
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTableId(null)}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/60 hover:bg-white/[0.05]"
              >
                Cancel
              </button>

              <button
                onClick={confirmDeleteTable}
                className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-400"
              >
                Delete Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOURNAMENT SETTINGS */}
      {showTournamentSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setShowTournamentSettings(false);
            }
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#101722] p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                  Room Settings
                </div>
                <h2 className="mt-1 text-lg font-bold">
                  Tournament Information
                </h2>
              </div>

              <button
                onClick={() => setShowTournamentSettings(false)}
                className="text-white/35 hover:text-white"
              >
                <X size={19} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/35">
                  Tournament Title
                </label>

                <input
                  value={
                    roomSettings.title ??
                    activeTournament?.title ??
                    ""
                  }
                  onChange={(e) =>
                    updateRoomTournamentSettings({
                      title: e.target.value,
                    })
                  }
                  placeholder="Tournament name"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-white/20 focus:border-cyan-400/40"
                />
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex items-center gap-3">
                  <Users size={18} className="text-white/40" />
                  <div>
                    <div className="text-sm font-semibold">
                      Room-isolated data
                    </div>
                    <div className="mt-1 text-xs text-white/35">
                      Tournaments, tables and settings are stored
                      against {room?.name ?? "this room"}.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowTournamentSettings(false)}
                className="rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-bold text-black hover:bg-cyan-400"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
