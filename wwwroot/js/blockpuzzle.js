import * as THREE from '/js/three.module.js';
import { EffectComposer } from '/js/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '/js/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '/js/jsm/postprocessing/UnrealBloomPass.js';
import { CSS2DRenderer, CSS2DObject } from '/js/jsm/renderers/CSS2DRenderer.js';

// Audio Manager for game sound effects
const AudioManager = {
  context: null,
  sounds: {
    click: null, drop: null, lineClear: null, multiLineClear: null,
    illegalMove: null, ui: null, gameOver: null, pieceGrabbed: null,
    rotateChime: null
  },
  masterVolume: 0.7,
  initialized: false,

  init() {
    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.context.destination);
      this.loadSounds();
      this.initialized = true;
    } catch(e) {
      // Web Audio API not supported
    }
  },
  
  loadSounds() {
    const soundMap = {
      click: '/SoundFx/Click2.wav',
      drop: '/SoundFx/DropThumpHeavy.wav',
      lineClear: '/SoundFx/LineChime.wav',
      multiLineClear: '/SoundFx/MultiComboSound.wav',
      illegalMove: '/SoundFx/IllegalMove.wav',
      ui: '/SoundFx/UiSound.wav',
      gameOver: '/SoundFx/GameOverSound2.wav',
      pieceGrabbed: '/SoundFx/PieceGrabbed2.wav',
      rotateChime: '/SoundFx/RotateChime.wav'
    };
    
    Object.entries(soundMap).forEach(([category, url]) => {
      this.loadSound(url, category);
    });
  },
  
  loadSound(url, category) {
    fetch(url)
      .then(response => response.arrayBuffer())
      .then(arrayBuffer => this.context.decodeAudioData(arrayBuffer))
      .then(audioBuffer => {
        this.sounds[category] = audioBuffer;
      })
      .catch(error => {/* Error loading sound */});
  },
  
  play(category, volume = 1.0, playbackRate = 1.0) {
    if (!this.initialized) {
      this.init();
      setTimeout(() => this.playSound(category, volume, playbackRate), 500);
      return;
    }
    this.playSound(category, volume, playbackRate);
  },
  
  playSound(category, volume, playbackRate) {
    if (this.context.state === 'suspended') this.context.resume();
    
    const buffer = this.sounds[category];
    if (!buffer) return;
    
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    
    const gainNode = this.context.createGain();
    gainNode.gain.value = volume;
    
    source.connect(gainNode);
    gainNode.connect(this.masterGain);
    source.start(0);
  },
  
  setVolume(volume) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) this.masterGain.gain.value = this.masterVolume;
  }
};

// Initialize audio on user interaction
document.addEventListener('DOMContentLoaded', () => {
  const initAudio = () => {
    AudioManager.init();
    document.removeEventListener('click', initAudio);
    document.removeEventListener('keydown', initAudio);
  };
  
  document.addEventListener('click', initAudio);
  document.addEventListener('keydown', initAudio);
});

// Board
const GRID_WIDTH = 10;
const GRID_HEIGHT = 10;
let CELL_SIZE = 50;

// Subtle color set
const COLORS = [
    0xe57373,
    0x81c784,
    0x64b5f6,
    0xffd54f,
    0xba68c8,
    0x4fc3f7
];

// Piece definitions
const PIECES = [
    [[1]],                 // Single block
    [[1,1]],               // 2-block
    [[1,1,1]],             // 3-block line
    [[1,1],[1,1]],         // 2x2 square
    [[1,0],[1,1]],         // small L
    [[0,1],[1,1]],
    [[1,1,1],[0,1,0]],     // T
    [[0,1],[1,1],[0,1]],   // arrow
    [[0,1,0],[1,1,1]],
    [[1,0],[1,1],[1,0]],
    [[1],[1],[1,1]],       // L shapes
    [[1,1,1],[1,0,0]],
    [[1,1],[0,1],[0,1]],
    [[0,0,1],[1,1,1]],
    [[0,1],[0,1],[1,1]],   // J shapes
    [[1,0,0],[1,1,1]],
    [[1,1],[1,0],[1,0]],
    [[1,1,1],[0,0,1]],
    [[0,1,1],[1,1,0]],     // S
    [[1,0],[1,1],[0,1]],
    [[1,1,0],[0,1,1]],     // Z
    [[0,1],[1,1],[1,0]],
    [[1],[1],[1],[1]],     // I
    [[1,1,1,1]],
    [[0,1,0],[1,1,1],[0,1,0]] // Cross
];

let leaderboardData = [];

// Fetch leaderboard
async function fetchLeaderboard() {
  try {
    const response = await fetch('/Index?handler=Leaderboard', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    if (!response.ok) {
      throw new Error(`Error fetching leaderboard: ${response.status}`);
    }
    leaderboardData = await response.json();
    return leaderboardData;
  } catch (error) {
    return [];
  }
}

// Save score
async function saveScore(playerName, score) {
  try {
    const tokenElement = document.querySelector('input[name="__RequestVerificationToken"]');
    if (!tokenElement) {
      console.error('Anti-forgery token not found');
      return null;
    }
    const token = tokenElement.value;
    
    const response = await fetch('/Index?handler=SaveScore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'RequestVerificationToken': token
      },
      body: JSON.stringify({ playerName, score })
    });
    if (!response.ok) {
      throw new Error(`Error saving score: ${response.status}`);
    }
    const updatedLeaderboard = await response.json();
    leaderboardData = updatedLeaderboard;
    return updatedLeaderboard;
  } catch (error) {
    console.error('Failed to save score:', error);
    return null;
  }
}

// DOM
const container = document.getElementById('gameContainer');
const messageArea = document.getElementById('messageArea');

// Scene & background
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x121212);

// Camera
const aspect = container.clientWidth / container.clientHeight;
const camera = new THREE.PerspectiveCamera(45, aspect, 1, 5000);
camera.position.set(
  (GRID_WIDTH * CELL_SIZE) / 2,
  1000,
  (GRID_HEIGHT * CELL_SIZE) / 2 + 300
);
camera.lookAt((GRID_WIDTH * CELL_SIZE) / 2, 0, (GRID_HEIGHT * CELL_SIZE) / 2);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

// CSS2D Renderer
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
container.appendChild(labelRenderer.domElement);

// UI Overlay
const uiOverlay = document.createElement('div');
uiOverlay.style.position = 'absolute';
uiOverlay.style.width = '100%';
uiOverlay.style.height = '100%';
uiOverlay.style.top = '0';
uiOverlay.style.left = '0';
uiOverlay.style.zIndex = '10';
uiOverlay.style.pointerEvents = 'none';
container.appendChild(uiOverlay);

// Create UI
createGameUI();

// Bloom
const bloomParams = {
  threshold: 0.3,
  strength: 0.6,
  radius: 0.5,
  exposure: 1.0
};

const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(container.clientWidth, container.clientHeight),
  bloomParams.strength,
  bloomParams.radius,
  bloomParams.threshold
);
let composer;
composerSetup();

function composerSetup() {
  bloomPass.threshold = bloomParams.threshold;
  bloomPass.strength = bloomParams.strength;
  bloomPass.radius = bloomParams.radius;

  const composerTemp = new EffectComposer(renderer);
  composerTemp.addPass(renderScene);
  composerTemp.addPass(bloomPass);

  composer = composerTemp;
}

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 2);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(500, 1000, 500);
directionalLight.castShadow = true;
directionalLight.shadow.camera.near = 100;
directionalLight.shadow.camera.far = 3000;
directionalLight.shadow.camera.left = -1000;
directionalLight.shadow.camera.right = 1000;
directionalLight.shadow.camera.top = 1000;
directionalLight.shadow.camera.bottom = -1000;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.bias = -0.001;
scene.add(directionalLight);

const redLight = new THREE.PointLight(0xff6666, 0.5, 1000);
redLight.position.set(GRID_WIDTH * CELL_SIZE, 300, GRID_HEIGHT * CELL_SIZE / 2);
scene.add(redLight);

const blueLight = new THREE.PointLight(0x6666ff, 0.5, 1000);
blueLight.position.set(0, 300, GRID_HEIGHT * CELL_SIZE / 2);
scene.add(blueLight);

// Board data
let grid = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(0));
let score = 0;
let gameOver = false;

