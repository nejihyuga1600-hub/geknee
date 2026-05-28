// SVG teardrop pin that morphs Google Maps' green POI marker into the
// geknee purple "trip intent" pin. The transformation is the visual contract:
// the same pin shape Google draws on the tile gets visually replaced with an
// identical-silhouette pin whose colour sweeps green → purple, then settles.
//
// Why an SVG teardrop and not a circle: a circle dropped on top of Google's
// teardrop POI reads as a separate sticker. Same-silhouette in matching size
// reads as "the pin you tapped became yours."
//
// Why CSS color animation on `currentColor` + a sweeping overlay: browsers
// interpolate colour in sRGB through grey, which makes a flat fill animation
// look muddy mid-sweep. The shimmer overlay sells the transition as a single
// motion rather than a tween.
//
// AdvancedMarkerElement anchor: content's bottom-centre lands at the latLng,
// which is what we want for a teardrop pin (tip on the point).

export interface PurpleMarkerOpts {
  label?: string;
  onClick?: () => void;
  onRightClick?: () => void;
  /** Supply a pre-built element to use as the marker content instead of the
   *  default pin. Listeners attach to this element. The default pin is NOT
   *  created, preventing an orphan DOM node when callers need a custom
   *  visual (e.g. numbered circles in DayMap). */
  content?: HTMLElement;
}

export interface PurpleMarker {
  marker: google.maps.marker.AdvancedMarkerElement;
  el: HTMLElement;
  remove: () => void;
}

// Tunable design constants — adjust to retune the pin without touching JSX.
const PIN_W = 36;
const PIN_H = 48;
const COLOR_GREEN = '#34a853'; // Google POI green (matches tile-baked POI)
const COLOR_PURPLE_MID = '#7e6cd6'; // perceptual midpoint, kills muddy grey
const COLOR_PURPLE = '#a78bfa'; // geknee brand purple

const KEYFRAMES_ID = 'geknee-pin-keyframes-v2';
// Monotonic counter so every pin gets a unique gradient id. Without this all
// pins would resolve url(#geknee-pin-gradient) to the FIRST gradient on the
// page (every subsequent pin would share the same animated gradient).
let _pinIdCounter = 0;

function ensureKeyframes(): void {
  if (typeof document === 'undefined') return;
  // Always overwrite so HMR-stale animation definitions don't survive.
  let style = document.getElementById(KEYFRAMES_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = KEYFRAMES_ID;
    document.head.appendChild(style);
  }
  style.textContent = `
    /* Drop-in: SVG arrives from above with a spring scale.
       transform-origin is the SVG's centre so the bounce reads symmetrically.
       NO translate(-50%, -50%) here — the SVG is already positioned at the
       wrap's top-left and naturally fills its 36×48 box. */
    @keyframes geknee-pin-svg-drop {
      0%   { transform: scale(0)    translateY(-12px); opacity: 0; }
      55%  { transform: scale(1.18) translateY(0);     opacity: 1; }
      80%  { transform: scale(0.94); }
      100% { transform: scale(1); opacity: 1; }
    }
    /* (Recolour keyframe removed — the gradient sweep via SMIL on the
       SVG linearGradient now drives the colour change. Keep the shimmer
       overlay separately so a soft highlight rides along with the
       sweep edge, selling it as a wave of paint.) */
    @keyframes geknee-pin-shimmer {
      0%, 18%  { transform: translateX(-130%); opacity: 0; }
      55%      { transform: translateX(0%);    opacity: 0.85; }
      85%, 100% { transform: translateX(130%); opacity: 0; }
    }
    /* Idle aura — soft breathing halo so the settled pin still feels alive.
       Aura is centred on the pin head (NOT translated like the SVG which is
       top-left positioned), so this keyframe uses translate(-50%,-50%). */
    @keyframes geknee-pin-aura {
      0%, 100% { transform: translate(-50%, -50%) scale(1);   opacity: 0.32; }
      50%      { transform: translate(-50%, -50%) scale(1.22); opacity: 0.10; }
    }
  `;
}

