console.log("SCRIPT ACTIVE");

// === AGGRESSIVE BACKGROUND MUSIC CONTROL (COOKED HARD) ===
const bgMusic = document.getElementById("bgMusic");
if (bgMusic) {
  bgMusic.volume = 0.3; // Set ambient background volume (30%)

  // Unmute and try to play (audio starts muted in HTML to allow autoplay)
  const attemptUnmuteAndPlay = () => {
    bgMusic.muted = false; // Unmute
    const playPromise = bgMusic.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        console.log("BGM playing successfully!");
      }).catch(() => {
        console.log("Autoplay still blocked, waiting for user interaction...");
      });
    }
  };

  // Try to unmute immediately when page loads
  attemptUnmuteAndPlay();

  // Retry after brief delays for browser compatibility
  setTimeout(attemptUnmuteAndPlay, 100);
  setTimeout(attemptUnmuteAndPlay, 300);
  setTimeout(attemptUnmuteAndPlay, 500);

  // Set up listeners for ALL user interactions to unmute and play
  const startMusic = () => {
    bgMusic.muted = false;
    bgMusic.play().catch(() => { });
  };

  // Listen to every possible user interaction
  ['click', 'touchstart', 'touchend', 'keydown', 'mousemove'].forEach(eventType => {
    document.addEventListener(eventType, startMusic, { once: true });
  });

  document.addEventListener("scroll", startMusic, { once: true, passive: true });

  // Also try when first video plays
  const firstVideo = document.querySelector('video');
  if (firstVideo) {
    firstVideo.addEventListener('play', startMusic, { once: true });
    firstVideo.addEventListener('canplay', startMusic, { once: true });
  }
}

// Continuation timing controls (safe to tune).
const HOLD_AFTER_VIDEO1_MS = 700;
const VIDEO2_FADE_MS = 900;

const opening = document.getElementById("opening");
const headlampVideo = document.getElementById("headlampVideo");
const watcherVideo = document.getElementById("watcherVideo");
const act2 = document.getElementById("act2");
const scrollCue = document.getElementById("scrollCue");
const act2Logo = document.querySelector("#act2 .act2-logo");
const act3 = document.getElementById("act3");
const approachVideo = document.getElementById("approachVideo");
const root = document.documentElement;
const body = document.body;
const LOGO_FALLBACK_SRC = "images/mt15-logo.png";
const APPROACH_FALLBACK_SOURCES = ["./Videos/03_approach.mp4"];
const ACT2_WHEEL_DAMPING_BASE = 0.6;
const ACT2_WHEEL_DAMPING_PRESSURE = 0.08;
const ACT2_TOUCH_DAMPING_BASE = 0.64;
const ACT2_TOUCH_DAMPING_PRESSURE = 0.09;
const ACT2_MICRO_LOCK_ZONES = [0.24, 0.5, 0.76];
const ACT2_MICRO_LOCK_HALF_WIDTH = 0.035;
const ACT2_MICRO_LOCK_DURATION_MS = 85;
const ACT2_MICRO_LOCK_FLOOR = 0.52;
let act2InteractionEnabled = false;
let scrollCueDismissed = false;
let lastTouchY = null;
let act2MicroLockUntil = 0;
const act2ZoneState = ACT2_MICRO_LOCK_ZONES.map(() => false);

