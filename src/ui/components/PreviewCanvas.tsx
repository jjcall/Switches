import { useRef, useEffect } from 'react';
import type { ActionDescriptor } from '../../shared/message-types';

interface PreviewCanvasProps {
  actions: ActionDescriptor[];
}

interface NodeState {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: { r: number; g: number; b: number };
  fillOpacity?: number;
  stroke?: { r: number; g: number; b: number };
  strokeWeight?: number;
  cornerRadius?: number;
  pathData?: string;
  imageBytes?: number[];
}

function rgbToCSS(c: { r: number; g: number; b: number }, opacity = 1): string {
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${opacity})`;
}

function extractFillColor(fills: unknown[]): { color: { r: number; g: number; b: number }; opacity: number } | null {
  if (!fills?.length) return null;
  const f = fills[0] as Record<string, unknown>;
  if (f.type !== 'SOLID' || !f.color) return null;
  const c = f.color as { r: number; g: number; b: number };
  return { color: c, opacity: typeof f.opacity === 'number' ? f.opacity : 1 };
}

function extractStroke(strokes: unknown[]): { color: { r: number; g: number; b: number }; weight: number } | null {
  if (!strokes?.length) return null;
  const s = strokes[0] as Record<string, unknown>;
  if (s.type !== 'SOLID' || !s.color) return null;
  return {
    color: s.color as { r: number; g: number; b: number },
    weight: typeof s.weight === 'number' ? s.weight : 1,
  };
}

export function PreviewCanvas({ actions }: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !actions.length) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nodes = new Map<string, NodeState>();
    let lastCreatedId: string | null = null;
    let tempIdCounter = 0;

    let rootFrame: NodeState | null = null;
    let rootId: string | null = null;

    // First pass: build node states from actions
    for (const action of actions) {
      const { method, args = {}, tempId, nodeId } = action;

      switch (method) {
        case 'createFrame': {
          const id = tempId ?? `__auto_${tempIdCounter++}`;
          const node: NodeState = {
            type: 'frame',
            x: (args.x as number) ?? 0,
            y: (args.y as number) ?? 0,
            width: (args.width as number) ?? 100,
            height: (args.height as number) ?? 100,
          };
          nodes.set(id, node);
          lastCreatedId = id;
          if (!rootFrame) {
            rootFrame = node;
            rootId = id;
          }
          break;
        }

        case 'createRectangle': {
          const id = tempId ?? `__auto_${tempIdCounter++}`;
          const node: NodeState = {
            type: 'rectangle',
            x: (args.x as number) ?? 0,
            y: (args.y as number) ?? 0,
            width: (args.width as number) ?? 50,
            height: (args.height as number) ?? 50,
            cornerRadius: (args.cornerRadius as number) ?? 0,
          };
          if (args.fills) {
            const fc = extractFillColor(args.fills as unknown[]);
            if (fc) { node.fill = fc.color; node.fillOpacity = fc.opacity; }
          }
          nodes.set(id, node);
          lastCreatedId = id;
          break;
        }

        case 'createEllipse': {
          const id = tempId ?? `__auto_${tempIdCounter++}`;
          const node: NodeState = {
            type: 'ellipse',
            x: (args.x as number) ?? 0,
            y: (args.y as number) ?? 0,
            width: (args.width as number) ?? 50,
            height: (args.height as number) ?? 50,
          };
          if (args.fills) {
            const fc = extractFillColor(args.fills as unknown[]);
            if (fc) { node.fill = fc.color; node.fillOpacity = fc.opacity; }
          }
          nodes.set(id, node);
          lastCreatedId = id;
          break;
        }

        case 'createVector': {
          const id = tempId ?? `__auto_${tempIdCounter++}`;
          const node: NodeState = {
            type: 'vector',
            x: (args.x as number) ?? 0,
            y: (args.y as number) ?? 0,
            width: 0,
            height: 0,
            pathData: (args.data as string) ?? '',
          };
          if (args.fills) {
            const fc = extractFillColor(args.fills as unknown[]);
            if (fc) { node.fill = fc.color; node.fillOpacity = fc.opacity; }
          }
          if (args.strokes) {
            const sc = extractStroke(args.strokes as unknown[]);
            if (sc) { node.stroke = sc.color; node.strokeWeight = sc.weight; }
          }
          nodes.set(id, node);
          lastCreatedId = id;
          break;
        }

        case 'setFill': {
          const targetId = resolveId(nodeId, lastCreatedId);
          const target = targetId ? nodes.get(targetId) : null;
          if (target && args.fills) {
            const fc = extractFillColor(args.fills as unknown[]);
            if (fc) { target.fill = fc.color; target.fillOpacity = fc.opacity; }
          }
          break;
        }

        case 'setStroke': {
          const targetId = resolveId(nodeId, lastCreatedId);
          const target = targetId ? nodes.get(targetId) : null;
          if (target && args.strokes) {
            const sc = extractStroke(args.strokes as unknown[]);
            if (sc) { target.stroke = sc.color; target.strokeWeight = sc.weight; }
          }
          if (target && typeof args.weight === 'number') {
            target.strokeWeight = args.weight;
          }
          break;
        }

        case 'applyImageFill': {
          if (args.imageBytes && Array.isArray(args.imageBytes)) {
            const id = tempId ?? `__auto_${tempIdCounter++}`;
            const node: NodeState = {
              type: 'image',
              x: (args.x as number) ?? 0,
              y: (args.y as number) ?? 0,
              width: (args.width as number) ?? 100,
              height: (args.height as number) ?? 100,
              imageBytes: args.imageBytes as number[],
            };
            nodes.set(id, node);
            lastCreatedId = id;
          }
          break;
        }
      }
    }

    // Determine canvas coordinate space from the root frame
    const frameW = rootFrame?.width ?? 300;
    const frameH = rootFrame?.height ?? 300;

    const dpr = window.devicePixelRatio || 1;
    const displayW = canvas.clientWidth;
    const displayH = canvas.clientHeight;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    ctx.scale(dpr, dpr);

    // Scale to fit
    const scaleX = displayW / frameW;
    const scaleY = displayH / frameH;
    const scale = Math.min(scaleX, scaleY) * 0.9;
    const offsetX = (displayW - frameW * scale) / 2;
    const offsetY = (displayH - frameH * scale) / 2;

    // Clear
    ctx.clearRect(0, 0, displayW, displayH);

    // Draw root frame background
    if (rootFrame?.fill) {
      ctx.fillStyle = rgbToCSS(rootFrame.fill, rootFrame.fillOpacity ?? 1);
      ctx.fillRect(offsetX, offsetY, frameW * scale, frameH * scale);
    }

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Render nodes (skip root frame)
    for (const [id, node] of nodes) {
      if (id === rootId) continue;
      renderNode(ctx, node);
    }

    ctx.restore();
  }, [actions]);

  return (
    <div className="dialkit-preview-wrapper">
      <canvas ref={canvasRef} className="dialkit-preview-canvas" />
      <span className="dialkit-preview-label">Preview</span>
    </div>
  );
}

function resolveId(nodeId: string | undefined, lastCreatedId: string | null): string | null {
  if (nodeId === '__prev') return lastCreatedId;
  return nodeId ?? lastCreatedId;
}

function renderNode(ctx: CanvasRenderingContext2D, node: NodeState) {
  const { type, x, y, width, height, fill, fillOpacity = 1, stroke, strokeWeight, cornerRadius, pathData, imageBytes } = node;

  switch (type) {
    case 'rectangle': {
      if (fill) {
        ctx.fillStyle = rgbToCSS(fill, fillOpacity);
        if (cornerRadius && cornerRadius > 0) {
          roundRect(ctx, x, y, width, height, cornerRadius);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, width, height);
        }
      }
      if (stroke && strokeWeight) {
        ctx.strokeStyle = rgbToCSS(stroke);
        ctx.lineWidth = strokeWeight;
        if (cornerRadius && cornerRadius > 0) {
          roundRect(ctx, x, y, width, height, cornerRadius);
          ctx.stroke();
        } else {
          ctx.strokeRect(x, y, width, height);
        }
      }
      break;
    }

    case 'ellipse': {
      ctx.beginPath();
      ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      if (fill) {
        ctx.fillStyle = rgbToCSS(fill, fillOpacity);
        ctx.fill();
      }
      if (stroke && strokeWeight) {
        ctx.strokeStyle = rgbToCSS(stroke);
        ctx.lineWidth = strokeWeight;
        ctx.stroke();
      }
      break;
    }

    case 'vector': {
      if (!pathData) break;
      try {
        const path = new Path2D(pathData);
        ctx.save();
        if (x || y) ctx.translate(x, y);
        if (fill) {
          ctx.fillStyle = rgbToCSS(fill, fillOpacity);
          ctx.fill(path);
        }
        if (stroke && strokeWeight) {
          ctx.strokeStyle = rgbToCSS(stroke);
          ctx.lineWidth = strokeWeight;
          ctx.stroke(path);
        }
        if (!fill && !stroke) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; // --light-tertiary
          ctx.lineWidth = 1;
          ctx.stroke(path);
        }
        ctx.restore();
      } catch {
        // Invalid SVG path -- skip silently
      }
      break;
    }

    case 'image': {
      if (!imageBytes?.length) break;
      try {
        const blob = new Blob([new Uint8Array(imageBytes)], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, x, y, width, height);
          URL.revokeObjectURL(url);
        };
        img.src = url;
      } catch {
        // Skip
      }
      break;
    }

    case 'frame': {
      if (fill) {
        ctx.fillStyle = rgbToCSS(fill, fillOpacity);
        ctx.fillRect(x, y, width, height);
      }
      break;
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}
