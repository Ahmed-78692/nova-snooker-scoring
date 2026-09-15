import { useMemo, useState } from "react";

import type {
  AppView,
  MatchConfig,
  ScheduledMatch,
} from "./types";

import Landing from "./Landing";
import OrgHub from "./OrgHub";
import PLSetup from "./PLSetup";
import MatchSetup from "./MatchSetup";
import Remote from "./Remote";
import AudienceView from "./AudienceView";
import PlayerView from "./PlayerView";
import OBSOverlay from "./OBSOverlay";
import CasualSetup from "./CasualSetup";

import { loadTournament } from "./sync";


interface NavigationContext {
  tableId?: string;
  scheduledMatchId?: string;
}


type MainPath =
  | "home"
  | "audience"
  | "casual"
  | AppView;


/* ================================================================
   NOVA HOME
   ================================================================= */

function MainLanding({
  onOperator,
  onAudience,
}: {
  onOperator: () => void;
  onAudience: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#070b12] text-white">

      <div className="flex min-h-screen items-center justify-center px-5 py-10">

        <div className="w-full max-w-5xl">

          <div className="mb-12 text-center">

            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-400">
              NOVA
            </div>

            <h1 className="mt-3 text-5xl font-black tracking-tight sm:text-6xl">
              Remote Scoring
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-white/40 sm:text-base">
              Choose how you want to use Nova.
            </p>

          </div>


          <div className="grid gap-5 md:grid-cols-2">

            {/* OPERATOR */}

            <button
              type="button"
              onClick={
                onOperator
              }
              className="group rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.045] p-7 text-left transition hover:-translate-y-1 hover:border-cyan-400/40 hover:bg-cyan-400/[0.08]"
            >

              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/10 text-2xl">
                🎛
              </div>


              <div className="mt-7">

                <div className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">
                  Operator
                </div>

                <h2 className="mt-2 text-3xl font-black">
                  Nova Operator
                </h2>

                <p className="mt-3 max-w-md text-sm leading-6 text-white/45">
                  Create and manage Match Rooms,
                  tournaments and tables, assign matches
                  and operate the live scoring remote.
                </p>

              </div>


              <div className="mt-8 inline-flex items-center rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-black transition group-hover:bg-cyan-400">
                Enter Operator
              </div>

            </button>


            {/* AUDIENCE */}

            <button
              type="button"
              onClick={
                onAudience
              }
              className="group rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.035] p-7 text-left transition hover:-translate-y-1 hover:border-emerald-400/40 hover:bg-emerald-400/[0.07]"
            >

              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/10 text-2xl">
                📺
              </div>


              <div className="mt-7">

                <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
                  Public View
                </div>

                <h2 className="mt-2 text-3xl font-black">
                  Audience
                </h2>

                <p className="mt-3 max-w-md text-sm leading-6 text-white/45">
                  Watch live matches, tables,
                  standings and results.
                  Audience mode has no scoring or
                  organiser controls.
                </p>

              </div>


              <div className="mt-8 inline-flex items-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-black transition group-hover:bg-emerald-400">
                Enter Audience
              </div>

            </button>

          </div>


          <div className="mt-10 text-center text-[10px] font-semibold uppercase tracking-[0.25em] text-white/20">
            NOVA · Remote Scoring Platform
          </div>

        </div>

      </div>

    </div>
  );
}


/* ================================================================
   APP
   ================================================================= */