// Main groups
const boardGroup = new THREE.Group();
scene.add(boardGroup);

const blocksGroup = new THREE.Group();
scene.add(blocksGroup);

const shadowGroup = new THREE.Group();
scene.add(shadowGroup);

const previewGroup = new THREE.Group();
scene.add(previewGroup);

// Extended plane for board + bottom area
const planeGeo = new THREE.PlaneGeometry(
  GRID_WIDTH * CELL_SIZE,
  GRID_HEIGHT * CELL_SIZE + 400
);
planeGeo.rotateX(-Math.PI / 2);
const planeMat = new THREE.MeshBasicMaterial({ visible: false });
const boardPlane = new THREE.Mesh(planeGeo, planeMat);
boardPlane.position.set(
  (GRID_WIDTH * CELL_SIZE) / 2,
  0,
  (GRID_HEIGHT * CELL_SIZE) / 2 + 200
);
boardGroup.add(boardPlane);

// Floor shadow plane
const floorGeo = new THREE.PlaneGeometry(GRID_WIDTH * CELL_SIZE * 1.5, GRID_HEIGHT * CELL_SIZE * 1.5);
floorGeo.rotateX(-Math.PI / 2);
const floorMat = new THREE.ShadowMaterial({ opacity: 0.3, transparent: true });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.position.set((GRID_WIDTH * CELL_SIZE) / 2, -1, (GRID_HEIGHT * CELL_SIZE) / 2);
floor.receiveShadow = true;
boardGroup.add(floor);

// Subtle grid helper (replaced by custom, but shown here initially)
const gridHelper = new THREE.GridHelper(
  GRID_WIDTH * CELL_SIZE,
  GRID_WIDTH,
  0x888888,
  0x444444
);
gridHelper.position.set(
  (GRID_WIDTH * CELL_SIZE) / 2,
  0.1,
  (GRID_HEIGHT * CELL_SIZE) / 2
);
gridHelper.material.opacity = 0.2;
gridHelper.material.transparent = true;
boardGroup.add(gridHelper);

function addBoardBorder() {
  const boardWidth = GRID_WIDTH * CELL_SIZE;
  const boardHeight = GRID_HEIGHT * CELL_SIZE;
  const edgeThickness = CELL_SIZE * 0.2;
  const edgeHeight = CELL_SIZE * 0.3;
  const lineSize = CELL_SIZE * 0.05;
  
  const edgeMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x303050, roughness: 0.5, metalness: 0.7
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x6d8bb0, transparent: true, opacity: 0.7
  });
  
  const createEdge = (w, h, d, x, y, z) => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    const edge = new THREE.Mesh(geometry, edgeMaterial);
    edge.position.set(x, y, z);
    edge.castShadow = edge.receiveShadow = true;
    boardGroup.add(edge);
  };
  
  const createGlow = (w, h, d, x, y, z) => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    const glow = new THREE.Mesh(geometry, glowMaterial);
    glow.position.set(x, y, z);
    boardGroup.add(glow);
  };
  
  // Bottom edge
  createEdge(boardWidth + edgeThickness*2, edgeHeight, edgeThickness, 
             boardWidth/2, edgeHeight/2, -edgeThickness/2);
  // Top edge
  createEdge(boardWidth + edgeThickness*2, edgeHeight, edgeThickness, 
             boardWidth/2, edgeHeight/2, boardHeight + edgeThickness/2);
  // Left edge
  createEdge(edgeThickness, edgeHeight, boardHeight,
             -edgeThickness/2, edgeHeight/2, boardHeight/2);
  // Right edge
  createEdge(edgeThickness, edgeHeight, boardHeight,
             boardWidth + edgeThickness/2, edgeHeight/2, boardHeight/2);
  
  // Glow lines
  createGlow(boardWidth, lineSize, lineSize, boardWidth/2, edgeHeight, 0);
  createGlow(boardWidth, lineSize, lineSize, boardWidth/2, edgeHeight, boardHeight);
  createGlow(lineSize, lineSize, boardHeight, 0, edgeHeight, boardHeight/2);
  createGlow(lineSize, lineSize, boardHeight, boardWidth, edgeHeight, boardHeight/2);
}
addBoardBorder();

// Create 3D colored cube
function createColoredCube(baseColor, size, isActive = true) {
  const geometry = new THREE.BoxGeometry(size * 0.9, size * 0.9, size * 0.9);
  
  const color = new THREE.Color(baseColor);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const colorAttribute = new THREE.BufferAttribute(colors, 3);
  
  const topColor = color.clone().multiplyScalar(1.3);
  const bottomColor = color.clone().multiplyScalar(0.7);
  
  for (let i = 0; i < count; i++) {
    const y = geometry.attributes.position.getY(i);
    const mixRatio = (y / size + 0.5) * 0.7 + 0.3;
    const vertexColor = isActive 
      ? color.clone().lerp(topColor, mixRatio)
      : color.clone().lerp(bottomColor, 1 - mixRatio);
    colorAttribute.setXYZ(i, vertexColor.r, vertexColor.g, vertexColor.b);
  }
  
  geometry.setAttribute('color', colorAttribute);
  const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    flatShading: isActive,
    shininess: isActive ? 50 : 20
  });
  
  const cube = new THREE.Mesh(geometry, material);
  if (isActive) {
    const wireframe = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.5
      })
    );
    cube.add(wireframe);
  }
  return cube;
}

// Shadow indicator
const shadowCache = {
  validMaterial: null,
  invalidMaterial: null,
  edgesMaterial: null,
  glowMaterial: null,
  boxGeometry: null,
  glowGeometry: null,
  edgesGeometry: null,
  indicatorPool: [],
  initialized: false,
  
  init: function(size) {
    if (this.initialized) return;
    const indicatorSize = size * 0.95;
    
    this.boxGeometry = new THREE.BoxGeometry(indicatorSize, indicatorSize * 0.1, indicatorSize);
    this.glowGeometry = new THREE.BoxGeometry(indicatorSize * 1.05, indicatorSize * 0.05, indicatorSize * 1.05);
    this.edgesGeometry = new THREE.EdgesGeometry(this.boxGeometry);
    
    this.validMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      depthWrite: false
    });
    this.invalidMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    this.edgesMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7
    });
    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3
    });
    
    this.initialized = true;
  }
};

function updateShadowMesh(piece, boardPos) {
  while (shadowGroup.children.length > 0) {
    const group = shadowGroup.children[0];
    while (group.children.length > 0) {
      const indicator = group.children[0];
      group.remove(indicator);
      shadowCache.indicatorPool.push(indicator);
    }
    shadowGroup.remove(group);
  }
  if (!piece) return;
  
  if (!shadowCache.initialized) {
    shadowCache.init(CELL_SIZE);
  }
  
  const valid = canPlacePiece(piece, boardPos);
  const indicatorsGroup = new THREE.Group();
  
  if (valid) {
    shadowCache.validMaterial.color.set(piece.color);
    shadowCache.validMaterial.color.multiplyScalar(0.5);
  }
  
  for (let row = 0; row < piece.shape.length; row++) {
    for (let col = 0; col < piece.shape[row].length; col++) {
      if (piece.shape[row][col]) {
        const boardX = boardPos.x + col;
        const boardY = boardPos.y + row;
        
        let indicator;
        if (shadowCache.indicatorPool.length > 0) {
          indicator = shadowCache.indicatorPool.pop();
          indicator.material = valid ? shadowCache.validMaterial : shadowCache.invalidMaterial;
          indicator.position.set(
            boardX * CELL_SIZE + CELL_SIZE / 2,
            0.5,
            boardY * CELL_SIZE + CELL_SIZE / 2
          );
        } else {
          indicator = new THREE.Mesh(
            shadowCache.boxGeometry,
            valid ? shadowCache.validMaterial : shadowCache.invalidMaterial
          );
          indicator.position.set(
            boardX * CELL_SIZE + CELL_SIZE / 2,
            0.5,
            boardY * CELL_SIZE + CELL_SIZE / 2
          );
          
          const wireframe = new THREE.LineSegments(
            shadowCache.edgesGeometry,
            shadowCache.edgesMaterial
          );
          indicator.add(wireframe);
          
          const glow = new THREE.Mesh(
            shadowCache.glowGeometry,
            shadowCache.glowMaterial
          );
          glow.position.y = 0.25;
          indicator.add(glow);
        }
        
        indicatorsGroup.add(indicator);
      }
    }
  }
  shadowGroup.add(indicatorsGroup);
}

