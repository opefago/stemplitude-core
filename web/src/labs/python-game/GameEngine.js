import { getBuiltInSprite, getSpriteInfo, parseCustomSprite, renderPixelArt, getSpriteNames } from './sprites';

export class GameEngine {
  constructor(canvas, onLog, onError, assetManager) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.width = canvas.width;
    this.height = canvas.height;
    this.objects = new Map();
    this._spriteCache = new Map();
    this.assets = assetManager || null;
    this._audioCtx = null;
    this._playingAudios = [];
    this._backgroundImage = null;
    this.backgroundColor = '#1a1a2e';
    this.running = false;
    this.animationId = null;
    this.keys = new Set();
    this._justPressed = new Set();
    this._justReleased = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseInside = false;
    this.mouseDown = false;
    this._mouseJustClicked = false;
    this._mouseJustReleased = false;
    this._onKeyCallback = null;
    this._onKeyUpCallback = null;
    this._onClickCallback = null;
    this._timers = [];
    this._nextTimerId = 1;
    this.updateCallback = null;
    this.gameTitle = 'My Game';
    this.frameCount = 0;
    this.elapsedMs = 0;
    this._nextId = 1;
    this.onLog = onLog || (() => {});
    this.onError = onError || console.error;
    this.onTitleChange = null;
    this.gridVisible = false;

    // Physics
    this.physicsEnabled = true;

    // Tweening
    this._tweens = [];
    this._nextTweenId = 1;

    // Particles
    this._particles = [];
    this._emitters = [];
    this._nextEmitterId = 1;

    // Camera
    this.cameraX = 0;
    this.cameraY = 0;

    // Scenes
    this._scenes = {};
    this._currentScene = '';

    // Groups
    this._groups = {};

    // Talk bubbles
    this._bubbles = new Map();

    // Screen effects
    this._shakeIntensity = 0;
    this._shakeDuration = 0;
    this._shakeElapsed = 0;
    this._flashColor = '';
    this._flashAlpha = 0;
    this._flashDuration = 0;
    this._flashElapsed = 0;
    this._transition = null;

    // Mobile / touch / accelerometer
    this.tiltX = 0;
    this.tiltY = 0;
    this.tiltZ = 0;
    this._tiltPermission = false;
    this._mobileControlsVisible = false;
    this._mobileButtons = {};
    this._mobileControlsEl = null;

    // Tilemaps
    this._tilemaps = [];

    // Collision / object lifecycle event handlers
    this._overlapHandlers = [];
    this._cloneHandlers = [];

    this._boundKeyDown = this._onKeyDown.bind(this);
    this._boundKeyUp = this._onKeyUp.bind(this);
    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundMouseDown = this._onMouseDown.bind(this);
    this._boundMouseUp = this._onMouseUp.bind(this);
    this._boundMouseEnter = this._onMouseEnter.bind(this);
    this._boundMouseLeave = this._onMouseLeave.bind(this);
    this._boundTouchStart = this._onTouchStart.bind(this);
    this._boundTouchMove = this._onTouchMove.bind(this);
    this._boundTouchEnd = this._onTouchEnd.bind(this);
    this._boundDeviceMotion = this._onDeviceMotion.bind(this);

