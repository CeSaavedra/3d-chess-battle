import * as THREE from 'https://esm.sh/three@0.180.0';
import { GLTFLoader } from 'https://esm.sh/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js';

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);

const scene = new THREE.Scene();
scene.background = null;

const camera_pos_p1 = new THREE.Vector3(0.085, 1.648, -2.257);
const camera_pos_p2 = new THREE.Vector3(0.085, 1.648, 2.257);

function applyCameraPreset(vec, target) {
  if (!(vec instanceof THREE.Vector3)) return;
  camera.position.copy(vec);
  controls.target.copy(target ?? window._boardCenter ?? new THREE.Vector3(0, 0, 0));
  controls.update();
  console.log('Applied camera preset', vec.x, vec.y, vec.z);
}

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.001, 500);
camera.position.set(1.5, 1.5, 1.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const dir = new THREE.DirectionalLight(0xffffff, 2);
scene.add(dir);
scene.background = new THREE.Color(0x000000);

const loader = new GLTFLoader();

function createPieceObject({ type, color, id, gltf, materialTemplate = null }) {
  const root = new THREE.Object3D();
  root.name = `${color}_${type}_${id}`;

  root.userData = {
    id,
    type,            
    color,        
    coord: null,
    alive: true,
    hasMoved: false,
    pieceLabel: `${color.charAt(0).toUpperCase() + color.slice(1)} ${type.charAt(0).toUpperCase() + type.slice(1)}`
  };

  const model = gltf.scene.clone(true);
  model.traverse(node => {
    if (!node.isMesh) return;
    if (materialTemplate) {
      node.material = Array.isArray(node.material)
        ? node.material.map(() => materialTemplate.clone())
        : materialTemplate.clone();
    }
  });

  const bbox = new THREE.Box3().setFromObject(model);
  const center = bbox.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;

  model.traverse(n => {
    if (n.isMesh && n.material) { n.material.side = THREE.DoubleSide; n.material.needsUpdate = true; }
  });

  root.add(model);
  root.userData._model = model;
  return root;
}

function placePieceObjectOnTile(pieceObj, coord, tiles, sceneRef) {
  const tilesLocal = tiles || window.tiles;
  const sceneLocal = sceneRef || window.scene;

  console.log('called with coord=', coord, 'piece=', pieceObj?.userData?.id ?? pieceObj?.userData?.type);

  if (!tilesLocal) {
    console.error('no tiles array provided or found on window.tiles');
    return;
  }
  if (!sceneLocal) {
    console.error('no scene provided or found on window.scene');
    return;
  }

  const tile = tilesLocal.find(t => t.coord === coord);
  if (!tile) {
    console.error('tile not found for coord:', coord);
    throw new Error('tile not found ' + coord);
  }
  console.log('target tile found:', tile.coord, 'center=', tile.center, 'topY=', tile.topY);

  pieceObj.userData = pieceObj.userData || {};
  pieceObj.userData.coord = coord;

  // Sets world position
  try {
    pieceObj.position.set(tile.center.x, tile.topY, tile.center.z);
    pieceObj.updateMatrixWorld(true);
    console.log('positioned piece at', pieceObj.position);
  } catch (err) {
    console.error('error setting position/updateMatrixWorld', err);
  }

  try {
    if (pieceObj.parent && pieceObj.parent !== sceneLocal) {
      try { pieceObj.parent.remove(pieceObj); } catch (e) { /* ignore */ }
    }
    if (pieceObj.parent !== sceneLocal) {
      sceneLocal.add(pieceObj);
      console.log('added piece to scene');
    } else {
      console.log('piece already in scene');
    }
  } catch (err) {
    console.error('error adding piece to scene', err);
  }

  if (tile.occupant && tile.occupant !== pieceObj) {
    const captured = tile.occupant;
    console.log('capture detected. captured=', captured?.userData?.id ?? captured?.userData?.type);

    try {
      captured.userData = captured.userData || {};
      captured.userData.alive = false;
      captured.visible = false;
      if (captured.parent) {
        try { captured.parent.remove(captured); console.log('removed captured piece from scene'); } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.error('error handling captured piece', err);
    }
  }

  tile.occupant = pieceObj;
  console.log('tile.occupant set to piece', pieceObj?.userData?.id ?? pieceObj?.userData?.type, 'tile:', tile.coord);
}

const players = {
  white: { color: 'white', pieces: new Map() },
  black: { color: 'black', pieces: new Map() }
};

function spawnPiece({ type, color, id, gltf, materialTemplate, coord, tiles, sceneRef }) {
  const piece = createPieceObject({ type, color, id, gltf, materialTemplate });
  placePieceObjectOnTile(piece, coord, tiles, sceneRef);
  players[color].pieces.set(id, piece);
  return piece;
}


function setupTileClickLogger(tiles, sceneRef, cameraRef, domElement = renderer.domElement) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function getTileFromEvent(evt) {
    const rect = domElement.getBoundingClientRect();
    mouse.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, cameraRef);

    const hits = raycaster.intersectObjects(sceneRef.children, true);
    if (!hits.length) return null;
    const hitPoint = hits[0].point;

    let best = null, bestDist2 = Infinity;
    for (const t of tiles) {
      const dx = hitPoint.x - t.center.x;
      const dz = hitPoint.z - t.center.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDist2) { bestDist2 = d2; best = t; }
    }
    return best;
  }

  function onPointerDown(evt) {
    if (window._isMyTurn === false) return;

    const tile = getTileFromEvent(evt);
    if (!tile) return;

    const selApi = window._selectionUI;
    const playerColor = window._playerColor;
    if (!selApi) return;

    const selected = selApi.getSelected();
    const targeted = selApi.getTargeted();

    if (!selected) {
      window.evaluateSelected?.(tile);
      return;
    }

    if (selected && !targeted) {
      if (tile === selected) {
        window.evaluateSelected?.(tile);
        return;
      }

      const selValid = !!(selected.occupant && selected.occupant.userData.color === playerColor);
      if (!selValid) {
        window.evaluateSelected?.(tile);
        return;
      }

      if (tile.occupant) {
        try {
          const selectedPiece = selected.occupant;
          const legal = (typeof getLegalMovesForUI === 'function' && selectedPiece) ? getLegalMovesForUI(selectedPiece, tiles) : [];
          const canCapture = Array.isArray(legal) && legal.includes(tile.coord);
          if (canCapture) {
            window.evaluateTarget?.(tile);
            return;
          }
        } catch (err) {
          console.warn('capture-check failed', err);
        }
        window.evaluateSelected?.(tile);
        return;
      }
      window.evaluateTarget?.(tile);
      return;
    }
    window.evaluateSelected?.(tile);
  }

  domElement.addEventListener('pointerdown', onPointerDown);
  return { dispose: () => domElement.removeEventListener('pointerdown', onPointerDown) };
}

