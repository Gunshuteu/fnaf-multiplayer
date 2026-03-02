// Game Client
const socket = io();

// Game State
const state = {
    currentScreen: 'mainMenu',
    roomCode: null,
    playerId: null,
    isHost: false,
    gameState: null,
    keys: {},
    mouseX: 0,
    mouseY: 0,
    joystick: { x: 0, y: 0, active: false },
    settings: {
        volume: 80,
        keys: { up: 'w', down: 's', left: 'a', right: 'd' }
    },
    customization: {
        color: '#00FF00',
        accessory: 'none',
        name: 'Player'
    },
    canvas: null,
    ctx: null,
    camera: { x: 0, y: 0 },
    lastTime: 0
};

// DOM Elements
const screens = {
    mainMenu: document.getElementById('mainMenu'),
    join: document.getElementById('joinScreen'),
    lobby: document.getElementById('lobbyScreen'),
    customize: document.getElementById('customizeScreen'),
    settings: document.getElementById('settingsScreen'),
    game: document.getElementById('gameScreen')
};

// Audio Context
let audioCtx = null;
let masterGain = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.connect(audioCtx.destination);
        masterGain.gain.value = state.settings.volume / 100;
    }
}

function playSound(type) {
    if (!audioCtx) return;
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(masterGain);
    
    switch(type) {
        case 'step':
            osc.frequency.value = 100;
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.1);
            break;
        case 'door':
            osc.frequency.value = 200;
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.3);
            break;
        case 'task':
            osc.frequency.value = 800;
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.5);
            break;
        case 'jumpscare':
            osc.frequency.value = 50;
            gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);
            osc.type = 'sawtooth';
            osc.start();
            osc.stop(audioCtx.currentTime + 1);
            break;
    }
}

// Screen Management
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
    state.currentScreen = screenName;
}

// Initialize Color Picker
function initColorPicker() {
    const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080', '#FFC0CB', '#FFFFFF'];
    const container = document.getElementById('colorPicker');
    
    colors.forEach(color => {
        const div = document.createElement('div');
        div.className = 'color-option';
        div.style.backgroundColor = color;
        div.onclick = () => {
            document.querySelectorAll('.color-option').forEach(c => c.classList.remove('selected'));
            div.classList.add('selected');
            state.customization.color = color;
            updatePreview();
        };
        if (color === state.customization.color) div.classList.add('selected');
        container.appendChild(div);
    });
}

function updatePreview() {
    const canvas = document.getElementById('previewCanvas');
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, 200, 200);
    
    // Draw player
    ctx.fillStyle = state.customization.color;
    ctx.beginPath();
    ctx.arc(100, 100, 30, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw accessory
    ctx.fillStyle = '#333';
    switch(state.customization.accessory) {
        case 'hat':
            ctx.fillRect(70, 60, 60, 10);
            ctx.fillRect(80, 40, 40, 20);
            break;
        case 'cap':
            ctx.beginPath();
            ctx.arc(100, 75, 25, Math.PI, 0);
            ctx.fill();
            ctx.fillRect(75, 75, 50, 5);
            break;
        case 'headphones':
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(100, 100, 35, Math.PI, 0);
            ctx.stroke();
            ctx.fillRect(60, 85, 15, 30);
            ctx.fillRect(125, 85, 15, 30);
            break;
        case 'bow':
            ctx.beginPath();
            ctx.moveTo(100, 70);
            ctx.lineTo(85, 60);
            ctx.lineTo(85, 80);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(100, 70);
            ctx.lineTo(115, 60);
            ctx.lineTo(115, 80);
            ctx.closePath();
            ctx.fill();
            break;
    }
}

// Game Loop
function initGame() {
    state.canvas = document.getElementById('gameCanvas');
    state.ctx = state.canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Input handling
    setupInputs();
    
    // Start loop
    requestAnimationFrame(gameLoop);
}

