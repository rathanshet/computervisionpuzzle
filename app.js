// VisionPlay Game Controller (app.js)

let activeMode = 'jigsaw'; // 'jigsaw' | 'chroma'
let highScoreJigsaw = 0;
let highScoreChroma = 0;

// Web Audio API Synth Engine
const AudioEngine = {
  ctx: null,
  
  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      this.ctx = new AudioContext();
    }
  },
  
  playTone(freq, type, duration, gainStart) {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    
    gainNode.gain.setValueAtTime(gainStart || 0.1, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    
    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  },
  
  playPickup() {
    this.playTone(440, 'triangle', 0.1, 0.15);
    setTimeout(() => this.playTone(660, 'sine', 0.15, 0.1), 50);
  },
  
  playSnap() {
    this.playTone(330, 'square', 0.08, 0.1);
    setTimeout(() => this.playTone(880, 'sine', 0.25, 0.2), 40);
  },
  
  playMatch() {
    this.playTone(523.25, 'sine', 0.1, 0.2); // C5
    setTimeout(() => this.playTone(659.25, 'sine', 0.1, 0.2), 80); // E5
    setTimeout(() => this.playTone(783.99, 'sine', 0.25, 0.3), 160); // G5
  },
  
  playWin() {
    const scale = [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50];
    scale.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, 'sawtooth', 0.3, 0.15);
      }, idx * 100);
    });
  },
  
  playTick() {
    this.playTone(1000, 'sine', 0.03, 0.05);
  },
  
  playTimeWarning() {
    this.playTone(220, 'sawtooth', 0.25, 0.2);
  },
  
  playCameraShutter() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    const bufferSize = this.ctx.sampleRate * 0.15;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.15);
    
    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    noise.start();
  }
};

// Canvas Particle System
class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.radius = Math.random() * 4 + 2;
    this.vx = (Math.random() - 0.5) * 8;
    this.vy = (Math.random() - 0.5) * 8;
    this.alpha = 1;
    this.decay = Math.random() * 0.02 + 0.015;
  }
  
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.08; // slight gravity
    this.alpha -= this.decay;
  }
  
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.restore();
  }
}

const ParticleSystem = {
  particles: [],
  spawn(x, y, colors, count = 25) {
    for (let i = 0; i < count; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      this.particles.push(new Particle(x, y, color));
    }
  },
  update() {
    this.particles = this.particles.filter(p => {
      p.update();
      return p.alpha > 0;
    });
  },
  draw(ctx) {
    this.particles.forEach(p => p.draw(ctx));
  }
};

