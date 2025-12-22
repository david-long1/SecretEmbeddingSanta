// Integration tests for WebSocket reconnection and connection stability
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import type { ServerWebSocket } from "bun";

// Tests connect to the dev server (must be running)
const WS_URL = `ws://localhost:3000/ws`;

// Helper to create WebSocket connection
function createConnection(reconnectId?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const url = reconnectId ? `${WS_URL}?reconnect=${reconnectId}` : WS_URL;
    const ws = new WebSocket(url);

    ws.onopen = () => resolve(ws);
    ws.onerror = (error) => reject(error);

    // Timeout after 5 seconds
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

// Helper to wait for message
function waitForMessage(ws: WebSocket, type: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const message = JSON.parse(event.data);
      if (message.type === type) {
        ws.removeEventListener('message', handler);
        resolve(message);
      }
    };

    ws.addEventListener('message', handler);

    setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error(`Timeout waiting for message type: ${type}`));
    }, timeout);
  });
}

// Helper to close connection and wait
function closeConnection(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    ws.onclose = () => resolve();
    ws.close();
  });
}

describe("WebSocket Connection", () => {
  test("should connect and receive playerId", async () => {
    const ws = await createConnection();

    const connectedMsg = await waitForMessage(ws, 'connected');

    expect(connectedMsg.type).toBe('connected');
    expect(connectedMsg.playerId).toBeDefined();
    expect(connectedMsg.playerId).toMatch(/^p_/);

    await closeConnection(ws);
  });

  test("should receive room list after connection", async () => {
    const ws = await createConnection();

    // Wait for connected message first
    await waitForMessage(ws, 'connected');

    // Then wait for room list
    const roomListMsg = await waitForMessage(ws, 'room_list');

    expect(roomListMsg.type).toBe('room_list');
    expect(Array.isArray(roomListMsg.rooms)).toBe(true);

    await closeConnection(ws);
  });
});

describe("WebSocket Reconnection", () => {
  test("should reconnect with same playerId when in a room", async () => {
    // First connection - create a room
    const ws1 = await createConnection();
    const connectedMsg1 = await waitForMessage(ws1, 'connected');
    const playerId = connectedMsg1.playerId;

    // Create a room
    ws1.send(JSON.stringify({
      type: 'create_room',
      roomName: 'Test Room',
      hostName: 'Test Host',
      settings: {
        gameDuration: 300,
        petrificusUses: 1,
        spyUses: 2
      }
    }));

    await waitForMessage(ws1, 'room_joined');

    // Disconnect
    await closeConnection(ws1);

    // Wait a bit to simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Reconnect with same playerId
    const ws2 = await createConnection(playerId);
    const connectedMsg2 = await waitForMessage(ws2, 'connected');

    // Should get the same playerId back
    expect(connectedMsg2.playerId).toBe(playerId);

    // Should receive room_state (because we're still in the room)
    const roomStateMsg = await waitForMessage(ws2, 'room_state');
    expect(roomStateMsg.room.name).toBe('Test Room');

    await closeConnection(ws2);
  });

  test("should get new playerId when reconnecting without being in a room", async () => {
    // First connection
    const ws1 = await createConnection();
    const connectedMsg1 = await waitForMessage(ws1, 'connected');
    const playerId1 = connectedMsg1.playerId;

    // Disconnect without joining a room
    await closeConnection(ws1);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Try to reconnect with old playerId
    const ws2 = await createConnection(playerId1);
    const connectedMsg2 = await waitForMessage(ws2, 'connected');

    // Should get a NEW playerId (because we weren't in a room)
    expect(connectedMsg2.playerId).not.toBe(playerId1);
    expect(connectedMsg2.playerId).toMatch(/^p_/);

    await closeConnection(ws2);
  });
});

describe("Ping/Pong Heartbeat", () => {
  test("should respond to ping with pong", async () => {
    const ws = await createConnection();
    await waitForMessage(ws, 'connected');

    // Send ping
    ws.send(JSON.stringify({ type: 'ping' }));

    // Wait for pong
    const pongMsg = await waitForMessage(ws, 'pong');
    expect(pongMsg.type).toBe('pong');

    await closeConnection(ws);
  });
});

