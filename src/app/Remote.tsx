import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  Trophy,
  RotateCcw,
  Pause,
  Play,
  RefreshCw,
  Clock,
  Timer,
  Flag,
  X,
} from "lucide-react";

import type {
  MatchConfig,
  LiveMatchState,
  FrameDef,
} from "./types";

import {
  saveMatchState,
  endMatch,
  loadTournament,
  completeTournamentMatch,
} from "./sync";

/* ================================================================
   BALL CONSTANTS
   ================================================================ */

const BALLS = [
  {
    name: "Red",
    pts: 1,
    color: "#C0241C",
    shadow: "#7a0a08",
  },
  {
    name: "Yellow",
    pts: 2,
    color: "#C9960A",
    shadow: "#7a5c06",
  },
  {
    name: "Green",
    pts: 3,
    color: "#1A7A3E",
    shadow: "#0a4020",
  },
  {
    name: "Brown",
    pts: 4,
    color: "#7B3A14",
    shadow: "#3e1c08",
  },
  {
    name: "Blue",
    pts: 5,
    color: "#1A4DA8",
    shadow: "#0a2860",
  },
  {
    name: "Pink",
    pts: 6,
    color: "#C42C72",
    shadow: "#721040",
  },
  {
    name: "Black",
    pts: 7,
    color: "#242424",
    shadow: "#000000",
  },
];

const COLORS_SEQ = [1, 2, 3, 4, 5, 6];

const BILL_ACTIONS = [
  {
    label: "Cannon",
    sub: "Cue ball strikes both other balls",
    pts: 2,
  },
  {
    label: "Pot Red",
    sub: "Red ball into a pocket",
    pts: 3,
  },
  {
    label: "Pot White",
    sub: "Opponent's ball into a pocket",
    pts: 2,
  },
  {
    label: "In-off Red",
    sub: "Cue ball into pocket off red",
    pts: 3,
  },
  {
    label: "In-off White",
    sub: "Cue ball into pocket off white",
    pts: 2,
  },
];

/* ================================================================
   HELPERS
   ================================================================ */

function fmtTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(
      2,
      "0"
    )}`;
  }

  return `${String(m).padStart(2, "0")}:${String(sec).padStart(
    2,
    "0"
  )}`;
}

/* ================================================================
   TIMER BAR
   ================================================================ */

function TimerBar({
  mElapsed,
  mOn,
  fElapsed,
  fOn,
  onMToggle,
  onMReset,
  onFToggle,
  onFReset,
}: {
  mElapsed: number;
  mOn: boolean;
  fElapsed: number;
  fOn: boolean;
  onMToggle: () => void;
  onMReset: () => void;
  onFToggle: () => void;
  onFReset: () => void;
}) {
  const btn =
    "w-9 h-9 border border-border rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/25 transition-all";

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0"
      style={{
        background: "rgba(0,0,0,0.25)",
      }}
    >
      <Timer
        size={12}
        className="text-muted-foreground/40 flex-shrink-0"
      />

      <span className="font-mono text-sm text-foreground w-14">
        {fmtTime(mElapsed)}
      </span>

      <button onClick={onMToggle} className={btn}>
        {mOn ? <Pause size={12} /> : <Play size={12} />}
      </button>

      <button onClick={onMReset} className={btn}>
        <RefreshCw size={11} />
      </button>

      <div className="w-px h-5 bg-border mx-1" />

      <Clock
        size={12}
        className="text-muted-foreground/40 flex-shrink-0"
      />

      <span className="font-mono text-sm text-foreground w-14">
        {fmtTime(fElapsed)}
      </span>

      <button onClick={onFToggle} className={btn}>
        {fOn ? <Pause size={12} /> : <Play size={12} />}
      </button>

      <button onClick={onFReset} className={btn}>
        <RefreshCw size={11} />
      </button>

      <span className="font-mono text-xs text-muted-foreground/25 ml-auto hidden sm:block">
        Match · Frame
      </span>
    </div>
  );
}

/* ================================================================
   SHOT CLOCK
   ================================================================ */

function ShotClock({
  timeLeft,
  total,
  running,
  onReset,
  onToggle,
}: {
  timeLeft: number;
  total: number;
  running: boolean;
  onReset: () => void;
  onToggle: () => void;
}) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? timeLeft / total : 0;

  const exp = timeLeft === 0;
  const warn =
    !exp && timeLeft <= Math.ceil(total * 0.35);

  const stroke = exp
    ? "#b83030"
    : warn
    ? "#c4882e"
    : "#2a7048";

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border"
      style={{
        background: exp
          ? "rgba(184,48,48,0.08)"
          : "rgba(255,255,255,0.03)",
      }}
    >
      <div className="relative w-14 h-14 flex-shrink-0">
        <svg
          className="w-full h-full -rotate-90"
          viewBox="0 0 64 64"
        >
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke="rgba(223,214,188,0.07)"
            strokeWidth="5"
          />

          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth="5"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct)}
            strokeLinecap="round"
            style={{
              transition: exp
                ? "none"
                : "stroke-dashoffset 0.9s linear",
            }}
          />
        </svg>

        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`font-mono font-bold text-lg leading-none ${
              exp
                ? "text-destructive"
                : warn
                ? "text-accent"
                : "text-foreground"
            }`}
          >
            {timeLeft}
          </span>
        </div>
      </div>

      <div className="flex-1">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Shot Clock
        </p>

        <p
          className={`font-mono text-xs mt-0.5 ${
            exp
              ? "text-destructive"
              : "text-muted-foreground/40"
          }`}
        >
          {exp
            ? "Time expired"
            : `${timeLeft}s / ${total}s`}
        </p>
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={onToggle}
          className="w-9 h-9 border border-border rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
        >
          {running ? (
            <Pause size={14} />
          ) : (
            <Play size={14} />
          )}
        </button>

        <button
          onClick={onReset}
          className="w-9 h-9 border border-border rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
        >
          <RefreshCw size={13} />
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   HISTORY
   ================================================================ */

interface HistEntry {
  pts: number;
  prevReds: number;
  prevNextColor: boolean;
  prevColorsIdx: number | null;
}

/* ================================================================
   END MATCH MODAL
   ================================================================ */

function EndMatchModal({
  open,
  finishing,
  playerNames,
  score,
  onCancel,
  onFinish,
}: {
  open: boolean;
  finishing: boolean;
  playerNames: [string, string];
  score: [number, number];
  onCancel: () => void;
  onFinish: (winner: 0 | 1) => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-5"
      style={{
        background: "rgba(13,24,17,0.96)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="w-full max-w-sm bg-card border border-destructive/20 rounded-2xl p-7 shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-destructive mb-2">
              End Match
            </p>

            <h2 className="font-display text-3xl text-foreground">
              Finish this match?
            </h2>
          </div>

          <button
            onClick={onCancel}
            disabled={finishing}
            className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all disabled:opacity-30"
          >
            <X size={16} />
          </button>
        </div>

        <div className="rounded-xl border border-border bg-background p-4 mb-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-3 text-center">
            Current Match Score
          </p>

          <div className="flex items-center justify-center gap-5">
            <div className="text-center min-w-0 flex-1">
              <p className="font-display text-lg text-foreground truncate">
                {playerNames[0]}
              </p>

              <p className="font-mono text-3xl text-foreground mt-1">
                {score[0]}
              </p>
            </div>

            <span className="font-mono text-muted-foreground/40">
              –
            </span>

            <div className="text-center min-w-0 flex-1">
              <p className="font-display text-lg text-foreground truncate">
                {playerNames[1]}
              </p>

              <p className="font-mono text-3xl text-foreground mt-1">
                {score[1]}
              </p>
            </div>
          </div>

          <p className="font-mono text-[10px] text-muted-foreground/40 text-center mt-3 leading-relaxed">
            Select the player who should be recorded as
            the winner of this match.
          </p>
        </div>

        <div className="space-y-2">
          <button
            disabled={finishing}
            onClick={() => onFinish(0)}
            className="w-full py-4 rounded-xl border border-border bg-background text-foreground font-display text-xl hover:border-primary/50 hover:bg-primary/[0.06] transition-all disabled:opacity-40"
          >
            {playerNames[0]} Wins
          </button>

          <button
            disabled={finishing}
            onClick={() => onFinish(1)}
            className="w-full py-4 rounded-xl border border-border bg-background text-foreground font-display text-xl hover:border-primary/50 hover:bg-primary/[0.06] transition-all disabled:opacity-40"
          >
            {playerNames[1]} Wins
          </button>
        </div>

        <button
          onClick={onCancel}
          disabled={finishing}
          className="w-full mt-3 py-3 rounded-xl text-muted-foreground font-mono text-sm hover:text-foreground transition-all disabled:opacity-30"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   REMOTE
   ================================================================ */

interface Props {
  config: MatchConfig;
  onExit: () => void;
}

export default function Remote({
  config,
  onExit,
}: Props) {
  const isDoubles =
    config.matchMode === "doubles";

  const needed =
    Math.ceil(config.bestOf / 2);

  const p = (side: 0 | 1) =>
    isDoubles
      ? config.teams![side].name
      : config.players[side].name;

  const pShort = (side: 0 | 1) =>
    p(side).split(" ")[0];

  const photo = (side: 0 | 1) =>
    isDoubles
      ? null
      : config.players[side].photo;

  const hc = (side: 0 | 1) =>
    isDoubles
      ? config.teamHandicaps?.[side] ?? 0
      : config.handicaps[side];

  /* ============================================================
     TIMER STATE
     ============================================================ */

  const [matchElapsed, setMatchElapsed] =
    useState(0);

  const [matchTimerOn, setMatchTimerOn] =
    useState(true);

  const [frameElapsed, setFrameElapsed] =
    useState(0);

  const [frameTimerOn, setFrameTimerOn] =
    useState(true);

  const [shotTimeLeft, setShotTimeLeft] =
    useState(config.shotSecs);

  const [shotActive, setShotActive] =
    useState(config.shotSecs > 0);

  /* ============================================================
     SEQUENCE
     ============================================================ */

  const [seqIdx, setSeqIdx] =
    useState(0);

  const seqLen =
    config.customSequence.length;

  const frameDef: FrameDef =
    config.customSequence[
      seqIdx % Math.max(1, seqLen)
    ] ??
    config.customSequence[0];

  const effectiveGame =
    frameDef?.type ?? "snooker";

  /* ============================================================
     MATCH STATE
     ============================================================ */

  const [matchPts, setMatchPts] =
    useState<[number, number]>([0, 0]);

  /* ============================================================
     SNOOKER STATE
     ============================================================ */

  const [framePts, setFramePts] =
    useState<[number, number]>([
      hc(0),
      hc(1),
    ]);

  const [striker, setStriker] =
    useState<0 | 1>(0);

  const [teamPI, setTeamPI] =
    useState<[0 | 1, 0 | 1]>([0, 0]);

  const [brk, setBrk] =
    useState(0);

  const [hist, setHist] =
    useState<HistEntry[]>([]);

  const [reds, setReds] =
    useState(frameDef?.reds ?? 15);

  const [nextColor, setNextColor] =
    useState(false);

  const [colorsIdx, setColorsIdx] =
    useState<number | null>(null);

  const [brkLog, setBrkLog] =
    useState<
      {
        p: 0 | 1;
        pts: number;
      }[]
    >([]);

  const [hiBrk, setHiBrk] =
    useState<[number, number]>([0, 0]);

  const [frameOver, setFrameOver] =
    useState<0 | 1 | null>(null);

  const [foulOpen, setFoulOpen] =
    useState(false);

  const [endFrOpen, setEndFrOpen] =
    useState(false);

  /* ============================================================
     BILLIARDS STATE
     ============================================================ */

  const [bScores, setBScores] =
    useState<[number, number]>([
      hc(0),
      hc(1),
    ]);

  const [bStriker, setBStriker] =
    useState<0 | 1>(0);

  const [bVisit, setBVisit] =
    useState(0);

  const [bHist, setBHist] =
    useState<number[]>([]);

  const [billFrameOver, setBillFrameOver] =
    useState<0 | 1 | null>(null);

  const [billTimeLeft, setBillTimeLeft] =
    useState(frameDef?.billDuration ?? 3600);

  const [billTimerOn, setBillTimerOn] =
    useState(
      effectiveGame === "billiards" &&
        frameDef?.billMode === "time"
    );

  const [billTimeUp, setBillTimeUp] =
    useState(false);

  /* ============================================================
     END MATCH STATE
     ============================================================ */

  const [endMatchOpen, setEndMatchOpen] =
    useState(false);

  const [finishing, setFinishing] =
    useState(false);

  const [resetScoresOpen, setResetScoresOpen] =
    useState(false);

  /* ============================================================
     TIMER EFFECTS
     ============================================================ */

  useEffect(() => {
    if (!matchTimerOn) return;

    const id = window.setInterval(() => {
      setMatchElapsed((e) => e + 1);
    }, 1000);

    return () => window.clearInterval(id);
  }, [matchTimerOn]);

  useEffect(() => {
    if (!frameTimerOn) return;

    const id = window.setInterval(() => {
      setFrameElapsed((e) => e + 1);
    }, 1000);

    return () => window.clearInterval(id);
  }, [frameTimerOn]);

  useEffect(() => {
    if (
      config.shotSecs === 0 ||
      !shotActive ||
      shotTimeLeft <= 0
    ) {
      return;
    }

    const id = window.setInterval(() => {
      setShotTimeLeft((t) => {
        if (t <= 1) {
          setShotActive(false);
          return 0;
        }

        return t - 1;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [
    config.shotSecs,
    shotActive,
    shotTimeLeft,
  ]);

  useEffect(() => {
    if (
      !billTimerOn ||
      billTimeLeft <= 0
    ) {
      return;
    }

    const id = window.setInterval(() => {
      setBillTimeLeft((t) => {
        if (t <= 1) {
          setBillTimerOn(false);
          setBillTimeUp(true);
          return 0;
        }

        return t - 1;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [
    billTimerOn,
    billTimeLeft,
  ]);

  /* ============================================================
     BUILD LIVE STATE
     ============================================================ */

  const buildState =
    useCallback((): LiveMatchState => {
      return {
        config,
        version: Date.now(),
        status: "active",

        matchPts,
        framePts,

        striker,
        teamPlayerIdx: teamPI,

        brk,
        reds,
        nextColor,
        colorsIdx,

        brkLog,
        hiBrk,

        frameOver,

        bScores,
        bStriker,
        bVisit,

        billFrameOver,
        billTimeLeft,
        billTimeUp,

        matchElapsed,
        frameElapsed,

        shotTimeLeft,
        shotActive,

        currentSeqIdx: seqIdx,
      };
    }, [
      config,
      matchPts,
      framePts,
      striker,
      teamPI,
      brk,
      reds,
      nextColor,
      colorsIdx,
      brkLog,
      hiBrk,
      frameOver,
      bScores,
      bStriker,
      bVisit,
      billFrameOver,
      billTimeLeft,
      billTimeUp,
      matchElapsed,
      frameElapsed,
      shotTimeLeft,
      shotActive,
      seqIdx,
    ]);

  const publish =
    useCallback(() => {
      saveMatchState(buildState());
    }, [buildState]);

  useEffect(() => {
    publish();
  }, [
    matchPts,
    framePts,
    bScores,
    frameOver,
    billFrameOver,
    seqIdx,
    publish,
  ]);

  useEffect(() => {
    const id = window.setInterval(
      publish,
      3000
    );

    return () =>
      window.clearInterval(id);
  }, [publish]);

  /* ============================================================
     HELPERS
     ============================================================ */

  function resetShot() {
    if (config.shotSecs === 0) {
      return;
    }

    setShotTimeLeft(
      config.shotSecs
    );

    setShotActive(true);
  }

  function ballIsLegal(
    idx: number
  ): boolean {
    if (colorsIdx !== null) {
      return (
        idx ===
        COLORS_SEQ[colorsIdx]
      );
    }

    if (nextColor) {
      return idx !== 0;
    }

    return idx === 0;
  }

  /* ============================================================
     SNOOKER ACTIONS
     ============================================================ */

  function potBall(ballIdx: number) {
    if (!ballIsLegal(ballIdx)) {
      return;
    }

    const ball = BALLS[ballIdx];
    const isRed = ballIdx === 0;

    let nReds = reds;
    let nNextColor = nextColor;
    let nColorsIdx = colorsIdx;
    let over = false;

    if (isRed) {
      nReds = Math.max(
        0,
        reds - 1
      );

      nNextColor = true;
    } else {
      if (colorsIdx !== null) {
        const ni =
          colorsIdx + 1;

        if (
          ni >=
          COLORS_SEQ.length
        ) {
          over = true;
        } else {
          nColorsIdx = ni;
        }
      } else {
        nNextColor = false;

        if (nReds === 0) {
          nColorsIdx = 0;
        }
      }
    }

    const nFrame: [
      number,
      number
    ] = [
      framePts[0],
      framePts[1],
    ];

    nFrame[striker] +=
      ball.pts;

    setHist((h) => [
      ...h,
      {
        pts: ball.pts,
        prevReds: reds,
        prevNextColor:
          nextColor,
        prevColorsIdx:
          colorsIdx,
      },
    ]);

    setReds(nReds);
    setNextColor(
      nNextColor
    );
    setColorsIdx(
      nColorsIdx
    );

    setFramePts(
      nFrame
    );

    setBrk(
      (b) => b + ball.pts
    );

    resetShot();

    setFoulOpen(false);
    setEndFrOpen(false);

    if (over) {
      const w: 0 | 1 =
        nFrame[0] >= nFrame[1]
          ? 0
          : 1;

      setFrameOver(w);
      setFrameTimerOn(false);
    }
  }

  function undoBall() {
    if (!hist.length) {
      return;
    }

    const last =
      hist[hist.length - 1];

    setHist((h) =>
      h.slice(0, -1)
    );

    setBrk(
      (b) =>
        Math.max(
          0,
          b - last.pts
        )
    );

    setFramePts(
      (prev) => {
        const n: [
          number,
          number
        ] = [
          prev[0],
          prev[1],
        ];

        n[striker] -=
          last.pts;

        return n;
      }
    );

    setReds(
      last.prevReds
    );

    setNextColor(
      last.prevNextColor
    );

    setColorsIdx(
      last.prevColorsIdx
    );

    resetShot();
  }

  function endVisit() {
    if (brk > 0) {
      setBrkLog((l) => [
        ...l,
        {
          p: striker,
          pts: brk,
        },
      ]);

      setHiBrk((prev) => {
        const n: [
          number,
          number
        ] = [
          prev[0],
          prev[1],
        ];

        if (
          brk >
          n[striker]
        ) {
          n[striker] =
            brk;
        }

        return n;
      });
    }

    setBrk(0);
    setHist([]);

    if (colorsIdx === null) {
      if (
        reds === 0 &&
        nextColor
      ) {
        setColorsIdx(0);
      }

      setNextColor(false);
    }

    const newStriker: 0 | 1 =
      striker === 0
        ? 1
        : 0;

    if (isDoubles) {
      setTeamPI((prev) => {
        const n: [
          0 | 1,
          0 | 1
        ] = [
          prev[0],
          prev[1],
        ];

        n[striker] =
          n[striker] === 0
            ? 1
            : 0;

        return n;
      });
    }

    setStriker(
      newStriker
    );

    setFoulOpen(false);
    setEndFrOpen(false);

    resetShot();
  }

  function applyFoul(
    penalty: number
  ) {
    const opp: 0 | 1 =
      striker === 0
        ? 1
        : 0;

    setFramePts(
      (prev) => {
        const n: [
          number,
          number
        ] = [
          prev[0],
          prev[1],
        ];

        n[opp] +=
          penalty;

        return n;
      }
    );

    endVisit();

    setFoulOpen(false);
  }

  function claimFrame(
    winner: 0 | 1
  ) {
    setFrameOver(winner);
    setFrameTimerOn(false);
    setEndFrOpen(false);
  }

  /* ============================================================
     ADVANCE TO NEXT FRAME
     ============================================================ */

  function advanceFrame(
    winner: 0 | 1
  ) {
    /*
     * Calculate the match score including the frame that has just
     * been won BEFORE deciding whether another frame is needed.
     *
     * Example: Best of 5
     * 2-0 + frame win = 3-0 -> MATCH OVER
     * We must NOT create Game 4 in this situation.
     */
    const projectedScore: [
      number,
      number
    ] = [
      matchPts[0],
      matchPts[1],
    ];

    projectedScore[winner] += 1;

    const matchIsWon =
      projectedScore[winner] >= needed;

    if (matchIsWon) {
      /*
       * IMPORTANT:
       *
       * Do NOT put the projected score into matchPts here.
       * The deciding frame is still represented by frameOver.
       *
       * If we updated matchPts here and then the Finish button
       * also added frameOver, the deciding frame could be counted
       * twice. The Finish action receives projectedScore instead.
       */
      setFrameOver(winner);
      setFrameTimerOn(false);
      setEndFrOpen(false);
      setFoulOpen(false);
      return;
    }

    /*
     * The frame is not the deciding frame, so this frame is now
     * officially added to the match score.
     */
    setMatchPts(projectedScore);

    const nextIdx =
      seqIdx + 1;

    setSeqIdx(
      nextIdx
    );

    const nextDef: FrameDef =
      config.customSequence[
        nextIdx %
          Math.max(
            1,
            seqLen
          )
      ] ??
      config.customSequence[0];

    /* RESET SNOOKER */

    setFramePts([
      hc(0),
      hc(1),
    ]);

    setBrk(0);
    setHist([]);

    setReds(
      nextDef?.reds ?? 15
    );

    setNextColor(false);
    setColorsIdx(null);

    setBrkLog([]);
    setFrameOver(null);
    setEndFrOpen(false);
    setFoulOpen(false);

    setStriker(
      winner === 0
        ? 1
        : 0
    );

    setTeamPI([
      0,
      0,
    ]);

    /* RESET BILLIARDS */

    setBScores([
      hc(0),
      hc(1),
    ]);

    setBStriker(
      winner === 0
        ? 1
        : 0
    );

    setBVisit(0);
    setBHist([]);
    setBillFrameOver(
      null
    );

    setBillTimeLeft(
      nextDef?.billDuration ??
        3600
    );

    setBillTimerOn(
      nextDef?.type ===
        "billiards" &&
        nextDef?.billMode ===
          "time"
    );

    setBillTimeUp(false);

    setFrameElapsed(0);
    setFrameTimerOn(true);

    resetShot();
  }

  /* ============================================================
     BILLIARDS ACTIONS
     ============================================================ */

  function bScore(
    pts: number
  ) {
    setBVisit(
      (v) => v + pts
    );

    setBHist(
      (h) => [
        ...h,
        pts,
      ]
    );

    setBScores(
      (prev) => {
        const n: [
          number,
          number
        ] = [
          prev[0],
          prev[1],
        ];

        n[bStriker] +=
          pts;

        return n;
      }
    );

    resetShot();
  }

  function bUndo() {
    if (!bHist.length) {
      return;
    }

    const last =
      bHist[
        bHist.length - 1
      ];

    setBHist((h) =>
      h.slice(0, -1)
    );

    setBVisit(
      (v) =>
        Math.max(
          0,
          v - last
        )
    );

    setBScores(
      (prev) => {
        const n: [
          number,
          number
        ] = [
          prev[0],
          prev[1],
        ];

        n[bStriker] -=
          last;

        return n;
      }
    );

    resetShot();
  }

  function bEndVisit() {
    setBVisit(0);
    setBHist([]);

    setBStriker(
      (s) =>
        s === 0
          ? 1
          : 0
    );

    resetShot();
  }

  /* ============================================================
     RESET SCORES
     ============================================================ */

  function resetScores() {
    const firstDef: FrameDef =
      config.customSequence[0] ??
      config.customSequence[0];

    setMatchPts([0, 0]);

    setSeqIdx(0);

    /* Reset snooker scoring */
    setFramePts([
      hc(0),
      hc(1),
    ]);
    setStriker(0);
    setTeamPI([0, 0]);
    setBrk(0);
    setHist([]);
    setReds(firstDef?.reds ?? 15);
    setNextColor(false);
    setColorsIdx(null);
    setBrkLog([]);
    setHiBrk([0, 0]);
    setFrameOver(null);

    /* Reset billiards scoring */
    setBScores([
      hc(0),
      hc(1),
    ]);
    setBStriker(0);
    setBVisit(0);
    setBHist([]);
    setBillFrameOver(null);
    setBillTimeLeft(
      firstDef?.billDuration ?? 3600
    );
    setBillTimeUp(false);
    setBillTimerOn(
      firstDef?.type === "billiards" &&
        firstDef?.billMode === "time"
    );

    /* Reset shot clock to its configured starting value */
    if (config.shotSecs > 0) {
      setShotTimeLeft(config.shotSecs);
      setShotActive(true);
    }

    setFoulOpen(false);
    setEndFrOpen(false);
    setResetScoresOpen(false);
  }

  /* ============================================================
     END MATCH
     ============================================================ */

  const finishMatch =
    useCallback(
      (
        winner: 0 | 1,
        completedScore?: [number, number]
      ) => {
        if (finishing) {
          return;
        }

        setFinishing(true);

        /*
         * Build the score that must be permanently stored.
         *
         * A deciding frame is held in frameOver/billFrameOver
         * until the operator presses Finish Match. Therefore
         * matchPts can still be one frame short at that exact
         * moment:
         *
         *   Best of 5: 2-1 + deciding frame = 3-1
         *   Best of 5: 2-0 + deciding frame = 3-0
         *
         * completedScore is used when the snooker deciding-frame
         * modal already calculated the projected score.
         * Otherwise we calculate it here from the current frame
         * winner. This makes the saved tournament result correct
         * regardless of which Finish Match path was used.
         */
        let finalScore: [
          number,
          number
        ];

        if (completedScore) {
          finalScore = [
            Math.max(0, Math.floor(Number(completedScore[0]) || 0)),
            Math.max(0, Math.floor(Number(completedScore[1]) || 0)),
          ];
        } else {
          finalScore = [
            Math.max(0, Math.floor(Number(matchPts[0]) || 0)),
            Math.max(0, Math.floor(Number(matchPts[1]) || 0)),
          ];

          /*
           * If a frame/game has just been won and has not yet been
           * committed to matchPts, include that win exactly once.
           */
          const pendingFrameWinner =
            frameOver ??
            billFrameOver;

          if (pendingFrameWinner !== null) {
            finalScore[pendingFrameWinner] += 1;
          }
        }

        /*
         * Never save a score in which the declared winner has fewer
         * than the required number of frames for a normal Best Of
         * match. This is a safety net for deciding-frame saves.
         *
         * It does NOT alter an intentionally early/manual End Match
         * when no frame is pending.
         */
        const requiredToWin =
          Math.ceil(config.bestOf / 2);

        if (
          completedScore ||
          frameOver !== null ||
          billFrameOver !== null
        ) {
          finalScore[winner] = Math.max(
            finalScore[winner],
            requiredToWin
          );
        }

        /*
         * Save tournament result.
         *
         * This works even when the match is ended
         * before the normal Best Of condition.
         */

        try {
          if (
            config.tournamentId &&
            config.scheduledMatchId
          ) {
            const tournament =
              loadTournament();

            if (tournament) {
              completeTournamentMatch(
                tournament,
                config.scheduledMatchId,
                winner === 0
                  ? "player1"
                  : "player2",
                finalScore
              );
            }
          }
        } catch (error) {
          console.error(
            "Failed to save completed tournament match:",
            error
          );
        }

        /*
         * Remove live match state.
         */

        try {
          endMatch(
            config.tableId
          );
        } catch (error) {
          console.error(
            "Failed to clear live match state:",
            error
          );
        }

        setEndMatchOpen(false);

        window.setTimeout(() => {
          onExit();
        }, 50);
      },
      [
        finishing,
        matchPts,
        frameOver,
        billFrameOver,
        config,
        onExit,
      ]
    );

  /* ============================================================
     DERIVED STATE
     ============================================================ */

  const matchWon =
    matchPts[0] >= needed
      ? 0
      : matchPts[1] >= needed
      ? 1
      : null;

  const billWon: 0 | 1 | null =
    config.gameType !==
      "pl-mix" &&
    frameDef?.billMode ===
      "points"
      ? bScores[0] >=
        (frameDef?.billTarget ??
          Infinity)
        ? 0
        : bScores[1] >=
          (frameDef?.billTarget ??
            Infinity)
        ? 1
        : null
      : config.gameType !==
          "pl-mix" &&
        frameDef?.billMode ===
          "time" &&
        billTimeUp
      ? bScores[0] ===
        bScores[1]
        ? null
        : bScores[0] >
          bScores[1]
        ? 0
        : 1
      : null;

  const billWinner =
    billFrameOver ??
    billWon;

  const phaseLabel =
    colorsIdx !== null
      ? `Pot ${
          BALLS[
            COLORS_SEQ[
              colorsIdx
            ]
          ].name
        } — ${
          BALLS[
            COLORS_SEQ[
              colorsIdx
            ]
          ].pts
        }pt`
      : nextColor
      ? "Pot any colour"
      : reds > 0
      ? "Pot the Red"
      : "Pot Red (last)";

  function currentPlayerName(
    side: 0 | 1
  ): string {
    if (!isDoubles) {
      return p(side);
    }

    return (
      config.teams![side]
        .players[
        teamPI[side]
      ].name ||
      `Team ${side + 1} P${
        teamPI[side] + 1
      }`
    );
  }

  /* ============================================================
     BRANDING BAR
     ============================================================ */

  const seqTotal =
    config.customSequence.length;

  const BrandingBar = (
    <div
      className="flex-shrink-0 border-b border-border flex items-center gap-2 px-3 py-1.5"
      style={{
        background:
          "rgba(0,0,0,0.35)",
      }}
    >
      <button
        onClick={onExit}
        className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        title="Exit"
      >
        <ChevronLeft size={18} />
      </button>

      {config.clubLogo && (
        <img
          src={config.clubLogo}
          alt="club"
          className="h-7 w-7 object-contain flex-shrink-0"
        />
      )}

      <div className="flex-1 min-w-0">
        <p className="font-display text-sm text-foreground truncate leading-tight">
          {config.eventTitle ||
            "Chalk & Cue"}
        </p>

        {config.gameType ===
          "pl-mix" && (
          <p className="font-mono text-xs text-muted-foreground/50 leading-tight">
            Game {seqIdx + 1}/
            {seqTotal}:{" "}
            {frameDef?.type ===
            "billiards"
              ? "English Billiards"
              : `Snooker (${
                  frameDef?.reds ??
                  15
                }r)`}
          </p>
        )}
      </div>

      {config.sponsors.map(
        (s, i) => (
          <img
            key={i}
            src={s}
            alt="sponsor"
            className="h-6 object-contain flex-shrink-0 max-w-[52px]"
          />
        )
      )}

      <span className="font-mono text-xs text-muted-foreground/40 flex-shrink-0">
        {matchPts[0]}–
        {matchPts[1]} / Bo
        {config.bestOf}
      </span>

      {/* ======================================================
          RESET SCORES
          ====================================================== */}

      <button
        onClick={() => {
          setResetScoresOpen(true);
          setFoulOpen(false);
          setEndFrOpen(false);
        }}
        disabled={finishing}
        className="
          flex
          items-center
          gap-1.5
          px-2.5
          py-1.5
          rounded-lg
          border
          border-border
          bg-card
          text-muted-foreground
          font-mono
          text-[10px]
          uppercase
          tracking-wider
          hover:text-foreground
          hover:border-foreground/25
          transition-all
          disabled:opacity-30
          disabled:cursor-not-allowed
        "
        title="Reset all scores"
      >
        <RefreshCw size={11} />
        <span className="hidden sm:inline">
          Reset Scores
        </span>
      </button>

      {/* ======================================================
          END MATCH — ALWAYS AVAILABLE
          ====================================================== */}

      <button
        onClick={() => {
          setEndMatchOpen(true);
          setFoulOpen(false);
          setEndFrOpen(false);
        }}
        disabled={
          finishing ||
          frameOver !== null ||
          billWinner !== null
        }
        className="
          flex
          items-center
          gap-1.5
          px-2.5
          py-1.5
          rounded-lg
          border
          border-destructive/30
          bg-destructive/[0.06]
          text-destructive
          font-mono
          text-[10px]
          uppercase
          tracking-wider
          hover:bg-destructive/[0.12]
          hover:border-destructive/50
          transition-all
          disabled:opacity-30
          disabled:cursor-not-allowed
        "
        title="End match"
      >
        <Flag size={11} />
        <span className="hidden sm:inline">
          End Match
        </span>
      </button>
    </div>
  );

  /* ============================================================
     RESET SCORES MODAL
     ============================================================ */

  const ResetScoresOverlay = resetScoresOpen ? (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-5"
      style={{
        background: "rgba(13,24,17,0.96)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-7 shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent mb-2">
              Reset Scores
            </p>
            <h2 className="font-display text-3xl text-foreground">
              Start scoring again?
            </h2>
          </div>

          <button
            onClick={() => setResetScoresOpen(false)}
            className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
          >
            <X size={16} />
          </button>
        </div>

        <div className="rounded-xl border border-border bg-background p-4 mb-5">
          <p className="font-mono text-xs text-muted-foreground leading-relaxed">
            This will reset the match and frame scores, break,
            reds, highest break, visits and game/frame progress
            back to the configured starting state.
          </p>
          <p className="font-mono text-[10px] text-muted-foreground/40 mt-3 leading-relaxed">
            The match stays open. No tournament result is created.
          </p>
        </div>

        <button
          onClick={resetScores}
          className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-display text-xl hover:opacity-90 transition-opacity"
        >
          Reset Scores
        </button>

        <button
          onClick={() => setResetScoresOpen(false)}
          className="w-full mt-3 py-3 text-muted-foreground font-mono text-xs hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  ) : null;

  /* ============================================================
     COMMON END MATCH MODAL
     ============================================================ */

  const EndMatchOverlay = (
    <EndMatchModal
      open={endMatchOpen}
      finishing={finishing}
      playerNames={[
        p(0),
        p(1),
      ]}
      score={[
        matchPts[0],
        matchPts[1],
      ]}
      onCancel={() =>
        setEndMatchOpen(false)
      }
      onFinish={finishMatch}
    />
  );

  /* ============================================================
     SNOOKER SCREEN
     ============================================================ */

  if (
    effectiveGame ===
    "snooker"
  ) {
    const projMatch: [
      number,
      number
    ] = [
      matchPts[0] +
        (frameOver === 0
          ? 1
          : 0),
      matchPts[1] +
        (frameOver === 1
          ? 1
          : 0),
    ];

    const projWinner =
      projMatch[0] >= needed
        ? 0
        : projMatch[1] >=
          needed
        ? 1
        : null;

    return (
      <div className="h-screen bg-background flex flex-col select-none overflow-hidden">
        {BrandingBar}

        {/* PLAYER HEADER */}

        <div
          className="flex-shrink-0 border-b border-border px-4 py-3"
          style={{
            background:
              "rgba(0,0,0,0.18)",
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            {([0, 1] as const).map(
              (side) => (
                <div
                  key={side}
                  className={`flex items-center gap-3 ${
                    side === 1
                      ? "flex-row-reverse text-right"
                      : ""
                  }`}
                >
                  {photo(side) ? (
                    <img
                      src={
                        photo(side)!
                      }
                      alt=""
                      className="w-12 h-12 rounded-full object-cover border-2 border-border flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary/15 border border-border flex items-center justify-center flex-shrink-0">
                      <span className="font-display text-2xl text-primary">
                        {p(side)[0]}
                      </span>
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="font-display text-xl text-foreground truncate">
                      {p(side)}
                    </p>

                    {hc(side) !==
                      0 && (
                      <p className="font-mono text-xs text-accent/70">
                        Hcp:{" "}
                        {hc(side) >
                        0
                          ? `+${hc(
                              side
                            )}`
                          : hc(
                              side
                            )}
                      </p>
                    )}

                    <div
                      className={`flex gap-1 mt-1 ${
                        side === 1
                          ? "justify-end"
                          : ""
                      }`}
                    >
                      {Array.from({
                        length:
                          needed,
                      }).map(
                        (
                          _,
                          j
                        ) => (
                          <div
                            key={j}
                            className={`w-2.5 h-2.5 rounded-full border ${
                              j <
                              matchPts[
                                side
                              ]
                                ? "bg-accent border-accent"
                                : "border-border"
                            }`}
                          />
                        )
                      )}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* FRAME SCORE */}

        <div className="flex-shrink-0 px-4 py-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-5">
            <div className="text-center">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground/40">
                Frame
              </p>

              <p className="font-mono text-6xl sm:text-7xl text-foreground font-light mt-1">
                {framePts[0]}
              </p>
            </div>

            <div className="font-mono text-2xl text-muted-foreground/20">
              –
            </div>

            <div className="text-center">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground/40">
                Frame
              </p>

              <p className="font-mono text-6xl sm:text-7xl text-foreground font-light mt-1">
                {framePts[1]}
              </p>
            </div>
          </div>
        </div>

        {/* BREAK / PHASE */}

        <div
          className="px-3 py-1.5 border-b border-border flex items-center gap-2 flex-shrink-0"
          style={{
            background:
              "rgba(0,0,0,0.2)",
          }}
        >
          <div className="flex-1 flex items-baseline gap-2">
            <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">
              Break
            </span>

            <span className="font-mono text-2xl text-accent">
              {brk}
            </span>

            {brk > 0 && (
              <span className="font-mono text-xs text-muted-foreground/30">
                [
                {hist
                  .map(
                    (h) =>
                      h.pts
                  )
                  .join("+")}
                ]
              </span>
            )}
          </div>

          <span className="font-mono text-xs text-muted-foreground/60">
            {phaseLabel} ·{" "}
            {reds}r left
          </span>
        </div>

        {/* TIMER */}

        <TimerBar
          mElapsed={
            matchElapsed
          }
          mOn={matchTimerOn}
          fElapsed={
            frameElapsed
          }
          fOn={frameTimerOn}
          onMToggle={() =>
            setMatchTimerOn(
              (o) => !o
            )
          }
          onMReset={() => {
            setMatchElapsed(
              0
            );
            setMatchTimerOn(
              true
            );
          }}
          onFToggle={() =>
            setFrameTimerOn(
              (o) => !o
            )
          }
          onFReset={() => {
            setFrameElapsed(
              0
            );
            setFrameTimerOn(
              true
            );
          }}
        />

        {/* ACTION AREA */}

        <div className="flex-1 flex flex-col p-3 gap-2.5 overflow-y-auto">
          {config.shotSecs >
            0 && (
            <ShotClock
              timeLeft={
                shotTimeLeft
              }
              total={
                config.shotSecs
              }
              running={
                shotActive
              }
              onReset={
                resetShot
              }
              onToggle={() =>
                setShotActive(
                  (o) => !o
                )
              }
            />
          )}

          {/* BALL GRID */}

          <div className="flex flex-col gap-2">
            {(() => {
              const legal =
                ballIsLegal(
                  0
                );

              const ball =
                BALLS[0];

              return (
                <button
                  onClick={() =>
                    potBall(
                      0
                    )
                  }
                  disabled={
                    !legal
                  }
                  className="w-full py-4 rounded-xl font-display text-xl transition-all active:scale-[0.98]"
                  style={{
                    background:
                      legal
                        ? `radial-gradient(circle at 35% 35%, ${ball.color}, ${ball.shadow})`
                        : "rgba(255,255,255,0.02)",
                    color: legal
                      ? "white"
                      : "rgba(223,214,188,0.10)",
                    boxShadow:
                      legal
                        ? `0 4px 24px ${ball.shadow}60`
                        : "none",
                    border:
                      `1px solid ${
                        legal
                          ? ball.color +
                            "50"
                          : "rgba(223,214,188,0.03)"
                      }`,
                    cursor:
                      legal
                        ? "pointer"
                        : "not-allowed",
                  }}
                >
                  {legal
                    ? `● Red — 1 pt${
                        reds > 0
                          ? ` (${reds} left)`
                          : ""
                      }`
                    : `Red — ${reds} left`}
                </button>
              );
            })()}

            <div className="grid grid-cols-3 gap-2">
              {COLORS_SEQ.map(
                (bi) => {
                  const ball =
                    BALLS[bi];

                  const legal =
                    ballIsLegal(
                      bi
                    );

                  return (
                    <button
                      key={
                        ball.name
                      }
                      onClick={() =>
                        potBall(
                          bi
                        )
                      }
                      disabled={
                        !legal
                      }
                      className="py-4 rounded-xl flex flex-col items-center transition-all active:scale-95"
                      style={{
                        background:
                          legal
                            ? `radial-gradient(circle at 35% 35%, ${ball.color}, ${ball.shadow})`
                            : "rgba(255,255,255,0.02)",
                        opacity:
                          legal
                            ? 1
                            : 0.1,
                        boxShadow:
                          legal
                            ? `0 3px 16px ${ball.shadow}60`
                            : "none",
                        border:
                          `1px solid ${
                            legal
                              ? ball.color +
                                "50"
                              : "rgba(223,214,188,0.03)"
                          }`,
                        cursor:
                          legal
                            ? "pointer"
                            : "not-allowed",
                      }}
                    >
                      <span className="font-mono text-xl font-bold text-white">
                        {ball.pts}
                      </span>

                      <span className="font-mono text-xs text-white/70 mt-0.5">
                        {ball.name}
                      </span>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {/* CONTROLS */}

          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => {
                setFoulOpen(
                  (o) => !o
                );
                setEndFrOpen(
                  false
                );
              }}
              className={`py-3 rounded-xl border font-mono text-xs uppercase tracking-wider transition-all ${
                foulOpen
                  ? "border-destructive bg-destructive/15 text-destructive"
                  : "border-border bg-card text-muted-foreground hover:border-destructive/50 hover:text-destructive"
              }`}
            >
              Foul
            </button>

            <button
              onClick={
                undoBall
              }
              disabled={
                !hist.length
              }
              className="py-3 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-20 transition-all flex items-center justify-center gap-1"
            >
              <RotateCcw
                size={12}
              />

              <span className="font-mono text-xs">
                Undo
              </span>
            </button>

            <button
              onClick={
                endVisit
              }
              className="py-3 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all font-mono text-xs uppercase tracking-wider"
            >
              Miss
            </button>

            <button
              onClick={() => {
                setEndFrOpen(
                  (o) => !o
                );
                setFoulOpen(
                  false
                );
              }}
              className={`py-3 rounded-xl border font-mono text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                endFrOpen
                  ? "border-primary/60 bg-primary/15 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
              }`}
            >
              <Flag size={12} />
              <span>
                End Frame
              </span>
            </button>
          </div>

          {/* FOUL */}

          {foulOpen && (
            <div className="border border-destructive/20 rounded-xl p-3 bg-destructive/[0.05]">
              <p className="font-mono text-xs uppercase tracking-widest text-destructive mb-2">
                Penalty →{" "}
                {p(
                  striker ===
                    0
                    ? 1
                    : 0
                )}
              </p>

              <div className="grid grid-cols-4 gap-2">
                {[4, 5, 6, 7].map(
                  (n) => (
                    <button
                      key={n}
                      onClick={() =>
                        applyFoul(
                          n
                        )
                      }
                      className="py-3.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive font-mono text-2xl hover:bg-destructive/20 active:scale-95 transition-all"
                    >
                      {n}
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {/* END FRAME */}

          {endFrOpen && (
            <div className="border border-primary/20 rounded-xl p-3 bg-primary/[0.04]">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-2">
                Who wins this frame?
              </p>

              <div className="grid grid-cols-2 gap-2">
                {([0, 1] as const).map(
                  (i) => (
                    <button
                      key={i}
                      onClick={() =>
                        claimFrame(
                          i
                        )
                      }
                      className="py-3 rounded-xl border border-border bg-card text-foreground font-display text-lg hover:border-accent/50 hover:bg-accent/10 active:scale-95 transition-all"
                    >
                      {pShort(
                        i
                      )}
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {/* BREAK LOG */}

          {brkLog.length >
            0 && (
            <div className="border-t border-border pt-2">
              <div className="flex flex-wrap gap-1.5">
                {brkLog
                  .slice(-10)
                  .map(
                    (
                      e,
                      i
                    ) => (
                      <span
                        key={i}
                        className="font-mono text-xs px-2 py-0.5 bg-card border border-border rounded-full"
                      >
                        <span className="text-muted-foreground">
                          {pShort(
                            e.p
                          )}
                          :{" "}
                        </span>

                        <span className="text-accent">
                          {e.pts}
                        </span>
                      </span>
                    )
                  )}
              </div>

              {(hiBrk[0] >
                0 ||
                hiBrk[1] >
                  0) && (
                <p className="font-mono text-xs text-muted-foreground/40 mt-1">
                  Hi:{" "}
                  {pShort(
                    0
                  )}{" "}
                  {hiBrk[0]}{" "}
                  ·{" "}
                  {pShort(
                    1
                  )}{" "}
                  {hiBrk[1]}
                </p>
              )}
            </div>
          )}
        </div>

        {/* FRAME OVER MODAL */}

        {frameOver !==
          null && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-5"
            style={{
              background:
                "rgba(13,24,17,0.95)",
              backdropFilter:
                "blur(10px)",
            }}
          >
            <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-7 text-center">
              <Trophy
                className="mx-auto mb-4 text-accent"
                size={40}
              />

              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">
                Frame Won
              </p>

              <h2 className="font-display text-4xl text-foreground mb-1">
                {p(
                  frameOver
                )}
              </h2>

              <p className="font-mono text-xl text-muted-foreground mb-2">
                {framePts[0]}{" "}
                –{" "}
                {framePts[1]}
              </p>

              <p className="font-mono text-xs text-muted-foreground/40 mb-6">
                {fmtTime(
                  frameElapsed
                )}{" "}
                played
              </p>

              {projWinner !==
              null ? (
                <button
                  onClick={() =>
                    finishMatch(
                      projWinner,
                      projMatch
                    )
                  }
                  disabled={
                    finishing
                  }
                  className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-display text-xl hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  Finish Match
                </button>
              ) : (
                <button
                  onClick={() =>
                    advanceFrame(
                      frameOver
                    )
                  }
                  className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-display text-xl hover:opacity-90 transition-opacity"
                >
                  Next Frame
                </button>
              )}

              <button
                onClick={() =>
                  setFrameOver(
                    null
                  )
                }
                disabled={
                  finishing
                }
                className="w-full mt-3 py-2 text-muted-foreground font-mono text-xs hover:text-foreground"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {ResetScoresOverlay}
        {EndMatchOverlay}
      </div>
    );
  }

  /* ============================================================
     BILLIARDS SCREEN
     ============================================================ */

  const billiardsWinner =
    billWinner;

  if (
    effectiveGame ===
    "billiards"
  ) {
    return (
      <div className="h-screen bg-background flex flex-col select-none overflow-hidden">
        {BrandingBar}

        {/* PLAYERS */}

        <div className="flex-shrink-0 border-b border-border px-4 py-3">
          <div className="grid grid-cols-2 gap-4">
            {([0, 1] as const).map(
              (side) => (
                <div
                  key={side}
                  className={`flex items-center gap-3 ${
                    side === 1
                      ? "flex-row-reverse text-right"
                      : ""
                  }`}
                >
                  {photo(side) ? (
                    <img
                      src={
                        photo(side)!
                      }
                      alt=""
                      className="w-12 h-12 rounded-full object-cover border-2 border-border flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary/15 border border-border flex items-center justify-center flex-shrink-0">
                      <span className="font-display text-2xl text-primary">
                        {p(side)[0]}
                      </span>
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="font-display text-xl text-foreground truncate">
                      {p(side)}
                    </p>

                    {hc(side) !==
                      0 && (
                      <p className="font-mono text-xs text-accent/70">
                        Hcp:{" "}
                        {hc(side) >
                        0
                          ? `+${hc(
                              side
                            )}`
                          : hc(
                              side
                            )}
                      </p>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* SCORE */}

        <div className="flex-shrink-0 px-4 py-5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-5">
            <div className="text-center">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground/40">
                {pShort(0)}
              </p>

              <p className="font-mono text-7xl sm:text-8xl text-foreground font-light mt-1">
                {bScores[0]}
              </p>
            </div>

            <div className="font-mono text-2xl text-muted-foreground/20">
              –
            </div>

            <div className="text-center">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground/40">
                {pShort(1)}
              </p>

              <p className="font-mono text-7xl sm:text-8xl text-foreground font-light mt-1">
                {bScores[1]}
              </p>
            </div>
          </div>
        </div>

        {/* VISIT */}

        <div className="px-3 py-2 border-y border-border flex items-center">
          <div className="flex-1">
            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Visit
            </span>

            <span className="font-mono text-2xl text-accent ml-2">
              {bVisit}
            </span>
          </div>

          <span className="font-mono text-xs text-muted-foreground/50">
            {bStriker ===
            0
              ? pShort(0)
              : pShort(1)}
            {" "}at table
          </span>
        </div>

        {/* TIMER */}

        <TimerBar
          mElapsed={
            matchElapsed
          }
          mOn={matchTimerOn}
          fElapsed={
            frameElapsed
          }
          fOn={frameTimerOn}
          onMToggle={() =>
            setMatchTimerOn(
              (o) => !o
            )
          }
          onMReset={() => {
            setMatchElapsed(
              0
            );
            setMatchTimerOn(
              true
            );
          }}
          onFToggle={() =>
            setFrameTimerOn(
              (o) => !o
            )
          }
          onFReset={() => {
            setFrameElapsed(
              0
            );
            setFrameTimerOn(
              true
            );
          }}
        />

        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {config.shotSecs >
            0 && (
            <ShotClock
              timeLeft={
                shotTimeLeft
              }
              total={
                config.shotSecs
              }
              running={
                shotActive
              }
              onReset={
                resetShot
              }
              onToggle={() =>
                setShotActive(
                  (o) => !o
                )
              }
            />
          )}

          {/* TIME MODE */}

          {frameDef?.billMode ===
            "time" && (
            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  Frame Time
                </span>

                <span
                  className={`font-mono text-xl ${
                    billTimeLeft ===
                    0
                      ? "text-destructive"
                      : "text-foreground"
                  }`}
                >
                  {fmtTime(
                    billTimeLeft
                  )}
                </span>
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={() =>
                    setBillTimerOn(
                      (o) => !o
                    )
                  }
                  disabled={
                    billTimeLeft ===
                    0
                  }
                  className="flex-1 py-2.5 rounded-xl border border-border font-mono text-xs text-muted-foreground hover:text-foreground"
                >
                  {billTimerOn
                    ? "Pause"
                    : "Start"}
                </button>

                <button
                  onClick={() => {
                    setBillTimeLeft(
                      frameDef?.billDuration ??
                        3600
                    );
                    setBillTimeUp(
                      false
                    );
                    setBillTimerOn(
                      true
                    );
                  }}
                  className="w-12 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw
                    size={14}
                  />
                </button>
              </div>
            </div>
          )}

          {/* BILLIARDS ACTIONS */}

          <div className="grid grid-cols-2 gap-2">
            {BILL_ACTIONS.map(
              (action) => (
                <button
                  key={
                    action.label
                  }
                  onClick={() =>
                    bScore(
                      action.pts
                    )
                  }
                  className="rounded-xl border border-border bg-card p-4 text-left hover:border-primary/40 hover:bg-primary/[0.05] active:scale-[0.98] transition-all"
                >
                  <p className="font-display text-lg text-foreground">
                    {action.label}
                  </p>

                  <p className="font-mono text-[10px] text-muted-foreground/45 mt-1 leading-relaxed">
                    {action.sub}
                  </p>

                  <p className="font-mono text-sm text-accent mt-2">
                    +{action.pts}
                  </p>
                </button>
              )
            )}
          </div>

          {/* CONTROLS */}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={
                bUndo
              }
              disabled={
                !bHist.length
              }
              className="py-3 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-20 font-mono text-xs flex items-center justify-center gap-2"
            >
              <RotateCcw
                size={13}
              />
              Undo
            </button>

            <button
              onClick={
                bEndVisit
              }
              className="py-3 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground font-mono text-xs uppercase tracking-wider"
            >
              End Visit
            </button>
          </div>

          {/* END FRAME */}

          {config.gameType ===
            "pl-mix" && (
            <button
              onClick={() =>
                setBillFrameOver(
                  bScores[0] >=
                  bScores[1]
                    ? 0
                    : 1
                )
              }
              className="w-full py-3 rounded-xl border border-primary/20 bg-primary/[0.04] text-muted-foreground hover:text-foreground font-mono text-xs uppercase tracking-wider"
            >
              End Frame
            </button>
          )}

          {/* END MATCH — VISUAL SECONDARY ACCESS */}

          <button
            onClick={() => {
              setEndMatchOpen(
                true
              );
            }}
            disabled={
              finishing ||
              billiardsWinner !==
                null
            }
            className="w-full py-3 rounded-xl border border-destructive/30 bg-destructive/[0.04] text-destructive font-mono text-xs uppercase tracking-wider hover:bg-destructive/[0.08] transition-all disabled:opacity-30"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <Flag size={13} />
              End Match
            </span>
          </button>
        </div>

        {/* BILLIARDS OVER MODAL */}

        {billiardsWinner !==
          null && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-5"
            style={{
              background:
                "rgba(13,24,17,0.95)",
              backdropFilter:
                "blur(10px)",
            }}
          >
            <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-7 text-center">
              <Trophy
                className="mx-auto mb-4 text-accent"
                size={40}
              />

              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">
                {config.gameType ===
                "pl-mix"
                  ? "Game Won"
                  : "Match Won"}
              </p>

              <h2 className="font-display text-4xl text-foreground mb-1">
                {p(
                  billiardsWinner
                )}
              </h2>

              <p className="font-mono text-xl text-muted-foreground mb-2">
                {bScores[0]}{" "}
                –{" "}
                {bScores[1]}
              </p>

              <p className="font-mono text-xs text-muted-foreground/40 mb-6">
                {fmtTime(
                  matchElapsed
                )}{" "}
                played
              </p>

              {config.gameType ===
                "pl-mix" &&
              matchWon ===
                null ? (
                <button
                  onClick={() =>
                    advanceFrame(
                      billiardsWinner
                    )
                  }
                  className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-display text-xl hover:opacity-90 transition-opacity"
                >
                  Next:{" "}
                  {config.customSequence[
                    (seqIdx +
                      1) %
                      Math.max(
                        1,
                        seqLen
                      )
                  ]?.type ===
                  "billiards"
                    ? "English Billiards"
                    : `Snooker (${
                        config
                          .customSequence[
                          (seqIdx +
                            1) %
                            Math.max(
                              1,
                              seqLen
                            )
                        ]?.reds ??
                        15
                      }r)`}
                </button>
              ) : (
                <button
                  onClick={() =>
                    finishMatch(
                      billiardsWinner
                    )
                  }
                  disabled={
                    finishing
                  }
                  className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-display text-xl hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  Finish Match
                </button>
              )}

              {config.gameType ===
                "pl-mix" &&
                matchWon ===
                  null && (
                  <button
                    onClick={() =>
                      setBillFrameOver(
                        null
                      )
                    }
                    className="w-full mt-3 py-2 text-muted-foreground font-mono text-xs hover:text-foreground"
                  >
                    Back
                  </button>
                )}
            </div>
          </div>
        )}

        {ResetScoresOverlay}
        {EndMatchOverlay}
      </div>
    );
  }

  /* ============================================================
     FALLBACK — PL MIX / UNKNOWN
     ============================================================ */

  return (
    <div className="h-screen bg-background flex flex-col select-none overflow-hidden">
      {BrandingBar}

      <div className="flex-shrink-0 px-4 py-4 border-b border-border">
        <div className="grid grid-cols-2 gap-4">
          {([0, 1] as const).map(
            (side) => (
              <div
                key={side}
                className={`text-center ${
                  side === 1
                    ? "border-l border-border"
                    : ""
                }`}
              >
                <p className="font-display text-xl text-foreground truncate">
                  {p(side)}
                </p>

                <p className="font-mono text-6xl text-foreground mt-2">
                  {matchPts[side]}
                </p>
              </div>
            )
          )}
        </div>
      </div>

      <TimerBar
        mElapsed={
          matchElapsed
        }
        mOn={matchTimerOn}
        fElapsed={
          frameElapsed
        }
        fOn={frameTimerOn}
        onMToggle={() =>
          setMatchTimerOn(
            (o) => !o
          )
        }
        onMReset={() => {
          setMatchElapsed(0);
          setMatchTimerOn(
            true
          );
        }}
        onFToggle={() =>
          setFrameTimerOn(
            (o) => !o
          )
        }
        onFReset={() => {
          setFrameElapsed(0);
          setFrameTimerOn(
            true
          );
        }}
      />

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <Trophy
            size={42}
            className="mx-auto text-primary mb-4"
          />

          <h2 className="font-display text-3xl text-foreground">
            {frameDef?.type ===
            "billiards"
              ? "English Billiards"
              : "Snooker"}
          </h2>

          <p className="font-mono text-xs text-muted-foreground/50 mt-2">
            PL Mix frame
          </p>
        </div>
      </div>

      <div className="p-3 border-t border-border">
        <button
          onClick={() =>
            setEndMatchOpen(
              true
            )
          }
          disabled={
            finishing
          }
          className="w-full py-4 rounded-xl border border-destructive/30 bg-destructive/[0.05] text-destructive font-mono text-sm uppercase tracking-wider hover:bg-destructive/[0.1] transition-all disabled:opacity-30"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <Flag size={14} />
            End Match
          </span>
        </button>
      </div>

      {ResetScoresOverlay}
      {EndMatchOverlay}
    </div>
  );
}