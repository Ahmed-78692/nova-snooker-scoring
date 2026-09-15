import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  Copy,
  MapPin,
  Pencil,
  Plus,
  Radio,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react";

import type { AppView } from "./types";

import {
  createRoom,
  deleteRoom,
  loadActiveRoomId,
  loadRooms,
  setActiveRoom,
  updateRoom,
  type NovaRoom,
} from "./sync";

interface LandingProps {
  onNavigate: (
    view: AppView | "casual",
    context?: {
      tableId?: string;
      scheduledMatchId?: string;
    }
  ) => void;
}

function makeRoomCode(): string {
  return `ROOM-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;
}

export default function Landing({
  onNavigate,
}: LandingProps) {
  const [rooms, setRooms] = useState<NovaRoom[]>(() =>
    loadRooms()
  );

  const [
    activeRoomId,
    setActiveRoomIdState,
  ] = useState<string | null>(() =>
    loadActiveRoomId()
  );

  const [showAddRoom, setShowAddRoom] =
    useState(false);

  const [editingRoomId, setEditingRoomId] =
    useState<string | null>(null);

  const [deleteRoomId, setDeleteRoomId] =
    useState<string | null>(null);

  const [roomName, setRoomName] =
    useState("");

  const [roomVenue, setRoomVenue] =
    useState("");

  const [roomCode, setRoomCode] =
    useState("");

  const [copiedRoomId, setCopiedRoomId] =
    useState<string | null>(null);

  /* ================================================================
     REFRESH ROOMS
     ================================================================= */

  useEffect(() => {
    const refresh = () => {
      setRooms(loadRooms());
      setActiveRoomIdState(loadActiveRoomId());
    };

    refresh();

    const interval = window.setInterval(
      refresh,
      700
    );

    const onStorage = () => refresh();

    window.addEventListener(
      "storage",
      onStorage
    );

    return () => {
      window.clearInterval(interval);

      window.removeEventListener(
        "storage",
        onStorage
      );
    };
  }, []);

  /* ================================================================
     ACTIVE ROOM
     ================================================================= */

  const activeRoom = useMemo(
    () =>
      rooms.find(
        room =>
          room.id === activeRoomId
      ) ??
      rooms[0] ??
      null,
    [
      rooms,
      activeRoomId,
    ]
  );

  /* ================================================================
     ENTER ROOM
     ================================================================= */

  function enterRoom(
    room: NovaRoom
  ) {
    setActiveRoom(room.id);

    setActiveRoomIdState(
      room.id
    );

    onNavigate(
      "orgHub"
    );
  }

  /* ================================================================
     ENTER PRACTICE MODE
     
     IMPORTANT:
     Internally this remains "casual".
     Only the UI calls it Practice Mode.
     ================================================================= */

  function enterPracticeMode() {
    /*
     * Practice Mode does not require a tournament.
     *
     * We intentionally keep the existing internal
     * "casual" route so no existing architecture
     * needs to be renamed or rewritten.
     *
     * Table selection happens inside CasualSetup.
     */

    onNavigate(
      "casual",
      {
        tableId:
          "casual-table-1",
      }
    );
  }

  /* ================================================================
     ADD ROOM
     ================================================================= */

  function openAddRoom() {
    setEditingRoomId(null);

    setRoomName("");

    setRoomVenue("");

    setRoomCode(
      makeRoomCode()
    );

    setShowAddRoom(true);
  }

  /* ================================================================
     EDIT ROOM
     ================================================================= */

  function openEditRoom(
    room: NovaRoom
  ) {
    setEditingRoomId(
      room.id
    );

    setRoomName(
      room.name
    );

    setRoomVenue(
      room.venue ??
      ""
    );

    setRoomCode(
      room.code
    );

    setShowAddRoom(true);
  }

  /* ================================================================
     SAVE ROOM
     ================================================================= */

  function saveRoomForm() {
    const cleanName =
      roomName.trim();

    if (!cleanName) {
      return;
    }

    if (editingRoomId) {
      const existing =
        rooms.find(
          room =>
            room.id ===
            editingRoomId
        );

      if (!existing) {
        return;
      }

      const updated:
        NovaRoom = {
        ...existing,

        name:
          cleanName,

        venue:
          roomVenue.trim() ||
          undefined,

        code:
          roomCode.trim() ||
          existing.code,
      };

      updateRoom(updated);

      setRooms(
        loadRooms()
      );
    } else {
      const created =
        createRoom(
          cleanName,

          roomCode.trim() ||
            makeRoomCode(),

          roomVenue.trim() ||
            undefined
        );

      setRooms(
        loadRooms()
      );

      setActiveRoomIdState(
        created.id
      );
    }

    setShowAddRoom(false);

    setEditingRoomId(null);
  }

  /* ================================================================
     DELETE ROOM
     ================================================================= */

  function confirmDeleteRoom() {
    if (!deleteRoomId) {
      return;
    }

    deleteRoom(
      deleteRoomId
    );

    const nextRooms =
      loadRooms();

    setRooms(nextRooms);

    setActiveRoomIdState(
      loadActiveRoomId()
    );

    setDeleteRoomId(null);
  }

  /* ================================================================
     COPY ROOM CODE
     ================================================================= */

  async function copyCode(
    room: NovaRoom
  ) {
    try {
      await navigator.clipboard.writeText(
        room.code
      );

      setCopiedRoomId(
        room.id
      );

      window.setTimeout(
        () =>
          setCopiedRoomId(
            current =>
              current ===
              room.id
                ? null
                : current
          ),
        1500
      );
    } catch {
      // Clipboard may be unavailable.
    }
  }

  /* ================================================================
     UI
     ================================================================= */

  return (
    <div className="min-h-screen bg-[#070b12] text-white">

      {/* ==========================================================
          HEADER
          ========================================================== */}

      <header className="border-b border-white/10 bg-[#090e16]/95">

        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-5">

          <div className="flex items-center gap-3">

            <button
              type="button"
              onClick={() =>
                onNavigate("home")
              }
              className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-white/65 transition hover:bg-white/[0.08] hover:text-white"
              title="Exit Operator"
            >
              <ArrowRight
                size={16}
                className="rotate-180"
              />

              <span>
                Exit Operator
              </span>
            </button>

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-400">
              <Radio size={19} />
            </div>

            <div>
              <div className="text-lg font-black tracking-tight">
                NOVA
              </div>

              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">
                Operator
              </div>
            </div>

          </div>

          {activeRoom && (
            <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 sm:flex">

              <Building2
                size={14}
                className="text-cyan-400"
              />

              <span className="text-xs font-semibold text-white/65">
                {activeRoom.name}
              </span>

            </div>
          )}

        </div>

      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-8">

        {/* ========================================================
            INTRO
            ======================================================== */}

        <section className="mb-7">

          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">

            <div>

              <div className="mb-2 flex items-center gap-2 text-cyan-400">

                <Trophy size={15} />

                <span className="text-[10px] font-bold uppercase tracking-[0.18em]">
                  Match Operations
                </span>

              </div>

              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Match Rooms
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/40">
                Create separate rooms for venues,
                events or production setups. Each
                room can contain multiple tournaments.
              </p>

            </div>

            <div className="flex flex-col gap-2 sm:flex-row">

              {/* ==================================================
                  PRACTICE MODE
                  ================================================== */}

              <button
                type="button"
                onClick={
                  enterPracticeMode
                }
                className="
                  group
                  flex
                  shrink-0
                  items-center
                  justify-center
                  gap-2
                  rounded-xl
                  border
                  border-emerald-400/25
                  bg-emerald-400/[0.07]
                  px-5
                  py-3
                  text-sm
                  font-black
                  text-emerald-300
                  transition
                  hover:border-emerald-400/45
                  hover:bg-emerald-400/[0.12]
                  hover:text-emerald-200
                "
              >

                <span className="text-base">
                  🎱
                </span>

                Launch Practice Mode

                <ArrowRight
                  size={15}
                  className="transition group-hover:translate-x-0.5"
                />

              </button>

              {/* ==================================================
                  ADD MATCH ROOM
                  ================================================== */}

              <button
                type="button"
                onClick={
                  openAddRoom
                }
                className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-black text-black transition hover:bg-cyan-400"
              >

                <Plus size={17} />

                Add Match Room

              </button>

            </div>

          </div>

        </section>

        {/* ========================================================
            PRACTICE MODE CARD
            ======================================================== */}

        <section className="mb-6 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.025] p-4 sm:p-5">

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

            <div className="flex items-start gap-3">

              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-lg">
                🎱
              </div>

              <div>

                <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-400/70">
                  No Tournament Required
                </div>

                <h2 className="mt-1 text-sm font-black text-white/85">
                  Practice Mode
                </h2>

                <p className="mt-1 max-w-2xl text-xs leading-5 text-white/35">
                  Score a practice session, club match
                  or friendly game without creating a
                  tournament. Use the same Nova Remote,
                  Scoreboard and OBS infrastructure as
                  tournament matches.
                </p>

              </div>

            </div>

            <button
              type="button"
              onClick={
                enterPracticeMode
              }
              className="
                shrink-0
                rounded-xl
                border
                border-emerald-400/20
                bg-emerald-400/[0.06]
                px-4
                py-2.5
                text-xs
                font-black
                text-emerald-300
                transition
                hover:bg-emerald-400/[0.11]
              "
            >
              Launch Practice Mode
            </button>

          </div>

        </section>

        {/* ========================================================
            EMPTY STATE
            ======================================================== */}

        {!rooms.length && (

          <section className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">

            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-400">
              <Building2 size={21} />
            </div>

            <h2 className="mt-4 text-lg font-bold">
              Create your first Match Room
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/35">
              A room represents a venue or event
              workspace. You can add multiple
              tournaments inside it.
            </p>

            <button
              type="button"
              onClick={
                openAddRoom
              }
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-black text-black hover:bg-cyan-400"
            >
              <Plus size={16} />

              Create Match Room
            </button>

          </section>

        )}

        {/* ========================================================
            ROOMS
            ======================================================== */}

        {rooms.length > 0 && (

          <section>

            <div className="mb-3 flex items-center justify-between">

              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">
                Your Rooms ·{" "}
                {rooms.length}
              </div>

            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">

              {rooms.map(
                room => {

                  const isActive =
                    room.id ===
                    activeRoomId;

                  return (

                    <article
                      key={
                        room.id
                      }
                      className={[
                        "group rounded-2xl border p-5 transition",

                        isActive
                          ? "border-cyan-400/30 bg-cyan-400/[0.045]"
                          : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.04]",
                      ].join(
                        " "
                      )}
                    >

                      <div className="flex items-start justify-between gap-3">

                        <div className="flex min-w-0 items-start gap-3">

                          <div
                            className={[
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",

                              isActive
                                ? "bg-cyan-400/10 text-cyan-400"
                                : "bg-white/[0.05] text-white/45",
                            ].join(
                              " "
                            )}
                          >
                            <Building2
                              size={
                                18
                              }
                            />
                          </div>

                          <div className="min-w-0">

                            <div className="flex items-center gap-2">

                              <h2 className="truncate text-base font-black">
                                {
                                  room.name
                                }
                              </h2>

                              {isActive && (

                                <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-cyan-400">
                                  Active
                                </span>

                              )}

                            </div>

                            {room.venue && (

                              <div className="mt-1 flex items-center gap-1 text-xs text-white/35">

                                <MapPin
                                  size={
                                    11
                                  }
                                />

                                {
                                  room.venue
                                }

                              </div>

                            )}

                          </div>

                        </div>

                        <div className="flex shrink-0 items-center gap-1">

                          <button
                            type="button"
                            onClick={() =>
                              openEditRoom(
                                room
                              )
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 transition hover:bg-white/[0.06] hover:text-white"
                            title="Edit room"
                          >
                            <Pencil
                              size={
                                14
                              }
                            />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setDeleteRoomId(
                                room.id
                              )
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/25 transition hover:bg-red-400/10 hover:text-red-400"
                            title="Delete room"
                          >
                            <Trash2
                              size={
                                14
                              }
                            />
                          </button>

                        </div>

                      </div>

                      <div className="mt-5 flex items-center justify-between rounded-xl border border-white/8 bg-black/10 px-3 py-2.5">

                        <div>

                          <div className="text-[9px] font-bold uppercase tracking-wider text-white/25">
                            Room Code
                          </div>

                          <div className="mt-0.5 font-mono text-xs font-bold text-white/65">
                            {
                              room.code
                            }
                          </div>

                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            copyCode(
                              room
                            )
                          }
                          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-bold text-white/45 transition hover:bg-white/[0.05] hover:text-white"
                        >

                          {copiedRoomId ===
                          room.id ? (
                            <>
                              <Check
                                size={
                                  12
                                }
                              />

                              Copied
                            </>
                          ) : (
                            <>
                              <Copy
                                size={
                                  12
                                }
                              />

                              Copy
                            </>
                          )}

                        </button>

                      </div>

                      <div className="mt-4 flex items-center gap-2 text-[10px] text-white/25">

                        <Users
                          size={
                            12
                          }
                        />

                        <span>
                          Multiple tournaments
                          supported
                        </span>

                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          enterRoom(
                            room
                          )
                        }
                        className={[
                          "mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition",

                          isActive
                            ? "bg-cyan-500 text-black hover:bg-cyan-400"
                            : "border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]",
                        ].join(
                          " "
                        )}
                      >

                        Enter Room

                        <ArrowRight
                          size={
                            15
                          }
                        />

                      </button>

                    </article>

                  );
                }
              )}

            </div>

          </section>

        )}

      </main>

      {/* ==========================================================
          ADD / EDIT ROOM MODAL
          ========================================================== */}

      {showAddRoom && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onMouseDown={event => {

            if (
              event.target ===
              event.currentTarget
            ) {
              setShowAddRoom(
                false
              );
            }

          }}
        >

          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101722] p-6 shadow-2xl">

            <div className="flex items-center justify-between">

              <div>

                <h2 className="text-lg font-black">
                  {editingRoomId
                    ? "Edit Match Room"
                    : "Add Match Room"}
                </h2>

                <p className="mt-1 text-xs text-white/35">
                  Rooms keep their tournaments
                  and tables separate.
                </p>

              </div>

              <button
                type="button"
                onClick={() =>
                  setShowAddRoom(
                    false
                  )
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/35 hover:bg-white/[0.05] hover:text-white"
              >
                <X size={17} />
              </button>

            </div>

            <label className="mt-5 block">

              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">
                Room Name
              </div>

              <input
                autoFocus
                value={
                  roomName
                }
                onChange={event =>
                  setRoomName(
                    event.target
                      .value
                  )
                }
                onKeyDown={event => {

                  if (
                    event.key ===
                    "Enter"
                  ) {
                    saveRoomForm();
                  }

                }}
                placeholder="Main Hall"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-white/20 focus:border-cyan-400/40"
              />

            </label>

            <label className="mt-4 block">

              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">
                Venue / Area
              </div>

              <input
                value={
                  roomVenue
                }
                onChange={event =>
                  setRoomVenue(
                    event.target
                      .value
                  )
                }
                placeholder="Garware Clubhouse"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-white/20 focus:border-cyan-400/40"
              />

            </label>

            <label className="mt-4 block">

              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">
                Room Code
              </div>

              <input
                value={
                  roomCode
                }
                onChange={event =>
                  setRoomCode(
                    event.target
                      .value
                      .toUpperCase()
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-sm uppercase outline-none placeholder:text-white/20 focus:border-cyan-400/40"
              />

            </label>

            <div className="mt-6 flex justify-end gap-2">

              <button
                type="button"
                onClick={() =>
                  setShowAddRoom(
                    false
                  )
                }
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-white/55 hover:bg-white/[0.05]"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  !roomName.trim()
                }
                onClick={
                  saveRoomForm
                }
                className="rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-black text-black transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {editingRoomId
                  ? "Save Changes"
                  : "Create Room"}
              </button>

            </div>

          </div>

        </div>

      )}

      {/* ==========================================================
          DELETE ROOM MODAL
          ========================================================== */}

      {deleteRoomId && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">

          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101722] p-6 shadow-2xl">

            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-400/10 text-red-400">
              <Trash2
                size={19}
              />
            </div>

            <h2 className="mt-4 text-lg font-black">
              Delete this Match Room?
            </h2>

            <p className="mt-2 text-sm leading-6 text-white/40">
              This removes the room from Nova and
              its room-specific tournament/table
              records. This action cannot be undone.
            </p>

            <div className="mt-6 flex justify-end gap-2">

              <button
                type="button"
                onClick={() =>
                  setDeleteRoomId(
                    null
                  )
                }
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-white/55 hover:bg-white/[0.05]"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={
                  confirmDeleteRoom
                }
                className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-black text-white hover:bg-red-400"
              >
                Delete Room
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}