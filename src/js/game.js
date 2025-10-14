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

const dir = new THREE.DirectionalLight(0xffffff, 0.7);
scene.add(dir);

scene.background = new THREE.Color(0x000B12);

const loader = new GLTFLoader();

// initializeBoard: resolves game-board mesh, builds tiles array, and places rooks
async function initializeBoard(boardRoot, pawnGltf, sceneRef, { placeDemoPawns = false, rookUrl = '../assets/models/rook.glb', rookYOffset = 0.01 } = {}) {
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

  for (let file = 0; file < 8; file++) {
    for (let rank = 0; rank < 8; rank++) {
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
        mesh: hit.object
      });

      // optional demo pawns if requested
      if (placeDemoPawns && pawnGltf && sceneRef && (rank === 1 || rank === 6)) {
        const pawnClone = pawnGltf.scene.clone(true);
        pawnClone.position.set(hitPoint.x, hitPoint.y + 0.01, hitPoint.z);
        pawnClone.updateMatrixWorld(true);
        sceneRef.add(pawnClone);
      }
    }
  }

  // place rooks for both sides using simple white/black runtime materials
  try {
    const rookGltf = await loader.loadAsync(rookUrl);

    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xF5F5F5, metalness: 0.0, roughness: 0.1 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x242424, metalness: 0.0, roughness: 0.1 });

    const placeRookAt = (square, mat) => {
      const tile = tiles.find(t => t.coord === square);
      if (!tile) return console.warn('rook placement tile not found:', square);
      const rookClone = rookGltf.scene.clone(true);
    
      // ensure each mesh receives its own cloned, opaque material
      rookClone.traverse(node => {
        if (!node.isMesh) return;
        if (Array.isArray(node.material)) {
          node.material = node.material.map(() => {
            const m = mat.clone();
            m.transparent = false;
            m.depthWrite = true;
            m.side = THREE.DoubleSide;
            m.needsUpdate = true;
            return m;
          });
        } else {
          const m = mat.clone();
          m.transparent = false;
          m.depthWrite = true;
          m.side = THREE.DoubleSide;
          m.needsUpdate = true;
          node.material = m;
        }
      });
    
      rookClone.position.set(tile.center.x, tile.topY + rookYOffset, tile.center.z);
      rookClone.updateMatrixWorld(true);
      sceneRef.add(rookClone);
    };

    // white rooks on A1 and H1
    placeRookAt('A1', whiteMat);
    placeRookAt('H1', whiteMat);

    // black rooks on A8 and H8
    placeRookAt('A8', blackMat);
    placeRookAt('H8', blackMat);
  } catch (e) {
    console.error('failed to load or place rooks', e);
  }

  if (typeof window !== 'undefined') window.chessTiles = tiles;
  return { gameBoard, tiles };
}

// initializePieces: place white pawns on rank 2 and black pawns on rank 7
function initializePieces(tiles, pawnGltf, sceneRef, { yOffset = 0.00 } = {}) {
  if (!tiles || !pawnGltf || !sceneRef) {
    console.error('initializePieces missing arguments');
    return;
  }

  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xF5F5F5, metalness: 0.0, roughness: 0.1 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x242424, metalness: 0.0, roughness: 0.1 });

  function applyMaterialToClone(pawnClone, materialTemplate) {
    pawnClone.traverse(node => {
      if (!node.isMesh) return;
      if (Array.isArray(node.material)) {
        node.material = node.material.map(() => materialTemplate.clone());
      } else {
        node.material = materialTemplate.clone();
      }
      if (Array.isArray(node.material)) node.material.forEach(m => m.needsUpdate = true);
      else node.material.needsUpdate = true;
    });
  }

  const spawnPawn = (coord, template) => {
    const tile = tiles.find(t => t.coord === coord);
    if (!tile) {
      console.warn('initializePieces tile not found:', coord);
      return null;
    }
    const pawnClone = pawnGltf.scene.clone(true);
    applyMaterialToClone(pawnClone, template);
    pawnClone.position.set(tile.center.x, tile.topY + yOffset, tile.center.z);
    pawnClone.updateMatrixWorld(true);
    sceneRef.add(pawnClone);
    return pawnClone;
  };

  for (let f = 0; f < 8; f++) {
    const fileLetter = String.fromCharCode('A'.charCodeAt(0) + f);
    spawnPawn(`${fileLetter}2`, whiteMat);
  }

  for (let f = 0; f < 8; f++) {
    const fileLetter = String.fromCharCode('A'.charCodeAt(0) + f);
    spawnPawn(`${fileLetter}7`, blackMat);
  }
}

// load resources, attach board, run initializeBoard, then initializePieces
async function loadResourcesAndTiles(loader, boardUrl, pawnUrl, sceneRef) {
  const [boardGltf, pawnGltf] = await Promise.all([
    loader.loadAsync(boardUrl),
    loader.loadAsync(pawnUrl)
  ]);

  const board = boardGltf.scene;
  sceneRef.add(board);
  board.updateMatrixWorld(true);

  const { gameBoard, tiles } = await initializeBoard(board, pawnGltf, sceneRef, { placeDemoPawns: false });

  initializePieces(tiles, pawnGltf, sceneRef);

  return { boardGltf, pawnGltf, board, gameBoard, tiles };
}

// start
loadResourcesAndTiles(loader, '../assets/models/chess-board.glb', '../assets/models/pawn.glb', scene)
  .then(({ board, gameBoard, tiles, pawnGltf }) => {
    const composedBox = new THREE.Box3().setFromObject(board);
    scene.traverse(o => { if (o.isMesh || o.isGroup) composedBox.union(new THREE.Box3().setFromObject(o)); });
    const center = composedBox.getCenter(new THREE.Vector3());
    const size = composedBox.getSize(new THREE.Vector3()).length();
    const dist = Math.max(1.0, size * 0.9);
    camera.position.set(center.x + dist, center.y + dist * 0.6, center.z + dist);
    controls.target.copy(center);
    controls.update();

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