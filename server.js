const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game Constants
const GAME_WIDTH = 1600;
const GAME_HEIGHT = 1200;
const OFFICE_X = 750;
const OFFICE_Y = 550;
const OFFICE_WIDTH = 100;
const OFFICE_HEIGHT = 100;
const PLAYER_SPEED = 3;
const ANIMATRONIC_SPEED = 2.5;
const FLASHLIGHT_RANGE = 250;
const FLASHLIGHT_ANGLE = Math.PI / 4;
const TASK_COUNT = 5;

// Game State
const rooms = new Map();
const players = new Map();

// Animatronic Types
const ANIMATRONIC_TYPES = {
  FREDDY: { name: 'Freddy', speed: 2.2, color: '#8B4513', visionRange: 300 },
  BONNIE: { name: 'Bonnie', speed: 2.8, color: '#8A2BE2', visionRange: 280 },
  CHICA: { name: 'Chica', speed: 2.5, color: '#FFD700', visionRange: 320 }
};

class Room {
  constructor(code, hostId) {
    this.code = code;
    this.hostId = hostId;
    this.players = new Map();
    this.animatronics = [];
    this.tasks = [];
    this.doors = { left: false, right: false }; // false = open, true = closed
    this.cameraActive = false;
    this.gameStarted = false;
    this.gameOver = false;
    this.winner = null;
    this.night = 1;
    this.power = 100;
    this.lastUpdate = Date.now();
    
    this.initializeAnimatronics();
    this.generateTasks();
  }

  initializeAnimatronics() {
    const types = Object.keys(ANIMATRONIC_TYPES);
    types.forEach((type, index) => {
      this.animatronics.push({
        id: uuidv4(),
        type: type,
        x: 100 + index * 200,
        y: 100,
        targetX: null,
        targetY: null,
        state: 'wandering', // wandering, chasing, attacking
        targetPlayer: null,
        lastMove: Date.now(),
        path: []
      });
    });
  }

  generateTasks() {
    const taskTypes = ['Fix Wiring', 'Calibrate Audio', 'Restart Generator', 'Check Security', 'Repair Vent'];
    for (let i = 0; i < TASK_COUNT; i++) {
      this.tasks.push({
        id: uuidv4(),
        type: taskTypes[i % taskTypes.length],
        x: 200 + Math.random() * (GAME_WIDTH - 400),
        y: 200 + Math.random() * (GAME_HEIGHT - 400),
        completed: false,
        progress: 0
      });
    }
  }

  addPlayer(socketId, playerData) {
    const spawnPoints = [
      { x: OFFICE_X + 50, y: OFFICE_Y + 50 },
      { x: OFFICE_X - 50, y: OFFICE_Y + 50 },
      { x: OFFICE_X + 50, y: OFFICE_Y - 50 },
      { x: OFFICE_X - 50, y: OFFICE_Y - 50 }
    ];
    
    const spawn = spawnPoints[this.players.size % spawnPoints.length];
    
    this.players.set(socketId, {
      id: socketId,
      x: spawn.x,
      y: spawn.y,
      angle: 0,
      color: playerData.color || '#00FF00',
      accessory: playerData.accessory || 'none',
      name: playerData.name || `Player ${this.players.size + 1}`,
      health: 100,
      isAlive: true,
      isInOffice: true,
      tasksCompleted: 0,
      currentTask: null,
      flashlightOn: true,
      keys: { w: false, a: false, s: false, d: false }
    });
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    if (this.players.size === 0) {
      rooms.delete(this.code);
    } else if (socketId === this.hostId) {
      // Transfer host to first remaining player
      this.hostId = this.players.keys().next().value;
    }
  }

