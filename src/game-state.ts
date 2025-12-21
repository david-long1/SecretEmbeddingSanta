// Game State Management

import { getEmbedding, cosineSimilarity } from './embeddings';
import type {
  Room,
  Player,
  Gift,
  RoomSettings,
  RoomInfo,
  RoomStatePayload,
  PlayerInfo,
  GameStatePayload,
  GiftState,
  GamePlayerState,
  GameResult,
} from './types';

// In-memory state
const rooms = new Map<string, Room>();
const playerToRoom = new Map<string, string>(); // playerId -> roomId

// Arena configuration
const ARENA_RADIUS = 300; // Base radius for player circle
const GIFT_AREA_RADIUS = 150; // Gifts spawn within this radius of center
const ARENA_CENTER = { x: 400, y: 400 };
const GIFT_SPEED = 50; // pixels per second base speed

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function calculatePlayerPositions(playerCount: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  // Expand radius based on player count (more players = bigger circle)
  const radius = ARENA_RADIUS + Math.max(0, playerCount - 4) * 30;

  for (let i = 0; i < playerCount; i++) {
    const angle = (2 * Math.PI * i) / playerCount - Math.PI / 2; // Start from top
    positions.push({
      x: ARENA_CENTER.x + radius * Math.cos(angle),
      y: ARENA_CENTER.y + radius * Math.sin(angle),
    });
  }
  return positions;
}

function updatePlayerPositions(room: Room): void {
  const players = Array.from(room.players.values());
  const positions = calculatePlayerPositions(players.length);
  players.forEach((player, index) => {
    player.position = positions[index];
  });
}

function randomGiftPosition(): { x: number; y: number } {
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * GIFT_AREA_RADIUS * 0.8;
  return {
    x: ARENA_CENTER.x + distance * Math.cos(angle),
    y: ARENA_CENTER.y + distance * Math.sin(angle),
  };
}

export function createRoom(hostId: string, roomName: string, settings: RoomSettings): Room {
  const room: Room = {
    id: generateId(),
    name: roomName,
    hostId,
    settings,
    players: new Map(),
    gifts: [],
    phase: 'waiting',
    gameStartTime: null,
    gameEndTime: null,
  };
  rooms.set(room.id, room);
  return room;
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

export function getRoomByPlayerId(playerId: string): Room | undefined {
  const roomId = playerToRoom.get(playerId);
  if (!roomId) return undefined;
  return rooms.get(roomId);
}

export function getAllRooms(): RoomInfo[] {
  return Array.from(rooms.values()).map((room) => ({
    id: room.id,
    name: room.name,
    hostName: room.players.get(room.hostId)?.name || 'Unknown',
    playerCount: room.players.size,
    phase: room.phase,
  }));
}

export function joinRoom(
  roomId: string,
  playerId: string,
  playerName: string,
  ws: WebSocket
): { success: boolean; error?: string; room?: Room } {
  const room = rooms.get(roomId);
  if (!room) {
    return { success: false, error: 'Room not found' };
  }
  if (room.phase !== 'waiting') {
    return { success: false, error: 'Game already started' };
  }

  const player: Player = {
    id: playerId,
    name: playerName,
    giftDescription: null,
    giftEmbedding: null,
    currentGuess: '',
    guessEmbedding: null,
    petrificusRemaining: room.settings.petrificusUses,
    spyRemaining: room.settings.spyUses,
    position: { x: 0, y: 0 },
    ws,
  };

  room.players.set(playerId, player);
  playerToRoom.set(playerId, roomId);
  updatePlayerPositions(room);

  return { success: true, room };
}

export function leaveRoom(playerId: string): void {
  const roomId = playerToRoom.get(playerId);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room) return;

  room.players.delete(playerId);
  playerToRoom.delete(playerId);

  if (room.players.size === 0) {
    rooms.delete(roomId);
  } else {
    updatePlayerPositions(room);
    // If host left, assign new host
    if (room.hostId === playerId) {
      room.hostId = room.players.keys().next().value!;
    }
  }
}

