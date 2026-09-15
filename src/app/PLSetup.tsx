import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";


import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Play,
  Pencil,
  Plus,
  Save,
  Settings2,
  Trash2,
  Trophy,
  Upload,
  Users,
  X,
} from "lucide-react";

import type {
  AppView,
  BillMode,
  FrameDef,
  GameType,
  MatchMode,
  PLStanding,
  Player,
  ScheduledMatch,
  Tournament,
} from "./types";

import {
  DEFAULT_BILLIARDS_FRAME,
  DEFAULT_SNOOKER_FRAME,
} from "./types";

import {
  calcStandings,
  generateRoundRobin,
  loadTables,
  loadTournament,
  saveTournament,
  uid,
} from "./sync";

/* ============================================================ */
/* PROPS                                                          */
/* ============================================================ */

interface Props {
  onNavigate: (
    view: AppView,
    context?: {
      tableId?: string;
      scheduledMatchId?: string;
    }
  ) => void;
}

/* ============================================================ */
/* ROOM STORAGE                                                   */
/* ============================================================ */

interface MatchRoom {
  id: string;
  name: string;
  code: string;
  createdAt: number;
}

interface RoomTournamentSettings {
  title: string;
  format:
    | "bestOf3"
    | "bestOf5"
    | "bestOf7"
    | "bestOf9"
    | "bestOf11"
    | "roundRobin"
    | "custom";
}

const ROOMS_KEY =
  "nova_match_rooms";

const ACTIVE_ROOM_KEY =
  "nova_active_room";

const ROOM_TOURNAMENT_KEY =
  "nova_room_tournament_settings";

/* ============================================================ */
/* CONSTANTS                                                      */
/* ============================================================ */

const TIME_OPTIONS = [
  {
    label: "15 minutes",
    value: 900,
  },
  {
    label: "30 minutes",
    value: 1800,
  },
  {
    label: "45 minutes",
    value: 2700,
  },
  {
    label: "60 minutes",
    value: 3600,
  },
  {
    label: "90 minutes",
    value: 5400,
  },
  {
    label: "120 minutes",
    value: 7200,
  },
  {
    label: "3 hours",
    value: 10800,
  },
  {
    label: "6 hours",
    value: 21600,
  },
];

/* ============================================================ */
/* ROOM HELPERS                                                   */
/* ============================================================ */

function loadActiveRoom(): MatchRoom | null {
  try {
    const raw =
      localStorage.getItem(
        ROOMS_KEY
      );

    if (!raw) {
      return null;
    }

    const rooms =
      JSON.parse(raw) as MatchRoom[];

    if (!Array.isArray(rooms)) {
      return null;
    }

    const activeId =
      localStorage.getItem(
        ACTIVE_ROOM_KEY
      );

    return (
      rooms.find(
        (room) =>
          room.id === activeId
      ) ??
      rooms[0] ??
      null
    );
  } catch {
    return null;
  }
}

function loadRoomTournamentSettings(
  roomId: string
): RoomTournamentSettings | null {
  try {
    const raw =
      localStorage.getItem(
        ROOM_TOURNAMENT_KEY
      );

    if (!raw) {
      return null;
    }

    const data =
      JSON.parse(raw);

    return (
      data?.[roomId] ??
      null
    );
  } catch {
    return null;
  }
}

/* ============================================================ */
/* FORMAT HELPERS                                                 */
/* ============================================================ */

function getBestOfFromRoomFormat(
  format:
    | "bestOf3"
    | "bestOf5"
    | "bestOf7"
    | "bestOf9"
    | "bestOf11"
    | "roundRobin"
    | "custom"
): number {
  switch (format) {
    case "bestOf3":
      return 3;

    case "bestOf5":
      return 5;

    case "bestOf7":
      return 7;

    case "bestOf9":
      return 9;

    case "bestOf11":
      return 11;

    default:
      return 7;
  }
}

/* ============================================================ */
/* FRAME FACTORIES                                                */
/* ============================================================ */

function createSnookerFrame(
  reds = 15
): FrameDef {
  return {
    ...DEFAULT_SNOOKER_FRAME,
    type: "snooker",
    reds,
  };
}

function createBilliardsFrame(
  billMode: BillMode = "points",
  billTarget = 300,
  billDuration = 3600
): FrameDef {
  return {
    ...DEFAULT_BILLIARDS_FRAME,
    type: "billiards",
    billMode,
    billTarget,
    billDuration,
  };
}

/*
 * IMPORTANT:
 *
 * PL Mix does NOT create a fixed
 * Snooker/Billiards sequence.
 *
 * Every frame is independently
 * configurable by the operator.
 *
 * We start with Snooker 15 reds
 * as the first frame only so the
 * sequence is never empty.
 *
 * Every subsequent frame has
 * its own Game dropdown.
 */

function createPLMixSequence(
  bestOf: number
): FrameDef[] {
  const count =
    Math.max(
      1,
      Math.min(
        99,
        bestOf
      )
    );

  return Array.from(
    {
      length: count,
    },
    (_, index) =>
      index === 0
        ? createSnookerFrame(15)
        : createBilliardsFrame(
            "points",
            300,
            3600
          )
  );
}

/*
 * For pure Snooker or pure Billiards
 * we create the appropriate sequence.
 */

function createStandardSequence(
  bestOf: number,
  type: GameType
): FrameDef[] {
  if (type === "snooker") {
    return Array.from(
      {
        length: bestOf,
      },
      () =>
        createSnookerFrame(
          15
        )
    );
  }

  if (type === "billiards") {
    return Array.from(
      {
        length: bestOf,
      },
      () =>
        createBilliardsFrame(
          "points",
          300,
          3600
        )
    );
  }

  return createPLMixSequence(
    bestOf
  );
}

/* ============================================================ */
/* IMAGE BOX                                                       */
/* ============================================================ */

function ImageBox({
  value,
  onChange,
  circular = false,
}: {
  value: string | null;
  onChange: (
    value: string | null
  ) => void;
  circular?: boolean;
}) {
  const inputRef =
    useState<HTMLInputElement | null>(
      null
    )[0];

  return (
    <div
      className={`
        relative
        overflow-hidden
        bg-card
        border
        border-border
        cursor-pointer
        flex
        items-center
        justify-center
        group
        ${
          circular
            ? "w-12 h-12 rounded-full"
            : "w-16 h-16 rounded-xl"
        }
      `}
    >
      {value ? (
        <>
          <img
            src={value}
            className="
              w-full
              h-full
              object-cover
            "
          />

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onChange(null);
            }}
            className="
              absolute
              top-1
              right-1
              w-5
              h-5
              rounded-full
              bg-background/90
              flex
              items-center
              justify-center
              opacity-0
              group-hover:opacity-100
            "
          >
            <X size={10} />
          </button>
        </>
      ) : (
        <ImagePlus
          size={17}
          className="
            text-muted-foreground/40
          "
        />
      )}

      <input
        ref={(element) => {
          if (element) {
            (
              inputRef as React.MutableRefObject<HTMLInputElement | null>
            ).current =
              element;
          }
        }}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file =
            event.target.files?.[0];

          if (!file) {
            return;
          }

          onChange(
            URL.createObjectURL(
              file
            )
          );
        }}
      />
    </div>
  );
}

/* ============================================================ */
/* MAIN COMPONENT                                                 */
/* ============================================================ */

