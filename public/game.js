// SecretEmbeddingSanta - Frontend Game Logic

// State
let ws = null;
let playerId = null;
let currentRoomId = null;
let currentRoom = null;
let gameState = null;
let isHost = false;

// Power modes
let activePower = null; // 'petrificus' | 'spy' | null

// Canvas
let canvas = null;
let ctx = null;

// Screen management
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');

  if (screenId === 'game-screen') {
    initCanvas();
  }
}

// WebSocket connection
function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onopen = () => {
    console.log('Connected to server');
  };

  ws.onclose = () => {
    console.log('Disconnected from server');
    setTimeout(connect, 1000);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleMessage(message);
  };
}

function send(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Message handlers
function handleMessage(message) {
  switch (message.type) {
    case 'connected':
      playerId = message.playerId;
      console.log('Player ID:', playerId);
      break;

    case 'room_list':
      renderRoomList(message.rooms);
      break;

    case 'room_joined':
      currentRoomId = message.roomId;
      break;

    case 'room_state':
      currentRoom = message.room;
      isHost = currentRoom.hostId === playerId;

      if (currentRoom.phase === 'waiting') {
        showScreen('waiting-screen');
        renderWaitingRoom();
      } else if (currentRoom.phase === 'playing') {
        showScreen('game-screen');
      } else if (currentRoom.phase === 'ended') {
        // Will receive game_end message
      }
      break;

    case 'game_state':
      gameState = message.state;
      updateGameUI();
      renderGame();
      break;

    case 'spy_result':
      showSpyResult(message.targetName, message.targetGuess);
      break;

    case 'game_end':
      showResults(message.results);
      break;

    case 'error':
      alert(message.message);
      break;
  }
}

// Room list
function renderRoomList(rooms) {
  const container = document.getElementById('room-list');

  if (rooms.length === 0) {
    container.innerHTML = '<p class="empty-state">No rooms available. Create one!</p>';
    return;
  }

  container.innerHTML = rooms
    .filter(room => room.phase === 'waiting')
    .map(room => `
      <div class="room-card">
        <div class="room-info">
          <h3>${escapeHtml(room.name)}</h3>
          <p>${room.playerCount} player${room.playerCount !== 1 ? 's' : ''} • Host: ${escapeHtml(room.hostName)}</p>
        </div>
        <button class="btn btn-primary" onclick="openJoinModal('${room.id}')">Join</button>
      </div>
    `).join('');
}

// Create room
document.getElementById('create-room-btn').addEventListener('click', () => {
  document.getElementById('create-room-modal').classList.remove('hidden');
});

document.getElementById('cancel-create').addEventListener('click', () => {
  document.getElementById('create-room-modal').classList.add('hidden');
});

document.getElementById('create-room-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const roomName = document.getElementById('room-name').value;
  const gameDuration = parseInt(document.getElementById('game-duration').value) * 60;
  const petrificusUses = parseInt(document.getElementById('petrificus-uses').value);
  const spyUses = parseInt(document.getElementById('spy-uses').value);

  send({
    type: 'create_room',
    roomName,
    settings: { gameDuration, petrificusUses, spyUses }
  });

  // Auto-join as host
  const playerName = prompt('Enter your name:');
  if (playerName) {
    // Wait a bit for room to be created
    setTimeout(() => {
      send({
        type: 'join_room',
        roomId: currentRoomId,
        playerName
      });
    }, 100);
  }

  document.getElementById('create-room-modal').classList.add('hidden');
});

// Join room
function openJoinModal(roomId) {
  document.getElementById('join-room-id').value = roomId;
  document.getElementById('join-room-modal').classList.remove('hidden');
}

document.getElementById('cancel-join').addEventListener('click', () => {
  document.getElementById('join-room-modal').classList.add('hidden');
});

document.getElementById('join-room-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const roomId = document.getElementById('join-room-id').value;
  const playerName = document.getElementById('player-name').value;

  send({
    type: 'join_room',
    roomId,
    playerName
  });

  document.getElementById('join-room-modal').classList.add('hidden');
});

