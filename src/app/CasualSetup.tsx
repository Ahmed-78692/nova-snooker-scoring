import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Clock3,
  ImagePlus,
  Play,
  Settings2,
  Timer,
  Trophy,
  User,
  X,
} from "lucide-react";

import type {
  GameType,
  MatchConfig,
  MatchMode,
  Player,
} from "./types";

import {
  loadActiveRoomId,
  loadRooms,
  loadTables,
} from "./sync";


interface CasualSetupProps {
  tableId: string;

  onBack: () => void;

  onBegin: (
    config: MatchConfig
  ) => void;
}


function makeId(): string {
  return `casual-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}


async function compressPhoto(
  file: File
): Promise<string> {
  return new Promise(
    (resolve, reject) => {
      const reader =
        new FileReader();

      reader.onload = () => {
        const image =
          new Image();

        image.onload = () => {
          const maxSize = 500;

          let width =
            image.width;

          let height =
            image.height;

          if (
            width > maxSize ||
            height > maxSize
          ) {
            const scale =
              Math.min(
                maxSize / width,
                maxSize / height
              );

            width =
              Math.round(
                width * scale
              );

            height =
              Math.round(
                height * scale
              );
          }

          const canvas =
            document.createElement(
              "canvas"
            );

          canvas.width =
            width;

          canvas.height =
            height;

          const ctx =
            canvas.getContext(
              "2d"
            );

          if (!ctx) {
            reject(
              new Error(
                "Canvas unavailable"
              )
            );

            return;
          }

          ctx.drawImage(
            image,
            0,
            0,
            width,
            height
          );

          resolve(
            canvas.toDataURL(
              "image/jpeg",
              0.78
            )
          );
        };

        image.onerror =
          () =>
            reject(
              new Error(
                "Unable to load image"
              )
            );

        image.src =
          String(
            reader.result
          );
      };

      reader.onerror =
        () =>
          reject(
            new Error(
              "Unable to read image"
            )
          );

      reader.readAsDataURL(
        file
      );
    }
  );
}


function PlayerPhoto({
  photo,
  onChange,
}: {
  photo: string | null;
  onChange: (
    photo: string
  ) => void;
}) {
  return (
    <label className="relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-cyan-400/30 hover:bg-cyan-400/[0.04]">
      {photo ? (
        <img
          src={photo}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-1 text-white/25">
          <ImagePlus
            size={17}
          />

          <span className="font-mono text-[7px] uppercase tracking-wider">
            Photo
          </span>
        </div>
      )}

      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async event => {
          const file =
            event.target.files?.[0];

          if (!file) {
            return;
          }

          try {
            const photo =
              await compressPhoto(
                file
              );

            onChange(
              photo
            );
          } catch {
            // Ignore invalid images.
          }

          event.target.value =
            "";
        }}
      />
    </label>
  );
}


export default function CasualSetup({
  tableId,
  onBack,
  onBegin,
}: CasualSetupProps) {

  const rooms =
    useMemo(
      () => loadRooms(),
      []
    );

  const activeRoomId =
    loadActiveRoomId();

  const activeRoom =
    rooms.find(
      room =>
        room.id ===
        activeRoomId
    ) ??
    rooms[0] ??
    null;

  const tables =
    useMemo(
      () =>
        activeRoom
          ? loadTables(
              activeRoom.id
            )
          : [],
      [activeRoom]
    );


  const selectedTable =
    tables.find(
      table =>
        table.id ===
        tableId
    );


  const [
    eventTitle,
    setEventTitle,
  ] = useState(
    "Casual Match"
  );

  const [
    matchTitle,
    setMatchTitle,
  ] = useState(
    "Friendly Match"
  );


  const [
    playerNames,
    setPlayerNames,
  ] = useState<
    [string, string]
  >([
    "Player 1",
    "Player 2",
  ]);


  const [
    photos,
    setPhotos,
  ] = useState<
    [string | null, string | null]
  >([
    null,
    null,
  ]);


  const [
    gameType,
    setGameType,
  ] = useState<GameType>(
    "snooker"
  );


  const [
    matchMode,
    setMatchMode,
  ] = useState<MatchMode>(
    "singles"
  );


  const [
    bestOf,
    setBestOf,
  ] = useState<
    number
  >(0);


  const [
    shotSecs,
    setShotSecs,
  ] = useState(
    30
  );


  const [
    shotClockEnabled,
    setShotClockEnabled,
  ] = useState(
    false
  );


  const [
    matchTimerEnabled,
    setMatchTimerEnabled,
  ] = useState(
    false
  );


  const [
    showAdvanced,
    setShowAdvanced,
  ] = useState(
    false
  );


  const [
    starting,
    setStarting,
  ] = useState(
    false
  );


  function updatePlayerName(
    player: 0 | 1,
    value: string
  ) {
    setPlayerNames(
      current =>
        player === 0
          ? [
              value,
              current[1],
            ]
          : [
              current[0],
              value,
            ]
    );
  }


  function updatePhoto(
    player: 0 | 1,
    photo: string
  ) {
    setPhotos(
      current =>
        player === 0
          ? [
              photo,
              current[1],
            ]
          : [
              current[0],
              photo,
            ]
    );
  }


  function createPlayer(
    index: 0 | 1
  ): Player {
    return {
      id: makeId(),
      name:
        playerNames[index]
          .trim() ||
        `Player ${index + 1}`,
      photo:
        photos[index],
    };
  }


  function startMatch() {
    if (starting) {
      return;
    }

    setStarting(
      true
    );

    const player1 =
      createPlayer(0);

    const player2 =
      createPlayer(1);

    const actualTableId =
      tableId ||
      selectedTable?.id ||
      "casual-table-1";

    const config:
      MatchConfig = {
      id: makeId(),

      roomId:
        activeRoom?.id,

      source:
        "casual",

      tableId:
        actualTableId,

      tableName:
        selectedTable?.name ??
        actualTableId,

      eventTitle:
        eventTitle.trim() ||
        "Casual Match",

      matchTitle:
        matchTitle.trim() ||
        `${player1.name} vs ${player2.name}`,

      matchStatus:
        "active",

      clubLogo:
        null,

      sponsors:
        [],

      /*
       * 0 means no Best Of restriction.
       *
       * Remote will therefore remain free-form
       * for casual scoring.
       */
      bestOf,

      shotSecs,

      gameType,

      matchMode,

      customSequence:
        [],

      players: [
        player1,
        player2,
      ],

      handicaps: [
        0,
        0,
      ],

      tableNumber:
        selectedTable?.number,
    };

    onBegin(
      config
    );
  }


  return (
    <div className="min-h-screen bg-[#070b12] text-white">

      {/* HEADER */}

      <header className="border-b border-white/10 bg-[#090e16]/95">
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-5 py-4 sm:px-6">

          <button
            type="button"
            onClick={onBack}
            className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm font-bold text-white/55 hover:bg-white/[0.07] hover:text-white"
          >
            <ArrowLeft
              size={16}
            />

            Back
          </button>


          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-lg">
            🎱
          </div>


          <div>
            <div className="text-lg font-black">
              Casual Scoring
            </div>

            <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/30">
              Free Match Setup
            </div>
          </div>

        </div>
      </header>


      <main className="mx-auto max-w-[1200px] px-5 py-7 sm:px-6">

        {/* INTRO */}

        <section className="mb-6">

          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-400/70">
            No Tournament Required
          </div>

          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Create a Match
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/35">
            Set only what you want. Everything else
            can remain completely open during scoring.
          </p>

        </section>


        <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">

          {/* MAIN */}

          <section className="space-y-5">

            {/* PLAYERS */}

            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">

              <div className="mb-5 flex items-center gap-2">
                <User
                  size={15}
                  className="text-cyan-400"
                />

                <h2 className="text-sm font-black">
                  Players
                </h2>
              </div>


              <div className="grid gap-4 sm:grid-cols-2">

                {[0, 1].map(
                  index => {
                    const player =
                      index as 0 | 1;

                    return (
                      <div
                        key={
                          player
                        }
                        className="rounded-2xl border border-white/10 bg-black/10 p-4"
                      >

                        <div className="flex gap-3">

                          <PlayerPhoto
                            photo={
                              photos[player]
                            }
                            onChange={photo =>
                              updatePhoto(
                                player,
                                photo
                              )
                            }
                          />


                          <div className="min-w-0 flex-1">

                            <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.18em] text-white/25">
                              Player{" "}
                              {player +
                                1}
                            </div>

                            <input
                              value={
                                playerNames[
                                  player
                                ]
                              }
                              onChange={event =>
                                updatePlayerName(
                                  player,
                                  event
                                    .target
                                    .value
                                )
                              }
                              placeholder={`Player ${
                                player +
                                1
                              }`}
                              className="w-full rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3 text-sm font-bold outline-none placeholder:text-white/20 focus:border-cyan-400/35"
                            />

                          </div>

                        </div>

                      </div>
                    );
                  }
                )}

              </div>

            </div>


            {/* MATCH INFORMATION */}

            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">

              <div className="mb-5 flex items-center gap-2">
                <Trophy
                  size={15}
                  className="text-cyan-400"
                />

                <h2 className="text-sm font-black">
                  Match Information
                </h2>
              </div>


              <div className="grid gap-4 sm:grid-cols-2">

                <label>
                  <div className="mb-2 font-mono text-[8px] uppercase tracking-wider text-white/30">
                    Event / Header
                  </div>

                  <input
                    value={
                      eventTitle
                    }
                    onChange={event =>
                      setEventTitle(
                        event.target.value
                      )
                    }
                    className="w-full rounded-xl border border-white/10 bg-black/15 px-3 py-3 text-sm outline-none focus:border-cyan-400/35"
                  />
                </label>


                <label>
                  <div className="mb-2 font-mono text-[8px] uppercase tracking-wider text-white/30">
                    Match Title
                  </div>

                  <input
                    value={
                      matchTitle
                    }
                    onChange={event =>
                      setMatchTitle(
                        event.target.value
                      )
                    }
                    className="w-full rounded-xl border border-white/10 bg-black/15 px-3 py-3 text-sm outline-none focus:border-cyan-400/35"
                  />
                </label>

              </div>

            </div>


            {/* GAME */}

            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">

              <div className="mb-5 flex items-center gap-2">
                <Settings2
                  size={15}
                  className="text-cyan-400"
                />

                <h2 className="text-sm font-black">
                  Scoring Format
                </h2>
              </div>


              <div className="grid gap-3 sm:grid-cols-3">

                {[
                  [
                    "snooker",
                    "Snooker",
                  ],
                  [
                    "billiards",
                    "Billiards",
                  ],
                  [
                    "pl-mix",
                    "Free / Mixed",
                  ],
                ].map(
                  ([value, label]) => (
                    <button
                      key={
                        value
                      }
                      type="button"
                      onClick={() =>
                        setGameType(
                          value as GameType
                        )
                      }
                      className={[
                        "rounded-xl border px-4 py-4 text-left transition",

                        gameType ===
                        value
                          ? "border-cyan-400/35 bg-cyan-400/[0.07] text-cyan-300"
                          : "border-white/10 bg-white/[0.02] text-white/45 hover:bg-white/[0.05]",
                      ].join(
                        " "
                      )}
                    >
                      <div className="text-sm font-black">
                        {label}
                      </div>

                      <div className="mt-1 font-mono text-[8px] uppercase tracking-wider opacity-40">
                        {
                          value ===
                          "snooker"
                            ? "Snooker scoring"
                            : value ===
                              "billiards"
                            ? "Billiards scoring"
                            : "Open scoring"
                        }
                      </div>
                    </button>
                  )
                )}

              </div>


              <div className="mt-4 grid gap-4 sm:grid-cols-2">

                <label>
                  <div className="mb-2 font-mono text-[8px] uppercase tracking-wider text-white/30">
                    Match Mode
                  </div>

                  <select
                    value={
                      matchMode
                    }
                    onChange={event =>
                      setMatchMode(
                        event.target
                          .value as MatchMode
                      )
                    }
                    className="w-full rounded-xl border border-white/10 bg-[#0c131d] px-3 py-3 text-sm outline-none"
                  >
                    <option value="singles">
                      Singles
                    </option>

                    <option value="doubles">
                      Doubles
                    </option>
                  </select>
                </label>


                <label>
                  <div className="mb-2 font-mono text-[8px] uppercase tracking-wider text-white/30">
                    Best Of
                  </div>

                  <select
                    value={
                      bestOf
                    }
                    onChange={event =>
                      setBestOf(
                        Number(
                          event.target.value
                        )
                      )
                    }
                    className="w-full rounded-xl border border-white/10 bg-[#0c131d] px-3 py-3 text-sm outline-none"
                  >
                    <option value={0}>
                      No Limit
                    </option>

                    <option value={1}>
                      Best of 1
                    </option>

                    <option value={3}>
                      Best of 3
                    </option>

                    <option value={5}>
                      Best of 5
                    </option>

                    <option value={7}>
                      Best of 7
                    </option>

                    <option value={9}>
                      Best of 9
                    </option>

                    <option value={11}>
                      Best of 11
                    </option>
                  </select>
                </label>

              </div>

            </div>


            {/* ADVANCED */}

            <div className="rounded-2xl border border-white/10 bg-white/[0.025]">

              <button
                type="button"
                onClick={() =>
                  setShowAdvanced(
                    value =>
                      !value
                  )
                }
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >

                <div className="flex items-center gap-2">

                  <Clock3
                    size={15}
                    className="text-cyan-400"
                  />

                  <div>
                    <div className="text-sm font-black">
                      Optional Controls
                    </div>

                    <div className="mt-0.5 font-mono text-[8px] uppercase tracking-wider text-white/25">
                      Timers & shot clock
                    </div>
                  </div>

                </div>

                <span className="font-mono text-xs text-white/30">
                  {showAdvanced
                    ? "−"
                    : "+"}
                </span>

              </button>


              {showAdvanced && (
                <div className="border-t border-white/[0.06] p-5">

                  <div className="grid gap-4 sm:grid-cols-2">

                    <div className="rounded-xl border border-white/10 bg-black/10 p-4">

                      <div className="flex items-center justify-between gap-3">

                        <div className="flex items-center gap-2">

                          <Timer
                            size={14}
                            className="text-cyan-400"
                          />

                          <span className="text-xs font-bold">
                            Shot Clock
                          </span>

                        </div>


                        <button
                          type="button"
                          onClick={() =>
                            setShotClockEnabled(
                              value =>
                                !value
                            )
                          }
                          className={[
                            "relative h-6 w-11 rounded-full transition",

                            shotClockEnabled
                              ? "bg-cyan-500"
                              : "bg-white/10",
                          ].join(
                            " "
                          )}
                        >
                          <span
                            className={[
                              "absolute top-1 h-4 w-4 rounded-full bg-white transition",

                              shotClockEnabled
                                ? "left-6"
                                : "left-1",
                            ].join(
                              " "
                            )}
                          />
                        </button>

                      </div>


                      {shotClockEnabled && (
                        <div className="mt-4">

                          <div className="mb-2 font-mono text-[8px] uppercase tracking-wider text-white/25">
                            Seconds
                          </div>

                          <select
                            value={
                              shotSecs
                            }
                            onChange={event =>
                              setShotSecs(
                                Number(
                                  event
                                    .target
                                    .value
                                )
                              )
                            }
                            className="w-full rounded-xl border border-white/10 bg-[#0c131d] px-3 py-2.5 text-sm outline-none"
                          >
                            <option value={15}>
                              15 seconds
                            </option>

                            <option value={20}>
                              20 seconds
                            </option>

                            <option value={25}>
                              25 seconds
                            </option>

                            <option value={30}>
                              30 seconds
                            </option>

                            <option value={35}>
                              35 seconds
                            </option>

                            <option value={40}>
                              40 seconds
                            </option>

                            <option value={60}>
                              60 seconds
                            </option>
                          </select>

                        </div>
                      )}

                    </div>


                    <div className="rounded-xl border border-white/10 bg-black/10 p-4">

                      <div className="flex items-center justify-between gap-3">

                        <div className="flex items-center gap-2">

                          <Clock3
                            size={14}
                            className="text-emerald-400"
                          />

                          <span className="text-xs font-bold">
                            Match Timer
                          </span>

                        </div>


                        <button
                          type="button"
                          onClick={() =>
                            setMatchTimerEnabled(
                              value =>
                                !value
                            )
                          }
                          className={[
                            "relative h-6 w-11 rounded-full transition",

                            matchTimerEnabled
                              ? "bg-emerald-500"
                              : "bg-white/10",
                          ].join(
                            " "
                          )}
                        >
                          <span
                            className={[
                              "absolute top-1 h-4 w-4 rounded-full bg-white transition",

                              matchTimerEnabled
                                ? "left-6"
                                : "left-1",
                            ].join(
                              " "
                            )}
                          />
                        </button>

                      </div>


                      <p className="mt-4 text-xs leading-5 text-white/25">
                        The existing Nova Remote timer
                        infrastructure will be used when
                        the match starts.
                      </p>

                    </div>

                  </div>

                </div>
              )}

            </div>

          </section>


          {/* SIDE */}

          <aside className="lg:sticky lg:top-6 lg:self-start">

            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.025] p-5">

              <div className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-emerald-400/70">
                Nova Casual
              </div>


              <h2 className="mt-2 text-xl font-black">
                Ready to Score
              </h2>


              <p className="mt-2 text-sm leading-6 text-white/35">
                This match will open in the same
                Nova Remote used by tournament matches.
              </p>


              <div className="mt-5 space-y-2">

                <div className="flex justify-between rounded-xl border border-white/10 bg-black/10 px-3 py-2.5">
                  <span className="text-xs text-white/30">
                    Table
                  </span>

                  <span className="font-mono text-xs font-bold text-white/60">
                    {
                      selectedTable?.name ??
                      tableId
                    }
                  </span>
                </div>


                <div className="flex justify-between rounded-xl border border-white/10 bg-black/10 px-3 py-2.5">
                  <span className="text-xs text-white/30">
                    Game
                  </span>

                  <span className="text-xs font-bold text-white/60">
                    {
                      gameType ===
                      "snooker"
                        ? "Snooker"
                        : gameType ===
                          "billiards"
                        ? "Billiards"
                        : "Free / Mixed"
                    }
                  </span>
                </div>


                <div className="flex justify-between rounded-xl border border-white/10 bg-black/10 px-3 py-2.5">
                  <span className="text-xs text-white/30">
                    Format
                  </span>

                  <span className="text-xs font-bold text-white/60">
                    {bestOf
                      ? `Best of ${bestOf}`
                      : "No Limit"}
                  </span>
                </div>

              </div>


              <button
                type="button"
                disabled={
                  starting
                }
                onClick={
                  startMatch
                }
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3.5 text-sm font-black text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play
                  size={16}
                  fill="currentColor"
                />

                {starting
                  ? "Starting..."
                  : "Start Casual Match"}
              </button>

            </div>


            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">

              <p className="text-center font-mono text-[8px] uppercase tracking-[0.14em] leading-5 text-white/20">
                No tournament
                <br />
                No schedule
                <br />
                No standings
                <br />
                No forced format

              </p>

            </div>

          </aside>

        </div>

      </main>
    </div>
  );
}