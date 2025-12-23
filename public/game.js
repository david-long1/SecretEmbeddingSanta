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

// Detect mobile for performance optimizations
const isMobile =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );

// Client-side interpolation for smooth gift movement (industry best practice)
let stateBuffer = []; // Buffer of server states for smooth interpolation
const renderDelay = isMobile ? 150 : 100; // Mobile needs bigger buffer for lag
const lastRenderTime = Date.now();
let renderAnimationId = null;

// End game animation state
let endGameResults = null;
let animatingGiftIndex = -1;
let giftAnimationProgress = 0;
let isAnimatingEnd = false;
let showingToast = false;
let toastTimeoutId = null;

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
  textMuted: '#8a7a7c',
};

// Gift color combinations (box, ribbon) - candy cane inspired
const GIFT_COLORS = [
  { box: '#dc2626', ribbon: '#fff5f5' }, // Classic red + white
  { box: '#fff5f5', ribbon: '#dc2626' }, // Inverted: white + red
  { box: '#b91c1c', ribbon: '#fecaca' }, // Dark red + pink
  { box: '#fecaca', ribbon: '#b91c1c' }, // Pink + dark red
  { box: '#ef4444', ribbon: '#fff5f5' }, // Light red + white
  { box: '#7f1d1d', ribbon: '#f87171' }, // Maroon + coral
  { box: '#f87171', ribbon: '#7f1d1d' }, // Coral + maroon
  { box: '#fca5a5', ribbon: '#991b1b' }, // Salmon + crimson
];

