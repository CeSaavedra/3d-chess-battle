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

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.001, 500);
camera.position.set(1.5, 1.5, 1.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const dir = new THREE.DirectionalLight(0xffffff, 2);
scene.add(dir);
scene.background = new THREE.Color(0x000000);

const loader = new GLTFLoader();

// call this after you have `tiles`, `scene`, `camera`, and `renderer.domElement`
// ---- Piece factory and placement helpers ----
function createPieceObject({ type, color, id, gltf, materialTemplate = null }) {
  const root = new THREE.Object3D();
  root.name = `${color}_${type}_${id}`;

  root.userData = {
    id,
    type,            // 'pawn','rook','knight','bishop','queen','king'
    color,           // 'white' or 'black'
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
  const tile = tiles.find(t => t.coord === coord);
  if (!tile) throw new Error('tile not found ' + coord);

  // update piece state and world transform
  pieceObj.userData.coord = coord;
  pieceObj.position.set(tile.center.x, tile.topY, tile.center.z);
  pieceObj.updateMatrixWorld(true);

  // scene and bookkeeping
  sceneRef.add(pieceObj);

  // handle capture if tile occupied
  if (tile.occupant && tile.occupant !== pieceObj) {
    tile.occupant.userData.alive = false;
    tile.occupant.visible = false;
  }

  tile.occupant = pieceObj;
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

// ---- Tile click logger (reads tile.occupant.userData.pieceLabel) ----
function setupTileClickLogger(tiles, sceneRef, cameraRef, domElement = renderer.domElement) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let firstTile = null;
  let secondTile = null;
  const EPS = 1e-3;

  function getTileFromEvent(evt) {
    const rect = domElement.getBoundingClientRect();
    mouse.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, cameraRef);

    // Prefer to raycast only against the board if you have a reference; fall back to whole scene
    const hits = raycaster.intersectObjects(sceneRef.children, true);
    if (!hits.length) return null;
    const hitPoint = hits[0].point;

    // find nearest tile center in XZ plane
    let best = null;
    let bestDist2 = Infinity;
    for (const t of tiles) {
      const dx = hitPoint.x - t.center.x;
      const dz = hitPoint.z - t.center.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDist2) {
        bestDist2 = d2;
        best = t;
      }
    }
    return best;
  }

  function tileIsOpen(tile) {
    return !tile.occupant;
  }

  function onPointerDown(evt) {
    const tile = getTileFromEvent(evt);
    if (!tile) return;

    // first click: select an occupied tile and report piece
    if (!firstTile) {
      if (tile.occupant) {
        firstTile = tile;
        console.log(`Tile 1 active: ${firstTile.coord} — piece: ${firstTile.occupant.userData.pieceLabel}`);
      }
      return;
    }

    // second click: if open, select destination
    if (!secondTile) {
      if (tileIsOpen(tile)) {
        secondTile = tile;
        console.log(`Tile 1 and 2 active: ${firstTile.coord} and ${secondTile.coord}`);
        return;
      }
      // clicked occupied tile -> treat as selecting new firstTile
      if (tile.occupant) {
        firstTile = tile;
        console.log(`Tile 1 active: ${firstTile.coord} — piece: ${firstTile.occupant.userData.pieceLabel}`);
      } else {
        firstTile = tile;
        console.log(`Tile 1 active: ${firstTile.coord}`);
      }
      return;
    }

    // third open tile clicked: reset to new first
    if (secondTile) {
      if (tileIsOpen(tile)) {
        firstTile = tile;
        secondTile = null;
        console.log(`Tile 1 active: ${firstTile.coord}`);
        return;
      }
      // clicked occupied tile -> make it the first selected tile
      if (tile.occupant) {
        firstTile = tile;
        secondTile = null;
        console.log(`Tile 1 active: ${firstTile.coord} — piece: ${firstTile.occupant.userData.pieceLabel}`);
      } else {
        firstTile = tile;
        secondTile = null;
        console.log(`Tile 1 active: ${firstTile.coord}`);
      }
    }
  }

  domElement.addEventListener('pointerdown', onPointerDown);
  return { dispose: () => domElement.removeEventListener('pointerdown', onPointerDown) };
}

// ---- Board initialization and piece placement helpers ----
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

  // guarantee algebraic ordering A1..H8
  tiles.sort((a, b) => {
    const af = a.coord.charCodeAt(0), bf = b.coord.charCodeAt(0);
    const ar = parseInt(a.coord.slice(1), 10), br = parseInt(b.coord.slice(1), 10);
    if (af !== bf) return af - bf;
    return ar - br;
  });

  if (typeof window !== 'undefined') window.chessTiles = tiles;
  return { gameBoard, tiles, cellSizeX, cellSizeZ };
}