// Act II logic begins: scroll cue visibility and weighted scroll input.
function isInsideAct2() {
  if (!act2) {
    return false;
  }

  const act2Top = act2.offsetTop;
  const act2Bottom = act2Top + act2.offsetHeight;
  return window.scrollY >= act2Top && window.scrollY < act2Bottom;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function getAct2Progress() {
  if (!act2) {
    return 0;
  }

  const act2Top = act2.offsetTop;
  const act2Height = Math.max(1, act2.offsetHeight);
  return clamp01((window.scrollY - act2Top) / act2Height);
}

function getAct2Pressure(progress) {
  // Pressure peaks at Act II center and eases near section edges.
  const normalizedDistance = Math.abs(progress - 0.5) / 0.5;
  const centerProximity = 1 - clamp01(normalizedDistance);
  return centerProximity * centerProximity;
}

function getAct2Damping(baseDamping, pressureSpan) {
  const progress = getAct2Progress();
  const pressure = getAct2Pressure(progress);
  return baseDamping - (pressureSpan * pressure);
}

// Act III logic begins: viewport presence playback (no scrubbing).
let approachFallbackIndex = 0;

function tryApproachFallback() {
  if (!approachVideo || approachFallbackIndex >= APPROACH_FALLBACK_SOURCES.length) {
    return;
  }

  const nextSrc = APPROACH_FALLBACK_SOURCES[approachFallbackIndex];
  approachFallbackIndex += 1;

  if (approachVideo.currentSrc && approachVideo.currentSrc.endsWith(nextSrc)) {
    return;
  }

  approachVideo.src = nextSrc;
  approachVideo.load();
}

if (approachVideo) {
  approachVideo.autoplay = false;
  approachVideo.loop = false;
  approachVideo.controls = false;
  approachVideo.preload = "auto";
  approachVideo.muted = true;
  approachVideo.playsInline = true;
  approachVideo.playbackRate = 0.35;
  approachVideo.addEventListener("error", tryApproachFallback);
}

function updateAct2MicroLock(progress) {
  ACT2_MICRO_LOCK_ZONES.forEach((center, index) => {
    const insideZone = Math.abs(progress - center) <= ACT2_MICRO_LOCK_HALF_WIDTH;

    if (insideZone && !act2ZoneState[index]) {
      act2MicroLockUntil = Math.max(act2MicroLockUntil, performance.now() + ACT2_MICRO_LOCK_DURATION_MS);
    }

    act2ZoneState[index] = insideZone;
  });
}

function getAct2MicroLockMultiplier() {
  const now = performance.now();
  if (now >= act2MicroLockUntil) {
    return 1;
  }

  const remainingRatio = (act2MicroLockUntil - now) / ACT2_MICRO_LOCK_DURATION_MS;
  return ACT2_MICRO_LOCK_FLOOR + ((1 - ACT2_MICRO_LOCK_FLOOR) * (1 - remainingRatio));
}

function dismissScrollCue() {
  if (!scrollCue || scrollCueDismissed) {
    return;
  }

  scrollCueDismissed = true;
  body.classList.add("scroll-cue-dismissed");
}

window.addEventListener("scroll", () => {
  if (!act2InteractionEnabled || window.scrollY <= 0) {
    return;
  }

  dismissScrollCue();
}, { passive: true });

// === GLOBAL WEIGHTED SCROLL (ENHANCED) ===
const GLOBAL_WHEEL_DAMPING = 0.55; // Heavy damping for entire site
const GLOBAL_TOUCH_DAMPING = 0.60;

window.addEventListener("wheel", (event) => {
  if (!act2InteractionEnabled) {
    return; // Scroll locked until videos finish
  }

  // Apply Act 2 specific logic if inside Act 2
  if (isInsideAct2()) {
    const progress = getAct2Progress();
    updateAct2MicroLock(progress);
    const damping = getAct2Damping(ACT2_WHEEL_DAMPING_BASE, ACT2_WHEEL_DAMPING_PRESSURE) * getAct2MicroLockMultiplier();
    event.preventDefault();
    window.scrollBy(0, event.deltaY * damping);
  } else {
    // Global weighted scroll for all other sections
    event.preventDefault();
    window.scrollBy(0, event.deltaY * GLOBAL_WHEEL_DAMPING);
  }
}, { passive: false });

window.addEventListener("touchstart", (event) => {
  if (event.touches.length !== 1) {
    lastTouchY = null;
    return;
  }

  lastTouchY = event.touches[0].clientY;
}, { passive: true });

window.addEventListener("touchmove", (event) => {
  if (!act2InteractionEnabled || lastTouchY === null || event.touches.length !== 1) {
    return;
  }

  const currentY = event.touches[0].clientY;

  // Apply Act 2 specific logic if inside Act 2
  if (isInsideAct2()) {
    const progress = getAct2Progress();
    updateAct2MicroLock(progress);
    const damping = getAct2Damping(ACT2_TOUCH_DAMPING_BASE, ACT2_TOUCH_DAMPING_PRESSURE) * getAct2MicroLockMultiplier();
    const deltaY = (lastTouchY - currentY) * damping;
    lastTouchY = currentY;
    event.preventDefault();
    window.scrollBy(0, deltaY);
  } else {
    // Global weighted scroll for all other sections
    const deltaY = (lastTouchY - currentY) * GLOBAL_TOUCH_DAMPING;
    lastTouchY = currentY;
    event.preventDefault();
    window.scrollBy(0, deltaY);
  }
}, { passive: false });

window.addEventListener("touchend", () => {
  lastTouchY = null;
}, { passive: true });

window.addEventListener("touchcancel", () => {
  lastTouchY = null;
}, { passive: true });

if (act2Logo) {
  // Keep the requested local absolute path in HTML, but support local web servers.
  act2Logo.addEventListener("error", () => {
    act2Logo.src = LOGO_FALLBACK_SRC;
  }, { once: true });

  if (location.protocol === "http:" || location.protocol === "https:") {
    act2Logo.src = `/${LOGO_FALLBACK_SRC}`;
  }
}

if (opening && headlampVideo && watcherVideo) {
  // Keep CSS transition duration driven by a JS variable for easy tuning.
  opening.style.setProperty("--video2-fade-ms", `${VIDEO2_FADE_MS}ms`);

  // Enforce single-pass cinematic behavior (no loops, no controls).
  headlampVideo.loop = false;
  watcherVideo.loop = false;
  headlampVideo.controls = false;
  watcherVideo.controls = false;

  // Continuation logic: when Video 1 ends, hold final frame, then fade in Video 2 on top.
  headlampVideo.addEventListener("ended", () => {
    window.setTimeout(() => {
      watcherVideo.classList.add("is-visible");
      watcherVideo.currentTime = 0;
      watcherVideo.play().catch(() => { });
    }, HOLD_AFTER_VIDEO1_MS);
  }, { once: true });

  // After Video 2 ends, freeze the sequence in a finished state.
  watcherVideo.addEventListener("ended", () => {
    watcherVideo.pause();
    headlampVideo.pause();

    // Smooth scroll unlock transition
    setTimeout(() => {
      root.style.overflow = "auto";
      body.style.overflow = "auto";
      body.classList.add("act2-ready");

      // Add smooth fade class for visual feedback
      body.style.transition = "opacity 0.5s ease-out";

      // Enable weighted scroll
      act2InteractionEnabled = true;
    }, 300); // Brief delay for cinematic weight
  }, { once: true });
}

// === PLAN B: Act III presence-based playback (stable) ===
if (approachVideo && act3) {
  approachVideo.pause();
  approachVideo.loop = false;
  approachVideo.muted = true;
  approachVideo.playsInline = true;
  approachVideo.playbackRate = 0.35; // slow, heavy, mechanical

  const act3Observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        approachVideo.play().catch(() => { });
      } else {
        approachVideo.pause();
      }
    },
    { threshold: 0.45 }
  );

  act3Observer.observe(act3);
}

