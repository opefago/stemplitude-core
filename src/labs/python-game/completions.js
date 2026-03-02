/**
 * CodeMirror 6 autocompletion source + signature help for the Py Game Maker.
 * Provides context-aware completions for every function, class,
 * method, property, and constant exposed by the `game` module.
 *
 * Completions use snippet syntax so Tab moves through parameters.
 * Signature help shows parameter tooltips inside function calls.
 */
import { snippetCompletion } from '@codemirror/autocomplete';
import { StateField } from '@codemirror/state';
import { showTooltip, EditorView } from '@codemirror/view';

// ───────────────── game.* Module-Level API ─────────────────

const MODULE_COMPLETIONS = [
  // ── Setup ──
  snippetCompletion('title(${text})', { label: 'title', type: 'function', detail: '(text)', info: 'Set the game window title' }),
  snippetCompletion('background(${color})', { label: 'background', type: 'function', detail: '(color)', info: 'Set background color, e.g. "#1a1a2e" or "skyblue"' }),
  snippetCompletion('show_grid(${visible})', { label: 'show_grid', type: 'function', detail: '(visible=True)', info: 'Show/hide a coordinate grid overlay' }),

  // ── Object Classes ──
  snippetCompletion('Rect(${1:x}, ${2:y}, ${3:w}, ${4:h}, ${5:color})', { label: 'Rect', type: 'class', detail: '(x, y, w, h, color, outline=False)', info: 'Create a rectangle. outline=True draws border only.' }),
  snippetCompletion('Circle(${1:x}, ${2:y}, ${3:radius}, ${4:color})', { label: 'Circle', type: 'class', detail: '(x, y, radius, color, outline=False)', info: 'Create a circle centered at (x,y). outline=True draws border only.' }),
  snippetCompletion('Text(${1:text}, ${2:x}, ${3:y}, ${4:color}, ${5:size})', { label: 'Text', type: 'class', detail: '(text, x, y, color="white", size=20)', info: 'Create a text label. Access .content to change text.' }),
  snippetCompletion('Line(${1:x1}, ${2:y1}, ${3:x2}, ${4:y2}, ${5:color})', { label: 'Line', type: 'class', detail: '(x1, y1, x2, y2, color="white", width=2)', info: 'Draw a line from (x1,y1) to (x2,y2).' }),
  snippetCompletion('Sprite(${1:name}, ${2:x}, ${3:y}, ${4:scale})', { label: 'Sprite', type: 'class', detail: '(name, x, y, scale=4)', info: 'Create a sprite by name from the gallery or custom sprites. Use game.sprite_names() to list available names.' }),
  snippetCompletion('Button(${1:text}, ${2:x}, ${3:y}, ${4:width}, ${5:height}, ${6:color})', { label: 'Button', type: 'class', detail: '(text, x, y, width=auto, height=auto, color="#FF6B35")', info: 'Create a clickable button with hover/press states. Auto-sizes to text if width/height omitted.' }),
  snippetCompletion('PixelSprite(${1:x}, ${2:y}, ${3:rows}, ${4:colors}, ${5:scale})', { label: 'PixelSprite', type: 'class', detail: '(x, y, rows, colors, scale=4)', info: 'Create a sprite from pixel art strings and a color dictionary.' }),

  // ── Keyboard Input ──
  snippetCompletion('key_pressed(${key})', { label: 'key_pressed', type: 'function', detail: '(key) → bool', info: 'True every frame the key is held down.\nKeys: "up", "down", "left", "right", "space", "a"-"z", "0"-"9", "enter", "shift", "escape"' }),
  snippetCompletion('key_just_pressed(${key})', { label: 'key_just_pressed', type: 'function', detail: '(key) → bool', info: 'True only on the single frame a key first goes down. Useful for toggling or single-shot actions.' }),
  snippetCompletion('key_just_released(${key})', { label: 'key_just_released', type: 'function', detail: '(key) → bool', info: 'True only on the single frame a key is released.' }),
  snippetCompletion('on_key(${callback})', { label: 'on_key', type: 'function', detail: '(callback)', info: 'Register event handler: callback(key) fires once per key press.\ndef on_key(key):\n    print(key)' }),
  snippetCompletion('on_key_up(${callback})', { label: 'on_key_up', type: 'function', detail: '(callback)', info: 'Register event handler: callback(key) fires once per key release.' }),

  // ── Mouse Input ──
  snippetCompletion('mouse_x()', { label: 'mouse_x', type: 'function', detail: '() → int', info: 'Current mouse X position on the game canvas.' }),
  snippetCompletion('mouse_y()', { label: 'mouse_y', type: 'function', detail: '() → int', info: 'Current mouse Y position on the game canvas.' }),
  snippetCompletion('mouse_down()', { label: 'mouse_down', type: 'function', detail: '() → bool', info: 'True every frame while the mouse button is held down.' }),
  snippetCompletion('mouse_clicked()', { label: 'mouse_clicked', type: 'function', detail: '() → bool', info: 'True only on the single frame the mouse button is first pressed.' }),
  snippetCompletion('mouse_released()', { label: 'mouse_released', type: 'function', detail: '() → bool', info: 'True only on the single frame the mouse button is released.' }),
  snippetCompletion('on_click(${callback})', { label: 'on_click', type: 'function', detail: '(callback)', info: 'Register event handler: callback(x, y) fires once per mouse click on the canvas.' }),
  snippetCompletion('hit_test(${1:x}, ${2:y})', { label: 'hit_test', type: 'function', detail: '(x, y) → id or None', info: 'Returns the ID of the topmost visible object at (x, y), or None if nothing is there.' }),

  // ── Timers ──
  snippetCompletion('wait(${ms})', { label: 'wait', type: 'function', detail: '(ms)', info: 'Pause Python execution for ms milliseconds.\nOnly works in top-level code, NOT inside on_update.' }),
  snippetCompletion('after(${1:ms}, ${2:callback})', { label: 'after', type: 'function', detail: '(ms, callback) → timer_id', info: 'Run callback once after ms milliseconds.\nReturns a timer ID you can cancel with cancel_timer().' }),
  snippetCompletion('every(${1:ms}, ${2:callback})', { label: 'every', type: 'function', detail: '(ms, callback) → timer_id', info: 'Run callback repeatedly every ms milliseconds.\nReturns a timer ID you can cancel with cancel_timer().' }),
  snippetCompletion('cancel_timer(${timer_id})', { label: 'cancel_timer', type: 'function', detail: '(timer_id)', info: 'Cancel a timer created by after() or every().' }),

  // ── Sound ──
  snippetCompletion('sound(${1:freq}, ${2:dur}, ${3:type})', { label: 'sound', type: 'function', detail: '(freq=440, dur=200, type="square")', info: 'Play a simple tone.\nTypes: "sine", "square", "sawtooth", "triangle"' }),
  snippetCompletion('tone(${1:freq}, ${2:dur}, ${3:vol}, ${4:type})', { label: 'tone', type: 'function', detail: '(freq=440, dur=200, vol=0.15, type="square")', info: 'Play a tone with volume control (0.0 – 1.0).\nTypes: "sine", "square", "sawtooth", "triangle"' }),
  snippetCompletion('note(${1:name}, ${2:dur}, ${3:vol}, ${4:type})', { label: 'note', type: 'function', detail: '(name, dur=300, vol=0.15, type="square")', info: 'Play a musical note by name.\nExamples: "C4", "A#3", "G5"\nRange: C3 – B5' }),
  snippetCompletion('play_sound(${1:name}, ${2:vol})', { label: 'play_sound', type: 'function', detail: '(name, vol=1.0)', info: 'Play an uploaded or recorded sound by its name.\nUse game.sound_names() to list available sounds.' }),
  snippetCompletion('sound_names()', { label: 'sound_names', type: 'function', detail: '() → list', info: 'Returns a list of all custom sound names (uploaded/recorded).' }),
  snippetCompletion('stop_sounds()', { label: 'stop_sounds', type: 'function', detail: '()', info: 'Stop all currently playing sounds.' }),

  // ── Utility ──
  snippetCompletion('random_int(${1:min}, ${2:max})', { label: 'random_int', type: 'function', detail: '(min, max) → int', info: 'Random integer between min and max (inclusive).' }),
  snippetCompletion('distance(${1:obj_a}, ${2:obj_b})', { label: 'distance', type: 'function', detail: '(obj_a, obj_b) → float', info: 'Distance in pixels between two game objects.' }),
  snippetCompletion('frame_count()', { label: 'frame_count', type: 'function', detail: '() → int', info: 'Number of frames since the game loop started (~60 per second).' }),
  snippetCompletion('sprite_names()', { label: 'sprite_names', type: 'function', detail: '() → list', info: 'List of all available sprite names (built-in + custom).' }),

  // ── Background Image ──
  snippetCompletion('set_background_image(${name})', { label: 'set_background_image', type: 'function', detail: '(name)', info: 'Set a background or sprite as the full-canvas background.\nUse any name from background_names() or sprite_names().' }),
  snippetCompletion('clear_background_image()', { label: 'clear_background_image', type: 'function', detail: '()', info: 'Remove the background image (reverts to background color).' }),

  // ── Asset Management ──
  snippetCompletion('asset_names(${type})', { label: 'asset_names', type: 'function', detail: '(type=None) → list', info: 'List all asset names. Optional type: "sprite", "background", "sound".\nIncludes only user-added assets (painted, uploaded, gallery picks).' }),
  snippetCompletion('background_names()', { label: 'background_names', type: 'function', detail: '() → list', info: 'List all background image names from the Backgrounds tab.' }),
  snippetCompletion('has_asset(${name})', { label: 'has_asset', type: 'function', detail: '(name) → bool', info: 'Check if a user asset with this name exists.' }),
  snippetCompletion('asset_info(${name})', { label: 'asset_info', type: 'function', detail: '(name) → dict or None', info: 'Get info about an asset: {"name", "type", "source", "width", "height"}.\nReturns None if the asset does not exist.' }),

  // ── Game Loop ──
  snippetCompletion('on_update(${callback})', { label: 'on_update', type: 'function', detail: '(callback)', info: 'Set the function called every frame (~60fps).\ndef update():\n    pass\ngame.on_update(update)' }),
  snippetCompletion('start()', { label: 'start', type: 'function', detail: '()', info: 'Start the game loop. Call after defining on_update.' }),
  snippetCompletion('stop()', { label: 'stop', type: 'function', detail: '()', info: 'Stop the game loop.' }),

  // ── Physics toggle ──
  snippetCompletion('physics_enabled(${val})', { label: 'physics_enabled', type: 'function', detail: '(val=None) → bool', info: 'Enable/disable physics. Pass True/False or call with no args to check.' }),

  // ── Tweening ──
  snippetCompletion('tween(${1:obj}, ${2:prop}, ${3:target}, ${4:duration}, ${5:easing})', { label: 'tween', type: 'function', detail: '(obj, prop, target, ms, easing="linear", callback=None) → id', info: 'Smoothly animate a property over time.\nEasings: "linear", "ease_in", "ease_out", "ease_in_out", "bounce", "elastic", "back"' }),
  snippetCompletion('cancel_tween(${id})', { label: 'cancel_tween', type: 'function', detail: '(tween_id)', info: 'Cancel a running tween by ID.' }),
  snippetCompletion('cancel_tweens(${obj})', { label: 'cancel_tweens', type: 'function', detail: '(obj)', info: 'Cancel all tweens on an object.' }),

  // ── Particles ──
  snippetCompletion('emit(${1:x}, ${2:y})', { label: 'emit', type: 'function', detail: '(x, y, **opts)', info: 'Emit a burst of particles at (x, y).\nOptions: shape="circle"|"square"|"star"|"spark"|"ring"|"heart"|"diamond"|"triangle"|"sprite"\n  color/colors, count=20, speed=4, speed_spread=0.5\n  size=6, size_spread=0.5, life=40, life_spread=0.3\n  gravity=0, drag=0.98, fade=True, shrink=True\n  grow=0, spin=0, outline=False, sprite=name, blend=mode' }),
  snippetCompletion('preset(${1:name}, ${2:x}, ${3:y})', { label: 'preset', type: 'function', detail: '(name, x, y, **overrides)', info: 'Emit particles using a named preset.\nPresets: "explosion", "sparkle", "smoke", "fire", "confetti",\n  "snow", "hearts", "bubbles", "trail", "magic"\nPass extra kwargs to override preset defaults.' }),
  snippetCompletion('Emitter(${1:x}, ${2:y})', { label: 'Emitter', type: 'function', detail: '(x, y, **opts) → int', info: 'Create a continuous particle emitter at (x,y).\nReturns emitter ID. Extra kwargs: rate=2 (particles/frame),\nfollow=obj_id, plus all emit() options.\nUse emitter_on/off(id) to toggle.' }),
  snippetCompletion('emitter_on(${id})', { label: 'emitter_on', type: 'function', detail: '(emitter_id)', info: 'Activate an emitter.' }),
  snippetCompletion('emitter_off(${id})', { label: 'emitter_off', type: 'function', detail: '(emitter_id)', info: 'Deactivate an emitter (stops spawning).' }),
  snippetCompletion('move_emitter(${1:id}, ${2:x}, ${3:y})', { label: 'move_emitter', type: 'function', detail: '(emitter_id, x, y)', info: 'Move an emitter to a new position.' }),
  snippetCompletion('remove_emitter(${id})', { label: 'remove_emitter', type: 'function', detail: '(emitter_id)', info: 'Remove an emitter permanently.' }),

  // ── Camera ──
  snippetCompletion('camera_x(${val})', { label: 'camera_x', type: 'function', detail: '(val=None) → float', info: 'Get/set camera X offset for scrolling.' }),
  snippetCompletion('camera_y(${val})', { label: 'camera_y', type: 'function', detail: '(val=None) → float', info: 'Get/set camera Y offset for scrolling.' }),
  snippetCompletion('camera_follow(${1:obj}, ${2:smooth})', { label: 'camera_follow', type: 'function', detail: '(obj, smooth=0.1)', info: 'Smoothly move camera to center on an object. Call each frame.' }),

  // ── Screen Effects ──
  snippetCompletion('shake(${1:intensity}, ${2:duration})', { label: 'shake', type: 'function', detail: '(intensity=5, duration=300)', info: 'Shake the screen. Great for hits and explosions.' }),
  snippetCompletion('flash(${1:color}, ${2:duration})', { label: 'flash', type: 'function', detail: '(color="white", duration=200)', info: 'Flash the screen with a color overlay.' }),
  snippetCompletion('transition(${1:type}, ${2:duration}, ${3:color})', { label: 'transition', type: 'function', detail: '(type="fade", dur=500, color="black", on_mid=None, on_done=None)', info: 'Scene transition effect.\nTypes: "fade", "wipe_left", "wipe_right", "wipe_down", "circle"\non_mid fires at the halfway point.' }),

  // ── Storage ──
  snippetCompletion('save(${1:key}, ${2:value})', { label: 'save', type: 'function', detail: '(key, value)', info: 'Save a value to persistent storage (survives page reload).' }),
  snippetCompletion('load(${1:key}, ${2:default})', { label: 'load', type: 'function', detail: '(key, default=None) → value', info: 'Load a value from persistent storage.' }),
  snippetCompletion('delete_save(${key})', { label: 'delete_save', type: 'function', detail: '(key)', info: 'Delete a saved value.' }),

  // ── Extra Helpers ──
  snippetCompletion('random_float(${1:min}, ${2:max})', { label: 'random_float', type: 'function', detail: '(min, max) → float', info: 'Random float between min and max.' }),
  snippetCompletion('random_color()', { label: 'random_color', type: 'function', detail: '() → str', info: 'Random hex color like "#a3f29c".' }),
  snippetCompletion('choice(${list})', { label: 'choice', type: 'function', detail: '(list) → item', info: 'Pick a random item from a list.' }),
  snippetCompletion('lerp(${1:a}, ${2:b}, ${3:t})', { label: 'lerp', type: 'function', detail: '(a, b, t) → float', info: 'Linear interpolation: a + (b - a) * t.' }),
  snippetCompletion('clamp(${1:val}, ${2:min}, ${3:max})', { label: 'clamp', type: 'function', detail: '(val, min, max) → float', info: 'Clamp value between min and max.' }),

  // ── Scenes ──
  snippetCompletion('on_scene(${1:name}, ${2:setup_fn})', { label: 'on_scene', type: 'function', detail: '(name, setup_fn)', info: 'Register a scene setup function.\nWhen game.scene(name) is called, all objects are cleared\nand setup_fn() runs to build the new scene.' }),
  snippetCompletion('scene(${name})', { label: 'scene', type: 'function', detail: '(name)', info: 'Switch to a named scene. Clears all objects, timers,\ntweens, and particles, then calls the setup function\nregistered with on_scene().' }),
  snippetCompletion('get_scene()', { label: 'get_scene', type: 'function', detail: '() → str', info: 'Get the name of the current scene.' }),

  // ── Collision Helpers ──
  snippetCompletion('keep_inside(${obj})', { label: 'keep_inside', type: 'function', detail: '(obj, x=0, y=0, w=WIDTH, h=HEIGHT)', info: 'Keep an object within bounds. Defaults to the full canvas.\nCall each frame to prevent the object from leaving the area.' }),
  snippetCompletion('push_out(${1:obj}, ${2:other})', { label: 'push_out', type: 'function', detail: '(obj, other) → bool', info: 'Push obj out of other (solid collision).\nStops velocity in the push direction.\nReturns True if objects were overlapping.' }),
  snippetCompletion('bounce_off(${1:obj}, ${2:other})', { label: 'bounce_off', type: 'function', detail: '(obj, other) → bool', info: 'Bounce obj off other (reverses velocity).\nReturns True if objects were overlapping.' }),

  // ── Groups ──
  snippetCompletion('Group()', { label: 'Group', type: 'class', detail: '() → Group', info: 'Create a group to manage multiple objects together.\nUseful for enemies, coins, bullets, etc.\n\nenemies = game.Group()\nenemies.add(game.Rect(...))\nenemies.for_each(move_enemy)' }),

  // ── Aliases ──
  snippetCompletion('update(${callback})', { label: 'update', type: 'function', detail: '(callback)', info: 'Alias for on_update(). Set the function called every frame.' }),
  snippetCompletion('run()', { label: 'run', type: 'function', detail: '()', info: 'Alias for start(). Start the game loop.' }),

  // ── Constants ──
  { label: 'WIDTH', type: 'constant', detail: '  = 600', info: 'Canvas width in pixels (read-only).' },
  { label: 'HEIGHT', type: 'constant', detail: '  = 600', info: 'Canvas height in pixels (read-only).' },
];