// Board Initialization - Defines the raycaster in which tile selection logic is used on
async function initializeBoard(boardRoot) {
  let gameBoard = boardRoot.getObjectByName('game-board');
  if (!gameBoard || !gameBoard.isMesh) gameBoard = boardRoot.getObjectByName('game-board', true);
  if (!gameBoard || !gameBoard.isMesh) {
    gameBoard = null;
    boardRoot.traverse(c => { if (!gameBoard && c.isMesh) gameBoard = c; });
  }
  if (!gameBoard || !gameBoard.isMesh) {
    console.error('game-board not found as a Mesh; export the plane as a Mesh from Blender');
    throw new Error('game-board mesh not found');
  }

  gameBoard.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const worldBox = new THREE.Box3().setFromObject(gameBoard);
  const min = worldBox.min.clone();
  const max = worldBox.max.clone();
  const sizeX = max.x - min.x, sizeZ = max.z - min.z;
  const cellSizeX = sizeX / 8, cellSizeZ = sizeZ / 8;

  const fileLetter = i => String.fromCharCode('A'.charCodeAt(0) + i);
  const rankNumber = j => (j + 1);

  const tiles = [];

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const cx = min.x + cellSizeX * (file + 0.5);
      const cz = min.z + cellSizeZ * (rank + 0.5);
      const rayOrigin = new THREE.Vector3(cx, max.y + 1.0, cz);

      raycaster.set(rayOrigin, down);
      const intersects = raycaster.intersectObject(boardRoot, true);
      if (!intersects.length) {
        console.warn('no hit for cell', file, rank);
        continue;
      }

      const hit = intersects[0];
      const hitPoint = hit.point.clone();
      const normal = (hit.face && hit.object)
        ? hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize()
        : new THREE.Vector3(0, 1, 0);

      const coord = `${fileLetter(file)}${rankNumber(rank)}`;
      tiles.push({
        coord,
        center: hitPoint.clone(),
        topY: hitPoint.y,
        normal,
        mesh: hit.object,
        occupant: null
      });
    }
  }

  tiles.sort((a, b) => {
    const af = a.coord.charCodeAt(0), bf = b.coord.charCodeAt(0);
    const ar = parseInt(a.coord.slice(1), 10), br = parseInt(b.coord.slice(1), 10);
    if (af !== bf) return af - bf;
    return ar - br;
  });

  if (typeof window !== 'undefined') {
    window.chessTiles = tiles; 
    window.tiles = tiles;        
  }
  return { gameBoard, tiles, cellSizeX, cellSizeZ };
}

function placePieceAt(tiles, coord, gltf, sceneRef, materialTemplate, yOffset = 0.01) {
  const tile = tiles.find(t => t.coord === coord);
  if (!tile) {
    console.warn('placePieceAt: tile not found', coord);
    return null;
  }

  const clone = gltf.scene.clone(true);
  clone.traverse(node => {
    if (!node.isMesh) return;
    if (Array.isArray(node.material)) {
      node.material = node.material.map(() => materialTemplate.clone());
      node.material.forEach(m => { m.transparent = false; m.depthWrite = true; m.side = THREE.DoubleSide; m.needsUpdate = true; });
    } else {
      const m = materialTemplate.clone();
      m.transparent = false;
      m.depthWrite = true;
      m.side = THREE.DoubleSide;
      m.needsUpdate = true;
      node.material = m;
    }
  });

  clone.position.set(tile.center.x, tile.topY + yOffset, tile.center.z);
  if (materialTemplate && materialTemplate.color && materialTemplate.color.getHex && materialTemplate.color.getHex() === 0xF5F5F5) clone.rotation.y = Math.PI;
  clone.updateMatrixWorld(true);
  sceneRef.add(clone);
  return clone;
}

function initializePieces(tiles, pawnGltf, sceneRef, { yOffset = 0.01 } = {}) {
  if (!tiles || !pawnGltf || !sceneRef) {
    console.error('initializePieces missing arguments');
    return;
  }

  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xF5F5F5, metalness: 0.0, roughness: 0.1 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x242424, metalness: 0.0, roughness: 0.1 });

  for (let f = 0; f < 8; f++) {
    const fileLetter = String.fromCharCode('A'.charCodeAt(0) + f);
    const idWhite = `w_p_${f + 1}`;
    const idBlack = `b_p_${f + 1}`;
    spawnPiece({
      type: 'pawn', color: 'white', id: idWhite,
      gltf: pawnGltf, materialTemplate: whiteMat, coord: `${fileLetter}2`, tiles, sceneRef
    });
    spawnPiece({
      type: 'pawn', color: 'black', id: idBlack,
      gltf: pawnGltf, materialTemplate: blackMat, coord: `${fileLetter}7`, tiles, sceneRef
    });
  }
}

function parseCoord(coord) {
  const f = coord.charCodeAt(0) - 'A'.charCodeAt(0);
  const r = parseInt(coord.slice(1), 10) - 1;
  return { f, r };
}
function coordFromFR(f, r) { return String.fromCharCode('A'.charCodeAt(0) + f) + (r + 1); }
function inBounds(f, r) { return f >= 0 && f < 8 && r >= 0 && r < 8; }
function tileAt(tiles, coord) { return tiles.find(t => t.coord === coord) || null; }
function isEmptyTile(tiles, coord) { const t = tileAt(tiles, coord); return t && !t.occupant; }
function occupiedByColor(tiles, coord, color) { const t = tileAt(tiles, coord); return t && t.occupant && t.occupant.userData.color === color; }

function slidingMoves(piece, tiles, directions) {
  const { f: startF, r: startR } = parseCoord(piece.userData.coord);
  const moves = [];
  for (const [df, dr] of directions) {
    let f = startF + df, r = startR + dr;
    while (inBounds(f, r)) {
      const coord = coordFromFR(f, r);
      if (isEmptyTile(tiles, coord)) moves.push(coord);
      else {
        if (!occupiedByColor(tiles, coord, piece.userData.color)) moves.push(coord);
        break;
      }
      f += df; r += dr;
    }
  }
  return moves;
}