// Waiting room
function renderWaitingRoom() {
  document.getElementById('waiting-room-name').textContent = currentRoom.name;

  const playersList = document.getElementById('players-list');
  playersList.innerHTML = currentRoom.players.map(player => {
    let classes = 'player-card';
    if (player.id === currentRoom.hostId) classes += ' is-host';
    if (player.id === playerId) classes += ' is-you';

    return `
      <div class="${classes}">
        <span class="player-name">${escapeHtml(player.name)}</span>
        <span class="gift-status ${player.hasSubmittedGift ? 'submitted' : 'pending'}">
          ${player.hasSubmittedGift ? '✓ Gift ready' : '⋯ Waiting'}
        </span>
      </div>
    `;
  }).join('');

  // Host controls
  const hostControls = document.getElementById('host-controls');
  const startBtn = document.getElementById('start-game-btn');

  if (isHost) {
    hostControls.classList.remove('hidden');
    const allReady = currentRoom.players.every(p => p.hasSubmittedGift);
    const enoughPlayers = currentRoom.players.length >= 2;
    startBtn.disabled = !(allReady && enoughPlayers);

    if (!enoughPlayers) {
      hostControls.querySelector('.hint').textContent = 'Need at least 2 players...';
    } else if (!allReady) {
      hostControls.querySelector('.hint').textContent = 'Waiting for all players to submit their gifts...';
    } else {
      hostControls.querySelector('.hint').textContent = 'All players ready!';
    }
  } else {
    hostControls.classList.add('hidden');
  }

  // Check if current player has submitted
  const myPlayer = currentRoom.players.find(p => p.id === playerId);
  if (myPlayer && myPlayer.hasSubmittedGift) {
    document.getElementById('gift-form').classList.add('hidden');
    document.getElementById('gift-submitted').classList.remove('hidden');
  } else {
    document.getElementById('gift-form').classList.remove('hidden');
    document.getElementById('gift-submitted').classList.add('hidden');
  }
}

// Submit gift
document.getElementById('gift-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const giftDescription = document.getElementById('gift-description').value;
  send({
    type: 'submit_gift',
    giftDescription
  });
});

// Start game
document.getElementById('start-game-btn').addEventListener('click', () => {
  send({ type: 'start_game' });
});

// Leave room
document.getElementById('leave-room-btn').addEventListener('click', () => {
  currentRoomId = null;
  currentRoom = null;
  showScreen('lobby-screen');
  send({ type: 'get_rooms' });
});

// Game canvas
function initCanvas() {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Click/tap handler for powers
  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('touchend', handleCanvasTouch);
}

function resizeCanvas() {
  const container = canvas.parentElement;
  const header = document.querySelector('.game-header');
  const guessContainer = document.querySelector('.guess-container');

  canvas.width = container.clientWidth;
  canvas.height = window.innerHeight - header.offsetHeight - guessContainer.offsetHeight;
}

function handleCanvasClick(e) {
  if (!activePower || !gameState) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  handlePowerClick(x, y);
}

function handleCanvasTouch(e) {
  if (!activePower || !gameState) return;
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const touch = e.changedTouches[0];
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;

  handlePowerClick(x, y);
}

function handlePowerClick(x, y) {
  // Scale to game coordinates
  const scale = getCanvasScale();
  const gameX = (x - scale.offsetX) / scale.scale;
  const gameY = (y - scale.offsetY) / scale.scale;

  if (activePower === 'petrificus') {
    // Find clicked gift
    for (const gift of gameState.gifts) {
      const dx = gift.position.x - gameX;
      const dy = gift.position.y - gameY;
      if (Math.sqrt(dx*dx + dy*dy) < 30) {
        send({ type: 'use_petrificus', giftId: gift.id });
        activePower = null;
        updatePowerButtons();
        return;
      }
    }
  } else if (activePower === 'spy') {
    // Find clicked player
    for (const player of gameState.players) {
      if (player.id === playerId) continue;
      const dx = player.position.x - gameX;
      const dy = player.position.y - gameY;
      if (Math.sqrt(dx*dx + dy*dy) < 40) {
        send({ type: 'use_spy', targetPlayerId: player.id });
        activePower = null;
        updatePowerButtons();
        return;
      }
    }
  }
}

function getCanvasScale() {
  const gameWidth = 800;
  const gameHeight = 800;
  const scale = Math.min(canvas.width / gameWidth, canvas.height / gameHeight);
  return {
    scale,
    offsetX: (canvas.width - gameWidth * scale) / 2,
    offsetY: (canvas.height - gameHeight * scale) / 2
  };
}

