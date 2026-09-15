import type {
  LiveMatchState,
  Tournament,
  TableInfo,
  PLStanding,
  ScheduledMatch,
} from "./types";

import {
  isNetworkMode,
  onBroadcast,
  pushBroadcast,
} from "./net";

const CHANNEL = "chalk-and-cue-v2";

/*
 * LEGACY KEYS
 * Kept so existing Nova rooms/tournaments continue to work.
 */
const KEY_TOURNEY = "ck-tournament";
const KEY_TABLES = "ck-tables";

/*
 * ROOM-AWARE STORAGE
 *
 * nova_match_rooms:
 *   [{ id, name, code, venue }]
 *
 * nova_room_tournaments:
 *   {
 *     [roomId]: Tournament[]
 *   }
 *
 * nova_active_tournament_<roomId>:
 *   tournament id currently selected in that room.
 *
 * nova_room_tables_<roomId>:
 *   TableInfo[]
 */

const ROOM_KEY = "nova_match_rooms";
const ACTIVE_ROOM_KEY = "nova_active_room";
const ROOM_TOURNAMENTS_KEY = "nova_room_tournaments";
const ROOM_TABLES_PREFIX = "nova_room_tables_";
const ACTIVE_TOURNAMENT_PREFIX =
  "nova_active_tournament_";

function liveTableKey(roomId: string, tableId: string): string {
  return `nova-live-${roomId}-${tableId}`;
}

function legacyTableKey(id: string): string {
  return `ck-table-${id}`;
}

function roomTablesKey(roomId: string): string {
  return `${ROOM_TABLES_PREFIX}${roomId}`;
}

function activeTournamentKey(roomId: string): string {
  return `${ACTIVE_TOURNAMENT_PREFIX}${roomId}`;
}

/* ============================================================
   BROADCAST
   ============================================================ */

function broadcast(message: unknown): void {
  // Local, same-device tabs/windows (original behaviour).
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    // BroadcastChannel may not be available.
  }

  // Cross-device relay over the LAN when a Nova server is present.
  try {
    pushBroadcast(message);
  } catch {
    // Ignore network relay errors; local storage still holds the state.
  }
}

/* ============================================================
   ROOM HELPERS
   ============================================================ */

export interface NovaRoom {
  id: string;
  name: string;
  code: string;
  venue?: string;
}

export type MatchRoom = NovaRoom;

function readRooms(): NovaRoom[] {
  try {
    const raw = localStorage.getItem(ROOM_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed)
      ? (parsed as NovaRoom[])
      : [];
  } catch {
    return [];
  }
}

function writeRooms(rooms: NovaRoom[]): void {
  try {
    localStorage.setItem(
      ROOM_KEY,
      JSON.stringify(rooms)
    );

    broadcast({
      type: "rooms-update",
      rooms,
    });
  } catch {
    // Ignore storage errors.
  }
}

export function loadRooms(): NovaRoom[] {
  return readRooms();
}

export function loadActiveRoomId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ROOM_KEY);
  } catch {
    return null;
  }
}

export function setActiveRoom(
  roomId: string
): void {
  try {
    localStorage.setItem(
      ACTIVE_ROOM_KEY,
      roomId
    );

    broadcast({
      type: "active-room-update",
      roomId,
    });
  } catch {
    // Ignore storage errors.
  }
}

export function loadActiveRoom(): NovaRoom | null {
  const rooms = readRooms();

  if (!rooms.length) {
    return null;
  }

  const activeId =
    loadActiveRoomId();

  return (
    rooms.find(
      room => room.id === activeId
    ) ??
    rooms[0] ??
    null
  );
}

export function createRoom(
  name: string,
  code?: string,
  venue?: string
): NovaRoom {
  const rooms = readRooms();

  const room: NovaRoom = {
    id: uid(),
    name:
      name.trim() ||
      `Match Room ${rooms.length + 1}`,
    code:
      code?.trim() ||
      `ROOM-${Math.random()
        .toString(36)
        .slice(2, 7)
        .toUpperCase()}`,
    venue:
      venue?.trim() ||
      undefined,
  };

  const nextRooms = [
    ...rooms,
    room,
  ];

  writeRooms(nextRooms);
  setActiveRoom(room.id);

  return room;
}