export async function submitGift(
  playerId: string,
  giftDescription: string
): Promise<{ success: boolean; error?: string }> {
  const room = getRoomByPlayerId(playerId);
  if (!room) return { success: false, error: 'Not in a room' };

  const player = room.players.get(playerId);
  if (!player) return { success: false, error: 'Player not found' };

  player.giftDescription = giftDescription;
  player.giftEmbedding = await getEmbedding(giftDescription);

  return { success: true };
}

export function canStartGame(room: Room): boolean {
  if (room.players.size < 2) return false;
  for (const player of room.players.values()) {
    if (!player.giftDescription) return false;
  }
  return true;
}

export async function startGame(roomId: string): Promise<{ success: boolean; error?: string }> {
  const room = rooms.get(roomId);
  if (!room) return { success: false, error: 'Room not found' };
  if (!canStartGame(room)) return { success: false, error: 'Not all players have submitted gifts' };

  // Create gifts from player submissions
  room.gifts = [];
  for (const player of room.players.values()) {
    if (player.giftDescription && player.giftEmbedding) {
      room.gifts.push({
        id: generateId(),
        ownerId: player.id,
        description: player.giftDescription,
        embedding: player.giftEmbedding,
        position: randomGiftPosition(),
        frozenUntil: null,
      });
    }
  }

  room.phase = 'playing';
  room.gameStartTime = Date.now();
  room.gameEndTime = Date.now() + room.settings.gameDuration * 1000;

  return { success: true };
}

export async function updatePlayerGuess(playerId: string, guess: string): Promise<void> {
  const room = getRoomByPlayerId(playerId);
  if (!room || room.phase !== 'playing') return;

  const player = room.players.get(playerId);
  if (!player) return;

  player.currentGuess = guess;
  player.guessEmbedding = await getEmbedding(guess);
}

export function usePetrificus(
  playerId: string,
  giftId: string
): { success: boolean; error?: string } {
  const room = getRoomByPlayerId(playerId);
  if (!room || room.phase !== 'playing') {
    return { success: false, error: 'Game not in progress' };
  }

  const player = room.players.get(playerId);
  if (!player || player.petrificusRemaining <= 0) {
    return { success: false, error: 'No Petrificus uses remaining' };
  }

  const gift = room.gifts.find((g) => g.id === giftId);
  if (!gift) {
    return { success: false, error: 'Gift not found' };
  }

  player.petrificusRemaining--;
  gift.frozenUntil = Date.now() + 10000; // 10 seconds

  return { success: true };
}

export function useSpy(
  playerId: string,
  targetPlayerId: string
): { success: boolean; error?: string; targetGuess?: string; targetName?: string } {
  const room = getRoomByPlayerId(playerId);
  if (!room || room.phase !== 'playing') {
    return { success: false, error: 'Game not in progress' };
  }

  const player = room.players.get(playerId);
  if (!player || player.spyRemaining <= 0) {
    return { success: false, error: 'No Spy uses remaining' };
  }

  const target = room.players.get(targetPlayerId);
  if (!target) {
    return { success: false, error: 'Target player not found' };
  }

  player.spyRemaining--;

  return {
    success: true,
    targetName: target.name,
    targetGuess: target.currentGuess,
  };
}