  update() {
    if (!this.gameStarted || this.gameOver) return;

    const now = Date.now();
    const dt = (now - this.lastUpdate) / 1000;
    this.lastUpdate = now;

    // Decrease power over time
    this.power = Math.max(0, this.power - 0.5 * dt);
    if (this.power <= 0) {
      this.flashlightOff = true;
    }

    // Update players
    this.players.forEach((player, id) => {
      if (!player.isAlive) return;

      // Movement
      let dx = 0, dy = 0;
      if (player.keys.w) dy -= 1;
      if (player.keys.s) dy += 1;
      if (player.keys.a) dx -= 1;
      if (player.keys.d) dx += 1;

      if (dx !== 0 || dy !== 0) {
        const length = Math.sqrt(dx * dx + dy * dy);
        dx /= length;
        dy /= length;
        
        const newX = player.x + dx * PLAYER_SPEED;
        const newY = player.y + dy * PLAYER_SPEED;

        // Boundary check
        if (newX > 0 && newX < GAME_WIDTH) player.x = newX;
        if (newY > 0 && newY < GAME_HEIGHT) player.y = newY;

        // Check office entry/exit
        const inOffice = (
          player.x > OFFICE_X && 
          player.x < OFFICE_X + OFFICE_WIDTH &&
          player.y > OFFICE_Y && 
          player.y < OFFICE_Y + OFFICE_HEIGHT
        );
        
        if (inOffice !== player.isInOffice) {
          player.isInOffice = inOffice;
        }
      }

      // Task interaction
      if (player.currentTask) {
        const task = this.tasks.find(t => t.id === player.currentTask);
        if (task && !task.completed) {
          task.progress += dt * 20; // 5 seconds to complete
          if (task.progress >= 100) {
            task.completed = true;
            player.tasksCompleted++;
            player.currentTask = null;
            
            // Check win condition
            if (this.tasks.every(t => t.completed)) {
              this.gameOver = true;
              this.winner = 'players';
            }
          }
        }
      }
    });

    // Update animatronics
    this.animatronics.forEach(anim => {
      const animData = ANIMATRONIC_TYPES[anim.type];
      
      // Find nearest visible player
      let nearestPlayer = null;
      let nearestDist = Infinity;

      this.players.forEach((player, id) => {
        if (!player.isAlive) return;
        
        const dist = Math.hypot(player.x - anim.x, player.y - anim.y);
        
        // Check if player is visible (not in office with doors closed, or in flashlight)
        let canSee = true;
        
        // If player in office and both doors closed, animatronic can't see
        if (player.isInOffice && this.doors.left && this.doors.right) {
          canSee = false;
        }

        // Check if player is in flashlight cone (harder to see animatronic)
        if (canSee && dist < nearestDist) {
          nearestDist = dist;
          nearestPlayer = { id, ...player };
        }
      });

      if (nearestPlayer && nearestDist < animData.visionRange) {
        anim.state = 'chasing';
        anim.targetPlayer = nearestPlayer.id;
        anim.targetX = nearestPlayer.x;
        anim.targetY = nearestPlayer.y;
      } else {
        anim.state = 'wandering';
        anim.targetPlayer = null;
        
        // Random wandering
        if (!anim.targetX || Math.hypot(anim.x - anim.targetX, anim.y - anim.targetY) < 10) {
          anim.targetX = 100 + Math.random() * (GAME_WIDTH - 200);
          anim.targetY = 100 + Math.random() * (GAME_HEIGHT - 200);
        }
      }

      // Move animatronic
      const targetX = anim.targetX || anim.x;
      const targetY = anim.targetY || anim.y;
      const dx = targetX - anim.x;
      const dy = targetY - anim.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 5) {
        anim.x += (dx / dist) * animData.speed;
        anim.y += (dy / dist) * animData.speed;
      }

      // Check collision with players
      if (anim.state === 'chasing') {
        this.players.forEach((player, id) => {
          if (!player.isAlive) return;
          const playerDist = Math.hypot(player.x - anim.x, player.y - anim.y);
          
          if (playerDist < 30) {
            // Attack!
            if (player.isInOffice && (this.doors.left || this.doors.right)) {
              // Protected by door
            } else {
              player.health = 0;
              player.isAlive = false;
              
              // Check if all players dead
              const alivePlayers = Array.from(this.players.values()).filter(p => p.isAlive);
              if (alivePlayers.length === 0) {
                this.gameOver = true;
                this.winner = 'animatronics';
              }
            }
          }
        });
      }
    });
  }

  getState() {
    return {
      code: this.code,
      players: Array.from(this.players.entries()).map(([id, p]) => ({ id, ...p })),
      animatronics: this.animatronics,
      tasks: this.tasks,
      doors: this.doors,
      cameraActive: this.cameraActive,
      gameStarted: this.gameStarted,
      gameOver: this.gameOver,
      winner: this.winner,
      night: this.night,
      power: this.power,
      gameWidth: GAME_WIDTH,
      gameHeight: GAME_HEIGHT,
      office: { x: OFFICE_X, y: OFFICE_Y, width: OFFICE_WIDTH, height: OFFICE_HEIGHT }
    };
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Create Room
  socket.on('createRoom', (data) => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const room = new Room(code, socket.id);
    room.addPlayer(socket.id, data);
    rooms.set(code, room);
    socket.join(code);
    socket.emit('roomCreated', { code, state: room.getState() });
  });

  // Join Room
  socket.on('joinRoom', (data) => {
    const { code, playerData } = data;
    const room = rooms.get(code);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    if (room.gameStarted) {
      socket.emit('error', { message: 'Game already in progress' });
      return;
    }

    room.addPlayer(socket.id, playerData);
    socket.join(code);
    socket.emit('roomJoined', { code, state: room.getState() });
    socket.to(code).emit('playerJoined', { state: room.getState() });
  });

  // Start Game
  socket.on('startGame', (code) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;
    
    room.gameStarted = true;
    io.to(code).emit('gameStarted', room.getState());
  });

  // Player Input
  socket.on('playerInput', (data) => {
    const { code, keys, angle } = data;
    const room = rooms.get(code);
    if (!room) return;
    
    const player = room.players.get(socket.id);
    if (!player) return;

    player.keys = keys;
    player.angle = angle;
  });

  // Toggle Door
  socket.on('toggleDoor', (data) => {
    const { code, door } = data;
    const room = rooms.get(code);
    if (!room) return;
    
    const player = room.players.get(socket.id);
    if (!player || !player.isInOffice) return;

    room.doors[door] = !room.doors[door];
    io.to(code).emit('stateUpdate', room.getState());
  });

  // Toggle Camera
  socket.on('toggleCamera', (data) => {
    const { code } = data;
    const room = rooms.get(code);
    if (!room) return;
    
    const player = room.players.get(socket.id);
    if (!player || !player.isInOffice) return;

    room.cameraActive = !room.cameraActive;
    io.to(code).emit('stateUpdate', room.getState());
  });

  // Start Task
  socket.on('startTask', (data) => {
    const { code, taskId } = data;
    const room = rooms.get(code);
    if (!room) return;
    
    const player = room.players.get(socket.id);
    if (!player) return;

    const task = room.tasks.find(t => t.id === taskId);
    if (task && !task.completed) {
      const dist = Math.hypot(player.x - task.x, player.y - task.y);
      if (dist < 50) {
        player.currentTask = taskId;
      }
    }
  });

  // Cancel Task
  socket.on('cancelTask', (data) => {
    const { code } = data;
    const room = rooms.get(code);
    if (!room) return;
    
    const player = room.players.get(socket.id);
    if (player) {
      player.currentTask = null;
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    rooms.forEach((room, code) => {
      if (room.players.has(socket.id)) {
        room.removePlayer(socket.id);
        if (rooms.has(code)) {
          io.to(code).emit('playerLeft', { state: room.getState() });
        }
      }
    });
  });
});

// Game loop
setInterval(() => {
  rooms.forEach((room, code) => {
    room.update();
    io.to(code).emit('stateUpdate', room.getState());
  });
}, 1000 / 30); // 30 FPS

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