export function updateRoom(
  room: NovaRoom
): NovaRoom {
  const rooms = readRooms();

  const nextRooms = rooms.map(
    existing =>
      existing.id === room.id
        ? room
        : existing
  );

  writeRooms(nextRooms);

  return room;
}

export function deleteRoom(
  roomId: string
): void {
  const rooms = readRooms();

  const remaining = rooms.filter(
    room => room.id !== roomId
  );

  /*
   * Remove room-specific tournament/table data.
   */
  try {
    localStorage.removeItem(
      roomTablesKey(roomId)
    );

    localStorage.removeItem(
      activeTournamentKey(roomId)
    );

    const allTournaments =
      readRoomTournaments();

    delete allTournaments[roomId];

    writeRoomTournaments(
      allTournaments
    );
  } catch {
    // Ignore cleanup errors.
  }

  writeRooms(remaining);

  const activeId =
    loadActiveRoomId();

  if (
    activeId === roomId &&
    remaining.length
  ) {
    setActiveRoom(
      remaining[0].id
    );
  }
}

/* ============================================================
   ROOM TOURNAMENT STORAGE
   ============================================================ */

type RoomTournamentMap =
  Record<string, Tournament[]>;

function readRoomTournaments(): RoomTournamentMap {
  try {
    const raw =
      localStorage.getItem(
        ROOM_TOURNAMENTS_KEY
      );

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    return parsed as RoomTournamentMap;
  } catch {
    return {};
  }
}

function writeRoomTournaments(
  data: RoomTournamentMap
): void {
  try {
    localStorage.setItem(
      ROOM_TOURNAMENTS_KEY,
      JSON.stringify(data)
    );

    broadcast({
      type: "room-tournaments-update",
      tournaments: data,
    });
  } catch {
    // Ignore storage errors.
  }
}

function getDefaultRoomId(): string | null {
  return loadActiveRoomId();
}

/*
 * Existing Nova installations may only have:
 *
 *   ck-tournament
 *
 * When the first room is used, migrate that tournament into
 * the room-aware store. Nothing is deleted from the legacy key,
 * so this is a safe migration.
 */
function migrateLegacyTournamentIfNeeded(
  roomId: string
): Tournament[] {
  const data =
    readRoomTournaments();

  if (
    Array.isArray(data[roomId]) &&
    data[roomId].length
  ) {
    return data[roomId];
  }

  /*
   * IMPORTANT:
   * The old ck-tournament key belongs to the legacy
   * single-room installation. It must ONLY be migrated
   * into the first room, never into every newly-created room.
   */
  const rooms = readRooms();

  if (
    !rooms.length ||
    rooms[0]?.id !== roomId
  ) {
    return [];
  }

  /*
   * Only migrate if this room has never been initialized.
   */
  if (
    Object.prototype.hasOwnProperty.call(
      data,
      roomId
    )
  ) {
    return [];
  }

  try {
    const raw =
      localStorage.getItem(
        KEY_TOURNEY
      );

    if (!raw) {
      /*
       * Mark the room as initialized even when there
       * is no legacy tournament. This prevents a later
       * legacy key from being copied into this room.
       */
      data[roomId] = [];
      writeRoomTournaments(data);
      return [];
    }

    const legacy =
      JSON.parse(raw) as Tournament;

    if (!legacy?.id) {
      data[roomId] = [];
      writeRoomTournaments(data);
      return [];
    }

    data[roomId] = [legacy];

    writeRoomTournaments(data);

    try {
      localStorage.setItem(
        activeTournamentKey(roomId),
        legacy.id
      );
    } catch {}

    return [legacy];
  } catch {
    return [];
  }
}

export function clearRoomTournaments(
  roomId: string
): void {
  const data =
    readRoomTournaments();

  data[roomId] = [];

  writeRoomTournaments(
    data
  );

  try {
    localStorage.removeItem(
      activeTournamentKey(
        roomId
      )
    );
  } catch {}

  broadcast({
    type: "room-tournaments-cleared",
    roomId,
  });
}

