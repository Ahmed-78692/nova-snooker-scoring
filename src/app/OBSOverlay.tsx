import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  Radio,
  Timer,
} from "lucide-react";

import type {
  FrameDef,
  LiveMatchState,
} from "./types";

import {
  loadAllMatchStates,
  loadMatchState,
  listenBroadcast,
} from "./sync";

interface Props {
  tableId?: string;
}

/* ================================================================
   HELPERS
   ============================================================== */

function formatClock(seconds: number) {
  const safe = Math.max(
    0,
    Math.floor(Number(seconds) || 0)
  );

  const h = Math.floor(safe / 3600);
  const m = Math.floor(
    (safe % 3600) / 60
  );
  const s = safe % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(
      2,
      "0"
    )}:${String(s).padStart(2, "0")}`;
  }

  return `${String(m).padStart(
    2,
    "0"
  )}:${String(s).padStart(2, "0")}`;
}

function getFrameDef(
  state: LiveMatchState
): FrameDef {
  const sequence =
    state.config.customSequence ?? [];

  if (sequence.length === 0) {
    return {
      type: "snooker",
      reds: 15,
      billMode: "points",
      billTarget: 300,
      billDuration: 3600,
    };
  }

  return (
    sequence[
      state.currentSeqIdx %
        sequence.length
    ] ?? sequence[0]
  );
}

function getPlayerName(
  state: LiveMatchState,
  side: 0 | 1
) {
  if (
    state.config.matchMode ===
    "doubles"
  ) {
    return (
      state.config.teams?.[side]?.name ??
      `Team ${side + 1}`
    );
  }

  return (
    state.config.players?.[side]?.name ??
    `Player ${side + 1}`
  );
}

function getPlayerPhoto(
  state: LiveMatchState,
  side: 0 | 1
) {
  if (
    state.config.matchMode ===
    "doubles"
  ) {
    return null;
  }

  return (
    state.config.players?.[side]
      ?.photo ?? null
  );
}

function getCurrentState(
  states: LiveMatchState[],
  tableId?: string
) {
  const liveStates = states.filter(
    (state) =>
      state.status === "active"
  );

  if (tableId) {
    return (
      liveStates.find(
        (state) =>
          state.config.tableId ===
          tableId
      ) ?? null
    );
  }

  return (
    liveStates
      .slice()
      .sort(
        (a, b) =>
          (a.config.tableNumber ??
            999) -
          (b.config.tableNumber ??
            999)
      )[0] ?? null
  );
}

/* ================================================================
   ROOT
   ============================================================== */

export default function OBSOverlay({
  tableId,
}: Props) {
  const [states, setStates] =
    useState<LiveMatchState[]>(() =>
      loadAllMatchStates()
    );

  useEffect(() => {
    const refresh = () => {
      setStates(
        loadAllMatchStates()
      );
    };

    refresh();

    const interval =
      window.setInterval(
        refresh,
        500
      );

    const unsubscribe =
      listenBroadcast(() => {
        refresh();
      });

    return () => {
      window.clearInterval(
        interval
      );

      unsubscribe();
    };
  }, []);

  const state = useMemo(
    () =>
      getCurrentState(
        states,
        tableId
      ),
    [states, tableId]
  );

  /*
   * OBS should have a completely transparent
   * page around the score strip.
   */
  useEffect(() => {
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.body.style.background =
      "transparent";
    document.documentElement.style.background =
      "transparent";

    return () => {
      document.body.style.background =
        "";
      document.documentElement.style.background =
        "";
    };
  }, []);

  if (!state) {
    return (
      <div className="fixed inset-0 pointer-events-none bg-transparent" />
    );
  }

  return (
    <OBSScoreStrip state={state} />
  );
}

/* ================================================================
   MAIN SCORE STRIP
   ============================================================== */

function OBSScoreStrip({
  state,
}: {
  state: LiveMatchState;
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
    matchElapsed,
    frameElapsed,
  } = state;

  const frameDef =
    getFrameDef(state);

  const isBilliards =
    frameDef.type ===
    "billiards";

  const frameScores =
    isBilliards
      ? bScores
      : framePts;

  const currentStriker =
    isBilliards
      ? bStriker
      : striker;

  const p1 =
    getPlayerName(state, 0);

  const p2 =
    getPlayerName(state, 1);

  const photo1 =
    getPlayerPhoto(state, 0);

  const photo2 =
    getPlayerPhoto(state, 1);

  const currentFrame =
    currentSeqIdx + 1;

  const totalFrames =
    Math.max(
      1,
      config.customSequence
        ?.length ?? 1
    );

  const liveInfo = isBilliards
    ? `VISIT ${bVisit}`
    : `BREAK ${brk}`;

  return (
    <div
      className="
        fixed
        left-1/2
        bottom-6
        -translate-x-1/2
        z-[999999]
        pointer-events-none
        w-[min(1180px,calc(100vw-32px))]
      "
    >
      <div
        className="
          overflow-hidden
          rounded-2xl
          border
          border-white/20
          bg-[#07100b]/95
          backdrop-blur-xl
          shadow-[0_18px_70px_rgba(0,0,0,0.65)]
        "
      >
        {/* ======================================================
            TOP EVENT BAR
           ====================================================== */}

        <div
          className="
            h-9
            px-4
            flex
            items-center
            justify-between
            gap-4
            border-b
            border-white/10
            bg-black/30
          "
        >
          <div className="flex items-center gap-3 min-w-0">
            {config.clubLogo ? (
              <img
                src={config.clubLogo}
                alt=""
                className="
                  w-5
                  h-5
                  object-contain
                  flex-shrink-0
                "
              />
            ) : (
              <Radio
                size={14}
                className="text-emerald-400 flex-shrink-0"
              />
            )}

            <span
              className="
                font-mono
                text-[10px]
                uppercase
                tracking-[0.16em]
                text-white/70
                truncate
              "
            >
              {config.eventTitle ||
                "LIVE EVENT"}
            </span>

            {config.matchTitle && (
              <>
                <span className="text-white/15">
                  /
                </span>

                <span
                  className="
                    font-mono
                    text-[9px]
                    uppercase
                    tracking-wider
                    text-white/35
                    truncate
                  "
                >
                  {config.matchTitle}
                </span>
              </>
            )}
          </div>

          <div
            className="
              flex
              items-center
              gap-2
              flex-shrink-0
            "
          >
            <span
              className="
                w-2
                h-2
                rounded-full
                bg-red-500
                shadow-[0_0_8px_rgba(239,68,68,0.8)]
              "
            />

            <span
              className="
                font-mono
                text-[9px]
                uppercase
                tracking-[0.18em]
                text-red-400
                font-bold
              "
            >
              LIVE
            </span>

            <span
              className="
                hidden
                sm:inline
                font-mono
                text-[8px]
                uppercase
                tracking-wider
                text-white/25
              "
            >
              {config.tableName ||
                "TABLE"}
            </span>
          </div>
        </div>

        {/* ======================================================
            MAIN SCORE AREA
           ====================================================== */}

        <div
          className="
            grid
            grid-cols-[1fr_auto_1fr]
            items-stretch
            min-h-[112px]
          "
        >
          {/* PLAYER 1 */}

          <OBSPlayer
            name={p1}
            photo={photo1}
            matchScore={
              matchPts[0]
            }
            frameScore={
              frameScores[0]
            }
            active={
              currentStriker === 0
            }
            align="left"
          />

          {/* CENTER SCORE */}

          <div
            className="
              px-5
              sm:px-8
              flex
              flex-col
              items-center
              justify-center
              border-x
              border-white/10
              min-w-[150px]
            "
          >
            <div
              className="
                font-mono
                text-[8px]
                uppercase
                tracking-[0.18em]
                text-white/30
                mb-1
              "
            >
              Match
            </div>

            <div
              className="
                flex
                items-center
                gap-3
              "
            >
              <span
                className="
                  font-mono
                  text-3xl
                  sm:text-4xl
                  leading-none
                  text-white
                  font-bold
                "
              >
                {matchPts[0]}
              </span>

              <span
                className="
                  font-mono
                  text-lg
                  text-white/20
                "
              >
                –
              </span>

              <span
                className="
                  font-mono
                  text-3xl
                  sm:text-4xl
                  leading-none
                  text-white
                  font-bold
                "
              >
                {matchPts[1]}
              </span>
            </div>

            <div
              className="
                flex
                items-center
                gap-2
                mt-2
              "
            >
              <span
                className="
                  font-mono
                  text-[8px]
                  uppercase
                  tracking-wider
                  text-white/25
                "
              >
                Game
              </span>

              <span
                className="
                  font-mono
                  text-[9px]
                  text-emerald-400
                "
              >
                {currentFrame}
                <span className="text-white/25">
                  /
                  {totalFrames}
                </span>
              </span>
            </div>
          </div>

          {/* PLAYER 2 */}

          <OBSPlayer
            name={p2}
            photo={photo2}
            matchScore={
              matchPts[1]
            }
            frameScore={
              frameScores[1]
            }
            active={
              currentStriker === 1
            }
            align="right"
          />
        </div>

        {/* ======================================================
            INFORMATION BAR
           ====================================================== */}

        <div
          className="
            h-10
            border-t
            border-white/10
            bg-black/25
            grid
            grid-cols-2
            sm:grid-cols-4
            divide-x
            divide-white/10
          "
        >
          <OBSInfo
            icon={<Timer size={11} />}
            label="Frame"
            value={
              isBilliards
                ? "BILLIARDS"
                : `SNOOKER · ${
                    frameDef.reds ??
                    15
                  } REDS`
            }
          />

          <OBSInfo
            icon={
              <Radio size={11} />
            }
            label="Current"
            value={
              playerNameShort(
                state,
                currentStriker
              )
            }
            active
          />

          <OBSInfo
            icon={
              <Clock size={11} />
            }
            label="Time"
            value={formatClock(
              frameElapsed
            )}
          />

          <OBSShotClock
            time={shotTimeLeft}
            active={shotActive}
            enabled={
              config.shotSecs > 0
            }
          />
        </div>

        {/* ======================================================
            SPONSORS
           ====================================================== */}

        {config.sponsors &&
          config.sponsors.length >
            0 && (
            <div
              className="
                min-h-8
                px-4
                py-1.5
                flex
                items-center
                justify-center
                gap-4
                border-t
                border-white/[0.06]
                bg-black/20
              "
            >
              {config.sponsors
                .slice(0, 6)
                .map(
                  (
                    sponsor,
                    index
                  ) => (
                    <img
                      key={`${sponsor}-${index}`}
                      src={sponsor}
                      alt=""
                      className="
                        max-h-5
                        max-w-[100px]
                        object-contain
                        opacity-75
                      "
                    />
                  )
                )}
            </div>
          )}
      </div>
    </div>
  );
}

/* ================================================================
   PLAYER
   ============================================================== */

function OBSPlayer({
  name,
  photo,
  matchScore,
  frameScore,
  active,
  align,
}: {
  name: string;
  photo: string | null;
  matchScore: number;
  frameScore: number;
  active: boolean;
  align: "left" | "right";
}) {
  const isRight =
    align === "right";

  return (
    <div
      className={`
        relative
        px-4
        sm:px-7
        flex
        items-center
        gap-3
        ${
          isRight
            ? "flex-row-reverse text-right"
            : "text-left"
        }
      `}
    >
      {/* ACTIVE INDICATOR */}

      {active && (
        <span
          className="
            absolute
            top-3
            w-1.5
            h-1.5
            rounded-full
            bg-emerald-400
            shadow-[0_0_8px_rgba(52,211,153,0.8)]
          "
          style={{
            [isRight
              ? "right"
              : "left"]: "12px",
          }}
        />
      )}

      {/* PHOTO */}

      {photo ? (
        <img
          src={photo}
          alt=""
          className="
            w-11
            h-11
            sm:w-14
            sm:h-14
            rounded-full
            object-cover
            border
            border-white/15
            flex-shrink-0
          "
        />
      ) : (
        <div
          className="
            w-11
            h-11
            sm:w-14
            sm:h-14
            rounded-full
            border
            border-white/10
            bg-white/[0.04]
            flex
            items-center
            justify-center
            flex-shrink-0
          "
        >
          <span
            className="
              font-display
              text-lg
              sm:text-xl
              text-white/40
            "
          >
            {name
              .slice(0, 1)
              .toUpperCase()}
          </span>
        </div>
      )}

      {/* NAME + FRAME */}

      <div className="min-w-0 flex-1">
        <div
          className="
            flex
            items-center
            gap-2
          "
        >
          {active && (
            <span
              className="
                font-mono
                text-[7px]
                uppercase
                tracking-wider
                text-emerald-400
              "
            >
              AT TABLE
            </span>
          )}
        </div>

        <div
          className="
            font-display
            text-lg
            sm:text-2xl
            leading-tight
            truncate
            text-white
          "
        >
          {name}
        </div>

        <div
          className="
            font-mono
            text-[8px]
            uppercase
            tracking-[0.16em]
            text-white/25
            mt-1
          "
        >
          Frame {frameScore}
        </div>
      </div>

      {/* MATCH SCORE */}

      <div
        className="
          font-mono
          text-4xl
          sm:text-5xl
          leading-none
          font-bold
          text-white
          flex-shrink-0
        "
      >
        {matchScore}
      </div>
    </div>
  );
}

/* ================================================================
   SHORT PLAYER NAME
   ============================================================== */

function playerNameShort(
  state: LiveMatchState,
  side: 0 | 1
) {
  if (
    state.config.matchMode ===
    "doubles"
  ) {
    return (
      state.config.teams?.[side]
        ?.name ??
      `Team ${side + 1}`
    );
  }

  return (
    state.config.players?.[side]
      ?.name ??
    `Player ${side + 1}`
  );
}

/* ================================================================
   INFO
   ============================================================== */

function OBSInfo({
  icon,
  label,
  value,
  active,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <div
      className="
        px-3
        sm:px-5
        flex
        items-center
        justify-center
        gap-2
        min-w-0
      "
    >
      {icon && (
        <span
          className={
            active
              ? "text-emerald-400"
              : "text-white/25"
          }
        >
          {icon}
        </span>
      )}

      <div className="min-w-0">
        <span
          className="
            font-mono
            text-[7px]
            uppercase
            tracking-wider
            text-white/20
            mr-2
          "
        >
          {label}
        </span>

        <span
          className={`
            font-mono
            text-[8px]
            sm:text-[9px]
            uppercase
            tracking-wider
            truncate
            ${
              active
                ? "text-emerald-400"
                : "text-white/45"
            }
          `}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

/* ================================================================
   SHOT CLOCK
   ============================================================== */

function OBSShotClock({
  time,
  active,
  enabled,
}: {
  time: number;
  active: boolean;
  enabled: boolean;
}) {
  if (!enabled) {
    return (
      <OBSInfo
        icon={
          <Timer size={11} />
        }
        label="Shot"
        value="OFF"
      />
    );
  }

  const safeTime = Math.max(
    0,
    Math.floor(
      Number(time) || 0
    )
  );

  return (
    <div
      className="
        px-3
        sm:px-5
        flex
        items-center
        justify-center
        gap-2
        min-w-0
      "
    >
      <Timer
        size={11}
        className={
          safeTime <= 5
            ? "text-red-400"
            : active
            ? "text-emerald-400"
            : "text-white/25"
        }
      />

      <div className="flex items-baseline gap-2">
        <span
          className="
            font-mono
            text-[7px]
            uppercase
            tracking-wider
            text-white/20
          "
        >
          Shot
        </span>

        <span
          className={`
            font-mono
            text-sm
            font-bold
            ${
              safeTime <= 5
                ? "text-red-400"
                : active
                ? "text-white"
                : "text-white/40"
            }
          `}
        >
          {safeTime}s
        </span>
      </div>
    </div>
  );
}