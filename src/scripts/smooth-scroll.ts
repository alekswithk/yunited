// Match the reference's wheel easing while leaving touch and keyboard native.
export function initSmoothScroll() {
  const enabled = window.matchMedia(
    "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
  );
  let frame = 0;
  let target = window.scrollY;
  let position = window.scrollY;
  let lastPosition = window.scrollY;
  let lastTime = 0;

  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    target = window.scrollY;
  };
  const limit = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  const tick = (time: number) => {
    // An anchor, focus change or browser navigation may have moved the page.
    if (Math.abs(window.scrollY - lastPosition) > 2) {
      stop();
      return;
    }
    target = Math.max(0, Math.min(target, limit()));
    const remaining = target - position;
    const elapsed = Math.min(time - lastTime, 40);
    // About 11% of the remaining distance per 60Hz frame, measured on the reference.
    const ease = 1 - Math.pow(0.89, elapsed / (1000 / 60));
    position = Math.abs(remaining) < 1 ? target : position + remaining * ease;
    window.scrollTo({ top: position, behavior: "instant" });
    lastPosition = window.scrollY;
    lastTime = time;
    if (Math.abs(target - lastPosition) < 1) {
      stop();
    } else {
      frame = requestAnimationFrame(tick);
    }
  };

  const onWheel = (event: WheelEvent) => {
    if (
      event.defaultPrevented || !event.cancelable || event.ctrlKey || event.metaKey ||
      event.shiftKey || !event.deltaY || Math.abs(event.deltaX) >= Math.abs(event.deltaY)
    ) {
      stop();
      return;
    }

    // Inputs and nested scroll areas keep their own native wheel behaviour.
    for (const node of event.composedPath()) {
      if (node === document.body || node === document.documentElement) break;
      if (!(node instanceof HTMLElement)) continue;
      if (node.matches("input, textarea, select") || node.isContentEditable) {
        stop();
        return;
      }
      const style = getComputedStyle(node);
      if (/auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
        const canScroll = event.deltaY < 0
          ? node.scrollTop > 0
          : node.scrollTop + node.clientHeight < node.scrollHeight - 1;
        if (canScroll || /contain|none/.test(style.overscrollBehaviorY)) {
          stop();
          return;
        }
      }
    }

    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? window.innerHeight : 1;
    const delta = event.deltaY * unit;
    const current = window.scrollY;
    if (!frame || Math.sign(delta) !== Math.sign(target - current)) target = current;
    target = Math.max(0, Math.min(target + delta, limit()));
    if (Math.abs(target - current) < 1) {
      stop();
      return;
    }

    event.preventDefault();
    if (!frame) {
      position = current;
      lastPosition = current;
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    }
  };

  const sync = () => {
    stop();
    window.removeEventListener("wheel", onWheel);
    if (enabled.matches) window.addEventListener("wheel", onWheel, { passive: false });
  };
  enabled.addEventListener("change", sync);
  // Stop easing immediately when another navigation method takes over.
  window.addEventListener("keydown", stop, { passive: true });
  window.addEventListener("pointerdown", stop, { passive: true });
  window.addEventListener("touchstart", stop, { passive: true });
  window.addEventListener("click", stop, { passive: true });
  window.addEventListener("hashchange", stop, { passive: true });
  window.addEventListener("pagehide", stop, { passive: true });
  window.addEventListener("blur", stop, { passive: true });
  sync();
}