// Minimal compat helper similar to original placePieceAt but replaced by spawnPiece usage above
function placePieceAt(tiles, coord, gltf, sceneRef, materialTemplate, yOffset = 0.01) {
  // kept for compatibility if you prefer the old helper; this clones model and adds it to the scene
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

// Initialize pawns using spawnPiece for consistent objects (keeps original signature for ease)
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

// ---- Resource loading and full initial spawn (uses spawnPiece) ----
async function loadResourcesAndTiles(loader, boardUrl, pawnUrl, rookUrl, bishopUrl, queenUrl, kingUrl, knightUrl, sceneRef) {
  const [boardGltf, pawnGltf] = await Promise.all([
    loader.loadAsync(boardUrl),
    loader.loadAsync(pawnUrl)
  ]);

  const board = boardGltf.scene;
  sceneRef.add(board);
  board.updateMatrixWorld(true);

  const { gameBoard, tiles } = await initializeBoard(board);

  // pawns
  initializePieces(tiles, pawnGltf, sceneRef, { yOffset: 0.1 });

  // helpers for material templates
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xF5F5F5, metalness: 0.0, roughness: 0.1 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x242424, metalness: 0.0, roughness: 0.1 });

  // rooks
  try {
    const rookGltf = await loader.loadAsync(rookUrl);
    spawnPiece({ type: 'rook', color: 'white', id: 'w_r_1', gltf: rookGltf, materialTemplate: whiteMat, coord: 'A1', tiles, sceneRef });
    spawnPiece({ type: 'rook', color: 'white', id: 'w_r_2', gltf: rookGltf, materialTemplate: whiteMat, coord: 'H1', tiles, sceneRef });
    spawnPiece({ type: 'rook', color: 'black', id: 'b_r_1', gltf: rookGltf, materialTemplate: blackMat, coord: 'A8', tiles, sceneRef });
    spawnPiece({ type: 'rook', color: 'black', id: 'b_r_2', gltf: rookGltf, materialTemplate: blackMat, coord: 'H8', tiles, sceneRef });
  } catch (e) { console.error('failed to load or place rooks', e); }

  // bishops
  try {
    const bishopGltf = await loader.loadAsync(bishopUrl);
    spawnPiece({ type: 'bishop', color: 'white', id: 'w_b_1', gltf: bishopGltf, materialTemplate: whiteMat, coord: 'C1', tiles, sceneRef });
    spawnPiece({ type: 'bishop', color: 'white', id: 'w_b_2', gltf: bishopGltf, materialTemplate: whiteMat, coord: 'F1', tiles, sceneRef });
    spawnPiece({ type: 'bishop', color: 'black', id: 'b_b_1', gltf: bishopGltf, materialTemplate: blackMat, coord: 'C8', tiles, sceneRef });
    spawnPiece({ type: 'bishop', color: 'black', id: 'b_b_2', gltf: bishopGltf, materialTemplate: blackMat, coord: 'F8', tiles, sceneRef });
  } catch (e) { console.error('failed to load or place bishops', e); }

  // queens
  try {
    const queenGltf = await loader.loadAsync(queenUrl);
    spawnPiece({ type: 'queen', color: 'white', id: 'w_q_1', gltf: queenGltf, materialTemplate: whiteMat, coord: 'D1', tiles, sceneRef });
    spawnPiece({ type: 'queen', color: 'black', id: 'b_q_1', gltf: queenGltf, materialTemplate: blackMat, coord: 'D8', tiles, sceneRef });
  } catch (e) { console.error('failed to load or place queens', e); }

  // kings
  try {
    const kingGltf = await loader.loadAsync(kingUrl);
    spawnPiece({ type: 'king', color: 'white', id: 'w_k_1', gltf: kingGltf, materialTemplate: whiteMat, coord: 'E1', tiles, sceneRef });
    spawnPiece({ type: 'king', color: 'black', id: 'b_k_1', gltf: kingGltf, materialTemplate: blackMat, coord: 'E8', tiles, sceneRef });
  } catch (e) { console.error('failed to load or place kings', e); }

  // knights
  try {
    const knightGltf = await loader.loadAsync(knightUrl);

    const w_n_1 = spawnPiece({
      type: 'knight', color: 'white', id: 'w_n_1',
      gltf: knightGltf, materialTemplate: whiteMat, coord: 'B1', tiles, sceneRef
    });
    // rotate white knights 180 degrees around Y so they face the other side
    w_n_1.rotation.y = Math.PI;

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

// ---- Boot / start ----
// Call this with your loader, scene, camera, controls, renderer variables available
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
    camera.position.set(center.x + dist, center.y + dist * 0.6, center.z + dist);
    controls.target.copy(center);
    controls.update();

    // create the logger once, after tiles are available
    const logger = setupTileClickLogger(tiles, scene, camera, renderer.domElement);
    window._tileLogger = logger;

    animate();
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