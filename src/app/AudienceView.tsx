import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Clock,
  Monitor,
  Radio,
  Timer,
  Trophy,
} from "lucide-react";

import type {
  FrameDef,
  LiveMatchState,
  Tournament,
  ScheduledMatch,
} from "./types";
import {
  loadAllMatchStates,
  loadRooms,
  loadTournaments,
  listenBroadcast,
} from "./sync";

import type { MatchRoom } from "./sync";

interface Props {
  tableId?: string;
}

function fmtTime(seconds: number) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getFrameDef(state: LiveMatchState): FrameDef {
  const sequence = state.config.customSequence ?? [];

  return (
    sequence[
      state.currentSeqIdx %
        Math.max(1, sequence.length)
    ] ?? {
      type: "snooker",
      reds: 15,
      billMode: "points",
      billTarget: 300,
      billDuration: 3600,
    }
  );
}

function playerName(
  state: LiveMatchState,
  side: 0 | 1
) {
  const config = state.config;

  if (config.matchMode === "doubles") {
    return (
      config.teams?.[side]?.name ??
      `Team ${side + 1}`
    );
  }

  return (
    config.players?.[side]?.name ??
    `Player ${side + 1}`
  );
}

function playerPhoto(
  state: LiveMatchState,
  side: 0 | 1
) {
  if (state.config.matchMode === "doubles") {
    return null;
  }

  return state.config.players?.[side]?.photo ?? null;
}

function exitLiveView() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  window.location.href = url.toString();
}


function completedMatchScore(
  tournament: Tournament,
  match: ScheduledMatch
): [number, number] {
  const saved: [number, number] =
    match.result?.score ?? [0, 0];

  if (!match.result) {
    return saved;
  }

  /*
   * Remote can save the tournament result immediately after
   * the deciding frame is won. At that exact moment matchPts
   * may still contain the score BEFORE the winning frame is
   * added (for example 2-1 instead of 3-1 in Best of 5).
   *
   * For a completed match, the declared winner must therefore
   * have reached the required number of frames/points.
   */
  const bestOf =
    match.bestOfOverride ??
    tournament.format?.bestOf ??
    1;

  const needed = Math.ceil(bestOf / 2);

  if (match.result.winner === "player1") {
    return [
      Math.max(saved[0], needed),
      saved[1],
    ];
  }

  if (match.result.winner === "player2") {
    return [
      saved[0],
      Math.max(saved[1], needed),
    ];
  }

  return saved;
}

function previousCompletedMatch(
  tournament: Tournament | null,
  state: LiveMatchState
): ScheduledMatch | null {
  if (!tournament) return null;

  const currentId =
    state.config.scheduledMatchId;

  const schedule =
    tournament.schedule ?? [];

  /*
   * The Match Room appends a newly assigned match after
   * the previous completed match. Walk backwards from the
   * current match so the Audience scoreboard shows the
   * result that immediately preceded the current match.
   */
  const currentIndex =
    currentId
      ? schedule.findIndex(
          (match) =>
            match.id === currentId
        )
      : schedule.length;

  const end =
    currentIndex >= 0
      ? currentIndex
      : schedule.length;

  for (
    let i = end - 1;
    i >= 0;
    i -= 1
  ) {
    const match =
      schedule[i];

    if (
      match.status === "complete" &&
      match.result
    ) {
      return match;
    }
  }

  return null;
}

function resultPlayerName(
  tournament: Tournament,
  playerId: string
): string {
  return (
    tournament.players.find(
      (player) =>
        player.id === playerId
    )?.name ??
    "Unknown"
  );
}

/* ================================================================
   ROOT
   ================================================================ */

export default function AudienceView({
  tableId,
}: Props) {
  /*
   * Audience selection flow:
   *
   *   Match Room -> Tournament -> Match Table -> Live Match
   *
   * Everything is explicitly room-scoped. The Audience View must
   * never use the Operator's active room as an implicit filter after
   * the audience has made a selection.
   */
  const [rooms, setRooms] = useState<MatchRoom[]>(
    () => loadRooms()
  );

  const [selectedRoomId, setSelectedRoomId] =
    useState<string | null>(null);

  const [tournaments, setTournaments] = useState<Tournament[]>([]);

  const [states, setStates] = useState<LiveMatchState[]>([]);

  const [selectedTournamentId, setSelectedTournamentId] =
    useState<string | null>(null);

  const [selectedTableId, setSelectedTableId] =
    useState<string | null>(tableId ?? null);

  const [selectionStep, setSelectionStep] = useState<
    "room" | "tournament" | "table"
  >(tableId ? "table" : "room");

  const selectedRoom = useMemo(() => {
    if (!selectedRoomId) return null;

    return (
      rooms.find((room) => room.id === selectedRoomId) ??
      null
    );
  }, [rooms, selectedRoomId]);

  const selectedTournament = useMemo(() => {
    if (!selectedTournamentId) return null;

    return (
      tournaments.find(
        (item) => item.id === selectedTournamentId
      ) ?? null
    );
  }, [tournaments, selectedTournamentId]);

  /* --------------------------------------------------------------
     INITIAL / DIRECT TABLE RESOLUTION
     --------------------------------------------------------------
     A copied audience URL such as ?view=audience&table=table-2
     should still work. We search every Match Room for the table and
     then lock the Audience View into that room.
     -------------------------------------------------------------- */
  useEffect(() => {
    if (!tableId || selectedRoomId) return;

    const currentRooms = loadRooms();

    for (const room of currentRooms) {
      const roomTournaments = loadTournaments(room.id);
      const roomStates = loadAllMatchStates(room.id);

      const liveMatch = roomStates.find(
        (state) =>
          state.status === "active" &&
          state.config.tableId === tableId
      );

      const ownsTable = roomTournaments.some((tournament) =>
        (tournament.tables ?? []).some(
          (table) => table.id === tableId
        )
      );

      if (liveMatch || ownsTable) {
        setRooms(currentRooms);
        setSelectedRoomId(room.id);
        setTournaments(roomTournaments);
        setStates(roomStates);

        const tournamentId =
          liveMatch?.config.tournamentId ??
          roomTournaments.find((tournament) =>
            (tournament.tables ?? []).some(
              (table) => table.id === tableId
            )
          )?.id ??
          null;

        setSelectedTournamentId(tournamentId);
        setSelectionStep(tournamentId ? "table" : "tournament");
        return;
      }
    }
  }, [tableId, selectedRoomId]);

  /* --------------------------------------------------------------
     ROOM-SCOPED REFRESH
     -------------------------------------------------------------- */
  useEffect(() => {
    const refresh = () => {
      const nextRooms = loadRooms();
      setRooms(nextRooms);

      if (!selectedRoomId) {
        return;
      }

      const roomStillExists = nextRooms.some(
        (room) => room.id === selectedRoomId
      );

      if (!roomStillExists) {
        setSelectedRoomId(null);
        setSelectedTournamentId(null);
        setSelectedTableId(null);
        setTournaments([]);
        setStates([]);
        setSelectionStep("room");
        return;
      }

      setTournaments(loadTournaments(selectedRoomId));
      setStates(loadAllMatchStates(selectedRoomId));
    };

    refresh();

    const poll = window.setInterval(refresh, 500);

    const unsub = listenBroadcast(() => {
      refresh();
    });

    return () => {
      window.clearInterval(poll);
      unsub();
    };
  }, [selectedRoomId]);

  /* --------------------------------------------------------------
     SELECTION ACTIONS
     -------------------------------------------------------------- */
  const chooseRoom = (roomId: string) => {
    setSelectedRoomId(roomId);
    setSelectedTournamentId(null);
    setSelectedTableId(null);
    setTournaments(loadTournaments(roomId));
    setStates(loadAllMatchStates(roomId));
    setSelectionStep("tournament");
  };

  const chooseTournament = (tournamentId: string) => {
    if (!selectedRoomId) return;

    setSelectedTournamentId(tournamentId);
    setSelectedTableId(null);
    setStates(loadAllMatchStates(selectedRoomId));
    setSelectionStep("table");
  };

  const chooseTable = (nextTableId: string) => {
    setSelectedTableId(nextTableId);
  };

  const chooseAllLiveTables = () => {
    setSelectedTableId(null);
  };

  const backToRoomPicker = () => {
    setSelectedRoomId(null);
    setSelectedTournamentId(null);
    setSelectedTableId(null);
    setTournaments([]);
    setStates([]);
    setSelectionStep("room");
  };

  const backToTournamentPicker = () => {
    setSelectedTournamentId(null);
    setSelectedTableId(null);
    setSelectionStep("tournament");
  };

  const selectedTournamentStates = useMemo(() => {
    if (!selectedTournamentId) return [];

    return states
      .filter(
        (state) =>
          state.status === "active" &&
          state.config.tournamentId === selectedTournamentId
      )
      .slice()
      .sort(
        (a, b) =>
          (a.config.tableNumber ?? 999) -
          (b.config.tableNumber ?? 999)
      );
  }, [states, selectedTournamentId]);

  const selectedState = useMemo(() => {
    if (!selectedTableId) return null;

    return (
      selectedTournamentStates.find(
        (state) => state.config.tableId === selectedTableId
      ) ?? null
    );
  }, [selectedTableId, selectedTournamentStates]);

  /*
   * If the selected live match ends, return to the table selection
   * screen while keeping the audience's chosen room and tournament.
   */
  useEffect(() => {
    if (selectedTableId && !selectedState) {
      setSelectedTableId(null);
    }
  }, [selectedTableId, selectedState]);

  /* ==============================================================
     DETAILED LIVE VIEW
     ============================================================== */
  if (selectedState && selectedTournament) {
    return (
      <SingleTableView
        state={selectedState}
        tournament={selectedTournament}
        onBack={() => setSelectedTableId(null)}
        onChangeTournament={backToTournamentPicker}
        onExit={exitLiveView}
      />
    );
  }

  /* ==============================================================
     MATCH ROOM PICKER
     ============================================================== */
  if (
    selectionStep === "room" ||
    !selectedRoomId ||
    !selectedRoom
  ) {
    return (
      <AudienceRoomPicker
        rooms={rooms}
        onSelect={chooseRoom}
        onExit={exitLiveView}
      />
    );
  }

  /* ==============================================================
     TOURNAMENT PICKER
     ============================================================== */
  if (
    selectionStep === "tournament" ||
    !selectedTournamentId ||
    !selectedTournament
  ) {
    return (
      <AudienceTournamentPicker
        room={selectedRoom}
        tournaments={tournaments}
        onBack={backToRoomPicker}
        onSelect={chooseTournament}
        onExit={exitLiveView}
      />
    );
  }

  /* ==============================================================
     TABLE PICKER / LIVE TABLE VIEW
     ============================================================== */
  return (
    <AudienceTablePicker
      room={selectedRoom}
      tournament={selectedTournament}
      states={selectedTournamentStates}
      onSelectTable={chooseTable}
      onShowAllLive={chooseAllLiveTables}
      onChangeTournament={backToTournamentPicker}
      onChangeRoom={backToRoomPicker}
      onExit={exitLiveView}
    />
  );
}

