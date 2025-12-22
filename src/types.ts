// Game Types

export interface RoomSettings {
  gameDuration: number; // seconds
  petrificusUses: number;
  spyUses: number;
}

export interface Player {
  id: string;
  name: string;
  giftDescription: string | null;
  giftEmbedding: number[] | null;
  currentGuess: string;
  guessEmbedding: number[] | null;
  petrificusRemaining: number;
  spyRemaining: number;
  position: { x: number; y: number }; // position on circle
  ws: WebSocket | null;
  connected: boolean;
  disconnectedAt: number | null;
}

export interface Gift {
  id: string;
  ownerId: string; // player who brought this gift
  description: string;
  embedding: number[];
  position: { x: number; y: number };
  frozenUntil: number | null; // timestamp when freeze ends
}

export interface Room {
  id: string;
  name: string;
  hostId: string;
  settings: RoomSettings;
  players: Map<string, Player>;
  gifts: Gift[];
  phase: 'waiting' | 'playing' | 'ended';
  gameStartTime: number | null;
  gameEndTime: number | null;
}

// WebSocket Messages

export type ClientMessage =
  | { type: 'get_rooms' }
  | { type: 'create_room'; roomName: string; hostName: string; settings: RoomSettings }
  | { type: 'join_room'; roomId: string; playerName: string }
  | { type: 'leave_room' }
  | { type: 'submit_gift'; giftDescription: string }
  | { type: 'update_guess'; guess: string }
  | { type: 'use_petrificus'; giftId: string }
  | { type: 'use_spy'; targetPlayerId: string }
  | { type: 'start_game' };

export type ServerMessage =
  | { type: 'connected'; playerId: string }
  | { type: 'room_list'; rooms: RoomInfo[] }
  | { type: 'room_joined'; roomId: string; playerId: string }
  | { type: 'room_state'; room: RoomStatePayload }
  | { type: 'game_state'; state: GameStatePayload }
  | { type: 'spy_result'; targetName: string; targetGuess: string }
  | { type: 'game_end'; results: GameResult[] }
  | { type: 'error'; message: string };

export interface RoomInfo {
  id: string;
  name: string;
  hostName: string;
  playerCount: number;
  phase: 'waiting' | 'playing' | 'ended';
}

export interface RoomStatePayload {
  id: string;
  name: string;
  hostId: string;
  settings: RoomSettings;
  phase: 'waiting' | 'playing' | 'ended';
  players: PlayerInfo[];
}

export interface PlayerInfo {
  id: string;
  name: string;
  hasSubmittedGift: boolean;
  position: { x: number; y: number };
}

export interface GameStatePayload {
  gifts: GiftState[];
  players: GamePlayerState[];
  timeRemaining: number;
}

export interface GiftState {
  id: string;
  position: { x: number; y: number };
  frozenSecondsLeft: number | null;
}

export interface GamePlayerState {
  id: string;
  name: string;
  position: { x: number; y: number };
  petrificusRemaining: number;
  spyRemaining: number;
}

export interface GameResult {
  playerId: string;
  playerName: string;
  playerPosition: { x: number; y: number };
  giftId: string;
  giftDescription: string;
  giftOwnerName: string;
  giftPosition: { x: number; y: number };
  giftColorIndex: number;
}
