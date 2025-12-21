// Main Bun Server - HTTP + WebSocket

import { networkInterfaces } from 'os';
import type { ServerWebSocket } from 'bun';
import type { ClientMessage, ServerMessage } from './types';
import {
  createRoom,
  getRoom,
  getAllRooms,
  joinRoom,
  leaveRoom,
  submitGift,
  canStartGame,
  startGame,
  updatePlayerGuess,
  usePetrificus,
  useSpy,
  updateGiftPositions,
  checkGameEnd,
  endGame,
  getRoomState,
  getGameState,
  getRoomByPlayerId,
} from './game-state';

const PORT = 3000;

// Get local IP address
function getLocalIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      // Skip internal and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// WebSocket data attached to each connection
interface WSData {
  playerId: string;
}

// Track all connections
const connections = new Map<string, ServerWebSocket<WSData>>();

function generatePlayerId(): string {
  return 'p_' + Math.random().toString(36).substring(2, 9);
}

function send(ws: ServerWebSocket<WSData>, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}

function broadcastToRoom(roomId: string, message: ServerMessage, excludePlayerId?: string): void {
  const room = getRoom(roomId);
  if (!room) return;

  for (const player of room.players.values()) {
    if (excludePlayerId && player.id === excludePlayerId) continue;
    const ws = connections.get(player.id);
    if (ws) {
      send(ws, message);
    }
  }
}

// Game loop - runs every 50ms (20fps)
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const deltaTime = (now - lastTick) / 1000;
  lastTick = now;

  for (const room of getAllRooms().map((r) => getRoom(r.id)).filter(Boolean)) {
    if (!room || room.phase !== 'playing') continue;

    // Update gift positions
    updateGiftPositions(room, deltaTime);

    // Check for game end
    if (checkGameEnd(room)) {
      const results = endGame(room);
      broadcastToRoom(room.id, { type: 'game_end', results });
    } else {
      // Broadcast game state
      broadcastToRoom(room.id, { type: 'game_state', state: getGameState(room) });
    }
  }
}, 50);

// Handle WebSocket messages
async function handleMessage(ws: ServerWebSocket<WSData>, message: ClientMessage): Promise<void> {
  const playerId = ws.data.playerId;

  switch (message.type) {
    case 'get_rooms': {
      send(ws, { type: 'room_list', rooms: getAllRooms() });
      break;
    }

    case 'create_room': {
      const room = createRoom(playerId, message.roomName, message.settings);
      send(ws, { type: 'room_joined', roomId: room.id, playerId });
      // Auto-join the host to the room
      // Host will need to call join_room separately to set their name
      break;
    }

    case 'join_room': {
      const result = joinRoom(message.roomId, playerId, message.playerName, ws as any);
      if (result.success && result.room) {
        send(ws, { type: 'room_joined', roomId: result.room.id, playerId });
        // Broadcast updated room state to all players
        broadcastToRoom(result.room.id, { type: 'room_state', room: getRoomState(result.room) });
        // Also broadcast updated room list to everyone
        for (const conn of connections.values()) {
          send(conn, { type: 'room_list', rooms: getAllRooms() });
        }
      } else {
        send(ws, { type: 'error', message: result.error || 'Failed to join room' });
      }
      break;
    }

    case 'submit_gift': {
      const result = await submitGift(playerId, message.giftDescription);
      if (result.success) {
        const room = getRoomByPlayerId(playerId);
        if (room) {
          broadcastToRoom(room.id, { type: 'room_state', room: getRoomState(room) });
        }
      } else {
        send(ws, { type: 'error', message: result.error || 'Failed to submit gift' });
      }
      break;
    }

    case 'update_guess': {
      await updatePlayerGuess(playerId, message.guess);
      break;
    }

    case 'use_petrificus': {
      const result = usePetrificus(playerId, message.giftId);
      if (!result.success) {
        send(ws, { type: 'error', message: result.error || 'Failed to use Petrificus' });
      }
      break;
    }

    case 'use_spy': {
      const result = useSpy(playerId, message.targetPlayerId);
      if (result.success) {
        send(ws, {
          type: 'spy_result',
          targetName: result.targetName!,
          targetGuess: result.targetGuess!,
        });
      } else {
        send(ws, { type: 'error', message: result.error || 'Failed to use Spy' });
      }
      break;
    }

    case 'start_game': {
      const room = getRoomByPlayerId(playerId);
      if (!room) {
        send(ws, { type: 'error', message: 'Not in a room' });
        break;
      }
      if (room.hostId !== playerId) {
        send(ws, { type: 'error', message: 'Only the host can start the game' });
        break;
      }
      const result = await startGame(room.id);
      if (result.success) {
        broadcastToRoom(room.id, { type: 'room_state', room: getRoomState(room) });
        broadcastToRoom(room.id, { type: 'game_state', state: getGameState(room) });
      } else {
        send(ws, { type: 'error', message: result.error || 'Failed to start game' });
      }
      break;
    }
  }
}

// Static file serving
const publicDir = new URL('../public', import.meta.url).pathname;

async function serveStatic(path: string): Promise<Response> {
  const filePath = path === '/' ? '/index.html' : path;
  const file = Bun.file(publicDir + filePath);

  if (await file.exists()) {
    return new Response(file);
  }
  return new Response('Not Found', { status: 404 });
}

// Start server
const localIP = getLocalIP();

const server = Bun.serve<WSData>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === '/ws') {
      const playerId = generatePlayerId();
      const success = server.upgrade(req, { data: { playerId } });
      if (success) {
        return undefined;
      }
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    // Serve static files
    return serveStatic(url.pathname);
  },
  websocket: {
    open(ws) {
      connections.set(ws.data.playerId, ws);
      send(ws, { type: 'connected', playerId: ws.data.playerId });
      send(ws, { type: 'room_list', rooms: getAllRooms() });
    },
    async message(ws, message) {
      try {
        const data = JSON.parse(message.toString()) as ClientMessage;
        await handleMessage(ws, data);
      } catch (error) {
        console.error('Error handling message:', error);
        send(ws, { type: 'error', message: 'Invalid message format' });
      }
    },
    close(ws) {
      const playerId = ws.data.playerId;
      const room = getRoomByPlayerId(playerId);
      leaveRoom(playerId);
      connections.delete(playerId);

      // Notify remaining players
      if (room) {
        const updatedRoom = getRoom(room.id);
        if (updatedRoom) {
          broadcastToRoom(room.id, { type: 'room_state', room: getRoomState(updatedRoom) });
        }
        // Update room list for everyone
        for (const conn of connections.values()) {
          send(conn, { type: 'room_list', rooms: getAllRooms() });
        }
      }
    },
  },
});

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                   🎁 SecretEmbeddingSanta 🎁                   ║
╠═══════════════════════════════════════════════════════════════╣
║  Server running!                                               ║
║                                                                 ║
║  Local:   http://localhost:${PORT}                              ║
║  Network: http://${localIP}:${PORT}                             ║
║                                                                 ║
║  Share the Network URL with friends on the same WiFi!          ║
╚═══════════════════════════════════════════════════════════════╝
`);

export { server };