/* ================================================================
   AUDIENCE MATCH ROOM PICKER
   ================================================================ */

function AudienceRoomPicker({
  rooms,
  onSelect,
  onExit,
}: {
  rooms: MatchRoom[];
  onSelect: (roomId: string) => void;
  onExit: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#050908] text-white flex flex-col">
      <header className="flex-shrink-0 border-b border-white/10 bg-[#0a130e]/95">
        <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-7 lg:px-10 py-5 sm:py-6">
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-emerald-400/65">
            the Sportal OS
          </p>

          <div className="mt-1 flex items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl leading-none">
                Select Match Room
              </h1>

              <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/25">
                Choose the venue or event workspace you want to watch
              </p>
            </div>

            <div className="rounded-full border border-emerald-400/15 bg-emerald-400/[0.035] px-3 py-2 flex items-center gap-2">
              <Monitor size={13} className="text-emerald-400" />
              <span className="font-mono text-[8px] uppercase tracking-wider text-emerald-400/70">
                Audience
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-[1400px] px-4 sm:px-7 lg:px-10 py-6 sm:py-8">
        {rooms.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.018] px-6 py-12 text-center">
            <Monitor size={28} className="mx-auto text-white/20" />
            <h2 className="mt-4 font-display text-xl">
              No Match Rooms available
            </h2>
            <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-white/25">
              Create a Match Room in Nova Operator first
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => {
              const roomTournaments = loadTournaments(room.id);
              const liveCount = loadAllMatchStates(room.id).filter(
                (state) => state.status === "active"
              ).length;

              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => onSelect(room.id)}
                  className="group text-left rounded-2xl border border-white/10 bg-white/[0.018] hover:border-emerald-400/25 hover:bg-emerald-400/[0.025] transition overflow-hidden"
                >
                  <div className="px-5 py-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-emerald-400/60">
                          Match Room
                        </p>
                        <h2 className="mt-1 font-display text-xl sm:text-2xl truncate">
                          {room.name || "Unnamed Room"}
                        </h2>
                        {room.venue && (
                          <p className="mt-1 text-xs text-white/30 truncate">
                            {room.venue}
                          </p>
                        )}
                      </div>
                      <Monitor
                        size={18}
                        className="flex-shrink-0 text-emerald-400/50"
                      />
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2.5">
                        <p className="font-mono text-[7px] uppercase tracking-wider text-white/20">
                          Tournaments
                        </p>
                        <p className="mt-1 font-mono text-base font-bold">
                          {roomTournaments.length}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2.5">
                        <p className="font-mono text-[7px] uppercase tracking-wider text-white/20">
                          Live
                        </p>
                        <p className="mt-1 font-mono text-base font-bold text-red-400">
                          {liveCount}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2.5">
                        <p className="font-mono text-[7px] uppercase tracking-wider text-white/20">
                          Code
                        </p>
                        <p className="mt-1 font-mono text-sm font-bold tracking-wider truncate">
                          {room.code || "—"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span className="font-mono text-[8px] uppercase tracking-wider text-white/25">
                        Select match room
                      </span>
                      <ArrowRight
                        size={14}
                        className="text-white/25 group-hover:text-emerald-400 transition"
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      <footer className="flex-shrink-0 border-t border-white/[0.06]">
        <div className="px-4 sm:px-7 lg:px-10 py-3 flex items-center justify-between gap-4">
          <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-white/20">
            Public Audience View · Read Only
          </span>
          <button
            type="button"
            onClick={onExit}
            className="h-9 px-4 rounded-lg border border-white/10 bg-white/[0.02] font-mono text-[9px] uppercase tracking-[0.16em] text-white/35 hover:text-white transition"
          >
            Exit Live View
          </button>
        </div>
      </footer>
    </div>
  );
}

/* ================================================================
   AUDIENCE TOURNAMENT PICKER
   ============================================================== */


function AudienceTournamentPicker({
  room,
  tournaments,
  onBack,
  onSelect,
  onExit,
}: {
  room: MatchRoom;
  tournaments: Tournament[];
  onBack: () => void;
  onSelect: (tournamentId: string) => void;
  onExit: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#050908] text-white flex flex-col">
      <header className="flex-shrink-0 border-b border-white/10 bg-[#0a130e]/95">
        <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-7 lg:px-10 py-5 sm:py-6">
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-emerald-400/65">
            the Sportal OS
          </p>

          <div className="mt-1 flex items-end justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onBack}
                  className="font-mono text-[8px] uppercase tracking-wider text-white/30 hover:text-white transition"
                >
                  ← Change Match Room
                </button>
              </div>
              <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-emerald-400/55">
                {room.name || "Match Room"}
              </p>
              <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl leading-none">
                Select Tournament
              </h1>

              <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/25">
                Choose the event you want to watch
              </p>
            </div>

            <div className="rounded-full border border-emerald-400/15 bg-emerald-400/[0.035] px-3 py-2 flex items-center gap-2">
              <Monitor
                size={13}
                className="text-emerald-400"
              />
              <span className="font-mono text-[8px] uppercase tracking-wider text-emerald-400/70">
                Audience
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-[1400px] px-4 sm:px-7 lg:px-10 py-6 sm:py-8">
        {tournaments.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.018] px-6 py-12 text-center">
            <Trophy
              size={28}
              className="mx-auto text-white/20"
            />

            <h2 className="mt-4 font-display text-xl">
              No tournaments available
            </h2>

            <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-white/25">
              Create a tournament in Match Rooms first
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tournaments.map((tournament) => {
              const liveCount = loadAllMatchStates(room.id).filter(
                (state) =>
                  state.status === "active" &&
                  state.config.tournamentId ===
                    tournament.id
              ).length;

              return (
                <button
                  key={tournament.id}
                  type="button"
                  onClick={() =>
                    onSelect(tournament.id)
                  }
                  className="group text-left rounded-2xl border border-white/10 bg-white/[0.018] hover:border-emerald-400/25 hover:bg-emerald-400/[0.025] transition overflow-hidden"
                >
                  <div className="px-5 py-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-emerald-400/60">
                          Tournament
                        </p>

                        <h2 className="mt-1 font-display text-xl sm:text-2xl truncate">
                          {tournament.title ||
                            "Untitled Tournament"}
                        </h2>
                      </div>

                      <Trophy
                        size={18}
                        className="flex-shrink-0 text-amber-400/65"
                      />
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2.5">
                        <p className="font-mono text-[7px] uppercase tracking-wider text-white/20">
                          Tables
                        </p>

                        <p className="mt-1 font-mono text-base font-bold">
                          {(tournament.tables ?? []).length}
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2.5">
                        <p className="font-mono text-[7px] uppercase tracking-wider text-white/20">
                          Live
                        </p>

                        <p className="mt-1 font-mono text-base font-bold text-red-400">
                          {liveCount}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span className="font-mono text-[8px] uppercase tracking-wider text-white/25">
                        Select tournament
                      </span>

                      <ArrowRight
                        size={14}
                        className="text-white/25 group-hover:text-emerald-400 transition"
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      <footer className="flex-shrink-0 border-t border-white/[0.06]">
        <div className="px-4 sm:px-7 lg:px-10 py-3 flex items-center justify-between gap-4">
          <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-white/20">
            Public Audience View · Read Only
          </span>

          <button
            type="button"
            onClick={onExit}
            className="h-9 px-4 rounded-lg border border-white/10 bg-white/[0.02] font-mono text-[9px] uppercase tracking-[0.16em] text-white/35 hover:text-white transition"
          >
            Exit Live View
          </button>
        </div>
      </footer>
    </div>
  );
}

/* ================================================================
   AUDIENCE TABLE PICKER
   ============================================================== */

function AudienceTablePicker({
  room,
  tournament,
  states,
  onSelectTable,
  onShowAllLive,
  onChangeTournament,
  onChangeRoom,
  onExit,
}: {
  room: MatchRoom;
  tournament: Tournament;
  states: LiveMatchState[];
  onSelectTable: (tableId: string) => void;
  onShowAllLive: () => void;
  onChangeTournament: () => void;
  onChangeRoom: () => void;
  onExit: () => void;
}) {
  const tables = (tournament.tables ?? []).slice().sort(
    (a, b) =>
      (a.number ?? 999) -
      (b.number ?? 999)
  );

  return (
    <div className="min-h-screen bg-[#050908] text-white flex flex-col">
      <header className="flex-shrink-0 border-b border-white/10 bg-[#0a130e]/95">
        <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-7 lg:px-10 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-emerald-400/65">
                the Sportal OS
              </p>

              <button
                type="button"
                onClick={onChangeRoom}
                className="font-mono text-[8px] uppercase tracking-wider text-white/30 hover:text-white transition"
              >
                ← {room.name || "Change Match Room"}
              </button>

              <h1 className="mt-1 font-display text-3xl sm:text-4xl lg:text-5xl leading-none truncate">
                {tournament.title ||
                  "Tournament"}
              </h1>

              <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/25">
                Select Match Table
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onChangeTournament}
                className="h-9 px-3 rounded-lg border border-white/10 bg-white/[0.02] font-mono text-[8px] uppercase tracking-[0.14em] text-white/45 hover:text-white transition"
              >
                Change Tournament
              </button>

              {states.length > 0 && (
                <button
                  type="button"
                  onClick={onShowAllLive}
                  className="h-9 px-3 rounded-lg border border-red-400/15 bg-red-400/[0.035] font-mono text-[8px] uppercase tracking-[0.14em] text-red-400/75 hover:text-red-300 transition"
                >
                  All Live Tables
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-[1600px] px-4 sm:px-7 lg:px-10 py-6">
        {tables.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.018] px-6 py-12 text-center">
            <Monitor
              size={28}
              className="mx-auto text-white/20"
            />

            <h2 className="mt-4 font-display text-xl">
              No match tables configured
            </h2>

            <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-white/25">
              Add tables to this tournament in Match Rooms
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-white/25">
                  Match Tables
                </p>

                <p className="mt-1 font-display text-xl">
                  Choose a table to watch
                </p>
              </div>

              <div className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-2">
                <span className="font-mono text-[8px] uppercase tracking-wider text-white/35">
                  {states.length} Live
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {tables.map((table) => {
                const state =
                  states.find(
                    (item) =>
                      item.config.tableId ===
                      table.id
                  ) ?? null;

                const live = Boolean(state);

                return (
                  <button
                    key={table.id}
                    type="button"
                    disabled={!live}
                    onClick={() =>
                      live &&
                      onSelectTable(table.id)
                    }
                    className={`group text-left rounded-2xl border overflow-hidden transition ${
                      live
                        ? "border-white/10 bg-white/[0.018] hover:border-emerald-400/25 hover:bg-emerald-400/[0.025]"
                        : "border-white/[0.06] bg-white/[0.01] opacity-55 cursor-not-allowed"
                    }`}
                  >
                    <div className="px-5 py-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-emerald-400/55">
                            Table
                          </p>

                          <h2 className="mt-1 font-display text-2xl">
                            {table.name ||
                              `Table ${table.number ?? ""}`}
                          </h2>

                          {table.venueArea && (
                            <p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-white/20">
                              {table.venueArea}
                            </p>
                          )}
                        </div>

                        <span
                          className={`rounded-full px-2.5 py-1 font-mono text-[7px] uppercase tracking-wider ${
                            live
                              ? "border border-red-400/15 bg-red-400/[0.04] text-red-400"
                              : "border border-white/[0.07] bg-white/[0.02] text-white/25"
                          }`}
                        >
                          {live
                            ? "Live"
                            : "No Match"}
                        </span>
                      </div>

                      {state ? (
                        <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/10 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-display text-base truncate">
                                {state.config.matchTitle ||
                                  `${playerName(state, 0)} vs ${playerName(state, 1)}`}
                              </p>

                              <p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-white/25">
                                {state.config.eventTitle ||
                                  tournament.title}
                              </p>
                            </div>

                            <ArrowRight
                              size={15}
                              className="flex-shrink-0 text-white/25 group-hover:text-emerald-400 transition"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="mt-5 rounded-xl border border-white/[0.05] bg-black/10 px-3 py-3">
                          <p className="font-mono text-[8px] uppercase tracking-wider text-white/20">
                            Waiting for a match on this table
                          </p>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </main>

      <footer className="flex-shrink-0 border-t border-white/[0.06]">
        <div className="px-4 sm:px-7 lg:px-10 py-3 flex items-center justify-between gap-4">
          <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-white/20">
            Public Audience View · Read Only
          </span>

          <button
            type="button"
            onClick={onExit}
            className="h-9 px-4 rounded-lg border border-white/10 bg-white/[0.02] font-mono text-[9px] uppercase tracking-[0.16em] text-white/35 hover:text-white transition"
          >
            Exit Live View
          </button>
        </div>
      </footer>
    </div>
  );
}

/* ================================================================
   FINAL RESULTS VIEW
   ============================================================== */


function FinalResultsView({
  tournament,
  matches,
  onChangeTournament,
  onExit,
}: {
  tournament: Tournament;
  matches: ScheduledMatch[];
  onChangeTournament: () => void;
  onExit: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#050908] text-white flex flex-col">
      <header className="flex-shrink-0 border-b border-white/10 bg-[#0a130e]/95">
        <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-7 lg:px-10 py-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-emerald-400/65">
            the Sportal OS
          </p>

          <div className="mt-1 flex items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl leading-none">
                Final Results
              </h1>

              <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.18em] text-white/25">
                {tournament.title}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onChangeTournament}
                className="h-9 px-3 rounded-lg border border-white/10 bg-white/[0.02] font-mono text-[8px] uppercase tracking-[0.14em] text-white/45 hover:text-white transition"
              >
                Change Tournament
              </button>
              <div className="rounded-full border border-amber-400/15 bg-amber-400/[0.04] px-3 py-2">
                <span className="font-mono text-[8px] uppercase tracking-wider text-amber-400">
                  Match Ended
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-[1200px] px-4 sm:px-7 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {matches.map((match) => {
            const p1 =
              resultPlayerName(
                tournament,
                match.player1Id
              );

            const p2 =
              resultPlayerName(
                tournament,
                match.player2Id
              );

            const score =
              completedMatchScore(
                tournament,
                match
              );

            const winner =
              match.result?.winner;

            return (
              <div
                key={match.id}
                className="rounded-2xl border border-white/10 bg-white/[0.018] overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                  <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-amber-400/60">
                    Round {match.round}
                  </span>

                  <Trophy
                    size={14}
                    className="text-amber-400/70"
                  />
                </div>

                <div className="px-5 py-5">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <div className="min-w-0 text-center">
                      <p className="font-display text-base sm:text-lg truncate">
                        {p1}
                      </p>

                      <p
                        className={`mt-1 font-mono text-3xl font-black ${
                          winner === "player1"
                            ? "text-emerald-400"
                            : "text-white"
                        }`}
                      >
                        {score[0]}
                      </p>
                    </div>

                    <span className="font-mono text-[9px] uppercase tracking-wider text-white/20">
                      vs
                    </span>

                    <div className="min-w-0 text-center">
                      <p className="font-display text-base sm:text-lg truncate">
                        {p2}
                      </p>

                      <p
                        className={`mt-1 font-mono text-3xl font-black ${
                          winner === "player2"
                            ? "text-emerald-400"
                            : "text-white"
                        }`}
                      >
                        {score[1]}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.025] px-3 py-2 text-center">
                    <span className="font-mono text-[7px] uppercase tracking-[0.16em] text-white/25">
                      Winner
                    </span>

                    <p className="mt-1 font-display text-sm font-bold text-emerald-400">
                      {winner === "player1"
                        ? p1
                        : winner === "player2"
                        ? p2
                        : "Draw"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <footer className="flex-shrink-0 border-t border-white/[0.06]">
        <div className="px-4 sm:px-7 lg:px-10 py-3 flex items-center justify-between gap-4">
          <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-white/20">
            Public Audience View · Read Only
          </span>

          <button
            type="button"
            onClick={onExit}
            className="h-9 px-4 rounded-lg border border-white/10 bg-white/[0.02] font-mono text-[9px] uppercase tracking-[0.16em] text-white/35 hover:text-white transition"
          >
            Exit Live View
          </button>
        </div>
      </footer>
    </div>
  );
}

/* ================================================================
   MULTI TABLE VIEW
   ============================================================== */

function MultiTableView({
  states,
  tournament,
  onSelectTable,
  onChangeTournament,
  onExit,
}: {
  states: LiveMatchState[];
  tournament: Tournament | null;
  onSelectTable: (tableId: string) => void;
  onChangeTournament: () => void;
  onExit: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#050908] text-white flex flex-col">
      {/* HEADER */}
      <header className="flex-shrink-0 border-b border-white/10 bg-[#0a130e]/95">
        <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-7 lg:px-10 py-4 sm:py-5 flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-emerald-400/65">
              the Sportal OS
            </p>

            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl leading-none mt-1">
              Live Tables
            </h1>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-red-400/15 bg-red-400/[0.04] px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-red-400">
              {states.length} Live
            </span>
          </div>
        </div>
      </header>

      {/* TABLE GRID */}
      <main className="flex-1 mx-auto w-full max-w-[1600px] px-4 sm:px-7 lg:px-10 py-5 sm:py-7">
        <div
          className="
            grid
            grid-cols-1
            md:grid-cols-2
            gap-4
            sm:gap-5
          "
        >
          {states.map((state) => (
            <MiniScoreboard
              key={state.config.tableId}
              state={state}
              tournament={tournament}
              onClick={() =>
                onSelectTable(
                  state.config.tableId
                )
              }
            />
          ))}
        </div>
      </main>

      {/* ==========================================================
          TOURNAMENT LIVE INFORMATION
          ========================================================== */}

      {tournament && (
        <section className="flex-shrink-0 border-t border-white/[0.06] bg-[#070d0a]">
          <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-7 lg:px-10 py-5 sm:py-6">
            <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-4">

              <AudienceStandings tournament={tournament} />

              <AudienceResults tournament={tournament} />

            </div>
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer className="flex-shrink-0 border-t border-white/[0.06]">
        <div className="px-4 sm:px-7 lg:px-10 py-3 flex items-center justify-between gap-4">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/20">
            Public Audience View · Read Only
          </span>

          <button
            type="button"
            onClick={onExit}
            className="
              h-9
              px-4
              rounded-lg
              border
              border-white/10
              bg-white/[0.02]
              font-mono
              text-[9px]
              uppercase
              tracking-[0.16em]
              text-white/35
              hover:text-white
              hover:border-red-400/30
              hover:bg-red-400/[0.04]
              transition
            "
          >
            Exit Live View
          </button>
        </div>
      </footer>
    </div>
  );
}

/* ================================================================
   TOURNAMENT STANDINGS
   ============================================================== */

function AudienceStandings({
  tournament,
}: {
  tournament: Tournament;
}) {
  const [expanded, setExpanded] = useState(false);

  const standings = tournament.standings ?? [];
  const visibleStandings = expanded
    ? standings
    : standings.slice(0, 3);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.018]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full text-left px-4 sm:px-5 py-3.5 flex items-center gap-3 hover:bg-white/[0.02] transition"
      >
        <div className="w-8 h-8 rounded-lg bg-amber-400/10 flex items-center justify-center flex-shrink-0">
          <BarChart3
            size={15}
            className="text-amber-400"
          />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg sm:text-xl">
            Tournament Standings
          </h2>

          <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-white/25 mt-0.5">
            {tournament.title || "Tournament"} · {standings.length} players
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-mono text-[8px] uppercase tracking-wider text-white/20 hidden sm:block">
            {expanded ? "Collapse" : "Expand"}
          </span>

          {expanded ? (
            <ChevronUp
              size={16}
              className="text-white/35"
            />
          ) : (
            <ChevronDown
              size={16}
              className="text-white/35"
            />
          )}
        </div>
      </button>

      <div className="border-t border-white/[0.06]">
        {standings.length === 0 ? (
          <div className="px-5 py-7 text-center">
            <p className="font-mono text-[9px] uppercase tracking-wider text-white/25">
              No standings yet
            </p>
          </div>
        ) : (
          <>
            <div className="px-3 sm:px-4 py-1">
              <div className="grid grid-cols-[24px_minmax(0,1fr)_repeat(4,30px)_38px] items-center gap-1.5 border-b border-white/[0.06] py-2">
                <span className="font-mono text-[7px] uppercase tracking-wider text-white/20 text-center">
                  #
                </span>
                <span className="font-mono text-[7px] uppercase tracking-wider text-white/20">
                  Player
                </span>
                <span className="font-mono text-[7px] uppercase tracking-wider text-white/20 text-center">
                  P
                </span>
                <span className="font-mono text-[7px] uppercase tracking-wider text-white/20 text-center">
                  W
                </span>
                <span className="font-mono text-[7px] uppercase tracking-wider text-white/20 text-center">
                  D
                </span>
                <span className="font-mono text-[7px] uppercase tracking-wider text-white/20 text-center">
                  L
                </span>
                <span className="font-mono text-[7px] uppercase tracking-wider text-white/20 text-center">
                  Pts
                </span>
              </div>

              {visibleStandings.map((standing, index) => {
                const player =
                  tournament.players.find(
                    (item) =>
                      item.id ===
                      standing.playerId
                  );

                return (
                  <div
                    key={standing.playerId}
                    className="grid grid-cols-[24px_minmax(0,1fr)_repeat(4,30px)_38px] items-center gap-1.5 min-h-[43px] border-b border-white/[0.05] last:border-0"
                  >
                    <span className="font-mono text-[9px] font-bold text-white/25 text-center">
                      {index + 1}
                    </span>

                    <div className="flex items-center gap-2 min-w-0">
                      {player?.photo ? (
                        <img
                          src={player.photo}
                          alt=""
                          className="w-6 h-6 rounded-full object-cover flex-shrink-0 border border-white/10"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center flex-shrink-0">
                          <span className="font-display text-[10px] text-white/35">
                            {(
                              player?.name ??
                              "?"
                            )
                              .slice(0, 1)
                              .toUpperCase()}
                          </span>
                        </div>
                      )}

                      <span className="font-display text-xs truncate">
                        {player?.name ??
                          "Unknown"}
                      </span>
                    </div>

                    <span className="font-mono text-[9px] text-white/50 text-center">
                      {standing.played}
                    </span>

                    <span className="font-mono text-[9px] text-emerald-400 text-center">
                      {standing.won}
                    </span>

                    <span className="font-mono text-[9px] text-white/45 text-center">
                      {standing.drawn}
                    </span>

                    <span className="font-mono text-[9px] text-red-400/70 text-center">
                      {standing.lost}
                    </span>

                    <span className="font-mono text-[11px] font-bold text-amber-400 text-center">
                      {standing.points}
                    </span>
                  </div>
                );
              })}
            </div>

            {standings.length > 3 && (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="w-full h-9 border-t border-white/[0.06] flex items-center justify-center gap-2 font-mono text-[8px] uppercase tracking-[0.16em] text-white/30 hover:text-amber-400 hover:bg-amber-400/[0.02] transition"
              >
                {expanded
                  ? "Show Top 3"
                  : `View All ${standings.length} Players`}
                {expanded ? (
                  <ChevronUp size={12} />
                ) : (
                  <ChevronDown size={12} />
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   QUICK RESULT OVERVIEW
   ============================================================== */

function AudienceResults({
  tournament,
}: {
  tournament: Tournament;
}) {
  const [expanded, setExpanded] = useState(false);

  const allResults = (tournament.schedule ?? [])
    .filter(
      (match) =>
        match.status === "complete" &&
        Boolean(match.result)
    )
    .slice()
    .reverse();

  const visibleResults = expanded
    ? allResults
    : allResults.slice(0, 3);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.018]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full text-left px-4 sm:px-5 py-3.5 flex items-center gap-3 hover:bg-white/[0.02] transition"
      >
        <div className="w-8 h-8 rounded-lg bg-emerald-400/10 flex items-center justify-center flex-shrink-0">
          <Trophy
            size={15}
            className="text-emerald-400"
          />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg sm:text-xl">
            Quick Results
          </h2>

          <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-white/25 mt-0.5">
            {allResults.length} completed {allResults.length === 1 ? "match" : "matches"}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-mono text-[8px] uppercase tracking-wider text-white/20 hidden sm:block">
            {expanded ? "Collapse" : "Expand"}
          </span>

          {expanded ? (
            <ChevronUp
              size={16}
              className="text-white/35"
            />
          ) : (
            <ChevronDown
              size={16}
              className="text-white/35"
            />
          )}
        </div>
      </button>

      <div className="border-t border-white/[0.06]">
        {allResults.length === 0 ? (
          <div className="px-5 py-7 text-center">
            <p className="font-mono text-[9px] uppercase tracking-wider text-white/25">
              No completed matches yet
            </p>
          </div>
        ) : (
          <>
            <div>
              {visibleResults.map((match) => (
                <AudienceResultRow
                  key={match.id}
                  tournament={tournament}
                  match={match}
                />
              ))}
            </div>

            {allResults.length > 3 && (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="w-full h-9 border-t border-white/[0.06] flex items-center justify-center gap-2 font-mono text-[8px] uppercase tracking-[0.16em] text-white/30 hover:text-emerald-400 hover:bg-emerald-400/[0.02] transition"
              >
                {expanded
                  ? "Show Latest 3"
                  : `View All ${allResults.length} Results`}
                {expanded ? (
                  <ChevronUp size={12} />
                ) : (
                  <ChevronDown size={12} />
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AudienceResultRow({
  tournament,
  match,
}: {
  tournament: Tournament;
  match: ScheduledMatch;
}) {
  const p1 =
    tournament.players.find(
      (player) =>
        player.id === match.player1Id
    )?.name ??
    "Unknown";

  const p2 =
    tournament.players.find(
      (player) =>
        player.id === match.player2Id
    )?.name ??
    "Unknown";

  const score =
    completedMatchScore(
      tournament,
      match
    );

  const winner =
    match.result?.winner;

  return (
    <div className="px-4 sm:px-5 py-3.5 border-b border-white/[0.05] last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm truncate">
            {p1}
          </p>

          <p className="font-display text-sm truncate mt-0.5 text-white/55">
            {p2}
          </p>
        </div>

        <div className="text-center flex-shrink-0">
          <p className="font-mono text-sm font-bold">
            {score[0]} – {score[1]}
          </p>

          <p className="font-mono text-[7px] uppercase tracking-[0.14em] text-white/20 mt-1">
            Round {match.round}
          </p>
        </div>

        <div className="w-[82px] text-right flex-shrink-0">
          <p className="font-mono text-[7px] uppercase tracking-[0.14em] text-white/20">
            Winner
          </p>

          <p className="font-display text-xs text-emerald-400 truncate mt-1">
            {winner === "player1"
              ? p1
              : winner === "player2"
              ? p2
              : "Draw"}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   MINI SCOREBOARD
   ============================================================== */

function MiniScoreboard({
  state,
  tournament,
  onClick,
}: {
  state: LiveMatchState;
  tournament: Tournament | null;
  onClick: () => void;
}) {
  const {
    config,
    matchPts,
    framePts,
    bScores,
    striker,
    bStriker,
    brk,
    bVisit,
    shotTimeLeft,
    shotActive,
    currentSeqIdx,
  } = state;

  const frameDef = getFrameDef(state);
  const isBilliards =
    frameDef.type === "billiards";

  const frameScores = isBilliards
    ? bScores
    : framePts;

  const currentStriker = isBilliards
    ? bStriker
    : striker;

  const needed = Math.ceil(
    config.bestOf / 2
  );

  const p1 = playerName(state, 0);
  const p2 = playerName(state, 1);

  const previousMatch =
    previousCompletedMatch(
      tournament,
      state
    );

  const previousScore = previousMatch
    ? completedMatchScore(
        tournament!,
        previousMatch
      )
    : [0, 0] as [number, number];

  return (
    <button
      type="button"
      onClick={onClick}
      className="
        group
        w-full
        text-left
        overflow-hidden
        rounded-2xl
        border
        border-white/10
        bg-white/[0.018]
        hover:border-emerald-400/35
        hover:bg-emerald-400/[0.025]
        transition-all
        active:scale-[0.995]
        focus:outline-none
        focus:ring-2
        focus:ring-emerald-400/30
      "
    >
      {/* TABLE HEADER */}
      <div className="px-4 sm:px-5 py-3 border-b border-white/[0.06] flex items-center gap-3">
        {config.clubLogo ? (
          <img
            src={config.clubLogo}
            alt=""
            className="w-7 h-7 object-contain"
          />
        ) : (
          <div className="w-7 h-7 rounded-lg bg-emerald-400/10 flex items-center justify-center">
            <Monitor
              size={14}
              className="text-emerald-400"
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-display text-lg sm:text-xl truncate">
            {config.tableName || "Table"}
          </p>

          <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-white/25 truncate">
            {config.eventTitle || "Live Event"}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="font-mono text-[8px] uppercase tracking-wider text-red-400">
            Live
          </span>
        </div>
      </div>

      {/* MATCH TITLE */}
      <div className="px-4 sm:px-5 pt-3">
        <p className="font-mono text-[9px] uppercase tracking-wider text-white/20 truncate">
          {config.matchTitle ||
            `${p1} vs ${p2}`}
        </p>
      </div>

      {/* SCORE */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 sm:px-7 py-5">
        <MiniPlayer
          name={p1}
          photo={playerPhoto(state, 0)}
          matchScore={matchPts[0]}
          frameScore={frameScores[0]}
          needed={needed}
          active={currentStriker === 0}
        />

        <div className="font-mono text-[10px] text-white/15">
          VS
        </div>

        <MiniPlayer
          name={p2}
          photo={playerPhoto(state, 1)}
          matchScore={matchPts[1]}
          frameScore={frameScores[1]}
          needed={needed}
          active={currentStriker === 1}
        />
      </div>

      {/* DETAILS */}
      <div className="grid grid-cols-3 border-t border-white/[0.06] divide-x divide-white/[0.06]">
        <MiniInfo
          label="Game"
          value={`${currentSeqIdx + 1}/${Math.max(1, config.customSequence?.length ?? 1)}`}
        />

        <MiniInfo
          label={isBilliards ? "Visit" : "Break"}
          value={String(
            isBilliards
              ? bVisit
              : brk
          )}
        />

        <MiniInfo
          label="Shot"
          value={
            config.shotSecs > 0
              ? `${shotTimeLeft}s`
              : "—"
          }
          active={shotActive}
        />
      </div>

      {previousMatch && (
        <div className="mx-4 sm:mx-5 mb-3 rounded-xl border border-amber-400/10 bg-amber-400/[0.025] px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[7px] uppercase tracking-[0.16em] text-amber-400/60">
                Previous Match · Final
              </p>
              <p className="mt-1 truncate font-display text-[11px] text-white/60">
                {resultPlayerName(
                  tournament!,
                  previousMatch.player1Id
                )}
                <span className="mx-1.5 text-white/20">vs</span>
                {resultPlayerName(
                  tournament!,
                  previousMatch.player2Id
                )}
              </p>
            </div>

            <div className="flex-shrink-0 text-right">
              <p className="font-mono text-sm font-black text-white">
                {previousScore[0]}
                <span className="mx-1.5 text-white/20">-</span>
                {previousScore[1]}
              </p>
              <p className="mt-0.5 font-mono text-[7px] uppercase tracking-wider text-emerald-400/70">
                {previousMatch.result?.winner === "player1"
                  ? resultPlayerName(tournament!, previousMatch.player1Id)
                  : previousMatch.result?.winner === "player2"
                  ? resultPlayerName(tournament!, previousMatch.player2Id)
                  : "Draw"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ACTION */}
      <div className="px-4 sm:px-5 py-3 flex items-center justify-between">
        <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-white/20">
          Tap for detailed view
        </span>

        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-emerald-400/65">
          Open
          <ArrowRight size={12} />
        </span>
      </div>
    </button>
  );
}

function MiniPlayer({
  name,
  photo,
  matchScore,
  frameScore,
  needed,
  active,
}: {
  name: string;
  photo: string | null;
  matchScore: number;
  frameScore: number;
  needed: number;
  active: boolean;
}) {
  return (
    <div className="text-center min-w-0">
      <div className="flex items-center justify-center gap-1.5">
        {active && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
        )}

        {photo ? (
          <img
            src={photo}
            alt=""
            className="w-8 h-8 rounded-full object-cover border border-white/10 flex-shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-emerald-400/10 border border-white/10 flex items-center justify-center flex-shrink-0">
            <span className="font-display text-sm text-emerald-400">
              {name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}

        <span className="font-display text-base sm:text-lg truncate">
          {name}
        </span>
      </div>

      <div className="font-mono text-4xl sm:text-5xl leading-none mt-2">
        {matchScore}
      </div>

      <div className="flex justify-center gap-1 mt-2">
        {Array.from({ length: needed }).map(
          (_, index) => (
            <span
              key={index}
              className={`
                w-1.5
                h-1.5
                rounded-full
                border
                ${
                  index < matchScore
                    ? "bg-emerald-400 border-emerald-400"
                    : "border-white/15"
                }
              `}
            />
          )
        )}
      </div>

      <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-white/20 mt-2">
        Frame {frameScore}
      </p>
    </div>
  );
}

function MiniInfo({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <div className="px-2 py-2.5 text-center">
      <p className="font-mono text-[7px] uppercase tracking-wider text-white/20">
        {label}
      </p>

      <p
        className={`
          font-mono
          text-[10px]
          mt-1
          ${
            active
              ? "text-emerald-400"
              : "text-white/55"
          }
        `}
      >
        {value}
      </p>
    </div>
  );
}

/* ================================================================
   DETAILED VIEW
   ============================================================== */

function SingleTableView({
  state,
  tournament,
  onBack,
  onChangeTournament,
  onExit,
}: {
  state: LiveMatchState;
  tournament: Tournament | null;
  onBack: () => void;
  onChangeTournament: () => void;
  onExit: () => void;
}) {
  const {
    config,
    matchPts,
    framePts,
    bScores,
    striker,
    bStriker,
    brk,
    bVisit,
    reds,
    colorsIdx,
    nextColor,
    matchElapsed,
    frameElapsed,
    shotTimeLeft,
    shotActive,
    currentSeqIdx,
  } = state;

  const frameDef = getFrameDef(state);
  const isBilliards =
    frameDef.type === "billiards";

  const currentScores = isBilliards
    ? bScores
    : framePts;

  const currentStriker = isBilliards
    ? bStriker
    : striker;

  const needed = Math.ceil(
    config.bestOf / 2
  );

  const p1 = playerName(state, 0);
  const p2 = playerName(state, 1);

  const previousMatch =
    previousCompletedMatch(
      tournament,
      state
    );

  const previousScore = previousMatch
    ? completedMatchScore(
        tournament!,
        previousMatch
      )
    : [0, 0] as [number, number];

  const phaseLabel =
    colorsIdx !== null
      ? `Colours · ${
          [
            "Yellow",
            "Green",
            "Brown",
            "Blue",
            "Pink",
            "Black",
          ][colorsIdx] ?? "Colour"
        }`
      : nextColor
      ? "Colour"
      : reds > 0
      ? `Reds · ${reds} remaining`
      : "Colours";

  return (
    <div className="min-h-screen bg-[#050908] text-white flex flex-col">
      {/* HEADER */}
      <header className="flex-shrink-0 border-b border-white/10 bg-[#0a130e]/95">
        <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-7 lg:px-10 py-3 sm:py-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl border border-white/10 bg-white/[0.025] flex items-center justify-center text-white/55 hover:text-white hover:border-emerald-400/30 transition flex-shrink-0"
            title="Back to all live tables"
          >
            <ArrowLeft size={19} />
          </button>
          <button
            type="button"
            onClick={onChangeTournament}
            className="h-10 sm:h-11 px-3 rounded-xl border border-white/10 bg-white/[0.025] font-mono text-[8px] uppercase tracking-[0.14em] text-white/50 hover:text-white hover:border-emerald-400/30 transition flex-shrink-0 whitespace-nowrap"
          >
            Change Tournament
          </button>

          {config.clubLogo ? (
            <img
              src={config.clubLogo}
              alt=""
              className="w-10 h-10 sm:w-12 sm:h-12 object-contain flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center flex-shrink-0">
              <Radio
                size={18}
                className="text-emerald-400"
              />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-emerald-400/70">
              Live Event
            </p>

            <h1 className="font-display text-xl sm:text-2xl lg:text-3xl truncate leading-tight">
              {config.eventTitle ||
                "Live Event"}
            </h1>

            <p className="font-mono text-[9px] sm:text-[10px] text-white/30 uppercase tracking-wider truncate">
              {config.matchTitle ||
                `${p1} vs ${p2}`}
            </p>
          </div>

          <div className="flex flex-col items-end flex-shrink-0">
            <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-red-400">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              LIVE
            </div>

            <span className="font-mono text-[9px] text-white/30 mt-1">
              {config.tableName || "Table"}
            </span>
          </div>
        </div>
      </header>

      {/* META */}
      <div className="border-b border-white/[0.06]">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-8 py-3 flex items-center justify-center flex-wrap gap-x-5 gap-y-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/25">
            Best of {config.bestOf}
          </span>

          <span className="text-white/10">·</span>

          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-400/70">
            Game {currentSeqIdx + 1}
            {config.customSequence?.length
              ? ` / ${config.customSequence.length}`
              : ""}
          </span>

          <span className="text-white/10">·</span>

          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/30">
            {isBilliards
              ? "Billiards"
              : `Snooker · ${frameDef.reds ?? 15} Reds`}
          </span>

          <span className="text-white/10">·</span>

          <span className="flex items-center gap-1.5 font-mono text-[9px] text-white/25">
            <Clock size={10} />
            {fmtTime(matchElapsed)}
          </span>
        </div>
      </div>

      {previousMatch && (
        <div className="flex-shrink-0 border-b border-amber-400/10 bg-amber-400/[0.025]">
          <div className="mx-auto max-w-[1400px] px-4 sm:px-7 py-2.5 flex items-center justify-center gap-3 sm:gap-5">
            <span className="font-mono text-[7px] uppercase tracking-[0.18em] text-amber-400/60">
              Previous Match · Final
            </span>

            <span className="font-display text-xs sm:text-sm text-white/60 truncate max-w-[30vw]">
              {resultPlayerName(
                tournament!,
                previousMatch.player1Id
              )}
            </span>

            <span className="font-mono text-sm font-black text-white">
              {previousScore[0]}
              <span className="mx-1.5 text-white/20">
                -
              </span>
              {previousScore[1]}
            </span>

            <span className="font-display text-xs sm:text-sm text-white/60 truncate max-w-[30vw]">
              {resultPlayerName(
                tournament!,
                previousMatch.player2Id
              )}
            </span>

            <span className="hidden sm:inline font-mono text-[7px] uppercase tracking-wider text-emerald-400/70">
              {previousMatch.result?.winner ===
              "player1"
                ? resultPlayerName(
                    tournament!,
                    previousMatch.player1Id
                  )
                : previousMatch.result?.winner ===
                  "player2"
                ? resultPlayerName(
                    tournament!,
                    previousMatch.player2Id
                  )
                : "Draw"}
            </span>
          </div>
        </div>
      )}

      {/* MAIN */}
      <main className="flex-1 w-full max-w-[1500px] mx-auto px-4 sm:px-7 lg:px-10 py-5 sm:py-7 flex flex-col justify-center">
        {/* PLAYERS */}
        <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:gap-10">
          <DetailedPlayer
            name={p1}
            photo={playerPhoto(state, 0)}
            matchScore={matchPts[0]}
            frameScore={currentScores[0]}
            needed={needed}
            active={currentStriker === 0}
          />

          <DetailedPlayer
            name={p2}
            photo={playerPhoto(state, 1)}
            matchScore={matchPts[1]}
            frameScore={currentScores[1]}
            needed={needed}
            active={currentStriker === 1}
          />
        </div>

        {/* MATCH SCORE */}
        <div className="flex items-center justify-center gap-5 sm:gap-10 mt-5">
          <div className="text-center">
            <p className="font-mono text-[8px] uppercase tracking-widest text-white/20">
              Match
            </p>
            <p className="font-mono text-4xl sm:text-5xl lg:text-6xl leading-none mt-1">
              {matchPts[0]}
            </p>
          </div>

          <span className="font-mono text-2xl text-white/10 mt-4">
            –
          </span>

          <div className="text-center">
            <p className="font-mono text-[8px] uppercase tracking-widest text-white/20">
              Match
            </p>
            <p className="font-mono text-4xl sm:text-5xl lg:text-6xl leading-none mt-1">
              {matchPts[1]}
            </p>
          </div>
        </div>

        {/* CURRENT FRAME */}
        <div className="mt-5 sm:mt-7 mx-auto w-full max-w-4xl rounded-2xl border border-white/10 overflow-hidden bg-white/[0.015]">
          <div className="px-4 sm:px-6 py-3 border-b border-white/[0.06] flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-white/20">
                Current Frame
              </p>

              <p className="font-mono text-xs sm:text-sm text-emerald-400/80 mt-1">
                {isBilliards
                  ? "English Billiards"
                  : phaseLabel}
              </p>
            </div>

            <div className="flex items-center gap-1.5 font-mono text-[9px] text-white/25">
              <Timer size={11} />
              {fmtTime(frameElapsed)}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center px-5 sm:px-10 py-5 sm:py-7">
            <div className="text-center min-w-0">
              <p className="font-mono text-[8px] uppercase tracking-widest text-white/20 truncate">
                {p1}
              </p>

              <p className="font-mono text-4xl sm:text-5xl lg:text-6xl mt-1">
                {currentScores[0]}
              </p>
            </div>

            <span className="px-5 sm:px-10 font-mono text-white/10">
              –
            </span>

            <div className="text-center min-w-0">
              <p className="font-mono text-[8px] uppercase tracking-widest text-white/20 truncate">
                {p2}
              </p>

              <p className="font-mono text-4xl sm:text-5xl lg:text-6xl mt-1">
                {currentScores[1]}
              </p>
            </div>
          </div>
        </div>

        {/* LIVE DETAILS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mt-3 mx-auto w-full max-w-4xl">
          <DetailInfo
            label="At The Table"
            value={playerName(
              state,
              currentStriker
            )}
            active
          />

          <DetailInfo
            label={
              isBilliards
                ? "Current Visit"
                : "Current Break"
            }
            value={String(
              isBilliards
                ? bVisit
                : brk
            )}
            suffix="PTS"
          />

          {config.shotSecs > 0 ? (
            <ShotClock
              time={shotTimeLeft}
              total={config.shotSecs}
              active={shotActive}
            />
          ) : (
            <DetailInfo
              label="Frame Time"
              value={fmtTime(
                frameElapsed
              )}
            />
          )}
        </div>
      </main>

      {/* FOOTER */}
      <footer className="flex-shrink-0 border-t border-white/[0.06]">
        <div className="px-4 sm:px-8 py-3 flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={onBack}
            className="h-9 px-3 rounded-lg flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35 hover:text-emerald-400 hover:bg-emerald-400/[0.03] transition"
          >
            <ArrowLeft size={13} />
            All Live Tables
          </button>

          <div className="flex items-center gap-4">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/15">
              Nova Audience · Read Only
            </span>

            <button
              type="button"
              onClick={onExit}
              className="h-9 px-4 rounded-lg border border-white/10 bg-white/[0.02] font-mono text-[9px] uppercase tracking-[0.16em] text-white/35 hover:text-white hover:border-red-400/30 hover:bg-red-400/[0.04] transition"
            >
              Exit Live View
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ================================================================
   DETAILED PLAYER
   ============================================================== */

function DetailedPlayer({
  name,
  photo,
  matchScore,
  frameScore,
  needed,
  active,
}: {
  name: string;
  photo: string | null;
  matchScore: number;
  frameScore: number;
  needed: number;
  active: boolean;
}) {
  return (
    <div
      className={`
        relative
        rounded-2xl
        border
        px-3
        sm:px-6
        py-5
        sm:py-6
        text-center
        ${
          active
            ? "border-emerald-400/30 bg-emerald-400/[0.025]"
            : "border-white/[0.07] bg-white/[0.01]"
        }
      `}
    >
      {active && (
        <div className="flex items-center justify-center gap-1.5 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-emerald-400/70">
            At Table
          </span>
        </div>
      )}

      {photo ? (
        <img
          src={photo}
          alt=""
          className="mx-auto w-14 h-14 sm:w-18 sm:h-18 lg:w-20 lg:h-20 rounded-full object-cover border border-white/10"
        />
      ) : (
        <div className="mx-auto w-14 h-14 sm:w-18 sm:h-18 lg:w-20 lg:h-20 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center">
          <span className="font-display text-2xl sm:text-3xl text-white/35">
            {name.slice(0, 1).toUpperCase()}
          </span>
        </div>
      )}

      <h2 className="font-display text-xl sm:text-2xl lg:text-3xl truncate mt-3">
        {name}
      </h2>

      <div className="flex justify-center gap-1.5 mt-3">
        {Array.from({ length: needed }).map(
          (_, index) => (
            <span
              key={index}
              className={`
                w-2
                h-2
                rounded-full
                border
                ${
                  index < matchScore
                    ? "bg-emerald-400 border-emerald-400"
                    : "border-white/15"
                }
              `}
            />
          )
        )}
      </div>

      <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-white/20 mt-3">
        Frame Score
      </p>

      <p className="font-mono text-4xl sm:text-5xl lg:text-6xl leading-none mt-1">
        {frameScore}
      </p>
    </div>
  );
}

/* ================================================================
   DETAIL INFO
   ============================================================== */

function DetailInfo({
  label,
  value,
  suffix,
  active,
}: {
  label: string;
  value: string;
  suffix?: string;
  active?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-white/20">
          {label}
        </p>

        <p
          className={`
            font-display
            text-base
            sm:text-lg
            truncate
            mt-1
            ${
              active
                ? "text-emerald-400"
                : "text-white/70"
            }
          `}
        >
          {value}
        </p>
      </div>

      {suffix && (
        <span className="font-mono text-[8px] uppercase tracking-wider text-white/20">
          {suffix}
        </span>
      )}
    </div>
  );
}

/* ================================================================
   SHOT CLOCK
   ============================================================== */

function ShotClock({
  time,
  total,
  active,
}: {
  time: number;
  total: number;
  active: boolean;
}) {
  const safeTotal = Math.max(1, total);
  const safeTime = Math.max(
    0,
    Math.min(safeTotal, time)
  );

  const ratio =
    safeTime / safeTotal;

  const expired =
    safeTime <= 0;

  const warning =
    !expired &&
    safeTime <=
      Math.ceil(
        safeTotal * 0.3
      );

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] px-4 py-3 flex items-center gap-3">
      <div className="relative w-11 h-11 flex-shrink-0">
        <svg
          viewBox="0 0 48 48"
          className="w-full h-full -rotate-90"
        >
          <circle
            cx="24"
            cy="24"
            r="19"
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="4"
          />

          <circle
            cx="24"
            cy="24"
            r="19"
            fill="none"
            stroke={
              expired
                ? "#b84040"
                : warning
                ? "#c99435"
                : "#3a8a5c"
            }
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={
              2 * Math.PI * 19
            }
            strokeDashoffset={
              2 *
              Math.PI *
              19 *
              (1 - ratio)
            }
          />
        </svg>

        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`
              font-mono
              text-sm
              font-bold
              ${
                expired
                  ? "text-red-400"
                  : warning
                  ? "text-amber-400"
                  : "text-white"
              }
            `}
          >
            {safeTime}
          </span>
        </div>
      </div>

      <div>
        <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-white/20">
          Shot Clock
        </p>

        <p
          className={`
            font-mono
            text-[10px]
            mt-1
            ${
              expired
                ? "text-red-400"
                : active
                ? "text-white/50"
                : "text-white/25"
            }
          `}
        >
          {expired
            ? "Time expired"
            : active
            ? "Running"
            : "Paused"}
        </p>
      </div>
    </div>
  );
}

/* ================================================================
   EMPTY
   ============================================================== */

function EmptyState({
  onExit,
}: {
  onExit: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#050908] text-white flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="mx-auto w-16 h-16 rounded-2xl border border-white/10 bg-white/[0.025] flex items-center justify-center">
            <Radio
              size={25}
              className="text-emerald-400/60"
            />
          </div>

          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-emerald-400/60 mt-6">
            Nova Audience
          </p>

          <h1 className="font-display text-3xl sm:text-4xl mt-2">
            No Live Matches
          </h1>

          <p className="font-mono text-xs leading-relaxed text-white/25 mt-3">
            Live tables will appear here automatically when a match starts.
          </p>
        </div>
      </div>

      <footer className="border-t border-white/[0.06] px-4 sm:px-8 py-3 flex justify-end">
        <button
          type="button"
          onClick={onExit}
          className="h-9 px-4 rounded-lg border border-white/10 bg-white/[0.02] font-mono text-[9px] uppercase tracking-[0.16em] text-white/35 hover:text-white hover:border-red-400/30 hover:bg-red-400/[0.04] transition"
        >
          Exit Live View
        </button>
      </footer>
    </div>
  );
}