export default function App() {

  const params =
    useMemo(
      () =>
        new URLSearchParams(
          window.location.search
        ),
      []
    );


  const urlView =
    params.get("view");


  const urlTable =
    params.get("table") ??
    "table-1";


  const [view, setView] =
    useState<MainPath>(
      "home"
    );


  const [tableId, setTableId] =
    useState<string>(
      "table-1"
    );


  const [
    scheduledMatchId,
    setScheduledMatchId,
  ] =
    useState<
      string | undefined
    >(
      undefined
    );


  const [config, setConfig] =
    useState<MatchConfig | null>(
      null
    );


  /* ==============================================================
     PUBLIC AUDIENCE
     ============================================================== */

  if (
    urlView ===
    "audience"
  ) {
    return (
      <AudienceView
        tableId={
          params.get("table") ??
          undefined
        }
      />
    );
  }


  /* ==============================================================
     PLAYER VIEW
     ============================================================== */

  if (
    urlView ===
    "player"
  ) {
    return (
      <PlayerView
        tableId={
          urlTable
        }
      />
    );
  }


  /* ==============================================================
     OBS VIEW
     ============================================================== */

  if (
    urlView ===
    "obs"
  ) {
    return (
      <OBSOverlay
        tableId={
          urlTable
        }
      />
    );
  }


  /* ==============================================================
     NAVIGATION
     ============================================================== */

  function navigate(
    nextView:
      | AppView
      | "casual",
    context?: NavigationContext
  ) {

    if (
      context?.tableId
    ) {
      setTableId(
        context.tableId
      );
    }


    if (
      context?.scheduledMatchId !==
      undefined
    ) {
      setScheduledMatchId(
        context.scheduledMatchId
      );
    }


    if (
      nextView !==
      "remote"
    ) {
      setScheduledMatchId(
        context?.scheduledMatchId
      );
    }


    setView(
      nextView
    );
  }


  /* ==============================================================
     BUILD TOURNAMENT MATCH CONFIG
     ============================================================== */

  function buildScheduledMatchConfig(
    selectedTableId: string,
    matchId: string
  ): MatchConfig | null {

    const activeRoomId =
      localStorage.getItem(
        "nova_active_room"
      );


    const tournament =
      loadTournament(
        activeRoomId ??
          undefined
      );


    if (!tournament) {
      return null;
    }


    const scheduledMatch:
      | ScheduledMatch
      | undefined =
      tournament.schedule.find(
        match =>
          match.id ===
          matchId
      );


    if (!scheduledMatch) {
      return null;
    }


    const player1 =
      tournament.players.find(
        player =>
          player.id ===
          scheduledMatch.player1Id
      );


    const player2 =
      tournament.players.find(
        player =>
          player.id ===
          scheduledMatch.player2Id
      );


    if (
      !player1 ||
      !player2
    ) {
      return null;
    }


    let teams:
      | MatchConfig["teams"]
      | undefined;


    if (
      scheduledMatch.team1PlayerIds &&
      scheduledMatch.team2PlayerIds
    ) {

      const team1Players =
        scheduledMatch.team1PlayerIds
          .map(id =>
            tournament.players.find(
              player =>
                player.id ===
                id
            )
          )
          .filter(
            (
              player
            ): player is NonNullable<
              typeof player
            > =>
              Boolean(
                player
              )
          );


      const team2Players =
        scheduledMatch.team2PlayerIds
          .map(id =>
            tournament.players.find(
              player =>
                player.id ===
                id
            )
          )
          .filter(
            (
              player
            ): player is NonNullable<
              typeof player
            > =>
              Boolean(
                player
              )
          );


      if (
        team1Players.length ===
          2 &&
        team2Players.length ===
          2
      ) {

        teams = [

          {
            name:
              team1Players
                .map(
                  player =>
                    player.name
                )
                .join(
                  " / "
                ),

            players: [
              team1Players[0],
              team1Players[1],
            ],
          },


          {
            name:
              team2Players
                .map(
                  player =>
                    player.name
                )
                .join(
                  " / "
                ),

            players: [
              team2Players[0],
              team2Players[1],
            ],
          },

        ];

      }

    }


    const format =
      tournament.format;


    const customSequence =
      format.customSequence
        ?.length
        ? format.customSequence
        : [];


    const table =
      tournament.tables.find(
        item =>
          item.id ===
          selectedTableId
      );


    return {

      id:
        `match-${selectedTableId}-${matchId}`,

      roomId:
        activeRoomId ??
        undefined,

      source:
        "tournament",

      tableId:
        selectedTableId,

      tableName:
        table?.name ??
        selectedTableId,

      eventTitle:
        tournament.title,

      matchTitle:
        `${player1.name} vs ${player2.name}`,

      matchStatus:
        scheduledMatch.status,

      clubLogo:
        tournament.clubLogo,

      sponsors:
        tournament.sponsors,

      bestOf:
        scheduledMatch.bestOfOverride ??
        format.bestOf,

      shotSecs:
        format.shotSecs,

      gameType:
        format.gameType,

      matchMode:
        format.matchMode,

      customSequence,

      players: [
        player1,
        player2,
      ],

      handicaps: [
        tournament.handicaps[
          player1.id
        ] ?? 0,

        tournament.handicaps[
          player2.id
        ] ?? 0,
      ],

      teams,

      teamHandicaps:
        teams
          ? [0, 0]
          : undefined,

      tournamentId:
        tournament.id,

      scheduledMatchId:
        scheduledMatch.id,

      tableNumber:
        table?.number,
    };
  }


  /* ==============================================================
     HOME
     ============================================================== */

  if (
    view ===
    "home"
  ) {

    return (
      <MainLanding
        onOperator={() =>
          setView(
            "landing"
          )
        }

        onAudience={() =>
          setView(
            "audience"
          )
        }
      />
    );

  }


  /* ==============================================================
     AUDIENCE
     ============================================================== */

  if (
    view ===
    "audience"
  ) {

    return (
      <AudienceView
        tableId={
          undefined
        }
      />
    );

  }


  /* ==============================================================
     CASUAL SETUP
     ============================================================== */

  if (
    view ===
    "casual"
  ) {

    return (
      <CasualSetup
        tableId={
          tableId
        }

        onBack={() => {

          setView(
            "landing"
          );

        }}

        onBegin={
          nextConfig => {

            setConfig(
              nextConfig
            );


            setScheduledMatchId(
              undefined
            );


            setTableId(
              nextConfig.tableId
            );


            setView(
              "remote"
            );

          }
        }
      />
    );

  }


  /* ==============================================================
     OPERATOR — MATCH ROOMS
     ============================================================== */

  if (
    view ===
    "landing"
  ) {

    return (
      <Landing
        onNavigate={
          navigate
        }
      />
    );

  }


  /* ==============================================================
     ORGANISER HUB
     ============================================================== */

  if (
    view ===
    "orgHub"
  ) {

    return (
      <OrgHub
        onNavigate={
          navigate
        }
      />
    );

  }


  /* ==============================================================
     PL SETUP
     ============================================================== */

  if (
    view ===
    "plSetup"
  ) {

    return (
      <PLSetup
        onNavigate={
          navigate
        }
      />
    );

  }


  /* ==============================================================
     MATCH SETUP
     ============================================================== */

  if (
    view ===
    "matchSetup"
  ) {

    return (
      <MatchSetup
        tableId={
          tableId
        }

        onNavigate={
          navigate
        }

        onBegin={
          nextConfig => {

            setConfig(
              nextConfig
            );


            setScheduledMatchId(
              nextConfig.scheduledMatchId
            );


            setView(
              "remote"
            );

          }
        }
      />
    );

  }


  /* ==============================================================
     REMOTE
     ============================================================== */

  if (
    view ===
    "remote"
  ) {

    /*
     * Rebuild tournament matches if the
     * React state was lost.
     *
     * Casual matches already carry their
     * complete MatchConfig and therefore
     * do not need rebuilding.
     */

    if (
      !config &&
      scheduledMatchId
    ) {

      const rebuilt =
        buildScheduledMatchConfig(
          tableId,
          scheduledMatchId
        );


      if (rebuilt) {

        setConfig(
          rebuilt
        );

      }

    }


    if (config) {

      return (
        <Remote
          config={
            config
          }

          onExit={() => {

            const wasCasual =
              config.source ===
              "casual";


            setConfig(
              null
            );


            setScheduledMatchId(
              undefined
            );


            if (
              wasCasual
            ) {

              setView(
                "landing"
              );

            } else {

              setView(
                "orgHub"
              );

            }

          }}
        />
      );

    }


    return (
      <MatchSetup
        tableId={
          tableId
        }

        onNavigate={
          navigate
        }

        onBegin={
          nextConfig => {

            setConfig(
              nextConfig
            );


            setScheduledMatchId(
              nextConfig.scheduledMatchId
            );


            setView(
              "remote"
            );

          }
        }
      />
    );

  }


  /* ==============================================================
     FALLBACK
     ============================================================== */

  return (
    <MainLanding
      onOperator={() =>
        setView(
          "landing"
        )
      }

      onAudience={() =>
        setView(
          "audience"
        )
      }
    />
  );
}