// ==========================================
// JIGSAW PUZZLE STATE & LOGIC
// ==========================================
const JigsawGame = {
  canvas: null,
  ctx: null,
  image: null,
  gridSize: 3, // 3x3 default
  pieces: [],
  selectedPiece: null,
  boardRect: { x: 80, y: 80, w: 320, h: 320 }, // Center area
  isCompleted: false,
  movesCount: 0,
  
  // Custom cursor
  pointerPos: { x: 0, y: 0 },
  isPinching: false,
  
  async init() {
    this.canvas = document.getElementById("jigsaw-canvas");
    this.ctx = this.canvas.getContext("2d");
    
    // Load default image
    this.image = new Image();
    this.image.src = "assets/puzzle_nebula.png";
    this.image.onload = () => {
      this.resetGrid();
    };
    
    // Setup mouse fallback triggers
    this.setupMouseEvents();
    
    // Loop
    this.loop();
  },
  
  resetGrid() {
    this.gridSize = parseInt(document.getElementById("jigsaw-grid-select").value);
    this.pieces = [];
    this.selectedPiece = null;
    this.isCompleted = false;
    this.movesCount = 0;
    
    const size = this.gridSize;
    const pieceW = this.boardRect.w / size;
    const pieceH = this.boardRect.h / size;
    
    // Slice image into pieces
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        this.pieces.push({
          id: row * size + col,
          row: row,
          col: col,
          // Correct target coords
          targetX: this.boardRect.x + col * pieceW,
          targetY: this.boardRect.y + row * pieceH,
          // Shuffled current coordinates (start in margins)
          x: 0,
          y: 0,
          w: pieceW,
          h: pieceH,
          isSlotted: false
        });
      }
    }
    
    this.shuffle();
    this.updateStats();
  },
  
  shuffle() {
    this.isCompleted = false;
    this.movesCount = 0;
    
    const padding = 15;
    this.pieces.forEach(p => {
      p.isSlotted = false;
      // Scatter in tray spaces (margins of canvas)
      // Tray 1: Left margin (x: 5 to 60)
      // Tray 2: Right margin (x: 410 to 465)
      const useLeftTray = Math.random() < 0.5;
      
      if (useLeftTray) {
        p.x = padding + Math.random() * (this.boardRect.x - p.w - padding * 2);
      } else {
        const minX = this.boardRect.x + this.boardRect.w + padding;
        p.x = minX + Math.random() * (this.canvas.width - minX - p.w - padding);
      }
      p.y = padding + Math.random() * (this.canvas.height - p.h - padding * 2);
    });
    
    this.updateStats();
  },
  
  updateStats() {
    const slottedCount = this.pieces.filter(p => p.isSlotted).length;
    
    // Jigsaw UI metrics
    document.getElementById("lbl-metric").textContent = "Moves";
    document.getElementById("stat-metric-value").textContent = this.movesCount;
    document.getElementById("lbl-timer").textContent = "Slotted";
    document.getElementById("stat-timer-value").textContent = `${slottedCount}/${this.pieces.length}`;
  },
  
  setupMouseEvents() {
    const getMousePos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      // Account for scale if CSS stretched the canvas
      return {
        x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
        y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
      };
    };
    
    this.canvas.addEventListener("mousedown", (e) => {
      if (!cvState.mouseFallbackActive || this.isCompleted) return;
      AudioEngine.init();
      
      const pos = getMousePos(e);
      this.isPinching = true;
      this.pointerPos = pos;
      
      this.handleGrab(pos.x, pos.y);
    });
    
    this.canvas.addEventListener("mousemove", (e) => {
      if (!cvState.mouseFallbackActive || this.isCompleted) return;
      const pos = getMousePos(e);
      this.pointerPos = pos;
      
      this.handleDrag(pos.x, pos.y);
    });
    
    this.canvas.addEventListener("mouseup", () => {
      if (!cvState.mouseFallbackActive || this.isCompleted) return;
      this.isPinching = false;
      this.handleRelease();
    });
    
    this.canvas.addEventListener("mouseleave", () => {
      if (!cvState.mouseFallbackActive || this.isCompleted) return;
      this.isPinching = false;
      this.handleRelease();
    });
  },
  
  handleGrab(x, y) {
    if (this.selectedPiece) return;
    
    // Find clicked piece (from top to bottom of stack)
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      if (p.isSlotted) continue;
      
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
        this.selectedPiece = p;
        // Bring grabbed piece to top of drawing order
        this.pieces.splice(i, 1);
        this.pieces.push(p);
        
        // Save relative grab offsets
        this.grabOffsetX = x - p.x;
        this.grabOffsetY = y - p.y;
        
        AudioEngine.playPickup();
        break;
      }
    }
  },
  
  handleDrag(x, y) {
    if (this.selectedPiece) {
      this.selectedPiece.x = x - this.grabOffsetX;
      this.selectedPiece.y = y - this.grabOffsetY;
      
      // Boundary collision check
      this.selectedPiece.x = Math.max(0, Math.min(this.canvas.width - this.selectedPiece.w, this.selectedPiece.x));
      this.selectedPiece.y = Math.max(0, Math.min(this.canvas.height - this.selectedPiece.h, this.selectedPiece.y));
    }
  },
  
  handleRelease() {
    if (!this.selectedPiece) return;
    
    const p = this.selectedPiece;
    this.movesCount++;
    
    // Check snapping to correct grid position
    const snapDist = 22;
    const dx = Math.abs(p.x - p.targetX);
    const dy = Math.abs(p.y - p.targetY);
    
    if (dx < snapDist && dy < snapDist) {
      p.x = p.targetX;
      p.y = p.targetY;
      p.isSlotted = true;
      
      AudioEngine.playSnap();
      
      // Spawn happy snap particles!
      ParticleSystem.spawn(p.x + p.w/2, p.y + p.h/2, ["#06b6d4", "#8b5cf6", "#ec4899"], 15);
      
      // Check win condition
      this.checkWinCondition();
    }
    
    this.selectedPiece = null;
    this.updateStats();
  },
  
  checkWinCondition() {
    const allSlotted = this.pieces.every(p => p.isSlotted);
    if (allSlotted) {
      this.isCompleted = true;
      AudioEngine.playWin();
      
      // Spawn massive victory fireworks particles!
      for (let i = 0; i < 4; i++) {
        setTimeout(() => {
          const rx = this.boardRect.x + Math.random() * this.boardRect.w;
          const ry = this.boardRect.y + Math.random() * this.boardRect.h;
          ParticleSystem.spawn(rx, ry, ["#ff0055", "#00ffcc", "#ffcc00", "#9900ff"], 35);
        }, i * 200);
      }
      
      // Show victory overlay
      setTimeout(() => {
        showVictoryOverlay();
      }, 900);
    }
  },
  
  loop() {
    // Game loop running at ~60fps
    requestAnimationFrame(() => this.loop());
    
    // Process webcam values if webcam active and we are in jigsaw
    if (!cvState.mouseFallbackActive && cvState.handDetected && activeMode === 'jigsaw') {
      // Map normalized coordinates (0..1) to canvas (0..width, 0..height)
      // Mirror X coordinates for direct natural gesture control
      const targetCanvasX = (1 - cvState.pointerX) * this.canvas.width;
      const targetCanvasY = cvState.pointerY * this.canvas.height;
      
      // Interpolate local pointer
      this.pointerPos.x = this.pointerPos.x * 0.5 + targetCanvasX * 0.5;
      this.pointerPos.y = this.pointerPos.y * 0.5 + targetCanvasY * 0.5;
      this.isPinching = cvState.isPinching;
      
      // CV state transitions (grab/drag/release trigger)
      if (this.isPinching) {
        if (!this.selectedPiece) {
          this.handleGrab(this.pointerPos.x, this.pointerPos.y);
        } else {
          this.handleDrag(this.pointerPos.x, this.pointerPos.y);
        }
      } else {
        if (this.selectedPiece) {
          this.handleRelease();
        }
      }
    }
    
    // Draw everything
    this.draw();
  },
  
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw board frame outline
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.fillRect(this.boardRect.x, this.boardRect.y, this.boardRect.w, this.boardRect.h);
    
    ctx.strokeStyle = "rgba(99, 102, 241, 0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(this.boardRect.x, this.boardRect.y, this.boardRect.w, this.boardRect.h);
    
    // Draw target board slots (grid lines inside)
    ctx.strokeStyle = "rgba(0, 0, 0, 0.06)";
    ctx.lineWidth = 1;
    const stepW = this.boardRect.w / this.gridSize;
    const stepH = this.boardRect.h / this.gridSize;
    for (let i = 1; i < this.gridSize; i++) {
      // vertical
      ctx.beginPath();
      ctx.moveTo(this.boardRect.x + i * stepW, this.boardRect.y);
      ctx.lineTo(this.boardRect.x + i * stepW, this.boardRect.y + this.boardRect.h);
      ctx.stroke();
      
      // horizontal
      ctx.beginPath();
      ctx.moveTo(this.boardRect.x, this.boardRect.y + i * stepH);
      ctx.lineTo(this.boardRect.x + this.boardRect.w, this.boardRect.y + i * stepH);
      ctx.stroke();
    }
    
    // Draw slotted pieces first (as the base layer)
    this.pieces.forEach(p => {
      if (p.isSlotted) this.drawPiece(p);
    });
    
    // Draw non-slotted pieces on top
    this.pieces.forEach(p => {
      if (!p.isSlotted && p !== this.selectedPiece) this.drawPiece(p);
    });
    
    // Draw currently selected piece on very top
    if (this.selectedPiece) {
      this.drawPiece(this.selectedPiece, true);
    }
    
    // Update and draw particles
    ParticleSystem.update();
    ParticleSystem.draw(ctx);
    
    // Draw visual virtual pointer cursor on top
    if (!cvState.mouseFallbackActive || this.isPinching || (this.pointerPos.x > 0 && this.pointerPos.y > 0)) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.pointerPos.x, this.pointerPos.y, this.isPinching ? 8 : 12, 0, Math.PI * 2);
      ctx.fillStyle = this.isPinching ? "rgba(16, 185, 129, 0.8)" : "rgba(6, 182, 212, 0.5)";
      ctx.strokeStyle = this.isPinching ? "#10b981" : "#06b6d4";
      ctx.lineWidth = 2;
      ctx.shadowColor = this.isPinching ? "#10b981" : "#06b6d4";
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  },
  
  drawPiece(p, isGrabbed = false) {
    const ctx = this.ctx;
    
    ctx.save();
    
    if (isGrabbed) {
      ctx.shadowColor = "rgba(139, 92, 246, 0.8)";
      ctx.shadowBlur = 15;
      ctx.transform(1.03, 0, 0, 1.03, -p.w*0.015, -p.h*0.015); // visual scaling lift
    }
    
    // Map slice box from source image
    const sourceW = this.image.width / this.gridSize;
    const sourceH = this.image.height / this.gridSize;
    const sourceX = p.col * sourceW;
    const sourceY = p.row * sourceH;
    
    // Draw image slice
    if (this.image.complete && this.image.naturalWidth > 0) {
      ctx.drawImage(
        this.image,
        sourceX, sourceY, sourceW, sourceH,
        p.x, p.y, p.w, p.h
      );
    } else {
      // Fallback coloring if image fails to load
      ctx.fillStyle = `hsl(${(p.id * 40) % 360}, 70%, 40%)`;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px Space Grotesk";
      ctx.fillText(p.id + 1, p.x + p.w/2 - 5, p.y + p.h/2 + 5);
    }
    
    // Draw piece border outline
    ctx.strokeStyle = p.isSlotted ? "rgba(255, 255, 255, 0.1)" : "rgba(139, 92, 246, 0.4)";
    ctx.lineWidth = p.isSlotted ? 1 : 2;
    ctx.strokeRect(p.x, p.y, p.w, p.h);
    
    ctx.restore();
  }
};

