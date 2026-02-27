import { useRef, useEffect, useCallback } from 'react';

interface CubePreviewProps {
  rx: number;
  ry: number;
  rz?: number;
  onRotate: (rx: number, ry: number) => void;
}

interface Point3D { x: number; y: number; z: number }
interface Point2D { x: number; y: number }

const CUBE_SIZE = 80;
const FOCAL = 400;
const EDGE_PAIRS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];
const FACES: number[][] = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [0, 4, 7, 3],
  [1, 5, 6, 2],
  [0, 1, 5, 4],
  [3, 2, 6, 7],
];

function makeCube(size: number): Point3D[] {
  const h = size / 2;
  return [
    { x: -h, y: -h, z: -h }, { x: h, y: -h, z: -h },
    { x: h, y: h, z: -h },   { x: -h, y: h, z: -h },
    { x: -h, y: -h, z: h },  { x: h, y: -h, z: h },
    { x: h, y: h, z: h },    { x: -h, y: h, z: h },
  ];
}

function rotate(p: Point3D, rx: number, ry: number, rz: number): Point3D {
  const toR = (d: number) => d * Math.PI / 180;
  const [ax, ay, az] = [toR(rx), toR(ry), toR(rz)];
  const { x, y, z } = p;
  const y1 = y * Math.cos(ax) - z * Math.sin(ax);
  const z1 = y * Math.sin(ax) + z * Math.cos(ax);
  const x2 = x * Math.cos(ay) + z1 * Math.sin(ay);
  const z2 = -x * Math.sin(ay) + z1 * Math.cos(ay);
  const x3 = x2 * Math.cos(az) - y1 * Math.sin(az);
  const y3 = x2 * Math.sin(az) + y1 * Math.cos(az);
  return { x: x3, y: y3, z: z2 };
}

function project(p: Point3D): Point2D {
  const denom = FOCAL + p.z;
  const s = FOCAL / (Math.abs(denom) < 0.001 ? 0.001 : denom);
  return { x: p.x * s, y: p.y * s };
}

export function CubePreview({ rx, ry, rz = 0, onRotate }: CubePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);
  const onRotateRef = useRef(onRotate);
  onRotateRef.current = onRotate;
  const rxRef = useRef(rx);
  const ryRef = useRef(ry);
  rxRef.current = rx;
  ryRef.current = ry;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    const verts = makeCube(CUBE_SIZE);
    const rotated = verts.map(v => rotate(v, rx, ry, rz));
    const projected = rotated.map(v => project(v));

    const sortedFaces = FACES.map((face) => ({
      face,
      avgZ: face.reduce((s, vi) => s + rotated[vi].z, 0) / face.length,
    })).sort((a, b) => a.avgZ - b.avgZ);

    for (const { face, avgZ } of sortedFaces) {
      const pts = face.map(i => projected[i]);
      const lightness = 0.06 + 0.08 * ((avgZ + CUBE_SIZE) / (CUBE_SIZE * 2));
      ctx.beginPath();
      ctx.moveTo(cx + pts[0].x, cy + pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(cx + pts[i].x, cy + pts[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(255, 255, 255, ${lightness.toFixed(3)})`;
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const [a, b] of EDGE_PAIRS) {
      ctx.beginPath();
      ctx.moveTo(cx + projected[a].x, cy + projected[a].y);
      ctx.lineTo(cx + projected[b].x, cy + projected[b].y);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    for (const p of projected) {
      ctx.beginPath();
      ctx.arc(cx + p.x, cy + p.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [rx, ry, rz]);

  // Use native DOM events to avoid React state/closure issues with pointer capture
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY, rx: rxRef.current, ry: ryRef.current };
      canvas.classList.add('dialkit-cube-preview-dragging');
    };

    const onMove = (e: PointerEvent) => {
      if (!isDraggingRef.current || !dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const sensitivity = 0.8;
      const newRy = Math.max(-180, Math.min(180, Math.round(dragStartRef.current.ry + dx * sensitivity)));
      const newRx = Math.max(-180, Math.min(180, Math.round(dragStartRef.current.rx + dy * sensitivity)));
      onRotateRef.current(newRx, newRy);
    };

    const onUp = () => {
      isDraggingRef.current = false;
      dragStartRef.current = null;
      canvas.classList.remove('dialkit-cube-preview-dragging');
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }, []);

  return (
    <div className="dialkit-cube-preview-wrapper">
      <canvas ref={canvasRef} className="dialkit-cube-preview-canvas" />
      <span className="dialkit-preview-label">Drag to rotate</span>
    </div>
  );
}
