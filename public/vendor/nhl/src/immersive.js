function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

export function createImmersiveLayer({
  canvas,
  introScreen,
  enterButton,
}) {
  if (!canvas) {
    return {
      mount() {},
      destroy() {},
      enterRink() {},
    };
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      mount() {},
      destroy() {},
      enterRink() {},
    };
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

  const state = {
    active: !coarsePointer,
    introVisible: Boolean(introScreen),
    width: 0,
    height: 0,
    pointer: {
      x: window.innerWidth * 0.5,
      y: window.innerHeight * 0.55,
      px: window.innerWidth * 0.5,
      py: window.innerHeight * 0.55,
      speed: 0,
      angle: -0.35,
    },
    particles: [],
    scratches: [],
    wake: [],
    rafId: null,
    lastFrame: performance.now(),
  };

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    canvas.width = Math.floor(state.width * dpr);
    canvas.height = Math.floor(state.height * dpr);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawnParticle(x, y, options = {}) {
    state.particles.push({
      x,
      y,
      vx: options.vx ?? random(-1.4, 1.4),
      vy: options.vy ?? random(-1.2, 0.3),
      size: options.size ?? random(1.8, 5.6),
      alpha: options.alpha ?? random(0.4, 0.95),
      life: options.life ?? random(18, 42),
      chill: options.chill ?? random(0.92, 0.97),
      hue: options.hue ?? random(190, 220),
    });
  }

  function spawnScratch(x, y, dx, dy) {
    state.scratches.push({
      x1: x,
      y1: y,
      x2: x - dx * random(1.8, 3.4),
      y2: y - dy * random(1.8, 3.4),
      life: random(16, 28),
      alpha: random(0.18, 0.4),
      width: random(0.8, 2.2),
    });
  }

  function spawnTrailBurst(x, y, intensity = 1) {
    const count = Math.round(4 + intensity * 10);
    for (let index = 0; index < count; index += 1) {
      spawnParticle(x, y, {
        vx: random(-2.2, 2.2) * intensity,
        vy: random(-1.2, 0.9) * intensity,
        size: random(1.4, 4.8) * (0.85 + intensity * 0.2),
        life: random(18, 36),
      });
    }
  }

  function spawnClickSpray(x, y, biasAngle = -0.4) {
    for (let index = 0; index < 28; index += 1) {
      const angle = biasAngle + random(-1.4, 1.1);
      const speed = random(1.6, 5.6);
      spawnParticle(x, y, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.72,
        size: random(2.2, 6.2),
        alpha: random(0.55, 1),
        life: random(20, 46),
      });
    }
    for (let index = 0; index < 3; index += 1) {
      spawnScratch(x, y, random(-2.8, 2.8), random(-0.5, 1.6));
    }
  }

  function seedWake(x, y, speed, angle) {
    state.wake.unshift({
      x,
      y,
      speed,
      angle,
      life: random(10, 18),
    });

    if (state.wake.length > 18) {
      state.wake.length = 18;
    }
  }

  function drawWake(dt) {
    state.wake = state.wake.filter((point) => point.life > 0);
    state.wake.forEach((point, index) => {
      point.life -= 0.9 * dt;
      const alpha = clamp((point.life / 18) * (point.speed / 36), 0.03, 0.18);
      const length = clamp(point.speed * 0.9, 8, 24);
      const width = clamp(point.speed / 7, 1, 3.4);

      ctx.strokeStyle = `rgba(235, 247, 255, ${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(
        point.x - Math.cos(point.angle) * length,
        point.y - Math.sin(point.angle) * length,
      );
      ctx.lineTo(
        point.x + Math.cos(point.angle) * Math.min(3, index * 0.3),
        point.y + Math.sin(point.angle) * Math.min(3, index * 0.3),
      );
      ctx.stroke();
    });
  }

  function drawSkateCursor() {
    if (state.introVisible) return;

    const angle = state.pointer.angle;
    const speedScale = clamp(state.pointer.speed / 24, 0.18, 1);

    ctx.save();
    ctx.translate(state.pointer.x, state.pointer.y);
    ctx.rotate(angle);

    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 20 + speedScale * 14);
    glow.addColorStop(0, `rgba(232, 244, 255, ${0.16 + speedScale * 0.08})`);
    glow.addColorStop(1, "rgba(232, 244, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 20 + speedScale * 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(247, 252, 255, ${0.52 + speedScale * 0.24})`;
    ctx.lineWidth = 2.3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-11, 2);
    ctx.quadraticCurveTo(0, -4, 13, 1.5);
    ctx.stroke();

    ctx.strokeStyle = `rgba(141, 206, 255, ${0.18 + speedScale * 0.14})`;
    ctx.lineWidth = 7.5;
    ctx.beginPath();
    ctx.moveTo(-8, 7);
    ctx.lineTo(10, 7);
    ctx.stroke();

    ctx.fillStyle = `rgba(255, 255, 255, ${0.78 + speedScale * 0.12})`;
    ctx.beginPath();
    ctx.arc(14, 1.5, 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function updateFrame(now) {
    const dt = clamp((now - state.lastFrame) / 16.6667, 0.5, 1.8);
    state.lastFrame = now;

    ctx.clearRect(0, 0, state.width, state.height);

    if (!state.active || reducedMotion) {
      state.rafId = requestAnimationFrame(updateFrame);
      return;
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    drawWake(dt);

    state.scratches = state.scratches.filter((scratch) => scratch.life > 0);
    state.scratches.forEach((scratch) => {
      scratch.life -= 1 * dt;
      ctx.strokeStyle = `rgba(235, 247, 255, ${scratch.alpha * (scratch.life / 24)})`;
      ctx.lineWidth = scratch.width;
      ctx.beginPath();
      ctx.moveTo(scratch.x1, scratch.y1);
      ctx.lineTo(scratch.x2, scratch.y2);
      ctx.stroke();
    });

    state.particles = state.particles.filter((particle) => particle.life > 0 && particle.alpha > 0.02);
    state.particles.forEach((particle) => {
      particle.life -= 1 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= particle.chill;
      particle.vy = particle.vy * particle.chill + 0.04 * dt;
      particle.alpha *= 0.972;

      const gradient = ctx.createRadialGradient(
        particle.x,
        particle.y,
        0,
        particle.x,
        particle.y,
        particle.size,
      );
      gradient.addColorStop(0, `hsla(${particle.hue}, 70%, 96%, ${particle.alpha})`);
      gradient.addColorStop(1, `hsla(${particle.hue}, 90%, 88%, 0)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    });

    drawSkateCursor();
    ctx.restore();
    state.rafId = requestAnimationFrame(updateFrame);
  }

  function handlePointerMove(event) {
    const { clientX, clientY } = event;
    const dx = clientX - state.pointer.x;
    const dy = clientY - state.pointer.y;
    const speed = Math.hypot(dx, dy);

    state.pointer.px = state.pointer.x;
    state.pointer.py = state.pointer.y;
    state.pointer.x = clientX;
    state.pointer.y = clientY;
    state.pointer.speed = speed;
    if (speed > 0.2) {
      state.pointer.angle = Math.atan2(dy, dx);
    }

    if (!state.active || reducedMotion || coarsePointer) return;
    if (state.introVisible) return;

    const intensity = clamp(speed / 18, 0.15, 1.35);
    const shouldSpray = speed > 3;

    if (shouldSpray) {
      spawnTrailBurst(clientX, clientY, intensity * 0.32);
      spawnScratch(clientX, clientY, dx, dy);
      seedWake(clientX, clientY, speed, state.pointer.angle);
    }
  }

  function handlePointerDown(event) {
    if (!state.active || reducedMotion || coarsePointer) return;
    if (state.introVisible) return;
    spawnClickSpray(event.clientX, event.clientY, state.pointer.angle);
  }

  function enterRink(immediate = false) {
    if (!introScreen || introScreen.classList.contains("is-exiting")) return;
    state.introVisible = false;
    document.body.classList.remove("intro-active");
    document.body.classList.add("intro-dismissed");
    introScreen.classList.add("is-exiting");

    spawnClickSpray(state.width * 0.5, state.height * 0.72, -Math.PI / 2);
    for (let index = 0; index < 7; index += 1) {
      spawnScratch(
        state.width * 0.5 + random(-120, 120),
        state.height * 0.76 + random(-20, 20),
        random(-3.4, 3.4),
        random(-1.2, 1.4),
      );
    }

    if (immediate || reducedMotion) {
      introScreen.classList.add("is-hidden");
      return;
    }

    setTimeout(() => {
      introScreen.classList.add("is-hidden");
    }, 1100);
  }

  function bindIntro() {
    if (!introScreen) return;

    enterButton?.addEventListener("click", (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      spawnClickSpray(rect.left + rect.width / 2, rect.top + rect.height / 2, -Math.PI / 2);
      setTimeout(() => {
        enterRink(false);
      }, 70);
    });

    window.addEventListener("keydown", (event) => {
      if (!state.introVisible) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        enterRink(false);
      }
    });
  }

  function mount() {
    if (state.introVisible) {
      document.body.classList.add("intro-active");
    } else {
      document.body.classList.add("intro-dismissed");
    }
    resize();
    bindIntro();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    state.rafId = requestAnimationFrame(updateFrame);
  }

  function destroy() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
  }

  return {
    mount,
    destroy,
    enterRink,
  };
}