// UI elements
function createStyledElement(type, styles = {}, attributes = {}) {
  const el = document.createElement(type);
  Object.entries(styles).forEach(([prop, val]) => el.style[prop] = val);
  Object.entries(attributes).forEach(([prop, val]) => el[prop] = val);
  return el;
}

function createScoreDisplay() {
  const scoreContainer = createStyledElement('div', {
    position: 'absolute',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '12px 30px',
    width: '120px',
    textAlign: 'center',
    background: 'rgba(30, 30, 50, 0.7)',
    color: '#ffffff',
    borderRadius: '10px',
    fontFamily: 'Arial, sans-serif',
    fontWeight: 'bold',
    backdropFilter: 'blur(5px)',
    border: '2px solid rgba(79, 195, 247, 0.6)',
    boxShadow: '0 0 15px rgba(79, 195, 247, 0.3)',
    pointerEvents: 'none',
    zIndex: '100'
  }, {
    className: 'game-ui score-display',
    innerHTML: '<div style="font-size:14px;margin-bottom:3px;">SCORE</div><div id="inGameScore" style="font-size:24px;text-align:center;">0</div>'
  });
  
  return scoreContainer;
}

function createGameButtons() {
  const mobileButtonsContainer = createStyledElement('div', {
    position: 'absolute',
    bottom: '30px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
    pointerEvents: 'auto',
    zIndex: '100'
  }, {
    className: 'game-ui buttons-container d-sm-none'
  });
  
  const desktopButtonsContainer = document.getElementById('desktop-buttons');
  if (desktopButtonsContainer) {
    desktopButtonsContainer.style.display = 'flex';
    desktopButtonsContainer.style.gap = '15px';
    desktopButtonsContainer.className = 'game-ui d-none d-sm-flex';
  }
  
  const restartButton = createButton('RESTART', '#e57373');
  restartButton.addEventListener('click', () => {
    AudioManager.play('ui', 0.7);
    resetGame();
  });
  
  const leaderboardButton = createButton('LEADERBOARD', '#64b5f6');
  leaderboardButton.addEventListener('click', () => {
    AudioManager.play('ui', 0.7);
    toggleLeaderboard();
  });
  
  // Mobile
  mobileButtonsContainer.appendChild(restartButton.cloneNode(true));
  mobileButtonsContainer.appendChild(leaderboardButton.cloneNode(true));
  
  mobileButtonsContainer.children[0].addEventListener('click', () => {
    AudioManager.play('ui', 0.7);
    resetGame();
  });
  mobileButtonsContainer.children[1].addEventListener('click', () => {
    AudioManager.play('ui', 0.7);
    toggleLeaderboard();
  });
  
  // Desktop
  if (desktopButtonsContainer) {
    desktopButtonsContainer.appendChild(restartButton);
    desktopButtonsContainer.appendChild(leaderboardButton);
  }
  
  return mobileButtonsContainer;
}

function createLeaderboardPanel() {
  const panel = createStyledElement('div', {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '300px',
    padding: '20px',
    background: 'rgba(20, 20, 35, 0.9)',
    color: '#ffffff',
    borderRadius: '10px',
    fontFamily: 'Arial, sans-serif',
    backdropFilter: 'blur(10px)',
    border: '2px solid rgba(129, 199, 132, 0.6)',
    boxShadow: '0 0 20px rgba(0, 0, 0, 0.5)',
    display: 'none',
    zIndex: '1000',
    pointerEvents: 'auto'
  }, {
    id: 'leaderboardPanel',
    className: 'game-ui leaderboard-panel'
  });

  const header = createStyledElement('div', {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px'
  });
  
  const title = createStyledElement('h2', {
    margin: '0',
    color: '#81c784'
  }, {
    textContent: 'LEADERBOARD'
  });
  
  const closeButton = createStyledElement('button', {
    background: 'transparent',
    border: 'none',
    color: '#ffffff',
    fontSize: '24px',
    cursor: 'pointer',
    padding: '0 5px'
  }, {
    textContent: '×'
  });
  closeButton.addEventListener('click', () => toggleLeaderboard());
  
  header.appendChild(title);
  header.appendChild(closeButton);
  panel.appendChild(header);
  
  const content = createStyledElement('div', {
    maxHeight: '300px',
    overflowY: 'auto'
  });
  
  const table = createStyledElement('table', {
    width: '100%',
    borderCollapse: 'collapse'
  });
  
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  
  ['RANK', 'PLAYER', 'SCORE'].forEach((text, index) => {
    const th = createStyledElement('th', {
      padding: '8px',
      textAlign: index === 0 ? 'center' : index === 1 ? 'left' : 'right',
      borderBottom: '1px solid rgba(255,255,255,0.2)'
    }, { textContent: text });
    headerRow.appendChild(th);
  });
  
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  const tbody = document.createElement('tbody');
  const loadingRow = document.createElement('tr');
  const loadingCell = createStyledElement('td', {
    padding: '20px',
    textAlign: 'center'
  }, {
    colSpan: '3',
    textContent: 'Loading leaderboard...'
  });
  
  loadingRow.appendChild(loadingCell);
  tbody.appendChild(loadingRow);
  
  fetchLeaderboard().then(data => {
    updateLeaderboardTable(data);
  }).catch(error => {
    console.error('Error fetching initial leaderboard data:', error);
    tbody.innerHTML = '';
    
    const errorRow = document.createElement('tr');
    const errorCell = createStyledElement('td', {
      padding: '20px',
      textAlign: 'center',
      color: '#e57373'
    }, {
      colSpan: '3',
      textContent: 'Failed to load leaderboard. Please try again.'
    });
    
    errorRow.appendChild(errorCell);
    tbody.appendChild(errorRow);
  });
  
  table.appendChild(tbody);
  content.appendChild(table);
  panel.appendChild(content);
  return panel;
}