const _uiMoveGenerators = {
  pawn(piece, tiles) {
    const moves = [];
    const { f, r } = parseCoord(piece.userData.coord);
    const dir = piece.userData.color === 'white' ? 1 : -1;
    const oneR = r + dir;
    if (inBounds(f, oneR) && isEmptyTile(tiles, coordFromFR(f, oneR))) {
      moves.push(coordFromFR(f, oneR));
      const twoR = r + 2 * dir;
      if (!piece.userData.hasMoved && inBounds(f, twoR) && isEmptyTile(tiles, coordFromFR(f, twoR))) moves.push(coordFromFR(f, twoR));
    }
    for (const df of [-1, 1]) {
      const cf = f + df, cr = r + dir;
      if (!inBounds(cf, cr)) continue;
      const ccoord = coordFromFR(cf, cr);
      if (!isEmptyTile(tiles, ccoord) && !occupiedByColor(tiles, ccoord, piece.userData.color)) moves.push(ccoord);
    }
    return moves;
  },
  rook(p, tiles) { return slidingMoves(p, tiles, [[1, 0], [-1, 0], [0, 1], [0, -1]]); },
  bishop(p, tiles) { return slidingMoves(p, tiles, [[1, 1], [1, -1], [-1, 1], [-1, -1]]); },
  queen(p, tiles) { return slidingMoves(p, tiles, [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]); },
  knight(piece, tiles) {
    const moves = []; const { f, r } = parseCoord(piece.userData.coord);
    const deltas = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
    for (const [df, dr] of deltas) {
      const nf = f + df, nr = r + dr;
      if (!inBounds(nf, nr)) continue;
      const coord = coordFromFR(nf, nr);
      if (isEmptyTile(tiles, coord) || !occupiedByColor(tiles, coord, piece.userData.color)) moves.push(coord);
    }
    return moves;
  },
  king(piece, tiles) {
    const moves = []; const { f, r } = parseCoord(piece.userData.coord);
    for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const nf = f + df, nr = r + dr;
      if (!inBounds(nf, nr)) continue;
      const coord = coordFromFR(nf, nr);
      if (isEmptyTile(tiles, coord) || !occupiedByColor(tiles, coord, piece.userData.color)) moves.push(coord);
    }
    return moves;
  }
};

function getLegalMovesForUI(piece, tiles) {
  if (!piece || !piece.userData || !piece.userData.type) return [];
  const gen = _uiMoveGenerators[piece.userData.type];
  return gen ? gen(piece, tiles) : [];
}

// Selection UI handler - Sets up scene and UI elements
function setupSelectionUI({ tiles, scene, camera, domElement = renderer.domElement, playerColor = 'white' } = {}) {
  if (!tiles || !scene || !camera) {
    console.warn('setupSelectionUI: missing args');
    return () => { };
  }

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const tileSelectedEl = document.getElementById('tileSelected');
  const tileTargetedEl = document.getElementById('tileTargeted');
  const gameHUDEl = document.getElementById('gameHUD'); 

  let selectedTile = null;  
  let targetedTile = null;  

  function setElState(el, text, state) {
    if (!el) return;
    el.textContent = text ?? '  ';
    el.style.color = state === 'invalid' ? 'red' : state === 'valid' ? 'yellow' : state === 'ready' ? 'green' : '';
  }

  function getTileFromEvent(evt) {
    const rect = domElement.getBoundingClientRect();
    mouse.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    if (!hits.length) return null;
    const hitPoint = hits[0].point;
    let best = null, bestDist2 = Infinity;
    for (const t of tiles) {
      const dx = hitPoint.x - t.center.x, dz = hitPoint.z - t.center.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDist2) { bestDist2 = d2; best = t; }
    }
    return best;
  }

  // Updates Selected tile
  function evaluateSelected(tile) {
    selectedTile = tile;
    targetedTile = null;

    if (gameHUDEl) gameHUDEl.classList.remove('ready-animate');

    if (window._isMyTurn === false) {
      return;
    }

    if (!tile) {
      setElState(tileSelectedEl, '  ', 'invalid');
      setElState(tileTargetedEl, '  ', 'invalid');
      return;
    }

    const isValidOwnPiece = !!(tile.occupant && tile.occupant.userData.color === playerColor);
    setElState(tileSelectedEl, tile.coord, isValidOwnPiece ? 'valid' : 'invalid');
    setElState(tileTargetedEl, '  ', 'invalid');
  }

  // Determines tile validity using legality helper and updates HUD selection UIs and sets them accordingly
  function evaluateTarget(tile) {
    if (window._isMyTurn === false) {
      targetedTile = null;
      if (gameHUDEl) gameHUDEl.classList.remove('ready-animate');
      return;
    }

    targetedTile = null;
    if (!selectedTile) {
      if (gameHUDEl) gameHUDEl.classList.remove('ready-animate');
      return;
    }

    const selValid = !!(selectedTile.occupant && selectedTile.occupant.userData.color === playerColor);
    if (!selValid) {
      setElState(tileTargetedEl, '  ', 'invalid');
      if (gameHUDEl) gameHUDEl.classList.remove('ready-animate');
      return;
    }

    if (!tile) {
      setElState(tileTargetedEl, '  ', 'invalid');
      if (gameHUDEl) gameHUDEl.classList.remove('ready-animate');
      return;
    }

    if (tile.occupant) {
      const occColor = tile.occupant.userData?.color;
      const isOpponent = occColor && occColor !== playerColor;
      if (!isOpponent) {
        setElState(tileTargetedEl, tile.coord, 'invalid');
        if (gameHUDEl) gameHUDEl.classList.remove('ready-animate');
        return;
      }

      // Checks Capture Legality (getLegalMovesForUI)
      const piece = selectedTile.occupant;
      const legal = (typeof getLegalMovesForUI === 'function' && piece) ? getLegalMovesForUI(piece, tiles) : [];
      const canCapture = Array.isArray(legal) && legal.includes(tile.coord);

      setElState(tileTargetedEl, tile.coord, canCapture ? 'valid' : 'invalid');

      const selState = !!(selectedTile.occupant && selectedTile.occupant.userData.color === playerColor);
      if (selState && canCapture) {
        setElState(tileSelectedEl, selectedTile.coord, 'ready');
        setElState(tileTargetedEl, tile.coord, 'ready');
        if (gameHUDEl) gameHUDEl.classList.add('ready-animate');
        targetedTile = tile;
      } else {
        if (selState) setElState(tileSelectedEl, selectedTile.coord, 'valid');
        if (gameHUDEl) gameHUDEl.classList.remove('ready-animate');
      }
      return;
    }

    const piece = selectedTile.occupant;
    const legal = (typeof getLegalMovesForUI === 'function' && piece) ? getLegalMovesForUI(piece, tiles) : [];
    const ok = Array.isArray(legal) && legal.includes(tile.coord);

    setElState(tileTargetedEl, tile.coord, ok ? 'valid' : 'invalid');

    const selState = !!(selectedTile.occupant && selectedTile.occupant.userData.color === playerColor);
    if (selState && ok) {
      setElState(tileSelectedEl, selectedTile.coord, 'ready');
      setElState(tileTargetedEl, tile.coord, 'ready');
      if (gameHUDEl) gameHUDEl.classList.add('ready-animate');
      targetedTile = tile;
    } else {
      if (selState) setElState(tileSelectedEl, selectedTile.coord, 'valid');
      if (gameHUDEl) gameHUDEl.classList.remove('ready-animate');
    }
  }

  // Handles Tile Selection Clicking Logic
  function onPointerDown(evt) {
    if (window._isMyTurn === false) return;

    const tile = getTileFromEvent(evt);
    if (!tile) return;

    if (!selectedTile) {
      evaluateSelected(tile);
      return;
    }

    if (selectedTile && !targetedTile) {
      if (tile === selectedTile) {
        evaluateSelected(tile);
        return;
      }

      const selValid = !!(selectedTile.occupant && selectedTile.occupant.userData.color === playerColor);

      if (!selValid) {
        // First selected is invalid
        // Next click becomes the new First selected
        evaluateSelected(tile);
        return;
      }

      // First selected tile is valid
      if (tile.occupant) {
        // If clicked tile occupied by opponent and legal move allows capture - allow capturing
        const occColor = tile.occupant.userData?.color;
        const isOpponent = occColor && occColor !== playerColor;
        if (isOpponent) {
          try {
            const selectedPiece = selectedTile.occupant;
            const legal = (typeof getLegalMovesForUI === 'function' && selectedPiece) ? getLegalMovesForUI(selectedPiece, tiles) : [];
            const canCapture = Array.isArray(legal) && legal.includes(tile.coord);
            if (canCapture) {
              evaluateTarget(tile);
              return;
            }
          } catch (err) {
            console.warn('capture-check failed', err);
          }
        }
        evaluateSelected(tile);
        return;
      }

      // Clicking empty tile tries to set target
      evaluateTarget(tile);
      return;
    }

    // Both selected and target exist - next click becomes new first selected
    evaluateSelected(tile);
  }

  domElement.addEventListener('pointerdown', onPointerDown);

  // Allow access of selection state
  window._selectionUI = {
    getSelected: () => selectedTile,
    getTargeted: () => targetedTile,
    clear: () => { selectedTile = null; targetedTile = null; }
  };
  // Dispose Function
  return {
    dispose() { domElement.removeEventListener('pointerdown', onPointerDown); }
  };
}