// ───────────────── Object Methods & Properties ─────────────────

const SHARED_METHODS = [
  snippetCompletion('move(${1:dx}, ${2:dy})', { label: 'move', type: 'method', detail: '(dx, dy)', info: 'Move by (dx, dy) pixels relative to current position.' }),
  snippetCompletion('move_to(${1:x}, ${2:y})', { label: 'move_to', type: 'method', detail: '(x, y)', info: 'Move to an absolute position (x, y).' }),
  snippetCompletion('touches(${other})', { label: 'touches', type: 'method', detail: '(other) → bool', info: 'True if this object\'s bounding box overlaps with another.' }),
  snippetCompletion('remove()', { label: 'remove', type: 'method', detail: '()', info: 'Remove this object from the game permanently.' }),
  snippetCompletion('hide()', { label: 'hide', type: 'method', detail: '()', info: 'Make this object invisible (still exists, just hidden).' }),
  snippetCompletion('show()', { label: 'show', type: 'method', detail: '()', info: 'Make this object visible again.' }),
  snippetCompletion('is_out()', { label: 'is_out', type: 'method', detail: '() → bool', info: 'True if the entire object is off-screen.' }),
  snippetCompletion('contains(${1:x}, ${2:y})', { label: 'contains', type: 'method', detail: '(x, y) → bool', info: 'True if point (x, y) is inside this object.' }),
  snippetCompletion('on_click(${callback})', { label: 'on_click', type: 'method', detail: '(callback)', info: 'Register click handler: callback(self, x, y).\ndef clicked(obj, x, y):\n    obj.color = "lime"\nmy_obj.on_click(clicked)' }),
  snippetCompletion('on_hover(${1:enter_cb}, ${2:exit_cb})', { label: 'on_hover', type: 'method', detail: '(enter_cb, exit_cb)', info: 'Register hover handlers:\n  enter_cb(self, x, y) — mouse enters\n  exit_cb(self) — mouse leaves' }),
  snippetCompletion('clone()', { label: 'clone', type: 'method', detail: '() → new_obj', info: 'Create a copy of this object at the same position.' }),
  snippetCompletion('keep_inside()', { label: 'keep_inside', type: 'method', detail: '(x=0, y=0, w=WIDTH, h=HEIGHT)', info: 'Keep this object within canvas bounds (or custom area).\nCall each frame in on_update.' }),
  snippetCompletion('push_out(${other})', { label: 'push_out', type: 'method', detail: '(other) → bool', info: 'Push this object out of another (solid wall collision).\nStops velocity in the push direction.' }),
  snippetCompletion('bounce_off(${other})', { label: 'bounce_off', type: 'method', detail: '(other) → bool', info: 'Bounce this object off another (reverses velocity on contact).' }),
  snippetCompletion('say(${1:"Hello!"}, ${2:3000})', { label: 'say', type: 'method', detail: '(text, duration=3000, scroll_speed=40)', info: 'Show a speech bubble above this object.\n  text — what to say\n  duration — ms to display (0 = forever)\n  scroll_speed — px/s for long text overflow' }),
  snippetCompletion('think(${1:"Hmm..."}, ${2:3000})', { label: 'think', type: 'method', detail: '(text, duration=3000, scroll_speed=40)', info: 'Show a thought bubble above this object.\n  text — what to think\n  duration — ms to display (0 = forever)\n  scroll_speed — px/s for long text overflow' }),
  snippetCompletion('stop_talking()', { label: 'stop_talking', type: 'method', detail: '()', info: 'Remove any active talk/think bubble from this object.' }),
];