    this._setupInput();
    this._render();
  }

  _onKeyDown(e) {
    const norm = _normalizeKey(e.key);
    if (!this.keys.has(norm)) this._justPressed.add(norm);
    this.keys.add(norm);
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Tab'].includes(e.key)) {
      e.preventDefault();
    }
    if (this._onKeyCallback) {
      try { this._onKeyCallback(norm); } catch (_) {}
    }
  }

  _onKeyUp(e) {
    const norm = _normalizeKey(e.key);
    this.keys.delete(norm);
    this._justReleased.add(norm);
    if (this._onKeyUpCallback) {
      try { this._onKeyUpCallback(norm); } catch (_) {}
    }
  }

  _onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.width / rect.width;
    const scaleY = this.height / rect.height;
    this.mouseX = Math.round((e.clientX - rect.left) * scaleX);
    this.mouseY = Math.round((e.clientY - rect.top) * scaleY);
    this.mouseInside = true;
    if (!this.running) this._render();
  }

  _onMouseEnter() {
    this.mouseInside = true;
    if (!this.running) this._render();
  }

  _onMouseDown(e) {
    this.mouseDown = true;
    this._mouseJustClicked = true;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.width / rect.width;
    const scaleY = this.height / rect.height;
    const mx = Math.round((e.clientX - rect.left) * scaleX);
    const my = Math.round((e.clientY - rect.top) * scaleY);
    if (this._onClickCallback) {
      try { this._onClickCallback(mx, my); } catch (_) {}
    }
    this._fireObjectClicks(mx, my);
  }

  _onMouseUp() {
    this.mouseDown = false;
    this._mouseJustReleased = true;
  }

  _onMouseLeave() {
    this.mouseInside = false;
    this.mouseDown = false;
    if (!this.running) this._render();
  }

  _getTouchPos(touch) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.width / rect.width;
    const scaleY = this.height / rect.height;
    return {
      x: Math.round((touch.clientX - rect.left) * scaleX),
      y: Math.round((touch.clientY - rect.top) * scaleY),
    };
  }

  _onTouchStart(e) {
    e.preventDefault();
    const t = e.changedTouches[0];
    if (!t) return;
    const pos = this._getTouchPos(t);
    this.mouseX = pos.x;
    this.mouseY = pos.y;
    this.mouseInside = true;
    this.mouseDown = true;
    this._mouseJustClicked = true;
    if (!this.running) this._render();
    if (this._onClickCallback) {
      try { this._onClickCallback(pos.x, pos.y); } catch (_) {}
    }
    this._fireObjectClicks(pos.x, pos.y);
  }

  _onTouchMove(e) {
    e.preventDefault();
    const t = e.changedTouches[0];
    if (!t) return;
    const pos = this._getTouchPos(t);
    this.mouseX = pos.x;
    this.mouseY = pos.y;
    this.mouseInside = true;
    if (!this.running) this._render();
  }

  _onTouchEnd(e) {
    e.preventDefault();
    this.mouseInside = false;
    this.mouseDown = false;
    this._mouseJustReleased = true;
    if (!this.running) this._render();
  }

  _onDeviceMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    this.tiltX = a.x || 0;
    this.tiltY = a.y || 0;
    this.tiltZ = a.z || 0;
  }

  async requestTiltPermission() {
    if (this._tiltPermission) return true;
    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceMotionEvent.requestPermission();
        if (perm !== 'granted') return false;
      } catch { return false; }
    }
    window.addEventListener('devicemotion', this._boundDeviceMotion);
    this._tiltPermission = true;
    return true;
  }

  showMobileControls(layout = 'dpad_ab') {
    if (this._mobileControlsEl) return;
    this._mobileControlsVisible = true;
    const wrapper = this.canvas.parentElement;
    if (!wrapper) return;

    const el = document.createElement('div');
    el.className = 'gml-mobile-controls';
    el.setAttribute('data-layout', layout);

    const buttons = layout === 'dpad_ab'
      ? [
          { key: 'up', label: '\u25B2', cls: 'mc-up' },
          { key: 'down', label: '\u25BC', cls: 'mc-down' },
          { key: 'left', label: '\u25C0', cls: 'mc-left' },
          { key: 'right', label: '\u25B6', cls: 'mc-right' },
          { key: 'a', label: 'A', cls: 'mc-a' },
          { key: 'b', label: 'B', cls: 'mc-b' },
        ]
      : layout === 'dpad'
      ? [
          { key: 'up', label: '\u25B2', cls: 'mc-up' },
          { key: 'down', label: '\u25BC', cls: 'mc-down' },
          { key: 'left', label: '\u25C0', cls: 'mc-left' },
          { key: 'right', label: '\u25B6', cls: 'mc-right' },
        ]
      : [
          { key: 'a', label: 'A', cls: 'mc-a' },
          { key: 'b', label: 'B', cls: 'mc-b' },
        ];

    buttons.forEach(({ key, label, cls }) => {
      const btn = document.createElement('button');
      btn.className = `mc-btn ${cls}`;
      btn.textContent = label;
      btn.setAttribute('data-key', key);
      const press = (e) => {
        e.preventDefault();
        if (!this.keys.has(key)) this._justPressed.add(key);
        this.keys.add(key);
      };
      const release = (e) => {
        e.preventDefault();
        this.keys.delete(key);
        this._justReleased.add(key);
      };
      btn.addEventListener('touchstart', press, { passive: false });
      btn.addEventListener('touchend', release, { passive: false });
      btn.addEventListener('touchcancel', release, { passive: false });
      btn.addEventListener('mousedown', press);
      btn.addEventListener('mouseup', release);
      btn.addEventListener('mouseleave', release);
      el.appendChild(btn);
    });

    wrapper.style.position = 'relative';
    wrapper.appendChild(el);
    this._mobileControlsEl = el;
  }

  hideMobileControls() {
    if (this._mobileControlsEl) {
      this._mobileControlsEl.remove();
      this._mobileControlsEl = null;
    }
    this._mobileControlsVisible = false;
  }

  _clearFrameInput() {
    this._justPressed.clear();
    this._justReleased.clear();
    this._mouseJustClicked = false;
    this._mouseJustReleased = false;
    this._fireObjectHovers(this.mouseX, this.mouseY);
  }

  containsPoint(obj, px, py) {
    if (!obj || !obj.visible) return false;
    if (obj.type === 'circle') {
      const dx = px - obj.x, dy = py - obj.y;
      return dx * dx + dy * dy <= obj.radius * obj.radius;
    }
    const w = obj.width || 0, h = obj.height || 0;
    return px >= obj.x && px <= obj.x + w && py >= obj.y && py <= obj.y + h;
  }

  hitTest(px, py) {
    const sorted = [...this.objects.values()]
      .filter(o => o.visible)
      .sort((a, b) => (b.layer || 0) - (a.layer || 0));
    for (const obj of sorted) {
      if (this.containsPoint(obj, px, py)) return obj;
    }
    return null;
  }

  _fireObjectClicks(mx, my) {
    for (const obj of this.objects.values()) {
      if (obj._onClick && obj.visible && this.containsPoint(obj, mx, my)) {
        try { obj._onClick(obj.id, mx, my); } catch (_) {}
      }
    }
  }

  _fireObjectHovers(mx, my) {
    for (const obj of this.objects.values()) {
      const inside = obj.visible && this.containsPoint(obj, mx, my);
      if (inside && !obj._hovered) {
        obj._hovered = true;
        if (obj._onHoverEnter) try { obj._onHoverEnter(obj.id, mx, my); } catch (_) {}
      } else if (!inside && obj._hovered) {
        obj._hovered = false;
        if (obj._onHoverExit) try { obj._onHoverExit(obj.id); } catch (_) {}
      }
    }
  }

  // ==================== Timers ====================

  addTimer(delayMs, callback, repeat = false) {
    const id = this._nextTimerId++;
    this._timers.push({ id, delay: delayMs, callback, repeat, elapsed: 0 });
    return id;
  }

  cancelTimer(id) {
    this._timers = this._timers.filter(t => t.id !== id);
  }

  _updateTimers() {
    const dt = 1000 / 60;
    for (let i = this._timers.length - 1; i >= 0; i--) {
      const t = this._timers[i];
      t.elapsed += dt;
      if (t.elapsed >= t.delay) {
        try { t.callback(); } catch (e) { this.onError(e.toString()); }
        if (t.repeat) {
          t.elapsed -= t.delay;
        } else {
          this._timers.splice(i, 1);
        }
      }
    }
  }

  // ==================== Tweens ====================

  addTween(objId, prop, target, durationMs, easing = 'linear', onDone = null) {
    const obj = this.objects.get(objId);
    if (!obj) return 0;
    const id = this._nextTweenId++;
    this._tweens.push({
      id, objId, prop,
      start: obj[prop] || 0, target,
      duration: durationMs, elapsed: 0,
      easing: _EASINGS[easing] || _EASINGS.linear,
      onDone,
    });
    return id;
  }

  cancelTween(id) {
    this._tweens = this._tweens.filter(t => t.id !== id);
  }

  cancelTweensFor(objId) {
    this._tweens = this._tweens.filter(t => t.objId !== objId);
  }

  _updateTweens() {
    const dt = 1000 / 60;
    for (let i = this._tweens.length - 1; i >= 0; i--) {
      const tw = this._tweens[i];
      tw.elapsed += dt;
      const obj = this.objects.get(tw.objId);
      if (!obj) { this._tweens.splice(i, 1); continue; }
      let t = Math.min(1, tw.elapsed / tw.duration);
      t = tw.easing(t);
      obj[tw.prop] = tw.start + (tw.target - tw.start) * t;
      if (tw.elapsed >= tw.duration) {
        obj[tw.prop] = tw.target;
        if (tw.onDone) try { tw.onDone(); } catch (_) {}
        this._tweens.splice(i, 1);
      }
    }
  }

  isKeyJustPressed(key) { return this._justPressed.has(key); }
  isKeyJustReleased(key) { return this._justReleased.has(key); }
  isMouseClicked() { return this._mouseJustClicked; }
  isMouseReleased() { return this._mouseJustReleased; }

  // ==================== Particles ====================

  emitParticles(x, y, options = {}) {
    const count = options.count ?? 20;
    const colors = options.colors || (options.color ? [options.color] : ['#FFD700', '#FF6B35', '#FF4444']);
    const speed = options.speed ?? 4;
    const speedSpread = options.speed_spread ?? 0.5;
    const life = options.life ?? 40;
    const lifeSpread = options.life_spread ?? 0.3;
    const size = options.size ?? 6;
    const sizeSpread = options.size_spread ?? 0.5;
    const spread = options.spread !== undefined ? options.spread : Math.PI * 2;
    const angle = options.angle ?? 0;
    const gravity = options.gravity ?? 0;
    const drag = options.drag ?? 0.98;
    const fade = options.fade !== false;
    const shrink = options.shrink !== false;
    const grow = options.grow ?? 0;
    const spin = options.spin ?? 0;
    const shape = options.shape || 'circle';
    const spriteName = options.sprite || null;
    const outline = options.outline || false;
    const blendMode = options.blend || 'source-over';

    for (let i = 0; i < count; i++) {
      const a = angle - spread / 2 + Math.random() * spread;
      const sFactor = 1 - speedSpread + Math.random() * speedSpread * 2;
      const s = speed * Math.max(0.1, sFactor);
      const lFactor = 1 - lifeSpread + Math.random() * lifeSpread * 2;
      const pLife = Math.max(5, Math.round(life * lFactor));
      const szFactor = 1 - sizeSpread + Math.random() * sizeSpread * 2;
      this._particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.max(1, size * szFactor),
        life: pLife, maxLife: pLife,
        gravity, drag, fade, shrink, grow, spin,
        rotation: Math.random() * Math.PI * 2,
        shape, spriteName, outline, blendMode,
      });
    }
  }

  createEmitter(x, y, options = {}) {
    const id = this._nextEmitterId++;
    const emitter = {
      id, x, y, active: true,
      rate: options.rate ?? 2,
      _accumulator: 0,
      followObject: options.follow || null,
      options: { ...options },
    };
    delete emitter.options.rate;
    delete emitter.options.follow;
    this._emitters.push(emitter);
    return id;
  }

  setEmitterActive(id, active) {
    const e = this._emitters.find(em => em.id === id);
    if (e) e.active = active;
  }

  moveEmitter(id, x, y) {
    const e = this._emitters.find(em => em.id === id);
    if (e) { e.x = x; e.y = y; }
  }

  removeEmitter(id) {
    this._emitters = this._emitters.filter(e => e.id !== id);
  }

  _tickEmitters() {
    for (const e of this._emitters) {
      if (!e.active) continue;
      let ex = e.x, ey = e.y;
      if (e.followObject) {
        const obj = this.objects.get(e.followObject);
        if (obj) { ex = obj.x + (obj.width || 0) / 2; ey = obj.y + (obj.height || 0) / 2; }
      }
      e._accumulator += e.rate;
      while (e._accumulator >= 1) {
        this.emitParticles(ex, ey, e.options);
        e._accumulator -= 1;
      }
    }
  }

  emitPreset(presetName, x, y, overrides = {}) {
    const presets = {
      explosion: { count: 40, colors: ['#FF4444', '#FF8800', '#FFCC00', '#FFFFFF'], speed: 6, life: 35, size: 8, gravity: 0.15, shape: 'circle', shrink: true },
      sparkle: { count: 15, colors: ['#FFD700', '#FFF8DC', '#FFFACD', '#FFFFFF'], speed: 2, life: 30, size: 5, shape: 'star', spin: 0.2, fade: true },
      smoke: { count: 12, colors: ['#666666', '#888888', '#AAAAAA', '#CCCCCC'], speed: 1.5, life: 50, size: 12, gravity: -0.05, grow: 0.3, fade: true, shrink: false, shape: 'circle' },
      fire: { count: 25, colors: ['#FF0000', '#FF4400', '#FF8800', '#FFCC00', '#FFFF00'], speed: 3, life: 30, size: 8, gravity: -0.2, shrink: true, shape: 'circle', spread: Math.PI * 0.5, angle: -Math.PI / 2 },
      confetti: { count: 30, colors: ['#FF0000', '#00FF00', '#0066FF', '#FF00FF', '#FFFF00', '#00FFFF'], speed: 5, life: 60, size: 8, gravity: 0.12, shape: 'square', spin: 0.3, fade: false, shrink: false, drag: 0.97 },
      snow: { count: 8, colors: ['#FFFFFF', '#E8E8FF', '#DDDDFF'], speed: 1, life: 80, size: 5, gravity: 0.02, shape: 'circle', spread: Math.PI * 0.3, angle: Math.PI / 2, drag: 0.99 },
      hearts: { count: 10, colors: ['#FF1493', '#FF69B4', '#FFB6C1'], speed: 3, life: 40, size: 10, gravity: -0.08, shape: 'heart', spin: 0.1, fade: true },
      bubbles: { count: 10, colors: ['rgba(100,200,255,0.6)', 'rgba(150,220,255,0.5)', 'rgba(200,240,255,0.4)'], speed: 2, life: 60, size: 10, gravity: -0.1, shape: 'ring', grow: 0.2, fade: true, shrink: false },
      trail: { count: 5, colors: ['#00FFFF', '#0088FF', '#0044FF'], speed: 0.5, life: 20, size: 6, shape: 'circle', shrink: true, fade: true, spread: Math.PI * 0.3 },
      magic: { count: 20, colors: ['#FF00FF', '#8800FF', '#0088FF', '#00FFFF', '#FFD700'], speed: 3, life: 35, size: 6, shape: 'star', spin: 0.15, fade: true, grow: -0.02 },
    };
    const preset = presets[presetName];
    if (!preset) { this.onError(`Unknown particle preset: ${presetName}`); return; }
    this.emitParticles(x, y, { ...preset, ...overrides });
  }

  _renderParticle(ctx, p, sz) {
    const hs = sz / 2;
    switch (p.shape) {
      case 'circle':
        ctx.beginPath();
        ctx.arc(p.x, p.y, hs, 0, Math.PI * 2);
        if (p.outline) { ctx.strokeStyle = p.color; ctx.lineWidth = 1.5; ctx.stroke(); }
        else ctx.fill();
        break;
      case 'square':
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        if (p.outline) { ctx.strokeStyle = p.color; ctx.lineWidth = 1.5; ctx.strokeRect(-hs, -hs, sz, sz); }
        else ctx.fillRect(-hs, -hs, sz, sz);
        ctx.restore();
        break;
      case 'star': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.beginPath();
        for (let j = 0; j < 5; j++) {
          const a1 = (j * 2 * Math.PI / 5) - Math.PI / 2;
          const a2 = a1 + Math.PI / 5;
          ctx.lineTo(Math.cos(a1) * hs, Math.sin(a1) * hs);
          ctx.lineTo(Math.cos(a2) * hs * 0.4, Math.sin(a2) * hs * 0.4);
        }
        ctx.closePath();
        if (p.outline) { ctx.strokeStyle = p.color; ctx.lineWidth = 1.5; ctx.stroke(); }
        else ctx.fill();
        ctx.restore();
        break;
      }
      case 'spark': {
        const len = sz * 1.5;
        const vel = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const sparkAngle = vel > 0.1 ? Math.atan2(p.vy, p.vx) : p.rotation;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(sparkAngle);
        ctx.beginPath();
        ctx.moveTo(-len, 0);
        ctx.lineTo(0, -sz * 0.15);
        ctx.lineTo(len, 0);
        ctx.lineTo(0, sz * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'ring':
        ctx.beginPath();
        ctx.arc(p.x, p.y, hs, 0, Math.PI * 2);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, sz * 0.15);
        ctx.stroke();
        break;
      case 'heart': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        const s = sz / 16;
        ctx.beginPath();
        ctx.moveTo(0, s * 3);
        ctx.bezierCurveTo(-s * 5, -s * 2, -s * 8, s * 4, 0, s * 9);
        ctx.bezierCurveTo(s * 8, s * 4, s * 5, -s * 2, 0, s * 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'diamond': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.beginPath();
        ctx.moveTo(0, -hs);
        ctx.lineTo(hs * 0.6, 0);
        ctx.lineTo(0, hs);
        ctx.lineTo(-hs * 0.6, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'triangle': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.beginPath();
        ctx.moveTo(0, -hs);
        ctx.lineTo(hs, hs);
        ctx.lineTo(-hs, hs);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'sprite': {
        if (!p.spriteName) break;
        let img = null;
        const custom = this._resolveCustomSprite(p.spriteName);
        if (custom) {
          img = custom.image;
        } else {
          const info = getSpriteInfo(p.spriteName);
          if (info) {
            const cacheKey = `${p.spriteName}_1`;
            let frames = this._spriteCache.get(cacheKey);
            if (!frames) {
              frames = info.frames.map(f => renderPixelArt(f, 1));
              this._spriteCache.set(cacheKey, frames);
            }
            if (frames.length > 0) img = frames[0];
          }
        }
        if (img) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.drawImage(img, -hs, -hs, sz, sz);
          ctx.restore();
        }
        break;
      }
      default:
        ctx.fillRect(p.x - hs, p.y - hs, sz, sz);
    }
  }

  _updateAndRenderParticles(ctx) {
    const prevComposite = ctx.globalCompositeOperation;
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.vy += p.gravity;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += (p.spin || 0);
      p.size += (p.grow || 0);
      p.life--;
      if (p.life <= 0 || p.size <= 0) { this._particles.splice(i, 1); continue; }
      const ratio = p.life / p.maxLife;
      ctx.globalAlpha = p.fade ? ratio : 1;
      const sz = p.shrink ? Math.max(0.5, p.size * ratio) : p.size;
      ctx.fillStyle = p.color;
      if (p.blendMode && p.blendMode !== 'source-over') ctx.globalCompositeOperation = p.blendMode;
      this._renderParticle(ctx, p, sz);
      if (p.blendMode && p.blendMode !== 'source-over') ctx.globalCompositeOperation = prevComposite;
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = prevComposite;
  }

  _updatePhysics() {
    if (!this.physicsEnabled) return;
    for (const obj of this.objects.values()) {
      if (!obj.visible) continue;
      const vx = obj.vx || 0, vy = obj.vy || 0;
      if (vx === 0 && vy === 0 && !obj.ax && !obj.ay) continue;
      obj.vx = (vx + (obj.ax || 0)) * (obj.friction !== undefined ? obj.friction : 1);
      obj.vy = (vy + (obj.ay || 0)) * (obj.friction !== undefined ? obj.friction : 1);
      obj.x += obj.vx;
      obj.y += obj.vy;
      if (obj.bounce && obj.bounce > 0) {
        const b = obj.bounce;
        if (obj.type === 'circle') {
          const r = obj.radius;
          if (obj.x - r < 0) { obj.x = r; obj.vx = Math.abs(obj.vx) * b; }
          if (obj.x + r > this.width) { obj.x = this.width - r; obj.vx = -Math.abs(obj.vx) * b; }
          if (obj.y - r < 0) { obj.y = r; obj.vy = Math.abs(obj.vy) * b; }
          if (obj.y + r > this.height) { obj.y = this.height - r; obj.vy = -Math.abs(obj.vy) * b; }
        } else {
          const w = obj.width || 0, h = obj.height || 0;
          if (obj.x < 0) { obj.x = 0; obj.vx = Math.abs(obj.vx) * b; }
          if (obj.x + w > this.width) { obj.x = this.width - w; obj.vx = -Math.abs(obj.vx) * b; }
          if (obj.y < 0) { obj.y = 0; obj.vy = Math.abs(obj.vy) * b; }
          if (obj.y + h > this.height) { obj.y = this.height - h; obj.vy = -Math.abs(obj.vy) * b; }
        }
      }
    }
  }

  _setupInput() {
    this.canvas.setAttribute('tabindex', '0');
    this.canvas.addEventListener('keydown', this._boundKeyDown);
    this.canvas.addEventListener('keyup', this._boundKeyUp);
    this.canvas.addEventListener('mousemove', this._boundMouseMove);
    this.canvas.addEventListener('mousedown', this._boundMouseDown);
    this.canvas.addEventListener('mouseup', this._boundMouseUp);
    this.canvas.addEventListener('mouseenter', this._boundMouseEnter);
    this.canvas.addEventListener('mouseleave', this._boundMouseLeave);
    this.canvas.addEventListener('touchstart', this._boundTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this._boundTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this._boundTouchEnd, { passive: false });
    this.canvas.addEventListener('touchcancel', this._boundTouchEnd, { passive: false });
  }

  focusCanvas() {
    this.canvas.focus();
  }

  destroy() {
    this.stop();
    this.canvas.removeEventListener('keydown', this._boundKeyDown);
    this.canvas.removeEventListener('keyup', this._boundKeyUp);
    this.canvas.removeEventListener('mousemove', this._boundMouseMove);
    this.canvas.removeEventListener('mousedown', this._boundMouseDown);
    this.canvas.removeEventListener('mouseup', this._boundMouseUp);
    this.canvas.removeEventListener('mouseenter', this._boundMouseEnter);
    this.canvas.removeEventListener('mouseleave', this._boundMouseLeave);
    this.canvas.removeEventListener('touchstart', this._boundTouchStart);
    this.canvas.removeEventListener('touchmove', this._boundTouchMove);
    this.canvas.removeEventListener('touchend', this._boundTouchEnd);
    this.canvas.removeEventListener('touchcancel', this._boundTouchEnd);
    if (this._tiltPermission) {
      window.removeEventListener('devicemotion', this._boundDeviceMotion);
    }
    this.hideMobileControls();
  }

  createObject(type, props) {
    const id = this._nextId++;
    const obj = {
      id,
      type,
      x: props.x || 0,
      y: props.y || 0,
      width: props.width || 0,
      height: props.height || 0,
      radius: props.radius || 0,
      color: props.color || 'white',
      text: props.text || '',
      fontSize: props.fontSize || 20,
      fontFamily: props.fontFamily || 'monospace',
      bold: props.bold || false,
      italic: props.italic || false,
      underline: props.underline || false,
      strikethrough: props.strikethrough || false,
      textAlign: props.textAlign || 'left',
      outlineColor: props.outlineColor || '',
      outlineWidth: props.outlineWidth || 2,
      shadowColor: props.shadowColor || '',
      shadowBlur: props.shadowBlur || 0,
      shadowX: props.shadowX || 0,
      shadowY: props.shadowY || 0,
      letterSpacing: props.letterSpacing || 0,
      background: props.background || '',
      padding: props.padding || 0,
      visible: props.visible !== undefined ? !!props.visible : true,
      rotation: 0,
      opacity: 1,
      layer: props.layer || 0,
      fixed: props.fixed || false,
      outline: props.outline || false,
      lineWidth: props.lineWidth || 2,
      x2: props.x2 || 0,
      y2: props.y2 || 0,
    };
    this.objects.set(id, obj);
    return id;
  }

  createButton(props) {
    const id = this._nextId++;
    const obj = {
      id,
      type: 'button',
      x: props.x || 0,
      y: props.y || 0,
      width: props.width || 0,
      height: props.height || 0,
      text: props.text || 'Button',
      color: props.color || '#FF6B35',
      hoverColor: props.hoverColor || '',
      pressColor: props.pressColor || '',
      textColor: props.textColor || 'white',
      disabledColor: props.disabledColor || '#555',
      disabledTextColor: props.disabledTextColor || '#999',
      fontSize: props.fontSize || 18,
      fontFamily: props.fontFamily || 'Arial',
      bold: props.bold !== undefined ? props.bold : true,
      italic: false,
      borderColor: props.borderColor || '',
      borderWidth: props.borderWidth || 2,
      radius: props.radius !== undefined ? props.radius : 8,
      shadowColor: props.shadowColor || '',
      shadowBlur: props.shadowBlur || 0,
      shadowX: props.shadowX || 0,
      shadowY: props.shadowY || 0,
      padding: props.padding !== undefined ? props.padding : 12,
      disabled: false,
      visible: true,
      rotation: 0,
      opacity: 1,
      layer: props.layer || 0,
      fixed: props.fixed || false,
    };
    // Auto-size if width/height not given
    if (!obj.width || !obj.height) {
      const ctx = this.ctx;
      ctx.font = `${obj.bold ? 'bold ' : ''}${obj.fontSize}px ${obj.fontFamily}`;
      const m = ctx.measureText(obj.text);
      if (!obj.width) obj.width = m.width + obj.padding * 2;
      if (!obj.height) obj.height = obj.fontSize + obj.padding * 2;
    }
    this.objects.set(id, obj);
    return id;
  }

  getObject(id) {
    return this.objects.get(id);
  }

  removeObject(id) {
    this.objects.delete(id);
  }

  cloneObject(id) {
    const src = this.objects.get(id);
    if (!src) return null;
    const newId = this._nextId++;
    const clone = { ...src, id: newId };
    clone.visible = src.type === 'point' ? false : true;
    if (clone._frames) clone._frames = [...clone._frames];
    clone._onClick = null;
    clone._onHoverEnter = null;
    clone._onHoverExit = null;
    clone._hovered = false;
    this.objects.set(newId, clone);
    for (const h of this._cloneHandlers) {
      if (h.source !== id) continue;
      try { h.fn(id, newId); } catch (e) { this.onError(e.toString()); }
    }
    return newId;
  }

  onClone(sourceId, callback) {
    this._cloneHandlers.push({ source: sourceId, fn: callback });
  }

  follow(followerId, targetId, speed) {
    const f = this.objects.get(followerId);
    const t = this.objects.get(targetId);
    if (!f || !t) return;
    const dx = t.x - f.x;
    const dy = t.y - f.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > speed) {
      f.vx = (dx / dist) * speed;
      f.vy = (dy / dist) * speed;
    } else {
      f.vx = 0;
      f.vy = 0;
    }
  }

  setBackgroundImage(nameOrImage) {
    if (typeof nameOrImage === 'string') {
      const asset = this.assets?.get(nameOrImage);
      if (asset && (asset.type === 'background' || asset.type === 'sprite')) {
        this._backgroundImage = asset.image;
      }
    } else {
      this._backgroundImage = nameOrImage;
    }
  }

  clearBackgroundImage() {
    this._backgroundImage = null;
  }

  _resolveCustomSprite(name) {
    if (!this.assets) return null;
    return this.assets.find(name, 'sprite');
  }

  _resolveSound(name) {
    if (!this.assets) return null;
    return this.assets.find(name, 'sound');
  }

  createSprite(name, x, y, scale = 4) {
    const custom = this._resolveCustomSprite(name);
    if (custom) {
      const baseW = custom.width || custom.image?.width || 16;
      const baseH = custom.height || custom.image?.height || 16;
      const w = baseW * scale;
      const h = baseH * scale;
      const id = this._nextId++;
      const hasFrames = custom.frames && custom.frames.length > 1;
      this.objects.set(id, {
        id, type: 'sprite', x, y,
        width: w, height: h,
        _baseW: baseW, _baseH: baseH, _scale: scale,
        _canvas: custom.image,
        _drawW: w, _drawH: h,
        _frames: hasFrames ? custom.frames : null,
        _fps: hasFrames ? (custom.fps || 4) : 0,
        _animate: hasFrames,
        _frameIdx: 0,
        flipX: false, flipY: false,
        visible: true, rotation: 0, opacity: 1, layer: 0,
      });
      return id;
    }

    const info = getSpriteInfo(name);
    if (!info) return null;

    const cacheKey = `${name}_${scale}`;
    let frames = this._spriteCache.get(cacheKey);
    if (!frames) {
      frames = info.frames.map(f => renderPixelArt(f, scale));
      this._spriteCache.set(cacheKey, frames);
    }

    const id = this._nextId++;
    const first = frames[0];
    this.objects.set(id, {
      id, type: 'sprite', x, y,
      width: first.width, height: first.height,
      _baseW: first.width / (scale || 1), _baseH: first.height / (scale || 1), _scale: scale,
      _canvas: first,
      _drawW: first.width, _drawH: first.height,
      _frames: frames.length > 1 ? frames : null,
      _fps: info.fps || 4,
      _animate: frames.length > 1,
      _frameIdx: 0,
      flipX: false, flipY: false,
      visible: true, rotation: 0, opacity: 1, layer: 0,
    });
    return id;
  }

  createCustomSprite(x, y, rows, colorMap, scale = 4) {
    const pixelData = parseCustomSprite(rows, colorMap);
    const spriteCanvas = renderPixelArt(pixelData, scale);

    const id = this._nextId++;
    const obj = {
      id,
      type: 'sprite',
      x, y,
      width: spriteCanvas.width,
      height: spriteCanvas.height,
      _baseW: spriteCanvas.width / (scale || 1),
      _baseH: spriteCanvas.height / (scale || 1),
      _scale: scale,
      _canvas: spriteCanvas,
      _drawW: spriteCanvas.width,
      _drawH: spriteCanvas.height,
      _cacheKey: null,
      flipX: false,
      flipY: false,
      visible: true,
      rotation: 0,
      opacity: 1,
      layer: 0,
    };
    this.objects.set(id, obj);
    return id;
  }

  resizeSprite(id, scale) {
    const obj = this.objects.get(id);
    if (!obj || obj.type !== 'sprite') return;
    const safeScale = Math.max(0.1, Number(scale) || 1);
    const baseW = obj._baseW || obj.width || 0;
    const baseH = obj._baseH || obj.height || 0;
    obj._scale = safeScale;
    obj.width = baseW * safeScale;
    obj.height = baseH * safeScale;
    obj._drawW = obj.width;
    obj._drawH = obj.height;
  }

  getSpriteNames() {
    const custom = this.assets ? this.assets.names('sprite') : [];
    return [...getSpriteNames(), ...custom];
  }

  start() {
    this.running = true;
    this.focusCanvas();
    this._gameLoop();
  }

  stop() {
    this.running = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  reset() {
    this.stop();
    this.stopAllSounds();
    this.objects.clear();
    this._spriteCache.clear();
    this.updateCallback = null;
    this.frameCount = 0;
    this.elapsedMs = 0;
    this.keys.clear();
    this._justPressed.clear();
    this._justReleased.clear();
    this._mouseJustClicked = false;
    this._mouseJustReleased = false;
    this._onKeyCallback = null;
    this._onKeyUpCallback = null;
    this._onClickCallback = null;
    this._timers = [];
    this._tweens = [];
    this._particles = [];
    this._emitters = [];
    this._nextEmitterId = 1;
    this._transition = null;
    this._shakeIntensity = 0;
    this._flashAlpha = 0;
    this.cameraX = 0;
    this.cameraY = 0;
    this._nextId = 1;
    this._scenes = {};
    this._currentScene = '';
    this._groups = {};
    this._bubbles = new Map();
    this._tilemaps = [];
    this._overlapHandlers = [];
    this._cloneHandlers = [];
    this.backgroundColor = '#1a1a2e';
    this.gameTitle = 'My Game';
    this.gridVisible = false;
    this._render();
  }

  _gameLoop() {
    if (!this.running) return;

    const dt = 1000 / 60;
    this._updateTimers();
    this._updatePhysics();
    this._updateTweens();
    this._tickEmitters();
    this._checkOverlaps();
    this._updateScreenEffects();

    if (this.updateCallback) {
      try {
        this.updateCallback();
      } catch (e) {
        this.onError(e.toString());
        this.stop();
        return;
      }
    }

    this._render();
    this._clearFrameInput();
    this.elapsedMs += dt;
    this.frameCount++;
    this.animationId = requestAnimationFrame(() => this._gameLoop());
  }

  // ==================== Talk Bubbles ====================

  showBubble(objectId, text, options = {}) {
    const type = options.type || 'say';
    const duration = options.duration != null ? options.duration : 3000;
    const scrollSpeed = options.scrollSpeed != null ? options.scrollSpeed : 40;
    const maxWidth = options.maxWidth || 150;
    const fontSize = options.fontSize || 14;

    const bubble = {
      objectId, text, type, maxWidth, fontSize, scrollSpeed,
      duration,
      startTime: performance.now(),
      scrollOffset: 0,
    };
    this._bubbles.set(objectId, bubble);

    if (duration > 0) {
      this.addTimer(duration, () => {
        if (this._bubbles.get(objectId) === bubble) {
          this._bubbles.delete(objectId);
        }
      }, false);
    }
  }

  hideBubble(objectId) {
    this._bubbles.delete(objectId);
  }

  _renderBubbles(ctx, objects, isWorld) {
    const now = performance.now();
    for (const [objId, bubble] of this._bubbles) {
      const obj = this.objects.get(objId);
      if (!obj || !obj.visible) continue;
      if (isWorld && obj.fixed) continue;
      if (!isWorld && !obj.fixed) continue;

      const b = this._getBBox(obj);
      const maxW = bubble.maxWidth;
      const pad = 8;
      const fs = bubble.fontSize;
      const lineH = fs + 4;

      ctx.save();
      ctx.font = `${fs}px Arial, sans-serif`;
      ctx.textBaseline = 'top';

      const words = bubble.text.split(' ');
      const lines = [];
      let curLine = '';
      for (const word of words) {
        const test = curLine ? curLine + ' ' + word : word;
        if (ctx.measureText(test).width > maxW - pad * 2) {
          if (curLine) lines.push(curLine);
          curLine = word;
        } else {
          curLine = test;
        }
      }
      if (curLine) lines.push(curLine);
      if (lines.length === 0) lines.push('');

      const maxVisibleLines = 3;
      const totalLines = lines.length;
      const needsScroll = totalLines > maxVisibleLines;
      const visibleLines = Math.min(totalLines, maxVisibleLines);

      const textH = visibleLines * lineH;
      const bubbleW = Math.min(maxW, Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2);
      const bubbleH = textH + pad * 2;
      const tailH = 8;

      const bx = b.x + b.w / 2 - bubbleW / 2;
      const by = b.y - bubbleH - tailH - 4;
      const clampedX = Math.max(2, Math.min(this.width - bubbleW - 2, bx));
      const clampedY = Math.max(2, by);

      let scrollLine = 0;
      let scrollFrac = 0;
      if (needsScroll) {
        const elapsed = (now - bubble.startTime) / 1000;
        const scrollPos = (elapsed * bubble.scrollSpeed) / lineH;
        const maxScroll = totalLines - visibleLines;
        const ping = scrollPos % (maxScroll * 2);
        const effective = ping <= maxScroll ? ping : maxScroll * 2 - ping;
        scrollLine = Math.floor(effective);
        scrollFrac = effective - scrollLine;
      }

      // Bubble background
      const isSay = bubble.type === 'say';
      const r = 8;
      ctx.fillStyle = isSay ? 'rgba(255,255,255,0.95)' : 'rgba(230,240,255,0.92)';
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(clampedX + r, clampedY);
      ctx.lineTo(clampedX + bubbleW - r, clampedY);
      ctx.quadraticCurveTo(clampedX + bubbleW, clampedY, clampedX + bubbleW, clampedY + r);
      ctx.lineTo(clampedX + bubbleW, clampedY + bubbleH - r);
      ctx.quadraticCurveTo(clampedX + bubbleW, clampedY + bubbleH, clampedX + bubbleW - r, clampedY + bubbleH);
      ctx.lineTo(clampedX + r, clampedY + bubbleH);
      ctx.quadraticCurveTo(clampedX, clampedY + bubbleH, clampedX, clampedY + bubbleH - r);
      ctx.lineTo(clampedX, clampedY + r);
      ctx.quadraticCurveTo(clampedX, clampedY, clampedX + r, clampedY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Tail
      const tailX = b.x + b.w / 2;
      const tailCX = Math.max(clampedX + 12, Math.min(clampedX + bubbleW - 12, tailX));
      if (isSay) {
        ctx.beginPath();
        ctx.moveTo(tailCX - 6, clampedY + bubbleH);
        ctx.lineTo(tailCX, clampedY + bubbleH + tailH);
        ctx.lineTo(tailCX + 6, clampedY + bubbleH);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fill();
        ctx.stroke();
      } else {
        const dotR = 3;
        for (let i = 0; i < 3; i++) {
          const dy = clampedY + bubbleH + 4 + i * (dotR * 2 + 2);
          const dx = tailCX + i * 2;
          ctx.beginPath();
          ctx.arc(dx, dy, dotR - i * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(230,240,255,0.85)';
          ctx.fill();
          ctx.stroke();
        }
      }

      // Text (clipped)
      ctx.save();
      ctx.beginPath();
      ctx.rect(clampedX, clampedY, bubbleW, bubbleH);
      ctx.clip();

      ctx.fillStyle = '#1a1a2e';
      const textX = clampedX + pad;
      const textBaseY = clampedY + pad - scrollFrac * lineH;

      for (let i = 0; i < visibleLines + 1 && scrollLine + i < totalLines; i++) {
        const ly = textBaseY + i * lineH;
        if (ly + lineH < clampedY || ly > clampedY + bubbleH) continue;
        ctx.fillText(lines[scrollLine + i], textX, ly);
      }

      ctx.restore();
      ctx.restore();
    }
  }

  _getBBox(obj) {
    if (obj.type === 'circle') {
      const r = obj.radius || 0;
      return { x: obj.x - r, y: obj.y - r, w: r * 2, h: r * 2 };
    }
    return { x: obj.x, y: obj.y, w: obj.width || 0, h: obj.height || 0 };
  }

  _render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(0, 0, w, h);

    if (this._backgroundImage) {
      ctx.drawImage(this._backgroundImage, 0, 0, w, h);
    }

    if (this.gridVisible) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= w; x += 50) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y <= h; y += 50) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      for (let x = 50; x <= w; x += 50) {
        ctx.fillText(String(x), Math.min(x + 2, w - 24), 2);
      }

      for (let y = 50; y <= h; y += 50) {
        ctx.fillText(String(y), 2, Math.min(y + 2, h - 12));
      }

      if (this.mouseInside) {
        const label = `x:${this.mouseX} y:${this.mouseY}`;
        ctx.font = '12px monospace';
        const textWidth = ctx.measureText(label).width;
        const boxX = Math.max(6, Math.min(this.mouseX + 12, w - textWidth - 14));
        const boxY = Math.max(6, Math.min(this.mouseY + 12, h - 24));

        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(boxX - 4, boxY - 3, textWidth + 8, 18);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, boxX, boxY);
      }

      ctx.restore();
    }

    // Camera + shake offset
    ctx.save();
    let shakeX = 0, shakeY = 0;
    if (this._shakeIntensity > 0) {
      const ratio = 1 - this._shakeElapsed / this._shakeDuration;
      const si = this._shakeIntensity * Math.max(0, ratio);
      shakeX = (Math.random() - 0.5) * 2 * si;
      shakeY = (Math.random() - 0.5) * 2 * si;
    }
    ctx.translate(-this.cameraX + shakeX, -this.cameraY + shakeY);

    for (const tm of this._tilemaps) {
      if (tm.visible) this._renderTileMap(ctx, tm);
    }

    const allSorted = [...this.objects.values()].sort((a, b) => a.layer - b.layer);
    const worldObjs = allSorted.filter(o => !o.fixed);
    const fixedObjs = allSorted.filter(o => o.fixed);

    for (const obj of worldObjs) {
      if (!obj.visible) continue;

      ctx.save();
      ctx.globalAlpha = obj.opacity;

      if (obj.rotation && obj.type !== 'line') {
        const cx = obj.type === 'circle' ? obj.x : obj.x + (obj.width || 0) / 2;
        const cy = obj.type === 'circle' ? obj.y : obj.y + (obj.height || 0) / 2;
        ctx.translate(cx, cy);
        ctx.rotate(obj.rotation * Math.PI / 180);
        ctx.translate(-cx, -cy);
      }

      this._renderObject(ctx, obj);

      ctx.restore();
    }

    // Particles (rendered in world space)
    this._updateAndRenderParticles(ctx);

    // Talk bubbles on world objects
    if (this._bubbles.size > 0) this._renderBubbles(ctx, worldObjs, true);

    ctx.restore(); // end camera transform

    // Fixed / HUD objects (not affected by camera)
    for (const obj of fixedObjs) {
      if (!obj.visible) continue;
      ctx.save();
      ctx.globalAlpha = obj.opacity;
      if (obj.rotation && obj.type !== 'line') {
        const cx = obj.type === 'circle' ? obj.x : obj.x + (obj.width || 0) / 2;
        const cy = obj.type === 'circle' ? obj.y : obj.y + (obj.height || 0) / 2;
        ctx.translate(cx, cy);
        ctx.rotate(obj.rotation * Math.PI / 180);
        ctx.translate(-cx, -cy);
      }
      this._renderObject(ctx, obj);
      ctx.restore();
    }

    // Talk bubbles on fixed objects
    if (this._bubbles.size > 0) this._renderBubbles(ctx, fixedObjs, false);

    // Flash overlay
    if (this._flashAlpha > 0) {
      ctx.globalAlpha = this._flashAlpha;
      ctx.fillStyle = this._flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    // Transition overlay
    if (this._transition) {
      const tr = this._transition;
      const half = tr.duration / 2;
      const coverAmount = tr.elapsed < half
        ? tr.elapsed / half
        : 1 - (tr.elapsed - half) / half;
      ctx.fillStyle = tr.color;
      switch (tr.type) {
        case 'fade':
          ctx.globalAlpha = Math.max(0, coverAmount);
          ctx.fillRect(0, 0, w, h);
          ctx.globalAlpha = 1;
          break;
        case 'wipe_left':
          ctx.fillRect(0, 0, w * coverAmount, h);
          break;
        case 'wipe_right':
          ctx.fillRect(w * (1 - coverAmount), 0, w * coverAmount, h);
          break;
        case 'wipe_down':
          ctx.fillRect(0, 0, w, h * coverAmount);
          break;
        case 'wipe_up':
          ctx.fillRect(0, h * (1 - coverAmount), w, h * coverAmount);
          break;
        case 'circle': {
          const maxR = Math.sqrt(w * w + h * h) / 2;
          const r = maxR * (1 - coverAmount);
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'curtain': {
          const half_w = w * coverAmount / 2;
          ctx.fillRect(0, 0, half_w, h);
          ctx.fillRect(w - half_w, 0, half_w, h);
          break;
        }
        case 'diagonal': {
          ctx.save();
          ctx.beginPath();
          const extend = w + h;
          const offset = extend * coverAmount;
          ctx.moveTo(-h, 0);
          ctx.lineTo(-h + offset, 0);
          ctx.lineTo(offset, h);
          ctx.lineTo(0, h);
          ctx.closePath();
          ctx.clip();
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
          break;
        }
        case 'blinds': {
          const slats = 8;
          const slH = h / slats;
          for (let i = 0; i < slats; i++) {
            ctx.fillRect(0, i * slH, w, slH * coverAmount);
          }
          break;
        }
        case 'pixelate': {
          const minBlock = 2;
          const maxBlock = 40;
          const blockSize = Math.max(minBlock, Math.round(maxBlock * coverAmount));
          for (let bx = 0; bx < w; bx += blockSize) {
            for (let by = 0; by < h; by += blockSize) {
              ctx.globalAlpha = coverAmount;
              ctx.fillRect(bx, by, blockSize, blockSize);
            }
          }
          ctx.globalAlpha = 1;
          break;
        }
        case 'diamonds': {
          const cols = 8;
          const rows = 8;
          const cw = w / cols;
          const ch = h / rows;
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const cx = c * cw + cw / 2;
              const cy = r * ch + ch / 2;
              const s = coverAmount * Math.max(cw, ch) * 0.75;
              ctx.save();
              ctx.translate(cx, cy);
              ctx.rotate(Math.PI / 4);
              ctx.fillRect(-s, -s, s * 2, s * 2);
              ctx.restore();
            }
          }
          break;
        }
        case 'squares': {
          const sq = 10;
          const sw = w / sq;
          const sh = h / sq;
          if (!tr._order) {
            tr._order = [];
            for (let r = 0; r < sq; r++)
              for (let c = 0; c < sq; c++) tr._order.push([c, r]);
            for (let i = tr._order.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [tr._order[i], tr._order[j]] = [tr._order[j], tr._order[i]];
            }
          }
          const count = Math.floor(coverAmount * tr._order.length);
          for (let i = 0; i < count; i++) {
            const [c, r] = tr._order[i];
            ctx.fillRect(c * sw, r * sh, sw + 1, sh + 1);
          }
          break;
        }
      }
    }

    // Reset cursor if no button is hovered
    let anyHovered = false;
    for (const obj of this.objects.values()) {
      if (obj.type === 'button' && obj._hovered && !obj.disabled && obj.visible) {
        anyHovered = true;
        break;
      }
    }
    if (!anyHovered) this.canvas.style.cursor = '';
  }

  _renderObject(ctx, obj) {
    switch (obj.type) {
        case 'point':
          break;
        case 'rect':
          if (obj.outline) {
            ctx.strokeStyle = obj.color;
            ctx.lineWidth = obj.lineWidth;
            ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
          } else {
            ctx.fillStyle = obj.color;
            ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
          }
          break;

        case 'circle':
          ctx.beginPath();
          ctx.arc(obj.x, obj.y, obj.radius, 0, Math.PI * 2);
          if (obj.outline) {
            ctx.strokeStyle = obj.color;
            ctx.lineWidth = obj.lineWidth;
            ctx.stroke();
          } else {
            ctx.fillStyle = obj.color;
            ctx.fill();
          }
          break;

        case 'text': {
          let fontStr = '';
          if (obj.italic) fontStr += 'italic ';
          if (obj.bold) fontStr += 'bold ';
          fontStr += `${obj.fontSize}px ${obj.fontFamily}`;
          ctx.font = fontStr;
          ctx.textAlign = obj.textAlign || 'left';
          ctx.textBaseline = 'top';

          const metrics = ctx.measureText(obj.text);
          const textW = metrics.width;
          const textH = obj.fontSize;
          const pad = obj.padding || 0;

          if (obj.background) {
            ctx.fillStyle = obj.background;
            let bgX = obj.x - pad;
            if (obj.textAlign === 'center') bgX = obj.x - textW / 2 - pad;
            else if (obj.textAlign === 'right') bgX = obj.x - textW - pad;
            ctx.fillRect(bgX, obj.y - pad, textW + pad * 2, textH + pad * 2);
          }

          if (obj.shadowColor) {
            ctx.shadowColor = obj.shadowColor;
            ctx.shadowBlur = obj.shadowBlur || 0;
            ctx.shadowOffsetX = obj.shadowX || 0;
            ctx.shadowOffsetY = obj.shadowY || 0;
          }

          ctx.fillStyle = obj.color;

          if (obj.letterSpacing && obj.letterSpacing !== 0) {
            let cx = obj.x;
            for (const ch of obj.text) {
              ctx.fillText(ch, cx, obj.y);
              if (obj.outlineColor) {
                ctx.strokeStyle = obj.outlineColor;
                ctx.lineWidth = obj.outlineWidth || 2;
                ctx.strokeText(ch, cx, obj.y);
              }
              cx += ctx.measureText(ch).width + obj.letterSpacing;
            }
          } else {
            ctx.fillText(obj.text, obj.x, obj.y);
            if (obj.outlineColor) {
              ctx.strokeStyle = obj.outlineColor;
              ctx.lineWidth = obj.outlineWidth || 2;
              ctx.strokeText(obj.text, obj.x, obj.y);
            }
          }

          // Reset shadow so it doesn't bleed into other objects
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;

          if (obj.underline || obj.strikethrough) {
            let lineX = obj.x;
            if (obj.textAlign === 'center') lineX = obj.x - textW / 2;
            else if (obj.textAlign === 'right') lineX = obj.x - textW;
            ctx.strokeStyle = obj.color;
            ctx.lineWidth = Math.max(1, obj.fontSize / 14);
            ctx.beginPath();
            if (obj.underline) {
              const uy = obj.y + textH + 2;
              ctx.moveTo(lineX, uy);
              ctx.lineTo(lineX + textW, uy);
            }
            if (obj.strikethrough) {
              const sy = obj.y + textH / 2;
              ctx.moveTo(lineX, sy);
              ctx.lineTo(lineX + textW, sy);
            }
            ctx.stroke();
          }

          // Store measured width for Python access
          obj.width = textW;
          obj.height = textH;

          ctx.textAlign = 'left';
          break;
        }

        case 'line':
          ctx.strokeStyle = obj.color;
          ctx.lineWidth = obj.lineWidth;
          ctx.beginPath();
          ctx.moveTo(obj.x, obj.y);
          ctx.lineTo(obj.x2, obj.y2);
          ctx.stroke();
          break;

        case 'sprite': {
          let frame = obj._canvas;
          if (obj._frames && obj._animate) {
            const interval = Math.max(1, Math.round(60 / obj._fps));
            const idx = Math.floor(this.frameCount / interval) % obj._frames.length;
            frame = obj._frames[idx];
            obj._frameIdx = idx;
          } else if (obj._frames) {
            frame = obj._frames[obj._frameIdx] || obj._frames[0];
          }
          if (frame) {
            ctx.imageSmoothingEnabled = false;
            if (obj.flipX || obj.flipY) {
              ctx.translate(
                obj.flipX ? obj.x * 2 + obj.width : 0,
                obj.flipY ? obj.y * 2 + obj.height : 0
              );
              ctx.scale(obj.flipX ? -1 : 1, obj.flipY ? -1 : 1);
            }
            if (obj._drawW) {
              ctx.drawImage(frame, obj.x, obj.y, obj._drawW, obj._drawH);
            } else {
              ctx.drawImage(frame, obj.x, obj.y);
            }
          }
          break;
        }

        case 'button': {
          const r = obj.radius || 0;
          const isHover = obj._hovered && !obj.disabled;
          const isPress = isHover && this.mouseDown;
          let bgColor;
          if (obj.disabled) bgColor = obj.disabledColor || '#555';
          else if (isPress && obj.pressColor) bgColor = obj.pressColor;
          else if (isHover && obj.hoverColor) bgColor = obj.hoverColor;
          else bgColor = obj.color;

          if (obj.shadowColor && !obj.disabled) {
            ctx.shadowColor = obj.shadowColor;
            ctx.shadowBlur = obj.shadowBlur || 0;
            ctx.shadowOffsetX = obj.shadowX || 0;
            ctx.shadowOffsetY = obj.shadowY || 0;
          }

          ctx.fillStyle = bgColor;
          ctx.beginPath();
          ctx.roundRect(obj.x, obj.y, obj.width, obj.height, r);
          ctx.fill();

          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;

          if (obj.borderColor) {
            ctx.strokeStyle = obj.borderColor;
            ctx.lineWidth = obj.borderWidth || 2;
            ctx.beginPath();
            ctx.roundRect(obj.x, obj.y, obj.width, obj.height, r);
            ctx.stroke();
          }

          const txtColor = obj.disabled ? (obj.disabledTextColor || '#999') : (obj.textColor || 'white');
          ctx.fillStyle = txtColor;
          ctx.font = `${obj.italic ? 'italic ' : ''}${obj.bold ? 'bold ' : ''}${obj.fontSize}px ${obj.fontFamily}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const cx = obj.x + obj.width / 2;
          const cy = obj.y + obj.height / 2;
          ctx.fillText(obj.text, cx, cy);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';

          if (isHover && !obj.disabled) {
            this.canvas.style.cursor = 'pointer';
          }
          break;
        }
      }
  }

  _updateScreenEffects() {
    const dt = 1000 / 60;
    if (this._shakeIntensity > 0) {
      this._shakeElapsed += dt;
      if (this._shakeElapsed >= this._shakeDuration) this._shakeIntensity = 0;
    }
    if (this._flashAlpha > 0) {
      this._flashElapsed += dt;
      this._flashAlpha = Math.max(0, 1 - this._flashElapsed / this._flashDuration);
    }
    if (this._transition) {
      const tr = this._transition;
      tr.elapsed += dt;
      const half = tr.duration / 2;
      if (!tr.midFired && tr.elapsed >= half) {
        tr.midFired = true;
        if (tr.onMid) try { tr.onMid(); } catch (_) {}
      }
      if (tr.elapsed >= tr.duration) {
        if (tr.onDone) try { tr.onDone(); } catch (_) {}
        this._transition = null;
      }
    }
  }

  // ==================== Sound System ====================

  _getAudioCtx() {
    if (!this._audioCtx || this._audioCtx.state === 'closed') {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._audioCtx.state === 'suspended') this._audioCtx.resume();
    return this._audioCtx;
  }

  playSound(frequency = 440, duration = 200, type = 'square', volume = 0.15) {
    try {
      const ctx = this._getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = frequency;
      osc.type = type;
      gain.gain.setValueAtTime(Math.min(1, Math.max(0, volume)), ctx.currentTime);
      osc.start(ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
      osc.stop(ctx.currentTime + duration / 1000 + 0.05);
    } catch (_) {}
  }

  playNote(noteName, duration = 300, volume = 0.15, type = 'square') {
    const freq = NOTE_FREQS[noteName.toUpperCase()];
    if (!freq) return;
    this.playSound(freq, duration, type, volume);
  }

  getSoundNames() {
    return this.assets ? this.assets.names('sound') : [];
  }

  playUploadedSound(name, volume = 1.0) {
    const entry = this._resolveSound(name);
    if (!entry || !entry.audioUrl) return;
    try {
      const audio = new Audio(entry.audioUrl);
      audio.volume = Math.min(1, Math.max(0, volume));
      audio.play().catch(() => {});
      this._playingAudios.push(audio);
      audio.addEventListener('ended', () => {
        this._playingAudios = this._playingAudios.filter(a => a !== audio);
      });
    } catch (_) {}
  }

  stopAllSounds() {
    for (const a of this._playingAudios) {
      try { a.pause(); a.currentTime = 0; } catch (_) {}
    }
    this._playingAudios = [];
  }

  // ==================== Screen Effects ====================

  shake(intensity = 5, durationMs = 300) {
    this._shakeIntensity = intensity;
    this._shakeDuration = durationMs;
    this._shakeElapsed = 0;
  }

  flash(color = 'white', durationMs = 200) {
    this._flashColor = color;
    this._flashAlpha = 1;
    this._flashDuration = durationMs;
    this._flashElapsed = 0;
  }

  startTransition(type = 'fade', durationMs = 500, color = 'black', onMid = null, onDone = null) {
    this._transition = {
      type, duration: durationMs, elapsed: 0,
      color, onMid, onDone, midFired: false,
    };
  }

  // ==================== Scenes ====================

  setScene(name) {
    this._currentScene = name;
    const setup = this._scenes && this._scenes[name];
    if (setup) {
      this.objects.clear();
      this._tweens = [];
      this._timers = [];
      this._particles = [];
      this._emitters = [];
      this._nextEmitterId = 1;
      this._overlapHandlers = [];
      this._cloneHandlers = [];
      this._tilemaps = [];
      this.updateCallback = null;
      this._onKeyCallback = null;
      this._onKeyUpCallback = null;
      this._onClickCallback = null;
      this.cameraX = 0;
      this.cameraY = 0;
      try { setup(); } catch (e) { this.onError(e.toString()); }
    }
  }

  setSceneWithTransition(name, type = 'fade', durationMs = 500, color = 'black') {
    this.startTransition(type, durationMs, color,
      () => { this.setScene(name); },
      null
    );
  }

  registerScene(name, setupFn) {
    if (!this._scenes) this._scenes = {};
    this._scenes[name] = setupFn;
  }

  getScene() {
    return this._currentScene || '';
  }

  // ==================== Collision Helpers ====================

  keepInside(objId, x, y, w, h) {
    const obj = this.objects.get(objId);
    if (!obj) return;
    const bx = x ?? 0;
    const by = y ?? 0;
    const bw = w ?? this.width;
    const bh = h ?? this.height;

    if (obj.type === 'circle') {
      const r = obj.radius;
      if (obj.x - r < bx) obj.x = bx + r;
      if (obj.x + r > bx + bw) obj.x = bx + bw - r;
      if (obj.y - r < by) obj.y = by + r;
      if (obj.y + r > by + bh) obj.y = by + bh - r;
    } else {
      const ow = obj.width || 0, oh = obj.height || 0;
      if (obj.x < bx) obj.x = bx;
      if (obj.x + ow > bx + bw) obj.x = bx + bw - ow;
      if (obj.y < by) obj.y = by;
      if (obj.y + oh > by + bh) obj.y = by + bh - oh;
    }
  }

  pushOut(aId, bId) {
    const a = this.objects.get(aId);
    const b = this.objects.get(bId);
    if (!a || !b) return false;

    const ax = a.type === 'circle' ? a.x - a.radius : a.x;
    const ay = a.type === 'circle' ? a.y - a.radius : a.y;
    const aw = a.type === 'circle' ? a.radius * 2 : (a.width || 0);
    const ah = a.type === 'circle' ? a.radius * 2 : (a.height || 0);
    const bx = b.type === 'circle' ? b.x - b.radius : b.x;
    const by = b.type === 'circle' ? b.y - b.radius : b.y;
    const bw = b.type === 'circle' ? b.radius * 2 : (b.width || 0);
    const bh = b.type === 'circle' ? b.radius * 2 : (b.height || 0);

    const overlapX = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
    const overlapY = Math.min(ay + ah, by + bh) - Math.max(ay, by);
    if (overlapX <= 0 || overlapY <= 0) return false;

    const acx = ax + aw / 2, acy = ay + ah / 2;
    const bcx = bx + bw / 2, bcy = by + bh / 2;

    if (overlapX < overlapY) {
      a.x += acx < bcx ? -overlapX : overlapX;
      if (a.vx !== undefined) a.vx = 0;
    } else {
      a.y += acy < bcy ? -overlapY : overlapY;
      if (a.vy !== undefined) a.vy = 0;
    }
    return true;
  }

  bounceOff(aId, bId) {
    const a = this.objects.get(aId);
    const b = this.objects.get(bId);
    if (!a || !b) return false;

    const ax = a.type === 'circle' ? a.x - a.radius : a.x;
    const ay = a.type === 'circle' ? a.y - a.radius : a.y;
    const aw = a.type === 'circle' ? a.radius * 2 : (a.width || 0);
    const ah = a.type === 'circle' ? a.radius * 2 : (a.height || 0);
    const bx = b.type === 'circle' ? b.x - b.radius : b.x;
    const by = b.type === 'circle' ? b.y - b.radius : b.y;
    const bw = b.type === 'circle' ? b.radius * 2 : (b.width || 0);
    const bh = b.type === 'circle' ? b.radius * 2 : (b.height || 0);

    const overlapX = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
    const overlapY = Math.min(ay + ah, by + bh) - Math.max(ay, by);
    if (overlapX <= 0 || overlapY <= 0) return false;

    const acx = ax + aw / 2, acy = ay + ah / 2;
    const bcx = bx + bw / 2, bcy = by + bh / 2;

    if (overlapX < overlapY) {
      a.x += acx < bcx ? -overlapX : overlapX;
      if (a.vx !== undefined) a.vx = -(a.vx || 0);
    } else {
      a.y += acy < bcy ? -overlapY : overlapY;
      if (a.vy !== undefined) a.vy = -(a.vy || 0);
    }
    return true;
  }

  // ==================== TileMap ====================

  createTileMap(cols, rows, tileSize) {
    const id = this._nextId++;
    const tm = {
      id, cols, rows, tileSize,
      data: Array.from({ length: rows }, () => new Array(cols).fill(0)),
      palette: {},
      x: 0, y: 0,
      visible: true,
    };
    this._tilemaps.push(tm);
    return id;
  }

  getTileMap(id) {
    return this._tilemaps.find(t => t.id === id) || null;
  }

  setTile(tmId, col, row, type) {
    const tm = this.getTileMap(tmId);
    if (tm && row >= 0 && row < tm.rows && col >= 0 && col < tm.cols) {
      tm.data[row][col] = type;
    }
  }

  getTile(tmId, col, row) {
    const tm = this.getTileMap(tmId);
    if (tm && row >= 0 && row < tm.rows && col >= 0 && col < tm.cols) {
      return tm.data[row][col];
    }
    return -1;
  }

  setTilePalette(tmId, type, options) {
    const tm = this.getTileMap(tmId);
    if (tm) {
      tm.palette[type] = {
        color: options.color || null,
        sprite: options.sprite || null,
        solid: !!options.solid,
      };
    }
  }

  setTileSolid(tmId, type, solid) {
    const tm = this.getTileMap(tmId);
    if (tm && tm.palette[type]) {
      tm.palette[type].solid = !!solid;
    }
  }

  tileAtPixel(tmId, px, py) {
    const tm = this.getTileMap(tmId);
    if (!tm) return -1;
    const col = Math.floor((px - tm.x) / tm.tileSize);
    const row = Math.floor((py - tm.y) / tm.tileSize);
    if (col < 0 || col >= tm.cols || row < 0 || row >= tm.rows) return -1;
    return tm.data[row][col];
  }

  objectOverlapsSolid(tmId, objId) {
    const tm = this.getTileMap(tmId);
    const obj = this.objects.get(objId);
    if (!tm || !obj) return false;
    const b = this._getBBox(obj);
    const c0 = Math.floor((b.x - tm.x) / tm.tileSize);
    const c1 = Math.floor((b.x + b.w - 1 - tm.x) / tm.tileSize);
    const r0 = Math.floor((b.y - tm.y) / tm.tileSize);
    const r1 = Math.floor((b.y + b.h - 1 - tm.y) / tm.tileSize);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (r < 0 || r >= tm.rows || c < 0 || c >= tm.cols) continue;
        const info = tm.palette[tm.data[r][c]];
        if (info && info.solid) return true;
      }
    }
    return false;
  }

  tileMapPushOut(tmId, objId) {
    const tm = this.getTileMap(tmId);
    const obj = this.objects.get(objId);
    if (!tm || !obj) return;
    const ts = tm.tileSize;
    const b = this._getBBox(obj);
    const c0 = Math.floor((b.x - tm.x) / ts);
    const c1 = Math.floor((b.x + b.w - 1 - tm.x) / ts);
    const r0 = Math.floor((b.y - tm.y) / ts);
    const r1 = Math.floor((b.y + b.h - 1 - tm.y) / ts);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (r < 0 || r >= tm.rows || c < 0 || c >= tm.cols) continue;
        const info = tm.palette[tm.data[r][c]];
        if (!info || !info.solid) continue;
        const tx = tm.x + c * ts, ty = tm.y + r * ts;
        const ox = Math.min(b.x + b.w, tx + ts) - Math.max(b.x, tx);
        const oy = Math.min(b.y + b.h, ty + ts) - Math.max(b.y, ty);
        if (ox <= 0 || oy <= 0) continue;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        const tcx = tx + ts / 2, tcy = ty + ts / 2;
        if (ox < oy) {
          obj.x += cx < tcx ? -ox : ox;
          if (obj.vx !== undefined) obj.vx = 0;
        } else {
          obj.y += cy < tcy ? -oy : oy;
          if (obj.vy !== undefined) obj.vy = 0;
        }
      }
    }
  }

  removeTileMap(tmId) {
    this._tilemaps = this._tilemaps.filter(t => t.id !== tmId);
  }

  _renderTileMap(ctx, tm) {
    const ts = tm.tileSize;
    for (let r = 0; r < tm.rows; r++) {
      for (let c = 0; c < tm.cols; c++) {
        const type = tm.data[r][c];
        if (type === 0) continue;
        const info = tm.palette[type];
        if (!info) continue;
        const x = tm.x + c * ts;
        const y = tm.y + r * ts;
        if (info.sprite) {
          const spr = this._resolveCustomSprite(info.sprite);
          if (spr && spr.image) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(spr.image, x, y, ts, ts);
          } else {
            const sprInfo = getSpriteInfo(info.sprite);
            if (sprInfo) {
              const ck = `${info.sprite}_tile`;
              let frames = this._spriteCache.get(ck);
              if (!frames) {
                frames = sprInfo.frames.map(f => renderPixelArt(f, 1));
                this._spriteCache.set(ck, frames);
              }
              if (frames[0]) {
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(frames[0], x, y, ts, ts);
              }
            }
          }
        } else if (info.color) {
          ctx.fillStyle = info.color;
          ctx.fillRect(x, y, ts, ts);
        }
      }
    }
  }

  // ==================== Collision Events ====================

  onOverlap(aId, bId, callback) {
    this._overlapHandlers.push({ a: aId, b: bId, fn: callback, _touching: false });
  }

  _checkOverlaps() {
    for (const h of this._overlapHandlers) {
      const a = this.objects.get(h.a);
      const b = this.objects.get(h.b);
      if (!a || !b || !a.visible || !b.visible) { h._touching = false; continue; }
      const touching = this._aabbTest(a, b);
      if (touching && !h._touching) {
        h._touching = true;
        try { h.fn(h.a, h.b); } catch (e) { this.onError(e.toString()); }
      } else if (!touching) {
        h._touching = false;
      }
    }
  }

  _aabbTest(a, b) {
    const ab = this._getBBox(a);
    const bb = this._getBBox(b);
    return ab.x < bb.x + bb.w && ab.x + ab.w > bb.x &&
           ab.y < bb.y + bb.h && ab.y + ab.h > bb.y;
  }

  // ==================== Color Detection ====================

  getColorAt(px, py) {
    const x = Math.round(px), y = Math.round(py);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return '#000000';
    const data = this.ctx.getImageData(x, y, 1, 1).data;
    return '#' + data[0].toString(16).padStart(2, '0') +
           data[1].toString(16).padStart(2, '0') +
           data[2].toString(16).padStart(2, '0');
  }

  touchingColor(objId, targetColor) {
    const obj = this.objects.get(objId);
    if (!obj || !obj.visible) return false;
    const b = this._getBBox(obj);
    const target = this._parseColor(targetColor);
    if (!target) return false;
    const step = Math.max(2, Math.min(8, Math.floor(Math.min(b.w, b.h) / 4)));
    for (let x = b.x; x <= b.x + b.w; x += step) {
      if (this._colorMatch(x, b.y, target)) return true;
      if (this._colorMatch(x, b.y + b.h, target)) return true;
    }
    for (let y = b.y; y <= b.y + b.h; y += step) {
      if (this._colorMatch(b.x, y, target)) return true;
      if (this._colorMatch(b.x + b.w, y, target)) return true;
    }
    return false;
  }

  _parseColor(c) {
    if (!c) return null;
    const hex = c.replace('#', '');
    if (hex.length !== 6) return null;
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }

  _colorMatch(px, py, target, tolerance = 30) {
    const x = Math.round(px), y = Math.round(py);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    const d = this.ctx.getImageData(x, y, 1, 1).data;
    return Math.abs(d[0] - target[0]) <= tolerance &&
           Math.abs(d[1] - target[1]) <= tolerance &&
           Math.abs(d[2] - target[2]) <= tolerance;
  }

  // ==================== Storage ====================

  saveData(key, value) {
    try { localStorage.setItem('stemplitude_game_' + key, JSON.stringify(value)); } catch (_) {}
  }

  loadData(key, defaultValue) {
    try {
      const v = localStorage.getItem('stemplitude_game_' + key);
      return v !== null ? JSON.parse(v) : (defaultValue !== undefined ? defaultValue : null);
    } catch (_) { return defaultValue !== undefined ? defaultValue : null; }
  }

  deleteData(key) {
    try { localStorage.removeItem('stemplitude_game_' + key); } catch (_) {}
  }
}

const _EASINGS = {
  linear: t => t,
  ease_in: t => t * t,
  ease_out: t => t * (2 - t),
  ease_in_out: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  bounce: t => {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; }
    if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; }
    t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375;
  },
  elastic: t => t === 0 || t === 1 ? t : -Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI),
  back: t => t * t * (2.70158 * t - 1.70158),
};

function _normalizeKey(raw) {
  const lower = raw.toLowerCase();
  switch (lower) {
    case 'arrowup':    return 'up';
    case 'arrowdown':  return 'down';
    case 'arrowleft':  return 'left';
    case 'arrowright': return 'right';
    case ' ':          return 'space';
    case 'escape':     return 'escape';
    case 'enter':      return 'enter';
    case 'backspace':  return 'backspace';
    case 'tab':        return 'tab';
    case 'shift':      return 'shift';
    case 'control':    return 'ctrl';
    case 'alt':        return 'alt';
    case 'meta':       return 'meta';
    case 'capslock':   return 'capslock';
    case 'delete':     return 'delete';
    default:           return lower;
  }
}

const NOTE_FREQS = {
  'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56,
  'E3': 164.81, 'F3': 174.61, 'F#3': 185.00, 'G3': 196.00,
  'G#3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
  'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13,
  'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00,
  'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
  'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25,
  'E5': 659.26, 'F5': 698.46, 'F#5': 739.99, 'G5': 783.99,
  'G#5': 830.61, 'A5': 880.00, 'A#5': 932.33, 'B5': 987.77,
};
