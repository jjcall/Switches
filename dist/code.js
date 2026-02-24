"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // src/main/selection-serializer.ts
  var CHAR_BUDGET = 8e3;
  function serializeFills(node) {
    if (!("fills" in node) || node.fills === figma.mixed) return [];
    const fills = node.fills;
    return fills.map((paint) => {
      var _a, _b, _c, _d;
      if (paint.type === "SOLID") {
        const p2 = paint;
        const result2 = {
          type: "SOLID",
          color: { r: p2.color.r, g: p2.color.g, b: p2.color.b },
          opacity: (_a = p2.opacity) != null ? _a : 1
        };
        return result2;
      }
      if (paint.type === "GRADIENT_LINEAR" || paint.type === "GRADIENT_RADIAL" || paint.type === "GRADIENT_ANGULAR" || paint.type === "GRADIENT_DIAMOND") {
        const p2 = paint;
        const result2 = {
          type: p2.type,
          gradientStops: p2.gradientStops.map((s) => ({
            position: s.position,
            color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a }
          })),
          opacity: (_b = p2.opacity) != null ? _b : 1
        };
        return result2;
      }
      const p = paint;
      const result = {
        type: "IMAGE",
        imageHash: (_c = p.imageHash) != null ? _c : null,
        opacity: (_d = p.opacity) != null ? _d : 1
      };
      return result;
    });
  }
  function serializeStrokes(node) {
    if (!("strokes" in node)) return [];
    const strokes = node.strokes;
    const weight = "strokeWeight" in node && node.strokeWeight !== figma.mixed ? node.strokeWeight : 1;
    const alignment = "strokeAlign" in node ? node.strokeAlign : "CENTER";
    return strokes.filter((p) => p.type === "SOLID").map((p) => {
      var _a;
      return {
        color: { r: p.color.r, g: p.color.g, b: p.color.b },
        opacity: (_a = p.opacity) != null ? _a : 1,
        weight,
        alignment
      };
    });
  }
  function serializeEffects(node) {
    if (!("effects" in node)) return [];
    const effects = node.effects;
    return effects.map((e) => {
      if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
        const shadow = e;
        const result2 = {
          type: e.type,
          color: {
            r: shadow.color.r,
            g: shadow.color.g,
            b: shadow.color.b,
            a: shadow.color.a
          },
          offset: { x: shadow.offset.x, y: shadow.offset.y },
          radius: shadow.radius,
          spread: "spread" in shadow ? shadow.spread : void 0,
          visible: shadow.visible
        };
        return result2;
      }
      const blur = e;
      const result = {
        type: blur.type,
        radius: blur.radius,
        visible: blur.visible
      };
      return result;
    });
  }
  function serializeReactions(node) {
    if (!("reactions" in node)) return void 0;
    const reactions = node.reactions;
    if (!reactions || reactions.length === 0) return void 0;
    return reactions.map((r) => {
      const trigger = r.trigger ? r.trigger.type : "NONE";
      let actionType = "NONE";
      let destinationId = null;
      if (r.action) {
        actionType = r.action.type;
        if (r.action.type === "NODE" && "destinationId" in r.action) {
          destinationId = r.action.destinationId;
        }
      }
      return { trigger, actionType, destinationId };
    });
  }
  function serializeTextProps(node) {
    const fontSize = node.fontSize !== figma.mixed ? node.fontSize : void 0;
    const fontName = node.fontName !== figma.mixed ? { family: node.fontName.family, style: node.fontName.style } : void 0;
    const lineHeight = node.lineHeight !== figma.mixed ? node.lineHeight : void 0;
    const letterSpacing = node.letterSpacing !== figma.mixed ? node.letterSpacing : void 0;
    return {
      fontSize,
      fontName,
      textAlignHorizontal: node.textAlignHorizontal,
      textAlignVertical: node.textAlignVertical,
      characters: node.characters.slice(0, 100),
      lineHeight: lineHeight ? { unit: lineHeight.unit, value: "value" in lineHeight ? lineHeight.value : void 0 } : void 0,
      letterSpacing: letterSpacing ? { unit: letterSpacing.unit, value: letterSpacing.value } : void 0
    };
  }
  function serializeChildren(node) {
    if (!("children" in node)) return { childCount: 0 };
    const children = node.children;
    return {
      childCount: children.length,
      children: children.map((c) => ({ id: c.id, type: c.type, name: c.name }))
    };
  }
  function serializeNode(node) {
    const { childCount, children } = serializeChildren(node);
    const base = {
      id: node.id,
      type: node.type,
      name: node.name,
      x: "x" in node ? node.x : 0,
      y: "y" in node ? node.y : 0,
      width: "width" in node ? node.width : 0,
      height: "height" in node ? node.height : 0,
      rotation: "rotation" in node ? node.rotation : 0,
      opacity: "opacity" in node ? node.opacity : 1,
      visible: "visible" in node ? node.visible : true,
      fills: serializeFills(node),
      strokes: serializeStrokes(node),
      effects: serializeEffects(node),
      parentId: node.parent ? node.parent.id : null,
      parentName: node.parent ? node.parent.name : null,
      childCount,
      children
    };
    if (node.type === "TEXT") {
      Object.assign(base, serializeTextProps(node));
    }
    const reactions = serializeReactions(node);
    if (reactions && reactions.length > 0) {
      base.reactions = reactions;
    }
    return base;
  }
  function applyTruncation(nodes) {
    const roughSize = JSON.stringify(nodes).length;
    if (roughSize <= CHAR_BUDGET) return { nodes, truncated: false };
    const truncated = nodes.map((node) => {
      if (!node.children || node.children.length === 0) return node;
      const MAX_CHILDREN = 5;
      if (node.children.length <= MAX_CHILDREN) return node;
      const kept = node.children.slice(0, MAX_CHILDREN);
      const omitted = node.children.length - MAX_CHILDREN;
      const summary = {
        id: "__truncated__",
        type: "SUMMARY",
        name: `\u2026and ${omitted} more children`
      };
      return __spreadProps(__spreadValues({}, node), { children: [...kept, summary] });
    });
    if (JSON.stringify(truncated).length > CHAR_BUDGET) {
      return {
        nodes: truncated.map((n) => __spreadProps(__spreadValues({}, n), { children: void 0 })),
        truncated: true
      };
    }
    return { nodes: truncated, truncated: true };
  }
  function serializeSelection(nodes) {
    if (nodes.length === 0) {
      return { nodes: [], truncated: false };
    }
    const serialized = nodes.map(serializeNode);
    const { nodes: final, truncated } = applyTruncation(serialized);
    return { nodes: final, truncated };
  }

  // src/main/action-executor.ts
  function resolveNode(nodeId, tempMap) {
    if (!nodeId) throw new Error("No nodeId provided.");
    const temp = tempMap.get(nodeId);
    if (temp) return temp;
    const node = figma.getNodeById(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (node.type === "DOCUMENT" || node.type === "PAGE") {
      throw new Error(`Cannot target document or page node: ${nodeId}`);
    }
    return node;
  }
  function resolveParent(parentId, tempMap) {
    var _a;
    if (!parentId) return figma.currentPage;
    const node = (_a = tempMap.get(parentId)) != null ? _a : figma.getNodeById(parentId);
    if (!node) throw new Error(`Parent node not found: ${parentId}`);
    if (node.type !== "FRAME" && node.type !== "GROUP" && node.type !== "COMPONENT" && node.type !== "COMPONENT_SET" && node.type !== "SECTION" && node.type !== "PAGE") {
      throw new Error(`Node ${parentId} (${node.type}) cannot contain children.`);
    }
    return node;
  }
  function toRGB(raw) {
    if (typeof raw !== "object" || raw === null) return { r: 0, g: 0, b: 0 };
    const c = raw;
    return {
      r: typeof c.r === "number" ? c.r : 0,
      g: typeof c.g === "number" ? c.g : 0,
      b: typeof c.b === "number" ? c.b : 0
    };
  }
  function toRGBA(raw) {
    const rgb = toRGB(raw);
    const c = raw;
    return __spreadProps(__spreadValues({}, rgb), { a: typeof c.a === "number" ? c.a : 1 });
  }
  function toPaints(rawFills) {
    if (!Array.isArray(rawFills)) return [];
    return rawFills.map((f) => {
      var _a;
      const fill = f;
      const type = String((_a = fill.type) != null ? _a : "SOLID");
      if (type === "SOLID") {
        return {
          type: "SOLID",
          color: toRGB(fill.color),
          opacity: typeof fill.opacity === "number" ? fill.opacity : 1
        };
      }
      if (type.startsWith("GRADIENT_")) {
        const stops = Array.isArray(fill.gradientStops) ? fill.gradientStops.map((s) => {
          const stop = s;
          return {
            position: typeof stop.position === "number" ? stop.position : 0,
            color: toRGBA(stop.color)
          };
        }) : [{ position: 0, color: { r: 0, g: 0, b: 0, a: 1 } }, { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } }];
        return {
          type,
          gradientTransform: [[1, 0, 0], [0, 1, 0]],
          gradientStops: stops,
          opacity: typeof fill.opacity === "number" ? fill.opacity : 1
        };
      }
      return { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0 };
    });
  }
  function toEffects(rawEffects) {
    if (!Array.isArray(rawEffects)) return [];
    return rawEffects.map((e) => {
      var _a;
      const effect = e;
      const type = String((_a = effect.type) != null ? _a : "DROP_SHADOW");
      if (type === "DROP_SHADOW" || type === "INNER_SHADOW") {
        const offsetRaw = effect.offset;
        return {
          type,
          color: toRGBA(effect.color),
          offset: {
            x: typeof (offsetRaw == null ? void 0 : offsetRaw.x) === "number" ? offsetRaw.x : 0,
            y: typeof (offsetRaw == null ? void 0 : offsetRaw.y) === "number" ? offsetRaw.y : 4
          },
          radius: typeof effect.radius === "number" ? effect.radius : 8,
          spread: typeof effect.spread === "number" ? effect.spread : 0,
          visible: effect.visible !== false,
          blendMode: "NORMAL",
          showShadowBehindNode: false
        };
      }
      if (type === "LAYER_BLUR" || type === "BACKGROUND_BLUR") {
        return {
          type,
          radius: typeof effect.radius === "number" ? effect.radius : 8,
          visible: effect.visible !== false
        };
      }
      return { type: "LAYER_BLUR", radius: 0, visible: false };
    });
  }
  function execCreateRectangle(args, tempMap, tempId) {
    const node = figma.createRectangle();
    if (typeof args.x === "number") node.x = args.x;
    if (typeof args.y === "number") node.y = args.y;
    if (typeof args.width === "number" && typeof args.height === "number") {
      node.resize(args.width, args.height);
    }
    const parent = resolveParent(void 0, tempMap);
    parent.appendChild(node);
    if (tempId) tempMap.set(tempId, node);
    return node;
  }
  function execCreateFrame(args, tempMap, tempId) {
    const node = figma.createFrame();
    if (typeof args.x === "number") node.x = args.x;
    if (typeof args.y === "number") node.y = args.y;
    if (typeof args.width === "number" && typeof args.height === "number") {
      node.resize(args.width, args.height);
    }
    const parent = resolveParent(void 0, tempMap);
    parent.appendChild(node);
    if (tempId) tempMap.set(tempId, node);
    return node;
  }
  function execCreateText(args, tempMap, tempId) {
    const node = figma.createText();
    if (typeof args.x === "number") node.x = args.x;
    if (typeof args.y === "number") node.y = args.y;
    if (typeof args.fontSize === "number") node.fontSize = args.fontSize;
    if (typeof args.characters === "string") node.characters = args.characters;
    const parent = resolveParent(void 0, tempMap);
    parent.appendChild(node);
    if (tempId) tempMap.set(tempId, node);
    return node;
  }
  function execSetProperty(node, args) {
    var _a;
    const prop = String((_a = args.property) != null ? _a : "");
    if (!prop) throw new Error('setProperty requires a "property" arg.');
    const value = "value" in args ? args.value : void 0;
    if (value === void 0) throw new Error(`setProperty: no "value" provided for property "${prop}".`);
    node[prop] = value;
  }
  function execSetFill(node, args) {
    var _a;
    if (!("fills" in node)) throw new Error(`Node type ${node.type} does not support fills.`);
    if (typeof args.value === "string" && args.value.startsWith("#")) {
      const hex = args.value.replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      node.fills = [{ type: "SOLID", color: { r, g, b }, opacity: 1 }];
      return;
    }
    const rawFills = (_a = args.fills) != null ? _a : Array.isArray(args.value) ? args.value : void 0;
    node.fills = toPaints(rawFills);
  }
  function execSetStroke(node, args) {
    var _a;
    if (!("strokes" in node)) throw new Error(`Node type ${node.type} does not support strokes.`);
    const rawStrokes = (_a = args.strokes) != null ? _a : Array.isArray(args.value) ? args.value : [];
    node.strokes = toPaints(rawStrokes);
    if (typeof args.weight === "number") {
      node.strokeWeight = args.weight;
    }
    if (typeof args.align === "string") {
      node.strokeAlign = args.align;
    }
  }
  function execSetEffect(node, args) {
    var _a;
    if (!("effects" in node)) throw new Error(`Node type ${node.type} does not support effects.`);
    const rawEffects = (_a = args.effects) != null ? _a : Array.isArray(args.value) ? args.value : [];
    node.effects = toEffects(rawEffects);
  }
  function execSetCornerRadius(node, args) {
    if (!("cornerRadius" in node)) throw new Error(`Node type ${node.type} does not support cornerRadius.`);
    const r = typeof args.radius === "number" ? args.radius : args.value;
    node.cornerRadius = r;
  }
  function execSetLayoutProperties(node, args) {
    if (node.type !== "FRAME" && node.type !== "COMPONENT" && node.type !== "INSTANCE") {
      throw new Error(`setLayoutProperties requires a Frame or Component, got ${node.type}.`);
    }
    const frame = node;
    if (typeof args.property === "string" && "value" in args) {
      frame[args.property] = args.value;
      return;
    }
    if (typeof args.layoutMode === "string") frame.layoutMode = args.layoutMode;
    if (typeof args.primaryAxisSizingMode === "string") frame.primaryAxisSizingMode = args.primaryAxisSizingMode;
    if (typeof args.counterAxisSizingMode === "string") frame.counterAxisSizingMode = args.counterAxisSizingMode;
    if (typeof args.itemSpacing === "number") frame.itemSpacing = args.itemSpacing;
    if (typeof args.paddingTop === "number") frame.paddingTop = args.paddingTop;
    if (typeof args.paddingRight === "number") frame.paddingRight = args.paddingRight;
    if (typeof args.paddingBottom === "number") frame.paddingBottom = args.paddingBottom;
    if (typeof args.paddingLeft === "number") frame.paddingLeft = args.paddingLeft;
    if (typeof args.padding === "number") {
      frame.paddingTop = frame.paddingRight = frame.paddingBottom = frame.paddingLeft = args.padding;
    }
  }
  function execResize(node, args) {
    if (!("resize" in node)) throw new Error(`Node type ${node.type} does not support resize.`);
    const w = typeof args.width === "number" ? args.width : node.width;
    const h = typeof args.height === "number" ? args.height : node.height;
    node.resize(w, h);
  }
  function execAppendChild(action, tempMap) {
    const child = resolveNode(action.nodeId, tempMap);
    const parent = resolveParent(action.parentId, tempMap);
    parent.appendChild(child);
  }
  function execDeleteNode(node) {
    node.remove();
  }
  function dispatchAction(action, tempMap) {
    const { method, nodeId, args, tempId } = action;
    const a = args != null ? args : {};
    switch (method) {
      case "createRectangle":
        return execCreateRectangle(a, tempMap, tempId);
      case "createFrame":
        return execCreateFrame(a, tempMap, tempId);
      case "createText":
        return execCreateText(a, tempMap, tempId);
      case "setProperty": {
        const node = resolveNode(nodeId, tempMap);
        execSetProperty(node, a);
        return null;
      }
      case "setFill": {
        const node = resolveNode(nodeId, tempMap);
        execSetFill(node, a);
        return null;
      }
      case "setStroke": {
        const node = resolveNode(nodeId, tempMap);
        execSetStroke(node, a);
        return null;
      }
      case "setEffect": {
        const node = resolveNode(nodeId, tempMap);
        execSetEffect(node, a);
        return null;
      }
      case "setCornerRadius": {
        const node = resolveNode(nodeId, tempMap);
        execSetCornerRadius(node, a);
        return null;
      }
      case "setLayoutProperties": {
        const node = resolveNode(nodeId, tempMap);
        execSetLayoutProperties(node, a);
        return null;
      }
      case "resize": {
        const node = resolveNode(nodeId, tempMap);
        execResize(node, a);
        return null;
      }
      case "appendChild":
        execAppendChild(action, tempMap);
        return null;
      case "deleteNode": {
        const node = resolveNode(nodeId, tempMap);
        execDeleteNode(node);
        return null;
      }
      default:
        throw new Error(`Unknown action method: "${method}"`);
    }
  }
  function executeActions(actions) {
    const errors = [];
    const createdNodeIds = [];
    let executedCount = 0;
    const tempMap = /* @__PURE__ */ new Map();
    figma.commitUndo();
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      try {
        const created = dispatchAction(action, tempMap);
        executedCount++;
        if (created) {
          createdNodeIds.push(created.id);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`[${i}] ${action.method}: ${msg}`);
        console.error(`[action-executor] action[${i}] ${action.method} failed:`, msg);
      }
    }
    figma.commitUndo();
    return {
      success: errors.length === 0,
      executedCount,
      errorCount: errors.length,
      errors,
      createdNodeIds
    };
  }
  function applyControlChange(action, value) {
    const tempMap = /* @__PURE__ */ new Map();
    const merged = __spreadProps(__spreadValues({}, action), {
      args: __spreadProps(__spreadValues({}, action.args), { value })
    });
    dispatchAction(merged, tempMap);
  }

  // src/main/message-handler.ts
  function handlePluginReady(_msg) {
    console.log("[main] iframe ready \u2014 sending selection context");
    sendSelectionContext();
  }
  function handleControlChange(msg) {
    const { controlId, value, action } = msg.payload;
    try {
      applyControlChange(action, value);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[main] control change failed for ${controlId}:`, message);
      figma.ui.postMessage({
        type: "ERROR",
        payload: { source: "control-change", message }
      });
    }
  }
  function handleExecuteActions(msg) {
    const { actions } = msg.payload;
    const result = executeActions(actions);
    const response = {
      type: "EXECUTION_RESULT",
      payload: result
    };
    figma.ui.postMessage(response);
  }
  function handleError(msg) {
    console.error(`[main] error from iframe (${msg.payload.source}):`, msg.payload.message);
  }
  function sendSelectionContext() {
    const payload = serializeSelection(figma.currentPage.selection);
    const message = {
      type: "SELECTION_CONTEXT",
      payload
    };
    figma.ui.postMessage(message);
  }
  function registerMessageHandler() {
    figma.ui.onmessage = (raw) => {
      if (!raw || typeof raw !== "object") {
        console.warn("[main] received non-object message:", raw);
        return;
      }
      const maybeResize = raw;
      if (maybeResize.type === "resize") {
        const width = typeof maybeResize.width === "number" ? maybeResize.width : 300;
        const height = typeof maybeResize.height === "number" ? maybeResize.height : 400;
        figma.ui.resize(width, height);
        return;
      }
      const msg = raw;
      switch (msg.type) {
        case "PLUGIN_READY":
          handlePluginReady(msg);
          break;
        case "CONTROL_CHANGE":
          handleControlChange(msg);
          break;
        case "EXECUTE_ACTIONS":
          handleExecuteActions(msg);
          break;
        case "ERROR":
          handleError(msg);
          break;
        default: {
          const _exhaustive = msg;
          console.warn("[main] unhandled message type:", _exhaustive.type);
        }
      }
    };
  }

  // src/main/code.ts
  figma.showUI(__html__, { width: 300, height: 120, title: "On-Demand Plugin" });
  registerMessageHandler();
  figma.on("selectionchange", () => {
    sendSelectionContext();
  });
  console.log("[main] Plugin loaded");
})();
