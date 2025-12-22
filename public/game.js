// SecretEmbeddingSanta - Frontend Game Logic

// State
let ws = null;
let playerId = null;
let currentRoomId = null;
let currentRoom = null;
let gameState = null;
let isHost = false;
let pendingHostName = null; // Store host name while waiting for room creation

// Power modes
let activePower = null; // 'petrificus' | 'spy' | null

// End game animation state
let endGameResults = null;
let animatingGiftIndex = -1;
let giftAnimationProgress = 0;
let isAnimatingEnd = false;

// Canvas
let canvas = null;
let ctx = null;

// Theme colors
const COLORS = {
  bgBase: '#1a1215',
  bgSurface: '#241a1d',
  border: '#4a3538',
  white: '#fff5f5',
  whiteDim: '#e8dada',
  red: '#dc2626',
  redLight: '#ef4444',
  redGlow: 'rgba(220, 38, 38, 0.3)',
  frozen: '#fecaca',
  textMuted: '#8a7a7c'
};

// Gift color combinations (box, ribbon) - candy cane inspired
const GIFT_COLORS = [
  { box: '#dc2626', ribbon: '#fff5f5' },  // Classic red + white
  { box: '#fff5f5', ribbon: '#dc2626' },  // Inverted: white + red
  { box: '#b91c1c', ribbon: '#fecaca' },  // Dark red + pink
  { box: '#fecaca', ribbon: '#b91c1c' },  // Pink + dark red
  { box: '#ef4444', ribbon: '#fff5f5' },  // Light red + white
  { box: '#7f1d1d', ribbon: '#f87171' },  // Maroon + coral
  { box: '#f87171', ribbon: '#7f1d1d' },  // Coral + maroon
  { box: '#fca5a5', ribbon: '#991b1b' },  // Salmon + crimson
];

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
      // Don't update if we're animating the end
      if (isAnimatingEnd) break;
      gameState = message.state;
      updateGameUI();
      renderGame();
      break;

    case 'spy_result':
      showSpyResult(message.targetName, message.targetGuess);
      break;

    case 'game_end':
      console.log('Game end received:', message.results);
      startEndGameAnimation(message.results);
      break;

    case 'error':
      showError(message.message);
      break;
  }
}

// Error display (no more alert!)
function showError(message) {
  // For now, console log - could add toast UI later
  console.error('Error:', message);
}

// Room list
function renderRoomList(rooms) {
  const container = document.getElementById('room-list');
  const waitingRooms = rooms.filter(room => room.phase === 'waiting');

  if (waitingRooms.length === 0) {
    container.innerHTML = '<p class="empty-state">No rooms yet.<br>Create one to get started!</p>';
    return;
  }

  container.innerHTML = waitingRooms.map(room => `
    <div class="room-card">
      <div class="room-info">
        <h3>${escapeHtml(room.name)}</h3>
        <div class="room-meta">
          <span class="player-count">${room.playerCount} player${room.playerCount !== 1 ? 's' : ''}</span>
          <span>Host: ${escapeHtml(room.hostName)}</span>
        </div>
      </div>
      <button class="btn btn-primary" onclick="openJoinModal('${room.id}')">Join</button>
    </div>
  `).join('');
}

// Create room modal
document.getElementById('create-room-btn').addEventListener('click', () => {
  document.getElementById('create-room-modal').classList.remove('hidden');
  document.getElementById('host-name').focus();
});

document.getElementById('cancel-create').addEventListener('click', closeCreateModal);
document.getElementById('close-create-modal').addEventListener('click', closeCreateModal);

function closeCreateModal() {
  document.getElementById('create-room-modal').classList.add('hidden');
  document.getElementById('create-room-form').reset();
}