function createGameOverOverlay() {
  const overlay = createStyledElement('div', {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    display: 'none',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'rgba(0, 0, 0, 0.8)',
    color: '#ffffff',
    fontFamily: 'Arial, sans-serif',
    backdropFilter: 'blur(5px)',
    zIndex: '2000',
    pointerEvents: 'auto'
  }, {
    id: 'gameOverOverlay',
    className: 'game-ui game-over-overlay'
  });
  
  const container = createStyledElement('div', {
    background: 'rgba(30, 30, 50, 0.9)',
    borderRadius: '15px',
    padding: '30px 40px',
    width: '350px',
    boxShadow: '0 0 30px rgba(229, 115, 115, 0.5)',
    border: '2px solid #e57373',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  });
  
  const gameOverText = createStyledElement('h1', {
    margin: '0 0 20px 0',
    color: '#e57373',
    fontSize: '40px',
    textShadow: '0 0 10px rgba(229, 115, 115, 0.7)'
  }, { textContent: 'GAME OVER' });
  
  const finalScoreText = createStyledElement('div', {
    fontSize: '24px',
    margin: '0 0 25px 0',
    fontWeight: 'bold',
    color: '#81c784'
  }, { id: 'finalScore' });
  
  const nameInputGroup = createStyledElement('div', {
    width: '100%',
    marginBottom: '25px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  });
  
  const nameLabel = createStyledElement('label', {
    marginBottom: '10px',
    fontSize: '16px',
    color: '#fff'
  }, { htmlFor: 'playerNameInput', textContent: 'Enter your name for the leaderboard:' });
  
  const nameInput = createStyledElement('input', {
    width: '100%',
    padding: '10px 15px',
    borderRadius: '5px',
    fontSize: '16px',
    border: '2px solid #64b5f6',
    backgroundColor: 'rgba(30, 30, 50, 0.8)',
    color: '#fff',
    outline: 'none',
    textAlign: 'center',
    boxShadow: '0 0 10px rgba(100, 181, 246, 0.3)',
    transition: 'all 0.3s ease'
  }, {
    id: 'playerNameInput',
    type: 'text',
    maxLength: '15',
    placeholder: 'Your Name'
  });
  
  nameInput.addEventListener('focus', () => {
    nameInput.style.boxShadow = '0 0 15px rgba(100, 181, 246, 0.6)';
    nameInput.style.border = '2px solid #90caf9';
  });
  nameInput.addEventListener('blur', () => {
    nameInput.style.boxShadow = '0 0 10px rgba(100, 181, 246, 0.3)';
    nameInput.style.border = '2px solid #64b5f6';
  });
  
  nameInputGroup.appendChild(nameLabel);
  nameInputGroup.appendChild(nameInput);
  
  const gameOverButtons = createStyledElement('div', { display: 'flex', gap: '15px' });
  
  const submitButton = createButton('SAVE SCORE', '#81c784');
  submitButton.style.fontSize = '16px';
  submitButton.addEventListener('click', async () => {
    AudioManager.play('ui', 0.7);
    const playerName = nameInput.value.trim() || 'Player';
    
    submitButton.textContent = 'SAVING...';
    submitButton.disabled = true;
    
    try {
      const result = await saveScore(playerName, score);
      if (result) {
        leaderboardData = result;
        const message = createStyledElement('div', {
          color: '#81c784',
          fontSize: '16px',
          marginTop: '10px',
          fontWeight: 'bold'
        }, { textContent: 'Score saved!' });
        
        container.appendChild(message);
        setTimeout(() => {
          container.removeChild(message);
          resetGame();
          toggleGameOverOverlay(false);
        }, 1500);
      } else {
        resetGame();
        toggleGameOverOverlay(false);
      }
    } catch (error) {
      console.error('Error saving score:', error);
      resetGame();
      toggleGameOverOverlay(false);
    } finally {
      submitButton.textContent = 'SAVE SCORE';
      submitButton.disabled = false;
    }
  });
  
  const playAgainButton = createButton('PLAY AGAIN', '#64b5f6');
  playAgainButton.style.fontSize = '16px';
  playAgainButton.addEventListener('click', () => {
    resetGame();
    toggleGameOverOverlay(false);
  });
  
  gameOverButtons.appendChild(submitButton);
  gameOverButtons.appendChild(playAgainButton);
  
  container.appendChild(gameOverText);
  container.appendChild(finalScoreText);
  container.appendChild(nameInputGroup);
  container.appendChild(gameOverButtons);
  overlay.appendChild(container);
  
  return overlay;
}

function createGameUI() {
  uiOverlay.appendChild(createScoreDisplay());
  uiOverlay.appendChild(createGameButtons());
  uiOverlay.appendChild(createLeaderboardPanel());
  uiOverlay.appendChild(createGameOverOverlay());
}

function createButton(text, accentColor) {
  const button = document.createElement('button');
  button.textContent = text;
  button.style.background = 'rgba(30, 30, 50, 0.8)';
  button.style.color = '#ffffff';
  button.style.border = `2px solid ${accentColor}`;
  button.style.borderRadius = '5px';
  button.style.padding = '10px 15px';
  button.style.fontSize = '14px';
  button.style.fontWeight = 'bold';
  button.style.cursor = 'pointer';
  button.style.boxShadow = `0 0 10px ${accentColor}40`;
  button.style.transition = 'all 0.2s ease';
  
  button.addEventListener('mouseenter', () => {
    button.style.background = `${accentColor}`;
    button.style.color = '#1a1a2a';
  });
  button.addEventListener('mouseleave', () => {
    button.style.background = 'rgba(30, 30, 50, 0.8)';
    button.style.color = '#ffffff';
  });
  
  return button;
}

async function toggleLeaderboard(show) {
  const leaderboardPanel = document.getElementById('leaderboardPanel');
  if ((show === true || (show === undefined && leaderboardPanel.style.display === 'none'))) {
    const tbody = leaderboardPanel.querySelector('tbody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">Loading leaderboard...</td></tr>';
    }
    leaderboardPanel.style.display = 'block';
    try {
      const data = await fetchLeaderboard();
      updateLeaderboardTable(data);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: #e57373;">Failed to load leaderboard. Please try again.</td></tr>';
      }
    }
  } else if (show === false) {
    leaderboardPanel.style.display = 'none';
  } else {
    leaderboardPanel.style.display = 'none';
  }
}

function updateLeaderboardTable(data) {
  const leaderboardPanel = document.getElementById('leaderboardPanel');
  const tbody = leaderboardPanel.querySelector('tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  if (data && data.length > 0) {
    data.forEach((entry, index) => {
      const row = document.createElement('tr');
      
      const rankCell = document.createElement('td');
      rankCell.textContent = (index + 1);
      rankCell.style.padding = '8px';
      rankCell.style.textAlign = 'center';
      
      if (index === 0) {
        rankCell.style.color = '#ffd700';
        rankCell.style.fontWeight = 'bold';
      } else if (index === 1) {
        rankCell.style.color = '#c0c0c0';
        rankCell.style.fontWeight = 'bold';
      } else if (index === 2) {
        rankCell.style.color = '#cd7f32';
        rankCell.style.fontWeight = 'bold';
      }
      
      const nameCell = document.createElement('td');
      nameCell.textContent = entry.playerName;
      nameCell.style.padding = '8px';
      nameCell.style.textAlign = 'left';
      
      const scoreCell = document.createElement('td');
      scoreCell.textContent = entry.score;
      scoreCell.style.padding = '8px';
      scoreCell.style.textAlign = 'right';
      
      row.appendChild(rankCell);
      row.appendChild(nameCell);
      row.appendChild(scoreCell);
      
      if (index % 2 === 1) {
        row.style.backgroundColor = 'rgba(255,255,255,0.05)';
      }
      
      tbody.appendChild(row);
    });
  } else {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.textContent = 'No scores recorded yet. Be the first!';
    cell.style.padding = '20px';
    cell.style.textAlign = 'center';
    row.appendChild(cell);
    tbody.appendChild(row);
  }
}

function toggleGameOverOverlay(show) {
  const gameOverOverlay = document.getElementById('gameOverOverlay');
  const finalScoreElement = document.getElementById('finalScore');
  
  if (finalScoreElement) {
    finalScoreElement.textContent = `Final Score: ${score}`;
  }
  
  if (show) {
    createGameOverEffect();
  }
  gameOverOverlay.style.display = show ? 'flex' : 'none';
}

// GAME STATE & PIECES
let piecePool = [];
let activePieces = [];
let currentDraggingGroup = null;
let currentDraggingData = null;
let currentDraggingIndex = null;
let isDragging = false;
let isDropping = false;
let dropStartTime = 0;
const dropDuration = 500; // Slightly longer to see the effect

// We'll track these for the "snap drop" animation
let dropStartPos = new THREE.Vector3();
let dropEndPos = new THREE.Vector3();
let dropStartScale = 1;
let dropEndScale = 1;

let dragOffset = new THREE.Vector3();
let currentBoardPos = { x: 0, y: 0 };

function generateRandomPiece() {
  const shape = PIECES[Math.floor(Math.random() * PIECES.length)];
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  return { shape, color };
}

function refillActivePiecesIfNeeded() {
  // Only refill if none of the currently stored ones are valid
  if (activePieces.some(p => p != null)) return;
  
  while (piecePool.length < 3) {
    piecePool.push(generateRandomPiece());
  }
  activePieces = piecePool.splice(0, 3);
  updatePreviewPieces();
}

function updatePreviewPieces() {
  // Clear old child meshes
  while (previewGroup.children.length > 0) {
    previewGroup.remove(previewGroup.children[0]);
  }
  
  const boardBottomZ = GRID_HEIGHT * CELL_SIZE + 40;
  const boardWidth = GRID_WIDTH * CELL_SIZE;
  
  // We place them around the center, with a big gap on mobile
  // so they won't overlap even if they're large shapes
  const centerX = boardWidth / 2;
  // Increase or decrease these if you want them even more spaced!
  const pieceSpacing = isMobile ? CELL_SIZE * 3 : CELL_SIZE * 2.5;
  // Also slightly smaller preview size on mobile
  const previewCellSize = isMobile ? 20 : 25;

  activePieces.forEach((piece, index) => {
    if (!piece) return;
    const group = createPieceMesh(piece, { x: 0, y: 0 }, previewCellSize);

    // For 3 pieces: index=0 => left, index=1 => center, index=2 => right
    // offsetX = -pieceSpacing, 0, +pieceSpacing
    const offsetX = (index - 1) * pieceSpacing;
    // Position pieces with special adjustments for better centering
    if (index === 0) {
      // Keep left piece where it is
      group.position.set(centerX - pieceSpacing/2 + offsetX, 5, boardBottomZ);
    } else {
      // Adjust center and right pieces to be more rightward
      group.position.set(centerX - pieceSpacing/4 + offsetX, 5, boardBottomZ);
    }
    
    group.userData.previewIndex = index;
    previewGroup.add(group);
  });
}

function createPieceMesh(piece, pos, customCellSize = CELL_SIZE) {
  const group = new THREE.Group();
  // Store the custom cell size so we can compute final board scale
  group.userData.customCellSize = customCellSize;

  for (let row = 0; row < piece.shape.length; row++) {
    for (let col = 0; col < piece.shape[row].length; col++) {
      if (piece.shape[row][col]) {
        const cubeGroup = new THREE.Group();
        const cube = createColoredCube(piece.color, customCellSize, true);
        cubeGroup.add(cube);
        
        cubeGroup.position.set(
          col * customCellSize + customCellSize / 2,
          customCellSize / 2,
          row * customCellSize + customCellSize / 2
        );
        cubeGroup.userData.initialY = customCellSize / 2;
        cubeGroup.userData.animPhase = Math.random() * Math.PI * 2;
        
        group.add(cubeGroup);
      }
    }
  }
  group.position.set(pos.x * customCellSize, 0, pos.y * customCellSize);
  group.userData.shape = piece.shape;
  group.userData.color = piece.color;
  return group;
}

function canPlacePiece(piece, position) {
  if (!piece) return false;
  for (let row = 0; row < piece.shape.length; row++) {
    for (let col = 0; col < piece.shape[row].length; col++) {
      if (piece.shape[row][col]) {
        const boardX = position.x + col;
        const boardY = position.y + row;
        if (boardX < 0 || boardX >= GRID_WIDTH ||
            boardY < 0 || boardY >= GRID_HEIGHT) {
          return false;
        }
        if (grid[boardY][boardX]) {
          return false;
        }
      }
    }
  }
  return true;
}

function placePieceOnBoard(piece, position) {
  AudioManager.play('click', 0.6);
  
  const { shape, color } = piece;
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col]) {
        const boardX = position.x + col;
        const boardY = position.y + row;
        grid[boardY][boardX] = color;
      }
    }
  }
  updateGridVisualization();
  checkCompletedLines();
  
  if (!anyActivePieceCanFit()) {
    gameOver = true;
    toggleGameOverOverlay(true);
  }
}