export function updateGiftPositions(room: Room, deltaTime: number): void {
  if (room.phase !== 'playing') return;

  const now = Date.now();

  for (const gift of room.gifts) {
    // Skip frozen gifts
    if (gift.frozenUntil && now < gift.frozenUntil) continue;

    // Clear expired freeze
    if (gift.frozenUntil && now >= gift.frozenUntil) {
      gift.frozenUntil = null;
    }

    // Calculate attraction vector from all players
    let moveX = 0;
    let moveY = 0;

    for (const player of room.players.values()) {
      if (!player.guessEmbedding) continue;

      const similarity = cosineSimilarity(gift.embedding, player.guessEmbedding);
      if (similarity <= 0) continue;

      // Direction from gift to player
      const dx = player.position.x - gift.position.x;
      const dy = player.position.y - gift.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 0) {
        // Normalize and weight by similarity
        moveX += (dx / distance) * similarity;
        moveY += (dy / distance) * similarity;
      }
    }

    // Apply movement
    gift.position.x += moveX * GIFT_SPEED * deltaTime;
    gift.position.y += moveY * GIFT_SPEED * deltaTime;
  }
}

export function checkGameEnd(room: Room): boolean {
  if (room.phase !== 'playing') return false;
  if (!room.gameEndTime) return false;
  return Date.now() >= room.gameEndTime;
}

export function calculateResults(room: Room): GameResult[] {
  const results: GameResult[] = [];
  const assignedGifts = new Set<string>();
  const assignedPlayers = new Set<string>();

  // Sort players by their closest gift distance
  type PlayerGiftPair = { playerId: string; giftId: string; distance: number };
  const pairs: PlayerGiftPair[] = [];

  for (const player of room.players.values()) {
    for (const gift of room.gifts) {
      const dx = player.position.x - gift.position.x;
      const dy = player.position.y - gift.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      pairs.push({ playerId: player.id, giftId: gift.id, distance });
    }
  }

  // Sort by distance (closest first)
  pairs.sort((a, b) => a.distance - b.distance);

  // Assign gifts greedily
  for (const pair of pairs) {
    if (assignedGifts.has(pair.giftId) || assignedPlayers.has(pair.playerId)) {
      continue;
    }

    const player = room.players.get(pair.playerId)!;
    const gift = room.gifts.find((g) => g.id === pair.giftId)!;
    const giftOwner = room.players.get(gift.ownerId);

    results.push({
      playerId: player.id,
      playerName: player.name,
      giftId: gift.id,
      giftDescription: gift.description,
      giftOwnerName: giftOwner?.name || 'Unknown',
    });

    assignedGifts.add(pair.giftId);
    assignedPlayers.add(pair.playerId);
  }

  return results;
}

export function endGame(room: Room): GameResult[] {
  room.phase = 'ended';
  return calculateResults(room);
}

export function getRoomState(room: Room): RoomStatePayload {
  const players: PlayerInfo[] = Array.from(room.players.values()).map((p) => ({
    id: p.id,
    name: p.name,
    hasSubmittedGift: !!p.giftDescription,
    position: p.position,
  }));

  return {
    id: room.id,
    name: room.name,
    hostId: room.hostId,
    settings: room.settings,
    phase: room.phase,
    players,
  };
}

export function getGameState(room: Room): GameStatePayload {
  const now = Date.now();
  const timeRemaining = room.gameEndTime
    ? Math.max(0, Math.floor((room.gameEndTime - now) / 1000))
    : 0;

  const gifts: GiftState[] = room.gifts.map((g) => ({
    id: g.id,
    position: g.position,
    frozenSecondsLeft:
      g.frozenUntil && now < g.frozenUntil
        ? Math.ceil((g.frozenUntil - now) / 1000)
        : null,
  }));

  const players: GamePlayerState[] = Array.from(room.players.values()).map((p) => ({
    id: p.id,
    name: p.name,
    position: p.position,
    petrificusRemaining: p.petrificusRemaining,
    spyRemaining: p.spyRemaining,
  }));

  return { gifts, players, timeRemaining };
}

export function getPlayerRoom(playerId: string): string | undefined {
  return playerToRoom.get(playerId);
}

export function updatePlayerWs(playerId: string, ws: WebSocket): void {
  const room = getRoomByPlayerId(playerId);
  if (!room) return;
  const player = room.players.get(playerId);
  if (player) {
    player.ws = ws;
  }
}
