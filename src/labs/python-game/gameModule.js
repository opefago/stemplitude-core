/**
 * Returns the Skulpt $builtinmodule source for the `game` Python module.
 * Skulpt evaluates this string when Python code does `import game`.
 *
 * OOP Python API — all game objects are real Python objects:
 *
 *   r = game.Rect(x, y, w, h, color, outline)
 *   c = game.Circle(x, y, radius, color, outline)
 *   t = game.Text(content, x, y, color, size)
 *   l = game.Line(x1, y1, x2, y2, color, width)
 *   s = game.Sprite(name, x, y, scale)
 *   p = game.PixelSprite(x, y, rows, colors, scale)
 *   b = game.Button(text, x, y, width, height, color)
 *
 *   Common properties: .x  .y  .visible  .rotation  .opacity  .layer
 *   Common methods:    .move(dx,dy)  .move_to(x,y)  .touches(other)
 *                      .remove()  .hide()  .show()  .clone()
 *                      .keep_inside(x?,y?,w?,h?)  .push_out(other)  .bounce_off(other)
 *
 *   Rect/Circle:  .width  .height  .color  .outline
 *   Circle:       .radius
 *   Text:         .content  .color  .size
 *   Sprite:       .width  .height  .flip_x  .flip_y
 *   Line:         .x2  .y2  .color  .line_width
 *
 *   Module functions:
 *     game.title(str)             game.background(color)
 *     game.show_grid(bool)
 *     game.key_pressed(key)       game.key_just_pressed(key)
 *     game.key_just_released(key)
 *     game.mouse_x()  game.mouse_y()  game.mouse_down()
 *     game.mouse_clicked()        game.mouse_released()
 *     game.on_key(fn)  game.on_key_up(fn)  game.on_click(fn)
 *     game.wait(ms)  game.after(ms,fn)  game.every(ms,fn)
 *     game.cancel_timer(id)
 *     game.random_int(min,max)
 *     game.distance(a,b)          game.frame_count()
 *     game.sound(freq,dur,type)   game.sprite_names()
 *     game.tone(freq,dur,vol,type) game.note(name,dur,vol,type)
 *     game.play_sound(name,vol)   game.sound_names()
 *     game.stop_sounds()
 *     game.on_update(func)        game.start()        game.stop()
 *     game.WIDTH  game.HEIGHT
 *
 *   Assets:       game.asset_names(type?)  game.has_asset(name)
 *                 game.asset_info(name)    game.background_names()
 *                 game.set_background_image(name)  game.clear_background_image()
 *
 *   Physics:      .vx  .vy  .ax  .ay  .friction  .bounce
 *   Tweening:     game.tween(obj, prop, target, dur, easing, callback)
 *   Particles:    game.emit(x,y, **opts)  game.preset(name,x,y, **overrides)
 *                 game.Emitter(x,y, **opts)  game.emitter_on/off(id)
 *                 game.move_emitter(id,x,y)  game.remove_emitter(id)
 *     emit opts:  shape="circle"|"square"|"star"|"spark"|"ring"|"heart"|"diamond"|"triangle"|"sprite"
 *                 color/colors, count, speed, speed_spread, size, size_spread
 *                 life, life_spread, gravity, drag, fade, shrink, grow, spin, outline, sprite, blend
 *     presets:    "explosion","sparkle","smoke","fire","confetti","snow","hearts","bubbles","trail","magic"
 *   Scenes:       game.on_scene(name, fn)  game.scene(name)  game.get_scene()
 *   Collision:    game.keep_inside(obj)  game.push_out(a,b)  game.bounce_off(a,b)
 *   Groups:       g = game.Group()  g.add(obj)  g.remove(obj)  g.has(obj)
 *                 g.for_each(fn)  g.remove_all()  g.any_touch(obj)
 *                 g.get_touching(obj)  g.count()  len(g)
 *   HUD:          game.Score(x,y,prefix,color,size)  game.Lives(x,y,max,color)
 *                 game.HealthBar(x,y,w,h,color)  game.Timer(x,y,secs,count_down)
 *                 game.Message(text,duration,color,size)
 *   Camera:       game.camera_x(val)  game.camera_y(val)  game.camera_follow(obj)
 *   Effects:      game.shake(i,d)  game.flash(c,d)  game.transition(type,d,c)
 *   Storage:      game.save(k,v)  game.load(k)  game.delete_save(k)
 *   Helpers:      game.random_float(a,b) game.random_color() game.choice(list)
 *                 game.lerp(a,b,t) game.clamp(val,min,max)
 */
