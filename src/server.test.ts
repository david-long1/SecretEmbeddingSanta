// Integration tests for WebSocket connection and gameplay
import { describe, expect, test } from 'bun:test';

// Tests connect to the dev server (must be running)
const WS_URL = `ws://localhost:3000/ws`;

// Helper to create WebSocket connection
function createConnection(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => resolve(ws);
    ws.onerror = (error) => reject(error);

    // Timeout after 5 seconds
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

// Helper to wait for message
// biome-ignore lint/suspicious/noExplicitAny: Test helper function needs flexible return type
function waitForMessage(
  ws: WebSocket,
  type: string,
  timeout = 5000,
): Promise<any> {
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

describe('WebSocket Connection', () => {
  test('should connect and receive playerId', async () => {
    const ws = await createConnection();

    const connectedMsg = await waitForMessage(ws, 'connected');

    expect(connectedMsg.type).toBe('connected');
    expect(connectedMsg.playerId).toBeDefined();
    expect(connectedMsg.playerId).toMatch(/^p_/);

    await closeConnection(ws);
  });

  test('should receive room list after connection', async () => {
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

describe('Ping/Pong Heartbeat', () => {
  test('should respond to ping with pong', async () => {
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

describe('Username Validation', () => {
  test('should reject duplicate usernames in the same room', async () => {
    // Host creates room
    const wsHost = await createConnection();
    await waitForMessage(wsHost, 'connected');
    await waitForMessage(wsHost, 'room_list');

    wsHost.send(
      JSON.stringify({
        type: 'create_room',
        roomName: 'Username Test',
        hostName: 'Alice',
        settings: {
          gameDuration: 300,
          petrificusUses: 1,
          spyUses: 2,
        },
      }),
    );

    const hostJoined = await waitForMessage(wsHost, 'room_joined');
    const roomId = hostJoined.roomId;
    await waitForMessage(wsHost, 'room_state');

    // Player 2 tries to join with same name
    const wsPlayer = await createConnection();
    await waitForMessage(wsPlayer, 'connected');
    await waitForMessage(wsPlayer, 'room_list');

    wsPlayer.send(
      JSON.stringify({
        type: 'join_room',
        roomId,
        playerName: 'Alice', // Same name as host
      }),
    );

    // Should receive error
    const errorMsg = await waitForMessage(wsPlayer, 'error');
    expect(errorMsg.message).toContain('already taken');

    // Try with different name - should succeed
    wsPlayer.send(
      JSON.stringify({
        type: 'join_room',
        roomId,
        playerName: 'Bob',
      }),
    );

    const joinedMsg = await waitForMessage(wsPlayer, 'room_joined');
    expect(joinedMsg.roomId).toBe(roomId);

    // Cleanup
    await closeConnection(wsHost);
    await closeConnection(wsPlayer);
  });

  test('should reject duplicate usernames case-insensitively', async () => {
    // Host creates room
    const wsHost = await createConnection();
    await waitForMessage(wsHost, 'connected');
    await waitForMessage(wsHost, 'room_list');

    wsHost.send(
      JSON.stringify({
        type: 'create_room',
        roomName: 'Case Test',
        hostName: 'Alice',
        settings: {
          gameDuration: 300,
          petrificusUses: 1,
          spyUses: 2,
        },
      }),
    );

    const hostJoined = await waitForMessage(wsHost, 'room_joined');
    const roomId = hostJoined.roomId;
    await waitForMessage(wsHost, 'room_state');

    // Player tries to join with different case
    const wsPlayer = await createConnection();
    await waitForMessage(wsPlayer, 'connected');
    await waitForMessage(wsPlayer, 'room_list');

    wsPlayer.send(
      JSON.stringify({
        type: 'join_room',
        roomId,
        playerName: 'ALICE', // Different case
      }),
    );

    // Should still be rejected
    const errorMsg = await waitForMessage(wsPlayer, 'error');
    expect(errorMsg.message).toContain('already taken');

    // Cleanup
    await closeConnection(wsHost);
    await closeConnection(wsPlayer);
  });
});