function renderGame() {
  if (!ctx || !gameState) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const { scale, offsetX, offsetY } = getCanvasScale();

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Draw arena circle (faint)
  ctx.beginPath();
  ctx.arc(400, 400, 300, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(42, 42, 58, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw center area (where gifts spawn)
  ctx.beginPath();
  ctx.arc(400, 400, 150, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(42, 42, 58, 0.3)';
  ctx.setLineDash([5, 5]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw players
  for (const player of gameState.players) {
    const isMe = player.id === playerId;

    // Player circle
    ctx.beginPath();
    ctx.arc(player.position.x, player.position.y, 30, 0, Math.PI * 2);
    ctx.fillStyle = isMe ? '#4a9eff' : '#2a2a3a';
    ctx.fill();
    ctx.strokeStyle = isMe ? '#5aa8ff' : '#3a3a4a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Player name
    ctx.fillStyle = isMe ? '#fff' : '#e0e0e5';
    ctx.font = 'bold 12px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(player.name, player.position.x, player.position.y + 50);
  }

  // Draw gifts
  for (const gift of gameState.gifts) {
    const isFrozen = gift.frozenSecondsLeft !== null;

    // Gift box
    ctx.beginPath();
    ctx.rect(gift.position.x - 20, gift.position.y - 20, 40, 40);
    ctx.fillStyle = isFrozen ? '#6be5ff' : '#7b5cff';
    ctx.fill();
    ctx.strokeStyle = isFrozen ? '#9eeeff' : '#9b7cff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Gift ribbon
    ctx.beginPath();
    ctx.moveTo(gift.position.x, gift.position.y - 20);
    ctx.lineTo(gift.position.x, gift.position.y + 20);
    ctx.moveTo(gift.position.x - 20, gift.position.y);
    ctx.lineTo(gift.position.x + 20, gift.position.y);
    ctx.strokeStyle = isFrozen ? '#fff' : '#ffb84a';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Bow
    ctx.fillStyle = isFrozen ? '#fff' : '#ffb84a';
    ctx.beginPath();
    ctx.arc(gift.position.x, gift.position.y - 20, 8, 0, Math.PI * 2);
    ctx.fill();

    // Frozen timer
    if (isFrozen) {
      ctx.fillStyle = '#000';
      ctx.font = 'bold 14px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(gift.frozenSecondsLeft + 's', gift.position.x, gift.position.y + 5);
    }
  }

  // Draw power targeting mode indicator
  if (activePower) {
    ctx.fillStyle = 'rgba(74, 158, 255, 0.1)';
    ctx.fillRect(0, 0, 800, 800);

    ctx.fillStyle = '#4a9eff';
    ctx.font = 'bold 16px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      activePower === 'petrificus' ? 'Click a gift to freeze it!' : 'Click a player to spy!',
      400, 50
    );
  }

  ctx.restore();
}

// Game UI updates
function updateGameUI() {
  if (!gameState) return;

  // Timer
  const minutes = Math.floor(gameState.timeRemaining / 60);
  const seconds = gameState.timeRemaining % 60;
  document.getElementById('game-timer').textContent =
    `${minutes}:${seconds.toString().padStart(2, '0')}`;

  // Powers
  const myPlayer = gameState.players.find(p => p.id === playerId);
  if (myPlayer) {
    document.getElementById('petrificus-count').textContent = myPlayer.petrificusRemaining;
    document.getElementById('spy-count').textContent = myPlayer.spyRemaining;

    document.getElementById('petrificus-btn').disabled = myPlayer.petrificusRemaining === 0;
    document.getElementById('spy-btn').disabled = myPlayer.spyRemaining === 0;
  }

  updatePowerButtons();
}

function updatePowerButtons() {
  document.getElementById('petrificus-btn').classList.toggle('active', activePower === 'petrificus');
  document.getElementById('spy-btn').classList.toggle('active', activePower === 'spy');
}

// Power buttons
document.getElementById('petrificus-btn').addEventListener('click', () => {
  if (activePower === 'petrificus') {
    activePower = null;
  } else {
    activePower = 'petrificus';
  }
  updatePowerButtons();
});

document.getElementById('spy-btn').addEventListener('click', () => {
  if (activePower === 'spy') {
    activePower = null;
  } else {
    activePower = 'spy';
  }
  updatePowerButtons();
});

// Guess input
let guessDebounce = null;
document.getElementById('guess-input').addEventListener('input', (e) => {
  clearTimeout(guessDebounce);
  guessDebounce = setTimeout(() => {
    send({ type: 'update_guess', guess: e.target.value });
  }, 200);
});

// Spy modal
function showSpyResult(targetName, targetGuess) {
  document.getElementById('spy-target-name').textContent = targetName;
  document.getElementById('spy-target-guess').textContent = targetGuess || '(no guess yet)';
  document.getElementById('spy-modal').classList.remove('hidden');
}

document.getElementById('close-spy-modal').addEventListener('click', () => {
  document.getElementById('spy-modal').classList.add('hidden');
});

// Results
function showResults(results) {
  showScreen('results-screen');

  const container = document.getElementById('results-list');
  container.innerHTML = results.map(result => {
    const isMe = result.playerId === playerId;
    return `
      <div class="result-card ${isMe ? 'is-you' : ''}">
        <div class="player-name">${escapeHtml(result.playerName)}${isMe ? ' (You)' : ''}</div>
        <div class="gift-desc">${escapeHtml(result.giftDescription)}</div>
        <div class="gift-from">From: ${escapeHtml(result.giftOwnerName)}</div>
      </div>
    `;
  }).join('');
}

document.getElementById('back-to-lobby-btn').addEventListener('click', () => {
  currentRoomId = null;
  currentRoom = null;
  gameState = null;
  showScreen('lobby-screen');
  send({ type: 'get_rooms' });
});

// Utility
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Start
connect();