// Loads Resources into the Scene such as the Board and the Chess Pieces
async function loadResourcesAndTiles(loader, boardUrl, pawnUrl, rookUrl, bishopUrl, queenUrl, kingUrl, knightUrl, sceneRef) {
  const [boardGltf, pawnGltf] = await Promise.all([
    loader.loadAsync(boardUrl),
    loader.loadAsync(pawnUrl)
  ]);

  const board = boardGltf.scene;
  sceneRef.add(board);
  board.updateMatrixWorld(true);

  const { gameBoard, tiles } = await initializeBoard(board);

  try {
    // Sets player color based on assigned player number ( 1 = white; 2 = black)
    const playerColor = (typeof window !== 'undefined' && window._playerNumber === 2) ? 'black' : 'white';
    window._selectionUIHandle = setupSelectionUI({
      tiles,
      scene: sceneRef,
      camera,                      
      domElement: renderer.domElement, 
      playerColor
    });
  } catch (e) {
    console.warn('selection UI hookup failed (setupSelectionUI may be missing or camera/renderer out of scope)', e);
  }

  // Spawns Pawms
  initializePieces(tiles, pawnGltf, sceneRef, { yOffset: 0.1 });

  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xF5F5F5, metalness: 0.0, roughness: 0.1 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x242424, metalness: 0.0, roughness: 0.1 });

  // Spawns Rooks
  try {
    const rookGltf = await loader.loadAsync(rookUrl);
    spawnPiece({ type: 'rook', color: 'white', id: 'w_r_1', gltf: rookGltf, materialTemplate: whiteMat, coord: 'A1', tiles, sceneRef });
    spawnPiece({ type: 'rook', color: 'white', id: 'w_r_2', gltf: rookGltf, materialTemplate: whiteMat, coord: 'H1', tiles, sceneRef });
    spawnPiece({ type: 'rook', color: 'black', id: 'b_r_1', gltf: rookGltf, materialTemplate: blackMat, coord: 'A8', tiles, sceneRef });
    spawnPiece({ type: 'rook', color: 'black', id: 'b_r_2', gltf: rookGltf, materialTemplate: blackMat, coord: 'H8', tiles, sceneRef });
  } catch (e) { console.error('failed to load or place rooks', e); }

  // Spawns Bishops
  try {
    const bishopGltf = await loader.loadAsync(bishopUrl);
    spawnPiece({ type: 'bishop', color: 'white', id: 'w_b_1', gltf: bishopGltf, materialTemplate: whiteMat, coord: 'C1', tiles, sceneRef });
    spawnPiece({ type: 'bishop', color: 'white', id: 'w_b_2', gltf: bishopGltf, materialTemplate: whiteMat, coord: 'F1', tiles, sceneRef });
    spawnPiece({ type: 'bishop', color: 'black', id: 'b_b_1', gltf: bishopGltf, materialTemplate: blackMat, coord: 'C8', tiles, sceneRef });
    spawnPiece({ type: 'bishop', color: 'black', id: 'b_b_2', gltf: bishopGltf, materialTemplate: blackMat, coord: 'F8', tiles, sceneRef });
  } catch (e) { console.error('failed to load or place bishops', e); }

  // Spawns Queens
  try {
    const queenGltf = await loader.loadAsync(queenUrl);
    spawnPiece({ type: 'queen', color: 'white', id: 'w_q_1', gltf: queenGltf, materialTemplate: whiteMat, coord: 'D1', tiles, sceneRef });
    spawnPiece({ type: 'queen', color: 'black', id: 'b_q_1', gltf: queenGltf, materialTemplate: blackMat, coord: 'D8', tiles, sceneRef });
  } catch (e) { console.error('failed to load or place queens', e); }

  // Spawns Kings
  try {
    const kingGltf = await loader.loadAsync(kingUrl);
    spawnPiece({ type: 'king', color: 'white', id: 'w_k_1', gltf: kingGltf, materialTemplate: whiteMat, coord: 'E1', tiles, sceneRef });
    spawnPiece({ type: 'king', color: 'black', id: 'b_k_1', gltf: kingGltf, materialTemplate: blackMat, coord: 'E8', tiles, sceneRef });
  } catch (e) { console.error('failed to load or place kings', e); }

  // Spawns Knights
  try {
    const knightGltf = await loader.loadAsync(knightUrl);

    const w_n_1 = spawnPiece({
      type: 'knight', color: 'white', id: 'w_n_1',
      gltf: knightGltf, materialTemplate: whiteMat, coord: 'B1', tiles, sceneRef
    });

    w_n_1.rotation.y = Math.PI;     // Rotates knights 180 degrees around Y

    const w_n_2 = spawnPiece({
      type: 'knight', color: 'white', id: 'w_n_2',
      gltf: knightGltf, materialTemplate: whiteMat, coord: 'G1', tiles, sceneRef
    });
    w_n_2.rotation.y = Math.PI;

    const b_n_1 = spawnPiece({
      type: 'knight', color: 'black', id: 'b_n_1',
      gltf: knightGltf, materialTemplate: blackMat, coord: 'B8', tiles, sceneRef
    });

    const b_n_2 = spawnPiece({
      type: 'knight', color: 'black', id: 'b_n_2',
      gltf: knightGltf, materialTemplate: blackMat, coord: 'G8', tiles, sceneRef
    });
  } catch (e) { console.error('failed to load or place knights', e); }
  return { boardGltf, pawnGltf, board, gameBoard, tiles };
}