export function loadTournaments(
  roomId?: string
): Tournament[] {
  const resolvedRoomId =
    roomId ?? getDefaultRoomId();

  if (!resolvedRoomId) {
    /*
     * Preserve old behaviour if Nova has not created
     * rooms yet.
     */
    const legacy =
      loadLegacyTournament();

    return legacy
      ? [legacy]
      : [];
  }

  const data =
    readRoomTournaments();

  if (
    Array.isArray(
      data[resolvedRoomId]
    )
  ) {
    return data[resolvedRoomId];
  }

  return migrateLegacyTournamentIfNeeded(
    resolvedRoomId
  );
}

export function loadTournament(
  roomId?: string,
  tournamentId?: string
): Tournament | null {
  const resolvedRoomId =
    roomId ?? getDefaultRoomId();

  /*
   * Backward compatibility:
   * if there are no rooms yet, use the existing global tournament.
   */
  if (!resolvedRoomId) {
    return loadLegacyTournament();
  }

  const tournaments =
    loadTournaments(
      resolvedRoomId
    );

  if (!tournaments.length) {
    return null;
  }

  if (tournamentId) {
    return (
      tournaments.find(
        tournament =>
          tournament.id ===
          tournamentId
      ) ?? null
    );
  }

  let activeId: string | null =
    null;

  try {
    activeId =
      localStorage.getItem(
        activeTournamentKey(
          resolvedRoomId
        )
      );
  } catch {}

  return (
    tournaments.find(
      tournament =>
        tournament.id === activeId
    ) ??
    tournaments[0] ??
    null
  );
}

function loadLegacyTournament(): Tournament | null {
  try {
    const raw =
      localStorage.getItem(
        KEY_TOURNEY
      );

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as Tournament;
  } catch {
    return null;
  }
}

export function saveTournament(
  tournament: Tournament,
  roomId?: string
): void {
  const resolvedRoomId =
    roomId ??
    getDefaultRoomId();

  try {
    /*
     * No room yet:
     * retain the old storage path.
     */
    if (!resolvedRoomId) {
      localStorage.setItem(
        KEY_TOURNEY,
        JSON.stringify(tournament)
      );

      broadcast({
        type: "tournament-update",
        tournament,
      });

      return;
    }

    const data =
      readRoomTournaments();

    const current =
      Array.isArray(
        data[resolvedRoomId]
      )
        ? data[resolvedRoomId]
        : [];

    const exists =
      current.some(
        item =>
          item.id ===
          tournament.id
      );

    data[resolvedRoomId] =
      exists
        ? current.map(
            item =>
              item.id ===
              tournament.id
                ? tournament
                : item
          )
        : [
            ...current,
            tournament,
          ];

    writeRoomTournaments(data);

    localStorage.setItem(
      activeTournamentKey(
        resolvedRoomId
      ),
      tournament.id
    );

    broadcast({
      type: "tournament-update",
      roomId: resolvedRoomId,
      tournament,
    });
  } catch {
    // Ignore storage errors.
  }
}

export function setActiveTournament(
  tournamentId: string,
  roomId?: string
): void {
  const resolvedRoomId =
    roomId ??
    getDefaultRoomId();

  if (!resolvedRoomId) {
    return;
  }

  try {
    localStorage.setItem(
      activeTournamentKey(
        resolvedRoomId
      ),
      tournamentId
    );

    broadcast({
      type: "active-tournament-update",
      roomId: resolvedRoomId,
      tournamentId,
    });
  } catch {
    // Ignore storage errors.
  }
}

export function createTournament(
  tournament: Tournament,
  roomId?: string
): Tournament {
  const resolvedRoomId =
    roomId ??
    getDefaultRoomId();

  if (!resolvedRoomId) {
    saveTournament(tournament);
    return tournament;
  }

  saveTournament(
    tournament,
    resolvedRoomId
  );

  setActiveTournament(
    tournament.id,
    resolvedRoomId
  );

  return tournament;
}

