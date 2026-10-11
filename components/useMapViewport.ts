"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Google-Maps-style viewport for the seating floor plan.
//
// The floor plan itself is still laid out in plain "room pixels" by computeLayout;
// this hook just decides how that room is shown inside a fixed-size window:
// a translate + scale applied to the content. It opens on a whole-room overview
// and lets people zoom and pan from there:
//   - touch: one finger drags the room, two fingers pinch-zoom, double-tap zooms in
//   - mouse: drag empty floor to pan, ctrl/⌘ + wheel (or trackpad pinch) zooms,
//     plain wheel / two-finger trackpad scroll pans, double-click zooms in
//   - buttons: zoomBy() and fit() for the on-screen +, − and Fit controls
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

export function useMapViewport(contentWidth: number, contentHeight: number) {
  // Callback ref (not useRef) so measuring and the wheel listener re-attach
  // whenever the map is shown again after switching tabs or views.
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useCallback((el: HTMLDivElement | null) => {
    elRef.current = el;
    setViewportEl(el);
  }, []);
  const [view, setViewState] = useState<View>({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Once someone pans or zooms by hand we stop auto-fitting, so the view doesn't
  // jump around under them when tables move. fit() turns auto-fit back on.
  const userAdjusted = useRef(false);
  // True while a table/fixture/resize drag owns the gesture.
  const itemDragActive = useRef(false);
  // Set after a pan so the click that the browser fires at the end of it doesn't
  // also count as "tap this seat".
  const suppressClick = useRef(false);

  const setView = useCallback((v: View) => {
    viewRef.current = v;
    setViewState(v);
  }, []);

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

  // Keep at least a sliver of the room on screen so it can't be flung away and lost.
  const clampPan = useCallback(
    (v: View): View => {
      if (!size.width || !size.height) return v;
      const margin = 80;
      const w = contentWidth * v.scale;
      const h = contentHeight * v.scale;
      return {
        scale: v.scale,
        x: Math.min(size.width - margin, Math.max(margin - w, v.x)),
        y: Math.min(size.height - margin, Math.max(margin - h, v.y)),
      };
    },
    [size.width, size.height, contentWidth, contentHeight]
  );

  const fit = useCallback(() => {
    userAdjusted.current = false;
    if (!size.width || !size.height) return;
    const scale = fitScale();
    setView({
      scale,
      x: (size.width - contentWidth * scale) / 2,
      y: (size.height - contentHeight * scale) / 2,
    });
  }, [size.width, size.height, contentWidth, contentHeight, fitScale, setView]);

  // Zoom so the room point under (px, py) — viewport coordinates — stays put.
  const zoomAt = useCallback(
    (px: number, py: number, nextScale: number, from: View = viewRef.current) => {
      const scale = clampScale(nextScale);
      const roomX = (px - from.x) / from.scale;
      const roomY = (py - from.y) / from.scale;
      userAdjusted.current = true;
      setView(clampPan({ scale, x: px - roomX * scale, y: py - roomY * scale }));
    },
    [clampScale, clampPan, setView]
  );

  const zoomBy = useCallback(
    (factor: number) => zoomAt(size.width / 2, size.height / 2, viewRef.current.scale * factor),
    [zoomAt, size.width, size.height]
  );

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
    if (!userAdjusted.current) fit();
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
      setView(clampPan({ scale, x: midX - roomX * scale, y: midY - roomY * scale }));
      return;
    }

    if (g.kind === "pan") {
      const dx = p.x - g.startX;
      const dy = p.y - g.startY;
      if (!g.moved && Math.hypot(dx, dy) < PAN_THRESHOLD) return;
      g.moved = true;
      userAdjusted.current = true;
      suppressClick.current = true;
      setView(clampPan({ scale: g.from.scale, x: g.from.x + dx, y: g.from.y + dy }));
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
        zoomAt(p.x, p.y, viewRef.current.scale * 2);
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

  // Wheel needs a non-passive native listener so it can stop the page scrolling.
  useEffect(() => {
    const el = viewportEl;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = localPoint(e.clientX, e.clientY);
      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinch arrives as ctrl+wheel with small deltas; mouse wheel + ctrl has big ones.
        const factor = Math.exp(-e.deltaY * (Math.abs(e.deltaY) < 50 ? 0.01 : 0.002));
        zoomAt(p.x, p.y, viewRef.current.scale * factor);
      } else {
        const v = viewRef.current;
        userAdjusted.current = true;
        setView(clampPan({ scale: v.scale, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportEl, zoomAt, clampPan, setView]);

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
    view,
    size,
    fit,
    zoomBy,
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
    },
  };
}