// ==========================================
// CHROMA MATCH STATE & LOGIC
// ==========================================
const ChromaGame = {
  colorsList: [
    { name: "NEON RED", hex: "#ff003c", rgb: { r: 255, g: 0, b: 60 } },
    { name: "HOT PINK", hex: "#ec4899", rgb: { r: 236, g: 72, b: 153 } },
    { name: "LIME GREEN", hex: "#10b981", rgb: { r: 16, g: 185, b: 129 } },
    { name: "ELECTRIC BLUE", hex: "#06b6d4", rgb: { r: 6, g: 182, b: 212 } },
    { name: "SUNSHINE YELLOW", hex: "#eab308", rgb: { r: 234, g: 179, b: 8 } },
    { name: "CYBER PURPLE", hex: "#a855f7", rgb: { r: 168, g: 85, b: 247 } },
    { name: "TANGERINE", hex: "#f97316", rgb: { r: 249, g: 115, b: 22 } }
  ],
  
  activeTarget: null,
  score: 0,
  timeLeft: 60,
  timerInterval: null,
  isPlaying: false,
  matchThreshold: 85, // 85% match needed
  matchCounter: 0, // frame verification buffer
  matchCounterTarget: 25, // hold for ~25 frames (~400ms)
  
  start() {
    this.isPlaying = true;
    this.score = 0;
    this.timeLeft = 60;
    
    // Init audio click
    AudioEngine.init();
    
    // Pick first color
    this.nextColor();
    
    // Start timer interval
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.timeLeft > 0) {
        this.timeLeft--;
        this.updateStats();
        if (this.timeLeft <= 10) {
          AudioEngine.playTick();
        }
      } else {
        this.endGame();
      }
    }, 1000);
    
    document.getElementById("btn-chroma-start").textContent = "Restart Game";
    this.updateStats();
  },
  
  nextColor() {
    // Choose random color index that is different
    let newTarget = this.colorsList[Math.floor(Math.random() * this.colorsList.length)];
    while (this.activeTarget && newTarget.name === this.activeTarget.name) {
      newTarget = this.colorsList[Math.floor(Math.random() * this.colorsList.length)];
    }
    
    this.activeTarget = newTarget;
    this.matchCounter = 0;
    
    // Update HTML layout swatch values
    const swatch = document.getElementById("chroma-target-swatch");
    const label = document.getElementById("chroma-target-name");
    
    swatch.style.backgroundColor = newTarget.hex;
    swatch.style.boxShadow = `0 0 40px ${newTarget.hex}aa`;
    label.textContent = newTarget.name;
    label.style.color = newTarget.hex;
  },
  
  skip() {
    if (!this.isPlaying) return;
    this.nextColor();
    AudioEngine.playTone(300, 'sine', 0.15, 0.05);
  },
  
  updateStats() {
    document.getElementById("lbl-metric").textContent = "Score";
    document.getElementById("stat-metric-value").textContent = this.score;
    document.getElementById("lbl-timer").textContent = "Time Left";
    document.getElementById("stat-timer-value").textContent = `${this.timeLeft}s`;
  },
  
  processFrame() {
    if (!this.isPlaying || !cvState.isCamActive) return;
    
    const target = this.activeTarget.rgb;
    const current = cvState.dominantColor;
    
    // Convert to HSL for robust lighting comparison
    const targetHsl = rgbToHsl(target.r, target.g, target.b);
    const currentHsl = rgbToHsl(current.r, current.g, current.b);
    
    // Hue diff (wrapped around 360)
    let dh = Math.abs(targetHsl.h - currentHsl.h);
    if (dh > 180) dh = 360 - dh;
    const hueSim = 1 - (dh / 180);
    
    // Saturation and Lightness diff
    const ds = Math.abs(targetHsl.s - currentHsl.s);
    const satSim = 1 - ds;
    
    const dl = Math.abs(targetHsl.l - currentHsl.l);
    const lightSim = 1 - dl;
    
    // Weighted matching score (Hue is highly critical)
    const similarity = (hueSim * 0.70) + (satSim * 0.15) + (lightSim * 0.15);
    const scorePercent = Math.round(similarity * 100);
    
    // Render progress meter
    const fill = document.getElementById("chroma-progress-fill");
    const reading = document.getElementById("chroma-percent");
    const badge = document.getElementById("chroma-detected-badge");
    
    fill.style.width = `${scorePercent}%`;
    reading.textContent = `${scorePercent}%`;
    
    // Display active color coordinates
    badge.style.backgroundColor = `rgb(${current.r}, ${current.g}, ${current.b})`;
    badge.style.color = currentHsl.l > 0.5 ? "#000" : "#fff";
    badge.textContent = `RGB: ${current.r}, ${current.g}, ${current.b}`;
    
    // Threshold verification check
    if (scorePercent >= this.matchThreshold) {
      badge.className = "match-status-badge perfect";
      this.matchCounter++;
      
      if (this.matchCounter >= this.matchCounterTarget) {
        // MATCH SCORE EVENT TRIGGERED!
        this.score += 100 + Math.round(this.timeLeft * 0.5);
        this.updateStats();
        
        AudioEngine.playMatch();
        
        // Spawn colorful sparks in webcam overlay canvas
        const overlay = document.getElementById("overlay-canvas");
        ParticleSystem.spawn(overlay.width/2, overlay.height/2, [this.activeTarget.hex, "#ffffff"], 25);
        
        this.nextColor();
      }
    } else {
      badge.className = "match-status-badge";
      this.matchCounter = Math.max(0, this.matchCounter - 1);
    }
  },
  
  endGame() {
    this.isPlaying = false;
    if (this.timerInterval) clearInterval(this.timerInterval);
    
    AudioEngine.playWin();
    
    if (this.score > highScoreChroma) {
      highScoreChroma = this.score;
      document.getElementById("stat-highscore").textContent = highScoreChroma;
    }
    
    showVictoryOverlay(this.score);
  }
};