export function deleteTournament(
  tournamentId?: string,
  roomId?: string
): void {
  const resolvedRoomId =
    roomId ??
    getDefaultRoomId();

  /*
   * Backward compatibility for the old single-tournament setup.
   */
  if (!resolvedRoomId) {
    try {
      localStorage.removeItem(
        KEY_TOURNEY
      );

      broadcast({
        type: "tournament-deleted",
      });
    } catch {
      // Ignore storage errors.
    }

    return;
  }

  const tournaments =
    loadTournaments(
      resolvedRoomId
    );

  let targetId =
    tournamentId;

  if (!targetId) {
    targetId =
      loadTournament(
        resolvedRoomId
      )?.id;
  }

  const remaining =
    tournaments.filter(
      tournament =>
        tournament.id !==
        targetId
    );

  const data =
    readRoomTournaments();

  data[resolvedRoomId] =
    remaining;

  writeRoomTournaments(data);

  try {
    const nextActive =
      remaining[0];

    if (nextActive) {
      localStorage.setItem(
        activeTournamentKey(
          resolvedRoomId
        ),
        nextActive.id
      );
    } else {
      localStorage.removeItem(
        activeTournamentKey(
          resolvedRoomId
        )
      );
    }
  } catch {}

  broadcast({
    type: "tournament-deleted",
    roomId: resolvedRoomId,
    tournamentId: targetId,
  });
}

/* ============================================================
   TABLES
   ============================================================ */

export function saveTables(
  tables: TableInfo[],
  roomId?: string
): void {
  const resolvedRoomId =
    roomId ??
    getDefaultRoomId();

  try {
    /*
     * Preserve legacy behaviour when no room exists.
     */
    if (!resolvedRoomId) {
      localStorage.setItem(
        KEY_TABLES,
        JSON.stringify(tables)
      );

      broadcast({
        type: "tables-update",
        tables,
      });

      return;
    }

    localStorage.setItem(
      roomTablesKey(
        resolvedRoomId
      ),
      JSON.stringify(tables)
    );

    broadcast({
      type: "tables-update",
      roomId: resolvedRoomId,
      tables,
    });
  } catch {
    // Ignore storage errors.
  }
}

export function loadTables(
  roomId?: string
): TableInfo[] {
  const resolvedRoomId =
    roomId ??
    getDefaultRoomId();

  try {
    /*
     * If a room exists, use room-specific tables.
     */
    if (resolvedRoomId) {
      const roomRaw =
        localStorage.getItem(
          roomTablesKey(
            resolvedRoomId
          )
        );

      if (roomRaw) {
        const parsed =
          JSON.parse(roomRaw);

        return Array.isArray(parsed)
          ? (parsed as TableInfo[])
          : [];
      }

      /*
       * Migrate the old table list ONLY into the
       * first room. Newly-created rooms must start
       * with their own empty table list.
       */
      const rooms = readRooms();

      if (
        rooms.length &&
        rooms[0]?.id ===
          resolvedRoomId
      ) {
        const legacyRaw =
          localStorage.getItem(
            KEY_TABLES
          );

        if (legacyRaw) {
          const parsed =
            JSON.parse(legacyRaw);

          if (Array.isArray(parsed)) {
            const legacyTables =
              parsed as TableInfo[];

            localStorage.setItem(
              roomTablesKey(
                resolvedRoomId
              ),
              JSON.stringify(
                legacyTables
              )
            );

            return legacyTables;
          }
        }
      }

      return [];
    }

    const raw =
      localStorage.getItem(
        KEY_TABLES
      );

    if (!raw) {
      return [];
    }

    const parsed =
      JSON.parse(raw);

    return Array.isArray(parsed)
      ? (parsed as TableInfo[])
      : [];
  } catch {
    return [];
  }
}

/* ============================================================
   LIVE MATCH STATE
   ============================================================ */

export function saveMatchState(
  state: LiveMatchState
): void {
  try {
    /*
     * Live matches are isolated by room.
     *
     * MatchConfig.roomId is the preferred source. The active room
     * remains the fallback for older callers.
     */
    const roomId =
      state.config.roomId ??
      getDefaultRoomId();

    /*
     * If Nova has not created rooms yet, preserve the old storage
     * behaviour so existing single-room installations still work.
     */
    if (!roomId) {
      localStorage.setItem(
        legacyTableKey(
          state.config.tableId
        ),
        JSON.stringify(state)
      );

      broadcast({
        type: "match-update",
        tableId:
          state.config.tableId,
        state,
      });

      return;
    }

    /*
     * Always persist the room on the state itself. This makes the
     * state self-describing and prevents another room from treating
     * it as its own live match.
     */
    const roomAwareState: LiveMatchState = {
      ...state,
      config: {
        ...state.config,
        roomId,
      },
    };

    localStorage.setItem(
      liveTableKey(
        roomId,
        state.config.tableId
      ),
      JSON.stringify(roomAwareState)
    );

    broadcast({
      type: "match-update",
      roomId,
      tableId:
        state.config.tableId,
      state: roomAwareState,
    });
  } catch {
    // Ignore storage errors.
  }
}

