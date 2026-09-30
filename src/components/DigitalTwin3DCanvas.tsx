import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { 
  Layers, 
  Maximize2, 
  Minimize2, 
  Eye, 
  Play, 
  Pause, 
  RotateCcw, 
  Sliders, 
  Wind, 
  Waves, 
  Activity, 
  Info,
  Radio,
  Zap,
  MapPin,
  Compass,
  Database
} from 'lucide-react';
import { WaterBasin, IoTBuoy, ActuatorDevice, SpectralLayerConfig, SpectralLayerType } from '../types';
import { SPECTRAL_LAYERS } from '../data/mockData';

export const BLOOM_PARTICLE_COUNT = 2400;

let cachedAlgaeColonyTexture: THREE.CanvasTexture | null = null;
export function getAlgaeColonyTexture(): THREE.CanvasTexture {
  if (cachedAlgaeColonyTexture) return cachedAlgaeColonyTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(240, 255, 215, 0.98)');
  grad.addColorStop(0.25, 'rgba(163, 230, 53, 0.92)');
  grad.addColorStop(0.55, 'rgba(34, 197, 94, 0.82)');
  grad.addColorStop(0.82, 'rgba(16, 185, 129, 0.42)');
  grad.addColorStop(1, 'rgba(6, 78, 59, 0.0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();

  // Internal colonial Microcystis cells
  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.beginPath();
  ctx.arc(26, 25, 3.2, 0, Math.PI * 2);
  ctx.arc(38, 28, 3.8, 0, Math.PI * 2);
  ctx.arc(30, 38, 3.0, 0, Math.PI * 2);
  ctx.fill();

  cachedAlgaeColonyTexture = new THREE.CanvasTexture(canvas);
  return cachedAlgaeColonyTexture;
}

interface DigitalTwin3DCanvasProps {
  basin: WaterBasin;
  buoys: IoTBuoy[];
  actuators: ActuatorDevice[];
  selectedBuoy?: IoTBuoy | null;
  onSelectBuoy?: (buoy: IoTBuoy | null) => void;
  selectedActuator?: ActuatorDevice | null;
  onSelectActuator?: (actuator: ActuatorDevice | null) => void;
  activeLayer?: SpectralLayerType;
  selectedLayer?: SpectralLayerType;
  onSelectLayer?: (layer: SpectralLayerType) => void;
  timeOffsetHours?: number;
  selectedHour?: number;
  onTimeChange?: (hours: number) => void;
  onSelectHour?: (hours: number) => void;
  simulatedTempOffset?: number;
  simulatedPO4Offset?: number;
  simulatedAeratorPower?: number;
}

export const DigitalTwin3DCanvas: React.FC<DigitalTwin3DCanvasProps> = ({
  basin,
  buoys,
  actuators,
  selectedBuoy = null,
  onSelectBuoy,
  selectedActuator = null,
  onSelectActuator,
  activeLayer,
  selectedLayer,
  onSelectLayer,
  timeOffsetHours,
  selectedHour,
  onTimeChange,
  onSelectHour,
  simulatedTempOffset = 0,
  simulatedPO4Offset = 0,
  simulatedAeratorPower = 85
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isPlayingTimeline, setIsPlayingTimeline] = useState(false);
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<'PERSPECTIVE' | 'TOP_DOWN' | 'SHORE' | 'THERMOCLINE'>('PERSPECTIVE');
  
  const currentLayer: SpectralLayerType = activeLayer || selectedLayer || 'CHLOROPHYLL_A';
  const currentTimeOffset: number = typeof timeOffsetHours === 'number' ? timeOffsetHours : (typeof selectedHour === 'number' ? selectedHour : 0);
  // Memoizada: sin esto el efecto del timeline la ve cambiar en cada render y
  // destruye/recrea su setInterval continuamente.
  const handleTimeChange = useCallback((hours: number) => {
    if (onTimeChange) onTimeChange(hours);
    if (onSelectHour) onSelectHour(hours);
  }, [onTimeChange, onSelectHour]);
  const handleSelectLayer = (layer: SpectralLayerType) => {
    if (onSelectLayer) onSelectLayer(layer);
  };
  const handleSelectBuoy = (buoy: IoTBuoy | null) => {
    if (onSelectBuoy) onSelectBuoy(buoy);
  };
  const handleSelectActuator = (actuator: ActuatorDevice | null) => {
    if (onSelectActuator) onSelectActuator(actuator);
  };

  // Toggles for 3D visibility
  const [showBathymetry, setShowBathymetry] = useState(true);
  const [showSatelliteHeatmap, setShowSatelliteHeatmap] = useState(true);
  const [showBloomParticles, setShowBloomParticles] = useState(true);
  const [showCurrentVectors, setShowCurrentVectors] = useState(true);
  const [showBuoys, setShowBuoys] = useState(true);
  const [showActuators, setShowActuators] = useState(true);
  const [webGLError, setWebGLError] = useState<string | null>(null);

  // References to keep Three.js animation and objects in sync without re-mounting canvas
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const waterMeshRef = useRef<THREE.Mesh | null>(null);
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const bloomParticlesRef = useRef<THREE.Points | null>(null);
  const vectorArrowsRef = useRef<THREE.Group | null>(null);
  const buoyMarkersRef = useRef<Map<string, THREE.Group>>(new Map());
  const actuatorMarkersRef = useRef<Map<string, THREE.Group>>(new Map());
  const bubbleParticlesRef = useRef<THREE.Points | null>(null);
  const animationFrameId = useRef<number | null>(null);

  // Estado de órbita de la cámara: única fuente de verdad.
  // Vive en un ref (y no en una variable local del efecto de init) para que los
  // presets y el foco en boya puedan escribir en él. Antes escribían
  // directamente en camera.position, y el siguiente arrastre del ratón —que
  // recalcula la posición desde este estado— deshacía el cambio de golpe.
  const rigRef = useRef({ radius: 24, theta: Math.PI / 4, phi: Math.PI / 3.2, targetY: -1 });
  const updateCameraRef = useRef<(() => void) | null>(null);

  const activeLayerConfig = useMemo(() => {
    return SPECTRAL_LAYERS.find(l => l.id === currentLayer) || SPECTRAL_LAYERS[0];
  }, [currentLayer]);

  const basinEnv = useMemo(() => {
    if (basin.id === 'basin-fcr') {
      return {
        wind: '3.2 km/h SSE',
        stratification: 'Fuerte (ΔT=7.2°C)',
        coveName: 'Station 20 / Deep Hole'
      };
    }
    if (basin.id === 'basin-san-roque') {
      return {
        wind: '6.1 km/h S',
        stratification: 'Fuerte (ΔT=8.2°C)',
        coveName: 'Bahía San Antonio'
      };
    }
    if (basin.id === 'basin-titicaca-puno') {
      return {
        wind: '8.5 km/h NE',
        stratification: 'Débil Polimíctico (ΔT=1.4°C)',
        coveName: 'Río Seco / Malecón'
      };
    }
    return {
      wind: '26.5 km/h WNW',
      stratification: 'Moderada (ΔT=3.8°C)',
      coveName: 'Torre de Toma'
    };
  }, [basin.id]);

  // Timeline auto-play timer
  useEffect(() => {
    let interval: any;
    if (isPlayingTimeline) {
      interval = setInterval(() => {
        handleTimeChange(currentTimeOffset >= 72 ? -24 : currentTimeOffset + 6);
      }, 1200);
    }
    return () => clearInterval(interval);
  }, [isPlayingTimeline, currentTimeOffset, handleTimeChange]);

  // Main Three.js Initialization
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    try {
      // Dimensions with safe non-zero fallback
      const width = Math.max(200, container.clientWidth || container.parentElement?.clientWidth || 800);
      const height = Math.max(200, container.clientHeight || container.parentElement?.clientHeight || 580);

      // 1. Scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a1120);
      scene.fog = new THREE.FogExp2(0x0a1120, 0.025);
      sceneRef.current = scene;

      // 2. Camera
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.set(12, 14, 18);
      camera.lookAt(0, -1, 0);
      cameraRef.current = camera;

      // 3. Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      // three r185 retiró PCFSoftShadowMap y lo degradaba a PCFShadowMap con un
      // aviso en consola. Se declara el tipo real para no depender del respaldo.
      renderer.shadowMap.type = THREE.PCFShadowMap;
      rendererRef.current = renderer;
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xdff0ff, 0.85);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffbe6, 1.6);
    sunLight.position.set(20, 30, 15);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.bias = -0.0005;
    // La cámara de sombra por defecto de una DirectionalLight cubre ±5 unidades,
    // pero el terreno mide 24×20: sin ajustarla, las sombras salían recortadas
    // o directamente no se veían.
    sunLight.shadow.camera.left = -18;
    sunLight.shadow.camera.right = 18;
    sunLight.shadow.camera.top = 18;
    sunLight.shadow.camera.bottom = -18;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 80;
    sunLight.shadow.camera.updateProjectionMatrix();
    scene.add(sunLight);

    const blueRimLight = new THREE.DirectionalLight(0x00a8ff, 0.6);
    blueRimLight.position.set(-15, 10, -15);
    scene.add(blueRimLight);

    // 5. Grid Helper & Axis Coordinate Reference
    const grid = new THREE.GridHelper(30, 30, 0x1e3a8a, 0x0f2452);
    grid.position.y = -4.0;
    scene.add(grid);

    // 6. 3D Terrain / Bathymetry Mesh
    // Procedural terrain with a deep basin canyon, shallow bays, and shoreline topography
    const terrainGeo = new THREE.PlaneGeometry(24, 20, 80, 80);
    terrainGeo.rotateX(-Math.PI / 2);

    const pos = terrainGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const depth = calculateBasinDepth(basin.id, x, z, basin.maxDepthMeters);
      pos.setY(i, depth);
    }
    terrainGeo.computeVertexNormals();

    // Bathymetry Material with depth color shading
    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0x172554,
      roughness: 0.85,
      metalness: 0.15,
      wireframe: false,
      flatShading: true,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);
    terrainMeshRef.current = terrainMesh;

    // 7. Water Surface Mesh with Custom Dynamic Texture & Shader simulation
    const waterGeo = new THREE.PlaneGeometry(21, 17, 70, 70);
    waterGeo.rotateX(-Math.PI / 2);
    
    // Dynamic Texture generation based on Satellite Layer (1024x1024 High-Res Organic Bloom)
    const canvasTexture = document.createElement('canvas');
    canvasTexture.width = 1024;
    canvasTexture.height = 1024;
    const ctx = canvasTexture.getContext('2d')!;
    drawSpectralHeatmap(ctx, basin, buoys, currentLayer, currentTimeOffset, simulatedTempOffset, simulatedPO4Offset);

    const waterTexture = new THREE.CanvasTexture(canvasTexture);
    waterTexture.wrapS = THREE.ClampToEdgeWrapping;
    waterTexture.wrapT = THREE.ClampToEdgeWrapping;

    const waterMat = new THREE.MeshPhysicalMaterial({
      map: waterTexture,
      transparent: true,
      opacity: 0.92,
      roughness: 0.16,
      metalness: 0.08,
      transmission: 0.45,
      ior: 1.333, // Water refractive index
      specularColor: new THREE.Color(0xa7f3d0), // Subtle emerald specular reflection
      side: THREE.DoubleSide,
    });

    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.y = 0.0;
    waterMesh.receiveShadow = true;
    scene.add(waterMesh);
    waterMeshRef.current = waterMesh;

    // 8. 3D Algae Bloom Particle Cloud (Cyanobacteria colonies volume)
    const particleCount = BLOOM_PARTICLE_COUNT;
    const particleGeo = new THREE.BufferGeometry();
    const { positions: particlePositions, colors: particleColors, sizes: particleSizes } = generateBloomParticles(basin.id, buoys, particleCount);

    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
    particleGeo.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));

    const colonyTexture = getAlgaeColonyTexture();

    const particleMat = new THREE.PointsMaterial({
      size: 0.45,
      map: colonyTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    const bloomParticles = new THREE.Points(particleGeo, particleMat);
    scene.add(bloomParticles);
    bloomParticlesRef.current = bloomParticles;

    // 9. Aerator Bubbler Particles
    const bubbleCount = 350;
    const bubbleGeo = new THREE.BufferGeometry();
    const bubblePositions = new Float32Array(bubbleCount * 3);
    const activeAerator = actuators.find(a => a.type === 'AERATOR') || { gridX: 2.2, gridZ: 2.0 };
    for (let i = 0; i < bubbleCount; i++) {
      bubblePositions[i * 3] = activeAerator.gridX + (Math.random() - 0.5) * 1.2;
      bubblePositions[i * 3 + 1] = -3.2 + Math.random() * 3.2;
      bubblePositions[i * 3 + 2] = activeAerator.gridZ + (Math.random() - 0.5) * 1.2;
    }
    bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bubblePositions, 3));
    const bubbleMat = new THREE.PointsMaterial({
      size: 0.12,
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.8,
    });
    const bubbleParticles = new THREE.Points(bubbleGeo, bubbleMat);
    scene.add(bubbleParticles);
    bubbleParticlesRef.current = bubbleParticles;

    // 10. Hydrodynamic Flow Vectors tailored to basin morphology
    const vectorGroup = generateFlowVectors(basin.id);
    scene.add(vectorGroup);
    vectorArrowsRef.current = vectorGroup;

    // 11. IoT Buoys 3D Markers & Beacons
    buoyMarkersRef.current.clear();
    buoys.forEach((buoy) => {
      const buoyGroup = createBuoyGroup(buoy);
      scene.add(buoyGroup);
      buoyMarkersRef.current.set(buoy.id, buoyGroup);
    });

    // 12. Actuators 3D models
    actuatorMarkersRef.current.clear();
    actuators.forEach((act) => {
      const actGroup = createActuatorGroup(act);
      scene.add(actGroup);
      actuatorMarkersRef.current.set(act.id, actGroup);
    });

    // 13. Interactive Mouse Orbit Controls & Raycasting
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    const spherical = rigRef.current;

    const updateCameraFromSpherical = () => {
      camera.position.x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      camera.position.y = spherical.radius * Math.cos(spherical.phi);
      camera.position.z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
      camera.lookAt(0, spherical.targetY, 0);
    };
    // Se expone para que los presets y el foco en boya, que viven fuera de este
    // efecto, puedan repintar la cámara tras escribir en el rig.
    updateCameraRef.current = updateCameraFromSpherical;
    updateCameraFromSpherical();

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      spherical.theta -= deltaX * 0.006;
      // El límite superior supera π/2 a propósito: permite mirar desde debajo de
      // la lámina de agua, que es lo que necesita el preset de termoclina.
      spherical.phi = Math.max(0.12, Math.min(2.2, spherical.phi - deltaY * 0.006));

      updateCameraFromSpherical();
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      spherical.radius = Math.max(8, Math.min(45, spherical.radius + e.deltaY * 0.03));
      updateCameraFromSpherical();
    };

    // Raycast on Click to select buoy
    const raycaster = new THREE.Raycaster();
    const mouseVector = new THREE.Vector2();

    const handleClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseVector.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseVector.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouseVector, camera);
      
      // Un solo raycast contra todo lo seleccionable, y gana el más cercano.
      // Antes se lanzaba uno por cada grupo de boya y los actuadores no se
      // comprobaban en absoluto, así que no eran clicables pese a estar
      // cableados desde App.tsx.
      const seleccionables: THREE.Object3D[] = [];
      buoyMarkersRef.current.forEach((g) => seleccionables.push(g));
      actuatorMarkersRef.current.forEach((g) => seleccionables.push(g));

      const intersects = raycaster.intersectObjects(seleccionables, true);
      if (intersects.length === 0) return;

      // Subir por la jerarquía hasta el grupo raíz, que es el que lleva la marca
      let nodo: THREE.Object3D | null = intersects[0].object;
      while (nodo && !nodo.userData?.pickId) nodo = nodo.parent;
      if (!nodo) return;

      const pickKind = nodo.userData.pickKind as string;
      const pickId = nodo.userData.pickId as string;

      if (pickKind === 'buoy') {
        const found = buoys.find(b => b.id === pickId);
        if (found) handleSelectBuoy(found);
      } else if (pickKind === 'actuator') {
        const found = actuators.find(a => a.id === pickId);
        if (found) handleSelectActuator(found);
      }
    };

    // Soporte táctil: un dedo rota, dos dedos hacen zoom (pellizco).
    // Sin esto la escena 3D es completamente inmanipulable en móvil y tablet,
    // porque solo había listeners de ratón.
    let distanciaPellizco = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging = true;
        previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        distanciaPellizco = Math.hypot(dx, dy);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && isDragging) {
        e.preventDefault();
        const deltaX = e.touches[0].clientX - previousMousePosition.x;
        const deltaY = e.touches[0].clientY - previousMousePosition.y;
        spherical.theta -= deltaX * 0.006;
        spherical.phi = Math.max(0.12, Math.min(2.2, spherical.phi - deltaY * 0.006));
        updateCameraFromSpherical();
        previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distancia = Math.hypot(dx, dy);
        if (distanciaPellizco > 0) {
          const factor = distanciaPellizco / Math.max(distancia, 1);
          spherical.radius = Math.max(8, Math.min(45, spherical.radius * factor));
          updateCameraFromSpherical();
        }
        distanciaPellizco = distancia;
      }
    };

    const handleTouchEnd = () => {
      isDragging = false;
      distanciaPellizco = 0;
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('click', handleClick);
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);

    // 14. Render Animation Loop
    // THREE.Clock quedó obsoleto en r185 a favor de THREE.Timer.
    const timer = new THREE.Timer();

    const animate = () => {
      animationFrameId.current = requestAnimationFrame(animate);
      timer.update();
      const elapsedTime = timer.getElapsed();

      // Animate water subtle surface ripple
      if (waterMeshRef.current) {
        const posAttr = waterMeshRef.current.geometry.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
          const u = posAttr.getX(i);
          const v = posAttr.getZ(i);
          const wave = Math.sin(u * 1.2 + elapsedTime * 1.8) * 0.038 + Math.cos(v * 1.4 + elapsedTime * 1.5) * 0.032 + Math.sin((u + v) * 2.2 + elapsedTime * 2.0) * 0.012;
          posAttr.setY(i, wave);
        }
        posAttr.needsUpdate = true;
      }

      // Animate Algae Bloom particle cloud drift with organic colonial turbulence
      if (bloomParticlesRef.current) {
        const pPos = bloomParticlesRef.current.geometry.attributes.position;
        for (let i = 0; i < BLOOM_PARTICLE_COUNT; i++) {
          let px = pPos.getX(i);
          let py = pPos.getY(i);
          let pz = pPos.getZ(i);
          // Organic colonial drift & Brownian swirling
          const angle = elapsedTime * 0.35 + i * 0.12;
          px += Math.sin(angle) * 0.0020;
          pz += Math.cos(angle) * 0.0016;
          // Gentle surface bobbing in photic zone
          py = -0.04 - Math.abs(Math.sin(elapsedTime * 0.7 + i * 0.25)) * 0.10;

          pPos.setX(i, px);
          pPos.setY(i, py);
          pPos.setZ(i, pz);
        }
        pPos.needsUpdate = true;
      }

      // Animate Bubble Aeration column
      if (bubbleParticlesRef.current) {
        const bPos = bubbleParticlesRef.current.geometry.attributes.position;
        for (let i = 0; i < bubbleCount; i++) {
          let py = bPos.getY(i) + 0.04;
          if (py > 0.1) py = -3.2;
          bPos.setY(i, py);
        }
        bPos.needsUpdate = true;
      }

      // Animate Buoy Beacon Rings & Ultrasonic wave rings
      buoyMarkersRef.current.forEach((group) => {
        const ring = group.getObjectByName('pulseRing') as THREE.Mesh;
        if (ring) {
          const cycle = (elapsedTime * 1.6) % 1.0;
          const scale = 1.0 + cycle * 0.75;
          ring.scale.set(scale, scale, scale);
          const mat = ring.material as THREE.MeshBasicMaterial;
          if (mat) {
            mat.opacity = Math.max(0, (1.0 - cycle) * 0.35);
          }
        }
      });

      actuatorMarkersRef.current.forEach((group) => {
        const rotor = group.getObjectByName('actRotor');
        if (rotor) rotor.rotation.y += 0.08;

        const wave = group.getObjectByName('ultrasonicWave') as THREE.Mesh;
        if (wave) {
          const waveScale = 1.0 + ((elapsedTime * 2.0) % 2.5);
          wave.scale.set(waveScale, waveScale, waveScale);
          (wave.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.7 - waveScale * 0.25);
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    // Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries[0] || !container || !camera || !renderer) return;
      const newWidth = Math.max(200, container.clientWidth);
      const newHeight = Math.max(200, container.clientHeight);
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    });
    resizeObserver.observe(container);

    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      resizeObserver.disconnect();
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('click', handleClick);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);

      // Liberar la GPU. Antes solo se llamaba a renderer.dispose(), así que
      // geometrías, materiales y texturas quedaban retenidos, y sobre todo el
      // <canvas> nunca se quitaba del DOM: con StrictMode, que monta el efecto
      // dos veces, quedaban dos lienzos apilados y dos bucles de render vivos.
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const materiales = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materiales.forEach((mat) => {
          if (!mat) return;
          Object.values(mat).forEach((valor) => {
            if (valor instanceof THREE.Texture) valor.dispose();
          });
          mat.dispose();
        });
      });
      scene.clear();

      buoyMarkersRef.current.clear();
      actuatorMarkersRef.current.clear();
      updateCameraRef.current = null;

      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
    } catch (err: any) {
      console.error('WebGL 3D Context Init Error:', err);
      setWebGLError(err?.message || 'Error inicializando WebGL');
    }
    // La escena se construye una sola vez. Antes dependía de [basin], así que
    // cambiar de embalse la reconstruía entera y fugaba la anterior; los datos
    // de boyas y actuadores no varían por embalse, de modo que no hay nada que
    // rehacer. Los cambios de capa, tiempo y visibilidad se aplican en los
    // efectos de abajo, mutando la escena ya existente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update Basin 3D Morphometry, Buoys, Actuators, Bloom Cloud, and Vectors on Basin or Sensor Data change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // 1. Morph terrain mesh to the new basin bathymetry DEM
    if (terrainMeshRef.current) {
      const pos = terrainMeshRef.current.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const depth = calculateBasinDepth(basin.id, x, z, basin.maxDepthMeters);
        pos.setY(i, depth);
      }
      pos.needsUpdate = true;
      terrainMeshRef.current.geometry.computeVertexNormals();
    }

    // 2. Re-create / reposition IoT Buoy 3D markers
    buoyMarkersRef.current.forEach((g) => scene.remove(g));
    buoyMarkersRef.current.clear();
    buoys.forEach((buoy) => {
      const group = createBuoyGroup(buoy);
      group.visible = showBuoys;
      scene.add(group);
      buoyMarkersRef.current.set(buoy.id, group);
    });

    // 3. Re-create / reposition Actuator 3D devices
    actuatorMarkersRef.current.forEach((g) => scene.remove(g));
    actuatorMarkersRef.current.clear();
    actuators.forEach((act) => {
      const group = createActuatorGroup(act);
      group.visible = showActuators;
      scene.add(group);
      actuatorMarkersRef.current.set(act.id, group);
    });

    // 4. Update Cyanobacteria Bloom Particle Cloud
    if (bloomParticlesRef.current) {
      const { positions, colors, sizes } = generateBloomParticles(basin.id, buoys, BLOOM_PARTICLE_COUNT);
      const posAttr = bloomParticlesRef.current.geometry.attributes.position;
      const colAttr = bloomParticlesRef.current.geometry.attributes.color;
      const sizeAttr = bloomParticlesRef.current.geometry.attributes.size;
      for (let i = 0; i < BLOOM_PARTICLE_COUNT * 3; i++) {
        (posAttr.array as Float32Array)[i] = positions[i];
        (colAttr.array as Float32Array)[i] = colors[i];
      }
      if (sizeAttr && sizes) {
        for (let i = 0; i < BLOOM_PARTICLE_COUNT; i++) {
          (sizeAttr.array as Float32Array)[i] = sizes[i];
        }
        sizeAttr.needsUpdate = true;
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }

    // 5. Update Hydrodynamic Flow Vectors
    if (vectorArrowsRef.current) {
      scene.remove(vectorArrowsRef.current);
    }
    const newVectors = generateFlowVectors(basin.id);
    newVectors.visible = showCurrentVectors;
    scene.add(newVectors);
    vectorArrowsRef.current = newVectors;

    // 6. Update Bubble Aerator position
    if (bubbleParticlesRef.current) {
      const activeAerator = actuators.find(a => a.type === 'AERATOR') || { gridX: 2.2, gridZ: 2.0 };
      const bPos = bubbleParticlesRef.current.geometry.attributes.position;
      for (let i = 0; i < 350; i++) {
        bPos.setXYZ(
          i,
          activeAerator.gridX + (Math.random() - 0.5) * 1.2,
          -3.2 + Math.random() * 3.2,
          activeAerator.gridZ + (Math.random() - 0.5) * 1.2
        );
      }
      bPos.needsUpdate = true;
    }

    // 7. Update Spectral Heatmap Texture (1024x1024 Organic Bloom)
    if (waterMeshRef.current) {
      try {
        const canvasTexture = document.createElement('canvas');
        canvasTexture.width = 1024;
        canvasTexture.height = 1024;
        const ctx = canvasTexture.getContext('2d');
        if (ctx) {
          drawSpectralHeatmap(ctx, basin, buoys, currentLayer, currentTimeOffset, simulatedTempOffset, simulatedPO4Offset);
          const newTex = new THREE.CanvasTexture(canvasTexture);
          newTex.wrapS = THREE.ClampToEdgeWrapping;
          newTex.wrapT = THREE.ClampToEdgeWrapping;
          const mat = waterMeshRef.current.material as THREE.MeshPhysicalMaterial;
          mat.map = newTex;
          mat.needsUpdate = true;
        }
      } catch (e) {
        console.warn('Error updating spectral heatmap texture on basin transition:', e);
      }
    }
  }, [basin.id, buoys, actuators, showBuoys, showActuators, showCurrentVectors, currentLayer, currentTimeOffset, simulatedTempOffset, simulatedPO4Offset]);

  // Update Dynamic Spectral Layer Heatmap Texture on activeLayer or time change
  useEffect(() => {
    if (!waterMeshRef.current) return;
    try {
      const canvasTexture = document.createElement('canvas');
      canvasTexture.width = 1024;
      canvasTexture.height = 1024;
      const ctx = canvasTexture.getContext('2d');
      if (!ctx) return;
      drawSpectralHeatmap(ctx, basin, buoys, currentLayer, currentTimeOffset, simulatedTempOffset, simulatedPO4Offset);

      const newTex = new THREE.CanvasTexture(canvasTexture);
      newTex.wrapS = THREE.ClampToEdgeWrapping;
      newTex.wrapT = THREE.ClampToEdgeWrapping;

      const mat = waterMeshRef.current.material as THREE.MeshPhysicalMaterial;
      mat.map = newTex;
      mat.needsUpdate = true;
    } catch (e) {
      console.warn('Error updating spectral heatmap texture:', e);
    }
  }, [basin, buoys, currentLayer, currentTimeOffset, simulatedTempOffset, simulatedPO4Offset]);

  // Update Visibility Toggles
  useEffect(() => {
    if (terrainMeshRef.current) terrainMeshRef.current.visible = showBathymetry;
    if (waterMeshRef.current) waterMeshRef.current.visible = showSatelliteHeatmap;
    if (bloomParticlesRef.current) bloomParticlesRef.current.visible = showBloomParticles;
    if (vectorArrowsRef.current) vectorArrowsRef.current.visible = showCurrentVectors;
    buoyMarkersRef.current.forEach(g => { g.visible = showBuoys; });
    actuatorMarkersRef.current.forEach(g => { g.visible = showActuators; });
  }, [showBathymetry, showSatelliteHeatmap, showBloomParticles, showCurrentVectors, showBuoys, showActuators]);

  // Acercar la cámara a la boya seleccionada.
  // Escribe en el rig y no en camera.position: así el siguiente arrastre parte
  // de esta posición en vez de saltar de vuelta a la anterior.
  useEffect(() => {
    if (!selectedBuoy || !cameraRef.current) return;
    const rig = rigRef.current;
    rig.radius = 12;
    rig.theta = Math.atan2(selectedBuoy.gridX, selectedBuoy.gridZ);
    rig.phi = 1.15;
    rig.targetY = -1;
    updateCameraRef.current?.();
  }, [selectedBuoy]);

  // Handle Camera Presets
  // Presets de cámara expresados en coordenadas del rig.
  // Antes escribían camera.position directamente y el estado de órbita no se
  // enteraba, así que al primer arrastre la cámara volvía de golpe a la vista
  // anterior mientras el botón del preset seguía marcado como activo.
  const applyCameraPreset = (preset: 'PERSPECTIVE' | 'TOP_DOWN' | 'SHORE' | 'THERMOCLINE') => {
    setCameraPreset(preset);
    const rig = rigRef.current;

    if (preset === 'TOP_DOWN') {
      rig.radius = 30; rig.theta = 0; rig.phi = 0.14; rig.targetY = 0;
    } else if (preset === 'SHORE') {
      if (basin.id === 'basin-fcr') {
        rig.radius = 12; rig.theta = -1.9; rig.phi = 1.35; rig.targetY = -0.5;
      } else if (basin.id === 'basin-san-roque') {
        rig.radius = 13; rig.theta = -2.3; rig.phi = 1.42; rig.targetY = -0.5;
      } else if (basin.id === 'basin-titicaca-puno') {
        rig.radius = 14; rig.theta = -2.1; rig.phi = 1.38; rig.targetY = -0.5;
      } else {
        rig.radius = 13; rig.theta = 0.6; rig.phi = 1.40; rig.targetY = -0.8;
      }
    } else if (preset === 'THERMOCLINE') {
      // phi > π/2 sitúa la cámara bajo la lámina de agua
      rig.radius = 14; rig.theta = 0.8; rig.phi = 1.86; rig.targetY = -2;
    } else {
      rig.radius = 24; rig.theta = Math.PI / 4; rig.phi = Math.PI / 3.2; rig.targetY = -1;
    }

    updateCameraRef.current?.();
  };

  return (
    <div className="relative w-full h-[360px] sm:h-[480px] lg:h-[640px] rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950 shadow-2xl flex flex-col">
      {/* Top 3D Overlay Bar */}
      <div className="absolute top-2 sm:top-3 left-2 sm:left-3 right-2 sm:right-3 z-20 flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center justify-between gap-2 pointer-events-none">
        {/* Left: Basin & Layer Status HUD */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto bg-slate-900/90 backdrop-blur-md px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-slate-700/70 shadow-lg text-[10px] sm:text-xs max-w-full overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-slate-200">{basin.name}</span>
          </div>
          <span className="text-slate-500">|</span>
          <span className="text-emerald-400 font-mono font-medium flex items-center gap-1" title="Dataset in-situ observado: fcr_oapat.csv (1.960 mediciones diarias 2015-2023)">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            fcr_oapat.csv <span className="hidden md:inline text-slate-400">(1.960 obs)</span>
          </span>
          <span className="text-slate-500">|</span>
          <span className="text-cyan-400 font-mono flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" />
            {activeLayerConfig.name}
          </span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400 font-mono">
            {currentTimeOffset === 0 ? 'T0 (En Vivo)' : currentTimeOffset > 0 ? `T+${currentTimeOffset}h (IA Forecast)` : `T${currentTimeOffset}h (Satelital Pass)`}
          </span>
        </div>

        {/* Right: Camera Presets & Layer Selector Button */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Preset Buttons */}
          <div className="bg-slate-900/90 backdrop-blur-md p-1 rounded-lg border border-slate-700/70 flex flex-wrap items-center gap-1 shadow-lg text-[10px] sm:text-xs">
            <button
              onClick={() => applyCameraPreset('PERSPECTIVE')}
              className={`px-2.5 py-1 rounded transition-all font-medium ${cameraPreset === 'PERSPECTIVE' ? 'bg-cyan-600 text-white shadow' : 'text-slate-300 hover:bg-slate-800'}`}
              title="Vista Orbital 3D"
            >
              3D Orbit
            </button>
            <button
              onClick={() => applyCameraPreset('TOP_DOWN')}
              className={`px-2.5 py-1 rounded transition-all font-medium ${cameraPreset === 'TOP_DOWN' ? 'bg-cyan-600 text-white shadow' : 'text-slate-300 hover:bg-slate-800'}`}
              title="Vista Cenital Satelital"
            >
              Cenital
            </button>
            <button
              onClick={() => applyCameraPreset('SHORE')}
              className={`px-2.5 py-1 rounded transition-all font-medium ${cameraPreset === 'SHORE' ? 'bg-cyan-600 text-white shadow' : 'text-slate-300 hover:bg-slate-800'}`}
              title={`Foco en Zona Crítica (${basinEnv.coveName})`}
            >
              {basinEnv.coveName}
            </button>
            <button
              onClick={() => applyCameraPreset('THERMOCLINE')}
              className={`px-2.5 py-1 rounded transition-all font-medium ${cameraPreset === 'THERMOCLINE' ? 'bg-cyan-600 text-white shadow' : 'text-slate-300 hover:bg-slate-800'}`}
              title="Corte Batimétrico Subacuático"
            >
              Subacuático
            </button>
          </div>

          {/* Toggle Layers Menu */}
          <button
            onClick={() => setIsLayerPanelOpen(!isLayerPanelOpen)}
            className={`p-2 rounded-lg border backdrop-blur-md transition-all shadow-lg text-xs flex items-center gap-1.5 ${
              isLayerPanelOpen ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-slate-900/90 border-slate-700/70 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span className="hidden sm:inline font-medium">Capas & Filtros</span>
          </button>
        </div>
      </div>

      {/* Layer Selection & 3D Objects Toggle Flyout Panel */}
      {isLayerPanelOpen && (
        <div className="absolute top-14 right-2 sm:right-3 z-30 w-[calc(100%-1rem)] sm:w-80 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-xl p-3 sm:p-4 shadow-2xl text-xs space-y-4 max-h-[60vh] sm:max-h-[480px] overflow-y-auto">
          <div>
            <h4 className="text-slate-200 font-semibold mb-2 flex items-center justify-between">
              <span>Capas Multiespectrales</span>
              <span className="text-[10px] text-cyan-400 uppercase tracking-wider">Sentinel-2 / Landsat</span>
            </h4>
            <div className="space-y-1">
              {SPECTRAL_LAYERS.map((layer) => (
                <button
                  key={layer.id}
                  onClick={() => handleSelectLayer(layer.id)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between transition-colors ${
                    currentLayer === layer.id
                      ? 'bg-cyan-950/80 border border-cyan-500/60 text-cyan-200 font-medium'
                      : 'text-slate-300 hover:bg-slate-800/80 border border-transparent'
                  }`}
                >
                  <div className="flex flex-col">
                    <span>{layer.name}</span>
                    <span className="text-[10px] text-slate-400">{layer.unit}</span>
                  </div>
                  <div className="w-12 h-2.5 rounded-full overflow-hidden flex">
                    {layer.colorScale.map((c, idx) => (
                      <span key={idx} style={{ backgroundColor: c }} className="flex-1 h-full" />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800">
            <h4 className="text-slate-200 font-semibold mb-2">Visibilidad de Objetos 3D</h4>
            <div className="grid grid-cols-2 gap-2 text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={showSatelliteHeatmap}
                  onChange={(e) => setShowSatelliteHeatmap(e.target.checked)}
                  className="rounded border-slate-700 text-cyan-600 focus:ring-cyan-500"
                />
                <span>Manto Satelital</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={showBathymetry}
                  onChange={(e) => setShowBathymetry(e.target.checked)}
                  className="rounded border-slate-700 text-cyan-600 focus:ring-cyan-500"
                />
                <span>Batimetría DEM</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={showBloomParticles}
                  onChange={(e) => setShowBloomParticles(e.target.checked)}
                  className="rounded border-slate-700 text-cyan-600 focus:ring-cyan-500"
                />
                <span>Volumen Cianobacterias</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={showCurrentVectors}
                  onChange={(e) => setShowCurrentVectors(e.target.checked)}
                  className="rounded border-slate-700 text-cyan-600 focus:ring-cyan-500"
                />
                <span>Vectores Corrientes</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={showBuoys}
                  onChange={(e) => setShowBuoys(e.target.checked)}
                  className="rounded border-slate-700 text-cyan-600 focus:ring-cyan-500"
                />
                <span>Boyas IoT (4)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={showActuators}
                  onChange={(e) => setShowActuators(e.target.checked)}
                  className="rounded border-slate-700 text-cyan-600 focus:ring-cyan-500"
                />
                <span>Actuadores / Aireación</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Main 3D Canvas Mount Element */}
      <div ref={mountRef} className="flex-1 w-full h-full min-h-[420px] cursor-grab active:cursor-grabbing relative">
        {webGLError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-950/90 text-center z-10">
            <Activity className="w-12 h-12 text-cyan-400 mb-3 animate-pulse" />
            <h3 className="text-base font-bold text-slate-100 mb-1">AquaTwin Gemelo Digital 3D</h3>
            <p className="text-xs text-slate-400 max-w-md mb-4 font-mono">
              Renderizado acelerado por WebGL inicializado. Capas multiespectrales (NDCI, Chl-a, SST) y telemetría de boyas activas.
            </p>
          </div>
        )}
      </div>

      {/* Selected Buoy Telemetry Floating Card */}
      {selectedBuoy && (
        <div className="absolute bottom-20 sm:bottom-20 left-2 sm:left-4 right-2 sm:right-auto z-20 sm:w-80 bg-slate-900/95 backdrop-blur-xl border border-cyan-500/50 rounded-xl p-3 sm:p-3.5 shadow-2xl text-xs space-y-2 text-slate-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-1.5">
              <Radio className={`w-4 h-4 ${selectedBuoy.status === 'ALERT' ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`} />
              <span className="font-bold text-slate-100">{selectedBuoy.name}</span>
            </div>
            <button
              onClick={() => handleSelectBuoy(null)}
              className="text-slate-400 hover:text-white font-mono text-sm leading-none"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-400">Clorofila-a:</span>
              <span className="text-amber-300 font-semibold">{selectedBuoy.telemetry.chlorophyllA} µg/L</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Ficocianina:</span>
              <span className="text-rose-400 font-semibold">{selectedBuoy.telemetry.phycocyanin.toLocaleString()} c/mL</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Temp Sup.:</span>
              <span className="text-cyan-300 font-semibold">{selectedBuoy.telemetry.tempSurface} °C</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Oxígeno Disuelto:</span>
              <span className="text-emerald-300 font-semibold">{selectedBuoy.telemetry.dissolvedOxygen} mg/L</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">pH:</span>
              <span className="text-slate-200">{selectedBuoy.telemetry.ph}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Turbidez:</span>
              <span className="text-slate-200">{selectedBuoy.telemetry.turbidity} NTU</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Fósforo Total:</span>
              <span className="text-orange-400 font-semibold">{selectedBuoy.telemetry.totalPhosphorus} mg/L</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Batería:</span>
              <span className="text-emerald-400">{selectedBuoy.batteryLevel}%</span>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800 flex items-center justify-between">
            <span>Último paquete MQTT: {selectedBuoy.lastPing}</span>
            <span className="text-cyan-400">Prof: {selectedBuoy.depthMeters}m</span>
          </div>
        </div>
      )}

      {/* Spectral Layer Color Scale Legend */}
      <div className="absolute bottom-20 right-2 sm:right-4 z-20 bg-slate-900/90 backdrop-blur-md px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl border border-slate-700/70 shadow-lg text-[10px] sm:text-[11px] font-mono flex flex-col gap-1 pointer-events-none">
        <div className="flex items-center justify-between gap-4 text-slate-300">
          <span className="font-semibold text-slate-200">{activeLayerConfig.name}</span>
          <span className="text-slate-400">[{activeLayerConfig.unit}]</span>
        </div>
        <div className="w-28 sm:w-48 h-2.5 sm:h-3 rounded-full overflow-hidden flex border border-slate-700">
          {activeLayerConfig.colorScale.map((c, i) => (
            <div key={i} style={{ backgroundColor: c }} className="flex-1 h-full" />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-slate-400">
          <span>{activeLayerConfig.min}</span>
          <span className="text-amber-400">Alerta: {activeLayerConfig.thresholdWarning}</span>
          <span>{activeLayerConfig.max}</span>
        </div>
      </div>

      {/* Bottom 4D Time-Series Timeline Bar */}
      <div className="z-20 bg-slate-900/95 border-t border-slate-800 px-3 sm:px-4 py-2 sm:py-2.5 flex flex-col gap-2 sm:gap-3 text-xs">
        {/* Play/Pause & Quick Scrub */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlayingTimeline(!isPlayingTimeline)}
            className={`p-1.5 rounded-lg border transition-colors ${
              isPlayingTimeline
                ? 'bg-amber-600/80 border-amber-500 text-white'
                : 'bg-cyan-600/80 border-cyan-500 text-white hover:bg-cyan-500'
            }`}
            title={isPlayingTimeline ? 'Pausar Simulación 4D' : 'Reproducir Evolución 4D'}
          >
            {isPlayingTimeline ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => handleTimeChange(0)}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors text-[11px]"
            title="Ir a Tiempo Real Actual (T0)"
          >
            T0 Ahora
          </button>
          <span className="font-mono text-cyan-400 font-semibold text-xs">
            {currentTimeOffset === 0
              ? 'T0 (En Vivo - Sensor Fusion)'
              : currentTimeOffset > 0
              ? `T+${currentTimeOffset}h (CNN-LSTM Pronóstico Algal)`
              : `T${currentTimeOffset}h (Paso Satelital Sentinel-2)`}
          </span>
        </div>

        {/* Range Slider */}
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:max-w-md">
          <span className="text-[10px] font-mono text-slate-400 shrink-0">-24h</span>
          <input
            type="range"
            min={-24}
            max={72}
            step={6}
            value={currentTimeOffset}
            onChange={(e) => handleTimeChange(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
          <span className="text-[10px] font-mono text-slate-400">+72h</span>
        </div>

        {/* Environmental Indicators */}
        <div className="hidden lg:flex items-center gap-4 text-slate-400 text-[11px] font-mono">
          <span className="flex items-center gap-1">
            <Wind className="w-3.5 h-3.5 text-cyan-400" />
            Viento: {basinEnv.wind}
          </span>
          <span className="flex items-center gap-1">
            <Waves className="w-3.5 h-3.5 text-blue-400" />
            Estratificación: {basinEnv.stratification}
          </span>
        </div>
      </div>
    </div>
  );
};

// --- PROCEDURAL 3D DIGITAL TWIN BASIN GENERATION HELPERS ---

export function distanceToSegment(px: number, pz: number, x1: number, z1: number, x2: number, z2: number): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq === 0) return Math.hypot(px - x1, pz - z1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / lengthSq));
  const projX = x1 + t * dx;
  const projZ = z1 + t * dz;
  return Math.hypot(px - projX, pz - projZ);
}

// 1. Procedural 3D Bathymetry & Morphometry Elevation Engine
export function calculateBasinDepth(basinId: string, x: number, z: number, maxDepthMeters: number = 20): number {
  if (basinId === 'basin-fcr') {
    // Falling Creek Reservoir (Virginia, USA)
    // Sinuous Appalachian river valley / dendritic creek reservoir flowing NW (z ~ -7) to SE (z ~ 2.5)
    const channelCenter = 1.3 * Math.sin(z * 0.32) + 0.8;
    const distToCenter = Math.abs(x - channelCenter);
    
    // Main winding river channel
    const channelWidth = z > 0 ? 3.0 : 2.2;
    let bed = 0;
    if (distToCenter < channelWidth) {
      const channelShape = Math.cos((distToCenter / channelWidth) * (Math.PI / 2));
      bed = -3.4 * channelShape;
    }
    
    // Station 20 shallow eutrophic side cove (x: -2.5, z: -1.0)
    const coveDist = Math.hypot(x + 2.5, z + 1.0);
    if (coveDist < 2.5) {
      bed = Math.min(bed, -2.4 * Math.cos((coveDist / 2.5) * (Math.PI / 2)));
    }
    
    // Deep Hole near dam (x: 2.2, z: 2.0, max depth 9.3m)
    const deepDist = Math.hypot(x - 2.2, z - 2.0);
    if (deepDist < 2.2) {
      bed -= 1.6 * Math.exp(-(deepDist ** 2) / 2.0);
    }
    
    // Appalachian valley ridge walls rising steeply outside the channel
    let mountain = 0;
    if (distToCenter >= channelWidth) {
      const ridgeDist = distToCenter - channelWidth;
      mountain = Math.min(4.5, 0.4 + ridgeDist * 0.85 + Math.sin(z * 0.6) * 0.5);
    }
    
    // Boundary containment
    if (Math.abs(x) > 9.5 || z < -7.5 || z > 6.5) {
      mountain = Math.max(mountain, 2.5);
    }
    
    return bed + mountain;
  }
  
  if (basinId === 'basin-san-roque') {
    // Embalse San Roque (Córdoba, Argentina)
    // Iconic Y-shaped reservoir: San Antonio branch (SW), Cosquín branch (NW), Garganta/Dique (East)
    const distSanAntonio = distanceToSegment(x, z, -6.5, 4.5, 0, 0);
    const distCosquin = distanceToSegment(x, z, -6.5, -4.5, 0, 0);
    const distGarganta = distanceToSegment(x, z, 0, 0, 5.5, 0.2);
    
    const minDist = Math.min(distSanAntonio, distCosquin, distGarganta);
    const riverWidth = distGarganta < 1.8 ? 2.2 : 2.5;
    
    let bed = 0;
    if (minDist < riverWidth) {
      const channelShape = Math.cos((minDist / riverWidth) * (Math.PI / 2));
      // Gorge near dam is much deeper (-5.5m), San Antonio is shallower (-3.2m)
      const depthFactor = x > 2.0 ? 5.5 : distSanAntonio < 2.0 ? 3.4 : 3.0;
      bed = -depthFactor * channelShape;
    }
    
    // Sierras de Córdoba mountains flanking the Punilla valley
    let mountain = 0;
    if (minDist >= riverWidth) {
      const slope = minDist - riverWidth;
      mountain = Math.min(5.2, 0.3 + slope * 1.1 + Math.sin(x * 0.5) * 0.4);
    }
    
    if (Math.abs(x) > 9.5 || Math.abs(z) > 7.5) {
      mountain = Math.max(mountain, 3.2);
    }
    
    return bed + mountain;
  }
  
  if (basinId === 'basin-titicaca-puno') {
    // Bahía Interior de Puno (Lago Titicaca, Perú)
    // Wide, flat, shallow high-altitude bay with Isla Esteves in the center-east
    const bayRadiusX = 8.5;
    const bayRadiusZ = 6.8;
    const normalizedDist = ((x / bayRadiusX) ** 2 + (z / bayRadiusZ) ** 2);
    
    let depth = 0;
    if (normalizedDist < 1.0) {
      // Very broad, relatively flat shallow lake bed (-2.2m to -3.0m)
      depth = -2.4 - Math.sin(x * 0.3) * 0.3 - Math.cos(z * 0.3) * 0.2;
      // Gentle littoral shelves near shores
      if (normalizedDist > 0.7) {
        depth *= (1.0 - (normalizedDist - 0.7) / 0.3);
      }
    } else {
      // Altiplano rolling hills surrounding the bay
      const hillDist = normalizedDist - 1.0;
      depth = Math.min(3.8, hillDist * 3.5 + Math.sin(x * 0.8 + z * 0.5) * 0.4);
    }
    
    // Isla Esteves: actual rocky island rising inside the bay at (x: 2.8, z: -1.2)
    const distEsteves = Math.hypot(x - 2.8, z + 1.2);
    if (distEsteves < 1.6) {
      const islandElevation = 2.0 * Math.cos((distEsteves / 1.6) * (Math.PI / 2));
      depth += islandElevation;
    }
    
    if (Math.abs(x) > 10.0 || Math.abs(z) > 8.5) {
      depth = Math.max(depth, 2.5);
    }
    
    return depth;
  }
  
  // Default / basin-paso-piedras:
  // Embalse Paso de las Piedras (Buenos Aires, Argentina)
  // Horizontally elongated East-West reservoir with central trench in pampean steppe
  const trenchCenterZ = 0.5 * Math.sin(x * 0.28);
  const distToTrench = Math.abs(z - trenchCenterZ);
  const inLakeX = x >= -8.5 && x <= 6.5;
  
  let bed = 0;
  if (inLakeX && distToTrench < 2.8) {
    const shape = Math.cos((distToTrench / 2.8) * (Math.PI / 2));
    // Eastern intake tower area is deepest (-5.0m)
    const depthScale = x > 2.5 ? 4.8 : 2.8;
    bed = -depthScale * shape;
  }
  
  // Gentle pampean undulating steppe
  let land = 0;
  if (!inLakeX || distToTrench >= 2.8) {
    const margin = !inLakeX ? Math.min(Math.abs(x + 8.5), Math.abs(x - 6.5)) : distToTrench - 2.8;
    land = Math.min(3.2, 0.4 + margin * 0.65 + Math.sin(x * 0.4) * 0.3);
  }
  
  if (Math.abs(x) > 10.5 || Math.abs(z) > 7.5) {
    land = Math.max(land, 2.2);
  }
  
  return bed + land;
}

// 2. Procedural Hydrodynamic Flow Vectors per Basin
export function generateFlowVectors(basinId: string): THREE.Group {
  const vectorGroup = new THREE.Group();
  
  const addSlenderArrow = (dir: THREE.Vector3, origin: THREE.Vector3, length: number = 0.72) => {
    const arrow = new THREE.ArrowHelper(dir, origin, length, 0x0ea5e9, 0.16, 0.08);
    if (arrow.line && arrow.line.material) {
      const lineMat = arrow.line.material as THREE.LineBasicMaterial;
      lineMat.transparent = true;
      lineMat.opacity = 0.40;
    }
    if (arrow.cone && arrow.cone.material) {
      const coneMat = arrow.cone.material as THREE.MeshBasicMaterial;
      coneMat.transparent = true;
      coneMat.opacity = 0.50;
    }
    vectorGroup.add(arrow);
  };

  if (basinId === 'basin-fcr') {
    // Falling Creek: Longitudinal flow following the curved creek channel
    for (let z = -6.5; z <= 4.5; z += 2.4) {
      for (let x = -3.5; x <= 3.5; x += 2.2) {
        const channelCenter = 1.3 * Math.sin(z * 0.32) + 0.8;
        const dist = Math.abs(x - channelCenter);
        if (dist <= 2.2) {
          const tangentX = 1.3 * 0.32 * Math.cos(z * 0.32);
          const dir = new THREE.Vector3(tangentX, 0, 1.0).normalize();
          const origin = new THREE.Vector3(x, 0.04, z);
          addSlenderArrow(dir, origin, 0.75);
        }
      }
    }
  } else if (basinId === 'basin-san-roque') {
    // San Roque: Two converging arms (San Antonio & Cosquin) heading into Garganta
    for (let x = -6.5; x <= 5.5; x += 2.8) {
      for (let z = -5.5; z <= 5.5; z += 2.8) {
        let dirX = 0.8;
        let dirZ = 0;
        if (x < 0) {
          dirZ = z > 0 ? -0.55 : 0.55;
          dirX = 0.65;
        } else {
          dirX = 0.95;
          dirZ = -0.15;
        }
        const dir = new THREE.Vector3(dirX, 0, dirZ).normalize();
        const origin = new THREE.Vector3(x, 0.04, z);
        addSlenderArrow(dir, origin, 0.80);
      }
    }
  } else if (basinId === 'basin-titicaca-puno') {
    // Bahía de Puno: Counter-clockwise bay gyre circulating around Isla Esteves
    for (let x = -5.5; x <= 5.5; x += 2.8) {
      for (let z = -4.5; z <= 4.5; z += 2.8) {
        const radius = Math.hypot(x, z);
        if (radius > 1.4 && radius < 7.0) {
          const dir = new THREE.Vector3(-z, 0, x * 0.8).normalize();
          const origin = new THREE.Vector3(x, 0.04, z);
          addSlenderArrow(dir, origin, 0.72);
        }
      }
    }
  } else {
    // Paso de las Piedras: Strong wind-driven surface current from WNW to ESE
    for (let x = -7.5; x <= 5.5; x += 2.8) {
      for (let z = -3.0; z <= 3.0; z += 2.2) {
        const dir = new THREE.Vector3(0.94, 0, -0.22 + Math.sin(x * 0.3) * 0.1).normalize();
        const origin = new THREE.Vector3(x, 0.04, z);
        addSlenderArrow(dir, origin, 0.82);
      }
    }
  }
  
  return vectorGroup;
}

// 3. Procedural Cyanobacteria Bloom Particles per Basin (Microcystis aeruginosa colonies)
export function generateBloomParticles(
  basinId: string,
  buoyList: IoTBuoy[],
  count: number = BLOOM_PARTICLE_COUNT
): { positions: Float32Array; colors: Float32Array; sizes: Float32Array } {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    let px = 0;
    let pz = 0;
    let bloomDensity = 0.5;

    if (basinId === 'basin-fcr') {
      const r = Math.random();
      if (r < 0.45) {
        // Station 20 upstream bloom (-2.5, -1.0)
        px = -2.5 + (Math.random() - 0.5) * 3.2;
        pz = -1.0 + (Math.random() - 0.5) * 2.8;
        bloomDensity = 0.85;
      } else if (r < 0.75) {
        // Deep Hole & intake tower (2.2, 2.0)
        px = 2.2 + (Math.random() - 0.5) * 2.6;
        pz = 2.0 + (Math.random() - 0.5) * 2.4;
        bloomDensity = 0.65;
      } else {
        // Creek channel connector and southern scum cove
        const zProg = -5.0 + Math.random() * 8.5;
        const channelCenter = 1.3 * Math.sin(zProg * 0.32) + 0.8;
        px = channelCenter + (Math.random() - 0.5) * 2.0;
        pz = zProg;
        bloomDensity = 0.75;
      }
    } else if (basinId === 'basin-san-roque') {
      const r = Math.random();
      if (r < 0.60) {
        px = -4.2 + (Math.random() - 0.5) * 4.2;
        pz = 3.2 + (Math.random() - 0.5) * 3.8;
        bloomDensity = 0.95;
      } else {
        px = 3.8 + (Math.random() - 0.5) * 3.2;
        pz = 0.2 + (Math.random() - 0.5) * 2.8;
        bloomDensity = 0.70;
      }
    } else if (basinId === 'basin-titicaca-puno') {
      const r = Math.random();
      if (r < 0.55) {
        px = -3.8 + (Math.random() - 0.5) * 4.5;
        pz = 1.5 + (Math.random() - 0.5) * 4.2;
        bloomDensity = 0.90;
      } else {
        px = -1.5 + (Math.random() - 0.5) * 5.0;
        pz = 3.2 + (Math.random() - 0.5) * 4.0;
        bloomDensity = 0.80;
      }
    } else {
      px = (Math.random() - 0.5) * 13.0;
      pz = -3.0 + (Math.random() - 0.5) * 2.8;
      bloomDensity = 0.55;
    }

    // Positioned in photic surface zone (-0.02m to -0.60m)
    const py = -0.02 - Math.random() * 0.55;
    positions[i * 3] = px;
    positions[i * 3 + 1] = py;
    positions[i * 3 + 2] = pz;

    // Authentic Limnological Microcystis Palette
    const randColor = Math.random();
    if (bloomDensity > 0.8 && randColor < 0.35) {
      // Surface Scum Froth: Bright Pea-Soup Chartreuse
      colors[i * 3] = 0.64;
      colors[i * 3 + 1] = 0.92;
      colors[i * 3 + 2] = 0.18;
      sizes[i] = 0.55 + Math.random() * 0.35;
    } else if (randColor < 0.65) {
      // Vibrant Emerald Chlorophyll
      colors[i * 3] = 0.13;
      colors[i * 3 + 1] = 0.82;
      colors[i * 3 + 2] = 0.36;
      sizes[i] = 0.40 + Math.random() * 0.30;
    } else if (randColor < 0.85) {
      // Phycocyanin Blue-Green Turquoise
      colors[i * 3] = 0.06;
      colors[i * 3 + 1] = 0.74;
      colors[i * 3 + 2] = 0.58;
      sizes[i] = 0.35 + Math.random() * 0.25;
    } else {
      // Yellow-green scum foam
      colors[i * 3] = 0.88;
      colors[i * 3 + 1] = 0.82;
      colors[i * 3 + 2] = 0.12;
      sizes[i] = 0.50 + Math.random() * 0.30;
    }
  }

  return { positions, colors, sizes };
}

// 4. IoT Buoy 3D Model Factory
export function createBuoyGroup(buoy: IoTBuoy): THREE.Group {
  const buoyGroup = new THREE.Group();
  buoyGroup.position.set(buoy.gridX, 0, buoy.gridZ);

  // Buoy Float Body
  const bodyGeo = new THREE.CylinderGeometry(0.35, 0.45, 0.4, 16);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: buoy.status === 'ALERT' ? 0xef4444 : buoy.status === 'WARNING' ? 0xf59e0b : 0x10b981,
    metalness: 0.3,
    roughness: 0.4,
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = 0.2;
  bodyMesh.castShadow = true;
  buoyGroup.add(bodyMesh);

  // Solar Panel & Antenna Mast
  const mastGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8);
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8 });
  const mastMesh = new THREE.Mesh(mastGeo, mastMat);
  mastMesh.position.y = 0.8;
  buoyGroup.add(mastMesh);

  // Beacon Pulsating Light
  const beaconGeo = new THREE.SphereGeometry(0.12, 12, 12);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: buoy.status === 'ALERT' ? 0xff0000 : buoy.status === 'WARNING' ? 0xffaa00 : 0x00ff88,
  });
  const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
  beaconMesh.position.y = 1.4;
  buoyGroup.add(beaconMesh);

  // Delicate telemetry radar sonar ripple
  const ringGeo = new THREE.RingGeometry(0.35, 0.44, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: buoy.status === 'ALERT' ? 0xf43f5e : buoy.status === 'WARNING' ? 0xf59e0b : 0x10b981,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.35,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.position.y = 0.05;
  ringMesh.name = 'pulseRing';
  buoyGroup.add(ringMesh);

  // Sensor chain extending down to bathymetry depth
  const cableGeo = new THREE.CylinderGeometry(0.02, 0.02, 3.2, 6);
  const cableMat = new THREE.MeshBasicMaterial({ color: 0x475569 });
  const cableMesh = new THREE.Mesh(cableGeo, cableMat);
  cableMesh.position.y = -1.6;
  buoyGroup.add(cableMesh);

  buoyGroup.userData.pickKind = 'buoy';
  buoyGroup.userData.pickId = buoy.id;
  return buoyGroup;
}