function updateGridVisualization() {
  while (blocksGroup.children.length > 0) {
    blocksGroup.remove(blocksGroup.children[0]);
  }
  
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const cellColor = grid[y][x];
      if (cellColor) {
        const cubeGroup = new THREE.Group();
        const cube = createColoredCube(cellColor, CELL_SIZE, false);
        cube.castShadow = true;
        cube.receiveShadow = true;
        
        cubeGroup.add(cube);
        cubeGroup.position.set(
          x * CELL_SIZE + CELL_SIZE/2,
          CELL_SIZE/2,
          y * CELL_SIZE + CELL_SIZE/2
        );
        cubeGroup.userData.initialY = CELL_SIZE/2;
        cubeGroup.userData.animPhase = Math.random() * Math.PI * 2;
        
        blocksGroup.add(cubeGroup);
      }
    }
  }
}

function checkCompletedLines() {
  const linesToClear = [];

  // rows
  for (let y = 0; y < GRID_HEIGHT; y++) {
    if (grid[y].every(c => c !== 0)) {
      linesToClear.push({ type: 'row', index: y });
    }
  }

  // columns
  for (let x = 0; x < GRID_WIDTH; x++) {
    let fullCol = true;
    for (let y = 0; y < GRID_HEIGHT; y++) {
      if (!grid[y][x]) {
        fullCol = false;
        break;
      }
    }
    if (fullCol) linesToClear.push({ type: 'column', index: x });
  }

  // 3x3
  for (let sy = 0; sy <= GRID_HEIGHT - 3; sy += 3) {
    for (let sx = 0; sx <= GRID_WIDTH - 3; sx += 3) {
      let allFilled = true;
      for (let yy = 0; yy < 3; yy++) {
        for (let xx = 0; xx < 3; xx++) {
          if (!grid[sy + yy][sx + xx]) {
            allFilled = false;
            break;
          }
        }
        if (!allFilled) break;
      }
      if (allFilled) {
        linesToClear.push({ type: 'region', startX: sx, startY: sy });
      }
    }
  }

  if (linesToClear.length > 0) {
    animateLineClear(linesToClear);
    score += linesToClear.length * linesToClear.length * 10;
    document.getElementById('inGameScore').textContent = score;
    animateScoreIncrease(linesToClear.length * linesToClear.length * 10);
  }
}

function animateScoreIncrease(points) {
  const pointsPopup = document.createElement('div');
  pointsPopup.textContent = `+${points}`;
  pointsPopup.style.position = 'absolute';
  pointsPopup.style.top = '60px';
  pointsPopup.style.left = '50%';
  pointsPopup.style.transform = 'translateX(-50%) translateY(0px)';
  pointsPopup.style.color = '#81c784';
  pointsPopup.style.fontFamily = 'Arial, sans-serif';
  pointsPopup.style.fontWeight = 'bold';
  pointsPopup.style.fontSize = '24px';
  pointsPopup.style.textShadow = '0 0 8px rgba(129, 199, 132, 0.7)';
  pointsPopup.style.pointerEvents = 'none';
  pointsPopup.style.opacity = '0';
  pointsPopup.style.transition = 'all 1.2s ease-out';
  
  uiOverlay.appendChild(pointsPopup);
  
  setTimeout(() => {
    pointsPopup.style.opacity = '1';
    pointsPopup.style.transform = 'translateX(-50%) translateY(-30px)';
  }, 50);
  
  setTimeout(() => {
    uiOverlay.removeChild(pointsPopup);
  }, 1500);
}