document.getElementById('create-room-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const hostName = document.getElementById('host-name').value.trim();
  const roomName = document.getElementById('room-name').value.trim();
  const gameDuration = parseInt(document.getElementById('game-duration').value) * 60;
  const petrificusUses = parseInt(document.getElementById('petrificus-uses').value);
  const spyUses = parseInt(document.getElementById('spy-uses').value);

  if (!hostName || !roomName) return;

  // Store host name for after room is created
  pendingHostName = hostName;

  send({
    type: 'create_room',
    roomName,
    settings: { gameDuration, petrificusUses, spyUses }
  });

  // Wait for room_joined message, then auto-join
  const checkAndJoin = () => {
    if (currentRoomId && pendingHostName) {
      send({
        type: 'join_room',
        roomId: currentRoomId,
        playerName: pendingHostName
      });
      pendingHostName = null;
    } else {
      setTimeout(checkAndJoin, 50);
    }
  };
  setTimeout(checkAndJoin, 50);

  closeCreateModal();
});

// Join room modal
function openJoinModal(roomId) {
  document.getElementById('join-room-id').value = roomId;
  document.getElementById('join-room-modal').classList.remove('hidden');
  document.getElementById('player-name').focus();
}

document.getElementById('cancel-join').addEventListener('click', closeJoinModal);
document.getElementById('close-join-modal').addEventListener('click', closeJoinModal);

function closeJoinModal() {
  document.getElementById('join-room-modal').classList.add('hidden');
  document.getElementById('join-room-form').reset();
}

document.getElementById('join-room-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const roomId = document.getElementById('join-room-id').value;
  const playerName = document.getElementById('player-name').value.trim();

  if (!playerName) return;

  send({
    type: 'join_room',
    roomId,
    playerName
  });

  closeJoinModal();
});