export function loadMatchState(
  tableId: string
): LiveMatchState | null {
  const roomId =
    getDefaultRoomId();

  try {
    /*
     * With rooms enabled, ONLY read this room's live state.
     * This is the key isolation fix.
     */
    if (roomId) {
      const roomRaw =
        localStorage.getItem(
          liveTableKey(
            roomId,
            tableId
          )
        );

      if (roomRaw) {
        return JSON.parse(
          roomRaw
        ) as LiveMatchState;
      }

      /*
       * Safe legacy migration:
       * only the first room may inherit an old ck-table-* state.
       * Never copy a legacy live match into later rooms.
       */
      const rooms =
        readRooms();

      if (
        rooms.length &&
        rooms[0]?.id === roomId
      ) {
        const legacyRaw =
          localStorage.getItem(
            legacyTableKey(
              tableId
            )
          );

        if (legacyRaw) {
          const legacyState =
            JSON.parse(
              legacyRaw
            ) as LiveMatchState;

          if (
            legacyState?.config
              ?.tableId === tableId
          ) {
            const migrated: LiveMatchState = {
              ...legacyState,
              config: {
                ...legacyState.config,
                roomId,
              },
            };

            localStorage.setItem(
              liveTableKey(
                roomId,
                tableId
              ),
              JSON.stringify(
                migrated
              )
            );

            return migrated;
          }
        }
      }

      return null;
    }

    /*
     * No room system yet: preserve legacy behaviour.
     */
    const raw =
      localStorage.getItem(
        legacyTableKey(tableId)
      );

    if (!raw) {
      return null;
    }

    return JSON.parse(
      raw
    ) as LiveMatchState;
  } catch {
    return null;
  }
}

export function loadAllMatchStates(explicitRoomId?: string): LiveMatchState[] {
  const states: LiveMatchState[] = [];
  const roomId =
    explicitRoomId ?? getDefaultRoomId();

  try {
    /*
     * When rooms exist, scan ONLY the active room's namespace.
     */
    if (roomId) {
      const prefix =
        `nova-live-${roomId}-`;

      for (
        let i = 0;
        i < localStorage.length;
        i++
      ) {
        const key =
          localStorage.key(i);

        if (
          !key?.startsWith(prefix)
        ) {
          continue;
        }

        const raw =
          localStorage.getItem(
            key
          );

        if (!raw) {
          continue;
        }

        try {
          const state =
            JSON.parse(
              raw
            ) as LiveMatchState;

          if (
            state?.config?.tableId
          ) {
            states.push(state);
          }
        } catch {
          // Ignore malformed table state.
        }
      }

      /*
       * If this is the first room, also discover an old legacy
       * live state and migrate it through loadMatchState().
       */
      const rooms =
        readRooms();

      if (
        rooms.length &&
        rooms[0]?.id === roomId
      ) {
        for (
          let i = 0;
          i < localStorage.length;
          i++
        ) {
          const key =
            localStorage.key(i);

          if (
            !key?.startsWith(
              "ck-table-"
            )
          ) {
            continue;
          }

          const tableId =
            key.slice(
              "ck-table-".length
            );

          if (
            states.some(
              state =>
                state.config.tableId ===
                tableId
            )
          ) {
            continue;
          }

          const migrated =
            loadMatchState(
              tableId
            );

          if (migrated) {
            states.push(
              migrated
            );
          }
        }
      }

      return states;
    }

    /*
     * No rooms: preserve legacy behaviour.
     */
    for (
      let i = 0;
      i < localStorage.length;
      i++
    ) {
      const key =
        localStorage.key(i);

      if (
        !key?.startsWith(
          "ck-table-"
        )
      ) {
        continue;
      }

      const raw =
        localStorage.getItem(
          key
        );

      if (!raw) {
        continue;
      }

      try {
        states.push(
          JSON.parse(
            raw
          ) as LiveMatchState
        );
      } catch {
        // Ignore malformed table state.
      }
    }
  } catch {
    // Ignore storage errors.
  }

  return states;
}