// Screen management
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach((s) => {
    s.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');

  if (screenId === 'game-screen') {
    initCanvas();
  }
}

// WebSocket connection
function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/ws`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log('Connected to server');
  };

  ws.onclose = () => {
    console.log('Disconnected from server');
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
      // Server sends room_list right after this
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

    case 'game_state': {
      // Don't update if we're animating the end
      if (isAnimatingEnd) break;

      // Buffer server states for smooth interpolation (best practice)
      stateBuffer.push({
        state: message.state,
        timestamp: Date.now(),
      });

      // Keep more states for mobile (laggy networks need bigger buffer)
      const maxStates = isMobile ? 6 : 4;
      while (stateBuffer.length > maxStates) {
        stateBuffer.shift();
      }

      gameState = message.state;
      updateGameUI();
      break;
    }

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

// Error display with user-friendly toast
function showError(message) {
  console.error('Error:', message);

  // Show error toast to user
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  // Fade in
  setTimeout(() => toast.classList.add('show'), 10);

  // Remove after 4 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Success toast notification (for positive feedback)
function showSuccessToast(message) {
  const toast = document.createElement('div');
  toast.className = 'success-toast';

  // Add checkmark icon + message
  toast.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="flex-shrink: 0;">
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.2"/>
      <path d="M6 10l3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);

  // Fade in
  setTimeout(() => toast.classList.add('show'), 10);

  // Remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Room list
function renderRoomList(rooms) {
  const container = document.getElementById('room-list');
  const waitingRooms = rooms.filter((room) => room.phase === 'waiting');

  if (waitingRooms.length === 0) {
    container.innerHTML =
      '<p class="empty-state">No rooms yet.<br>Create one to get started!</p>';
    return;
  }

  container.innerHTML = waitingRooms
    .map(
      (room) => `
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
  `,
    )
    .join('');
}

// Create room modal
document.getElementById('create-room-btn').addEventListener('click', () => {
  document.getElementById('create-room-modal').classList.remove('hidden');
  document.getElementById('host-name').focus();
});

document
  .getElementById('cancel-create')
  .addEventListener('click', closeCreateModal);
document
  .getElementById('close-create-modal')
  .addEventListener('click', closeCreateModal);

function closeCreateModal() {
  document.getElementById('create-room-modal').classList.add('hidden');
  document.getElementById('create-room-form').reset();
}

document.getElementById('create-room-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const hostName = document.getElementById('host-name').value.trim();
  const roomName = document.getElementById('room-name').value.trim();
  const gameDuration =
    parseInt(document.getElementById('game-duration').value) * 60;
  const petrificusUses = parseInt(
    document.getElementById('petrificus-uses').value,
  );
  const spyUses = parseInt(document.getElementById('spy-uses').value);

  if (!hostName || !roomName) return;

  // Send create_room with hostName - server will auto-join us
  send({
    type: 'create_room',
    roomName,
    hostName,
    settings: { gameDuration, petrificusUses, spyUses },
  });

  closeCreateModal();
});

// Join room modal
function openJoinModal(roomId) {
  document.getElementById('join-room-id').value = roomId;
  document.getElementById('join-room-modal').classList.remove('hidden');
  document.getElementById('player-name').focus();
}

document
  .getElementById('cancel-join')
  .addEventListener('click', closeJoinModal);
document
  .getElementById('close-join-modal')
  .addEventListener('click', closeJoinModal);

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
    playerName,
  });

  closeJoinModal();
});

// Get initials from name
function getInitials(name) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Waiting room
function renderWaitingRoom() {
  document.getElementById('waiting-room-name').textContent = currentRoom.name;

  const playersList = document.getElementById('players-list');
  playersList.innerHTML = currentRoom.players
    .map((player) => {
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
    })
    .join('');

  // Host controls
  const hostControls = document.getElementById('host-controls');
  const startBtn = document.getElementById('start-game-btn');

  if (isHost) {
    hostControls.classList.remove('hidden');
    const allReady = currentRoom.players.every((p) => p.hasSubmittedGift);
    const enoughPlayers = currentRoom.players.length >= 2;
    startBtn.disabled = !(allReady && enoughPlayers);

    if (!enoughPlayers) {
      hostControls.querySelector('.hint').textContent =
        'Need at least 2 players...';
    } else if (!allReady) {
      hostControls.querySelector('.hint').textContent =
        'Waiting for all players to submit gifts...';
    } else {
      hostControls.querySelector('.hint').textContent = 'All players ready!';
    }
  } else {
    hostControls.classList.add('hidden');
  }

  // Check if current player has submitted
  const myPlayer = currentRoom.players.find((p) => p.id === playerId);
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

  const giftDescription = document
    .getElementById('gift-description')
    .value.trim();
  if (!giftDescription) return;

  send({
    type: 'submit_gift',
    giftDescription,
  });
});

// Start game
document.getElementById('start-game-btn').addEventListener('click', () => {
  send({ type: 'start_game' });
});

// Leave room (waiting room button)
document.getElementById('leave-room-btn').addEventListener('click', leaveRoom);

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
  const displayWidth = app.clientWidth;
  const displayHeight =
    app.clientHeight - header.offsetHeight - guessContainer.offsetHeight;

  // Set canvas size (no DPR scaling - keep it simple for now)
  canvas.width = displayWidth;
  canvas.height = displayHeight;
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
      if (Math.sqrt(dx * dx + dy * dy) < 30) {
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
      if (Math.sqrt(dx * dx + dy * dy) < 40) {
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
    offsetY: (canvas.height - gameHeight * scale) / 2,
  };
}

// Render with a specific state (for interpolation)
function renderGameWithState(state) {
  if (!ctx || !state) return;

  // Clear canvas
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
  for (const player of state.players) {
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
    ctx.fillText(
      getInitials(player.name),
      player.position.x,
      player.position.y,
    );

    // Player name
    ctx.fillStyle = isMe ? COLORS.white : COLORS.whiteDim;
    ctx.font = '12px -apple-system, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(player.name, player.position.x, player.position.y + 38);
  }

  // Draw gifts with interpolated positions
  state.gifts.forEach((gift, index) => {
    const isFrozen = gift.frozenSecondsLeft !== null;
    const colorScheme = GIFT_COLORS[index % GIFT_COLORS.length];

    // Positions are already interpolated in getInterpolatedState()
    const giftX = gift.position.x;
    const giftY = gift.position.y;

    // Gift box
    ctx.beginPath();
    ctx.rect(giftX - 20, giftY - 20, 40, 40);
    ctx.fillStyle = isFrozen ? COLORS.frozen : colorScheme.box;
    ctx.fill();
    ctx.strokeStyle = isFrozen ? COLORS.white : colorScheme.ribbon;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Gift ribbon
    ctx.beginPath();
    ctx.moveTo(giftX, giftY - 20);
    ctx.lineTo(giftX, giftY + 20);
    ctx.moveTo(giftX - 20, giftY);
    ctx.lineTo(giftX + 20, giftY);
    ctx.strokeStyle = isFrozen ? COLORS.white : colorScheme.ribbon;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Bow
    ctx.fillStyle = isFrozen ? COLORS.white : colorScheme.ribbon;
    ctx.beginPath();
    ctx.arc(giftX, giftY - 20, 8, 0, Math.PI * 2);
    ctx.fill();

    // Frozen timer
    if (isFrozen) {
      ctx.fillStyle = COLORS.red;
      ctx.font = 'bold 14px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(gift.frozenSecondsLeft + 's', giftX, giftY + 5);
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
      activePower === 'petrificus'
        ? 'Tap a gift to freeze it!'
        : 'Tap a player to spy!',
      400,
      30,
    );
  }

  ctx.restore();
}

// Legacy renderGame function (calls new version with current state)
function renderGame() {
  if (gameState) {
    renderGameWithState(gameState);
  }
}

// Linear interpolation helper
function lerp(start, end, t) {
  return start + (end - start) * Math.max(0, Math.min(1, t));
}

// Get interpolated state using entity interpolation (OPTIMIZED - no deep clone!)
function getInterpolatedState() {
  if (stateBuffer.length < 1) {
    return gameState;
  }

  // Only one state? Use it directly (no interpolation possible)
  if (stateBuffer.length === 1) {
    return stateBuffer[0].state;
  }

  const now = Date.now();
  const renderTime = now - renderDelay;

  // Find the two states to interpolate between
  let state0 = null;
  let state1 = null;
  let t = 0;

  // Check if renderTime is BEFORE all states (buffer just started)
  if (renderTime < stateBuffer[0].timestamp) {
    // Use first two states, clamped to t=0
    state0 = stateBuffer[0];
    state1 = stateBuffer[1];
    t = 0;
  }
  // Check if renderTime is AFTER all states (lag spike or fast client)
  else if (renderTime > stateBuffer[stateBuffer.length - 1].timestamp) {
    // Use last two states, but DON'T extrapolate - just hold at latest
    state0 = stateBuffer[stateBuffer.length - 2];
    state1 = stateBuffer[stateBuffer.length - 1];
    t = 1; // Hold at end position (no extrapolation to avoid jumps)
  }
  // Normal case: renderTime is between two states
  else {
    for (let i = 0; i < stateBuffer.length - 1; i++) {
      if (
        stateBuffer[i].timestamp <= renderTime &&
        renderTime <= stateBuffer[i + 1].timestamp
      ) {
        state0 = stateBuffer[i];
        state1 = stateBuffer[i + 1];
        const dt = state1.timestamp - state0.timestamp;
        t = dt > 0 ? (renderTime - state0.timestamp) / dt : 0;
        break;
      }
    }
  }

  // Safety fallback (should never happen)
  if (!state0 || !state1) {
    return stateBuffer[stateBuffer.length - 1].state;
  }

  // OPTIMIZED: Build interpolated state manually (no JSON.parse/stringify!)
  // This is ~10x faster than deep cloning
  const interpolatedState = {
    gifts: [],
    players: state1.state.players, // Players don't move, reuse reference
    timeRemaining: state1.state.timeRemaining,
  };

  // Interpolate only gift positions (the moving objects)
  const gifts0 = state0.state.gifts;
  const gifts1 = state1.state.gifts;

  // Build a map of gifts from state0 for O(1) lookup by ID
  const gifts0Map = new Map();
  for (const gift of gifts0) {
    gifts0Map.set(gift.id, gift);
  }

  // Interpolate each gift from state1
  for (const gift1 of gifts1) {
    const gift0 = gifts0Map.get(gift1.id);

    if (gift0) {
      // Gift exists in both states - interpolate position
      interpolatedState.gifts.push({
        id: gift1.id,
        position: {
          x: lerp(gift0.position.x, gift1.position.x, t),
          y: lerp(gift0.position.y, gift1.position.y, t),
        },
        frozenSecondsLeft: gift1.frozenSecondsLeft,
      });
    } else {
      // New gift appeared - use current position (no interpolation)
      interpolatedState.gifts.push(gift1);
    }
  }

  return interpolatedState;
}

// Smooth rendering loop using requestAnimationFrame
// Mobile: 30fps to reduce CPU load, Desktop: 60fps
let frameSkip = 0;
function smoothRenderLoop() {
  if (!gameState || stateBuffer.length === 0) {
    renderAnimationId = requestAnimationFrame(smoothRenderLoop);
    return;
  }

  // On mobile, render at 30fps instead of 60fps to save battery/CPU
  if (isMobile) {
    frameSkip++;
    if (frameSkip % 2 !== 0) {
      renderAnimationId = requestAnimationFrame(smoothRenderLoop);
      return;
    }
  }

  // Get interpolated state for smooth movement
  const interpolatedState = getInterpolatedState();

  // Render with interpolated positions
  renderGameWithState(interpolatedState);

  // Continue animation loop
  renderAnimationId = requestAnimationFrame(smoothRenderLoop);
}

// Game UI updates
function updateGameUI() {
  if (!gameState) return;

  // Start smooth rendering loop if not already running
  if (!renderAnimationId) {
    smoothRenderLoop();
  }

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
  const myPlayer = gameState.players.find((p) => p.id === playerId);
  if (myPlayer) {
    document.getElementById('petrificus-count').textContent =
      myPlayer.petrificusRemaining;
    document.getElementById('spy-count').textContent = myPlayer.spyRemaining;

    document.getElementById('petrificus-btn').disabled =
      myPlayer.petrificusRemaining === 0;
    document.getElementById('spy-btn').disabled = myPlayer.spyRemaining === 0;
  }

  updatePowerButtons();
}

function updatePowerButtons() {
  document
    .getElementById('petrificus-btn')
    .classList.toggle('active', activePower === 'petrificus');
  document
    .getElementById('spy-btn')
    .classList.toggle('active', activePower === 'spy');
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

    // Show success feedback to user
    showSuccessToast('Guess submitted!');

    // Clear input and blur to dismiss mobile keyboard
    input.value = '';
    input.blur();
  }
}

document
  .getElementById('guess-submit-btn')
  .addEventListener('click', submitGuess);

document.getElementById('guess-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitGuess();
  }
});

// Spy modal
function showSpyResult(targetName, targetGuess) {
  document.getElementById('spy-target-name').textContent = targetName;
  document.getElementById('spy-target-guess').textContent =
    targetGuess || '(no guess yet)';
  document.getElementById('spy-modal').classList.remove('hidden');
}

document.getElementById('close-spy-modal').addEventListener('click', () => {
  document.getElementById('spy-modal').classList.add('hidden');
});

// End game animation
function startEndGameAnimation(results) {
  if (!results || results.length === 0) {
    console.error('No results to animate');
    showResultsModal(results);
    return;
  }

  endGameResults = results;
  animatingGiftIndex = 0;
  giftAnimationProgress = 0;
  isAnimatingEnd = true;
  showingToast = false;

  // Hide the guess input during animation
  document.querySelector('.guess-container').style.display = 'none';

  // Start the animation loop
  animateEndGame();
}

function animateEndGame() {
  if (!isAnimatingEnd || !endGameResults) return;

  // If showing toast, don't animate - just wait
  if (showingToast) {
    renderEndGameAnimation();
    requestAnimationFrame(animateEndGame);
    return;
  }

  const result = endGameResults[animatingGiftIndex];
  if (!result) {
    // All done, show results
    finishEndGameAnimation();
    return;
  }

  // Animate the gift flying to the player with acceleration (ease-in)
  giftAnimationProgress += 0.015; // Slightly slower for more dramatic effect

  if (giftAnimationProgress >= 1) {
    // Gift arrived! Show toast for 3 seconds
    giftAnimationProgress = 1;
    showingToast = true;
    showGiftToast(result);

    // After 3 seconds, move to next gift
    toastTimeoutId = setTimeout(() => {
      hideGiftToast();
      showingToast = false;
      giftAnimationProgress = 0;
      animatingGiftIndex++;

      if (animatingGiftIndex >= endGameResults.length) {
        // All gifts animated, show results modal
        setTimeout(finishEndGameAnimation, 300);
      }
    }, 3000);
  }

  // Render the animation frame
  renderEndGameAnimation();

  // Continue animation
  requestAnimationFrame(animateEndGame);
}

function showGiftToast(result) {
  const toast = document.getElementById('gift-toast');
  const playerNameEl = document.getElementById('toast-player-name');
  const giftDescEl = document.getElementById('toast-gift-desc');

  playerNameEl.textContent = result.playerName;
  // Truncate gift description if too long
  const desc =
    result.giftDescription.length > 60
      ? result.giftDescription.slice(0, 57) + '...'
      : result.giftDescription;
  giftDescEl.textContent = `"${desc}"`;

  toast.classList.remove('hidden');
}

function hideGiftToast() {
  document.getElementById('gift-toast').classList.add('hidden');
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
    ctx.arc(
      result.playerPosition.x,
      result.playerPosition.y,
      30,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = isMe ? COLORS.red : COLORS.bgSurface;
    ctx.fill();
    ctx.strokeStyle = isMe ? COLORS.redLight : COLORS.border;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      getInitials(result.playerName),
      result.playerPosition.x,
      result.playerPosition.y,
    );

    ctx.fillStyle = isMe ? COLORS.white : COLORS.whiteDim;
    ctx.font = '12px -apple-system, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(
      result.playerName,
      result.playerPosition.x,
      result.playerPosition.y + 38,
    );
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
      // Currently animating - interpolate with acceleration (ease-in)
      const eased = easeInCubic(giftAnimationProgress);
      giftX =
        result.giftPosition.x +
        (result.playerPosition.x - result.giftPosition.x) * eased;
      giftY =
        result.giftPosition.y +
        (result.playerPosition.y - result.giftPosition.y) * eased;
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

// Ease-in cubic - starts slow, accelerates (dramatic gift delivery)
function easeInCubic(t) {
  return t * t * t;
}

function finishEndGameAnimation() {
  isAnimatingEnd = false;
  hideGiftToast();
  showResultsModal(endGameResults);
  endGameResults = null;
  animatingGiftIndex = -1;
}

// Results Modal (shows on game screen as overlay)
function showResultsModal(results) {
  if (!results) {
    console.error('No results to show');
    return;
  }

  const container = document.getElementById('results-modal-list');
  container.innerHTML = results
    .map((result) => {
      const isMe = result.playerId === playerId;
      return `
      <div class="result-card ${isMe ? 'is-you' : ''}">
        <div class="player-name">${escapeHtml(result.playerName)}${isMe ? ' (You)' : ''}</div>
        <div class="gift-desc">"${escapeHtml(result.giftDescription)}"</div>
        <div class="gift-from">From: ${escapeHtml(result.giftOwnerName)}</div>
      </div>
    `;
    })
    .join('');

  document.getElementById('results-modal').classList.remove('hidden');
}

function hideResultsModal() {
  document.getElementById('results-modal').classList.add('hidden');
}

function leaveRoom() {
  // Tell the server we're leaving
  send({ type: 'leave_room' });

  // Clear local state
  currentRoomId = null;
  currentRoom = null;
  gameState = null;
  isAnimatingEnd = false;
  showingToast = false;
  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
    toastTimeoutId = null;
  }
  endGameResults = null;
  hideResultsModal();
  hideGiftToast();

  // Stop rendering loop
  if (renderAnimationId) {
    cancelAnimationFrame(renderAnimationId);
    renderAnimationId = null;
  }
  stateBuffer = [];

  // Reset guess container display
  const guessContainer = document.querySelector('.guess-container');
  if (guessContainer) guessContainer.style.display = '';
  showScreen('lobby-screen');
  // Server will broadcast room_list to everyone after leave_room
}

// Leave room from results modal
document
  .getElementById('leave-room-btn-modal')
  .addEventListener('click', leaveRoom);

// Legacy results screen button (kept for compatibility)
document
  .getElementById('back-to-lobby-btn')
  .addEventListener('click', leaveRoom);

// Utility
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Heartbeat to keep connection alive
let heartbeatInterval = null;

function startHeartbeat() {
  // Send a ping every 30 seconds to keep connection alive
  heartbeatInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      send({ type: 'ping' });
    }
  }, 30000);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// Start
connect();
startHeartbeat();