export function createPurpleMarker(
  map: google.maps.Map,
  position: { lat: number; lng: number },
  opts: PurpleMarkerOpts = {},
): PurpleMarker {
  ensureKeyframes();

  const el: HTMLElement = opts.content ?? (() => {
    // Outer wrapper — AdvancedMarkerElement places this so its bottom-centre
    // is at the latLng. A teardrop pin's tip is its bottom-centre, so no
    // transform shenanigans needed: the pin's tip lands ON the POI's tip.
    const wrap = document.createElement('div');
    wrap.style.cssText =
      `position:relative;width:${PIN_W}px;height:${PIN_H}px;` +
      `pointer-events:auto;cursor:pointer;` +
      // Drop shadow on the wrap so both the pin SVG and aura share elevation.
      `filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35));`;
    wrap.title = opts.label ?? 'Pinned stop · right-click to remove';

    // Aura — soft purple circle behind the pin head that breathes once the
    // morph finishes. Delayed 1.4s so the aura's purple doesn't leak into
    // the colour-sweep window (the recolour animation completes at ~1.18s
    // including the 80ms delay; aura starts 220ms after that).
    const aura = document.createElement('div');
    const auraSize = PIN_W * 1.25;
    aura.style.cssText =
      `position:absolute;left:50%;top:${PIN_W / 2}px;width:${auraSize}px;height:${auraSize}px;` +
      `border-radius:50%;background:${COLOR_PURPLE};` +
      `pointer-events:none;transform:translate(-50%, -50%);` +
      `animation:geknee-pin-aura 2.6s ease-in-out 1400ms infinite;`;
    wrap.appendChild(aura);

    // SVG pin: teardrop silhouette filled with currentColor so a single
    // CSS animation drives the recolour.
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', String(PIN_W));
    svg.setAttribute('height', String(PIN_H));
    svg.setAttribute('viewBox', `0 0 ${PIN_W} ${PIN_H}`);
    // SVG sits inside the wrap at top-left and fills its 36×48 box.
    // transform-origin is the bottom-centre (the pin tip) so the spring
    // appears to grow from where the pin will land.
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.transformOrigin = '50% 100%';
    svg.style.animation = 'geknee-pin-svg-drop 700ms cubic-bezier(.34,1.56,.64,1) both';

    // ── Shimmer-color sweep via SVG linearGradient (ibelick text-shimmer
    //    pattern adapted to a vector fill). Two hard-stop colour pairs
    //    (purple|purple — green|green) form a sharp boundary at the
    //    gradient midpoint; we animate the gradient's x1/x2 so the
    //    boundary sweeps left→right across the pin head. Result: green
    //    fades to purple from one side, like a wave of paint.
    const gradientId = `geknee-pin-gradient-${++_pinIdCounter}`;
    const grad = document.createElementNS(svgNS, 'linearGradient');
    grad.setAttribute('id', gradientId);
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');
    grad.setAttribute('x1', '-40');   // start position — gradient lives to the left of the pin
    grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '-4');    // narrow window so the boundary reads as a sharp edge
    grad.setAttribute('y2', '0');
    const stopPurpleStart = document.createElementNS(svgNS, 'stop');
    stopPurpleStart.setAttribute('offset', '0%');
    stopPurpleStart.setAttribute('stop-color', COLOR_PURPLE);
    const stopPurpleEnd = document.createElementNS(svgNS, 'stop');
    stopPurpleEnd.setAttribute('offset', '50%');
    stopPurpleEnd.setAttribute('stop-color', COLOR_PURPLE);
    const stopGreenStart = document.createElementNS(svgNS, 'stop');
    stopGreenStart.setAttribute('offset', '50%');
    stopGreenStart.setAttribute('stop-color', COLOR_GREEN);
    const stopGreenEnd = document.createElementNS(svgNS, 'stop');
    stopGreenEnd.setAttribute('offset', '100%');
    stopGreenEnd.setAttribute('stop-color', COLOR_GREEN);
    grad.appendChild(stopPurpleStart);
    grad.appendChild(stopPurpleEnd);
    grad.appendChild(stopGreenStart);
    grad.appendChild(stopGreenEnd);

    // SMIL animations slide the gradient window across the pin width
    // (~ -40 → +PIN_W) over 900ms. fill="freeze" leaves the end state
    // (full purple) in place after the sweep.
    const animX1 = document.createElementNS(svgNS, 'animate');
    animX1.setAttribute('attributeName', 'x1');
    animX1.setAttribute('from', '-40');
    animX1.setAttribute('to', String(PIN_W));
    animX1.setAttribute('dur', '900ms');
    animX1.setAttribute('begin', '180ms');
    animX1.setAttribute('fill', 'freeze');
    animX1.setAttribute('calcMode', 'spline');
    animX1.setAttribute('keySplines', '0.4 0 0.2 1');
    animX1.setAttribute('keyTimes', '0;1');
    const animX2 = document.createElementNS(svgNS, 'animate');
    animX2.setAttribute('attributeName', 'x2');
    animX2.setAttribute('from', '-4');
    animX2.setAttribute('to', String(PIN_W + 36));
    animX2.setAttribute('dur', '900ms');
    animX2.setAttribute('begin', '180ms');
    animX2.setAttribute('fill', 'freeze');
    animX2.setAttribute('calcMode', 'spline');
    animX2.setAttribute('keySplines', '0.4 0 0.2 1');
    animX2.setAttribute('keyTimes', '0;1');
    grad.appendChild(animX1);
    grad.appendChild(animX2);
    const defs = document.createElementNS(svgNS, 'defs');
    defs.appendChild(grad);
    svg.appendChild(defs);

    // Pin teardrop path — classic map-pin silhouette, normalised to PIN_W
    // wide × PIN_H tall. Head is a circle of radius PIN_W/2 centred at
    // (PIN_W/2, PIN_W/2); tip narrows down to (PIN_W/2, PIN_H).
    const path = document.createElementNS(svgNS, 'path');
    const r = PIN_W / 2;
    const cx = PIN_W / 2;
    const headY = r;
    const tipY = PIN_H;
    const d = `M ${cx} 0 ` +
              `C ${cx - r * 1.1} 0, ${cx - r * 1.1} ${r * 2}, ${cx} ${tipY} ` +
              `C ${cx + r * 1.1} ${r * 2}, ${cx + r * 1.1} 0, ${cx} 0 Z`;
    path.setAttribute('d', d);
    path.setAttribute('fill', `url(#${gradientId})`);
    svg.appendChild(path);

    // Inner white circle — the dot inside Google's POI pin, gives depth.
    const innerR = r * 0.32;
    const innerCircle = document.createElementNS(svgNS, 'circle');
    innerCircle.setAttribute('cx', String(cx));
    innerCircle.setAttribute('cy', String(headY));
    innerCircle.setAttribute('r', String(innerR));
    innerCircle.setAttribute('fill', '#ffffff');
    innerCircle.setAttribute('opacity', '0.92');
    svg.appendChild(innerCircle);

    wrap.appendChild(svg);

    // Shimmer overlay — a vertical white bar with a horizontal gradient mask
    // that sweeps left→right across the pin head as the colour changes.
    // Clipped to the pin's bounding box so it only shows on the pin itself.
    const shimmerHost = document.createElement('div');
    shimmerHost.style.cssText =
      `position:absolute;left:0;top:0;width:${PIN_W}px;height:${PIN_H}px;` +
      `overflow:hidden;pointer-events:none;border-radius:50%;` +
      // Match the head circle's clip so the shimmer doesn't leak past the
      // teardrop's tip area.
      `clip-path:circle(${r}px at ${cx}px ${headY}px);`;
    const shimmer = document.createElement('div');
    shimmer.style.cssText =
      `position:absolute;left:0;top:0;width:100%;height:100%;` +
      `background:linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.9) 50%, transparent 100%);` +
      `mix-blend-mode:overlay;` +
      // Match the SMIL gradient sweep (begin:180ms, dur:900ms) so the
      // light-bar rides along with the colour boundary instead of leading it.
      `animation:geknee-pin-shimmer 900ms ease-out 180ms both;`;
    shimmerHost.appendChild(shimmer);
    wrap.appendChild(shimmerHost);

    return wrap;
  })();

  if (opts.onClick) {
    el.addEventListener('click', (e) => { e.stopPropagation(); opts.onClick?.(); });
  }
  if (opts.onRightClick) {
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); opts.onRightClick?.(); });
  }

  const marker = new google.maps.marker.AdvancedMarkerElement({
    map,
    position,
    content: el,
    title: opts.label,
  });

  return {
    marker,
    el,
    remove: () => { marker.map = null; },
  };
}