// ==========================================
// UTILITY MATHS
// ==========================================
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return { h: h * 360, s, l };
}

// ==========================================
// SYSTEM LAYOUT CONTROLLER
// ==========================================
function switchMode(mode) {
  activeMode = mode;
  AudioEngine.init();
  
  // Update view states
  const tabJigsaw = document.getElementById("tab-jigsaw");
  const tabChroma = document.getElementById("tab-chroma");
  const viewJigsaw = document.getElementById("view-jigsaw");
  const viewChroma = document.getElementById("view-chroma");
  const title = document.getElementById("game-title");
  
  const rulesJigsaw = document.getElementById("instructions-jigsaw");
  const rulesChroma = document.getElementById("instructions-chroma");
  
  if (mode === 'jigsaw') {
    tabJigsaw.classList.add("active");
    tabChroma.classList.remove("active");
    viewJigsaw.classList.add("active");
    viewChroma.classList.remove("active");
    title.textContent = "Gesture Jigsaw Puzzle";
    rulesJigsaw.style.display = "block";
    rulesChroma.style.display = "none";
    
    // Clear timer layouts
    document.getElementById("card-time-remaining").style.display = "flex";
    document.getElementById("stat-highscore").textContent = highScoreJigsaw;
    JigsawGame.updateStats();
  } else {
    tabJigsaw.classList.remove("active");
    tabChroma.classList.add("active");
    viewJigsaw.classList.remove("active");
    viewChroma.classList.add("active");
    title.textContent = "Chroma Match Challenge";
    rulesJigsaw.style.display = "none";
    rulesChroma.style.display = "block";
    
    document.getElementById("stat-highscore").textContent = highScoreChroma;
    
    if (ChromaGame.isPlaying) {
      ChromaGame.updateStats();
    } else {
      document.getElementById("lbl-metric").textContent = "Score";
      document.getElementById("stat-metric-value").textContent = "0";
      document.getElementById("lbl-timer").textContent = "Time Limit";
      document.getElementById("stat-timer-value").textContent = "60s";
    }
  }
}