function animateLineClear(lines) {
  const highlightGroup = new THREE.Group();
  scene.add(highlightGroup);
  
  if (lines.length > 1) {
    AudioManager.play('multiLineClear', 0.8);
  } else {
    AudioManager.play('lineClear', 0.7);
  }
  
  let totalCells = 0;
  let avgColorR = 0, avgColorG = 0, avgColorB = 0;
  
  lines.forEach(line => {
    if (line.type === 'row') {
      for (let x = 0; x < GRID_WIDTH; x++) {
        if (grid[line.index][x]) {
          const c = new THREE.Color(grid[line.index][x]);
          avgColorR += c.r; avgColorG += c.g; avgColorB += c.b; totalCells++;
        }
      }
    } else if (line.type === 'column') {
      for (let y = 0; y < GRID_HEIGHT; y++) {
        if (grid[y][line.index]) {
          const c = new THREE.Color(grid[y][line.index]);
          avgColorR += c.r; avgColorG += c.g; avgColorB += c.b; totalCells++;
        }
      }
    } else if (line.type === 'region') {
      for (let yy = 0; yy < 3; yy++) {
        for (let xx = 0; xx < 3; xx++) {
          if (grid[line.startY + yy][line.startX + xx]) {
            const c = new THREE.Color(grid[line.startY + yy][line.startX + xx]);
            avgColorR += c.r; avgColorG += c.g; avgColorB += c.b; totalCells++;
          }
        }
      }
    }
  });
  
  const avgColor = new THREE.Color(
    totalCells > 0 ? avgColorR / totalCells : 1,
    totalCells > 0 ? avgColorG / totalCells : 1,
    totalCells > 0 ? avgColorB / totalCells : 1
  );
  
  lines.forEach(line => {
    let cellsToHighlight = [];
    if (line.type === 'row') {
      for (let x = 0; x < GRID_WIDTH; x++) {
        cellsToHighlight.push({ x, y: line.index });
      }
    } else if (line.type === 'column') {
      for (let y = 0; y < GRID_HEIGHT; y++) {
        cellsToHighlight.push({ x: line.index, y });
      }
    } else if (line.type === 'region') {
      for (let yy = 0; yy < 3; yy++) {
        for (let xx = 0; xx < 3; xx++) {
          cellsToHighlight.push({ x: line.startX + xx, y: line.startY + yy });
        }
      }
    }
    
    cellsToHighlight.forEach(cell => {
      const particleGeom = new THREE.SphereGeometry(2, 8, 8);
      const particleMat = new THREE.MeshBasicMaterial({
        color: avgColor,
        transparent: true,
        opacity: 0.8
      });
      
      for (let i = 0; i < 10; i++) {
        const particle = new THREE.Mesh(particleGeom, particleMat);
        particle.position.set(
          cell.x * CELL_SIZE + CELL_SIZE/2,
          CELL_SIZE/2,
          cell.y * CELL_SIZE + CELL_SIZE/2
        );
        
        particle.userData.velocity = new THREE.Vector3(
          (Math.random() - 0.5) * 3,
          Math.random() * 5,
          (Math.random() - 0.5) * 3
        );
        highlightGroup.add(particle);
      }
      
      const flashGeom = new THREE.BoxGeometry(CELL_SIZE * 0.95, CELL_SIZE * 0.95, CELL_SIZE * 0.95);
      const flashMat = new THREE.MeshBasicMaterial({
        color: avgColor,
        transparent: true,
        opacity: 0.5
      });
      
      const flash = new THREE.Mesh(flashGeom, flashMat);
      flash.position.set(
        cell.x * CELL_SIZE + CELL_SIZE/2,
        CELL_SIZE/2,
        cell.y * CELL_SIZE + CELL_SIZE/2
      );
      highlightGroup.add(flash);
    });
  });
  
  let startTime = performance.now();
  const duration = 700;
  
  function animateHighlight() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    highlightGroup.children.forEach(obj => {
      if (obj.userData.velocity) {
        obj.position.x += obj.userData.velocity.x;
        obj.position.y += obj.userData.velocity.y;
        obj.position.z += obj.userData.velocity.z;
        obj.userData.velocity.y -= 0.1;
        obj.material.opacity = 0.8 * (1 - progress);
        obj.scale.multiplyScalar(0.98);
      } else {
        obj.material.opacity = 0.5 * (1 - progress);
        const sc = 1 + Math.sin(progress * Math.PI) * 0.3;
        obj.scale.set(sc, sc, sc);
      }
    });
    
    if (progress < 1) {
      requestAnimationFrame(animateHighlight);
    } else {
      scene.remove(highlightGroup);
      // Clear lines
      lines.forEach(line => {
        if (line.type === 'row') {
          for (let x = 0; x < GRID_WIDTH; x++) {
            grid[line.index][x] = 0;
          }
        } else if (line.type === 'column') {
          for (let y = 0; y < GRID_HEIGHT; y++) {
            grid[y][line.index] = 0;
          }
        } else if (line.type === 'region') {
          for (let yy = 0; yy < 3; yy++) {
            for (let xx = 0; xx < 3; xx++) {
              grid[line.startY + yy][line.startX + xx] = 0;
            }
          }
        }
      });
      updateGridVisualization();
    }
  }
  animateHighlight();
}

function anyActivePieceCanFit() {
  for (let i = 0; i < activePieces.length; i++) {
    const p = activePieces[i];
    if (p && canPieceFitAnywhere(p)) return true;
  }
  if (currentDraggingData && canPieceFitAnywhere(currentDraggingData)) return true;
  return false;
}

function canPieceFitAnywhere(piece) {
  if (!piece) return false;
  const shapeH = piece.shape.length;
  const shapeW = piece.shape[0].length;
  for (let y = 0; y <= GRID_HEIGHT - shapeH; y++) {
    for (let x = 0; x <= GRID_WIDTH - shapeW; x++) {
      if (canPlacePiece(piece, { x, y })) return true;
    }
  }
  return false;
}

function forceGameOver() {
  gameOver = true;
  toggleGameOverOverlay(true);
}

function createGameOverEffect() {
  AudioManager.play('gameOver', 0.8);
  
  const boardWidth = GRID_WIDTH * CELL_SIZE;
  const boardHeight = GRID_HEIGHT * CELL_SIZE;
  const boardCenter = { x: boardWidth / 2, y: 0, z: boardHeight / 2 };
  const effectGroup = new THREE.Group();
  scene.add(effectGroup);
  
  function addParticles() {
    const particleCount = 100;
    const particles = [];
    for (let i = 0; i < particleCount; i++) {
      const size = Math.random() * 8 + 2;
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(size, 8, 8),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(Math.random() * 0.1, 0.8, 0.5),
          transparent: true,
          opacity: Math.random() * 0.5 + 0.2
        })
      );
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * (boardWidth / 4);
      particle.position.set(
        boardCenter.x + Math.cos(angle) * radius,
        Math.random() * 100 + 50,
        boardCenter.z + Math.sin(angle) * radius
      );
      particle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 2 + 1,
        (Math.random() - 0.5) * 5
      );
      particles.push(particle);
      effectGroup.add(particle);
    }
    return particles;
  }
  
  const shockwave = new THREE.Mesh(
    new THREE.RingGeometry(1, 2, 32),
    new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
  );
  shockwave.rotation.x = -Math.PI / 2;
  shockwave.position.set(boardCenter.x, 5, boardCenter.z);
  effectGroup.add(shockwave);
  
  const spotlight = new THREE.SpotLight(0xff0000, 10, boardWidth, Math.PI / 3, 0.4, 1);
  spotlight.position.set(boardCenter.x, 500, boardCenter.z);
  spotlight.target.position.set(boardCenter.x, 0, boardCenter.z);
  effectGroup.add(spotlight);
  effectGroup.add(spotlight.target);
  
  const pulseLight = new THREE.PointLight(0xff3333, 5, boardWidth, 2);
  pulseLight.position.set(boardCenter.x, 50, boardCenter.z);
  effectGroup.add(pulseLight);
  
  const overlay = new THREE.Mesh(
    new THREE.PlaneGeometry(boardWidth, boardHeight),
    new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.1, side: THREE.DoubleSide })
  );
  overlay.rotation.x = -Math.PI / 2;
  overlay.position.set(boardCenter.x, 1, boardCenter.z);
  effectGroup.add(overlay);
  
  const particles = addParticles();
  const startTime = performance.now();
  const animationDuration = 3000;
  
  const originalCameraPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
  
  function animateGameOver() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / animationDuration, 1);
    const waveSize = boardWidth * 1.5 * progress;
    shockwave.scale.set(waveSize, waveSize, 1);
    shockwave.material.opacity = 0.7 * (1 - progress);
    
    particles.forEach(p => {
      p.position.x += p.userData.velocity.x;
      p.position.y += p.userData.velocity.y;
      p.position.z += p.userData.velocity.z;
      p.userData.velocity.y -= 0.1;
      p.material.opacity *= 0.98;
      p.scale.multiplyScalar(0.99);
    });
    
    pulseLight.intensity = 5 + Math.sin(progress * Math.PI * 10) * 3;
    overlay.material.opacity = 0.1 + Math.sin(progress * Math.PI * 5) * 0.05;
    
    if (progress < 1) {
      requestAnimationFrame(animateGameOver);
    } else {
      const subtleEffect = new THREE.PointLight(0xff3333, 1, boardWidth, 2);
      subtleEffect.position.set(boardCenter.x, 50, boardCenter.z);
      scene.add(subtleEffect);
      scene.remove(effectGroup);
      
      (function pulseSubtleEffect() {
        const t = performance.now() / 1000;
        subtleEffect.intensity = 0.5 + Math.sin(t * 2) * 0.3;
        requestAnimationFrame(pulseSubtleEffect);
      })();
    }
  }
  function shakeCamera() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / animationDuration, 1);
    
    if (progress < 0.5) {
      const shakeMagnitude = 5 * (1 - progress);
      camera.position.set(
        originalCameraPos.x + (Math.random() - 0.5) * shakeMagnitude,
        originalCameraPos.y + (Math.random() - 0.5) * shakeMagnitude,
        originalCameraPos.z + (Math.random() - 0.5) * shakeMagnitude
      );
      requestAnimationFrame(shakeCamera);
    } else {
      camera.position.set(originalCameraPos.x, originalCameraPos.y, originalCameraPos.z);
    }
  }
  
  animateGameOver();
  shakeCamera();
}

// Single-drag handling
let lastMoveTime = 0;
const moveThrottleMs = 33;