const SHARED_PROPS = [
  { label: 'x', type: 'property', detail: '  float', info: 'X position (read/write).' },
  { label: 'y', type: 'property', detail: '  float', info: 'Y position (read/write).' },
  { label: 'visible', type: 'property', detail: '  bool', info: 'Whether the object is drawn (True/False).' },
  { label: 'rotation', type: 'property', detail: '  float', info: 'Rotation angle in degrees (0–360).' },
  { label: 'opacity', type: 'property', detail: '  float', info: 'Opacity from 0.0 (invisible) to 1.0 (solid).' },
  { label: 'layer', type: 'property', detail: '  int', info: 'Drawing order — higher values draw on top.' },
  { label: 'vx', type: 'property', detail: '  float', info: 'Velocity X — pixels per frame. Set by physics or manually.' },
  { label: 'vy', type: 'property', detail: '  float', info: 'Velocity Y — pixels per frame. Set ay for gravity.' },
  { label: 'ax', type: 'property', detail: '  float', info: 'Acceleration X — added to vx each frame.' },
  { label: 'ay', type: 'property', detail: '  float', info: 'Acceleration Y — set to ~0.5 for gravity.' },
  { label: 'friction', type: 'property', detail: '  float', info: 'Velocity multiplier each frame. 1.0=none, 0.95=some drag, 0=instant stop.' },
  { label: 'bounce', type: 'property', detail: '  float', info: 'Bounce off edges. 0=none, 1.0=perfect bounce, 0.8=lose energy.' },
];

