# SecretEmbeddingSanta

A local multiplayer party game that combines Secret Santa with AI embeddings! Players submit gift descriptions and compete to attract gifts toward themselves by typing semantically similar guesses.

## Features

- 🎁 Local multiplayer (WiFi-based)
- 🤖 AI-powered text embeddings for semantic matching
- 📱 Mobile-first design
- ⚡ Real-time WebSocket gameplay
- 🎮 Special powers (Petrificus & Spy)

## Prerequisites

Before you begin, ensure you have the following installed:

- **[Bun](https://bun.sh/)** - JavaScript runtime (for the game server)
- **[uv](https://github.com/astral-sh/uv)** - Fast Python package manager
- **Python 3.8+** - For the embeddings server

### Installation

#### Install Bun (macOS/Linux)
```sh
curl -fsSL https://bun.sh/install | bash
```

#### Install uv (macOS/Linux)
```sh
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## Quick Start

### 1. Install Dependencies

```sh
# Install main game dependencies
bun install

# Set up embeddings server
cd qwen3-embeddings-mlx
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
cd ..
```

### 2. Start the Servers

You'll need **two terminal windows**:

#### Terminal 1: Main Game Server
```sh
bun run dev
```

This starts the game server on **http://localhost:3000** and serves both:
- Frontend (HTML/CSS/JS)
- WebSocket backend for game logic

#### Terminal 2: Embeddings Server
```sh
cd qwen3-embeddings-mlx
source .venv/bin/activate
python server.py
```

This starts the ML embeddings server on **http://localhost:8000**

### 3. Play the Game

1. **On the host device**, open http://localhost:3000
2. **Share the Network URL** (shown in terminal) with friends on the same WiFi:
   ```
   Example: http://192.168.1.42:3000
   ```
3. Create a room and invite players!

## Development

### Available Scripts

- `bun run dev` - Start development server with hot reload
- `bun run start` - Start production server

### Testing the Embeddings Server

```sh
curl -X POST http://localhost:8000/embed \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world"}'
```

Expected output:
```json
{
  "embedding": [0.031982421875, 0.03662109375, ...],
  "model": "mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ",
  "dim": 1024,
  "normalized": true,
  "processing_time_ms": 57.95
}
```

## Project Structure

```
SecretEmbeddingSanta/
├── src/
│   ├── server.ts         # Bun HTTP + WebSocket server
│   ├── game-state.ts     # Room/player/gift state management
│   ├── embeddings.ts     # Embeddings server client
│   └── types.ts          # TypeScript type definitions
├── public/
│   ├── index.html        # Single-page app
│   ├── styles.css        # Candy cane theme styling
│   └── game.js           # Frontend logic + canvas rendering
├── qwen3-embeddings-mlx/ # Local ML embeddings server
└── README.md             # This file
```

## Troubleshooting

### Connection Issues

If players are getting kicked when switching apps/tabs:
- The game now uses localStorage to persist sessions
- Connection status indicator shows in the top-right corner
- Automatic reconnection with exponential backoff

### Network/Latency Problems

- Make sure all devices are on the same WiFi network
- Check that firewall isn't blocking port 3000
- Use the Network URL (not localhost) on other devices

## Tech Stack

- **Runtime**: Bun
- **Backend**: TypeScript + WebSocket
- **Frontend**: Vanilla JS + Canvas API
- **ML**: Qwen3-Embedding (MLX, on-device)
- **Styling**: Custom CSS (Candy cane theme)

## License

See [LICENSE](LICENSE) for details.