function handleInputStart(clientX, clientY) {
  if (gameOver || isDropping) return;
  
  const rect = renderer.domElement.getBoundingClientRect();
  const mouseX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const mouseY = -((clientY - rect.top) / rect.height) * 2 + 1;
  
  const mouseVec = new THREE.Vector2(mouseX, mouseY);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouseVec, camera);
  
  // Check preview pieces
  const previewIntersects = raycaster.intersectObjects(previewGroup.children, true);
  if (previewIntersects.length > 0) {
    let obj = previewIntersects[0].object;
    while (obj && !obj.userData.hasOwnProperty('previewIndex')) {
      obj = obj.parent;
    }
    if (obj && obj.userData.hasOwnProperty('previewIndex')) {
      const index = obj.userData.previewIndex;
      if (activePieces[index]) {
        AudioManager.play('pieceGrabbed', 0.5);
        currentDraggingGroup = obj;
        previewGroup.remove(currentDraggingGroup);
        
        currentDraggingData = activePieces[index];
        currentDraggingIndex = index;
        isDragging = true;
        
        // Position the piece higher (visual feedback)
        currentDraggingGroup.position.y = 200;
        // Scale up the piece a bit for clarity in drag
        currentDraggingGroup.scale.set(1.2, 1.2, 1.2);
        scene.add(currentDraggingGroup);
        
        const planeHits = raycaster.intersectObject(boardPlane);
        if (planeHits.length > 0) {
          dragOffset.copy(planeHits[0].point).sub(currentDraggingGroup.position);
        } else {
          dragOffset.set(0,0,0);
        }
        return;
      }
    }
  }
}

function handleInputMove(clientX, clientY) {
  if (!isDragging || !currentDraggingData || gameOver || isDropping) return;
  
  const now = performance.now();
  if (now - lastMoveTime < moveThrottleMs) return;
  lastMoveTime = now;
  
  const rect = renderer.domElement.getBoundingClientRect();
  const mouseX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const mouseY = -((clientY - rect.top) / rect.height) * 2 + 1;
  
  const mouseVec = new THREE.Vector2(mouseX, mouseY);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouseVec, camera);
  const planeHits = raycaster.intersectObject(boardPlane);
  
  if (planeHits.length > 0) {
    const newPos = planeHits[0].point.clone().sub(dragOffset);
    
    const shapeH = currentDraggingData.shape.length;
    const shapeW = currentDraggingData.shape[0].length;
    const pieceWidth = shapeW * CELL_SIZE;
    const pieceHeight = shapeH * CELL_SIZE;
    
    // Clamp so we don't move outside the board horizontally
    newPos.x = THREE.MathUtils.clamp(newPos.x, 0, GRID_WIDTH * CELL_SIZE - pieceWidth);
    // and vertically
    newPos.z = THREE.MathUtils.clamp(newPos.z, 0, GRID_HEIGHT * CELL_SIZE - pieceHeight);

    currentDraggingGroup.position.x = newPos.x;
    currentDraggingGroup.position.z = newPos.z;
    currentDraggingGroup.position.y = 200; // Keep it "in the air"
    
    if (newPos.x >= 0 && newPos.x <= GRID_WIDTH*CELL_SIZE - pieceWidth &&
        newPos.z >= 0 && newPos.z <= GRID_HEIGHT*CELL_SIZE - pieceHeight) {
      let gridX = Math.floor(newPos.x / CELL_SIZE);
      let gridY = Math.floor(newPos.z / CELL_SIZE);
      gridX = THREE.MathUtils.clamp(gridX, 0, GRID_WIDTH - shapeW);
      gridY = THREE.MathUtils.clamp(gridY, 0, GRID_HEIGHT - shapeH);
      currentBoardPos.x = gridX;
      currentBoardPos.y = gridY;
      updateShadowMesh(currentDraggingData, currentBoardPos);
    } else {
      updateShadowMesh(null, { x:0, y:0 });
    }
  }
}

function handleInputEnd() {
  if (!isDragging || !currentDraggingData || isDropping) return;
  
  isDragging = false;
  
  const shapeH = currentDraggingData.shape.length;
  const shapeW = currentDraggingData.shape[0].length;
  const pieceWidth = shapeW * CELL_SIZE;
  const pieceHeight = shapeH * CELL_SIZE;
  
  const x = currentDraggingGroup.position.x;
  const z = currentDraggingGroup.position.z;
  
  const inBoard = (
    x >= 0 && 
    x <= GRID_WIDTH*CELL_SIZE - pieceWidth &&
    z >= 0 && 
    z <= GRID_HEIGHT*CELL_SIZE - pieceHeight
  );
  
  let validPlacement = false;
  if (inBoard) {
    validPlacement = canPlacePiece(currentDraggingData, currentBoardPos);
  }
  
  if (inBoard && validPlacement) {
    dropStartPos.copy(currentDraggingGroup.position);
    dropEndPos.set(
      currentBoardPos.x * CELL_SIZE,
      0,
      currentBoardPos.y * CELL_SIZE
    );
    
    dropStartScale = currentDraggingGroup.scale.x;
    const customSize = currentDraggingGroup.userData.customCellSize || CELL_SIZE;
    dropEndScale = CELL_SIZE / customSize;
    
    isDropping = true;
    dropStartTime = performance.now();
    
    AudioManager.play('drop', 0.6);
  } else {
    AudioManager.play('illegalMove', 0.5);
    returnToPreview();
  }
}

function returnToPreview() {
  if (currentDraggingGroup && currentDraggingIndex != null) {
    scene.remove(currentDraggingGroup);
    previewGroup.add(currentDraggingGroup);
    updatePreviewPieces();
  }
  currentDraggingData = null;
  currentDraggingIndex = null;
  currentDraggingGroup = null;
  updateShadowMesh(null, { x:0, y:0 });
}

function finalizeDrop() {
  placePieceOnBoard(currentDraggingData, currentBoardPos);
  activePieces[currentDraggingIndex] = null;
  currentDraggingData = null;
  currentDraggingIndex = null;
  
  if (currentDraggingGroup) {
    scene.remove(currentDraggingGroup);
  }
  currentDraggingGroup = null;
  
  updateShadowMesh(null, { x:0, y:0 });
  refillActivePiecesIfNeeded();
}

// Enhanced grid
function createEnhancedGrid() {
  boardGroup.remove(gridHelper);
  
  const gridGeometry = new THREE.PlaneGeometry(GRID_WIDTH * CELL_SIZE, GRID_HEIGHT * CELL_SIZE);
  gridGeometry.rotateX(-Math.PI / 2);
  
  const canvas = document.createElement('canvas');
  const size = 512;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, size, size);
  
  ctx.strokeStyle = '#3f3f7a';
  ctx.lineWidth = 2;
  
  const cellWidth = size / GRID_WIDTH;
  const cellHeight = size / GRID_HEIGHT;
  
  for (let i = 0; i <= GRID_WIDTH; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cellWidth, 0);
    ctx.lineTo(i * cellWidth, size);
    ctx.stroke();
  }
  for (let i = 0; i <= GRID_HEIGHT; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * cellHeight);
    ctx.lineTo(size, i * cellHeight);
    ctx.stroke();
  }
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if ((x + y) % 2 === 0) {
        ctx.fillStyle = 'rgba(80, 80, 120, 0.1)';
        ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
      }
    }
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.7,
    metalness: 0.2,
    transparent: true,
    opacity: 0.9
  });
  
  const grid = new THREE.Mesh(gridGeometry, material);
  grid.position.set(
    (GRID_WIDTH * CELL_SIZE) / 2,
    0.1,
    (GRID_HEIGHT * CELL_SIZE) / 2
  );
  grid.receiveShadow = true;
  boardGroup.add(grid);
}

