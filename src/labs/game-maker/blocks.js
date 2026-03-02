import * as Blockly from 'blockly';
import 'blockly/blocks';
import { pythonGenerator, Order } from 'blockly/python';

const EVENTS_HUE = 40;
const SETUP_HUE = 215;
const OBJECTS_HUE = 160;
const MOTION_HUE = 230;
const LOOKS_HUE = 280;
const SENSING_HUE = 195;
const SOUND_HUE = 310;

const KEY_OPTIONS = [
  ['right arrow', 'right'], ['left arrow', 'left'],
  ['up arrow', 'up'], ['down arrow', 'down'],
  ['space', 'space'], ['enter', 'enter'],
  ['a', 'a'], ['b', 'b'], ['c', 'c'], ['d', 'd'],
  ['w', 'w'], ['s', 's'], ['q', 'q'], ['e', 'e'],
  ['r', 'r'], ['f', 'f'], ['z', 'z'], ['x', 'x'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'],
  ['5', '5'], ['6', '6'], ['7', '7'], ['8', '8'], ['9', '9'], ['0', '0'],
];

const PROP_OPTIONS = [
  ['x', 'x'], ['y', 'y'],
  ['color', 'color'], ['content', 'content'],
  ['opacity', 'opacity'], ['rotation', 'rotation'],
  ['width', 'width'], ['height', 'height'],
  ['visible', 'visible'],
];

export function registerBlocks() {
  Blockly.defineBlocksWithJsonArray([
    // ════════ Events ════════
    {
      type: 'game_every_frame',
      message0: 'Every frame %1 %2',
      args0: [
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: EVENTS_HUE,
      tooltip: 'Code inside runs 60 times per second (the game loop)',
    },

    // ════════ Setup ════════
    {
      type: 'game_title',
      message0: 'set title to %1',
      args0: [{ type: 'field_input', name: 'TITLE', text: 'My Game' }],
      previousStatement: null, nextStatement: null,
      colour: SETUP_HUE,
      tooltip: 'Set the game window title',
    },
    {
      type: 'game_background',
      message0: 'set background color %1',
      args0: [{ type: 'field_colour', name: 'COLOR', colour: '#0a0a23' }],
      previousStatement: null, nextStatement: null,
      colour: SETUP_HUE,
      tooltip: 'Set the background color',
    },

    // ════════ Objects ════════
    {
      type: 'game_create_rect',
      message0: 'Rectangle x: %1 y: %2 width: %3 height: %4 color: %5',
      args0: [
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
        { type: 'input_value', name: 'W', check: 'Number' },
        { type: 'input_value', name: 'H', check: 'Number' },
        { type: 'field_colour', name: 'COLOR', colour: '#00ffff' },
      ],
      output: null, colour: OBJECTS_HUE, inputsInline: true,
      tooltip: 'Create a rectangle',
    },
    {
      type: 'game_create_circle',
      message0: 'Circle x: %1 y: %2 radius: %3 color: %4',
      args0: [
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
        { type: 'input_value', name: 'R', check: 'Number' },
        { type: 'field_colour', name: 'COLOR', colour: '#ffd700' },
      ],
      output: null, colour: OBJECTS_HUE, inputsInline: true,
      tooltip: 'Create a circle',
    },
    {
      type: 'game_create_text',
      message0: 'Text %1 x: %2 y: %3 color: %4 size: %5',
      args0: [
        { type: 'field_input', name: 'TEXT', text: 'Hello!' },
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
        { type: 'field_colour', name: 'COLOR', colour: '#ffffff' },
        { type: 'input_value', name: 'SIZE', check: 'Number' },
      ],
      output: null, colour: OBJECTS_HUE, inputsInline: true,
      tooltip: 'Create a text label',
    },
    {
      type: 'game_create_sprite',
      message0: 'Sprite %1 x: %2 y: %3 scale: %4',
      args0: [
        { type: 'field_input', name: 'NAME', text: 'player' },
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
        { type: 'input_value', name: 'SCALE', check: 'Number' },
      ],
      output: null, colour: OBJECTS_HUE, inputsInline: true,
      tooltip: 'Create a sprite from the built-in gallery',
    },

    // ════════ Motion ════════
    {
      type: 'game_move',
      message0: 'move %1 by x: %2 y: %3',
      args0: [
        { type: 'input_value', name: 'OBJ' },
        { type: 'input_value', name: 'DX', check: 'Number' },
        { type: 'input_value', name: 'DY', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: MOTION_HUE, inputsInline: true,
      tooltip: 'Move an object by dx, dy pixels',
    },
    {
      type: 'game_move_to',
      message0: 'move %1 to x: %2 y: %3',
      args0: [
        { type: 'input_value', name: 'OBJ' },
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: MOTION_HUE, inputsInline: true,
      tooltip: 'Move to an absolute position',
    },
    {
      type: 'game_keep_inside',
      message0: 'keep %1 inside screen',
      args0: [{ type: 'input_value', name: 'OBJ' }],
      previousStatement: null, nextStatement: null,
      colour: MOTION_HUE, inputsInline: true,
      tooltip: 'Keep an object inside the game canvas',
    },

    // ════════ Looks / Properties ════════
    {
      type: 'game_set_prop',
      message0: 'set %1 of %2 to %3',
      args0: [
        { type: 'field_dropdown', name: 'PROP', options: PROP_OPTIONS },
        { type: 'input_value', name: 'OBJ' },
        { type: 'input_value', name: 'VALUE' },
      ],
      previousStatement: null, nextStatement: null,
      colour: LOOKS_HUE, inputsInline: true,
      tooltip: 'Set a property of a game object',
    },
    {
      type: 'game_get_prop',
      message0: '%1 of %2',
      args0: [
        { type: 'field_dropdown', name: 'PROP', options: PROP_OPTIONS },
        { type: 'input_value', name: 'OBJ' },
      ],
      output: null, colour: LOOKS_HUE, inputsInline: true,
      tooltip: 'Get a property of a game object',
    },
    {
      type: 'game_say',
      message0: '%1 say %2 for %3 ms',
      args0: [
        { type: 'input_value', name: 'OBJ' },
        { type: 'input_value', name: 'TEXT', check: 'String' },
        { type: 'input_value', name: 'DUR', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: LOOKS_HUE, inputsInline: true,
      tooltip: 'Show a speech bubble',
    },
    {
      type: 'game_remove',
      message0: 'remove %1',
      args0: [{ type: 'input_value', name: 'OBJ' }],
      previousStatement: null, nextStatement: null,
      colour: LOOKS_HUE, inputsInline: true,
      tooltip: 'Remove an object from the game',
    },

    // ════════ Sensing ════════
    {
      type: 'game_key_pressed',
      message0: 'key %1 pressed?',
      args0: [{ type: 'field_dropdown', name: 'KEY', options: KEY_OPTIONS }],
      output: 'Boolean', colour: SENSING_HUE,
      tooltip: 'True while the key is held down',
    },
    {
      type: 'game_touches',
      message0: '%1 touches %2 ?',
      args0: [
        { type: 'input_value', name: 'A' },
        { type: 'input_value', name: 'B' },
      ],
      output: 'Boolean', colour: SENSING_HUE, inputsInline: true,
      tooltip: 'True if two objects overlap',
    },
    {
      type: 'game_mouse_x',
      message0: 'mouse x',
      output: 'Number', colour: SENSING_HUE,
      tooltip: 'Current mouse X position',
    },
    {
      type: 'game_mouse_y',
      message0: 'mouse y',
      output: 'Number', colour: SENSING_HUE,
      tooltip: 'Current mouse Y position',
    },
    {
      type: 'game_mouse_down',
      message0: 'mouse down?',
      output: 'Boolean', colour: SENSING_HUE,
      tooltip: 'True while the mouse button is held',
    },
    {
      type: 'game_distance',
      message0: 'distance from %1 to %2',
      args0: [
        { type: 'input_value', name: 'A' },
        { type: 'input_value', name: 'B' },
      ],
      output: 'Number', colour: SENSING_HUE, inputsInline: true,
      tooltip: 'Distance between two objects in pixels',
    },
    { type: 'game_width', message0: 'screen width', output: 'Number', colour: SENSING_HUE, tooltip: 'Canvas width (600)' },
    { type: 'game_height', message0: 'screen height', output: 'Number', colour: SENSING_HUE, tooltip: 'Canvas height (600)' },

    // ════════ Sound ════════
    {
      type: 'game_sound',
      message0: 'play sound freq: %1 for %2 ms',
      args0: [
        { type: 'input_value', name: 'FREQ', check: 'Number' },
        { type: 'input_value', name: 'DUR', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: SOUND_HUE, inputsInline: true,
      tooltip: 'Play a tone at the given frequency',
    },
    {
      type: 'game_note',
      message0: 'play note %1 for %2 ms',
      args0: [
        { type: 'field_dropdown', name: 'NOTE', options: [
          ['C4', 'C4'], ['D4', 'D4'], ['E4', 'E4'], ['F4', 'F4'],
          ['G4', 'G4'], ['A4', 'A4'], ['B4', 'B4'],
          ['C5', 'C5'], ['D5', 'D5'], ['E5', 'E5'],
        ]},
        { type: 'input_value', name: 'DUR', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: SOUND_HUE, inputsInline: true,
      tooltip: 'Play a musical note',
    },

    // ════════ Effects ════════
    {
      type: 'game_shake',
      message0: 'shake screen intensity: %1 for %2 ms',
      args0: [
        { type: 'input_value', name: 'INTENSITY', check: 'Number' },
        { type: 'input_value', name: 'DUR', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: LOOKS_HUE, inputsInline: true,
      tooltip: 'Shake the screen',
    },
    {
      type: 'game_preset',
      message0: 'particle %1 at x: %2 y: %3',
      args0: [
        { type: 'field_dropdown', name: 'PRESET', options: [
          ['explosion', 'explosion'], ['sparkle', 'sparkle'],
          ['smoke', 'smoke'], ['fire', 'fire'],
          ['confetti', 'confetti'], ['hearts', 'hearts'], ['magic', 'magic'],
        ]},
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: LOOKS_HUE, inputsInline: true,
      tooltip: 'Show a particle effect',
    },

    // ════════ Helpers ════════
    {
      type: 'game_random_int',
      message0: 'random int from %1 to %2',
      args0: [
        { type: 'input_value', name: 'MIN', check: 'Number' },
        { type: 'input_value', name: 'MAX', check: 'Number' },
      ],
      output: 'Number', colour: 120, inputsInline: true,
      tooltip: 'Random whole number between min and max',
    },
    {
      type: 'game_str',
      message0: 'to text %1',
      args0: [{ type: 'input_value', name: 'VALUE' }],
      output: 'String', colour: 160, inputsInline: true,
      tooltip: 'Convert a number to text',
    },
    {
      type: 'game_join',
      message0: 'join %1 and %2',
      args0: [
        { type: 'input_value', name: 'A', check: 'String' },
        { type: 'input_value', name: 'B', check: 'String' },
      ],
      output: 'String', colour: 160, inputsInline: true,
      tooltip: 'Join two texts together',
    },
  ]);

  // ═══════════════════ Python code generators ═══════════════════

  pythonGenerator.forBlock['game_every_frame'] = function(block, gen) {
    const code = gen.statementToCode(block, 'DO');
    const vars = block.workspace.getAllVariables().map(v => gen.getVariableName(v.name));
    const globalLine = vars.length > 0 ? gen.INDENT + 'global ' + vars.join(', ') + '\n' : '';
    return '\ndef update():\n' + globalLine + (code || gen.INDENT + 'pass\n') + '\ngame.on_update(update)\n';
  };

  pythonGenerator.forBlock['game_title'] = function(block) {
    return 'game.title("' + block.getFieldValue('TITLE') + '")\n';
  };
  pythonGenerator.forBlock['game_background'] = function(block) {
    return 'game.background("' + block.getFieldValue('COLOR') + '")\n';
  };

  pythonGenerator.forBlock['game_create_rect'] = function(block, gen) {
    const x = gen.valueToCode(block, 'X', Order.NONE) || '0';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '0';
    const w = gen.valueToCode(block, 'W', Order.NONE) || '30';
    const h = gen.valueToCode(block, 'H', Order.NONE) || '30';
    const c = block.getFieldValue('COLOR');
    return ['game.Rect(' + x + ', ' + y + ', ' + w + ', ' + h + ', "' + c + '")', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_create_circle'] = function(block, gen) {
    const x = gen.valueToCode(block, 'X', Order.NONE) || '0';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '0';
    const r = gen.valueToCode(block, 'R', Order.NONE) || '15';
    const c = block.getFieldValue('COLOR');
    return ['game.Circle(' + x + ', ' + y + ', ' + r + ', "' + c + '")', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_create_text'] = function(block, gen) {
    const t = block.getFieldValue('TEXT');
    const x = gen.valueToCode(block, 'X', Order.NONE) || '0';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '0';
    const c = block.getFieldValue('COLOR');
    const s = gen.valueToCode(block, 'SIZE', Order.NONE) || '20';
    return ['game.Text("' + t + '", ' + x + ', ' + y + ', "' + c + '", ' + s + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_create_sprite'] = function(block, gen) {
    const n = block.getFieldValue('NAME');
    const x = gen.valueToCode(block, 'X', Order.NONE) || '0';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '0';
    const s = gen.valueToCode(block, 'SCALE', Order.NONE) || '4';
    return ['game.Sprite("' + n + '", ' + x + ', ' + y + ', ' + s + ')', Order.FUNCTION_CALL];
  };

  pythonGenerator.forBlock['game_move'] = function(block, gen) {
    const obj = gen.valueToCode(block, 'OBJ', Order.NONE) || 'None';
    const dx = gen.valueToCode(block, 'DX', Order.NONE) || '0';
    const dy = gen.valueToCode(block, 'DY', Order.NONE) || '0';
    return obj + '.move(' + dx + ', ' + dy + ')\n';
  };
  pythonGenerator.forBlock['game_move_to'] = function(block, gen) {
    const obj = gen.valueToCode(block, 'OBJ', Order.NONE) || 'None';
    const x = gen.valueToCode(block, 'X', Order.NONE) || '0';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '0';
    return obj + '.move_to(' + x + ', ' + y + ')\n';
  };
  pythonGenerator.forBlock['game_keep_inside'] = function(block, gen) {
    return (gen.valueToCode(block, 'OBJ', Order.NONE) || 'None') + '.keep_inside()\n';
  };

  pythonGenerator.forBlock['game_set_prop'] = function(block, gen) {
    const prop = block.getFieldValue('PROP');
    const obj = gen.valueToCode(block, 'OBJ', Order.NONE) || 'None';
    const val = gen.valueToCode(block, 'VALUE', Order.NONE) || '0';
    return obj + '.' + prop + ' = ' + val + '\n';
  };
  pythonGenerator.forBlock['game_get_prop'] = function(block, gen) {
    const prop = block.getFieldValue('PROP');
    const obj = gen.valueToCode(block, 'OBJ', Order.MEMBER) || 'None';
    return [obj + '.' + prop, Order.MEMBER];
  };
  pythonGenerator.forBlock['game_say'] = function(block, gen) {
    const obj = gen.valueToCode(block, 'OBJ', Order.NONE) || 'None';
    const text = gen.valueToCode(block, 'TEXT', Order.NONE) || '"Hello"';
    const dur = gen.valueToCode(block, 'DUR', Order.NONE) || '3000';
    return obj + '.say(' + text + ', ' + dur + ')\n';
  };
  pythonGenerator.forBlock['game_remove'] = function(block, gen) {
    return (gen.valueToCode(block, 'OBJ', Order.NONE) || 'None') + '.remove()\n';
  };

  pythonGenerator.forBlock['game_key_pressed'] = function(block) {
    return ['game.key_pressed("' + block.getFieldValue('KEY') + '")', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_touches'] = function(block, gen) {
    const a = gen.valueToCode(block, 'A', Order.NONE) || 'None';
    const b = gen.valueToCode(block, 'B', Order.NONE) || 'None';
    return [a + '.touches(' + b + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_mouse_x'] = () => ['game.mouse_x()', Order.FUNCTION_CALL];
  pythonGenerator.forBlock['game_mouse_y'] = () => ['game.mouse_y()', Order.FUNCTION_CALL];
  pythonGenerator.forBlock['game_mouse_down'] = () => ['game.mouse_down()', Order.FUNCTION_CALL];
  pythonGenerator.forBlock['game_distance'] = function(block, gen) {
    const a = gen.valueToCode(block, 'A', Order.NONE) || 'None';
    const b = gen.valueToCode(block, 'B', Order.NONE) || 'None';
    return ['game.distance(' + a + ', ' + b + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_width'] = () => ['game.WIDTH', Order.MEMBER];
  pythonGenerator.forBlock['game_height'] = () => ['game.HEIGHT', Order.MEMBER];

  pythonGenerator.forBlock['game_sound'] = function(block, gen) {
    const freq = gen.valueToCode(block, 'FREQ', Order.NONE) || '440';
    const dur = gen.valueToCode(block, 'DUR', Order.NONE) || '200';
    return 'game.sound(' + freq + ', ' + dur + ')\n';
  };
  pythonGenerator.forBlock['game_note'] = function(block, gen) {
    const dur = gen.valueToCode(block, 'DUR', Order.NONE) || '300';
    return 'game.note("' + block.getFieldValue('NOTE') + '", ' + dur + ')\n';
  };

  pythonGenerator.forBlock['game_shake'] = function(block, gen) {
    const i = gen.valueToCode(block, 'INTENSITY', Order.NONE) || '5';
    const d = gen.valueToCode(block, 'DUR', Order.NONE) || '300';
    return 'game.shake(' + i + ', ' + d + ')\n';
  };
  pythonGenerator.forBlock['game_preset'] = function(block, gen) {
    const p = block.getFieldValue('PRESET');
    const x = gen.valueToCode(block, 'X', Order.NONE) || '300';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '300';
    return 'game.preset("' + p + '", ' + x + ', ' + y + ')\n';
  };

  pythonGenerator.forBlock['game_random_int'] = function(block, gen) {
    const mn = gen.valueToCode(block, 'MIN', Order.NONE) || '0';
    const mx = gen.valueToCode(block, 'MAX', Order.NONE) || '100';
    return ['game.random_int(' + mn + ', ' + mx + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_str'] = function(block, gen) {
    const val = gen.valueToCode(block, 'VALUE', Order.NONE) || '0';
    return ['str(' + val + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_join'] = function(block, gen) {
    const a = gen.valueToCode(block, 'A', Order.NONE) || '""';
    const b = gen.valueToCode(block, 'B', Order.NONE) || '""';
    return [a + ' + ' + b, Order.ADDITIVE];
  };
}

export function generateCode(workspace) {
  let code = pythonGenerator.workspaceToCode(workspace);
  code = 'import game\n\n' + code;
  if (!code.includes('game.start()')) {
    code += '\ngame.start()\n';
  }
  return code;
}