describe("Room Creation and Joining", () => {
  test("should create room and maintain state on reconnection", async () => {
    // Create room
    const ws1 = await createConnection();
    const { playerId } = await waitForMessage(ws1, 'connected');

    ws1.send(JSON.stringify({
      type: 'create_room',
      roomName: 'Reconnect Test Room',
      hostName: 'Host Player',
      settings: {
        gameDuration: 300,
        petrificusUses: 1,
        spyUses: 2
      }
    }));

    const joinedMsg = await waitForMessage(ws1, 'room_joined');
    const roomId = joinedMsg.roomId;

    // Get room state
    const roomState1 = await waitForMessage(ws1, 'room_state');
    expect(roomState1.room.players.length).toBe(1);
    expect(roomState1.room.players[0].name).toBe('Host Player');

    // Disconnect
    await closeConnection(ws1);
    await new Promise(resolve => setTimeout(resolve, 100));

    // Reconnect with same playerId
    const ws2 = await createConnection(playerId);
    await waitForMessage(ws2, 'connected');

    // Should receive room state with same room
    const roomState2 = await waitForMessage(ws2, 'room_state');
    expect(roomState2.room.id).toBe(roomId);
    expect(roomState2.room.name).toBe('Reconnect Test Room');
    expect(roomState2.room.players.length).toBe(1);

    await closeConnection(ws2);
  });

  test("should handle multiple players and reconnections", async () => {
    // Host creates room
    const wsHost = await createConnection();
    const hostMsg = await waitForMessage(wsHost, 'connected');
    const hostId = hostMsg.playerId;

    // Consume initial room_list for host
    await waitForMessage(wsHost, 'room_list');

    wsHost.send(JSON.stringify({
      type: 'create_room',
      roomName: 'Multi Player Test',
      hostName: 'Host',
      settings: {
        gameDuration: 300,
        petrificusUses: 1,
        spyUses: 2
      }
    }));

    const hostJoined = await waitForMessage(wsHost, 'room_joined');
    const roomId = hostJoined.roomId;

    // Wait for host's own room_state
    await waitForMessage(wsHost, 'room_state');

    // Player 2 joins
    const wsPlayer = await createConnection();
    const playerMsg = await waitForMessage(wsPlayer, 'connected');
    const playerId = playerMsg.playerId;

    // Consume initial room_list for player
    await waitForMessage(wsPlayer, 'room_list');

    wsPlayer.send(JSON.stringify({
      type: 'join_room',
      roomId,
      playerName: 'Player 2'
    }));

    await waitForMessage(wsPlayer, 'room_joined');

    // Wait for room_state updates (broadcasts happen asynchronously)
    await new Promise(resolve => setTimeout(resolve, 200));

    // Player 2 disconnects
    await closeConnection(wsPlayer);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Player 2 reconnects
    const wsPlayer2 = await createConnection(playerId);
    await waitForMessage(wsPlayer2, 'connected');

    const reconnectedRoomState = await waitForMessage(wsPlayer2, 'room_state');
    expect(reconnectedRoomState.room.players.length).toBe(2);
    expect(reconnectedRoomState.room.id).toBe(roomId);

    // Cleanup
    await closeConnection(wsHost);
    await closeConnection(wsPlayer2);
  });
});

describe("Connection Status Tracking", () => {
  test("should handle rapid disconnect/reconnect", async () => {
    const ws1 = await createConnection();
    const { playerId } = await waitForMessage(ws1, 'connected');

    // Create room
    ws1.send(JSON.stringify({
      type: 'create_room',
      roomName: 'Rapid Test',
      hostName: 'Rapid Host',
      settings: {
        gameDuration: 300,
        petrificusUses: 1,
        spyUses: 2
      }
    }));

    await waitForMessage(ws1, 'room_joined');

    // Rapid disconnect
    await closeConnection(ws1);

    // Immediate reconnect (simulating mobile app switching)
    const ws2 = await createConnection(playerId);
    const reconnectedMsg = await waitForMessage(ws2, 'connected');

    expect(reconnectedMsg.playerId).toBe(playerId);

    await closeConnection(ws2);
  });
});
