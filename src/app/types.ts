// src/app/types.ts

export type GameType =
  | "snooker"
  | "billiards"
  | "pl-mix";

export type BillMode =
  | "points"
  | "time";

export type FrameType =
  | "snooker"
  | "billiards";

export type MatchMode =
  | "singles"
  | "doubles";

export type TournamentFormat =
  | "roundRobin"
  | "knockout";

export type MatchSource =
  | "tournament"
  | "casual";

export type AppView =
  | "home"
  | "landing"
  | "orgHub"
  | "plSetup"
  | "matchSetup"
  | "remote";


export interface Player {
  id: string;
  name: string;
  photo: string | null;
  country?: string;
  club?: string;
}


export interface DoublesTeam {
  name: string;
  players: [Player, Player];
}


export interface FrameDef {
  type: FrameType;
  reds: number;
  billMode: BillMode;
  billTarget: number;
  billDuration: number;
}


export const DEFAULT_SNOOKER_FRAME: FrameDef = {
  type: "snooker",
  reds: 15,
  billMode: "points",
  billTarget: 300,
  billDuration: 3600,
};


export const DEFAULT_BILLIARDS_FRAME: FrameDef = {
  type: "billiards",
  reds: 0,
  billMode: "points",
  billTarget: 300,
  billDuration: 3600,
};


export interface MatchConfig {
  roomId?: string;

  id: string;

  /*
   * Determines whether the match came from
   * a tournament or casual scoring.
   */
  source: MatchSource;

  tableId: string;

  tableName: string;

  eventTitle: string;

  matchTitle: string;

  matchStatus: string;

  clubLogo: string | null;

  sponsors: string[];

  bestOf: number;

  shotSecs: number;

  gameType: GameType;

  matchMode: MatchMode;

  customSequence: FrameDef[];

  players: [Player, Player];

  handicaps: [number, number];

  teams?: [
    DoublesTeam,
    DoublesTeam
  ];

  teamHandicaps?: [
    number,
    number
  ];

  tournamentId?: string;

  scheduledMatchId?: string;

  tableNumber?: number;
}


export interface LiveMatchState {
  config: MatchConfig;

  version: number;

  status:
    | "active"
    | "finished";

  matchPts: [number, number];

  framePts: [number, number];

  striker: 0 | 1;

  teamPlayerIdx: [
    0 | 1,
    0 | 1
  ];

  brk: number;

  reds: number;

  nextColor: boolean;

  colorsIdx: number | null;

  brkLog: {
    p: 0 | 1;
    pts: number;
  }[];

  hiBrk: [number, number];

  frameOver:
    | 0
    | 1
    | null;

  bScores: [number, number];

  bStriker: 0 | 1;

  bVisit: number;

  billFrameOver:
    | 0
    | 1
    | null;

  billTimeLeft: number;

  billTimeUp: boolean;

  matchElapsed: number;

  frameElapsed: number;

  shotTimeLeft: number;

  shotActive: boolean;

  currentSeqIdx: number;
}


export interface TableInfo {
  id: string;

  name: string;

  venueArea?: string;

  number?: number;
}


export interface ScheduledMatch {
  id: string;

  round: number;

  tableId: string | null;

  player1Id: string;

  player2Id: string;

  team1PlayerIds?: [
    string,
    string
  ];

  team2PlayerIds?: [
    string,
    string
  ];

  status:
    | "scheduled"
    | "active"
    | "complete";

  result?: {
    winner:
      | "player1"
      | "player2"
      | "draw";

    score: [
      number,
      number
    ];
  };

  knockoutRound?:
    | "qualifying"
    | "roundOf256"
    | "roundOf128"
    | "roundOf64"
    | "roundOf32"
    | "roundOf16"
    | "quarterFinal"
    | "semiFinal"
    | "final";

  sourceMatch1Id?: string;

  sourceMatch2Id?: string;

  sourcePosition1?:
    | "winner"
    | "loser";

  sourcePosition2?:
    | "winner"
    | "loser";

  isBye?: boolean;

  bestOfOverride?: number;
}


export interface PLStanding {
  playerId: string;

  played: number;

  won: number;

  drawn: number;

  lost: number;

  points: number;
}


export interface Tournament {
  id: string;

  title: string;

  clubLogo: string | null;

  sponsors: string[];

  players: Player[];

  handicaps: Record<
    string,
    number
  >;

  format: {
    gameType: GameType;

    bestOf: number;

    customSequence: FrameDef[];

    shotSecs: number;

    matchMode: MatchMode;

    billMode: BillMode;

    billTarget: number;

    billDuration: number;

    tournamentFormat?:
      TournamentFormat;
  };

  schedule: ScheduledMatch[];

  standings: PLStanding[];

  tables: TableInfo[];
}