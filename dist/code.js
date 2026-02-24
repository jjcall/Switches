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
  var __objRest = (source, exclude) => {
    var target = {};
    for (var prop in source)
      if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
        target[prop] = source[prop];
    if (source != null && __getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(source)) {
        if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
          target[prop] = source[prop];
      }
    return target;
  };

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
  async function resolveNode(nodeId, tempMap) {
    if (!nodeId) throw new Error("No nodeId provided.");
    const temp = tempMap.get(nodeId);
    if (temp) return temp;
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (node.type === "DOCUMENT" || node.type === "PAGE") {
      throw new Error(`Cannot target document or page node: ${nodeId}`);
    }
    return node;
  }
  async function resolveParent(parentId, tempMap) {
    var _a;
    if (!parentId) return figma.currentPage;
    const node = (_a = tempMap.get(parentId)) != null ? _a : await figma.getNodeByIdAsync(parentId);
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
        const color = toRGBA(effect.color);
        if (typeof effect.opacity === "number") {
          color.a = effect.opacity;
        }
        return {
          type,
          color,
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
  async function execCreateRectangle(args, tempMap, tempId, parentId) {
    const node = figma.createRectangle();
    if (typeof args.x === "number") node.x = args.x;
    if (typeof args.y === "number") node.y = args.y;
    if (typeof args.width === "number" && typeof args.height === "number") {
      node.resize(args.width, args.height);
    }
    if (typeof args.cornerRadius === "number") {
      node.cornerRadius = args.cornerRadius;
    }
    const parent = await resolveParent(parentId, tempMap);
    parent.appendChild(node);
    if (tempId) tempMap.set(tempId, node);
    return node;
  }
  async function execCreateFrame(args, tempMap, tempId, parentId) {
    const node = figma.createFrame();
    if (typeof args.x === "number") node.x = args.x;
    if (typeof args.y === "number") node.y = args.y;
    if (typeof args.width === "number" && typeof args.height === "number") {
      node.resize(args.width, args.height);
    }
    const parent = await resolveParent(parentId, tempMap);
    parent.appendChild(node);
    if (tempId) tempMap.set(tempId, node);
    return node;
  }
  async function execCreateText(args, tempMap, tempId, parentId) {
    const node = figma.createText();
    if (typeof args.x === "number") node.x = args.x;
    if (typeof args.y === "number") node.y = args.y;
    if (typeof args.fontSize === "number") node.fontSize = args.fontSize;
    if (typeof args.characters === "string") node.characters = args.characters;
    const parent = await resolveParent(parentId, tempMap);
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
    const property = typeof args.property === "string" ? args.property : null;
    if (property !== null && "value" in args) {
      const geoNode = node;
      const fills = geoNode.fills.map((f) => __spreadValues({}, f));
      if (fills.length > 0) {
        fills[0][property] = args.value;
        geoNode.fills = fills;
      }
      return;
    }
    const rawFills = (_a = args.fills) != null ? _a : Array.isArray(args.value) ? args.value : void 0;
    node.fills = toPaints(rawFills);
  }
  function execSetStroke(node, args) {
    var _a;
    if (!("strokes" in node)) throw new Error(`Node type ${node.type} does not support strokes.`);
    const property = typeof args.property === "string" ? args.property : null;
    if (property !== null && "value" in args) {
      const geoNode = node;
      if (property === "strokeWeight" || property === "weight") {
        geoNode.strokeWeight = args.value;
        return;
      }
      if (property === "strokeAlign" || property === "align") {
        geoNode.strokeAlign = args.value;
        return;
      }
      const strokes = geoNode.strokes.map((s) => __spreadValues({}, s));
      if (strokes.length > 0) {
        strokes[0][property] = args.value;
        geoNode.strokes = strokes;
      }
      return;
    }
    const rawStrokes = (_a = args.strokes) != null ? _a : Array.isArray(args.value) ? args.value : [];
    node.strokes = toPaints(rawStrokes);
    if (typeof args.weight === "number") {
      node.strokeWeight = args.weight;
    }
    if (typeof args.align === "string") {
      node.strokeAlign = args.align;
    }
  }
  function makeDefaultEffect(type) {
    if (type === "DROP_SHADOW" || type === "INNER_SHADOW") {
      return {
        type,
        color: { r: 0, g: 0, b: 0, a: 0.25 },
        offset: { x: 0, y: 4 },
        radius: 8,
        spread: 0,
        visible: true,
        blendMode: "NORMAL",
        showShadowBehindNode: false
      };
    }
    return {
      type: type === "BACKGROUND_BLUR" ? "BACKGROUND_BLUR" : "LAYER_BLUR",
      radius: 8,
      visible: true
    };
  }
  function execSetEffect(node, args) {
    if (!("effects" in node)) throw new Error(`Node type ${node.type} does not support effects.`);
    if (args.effects !== void 0) {
      node.effects = toEffects(args.effects);
      return;
    }
    if (Array.isArray(args.value)) {
      node.effects = toEffects(args.value);
      return;
    }
    const property = typeof args.property === "string" ? args.property : null;
    if (property !== null && "value" in args) {
      const blendNode = node;
      const effectType = typeof args.effectType === "string" ? args.effectType : "DROP_SHADOW";
      const effectIndex = typeof args.effectIndex === "number" ? args.effectIndex : 0;
      const effects = blendNode.effects.map((e) => {
        const clone = __spreadValues({}, e);
        if (clone.offset && typeof clone.offset === "object") {
          clone.offset = __spreadValues({}, clone.offset);
        }
        if (clone.color && typeof clone.color === "object") {
          clone.color = __spreadValues({}, clone.color);
        }
        return clone;
      });
      let idx = effects.findIndex((e) => e.type === effectType);
      if (idx < 0) idx = effectIndex;
      if (idx < 0 || idx >= effects.length) {
        const defaultEffect = makeDefaultEffect(effectType);
        effects.push(defaultEffect);
        idx = effects.length - 1;
      }
      const target = effects[idx];
      if (property === "offsetX") {
        target.offset.x = args.value;
      } else if (property === "offsetY") {
        target.offset.y = args.value;
      } else if (property === "opacity") {
        target.color.a = args.value;
      } else {
        target[property] = args.value;
      }
      blendNode.effects = effects;
      return;
    }
    console.warn("[setEffect] could not determine update intent from args:", args);
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
    if (typeof args.layoutWrap === "string") frame.layoutWrap = args.layoutWrap;
    if (typeof args.primaryAxisSizingMode === "string") frame.primaryAxisSizingMode = args.primaryAxisSizingMode;
    if (typeof args.counterAxisSizingMode === "string") frame.counterAxisSizingMode = args.counterAxisSizingMode;
    if (typeof args.itemSpacing === "number") frame.itemSpacing = args.itemSpacing;
    if (typeof args.counterAxisSpacing === "number") frame.counterAxisSpacing = args.counterAxisSpacing;
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
  async function execAppendChild(action, tempMap) {
    const child = await resolveNode(action.nodeId, tempMap);
    const parent = await resolveParent(action.parentId, tempMap);
    parent.appendChild(child);
  }
  function execDeleteNode(node) {
    node.remove();
  }
  var lastCreatedNode = null;
  async function dispatchAction(action, tempMap) {
    const { method, args, tempId } = action;
    let { nodeId, parentId } = action;
    const a = args != null ? args : {};
    if (nodeId === "__prev" && lastCreatedNode) nodeId = lastCreatedNode.id;
    if (parentId === "__prev" && lastCreatedNode) parentId = lastCreatedNode.id;
    switch (method) {
      case "createRectangle": {
        const created = await execCreateRectangle(a, tempMap, tempId, parentId);
        lastCreatedNode = created;
        return created;
      }
      case "createFrame": {
        const created = await execCreateFrame(a, tempMap, tempId, parentId);
        lastCreatedNode = created;
        return created;
      }
      case "createText": {
        const created = await execCreateText(a, tempMap, tempId, parentId);
        lastCreatedNode = created;
        return created;
      }
      case "setProperty": {
        const node = await resolveNode(nodeId, tempMap);
        execSetProperty(node, a);
        return null;
      }
      case "setFill": {
        const node = await resolveNode(nodeId, tempMap);
        execSetFill(node, a);
        return null;
      }
      case "setStroke": {
        const node = await resolveNode(nodeId, tempMap);
        execSetStroke(node, a);
        return null;
      }
      case "setEffect": {
        const node = await resolveNode(nodeId, tempMap);
        execSetEffect(node, a);
        return null;
      }
      case "setCornerRadius": {
        const node = await resolveNode(nodeId, tempMap);
        execSetCornerRadius(node, a);
        return null;
      }
      case "setLayoutProperties": {
        const node = await resolveNode(nodeId, tempMap);
        execSetLayoutProperties(node, a);
        return null;
      }
      case "resize": {
        const node = await resolveNode(nodeId, tempMap);
        execResize(node, a);
        return null;
      }
      case "appendChild":
        await execAppendChild(action, tempMap);
        return null;
      case "deleteNode": {
        try {
          const node = await resolveNode(nodeId, tempMap);
          execDeleteNode(node);
        } catch (e) {
        }
        return null;
      }
      case "deleteChildren": {
        const node = await resolveNode(nodeId, tempMap);
        if ("children" in node) {
          const parent = node;
          for (let ci = parent.children.length - 1; ci >= 0; ci--) {
            parent.children[ci].remove();
          }
        }
        return null;
      }
      default:
        throw new Error(`Unknown action method: "${method}"`);
    }
  }
  async function executeActions(actions, pluginSpec) {
    const errors = [];
    const createdNodeIds = [];
    let executedCount = 0;
    let rootFrameId;
    const tempMap = /* @__PURE__ */ new Map();
    lastCreatedNode = null;
    figma.commitUndo();
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      try {
        const created = await dispatchAction(action, tempMap);
        executedCount++;
        if (created && !action.parentId) {
          createdNodeIds.push(created.id);
          if (!rootFrameId && created.type === "FRAME") {
            rootFrameId = created.id;
          }
        }
        if (action.method === "deleteChildren" && action.nodeId && !rootFrameId) {
          rootFrameId = action.nodeId;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`[${i}] ${action.method}: ${msg}`);
        console.error(`[action-executor] action[${i}] ${action.method} failed:`, msg);
      }
    }
    if (pluginSpec && rootFrameId) {
      try {
        const rootNode = await figma.getNodeByIdAsync(rootFrameId);
        if (rootNode && "setPluginData" in rootNode) {
          rootNode.setPluginData("pluginSpec", pluginSpec);
        }
      } catch (err) {
        console.warn("[action-executor] failed to persist pluginSpec:", err);
      }
    }
    figma.commitUndo();
    const tempIdMap = {};
    for (const [tempId, node] of tempMap.entries()) {
      tempIdMap[tempId] = node.id;
    }
    return {
      success: errors.length === 0,
      executedCount,
      errorCount: errors.length,
      errors,
      createdNodeIds,
      tempIdMap,
      rootFrameId
    };
  }
  async function applyControlChange(action, value) {
    const tempMap = /* @__PURE__ */ new Map();
    let effectiveValue = value;
    if (typeof value === "number") {
      const scale = typeof action.args.scale === "number" ? action.args.scale : 1;
      const offset = typeof action.args.offset === "number" ? action.args.offset : 0;
      effectiveValue = value * scale + offset;
    }
    let mergedArgs = __spreadProps(__spreadValues({}, action.args), { value: effectiveValue });
    if (action.method === "setEffect" && Array.isArray(mergedArgs.effects)) {
      console.warn('[applyControlChange] stripping "effects" array from control setEffect \u2014 use property patch form instead.');
      const _a = mergedArgs, { effects: _removed } = _a, patchArgs = __objRest(_a, ["effects"]);
      mergedArgs = patchArgs;
    }
    const merged = __spreadProps(__spreadValues({}, action), {
      args: mergedArgs
    });
    await dispatchAction(merged, tempMap);
  }

  // src/main/message-handler.ts
  function handlePluginReady(_msg) {
    console.log("[main] iframe ready \u2014 sending selection context");
    sendSelectionContext();
  }
  function handleControlChange(msg) {
    const { controlId, value, action, actions } = msg.payload;
    const toApply = (actions == null ? void 0 : actions.length) ? actions : action ? [action] : [];
    if (toApply.length === 0) return;
    Promise.all(toApply.map((a) => applyControlChange(a, value))).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[main] control change failed for ${controlId}:`, message);
      figma.ui.postMessage({
        type: "ERROR",
        payload: { source: "control-change", message }
      });
    });
  }
  function handleExecuteActions(msg) {
    const { actions, pluginSpec } = msg.payload;
    executeActions(actions, pluginSpec).then((result) => {
      const response = {
        type: "EXECUTION_RESULT",
        payload: result
      };
      figma.ui.postMessage(response);
    }).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[main] executeActions threw unexpectedly:", message);
      figma.ui.postMessage({
        type: "ERROR",
        payload: { source: "execute-actions", message }
      });
    });
  }
  function handleError(msg) {
    console.error(`[main] error from iframe (${msg.payload.source}):`, msg.payload.message);
  }
  async function handleClaudeRequest(msg) {
    const { requestId, apiKey, body } = msg.payload;
    let ok = false;
    let status = 0;
    let responseBody = "";
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body
      });
      ok = response.ok;
      status = response.status;
      responseBody = await response.text();
    } catch (err) {
      let message = "Unknown fetch error";
      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === "string") {
        message = err;
      } else if (err && typeof err === "object") {
        const e = err;
        message = typeof e.message === "string" ? e.message : JSON.stringify(err);
      }
      responseBody = JSON.stringify({ error: { message } });
      status = 0;
    }
    const reply = {
      type: "CLAUDE_RESPONSE",
      payload: { requestId, ok, status, body: responseBody }
    };
    figma.ui.postMessage(reply);
  }
  function sendSelectionContext() {
    const payload = serializeSelection(figma.currentPage.selection);
    const selection = figma.currentPage.selection;
    for (const node of selection) {
      try {
        const spec = node.getPluginData("pluginSpec");
        if (spec) {
          payload.pluginSpec = spec;
          break;
        }
      } catch (e) {
      }
    }
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
        case "CLAUDE_REQUEST":
          void handleClaudeRequest(msg);
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