// Game triggers
function resetJigsawGrid() {
  JigsawGame.resetGrid();
}

function shuffleJigsaw() {
  JigsawGame.shuffle();
}

function startChromaGame() {
  ChromaGame.start();
}

function skipChromaColor() {
  ChromaGame.skip();
}

// Hook CV loops into Chroma game calculations
cvState.onFrameProcessed = () => {
  if (activeMode === 'chroma' && ChromaGame.isPlaying) {
    ChromaGame.processFrame();
  }
};

// Overlay handlers
function showVictoryOverlay(customScore) {
  const overlay = document.getElementById("victory-overlay");
  const scoreVal = document.getElementById("victory-stat-value");
  const bonusVal = document.getElementById("victory-bonus-value");
  
  overlay.classList.add("active");
  
  if (activeMode === 'jigsaw') {
    scoreVal.textContent = `${JigsawGame.movesCount} Moves`;
    bonusVal.textContent = "Slotted All!";
    
    // update highscore
    if (highScoreJigsaw === 0 || JigsawGame.movesCount < highScoreJigsaw) {
      highScoreJigsaw = JigsawGame.movesCount;
      document.getElementById("stat-highscore").textContent = highScoreJigsaw;
    }
  } else {
    scoreVal.textContent = `${customScore} Pts`;
    bonusVal.textContent = `Time Bonus!`;
  }
}