export function getGameModuleSource() {
  /* eslint-disable no-useless-escape */
  return `var $builtinmodule = function(name) {
  var mod = {};
  var engine = Sk.gameEngine;
  if (!engine) throw new Sk.builtin.RuntimeError("Game engine not initialized");
  if (!Sk.generic) Sk.generic = { getAttr: Sk.builtin.object.prototype.GenericGetAttr };

  var NONE = Sk.builtin.none.none$;
  var TRUE = Sk.builtin.bool.true$;
  var FALSE = Sk.builtin.bool.false$;
  function jsv(v) { return Sk.ffi.remapToJs(v); }
  function pyInt(v) { return new Sk.builtin.int_(v); }
  function pyFloat(v) { return new Sk.builtin.float_(v); }
  function pyStr(v) { return new Sk.builtin.str(v); }
  function pyBool(v) { return v ? TRUE : FALSE; }
  function optJs(v, def) { return v !== undefined ? jsv(v) : def; }
  function gn(p) { return typeof p === 'string' ? p : (p.v !== undefined ? p.v : String(p)); }

  mod.WIDTH = pyInt(engine.width);
  mod.HEIGHT = pyInt(engine.height);

  // ========== Setup ==========
  mod.title = new Sk.builtin.func(function(t) {
    engine.gameTitle = jsv(t);
    if (engine.onTitleChange) engine.onTitleChange(engine.gameTitle);
    return NONE;
  });
  mod.background = new Sk.builtin.func(function(c) {
    engine.backgroundColor = jsv(c);
    return NONE;
  });
  mod.show_grid = new Sk.builtin.func(function(s) {
    engine.gridVisible = s === undefined ? true : jsv(s);
    return NONE;
  });

  // ========== Collision helper ==========
  function bbox(o) {
    if (!o) return null;
    if (o.type === 'circle') return {x: o.x - o.radius, y: o.y - o.radius, w: o.radius * 2, h: o.radius * 2};
    return {x: o.x, y: o.y, w: o.width || 0, h: o.height || 0};
  }
  function aabb(a, b) {
    var ba = bbox(a), bb = bbox(b);
    if (!ba || !bb) return false;
    return ba.x < bb.x + bb.w && ba.x + ba.w > bb.x &&
           ba.y < bb.y + bb.h && ba.y + ba.h > bb.y;
  }
  function eid(obj) {
    return (obj && obj._eid !== undefined) ? obj._eid : jsv(obj);
  }
  function wrapLike(obj, id) {
    var cls = obj.ob$type;
    var inst = new cls();
    inst._eid = id;
    return inst;
  }

  // ========== Shared class infrastructure ==========
  function addMethods($loc) {
    $loc.move = new Sk.builtin.func(function(self, dx, dy) {
      var o = engine.getObject(self._eid);
      if (o) { o.x += jsv(dx); o.y += jsv(dy); }
      return NONE;
    });
    $loc.move_to = new Sk.builtin.func(function(self, x, y) {
      var o = engine.getObject(self._eid);
      if (o) { o.x = jsv(x); o.y = jsv(y); }
      return NONE;
    });
    $loc.touches = new Sk.builtin.func(function(self, other) {
      var a = engine.getObject(self._eid);
      var b = engine.getObject(eid(other));
      return pyBool(aabb(a, b));
    });
    $loc.remove = new Sk.builtin.func(function(self) {
      engine.removeObject(self._eid);
      return NONE;
    });
    $loc.hide = new Sk.builtin.func(function(self) {
      var o = engine.getObject(self._eid);
      if (o) o.visible = false;
      return NONE;
    });
    $loc.show = new Sk.builtin.func(function(self) {
      var o = engine.getObject(self._eid);
      if (o) o.visible = true;
      return NONE;
    });
    $loc.is_out = new Sk.builtin.func(function(self) {
      var o = engine.getObject(self._eid);
      if (!o) return TRUE;
      var b = bbox(o);
      return pyBool(b.x + b.w < 0 || b.x > engine.width || b.y + b.h < 0 || b.y > engine.height);
    });
    $loc.contains = new Sk.builtin.func(function(self, px, py) {
      var o = engine.getObject(self._eid);
      return pyBool(engine.containsPoint(o, jsv(px), jsv(py)));
    });
    $loc.on_click = new Sk.builtin.func(function(self, callback) {
      var o = engine.getObject(self._eid);
      if (o) {
        o._onClick = function(_id, mx, my) {
          try { Sk.misceval.callsimArray(callback, [self, pyInt(mx), pyInt(my)]); }
          catch(e) { engine.onError(e.toString()); }
        };
      }
      return NONE;
    });
    $loc.on_hover = new Sk.builtin.func(function(self, enterCb, exitCb) {
      var o = engine.getObject(self._eid);
      if (o) {
        if (enterCb && enterCb !== Sk.builtin.none.none$) {
          o._onHoverEnter = function(_id, mx, my) {
            try { Sk.misceval.callsimArray(enterCb, [self, pyInt(mx), pyInt(my)]); }
            catch(e) { engine.onError(e.toString()); }
          };
        }
        if (exitCb && exitCb !== Sk.builtin.none.none$) {
          o._onHoverExit = function(_id) {
            try { Sk.misceval.callsimArray(exitCb, [self]); }
            catch(e) { engine.onError(e.toString()); }
          };
        }
      }
      return NONE;
    });
    $loc.clone = new Sk.builtin.func(function(self) {
      var newId = engine.cloneObject(self._eid);
      if (newId === null) return NONE;
      return wrapLike(self, newId);
    });
    $loc.say = new Sk.builtin.func(function(self, text, duration, scroll_speed) {
      engine.showBubble(self._eid, jsv(text), {
        type: 'say',
        duration: duration !== undefined ? jsv(duration) : 3000,
        scrollSpeed: scroll_speed !== undefined ? jsv(scroll_speed) : 40,
      });
      return NONE;
    });
    $loc.think = new Sk.builtin.func(function(self, text, duration, scroll_speed) {
      engine.showBubble(self._eid, jsv(text), {
        type: 'think',
        duration: duration !== undefined ? jsv(duration) : 3000,
        scrollSpeed: scroll_speed !== undefined ? jsv(scroll_speed) : 40,
      });
      return NONE;
    });
    $loc.stop_talking = new Sk.builtin.func(function(self) {
      engine.hideBubble(self._eid);
      return NONE;
    });
    $loc.keep_inside = new Sk.builtin.func(function(self, bx, by, bw, bh) {
      engine.keepInside(self._eid, optJs(bx, null), optJs(by, null), optJs(bw, null), optJs(bh, null));
      return NONE;
    });
    $loc.push_out = new Sk.builtin.func(function(self, other) {
      return pyBool(engine.pushOut(self._eid, eid(other)));
    });
    $loc.bounce_off = new Sk.builtin.func(function(self, other) {
      return pyBool(engine.bounceOff(self._eid, eid(other)));
    });
    $loc.__repr__ = new Sk.builtin.func(function(self) {
      var o = engine.getObject(self._eid);
      if (!o) return pyStr("<removed>");
      return pyStr("<" + o.type + " at (" + Math.round(o.x) + ", " + Math.round(o.y) + ")>");
    });
  }

  function setupProps(klass, extraGet, extraSet) {
    var orig = klass.prototype.tp$getattr;
    klass.prototype.tp$getattr = function(pyName, canSuspend) {
      var n = gn(pyName);
      var o = engine.getObject(this._eid);
      if (o) {
        switch(n) {
          case 'x': return pyFloat(o.x);
          case 'y': return pyFloat(o.y);
          case 'visible': return pyBool(o.visible);
          case 'rotation': return pyFloat(o.rotation);
          case 'opacity': return pyFloat(o.opacity);
          case 'layer': return pyInt(o.layer);
          case 'vx': return pyFloat(o.vx || 0);
          case 'vy': return pyFloat(o.vy || 0);
          case 'ax': return pyFloat(o.ax || 0);
          case 'ay': return pyFloat(o.ay || 0);
          case 'friction': return pyFloat(o.friction !== undefined ? o.friction : 1);
          case 'bounce': return pyFloat(o.bounce || 0);
          case 'fixed': return pyBool(o.fixed || false);
        }
        if (extraGet[n]) return extraGet[n](o);
      }
      if (orig) return orig.call(this, pyName, canSuspend);
    };
    klass.prototype.tp$setattr = function(pyName, value, canSuspend) {
      var n = gn(pyName);
      var o = engine.getObject(this._eid);
      var jv = jsv(value);
      if (o) {
        switch(n) {
          case 'x': o.x = jv; return;
          case 'y': o.y = jv; return;
          case 'visible': o.visible = !!jv; return;
          case 'rotation': o.rotation = jv; return;
          case 'opacity': o.opacity = jv; return;
          case 'layer': o.layer = jv; return;
          case 'vx': o.vx = jv; return;
          case 'vy': o.vy = jv; return;
          case 'ax': o.ax = jv; return;
          case 'ay': o.ay = jv; return;
          case 'friction': o.friction = jv; return;
          case 'bounce': o.bounce = jv; return;
          case 'fixed': o.fixed = !!jv; return;
        }
        if (extraSet[n]) { extraSet[n](o, jv); return; }
      }
      Sk.builtin.object.prototype.tp$setattr.call(this, pyName, value, canSuspend);
    };
  }

  // ========== Rect ==========
  var RectClass = Sk.misceval.buildClass(mod, function($gbl, $loc) {
    $loc.__init__ = new Sk.builtin.func(function(self, x, y, w, h, color, outline) {
      self._eid = engine.createObject('rect', {
        x: jsv(x), y: jsv(y), width: jsv(w), height: jsv(h),
        color: optJs(color, 'white'), outline: optJs(outline, false)
      });
    });
    addMethods($loc);
  }, 'Rect', []);
  setupProps(RectClass, {
    width:   function(o) { return pyFloat(o.width); },
    height:  function(o) { return pyFloat(o.height); },
    color:   function(o) { return pyStr(o.color); },
    outline: function(o) { return pyBool(o.outline); }
  }, {
    width:   function(o, v) { o.width = v; },
    height:  function(o, v) { o.height = v; },
    color:   function(o, v) { o.color = v; },
    outline: function(o, v) { o.outline = !!v; }
  });
  mod.Rect = RectClass;

  // ========== Circle ==========
  var CircleClass = Sk.misceval.buildClass(mod, function($gbl, $loc) {
    $loc.__init__ = new Sk.builtin.func(function(self, x, y, radius, color, outline) {
      self._eid = engine.createObject('circle', {
        x: jsv(x), y: jsv(y), radius: jsv(radius),
        color: optJs(color, 'white'), outline: optJs(outline, false)
      });
    });
    addMethods($loc);
  }, 'Circle', []);
  setupProps(CircleClass, {
    radius:  function(o) { return pyFloat(o.radius); },
    width:   function(o) { return pyFloat(o.radius * 2); },
    height:  function(o) { return pyFloat(o.radius * 2); },
    color:   function(o) { return pyStr(o.color); },
    outline: function(o) { return pyBool(o.outline); }
  }, {
    radius:  function(o, v) { o.radius = v; },
    color:   function(o, v) { o.color = v; },
    outline: function(o, v) { o.outline = !!v; }
  });
  mod.Circle = CircleClass;

  // ========== Text ==========
  var TextClass = Sk.misceval.buildClass(mod, function($gbl, $loc) {
    $loc.__init__ = new Sk.builtin.func(function(self, content, x, y, color, size) {
      self._eid = engine.createObject('text', {
        text: jsv(content), x: jsv(x), y: jsv(y),
        color: optJs(color, 'white'), fontSize: optJs(size, 20)
      });
    });
    addMethods($loc);
  }, 'Text', []);
  setupProps(TextClass, {
    content:       function(o) { return pyStr(o.text); },
    color:         function(o) { return pyStr(o.color); },
    size:          function(o) { return pyInt(o.fontSize); },
    font:          function(o) { return pyStr(o.fontFamily); },
    bold:          function(o) { return pyBool(o.bold); },
    italic:        function(o) { return pyBool(o.italic); },
    underline:     function(o) { return pyBool(o.underline); },
    strikethrough: function(o) { return pyBool(o.strikethrough); },
    align:         function(o) { return pyStr(o.textAlign); },
    outline_color: function(o) { return pyStr(o.outlineColor || ''); },
    outline_width: function(o) { return pyFloat(o.outlineWidth); },
    shadow_color:  function(o) { return pyStr(o.shadowColor || ''); },
    shadow_blur:   function(o) { return pyFloat(o.shadowBlur); },
    shadow_x:      function(o) { return pyFloat(o.shadowX); },
    shadow_y:      function(o) { return pyFloat(o.shadowY); },
    letter_spacing:function(o) { return pyFloat(o.letterSpacing); },
    background:    function(o) { return pyStr(o.background || ''); },
    padding:       function(o) { return pyFloat(o.padding); },
    width:         function(o) { return pyFloat(o.width || 0); },
    height:        function(o) { return pyFloat(o.height || 0); }
  }, {
    content:       function(o, v) { o.text = String(v); },
    color:         function(o, v) { o.color = v; },
    size:          function(o, v) { o.fontSize = v; },
    font:          function(o, v) { o.fontFamily = v; },
    bold:          function(o, v) { o.bold = !!v; },
    italic:        function(o, v) { o.italic = !!v; },
    underline:     function(o, v) { o.underline = !!v; },
    strikethrough: function(o, v) { o.strikethrough = !!v; },
    align:         function(o, v) { o.textAlign = String(v); },
    outline_color: function(o, v) { o.outlineColor = String(v); },
    outline_width: function(o, v) { o.outlineWidth = v; },
    shadow_color:  function(o, v) { o.shadowColor = String(v); },
    shadow_blur:   function(o, v) { o.shadowBlur = v; },
    shadow_x:      function(o, v) { o.shadowX = v; },
    shadow_y:      function(o, v) { o.shadowY = v; },
    letter_spacing:function(o, v) { o.letterSpacing = v; },
    background:    function(o, v) { o.background = String(v); },
    padding:       function(o, v) { o.padding = v; }
  });
  mod.Text = TextClass;

  // ========== Point (invisible marker) ==========
  var PointClass = Sk.misceval.buildClass(mod, function($gbl, $loc) {
    $loc.__init__ = new Sk.builtin.func(function(self, x, y) {
      self._eid = engine.createObject('point', {
        x: jsv(x), y: jsv(y), width: 0, height: 0, visible: false
      });
    });
    addMethods($loc);
  }, 'Point', []);
  setupProps(PointClass, {
    width:  function() { return pyFloat(0); },
    height: function() { return pyFloat(0); }
  }, {});
  mod.Point = PointClass;

  // ========== Line ==========
  var LineClass = Sk.misceval.buildClass(mod, function($gbl, $loc) {
    $loc.__init__ = new Sk.builtin.func(function(self, x1, y1, x2, y2, color, width) {
      self._eid = engine.createObject('line', {
        x: jsv(x1), y: jsv(y1), x2: jsv(x2), y2: jsv(y2),
        color: optJs(color, 'white'), lineWidth: optJs(width, 2)
      });
    });
    addMethods($loc);
  }, 'Line', []);
  setupProps(LineClass, {
    x2:         function(o) { return pyFloat(o.x2); },
    y2:         function(o) { return pyFloat(o.y2); },
    color:      function(o) { return pyStr(o.color); },
    line_width: function(o) { return pyFloat(o.lineWidth); }
  }, {
    x2:         function(o, v) { o.x2 = v; },
    y2:         function(o, v) { o.y2 = v; },
    color:      function(o, v) { o.color = v; },
    line_width: function(o, v) { o.lineWidth = v; }
  });
  mod.Line = LineClass;

  function addAnimMethods($loc) {
    $loc.play = new Sk.builtin.func(function(self, fpsVal) {
      var o = engine.getObject(self._eid);
      if (!o) return NONE;
      if (fpsVal !== undefined) o._fps = Math.max(1, jsv(fpsVal));
      o._animate = true;
      return NONE;
    });
    $loc.stop = new Sk.builtin.func(function(self) {
      var o = engine.getObject(self._eid);
      if (o) o._animate = false;
      return NONE;
    });
    $loc.set_frame = new Sk.builtin.func(function(self, n) {
      var o = engine.getObject(self._eid);
      if (o) {
        o._frameIdx = Math.max(0, jsv(n));
        o._animate = false;
      }
      return NONE;
    });
  }

  // ========== Sprite (built-in pixel art) ==========
  var SpriteClass = Sk.misceval.buildClass(mod, function($gbl, $loc) {
    $loc.__init__ = new Sk.builtin.func(function(self, spriteName, x, y, scale) {
      var n = jsv(spriteName);
      var s = scale !== undefined ? jsv(scale) : 4;
      var id = engine.createSprite(n, jsv(x), jsv(y), s);
      if (id === null) throw new Sk.builtin.ValueError("Unknown sprite: '" + n + "'. Use game.sprite_names() to list available sprites.");
      self._eid = id;
    });
    addMethods($loc);
    addAnimMethods($loc);
  }, 'Sprite', []);
  setupProps(SpriteClass, {
    width:       function(o) { return pyFloat(o.width); },
    height:      function(o) { return pyFloat(o.height); },
    flip_x:      function(o) { return pyBool(o.flipX); },
    flip_y:      function(o) { return pyBool(o.flipY); },
    frame:       function(o) { return pyInt(o._frameIdx || 0); },
    fps:         function(o) { return pyInt(o._fps || 0); },
    animating:   function(o) { return pyBool(o._animate); },
    frame_count: function(o) { return pyInt(o._frames ? o._frames.length : 1); }
  }, {
    flip_x:    function(o, v) { o.flipX = !!v; },
    flip_y:    function(o, v) { o.flipY = !!v; },
    frame:     function(o, v) { o._frameIdx = Math.max(0, v); o._animate = false; },
    fps:       function(o, v) { o._fps = Math.max(1, v); },
    animating: function(o, v) { o._animate = !!v; }
  });
  mod.Sprite = SpriteClass;

  // ========== PixelSprite (custom pixel art) ==========
  var PixelSpriteClass = Sk.misceval.buildClass(mod, function($gbl, $loc) {
    $loc.__init__ = new Sk.builtin.func(function(self, x, y, rows, colors, scale) {
      var jsRows = [];
      for (var i = 0; i < rows.v.length; i++) jsRows.push(jsv(rows.v[i]));
      var jsColors = {};
      if (colors && colors.mp$subscript) {
        var it = colors.tp$iter(), k = it.tp$iternext();
        while (k !== undefined) {
          jsColors[jsv(k)] = jsv(colors.mp$subscript(k));
          k = it.tp$iternext();
        }
      }
      self._eid = engine.createCustomSprite(jsv(x), jsv(y), jsRows, jsColors, optJs(scale, 4));
    });
    addMethods($loc);
    addAnimMethods($loc);
  }, 'PixelSprite', []);
  setupProps(PixelSpriteClass, {
    width:       function(o) { return pyFloat(o.width); },
    height:      function(o) { return pyFloat(o.height); },
    flip_x:      function(o) { return pyBool(o.flipX); },
    flip_y:      function(o) { return pyBool(o.flipY); },
    frame:       function(o) { return pyInt(o._frameIdx || 0); },
    fps:         function(o) { return pyInt(o._fps || 0); },
    animating:   function(o) { return pyBool(o._animate); },
    frame_count: function(o) { return pyInt(o._frames ? o._frames.length : 1); }
  }, {
    flip_x:    function(o, v) { o.flipX = !!v; },
    flip_y:    function(o, v) { o.flipY = !!v; },
    frame:     function(o, v) { o._frameIdx = Math.max(0, v); o._animate = false; },
    fps:       function(o, v) { o._fps = Math.max(1, v); },
    animating: function(o, v) { o._animate = !!v; }
  });
  mod.PixelSprite = PixelSpriteClass;

  // ========== Button ==========
  var ButtonClass = Sk.misceval.buildClass(mod, function($gbl, $loc) {
    $loc.__init__ = new Sk.builtin.func(function(self, text, x, y, width, height, color) {
      var w = width !== undefined ? jsv(width) : 0;
      var h = height !== undefined ? jsv(height) : 0;
      self._eid = engine.createButton({
        text: jsv(text), x: jsv(x), y: jsv(y),
        width: w, height: h, color: optJs(color, '#FF6B35')
      });
    });
    addMethods($loc);
  }, 'Button', []);
  setupProps(ButtonClass, {
    text:               function(o) { return pyStr(o.text); },
    width:              function(o) { return pyFloat(o.width); },
    height:             function(o) { return pyFloat(o.height); },
    color:              function(o) { return pyStr(o.color); },
    hover_color:        function(o) { return pyStr(o.hoverColor || ''); },
    press_color:        function(o) { return pyStr(o.pressColor || ''); },
    text_color:         function(o) { return pyStr(o.textColor || 'white'); },
    text_size:          function(o) { return pyInt(o.fontSize); },
    font:               function(o) { return pyStr(o.fontFamily); },
    bold:               function(o) { return pyBool(o.bold); },
    italic:             function(o) { return pyBool(o.italic); },
    border_color:       function(o) { return pyStr(o.borderColor || ''); },
    border_width:       function(o) { return pyFloat(o.borderWidth); },
    radius:             function(o) { return pyFloat(o.radius); },
    padding:            function(o) { return pyFloat(o.padding); },
    disabled:           function(o) { return pyBool(o.disabled); },
    disabled_color:     function(o) { return pyStr(o.disabledColor || '#555'); },
    disabled_text_color:function(o) { return pyStr(o.disabledTextColor || '#999'); },
    shadow_color:       function(o) { return pyStr(o.shadowColor || ''); },
    shadow_blur:        function(o) { return pyFloat(o.shadowBlur); },
    shadow_x:           function(o) { return pyFloat(o.shadowX); },
    shadow_y:           function(o) { return pyFloat(o.shadowY); },
    hovered:            function(o) { return pyBool(o._hovered); }
  }, {
    text:               function(o, v) { o.text = String(v); },
    width:              function(o, v) { o.width = v; },
    height:             function(o, v) { o.height = v; },
    color:              function(o, v) { o.color = String(v); },
    hover_color:        function(o, v) { o.hoverColor = String(v); },
    press_color:        function(o, v) { o.pressColor = String(v); },
    text_color:         function(o, v) { o.textColor = String(v); },
    text_size:          function(o, v) { o.fontSize = v; },
    font:               function(o, v) { o.fontFamily = String(v); },
    bold:               function(o, v) { o.bold = !!v; },
    italic:             function(o, v) { o.italic = !!v; },
    border_color:       function(o, v) { o.borderColor = String(v); },
    border_width:       function(o, v) { o.borderWidth = v; },
    radius:             function(o, v) { o.radius = v; },
    padding:            function(o, v) { o.padding = v; },
    disabled:           function(o, v) { o.disabled = !!v; },
    disabled_color:     function(o, v) { o.disabledColor = String(v); },
    disabled_text_color:function(o, v) { o.disabledTextColor = String(v); },
    shadow_color:       function(o, v) { o.shadowColor = String(v); },
    shadow_blur:        function(o, v) { o.shadowBlur = v; },
    shadow_x:           function(o, v) { o.shadowX = v; },
    shadow_y:           function(o, v) { o.shadowY = v; }
  });
  mod.Button = ButtonClass;

  // ========== Input ==========
  mod.key_pressed = new Sk.builtin.func(function(key) {
    return pyBool(engine.keys.has(jsv(key).toLowerCase()));
  });
  mod.key_just_pressed = new Sk.builtin.func(function(key) {
    return pyBool(engine.isKeyJustPressed(jsv(key).toLowerCase()));
  });
  mod.key_just_released = new Sk.builtin.func(function(key) {
    return pyBool(engine.isKeyJustReleased(jsv(key).toLowerCase()));
  });
  mod.mouse_x = new Sk.builtin.func(function() { return pyInt(engine.mouseX); });
  mod.mouse_y = new Sk.builtin.func(function() { return pyInt(engine.mouseY); });
  mod.mouse_down = new Sk.builtin.func(function() { return pyBool(engine.mouseDown); });
  mod.mouse_clicked = new Sk.builtin.func(function() { return pyBool(engine.isMouseClicked()); });
  mod.mouse_released = new Sk.builtin.func(function() { return pyBool(engine.isMouseReleased()); });
  mod.on_key = new Sk.builtin.func(function(callback) {
    engine._onKeyCallback = function(key) {
      try { Sk.misceval.callsimArray(callback, [pyStr(key)]); } catch(e) { engine.onError(e.toString()); }
    };
    return NONE;
  });
  mod.on_key_up = new Sk.builtin.func(function(callback) {
    engine._onKeyUpCallback = function(key) {
      try { Sk.misceval.callsimArray(callback, [pyStr(key)]); } catch(e) { engine.onError(e.toString()); }
    };
    return NONE;
  });
  mod.on_click = new Sk.builtin.func(function(callback) {
    engine._onClickCallback = function(x, y) {
      try { Sk.misceval.callsimArray(callback, [pyInt(x), pyInt(y)]); } catch(e) { engine.onError(e.toString()); }
    };
    return NONE;
  });

  mod.hit_test = new Sk.builtin.func(function(px, py) {
    var obj = engine.hitTest(jsv(px), jsv(py));
    if (!obj) return NONE;
    return pyInt(obj.id);
  });

  // ========== Utility ==========
  mod.random_int = new Sk.builtin.func(function(mn, mx) {
    var a = jsv(mn), b = jsv(mx);
    return pyInt(Math.floor(Math.random() * (b - a + 1)) + a);
  });
  mod.distance = new Sk.builtin.func(function(a, b) {
    var o1 = engine.getObject(eid(a));
    var o2 = engine.getObject(eid(b));
    if (!o1 || !o2) return pyFloat(0);
    var dx = o1.x - o2.x, dy = o1.y - o2.y;
    return pyFloat(Math.sqrt(dx * dx + dy * dy));
  });
  mod.frame_count = new Sk.builtin.func(function() { return pyInt(engine.frameCount); });
  mod.sprite_names = new Sk.builtin.func(function() {
    var ns = engine.getSpriteNames(), out = [];
    for (var i = 0; i < ns.length; i++) out.push(pyStr(ns[i]));
    return new Sk.builtin.list(out);
  });

  // ========== Background image ==========
  mod.set_background_image = new Sk.builtin.func(function(name) {
    engine.setBackgroundImage(jsv(name));
    return NONE;
  });
  mod.clear_background_image = new Sk.builtin.func(function() {
    engine.clearBackgroundImage();
    return NONE;
  });

  // ========== Asset Manager ==========
  mod.background_names = new Sk.builtin.func(function() {
    var am = engine.assets;
    if (!am) return new Sk.builtin.list([]);
    return new Sk.builtin.list(am.names('background').map(function(n) { return pyStr(n); }));
  });
  mod.asset_names = new Sk.builtin.func(function(assetType) {
    var am = engine.assets;
    if (!am) return new Sk.builtin.list([]);
    var t = assetType !== undefined ? jsv(assetType) : null;
    return new Sk.builtin.list(am.names(t).map(function(n) { return pyStr(n); }));
  });
  mod.has_asset = new Sk.builtin.func(function(name) {
    var am = engine.assets;
    if (!am) return FALSE;
    return pyBool(am.has(jsv(name)));
  });
  mod.asset_info = new Sk.builtin.func(function(name) {
    var am = engine.assets;
    if (!am) return NONE;
    var a = am.get(jsv(name));
    if (!a) return NONE;
    var d = new Sk.builtin.dict([
      pyStr('name'), pyStr(a.name),
      pyStr('type'), pyStr(a.type),
      pyStr('source'), pyStr(a.source),
    ]);
    if (a.width) d.mp$ass_subscript(pyStr('width'), pyInt(a.width));
    if (a.height) d.mp$ass_subscript(pyStr('height'), pyInt(a.height));
    return d;
  });

  // ========== Timers ==========
  mod.wait = new Sk.builtin.func(function(ms) {
    var delay = jsv(ms);
    var susp = new Sk.misceval.Suspension();
    susp.resume = function() { return Sk.builtin.none.none$; };
    susp.data = { type: "Sk.promise", promise: new Promise(function(resolve) { setTimeout(resolve, delay); }) };
    return susp;
  });
  mod.after = new Sk.builtin.func(function(ms, callback) {
    var id = engine.addTimer(jsv(ms), function() {
      try { Sk.misceval.callsimArray(callback, []); } catch(e) { engine.onError(e.toString()); }
    }, false);
    return pyInt(id);
  });
  mod.every = new Sk.builtin.func(function(ms, callback) {
    var id = engine.addTimer(jsv(ms), function() {
      try { Sk.misceval.callsimArray(callback, []); } catch(e) { engine.onError(e.toString()); }
    }, true);
    return pyInt(id);
  });
  mod.cancel_timer = new Sk.builtin.func(function(timerId) {
    engine.cancelTimer(jsv(timerId));
    return NONE;
  });

  // ========== Sound ==========
  mod.sound = new Sk.builtin.func(function(freq, dur, type) {
    engine.playSound(optJs(freq, 440), optJs(dur, 200), optJs(type, 'square'));
    return NONE;
  });
  mod.tone = new Sk.builtin.func(function(freq, dur, vol, type) {
    engine.playSound(optJs(freq, 440), optJs(dur, 200), optJs(type, 'square'), optJs(vol, 0.15));
    return NONE;
  });
  mod.note = new Sk.builtin.func(function(name, dur, vol, type) {
    engine.playNote(jsv(name), optJs(dur, 300), optJs(vol, 0.15), optJs(type, 'square'));
    return NONE;
  });
  mod.play_sound = new Sk.builtin.func(function(name, vol) {
    engine.playUploadedSound(jsv(name), optJs(vol, 1.0));
    return NONE;
  });
  mod.sound_names = new Sk.builtin.func(function() {
    return new Sk.builtin.list(engine.getSoundNames().map(pyStr));
  });
  mod.stop_sounds = new Sk.builtin.func(function() {
    engine.stopAllSounds();
    return NONE;
  });

  // ========== Tweening ==========
  mod.tween = new Sk.builtin.func(function(obj, prop, target, duration, easing, callback) {
    var id = engine.addTween(eid(obj), jsv(prop), jsv(target), jsv(duration), optJs(easing, 'linear'), callback ? function() {
      try { Sk.misceval.callsimArray(callback, []); } catch(e) { engine.onError(e.toString()); }
    } : null);
    return pyInt(id);
  });
  mod.cancel_tween = new Sk.builtin.func(function(tweenId) {
    engine.cancelTween(jsv(tweenId));
    return NONE;
  });
  mod.cancel_tweens = new Sk.builtin.func(function(obj) {
    engine.cancelTweensFor(eid(obj));
    return NONE;
  });

  // ========== Particles ==========
  function kwFunc(minArgs, fn) {
    var wrapped = function() {
      var a = Array.prototype.slice.call(arguments);
      var kw = {};
      if (Array.isArray(a[0])) {
        var kwa = a.shift();
        for (var i = 0; i < kwa.length; i += 2) kw[kwa[i]] = jsv(kwa[i + 1]);
      }
      var dictIdx = -1;
      for (var j = minArgs; j < a.length; j++) {
        if (a[j] && a[j].mp$subscript && !(a[j] instanceof Sk.builtin.str)) { dictIdx = j; break; }
      }
      if (dictIdx >= 0) {
        var d = a[dictIdx];
        var it = d.tp$iter(), k = it.tp$iternext();
        while (k !== undefined) { kw[jsv(k)] = jsv(d.mp$subscript(k)); k = it.tp$iternext(); }
        a.splice(dictIdx, 1);
      }
      return fn(a, kw);
    };
    wrapped['co_kwargs'] = true;
    return new Sk.builtin.func(wrapped);
  }

  mod.emit = kwFunc(2, function(a, kw) {
    engine.emitParticles(jsv(a[0]), jsv(a[1]), kw);
    return NONE;
  });
  mod.particles = mod.emit;

  mod.preset = kwFunc(3, function(a, kw) {
    engine.emitPreset(jsv(a[0]), jsv(a[1]), jsv(a[2]), kw);
    return NONE;
  });

  mod.Emitter = kwFunc(2, function(a, kw) {
    var id = engine.createEmitter(jsv(a[0]), jsv(a[1]), kw);
    return pyInt(id);
  });

  mod.emitter_on = new Sk.builtin.func(function(eid) {
    engine.setEmitterActive(jsv(eid), true);
    return NONE;
  });
  mod.emitter_off = new Sk.builtin.func(function(eid) {
    engine.setEmitterActive(jsv(eid), false);
    return NONE;
  });
  mod.move_emitter = new Sk.builtin.func(function(eid, x, y) {
    engine.moveEmitter(jsv(eid), jsv(x), jsv(y));
    return NONE;
  });
  mod.remove_emitter = new Sk.builtin.func(function(eid) {
    engine.removeEmitter(jsv(eid));
    return NONE;
  });

  // ========== Camera ==========
  mod.camera_x = new Sk.builtin.func(function(val) {
    if (val !== undefined) engine.cameraX = jsv(val);
    return pyFloat(engine.cameraX);
  });
  mod.camera_y = new Sk.builtin.func(function(val) {
    if (val !== undefined) engine.cameraY = jsv(val);
    return pyFloat(engine.cameraY);
  });
  mod.camera_follow = new Sk.builtin.func(function(obj, smooth) {
    var o = engine.getObject(eid(obj));
    if (!o) return NONE;
    var s = optJs(smooth, 0.1);
    var tx = o.x - engine.width / 2;
    var ty = o.y - engine.height / 2;
    engine.cameraX += (tx - engine.cameraX) * s;
    engine.cameraY += (ty - engine.cameraY) * s;
    return NONE;
  });

  // ========== Screen Effects ==========
  mod.shake = new Sk.builtin.func(function(intensity, duration) {
    engine.shake(optJs(intensity, 5), optJs(duration, 300));
    return NONE;
  });
  mod.flash = new Sk.builtin.func(function(color, duration) {
    engine.flash(optJs(color, 'white'), optJs(duration, 200));
    return NONE;
  });
  mod.transition = new Sk.builtin.func(function(type, duration, color, onMid, onDone) {
    engine.startTransition(
      optJs(type, 'fade'), optJs(duration, 500), optJs(color, 'black'),
      onMid ? function() { try { Sk.misceval.callsimArray(onMid, []); } catch(e) { engine.onError(e.toString()); } } : null,
      onDone ? function() { try { Sk.misceval.callsimArray(onDone, []); } catch(e) { engine.onError(e.toString()); } } : null
    );
    return NONE;
  });

  // ========== Storage ==========
  mod.save = new Sk.builtin.func(function(key, value) {
    engine.saveData(jsv(key), jsv(value));
    return NONE;
  });
  mod.load = new Sk.builtin.func(function(key, defaultVal) {
    var v = engine.loadData(jsv(key), defaultVal !== undefined ? jsv(defaultVal) : null);
    if (v === null) return NONE;
    if (typeof v === 'number') return Number.isInteger(v) ? pyInt(v) : pyFloat(v);
    if (typeof v === 'string') return pyStr(v);
    if (typeof v === 'boolean') return pyBool(v);
    return pyStr(JSON.stringify(v));
  });
  mod.delete_save = new Sk.builtin.func(function(key) {
    engine.deleteData(jsv(key));
    return NONE;
  });

  // ========== Helper functions ==========
  mod.random_float = new Sk.builtin.func(function(mn, mx) {
    var a = jsv(mn), b = jsv(mx);
    return pyFloat(a + Math.random() * (b - a));
  });
  mod.random_color = new Sk.builtin.func(function() {
    return pyStr('#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'));
  });
  mod.choice = new Sk.builtin.func(function(lst) {
    var items = [];
    for (var i = 0; i < lst.v.length; i++) items.push(lst.v[i]);
    return items[Math.floor(Math.random() * items.length)];
  });
  mod.lerp = new Sk.builtin.func(function(a, b, t) {
    return pyFloat(jsv(a) + (jsv(b) - jsv(a)) * jsv(t));
  });
  mod.clamp = new Sk.builtin.func(function(val, mn, mx) {
    return pyFloat(Math.min(jsv(mx), Math.max(jsv(mn), jsv(val))));
  });

  // ========== Physics toggle ==========
  mod.physics_enabled = new Sk.builtin.func(function(val) {
    if (val !== undefined) engine.physicsEnabled = !!jsv(val);
    return pyBool(engine.physicsEnabled);
  });

  // ========== Scenes ==========
  mod.scene = new Sk.builtin.func(function(name) {
    engine.setScene(gn(name));
    return NONE;
  });
  mod.on_scene = new Sk.builtin.func(function(name, callback) {
    engine.registerScene(gn(name), function() {
      try { Sk.misceval.callsimArray(callback, []); }
      catch(e) { engine.onError(e.toString()); }
    });
    return NONE;
  });
  mod.get_scene = new Sk.builtin.func(function() {
    return pyStr(engine.getScene());
  });
  mod.scene_transition = new Sk.builtin.func(function(name, type, duration, color) {
    engine.setSceneWithTransition(
      gn(name), optJs(type, 'fade'), optJs(duration, 500), optJs(color, 'black')
    );
    return NONE;
  });

  // ========== Collision Helpers ==========
  mod.keep_inside = new Sk.builtin.func(function(obj, bx, by, bw, bh) {
    engine.keepInside(eid(obj), optJs(bx, null), optJs(by, null), optJs(bw, null), optJs(bh, null));
    return NONE;
  });
  mod.push_out = new Sk.builtin.func(function(obj, other) {
    return pyBool(engine.pushOut(eid(obj), eid(other)));
  });
  mod.bounce_off = new Sk.builtin.func(function(obj, other) {
    return pyBool(engine.bounceOff(eid(obj), eid(other)));
  });
  mod.follow = new Sk.builtin.func(function(obj, target, speed) {
    engine.follow(eid(obj), eid(target), jsv(speed));
    return NONE;
  });

  // ========== Groups ==========
  mod.Group = Sk.misceval.buildClass(mod, function($gbl, $loc) {
    $loc.__init__ = new Sk.builtin.func(function(self) {
      self._items = [];
      return NONE;
    });
    $loc.add = new Sk.builtin.func(function(self, obj) {
      self._items.push(obj);
      return NONE;
    });
    $loc.remove = new Sk.builtin.func(function(self, obj) {
      var targetId = eid(obj);
      self._items = self._items.filter(function(o) { return eid(o) !== targetId; });
      return NONE;
    });
    $loc.has = new Sk.builtin.func(function(self, obj) {
      var targetId = eid(obj);
      for (var i = 0; i < self._items.length; i++) {
        if (eid(self._items[i]) === targetId) return TRUE;
      }
      return FALSE;
    });
    $loc.for_each = new Sk.builtin.func(function(self, fn) {
      for (var i = 0; i < self._items.length; i++) {
        var o = engine.getObject(eid(self._items[i]));
        if (o) Sk.misceval.callsimArray(fn, [self._items[i]]);
      }
      return NONE;
    });
    $loc.remove_all = new Sk.builtin.func(function(self) {
      for (var i = 0; i < self._items.length; i++) {
        engine.removeObject(eid(self._items[i]));
      }
      self._items = [];
      return NONE;
    });
    $loc.any_touch = new Sk.builtin.func(function(self, obj) {
      var tgt = engine.getObject(eid(obj));
      if (!tgt) return FALSE;
      for (var i = 0; i < self._items.length; i++) {
        var o = engine.getObject(eid(self._items[i]));
        if (o && aabb(o, tgt)) return TRUE;
      }
      return FALSE;
    });
    $loc.get_touching = new Sk.builtin.func(function(self, obj) {
      var tgt = engine.getObject(eid(obj));
      var result = [];
      if (!tgt) return new Sk.builtin.list(result);
      for (var i = 0; i < self._items.length; i++) {
        var o = engine.getObject(eid(self._items[i]));
        if (o && aabb(o, tgt)) result.push(self._items[i]);
      }
      return new Sk.builtin.list(result);
    });
    $loc.count = new Sk.builtin.func(function(self) {
      return pyInt(self._items.length);
    });
    $loc.__len__ = new Sk.builtin.func(function(self) {
      return pyInt(self._items.length);
    });
    $loc.__repr__ = new Sk.builtin.func(function(self) {
      return pyStr("<Group with " + self._items.length + " objects>");
    });
  }, "Group", []);

  // ========== HUD Helpers ==========

  mod.Score = Sk.misceval.buildClass(mod, function($gbl, $loc) {
    $loc.__init__ = new Sk.builtin.func(function(self, x, y, prefix, color, size) {
      var px = optJs(x, 10), py = optJs(y, 10);
      var pfx = optJs(prefix, "\u2B50 ");
      var c = optJs(color, "#FFD700"), sz = optJs(size, 22);
      self._value = 0;
      self._prefix = pfx;
      self._sz = sz;
      self._bgEid = engine.createObject("rect", {
        x: px - 6, y: py - 4, width: 120, height: sz + 10,
        color: "rgba(0,0,0,0.55)", layer: 999, fixed: true
      });
      self._eid = engine.createObject("text", {
        x: px, y: py, text: pfx + "0", color: c, fontSize: sz,
        fontFamily: "monospace", bold: true, layer: 1000, fixed: true,
        shadowColor: "rgba(0,0,0,0.6)", shadowBlur: 4, shadowX: 1, shadowY: 1
      });
      return NONE;
    });
    $loc.__repr__ = new Sk.builtin.func(function(self) {
      return pyStr("<Score: " + self._value + ">");
    });
    $loc.tp$getattr = Sk.generic.getAttr;
    setupScoreProps($loc);
  }, "Score", []);

  function setupScoreProps($loc) {
    function _resizeBg(self) {
      var bg = engine.getObject(self._bgEid);
      var o = engine.getObject(self._eid);
      if (bg && o) {
        var charW = self._sz * 0.6;
        bg.width = Math.max(120, (self._prefix + String(self._value)).length * charW + 16);
      }
    }
    $loc.tp$getattr = function(pyName, canSuspend) {
      var n = gn(pyName);
      if (n === "value") return pyInt(this._value);
      if (n === "prefix") return pyStr(this._prefix);
      var o = engine.getObject(this._eid);
      if (o) {
        if (n === "x") return pyFloat(o.x);
        if (n === "y") return pyFloat(o.y);
        if (n === "color") return pyStr(o.color);
        if (n === "size") return pyInt(o.fontSize);
        if (n === "visible") return pyBool(o.visible);
      }
      return Sk.generic.getAttr.call(this, pyName, canSuspend);
    };
    $loc.tp$setattr = function(pyName, value) {
      var n = gn(pyName);
      var jv = jsv(value);
      var o = engine.getObject(this._eid);
      if (n === "value") { this._value = jv; if (o) o.text = this._prefix + String(jv); _resizeBg(this); return; }
      if (n === "prefix") { this._prefix = jv; if (o) o.text = jv + String(this._value); _resizeBg(this); return; }
      if (o) {
        if (n === "x") { o.x = jv; var bg = engine.getObject(this._bgEid); if (bg) bg.x = jv - 6; return; }
        if (n === "y") { o.y = jv; var bg = engine.getObject(this._bgEid); if (bg) bg.y = jv - 4; return; }
        if (n === "color") { o.color = jv; return; }
        if (n === "size") { o.fontSize = jv; return; }
        if (n === "visible") { o.visible = !!jv; var bg = engine.getObject(this._bgEid); if (bg) bg.visible = !!jv; return; }
      }
    };
    $loc.add = new Sk.builtin.func(function(self, amount) {
      self._value += optJs(amount, 1);
      var o = engine.getObject(self._eid);
      if (o) o.text = self._prefix + String(self._value);
      _resizeBg(self);
      return pyInt(self._value);
    });
    $loc.reset = new Sk.builtin.func(function(self) {
      self._value = 0;
      var o = engine.getObject(self._eid);
      if (o) o.text = self._prefix + "0";
      _resizeBg(self);
      return NONE;
    });
  }

  mod.Lives = Sk.misceval.buildClass(mod, function($gbl, $loc) {
    $loc.__init__ = new Sk.builtin.func(function(self, x, y, max, color, size, icon) {
      var px = optJs(x, 10), py = optJs(y, 40);
      var mx = optJs(max, 3);
      var c = optJs(color, null) || "#FF1493";
      var sz = optJs(size, null) || 22;
      var iconName = optJs(icon, null);
      self._max = mx;
      self._value = mx;
      self._color = c;
      self._eids = [];
      self._px = px;
      self._py = py;
      self._sz = sz;
      self._isSprite = !!iconName;
      var spacing = iconName ? sz + 6 : sz + 4;
      self._bgEid = engine.createObject("rect", {
        x: px - 6, y: py - 4, width: mx * spacing + 8, height: sz + 10,
        color: "rgba(0,0,0,0.55)", layer: 999, fixed: true
      });
      for (var i = 0; i < mx; i++) {
        var eid;
        if (iconName) {
          eid = engine.createSprite(iconName, px + i * spacing, py, Math.max(1, Math.round(sz / 8)));
          var sObj = engine.getObject(eid);
          if (sObj) { sObj.layer = 1000; sObj.fixed = true; }
        } else {
          eid = engine.createObject("text", {
            x: px + i * spacing, y: py, text: "\u2764",
            color: c, fontSize: sz, fontFamily: "sans-serif",
            layer: 1000, fixed: true,
            shadowColor: "rgba(0,0,0,0.5)", shadowBlur: 3, shadowX: 1, shadowY: 1
          });
        }
        self._eids.push(eid);
      }
      return NONE;
    });
    $loc.__repr__ = new Sk.builtin.func(function(self) {
      return pyStr("<Lives: " + self._value + "/" + self._max + ">");
    });
    $loc.tp$getattr = Sk.generic.getAttr;
    setupLivesProps($loc);
  }, "Lives", []);

  function setupLivesProps($loc) {
    function _refreshLives(self) {
      for (var i = 0; i < self._eids.length; i++) {
        var o = engine.getObject(self._eids[i]);
        if (!o) continue;
        if (self._isSprite) {
          o.visible = i < self._value;
          o.opacity = i < self._value ? 1 : 0.2;
        } else {
          o.visible = true;
          o.color = i < self._value ? self._color : "#333";
          o.opacity = i < self._value ? 1 : 0.3;
        }
      }
    }
    $loc.tp$getattr = function(pyName, canSuspend) {
      var n = gn(pyName);
      if (n === "value") return pyInt(this._value);
      if (n === "max") return pyInt(this._max);
      return Sk.generic.getAttr.call(this, pyName, canSuspend);
    };
    $loc.tp$setattr = function(pyName, value) {
      var n = gn(pyName);
      var jv = jsv(value);
      if (n === "value") {
        this._value = Math.max(0, Math.min(this._max, jv));
        _refreshLives(this);
        return;
      }
      if (n === "visible") {
        var bg = engine.getObject(this._bgEid);
        if (bg) bg.visible = !!jv;
        for (var i = 0; i < this._eids.length; i++) {
          var o = engine.getObject(this._eids[i]);
          if (o) o.visible = !!jv;
        }
        return;
      }
    };
    $loc.lose = new Sk.builtin.func(function(self, n) {
      var amount = optJs(n, 1);
      self._value = Math.max(0, self._value - amount);
      _refreshLives(self);
      return pyInt(self._value);
    });
    $loc.gain = new Sk.builtin.func(function(self, n) {
      var amount = optJs(n, 1);
      self._value = Math.min(self._max, self._value + amount);
      _refreshLives(self);
      return pyInt(self._value);
    });
    $loc.is_dead = new Sk.builtin.func(function(self) {
      return pyBool(self._value <= 0);
    });
  }

  mod.HealthBar = Sk.misceval.buildClass(mod, function($gbl, $loc) {
    $loc.__init__ = new Sk.builtin.func(function(self, x, y, width, height, color, bg_color) {
      var px = optJs(x, 10), py = optJs(y, 70);
      var bw = optJs(width, 200), bh = optJs(height, 20);
      var c = optJs(color, "#22c55e"), bgc = optJs(bg_color, "#222");
      self._value = 100;
      self._max = 100;
      self._w = bw;
      self._bh = bh;
      self._px = px;
      self._py = py;
      self._frameEid = engine.createObject("rect", {
        x: px - 2, y: py - 2, width: bw + 4, height: bh + 4,
        color: "rgba(255,255,255,0.25)", layer: 998, fixed: true
      });
      self._bgEid = engine.createObject("rect", {
        x: px, y: py, width: bw, height: bh, color: bgc, layer: 999, fixed: true
      });
      self._barEid = engine.createObject("rect", {
        x: px, y: py, width: bw, height: bh, color: c, layer: 1000, fixed: true
      });
      self._labelEid = engine.createObject("text", {
        x: px + bw / 2, y: py + 2, text: "100%",
        color: "white", fontSize: Math.max(10, bh - 6),
        fontFamily: "monospace", bold: true, textAlign: "center",
        layer: 1001, fixed: true,
        shadowColor: "rgba(0,0,0,0.7)", shadowBlur: 2, shadowX: 1, shadowY: 1
      });
      return NONE;
    });
    $loc.__repr__ = new Sk.builtin.func(function(self) {
      return pyStr("<HealthBar: " + self._value + "/" + self._max + ">");
    });
    $loc.tp$getattr = Sk.generic.getAttr;
    setupHealthProps($loc);
  }, "HealthBar", []);

  function setupHealthProps($loc) {
    function _refresh(self) {
      var pct = Math.max(0, Math.min(1, self._value / self._max));
      var bar = engine.getObject(self._barEid);
      var label = engine.getObject(self._labelEid);
      if (bar) {
        bar.width = self._w * pct;
        bar.color = pct > 0.5 ? "#22c55e" : pct > 0.25 ? "#eab308" : "#ef4444";
      }
      if (label) label.text = Math.round(pct * 100) + "%";
    }
    $loc.tp$getattr = function(pyName, canSuspend) {
      var n = gn(pyName);
      if (n === "value") return pyFloat(this._value);
      if (n === "max") return pyFloat(this._max);
      return Sk.generic.getAttr.call(this, pyName, canSuspend);
    };
    $loc.tp$setattr = function(pyName, value) {
      var n = gn(pyName);
      var jv = jsv(value);
      if (n === "value") { this._value = Math.max(0, Math.min(this._max, jv)); _refresh(this); return; }
      if (n === "max") { this._max = jv; _refresh(this); return; }
    };
    $loc.damage = new Sk.builtin.func(function(self, amount) {
      self._value = Math.max(0, self._value - optJs(amount, 10));
      _refresh(self);
      return pyFloat(self._value);
    });
    $loc.heal = new Sk.builtin.func(function(self, amount) {
      self._value = Math.min(self._max, self._value + optJs(amount, 10));
      _refresh(self);
      return pyFloat(self._value);
    });
    $loc.is_dead = new Sk.builtin.func(function(self) {
      return pyBool(self._value <= 0);
    });
  }

  mod.Timer = Sk.misceval.buildClass(mod, function($gbl, $loc) {
    $loc.__init__ = new Sk.builtin.func(function(self, x, y, seconds, count_down, color, size) {
      var px = optJs(x, 500), py = optJs(y, 10);
      var secs = optJs(seconds, 0);
      var cd = optJs(count_down, false);
      var c = optJs(color, "white"), sz = optJs(size, 22);
      self._seconds = secs;
      self._elapsed = cd ? secs : 0;
      self._countDown = cd;
      self._running = false;
      var displayText = "\u23F1 " + _fmtTime(cd ? secs : 0);
      self._bgEid = engine.createObject("rect", {
        x: px - 6, y: py - 4, width: sz * 5 + 12, height: sz + 10,
        color: "rgba(0,0,0,0.55)", layer: 999, fixed: true
      });
      self._eid = engine.createObject("text", {
        x: px, y: py, text: displayText,
        color: c, fontSize: sz, fontFamily: "monospace", bold: true,
        layer: 1000, fixed: true,
        shadowColor: "rgba(0,0,0,0.6)", shadowBlur: 4, shadowX: 1, shadowY: 1
      });
      self._timerId = null;
      return NONE;
    });
    $loc.__repr__ = new Sk.builtin.func(function(self) {
      return pyStr("<Timer: " + _fmtTime(self._elapsed) + ">");
    });
    $loc.tp$getattr = Sk.generic.getAttr;
    setupTimerProps($loc);
  }, "Timer", []);

  function _fmtTime(s) {
    var m = Math.floor(Math.abs(s) / 60);
    var sec = Math.floor(Math.abs(s) % 60);
    return (m < 10 ? "0" : "") + m + ":" + (sec < 10 ? "0" : "") + sec;
  }

  function setupTimerProps($loc) {
    var TIMER_ICON = "\u23F1 ";
    $loc.tp$getattr = function(pyName, canSuspend) {
      var n = gn(pyName);
      if (n === "elapsed") return pyFloat(this._elapsed);
      if (n === "running") return pyBool(this._running);
      if (n === "value") return pyFloat(this._elapsed);
      return Sk.generic.getAttr.call(this, pyName, canSuspend);
    };
    $loc.tp$setattr = function(pyName, value) {
      var n = gn(pyName);
      var jv = jsv(value);
      if (n === "value" || n === "elapsed") {
        this._elapsed = jv;
        var o = engine.getObject(this._eid);
        if (o) o.text = TIMER_ICON + _fmtTime(this._elapsed);
        return;
      }
      if (n === "visible") {
        var o = engine.getObject(this._eid);
        var bg = engine.getObject(this._bgEid);
        if (o) o.visible = !!jv;
        if (bg) bg.visible = !!jv;
        return;
      }
    };
    $loc.start = new Sk.builtin.func(function(self) {
      if (self._running) return NONE;
      self._running = true;
      self._timerId = engine.addTimer(1000, function() {
        if (self._countDown) {
          self._elapsed = Math.max(0, self._elapsed - 1);
        } else {
          self._elapsed += 1;
        }
        var o = engine.getObject(self._eid);
        if (o) {
          o.text = TIMER_ICON + _fmtTime(self._elapsed);
          if (self._countDown && self._elapsed <= 5) o.color = "#ef4444";
        }
      }, true);
      return NONE;
    });
    $loc.stop = new Sk.builtin.func(function(self) {
      self._running = false;
      if (self._timerId) { engine.cancelTimer(self._timerId); self._timerId = null; }
      return NONE;
    });
    $loc.reset = new Sk.builtin.func(function(self, secs) {
      self._elapsed = self._countDown ? optJs(secs, self._seconds) : 0;
      var o = engine.getObject(self._eid);
      if (o) { o.text = TIMER_ICON + _fmtTime(self._elapsed); o.color = "white"; }
      return NONE;
    });
    $loc.is_done = new Sk.builtin.func(function(self) {
      return pyBool(self._countDown && self._elapsed <= 0);
    });
  }

  mod.Message = Sk.misceval.buildClass(mod, function($gbl, $loc) {
    $loc.__init__ = new Sk.builtin.func(function(self, text, duration, color, size, bg) {
      var t = optJs(text, "");
      var dur = optJs(duration, 2000);
      var c = optJs(color, "white"), sz = optJs(size, 32);
      var bgc = optJs(bg, "rgba(0,0,0,0.7)");
      self._bgEid = engine.createObject("rect", {
        x: 0, y: engine.height / 2 - sz, width: engine.width, height: sz * 2 + 20,
        color: bgc, layer: 1100, fixed: true
      });
      self._eid = engine.createObject("text", {
        x: engine.width / 2, y: engine.height / 2 - sz / 2,
        text: t, color: c, fontSize: sz, fontFamily: "Arial",
        bold: true, textAlign: "center", layer: 1101, fixed: true,
        shadowColor: "rgba(0,0,0,0.8)", shadowBlur: 6, shadowX: 2, shadowY: 2
      });
      if (dur > 0) {
        engine.addTimer(dur, function() {
          engine.removeObject(self._bgEid);
          engine.removeObject(self._eid);
        }, false);
      }
      return NONE;
    });
    $loc.__repr__ = new Sk.builtin.func(function(self) {
      var o = engine.getObject(self._eid);
      return pyStr("<Message: " + (o ? o.text : "gone") + ">");
    });
    $loc.remove = new Sk.builtin.func(function(self) {
      engine.removeObject(self._bgEid);
      engine.removeObject(self._eid);
      return NONE;
    });
    $loc.tp$getattr = function(pyName, canSuspend) {
      var n = gn(pyName);
      var o = engine.getObject(this._eid);
      if (n === "text" && o) return pyStr(o.text);
      return Sk.generic.getAttr.call(this, pyName, canSuspend);
    };
    $loc.tp$setattr = function(pyName, value) {
      var n = gn(pyName);
      if (n === "text") { var o = engine.getObject(this._eid); if (o) o.text = jsv(value); }
    };
  }, "Message", []);

  // ========== TileMap ==========
  mod.TileMap = Sk.misceval.buildClass(mod, function($gbl, $loc) {
    $loc.__init__ = new Sk.builtin.func(function(self, cols, rows, tile_size) {
      var c = optJs(cols, 20), r = optJs(rows, 15), ts = optJs(tile_size, 32);
      self._eid = engine.createTileMap(c, r, ts);
      return NONE;
    });
    $loc.__repr__ = new Sk.builtin.func(function(self) {
      var tm = engine.getTileMap(self._eid);
      if (!tm) return pyStr("<TileMap removed>");
      return pyStr("<TileMap " + tm.cols + "x" + tm.rows + " tile=" + tm.tileSize + ">");
    });
    $loc.set_tile = new Sk.builtin.func(function(self, col, row, type) {
      engine.setTile(self._eid, jsv(col), jsv(row), jsv(type));
      return NONE;
    });
    $loc.get_tile = new Sk.builtin.func(function(self, col, row) {
      return pyInt(engine.getTile(self._eid, jsv(col), jsv(row)));
    });
    $loc.set_palette = new Sk.builtin.func(function(self, type, color, solid, sprite) {
      engine.setTilePalette(self._eid, jsv(type), {
        color: optJs(color, null),
        solid: optJs(solid, false),
        sprite: optJs(sprite, null),
      });
      return NONE;
    });
    $loc.set_solid = new Sk.builtin.func(function(self, type, solid) {
      engine.setTileSolid(self._eid, jsv(type), optJs(solid, true));
      return NONE;
    });
    $loc.tile_at_pixel = new Sk.builtin.func(function(self, px, py) {
      return pyInt(engine.tileAtPixel(self._eid, jsv(px), jsv(py)));
    });
    $loc.overlaps_solid = new Sk.builtin.func(function(self, obj) {
      return pyBool(engine.objectOverlapsSolid(self._eid, eid(obj)));
    });
    $loc.push_out = new Sk.builtin.func(function(self, obj) {
      engine.tileMapPushOut(self._eid, eid(obj));
      return NONE;
    });
    $loc.set_data = new Sk.builtin.func(function(self, data) {
      var rows = jsv(data);
      var tm = engine.getTileMap(self._eid);
      if (tm && rows && rows.length) {
        for (var r = 0; r < Math.min(rows.length, tm.rows); r++) {
          var row = rows[r];
          if (row) for (var c = 0; c < Math.min(row.length, tm.cols); c++) {
            tm.data[r][c] = row[c] || 0;
          }
        }
      }
      return NONE;
    });
    $loc.remove = new Sk.builtin.func(function(self) {
      engine.removeTileMap(self._eid);
      return NONE;
    });
    $loc.tp$getattr = function(pyName, canSuspend) {
      var n = gn(pyName);
      var tm = engine.getTileMap(this._eid);
      if (tm) {
        if (n === "x") return pyFloat(tm.x);
        if (n === "y") return pyFloat(tm.y);
        if (n === "cols") return pyInt(tm.cols);
        if (n === "rows") return pyInt(tm.rows);
        if (n === "tile_size") return pyInt(tm.tileSize);
        if (n === "visible") return pyBool(tm.visible);
        if (n === "width") return pyInt(tm.cols * tm.tileSize);
        if (n === "height") return pyInt(tm.rows * tm.tileSize);
      }
      return Sk.generic.getAttr.call(this, pyName, canSuspend);
    };
    $loc.tp$setattr = function(pyName, value) {
      var n = gn(pyName);
      var tm = engine.getTileMap(this._eid);
      if (tm) {
        if (n === "x") { tm.x = jsv(value); return; }
        if (n === "y") { tm.y = jsv(value); return; }
        if (n === "visible") { tm.visible = !!jsv(value); return; }
      }
    };
  }, "TileMap", []);

  // ========== Collision Events ==========
  mod.on_overlap = new Sk.builtin.func(function(objA, objB, callback) {
    engine.onOverlap(eid(objA), eid(objB), function(aId, bId) {
      try { Sk.misceval.callsimArray(callback, [objA, objB]); }
      catch(e) { engine.onError(e.toString()); }
    });
    return NONE;
  });
  mod.on_clone = new Sk.builtin.func(function(obj, callback) {
    engine.onClone(eid(obj), function(sourceId, cloneId) {
      try { Sk.misceval.callsimArray(callback, [obj, wrapLike(obj, cloneId)]); }
      catch(e) { engine.onError(e.toString()); }
    });
    return NONE;
  });

  // ========== Color Detection ==========
  mod.color_at = new Sk.builtin.func(function(px, py) {
    return pyStr(engine.getColorAt(jsv(px), jsv(py)));
  });
  mod.touching_color = new Sk.builtin.func(function(obj, color) {
    return pyBool(engine.touchingColor(eid(obj), gn(color)));
  });

  // ========== Mobile / Touch / Tilt ==========
  mod.tilt_x = new Sk.builtin.func(function() { return pyFloat(engine.tiltX); });
  mod.tilt_y = new Sk.builtin.func(function() { return pyFloat(engine.tiltY); });
  mod.tilt_z = new Sk.builtin.func(function() { return pyFloat(engine.tiltZ); });

  mod.request_tilt = new Sk.builtin.func(function() {
    engine.requestTiltPermission();
    return NONE;
  });

  mod.show_controls = new Sk.builtin.func(function(layout) {
    engine.showMobileControls(optJs(layout, 'dpad_ab'));
    return NONE;
  });

  mod.hide_controls = new Sk.builtin.func(function() {
    engine.hideMobileControls();
    return NONE;
  });

  // ========== Game loop ==========
  mod.on_update = new Sk.builtin.func(function(callback) {
    engine.updateCallback = function() {
      try { Sk.misceval.callsimArray(callback, []); }
      catch(e) { engine.onError(e.toString()); engine.stop(); }
    };
    return NONE;
  });
  mod.start = new Sk.builtin.func(function() { engine.start(); return NONE; });
  mod.stop = new Sk.builtin.func(function() { engine.stop(); return NONE; });
  mod.restart = new Sk.builtin.func(function() {
    engine.stop();
    if (engine.onRestart) engine.onRestart();
    return NONE;
  });
  mod.remove_all = new Sk.builtin.func(function() {
    engine.objects.clear();
    return NONE;
  });

  // Aliases for convenience
  mod.update = mod.on_update;
  mod.run = mod.start;

  return mod;
};`;
  /* eslint-enable no-useless-escape */
}
