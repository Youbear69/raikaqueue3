const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'queue_db.json');

// Initial State
let state = {
  queue: [],
  activeGame: 'Cardfight Vanguard DD2',
  isPlayingActive: false,
  currentPlayingIndex: -1
};

// Helper: Load State
function loadState() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed && Array.isArray(parsed.queue)) {
        state = {
          queue: parsed.queue,
          activeGame: parsed.activeGame || 'Cardfight Vanguard DD2',
          isPlayingActive: !!parsed.isPlayingActive,
          currentPlayingIndex: typeof parsed.currentPlayingIndex === 'number' ? parsed.currentPlayingIndex : -1
        };
      }
    }
  } catch (error) {
    console.error('Error loading state from db:', error);
  }
}

// Helper: Save State
function saveState() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving state to db:', error);
  }
}

loadState();

// Serve static assets from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to send index.html, control.html or widget.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/control', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'control.html'));
});
app.get('/widget', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'widget.html'));
});

// Helper: Get sanitized queue (removes clientId for privacy)
function getSanitizedQueue() {
  return state.queue.map(item => ({
    id: item.id,
    name: item.name,
    time: item.time
  }));
}

// Helper: Broadcast state to all connected clients
function broadcastState() {
  io.emit('state_update', {
    queue: getSanitizedQueue(),
    activeGame: state.activeGame,
    isPlayingActive: state.isPlayingActive,
    currentPlayingIndex: state.currentPlayingIndex
  });
}

// Socket Connection Handler
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send current state to newly connected client
  socket.emit('state_update', {
    queue: getSanitizedQueue(),
    activeGame: state.activeGame,
    isPlayingActive: state.isPlayingActive,
    currentPlayingIndex: state.currentPlayingIndex
  });

  // Client requests to register in the queue
  socket.on('register_queue', ({ name, clientId }) => {
    if (!name || typeof name !== 'string' || name.trim() === '') return;
    
    // Get Bangkok time (UTC+7)
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const bangkokTime = new Date(utc + (3600000 * 7));
    const hours = String(bangkokTime.getHours()).padStart(2, '0');
    const minutes = String(bangkokTime.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    const newItem = {
      id: Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
      name: name.trim(),
      time: timeStr,
      clientId: clientId
    };

    state.queue.push(newItem);
    saveState();
    broadcastState();
    
    // Send back the ID of the item this specific client registered
    socket.emit('registration_success', newItem.id);
  });

  // Client requests to delete their own queue item
  socket.on('delete_queue', ({ id, clientId }) => {
    const index = state.queue.findIndex(item => item.id === id);
    if (index !== -1) {
      const item = state.queue[index];
      // Secure check: verify clientId matches
      if (item.clientId === clientId) {
        // Adjust currentPlayingIndex upon deletion
        if (index === state.currentPlayingIndex) {
          if (state.queue.length - 1 === 0) {
            state.currentPlayingIndex = -1;
            state.isPlayingActive = false;
          } else if (index === state.queue.length - 1) {
            state.currentPlayingIndex = index - 1;
            state.isPlayingActive = false;
          }
        } else if (index < state.currentPlayingIndex) {
          state.currentPlayingIndex--;
        }
        state.queue.splice(index, 1);
        saveState();
        broadcastState();
      }
    }
  });

  // Admin requests to delete any queue item
  socket.on('admin_delete_queue', ({ id }) => {
    const index = state.queue.findIndex(item => item.id === id);
    if (index !== -1) {
      // Adjust currentPlayingIndex upon deletion
      if (index === state.currentPlayingIndex) {
        if (state.queue.length - 1 === 0) {
          state.currentPlayingIndex = -1;
          state.isPlayingActive = false;
        } else if (index === state.queue.length - 1) {
          state.currentPlayingIndex = index - 1;
          state.isPlayingActive = false;
        }
      } else if (index < state.currentPlayingIndex) {
        state.currentPlayingIndex--;
      }
      state.queue.splice(index, 1);
      saveState();
      broadcastState();
    }
  });

  // Admin: Change active game
  socket.on('admin_change_game', (newGame) => {
    if (newGame === 'Cardfight Vanguard DD2' || newGame === 'Yu-Gi-Oh! Master Duel') {
      state.activeGame = newGame;
      saveState();
      broadcastState();
    }
  });

  // Admin: Advance queue
  socket.on('admin_next', () => {
    if (state.queue.length === 0) return;

    if (!state.isPlayingActive) {
      // Start playing with the next unplayed person (or index 0 if brand new)
      state.isPlayingActive = true;
      if (state.currentPlayingIndex === -1) {
        state.currentPlayingIndex = 0;
      } else if (state.currentPlayingIndex < state.queue.length - 1) {
        state.currentPlayingIndex++;
      }
    } else {
      // Advance to the next player
      if (state.currentPlayingIndex < state.queue.length - 1) {
        state.currentPlayingIndex++;
      } else {
        // Reached the end of the queue, active session ends
        state.isPlayingActive = false;
      }
    }
    saveState();
    broadcastState();
  });

  // Admin: Reset queue
  socket.on('admin_reset', () => {
    state.queue = [];
    state.currentPlayingIndex = -1;
    state.isPlayingActive = false;
    saveState();
    broadcastState();
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
