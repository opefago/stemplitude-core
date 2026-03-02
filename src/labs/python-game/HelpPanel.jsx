import { useState, useMemo, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import './HelpPanel.css';

const REF = [
  // ── Setup ──
  { cat: 'Setup', name: 'game.title', sig: 'title(text)', desc: 'Set the game window title.', example: 'game.title("My Game")' },
  { cat: 'Setup', name: 'game.background', sig: 'background(color)', desc: 'Set the background color.', example: 'game.background("#1a1a2e")\ngame.background("skyblue")' },
  { cat: 'Setup', name: 'game.show_grid', sig: 'show_grid(visible=True)', desc: 'Show or hide a coordinate grid overlay for easier positioning.', example: 'game.show_grid(True)' },
  { cat: 'Setup', name: 'game.set_background_image', sig: 'set_background_image(name)', desc: 'Use a sprite or background image as the canvas background.', example: 'game.set_background_image("starfield")' },
  { cat: 'Setup', name: 'game.WIDTH / game.HEIGHT', sig: 'WIDTH, HEIGHT', desc: 'Canvas size in pixels (read-only). Both are 600.', example: 'center_x = game.WIDTH / 2\ncenter_y = game.HEIGHT / 2' },

  // ── Objects ──
  { cat: 'Objects', name: 'game.Rect', sig: 'Rect(x, y, w, h, color, outline=False)', desc: 'Create a rectangle. Set outline=True for border only.', example: 'box = game.Rect(100, 100, 60, 40, "cyan")\nbox.color = "red"\nbox.x += 10' },
  { cat: 'Objects', name: 'game.Circle', sig: 'Circle(x, y, radius, color, outline=False)', desc: 'Create a circle centered at (x, y).', example: 'ball = game.Circle(300, 300, 20, "yellow")\nball.radius = 30' },
  { cat: 'Objects', name: 'game.Text', sig: 'Text(content, x, y, color="white", size=20)', desc: 'Create a text label. Change .content to update text. Supports bold, italic, fonts, outlines, shadows.', example: 'label = game.Text("Score: 0", 10, 10, "white", 24)\nlabel.content = "Score: " + str(score)\nlabel.bold = True\nlabel.font = "Impact"' },
  { cat: 'Objects', name: 'game.Line', sig: 'Line(x1, y1, x2, y2, color="white", width=2)', desc: 'Draw a line between two points.', example: 'game.Line(0, 300, 600, 300, "gray", 2)' },
  { cat: 'Objects', name: 'game.Sprite', sig: 'Sprite(name, x, y, scale=4)', desc: 'Create a sprite from the gallery or custom sprites. Use game.sprite_names() to see what\'s available.', example: 'hero = game.Sprite("knight", 100, 200)\nhero.flip_x = True' },
  { cat: 'Objects', name: 'game.Button', sig: 'Button(text, x, y, w=auto, h=auto, color="#FF6B35")', desc: 'A clickable button with hover and press states. Great for menus.', example: 'btn = game.Button("Play", 250, 300)\ndef start(b, x, y):\n    game.scene("level1")\nbtn.on_click(start)' },
  { cat: 'Objects', name: 'game.PixelSprite', sig: 'PixelSprite(x, y, rows, colors, scale=4)', desc: 'Create a sprite from pixel art strings and a color dictionary.', example: 'ship = game.PixelSprite(100, 100,\n    ["..1..", ".111.", "11111"],\n    {"1": "cyan"}, 6)' },

  // ── Common Methods ──
  { cat: 'Methods', name: '.move()', sig: 'obj.move(dx, dy)', desc: 'Move an object by (dx, dy) pixels relative to its current position.', example: 'player.move(5, 0)  # move right 5px' },
  { cat: 'Methods', name: '.move_to()', sig: 'obj.move_to(x, y)', desc: 'Move to an absolute position.', example: 'player.move_to(300, 300)' },
  { cat: 'Methods', name: '.touches()', sig: 'obj.touches(other) → bool', desc: 'True if this object overlaps with another (bounding box).', example: 'if player.touches(coin):\n    score += 1\n    coin.remove()' },
  { cat: 'Methods', name: '.remove()', sig: 'obj.remove()', desc: 'Permanently remove an object from the game.', example: 'enemy.remove()' },
  { cat: 'Methods', name: '.hide() / .show()', sig: 'obj.hide() / obj.show()', desc: 'Make invisible or visible. Hidden objects still exist.', example: 'power_up.hide()\n# later...\npower_up.show()' },
  { cat: 'Methods', name: '.clone()', sig: 'obj.clone() → new_obj', desc: 'Create a copy at the same position with same properties.', example: 'bullet = template.clone()\nbullet.x = player.x' },
  { cat: 'Methods', name: '.is_out()', sig: 'obj.is_out() → bool', desc: 'True if the entire object has left the canvas.', example: 'if bullet.is_out():\n    bullet.remove()' },
  { cat: 'Methods', name: '.contains()', sig: 'obj.contains(x, y) → bool', desc: 'True if point (x, y) is inside the object.', example: 'if target.contains(game.mouse_x(), game.mouse_y()):\n    target.color = "lime"' },

  // ── Common Properties ──
  { cat: 'Properties', name: '.x, .y', sig: 'obj.x  obj.y', desc: 'Position (read/write). Changing these moves the object.', example: 'player.x += 5\nplayer.y = game.HEIGHT / 2' },
  { cat: 'Properties', name: '.visible', sig: 'obj.visible = True/False', desc: 'Whether the object is drawn on screen.', example: 'ghost.visible = not ghost.visible  # toggle' },
  { cat: 'Properties', name: '.rotation', sig: 'obj.rotation = degrees', desc: 'Rotation angle in degrees (0-360).', example: 'spinner.rotation += 3  # spin 3° per frame' },
  { cat: 'Properties', name: '.opacity', sig: 'obj.opacity = 0.0-1.0', desc: '0 = invisible, 1 = fully solid.', example: 'ghost.opacity = 0.5  # half transparent' },
  { cat: 'Properties', name: '.layer', sig: 'obj.layer = int', desc: 'Drawing order. Higher = drawn on top.', example: 'background.layer = -1\nplayer.layer = 10' },
  { cat: 'Properties', name: '.color', sig: 'obj.color = str', desc: 'Fill color for Rect, Circle, or Text. Any CSS color.', example: 'box.color = "red"\nbox.color = "#FF6B35"' },
  { cat: 'Properties', name: '.width, .height', sig: 'obj.width  obj.height', desc: 'Size in pixels (read/write for Rect, read-only for Sprite).', example: 'wall.width = 200\nwall.height = 20' },

  // ── Keyboard Input ──
  { cat: 'Input', name: 'game.key_pressed', sig: 'key_pressed(key) → bool', desc: 'True every frame while a key is held down.', example: 'if game.key_pressed("left"):\n    player.x -= 5\nif game.key_pressed("right"):\n    player.x += 5' },
  { cat: 'Input', name: 'game.key_just_pressed', sig: 'key_just_pressed(key) → bool', desc: 'True only on the first frame of a key press. Great for jumping or shooting.', example: 'if game.key_just_pressed("space"):\n    shoot()' },
  { cat: 'Input', name: 'game.key_just_released', sig: 'key_just_released(key) → bool', desc: 'True only on the frame a key is let go.', example: 'if game.key_just_released("space"):\n    charging = False' },
  { cat: 'Input', name: 'game.on_key', sig: 'on_key(callback)', desc: 'Run a function whenever any key is pressed.', example: 'def handle_key(key):\n    if key == "space":\n        jump()\ngame.on_key(handle_key)' },
  { cat: 'Input', name: 'Key names', sig: '"up" "down" "left" "right" "space" "enter" "escape" "a"-"z" "0"-"9"', desc: 'Common key names you can use. Letters are lowercase.', example: 'game.key_pressed("a")      # A key\ngame.key_pressed("space")  # spacebar\ngame.key_pressed("up")     # up arrow' },

  // ── Mouse Input ──
  { cat: 'Input', name: 'game.mouse_x / mouse_y', sig: 'mouse_x() → int, mouse_y() → int', desc: 'Current mouse position on the canvas.', example: 'mx = game.mouse_x()\nmy = game.mouse_y()' },
  { cat: 'Input', name: 'game.mouse_down', sig: 'mouse_down() → bool', desc: 'True every frame while the mouse button is held.', example: 'if game.mouse_down():\n    draw_at(game.mouse_x(), game.mouse_y())' },
  { cat: 'Input', name: 'game.mouse_clicked', sig: 'mouse_clicked() → bool', desc: 'True only on the first frame the mouse is clicked.', example: 'if game.mouse_clicked():\n    game.emit(game.mouse_x(), game.mouse_y())' },
  { cat: 'Input', name: 'game.on_click', sig: 'on_click(callback)', desc: 'Run a function when the canvas is clicked.', example: 'def canvas_click(x, y):\n    game.Circle(x, y, 10, "gold")\ngame.on_click(canvas_click)' },
  { cat: 'Input', name: '.on_click() (object)', sig: 'obj.on_click(callback)', desc: 'Run a function when this specific object is clicked.', example: 'def hit(obj, x, y):\n    obj.color = "red"\ntarget.on_click(hit)' },

  // ── Collision Helpers ──
  { cat: 'Collision', name: '.keep_inside()', sig: 'obj.keep_inside(x=0, y=0, w=WIDTH, h=HEIGHT)', desc: 'Keep an object within the canvas (or custom area). Call every frame.', example: 'def update():\n    player.keep_inside()\ngame.on_update(update)' },
  { cat: 'Collision', name: '.push_out()', sig: 'obj.push_out(other) → bool', desc: 'Push object out of another (like hitting a wall). Stops velocity in that direction. Returns True if they were overlapping.', example: 'if player.touches(wall):\n    player.push_out(wall)' },
  { cat: 'Collision', name: '.bounce_off()', sig: 'obj.bounce_off(other) → bool', desc: 'Bounce off another object (reverses velocity on contact). Great for balls hitting paddles.', example: 'if ball.touches(paddle):\n    ball.bounce_off(paddle)' },

  // ── Groups ──
  { cat: 'Groups', name: 'game.Group()', sig: 'Group() → Group', desc: 'Create a group to manage multiple objects. Useful for enemies, coins, bullets.', example: 'enemies = game.Group()\nfor i in range(5):\n    e = game.Rect(i * 100, 50, 30, 30, "red")\n    enemies.add(e)' },
  { cat: 'Groups', name: '.add() / .remove()', sig: 'group.add(obj) / group.remove(obj)', desc: 'Add or remove objects from a group.', example: 'enemies.add(new_enemy)\nenemies.remove(dead_enemy)' },
  { cat: 'Groups', name: '.for_each()', sig: 'group.for_each(fn)', desc: 'Call a function on every object in the group.', example: 'def move_enemy(e):\n    e.x -= 2\n    if e.is_out():\n        e.remove()\nenemies.for_each(move_enemy)' },
  { cat: 'Groups', name: '.any_touch()', sig: 'group.any_touch(obj) → bool', desc: 'True if ANY object in the group touches the given object.', example: 'if enemies.any_touch(player):\n    game.shake(8, 300)\n    lives -= 1' },
  { cat: 'Groups', name: '.get_touching()', sig: 'group.get_touching(obj) → list', desc: 'Get a list of all objects in the group that touch the given object.', example: 'for coin in coins.get_touching(player):\n    score += 10\n    coin.remove()\n    coins.remove(coin)' },
  { cat: 'Groups', name: '.remove_all()', sig: 'group.remove_all()', desc: 'Remove all objects in the group from the game.', example: 'enemies.remove_all()  # clear the level' },

  // ── Scenes ──
  { cat: 'Scenes', name: 'game.on_scene', sig: 'on_scene(name, setup_fn)', desc: 'Register a setup function for a scene. When switched to, all objects are cleared and setup runs.', example: 'def build_menu():\n    game.background("black")\n    game.Button("Play", 250, 300).on_click(\n        lambda b, x, y: game.scene("level1"))\n\ngame.on_scene("menu", build_menu)' },
  { cat: 'Scenes', name: 'game.scene', sig: 'scene(name)', desc: 'Switch to a named scene. Clears everything and runs the scene\'s setup function.', example: 'game.scene("menu")     # go to menu\ngame.scene("level2")   # go to level 2' },
  { cat: 'Scenes', name: 'game.get_scene', sig: 'get_scene() → str', desc: 'Get the name of the currently active scene.', example: 'if game.get_scene() == "level1":\n    score_text.content = "Level 1"' },

  // ── Physics ──
  { cat: 'Physics', name: '.vx, .vy', sig: 'obj.vx  obj.vy', desc: 'Velocity — pixels the object moves per frame. Set these to make things move automatically.', example: 'ball.vx = 3    # move right\nball.vy = -5   # move up' },
  { cat: 'Physics', name: '.ax, .ay (gravity)', sig: 'obj.ax  obj.ay', desc: 'Acceleration — added to velocity each frame. Set .ay to add gravity.', example: 'ball.ay = 0.5  # gravity pulls down' },
  { cat: 'Physics', name: '.bounce', sig: 'obj.bounce = 0.0-1.0', desc: 'Bounce off canvas edges. 1.0 = perfect bounce, 0.8 = lose some energy.', example: 'ball.bounce = 0.9  # bouncy ball' },
  { cat: 'Physics', name: '.friction', sig: 'obj.friction = 0.0-1.0', desc: 'Velocity multiplier each frame. 1.0 = no friction, 0.95 = some drag.', example: 'puck.friction = 0.98  # ice-like' },

  // ── Tweening ──
  { cat: 'Tweening', name: 'game.tween', sig: 'tween(obj, prop, target, ms, easing="linear", callback=None)', desc: 'Smoothly animate a property over time. Easings: linear, ease_in, ease_out, ease_in_out, bounce, elastic, back.', example: 'game.tween(box, "x", 400, 1000, "bounce")\ngame.tween(box, "opacity", 0, 500, "ease_out", on_done)' },

  // ── Particles ──
  { cat: 'Particles', name: 'game.emit', sig: 'emit(x, y, **opts)', desc: 'Burst of particles. Options: shape, color/colors, count, speed, size, life, gravity, drag, fade, shrink, spin.', example: 'game.emit(x, y, color="gold", count=20, shape="star")' },
  { cat: 'Particles', name: 'game.preset', sig: 'preset(name, x, y, **overrides)', desc: 'Use a built-in effect. Names: explosion, sparkle, smoke, fire, confetti, snow, hearts, bubbles, trail, magic.', example: 'game.preset("explosion", x, y)\ngame.preset("sparkle", x, y, count=50)' },
  { cat: 'Particles', name: 'game.Emitter', sig: 'Emitter(x, y, **opts) → id', desc: 'Continuous particle source. Use emitter_on/off to toggle.', example: 'eid = game.Emitter(300, 500, shape="circle", color="orange", rate=3, gravity=-0.2)' },

  // ── Sound ──
  { cat: 'Sound', name: 'game.sound', sig: 'sound(freq, duration=200, type="square")', desc: 'Play a simple tone. Types: sine, square, sawtooth, triangle.', example: 'game.sound(440, 200)        # A note\ngame.sound(880, 100, "sine") # high beep' },
  { cat: 'Sound', name: 'game.note', sig: 'note(name, duration=300, vol=0.3, type="square")', desc: 'Play a musical note by name (C3-B5).', example: 'game.note("C4")    # middle C\ngame.note("A4", 500, 0.5, "sine")' },
  { cat: 'Sound', name: 'game.play_sound', sig: 'play_sound(name, vol=0.6)', desc: 'Play a custom sound from your project.', example: 'game.play_sound("explosion")\ngame.play_sound("jump", 0.8)' },

  // ── Timers ──
  { cat: 'Timers', name: 'game.after', sig: 'after(ms, callback) → id', desc: 'Run a function once after a delay (milliseconds).', example: 'def spawn():\n    game.Circle(game.random_int(0, 600), 0, 10, "red")\ngame.after(2000, spawn)  # spawn in 2 seconds' },
  { cat: 'Timers', name: 'game.every', sig: 'every(ms, callback) → id', desc: 'Run a function repeatedly at an interval.', example: 'def spawn_enemy():\n    e = game.Rect(600, game.random_int(50, 550), 30, 30, "red")\n    e.vx = -3\n    enemies.add(e)\ntimer = game.every(1500, spawn_enemy)' },
  { cat: 'Timers', name: 'game.cancel_timer', sig: 'cancel_timer(id)', desc: 'Stop a timer created by after() or every().', example: 'game.cancel_timer(timer)' },
  { cat: 'Timers', name: 'game.wait', sig: 'wait(ms)', desc: 'Pause code for ms milliseconds. Only works in top-level code, NOT in on_update.', example: 'game.Text("Ready...", 200, 300, "white", 40)\ngame.wait(1000)\ngame.Text("GO!", 250, 300, "lime", 60)' },

  // ── Camera & Effects ──
  { cat: 'Effects', name: 'game.shake', sig: 'shake(intensity=5, duration=300)', desc: 'Shake the screen. Great for explosions and hits.', example: 'game.shake(8, 400)  # strong shake' },
  { cat: 'Effects', name: 'game.flash', sig: 'flash(color="white", duration=200)', desc: 'Flash the screen with a color overlay.', example: 'game.flash("red", 300)  # damage flash' },
  { cat: 'Effects', name: 'game.transition', sig: 'transition(type, duration, color, on_mid, on_done)', desc: 'Scene transition effect. Types: fade, wipe_left, wipe_right, wipe_down, circle.', example: 'game.transition("fade", 500, "black",\n    lambda: game.scene("level2"))' },
  { cat: 'Effects', name: 'game.camera_follow', sig: 'camera_follow(obj, smooth=0.1)', desc: 'Smoothly scroll the camera to center on an object. Call each frame.', example: 'def update():\n    game.camera_follow(player)\ngame.on_update(update)' },

  // ── Storage ──
  { cat: 'Storage', name: 'game.save', sig: 'save(key, value)', desc: 'Save a value that persists after the page reloads.', example: 'game.save("highscore", 42)\ngame.save("player_name", "Alex")' },
  { cat: 'Storage', name: 'game.load', sig: 'load(key, default=None) → value', desc: 'Load a previously saved value.', example: 'best = game.load("highscore", 0)\nif score > best:\n    game.save("highscore", score)' },

  // ── Helpers ──
  { cat: 'Helpers', name: 'game.random_int', sig: 'random_int(min, max) → int', desc: 'Random whole number between min and max (inclusive).', example: 'x = game.random_int(0, 600)\ny = game.random_int(0, 600)' },
  { cat: 'Helpers', name: 'game.random_color', sig: 'random_color() → str', desc: 'Generate a random hex color.', example: 'game.Rect(100, 100, 50, 50, game.random_color())' },
  { cat: 'Helpers', name: 'game.choice', sig: 'choice(list) → item', desc: 'Pick a random item from a list.', example: 'color = game.choice(["red", "blue", "green", "gold"])' },
  { cat: 'Helpers', name: 'game.distance', sig: 'distance(obj_a, obj_b) → float', desc: 'Distance in pixels between two objects.', example: 'if game.distance(player, enemy) < 50:\n    game.flash("red")' },

  // ── Game Loop ──
  { cat: 'Game Loop', name: 'game.on_update', sig: 'on_update(callback)', desc: 'Set the function called 60 times per second. This is where your game logic goes.', example: 'def update():\n    if game.key_pressed("right"):\n        player.x += 5\n    player.keep_inside()\ngame.on_update(update)' },
  { cat: 'Game Loop', name: 'game.start', sig: 'start()', desc: 'Start the game loop. Put this at the end of your code.', example: 'game.on_update(update)\ngame.start()' },
  { cat: 'Game Loop', name: 'game.stop', sig: 'stop()', desc: 'Stop the game loop.', example: 'if lives <= 0:\n    game.stop()' },
];

const CATEGORIES = ['All', ...Array.from(new Set(REF.map(r => r.cat)))];

export default function HelpPanel({ onClose }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('All');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    let items = REF;
    if (cat !== 'All') items = items.filter(r => r.cat === cat);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.sig.toLowerCase().includes(q) ||
        r.desc.toLowerCase().includes(q)
      );
    }
    return items;
  }, [search, cat]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const item of filtered) {
      if (!groups[item.cat]) groups[item.cat] = [];
      groups[item.cat].push(item);
    }
    return groups;
  }, [filtered]);

  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-modal" onClick={e => e.stopPropagation()}>
        <div className="help-header">
          <span>Reference</span>
          <Search size={14} style={{ color: '#484f58' }} />
          <input
            className="help-search"
            type="text"
            placeholder="Search functions, properties, methods..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <button className="help-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="help-cats">
          {CATEGORIES.map(c => (
            <button
              key={c}
              className={`help-cat ${cat === c ? 'active' : ''}`}
              onClick={() => { setCat(c); setSelected(null); }}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="help-body">
          {filtered.length === 0 ? (
            <div className="help-empty">No results found for "{search}"</div>
          ) : (
            Object.entries(grouped).map(([section, items]) => (
              <div key={section}>
                <div className="help-section-title">{section}</div>
                {items.map((item, i) => (
                  <div
                    key={i}
                    className="help-item"
                    onClick={() => setSelected(selected === item ? null : item)}
                  >
                    <div className="help-item-sig">
                      <span className="fn">{item.name}</span>
                    </div>
                    <div className="help-item-desc">{item.desc}</div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {selected && (
          <div className="help-detail">
            <div className="help-detail-title">{selected.sig}</div>
            <div className="help-detail-desc">{selected.desc}</div>
            {selected.example && (
              <pre className="help-detail-code">{selected.example}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