const RECT_PROPS = [
  { label: 'width', type: 'property', detail: '  float', info: 'Width in pixels (read/write).' },
  { label: 'height', type: 'property', detail: '  float', info: 'Height in pixels (read/write).' },
  { label: 'color', type: 'property', detail: '  str', info: 'Fill or stroke color, e.g. "red", "#FF6B35".' },
  { label: 'outline', type: 'property', detail: '  bool', info: 'True = draw border only; False = fill.' },
];

const CIRCLE_PROPS = [
  { label: 'radius', type: 'property', detail: '  float', info: 'Circle radius in pixels (read/write).' },
  { label: 'width', type: 'property', detail: '  float', info: 'Diameter (= radius * 2, read-only).' },
  { label: 'height', type: 'property', detail: '  float', info: 'Diameter (= radius * 2, read-only).' },
  { label: 'color', type: 'property', detail: '  str', info: 'Fill or stroke color, e.g. "red", "#FF6B35".' },
  { label: 'outline', type: 'property', detail: '  bool', info: 'True = draw border only; False = fill.' },
];

const TEXT_PROPS = [
  { label: 'content', type: 'property', detail: '  str', info: 'The displayed text string (read/write).' },
  { label: 'color', type: 'property', detail: '  str', info: 'Text color, e.g. "white", "#0066FF".' },
  { label: 'size', type: 'property', detail: '  int', info: 'Font size in pixels.' },
  { label: 'font', type: 'property', detail: '  str', info: 'Font family: "monospace", "Arial", "Impact", "Georgia", "Comic Sans MS", etc.' },
  { label: 'bold', type: 'property', detail: '  bool', info: 'Bold text (True/False).' },
  { label: 'italic', type: 'property', detail: '  bool', info: 'Italic text (True/False).' },
  { label: 'underline', type: 'property', detail: '  bool', info: 'Underline decoration (True/False).' },
  { label: 'strikethrough', type: 'property', detail: '  bool', info: 'Strikethrough decoration (True/False).' },
  { label: 'align', type: 'property', detail: '  str', info: 'Text alignment: "left", "center", or "right".' },
  { label: 'outline_color', type: 'property', detail: '  str', info: 'Stroke/outline color, e.g. "black". Empty string = no outline.' },
  { label: 'outline_width', type: 'property', detail: '  float', info: 'Outline thickness in pixels (default 2).' },
  { label: 'shadow_color', type: 'property', detail: '  str', info: 'Shadow color, e.g. "black", "rgba(0,0,0,0.5)". Empty = no shadow.' },
  { label: 'shadow_blur', type: 'property', detail: '  float', info: 'Shadow blur radius in pixels.' },
  { label: 'shadow_x', type: 'property', detail: '  float', info: 'Shadow horizontal offset.' },
  { label: 'shadow_y', type: 'property', detail: '  float', info: 'Shadow vertical offset.' },
  { label: 'letter_spacing', type: 'property', detail: '  float', info: 'Extra spacing between each character in pixels.' },
  { label: 'background', type: 'property', detail: '  str', info: 'Background fill color behind the text. Empty = transparent.' },
  { label: 'padding', type: 'property', detail: '  float', info: 'Padding around text when background is set.' },
];

const LINE_PROPS = [
  { label: 'x2', type: 'property', detail: '  float', info: 'Line end X position.' },
  { label: 'y2', type: 'property', detail: '  float', info: 'Line end Y position.' },
  { label: 'color', type: 'property', detail: '  str', info: 'Line color.' },
  { label: 'line_width', type: 'property', detail: '  float', info: 'Line thickness in pixels.' },
];

const SPRITE_PROPS = [
  { label: 'width', type: 'property', detail: '  float', info: 'Sprite width in pixels (read-only).' },
  { label: 'height', type: 'property', detail: '  float', info: 'Sprite height in pixels (read-only).' },
  { label: 'flip_x', type: 'property', detail: '  bool', info: 'Mirror sprite horizontally.' },
  { label: 'flip_y', type: 'property', detail: '  bool', info: 'Mirror sprite vertically.' },
  { label: 'frame', type: 'property', detail: '  int', info: 'Current animation frame index. Setting this stops auto-play.' },
  { label: 'frame_count', type: 'property', detail: '  int', info: 'Total number of animation frames (read-only).' },
  { label: 'fps', type: 'property', detail: '  int', info: 'Animation speed in frames per second.' },
  { label: 'animating', type: 'property', detail: '  bool', info: 'Whether the sprite is auto-animating.' },
];