/* ============================================================
   END / CLEAR LIVE MATCH
   ============================================================ */

export function endMatch(
  tableId: string
): void {
  try {
    const roomId =
      getDefaultRoomId();

    if (roomId) {
      localStorage.removeItem(
        liveTableKey(
          roomId,
          tableId
        )
      );

      /*
       * Remove the legacy key only when the active room is the
       * first room. Later rooms must never affect legacy data.
       */
      const rooms =
        readRooms();

      if (
        rooms.length &&
        rooms[0]?.id === roomId
      ) {
        localStorage.removeItem(
          legacyTableKey(
            tableId
          )
        );
      }

      broadcast({
        type: "match-ended",
        roomId,
        tableId,
      });

      return;
    }

    localStorage.removeItem(
      legacyTableKey(tableId)
    );

    broadcast({
      type: "match-ended",
      tableId,
    });
  } catch {
    // Ignore storage errors.
  }
}

export const clearMatchState =
  endMatch;

/* ============================================================
   MARK TOURNAMENT MATCH COMPLETE
   ============================================================ */

export function completeTournamentMatch(
  tournament: Tournament,
  matchId: string,
  winner:
    | "player1"
    | "player2"
    | "draw",
  score: [number, number],
  roomId?: string
): Tournament {
  const nextTournament: Tournament = {
    ...tournament,

    schedule:
      tournament.schedule.map(
        (
          match: ScheduledMatch
        ) => {
          if (
            match.id !==
            matchId
          ) {
            return match;
          }

          return {
            ...match,
            status: "complete",
            result: {
              winner,
              score,
            },
          };
        }
      ),
  };

  nextTournament.standings =
    calcStandings(
      nextTournament.players.map(
        player =>
          player.id
      ),
      nextTournament.schedule
    );

  saveTournament(
    nextTournament,
    roomId
  );

  return nextTournament;
}

/* ============================================================
   RESET TOURNAMENT MATCH TO SCHEDULED
   ============================================================ */

export function resetTournamentMatch(
  tournament: Tournament,
  matchId: string,
  roomId?: string
): Tournament {
  const nextTournament: Tournament = {
    ...tournament,

    schedule:
      tournament.schedule.map(
        (
          match: ScheduledMatch
        ) => {
          if (
            match.id !==
            matchId
          ) {
            return match;
          }

          return {
            ...match,
            status: "scheduled",
            result: undefined,
          };
        }
      ),
  };

  nextTournament.standings =
    calcStandings(
      nextTournament.players.map(
        player =>
          player.id
      ),
      nextTournament.schedule
    );

  saveTournament(
    nextTournament,
    roomId
  );

  return nextTournament;
}

/* ============================================================
   BROADCAST LISTENER
   ============================================================ */

export function listenBroadcast(
  onUpdate: (
    tableId: string,
    state: LiveMatchState
  ) => void,
  onEnd?: (
    tableId: string
  ) => void,
  onTournamentUpdate?: (
    tournament: Tournament
  ) => void
): () => void {
  /*
   * A single handler processes messages from BOTH sources:
   *   1. The local BroadcastChannel (same-device tabs/windows).
   *   2. The LAN relay (other devices), delivered via net.onBroadcast.
   * The message shape is identical, so the same logic applies.
   */
  const handleMessage = (data: any): void => {
    const activeRoomId =
      getDefaultRoomId();

    if (
      data?.type ===
        "match-update" &&
      data.tableId &&
      data.state
    ) {
      /*
       * Ignore live updates belonging to another room.
       */
      if (
        activeRoomId &&
        data.roomId &&
        data.roomId !== activeRoomId
      ) {
        return;
      }

      onUpdate(
        data.tableId,
        data.state
      );
    }

    if (
      data?.type ===
        "match-ended" &&
      data.tableId
    ) {
      /*
       * Ignore end events belonging to another room.
       */
      if (
        activeRoomId &&
        data.roomId &&
        data.roomId !== activeRoomId
      ) {
        return;
      }

      onEnd?.(
        data.tableId
      );
    }

    if (
      data?.type ===
        "tournament-update" &&
      data.tournament
    ) {
      onTournamentUpdate?.(
        data.tournament
      );
    }
  };

  let channel:
    | BroadcastChannel
    | null = null;

  try {
    channel =
      new BroadcastChannel(
        CHANNEL
      );

    channel.onmessage =
      event => {
        handleMessage(event.data);
      };
  } catch {
    channel = null;
  }

  /*
   * Network relay: broadcasts from other devices carry the same payload as
   * the local BroadcastChannel message, so we feed them through the same
   * handler. This is what actually delivers a phone's scoring to the desktop
   * (and vice-versa) over the LAN.
   */
  let unsubBroadcast: (() => void) | null = null;

  if (isNetworkMode()) {
    unsubBroadcast = onBroadcast(payload => {
      handleMessage(payload);
    });
  }

  return () => {
    try {
      channel?.close();
    } catch {
      // Ignore.
    }
    try {
      unsubBroadcast?.();
    } catch {
      // Ignore.
    }
  };
}