// Act IV: Specifications - Simple, Reliable Animation
const specItems = document.querySelectorAll(".spec-item");

const specObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    });
  },
  { threshold: 0.2 }
);

specItems.forEach((item) => specObserver.observe(item));

/* =========================================
   PREMIUM FEATURES - COOKED HARD
   ========================================= */

// === CUSTOM NEON CURSOR (BULLETPROOF VISIBILITY FIX) ===
const customCursor = document.querySelector('.custom-cursor');
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let cursorX = window.innerWidth / 2;
let cursorY = window.innerHeight / 2;

// Force cursor to be visible immediately
if (customCursor) {
  customCursor.style.opacity = '1';
  customCursor.style.visibility = 'visible';
  customCursor.style.display = 'block';
  customCursor.style.top = '50%';
  customCursor.style.left = '50%';
  customCursor.style.transform = 'translate(-50%, -50%)';
}

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

function updateCursor() {
  const dx = mouseX - cursorX;
  const dy = mouseY - cursorY;

  cursorX += dx * 0.2;
  cursorY += dy * 0.2;

  if (customCursor) {
    customCursor.style.top = `${cursorY}px`;
    customCursor.style.left = `${cursorX}px`;
    customCursor.style.transform = 'translate(-50%, -50%)';
  }

  requestAnimationFrame(updateCursor);
}

updateCursor();

// Cursor hover effect on interactive elements
const interactiveElements = document.querySelectorAll('a, button, .spec-item, video');
interactiveElements.forEach(el => {
  el.addEventListener('mouseenter', () => customCursor?.classList.add('hover'));
  el.addEventListener('mouseleave', () => customCursor?.classList.remove('hover'));
});

// === 3D MAGNETIC HOVER (SPEC ITEMS) ===
specItems.forEach(item => {
  item.addEventListener('mousemove', (e) => {
    const rect = item.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -5;
    const rotateY = ((x - centerX) / centerX) * 5;

    item.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
  });

  item.addEventListener('mouseleave', () => {
    item.style.transform = '';
  });
});

// === PARTICLE SYSTEM ===
const canvas = document.getElementById('particles');
if (canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const particleCount = 50;

  class Particle {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.vx = (Math.random() - 0.5) * 0.5;
      this.vy = (Math.random() - 0.5) * 0.5;
      this.life = 1;
      this.decay = Math.random() * 0.005 + 0.002;
      this.size = Math.random() * 2 + 0.5;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.life -= this.decay;

      if (this.life <= 0) {
        this.reset();
      }
    }

    draw() {
      ctx.save();
      ctx.globalAlpha = this.life * 0.6;
      ctx.fillStyle = '#b9fbff';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#b9fbff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
  }

  function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      p.update();
      p.draw();
    });

    requestAnimationFrame(animateParticles);
  }

  animateParticles();

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
}
