# SecretEmbeddingSanta - Product Requirements Document

## Overview

SecretEmbeddingSanta is a local multiplayer party game that puts a nerdy AI twist on Secret Santa. Players bring gifts (descriptions), then compete to attract gifts toward themselves by typing guesses that semantically match the hidden gift descriptions. The game uses text embeddings and cosine similarity to create a dynamic, real-time "tug of war" for gifts.

## Core Concept

- Everyone joins a room and submits their gift description (kept secret)
- During gameplay, all gifts appear in the center of a circular arena
- Players sit around the circle and type guesses into their text box
- Gifts move toward players based on how semantically similar their guess is to the gift's description
- The closer your guess matches a gift's meaning, the stronger it's pulled toward you
- Game ends on a timer; each player receives the gift closest to them

## Target Platform

- **Primary**: Mobile browsers (phones/tablets on same WiFi)
- **Secondary**: Desktop browsers
- **Multiplayer**: Local WiFi only (no internet required after initial load)

## Game Flow

### 1. Lobby Phase
- Player opens the app URL (shared by host)
- Sees list of available game rooms
- Can create a new room or join an existing one

### 2. Waiting Room Phase
- Players see who has joined (displayed in expanding circle)
- Each player enters their name and gift description
- Gift descriptions are private (not shown to others)
- Host can see when all players have submitted
- Host clicks "Start Game" when ready

### 3. Game Phase
- All gifts appear as wrapped boxes in center of arena
- Players positioned around the circle perimeter
- Each player has a text input for their guess
- As players type, their guess embedding is computed
- Gifts move toward players based on cosine similarity
- Timer counts down (configurable, default 5 minutes)
- Players can use special powers (see below)

### 4. Results Phase
- Timer ends, positions freeze
- Each player assigned closest gift (greedy algorithm by distance)
- Gift descriptions revealed
- Show who gave each gift

## Special Powers

### Petrificus
- **Effect**: Freeze a gift in place for 10 seconds
- **Uses**: Configurable per game (default: 1 per player)
- **Activation**: Tap power button, then tap target gift
- **Visual**: Frozen gifts turn blue/icy, show countdown timer

### Spy
- **Effect**: See another player's current guess text
- **Uses**: Configurable per game (default: 2 per player)
- **Activation**: Tap power button, then tap target player
- **Visual**: Modal popup showing target's guess

## Technical Architecture

### Embedding System
- Local embedding server: `qwen3-embeddings-mlx` on port 8000
- Model: Qwen3-Embedding-0.6B-4bit-DWQ (1024 dimensions)
- Gift embeddings: Pre-computed when game starts
- Player guess embeddings: Computed on-the-fly (debounced 200ms)
- Similarity: Cosine similarity, range [-1, 1]

### Game Server
- Runtime: Bun
- Transport: WebSocket for real-time sync
- Static files: Served via HTTP
- Game loop: 20fps (50ms tick) for physics updates

### Gift Physics
```
For each gift:
  attraction_vector = (0, 0)
  for each player:
    similarity = cosine(gift.embedding, player.guess_embedding)
    if similarity > 0:
      direction = normalize(player.position - gift.position)
      attraction_vector += direction * similarity
  gift.position += attraction_vector * SPEED * deltaTime
```

### Networking
- Host runs server on their machine
- Players connect via local IP (e.g., `192.168.1.42:3000`)
- All game state managed server-side
- Clients receive state updates, send actions

## Room Settings (Configurable by Host)

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| Game Duration | 5 min | 1-30 min | How long the game phase lasts |
| Petrificus Uses | 1 | 0-10 | Uses per player per game |
| Spy Uses | 2 | 0-10 | Uses per player per game |

## Player Experience

### Creating a Room
1. Click "Create Room"
2. Enter room name
3. Adjust settings (optional)
4. Enter your name
5. Share the URL with friends

### Joining a Room
1. Open URL shared by host
2. See room in list
3. Click "Join"
4. Enter your name
5. Enter your gift description
6. Wait for host to start

### During Gameplay
1. Type guesses to attract gifts
2. Watch gifts move in real-time
3. Use Petrificus to freeze a gift you want
4. Use Spy to see what others are guessing
5. Adjust strategy based on gift movements

## Design Principles

- **Simplicity**: Minimal UI, focus on the arena
- **Real-time feedback**: Gifts move smoothly as you type
- **Social**: See other players, their positions, their remaining powers
- **Fair**: Everyone has same powers, same time
- **Fun chaos**: Multiple gifts moving creates hectic energy

## Success Metrics (for playtesting)

- Players understand the concept within 1 minute
- Average game feels engaging (not too slow, not too fast)
- Powers feel impactful but not overpowered
- Gift movement is visible and responsive to guesses
- Works smoothly on 4+ players on same WiFi

## Future Considerations (Out of Scope for V1)

- Online multiplayer (beyond local WiFi)
- Persistent accounts/history
- Custom themes/skins
- Additional powers
- Tournament mode
- Spectator mode
- Audio/sound effects

## File Structure

```
SecretEmbeddingSanta/
├── src/
│   ├── server.ts       # Bun HTTP + WebSocket server
│   ├── game-state.ts   # Room/player/gift state management
│   ├── embeddings.ts   # Embedding server client
│   └── types.ts        # TypeScript type definitions
├── public/
│   ├── index.html      # Single-page app
│   ├── styles.css      # Dark theme styling
│   └── game.js         # Frontend logic + canvas rendering
├── qwen3-embeddings-mlx/  # (external) Local embedding server
├── PRD.md              # This document
├── UI_SPEC.md          # Detailed UI/UX specification
└── README.md           # Setup instructions