const SPRITE_ANIM_METHODS = [
  snippetCompletion('play(${fps})', { label: 'play', type: 'method', detail: '(fps=None)', info: 'Start animation. Optionally set FPS.\nmy_sprite.play(8)' }),
  snippetCompletion('stop()', { label: 'stop', type: 'method', detail: '()', info: 'Stop animation on the current frame.' }),
  snippetCompletion('set_frame(${n})', { label: 'set_frame', type: 'method', detail: '(n)', info: 'Jump to frame n and stop animating.' }),
];

const BUTTON_PROPS = [
  { label: 'text', type: 'property', detail: '  str', info: 'Button label text.' },
  { label: 'color', type: 'property', detail: '  str', info: 'Background color.' },
  { label: 'hover_color', type: 'property', detail: '  str', info: 'Background color on mouse hover. Empty = auto-lighten.' },
  { label: 'press_color', type: 'property', detail: '  str', info: 'Background color when pressed.' },
  { label: 'text_color', type: 'property', detail: '  str', info: 'Label text color (default "white").' },
  { label: 'text_size', type: 'property', detail: '  int', info: 'Font size in pixels (default 18).' },
  { label: 'font', type: 'property', detail: '  str', info: 'Font family, e.g. "Arial", "Impact".' },
  { label: 'bold', type: 'property', detail: '  bool', info: 'Bold label text (default True).' },
  { label: 'italic', type: 'property', detail: '  bool', info: 'Italic label text.' },
  { label: 'border_color', type: 'property', detail: '  str', info: 'Border color. Empty = no border.' },
  { label: 'border_width', type: 'property', detail: '  float', info: 'Border thickness in pixels.' },
  { label: 'radius', type: 'property', detail: '  float', info: 'Corner rounding radius (default 8).' },
  { label: 'padding', type: 'property', detail: '  float', info: 'Padding around text (default 12).' },
  { label: 'disabled', type: 'property', detail: '  bool', info: 'If True, button is grayed out and unclickable.' },
  { label: 'disabled_color', type: 'property', detail: '  str', info: 'Background color when disabled.' },
  { label: 'disabled_text_color', type: 'property', detail: '  str', info: 'Text color when disabled.' },
  { label: 'hovered', type: 'property', detail: '  bool', info: 'True if mouse is over the button (read-only).' },
];

const GROUP_METHODS = [
  snippetCompletion('add(${obj})', { label: 'add', type: 'method', detail: '(obj)', info: 'Add a game object to this group.' }),
  snippetCompletion('remove(${obj})', { label: 'remove', type: 'method', detail: '(obj)', info: 'Remove a game object from this group.' }),
  snippetCompletion('has(${obj})', { label: 'has', type: 'method', detail: '(obj) → bool', info: 'True if the object is in this group.' }),
  snippetCompletion('for_each(${fn})', { label: 'for_each', type: 'method', detail: '(fn)', info: 'Call fn(obj) for each living object in the group.\ndef move_enemy(e):\n    e.x -= 2\nenemies.for_each(move_enemy)' }),
  snippetCompletion('remove_all()', { label: 'remove_all', type: 'method', detail: '()', info: 'Remove ALL objects in the group from the game and clear the group.' }),
  snippetCompletion('any_touch(${obj})', { label: 'any_touch', type: 'method', detail: '(obj) → bool', info: 'True if ANY object in the group touches obj.\nif enemies.any_touch(player): ...' }),
  snippetCompletion('get_touching(${obj})', { label: 'get_touching', type: 'method', detail: '(obj) → list', info: 'Return a list of group objects that touch obj.\nfor e in enemies.get_touching(bullet): e.remove()' }),
  snippetCompletion('count()', { label: 'count', type: 'method', detail: '() → int', info: 'Number of objects in the group.' }),
];

// ───────────────── Per-Type Completion Lists ─────────────────

function dedup(arr) {
  const s = new Set();
  return arr.filter(c => { if (s.has(c.label)) return false; s.add(c.label); return true; });
}

const TYPE_COMPLETIONS = {
  Rect:        dedup([...SHARED_METHODS, ...SHARED_PROPS, ...RECT_PROPS]),
  Circle:      dedup([...SHARED_METHODS, ...SHARED_PROPS, ...CIRCLE_PROPS]),
  Text:        dedup([...SHARED_METHODS, ...SHARED_PROPS, ...TEXT_PROPS]),
  Line:        dedup([...SHARED_METHODS, ...SHARED_PROPS, ...LINE_PROPS]),
  Sprite:      dedup([...SHARED_METHODS, ...SHARED_PROPS, ...SPRITE_PROPS, ...SPRITE_ANIM_METHODS]),
  PixelSprite: dedup([...SHARED_METHODS, ...SHARED_PROPS, ...SPRITE_PROPS, ...SPRITE_ANIM_METHODS]),
  Button:      dedup([...SHARED_METHODS, ...SHARED_PROPS, ...BUTTON_PROPS]),
  Group:       dedup([...GROUP_METHODS]),
};

const OBJECT_COMPLETIONS = dedup([
  ...SHARED_METHODS,
  ...SHARED_PROPS,
  ...RECT_PROPS,
  ...CIRCLE_PROPS,
  ...TEXT_PROPS,
  ...LINE_PROPS,
  ...BUTTON_PROPS,
  ...SPRITE_PROPS,
  ...SPRITE_ANIM_METHODS,
]);

const CLASS_NAMES = Object.keys(TYPE_COMPLETIONS).join('|');
const TYPE_REGEX = new RegExp(`(\\w+)\\s*=\\s*game\\.(${CLASS_NAMES})\\s*\\(`, 'g');

/**
 * Scan the document for `var = game.ClassName(` assignments.
 * Returns a Map of variable name → class name.
 */
function inferTypes(doc) {
  const text = doc.toString();
  const types = new Map();
  let m;
  TYPE_REGEX.lastIndex = 0;
  while ((m = TYPE_REGEX.exec(text)) !== null) {
    types.set(m[1], m[2]);
  }
  return types;
}

// ───────────────── Python Keywords & Builtins ─────────────────

const PYTHON_KEYWORDS = [
  'False', 'None', 'True', 'and', 'as', 'assert', 'break', 'class',
  'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
  'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
].map(kw => ({ label: kw, type: 'keyword' }));

const PYTHON_BUILTINS = [
  { label: 'print', detail: '(value, ...)', info: 'Print values to the console.' },
  { label: 'len', detail: '(obj) → int', info: 'Return the number of items in a list, string, etc.' },
  { label: 'range', detail: '(stop) or (start, stop, step)', info: 'Generate a sequence of numbers.' },
  { label: 'int', detail: '(value) → int', info: 'Convert to integer.' },
  { label: 'float', detail: '(value) → float', info: 'Convert to float.' },
  { label: 'str', detail: '(value) → str', info: 'Convert to string.' },
  { label: 'bool', detail: '(value) → bool', info: 'Convert to boolean.' },
  { label: 'list', detail: '(iterable) → list', info: 'Create a new list.' },
  { label: 'dict', detail: '(**kwargs) → dict', info: 'Create a new dictionary.' },
  { label: 'abs', detail: '(x) → number', info: 'Return absolute value.' },
  { label: 'max', detail: '(a, b, ...) → value', info: 'Return the largest item.' },
  { label: 'min', detail: '(a, b, ...) → value', info: 'Return the smallest item.' },
  { label: 'sum', detail: '(iterable) → number', info: 'Sum all items in a list.' },
  { label: 'round', detail: '(x, ndigits) → number', info: 'Round a number.' },
  { label: 'sorted', detail: '(iterable) → list', info: 'Return a new sorted list.' },
  { label: 'enumerate', detail: '(iterable) → iterator', info: 'Pairs of (index, value).' },
  { label: 'zip', detail: '(iter1, iter2) → iterator', info: 'Pair items from two lists.' },
  { label: 'type', detail: '(obj) → type', info: 'Return the type of an object.' },
  { label: 'isinstance', detail: '(obj, cls) → bool', info: 'Check if obj is an instance of cls.' },
  { label: 'input', detail: '(prompt) → str', info: 'Read a string from user input.' },
].map(b => ({ ...b, type: 'function', boost: -1 }));