/* ============================================================
   ROUND ROBIN
   ============================================================ */

export function generateRoundRobin(
  playerIds: string[]
): {
  p1: string;
  p2: string;
  round: number;
}[] {
  const pool = [
    ...playerIds,
  ];

  if (
    pool.length % 2 !==
    0
  ) {
    pool.push(
      "__bye__"
    );
  }

  const n =
    pool.length;

  const rounds: {
    p1: string;
    p2: string;
    round: number;
  }[] = [];

  for (
    let round = 0;
    round <
    n - 1;
    round++
  ) {
    for (
      let i = 0;
      i <
      n / 2;
      i++
    ) {
      const p1 =
        pool[i];

      const p2 =
        pool[
          n - 1 - i
        ];

      if (
        p1 !==
          "__bye__" &&
        p2 !==
          "__bye__"
      ) {
        rounds.push({
          p1,
          p2,
          round:
            round + 1,
        });
      }
    }

    pool.splice(
      1,
      0,
      pool.pop()!
    );
  }

  return rounds;
}

/* ============================================================
   STANDINGS
   ============================================================ */

export function calcStandings(
  playerIds: string[],
  schedule: ScheduledMatch[]
): PLStanding[] {
  const map =
    new Map<
      string,
      PLStanding
    >();

  for (
    const playerId of playerIds
  ) {
    map.set(
      playerId,
      {
        playerId,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        framesFor: 0,
        framesAgainst: 0,
        points: 0,
      }
    );
  }

  for (
    const match of schedule
  ) {
    if (
      match.status !==
        "complete" ||
      !match.result
    ) {
      continue;
    }

    const s1 =
      map.get(
        match.player1Id
      );

    const s2 =
      map.get(
        match.player2Id
      );

    if (
      !s1 ||
      !s2
    ) {
      continue;
    }

    const [
      score1,
      score2,
    ] =
      match.result.score;

    s1.played += 1;
    s2.played += 1;

    s1.framesFor +=
      score1;

    s1.framesAgainst +=
      score2;

    s2.framesFor +=
      score2;

    s2.framesAgainst +=
      score1;

    if (
      match.result.winner ===
      "player1"
    ) {
      s1.won += 1;
      s2.lost += 1;
      s1.points += 2;
    } else if (
      match.result.winner ===
      "player2"
    ) {
      s2.won += 1;
      s1.lost += 1;
      s2.points += 2;
    } else {
      s1.drawn += 1;
      s2.drawn += 1;
      s1.points += 1;
      s2.points += 1;
    }
  }

  return [
    ...map.values(),
  ].sort(
    (a, b) =>
      b.points -
        a.points ||
      b.won -
        a.won ||
      (
        b.framesFor -
        b.framesAgainst
      ) -
        (
          a.framesFor -
          a.framesAgainst
        ) ||
      b.framesFor -
        a.framesFor
  );
}

/* ============================================================
   ID
   ============================================================ */

export function uid(): string {
  return (
    Math.random()
      .toString(36)
      .slice(2, 9) +
    Date.now()
      .toString(36)
      .slice(-4)
  );
}
