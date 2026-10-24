"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Google-Maps-style viewport for the seating floor plan.
//
// The floor plan itself is still laid out in plain "room pixels" by computeLayout;
// this hook decides how that room is shown inside a fixed-size window: a
// translate + scale on the content layer. It opens on a whole-room overview and
// lets people zoom and pan from there:
//   - touch: one finger drags the room, two fingers pinch-zoom, double-tap zooms in
//   - mouse: drag empty floor to pan, ctrl/⌘ + wheel (or trackpad pinch) zooms,
//     plain wheel / two-finger trackpad scroll pans, double-click zooms in
//   - keyboard (map focused): arrows pan, + / − zoom, 0 shows the whole room
//   - code: fit(), zoomBy(), flyTo() — animated unless the user prefers reduced motion
//
// Performance: while a gesture or animation is running, the transform is written
// straight onto the content layer's DOM node every frame — React doesn't
// re-render the (large) planner for each frame. The React-visible `view` is only
// updated ("committed") when the movement settles, for the bits of UI that care
// about the zoom level (the % readout, names-vs-dots, counter-scaled menus).
//
// Tables, fixtures and seats mark themselves with data-map-item. A mouse press on
// one of those is left alone (it drags the table, as before). Touches always
// start a pan, and a table only starts moving once a long-press hands control
// over via beginItemDrag() — otherwise a phone user couldn't pan a room full of
// tables without accidentally rearranging it.

export type View = { x: number; y: number; scale: number };