const SNIPPETS = [
  snippetCompletion('import game', { label: 'import game', type: 'text', detail: '', info: 'Import the game engine module.', boost: 10 }),
  snippetCompletion('def ${1:update}():\n    ${2:pass}\n\ngame.on_update(${1:update})\ngame.start()', {
    label: 'def update + start', type: 'text', detail: '— game loop boilerplate',
    info: 'Create an update function and start the game loop.', boost: 3,
  }),
  snippetCompletion('def ${1:func_name}(${2:}):\n    ${3:pass}', {
    label: 'def function', type: 'text', detail: '— define a function',
    info: 'Create a new function.', boost: 1,
  }),
  snippetCompletion('for ${1:i} in range(${2:10}):\n    ${3:pass}', {
    label: 'for loop', type: 'text', detail: '— for i in range(n)',
    info: 'Loop a fixed number of times.', boost: 1,
  }),
  snippetCompletion('if ${1:condition}:\n    ${2:pass}', {
    label: 'if block', type: 'text', detail: '— conditional',
    info: 'Conditional if block.', boost: 1,
  }),
  snippetCompletion('if ${1:condition}:\n    ${2:pass}\nelse:\n    ${3:pass}', {
    label: 'if/else block', type: 'text', detail: '— conditional with else',
    info: 'Conditional if/else block.', boost: 1,
  }),
  snippetCompletion('while ${1:condition}:\n    ${2:pass}', {
    label: 'while loop', type: 'text', detail: '— while condition',
    info: 'Loop while a condition is true.', boost: 1,
  }),
];

const TOP_LEVEL = [
  { label: 'game', type: 'variable', info: 'The game engine module. Type game. to see all functions.', boost: 5 },
  ...SNIPPETS,
  ...PYTHON_KEYWORDS,
  ...PYTHON_BUILTINS,
];

// ───────────────── Completion Source ─────────────────