function resizeCanvas() {
    state.canvas.width = window.innerWidth;
    state.canvas.height = window.innerHeight;
}

function setupInputs() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        state.keys[key] = true;
        
        // Prevent default for game keys
        if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) {
            e.preventDefault();
        }
    });
    
    window.addEventListener('keyup', (e) => {
        state.keys[e.key.toLowerCase()] = false;
    });
    
    // Mouse
    window.addEventListener('mousemove', (e) => {
        state.mouseX = e.clientX;
        state.mouseY = e.clientY;
    });
    
    // Touch / Mobile Joystick
    const joystick = document.getElementById('joystick');
    const knob = document.getElementById('joystickKnob');
    let joystickTouch = null;
    
    joystick.addEventListener('touchstart', (e) => {
        e.preventDefault();
        joystickTouch = e.touches[0];
        state.joystick.active = true;
        updateJoystick(e.touches[0]);
    });
    
    joystick.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (joystickTouch) {
            updateJoystick(e.touches[0]);
        }
    });
    
    joystick.addEventListener('touchend', (e) => {
        e.preventDefault();
        state.joystick.active = false;
        state.joystick.x = 0;
        state.joystick.y = 0;
        knob.style.transform = `translate(-50%, -50%)`;
    });
    
    function updateJoystick(touch) {
        const rect = joystick.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        const distance = Math.hypot(dx, dy);
        const maxDist = rect.width / 2 - 25;
        
        if (distance > maxDist) {
            dx = (dx / distance) * maxDist;
            dy = (dy / distance) * maxDist;
        }
        
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        
        state.joystick.x = dx / maxDist;
        state.joystick.y = dy / maxDist;
    }
    
    // Touch aiming
    state.canvas.addEventListener('touchmove', (e) => {
        if (e.target !== joystick) {
            state.mouseX = e.touches[0].clientX;
            state.mouseY = e.touches[0].clientY;
        }
    });
}

function gameLoop(timestamp) {
    const dt = timestamp - state.lastTime;
    state.lastTime = timestamp;
    
    if (state.currentScreen === 'game' && state.gameState) {
        updateGame();
        renderGame();
    }
    
    requestAnimationFrame(gameLoop);
}

function updateGame() {
    if (!state.gameState || state.gameState.gameOver) return;
    
    // Send input to server
    const input = {
        code: state.roomCode,
        keys: {
            w: state.keys[state.settings.keys.up] || (state.joystick.active && state.joystick.y < -0.3),
            s: state.keys[state.settings.keys.down] || (state.joystick.active && state.joystick.y > 0.3),
            a: state.keys[state.settings.keys.left] || (state.joystick.active && state.joystick.x < -0.3),
            d: state.keys[state.settings.keys.right] || (state.joystick.active && state.joystick.x > 0.3)
        },
        angle: Math.atan2(state.mouseY - state.canvas.height/2, state.mouseX - state.canvas.width/2)
    };
    
    socket.emit('playerInput', input);
    
    // Update camera to follow player
    const me = state.gameState.players.find(p => p.id === state.playerId);
    if (me) {
        state.camera.x = me.x - state.canvas.width / 2;
        state.camera.y = me.y - state.canvas.height / 2;
    }
    
    // Update UI
    updateUI();
}