function dismissVictory() {
  document.getElementById("victory-overlay").classList.remove("active");
  if (activeMode === 'jigsaw') {
    JigsawGame.resetGrid();
  } else {
    ChromaGame.start();
  }
}

// ==========================================
// CUSTOM JIGSAW IMAGE UPLOAD & CAPTURE LOGIC
// ==========================================
function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const customImg = new Image();
    customImg.src = e.target.result;
    customImg.onload = () => {
      JigsawGame.image = customImg;
      JigsawGame.resetGrid();
    };
  };
  reader.readAsDataURL(file);
}

function captureCameraSnapshot() {
  if (!cvState.isCamActive) return;
  
  const video = cvState.videoElement;
  const overlay = document.getElementById("camera-flash-overlay");
  
  // Audio feedback
  AudioEngine.playCameraShutter();
  
  // Flash overlay trigger
  overlay.classList.add("active");
  setTimeout(() => {
    overlay.classList.remove("active");
  }, 100);
  
  // Create offscreen canvas for snapshot cropping
  const snapCanvas = document.createElement("canvas");
  const size = Math.min(video.videoWidth, video.videoHeight) || 480;
  snapCanvas.width = 480;
  snapCanvas.height = 480;
  const snapCtx = snapCanvas.getContext("2d");
  
  // Mirror drawing on offscreen canvas since camera is mirrored in CSS
  snapCtx.translate(snapCanvas.width, 0);
  snapCtx.scale(-1, 1);
  
  // Calculate center square box parameters on raw video feed
  const sx = (video.videoWidth - size) / 2;
  const sy = (video.videoHeight - size) / 2;
  
  snapCtx.drawImage(
    video,
    sx, sy, size, size, // source center square
    0, 0, snapCanvas.width, snapCanvas.height // target
  );
  
  const dataUrl = snapCanvas.toDataURL("image/png");
  
  // Load target snapshot image
  const captureImg = new Image();
  captureImg.src = dataUrl;
  captureImg.onload = () => {
    JigsawGame.image = captureImg;
    JigsawGame.resetGrid();
  };
}

// Start application
window.addEventListener("load", () => {
  JigsawGame.init();
});
