import { useRef, useEffect } from 'react';
import { Renderer, Camera, Program, Mesh, Geometry, Box, Orbit, Transform } from 'ogl';
import type { OGLRenderingContext } from 'ogl';

interface CubePreviewProps {
  rx: number;
  ry: number;
  rz?: number;
  onRotate: (rx: number, ry: number) => void;
}

const VERTEX = /* glsl */ `
attribute vec3 position;
attribute vec3 normal;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
varying vec3 vNormal;
varying vec3 vViewPos;
void main() {
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vViewPos = -mvPos.xyz;
  gl_Position = projectionMatrix * mvPos;
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vNormal;
varying vec3 vViewPos;
void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPos);
  vec3 light = normalize(vec3(0.5, 1.0, 0.8));
  float diff = max(dot(normal, light), 0.0);
  float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
  float ambient = 0.12;
  vec3 color = vec3(0.4, 0.5, 0.7) * (ambient + diff * 0.8) + vec3(0.6, 0.7, 1.0) * rim * 0.15;
  gl_FragColor = vec4(color, 0.7);
}
`;

const ORBIT_RADIUS = 4;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

function eulerToSpherical(rxDeg: number, ryDeg: number) {
  const theta = ryDeg * DEG;
  const phi = rxDeg * DEG + Math.PI / 2;
  return { theta, phi };
}

function sphericalToEuler(theta: number, phi: number) {
  const ry = theta * RAD;
  const rx = (phi - Math.PI / 2) * RAD;
  return { rx, ry };
}

function setCameraFromEuler(camera: Camera, rxDeg: number, ryDeg: number) {
  const { theta, phi } = eulerToSpherical(rxDeg, ryDeg);
  const sinPhi = Math.sin(Math.max(0.000001, phi));
  camera.position.x = ORBIT_RADIUS * sinPhi * Math.sin(theta);
  camera.position.y = ORBIT_RADIUS * Math.cos(phi);
  camera.position.z = ORBIT_RADIUS * sinPhi * Math.cos(theta);
}

export function CubePreview({ rx, ry, rz = 0, onRotate }: CubePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer: InstanceType<typeof Renderer>;
    camera: Camera;
    orbit: InstanceType<typeof Orbit>;
    scene: Transform;
    cube: Mesh;
    wire: Mesh;
    gl: OGLRenderingContext;
    rafId: number;
    lastEmittedRx: number;
    lastEmittedRy: number;
    externalUpdate: boolean;
  } | null>(null);
  const onRotateRef = useRef(onRotate);
  onRotateRef.current = onRotate;
  const propsRef = useRef({ rx, ry });
  propsRef.current = { rx, ry };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new Renderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      dpr: Math.min(window.devicePixelRatio, 2),
    });
    const gl = renderer.gl as OGLRenderingContext;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.className = 'dialkit-cube-preview-canvas';
    container.appendChild(canvas);

    const camera = new Camera(gl, { fov: 35, near: 0.1, far: 50 });
    setCameraFromEuler(camera, propsRef.current.rx, propsRef.current.ry);
    camera.lookAt([0, 0, 0]);

    const scene = new Transform();

    const boxGeometry = new Box(gl, {
      width: 1.6,
      height: 1.6,
      depth: 1.6,
    });

    const litProgram = new Program(gl, {
      vertex: VERTEX,
      fragment: FRAGMENT,
      transparent: true,
      cullFace: false,
      depthWrite: false,
    });

    const cube = new Mesh(gl, { geometry: boxGeometry, program: litProgram });
    cube.setParent(scene);

    const wireProgram = new Program(gl, {
      vertex: /* glsl */ `
attribute vec3 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
      fragment: /* glsl */ `
precision highp float;
void main() {
  gl_FragColor = vec4(1.0, 1.0, 1.0, 0.35);
}
`,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });

    const wireIndices = buildWireframeIndices(boxGeometry);
    const wireGeo = new Geometry(gl, {
      position: { ...boxGeometry.attributes.position },
      index: { data: wireIndices },
    });

    const wire = new Mesh(gl, {
      geometry: wireGeo,
      program: wireProgram,
      mode: gl.LINES,
    });
    wire.setParent(scene);

    const orbit = new Orbit(camera, {
      element: canvas,
      enableZoom: false,
      enablePan: false,
      ease: 0.25,
      inertia: 0.85,
      rotateSpeed: 0.1,
    });

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.perspective({ aspect: w / h });
    };
    resize();

    const resizeObs = new ResizeObserver(resize);
    resizeObs.observe(container);

    const state = {
      renderer,
      camera,
      orbit,
      scene,
      cube,
      wire,
      gl,
      rafId: 0,
      lastEmittedRx: propsRef.current.rx,
      lastEmittedRy: propsRef.current.ry,
      externalUpdate: false,
    };

    orbit.forcePosition();

    function tick() {
      state.rafId = requestAnimationFrame(tick);
      orbit.update();

      const offset = orbit.offset;
      const radius = Math.sqrt(offset.x * offset.x + offset.y * offset.y + offset.z * offset.z);
      const theta = Math.atan2(offset.x, offset.z);
      const phi = Math.acos(Math.min(Math.max(offset.y / radius, -1), 1));
      const { rx: newRx, ry: newRy } = sphericalToEuler(theta, phi);

      const roundedRx = Math.round(newRx);
      const roundedRy = Math.round(newRy);

      if (!state.externalUpdate &&
          (Math.abs(roundedRx - state.lastEmittedRx) > 0.5 ||
           Math.abs(roundedRy - state.lastEmittedRy) > 0.5)) {
        state.lastEmittedRx = roundedRx;
        state.lastEmittedRy = roundedRy;
        onRotateRef.current(roundedRx, roundedRy);
      }
      state.externalUpdate = false;

      renderer.render({ scene, camera });
    }

    state.rafId = requestAnimationFrame(tick);
    stateRef.current = state;

    return () => {
      cancelAnimationFrame(state.rafId);
      orbit.remove();
      resizeObs.disconnect();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      stateRef.current = null;
    };
  }, []);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;

    const { rx: emRx, ry: emRy } = { rx: state.lastEmittedRx, ry: state.lastEmittedRy };
    if (Math.abs(rx - emRx) < 1.5 && Math.abs(ry - emRy) < 1.5) return;

    state.externalUpdate = true;
    setCameraFromEuler(state.camera, rx, ry);
    state.orbit.forcePosition();
    state.lastEmittedRx = rx;
    state.lastEmittedRy = ry;
  }, [rx, ry]);

  return (
    <div ref={containerRef} className="dialkit-cube-preview-wrapper">
      <span className="dialkit-preview-label">Drag to rotate</span>
    </div>
  );
}

function buildWireframeIndices(geometry: any): Uint16Array {
  const posData = geometry.attributes.position.data;
  const indexData = geometry.attributes.index?.data;
  const edges = new Set<string>();
  const indices: number[] = [];

  function addEdge(a: number, b: number) {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (edges.has(key)) return;
    edges.add(key);
    indices.push(a, b);
  }

  if (indexData) {
    for (let i = 0; i < indexData.length; i += 3) {
      addEdge(indexData[i], indexData[i + 1]);
      addEdge(indexData[i + 1], indexData[i + 2]);
      addEdge(indexData[i + 2], indexData[i]);
    }
  } else {
    const numVerts = posData.length / 3;
    for (let i = 0; i < numVerts; i += 3) {
      addEdge(i, i + 1);
      addEdge(i + 1, i + 2);
      addEdge(i + 2, i);
    }
  }

  return new Uint16Array(indices);
}