// 5. Actuator 3D Model Factory
export function createActuatorGroup(act: ActuatorDevice): THREE.Group {
  const actGroup = new THREE.Group();
  actGroup.position.set(act.gridX, 0, act.gridZ);

  if (act.type === 'AERATOR') {
    const platformGeo = new THREE.BoxGeometry(1.2, 0.25, 1.2);
    const platformMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.6 });
    const platformMesh = new THREE.Mesh(platformGeo, platformMat);
    platformMesh.position.y = 0.15;
    actGroup.add(platformMesh);

    const rotorGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 8);
    const rotorMat = new THREE.MeshStandardMaterial({ color: 0x0369a1 });
    const rotorMesh = new THREE.Mesh(rotorGeo, rotorMat);
    rotorMesh.position.y = 0.35;
    rotorMesh.name = 'actRotor';
    actGroup.add(rotorMesh);
  } else if (act.type === 'ULTRASONIC') {
    const baseGeo = new THREE.CylinderGeometry(0.5, 0.6, 0.3, 16);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x7c3aed, metalness: 0.5 });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.15;
    actGroup.add(baseMesh);

    const waveGeo = new THREE.RingGeometry(0.8, 1.4, 32);
    waveGeo.rotateX(-Math.PI / 2);
    const waveMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    });
    const waveMesh = new THREE.Mesh(waveGeo, waveMat);
    waveMesh.position.y = 0.08;
    waveMesh.name = 'ultrasonicWave';
    actGroup.add(waveMesh);
  } else {
    // Flow Gate
    const gateGeo = new THREE.BoxGeometry(0.8, 0.8, 0.4);
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7 });
    const gateMesh = new THREE.Mesh(gateGeo, gateMat);
    gateMesh.position.y = 0.4;
    actGroup.add(gateMesh);
  }

  actGroup.userData.pickKind = 'actuator';
  actGroup.userData.pickId = act.id;
  return actGroup;
}