function renderGame() {
    const ctx = state.ctx;
    const canvas = state.canvas;
    
    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (!state.gameState) return;
    
    ctx.save();
    ctx.translate(-state.camera.x, -state.camera.y);
    
    // Draw floor
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, state.gameState.gameWidth, state.gameState.gameHeight);
    
    // Draw grid
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    for (let x = 0; x <= state.gameState.gameWidth; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, state.gameState.gameHeight);
        ctx.stroke();
    }
    for (let y = 0; y <= state.gameState.gameHeight; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(state.gameState.gameWidth, y);
        ctx.stroke();
    }
    
    // Draw office
    const office = state.gameState.office;
    ctx.fillStyle = '#2a2a4a';
    ctx.fillRect(office.x, office.y, office.width, office.height);
    ctx.strokeStyle = '#4a4a8a';
    ctx.lineWidth = 3;
    ctx.strokeRect(office.x, office.y, office.width, office.height);
    
    // Draw doors
    if (state.gameState.doors.left) {
        ctx.fillStyle = '#555';
        ctx.fillRect(office.x - 10, office.y + 20, 10, 60);
    }
    if (state.gameState.doors.right) {
        ctx.fillStyle = '#555';
        ctx.fillRect(office.x + office.width, office.y + 20, 10, 60);
    }
    
    // Draw tasks
    state.gameState.tasks.forEach(task => {
        if (!task.completed) {
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(task.x, task.y, 15, 0, Math.PI * 2);
            ctx.fill();
            
            // Task icon
            ctx.fillStyle = '#000';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('!', task.x, task.y + 5);
            
            // Glow
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 20;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    });
    
    // Draw players
    state.gameState.players.forEach(player => {
        if (!player.isAlive) return;
        
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(player.angle);
        
        // Body
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.fill();
        
        // Direction indicator
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(25, 0);
        ctx.lineTo(15, -8);
        ctx.lineTo(15, 8);
        ctx.closePath();
        ctx.fill();
        
        // Accessory
        ctx.rotate(-player.angle);
        ctx.fillStyle = '#333';
        switch(player.accessory) {
            case 'hat':
                ctx.fillRect(-15, -25, 30, 5);
                ctx.fillRect(-10, -35, 20, 10);
                break;
            case 'cap':
                ctx.beginPath();
                ctx.arc(0, -15, 15, Math.PI, 0);
                ctx.fill();
                break;
            case 'headphones':
                ctx.fillRect(-22, -10, 6, 20);
                ctx.fillRect(16, -10, 6, 20);
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(0, 0, 22, Math.PI, 0);
                ctx.stroke();
                break;
        }
        
        // Name
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.name, 0, -30);
        
        ctx.restore();
    });
    
    // Draw animatronics
    state.gameState.animatronics.forEach(anim => {
        const colors = { FREDDY: '#8B4513', BONNIE: '#8A2BE2', CHICA: '#FFD700' };
        ctx.fillStyle = colors[anim.type] || '#666';
        ctx.beginPath();
        ctx.arc(anim.x, anim.y, 25, 0, Math.PI * 2);
        ctx.fill();
        
        // Eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(anim.x - 8, anim.y - 5, 5, 0, Math.PI * 2);
        ctx.arc(anim.x + 8, anim.y - 5, 5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(anim.x - 8, anim.y - 5, 2, 0, Math.PI * 2);
        ctx.arc(anim.x + 8, anim.y - 5, 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Name
        ctx.fillStyle = '#ff6b6b';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(anim.type, anim.x, anim.y - 35);
    });
    
    ctx.restore();
    
    // Draw Flashlight / Fog of War effect
    drawFlashlight();
}

function drawFlashlight() {
    const ctx = state.ctx;
    const canvas = state.canvas;
    const me = state.gameState.players.find(p => p.id === state.playerId);
    
    if (!me || !me.flashlightOn) return;
    
    // Create darkness
    const gradient = ctx.createRadialGradient(
        canvas.width/2, canvas.height/2, 50,
        canvas.width/2, canvas.height/2, 300
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.3, 'rgba(0,0,0,0.3)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.98)');
    
    // Draw cone of light
    ctx.save();
    ctx.translate(canvas.width/2, canvas.height/2);
    ctx.rotate(me.angle);
    
    // Clear cone area
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 250, -Math.PI/6, Math.PI/6);
    ctx.closePath();
    ctx.fill();
    
    ctx.restore();
    
    // Fill darkness
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Vignette
    const vignette = ctx.createRadialGradient(
        canvas.width/2, canvas.height/2, 100,
        canvas.width/2, canvas.height/2, Math.max(canvas.width, canvas.height)
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.8)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function updateUI() {
    // Power
    const powerFill = document.getElementById('powerFill');
    if (powerFill && state.gameState) {
        powerFill.style.width = state.gameState.power + '%';
    }
    
    // Tasks
    const taskList = document.getElementById('taskList');
    if (taskList && state.gameState) {
        taskList.innerHTML = '<h3>Tasks</h3>';
        state.gameState.tasks.forEach(task => {
            const div = document.createElement('div');
            div.className = 'task-item' + (task.completed ? ' completed' : '');
            div.textContent = task.type;
            taskList.appendChild(div);
        });
    }
    
    // Door controls visibility
    const me = state.gameState.players.find(p => p.id === state.playerId);
    const doorControls = document.getElementById('doorControls');
    if (doorControls && me) {
        doorControls.style.display = me.isInOffice ? 'flex' : 'none';
        
        // Update door button states
        const btnLeft = document.getElementById('btnDoorLeft');
        const btnRight = document.getElementById('btnDoorRight');
        if (btnLeft) btnLeft.classList.toggle('active', state.gameState.doors.left);
        if (btnRight) btnRight.classList.toggle('active', state.gameState.doors.right);
    }
    
    // Task progress
    const mePlayer = state.gameState.players.find(p => p.id === state.playerId);
    const progressDiv = document.getElementById('taskProgress');
    if (progressDiv && mePlayer) {
        if (mePlayer.currentTask) {
            progressDiv.style.display = 'block';
            const task = state.gameState.tasks.find(t => t.id === mePlayer.currentTask);
            if (task) {
                document.getElementById('taskProgressFill').style.width = task.progress + '%';
            }
        } else {
            progressDiv.style.display = 'none';
        }
    }
    
    // Game Over
    if (state.gameState.gameOver) {
        document.getElementById('gameOverScreen').style.display = 'flex';
        document.getElementById('gameOverText').textContent = 
            state.gameState.winner === 'players' ? 'YOU SURVIVED!' : 'GAME OVER';
        document.getElementById('gameOverText').style.color = 
            state.gameState.winner === 'players' ? '#2ecc71' : '#e74c3c';
    }
}

// Socket Event Handlers
socket.on('connect', () => {
    state.playerId = socket.id;
    console.log('Connected:', socket.id);
});

socket.on('roomCreated', (data) => {
    state.roomCode = data.code;
    state.isHost = true;
    state.gameState = data.state;
    updateLobby();
    showScreen('lobby');
    initAudio();
});

socket.on('roomJoined', (data) => {
    state.roomCode = data.code;
    state.isHost = false;
    state.gameState = data.state;
    updateLobby();
    showScreen('lobby');
    initAudio();
});

socket.on('playerJoined', (data) => {
    state.gameState = data.state;
    updateLobby();
});

socket.on('playerLeft', (data) => {
    state.gameState = data.state;
    updateLobby();
});

socket.on('gameStarted', (data) => {
    state.gameState = data;
    showScreen('game');
    initGame();
    playSound('task');
});

socket.on('stateUpdate', (data) => {
    state.gameState = data;
});

socket.on('error', (data) => {
    alert(data.message);
});

// UI Event Listeners
document.getElementById('btnCreate').onclick = () => {
    socket.emit('createRoom', state.customization);
};

document.getElementById('btnJoin').onclick = () => {
    showScreen('join');
};

document.getElementById('btnJoinConfirm').onclick = () => {
    const code = document.getElementById('roomCodeInput').value;
    if (code.length === 4) {
        socket.emit('joinRoom', { code, playerData: state.customization });
    } else {
        alert('Please enter a 4-digit code');
    }
};

document.getElementById('btnJoinBack').onclick = () => {
    showScreen('mainMenu');
};

document.getElementById('btnCustomize').onclick = () => {
    initColorPicker();
    updatePreview();
    showScreen('customize');
};

document.getElementById('btnSaveCustomize').onclick = () => {
    state.customization.accessory = document.getElementById('accessorySelect').value;
    showScreen('mainMenu');
};

document.getElementById('btnBackCustomize').onclick = () => {
    showScreen('mainMenu');
};

document.getElementById('accessorySelect').onchange = updatePreview;

document.getElementById('btnSettings').onclick = () => {
    document.getElementById('volumeSlider').value = state.settings.volume;
    showScreen('settings');
};

document.getElementById('btnSaveSettings').onclick = () => {
    state.settings.volume = document.getElementById('volumeSlider').value;
    if (masterGain) {
        masterGain.gain.value = state.settings.volume / 100;
    }
    showScreen('mainMenu');
};

document.getElementById('btnBackSettings').onclick = () => {
    showScreen('mainMenu');
};

// Key recording for settings
['keyUp', 'keyDown', 'keyLeft', 'keyRight'].forEach((id, idx) => {
    const input = document.getElementById(id);
    const keys = ['up', 'down', 'left', 'right'];
    
    input.onclick = () => {
        input.classList.add('recording');
        input.value = 'Press key...';
        
        const handler = (e) => {
            e.preventDefault();
            input.value = e.key.toLowerCase();
            state.settings.keys[keys[idx]] = e.key.toLowerCase();
            input.classList.remove('recording');
            window.removeEventListener('keydown', handler);
        };
        
        window.addEventListener('keydown', handler, { once: true });
    };
});

document.getElementById('btnStartGame').onclick = () => {
    socket.emit('startGame', state.roomCode);
};

document.getElementById('btnLeaveLobby').onclick = () => {
    socket.disconnect();
    socket.connect();
    state.roomCode = null;
    state.isHost = false;
    showScreen('mainMenu');
};

// Door controls
document.getElementById('btnDoorLeft').onclick = () => {
    socket.emit('toggleDoor', { code: state.roomCode, door: 'left' });
    playSound('door');
};

document.getElementById('btnDoorRight').onclick = () => {
    socket.emit('toggleDoor', { code: state.roomCode, door: 'right' });
    playSound('door');
};

document.getElementById('btnCamera').onclick = () => {
    document.getElementById('cameraOverlay').style.display = 'flex';
    socket.emit('toggleCamera', { code: state.roomCode });
};

document.getElementById('btnCloseCamera').onclick = () => {
    document.getElementById('cameraOverlay').style.display = 'none';
    socket.emit('toggleCamera', { code: state.roomCode });
};

document.getElementById('btnCancelTask').onclick = () => {
    socket.emit('cancelTask', { code: state.roomCode });
};

document.getElementById('btnReturnMenu').onclick = () => {
    location.reload();
};

// Task interaction
state.canvas?.addEventListener('click', (e) => {
    if (!state.gameState || state.gameState.cameraActive) return;
    
    const rect = state.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left + state.camera.x;
    const y = e.clientY - rect.top + state.camera.y;
    
    // Check task click
    state.gameState.tasks.forEach(task => {
        if (!task.completed) {
            const dist = Math.hypot(task.x - x, task.y - y);
            if (dist < 30) {
                socket.emit('startTask', { code: state.roomCode, taskId: task.id });
            }
        }
    });
});

function updateLobby() {
    document.getElementById('lobbyCode').textContent = state.roomCode;
    document.getElementById('btnStartGame').style.display = state.isHost ? 'block' : 'none';
    
    const list = document.getElementById('playerList');
    list.innerHTML = '';
    
    state.gameState.players.forEach(player => {
        const div = document.createElement('div');
        div.className = 'player-item';
        div.innerHTML = `
            <div class="player-color" style="background: ${player.color}"></div>
            <span>${player.name} ${player.id === state.playerId ? '(You)' : ''}</span>
        `;
        list.appendChild(div);
    });
}

// Prevent context menu on game
window.addEventListener('contextmenu', e => {
    if (state.currentScreen === 'game') e.preventDefault();
});