function addBoardAccents() {
  const baseGeometry = new THREE.BoxGeometry(
    GRID_WIDTH * CELL_SIZE * 1.2, 
    CELL_SIZE * 0.5, 
    GRID_HEIGHT * CELL_SIZE * 1.2
  );
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a2a,
    roughness: 0.7,
    metalness: 0.3
  });
  
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.position.set(
    (GRID_WIDTH * CELL_SIZE) / 2,
    -CELL_SIZE * 0.25,
    (GRID_HEIGHT * CELL_SIZE) / 2
  );
  base.receiveShadow = true;
  boardGroup.add(base);
  
  const lineGeometry = new THREE.PlaneGeometry(
    GRID_WIDTH * CELL_SIZE * 1.1,
    CELL_SIZE * 0.02
  );
  const lineMaterial = new THREE.MeshBasicMaterial({
    color: 0x4fc3f7,
    transparent: true,
    opacity: 0.7
  });
  
  for (let i = 0; i < 3; i++) {
    const line = new THREE.Mesh(lineGeometry, lineMaterial);
    line.rotation.x = -Math.PI / 2;
    line.position.set(
      (GRID_WIDTH * CELL_SIZE) / 2,
      -CELL_SIZE * 0.01,
      (GRID_HEIGHT * CELL_SIZE) / 2 - GRID_HEIGHT * CELL_SIZE * 0.3 + i * GRID_HEIGHT * CELL_SIZE * 0.3
    );
    boardGroup.add(line);
  }
}

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

function optimizeForDevice() {
  if (isMobile) {
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const scaleFactor = isIOS ? 0.63 : 0.72;
    CELL_SIZE = CELL_SIZE * scaleFactor;
    
    camera.position.set(
      (GRID_WIDTH * CELL_SIZE) / 2,
      camera.position.y * (isIOS ? 0.9 : 0.95),
      ((GRID_HEIGHT * CELL_SIZE) / 2 + 380 * scaleFactor)
    );
    camera.lookAt((GRID_WIDTH * CELL_SIZE) / 2, -20, (GRID_HEIGHT * CELL_SIZE) / 2);
    
    const scoreContainer = document.querySelector('.game-ui.score-display');
    if (scoreContainer) {
      scoreContainer.style.top = isIOS ? '10px' : '15px';
      scoreContainer.style.width = isIOS ? '100px' : '110px';
      scoreContainer.style.left = '50%';
      scoreContainer.style.transform = 'translateX(-50%)';
      scoreContainer.style.padding = '10px 20px';
      const scoreText = scoreContainer.querySelector('#inGameScore');
      if (scoreText) {
        scoreText.style.fontSize = '22px';
      }
    }
    
    const buttonsContainer = document.querySelector('.game-ui.buttons-container');
    if (buttonsContainer) {
      buttonsContainer.style.bottom = isIOS ? '60px' : '70px'; // Moved down
      buttonsContainer.style.gap = isIOS ? '10px' : '12px';
      const buttons = buttonsContainer.querySelectorAll('button');
      buttons.forEach(button => {
        button.style.padding = isIOS ? '10px 15px' : '12px 18px';
        button.style.fontSize = isIOS ? '14px' : '15px';
        button.style.boxShadow = '0 0 15px rgba(0,0,0,0.5)';
      });
    }
    
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    
    bloomPass.strength = 0.4;
    
    if (window.devicePixelRatio < 2) {
      renderer.shadowMap.enabled = false;
    }
    if (window.devicePixelRatio > 2) {
      renderer.setPixelRatio(2);
    } else if (window.devicePixelRatio > 1) {
      renderer.setPixelRatio(1.5);
    } else {
      renderer.setPixelRatio(1);
    }
  }
}

function resetGame() {
  score = 0;
  gameOver = false;
  isDragging = false;
  isDropping = false;
  currentDraggingGroup = null;
  currentDraggingData = null;
  currentDraggingIndex = null;
  dragOffset.set(0,0,0);
  
  document.getElementById('inGameScore').textContent = '0';
  messageArea.textContent = '';
  
  grid = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(0));
  
  while (blocksGroup.children.length > 0) {
    blocksGroup.remove(blocksGroup.children[0]);
  }
  while (previewGroup.children.length > 0) {
    previewGroup.remove(previewGroup.children[0]);
  }
  while (shadowGroup.children.length > 0) {
    shadowGroup.remove(shadowGroup.children[0]);
  }
  while (boardGroup.children.length > 0) {
    boardGroup.remove(boardGroup.children[0]);
  }
  
  boardGroup.add(boardPlane);
  boardGroup.add(floor);
  
  createEnhancedGrid();
  addBoardBorder();
  addBoardAccents();
  
  piecePool = [];
  activePieces = [];
  
  refillActivePiecesIfNeeded();
  updateGridVisualization();
  
  toggleGameOverOverlay(false);
  toggleLeaderboard(false);
}

function initGame() {
  optimizeForDevice();
  addPointerEventListeners();
  AnimationManager.init();
  resetGame();
  AnimationManager.animate(performance.now());
}

// Add both mouse & touch
function addPointerEventListeners() {
  // Mouse
  renderer.domElement.addEventListener('mousedown', (e) => {
    e.preventDefault();
    handleInputStart(e.clientX, e.clientY);
  });
  renderer.domElement.addEventListener('mousemove', (e) => {
    e.preventDefault();
    handleInputMove(e.clientX, e.clientY);
  });
  renderer.domElement.addEventListener('mouseup', (e) => {
    e.preventDefault();
    handleInputEnd();
  });
  
  // Touch
  renderer.domElement.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleInputStart(touch.clientX, touch.clientY);
  }, { passive: false });
  renderer.domElement.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleInputMove(touch.clientX, touch.clientY);
  }, { passive: false });
  renderer.domElement.addEventListener('touchend', (e) => {
    e.preventDefault();
    handleInputEnd();
  }, { passive: false });
}

window.addEventListener('resize', onWindowResize);
function onWindowResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  
  renderer.setSize(w, h);
  composer.setSize(w, h);
  labelRenderer.setSize(w, h);
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Animation
const AnimationManager = {
  settings: {
    activePieceAnimations: true,
    placedBlocksAnimations: true,
    needsRender: true,
    lastAnimTime: 0,
    ambientFps: 30
  },
  
  init: function() {
    if (isMobile && window.devicePixelRatio < 2) {
      this.settings.placedBlocksAnimations = false;
    }
  },
  
  animate: function(time) {
    requestAnimationFrame(AnimationManager.animate);
    
    AnimationManager.settings.needsRender = false;
    const time_s = time / 1000;
    
    AnimationManager.processEssentialAnimations(time_s);
    AnimationManager.processAmbientAnimations(time, time_s);
    
    if (AnimationManager.settings.needsRender) {
      composer.render();
      labelRenderer.render(scene, camera);
    }
  },
  
  processEssentialAnimations: function(time_s) {
    if (isDropping) {
      this.settings.needsRender = true;
      const elapsed = performance.now() - dropStartTime;
      const progress = Math.min(elapsed / dropDuration, 1);
      const eased = easeOutCubic(progress);
      
      // Lerp position from dropStartPos -> dropEndPos
      const newX = THREE.MathUtils.lerp(dropStartPos.x, dropEndPos.x, eased);
      const newY = THREE.MathUtils.lerp(dropStartPos.y, dropEndPos.y, eased);
      const newZ = THREE.MathUtils.lerp(dropStartPos.z, dropEndPos.z, eased);
      if (currentDraggingGroup) {
        currentDraggingGroup.position.set(newX, newY, newZ);
        
        // Lerp scale from dropStartScale -> dropEndScale
        const scaleFactor = THREE.MathUtils.lerp(dropStartScale, dropEndScale, eased);
        currentDraggingGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);
      }
      
      if (progress >= 1) {
        isDropping = false;
        finalizeDrop();
      }
    }
    if (isDragging) {
      this.settings.needsRender = true;
    }
  },
  
  processAmbientAnimations: function(time, time_s) {
    const interval = 1000 / this.settings.ambientFps;
    if (time - this.settings.lastAnimTime < interval) return;
    this.settings.lastAnimTime = time;
    this.settings.needsRender = true;
    
    if (this.settings.placedBlocksAnimations && blocksGroup.children.length > 0) {
      blocksGroup.children.forEach(cubeGroup => {
        if (cubeGroup.userData.initialY !== undefined) {
          cubeGroup.position.y = cubeGroup.userData.initialY +
            Math.sin(time_s + cubeGroup.userData.animPhase) * 0.5;
          cubeGroup.rotation.y = Math.sin(time_s * 0.2 + cubeGroup.userData.animPhase) * 0.02;
        }
      });
    }
    
    // The piece in hand is kept rigid, no wiggling
  }
};

// Go
initGame();