// Changes GameHUD to cursor pointer
(function () {
  const hud = document.getElementById('gameHUD');
  if (!hud) return;
  hud.style.cursor = 'pointer';
})();


// Wire HUD move actions - move selected piece to target tile, handles captures, and advancing turns
// Removes captured pieces from scene and player maps. Handles HUD updates.
(function wireHudMoveAction() {

  const gameHUDEl = document.getElementById('gameHUD');
  if (!gameHUDEl) return;

  // Animation Helper - Animates object positions
  function animatePosition(obj, from, to, duration = 220) {
    return new Promise((resolve) => {
      const start = performance.now();
      function step(now) {
        const t = Math.min(1, (now - start) / duration);
        obj.position.x = from.x + (to.x - from.x) * t;
        obj.position.y = from.y + (to.y - from.y) * t;
        obj.position.z = from.z + (to.z - from.z) * t;
        obj.updateMatrixWorld(true);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  // Handles GameHUD ready animation
  function clearReadyState() { gameHUDEl.classList.remove('ready-animate'); }

  // Finds which Player owns the piece
  function findPieceOwnerMap(pieceObj) {
    if (!pieceObj) return null;
    const id = pieceObj.userData?.id;
    if (id) {
      if (players?.white?.pieces?.has(id)) return players.white;
      if (players?.black?.pieces?.has(id)) return players.black;
    }
    if (players) {
      for (const p of ['white', 'black']) {
        for (const [k, v] of players[p].pieces.entries()) {
          if (v === pieceObj) return players[p];
        }
      }
    }
    return null;
  }

  // Removes captured piece from player's map
  function removeCapturedFromPlayersMap(capturedObj) {
    if (!capturedObj) return;
    const ownerMap = findPieceOwnerMap(capturedObj);
    if (!ownerMap) return;
    const id = capturedObj.userData?.id;
    if (id) ownerMap.pieces.delete(id);
    else {
      for (const [k, v] of ownerMap.pieces.entries()) {
        if (v === capturedObj) { ownerMap.pieces.delete(k); break; }
      }
    }
  }

  window.performMove = async function performMove(pieceObj, fromTile, toTile, tilesArr, sceneRef) {
    // Tile Array
    const tilesLocal = tilesArr || window.tiles || window.chessTiles; 
    // Scene Reference
    const sceneLocal = sceneRef || window.scene || (typeof scene !== 'undefined' ? scene : null);

    if (!pieceObj || !toTile || !tilesLocal || !sceneLocal) {
      console.warn('[performMove] missing args', { pieceObj, toTile, tilesLocal, sceneLocal });
      return;
    }
    const animatePositionFn = (typeof animatePosition === 'function') ? animatePosition : window.animatePosition;
    
    // Gets tile position and records start position
    const targetPos = { x: toTile.center.x, y: toTile.topY, z: toTile.center.z };
    const startPos = { x: pieceObj.position.x, y: pieceObj.position.y, z: pieceObj.position.z };

    try {
      // Animate into position
      if (typeof animatePositionFn === 'function') await animatePositionFn(pieceObj, startPos, targetPos, 220);
      else { pieceObj.position.set(targetPos.x, targetPos.y, targetPos.z); pieceObj.updateMatrixWorld(true); }
    } catch {
      // Fallback
      pieceObj.position.set(targetPos.x, targetPos.y, targetPos.z);
      pieceObj.updateMatrixWorld(true);
    }

    try {
      // If required - remove old parent
      if (pieceObj.parent && pieceObj.parent !== sceneLocal) {
        try { pieceObj.parent.remove(pieceObj); } catch { }
      }
      // Ensure piece is in scene
      if (pieceObj.parent !== sceneLocal) sceneLocal.add(pieceObj);
    } catch (err) {
      console.warn('error ensuring parent', err);
    }

    // Clear occupant piece on tile
    if (fromTile) fromTile.occupant = null;

    try {
      if (typeof placePieceObjectOnTile === 'function') {
        placePieceObjectOnTile(pieceObj, toTile.coord, tilesLocal, sceneLocal);
      }
    } catch (err) {
      console.warn('placePieceObjectOnTile threw', err);  // Debugging
    }

    // Resolve tile and set occupating piece at destination
    const resolvedTile = (tilesLocal || []).find(t => t.coord === toTile.coord) || toTile;
    resolvedTile.occupant = pieceObj;

    pieceObj.userData = pieceObj.userData || {};
    pieceObj.userData.coord = resolvedTile.coord;
    pieceObj.visible = true;

    // Update transformations
    pieceObj.updateMatrixWorld(true);

    try { pieceObj.userData.hasMoved = true; } catch (e) { }
    return resolvedTile;

  };

  // Validates GameHUD game states
  async function onHudActivate(e) {

    if (!gameHUDEl.classList.contains('ready-animate')) return;
    if (!window._gameStarted || !window._isMyTurn || window._lastKnownTurn !== window._playerNumber) return;

    const selApi = window._selectionUI;
    const selectedTile = selApi?.getSelected();
    const targetedTile = selApi?.getTargeted();
    const playerColor = window._playerColor || (window._playerNumber === 1 ? 'white' : window._playerNumber === 2 ? 'black' : null);

    if (!selectedTile || !targetedTile || !playerColor) { clearReadyState(); return; }
    const pieceObj = selectedTile.occupant;
    if (!pieceObj || pieceObj.userData?.color !== playerColor) { clearReadyState(); return; }
    const targetTile = targetedTile;
    const captured = targetTile.occupant && targetTile.occupant !== pieceObj ? targetTile.occupant : null;

    // Mark piece as moved
    window._isMyTurn = false;
    try { document.body.classList.add('move-pending'); } catch (e) { }
    try { pieceObj.userData = pieceObj.userData || {}; pieceObj.userData.hasMoved = true; } catch (e) { }

    // remove occupant from source and animate/apply move
    selectedTile.occupant = null;
    const tilesLocal = window.tiles || window.chessTiles;
    const sceneLocal = window.scene;
    const resolvedTile = await performMove(pieceObj, selectedTile, targetTile, tilesLocal, window.scene);

    // Build payload including captured info so server can detect king capture
    const roomCode = window._roomCode || new URLSearchParams(location.search).get('code');
    if (socket && roomCode) {
      const movePayload = {
        from: selectedTile.coord,
        to: (resolvedTile || targetTile).coord,
        id: pieceObj.userData?.id,
        type: pieceObj.userData?.type,
        capturedId: captured?.userData?.id || null,
        capturedType: captured?.userData?.type || null
      };

      // Emits 'player-move' Socket
      socket.emit('player-move', roomCode, movePayload, (res) => {

        // Clear UI lock
        try { document.body.classList.remove('move-pending'); } catch (e) { }

        if (!res || !res.ok) {
          // Debugging
          console.warn('player-move failed', res);

          try {
            if (pieceObj && pieceObj.userData) pieceObj.userData.hasMoved = false;
          } catch (e) { }

          if (!(res && res.error === 'NOT_YOUR_TURN')) {
            window._isMyTurn = true;
          }

          try {
            const tilesArr = tilesLocal || window.tiles || window.chessTiles;
            const originalTile = tilesArr.find(t => t.coord === movePayload.from);
            const currentTile = tilesArr.find(t => t.coord === movePayload.to);

            if (originalTile && currentTile && currentTile.occupant === pieceObj) {
              currentTile.occupant = null;
              pieceObj.position.set(originalTile.center.x, originalTile.topY, originalTile.center.z);
              pieceObj.updateMatrixWorld(true);
              originalTile.occupant = pieceObj;
              pieceObj.userData.coord = originalTile.coord;
            }
          } catch (e) { }
          return;
        }

        // Socket server side check if piece captured
        if (captured) {
          captured.userData = captured.userData || {};
          captured.userData.alive = false;
          captured.visible = false;
          removeCapturedFromPlayersMap(captured);
          try {
            const s2 = sceneLocal || window.scene;
            if (s2 && captured.parent) s2.remove(captured);
          } catch { }

          // If piece captured is king, signal game-over
          if (captured.userData?.type === 'king') {
            console.log('Game over: king captured (local)', captured.userData);
            const winEl = document.getElementById('winIndicator');
            const lossEl = document.getElementById('lossIndicator');
            const opponentsTurnEl = document.getElementById('opponentsTurn');
            const lobbyEl = document.getElementById('lobbyIndicator');
            if (winEl) winEl.style.display = 'flex';
            if (lossEl) lossEl.style.display = 'none';
            if (opponentsTurnEl) opponentsTurnEl.style.display = 'none';
            if (lobbyEl) lobbyEl.style.display = 'none';
            clearReadyState();
            selApi?.clear();
            return;
          }
        }
      });
    } else {
      // Debugging
      console.warn('failed player-move - missing socket or roomCode', { hasSocket: !!socket, roomCode });

      // If piece captured, remove it from scene - Checks if piece is king
      if (captured) {
        captured.userData = captured.userData || {};
        captured.userData.alive = false;
        captured.visible = false;
        removeCapturedFromPlayersMap(captured);
        try { const s2 = sceneLocal || window.scene; if (s2 && captured.parent) s2.remove(captured); } catch { }
        
        // Checks if piece captured is the 'king'
        if (captured.userData?.type === 'king') {
          console.log('Game over: king captured', captured.userData); // Debugging
          const winEl = document.getElementById('winIndicator');
          if (winEl) winEl.style.display = 'flex';
          clearReadyState();
          selApi?.clear();
          return;
        }
      }

      // Remove 'move-pending' UI lock
      try { document.body.classList.remove('move-pending'); } catch (e) { }
      window._isMyTurn = false; 

    }

    // UI Cleanup
    clearReadyState();
    selApi?.clear();
    const tileSelectedEl = document.getElementById('tileSelected');
    const tileTargetedEl = document.getElementById('tileTargeted');
    if (tileSelectedEl) { tileSelectedEl.textContent = ''; tileSelectedEl.style.color = ''; }
    if (tileTargetedEl) { tileTargetedEl.textContent = ''; tileTargetedEl.style.color = ''; }

    // Debugging
    console.log('Moved piece', pieceObj.userData?.id || pieceObj.userData?.type,
      'to', resolvedTile?.coord || targetTile.coord, 'captured:', !!captured);
  }

  // Trigger Move Action - Click and keydown listeners
  gameHUDEl.addEventListener('click', onHudActivate);
  gameHUDEl.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onHudActivate(ev); }
  });

})();

// Game lifecycle updates - Register game socket handlers
function registerGameSocketHandlers(sock) {
  if (!sock) return;

  // Listens for 'start-game' 
  sock.on('start-game', (data) => {
    try {
      window._gameOver = false;
      window._gameStarted = true;
      const lobbyEl = document.getElementById('lobbyIndicator');
      if (lobbyEl) lobbyEl.style.display = 'none';
    } catch (err) {
      console.warn('[start-game handler] error', err);
    }
  });

  // Listens for 'game-over' to signal game has ended
  sock.on('game-over', (data) => {
    try {
      // Sets game over in window
      window._gameOver = true;
      window._gameStarted = false;
      window._isMyTurn = false;
      window._lastKnownTurn = null;

      const gameHUDEl = document.getElementById('gameHUD');
      if (gameHUDEl) gameHUDEl.classList.remove('ready-animate');
      try { window._selectionUI?.clear?.(); } catch (e) { /* ignore */ }

      // Determine whether player lost based on socket or player ID
      const amWinner = !!(data && (
        data.winnerPlayerNumber === window._playerNumber ||
        data.winnerSocketId === sock.id
      ));
      const amLoser = !!(data && (
        data.loserPlayerNumber === window._playerNumber ||
        data.loserSocketId === sock.id
      ));

      // Display corresponding end-of-game GameHUD elements
      if (amLoser) {
        const lossEl = document.getElementById('lossIndicator');
        if (lossEl) lossEl.style.display = 'flex';
      }
      if (amWinner) {
        const winEl = document.getElementById('winIndicator');
        if (winEl) winEl.style.display = 'flex';
      }

      const opponentsTurnEl = document.getElementById('opponentsTurn');
      const lobbyEl = document.getElementById('lobbyIndicator');
      const tileSelectedEl = document.getElementById('tileSelected');
      const tileTargetedEl = document.getElementById('tileTargeted');
      const arrowIcon = document.querySelector('#gameHUD > i.fa-arrow-right');

      if (opponentsTurnEl) opponentsTurnEl.style.display = 'none';
      if (lobbyEl) lobbyEl.style.display = 'none';
      if (tileSelectedEl) tileSelectedEl.style.display = 'none';
      if (tileTargetedEl) tileTargetedEl.style.display = 'none';
      if (arrowIcon) arrowIcon.style.display = 'none';
      if (gameHUDEl) gameHUDEl.style.pointerEvents = 'none';

    } catch (err) {
      console.warn('[game-over handler] error', err);
    }
  });

  // Listens for a 'turn' socket and checks if game-over
  sock.on('turn', (t) => {
    try {
      if (t && t.gameOver) {
        window._gameStarted = false;
        window._gameOver = true;
        window._lastKnownTurn = null;
        window._isMyTurn = false;
        const lobbyEl = document.getElementById('lobbyIndicator');
        const opponentsTurnEl = document.getElementById('opponentsTurn');
        if (lobbyEl) lobbyEl.style.display = 'none';
        if (opponentsTurnEl) opponentsTurnEl.style.display = 'none';
        return;
      }

      window._lastKnownTurn = t && typeof t.playerNumber === 'number' ? t.playerNumber : null;
      window._isMyTurn = (window._lastKnownTurn === window._playerNumber);

      // Ensure lobby/waiting flag active if game hasnt started OR game hasnt ended
      if (!window._gameOver) {
        window._gameStarted = !!(t && typeof t.playerNumber === 'number');
      }
    } catch (err) {
      console.warn('[turn handler] error', err);
    }
  });
}

const socket = (typeof io === 'function') ? io() : null;
if (!socket) console.warn('socket.io client not found; include /socket.io/socket.io.js');
registerGameSocketHandlers(socket);

window._playerNumber = null;
window._boardReady = false;
window._boardCenter = null;

// Applies different camera position for corresponding camera
socket?.on('player-number', (n) => {
  console.log('player-number event received', n);
  window._playerNumber = n;
  if (window._boardReady) applyCameraPreset(n === 1 ? camera_pos_p1 : camera_pos_p2);
});

// Handle server's "start-game"
socket?.on('start-game', (data) => {
  console.log('start-game received', data);
  if (window._playerNumber === 1) applyCameraPreset(camera_pos_p1);
  else if (window._playerNumber === 2) applyCameraPreset(camera_pos_p2);
  if (typeof startLocalGameLoop === 'function') startLocalGameLoop();
});

// Socket logic for connect, join, and whoami
socket?.on('connect', () => {
  console.log('socket connected', socket.id);
  const code = new URLSearchParams(location.search).get('code');

  const joinCallback = (res) => {

    console.dir(res); // Debugging

    const pn = res && (res.playerNumber ?? res.playerNum ?? res.player ?? res.role ?? null);

    // Checks Player Number
    if (typeof pn === 'number') {
      console.log('join response includes playerNumber', pn);
      window._playerNumber = pn;
      if (window._boardReady) applyCameraPreset(pn === 1 ? camera_pos_p1 : camera_pos_p2);
      return;
    }

    socket.emit('whoami', (whoRes) => {
      console.dir(whoRes);
      const wpn = whoRes && (whoRes.playerNumber ?? whoRes.player ?? null);
      if (typeof wpn === 'number') {
        window._playerNumber = wpn;
        if (window._boardReady) applyCameraPreset(wpn === 1 ? camera_pos_p1 : camera_pos_p2);
      }
    });

    // Fallback
    setTimeout(() => {
      console.log('fallback check: window._playerNumber =', window._playerNumber);
      if (window._playerNumber && window._boardReady) {
        applyCameraPreset(window._playerNumber === 1 ? camera_pos_p1 : camera_pos_p2);
      }
    }, 200);
  };

  if (code) {
    socket.emit('join', code, joinCallback);
  } else {
    socket.emit('whoami', joinCallback);
  }
});

// HUD Toggling Logic
(function () {
  const tileSelected = document.getElementById('tileSelected');
  const tileTargeted = document.getElementById('tileTargeted');
  const arrowIcon = document.querySelector('#gameHUD > i.fa-arrow-right');
  const opponentsEl = document.getElementById('lobbyIndicator');

  if (!opponentsEl || !tileSelected || !tileTargeted || !arrowIcon) {
    console.warn('HUD waiting toggle: missing elements');
    return;
  }

  const hudParts = [tileSelected, arrowIcon, tileTargeted];

  function setWaiting(show) {
    opponentsEl.style.display = show ? 'flex' : 'none';
    hudParts.forEach(el => el.style.display = show ? 'none' : 'flex');
  }
  setWaiting(true);

  // Only attach if socket exists
  if (typeof socket !== 'undefined' && socket) {
    socket.on('peer-joined', () => setWaiting(false));
    socket.on('peer-ready', () => setWaiting(false));
    socket.on('start-game', () => setWaiting(false));
    socket.on('peer-left', () => setWaiting(true));
    socket.on('game-over', () => setWaiting(false));

  } else {  // Fallback
    window._setHudWaiting = setWaiting;
  }

  window._handleJoinForWaiting = function (res) {
    const peerPresent = !!(res && (res.peerPresent || res.hasPeer || res.peerJoined || res.opponentConnected));
    if (peerPresent) setWaiting(false);
  };
})();

// Turn-handling and HUD Updates
window._isMyTurn = false;
window._gameStarted = false;
window._gameOver = false; 

const lobbyIndicatorEl = document.getElementById('lobbyIndicator');
const opponentsTurnEl = document.getElementById('opponentsTurn');
const tileSelectedEl = document.getElementById('tileSelected');
const tileTargetedEl = document.getElementById('tileTargeted');
const arrowIcon = document.querySelector('#gameHUD > i.fa-arrow-right');
const gameHUDEl = document.getElementById('gameHUD');

function updateHUDForTurn(turnPlayerNumber) {

  // If the game is finished, hiding GameHUD elements
  if (window._gameOver) {
    if (lobbyIndicatorEl) lobbyIndicatorEl.style.display = 'none';
    if (opponentsTurnEl) opponentsTurnEl.style.display = 'none';
    if (tileSelectedEl) tileSelectedEl.style.display = 'none';
    if (tileTargetedEl) tileTargetedEl.style.display = 'none';
    if (arrowIcon) arrowIcon.style.display = 'none';
    if (gameHUDEl) gameHUDEl.style.pointerEvents = 'none';
    window._isMyTurn = false;
    return;
  }

  const myNum = window._playerNumber;
  const amI = (typeof myNum === 'number') && (myNum === turnPlayerNumber);
  window._isMyTurn = !!amI;

  // Display that the player is currently waiting for the opponent to join on GameHUD
  if (!window._gameStarted) {
    if (lobbyIndicatorEl) lobbyIndicatorEl.style.display = 'flex';
    if (opponentsTurnEl) opponentsTurnEl.style.display = 'none';
    if (tileSelectedEl) tileSelectedEl.style.display = 'none';
    if (tileTargetedEl) tileTargetedEl.style.display = 'none';
    if (arrowIcon) arrowIcon.style.display = 'none';
    if (gameHUDEl) gameHUDEl.style.pointerEvents = 'none';
    return;
  }
  if (lobbyIndicatorEl) lobbyIndicatorEl.style.display = 'none';

  if (amI) {
    // It your turn - Display proper message in GameHUD
    if (opponentsTurnEl) opponentsTurnEl.style.display = 'none';
    if (tileSelectedEl) { tileSelectedEl.style.display = 'flex'; tileSelectedEl.style.opacity = '1'; }
    if (tileTargetedEl) { tileTargetedEl.style.display = 'flex'; tileTargetedEl.style.opacity = '1'; }
    if (arrowIcon) arrowIcon.style.display = 'flex';
    if (gameHUDEl) gameHUDEl.style.pointerEvents = 'auto';
  } else {
    // It is opponent's turn - Display proper message in GameHUD
    if (opponentsTurnEl) opponentsTurnEl.style.display = 'flex';
    if (tileSelectedEl) { tileSelectedEl.style.display = 'none'; tileSelectedEl.style.opacity = '0.4'; }
    if (tileTargetedEl) { tileTargetedEl.style.display = 'none'; tileTargetedEl.style.opacity = '0.4'; }
    if (arrowIcon) arrowIcon.style.display = 'none';
    if (gameHUDEl) gameHUDEl.style.pointerEvents = 'none';
  }
}

// Updates window to signal game started
socket?.on('start-game', (data) => {
  console.log('start-game received', data);
  window._gameStarted = true;
  if (typeof window._lastKnownTurn === 'number') updateHUDForTurn(window._lastKnownTurn);
});

// Listens for turn updates
socket?.on('turn', (data) => {
  console.log('turn event', data);
  window._lastKnownTurn = data.playerNumber;
  updateHUDForTurn(data.playerNumber);
});

// Socket to apply the opponent's move
socket?.on('move', (payload) => {

  const by = payload?.by;
  const move = payload?.move;

  if (!move || typeof move.from !== 'string' || typeof move.to !== 'string') return;
  if (by === window._playerNumber) return;

  // Finds the Tile and Piece
  const tilesLocal = window.tiles || window.chessTiles || [];
  const fromTile = tilesLocal.find(t => t.coord === move.from);
  const toTile = tilesLocal.find(t => t.coord === move.to);

  if (!fromTile || !toTile) {
    console.warn('[socket] move: tile not found', move);
    return;
  }
  const pieceObj = fromTile.occupant;
  if (!pieceObj) {
    console.warn('[socket] move: no piece at fromTile', move.from);
    return;
  }

  fromTile.occupant = null;
  (async () => {
    try {
      await performMove(pieceObj, fromTile, toTile, tilesLocal, window.scene);
      try { if (pieceObj && pieceObj.userData) pieceObj.userData.hasMoved = true; } catch (e) { }
    } catch (err) {
      console.warn('[socket] performMove error', err);
    }
  })();
});

// Socket Diagnostics
socket?.on('disconnect', (reason) => console.log('socket disconnected', reason));
socket?.on('peer-joined', (d) => console.log('peer-joined', d));
socket?.on('peer-ready', (d) => console.log('peer-ready', d));
socket?.on('peer-left', (d) => console.log('peer-left', d));

// Initialization
loadResourcesAndTiles(
  loader,
  '../assets/models/chess-board.glb',
  '../assets/models/pawn.glb',
  '../assets/models/rook.glb',
  '../assets/models/bishop.glb',
  '../assets/models/queen.glb',
  '../assets/models/king.glb',
  '../assets/models/knight.glb',
  scene
)
  .then(({ board, tiles }) => {
    const composedBox = new THREE.Box3().setFromObject(board);
    scene.traverse(o => { if (o.isMesh || o.isGroup) composedBox.union(new THREE.Box3().setFromObject(o)); });
    const center = composedBox.getCenter(new THREE.Vector3());
    const size = composedBox.getSize(new THREE.Vector3()).length();
    const dist = Math.max(1.0, size * 0.9);
    window._boardCenter = center.clone();
    window._boardReady = true;

    // Auto-center Camera Fallback
    camera.position.set(center.x + dist, center.y + dist * 0.6, center.z + dist);
    controls.target.copy(center);
    controls.update();

    if (window._playerNumber === 1) {
      applyCameraPreset(camera_pos_p1);
    } else if (window._playerNumber === 2) {
      applyCameraPreset(camera_pos_p2);
    } else if (window._cameraPreset instanceof THREE.Vector3) {
      camera.position.copy(window._cameraPreset);
    }

    const logger = setupTileClickLogger(tiles, scene, camera, renderer.domElement);
    window._tileLogger = logger;

    // Selection UI Instance
    try {
      const playerColor = (window._playerNumber === 2) ? 'black' : 'white';
      window._selectionUIHandle = setupSelectionUI({
        tiles,
        scene,
        camera,
        domElement: renderer.domElement,
        playerColor
      });
    } catch (e) {
      console.warn('Failed to initialize selection UI', e);
    }

    // Ready Handshake
    const code = new URLSearchParams(location.search).get('code');
    const signalReady = () => {
      if (!socket || !code) return;
      socket.emit('ready', code, (ack) => {
        if (!ack || !ack.ok) console.warn('ready ack failed', ack);
        else console.log('ready acknowledged by server');
      });
    };
    setTimeout(signalReady, 50);

    animate();

    function cleanupAll() {
      // dispose selection UI if present
      if (window._selectionUIHandle && typeof window._selectionUIHandle.dispose === 'function') {
        try { window._selectionUIHandle.dispose(); } catch (e) { console.warn('selectionUI dispose failed', e); }
        window._selectionUIHandle = null;
      }

      // dispose tile click logger if present
      if (window._tileLogger && typeof window._tileLogger.dispose === 'function') {
        try { window._tileLogger.dispose(); } catch (e) { console.warn('tileLogger dispose failed', e); }
        window._tileLogger = null;
      }

      // remove any global socket listeners to avoid leaks
      try {
        if (typeof socket !== 'undefined' && socket && typeof socket.removeAllListeners === 'function') {
          socket.removeAllListeners();
        }
      } catch (e) { console.warn('socket cleanup failed', e); }

      // clear all window states
      window._boardReady = false;
      window._boardCenter = null;
    }

    // call cleanup on page unload and navigation
    window.addEventListener('beforeunload', cleanupAll);

    // cleanupAll();
  })
  .catch(console.error);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}