// 6. Multi-spectral Satellite Heatmap & Realistic Algal Bloom Renderer
export function drawSpectralHeatmap(
  ctx: CanvasRenderingContext2D,
  basin: WaterBasin,
  buoyList: IoTBuoy[],
  layer: SpectralLayerType = 'CHLOROPHYLL_A',
  timeOffset: number = 0,
  tempOffset: number = 0,
  po4Offset: number = 0
) {
  const width = Math.max(10, ctx.canvas.width || 1024);
  const height = Math.max(10, ctx.canvas.height || 1024);
  ctx.clearRect(0, 0, width, height);

  // 1. Deep Limnological Lake Water Gradient Base
  const bgGradient = ctx.createRadialGradient(
    width * 0.48, height * 0.52, width * 0.08,
    width * 0.50, height * 0.50, width * 0.75
  );
  if (basin.id === 'basin-fcr') {
    bgGradient.addColorStop(0, '#042735');
    bgGradient.addColorStop(0.65, '#031d28');
    bgGradient.addColorStop(1, '#02131b');
  } else if (basin.id === 'basin-san-roque') {
    bgGradient.addColorStop(0, '#032533');
    bgGradient.addColorStop(0.65, '#021c27');
    bgGradient.addColorStop(1, '#02121a');
  } else if (basin.id === 'basin-titicaca-puno') {
    bgGradient.addColorStop(0, '#052a3d');
    bgGradient.addColorStop(0.65, '#031f2d');
    bgGradient.addColorStop(1, '#02141e');
  } else {
    bgGradient.addColorStop(0, '#042836');
    bgGradient.addColorStop(0.65, '#031e29');
    bgGradient.addColorStop(1, '#02141c');
  }
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  const safeTime = Number.isFinite(timeOffset) ? timeOffset : 0;
  const safeTemp = Number.isFinite(tempOffset) ? tempOffset : 0;
  const safePO4 = Number.isFinite(po4Offset) ? po4Offset : 0;

  // Time evolution & nutrient multiplier for bloom expansion
  const rawGrowth = 1.0 + (safeTime / 72.0) * 0.75 + (safeTemp * 0.12) + (safePO4 * 1.1);
  const bloomGrowth = Math.max(0.4, Math.min(2.5, Number.isFinite(rawGrowth) ? rawGrowth : 1.0));

  // Helper: Draw organic multi-lobed fractal algal bloom patch (no geometric circles)
  const drawOrganicAlgalBloom = (
    cx: number, cy: number,
    baseRadius: number,
    intensity: number,
    isPhycocyanin: boolean = false
  ) => {
    const steps = 64;
    const lobes = 5;

    // A. Outer Diffuse Aquatic Green / Cyan Transition
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const r = baseRadius * 1.45 * (
        1.0 +
        0.28 * Math.sin(lobes * angle + 0.8) +
        0.18 * Math.cos((lobes + 3) * angle - 1.1) +
        0.10 * Math.sin(11 * angle + 2.0)
      );
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    const outerGrad = ctx.createRadialGradient(cx, cy, baseRadius * 0.05, cx, cy, baseRadius * 1.5);
    if (isPhycocyanin) {
      outerGrad.addColorStop(0, 'rgba(8, 145, 178, 0.45)');
      outerGrad.addColorStop(0.5, 'rgba(13, 148, 136, 0.25)');
      outerGrad.addColorStop(1, 'rgba(3, 30, 40, 0)');
    } else {
      outerGrad.addColorStop(0, 'rgba(16, 185, 129, 0.45)');
      outerGrad.addColorStop(0.45, 'rgba(13, 148, 136, 0.30)');
      outerGrad.addColorStop(0.85, 'rgba(4, 120, 87, 0.12)');
      outerGrad.addColorStop(1, 'rgba(2, 20, 28, 0)');
    }
    ctx.fillStyle = outerGrad;
    ctx.fill();

    // B. Dense Phytoplankton Mantle (Vibrant Algae Green)
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const r = baseRadius * (
        1.0 +
        0.32 * Math.sin(lobes * angle + 1.4) +
        0.22 * Math.cos((lobes + 2) * angle - 0.6) +
        0.12 * Math.sin(13 * angle + 1.2)
      );
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    const midGrad = ctx.createRadialGradient(cx, cy, baseRadius * 0.05, cx, cy, baseRadius * 1.05);
    if (isPhycocyanin) {
      midGrad.addColorStop(0, 'rgba(6, 182, 212, 0.92)');   // Vibrant Cyan
      midGrad.addColorStop(0.40, 'rgba(20, 184, 166, 0.85)'); // Turquoise
      midGrad.addColorStop(0.75, 'rgba(16, 185, 129, 0.50)'); // Emerald
      midGrad.addColorStop(1, 'rgba(4, 40, 50, 0)');
    } else {
      midGrad.addColorStop(0, 'rgba(132, 204, 22, 0.95)');   // Chartreuse / Lime
      midGrad.addColorStop(0.38, 'rgba(34, 197, 94, 0.88)');  // Vibrant Algae Green
      midGrad.addColorStop(0.72, 'rgba(16, 185, 129, 0.55)'); // Emerald Phytoplankton
      midGrad.addColorStop(1, 'rgba(2, 35, 45, 0)');
    }
    ctx.fillStyle = midGrad;
    ctx.fill();

    // C. Critical Surface Scum Froth ("Nata Superficial de Microcystis")
    if (intensity > 0.4) {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const r = (baseRadius * 0.58 * intensity) * (
          1.0 +
          0.36 * Math.sin(4 * angle + 2.3) +
          0.24 * Math.cos(7 * angle - 1.2)
        );
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      const scumGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, baseRadius * 0.62 * intensity);
      if (isPhycocyanin) {
        scumGrad.addColorStop(0, 'rgba(224, 242, 254, 0.95)'); // Cyan surface froth
        scumGrad.addColorStop(0.45, 'rgba(56, 189, 248, 0.90)');
        scumGrad.addColorStop(0.80, 'rgba(6, 182, 212, 0.70)');
        scumGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
      } else {
        scumGrad.addColorStop(0, 'rgba(254, 240, 138, 0.96)'); // Froth yellow-cream
        scumGrad.addColorStop(0.38, 'rgba(163, 230, 53, 0.92)'); // Pea-soup chartreuse
        scumGrad.addColorStop(0.75, 'rgba(101, 163, 13, 0.75)'); // Dense vegetative scum
        scumGrad.addColorStop(1, 'rgba(34, 197, 94, 0)');
      }
      ctx.fillStyle = scumGrad;
      ctx.fill();
    }
    ctx.restore();
  };

  // 2. Draw Dynamic Organic Bloom Clusters around telemetry stations
  buoyList.forEach((buoy) => {
    const cx = ((buoy.gridX + 10.5) / 21.0) * width;
    const cz = ((buoy.gridZ + 8.5) / 17.0) * height;

    const chl = buoy.telemetry.chlorophyllA;
    const isAlert = buoy.status === 'ALERT' || chl > 40;
    const isWarning = buoy.status === 'WARNING' || chl > 20;

    const baseRadius = (isAlert ? 120 : isWarning ? 85 : 55) * (0.8 + chl / 85);
    const radius = Math.max(35, Math.min(width * 0.42, baseRadius * bloomGrowth));
    const intensity = Math.min(1.0, chl / 60);

    if (layer === 'CHLOROPHYLL_A' || layer === 'NDCI') {
      drawOrganicAlgalBloom(cx, cz, radius, intensity, false);
    } else if (layer === 'PHYCOCYANIN') {
      drawOrganicAlgalBloom(cx, cz, radius, intensity, true);
    } else if (layer === 'SST_TEMPERATURE') {
      const rad = ctx.createRadialGradient(cx, cz, 10, cx, cz, radius);
      rad.addColorStop(0, 'rgba(239, 68, 68, 0.88)');
      rad.addColorStop(0.45, 'rgba(249, 115, 22, 0.65)');
      rad.addColorStop(0.80, 'rgba(234, 179, 8, 0.35)');
      rad.addColorStop(1, 'rgba(14, 165, 233, 0)');
      ctx.fillStyle = rad;
      ctx.beginPath();
      ctx.arc(cx, cz, radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (layer === 'DISSOLVED_O2') {
      const rad = ctx.createRadialGradient(cx, cz, 10, cx, cz, radius);
      rad.addColorStop(0, isAlert ? 'rgba(136, 19, 55, 0.90)' : 'rgba(225, 29, 72, 0.70)');
      rad.addColorStop(0.55, 'rgba(56, 189, 248, 0.35)');
      rad.addColorStop(1, 'rgba(2, 132, 199, 0)');
      ctx.fillStyle = rad;
      ctx.beginPath();
      ctx.arc(cx, cz, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      drawOrganicAlgalBloom(cx, cz, radius, intensity, false);
    }
  });

  // 3. Sinuous Algal Bloom Filaments & Swirling Scum Lines
  if (layer === 'CHLOROPHYLL_A' || layer === 'NDCI' || layer === 'PHYCOCYANIN') {
    ctx.save();
    if (basin.id === 'basin-fcr') {
      // Falling Creek: Algae blooms along the curved creek channel
      const points = [
        { x: width * 0.38, y: height * 0.44 },
        { x: width * 0.45, y: height * 0.52 },
        { x: width * 0.52, y: height * 0.58 },
        { x: width * 0.61, y: height * 0.62 },
      ];

      // Draw multi-layered glowing green ribbons
      [
        { width: 34, color: 'rgba(16, 185, 129, 0.35)' },
        { width: 22, color: 'rgba(34, 197, 94, 0.55)' },
        { width: 12, color: 'rgba(132, 204, 22, 0.70)' },
        { width: 5, color: 'rgba(217, 249, 157, 0.85)' },
      ].forEach((ribbon) => {
        ctx.strokeStyle = ribbon.color;
        ctx.lineWidth = ribbon.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        ctx.bezierCurveTo(
          width * 0.40, height * 0.48,
          width * 0.48, height * 0.54,
          points[2].x, points[2].y
        );
        ctx.bezierCurveTo(
          width * 0.56, height * 0.60,
          width * 0.58, height * 0.61,
          points[3].x, points[3].y
        );
        ctx.stroke();
      });

      // Southern Cove Scum Pocket (wind-trapped algae)
      drawOrganicAlgalBloom(width * 0.46, height * 0.54, 75 * bloomGrowth, 0.85);

      // Swirling micro-eddies in the channel
      [
        { cx: width * 0.42, cy: height * 0.47, r: 24 },
        { cx: width * 0.54, cy: height * 0.57, r: 20 },
      ].forEach((eddy) => {
        ctx.strokeStyle = 'rgba(163, 230, 53, 0.45)';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(eddy.cx, eddy.cy, eddy.r, 0.2 * Math.PI, 1.4 * Math.PI);
        ctx.stroke();
      });

    } else if (basin.id === 'basin-san-roque') {
      // San Roque: Two massive converging arms of green bloom
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.65)';
      ctx.lineWidth = 26;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(width * 0.30, height * 0.70);
      ctx.bezierCurveTo(width * 0.45, height * 0.58, width * 0.55, height * 0.54, width * 0.72, height * 0.50);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(width * 0.30, height * 0.30);
      ctx.bezierCurveTo(width * 0.45, height * 0.42, width * 0.55, height * 0.48, width * 0.72, height * 0.50);
      ctx.stroke();

      drawOrganicAlgalBloom(width * 0.32, height * 0.68, 120 * bloomGrowth, 0.95);

    } else if (basin.id === 'basin-titicaca-puno') {
      drawOrganicAlgalBloom(width * 0.35, height * 0.60, 150 * bloomGrowth, 0.95);
      drawOrganicAlgalBloom(width * 0.45, height * 0.45, 110 * bloomGrowth, 0.85);

      ctx.strokeStyle = 'rgba(132, 204, 22, 0.55)';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(width * 0.50, height * 0.50, width * 0.28, 0.1 * Math.PI, 1.6 * Math.PI);
      ctx.stroke();
    } else {
      // Paso de las Piedras: Wind-blown parallel streaks
      for (let s = 0; s < 5; s++) {
        const sy = height * (0.28 + s * 0.08);
        ctx.strokeStyle = `rgba(34, 197, 94, ${0.35 + s * 0.08})`;
        ctx.lineWidth = 10 + s * 3;
        ctx.beginPath();
        ctx.moveTo(width * 0.15, sy);
        ctx.lineTo(width * 0.85, sy + height * 0.04);
        ctx.stroke();
      }
    }

    // 4. Biological Micro-Cellular Granulation (Textured Verdín Flecks)
    ctx.fillStyle = 'rgba(217, 249, 157, 0.75)';
    const speckCount = 140;
    for (let k = 0; k < speckCount; k++) {
      const u = (Math.sin(k * 13.7) * 0.5 + 0.5);
      const v = (Math.cos(k * 19.3) * 0.5 + 0.5);
      const sx = width * (0.30 + u * 0.45);
      const sy = height * (0.35 + v * 0.40);
      const sz = 1.5 + (k % 4) * 1.2;
      ctx.beginPath();
      ctx.arc(sx, sy, sz, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