export function gameCompletionSource(context) {
  // 1. After "game." — show all module functions, classes, constants
  const gameDot = context.matchBefore(/game\.\w*/);
  if (gameDot) {
    return {
      from: gameDot.from + 5,
      options: MODULE_COMPLETIONS,
      validFor: /^\w*$/,
    };
  }

  // 2. After "variable." — infer the type and show relevant completions
  const objDot = context.matchBefore(/[a-zA-Z_]\w*\.\w*/);
  if (objDot) {
    const dotIdx = objDot.text.indexOf('.');
    const varName = objDot.text.slice(0, dotIdx);

    // Look up the variable's type from document assignments
    const types = inferTypes(context.state.doc);
    const cls = types.get(varName);
    const options = (cls && TYPE_COMPLETIONS[cls]) || OBJECT_COMPLETIONS;

    return {
      from: objDot.from + dotIdx + 1,
      options,
      validFor: /^\w*$/,
    };
  }

  // 3. General: keywords, builtins, "game", snippets
  const word = context.matchBefore(/[a-zA-Z_]\w*/);
  if (word && (word.text.length >= 2 || context.explicit)) {
    return {
      from: word.from,
      options: TOP_LEVEL,
      validFor: /^\w*$/,
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
//  Signature Help — parameter tooltips inside function calls
// ═══════════════════════════════════════════════════════════════

const SIGNATURES = new Map([
  // ── game.* module functions ──
  ['game.title',                { params: ['text'],                                           doc: 'Set the game window title' }],
  ['game.background',           { params: ['color'],                                          doc: 'Set background color' }],
  ['game.show_grid',            { params: ['visible=True'],                                   doc: 'Show/hide coordinate grid' }],
  ['game.Rect',                 { params: ['x', 'y', 'w', 'h', 'color', 'outline=False'],    doc: 'Create a rectangle' }],
  ['game.Circle',               { params: ['x', 'y', 'radius', 'color', 'outline=False'],    doc: 'Create a circle at (x, y)' }],
  ['game.Text',                 { params: ['text', 'x', 'y', 'color="white"', 'size=20'],    doc: 'Create a text label' }],
  ['game.Line',                 { params: ['x1', 'y1', 'x2', 'y2', 'color="white"', 'width=2'], doc: 'Draw a line' }],
  ['game.Sprite',               { params: ['name', 'x', 'y', 'scale=4'],                     doc: 'Create a sprite from the gallery' }],
  ['game.PixelSprite',          { params: ['x', 'y', 'rows', 'colors', 'scale=4'],           doc: 'Create a sprite from pixel art data' }],
  ['game.Button',               { params: ['text', 'x', 'y', 'width=auto', 'height=auto', 'color="#FF6B35"'], doc: 'Clickable button with hover/press' }],
  ['game.key_pressed',          { params: ['key'],                                            doc: 'True while key is held' }],
  ['game.key_just_pressed',     { params: ['key'],                                            doc: 'True on single frame of key press' }],
  ['game.key_just_released',    { params: ['key'],                                            doc: 'True on single frame of key release' }],
  ['game.on_key',               { params: ['callback(key)'],                                  doc: 'Event: fires on each key press' }],
  ['game.on_key_up',            { params: ['callback(key)'],                                  doc: 'Event: fires on each key release' }],
  ['game.mouse_x',              { params: [],                                                 doc: 'Mouse X on canvas → int' }],
  ['game.mouse_y',              { params: [],                                                 doc: 'Mouse Y on canvas → int' }],
  ['game.mouse_down',           { params: [],                                                 doc: 'True while mouse held → bool' }],
  ['game.mouse_clicked',        { params: [],                                                 doc: 'True on frame of click → bool' }],
  ['game.mouse_released',       { params: [],                                                 doc: 'True on frame of release → bool' }],
  ['game.on_click',             { params: ['callback(x, y)'],                                 doc: 'Event: fires on canvas click' }],
  ['game.hit_test',             { params: ['x', 'y'],                                         doc: 'Topmost object ID at (x, y) or None' }],
  ['game.wait',                 { params: ['ms'],                                             doc: 'Pause execution (top-level only)' }],
  ['game.after',                { params: ['ms', 'callback'],                                 doc: 'Run callback once after delay → timer_id' }],
  ['game.every',                { params: ['ms', 'callback'],                                 doc: 'Run callback repeatedly → timer_id' }],
  ['game.cancel_timer',         { params: ['timer_id'],                                       doc: 'Cancel an after() or every() timer' }],
  ['game.sound',                { params: ['freq=440', 'dur=200', 'type="square"'],           doc: 'Play a simple tone' }],
  ['game.tone',                 { params: ['freq=440', 'dur=200', 'vol=0.15', 'type="square"'], doc: 'Play a tone with volume' }],
  ['game.note',                 { params: ['name', 'dur=300', 'vol=0.15', 'type="square"'],   doc: 'Play note e.g. "C4", "A#3"' }],
  ['game.play_sound',           { params: ['name', 'vol=1.0'],                                doc: 'Play uploaded/recorded sound' }],
  ['game.sound_names',          { params: [],                                                 doc: 'List custom sound names → list' }],
  ['game.stop_sounds',          { params: [],                                                 doc: 'Stop all playing sounds' }],
  ['game.random_int',           { params: ['min', 'max'],                                     doc: 'Random int (inclusive) → int' }],
  ['game.distance',             { params: ['obj_a', 'obj_b'],                                 doc: 'Pixel distance between objects → float' }],
  ['game.frame_count',          { params: [],                                                 doc: 'Frames since start → int' }],
  ['game.sprite_names',         { params: [],                                                 doc: 'All sprite names → list' }],
  ['game.set_background_image', { params: ['name'],                                           doc: 'Set background/sprite as canvas background by name' }],
  ['game.clear_background_image', { params: [],                                               doc: 'Remove background image' }],
  ['game.asset_names',           { params: ['type=None'],                                     doc: 'List asset names. type: "sprite","background","sound" or None for all' }],
  ['game.background_names',      { params: [],                                                doc: 'List background image names' }],
  ['game.has_asset',             { params: ['name'],                                          doc: 'Check if user asset exists → bool' }],
  ['game.asset_info',            { params: ['name'],                                          doc: 'Get asset info dict or None' }],
  ['game.on_update',            { params: ['callback'],                                       doc: 'Set the per-frame update function' }],
  ['game.update',               { params: ['callback'],                                       doc: 'Alias for on_update()' }],
  ['game.start',                { params: [],                                                 doc: 'Start the game loop' }],
  ['game.run',                  { params: [],                                                 doc: 'Alias for start()' }],
  ['game.stop',                 { params: [],                                                 doc: 'Stop the game loop' }],
  ['game.tween',                { params: ['obj', 'prop', 'target', 'ms', 'easing="linear"', 'callback=None'], doc: 'Animate a property smoothly' }],
  ['game.cancel_tween',         { params: ['tween_id'],                                       doc: 'Cancel a tween' }],
  ['game.cancel_tweens',        { params: ['obj'],                                            doc: 'Cancel all tweens on object' }],
  ['game.emit',                 { params: ['x', 'y', '**opts'],                                 doc: 'Emit particles: shape, color/colors, count, speed, size, life, gravity, drag, fade, shrink, grow, spin, sprite, outline, blend' }],
  ['game.preset',               { params: ['name', 'x', 'y', '**overrides'],                    doc: 'Emit preset: "explosion","sparkle","smoke","fire","confetti","snow","hearts","bubbles","trail","magic"' }],
  ['game.Emitter',              { params: ['x', 'y', '**opts'],                                 doc: 'Continuous emitter → id. opts: rate=2, follow=obj_id, + emit() opts' }],
  ['game.emitter_on',           { params: ['emitter_id'],                                       doc: 'Activate emitter' }],
  ['game.emitter_off',          { params: ['emitter_id'],                                       doc: 'Deactivate emitter' }],
  ['game.move_emitter',         { params: ['emitter_id', 'x', 'y'],                             doc: 'Move emitter position' }],
  ['game.remove_emitter',       { params: ['emitter_id'],                                       doc: 'Remove emitter' }],
  ['game.camera_x',             { params: ['val=None'],                                       doc: 'Get/set camera X' }],
  ['game.camera_y',             { params: ['val=None'],                                       doc: 'Get/set camera Y' }],
  ['game.camera_follow',        { params: ['obj', 'smooth=0.1'],                             doc: 'Center camera on object' }],
  ['game.shake',                { params: ['intensity=5', 'duration=300'],                    doc: 'Screen shake effect' }],
  ['game.flash',                { params: ['color="white"', 'duration=200'],                  doc: 'Flash screen overlay' }],
  ['game.transition',           { params: ['type="fade"', 'duration=500', 'color="black"', 'on_mid=None', 'on_done=None'], doc: 'Scene transition' }],
  ['game.save',                 { params: ['key', 'value'],                                   doc: 'Save to persistent storage' }],
  ['game.load',                 { params: ['key', 'default=None'],                            doc: 'Load from persistent storage' }],
  ['game.delete_save',          { params: ['key'],                                            doc: 'Delete saved data' }],
  ['game.random_float',        { params: ['min', 'max'],                                     doc: 'Random float in range' }],
  ['game.random_color',        { params: [],                                                 doc: 'Random hex color string' }],
  ['game.choice',               { params: ['list'],                                           doc: 'Random item from list' }],
  ['game.lerp',                 { params: ['a', 'b', 't'],                                    doc: 'Linear interpolation' }],
  ['game.clamp',                { params: ['val', 'min', 'max'],                             doc: 'Clamp between min and max' }],
  ['game.physics_enabled',      { params: ['val=None'],                                       doc: 'Enable/disable physics' }],
  ['game.on_scene',             { params: ['name', 'setup_fn'],                              doc: 'Register scene setup function' }],
  ['game.scene',                { params: ['name'],                                          doc: 'Switch to named scene (clears objects, runs setup)' }],
  ['game.get_scene',            { params: [],                                                doc: 'Get current scene name → str' }],
  ['game.keep_inside',          { params: ['obj', 'x=0', 'y=0', 'w=WIDTH', 'h=HEIGHT'],     doc: 'Keep object within bounds' }],
  ['game.push_out',             { params: ['obj', 'other'],                                  doc: 'Push obj out of other, stop velocity → bool' }],
  ['game.bounce_off',           { params: ['obj', 'other'],                                  doc: 'Bounce obj off other, reverse velocity → bool' }],
  ['game.Group',                { params: [],                                                doc: 'Create a new object group' }],
  ['clone',                     { params: [],                                                doc: 'Create a copy of this object' }],

  // ── Object methods (matched by method name alone) ──
  ['move',          { params: ['dx', 'dy'],                   doc: 'Move relative to current position' }],
  ['move_to',       { params: ['x', 'y'],                     doc: 'Move to absolute position' }],
  ['touches',       { params: ['other'],                      doc: 'True if bounding boxes overlap → bool' }],
  ['remove',        { params: [],                             doc: 'Remove object from the game' }],
  ['hide',          { params: [],                             doc: 'Make invisible' }],
  ['show',          { params: [],                             doc: 'Make visible' }],
  ['is_out',        { params: [],                             doc: 'True if fully off-screen → bool' }],
  ['contains',      { params: ['x', 'y'],                     doc: 'True if point is inside → bool' }],
  ['on_click',      { params: ['callback(self, x, y)'],       doc: 'Register click handler for this object' }],
  ['on_hover',      { params: ['enter_cb(self, x, y)', 'exit_cb(self)'], doc: 'Register hover enter/exit handlers' }],
  ['play',          { params: ['fps=None'],                   doc: 'Start sprite animation' }],
  ['set_frame',     { params: ['n'],                          doc: 'Jump to frame n and stop animating' }],
  ['stop',          { params: [],                             doc: 'Stop animation on current frame' }],
  ['keep_inside',   { params: ['x=0', 'y=0', 'w=WIDTH', 'h=HEIGHT'], doc: 'Keep inside bounds' }],
  ['push_out',      { params: ['other'],                     doc: 'Push out of other object → bool' }],
  ['bounce_off',    { params: ['other'],                     doc: 'Bounce off other object → bool' }],
  ['say',           { params: ['text', 'duration=3000', 'scroll_speed=40'], doc: 'Show speech bubble above object' }],
  ['think',         { params: ['text', 'duration=3000', 'scroll_speed=40'], doc: 'Show thought bubble above object' }],
  ['stop_talking',  { params: [],                            doc: 'Remove talk/think bubble' }],
  ['add',           { params: ['obj'],                       doc: 'Add object to group' }],
  ['for_each',      { params: ['fn(obj)'],                   doc: 'Call fn for each living object' }],
  ['any_touch',     { params: ['obj'],                       doc: 'True if any in group touches obj' }],
  ['get_touching',  { params: ['obj'],                       doc: 'List of group objects touching obj' }],
  ['remove_all',    { params: [],                            doc: 'Remove all from game & clear group' }],
  ['count',         { params: [],                            doc: 'Number of objects in group' }],
  ['has',           { params: ['obj'],                       doc: 'True if object is in group' }],

  // ── Python builtins ──
  ['print',      { params: ['value', '...'],                  doc: 'Print to console' }],
  ['len',        { params: ['obj'],                           doc: 'Number of items → int' }],
  ['range',      { params: ['start', 'stop', 'step=1'],      doc: 'Sequence of numbers' }],
  ['int',        { params: ['value'],                         doc: 'Convert to int' }],
  ['float',      { params: ['value'],                         doc: 'Convert to float' }],
  ['str',        { params: ['value'],                         doc: 'Convert to string' }],
  ['abs',        { params: ['x'],                             doc: 'Absolute value' }],
  ['max',        { params: ['a', 'b', '...'],                 doc: 'Largest value' }],
  ['min',        { params: ['a', 'b', '...'],                 doc: 'Smallest value' }],
  ['round',      { params: ['x', 'ndigits=0'],               doc: 'Round a number' }],
  ['sorted',     { params: ['iterable'],                      doc: 'Sorted list' }],
  ['enumerate',  { params: ['iterable'],                      doc: 'Pairs of (index, value)' }],
  ['isinstance', { params: ['obj', 'cls'],                    doc: 'Check type → bool' }],
  ['append',     { params: ['item'],                          doc: 'Add item to list' }],
]);

/**
 * Walk backwards from cursor position to find the enclosing function
 * call context: which function, and which parameter index.
 */
function findCallContext(doc, pos) {
  const text = doc.sliceString(0, pos);
  let depth = 0;
  let commas = 0;
  let i = text.length - 1;

  while (i >= 0) {
    const ch = text[i];

    // Skip string literals (scan back to matching quote)
    if (ch === '"' || ch === "'") {
      const q = ch;
      i--;
      while (i >= 0 && text[i] !== q) i--;
      i--;
      continue;
    }

    if (ch === ')' || ch === ']') { depth++; i--; continue; }
    if (ch === '[') { depth--; i--; continue; }
    if (ch === '(') {
      if (depth > 0) { depth--; i--; continue; }
      // Found the matching open paren
      const before = text.slice(0, i);
      const m = before.match(/([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?)$/);
      if (m) {
        return { funcName: m[1], paramIndex: commas, openParen: i };
      }
      return null;
    }
    if (ch === ',' && depth === 0) commas++;
    i--;
  }
  return null;
}

/**
 * Build the HTML for the signature tooltip.
 * The current parameter is highlighted with a bold span.
 */
function renderSignature(funcName, sig, paramIndex) {
  const shortName = funcName.includes('.') ? funcName : funcName;
  const parts = sig.params.map((p, idx) => {
    if (idx === paramIndex) return `<span class="cm-sig-active">${p}</span>`;
    return `<span class="cm-sig-param">${p}</span>`;
  });
  const paramStr = parts.length ? parts.join(', ') : '';
  let html = `<span class="cm-sig-name">${shortName}</span>(${paramStr})`;
  if (sig.doc) html += `<div class="cm-sig-doc">${sig.doc}</div>`;
  return html;
}

/**
 * Look up a signature. Tries qualified name first (e.g. "game.Rect"),
 * then falls back to just the method name (e.g. "move").
 */
function lookupSignature(funcName) {
  const sig = SIGNATURES.get(funcName);
  if (sig) return { name: funcName, sig };
  // For method calls like "player.move", try just "move"
  const dot = funcName.lastIndexOf('.');
  if (dot !== -1) {
    const method = funcName.slice(dot + 1);
    const msig = SIGNATURES.get(method);
    if (msig) return { name: funcName, sig: msig };
  }
  return null;
}

function getSignatureTooltip(state) {
  if (state.selection.ranges.length !== 1) return null;
  const pos = state.selection.main.head;
  const ctx = findCallContext(state.doc, pos);
  if (!ctx) return null;

  const found = lookupSignature(ctx.funcName);
  if (!found) return null;
  if (found.sig.params.length === 0) return null;

  return {
    pos: ctx.openParen,
    above: true,
    arrow: true,
    create() {
      const dom = document.createElement('div');
      dom.className = 'cm-sig-tooltip';
      dom.innerHTML = renderSignature(found.name, found.sig, ctx.paramIndex);
      return {
        dom,
        update(update) {
          const newPos = update.state.selection.main.head;
          const newCtx = findCallContext(update.state.doc, newPos);
          if (!newCtx) return;
          const newFound = lookupSignature(newCtx.funcName);
          if (!newFound) return;
          dom.innerHTML = renderSignature(newFound.name, newFound.sig, newCtx.paramIndex);
        },
      };
    },
  };
}

export const signatureHelp = [
  StateField.define({
    create(state) { return getSignatureTooltip(state); },
    update(value, tr) {
      if (!tr.docChanged && !tr.selection) return value;
      return getSignatureTooltip(tr.state);
    },
    provide: f => showTooltip.from(f),
  }),
  EditorView.baseTheme({
    '.cm-sig-tooltip': {
      padding: '4px 10px',
      fontSize: '13px',
      lineHeight: '1.5',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      maxWidth: '480px',
    },
    '.cm-sig-name': {
      color: '#82aaff',
    },
    '.cm-sig-param': {
      color: '#a0a0b0',
    },
    '.cm-sig-active': {
      color: '#ffe082',
      fontWeight: 'bold',
      textDecoration: 'underline',
      textUnderlineOffset: '3px',
    },
    '.cm-sig-doc': {
      marginTop: '2px',
      fontSize: '12px',
      color: '#888',
    },
  }),
];