export default function PLSetup({
  onNavigate,
}: Props) {
  /* ========================================================== */
  /* EXISTING TOURNAMENT                                         */
  /* ========================================================== */

  const existing = useMemo(
    () => loadTournament(),
    []
  );

  /* ========================================================== */
  /* ACTIVE ROOM                                                  */
  /* ========================================================== */

  const [room] =
    useState<MatchRoom | null>(
      () => loadActiveRoom()
    );

  const roomSettings =
    room
      ? loadRoomTournamentSettings(
          room.id
        )
      : null;

  /* ========================================================== */
  /* BASIC TOURNAMENT DATA                                       */
  /* ========================================================== */

  const [title, setTitle] =
    useState(
      existing?.title ??
        roomSettings?.title ??
        (room
          ? `${room.name} Tournament`
          : "Premier League Tournament")
    );

  const [clubLogo, setClubLogo] =
    useState<string | null>(
      existing?.clubLogo ??
        null
    );

  const [sponsors, setSponsors] =
    useState<string[]>(
      existing?.sponsors ??
        []
    );

  /* ========================================================== */
  /* PLAYERS                                                      */
  /* ========================================================== */

  const [players, setPlayers] =
    useState<Player[]>(
      existing?.players ??
        []
    );

  const [
    newPlayerName,
    setNewPlayerName,
  ] = useState("");

  const excelInputRef =
    useRef<HTMLInputElement | null>(null);

  const [excelImporting, setExcelImporting] =
    useState(false);

  const [excelMessage, setExcelMessage] =
    useState("");

  const [playerSearch, setPlayerSearch] =
    useState("");

  const [
    newPlayerClub,
    setNewPlayerClub,
  ] = useState("");

  const [handicaps, setHandicaps] =
    useState<
      Record<string, number>
    >(
      existing?.handicaps ??
        {}
    );

  /* ========================================================== */
  /* FORMAT                                                       */
  /* ========================================================== */

  const initialGameType =
    existing?.format
      ?.gameType ??
    "snooker";

  const initialBestOf =
    existing?.format?.bestOf ??
    getBestOfFromRoomFormat(
      roomSettings?.format ??
        "bestOf7"
    );

  const [gameType, setGameType] =
    useState<GameType>(
      initialGameType
    );

  /*
   * Tournament structure:
   *
   * Premier League Mix = Round Robin
   * Pure Snooker / Billiards = Knockout
   */
  const [tournamentFormat, setTournamentFormat] =
    useState<"roundRobin" | "knockout">(
      existing?.format?.tournamentFormat ??
        (initialGameType === "pl-mix"
          ? "roundRobin"
          : "knockout")
    );

  const [bestOf, setBestOf] =
    useState<number>(
      initialBestOf
    );

  const [shotSecs, setShotSecs] =
    useState<number>(
      existing?.format
        ?.shotSecs ??
        30
    );

  const [matchMode, setMatchMode] =
    useState<MatchMode>(
      existing?.format
        ?.matchMode ??
        "singles"
    );

  const [billMode, setBillMode] =
    useState<BillMode>(
      existing?.format
        ?.billMode ??
        "points"
    );

  const [billTarget, setBillTarget] =
    useState<number>(
      existing?.format
        ?.billTarget ??
        300
    );

  const [billDuration, setBillDuration] =
    useState<number>(
      existing?.format
        ?.billDuration ??
        3600
    );

  /*
   * This is the important part.
   *
   * The sequence is independent
   * for every frame.
   */

  const [customSequence, setCustomSequence] =
    useState<FrameDef[]>(
      existing?.format
        ?.customSequence ??
        (
          initialGameType ===
          "pl-mix"
            ? createPLMixSequence(
                initialBestOf
              )
            : createStandardSequence(
                initialBestOf,
                initialGameType
              )
        )
    );

  /* ========================================================== */
  /* SCHEDULE                                                     */
  /* ========================================================== */

  const [schedule, setSchedule] =
    useState<ScheduledMatch[]>(
      existing?.schedule ??
        []
    );

  /* ========================================================== */
  /* STANDINGS                                                    */
  /* ========================================================== */

  const [standings, setStandings] =
    useState<PLStanding[]>(
      existing?.standings ??
        []
    );

  /* ========================================================== */
  /* UI                                                           */
  /* ========================================================== */

  const [
    activeSection,
    setActiveSection,
  ] =
    useState<
      "players" | "format" | "schedule"
    >("players");

  const [error, setError] =
    useState("");

  const [
    savedMessage,
    setSavedMessage,
  ] = useState("");

  const [
    isStarting,
    setIsStarting,
  ] = useState(false);

  const [editingStandings, setEditingStandings] =
    useState(false);

  const [manualStandings, setManualStandings] =
    useState(false);

  /* ========================================================== */
  /* STANDINGS SYNC                                               */
  /* ========================================================== */

  useEffect(() => {
    if (manualStandings) {
      return;
    }

    setStandings(
      calcStandings(
        players.map(
          (player) =>
            player.id
        ),
        schedule
      )
    );
  }, [
    players,
    schedule,
    manualStandings,
  ]);

  /* ========================================================== */
  /* PLAYER FUNCTIONS                                             */
  /* ========================================================== */

  function addPlayer() {
    const name =
      newPlayerName.trim();

    if (!name) {
      setError(
        "Please enter a player name."
      );
      return;
    }

    if (
      players.some(
        (player) =>
          player.name
            .trim()
            .toLowerCase() ===
          name.toLowerCase()
      )
    ) {
      setError(
        "A player with this name already exists."
      );
      return;
    }

    const player: Player = {
      id: uid(),
      name,
      photo: null,
      club:
        newPlayerClub.trim() ||
        undefined,
    };

    setPlayers(
      (current) => [
        ...current,
        player,
      ]
    );

    setHandicaps(
      (current) => ({
        ...current,
        [player.id]: 0,
      })
    );

    setNewPlayerName("");
    setNewPlayerClub("");
    setError("");
  }

  function removePlayer(
    playerId: string
  ) {
    const player =
      players.find(
        (item) =>
          item.id ===
          playerId
      );

    if (!player) {
      return;
    }

    const confirmed =
      window.confirm(
        `Remove ${player.name} from the tournament?`
      );

    if (!confirmed) {
      return;
    }

    setPlayers(
      (current) =>
        current.filter(
          (item) =>
            item.id !==
            playerId
        )
    );

    setHandicaps(
      (current) => {
        const next = {
          ...current,
        };

        delete next[
          playerId
        ];

        return next;
      }
    );

    setSchedule(
      (current) =>
        current.filter(
          (match) =>
            match.player1Id !==
              playerId &&
            match.player2Id !==
              playerId
        )
    );

    setError("");
  }

  function updatePlayer(
    playerId: string,
    patch: Partial<Player>
  ) {
    setPlayers(
      (current) =>
        current.map(
          (player) =>
            player.id ===
            playerId
              ? {
                  ...player,
                  ...patch,
                }
              : player
        )
    );
  }

  function adjustHandicap(
    playerId: string,
    delta: number
  ) {
    setHandicaps(
      (current) => ({
        ...current,
        [playerId]: Math.max(
          -200,
          Math.min(
            200,
            (current[
              playerId
            ] ?? 0) +
              delta
          )
        ),
      })
    );
  }

  /* ========================================================== */
  /* GAME TYPE CHANGE                                             */
  /* ========================================================== */

  function changeGameType(
    type: GameType
  ) {
    setGameType(type);

    /*
     * Tournament structure is enforced by game type.
     */
    setTournamentFormat(
      type === "pl-mix"
        ? "roundRobin"
        : "knockout"
    );

    /*
     * PL Mix gets its own editable
     * sequence.
     */

    if (type === "pl-mix") {
      setCustomSequence(
        createPLMixSequence(
          bestOf
        )
      );

      return;
    }

    /*
     * Pure Snooker/Billiards use
     * their appropriate defaults.
     */

    setCustomSequence(
      createStandardSequence(
        bestOf,
        type
      )
    );

    if (
      type ===
      "billiards"
    ) {
      setBillMode(
        "points"
      );
    }
  }

  /* ========================================================== */
  /* BEST OF CHANGE                                               */
  /* ========================================================== */

  function changeBestOf(
    value: number
  ) {
    const clean =
      Math.max(
        1,
        Math.min(
          99,
          Math.round(value)
        )
      );

    setBestOf(clean);

    /*
     * Preserve as much of the
     * existing PL Mix sequence as
     * possible.
     *
     * This is important:
     *
     * Changing BO7 -> BO9 should NOT
     * destroy all the custom frame
     * settings the operator already
     * configured.
     */

    setCustomSequence(
      (current) => {
        if (
          gameType ===
          "pl-mix"
        ) {
          if (
            clean <
            current.length
          ) {
            return current.slice(
              0,
              clean
            );
          }

          const additional =
            Array.from(
              {
                length:
                  clean -
                  current.length,
              },
              () =>
                createBilliardsFrame(
                  "points",
                  300,
                  3600
                )
            );

          return [
            ...current,
            ...additional,
          ];
        }

        return createStandardSequence(
          clean,
          gameType
        );
      }
    );
  }

  /* ========================================================== */
  /* FRAME UPDATE                                                 */
  /* ========================================================== */

  function updateFrame(
    index: number,
    patch: Partial<FrameDef>
  ) {
    setCustomSequence(
      (current) =>
        current.map(
          (frame, frameIndex) =>
            frameIndex ===
            index
              ? {
                  ...frame,
                  ...patch,
                }
              : frame
        )
    );
  }

  /* ========================================================== */
  /* CHANGE INDIVIDUAL FRAME GAME                                */
  /* ========================================================== */

  function changeFrameGame(
    index: number,
    type:
      | "snooker"
      | "billiards"
  ) {
    if (
      type ===
      "snooker"
    ) {
      updateFrame(
        index,
        {
          type: "snooker",
          reds: 15,
        }
      );

      return;
    }

    updateFrame(
      index,
      {
        type: "billiards",
        billMode:
          "points",
        billTarget: 300,
        billDuration:
          3600,
      }
    );
  }

  /* ========================================================== */
  /* ADD FRAME                                                    */
  /* ========================================================== */

  function addFrame(
    type:
      | "snooker"
      | "billiards"
  ) {
    const frame =
      type ===
      "snooker"
        ? createSnookerFrame(
            15
          )
        : createBilliardsFrame(
            "points",
            300,
            3600
          );

    setCustomSequence(
      (current) => [
        ...current,
        frame,
      ]
    );

    setBestOf(
      customSequence.length +
        1
    );
  }

  /* ========================================================== */
  /* REMOVE FRAME                                                 */
  /* ========================================================== */

  function removeFrame(
    index: number
  ) {
    if (
      customSequence.length <=
      1
    ) {
      return;
    }

    setCustomSequence(
      (current) =>
        current.filter(
          (_, frameIndex) =>
            frameIndex !==
            index
        )
    );

    setBestOf(
      Math.max(
        1,
        customSequence.length -
          1
      )
    );
  }

  /* ========================================================== */
  /* MOVE FRAME                                                   */
  /* ========================================================== */

  function moveFrame(
    index: number,
    direction: -1 | 1
  ) {
    setCustomSequence(
      (current) => {
        const next = [
          ...current,
        ];

        const target =
          index +
          direction;

        if (
          target < 0 ||
          target >=
            next.length
        ) {
          return current;
        }

        [
          next[index],
          next[target],
        ] = [
          next[target],
          next[index],
        ];

        return next;
      }
    );
  }

  /* ========================================================== */
  /* GENERATE SCHEDULE                                            */
  /* ========================================================== */

  function generateSchedule() {
    if (players.length < 2) {
      setError(
        "Add at least two players before generating the schedule."
      );

      setActiveSection("players");
      return;
    }

    /*
     * Premier League Mix is the only Round Robin format.
     *
     * Knockout scheduling will be generated in the Match Room
     * once the knockout engine is added.
     */
    if (gameType !== "pl-mix") {
      setError(
        "Pure Snooker and Billiards tournaments use Knockout format. Their matches are managed from the Match Room."
      );
      setActiveSection("schedule");
      return;
    }

    const generated =
      generateRoundRobin(
        players.map(
          (player) => player.id
        )
      );

    const previousByPair =
      new Map<string, ScheduledMatch>();

    schedule.forEach((match) => {
      const key = [
        match.player1Id,
        match.player2Id,
      ]
        .sort()
        .join("-");

      previousByPair.set(key, match);
    });

    const nextSchedule =
      generated.map((item, index) => {
        const key = [
          item.p1,
          item.p2,
        ]
          .sort()
          .join("-");

        const previous =
          previousByPair.get(key);

        return {
          id:
            previous?.id ??
            `match-${uid()}-${index}`,

          round: item.round,

          tableId:
            previous?.tableId ??
            null,

          player1Id: item.p1,

          player2Id: item.p2,

          status:
            previous?.status ??
            "scheduled",

          result:
            previous?.result,
        };
      });

    setManualStandings(false);
    setSchedule(nextSchedule);

    setStandings(
      calcStandings(
        players.map(
          (player) => player.id
        ),
        nextSchedule
      )
    );

    setError("");
    setActiveSection("schedule");
  }

  /* ========================================================== */
  /* EXCEL PLAYER IMPORT                                          */
  /* ========================================================== */

  function normaliseHeader(value: unknown): string {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function findColumn(
    headers: string[],
    candidates: string[]
  ): number {
    const wanted =
      candidates.map(normaliseHeader);

    return headers.findIndex((header) =>
      wanted.includes(
        normaliseHeader(header)
      )
    );
  }

  async function importPlayersFromExcel(
    file: File
  ) {
    setExcelImporting(true);
    setExcelMessage("");
    setError("");

    try {
      /*
       * Figma Make / browser-safe importer.
       *
       * This intentionally uses no npm Excel package.
       * The first worksheet can be exported from Excel as
       * CSV and imported directly. TSV is also supported.
       *
       * Expected headers:
       * Player Name | Club | Country | Handicap
       */
      const text =
        await file.text();

      const lines =
        text
          .replace(/^\uFEFF/, "")
          .split(/\r?\n/)
          .filter(
            (line) =>
              line.trim().length > 0
          );

      if (lines.length < 2) {
        throw new Error(
          "The player sheet is empty. Export the Excel sheet as CSV and try again."
        );
      }

      const delimiter =
        lines[0].includes("\t")
          ? "\t"
          : ",";

      function parseDelimitedLine(
        line: string
      ): string[] {
        const values: string[] = [];
        let value = "";
        let quoted = false;

        for (
          let i = 0;
          i < line.length;
          i += 1
        ) {
          const char =
            line[i];

          if (
            char === '"'
          ) {
            if (
              quoted &&
              line[i + 1] === '"'
            ) {
              value += '"';
              i += 1;
            } else {
              quoted =
                !quoted;
            }
          } else if (
            char === delimiter &&
            !quoted
          ) {
            values.push(
              value.trim()
            );
            value = "";
          } else {
            value += char;
          }
        }

        values.push(
          value.trim()
        );

        return values;
      }

      const headers =
        parseDelimitedLine(
          lines[0]
        );

      const nameColumn =
        findColumn(headers, [
          "name",
          "player",
          "playername",
          "player_name",
          "fullname",
          "full_name",
        ]);

      if (nameColumn < 0) {
        throw new Error(
          "Could not find a Player Name column. Use a header such as Player Name or Name."
        );
      }

      const clubColumn =
        findColumn(headers, [
          "club",
          "clubname",
          "club_name",
        ]);

      const countryColumn =
        findColumn(headers, [
          "country",
          "nation",
        ]);

      const handicapColumn =
        findColumn(headers, [
          "handicap",
          "hcp",
          "rating",
        ]);

      const imported: Player[] =
        [];

      const importedHandicaps:
        Record<string, number> =
        {};

      const existingNames =
        new Set(
          players.map((player) =>
            player.name
              .trim()
              .toLowerCase()
          )
        );

      const importedNames =
        new Set<string>();

      let blankRows = 0;
      let duplicates = 0;

      for (
        let rowIndex = 1;
        rowIndex < lines.length;
        rowIndex += 1
      ) {
        const values =
          parseDelimitedLine(
            lines[rowIndex]
          );

        const name =
          String(
            values[nameColumn] ??
              ""
          ).trim();

        if (!name) {
          blankRows += 1;
          continue;
        }

        const key =
          name.toLowerCase();

        if (
          existingNames.has(key) ||
          importedNames.has(key)
        ) {
          duplicates += 1;
          continue;
        }

        const club =
          clubColumn >= 0
            ? String(
                values[
                  clubColumn
                ] ?? ""
              ).trim()
            : "";

        const country =
          countryColumn >= 0
            ? String(
                values[
                  countryColumn
                ] ?? ""
              ).trim()
            : "";

        const handicapRaw =
          handicapColumn >= 0
            ? Number(
                values[
                  handicapColumn
                ]
              )
            : 0;

        const handicap =
          Number.isFinite(
            handicapRaw
          )
            ? Math.max(
                -200,
                Math.min(
                  200,
                  Math.round(
                    handicapRaw
                  )
                )
              )
            : 0;

        const player: Player = {
          id: uid(),
          name,
          photo: null,
          club:
            club || undefined,
          country:
            country || undefined,
        };

        imported.push(
          player
        );

        importedHandicaps[
          player.id
        ] = handicap;

        importedNames.add(
          key
        );
      }

      if (
        imported.length === 0
      ) {
        throw new Error(
          "No new players were found in the player sheet."
        );
      }

      setPlayers(
        (current) => [
          ...current,
          ...imported,
        ]
      );

      setHandicaps(
        (current) => ({
          ...current,
          ...importedHandicaps,
        })
      );

      setExcelMessage(
        `${imported.length} player${
          imported.length === 1
            ? ""
            : "s"
        } imported${
          duplicates
            ? ` · ${duplicates} duplicate${
                duplicates === 1
                  ? ""
                  : "s"
              } skipped`
            : ""
        }${
          blankRows
            ? ` · ${blankRows} blank row${
                blankRows === 1
                  ? ""
                  : "s"
              } skipped`
            : ""
        }`
      );

      if (
        gameType !== "pl-mix"
      ) {
        setTournamentFormat(
          "knockout"
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to import the player sheet."
      );
    } finally {
      setExcelImporting(
        false
      );

      if (
        excelInputRef.current
      ) {
        excelInputRef.current.value =
          "";
      }
    }
  }

  function handleExcelChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    void importPlayersFromExcel(
      file
    );
  }

  const filteredPlayers =
    players.filter((player) => {
      const query =
        playerSearch
          .trim()
          .toLowerCase();

      if (!query) {
        return true;
      }

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
    });
  /* ========================================================== */
  /* CLEAR SCHEDULE                                               */
  /* ========================================================== */

  function clearSchedule() {
    const live =
      schedule.some(
        (match) =>
          match.status ===
          "active"
      );

    if (live) {
      setError(
        "A live match exists. Complete or stop it before clearing the schedule."
      );

      return;
    }

    const confirmed =
      window.confirm(
        "Clear the tournament schedule?"
      );

    if (!confirmed) {
      return;
    }

    setSchedule([]);
    setError("");
  }

  /* ========================================================== */
  /* BUILD TOURNAMENT                                             */
  /* ========================================================== */

  function buildTournament(): Tournament {
    /*
     * The physical tables belong
     * to the Match Room.
     *
     * Never overwrite them with [].
     */

    const roomTables =
      loadTables();

    return {
      id:
        existing?.id ??
        room?.id ??
        `tournament-${uid()}`,

      title:
        title.trim() ||
        "Premier League Tournament",

      clubLogo,

      sponsors,

      players,

      handicaps,

      format: {
        gameType,

        tournamentFormat:
          gameType === "pl-mix"
            ? "roundRobin"
            : "knockout",

        /*
         * In PL Mix, the number of
         * frames is determined by
         * the custom sequence.
         */

        bestOf:
          gameType ===
          "pl-mix"
            ? customSequence.length
            : bestOf,

        customSequence,

        shotSecs,

        matchMode,

        /*
         * These remain as global
         * defaults for compatibility
         * with existing Remote code.
         *
         * Actual PL Mix billiards
         * frames use their own
         * billMode / billTarget /
         * billDuration.
         */

        billMode,

        billTarget,

        billDuration,
      },

      schedule,

      standings,

      tables:
        roomTables,
    };
  }

  /* ========================================================== */
  /* SAVE                                                          */
  /* ========================================================== */

  function save() {
    if (!title.trim()) {
      setError(
        "Please enter a tournament name."
      );

      setActiveSection(
        "players"
      );

      return;
    }

    if (
      players.length <
      2
    ) {
      setError(
        "Add at least two players."
      );

      setActiveSection(
        "players"
      );

      return;
    }

    if (
      customSequence.length <
      1
    ) {
      setError(
        "Add at least one frame to the match format."
      );

      setActiveSection(
        "format"
      );

      return;
    }

    const tournament =
      buildTournament();

    saveTournament(
      tournament
    );

    setSavedMessage(
      "Tournament saved"
    );

    setError("");

    window.setTimeout(
      () => {
        setSavedMessage("");
      },
      1800
    );
  }

  /* ========================================================== */
  /* START TOURNAMENT                                             */
  /* ========================================================== */

  function startTournament() {
    if (!title.trim()) {
      setError(
        "Please enter a tournament name."
      );

      setActiveSection(
        "players"
      );

      return;
    }

    if (
      players.length <
      2
    ) {
      setError(
        "Add at least two players."
      );

      setActiveSection(
        "players"
      );

      return;
    }

    if (
      customSequence.length <
      1
    ) {
      setError(
        "Configure at least one frame."
      );

      setActiveSection(
        "format"
      );

      return;
    }

    /*
     * Premier League Mix owns the Round Robin schedule.
     *
     * Pure Snooker/Billiards are knockout tournaments.
     * Their knockout fixtures will be created/managed by
     * the Match Room engine, so we do not create a Round
     * Robin schedule here.
     */

    let finalSchedule =
      schedule;

    if (
      gameType === "pl-mix" &&
      finalSchedule.length === 0
    ) {
      const generated =
        generateRoundRobin(
          players.map(
            (player) =>
              player.id
          )
        );

      finalSchedule =
        generated.map(
          (
            item,
            index
          ) => ({
            id:
              `match-${uid()}-${index}`,

            round:
              item.round,

            tableId:
              null,

            player1Id:
              item.p1,

            player2Id:
              item.p2,

            status:
              "scheduled",
          })
        );

      setSchedule(
        finalSchedule
      );
    }

    const finalStandings =
      gameType === "pl-mix"
        ? calcStandings(
            players.map(
              (player) =>
                player.id
            ),
            finalSchedule
          )
        : [];

    const roomTables =
      loadTables();

    const tournament: Tournament =
      {
        id:
          existing?.id ??
          room?.id ??
          `tournament-${uid()}`,

        title:
          title.trim(),

        clubLogo,

        sponsors,

        players,

        handicaps,

        format: {
          gameType,

          tournamentFormat:
            gameType === "pl-mix"
              ? "roundRobin"
              : "knockout",

          bestOf:
            gameType ===
            "pl-mix"
              ? customSequence.length
              : bestOf,

          customSequence,

          shotSecs,

          matchMode,

          billMode,

          billTarget,

          billDuration,
        },

        schedule:
          finalSchedule,

        standings:
          finalStandings,

        tables:
          roomTables,
      };

    saveTournament(
      tournament
    );

    if (room) {
      localStorage.setItem(
        ACTIVE_ROOM_KEY,
        room.id
      );
    }

    setStandings(
      finalStandings
    );

    setIsStarting(true);

    window.setTimeout(
      () => {
        onNavigate(
          "orgHub"
        );
      },
      150
    );
  }

  /* ========================================================== */
  /* MATCH RESULT                                                 */
  /* ========================================================== */

  function setMatchResult(
    matchId: string,
    winner:
      | "player1"
      | "player2"
      | "draw",
    score1: number,
    score2: number
  ) {
    const next =
      schedule.map(
        (match) =>
          match.id ===
          matchId
            ? {
                ...match,
                status:
                  "complete" as const,
                result: {
                  winner,
                  score: [
                    score1,
                    score2,
                  ] as [
                    number,
                    number
                  ],
                },
              }
            : match
      );

    setManualStandings(false);

    setSchedule(next);

    setStandings(
      calcStandings(
        players.map(
          (player) =>
            player.id
        ),
        next
      )
    );
  }

  /* ========================================================== */
  /* PLAYER NAME                                                  */
  /* ========================================================== */

  function playerName(
    playerId: string
  ) {
    return (
      players.find(
        (player) =>
          player.id ===
          playerId
      )?.name ??
      "Unknown"
    );
  }

  /* ========================================================== */
  /* STANDINGS EDITING                                            */
  /* ========================================================== */

  function updateStandingValue(
    playerId: string,
    field: "played" | "won" | "points",
    value: number
  ) {
    setManualStandings(true);

    setStandings((current) =>
      current.map((standing) => {
        if (standing.playerId !== playerId) {
          return standing;
        }

        const next = {
          ...standing,
        } as PLStanding & Record<string, unknown>;

        next[field] = Math.max(
          0,
          Math.round(value)
        );

        return next as PLStanding;
      })
    );
  }

  function startStandingsEdit() {
    setEditingStandings(true);
  }

  function saveStandingsEdit() {
    setEditingStandings(false);
    setManualStandings(true);
    setSavedMessage("Standings updated");

    window.setTimeout(() => {
      setSavedMessage("");
    }, 1800);
  }

  function recalculateStandings() {
    const recalculated = calcStandings(
      players.map(
        (player) => player.id
      ),
      schedule
    );

    setStandings(recalculated);
    setManualStandings(false);
    setEditingStandings(false);
    setSavedMessage("Standings recalculated");

    window.setTimeout(() => {
      setSavedMessage("");
    }, 1800);
  }

  /* ========================================================== */
  /* RENDER                                                       */
  /* ========================================================== */

  return (
    <div className="
      min-h-screen
      bg-background
      text-foreground
      flex
      flex-col
    ">

      {/* ====================================================== */}
      {/* HEADER                                                   */}
      {/* ====================================================== */}

      <header className="
        border-b
        border-border
        px-4
        py-3
        flex
        items-center
        gap-3
        sticky
        top-0
        z-20
      "
      style={{
        background:
          "rgba(13,24,17,0.98)",
        backdropFilter:
          "blur(8px)",
      }}
      >

        <button
          onClick={() =>
            onNavigate(
              "orgHub"
            )
          }
          className="
            w-9
            h-9
            rounded-lg
            border
            border-border
            flex
            items-center
            justify-center
            text-muted-foreground
            hover:text-foreground
          "
          title="Back"
        >
          <ChevronLeft
            size={18}
          />
        </button>

        <div className="
          flex-1
          min-w-0
        ">
          <p className="
            font-mono
            text-[10px]
            uppercase
            tracking-[0.18em]
            text-primary
          ">
            Tournament Setup
          </p>

          <h1 className="
            font-display
            text-xl
            truncate
          ">
            {room?.name ??
              "Premier League"}
          </h1>
        </div>

        {savedMessage && (
          <span className="
            font-mono
            text-[10px]
            text-primary
            hidden
            sm:block
          ">
            {savedMessage}
          </span>
        )}

        <button
          onClick={
            save
          }
          className="
            px-3
            h-9
            rounded-lg
            border
            border-border
            font-mono
            text-xs
            text-muted-foreground
            hover:text-foreground
            flex
            items-center
            gap-1.5
          "
        >
          <Save
            size={13}
          />
          Save
        </button>

      </header>

      {/* ====================================================== */}
      {/* SETUP NAVIGATION                                         */}
      {/* ====================================================== */}

      <div className="
        border-b
        border-border
        px-4
        py-3
        sticky
        top-[57px]
        z-10
      "
      style={{
        background:
          "rgba(13,24,17,0.98)",
        backdropFilter:
          "blur(8px)",
      }}
      >

        <div className="
          max-w-2xl
          mx-auto
          grid
          grid-cols-3
          gap-2
        ">

          <SetupTab
            active={
              activeSection ===
              "players"
            }
            icon={
              <Users
                size={14}
              />
            }
            label="Players"
            value={`${players.length} players`}
            onClick={() =>
              setActiveSection(
                "players"
              )
            }
          />

          <SetupTab
            active={
              activeSection ===
              "format"
            }
            icon={
              <Settings2
                size={14}
              />
            }
            label="Format"
            value={
              gameType ===
              "pl-mix"
                ? `PL Mix · ${customSequence.length} frames`
                : `${gameType} · BO${bestOf}`
            }
            onClick={() =>
              setActiveSection(
                "format"
              )
            }
          />

          <SetupTab
            active={
              activeSection ===
              "schedule"
            }
            icon={
              <CalendarDays
                size={14}
              />
            }
            label="Schedule"
            value={
              gameType === "pl-mix"
                ? `${schedule.length} matches`
                : `${players.length} players`
            }
            onClick={() =>
              setActiveSection(
                "schedule"
              )
            }
          />

        </div>
      </div>

      {/* ====================================================== */}
      {/* CONTENT                                                   */}
      {/* ====================================================== */}

      <main className="
        flex-1
        overflow-y-auto
        px-4
        py-5
        pb-16
      ">

        <div className="
          max-w-2xl
          mx-auto
        ">

          {/* ================================================== */}
          {/* ERROR                                                */}
          {/* ================================================== */}

          {error && (
            <div className="
              mb-4
              px-4
              py-3
              rounded-xl
              border
              border-red-400/30
              bg-red-400/5
              text-red-400
              font-mono
              text-xs
            ">
              {error}
            </div>
          )}

          {/* ================================================== */}
          {/* PLAYERS                                               */}
          {/* ================================================== */}

          {activeSection ===
            "players" && (
            <section>

              <div className="
                bg-card
                border
                border-border
                rounded-2xl
                p-5
              ">

                <div className="
                  flex
                  items-center
                  gap-3
                  mb-5
                ">
                  <Users
                    size={18}
                    className="text-primary"
                  />

                  <div>
                    <h2 className="
                      font-display
                      text-xl
                    ">
                      Players
                    </h2>

                    <p className="
                      font-mono
                      text-[10px]
                      text-muted-foreground
                    ">
                      {gameType === "pl-mix"
                        ? "Add everyone taking part in the league."
                        : "Build the player pool for the knockout tournament."}
                    </p>
                  </div>
                </div>

                {/* TOURNAMENT NAME */}

                <FieldLabel>
                  Tournament Name
                </FieldLabel>

                <input
                  value={
                    title
                  }
                  onChange={(
                    event
                  ) => {
                    setTitle(
                      event.target.value
                    );
                    setError("");
                  }}
                  placeholder="Tournament name"
                  className="
                    w-full
                    h-11
                    px-3
                    rounded-lg
                    bg-background
                    border
                    border-border
                    font-display
                    text-base
                    outline-none
                    focus:border-primary/40
                    mb-5
                  "
                />

                {/* EXCEL IMPORT */}

                <div className="
                  mb-4
                  rounded-xl
                  border
                  border-primary/20
                  bg-primary/5
                  p-3
                ">
                  <div className="
                    flex
                    items-center
                    justify-between
                    gap-3
                  ">
                    <div className="min-w-0">
                      <p className="
                        font-display
                        text-sm
                      ">
                        Import Player Sheet
                      </p>

                      <p className="
                        font-mono
                        text-[9px]
                        text-muted-foreground
                        mt-1
                        leading-relaxed
                      ">
                        Export your Excel sheet as CSV. Use columns such as Player Name, Club, Country and Handicap.
                        CSV/TSV import works without any extra package.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        excelInputRef.current?.click()
                      }
                      disabled={excelImporting}
                      className="
                        flex-shrink-0
                        h-9
                        px-3
                        rounded-lg
                        bg-primary
                        text-primary-foreground
                        font-mono
                        text-[10px]
                        font-semibold
                        flex
                        items-center
                        gap-1.5
                        disabled:opacity-50
                      "
                    >
                      <Upload size={12} />
                      {excelImporting
                        ? "Importing..."
                        : "Import CSV"}
                    </button>

                    <input
                      ref={excelInputRef}
                      type="file"
                      accept=".csv,.tsv,.txt"
                      className="hidden"
                      onChange={
                        handleExcelChange
                      }
                    />
                  </div>

                  {excelMessage && (
                    <p className="
                      mt-2
                      font-mono
                      text-[9px]
                      text-primary
                    ">
                      {excelMessage}
                    </p>
                  )}
                </div>

                {/* PLAYER SEARCH */}

                {players.length > 0 && (
                  <div className="mb-3">
                    <input
                      value={playerSearch}
                      onChange={(event) =>
                        setPlayerSearch(
                          event.target.value
                        )
                      }
                      placeholder="Search players, clubs or countries..."
                      className="
                        w-full
                        h-10
                        px-3
                        rounded-lg
                        bg-background
                        border
                        border-border
                        font-mono
                        text-xs
                        outline-none
                        focus:border-primary/40
                      "
                    />
                  </div>
                )}

                {/* PLAYER LIST */}

                <div className="
                  space-y-2
                ">

                  {filteredPlayers.map(
                    (
                      player,
                      index
                    ) => (
                      <div
                        key={
                          player.id
                        }
                        className="
                          border
                          border-border
                          rounded-xl
                          p-3
                          bg-background
                        "
                      >

                        <div className="
                          flex
                          items-center
                          gap-3
                        ">

                          <div className="
                            w-8
                            h-8
                            rounded-full
                            bg-primary/10
                            text-primary
                            flex
                            items-center
                            justify-center
                            font-mono
                            text-xs
                          ">
                            {index +
                              1}
                          </div>

                          <div className="
                            flex-1
                            min-w-0
                          ">

                            <input
                              value={
                                player.name
                              }
                              onChange={(
                                event
                              ) =>
                                updatePlayer(
                                  player.id,
                                  {
                                    name:
                                      event
                                        .target
                                        .value,
                                  }
                                )
                              }
                              placeholder="Player name"
                              className="
                                w-full
                                h-9
                                px-2
                                rounded-lg
                                bg-card
                                border
                                border-border
                                font-display
                                text-sm
                                outline-none
                                focus:border-primary/40
                              "
                            />

                          </div>

                          <button
                            onClick={() =>
                              removePlayer(
                                player.id
                              )
                            }
                            className="
                              w-9
                              h-9
                              rounded-lg
                              border
                              border-border
                              flex
                              items-center
                              justify-center
                              text-muted-foreground
                              hover:text-red-400
                            "
                            title="Remove player"
                          >
                            <Trash2
                              size={13}
                            />
                          </button>

                        </div>

                        <div className="
                          grid
                          grid-cols-2
                          gap-2
                          mt-2
                        ">

                          <input
                            value={
                              player.club ??
                              ""
                            }
                            onChange={(
                              event
                            ) =>
                              updatePlayer(
                                player.id,
                                {
                                  club:
                                    event
                                      .target
                                      .value ||
                                    undefined,
                                }
                              )
                            }
                            placeholder="Club"
                            className="
                              h-9
                              px-2
                              rounded-lg
                              bg-card
                              border
                              border-border
                              font-mono
                              text-xs
                              outline-none
                            "
                          />

                          <div className="
                            h-9
                            rounded-lg
                            bg-card
                            border
                            border-border
                            flex
                            items-center
                            px-2
                            gap-2
                          ">

                            <span className="
                              font-mono
                              text-[9px]
                              text-muted-foreground
                              uppercase
                            ">
                              Handicap
                            </span>

                            <button
                              onClick={() =>
                                adjustHandicap(
                                  player.id,
                                  -5
                                )
                              }
                              className="
                                ml-auto
                                w-6
                                h-6
                                rounded
                                border
                                border-border
                                font-mono
                                text-xs
                              "
                            >
                              −
                            </button>

                            <span className="
                              w-7
                              text-center
                              font-mono
                              text-xs
                            ">
                              {
                                handicaps[
                                  player.id
                                ] ??
                                0
                              }
                            </span>

                            <button
                              onClick={() =>
                                adjustHandicap(
                                  player.id,
                                  5
                                )
                              }
                              className="
                                w-6
                                h-6
                                rounded
                                border
                                border-border
                                font-mono
                                text-xs
                              "
                            >
                              +
                            </button>

                          </div>

                        </div>

                      </div>
                    )
                  )}

                </div>

                {/* ADD PLAYER */}

                <div className="
                  mt-4
                  border
                  border-dashed
                  border-border
                  rounded-xl
                  p-3
                ">

                  <div className="
                    grid
                    grid-cols-2
                    gap-2
                  ">

                    <input
                      value={
                        newPlayerName
                      }
                      onChange={(
                        event
                      ) =>
                        setNewPlayerName(
                          event.target.value
                        )
                      }
                      onKeyDown={(
                        event
                      ) => {
                        if (
                          event.key ===
                          "Enter"
                        ) {
                          addPlayer();
                        }
                      }}
                      placeholder="Player name"
                      className="
                        h-10
                        px-3
                        rounded-lg
                        bg-background
                        border
                        border-border
                        font-mono
                        text-xs
                        outline-none
                      "
                    />

                    <input
                      value={
                        newPlayerClub
                      }
                      onChange={(
                        event
                      ) =>
                        setNewPlayerClub(
                          event.target.value
                        )
                      }
                      placeholder="Club"
                      className="
                        h-10
                        px-3
                        rounded-lg
                        bg-background
                        border
                        border-border
                        font-mono
                        text-xs
                        outline-none
                      "
                    />

                  </div>

                  <button
                    onClick={
                      addPlayer
                    }
                    className="
                      w-full
                      mt-2
                      h-10
                      rounded-lg
                      bg-primary/10
                      border
                      border-primary/30
                      text-primary
                      font-mono
                      text-xs
                      font-semibold
                      flex
                      items-center
                      justify-center
                      gap-1.5
                    "
                  >
                    <Plus
                      size={13}
                    />
                    Add Player
                  </button>

                </div>

                {players.length >=
                  2 && (
                  <button
                    onClick={() =>
                      setActiveSection(
                        "format"
                      )
                    }
                    className="
                      w-full
                      mt-4
                      h-12
                      rounded-xl
                      bg-primary
                      text-primary-foreground
                      font-mono
                      text-sm
                      font-semibold
                      flex
                      items-center
                      justify-center
                      gap-2
                    "
                  >
                    Continue to Format
                    <ChevronRight
                      size={15}
                    />
                  </button>
                )}

              </div>

            </section>
          )}

          {/* ================================================== */}
          {/* FORMAT                                                */}
          {/* ================================================== */}

          {activeSection ===
            "format" && (
            <section>

              {/* GAME TYPE */}

              <div className="
                bg-card
                border
                border-border
                rounded-2xl
                p-5
              ">

                <div className="
                  flex
                  items-center
                  gap-3
                  mb-5
                ">
                  <Settings2
                    size={18}
                    className="text-primary"
                  />

                  <div>
                    <h2 className="
                      font-display
                      text-xl
                    ">
                      Match Format
                    </h2>

                    <p className="
                      font-mono
                      text-[10px]
                      text-muted-foreground
                    ">
                      Configure exactly how
                      every match is played.
                    </p>
                  </div>
                </div>

                <FieldLabel>
                  Game Type
                </FieldLabel>

                <div className="
                  grid
                  grid-cols-3
                  gap-2
                  mb-5
                ">

                  <FormatButton
                    active={
                      gameType ===
                      "snooker"
                    }
                    label="Snooker"
                    onClick={() =>
                      changeGameType(
                        "snooker"
                      )
                    }
                  />

                  <FormatButton
                    active={
                      gameType ===
                      "billiards"
                    }
                    label="Billiards"
                    onClick={() =>
                      changeGameType(
                        "billiards"
                      )
                    }
                  />

                  <FormatButton
                    active={
                      gameType ===
                      "pl-mix"
                    }
                    label="PL Mix"
                    onClick={() =>
                      changeGameType(
                        "pl-mix"
                      )
                    }
                  />

                </div>

                {/* ========================================== */}
                {/* PL MIX BUILDER                              */}
                {/* ========================================== */}

                {gameType ===
                  "pl-mix" ? (
                  <PLMixBuilder
                    sequence={
                      customSequence
                    }
                    bestOf={
                      bestOf
                    }
                    onBestOf={
                      changeBestOf
                    }
                    onGameChange={
                      changeFrameGame
                    }
                    onUpdateFrame={
                      updateFrame
                    }
                    onMoveFrame={
                      moveFrame
                    }
                    onRemoveFrame={
                      removeFrame
                    }
                    onAddFrame={
                      addFrame
                    }
                  />
                ) : (
                  <>
                    {/* BEST OF */}

                    <FieldLabel>
                      Best Of
                    </FieldLabel>

                    <div className="
                      grid
                      grid-cols-5
                      gap-2
                      mb-5
                    ">
                      {[3, 5, 7, 9, 11].map(
                        (value) => (
                          <FormatButton
                            key={
                              value
                            }
                            active={
                              bestOf ===
                              value
                            }
                            label={`BO${value}`}
                            onClick={() =>
                              changeBestOf(
                                value
                              )
                            }
                          />
                        )
                      )}
                    </div>

                    {/* STANDARD BILL SETTINGS */}

                    {gameType ===
                      "billiards" && (
                      <StandardBilliardsSettings
                        billMode={
                          billMode
                        }
                        billTarget={
                          billTarget
                        }
                        billDuration={
                          billDuration
                        }
                        setBillMode={
                          setBillMode
                        }
                        setBillTarget={
                          setBillTarget
                        }
                        setBillDuration={
                          setBillDuration
                        }
                      />
                    )}
                  </>
                )}

                {/* ========================================== */}
                {/* SHOT CLOCK                                 */}
                {/* ========================================== */}

                <div className="
                  border-t
                  border-border
                  pt-5
                  mt-5
                ">

                  <FieldLabel>
                    Shot Clock
                  </FieldLabel>

                  <div className="
                    grid
                    grid-cols-4
                    gap-2
                  ">
                    {[0, 10, 15, 20, 25, 30, 40].map(
                      (value) => (
                        <button
                          key={
                            value
                          }
                          onClick={() =>
                            setShotSecs(
                              value
                            )
                          }
                          className={`
                            h-10
                            rounded-lg
                            border
                            font-mono
                            text-xs
                            ${
                              shotSecs ===
                              value
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-border text-muted-foreground"
                            }
                          `}
                        >
                          {value ===
                          0
                            ? "Off"
                            : `${value}s`}
                        </button>
                      )
                    )}
                  </div>

                </div>

                {/* ========================================== */}
                {/* MATCH MODE                                  */}
                {/* ========================================== */}

                <div className="
                  border-t
                  border-border
                  pt-5
                  mt-5
                ">

                  <FieldLabel>
                    Match Mode
                  </FieldLabel>

                  <div className="
                    grid
                    grid-cols-2
                    gap-2
                  ">

                    <FormatButton
                      active={
                        matchMode ===
                        "singles"
                      }
                      label="Singles"
                      onClick={() =>
                        setMatchMode(
                          "singles"
                        )
                      }
                    />

                    <FormatButton
                      active={
                        matchMode ===
                        "doubles"
                      }
                      label="Doubles"
                      onClick={() =>
                        setMatchMode(
                          "doubles"
                        )
                      }
                    />

                  </div>

                </div>

              </div>

              {/* NEXT */}

              <button
                onClick={() =>
                  setActiveSection(
                    "schedule"
                  )
                }
                className="
                  w-full
                  mt-4
                  h-12
                  rounded-xl
                  bg-primary
                  text-primary-foreground
                  font-mono
                  text-sm
                  font-semibold
                  flex
                  items-center
                  justify-center
                  gap-2
                "
              >
                Continue to Schedule
                <ChevronRight
                  size={15}
                />
              </button>

            </section>
          )}

          {/* ================================================== */}
          {/* SCHEDULE                                              */}
          {/* ================================================== */}

          {activeSection ===
            "schedule" && (
            <section>

              <div className="
                bg-card
                border
                border-border
                rounded-2xl
                overflow-hidden
              ">

                <div className="
                  p-5
                  border-b
                  border-border
                ">

                  <div className="
                    flex
                    items-center
                    justify-between
                    gap-3
                  ">

                    <div>
                      <div className="
                        flex
                        items-center
                        gap-2
                      ">
                        <CalendarDays
                          size={17}
                          className="text-primary"
                        />

                        <h2 className="
                          font-display
                          text-xl
                        ">
                          Schedule
                        </h2>
                      </div>

                      <p className="
                        font-mono
                        text-[10px]
                        text-muted-foreground
                        mt-1
                      ">
                        {gameType === "pl-mix"
                          ? "Generate the round-robin matches."
                          : "Knockout matches are managed from the Match Room."}
                      </p>
                    </div>

                    {gameType === "pl-mix" && (
                      <button
                        onClick={
                          generateSchedule
                        }
                        className="
                          px-3
                          h-9
                          rounded-lg
                          bg-primary
                          text-primary-foreground
                          font-mono
                          text-xs
                          font-semibold
                          flex
                          items-center
                          gap-1.5
                        "
                      >
                        <CalendarDays
                          size={13}
                        />
                        Generate
                      </button>
                    )}

                  </div>

                </div>

                {gameType !== "pl-mix" ? (
                  <div className="
                    p-6
                    text-center
                  ">
                    <Trophy
                      size={25}
                      className="
                        mx-auto
                        text-primary/50
                      "
                    />

                    <p className="
                      font-display
                      text-base
                      mt-3
                    ">
                      Knockout Tournament
                    </p>

                    <p className="
                      font-mono
                      text-xs
                      text-muted-foreground
                      mt-1
                      leading-relaxed
                    ">
                      Your imported players are ready.
                      Knockout matches will be managed
                      directly from the Match Room.
                    </p>
                  </div>
                ) : schedule.length >
                0 ? (
                  <div>
                    {schedule.map(
                      (
                        match
                      ) => (
                        <ScheduleRow
                          key={
                            match.id
                          }
                          match={
                            match
                          }
                          player1={
                            playerName(
                              match.player1Id
                            )
                          }
                          player2={
                            playerName(
                              match.player2Id
                            )
                          }
                          onResult={
                            setMatchResult
                          }
                        />
                      )
                    )}
                  </div>
                ) : (
                  <div className="
                    p-8
                    text-center
                  ">
                    <CalendarDays
                      size={25}
                      className="
                        mx-auto
                        text-muted-foreground/30
                      "
                    />

                    <p className="
                      font-display
                      text-base
                      mt-3
                    ">
                      No schedule yet
                    </p>

                    <p className="
                      font-mono
                      text-xs
                      text-muted-foreground
                      mt-1
                    ">
                      {gameType === "pl-mix"
                        ? "Generate the round-robin when your players are ready."
                        : "Knockout fixtures will be created and managed from the Match Room."}
                    </p>
                  </div>
                )}

              </div>

              {/* STANDINGS */}

              {gameType === "pl-mix" &&
                standings.length > 0 && (
                <div className="
                  mt-4
                  bg-card
                  border
                  border-border
                  rounded-2xl
                  overflow-hidden
                ">

                  <div className="
                    p-4
                    border-b
                    border-border
                  ">
                    <div className="
                      flex
                      items-center
                      justify-between
                      gap-3
                    ">
                      <div className="flex items-center gap-2">
                        <Trophy
                          size={16}
                          className="text-primary"
                        />
                        <div>
                          <h3 className="font-display text-lg">
                            Standings
                          </h3>
                          <p className="font-mono text-[9px] text-muted-foreground mt-0.5">
                            {manualStandings
                              ? "Manual correction active"
                              : "Calculated from match results"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!editingStandings ? (
                          <button
                            onClick={startStandingsEdit}
                            className="h-8 px-3 rounded-lg border border-border font-mono text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1.5"
                          >
                            <Pencil size={11} />
                            Edit
                          </button>
                        ) : (
                          <button
                            onClick={saveStandingsEdit}
                            className="h-8 px-3 rounded-lg bg-primary text-primary-foreground font-mono text-[10px] font-semibold flex items-center gap-1.5"
                          >
                            <Save size={11} />
                            Done
                          </button>
                        )}

                        <button
                          onClick={recalculateStandings}
                          className="h-8 px-3 rounded-lg border border-border font-mono text-[10px] text-muted-foreground hover:text-foreground"
                        >
                          Recalculate
                        </button>
                      </div>
                    </div>

                    {editingStandings && (
                      <p className="mt-3 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15 font-mono text-[9px] text-muted-foreground leading-relaxed">
                        Edit Played, Wins and Points directly. Match results remain the source for automatic standings; use Recalculate to restore them.
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2 border-b border-border font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                    <span>Player</span>
                    <span className="w-12 text-center">P</span>
                    <span className="w-12 text-center">W</span>
                    <span className="w-14 text-center">Pts</span>
                  </div>

                  {standings.map(
                    (standing, index) => (
                      <div
                        key={standing.playerId}
                        className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-4 py-3 border-b border-border last:border-b-0"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-6 font-mono text-xs text-muted-foreground">
                            {index + 1}
                          </span>
                          <span className="font-display text-sm truncate">
                            {playerName(standing.playerId)}
                          </span>
                        </div>

                        {editingStandings ? (
                          <StandingInput
                            value={standing.played}
                            onChange={(value) =>
                              updateStandingValue(
                                standing.playerId,
                                "played",
                                value
                              )
                            }
                          />
                        ) : (
                          <span className="w-12 text-center font-mono text-xs text-muted-foreground">
                            {standing.played}
                          </span>
                        )}

                        {editingStandings ? (
                          <StandingInput
                            value={standing.won}
                            onChange={(value) =>
                              updateStandingValue(
                                standing.playerId,
                                "won",
                                value
                              )
                            }
                          />
                        ) : (
                          <span className="w-12 text-center font-mono text-xs text-muted-foreground">
                            {standing.won}
                          </span>
                        )}

                        {editingStandings ? (
                          <StandingInput
                            value={standing.points}
                            wide
                            onChange={(value) =>
                              updateStandingValue(
                                standing.playerId,
                                "points",
                                value
                              )
                            }
                          />
                        ) : (
                          <span className="w-14 text-center font-mono text-xs text-primary font-semibold">
                            {standing.points}
                          </span>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}

              {/* START */}

              <div className="
                mt-4
                bg-card
                border
                border-border
                rounded-2xl
                p-4
              ">

                <div className="
                  flex
                  items-center
                  gap-3
                  mb-4
                ">

                  <div className="
                    w-10
                    h-10
                    rounded-xl
                    bg-primary/10
                    flex
                    items-center
                    justify-center
                  ">
                    <Play
                      size={17}
                      className="text-primary"
                    />
                  </div>

                  <div>
                    <p className="
                      font-display
                      text-base
                    ">
                      Tournament Ready
                    </p>

                    <p className="
                      font-mono
                      text-[10px]
                      text-muted-foreground
                    ">
                      {gameType === "pl-mix"
                        ? "Save the tournament and return to the Match Room."
                        : "Save the knockout tournament and manage matches from the Match Room."}
                    </p>
                  </div>

                </div>

                <button
                  onClick={
                    startTournament
                  }
                  disabled={
                    isStarting
                  }
                  className="
                    w-full
                    h-12
                    rounded-xl
                    bg-primary
                    text-primary-foreground
                    font-mono
                    text-sm
                    font-semibold
                    flex
                    items-center
                    justify-center
                    gap-2
                    disabled:opacity-50
                  "
                >
                  <Play
                    size={15}
                  />

                  {isStarting
                    ? "Starting..."
                    : "Start Tournament"}
                </button>

              </div>

            </section>
          )}

        </div>

      </main>
    </div>
  );
}

/* ============================================================ */
/* PL MIX BUILDER                                                 */
/* ============================================================ */

function PLMixBuilder({
  sequence,
  bestOf,
  onBestOf,
  onGameChange,
  onUpdateFrame,
  onMoveFrame,
  onRemoveFrame,
  onAddFrame,
}: {
  sequence: FrameDef[];
  bestOf: number;
  onBestOf: (
    value: number
  ) => void;
  onGameChange: (
    index: number,
    type:
      | "snooker"
      | "billiards"
  ) => void;
  onUpdateFrame: (
    index: number,
    patch: Partial<FrameDef>
  ) => void;
  onMoveFrame: (
    index: number,
    direction: -1 | 1
  ) => void;
  onRemoveFrame: (
    index: number
  ) => void;
  onAddFrame: (
    type:
      | "snooker"
      | "billiards"
  ) => void;
}) {
  return (
    <div>

      {/* ====================================================== */}
      {/* PL MIX HEADER                                           */}
      {/* ====================================================== */}

      <div className="
        rounded-xl
        border
        border-primary/30
        bg-primary/5
        p-4
        mb-5
      ">

        <div className="
          flex
          items-start
          gap-3
        ">

          <div className="
            w-9
            h-9
            rounded-lg
            bg-primary/10
            flex
            items-center
            justify-center
            flex-shrink-0
          ">
            <Settings2
              size={16}
              className="text-primary"
            />
          </div>

          <div>
            <p className="
              font-display
              text-base
            ">
              PL Mix — Fully Custom
            </p>

            <p className="
              font-mono
              text-[10px]
              text-muted-foreground
              mt-1
              leading-relaxed
            ">
              Every frame can be independently
              changed between Snooker and
              Billiards. Configure the reds,
              points target or time for each
              frame.
            </p>
          </div>

        </div>

      </div>

      {/* ====================================================== */}
      {/* BEST OF                                                  */}
      {/* ====================================================== */}

      <FieldLabel>
        Match Length
      </FieldLabel>

      <div className="
        grid
        grid-cols-5
        gap-2
        mb-2
      ">
        {[3, 5, 7, 9, 11].map(
          (value) => (
            <button
              key={
                value
              }
              onClick={() =>
                onBestOf(
                  value
                )
              }
              className={`
                h-10
                rounded-lg
                border
                font-mono
                text-xs
                ${
                  bestOf ===
                  value
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }
              `}
            >
              BO{value}
            </button>
          )
        )}
      </div>

      <p className="
        font-mono
        text-[10px]
        text-muted-foreground
        mb-5
      ">
        Best of {bestOf} · First to{" "}
        {Math.ceil(
          bestOf / 2
        )} wins
      </p>

      {/* ====================================================== */}
      {/* FRAME SEQUENCE                                           */}
      {/* ====================================================== */}

      <div className="
        flex
        items-center
        justify-between
        mb-3
      ">

        <div>
          <FieldLabel>
            Frame Sequence
          </FieldLabel>

          <p className="
            font-mono
            text-[9px]
            text-muted-foreground
            -mt-1
          ">
            Each frame is independently
            configurable.
          </p>
        </div>

        <span className="
          px-2
          py-1
          rounded
          bg-primary/10
          text-primary
          font-mono
          text-[10px]
        ">
          {sequence.length} frames
        </span>

      </div>

      <div className="
        space-y-3
      ">

        {sequence.map(
          (
            frame,
            index
          ) => (
            <div
              key={
                index
              }
              className="
                bg-background
                border
                border-border
                rounded-xl
                overflow-hidden
              "
            >

              {/* ============================================ */}
              {/* FRAME HEADER                                  */}
              {/* ============================================ */}

              <div className="
                p-3
                flex
                items-center
                gap-2
              ">

                <div className="
                  w-8
                  h-8
                  rounded-lg
                  bg-primary/10
                  text-primary
                  flex
                  items-center
                  justify-center
                  font-mono
                  text-xs
                  flex-shrink-0
                ">
                  {index +
                    1}
                </div>

                {/* GAME DROPDOWN */}

                <div className="
                  flex-1
                  min-w-0
                ">

                  <label className="
                    block
                    font-mono
                    text-[9px]
                    uppercase
                    tracking-wider
                    text-muted-foreground
                    mb-1
                  ">
                    Game
                  </label>

                  <select
                    value={
                      frame.type
                    }
                    onChange={(
                      event
                    ) =>
                      onGameChange(
                        index,
                        event
                          .target
                          .value as
                          | "snooker"
                          | "billiards"
                      )
                    }
                    className="
                      w-full
                      h-9
                      px-2
                      rounded-lg
                      bg-card
                      border
                      border-border
                      font-mono
                      text-xs
                      text-foreground
                      outline-none
                      focus:border-primary/40
                    "
                  >

                    <option value="snooker">
                      Snooker
                    </option>

                    <option value="billiards">
                      English Billiards
                    </option>

                  </select>

                </div>

                {/* MOVE */}

                <div className="
                  flex
                  gap-1
                  pt-4
                ">

                  <button
                    onClick={() =>
                      onMoveFrame(
                        index,
                        -1
                      )
                    }
                    disabled={
                      index ===
                      0
                    }
                    className="
                      w-8
                      h-8
                      rounded-lg
                      border
                      border-border
                      flex
                      items-center
                      justify-center
                      text-muted-foreground
                      disabled:opacity-20
                    "
                    title="Move up"
                  >
                    <ArrowUp
                      size={11}
                    />
                  </button>

                  <button
                    onClick={() =>
                      onMoveFrame(
                        index,
                        1
                      )
                    }
                    disabled={
                      index ===
                      sequence.length -
                        1
                    }
                    className="
                      w-8
                      h-8
                      rounded-lg
                      border
                      border-border
                      flex
                      items-center
                      justify-center
                      text-muted-foreground
                      disabled:opacity-20
                    "
                    title="Move down"
                  >
                    <ArrowDown
                      size={11}
                    />
                  </button>

                  <button
                    onClick={() =>
                      onRemoveFrame(
                        index
                      )
                    }
                    disabled={
                      sequence.length <=
                      1
                    }
                    className="
                      w-8
                      h-8
                      rounded-lg
                      border
                      border-border
                      flex
                      items-center
                      justify-center
                      text-muted-foreground
                      hover:text-red-400
                      disabled:opacity-20
                    "
                    title="Remove frame"
                  >
                    <Trash2
                      size={11}
                    />
                  </button>

                </div>

              </div>

              {/* ============================================ */}
              {/* SNOOKER SETTINGS                             */}
              {/* ============================================ */}

              {frame.type ===
                "snooker" && (
                <div className="
                  border-t
                  border-border
                  p-3
                  bg-card/30
                ">

                  <FieldLabel>
                    Reds
                  </FieldLabel>

                  <div className="
                    grid
                    grid-cols-5
                    gap-2
                  ">

                    {[1, 3, 6, 10, 15].map(
                      (reds) => (
                        <button
                          key={
                            reds
                          }
                          onClick={() =>
                            onUpdateFrame(
                              index,
                              {
                                reds,
                              }
                            )
                          }
                          className={`
                            h-9
                            rounded-lg
                            border
                            font-mono
                            text-xs
                            ${
                              frame.reds ===
                              reds
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-border text-muted-foreground"
                            }
                          `}
                        >
                          {reds} reds
                        </button>
                      )
                    )}

                  </div>

                  {/* EXACT REDS */}

                  <div className="
                    mt-3
                    flex
                    items-center
                    gap-2
                  ">

                    <span className="
                      font-mono
                      text-[10px]
                      text-muted-foreground
                    ">
                      Or enter exact reds
                    </span>

                    <input
                      type="number"
                      min={1}
                      max={15}
                      value={
                        frame.reds
                      }
                      onChange={(
                        event
                      ) => {
                        const value =
                          Math.max(
                            1,
                            Math.min(
                              15,
                              Number(
                                event
                                  .target
                                  .value
                              )
                            )
                          );

                        onUpdateFrame(
                          index,
                          {
                            reds:
                              value,
                          }
                        );
                      }}
                      className="
                        ml-auto
                        w-20
                        h-8
                        px-2
                        rounded-lg
                        bg-background
                        border
                        border-border
                        font-mono
                        text-xs
                        text-center
                      "
                    />

                  </div>

                </div>
              )}

              {/* ============================================ */}
              {/* BILLIARDS SETTINGS                            */}
              {/* ============================================ */}

              {frame.type ===
                "billiards" && (
                <div className="
                  border-t
                  border-border
                  p-3
                  bg-card/30
                ">

                  <FieldLabel>
                    Billiards Mode
                  </FieldLabel>

                  <div className="
                    grid
                    grid-cols-2
                    gap-2
                    mb-4
                  ">

                    <button
                      onClick={() =>
                        onUpdateFrame(
                          index,
                          {
                            billMode:
                              "points",
                          }
                        )
                      }
                      className={`
                        h-9
                        rounded-lg
                        border
                        font-mono
                        text-xs
                        ${
                          frame.billMode ===
                          "points"
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-border text-muted-foreground"
                        }
                      `}
                    >
                      Points
                    </button>

                    <button
                      onClick={() =>
                        onUpdateFrame(
                          index,
                          {
                            billMode:
                              "time",
                          }
                        )
                      }
                      className={`
                        h-9
                        rounded-lg
                        border
                        font-mono
                        text-xs
                        ${
                          frame.billMode ===
                          "time"
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-border text-muted-foreground"
                        }
                      `}
                    >
                      Timed
                    </button>

                  </div>

                  {frame.billMode ===
                  "points" ? (
                    <>

                      <FieldLabel>
                        Target Points
                      </FieldLabel>

                      <div className="
                        grid
                        grid-cols-5
                        gap-2
                      ">

                        {[100, 150, 200, 300, 500].map(
                          (target) => (
                            <button
                              key={
                                target
                              }
                              onClick={() =>
                                onUpdateFrame(
                                  index,
                                  {
                                    billTarget:
                                      target,
                                  }
                                )
                              }
                              className={`
                                h-9
                                rounded-lg
                                border
                                font-mono
                                text-xs
                                ${
                                  frame.billTarget ===
                                  target
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : "border-border text-muted-foreground"
                                }
                              `}
                            >
                              {target}
                            </button>
                          )
                        )}

                      </div>

                      <div className="
                        mt-3
                        flex
                        items-center
                        gap-2
                      ">

                        <span className="
                          font-mono
                          text-[10px]
                          text-muted-foreground
                        ">
                          Custom target
                        </span>

                        <input
                          type="number"
                          min={1}
                          value={
                            frame.billTarget
                          }
                          onChange={(
                            event
                          ) =>
                            onUpdateFrame(
                              index,
                              {
                                billTarget:
                                  Math.max(
                                    1,
                                    Number(
                                      event
                                        .target
                                        .value
                                    )
                                  ),
                              }
                            )
                          }
                          className="
                            ml-auto
                            w-24
                            h-8
                            px-2
                            rounded-lg
                            bg-background
                            border
                            border-border
                            font-mono
                            text-xs
                            text-center
                          "
                        />

                      </div>

                    </>
                  ) : (
                    <>

                      <FieldLabel>
                        Frame Duration
                      </FieldLabel>

                      <select
                        value={
                          frame.billDuration
                        }
                        onChange={(
                          event
                        ) =>
                          onUpdateFrame(
                            index,
                            {
                              billDuration:
                                Number(
                                  event
                                    .target
                                    .value
                                ),
                            }
                          )
                        }
                        className="
                          w-full
                          h-10
                          px-3
                          rounded-lg
                          bg-background
                          border
                          border-border
                          font-mono
                          text-xs
                        "
                      >

                        {TIME_OPTIONS.map(
                          (
                            option
                          ) => (
                            <option
                              key={
                                option.value
                              }
                              value={
                                option.value
                              }
                            >
                              {
                                option.label
                              }
                            </option>
                          )
                        )}

                      </select>

                    </>
                  )}

                </div>
              )}

            </div>
          )
        )}

      </div>

      {/* ====================================================== */}
      {/* ADD GAME BUTTONS                                         */}
      {/* ====================================================== */}

      <div className="
        mt-4
        grid
        grid-cols-2
        gap-2
      ">

        <button
          onClick={() =>
            onAddFrame(
              "snooker"
            )
          }
          className="
            h-11
            rounded-xl
            border
            border-border
            bg-card
            font-mono
            text-xs
            text-muted-foreground
            hover:text-foreground
            hover:border-primary/40
            flex
            items-center
            justify-center
            gap-1.5
          "
        >
          <Plus
            size={13}
          />
          Snooker Frame
        </button>

        <button
          onClick={() =>
            onAddFrame(
              "billiards"
            )
          }
          className="
            h-11
            rounded-xl
            border
            border-border
            bg-card
            font-mono
            text-xs
            text-muted-foreground
            hover:text-foreground
            hover:border-primary/40
            flex
            items-center
            justify-center
            gap-1.5
          "
        >
          <Plus
            size={13}
          />
          Billiards Frame
        </button>

      </div>

      <div className="
        mt-3
        px-3
        py-2.5
        rounded-lg
        bg-background
        border
        border-border
      ">
        <p className="
          font-mono
          text-[9px]
          text-muted-foreground
          leading-relaxed
        ">
          Tip: You can use the dropdown on
          every frame to change the game.
          For example, BO7 can contain any
          combination of Snooker and English
          Billiards.
        </p>
      </div>

    </div>
  );
}

/* ============================================================ */
/* STANDARD BILLIARDS SETTINGS                                    */
/* ============================================================ */

function StandardBilliardsSettings({
  billMode,
  billTarget,
  billDuration,
  setBillMode,
  setBillTarget,
  setBillDuration,
}: {
  billMode: BillMode;
  billTarget: number;
  billDuration: number;
  setBillMode: (
    value: BillMode
  ) => void;
  setBillTarget: (
    value: number
  ) => void;
  setBillDuration: (
    value: number
  ) => void;
}) {
  return (
    <div className="
      border-t
      border-border
      pt-5
      mt-5
    ">

      <FieldLabel>
        Billiards Mode
      </FieldLabel>

      <div className="
        grid
        grid-cols-2
        gap-2
        mb-4
      ">

        <FormatButton
          active={
            billMode ===
            "points"
          }
          label="Points"
          onClick={() =>
            setBillMode(
              "points"
            )
          }
        />

        <FormatButton
          active={
            billMode ===
            "time"
          }
          label="Timed"
          onClick={() =>
            setBillMode(
              "time"
            )
          }
        />

      </div>

      {billMode ===
      "points" ? (
        <>
          <FieldLabel>
            Target Points
          </FieldLabel>

          <input
            type="number"
            min={1}
            value={
              billTarget
            }
            onChange={(
              event
            ) =>
              setBillTarget(
                Math.max(
                  1,
                  Number(
                    event
                      .target
                      .value
                  )
                )
              )
            }
            className="
              w-full
              h-11
              px-3
              rounded-lg
              bg-background
              border
              border-border
              font-mono
              text-sm
            "
          />
        </>
      ) : (
        <>
          <FieldLabel>
            Frame Duration
          </FieldLabel>

          <select
            value={
              billDuration
            }
            onChange={(
              event
            ) =>
              setBillDuration(
                Number(
                  event
                    .target
                    .value
                )
              )
            }
            className="
              w-full
              h-11
              px-3
              rounded-lg
              bg-background
              border
              border-border
              font-mono
              text-sm
            "
          >

            {TIME_OPTIONS.map(
              (
                option
              ) => (
                <option
                  key={
                    option.value
                  }
                  value={
                    option.value
                  }
                >
                  {
                    option.label
                  }
                </option>
              )
            )}

          </select>
        </>
      )}

    </div>
  );
}

/* ============================================================ */
/* SETUP TAB                                                      */
/* ============================================================ */

function SetupTab({
  active,
  icon,
  label,
  value,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={
        onClick
      }
      className={`
        p-3
        rounded-xl
        border
        text-left
        transition-all
        ${
          active
            ? "bg-primary/10 border-primary/30"
            : "bg-card border-border"
        }
      `}
    >

      <div className="
        flex
        items-center
        gap-1.5
        mb-1
      ">

        <span
          className={
            active
              ? "text-primary"
              : "text-muted-foreground"
          }
        >
          {icon}
        </span>

        <span className="
          font-mono
          text-[9px]
          uppercase
          tracking-wider
          text-muted-foreground
        ">
          {label}
        </span>

      </div>

      <p className="
        font-mono
        text-xs
        text-foreground
        truncate
      ">
        {value}
      </p>

    </button>
  );
}

/* ============================================================ */
/* FIELD LABEL                                                    */
/* ============================================================ */

function FieldLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <label className="
      block
      font-mono
      text-[10px]
      uppercase
      tracking-widest
      text-muted-foreground
      mb-2
    ">
      {children}
    </label>
  );
}

/* ============================================================ */
/* FORMAT BUTTON                                                  */
/* ============================================================ */

function FormatButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={
        onClick
      }
      className={`
        h-10
        rounded-lg
        border
        font-mono
        text-xs
        transition-all
        ${
          active
            ? "bg-primary border-primary text-primary-foreground"
            : "border-border text-muted-foreground hover:text-foreground"
        }
      `}
    >
      {label}
    </button>
  );
}

/* ============================================================ */
/* SCHEDULE ROW                                                   */
/* ============================================================ */

function ScheduleRow({
  match,
  player1,
  player2,
  onResult,
}: {
  match: ScheduledMatch;
  player1: string;
  player2: string;
  onResult: (
    matchId: string,
    winner:
      | "player1"
      | "player2"
      | "draw",
    score1: number,
    score2: number
  ) => void;
}) {
  const [editing, setEditing] =
    useState(false);

  const [score1, setScore1] =
    useState(match.result?.score[0] ?? 0);

  const [score2, setScore2] =
    useState(match.result?.score[1] ?? 0);

  const [winner, setWinner] =
    useState<"player1" | "player2" | "draw">(
      match.result?.winner ?? "draw"
    );

  function beginEdit() {
    setScore1(match.result?.score[0] ?? 0);
    setScore2(match.result?.score[1] ?? 0);
    setWinner(match.result?.winner ?? "draw");
    setEditing(true);
  }

  function saveEdit() {
    onResult(
      match.id,
      winner,
      Math.max(0, Math.round(score1)),
      Math.max(0, Math.round(score2))
    );
    setEditing(false);
  }

  function recordResult(
    nextWinner: "player1" | "player2" | "draw"
  ) {
    setWinner(nextWinner);
    onResult(
      match.id,
      nextWinner,
      Math.max(0, Math.round(score1)),
      Math.max(0, Math.round(score2))
    );
  }

  return (
    <div className="px-4 py-4 border-b border-border last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="w-10 flex-shrink-0">
          <p className="font-mono text-[9px] uppercase text-muted-foreground">
            Round
          </p>
          <p className="font-mono text-sm text-primary font-semibold">
            {match.round}
          </p>
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-display text-sm truncate">{player1}</p>
          <p className="font-mono text-[9px] text-muted-foreground">vs</p>
          <p className="font-display text-sm truncate">{player2}</p>
        </div>

        {match.status === "complete" && !editing ? (
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="font-mono text-sm text-primary font-semibold">
                {match.result?.score[0]} – {match.result?.score[1]}
              </p>
              <p className="font-mono text-[9px] text-muted-foreground">
                {match.result?.winner === "player1"
                  ? player1
                  : match.result?.winner === "player2"
                  ? player2
                  : "Draw"}
              </p>
            </div>

            <button
              onClick={beginEdit}
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40"
              title="Edit result"
            >
              <Pencil size={12} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              value={score1}
              onChange={(event) =>
                setScore1(Math.max(0, Number(event.target.value)))
              }
              className="w-12 h-9 rounded-lg bg-background border border-border text-center font-mono text-xs"
            />
            <span className="font-mono text-xs text-muted-foreground">–</span>
            <input
              type="number"
              min={0}
              value={score2}
              onChange={(event) =>
                setScore2(Math.max(0, Number(event.target.value)))
              }
              className="w-12 h-9 rounded-lg bg-background border border-border text-center font-mono text-xs"
            />
          </div>
        )}
      </div>

      {match.status !== "complete" && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => recordResult("player1")}
            className="flex-1 h-8 rounded-lg border border-border font-mono text-[10px] text-muted-foreground hover:text-primary"
          >
            {player1} wins
          </button>
          <button
            onClick={() => recordResult("draw")}
            className="px-4 h-8 rounded-lg border border-border font-mono text-[10px] text-muted-foreground"
          >
            Draw
          </button>
          <button
            onClick={() => recordResult("player2")}
            className="flex-1 h-8 rounded-lg border border-border font-mono text-[10px] text-muted-foreground hover:text-primary"
          >
            {player2} wins
          </button>
        </div>
      )}

      {editing && (
        <div className="mt-3 p-3 rounded-xl border border-primary/20 bg-primary/5">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => setWinner("player1")}
              className={`h-9 rounded-lg border font-mono text-[10px] ${
                winner === "player1"
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              {player1} wins
            </button>
            <button
              onClick={() => setWinner("player2")}
              className={`h-9 rounded-lg border font-mono text-[10px] ${
                winner === "player2"
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              {player2} wins
            </button>
            <button
              onClick={() => setWinner("draw")}
              className={`h-9 rounded-lg border font-mono text-[10px] col-span-2 ${
                winner === "draw"
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              Draw
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              className="flex-1 h-9 rounded-lg border border-border font-mono text-[10px] text-muted-foreground"
            >
              Cancel
            </button>
            <button
              onClick={saveEdit}
              className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground font-mono text-[10px] font-semibold flex items-center justify-center gap-1.5"
            >
              <Save size={11} />
              Save Result
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
/* STANDING INPUT                                                */
/* ============================================================ */

function StandingInput({
  value,
  onChange,
  wide = false,
}: {
  value: number;
  onChange: (value: number) => void;
  wide?: boolean;
}) {
  return (
    <input
      type="number"
      min={0}
      value={value}
      onChange={(event) =>
        onChange(Math.max(0, Number(event.target.value)))
      }
      className={`${wide ? "w-14" : "w-12"} h-8 rounded-lg bg-background border border-primary/25 text-center font-mono text-xs outline-none focus:border-primary/60`}
    />
  );
}