// Get initials from name
function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// Waiting room
function renderWaitingRoom() {
  document.getElementById('waiting-room-name').textContent = currentRoom.name;

  const playersList = document.getElementById('players-list');
  playersList.innerHTML = currentRoom.players.map(player => {
    const isHostPlayer = player.id === currentRoom.hostId;
    const isMe = player.id === playerId;

    let badges = '';
    if (isHostPlayer) badges += '<span class="player-badge host">Host</span>';
    if (isMe) badges += '<span class="player-badge you">You</span>';

    return `
      <div class="player-card">
        <div class="player-info">
          <div class="player-avatar">${getInitials(player.name)}</div>
          <span class="player-name">${escapeHtml(player.name)}${badges}</span>
        </div>
        <span class="gift-status ${player.hasSubmittedGift ? 'submitted' : 'pending'}">
          ${player.hasSubmittedGift ? 'Ready' : 'Waiting'}
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
      hostControls.querySelector('.hint').textContent = 'Waiting for all players to submit gifts...';
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

  const giftDescription = document.getElementById('gift-description').value.trim();
  if (!giftDescription) return;

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

  // Get the #app container dimensions
  const app = document.getElementById('app');
  canvas.width = app.clientWidth;
  canvas.height = app.clientHeight - header.offsetHeight - guessContainer.offsetHeight;
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

  // Draw arena circle (candy cane themed)
  ctx.beginPath();
  ctx.arc(400, 400, 300, 0, Math.PI * 2);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw center area (where gifts spawn)
  ctx.beginPath();
  ctx.arc(400, 400, 150, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(220, 38, 38, 0.2)';
  ctx.setLineDash([5, 5]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw players
  for (const player of gameState.players) {
    const isMe = player.id === playerId;

    // Player circle
    ctx.beginPath();
    ctx.arc(player.position.x, player.position.y, 30, 0, Math.PI * 2);
    ctx.fillStyle = isMe ? COLORS.red : COLORS.bgSurface;
    ctx.fill();
    ctx.strokeStyle = isMe ? COLORS.redLight : COLORS.border;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Player initials
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(getInitials(player.name), player.position.x, player.position.y);

    // Player name
    ctx.fillStyle = isMe ? COLORS.white : COLORS.whiteDim;
    ctx.font = '12px -apple-system, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(player.name, player.position.x, player.position.y + 38);
  }

  // Draw gifts
  gameState.gifts.forEach((gift, index) => {
    const isFrozen = gift.frozenSecondsLeft !== null;
    const colorScheme = GIFT_COLORS[index % GIFT_COLORS.length];

    // Gift box
    ctx.beginPath();
    ctx.rect(gift.position.x - 20, gift.position.y - 20, 40, 40);
    ctx.fillStyle = isFrozen ? COLORS.frozen : colorScheme.box;
    ctx.fill();
    ctx.strokeStyle = isFrozen ? COLORS.white : colorScheme.ribbon;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Gift ribbon
    ctx.beginPath();
    ctx.moveTo(gift.position.x, gift.position.y - 20);
    ctx.lineTo(gift.position.x, gift.position.y + 20);
    ctx.moveTo(gift.position.x - 20, gift.position.y);
    ctx.lineTo(gift.position.x + 20, gift.position.y);
    ctx.strokeStyle = isFrozen ? COLORS.white : colorScheme.ribbon;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Bow
    ctx.fillStyle = isFrozen ? COLORS.white : colorScheme.ribbon;
    ctx.beginPath();
    ctx.arc(gift.position.x, gift.position.y - 20, 8, 0, Math.PI * 2);
    ctx.fill();

    // Frozen timer
    if (isFrozen) {
      ctx.fillStyle = COLORS.red;
      ctx.font = 'bold 14px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(gift.frozenSecondsLeft + 's', gift.position.x, gift.position.y + 5);
    }
  });

  // Draw power targeting mode indicator
  if (activePower) {
    ctx.fillStyle = COLORS.redGlow;
    ctx.fillRect(0, 0, 800, 800);

    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 16px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(
      activePower === 'petrificus' ? 'Tap a gift to freeze it!' : 'Tap a player to spy!',
      400, 30
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
  const timerEl = document.getElementById('game-timer');
  timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  // Add warning class when < 30 seconds
  const timerContainer = timerEl.parentElement;
  if (gameState.timeRemaining < 30) {
    timerContainer.classList.add('warning');
  } else {
    timerContainer.classList.remove('warning');
  }

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

// Guess input - only submit on button click or Enter key
function submitGuess() {
  const input = document.getElementById('guess-input');
  const guess = input.value.trim();
  if (guess) {
    send({ type: 'update_guess', guess });
  }
}

document.getElementById('guess-submit-btn').addEventListener('click', submitGuess);

document.getElementById('guess-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitGuess();
  }
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

// End game animation
function startEndGameAnimation(results) {
  if (!results || results.length === 0) {
    console.error('No results to animate');
    showResults(results);
    return;
  }

  endGameResults = results;
  animatingGiftIndex = 0;
  giftAnimationProgress = 0;
  isAnimatingEnd = true;

  // Hide the guess input during animation
  document.querySelector('.guess-container').style.display = 'none';

  // Start the animation loop
  animateEndGame();
}

function animateEndGame() {
  if (!isAnimatingEnd || !endGameResults) return;

  const result = endGameResults[animatingGiftIndex];
  if (!result) {
    // All done, show results
    finishEndGameAnimation();
    return;
  }

  // Animate the gift flying to the player
  giftAnimationProgress += 0.02; // Speed of animation

  if (giftAnimationProgress >= 1) {
    // This gift animation is complete, move to next
    giftAnimationProgress = 0;
    animatingGiftIndex++;

    if (animatingGiftIndex >= endGameResults.length) {
      // All gifts animated, show results after a short delay
      setTimeout(finishEndGameAnimation, 500);
      return;
    }
  }

  // Render the animation frame
  renderEndGameAnimation();

  // Continue animation
  requestAnimationFrame(animateEndGame);
}

function renderEndGameAnimation() {
  if (!ctx || !endGameResults) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const { scale, offsetX, offsetY } = getCanvasScale();

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Draw arena circle
  ctx.beginPath();
  ctx.arc(400, 400, 300, 0, Math.PI * 2);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw all players (from results data)
  for (const result of endGameResults) {
    const isMe = result.playerId === playerId;

    ctx.beginPath();
    ctx.arc(result.playerPosition.x, result.playerPosition.y, 30, 0, Math.PI * 2);
    ctx.fillStyle = isMe ? COLORS.red : COLORS.bgSurface;
    ctx.fill();
    ctx.strokeStyle = isMe ? COLORS.redLight : COLORS.border;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(getInitials(result.playerName), result.playerPosition.x, result.playerPosition.y);

    ctx.fillStyle = isMe ? COLORS.white : COLORS.whiteDim;
    ctx.font = '12px -apple-system, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(result.playerName, result.playerPosition.x, result.playerPosition.y + 38);
  }

  // Draw gifts - completed ones at their player, current one animating, rest at original position
  for (let i = 0; i < endGameResults.length; i++) {
    const result = endGameResults[i];
    const colorScheme = GIFT_COLORS[result.giftColorIndex % GIFT_COLORS.length];

    let giftX, giftY;

    if (i < animatingGiftIndex) {
      // Already animated - at player position
      giftX = result.playerPosition.x;
      giftY = result.playerPosition.y;
    } else if (i === animatingGiftIndex) {
      // Currently animating - interpolate
      const eased = easeOutCubic(giftAnimationProgress);
      giftX = result.giftPosition.x + (result.playerPosition.x - result.giftPosition.x) * eased;
      giftY = result.giftPosition.y + (result.playerPosition.y - result.giftPosition.y) * eased;
    } else {
      // Not yet animated - at original position
      giftX = result.giftPosition.x;
      giftY = result.giftPosition.y;
    }

    // Draw gift box
    ctx.beginPath();
    ctx.rect(giftX - 20, giftY - 20, 40, 40);
    ctx.fillStyle = colorScheme.box;
    ctx.fill();
    ctx.strokeStyle = colorScheme.ribbon;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Gift ribbon
    ctx.beginPath();
    ctx.moveTo(giftX, giftY - 20);
    ctx.lineTo(giftX, giftY + 20);
    ctx.moveTo(giftX - 20, giftY);
    ctx.lineTo(giftX + 20, giftY);
    ctx.strokeStyle = colorScheme.ribbon;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Bow
    ctx.fillStyle = colorScheme.ribbon;
    ctx.beginPath();
    ctx.arc(giftX, giftY - 20, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw text showing current assignment
  if (animatingGiftIndex < endGameResults.length) {
    const result = endGameResults[animatingGiftIndex];
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 18px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${result.playerName} receives a gift!`, 400, 30);
  }

  ctx.restore();
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function finishEndGameAnimation() {
  isAnimatingEnd = false;
  showResults(endGameResults);
  endGameResults = null;
  animatingGiftIndex = -1;
}

// Results
function showResults(results) {
  showScreen('results-screen');

  if (!results) {
    console.error('No results to show');
    return;
  }

  const container = document.getElementById('results-list');
  container.innerHTML = results.map(result => {
    const isMe = result.playerId === playerId;
    return `
      <div class="result-card ${isMe ? 'is-you' : ''}">
        <div class="player-name">${escapeHtml(result.playerName)}${isMe ? ' (You)' : ''}</div>
        <div class="gift-desc">"${escapeHtml(result.giftDescription)}"</div>
        <div class="gift-from">From: ${escapeHtml(result.giftOwnerName)}</div>
      </div>
    `;
  }).join('');
}

document.getElementById('back-to-lobby-btn').addEventListener('click', () => {
  currentRoomId = null;
  currentRoom = null;
  gameState = null;
  isAnimatingEnd = false;
  endGameResults = null;
  // Reset guess container display
  const guessContainer = document.querySelector('.guess-container');
  if (guessContainer) guessContainer.style.display = '';
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