const MAX_SCALE = 3;
const PAN_THRESHOLD = 6; // px of finger travel before a touch counts as a pan, not a tap
const FIT_PADDING = 16;
const ANIM_MS = 260;

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function useMapViewport(contentWidth: number, contentHeight: number) {
  // Callback refs (not useRef) so measuring, the wheel listener and the transform
  // re-attach whenever the map is shown again after switching tabs or views.
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useCallback((el: HTMLDivElement | null) => {
    elRef.current = el;
    setViewportEl(el);
  }, []);

  const [view, setViewState] = useState<View>({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view);
  const contentEl = useRef<HTMLDivElement | null>(null);

  const applyTransform = useCallback((v: View) => {
    const el = contentEl.current;
    if (el) el.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.scale})`;
  }, []);
  const contentRef = useCallback(
    (el: HTMLDivElement | null) => {
      contentEl.current = el;
      if (el) {
        el.style.transformOrigin = "0 0";
        el.style.willChange = "transform";
        applyTransform(viewRef.current);
      }
    },
    [applyTransform]
  );

  const [size, setSize] = useState({ width: 0, height: 0 });

  // Once someone pans or zooms by hand we stop auto-fitting, so the view doesn't
  // jump around under them when tables move. fit() turns auto-fit back on.
  const userAdjusted = useRef(false);
  // True while a table/fixture/resize drag owns the gesture.
  const itemDragActive = useRef(false);
  // Set after a pan so the click that the browser fires at the end of it doesn't
  // also count as "tap this seat".
  const suppressClick = useRef(false);

  // commit=false: move the picture only (mid-gesture). commit=true: also tell React.
  const setView = useCallback(
    (v: View, commit: boolean) => {
      viewRef.current = v;
      applyTransform(v);
      if (commit) setViewState(v);
    },
    [applyTransform]
  );
  const commitView = useCallback(() => setViewState(viewRef.current), []);

  // ---- Animation ----
  const animFrame = useRef<number | null>(null);
  const stopAnimation = useCallback(() => {
    if (animFrame.current != null) {
      cancelAnimationFrame(animFrame.current);
      animFrame.current = null;
      commitView();
    }
  }, [commitView]);

  const animateTo = useCallback(
    (target: View) => {
      if (animFrame.current != null) cancelAnimationFrame(animFrame.current);
      animFrame.current = null;
      const from = viewRef.current;
      if (prefersReducedMotion()) {
        setView(target, true);
        return;
      }
      const start = performance.now();
      // Interpolate zoom in log space so zooming in and out feel equally paced.
      const logFrom = Math.log(from.scale);
      const logTo = Math.log(target.scale);
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ANIM_MS);
        const k = easeOutCubic(t);
        setView(
          {
            scale: Math.exp(logFrom + (logTo - logFrom) * k),
            x: from.x + (target.x - from.x) * k,
            y: from.y + (target.y - from.y) * k,
          },
          t === 1
        );
        animFrame.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      animFrame.current = requestAnimationFrame(step);
    },
    [setView]
  );
  useEffect(() => () => {
    if (animFrame.current != null) cancelAnimationFrame(animFrame.current);
  }, []);

  // ---- Geometry ----
  const fitScale = useCallback(() => {
    if (!size.width || !size.height || !contentWidth || !contentHeight) return 1;
    return Math.min(
      (size.width - FIT_PADDING * 2) / contentWidth,
      (size.height - FIT_PADDING * 2) / contentHeight,
      1.25
    );
  }, [size.width, size.height, contentWidth, contentHeight]);

  const minScale = useCallback(() => Math.min(0.15, fitScale() * 0.6), [fitScale]);

  const clampScale = useCallback(
    (s: number) => Math.max(minScale(), Math.min(MAX_SCALE, s)),
    [minScale]
  );

  // Keep the room within its limits. When it's larger than the screen on an
  // axis, its edges can't be dragged past the screen's edges (no empty space
  // beyond the plan); when it's smaller, it stays fully on screen.
  const clampPan = useCallback(
    (v: View): View => {
      if (!size.width || !size.height) return v;
      const pad = FIT_PADDING;
      const axis = (pos: number, content: number, viewport: number) => {
        if (content + pad * 2 <= viewport) {
          return Math.min(viewport - content - pad, Math.max(pad, pos));
        }
        return Math.min(pad, Math.max(viewport - content - pad, pos));
      };
      return {
        scale: v.scale,
        x: axis(v.x, contentWidth * v.scale, size.width),
        y: axis(v.y, contentHeight * v.scale, size.height),
      };
    },
    [size.width, size.height, contentWidth, contentHeight]
  );

  const fitView = useCallback((): View | null => {
    if (!size.width || !size.height) return null;
    const scale = fitScale();
    return {
      scale,
      x: (size.width - contentWidth * scale) / 2,
      y: (size.height - contentHeight * scale) / 2,
    };
  }, [size.width, size.height, contentWidth, contentHeight, fitScale]);

  // Show the whole room. animate=false for the automatic fit on load/resize.
  const fit = useCallback(
    (animate = true) => {
      userAdjusted.current = false;
      const target = fitView();
      if (!target) return;
      if (animate) animateTo(target);
      else {
        stopAnimation();
        setView(target, true);
      }
    },
    [fitView, animateTo, stopAnimation, setView]
  );

  // The view that zooms to nextScale while keeping room point under (px, py) — viewport coordinates — put.
  const zoomedView = useCallback(
    (px: number, py: number, nextScale: number, from: View = viewRef.current): View => {
      const scale = clampScale(nextScale);
      const roomX = (px - from.x) / from.scale;
      const roomY = (py - from.y) / from.scale;
      return clampPan({ scale, x: px - roomX * scale, y: py - roomY * scale });
    },
    [clampScale, clampPan]
  );

  const zoomBy = useCallback(
    (factor: number) => {
      userAdjusted.current = true;
      // Chain from where an in-flight animation is heading would be nicer, but
      // starting from the current frame is predictable and good enough.
      animateTo(zoomedView(size.width / 2, size.height / 2, viewRef.current.scale * factor));
    },
    [animateTo, zoomedView, size.width, size.height]
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      userAdjusted.current = true;
      const v = viewRef.current;
      animateTo(clampPan({ scale: v.scale, x: v.x + dx, y: v.y + dy }));
    },
    [animateTo, clampPan]
  );

  // Fly so a room-space box (centre cx, cy; size w × h) fills the window, zoomed
  // in no further than maxScale and no less than minZoom.
  const flyTo = useCallback(
    (cx: number, cy: number, w: number, h: number, opts: { maxScale?: number; minZoom?: number } = {}) => {
      if (!size.width || !size.height) return;
      userAdjusted.current = true;
      const fitBox = Math.min((size.width - FIT_PADDING * 2) / w, (size.height - FIT_PADDING * 2) / h);
      const scale = clampScale(Math.max(opts.minZoom ?? 0, Math.min(opts.maxScale ?? 1.4, fitBox)));
      animateTo(clampPan({ scale, x: size.width / 2 - cx * scale, y: size.height / 2 - cy * scale }));
    },
    [size.width, size.height, clampScale, clampPan, animateTo]
  );

  // Screen point → room coordinates (for "tap where the table should go").
  const toRoom = useCallback((clientX: number, clientY: number) => {
    const rect = elRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (clientX - (rect?.left ?? 0) - v.x) / v.scale,
      y: (clientY - (rect?.top ?? 0) - v.y) / v.scale,
    };
  }, []);

  // Track the window's size.
  useLayoutEffect(() => {
    const el = viewportEl;
    if (!el) {
      setSize((prev) => (prev.width === 0 && prev.height === 0 ? prev : { width: 0, height: 0 }));
      return;
    }
    // Coming back to the map starts from the whole-room overview again.
    userAdjusted.current = false;
    const measure = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewportEl]);

  // Whole-room overview until the user takes over.
  useEffect(() => {
    if (!userAdjusted.current) fit(false);
  }, [fit]);

  // ---- Pointer gestures (pan + pinch) ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: "pan"; startX: number; startY: number; from: View; moved: boolean }
    | { kind: "pinch"; startDist: number; startMidX: number; startMidY: number; from: View }
    | null
  >(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const localPoint = (clientX: number, clientY: number) => {
    const rect = elRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  };

  const startPan = (p: { x: number; y: number }) => {
    gesture.current = { kind: "pan", startX: p.x, startY: p.y, from: viewRef.current, moved: false };
  };

  const startPinch = () => {
    const [a, b] = Array.from(pointers.current.values());
    gesture.current = {
      kind: "pinch",
      startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      startMidX: (a.x + b.x) / 2,
      startMidY: (a.y + b.y) / 2,
      from: viewRef.current,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // A new gesture starts fresh: forget the "that was a pan" flag from the last one.
    if (pointers.current.size === 0) suppressClick.current = false;
    if (itemDragActive.current) return;
    const target = e.target as HTMLElement;
    const onItem = !!target.closest("[data-map-item]");
    const onControl = !!target.closest("[data-map-control]");
    if (onControl) return;
    // Mouse on a table/seat: that element handles it (drag table, drag guest).
    if (e.pointerType === "mouse" && (onItem || e.button !== 0)) return;

    stopAnimation(); // grabbing the map mid-glide catches it where it is
    const p = localPoint(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);
    if (e.pointerType === "mouse") elRef.current?.setPointerCapture(e.pointerId);

    if (pointers.current.size === 1) startPan(p);
    else if (pointers.current.size === 2) startPinch();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = localPoint(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (itemDragActive.current) {
      // A long-press just picked up a table — stop moving the room under it.
      gesture.current = null;
      return;
    }

    if (g.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const scale = clampScale(g.from.scale * (dist / g.startDist));
      const roomX = (g.startMidX - g.from.x) / g.from.scale;
      const roomY = (g.startMidY - g.from.y) / g.from.scale;
      userAdjusted.current = true;
      suppressClick.current = true;
      setView(clampPan({ scale, x: midX - roomX * scale, y: midY - roomY * scale }), false);
      return;
    }

    if (g.kind === "pan") {
      const dx = p.x - g.startX;
      const dy = p.y - g.startY;
      if (!g.moved && Math.hypot(dx, dy) < PAN_THRESHOLD) return;
      g.moved = true;
      userAdjusted.current = true;
      suppressClick.current = true;
      setView(clampPan({ scale: g.from.scale, x: g.from.x + dx, y: g.from.y + dy }), false);
    }
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = pointers.current.get(e.pointerId)!;
    const g = gesture.current;
    pointers.current.delete(e.pointerId);

    // Double-tap / double-click on empty floor zooms in, like a map.
    if (
      e.type === "pointerup" &&
      g?.kind === "pan" &&
      !g.moved &&
      pointers.current.size === 0 &&
      !(e.target as HTMLElement).closest("[data-map-item]")
    ) {
      const now = Date.now();
      const prev = lastTap.current;
      if (prev && now - prev.t < 320 && Math.hypot(prev.x - p.x, prev.y - p.y) < 30) {
        userAdjusted.current = true;
        animateTo(zoomedView(p.x, p.y, viewRef.current.scale * 2));
        lastTap.current = null;
      } else {
        lastTap.current = { t: now, x: p.x, y: p.y };
      }
    }

    if (pointers.current.size === 1) {
      // Lifted one finger of a pinch — carry on panning with the other without a jump.
      startPan(Array.from(pointers.current.values())[0]);
      if (gesture.current?.kind === "pan") gesture.current.moved = true;
    } else if (pointers.current.size === 0) {
      gesture.current = null;
      if (animFrame.current == null) commitView();
      // suppressClick stays set until the click it's meant to swallow arrives
      // (onClickCapture) or the next gesture begins (onPointerDown).
    }
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      e.stopPropagation();
      e.preventDefault();
      suppressClick.current = false;
    }
  };

  // Keyboard, when the map itself has focus (not a table-name field inside it).
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== elRef.current) return;
    const step = e.shiftKey ? 240 : 80;
    switch (e.key) {
      case "ArrowLeft":
        panBy(step, 0);
        break;
      case "ArrowRight":
        panBy(-step, 0);
        break;
      case "ArrowUp":
        panBy(0, step);
        break;
      case "ArrowDown":
        panBy(0, -step);
        break;
      case "+":
      case "=":
        zoomBy(1.4);
        break;
      case "-":
      case "_":
        zoomBy(1 / 1.4);
        break;
      case "0":
        fit();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  // Wheel needs a non-passive native listener so it can stop the page scrolling.
  const wheelCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const el = viewportEl;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopAnimation();
      const p = localPoint(e.clientX, e.clientY);
      userAdjusted.current = true;
      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinch arrives as ctrl+wheel with small deltas; mouse wheel + ctrl has big ones.
        const factor = Math.exp(-e.deltaY * (Math.abs(e.deltaY) < 50 ? 0.01 : 0.002));
        setView(zoomedView(p.x, p.y, viewRef.current.scale * factor), false);
      } else {
        const v = viewRef.current;
        setView(clampPan({ scale: v.scale, x: v.x - e.deltaX, y: v.y - e.deltaY }), false);
      }
      if (wheelCommitTimer.current) clearTimeout(wheelCommitTimer.current);
      wheelCommitTimer.current = setTimeout(commitView, 150);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (wheelCommitTimer.current) clearTimeout(wheelCommitTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportEl, zoomedView, clampPan, setView, stopAnimation, commitView]);

  // Table/fixture drags call these so their pixel deltas account for zoom, and so
  // the room doesn't pan while a table is being carried.
  const beginItemDrag = useCallback(() => {
    itemDragActive.current = true;
    userAdjusted.current = true;
    gesture.current = null;
  }, []);
  const endItemDrag = useCallback(() => {
    itemDragActive.current = false;
  }, []);
  const getScale = useCallback(() => viewRef.current.scale, []);

  return {
    viewportRef,
    contentRef,
    /** Settled view — updates when a gesture or animation ends, not every frame. */
    view,
    size,
    fit,
    zoomBy,
    flyTo,
    toRoom,
    beginItemDrag,
    endItemDrag,
    getScale,
    minScale: minScale(),
    maxScale: MAX_SCALE,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onClickCapture,
      onKeyDown,
    },
  };
}
