import * as Blockly from 'blockly';
import 'blockly/blocks';
import { registerFieldColour } from '@blockly/field-colour';
registerFieldColour();
import { pythonGenerator, Order } from 'blockly/python';
import { registerMathBlocks } from '../mcu/components/blockly/categories/math';
import { registerStringsBlocks } from '../mcu/components/blockly/categories/strings';
import { registerArraysBlocks } from '../mcu/components/blockly/categories/arrays';

const EVENTS_HUE = 40;
const STAGE_HUE = 215;
const OBJECTS_HUE = 160;
const MOTION_HUE = 230;
const LOOKS_HUE = 280;
const SENSING_HUE = 195;
const SOUND_HUE = 310;
const HUD_HUE = 20;

const TURN_RIGHT_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">' +
    '<path d="M9 3a6 6 0 1 1-4.64 9.8" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>' +
    '<path d="M7.4 1.8 10.8 2.6 8.9 5.5" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
  '</svg>'
);
const TURN_LEFT_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">' +
    '<path d="M9 3a6 6 0 1 0 4.64 9.8" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>' +
    '<path d="M10.6 1.8 7.2 2.6 9.1 5.5" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
  '</svg>'
);

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
  ['vx', 'vx'], ['vy', 'vy'],
  ['ax', 'ax'], ['ay', 'ay'],
  ['friction', 'friction'], ['bounce', 'bounce'],
];

const NEW_VAR_ID = '__new_variable__';
const OBJECT_REFERENCE_FIELD_NAMES = new Set(['OBJ', 'TARGET', 'A', 'B']);
const OBJECT_VALUE_BLOCK_TYPES = new Set([
  'game_create_point',
  'game_create_rect',
  'game_create_circle',
  'game_create_text',
  'game_create_sprite',
  'game_create_line',
  'game_create_button',
  'game_clone',
]);

function normalizeDefaultVariableName(varName) {
  return varName === 'player' ? 'Player' : varName;
}

function getVariableByIdFromWorkspaces(workspace, variableId) {
  if (!variableId) return null;
  for (const ws of getWorkspacesForField(workspace)) {
    const variable = ws?.getVariableById?.(variableId);
    if (variable) return variable;
  }
  return null;
}

function makeSafeIdentifier(value, fallback = 'block') {
  const safe = String(value || '')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1');
  return safe || fallback;
}

function indentCode(code, levels, indent) {
  if (!code) return '';
  const lines = code.split('\n');
  const hasTrailingNewline = lines[lines.length - 1] === '';
  const contentLines = hasTrailingNewline ? lines.slice(0, -1) : lines;
  const prefix = indent.repeat(levels);
  const indented = contentLines.map((line) => prefix + line).join('\n');
  return hasTrailingNewline ? indented + '\n' : indented;
}

function getWorkspacesForField(workspace) {
  return [...new Set([workspace, workspace?.targetWorkspace].filter(Boolean))];
}

function getAssignedObjectVariablesForWorkspace(workspace) {
  const variablesById = new Map();

  for (const ws of getWorkspacesForField(workspace)) {
    for (const block of ws.getAllBlocks(false)) {
      if (block.type !== 'variables_set') continue;
      const valueBlock = block.getInputTargetBlock('VALUE');
      if (!valueBlock || !OBJECT_VALUE_BLOCK_TYPES.has(valueBlock.type)) continue;

      const variable = block.getField('VAR')?.getVariable?.();
      if (variable?.getId?.()) {
        variablesById.set(variable.getId(), variable);
      }
    }
  }

  return [...variablesById.values()].sort((a, b) => a.name.localeCompare(b.name));
}

class FieldVariableCreator extends Blockly.FieldVariable {
  constructor(varName, validator, variableTypes, defaultType, config) {
    super(normalizeDefaultVariableName(varName), validator, variableTypes, defaultType, config);
    const originalGenerator = this.menuGenerator_;
    this.menuGenerator_ = function () {
      if (this.shouldRestrictToObjectInstances_()) {
        const objectOptions = this.getObjectInstanceOptions_();
        return [
          ...objectOptions,
          [Blockly.Msg['NEW_VARIABLE'] || 'New variable...', NEW_VAR_ID],
        ];
      }

      const options = originalGenerator.call(this);
      const insertIdx = Math.max(0, options.length - 2);
      options.splice(insertIdx, 0, [
        Blockly.Msg['NEW_VARIABLE'] || 'New variable...',
        NEW_VAR_ID,
      ]);
      return options;
    };
  }

  shouldRestrictToObjectInstances_() {
    return OBJECT_REFERENCE_FIELD_NAMES.has(this.name);
  }

  getObjectInstanceOptions_() {
    const workspace = this.getSourceBlock()?.workspace || this.sourceBlock_?.workspace;
    const assigned = getAssignedObjectVariablesForWorkspace(workspace);
    const currentVariable = getVariableByIdFromWorkspaces(workspace, this.getValue());
    const variables = [...assigned];
    if (currentVariable && !variables.some((variable) => variable.getId() === currentVariable.getId())) {
      variables.push(currentVariable);
    }

    return variables.map((variable) => [
      variable.name,
      variable.getId(),
    ]);
  }

  getObjectInstanceFallback_() {
    return this.getObjectInstanceOptions_()[0]?.[1] || null;
  }

  doClassValidation_(newValue) {
    if (this.shouldRestrictToObjectInstances_()) {
      const allowed = new Set(this.getObjectInstanceOptions_().map(([, id]) => id));
      if (newValue && getVariableByIdFromWorkspaces(this.getSourceBlock()?.workspace || this.sourceBlock_?.workspace, newValue)) {
        allowed.add(newValue);
      }
      if (allowed.size > 0 && !allowed.has(newValue)) {
        return super.doClassValidation_(this.getObjectInstanceFallback_());
      }
    }
    return super.doClassValidation_(newValue);
  }

  loadState(state) {
    if (this.shouldRestrictToObjectInstances_()) {
      const allowed = new Set(this.getObjectInstanceOptions_().map(([, id]) => id));
      if (state && getVariableByIdFromWorkspaces(this.getSourceBlock()?.workspace || this.sourceBlock_?.workspace, state)) {
        allowed.add(state);
      }
      if (allowed.size > 0 && !allowed.has(state)) {
        return super.loadState(this.getObjectInstanceFallback_());
      }
    }
    return super.loadState(state);
  }

  onItemSelected_(menu, menuItem) {
    const id = menuItem?.getValue();
    if (id === NEW_VAR_ID) {
      const ws = this.sourceBlock_.workspace;
      Blockly.Variables.createVariableButtonHandler(ws, (newVar) => {
        if (newVar) this.setValue(newVar.getId());
      }, '');
      return;
    }
    super.onItemSelected_(menu, menuItem);
  }

  static fromJson(options) {
    const varName = Blockly.utils.parsing.replaceMessageReferences(
      options.variable,
    );
    return new FieldVariableCreator(
      normalizeDefaultVariableName(varName),
      undefined,
      options.variableTypes,
      options.defaultType,
      options,
    );
  }
}

Blockly.fieldRegistry.register('field_variable_creator', FieldVariableCreator);

export function registerBlocks() {
  if (
    Blockly.Blocks['game_on_start'] &&
    Blockly.Blocks['game_clone_do'] &&
    Blockly.Blocks['game_on_clone'] &&
    Blockly.Blocks['mp_array_for_each'] &&
    Blockly.Blocks['game_on_array_item_where'] &&
    Blockly.Blocks['game_create_point'] &&
    Blockly.Blocks['game_wait'] &&
    Blockly.Blocks['game_resize_sprite'] &&
    Blockly.Blocks['game_turn_right'] &&
    Blockly.Blocks['game_turn_left'] &&
    Blockly.Blocks['game_x_position'] &&
    Blockly.Blocks['game_y_position'] &&
    Blockly.Blocks['game_rotation_of']
  ) return;

  registerMathBlocks();
  registerStringsBlocks();
  registerArraysBlocks();

  // Extra array blocks not in the MCU set
  Blockly.Blocks['mp_array_insert_at'] = {
    init() {
      this.appendDummyInput().appendField('insert into')
        .appendField(new Blockly.FieldVariable('list'), 'VAR')
        .appendField('at');
      this.appendValueInput('INDEX').setCheck('Number');
      this.appendDummyInput().appendField('value');
      this.appendValueInput('VALUE').setCheck(null);
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(200);
      this.setTooltip('Insert a value at a specific position');
    },
  };
  pythonGenerator.forBlock['mp_array_insert_at'] = function(block, gen) {
    const fld = block.getField('VAR');
    const variable = fld && fld.getVariable ? fld.getVariable() : null;
    const id = variable ? variable.getId() : block.getFieldValue('VAR');
    const nameDB = gen.nameDB_;
    const v = nameDB && id ? nameDB.getName(id, Blockly.VARIABLE_CATEGORY_NAME) : (variable && variable.name) || 'list';
    const idx = gen.valueToCode(block, 'INDEX', Order.NONE) || '0';
    const val = gen.valueToCode(block, 'VALUE', Order.NONE) || '0';
    return v + '.insert(int(' + idx + '), ' + val + ')\n';
  };


  Blockly.Blocks['mp_array_pop_last'] = {
    init() {
      this.appendDummyInput()
        .appendField('get and remove last value from')
        .appendField(new Blockly.FieldVariable('list'), 'VAR');
      this.setOutput(true, null);
      this.setColour(200);
      this.setTooltip('Remove the last item and return it');
    },
  };
  Blockly.Blocks['mp_array_pop_first'] = {
    init() {
      this.appendDummyInput()
        .appendField('get and remove first value from')
        .appendField(new Blockly.FieldVariable('list'), 'VAR');
      this.setOutput(true, null);
      this.setColour(200);
      this.setTooltip('Remove the first item and return it');
    },
  };

  Blockly.Blocks['mp_array_pop_at'] = {
    init() {
      this.appendDummyInput().appendField('get and remove from')
        .appendField(new Blockly.FieldVariable('list'), 'VAR')
        .appendField('at');
      this.appendValueInput('INDEX').setCheck('Number');
      this.setInputsInline(true);
      this.setOutput(true, null);
      this.setColour(200);
      this.setTooltip('Remove the item at a position and return it');
    },
  };
  function getArrayVarName(block, gen) {
    const fld = block.getField('VAR');
    const variable = fld && fld.getVariable ? fld.getVariable() : null;
    const id = variable ? variable.getId() : block.getFieldValue('VAR');
    const nameDB = gen.nameDB_;
    return nameDB && id ? nameDB.getName(id, Blockly.VARIABLE_CATEGORY_NAME) : (variable && variable.name) || 'list';
  }
  pythonGenerator.forBlock['mp_array_pop_last'] = function(block, gen) {
    return [getArrayVarName(block, gen) + '.pop()', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['mp_array_pop_first'] = function(block, gen) {
    return [getArrayVarName(block, gen) + '.pop(0)', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['mp_array_pop_at'] = function(block, gen) {
    const v = getArrayVarName(block, gen);
    const idx = gen.valueToCode(block, 'INDEX', Order.NONE) || '0';
    return [v + '.pop(int(' + idx + '))', Order.FUNCTION_CALL];
  };

  Blockly.Blocks['mp_array_for_each'] = {
    init() {
      this.appendDummyInput()
        .appendField('for each')
        .appendField(new FieldVariableCreator('item'), 'ITEM')
        .appendField('in')
        .appendField(new Blockly.FieldVariable('list'), 'VAR');
      this.appendStatementInput('DO').setCheck(null);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(120);
      this.setTooltip('Run the blocks once for each item in a list');
    },
  };
  pythonGenerator.forBlock['mp_array_for_each'] = function(block, gen) {
    const item = gen.getVariableName(block.getFieldValue('ITEM'));
    const listVar = getArrayVarName(block, gen);
    const body = gen.statementToCode(block, 'DO') || gen.INDENT + 'pass\n';
    return 'for ' + item + ' in ' + listVar + ':\n' + body;
  };

  Blockly.defineBlocksWithJsonArray([
    // ════════ Events ════════
    {
      type: 'game_on_start',
      message0: 'On start %1 %2',
      args0: [
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: EVENTS_HUE,
      tooltip: 'Code inside runs once when the game starts',
    },
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

    // ════════ Stage ════════
    {
      type: 'game_title',
      message0: 'set title to %1',
      args0: [{ type: 'field_input', name: 'TITLE', text: 'My Game' }],
      previousStatement: null, nextStatement: null,
      colour: STAGE_HUE,
      tooltip: 'Set the game window title',
    },
    {
      type: 'game_background',
      message0: 'set background color %1',
      args0: [{ type: 'field_colour', name: 'COLOR', colour: '#0a0a23' }],
      previousStatement: null, nextStatement: null,
      colour: STAGE_HUE,
      tooltip: 'Set the background color',
    },
    {
      type: 'game_clear_bg_image',
      message0: 'clear backdrop',
      previousStatement: null, nextStatement: null,
      colour: STAGE_HUE,
      tooltip: 'Remove the background image',
    },

    // ════════ Objects ════════
    {
      type: 'game_create_point',
      message0: 'Point x: %1 y: %2',
      args0: [
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
      ],
      output: null, colour: OBJECTS_HUE, inputsInline: true,
      tooltip: 'Create an invisible point object for spawn points and markers',
    },
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
    // game_create_sprite is defined programmatically below (uses dynamic sprite picker)

    // ════════ Physics ════════
    {
      type: 'game_set_velocity',
      message0: 'set velocity of %1 vx: %2 vy: %3',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'input_value', name: 'VX', check: 'Number' },
        { type: 'input_value', name: 'VY', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: OBJECTS_HUE, inputsInline: true,
      tooltip: 'Set velocity (speed) of an object',
    },
    {
      type: 'game_set_acceleration',
      message0: 'set acceleration of %1 ax: %2 ay: %3',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'input_value', name: 'AX', check: 'Number' },
        { type: 'input_value', name: 'AY', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: OBJECTS_HUE, inputsInline: true,
      tooltip: 'Set acceleration (gravity/force) on an object',
    },
    {
      type: 'game_set_bounce',
      message0: 'set bounce of %1 to %2',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'input_value', name: 'VAL', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: OBJECTS_HUE, inputsInline: true,
      tooltip: 'Set bounce factor (0 = no bounce, 1 = full bounce off edges)',
    },
    {
      type: 'game_set_friction',
      message0: 'set friction of %1 to %2',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'input_value', name: 'VAL', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: OBJECTS_HUE, inputsInline: true,
      tooltip: 'Set friction (0 = instant stop, 1 = no friction)',
    },
    {
      type: 'game_push_out',
      message0: 'push %1 out of %2',
      args0: [
        { type: 'field_variable_creator', name: 'A', variable: 'player', variableTypes: [''] },
        { type: 'field_variable_creator', name: 'B', variable: 'player', variableTypes: [''] },
      ],
      previousStatement: null, nextStatement: null,
      colour: OBJECTS_HUE, inputsInline: true,
      tooltip: 'Push an object out of another (solid collision)',
    },
    {
      type: 'game_bounce_off',
      message0: 'bounce %1 off %2',
      args0: [
        { type: 'field_variable_creator', name: 'A', variable: 'player', variableTypes: [''] },
        { type: 'field_variable_creator', name: 'B', variable: 'player', variableTypes: [''] },
      ],
      previousStatement: null, nextStatement: null,
      colour: OBJECTS_HUE, inputsInline: true,
      tooltip: 'Bounce an object off another (reverses velocity)',
    },

    // ════════ Follow & Clone ════════
    {
      type: 'game_follow',
      message0: '%1 follow %2 speed %3',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'field_variable_creator', name: 'TARGET', variable: 'player', variableTypes: [''] },
        { type: 'input_value', name: 'SPEED', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: MOTION_HUE, inputsInline: true,
      tooltip: 'Move an object toward a target at a given speed (call every frame)',
    },
    {
      type: 'game_clone',
      message0: 'clone of %1',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
      ],
      output: null, colour: OBJECTS_HUE,
      tooltip: 'Create a copy of an object',
    },
    {
      type: 'game_clone_do',
      message0: 'clone %1',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
      ],
      previousStatement: null, nextStatement: null,
      colour: OBJECTS_HUE,
      tooltip: 'Create a copy of an object without storing it',
    },
    {
      type: 'game_hide',
      message0: 'hide %1',
      args0: [{ type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] }],
      previousStatement: null, nextStatement: null,
      colour: LOOKS_HUE,
      tooltip: 'Make an object invisible',
    },
    {
      type: 'game_show',
      message0: 'show %1',
      args0: [{ type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] }],
      previousStatement: null, nextStatement: null,
      colour: LOOKS_HUE,
      tooltip: 'Make an object visible',
    },

    // ════════ Motion ════════
    {
      type: 'game_move',
      message0: 'move %1 by x: %2 y: %3',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
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
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
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
      args0: [{ type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] }],
      previousStatement: null, nextStatement: null,
      colour: MOTION_HUE, inputsInline: true,
      tooltip: 'Keep an object inside the game canvas',
    },
    {
      type: 'game_turn_right',
      message0: 'turn %1 %2 %3 degrees',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'field_image', src: TURN_RIGHT_SVG, width: 18, height: 18, alt: 'clockwise' },
        { type: 'input_value', name: 'DEG', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: MOTION_HUE, inputsInline: true,
      tooltip: 'Rotate an object clockwise by some degrees',
    },
    {
      type: 'game_turn_left',
      message0: 'turn %1 %2 %3 degrees',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'field_image', src: TURN_LEFT_SVG, width: 18, height: 18, alt: 'counterclockwise' },
        { type: 'input_value', name: 'DEG', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: MOTION_HUE, inputsInline: true,
      tooltip: 'Rotate an object counterclockwise by some degrees',
    },
    {
      type: 'game_x_position',
      message0: 'x position of %1',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
      ],
      output: 'Number', colour: MOTION_HUE, inputsInline: true,
      tooltip: 'Get the x position of an object',
    },
    {
      type: 'game_y_position',
      message0: 'y position of %1',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
      ],
      output: 'Number', colour: MOTION_HUE, inputsInline: true,
      tooltip: 'Get the y position of an object',
    },
    {
      type: 'game_rotation_of',
      message0: 'rotation of %1',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
      ],
      output: 'Number', colour: MOTION_HUE, inputsInline: true,
      tooltip: 'Get the rotation of an object in degrees',
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
      type: 'game_on_key',
      message0: 'if %1 key %2 %3 %4',
      args0: [
        { type: 'field_dropdown', name: 'KEY', options: KEY_OPTIONS },
        { type: 'field_dropdown', name: 'MODE', options: [
          ['pressed', 'pressed'], ['just pressed', 'just_pressed'], ['just released', 'just_released'],
        ]},
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      previousStatement: null, nextStatement: null,
      colour: SENSING_HUE,
      tooltip: 'Run code when a key is pressed, just pressed, or just released',
    },
    {
      type: 'game_on_mouse',
      message0: 'if mouse %1 %2 %3',
      args0: [
        { type: 'field_dropdown', name: 'MODE', options: [
          ['clicked', 'clicked'], ['released', 'released'], ['down', 'down'],
        ]},
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      previousStatement: null, nextStatement: null,
      colour: SENSING_HUE,
      tooltip: 'Run code on mouse click, release, or while held',
    },
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
    { type: 'game_width', message0: 'screen width', output: 'Number', colour: STAGE_HUE, tooltip: 'Canvas width (600)' },
    { type: 'game_height', message0: 'screen height', output: 'Number', colour: STAGE_HUE, tooltip: 'Canvas height (600)' },
    {
      type: 'game_show_grid',
      message0: 'show grid',
      previousStatement: null, nextStatement: null,
      colour: STAGE_HUE,
      tooltip: 'Show a placement grid on the game area',
    },
    {
      type: 'game_hide_grid',
      message0: 'hide grid',
      previousStatement: null, nextStatement: null,
      colour: STAGE_HUE,
      tooltip: 'Hide the placement grid on the game area',
    },

    // ════════ Mobile / Tilt ════════
    {
      type: 'game_show_controls',
      message0: 'show mobile controls %1',
      args0: [{ type: 'field_dropdown', name: 'LAYOUT', options: [
        ['D-pad + A B', 'dpad_ab'], ['D-pad only', 'dpad'], ['A B only', 'buttons'],
      ]}],
      previousStatement: null, nextStatement: null,
      colour: SENSING_HUE, inputsInline: true,
      tooltip: 'Show on-screen touch controls (D-pad and/or buttons)',
    },
    {
      type: 'game_hide_controls',
      message0: 'hide mobile controls',
      previousStatement: null, nextStatement: null,
      colour: SENSING_HUE,
      tooltip: 'Remove on-screen touch controls',
    },
    {
      type: 'game_on_dpad',
      message0: 'if D-pad %1 %2 %3 %4',
      args0: [
        { type: 'field_dropdown', name: 'DIR', options: [
          ['up', 'up'], ['down', 'down'], ['left', 'left'], ['right', 'right'],
        ]},
        { type: 'field_dropdown', name: 'MODE', options: [
          ['pressed', 'pressed'], ['just pressed', 'just_pressed'], ['just released', 'just_released'],
        ]},
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      previousStatement: null, nextStatement: null,
      colour: SENSING_HUE,
      tooltip: 'Run code when a D-pad direction is pressed',
    },
    {
      type: 'game_dpad_pressed',
      message0: 'D-pad %1 pressed?',
      args0: [{ type: 'field_dropdown', name: 'DIR', options: [
        ['up', 'up'], ['down', 'down'], ['left', 'left'], ['right', 'right'],
      ]}],
      output: 'Boolean', colour: SENSING_HUE,
      tooltip: 'True while a D-pad direction is held',
    },
    {
      type: 'game_on_button',
      message0: 'if button %1 %2 %3 %4',
      args0: [
        { type: 'field_dropdown', name: 'BTN', options: [['A', 'a'], ['B', 'b']] },
        { type: 'field_dropdown', name: 'MODE', options: [
          ['pressed', 'pressed'], ['just pressed', 'just_pressed'], ['just released', 'just_released'],
        ]},
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      previousStatement: null, nextStatement: null,
      colour: SENSING_HUE,
      tooltip: 'Run code when A or B button is pressed',
    },
    {
      type: 'game_button_pressed',
      message0: 'button %1 pressed?',
      args0: [{ type: 'field_dropdown', name: 'BTN', options: [['A', 'a'], ['B', 'b']] }],
      output: 'Boolean', colour: SENSING_HUE,
      tooltip: 'True while A or B button is held',
    },
    {
      type: 'game_request_tilt',
      message0: 'enable tilt sensor',
      previousStatement: null, nextStatement: null,
      colour: SENSING_HUE,
      tooltip: 'Request permission and enable accelerometer (needed on iOS)',
    },
    {
      type: 'game_tilt',
      message0: 'tilt %1',
      args0: [{ type: 'field_dropdown', name: 'AXIS', options: [
        ['x (left/right)', 'x'], ['y (forward/back)', 'y'], ['z (up/down)', 'z'],
      ]}],
      output: 'Number', colour: SENSING_HUE,
      tooltip: 'Read accelerometer tilt value on an axis',
    },

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

    {
      type: 'game_stop_sounds',
      message0: 'stop all sounds',
      previousStatement: null, nextStatement: null,
      colour: SOUND_HUE, inputsInline: true,
      tooltip: 'Stop all currently playing sounds',
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
      colour: STAGE_HUE, inputsInline: true,
      tooltip: 'Shake the screen',
    },
    {
      type: 'game_flash',
      message0: 'flash %1 for %2 ms',
      args0: [
        { type: 'field_colour', name: 'COLOR', colour: '#ffffff' },
        { type: 'input_value', name: 'DUR', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: STAGE_HUE, inputsInline: true,
      tooltip: 'Flash the screen with a color',
    },
    {
      type: 'game_transition',
      message0: 'transition %1 for %2 ms color %3',
      args0: [
        { type: 'field_dropdown', name: 'TYPE', options: [
          ['fade', 'fade'], ['wipe left', 'wipe_left'], ['wipe right', 'wipe_right'],
          ['wipe down', 'wipe_down'], ['wipe up', 'wipe_up'], ['circle', 'circle'],
          ['curtain', 'curtain'], ['diagonal', 'diagonal'], ['blinds', 'blinds'],
          ['pixelate', 'pixelate'], ['diamonds', 'diamonds'], ['squares', 'squares'],
        ]},
        { type: 'input_value', name: 'DUR', check: 'Number' },
        { type: 'field_colour', name: 'COLOR', colour: '#000000' },
      ],
      previousStatement: null, nextStatement: null,
      colour: STAGE_HUE, inputsInline: true,
      tooltip: 'Play a screen transition effect',
    },
    {
      type: 'game_define_scene',
      message0: 'define scene %1 %2 %3',
      args0: [
        { type: 'input_value', name: 'NAME', check: 'String' },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      previousStatement: null, nextStatement: null,
      colour: STAGE_HUE,
      tooltip: 'Register a scene — the blocks inside run when you switch to this scene',
    },
    {
      type: 'game_switch_scene',
      message0: 'switch to scene %1',
      args0: [
        { type: 'input_value', name: 'NAME', check: 'String' },
      ],
      previousStatement: null, nextStatement: null,
      colour: STAGE_HUE, inputsInline: true,
      tooltip: 'Switch to a registered scene (clears objects and runs setup)',
    },
    {
      type: 'game_switch_scene_transition',
      message0: 'switch to scene %1 with %2 for %3 ms color %4',
      args0: [
        { type: 'input_value', name: 'NAME', check: 'String' },
        { type: 'field_dropdown', name: 'TYPE', options: [
          ['fade', 'fade'], ['wipe left', 'wipe_left'], ['wipe right', 'wipe_right'],
          ['wipe down', 'wipe_down'], ['wipe up', 'wipe_up'], ['circle', 'circle'],
          ['curtain', 'curtain'], ['diagonal', 'diagonal'], ['blinds', 'blinds'],
          ['pixelate', 'pixelate'], ['diamonds', 'diamonds'], ['squares', 'squares'],
        ]},
        { type: 'input_value', name: 'DUR', check: 'Number' },
        { type: 'field_colour', name: 'COLOR', colour: '#000000' },
      ],
      previousStatement: null, nextStatement: null,
      colour: STAGE_HUE, inputsInline: true,
      tooltip: 'Switch to a scene with a transition effect (scene swaps at the midpoint)',
    },
    {
      type: 'game_get_scene',
      message0: 'current scene',
      output: 'String', colour: STAGE_HUE,
      tooltip: 'Get the name of the current scene',
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

    // ════════ Camera ════════
    {
      type: 'game_camera_follow',
      message0: 'camera follow %1 smoothing %2',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'input_value', name: 'SMOOTH', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: STAGE_HUE, inputsInline: true,
      tooltip: 'Smoothly scroll the camera to follow an object (call every frame)',
    },
    {
      type: 'game_camera_set',
      message0: 'set camera %1 to %2',
      args0: [
        { type: 'field_dropdown', name: 'AXIS', options: [['x', 'x'], ['y', 'y']] },
        { type: 'input_value', name: 'VAL', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: STAGE_HUE, inputsInline: true,
      tooltip: 'Set the camera position',
    },
    {
      type: 'game_camera_get',
      message0: 'camera %1',
      args0: [
        { type: 'field_dropdown', name: 'AXIS', options: [['x', 'x'], ['y', 'y']] },
      ],
      output: 'Number', colour: STAGE_HUE,
      tooltip: 'Get the current camera position',
    },

    // ════════ HUD ════════
    {
      type: 'hud_create_score',
      message0: 'set %1 to Score at x %2 y %3',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'score', variableTypes: [''] },
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: HUD_HUE, inputsInline: true,
      tooltip: 'Create a score display on screen',
    },
    // hud_create_lives is defined programmatically below (uses dynamic sprite picker for icon)
    {
      type: 'hud_create_healthbar',
      message0: 'set %1 to HealthBar at x %2 y %3',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'health', variableTypes: [''] },
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: HUD_HUE, inputsInline: true,
      tooltip: 'Create a health bar display',
    },
    {
      type: 'hud_create_timer',
      message0: 'set %1 to %2 timer at x %3 y %4 %5 seconds',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'timer', variableTypes: [''] },
        { type: 'field_dropdown', name: 'MODE', options: [
          ['count up', 'up'], ['countdown', 'down'],
        ]},
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
        { type: 'input_value', name: 'SECS', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: HUD_HUE, inputsInline: true,
      tooltip: 'Create a timer display (count up or countdown)',
    },
    {
      type: 'hud_message',
      message0: 'show message %1 for %2 seconds',
      args0: [
        { type: 'input_value', name: 'TEXT', check: 'String' },
        { type: 'input_value', name: 'DUR', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: HUD_HUE, inputsInline: true,
      tooltip: 'Show a centered message banner on screen',
    },
    {
      type: 'hud_score_add',
      message0: '%1 add %2',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'score', variableTypes: [''] },
        { type: 'input_value', name: 'AMOUNT', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: HUD_HUE, inputsInline: true,
      tooltip: 'Add points to the score (use negative to subtract)',
    },
    {
      type: 'hud_lives_change',
      message0: '%1 %2 %3',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'lives', variableTypes: [''] },
        { type: 'field_dropdown', name: 'ACTION', options: [
          ['lose', 'lose'], ['gain', 'gain'],
        ]},
        { type: 'input_value', name: 'AMOUNT', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: HUD_HUE, inputsInline: true,
      tooltip: 'Lose or gain lives',
    },
    {
      type: 'hud_health_change',
      message0: '%1 %2 %3',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'health', variableTypes: [''] },
        { type: 'field_dropdown', name: 'ACTION', options: [
          ['damage', 'damage'], ['heal', 'heal'],
        ]},
        { type: 'input_value', name: 'AMOUNT', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: HUD_HUE, inputsInline: true,
      tooltip: 'Apply damage or heal the health bar',
    },
    {
      type: 'hud_timer_action',
      message0: '%1 timer %2',
      args0: [
        { type: 'field_dropdown', name: 'ACTION', options: [
          ['start', 'start'], ['stop', 'stop'], ['reset', 'reset'],
        ]},
        { type: 'field_variable_creator', name: 'VAR', variable: 'timer', variableTypes: [''] },
      ],
      previousStatement: null, nextStatement: null,
      colour: HUD_HUE, inputsInline: true,
      tooltip: 'Start, stop, or reset a timer',
    },
    {
      type: 'hud_get_value',
      message0: '%1 value',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'score', variableTypes: [''] },
      ],
      output: 'Number', colour: HUD_HUE, inputsInline: true,
      tooltip: 'Get the current value of a HUD element (score, lives, health, or timer)',
    },
    {
      type: 'hud_set_value',
      message0: 'set %1 value to %2',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'score', variableTypes: [''] },
        { type: 'input_value', name: 'VALUE', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: HUD_HUE, inputsInline: true,
      tooltip: 'Set the value of a HUD element',
    },
    {
      type: 'hud_is_dead',
      message0: '%1 is dead?',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'health', variableTypes: [''] },
      ],
      output: 'Boolean', colour: HUD_HUE, inputsInline: true,
      tooltip: 'True when health or lives reaches zero',
    },
    {
      type: 'hud_timer_done',
      message0: 'timer %1 is done?',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'timer', variableTypes: [''] },
      ],
      output: 'Boolean', colour: HUD_HUE, inputsInline: true,
      tooltip: 'True when a countdown timer reaches zero',
    },

    // ════════ HUD Events ════════
    {
      type: 'hud_on_score_reach',
      message0: 'when %1 reaches %2 %3 %4',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'score', variableTypes: [''] },
        { type: 'input_value', name: 'VALUE', check: 'Number' },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: HUD_HUE, inputsInline: true,
      tooltip: 'Run code when the score reaches a specific value',
    },
    {
      type: 'hud_on_zero',
      message0: 'when %1 reaches zero %2 %3',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'lives', variableTypes: [''] },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: HUD_HUE,
      tooltip: 'Run code when lives or health reaches zero',
    },
    {
      type: 'hud_on_timer_done',
      message0: 'when %1 finishes %2 %3',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'countdown', variableTypes: [''] },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: HUD_HUE,
      tooltip: 'Run code when a countdown timer reaches zero',
    },
    {
      type: 'hud_on_value_change',
      message0: 'when %1 value changes %2 %3',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'score', variableTypes: [''] },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: HUD_HUE,
      tooltip: 'Run code every time a HUD component value changes',
    },

    // ════════ Tweening ════════
    {
      type: 'game_tween',
      message0: 'tween %1 of %2 to %3 over %4 ms easing %5',
      args0: [
        { type: 'field_dropdown', name: 'PROP', options: [
          ['x', 'x'], ['y', 'y'], ['opacity', 'opacity'],
          ['rotation', 'rotation'], ['width', 'width'], ['height', 'height'],
        ]},
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'input_value', name: 'TARGET', check: 'Number' },
        { type: 'input_value', name: 'DUR', check: 'Number' },
        { type: 'field_dropdown', name: 'EASING', options: [
          ['linear', 'linear'], ['ease in', 'ease_in'], ['ease out', 'ease_out'],
          ['ease in-out', 'ease_in_out'], ['bounce', 'bounce'],
        ]},
      ],
      previousStatement: null, nextStatement: null,
      colour: 45, inputsInline: true,
      tooltip: 'Smoothly animate a property over time',
    },
    {
      type: 'game_cancel_tweens',
      message0: 'cancel tweens on %1',
      args0: [{ type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] }],
      previousStatement: null, nextStatement: null,
      colour: 45, inputsInline: true,
      tooltip: 'Stop all active tweens on an object',
    },

    // ════════ Sprite Animation ════════
    {
      type: 'game_anim_play',
      message0: 'play animation %1 at %2 fps',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'input_value', name: 'FPS', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: 45, inputsInline: true,
      tooltip: 'Start sprite animation at given frames per second',
    },
    {
      type: 'game_anim_stop',
      message0: 'stop animation %1',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
      ],
      previousStatement: null, nextStatement: null,
      colour: 45, inputsInline: true,
      tooltip: 'Pause sprite animation on the current frame',
    },
    {
      type: 'game_anim_set_frame',
      message0: 'switch costume of %1 to %2',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'input_value', name: 'FRAME', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: 45, inputsInline: true,
      tooltip: 'Switch a sprite to a specific costume/frame (0-based)',
    },
    {
      type: 'game_resize_sprite',
      message0: 'resize %1 to %2 x',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'input_value', name: 'SCALE', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: LOOKS_HUE, inputsInline: true,
      tooltip: 'Resize a sprite. 1 is original size.',
    },
    {
      type: 'game_anim_frame',
      message0: 'frame of %1',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
      ],
      output: 'Number', colour: 45, inputsInline: true,
      tooltip: 'Current animation frame number',
    },
    {
      type: 'game_anim_frame_count',
      message0: 'frame count of %1',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
      ],
      output: 'Number', colour: 45, inputsInline: true,
      tooltip: 'Total number of animation frames',
    },
    {
      type: 'game_anim_is_animating',
      message0: '%1 is animating?',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
      ],
      output: 'Boolean', colour: 45, inputsInline: true,
      tooltip: 'True if sprite animation is currently playing',
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
      type: 'game_sqrt',
      message0: '√ %1',
      args0: [{ type: 'input_value', name: 'NUM', check: 'Number' }],
      output: 'Number', colour: 230, inputsInline: true,
      tooltip: 'Square root of a number',
    },
    {
      type: 'game_log',
      message0: 'log %1 base %2',
      args0: [
        { type: 'input_value', name: 'NUM', check: 'Number' },
        { type: 'field_dropdown', name: 'BASE', options: [
          ['e (ln)', 'e'], ['10', '10'], ['2', '2'],
        ]},
      ],
      output: 'Number', colour: 230, inputsInline: true,
      tooltip: 'Logarithm of a number',
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
    {
      type: 'game_to_number',
      message0: 'to number %1',
      args0: [{ type: 'input_value', name: 'VALUE', check: 'String' }],
      output: 'Number', colour: 160, inputsInline: true,
      tooltip: 'Convert text to a number',
    },
    {
      type: 'game_substring',
      message0: 'substring of %1 from %2 to %3',
      args0: [
        { type: 'input_value', name: 'TEXT', check: 'String' },
        { type: 'input_value', name: 'FROM', check: 'Number' },
        { type: 'input_value', name: 'TO', check: 'Number' },
      ],
      output: 'String', colour: 160, inputsInline: true,
      tooltip: 'Get part of a text (from index to index)',
    },
    {
      type: 'game_chr',
      message0: 'character from code %1',
      args0: [{ type: 'input_value', name: 'CODE', check: 'Number' }],
      output: 'String', colour: 160, inputsInline: true,
      tooltip: 'Get the character for a Unicode code (e.g. 65 → "A")',
    },
    {
      type: 'game_ord',
      message0: 'char code of %1',
      args0: [{ type: 'input_value', name: 'TEXT', check: 'String' }],
      output: 'Number', colour: 160, inputsInline: true,
      tooltip: 'Get the Unicode code of the first character (e.g. "A" → 65)',
    },
    {
      type: 'game_is_empty',
      message0: '%1 is empty?',
      args0: [{ type: 'input_value', name: 'TEXT', check: 'String' }],
      output: 'Boolean', colour: 160, inputsInline: true,
      tooltip: 'True if the text is empty (length 0)',
    },

    // ════════ Events (collision / click / timer) ════════
    {
      type: 'game_on_overlap',
      message0: 'when %1 overlaps %2 %3 %4',
      args0: [
        { type: 'field_variable_creator', name: 'A', variable: 'player', variableTypes: [''] },
        { type: 'field_variable_creator', name: 'B', variable: 'enemy', variableTypes: [''] },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: EVENTS_HUE,
      tooltip: 'Run code once when two objects start overlapping (event)',
    },
    {
      type: 'game_on_click_obj',
      message0: 'when %1 clicked %2 %3',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: EVENTS_HUE,
      tooltip: 'Run code when an object is clicked or tapped (event)',
    },
    {
      type: 'game_on_hover_obj',
      message0: 'when %1 hovered %2 %3',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: EVENTS_HUE,
      tooltip: 'Run code when the mouse hovers over an object (event)',
    },
    {
      type: 'game_on_clone',
      message0: 'when %1 cloned as %2 %3 %4',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'field_variable_creator', name: 'CLONE', variable: 'clone', variableTypes: [''] },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: EVENTS_HUE,
      tooltip: 'Run code when an object is cloned (event)',
    },
    {
      type: 'game_on_array_item_where',
      message0: 'when any %1 in %2 where %3 %4 %5',
      args0: [
        { type: 'field_variable_creator', name: 'ITEM', variable: 'item', variableTypes: [''] },
        { type: 'field_variable', name: 'VAR', variable: 'list' },
        { type: 'input_value', name: 'COND', check: 'Boolean' },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: EVENTS_HUE,
      tooltip: 'Run code once when an item in a list starts matching a condition',
    },
    {
      type: 'game_wait',
      message0: 'wait %1 ms',
      args0: [
        { type: 'input_value', name: 'MS', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: EVENTS_HUE, inputsInline: true,
      tooltip: 'Pause the current script for some milliseconds',
    },
    {
      type: 'game_after',
      message0: 'after %1 ms as %2 %3 %4',
      args0: [
        { type: 'input_value', name: 'MS', check: 'Number' },
        { type: 'field_variable_creator', name: 'TIMER', variable: 'timer1', variableTypes: [''] },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: EVENTS_HUE, inputsInline: true,
      tooltip: 'Run code once after a delay – use the timer name with "cancel timer"',
    },
    {
      type: 'game_every',
      message0: 'every %1 ms as %2 %3 %4',
      args0: [
        { type: 'input_value', name: 'MS', check: 'Number' },
        { type: 'field_variable_creator', name: 'TIMER', variable: 'timer1', variableTypes: [''] },
        { type: 'input_dummy' },
        { type: 'input_statement', name: 'DO' },
      ],
      colour: EVENTS_HUE, inputsInline: true,
      tooltip: 'Run code repeatedly at an interval – use the timer name with "cancel timer"',
    },
    {
      type: 'game_cancel_timer',
      message0: 'cancel timer %1',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'timer1', variableTypes: [''] },
      ],
      previousStatement: null, nextStatement: null,
      colour: EVENTS_HUE, inputsInline: true,
      tooltip: 'Cancel a running after/every timer by its ID',
    },

    // ════════ Game Control ════════
    {
      type: 'game_stop',
      message0: 'stop game',
      previousStatement: null, nextStatement: null,
      colour: EVENTS_HUE,
      tooltip: 'Stop the game (game over)',
    },
    {
      type: 'game_restart',
      message0: 'restart game',
      previousStatement: null, nextStatement: null,
      colour: EVENTS_HUE,
      tooltip: 'Restart the game from the beginning',
    },
    {
      type: 'game_print',
      message0: 'print %1',
      args0: [
        { type: 'input_value', name: 'TEXT' },
      ],
      previousStatement: null, nextStatement: null,
      colour: EVENTS_HUE, inputsInline: true,
      tooltip: 'Print a value to the console (for debugging)',
    },
    {
      type: 'game_remove_all',
      message0: 'remove all objects',
      previousStatement: null, nextStatement: null,
      colour: 160,
      tooltip: 'Remove every object from the game',
    },

    // ════════ Groups ════════
    {
      type: 'game_create_group',
      message0: 'set %1 to new Group',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'enemies', variableTypes: [''] },
      ],
      previousStatement: null, nextStatement: null,
      colour: OBJECTS_HUE,
      tooltip: 'Create a new group to manage multiple objects together',
    },
    {
      type: 'game_group_add',
      message0: 'add %1 to %2',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'field_variable_creator', name: 'GROUP', variable: 'enemies', variableTypes: [''] },
      ],
      previousStatement: null, nextStatement: null,
      colour: OBJECTS_HUE, inputsInline: true,
      tooltip: 'Add an object to a group',
    },
    {
      type: 'game_group_remove',
      message0: 'remove %1 from %2',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'field_variable_creator', name: 'GROUP', variable: 'enemies', variableTypes: [''] },
      ],
      previousStatement: null, nextStatement: null,
      colour: OBJECTS_HUE, inputsInline: true,
      tooltip: 'Remove an object from a group',
    },
    {
      type: 'game_group_count',
      message0: 'count of %1',
      args0: [
        { type: 'field_variable_creator', name: 'GROUP', variable: 'enemies', variableTypes: [''] },
      ],
      output: 'Number', colour: OBJECTS_HUE,
      tooltip: 'Number of objects in a group',
    },
    {
      type: 'game_group_any_touch',
      message0: 'any in %1 touching %2 ?',
      args0: [
        { type: 'field_variable_creator', name: 'GROUP', variable: 'enemies', variableTypes: [''] },
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
      ],
      output: 'Boolean', colour: OBJECTS_HUE, inputsInline: true,
      tooltip: 'True if any object in the group is overlapping the target',
    },
    {
      type: 'game_group_remove_all',
      message0: 'remove all from %1',
      args0: [
        { type: 'field_variable_creator', name: 'GROUP', variable: 'enemies', variableTypes: [''] },
      ],
      previousStatement: null, nextStatement: null,
      colour: OBJECTS_HUE,
      tooltip: 'Remove all objects in the group from the game',
    },

    // ════════ TileMap ════════
    {
      type: 'game_create_tilemap',
      message0: 'set %1 to TileMap %2 cols %3 rows tile size %4',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'tilemap', variableTypes: [''] },
        { type: 'input_value', name: 'COLS', check: 'Number' },
        { type: 'input_value', name: 'ROWS', check: 'Number' },
        { type: 'input_value', name: 'SIZE', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: STAGE_HUE, inputsInline: true,
      tooltip: 'Create a tile map grid',
    },
    {
      type: 'game_set_tile',
      message0: 'in %1 set tile col %2 row %3 to type %4',
      args0: [
        { type: 'field_variable_creator', name: 'TM', variable: 'tilemap', variableTypes: [''] },
        { type: 'input_value', name: 'COL', check: 'Number' },
        { type: 'input_value', name: 'ROW', check: 'Number' },
        { type: 'input_value', name: 'TYPE', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: STAGE_HUE, inputsInline: true,
      tooltip: 'Set a single tile in the map',
    },
    {
      type: 'game_get_tile',
      message0: 'in %1 tile at col %2 row %3',
      args0: [
        { type: 'field_variable_creator', name: 'TM', variable: 'tilemap', variableTypes: [''] },
        { type: 'input_value', name: 'COL', check: 'Number' },
        { type: 'input_value', name: 'ROW', check: 'Number' },
      ],
      output: 'Number', colour: STAGE_HUE, inputsInline: true,
      tooltip: 'Get the tile type at a grid position',
    },
    {
      type: 'game_set_tile_palette',
      message0: 'in %1 tile type %2 color %3 solid %4',
      args0: [
        { type: 'field_variable_creator', name: 'TM', variable: 'tilemap', variableTypes: [''] },
        { type: 'input_value', name: 'TYPE', check: 'Number' },
        { type: 'field_colour', name: 'COLOR', colour: '#8b4513' },
        { type: 'field_dropdown', name: 'SOLID', options: [['yes', 'True'], ['no', 'False']] },
      ],
      previousStatement: null, nextStatement: null,
      colour: STAGE_HUE, inputsInline: true,
      tooltip: 'Define how a tile type looks and if it is solid',
    },
    {
      type: 'game_tile_at_pixel',
      message0: 'in %1 tile at pixel x %2 y %3',
      args0: [
        { type: 'field_variable_creator', name: 'TM', variable: 'tilemap', variableTypes: [''] },
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
      ],
      output: 'Number', colour: STAGE_HUE, inputsInline: true,
      tooltip: 'Get the tile type at a pixel position in the world',
    },
    {
      type: 'game_overlaps_solid',
      message0: '%1 overlaps solid tile in %2 ?',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'field_variable_creator', name: 'TM', variable: 'tilemap', variableTypes: [''] },
      ],
      output: 'Boolean', colour: STAGE_HUE, inputsInline: true,
      tooltip: 'True if an object is overlapping a solid tile',
    },
    {
      type: 'game_tilemap_push_out',
      message0: 'push %1 out of solid tiles in %2',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'field_variable_creator', name: 'TM', variable: 'tilemap', variableTypes: [''] },
      ],
      previousStatement: null, nextStatement: null,
      colour: STAGE_HUE, inputsInline: true,
      tooltip: 'Push an object out of solid tiles (for platformer collision)',
    },
    {
      type: 'game_set_tile_data',
      message0: 'in %1 set grid data from %2',
      args0: [
        { type: 'field_variable_creator', name: 'TM', variable: 'tilemap', variableTypes: [''] },
        { type: 'field_variable_creator', name: 'DATA', variable: 'level_data', variableTypes: [''] },
      ],
      previousStatement: null, nextStatement: null,
      colour: STAGE_HUE, inputsInline: true,
      tooltip: 'Set the entire tile grid from a 2D list of tile types',
    },

    // ════════ Color Detection ════════
    {
      type: 'game_color_at',
      message0: 'color at x %1 y %2',
      args0: [
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
      ],
      output: 'String', colour: SENSING_HUE, inputsInline: true,
      tooltip: 'Get the hex color at a screen position (e.g. "#ff0000")',
    },
    // game_touching_color is defined imperatively below (uses FieldEyedropper)

    // ════════ Button ════════
    {
      type: 'game_create_button',
      message0: 'set %1 to Button %2 color %3 x: %4 y: %5',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'btn', variableTypes: [''] },
        { type: 'field_input', name: 'TEXT', text: 'Play' },
        { type: 'field_colour', name: 'COLOR', colour: '#FF6B35' },
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: OBJECTS_HUE, inputsInline: true,
      tooltip: 'Create a clickable button',
    },

    // ════════ Emitter ════════
    {
      type: 'game_create_emitter',
      message0: 'set %1 to emitter %2 at x: %3 y: %4',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'emitter', variableTypes: [''] },
        { type: 'field_dropdown', name: 'PRESET', options: [
          ['fire', 'fire'], ['smoke', 'smoke'], ['sparkle', 'sparkle'],
          ['snow', 'snow'], ['bubbles', 'bubbles'], ['trail', 'trail'],
        ]},
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: LOOKS_HUE, inputsInline: true,
      tooltip: 'Create a continuous particle emitter',
    },
    {
      type: 'game_emitter_toggle',
      message0: '%1 emitter %2',
      args0: [
        { type: 'field_dropdown', name: 'STATE', options: [['turn on', 'on'], ['turn off', 'off']] },
        { type: 'field_variable_creator', name: 'VAR', variable: 'emitter', variableTypes: [''] },
      ],
      previousStatement: null, nextStatement: null,
      colour: LOOKS_HUE, inputsInline: true,
      tooltip: 'Enable or disable a particle emitter',
    },
    {
      type: 'game_move_emitter',
      message0: 'move emitter %1 to x: %2 y: %3',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'emitter', variableTypes: [''] },
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: LOOKS_HUE, inputsInline: true,
      tooltip: 'Move a particle emitter to a new position',
    },
    {
      type: 'game_remove_emitter',
      message0: 'remove emitter %1',
      args0: [
        { type: 'field_variable_creator', name: 'VAR', variable: 'emitter', variableTypes: [''] },
      ],
      previousStatement: null, nextStatement: null,
      colour: LOOKS_HUE,
      tooltip: 'Remove a particle emitter',
    },

    // ════════ Line ════════
    {
      type: 'game_create_line',
      message0: 'Line from %1 %2 to %3 %4 color %5 width %6',
      args0: [
        { type: 'input_value', name: 'X1', check: 'Number' },
        { type: 'input_value', name: 'Y1', check: 'Number' },
        { type: 'input_value', name: 'X2', check: 'Number' },
        { type: 'input_value', name: 'Y2', check: 'Number' },
        { type: 'field_colour', name: 'COLOR', colour: '#ffffff' },
        { type: 'input_value', name: 'WIDTH', check: 'Number' },
      ],
      output: null, colour: OBJECTS_HUE, inputsInline: true,
      tooltip: 'Create a line between two points',
    },

    // ════════ Object misc ════════
    {
      type: 'game_set_fixed',
      message0: 'pin %1 to screen %2',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'field_dropdown', name: 'FIXED', options: [['yes', 'True'], ['no', 'False']] },
      ],
      previousStatement: null, nextStatement: null,
      colour: LOOKS_HUE, inputsInline: true,
      tooltip: 'Pin object to screen (not affected by camera)',
    },
    {
      type: 'game_set_layer',
      message0: 'set layer of %1 to %2',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
        { type: 'input_value', name: 'LAYER', check: 'Number' },
      ],
      previousStatement: null, nextStatement: null,
      colour: LOOKS_HUE, inputsInline: true,
      tooltip: 'Set draw order (higher = drawn on top)',
    },
    {
      type: 'game_is_out',
      message0: '%1 is off screen?',
      args0: [
        { type: 'field_variable_creator', name: 'OBJ', variable: 'player', variableTypes: [''] },
      ],
      output: 'Boolean', colour: SENSING_HUE,
      tooltip: 'True if the object is completely outside the screen',
    },
    {
      type: 'game_hit_test',
      message0: 'object at x %1 y %2',
      args0: [
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
      ],
      output: null, colour: SENSING_HUE, inputsInline: true,
      tooltip: 'Get the topmost object at a screen position',
    },

    // ════════ Math helpers ════════
    {
      type: 'game_lerp',
      message0: 'lerp %1 to %2 by %3',
      args0: [
        { type: 'input_value', name: 'A', check: 'Number' },
        { type: 'input_value', name: 'B', check: 'Number' },
        { type: 'input_value', name: 'T', check: 'Number' },
      ],
      output: 'Number', colour: 230, inputsInline: true,
      tooltip: 'Linear interpolation between two values (t = 0 to 1)',
    },
    {
      type: 'game_clamp',
      message0: 'clamp %1 min %2 max %3',
      args0: [
        { type: 'input_value', name: 'VAL', check: 'Number' },
        { type: 'input_value', name: 'MIN', check: 'Number' },
        { type: 'input_value', name: 'MAX', check: 'Number' },
      ],
      output: 'Number', colour: 230, inputsInline: true,
      tooltip: 'Constrain a value between min and max',
    },
    {
      type: 'game_random_float',
      message0: 'random float from %1 to %2',
      args0: [
        { type: 'input_value', name: 'MIN', check: 'Number' },
        { type: 'input_value', name: 'MAX', check: 'Number' },
      ],
      output: 'Number', colour: 230, inputsInline: true,
      tooltip: 'Random decimal number between min and max',
    },
    {
      type: 'game_random_color',
      message0: 'random color',
      output: 'String', colour: 230,
      tooltip: 'Generate a random hex color (e.g. "#a3f04c")',
    },
    {
      type: 'game_choice',
      message0: 'random item from %1',
      args0: [{ type: 'input_value', name: 'LIST' }],
      output: null, colour: 230, inputsInline: true,
      tooltip: 'Pick a random item from a list',
    },
    {
      type: 'game_physics_toggle',
      message0: '%1 physics',
      args0: [
        { type: 'field_dropdown', name: 'STATE', options: [['enable', 'True'], ['disable', 'False']] },
      ],
      previousStatement: null, nextStatement: null,
      colour: OBJECTS_HUE,
      tooltip: 'Enable or disable the physics system (velocity, acceleration, friction)',
    },
    {
      type: 'game_frame_count',
      message0: 'frame count',
      output: 'Number', colour: SENSING_HUE,
      tooltip: 'Number of frames since the game started',
    },
  ]);

  const ADD_SOUND_ID = '__add_sound__';

  class FieldSoundPicker extends Blockly.FieldDropdown {
    constructor() {
      super(function () {
        const ws = this.getSourceBlock()?.workspace;
        const names = ws?._getSoundNames?.() || [];
        const opts = names.length > 0
          ? names.map(n => [n, n])
          : [['(no sounds)', '__none__']];
        opts.push(['\u2795 Add sound\u2026', ADD_SOUND_ID]);
        return opts;
      });
    }

    onItemSelected_(menu, menuItem) {
      const id = menuItem?.getValue();
      if (id === ADD_SOUND_ID) {
        const ws = this.sourceBlock_?.workspace;
        ws?._onAddSound?.((name) => {
          if (name) this.setValue(name);
        });
        return;
      }
      super.onItemSelected_(menu, menuItem);
    }

    static fromJson() {
      return new FieldSoundPicker();
    }
  }

  Blockly.fieldRegistry.register('field_sound_picker', FieldSoundPicker);

  const ADD_SPRITE_ID = '__add_sprite__';

  function getSpriteNamesForWorkspace(workspace, fallbackName = 'player') {
    const names = workspace?._getSpriteNames?.() || [];
    const targetNames = workspace?.targetWorkspace?._getSpriteNames?.() || [];
    const merged = [...new Set([...names, ...targetNames])];
    return merged.length > 0 ? merged : [fallbackName];
  }

  class FieldSpritePicker extends Blockly.FieldDropdown {
    constructor(defaultVal) {
      super(function () {
        const ws = this.getSourceBlock()?.workspace;
        const names = getSpriteNamesForWorkspace(ws, this.defaultVal_ || 'player');
        const opts = names.map(n => [n, n]);
        opts.push(['\u2795 Add sprite\u2026', ADD_SPRITE_ID]);
        return opts;
      });
      this.defaultVal_ = defaultVal || 'player';
    }

    getFallbackValue_() {
      const ws = this.getSourceBlock()?.workspace || this.sourceBlock_?.workspace;
      return getSpriteNamesForWorkspace(ws, this.defaultVal_)[0] || this.defaultVal_;
    }

    doClassValidation_(newValue) {
      const normalized = newValue === '__none__' ? this.getFallbackValue_() : newValue;
      return super.doClassValidation_(normalized);
    }

    loadState(state) {
      const normalized = !state || state === '__none__' ? this.getFallbackValue_() : state;
      return super.loadState(normalized);
    }

    onItemSelected_(menu, menuItem) {
      const id = menuItem?.getValue();
      if (id === ADD_SPRITE_ID) {
        const ws = this.sourceBlock_?.workspace;
        ws?._onAddSprite?.((name) => {
          if (name) this.setValue(name);
        });
        return;
      }
      super.onItemSelected_(menu, menuItem);
    }

    static fromJson(options) {
      return new FieldSpritePicker(options?.default);
    }
  }

  Blockly.fieldRegistry.register('field_sprite_picker', FieldSpritePicker);

  function resolveSpriteName(block, fieldName) {
    const names = getSpriteNamesForWorkspace(block.workspace);
    const current = block.getFieldValue(fieldName);
    if (current && current !== '__none__' && names.includes(current)) return current;
    const fallback = names[0] || null;
    if (fallback) {
      block.getField(fieldName)?.setValue(fallback);
    }
    return fallback;
  }

  const ADD_BG_ID = '__add_bg__';

  class FieldBackgroundPicker extends Blockly.FieldDropdown {
    constructor() {
      super(function () {
        const ws = this.getSourceBlock()?.workspace;
        const names = ws?._getBackgroundNames?.() || [];
        const opts = names.length > 0
          ? names.map(n => [n, n])
          : [['(no images)', '__none__']];
        opts.push(['\u2795 Add image\u2026', ADD_BG_ID]);
        return opts;
      });
    }

    onItemSelected_(menu, menuItem) {
      const id = menuItem?.getValue();
      if (id === ADD_BG_ID) {
        const ws = this.sourceBlock_?.workspace;
        ws?._onAddBackground?.((name) => {
          if (name) this.setValue(name);
        });
        return;
      }
      super.onItemSelected_(menu, menuItem);
    }

    static fromJson() {
      return new FieldBackgroundPicker();
    }
  }

  Blockly.fieldRegistry.register('field_background_picker', FieldBackgroundPicker);

  class FieldEyedropper extends Blockly.Field {
    constructor(colour) {
      super(colour || '#ff0000');
      this.SERIALIZABLE = true;
      this.CURSOR = 'pointer';
      this.size_ = new Blockly.utils.Size(28, 16);
      this.dropdownDiv_ = null;
    }
    static fromJson(options) {
      return new FieldEyedropper(options?.colour);
    }
    initView() {
      this.createBorderRect_();
      this.borderRect_.setAttribute('rx', 4);
      this.borderRect_.setAttribute('ry', 4);
      this.borderRect_.setAttribute('width', 28);
      this.borderRect_.setAttribute('height', 16);
      this.borderRect_.style.fill = this.getValue();
      this.borderRect_.style.stroke = '#fff';
      this.borderRect_.style.strokeWidth = '0.5';
      this.borderRect_.style.cursor = 'pointer';
    }
    updateSize_() {
      this.size_ = new Blockly.utils.Size(28, 16);
    }
    render_() {
      super.render_();
      if (this.borderRect_) {
        this.borderRect_.style.fill = this.getValue();
      }
    }
    getText() {
      return this.getValue() || '#ff0000';
    }

    /* ── HSB ↔ RGB helpers ── */
    hexToHsb_(hex) {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      let h = 0;
      if (d) {
        if (max === r) h = ((g - b) / d + 6) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = Math.round(h * 60);
      }
      const s = max ? Math.round((d / max) * 100) : 0;
      const v = Math.round(max * 100);
      return { h, s, v };
    }
    hsbToHex_(h, s, v) {
      s /= 100; v /= 100;
      const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
      let r = 0, g = 0, b = 0;
      if (h < 60) { r = c; g = x; }
      else if (h < 120) { r = x; g = c; }
      else if (h < 180) { g = c; b = x; }
      else if (h < 240) { g = x; b = c; }
      else if (h < 300) { r = x; b = c; }
      else { r = c; b = x; }
      const toHex = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
      return '#' + toHex(r) + toHex(g) + toHex(b);
    }

    /* ── Build a slider row ── */
    buildSlider_(label, min, max, value, gradientFn) {
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:14px;';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
      const lbl = document.createElement('span');
      lbl.style.cssText = 'font-weight:600;font-size:13px;color:#ccc;';
      lbl.textContent = label;
      const valSpan = document.createElement('span');
      valSpan.style.cssText = 'font-size:13px;color:#aaa;min-width:28px;text-align:right;';
      valSpan.textContent = value;
      header.appendChild(lbl);
      header.appendChild(valSpan);

      const track = document.createElement('div');
      track.style.cssText = 'position:relative;height:22px;border-radius:11px;cursor:pointer;';
      track.style.background = gradientFn(value);

      const thumb = document.createElement('div');
      thumb.style.cssText = 'position:absolute;top:50%;width:20px;height:20px;border-radius:50%;'
        + 'background:#fff;border:2px solid #888;box-shadow:0 1px 4px rgba(0,0,0,0.4);'
        + 'transform:translate(-50%,-50%);cursor:grab;';
      thumb.style.left = ((value - min) / (max - min) * 100) + '%';
      track.appendChild(thumb);

      row.appendChild(header);
      row.appendChild(track);

      const update = (val) => {
        const clamped = Math.max(min, Math.min(max, Math.round(val)));
        valSpan.textContent = clamped;
        thumb.style.left = ((clamped - min) / (max - min) * 100) + '%';
        return clamped;
      };

      const onDrag = (e) => {
        const rect = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const val = update(min + ratio * (max - min));
        if (row.onChange) row.onChange(val);
      };
      track.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        onDrag(e);
        const onMove = (ev) => onDrag(ev);
        const onUp = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });

      row.update = update;
      row.setGradient = (g) => { track.style.background = g; };
      return row;
    }

    /* ── Main editor dropdown ── */
    showEditor_() {
      if (this.dropdownDiv_) { this.closeEditor_(); return; }

      const hsb = this.hexToHsb_(this.getValue() || '#ff0000');

      const panel = document.createElement('div');
      panel.style.cssText = 'background:#1e1e2e;border-radius:12px;padding:16px 18px 12px;'
        + 'width:220px;box-shadow:0 8px 32px rgba(0,0,0,0.6);font-family:system-ui,sans-serif;'
        + 'border:1px solid #333;';

      const preview = document.createElement('div');
      preview.style.cssText = 'width:100%;height:36px;border-radius:8px;margin-bottom:14px;'
        + 'border:2px solid #444;';
      preview.style.background = this.getValue();
      panel.appendChild(preview);

      const hueGrad = () => 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)';
      const satGrad = (h, v) => 'linear-gradient(to right,' + this.hsbToHex_(h, 0, v) + ',' + this.hsbToHex_(h, 100, v) + ')';
      const briGrad = (h, s) => 'linear-gradient(to right,#000,' + this.hsbToHex_(h, s, 100) + ')';

      const hueRow = this.buildSlider_('Color', 0, 360, hsb.h, hueGrad);
      const satRow = this.buildSlider_('Saturation', 0, 100, hsb.s, () => satGrad(hsb.h, hsb.v));
      const briRow = this.buildSlider_('Brightness', 0, 100, hsb.v, () => briGrad(hsb.h, hsb.s));

      const applyColor = () => {
        const hex = this.hsbToHex_(hsb.h, hsb.s, hsb.v);
        preview.style.background = hex;
        satRow.setGradient(satGrad(hsb.h, hsb.v));
        briRow.setGradient(briGrad(hsb.h, hsb.s));
        this.setValue(hex);
      };

      hueRow.onChange = (v) => { hsb.h = v; applyColor(); };
      satRow.onChange = (v) => { hsb.s = v; applyColor(); };
      briRow.onChange = (v) => { hsb.v = v; applyColor(); };

      panel.appendChild(hueRow);
      panel.appendChild(satRow);
      panel.appendChild(briRow);

      const eyedropBtn = document.createElement('button');
      eyedropBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:6px;'
        + 'width:100%;padding:8px 0;background:#2a2a3e;border:1px solid #444;border-radius:8px;'
        + 'color:#ccc;font-size:13px;cursor:pointer;margin-top:4px;';
      eyedropBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
        + '<path d="M2 22l1-1h3l9-9"/><path d="M3 21v-3l9-9"/>'
        + '<path d="M14.5 3.5a2.12 2.12 0 0 1 3 3L12 12l-4 1 1-4z"/></svg>'
        + '<span>Pick from canvas</span>';
      eyedropBtn.addEventListener('mouseenter', () => { eyedropBtn.style.background = '#353550'; });
      eyedropBtn.addEventListener('mouseleave', () => { eyedropBtn.style.background = '#2a2a3e'; });
      eyedropBtn.addEventListener('click', () => {
        this.closeEditor_();
        this.startEyedropper_(hsb);
      });
      panel.appendChild(eyedropBtn);

      const srcBlock = this.getSourceBlock();
      const blockSvg = srcBlock?.getSvgRoot();
      if (blockSvg) {
        const blockRect = blockSvg.getBoundingClientRect();
        panel.style.position = 'fixed';
        panel.style.zIndex = '100000';
        panel.style.left = blockRect.left + 'px';
        panel.style.top = (blockRect.bottom + 6) + 'px';
      } else {
        panel.style.position = 'fixed';
        panel.style.zIndex = '100000';
        panel.style.left = '100px';
        panel.style.top = '100px';
      }

      document.body.appendChild(panel);
      this.dropdownDiv_ = panel;

      const outsideClick = (e) => {
        if (!panel.contains(e.target)) {
          this.closeEditor_();
          document.removeEventListener('pointerdown', outsideClick, true);
        }
      };
      setTimeout(() => document.addEventListener('pointerdown', outsideClick, true), 0);
      this.outsideClickHandler_ = outsideClick;
    }

    closeEditor_() {
      if (this.dropdownDiv_) {
        this.dropdownDiv_.remove();
        this.dropdownDiv_ = null;
      }
      if (this.outsideClickHandler_) {
        document.removeEventListener('pointerdown', this.outsideClickHandler_, true);
        this.outsideClickHandler_ = null;
      }
    }

    /* ── Eyedropper mode ── */
    startEyedropper_() {
      const canvas = document.querySelector('.gml-canvas');
      if (!canvas) return;

      const snap = document.createElement('canvas');
      snap.width = canvas.width;
      snap.height = canvas.height;
      snap.getContext('2d').drawImage(canvas, 0, 0);
      const snapCtx = snap.getContext('2d');

      const overlay = document.createElement('div');
      Object.assign(overlay.style, {
        position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
        zIndex: '100000', cursor: 'crosshair', background: 'rgba(0,0,0,0.01)',
      });

      const loupe = document.createElement('div');
      Object.assign(loupe.style, {
        position: 'fixed', width: '60px', height: '60px', borderRadius: '50%',
        border: '3px solid #fff', boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
        pointerEvents: 'none', display: 'none', zIndex: '100001',
      });
      const dot = document.createElement('div');
      Object.assign(dot.style, {
        position: 'absolute', top: '50%', left: '50%', width: '10px', height: '10px',
        marginTop: '-5px', marginLeft: '-5px', border: '1.5px solid #000',
        borderRadius: '50%', pointerEvents: 'none',
      });
      loupe.appendChild(dot);
      document.body.appendChild(overlay);
      document.body.appendChild(loupe);

      const rect = canvas.getBoundingClientRect();

      const sampleColor = (clientX, clientY) => {
        const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
        const cx = Math.floor((clientX - rect.left) * sx);
        const cy = Math.floor((clientY - rect.top) * sy);
        if (cx >= 0 && cy >= 0 && cx < snap.width && cy < snap.height) {
          const p = snapCtx.getImageData(cx, cy, 1, 1).data;
          return '#' + ((1 << 24) + (p[0] << 16) + (p[1] << 8) + p[2]).toString(16).slice(1);
        }
        return null;
      };
      const lum = (hex) => {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return 0.299 * r + 0.587 * g + 0.114 * b;
      };

      const onMove = (e) => {
        loupe.style.display = 'block';
        loupe.style.left = (e.clientX + 20) + 'px';
        loupe.style.top = (e.clientY - 70) + 'px';
        const c = sampleColor(e.clientX, e.clientY);
        if (c) {
          loupe.style.backgroundColor = c;
          dot.style.borderColor = lum(c) > 0.5 ? '#000' : '#fff';
        }
      };
      const onClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const c = sampleColor(e.clientX, e.clientY);
        if (c) this.setValue(c);
        cleanup();
      };
      const onKey = (e) => { if (e.key === 'Escape') cleanup(); };
      const cleanup = () => {
        overlay.removeEventListener('pointermove', onMove);
        overlay.removeEventListener('pointerdown', onClick);
        document.removeEventListener('keydown', onKey);
        overlay.remove(); loupe.remove();
      };
      overlay.addEventListener('pointermove', onMove);
      overlay.addEventListener('pointerdown', onClick);
      document.addEventListener('keydown', onKey);
    }
  }

  Blockly.fieldRegistry.register('field_eyedropper', FieldEyedropper);

  Blockly.Blocks['game_touching_color'] = {
    init() {
      this.appendDummyInput()
        .appendField(new FieldVariableCreator('player', null, [''], ''), 'OBJ')
        .appendField('touching color')
        .appendField(new FieldEyedropper('#ff0000'), 'COLOR')
        .appendField('?');
      this.setOutput(true, 'Boolean');
      this.setColour(SENSING_HUE);
      this.setInputsInline(true);
      this.setTooltip('True if the object is touching a specific color on screen – click the swatch to eyedrop from the game canvas');
    },
  };

  Blockly.Blocks['game_set_bg_image'] = {
    init() {
      this.appendDummyInput()
        .appendField('change backdrop to')
        .appendField(new FieldBackgroundPicker(), 'IMAGE');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(STAGE_HUE);
      this.setTooltip('Change the backdrop image from the sprite panel');
    },
  };

  Blockly.Blocks['game_create_sprite'] = {
    init() {
      this.appendDummyInput()
        .appendField('Sprite')
        .appendField(new FieldSpritePicker('player'), 'NAME');
      this.appendValueInput('X').setCheck('Number').appendField('x:');
      this.appendValueInput('Y').setCheck('Number').appendField('y:');
      this.appendValueInput('SCALE').setCheck('Number').appendField('scale:');
      this.setInputsInline(true);
      this.setOutput(true);
      this.setColour(OBJECTS_HUE);
      this.setTooltip('Create a sprite from the gallery or custom sprites');
    },
  };

  Blockly.Blocks['hud_create_lives'] = {
    init() {
      this.appendDummyInput()
        .appendField('set')
        .appendField(new FieldVariableCreator('lives'), 'VAR')
        .appendField('to Lives icon')
        .appendField(new Blockly.FieldDropdown(function() {
          var ws = this.getSourceBlock()?.workspace;
          var names = ws?._getSpriteNames?.() || [];
          var opts = [['\u2764 hearts', '__hearts__']];
          for (var i = 0; i < names.length; i++) opts.push([names[i], names[i]]);
          return opts;
        }), 'ICON');
      this.appendValueInput('X').setCheck('Number').appendField('x:');
      this.appendValueInput('Y').setCheck('Number').appendField('y:');
      this.appendValueInput('MAX').setCheck('Number').appendField('max:');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(HUD_HUE);
      this.setTooltip('Create a lives display with hearts or custom sprite icons');
    },
  };

  Blockly.Blocks['game_play_custom_sound'] = {
    init() {
      this.appendDummyInput()
        .appendField('play sound')
        .appendField(new FieldSoundPicker(), 'SOUND');
      this.appendValueInput('VOL').setCheck('Number').appendField('volume');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(SOUND_HUE);
      this.setTooltip('Play a custom sound from the Sounds panel');
    },
  };

  // ═══════════════════ Python code generators ═══════════════════

  pythonGenerator.forBlock['game_on_start'] = function(block, gen) {
    const code = gen.statementToCode(block, 'DO');
    if (!code) return '';
    const indent = gen.INDENT;
    return code.replace(new RegExp('^' + indent, 'gm'), '');
  };

  pythonGenerator.forBlock['game_every_frame'] = function(block, gen) {
    const code = gen.statementToCode(block, 'DO');
    const vars = (Blockly.Variables.allUsedVarModels(block.workspace) || [])
      .map((v) => v?.getName?.() || v?.name || '')
      .filter((name) => typeof name === 'string' && name.trim())
      .map((name) => gen.getVariableName(name))
      .filter(Boolean);
    const uniqueVars = [...new Set(vars)];
    const globalLine = uniqueVars.length > 0 ? gen.INDENT + 'global ' + uniqueVars.join(', ') + '\n' : '';
    return '\ndef update():\n' + globalLine + (code || gen.INDENT + 'pass\n') + '\ngame.on_update(update)\n';
  };

  pythonGenerator.forBlock['game_title'] = function(block) {
    return 'game.title("' + block.getFieldValue('TITLE') + '")\n';
  };
  pythonGenerator.forBlock['game_background'] = function(block) {
    return 'game.background("' + block.getFieldValue('COLOR') + '")\n';
  };
  pythonGenerator.forBlock['game_set_bg_image'] = function(block) {
    const img = block.getFieldValue('IMAGE');
    if (img === '__none__') return '';
    return 'game.set_background_image("' + img + '")\n';
  };
  pythonGenerator.forBlock['game_clear_bg_image'] = function() {
    return 'game.clear_background_image()\n';
  };
  pythonGenerator.forBlock['game_resize_sprite'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const scale = gen.valueToCode(block, 'SCALE', Order.NONE) || '1';
    return 'if ' + obj + ' is not None:\n' + gen.INDENT + 'game.resize_sprite(' + obj + ', ' + scale + ')\n';
  };

  pythonGenerator.forBlock['game_create_point'] = function(block, gen) {
    const x = gen.valueToCode(block, 'X', Order.NONE) || '0';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '0';
    return ['game.Point(' + x + ', ' + y + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_create_rect'] = function(block, gen) {
    const x = gen.valueToCode(block, 'X', Order.NONE) || '0';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '0';
    const w = gen.valueToCode(block, 'W', Order.NONE) || '30';
    const h = gen.valueToCode(block, 'H', Order.NONE) || '30';
    const c = block.getFieldValue('COLOR') || '#00ffff';
    return ['game.Rect(' + x + ', ' + y + ', ' + w + ', ' + h + ', "' + c + '")', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_create_circle'] = function(block, gen) {
    const x = gen.valueToCode(block, 'X', Order.NONE) || '0';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '0';
    const r = gen.valueToCode(block, 'R', Order.NONE) || '15';
    const c = block.getFieldValue('COLOR') || '#ffd700';
    return ['game.Circle(' + x + ', ' + y + ', ' + r + ', "' + c + '")', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_create_text'] = function(block, gen) {
    const t = block.getFieldValue('TEXT') || 'Hello!';
    const x = gen.valueToCode(block, 'X', Order.NONE) || '0';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '0';
    const c = block.getFieldValue('COLOR') || '#ffffff';
    const s = gen.valueToCode(block, 'SIZE', Order.NONE) || '20';
    return ['game.Text("' + t + '", ' + x + ', ' + y + ', "' + c + '", ' + s + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_create_sprite'] = function(block, gen) {
    const n = resolveSpriteName(block, 'NAME');
    if (!n) return ['None', Order.NONE];
    const x = gen.valueToCode(block, 'X', Order.NONE) || '0';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '0';
    const s = gen.valueToCode(block, 'SCALE', Order.NONE) || '4';
    return ['game.Sprite("' + n + '", ' + x + ', ' + y + ', ' + s + ')', Order.FUNCTION_CALL];
  };

  pythonGenerator.forBlock['game_move'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const dx = gen.valueToCode(block, 'DX', Order.NONE) || '0';
    const dy = gen.valueToCode(block, 'DY', Order.NONE) || '0';
    return 'if ' + obj + ' is not None:\n' + gen.INDENT + obj + '.move(' + dx + ', -(' + dy + '))\n';
  };
  pythonGenerator.forBlock['game_move_to'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const x = gen.valueToCode(block, 'X', Order.NONE) || '0';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '0';
    return 'if ' + obj + ' is not None:\n' + gen.INDENT + obj + '.move_to(' + x + ', ' + y + ')\n';
  };
  pythonGenerator.forBlock['game_keep_inside'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    return 'if ' + obj + ' is not None:\n' + gen.INDENT + obj + '.keep_inside()\n';
  };
  pythonGenerator.forBlock['game_turn_right'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const deg = gen.valueToCode(block, 'DEG', Order.NONE) || '15';
    return 'if ' + obj + ' is not None:\n' + gen.INDENT + obj + '.rotation += ' + deg + '\n';
  };
  pythonGenerator.forBlock['game_turn_left'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const deg = gen.valueToCode(block, 'DEG', Order.NONE) || '15';
    return 'if ' + obj + ' is not None:\n' + gen.INDENT + obj + '.rotation -= ' + deg + '\n';
  };
  pythonGenerator.forBlock['game_x_position'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    return ['(' + obj + '.x if ' + obj + ' is not None else 0)', Order.MEMBER];
  };
  pythonGenerator.forBlock['game_y_position'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    return ['(' + obj + '.y if ' + obj + ' is not None else 0)', Order.MEMBER];
  };
  pythonGenerator.forBlock['game_rotation_of'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    return ['(' + obj + '.rotation if ' + obj + ' is not None else 0)', Order.MEMBER];
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
  pythonGenerator.forBlock['game_set_velocity'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const vx = gen.valueToCode(block, 'VX', Order.NONE) || '0';
    const vy = gen.valueToCode(block, 'VY', Order.NONE) || '0';
    return obj + '.vx = ' + vx + '\n' + obj + '.vy = -(' + vy + ')\n';
  };
  pythonGenerator.forBlock['game_set_acceleration'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const ax = gen.valueToCode(block, 'AX', Order.NONE) || '0';
    const ay = gen.valueToCode(block, 'AY', Order.NONE) || '0';
    return obj + '.ax = ' + ax + '\n' + obj + '.ay = -(' + ay + ')\n';
  };
  pythonGenerator.forBlock['game_set_bounce'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const val = gen.valueToCode(block, 'VAL', Order.NONE) || '1';
    return obj + '.bounce = ' + val + '\n';
  };
  pythonGenerator.forBlock['game_set_friction'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const val = gen.valueToCode(block, 'VAL', Order.NONE) || '0.98';
    return obj + '.friction = ' + val + '\n';
  };
  pythonGenerator.forBlock['game_push_out'] = function(block, gen) {
    const a = gen.getVariableName(block.getFieldValue('A'));
    const b = gen.getVariableName(block.getFieldValue('B'));
    return 'game.push_out(' + a + ', ' + b + ')\n';
  };
  pythonGenerator.forBlock['game_bounce_off'] = function(block, gen) {
    const a = gen.getVariableName(block.getFieldValue('A'));
    const b = gen.getVariableName(block.getFieldValue('B'));
    return 'game.bounce_off(' + a + ', ' + b + ')\n';
  };
  pythonGenerator.forBlock['game_follow'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const target = gen.getVariableName(block.getFieldValue('TARGET'));
    const speed = gen.valueToCode(block, 'SPEED', Order.NONE) || '3';
    return 'game.follow(' + obj + ', ' + target + ', ' + speed + ')\n';
  };
  pythonGenerator.forBlock['game_clone'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    return ['(' + obj + '.clone() if ' + obj + ' is not None else None)', Order.NONE];
  };
  pythonGenerator.forBlock['game_clone_do'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    return 'if ' + obj + ' is not None:\n' + gen.INDENT + obj + '.clone()\n';
  };
  pythonGenerator.forBlock['game_hide'] = function(block, gen) {
    return gen.getVariableName(block.getFieldValue('OBJ')) + '.hide()\n';
  };
  pythonGenerator.forBlock['game_show'] = function(block, gen) {
    return gen.getVariableName(block.getFieldValue('OBJ')) + '.show()\n';
  };

  const KEY_MODE_MAP = {
    pressed: 'key_pressed', just_pressed: 'key_just_pressed', just_released: 'key_just_released',
  };
  pythonGenerator.forBlock['game_on_key'] = function(block, gen) {
    const key = block.getFieldValue('KEY');
    const fn = KEY_MODE_MAP[block.getFieldValue('MODE')];
    const body = gen.statementToCode(block, 'DO') || gen.INDENT + 'pass\n';
    return 'if game.' + fn + '("' + key + '"):\n' + body;
  };

  const MOUSE_MODE_MAP = {
    clicked: 'mouse_clicked', released: 'mouse_released', down: 'mouse_down',
  };
  pythonGenerator.forBlock['game_on_mouse'] = function(block, gen) {
    const fn = MOUSE_MODE_MAP[block.getFieldValue('MODE')];
    const body = gen.statementToCode(block, 'DO') || gen.INDENT + 'pass\n';
    return 'if game.' + fn + '():\n' + body;
  };
  pythonGenerator.forBlock['game_on_dpad'] = function(block, gen) {
    const dir = block.getFieldValue('DIR');
    const fn = KEY_MODE_MAP[block.getFieldValue('MODE')];
    const body = gen.statementToCode(block, 'DO') || gen.INDENT + 'pass\n';
    return 'if game.' + fn + '("' + dir + '"):\n' + body;
  };
  pythonGenerator.forBlock['game_dpad_pressed'] = function(block) {
    return ['game.key_pressed("' + block.getFieldValue('DIR') + '")', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_on_button'] = function(block, gen) {
    const btn = block.getFieldValue('BTN');
    const fn = KEY_MODE_MAP[block.getFieldValue('MODE')];
    const body = gen.statementToCode(block, 'DO') || gen.INDENT + 'pass\n';
    return 'if game.' + fn + '("' + btn + '"):\n' + body;
  };
  pythonGenerator.forBlock['game_button_pressed'] = function(block) {
    return ['game.key_pressed("' + block.getFieldValue('BTN') + '")', Order.FUNCTION_CALL];
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
  pythonGenerator.forBlock['game_show_grid'] = function() {
    return 'game.show_grid(True)\n';
  };
  pythonGenerator.forBlock['game_hide_grid'] = function() {
    return 'game.show_grid(False)\n';
  };

  pythonGenerator.forBlock['game_show_controls'] = function(block) {
    return 'game.show_controls("' + block.getFieldValue('LAYOUT') + '")\n';
  };
  pythonGenerator.forBlock['game_hide_controls'] = function() {
    return 'game.hide_controls()\n';
  };
  pythonGenerator.forBlock['game_request_tilt'] = function() {
    return 'game.request_tilt()\n';
  };
  pythonGenerator.forBlock['game_tilt'] = function(block) {
    return ['game.tilt_' + block.getFieldValue('AXIS') + '()', Order.FUNCTION_CALL];
  };

  pythonGenerator.forBlock['game_sound'] = function(block, gen) {
    const freq = gen.valueToCode(block, 'FREQ', Order.NONE) || '440';
    const dur = gen.valueToCode(block, 'DUR', Order.NONE) || '200';
    return 'game.sound(' + freq + ', ' + dur + ')\n';
  };
  pythonGenerator.forBlock['game_note'] = function(block, gen) {
    const dur = gen.valueToCode(block, 'DUR', Order.NONE) || '300';
    return 'game.note("' + block.getFieldValue('NOTE') + '", ' + dur + ')\n';
  };

  pythonGenerator.forBlock['game_play_custom_sound'] = function(block, gen) {
    const snd = block.getFieldValue('SOUND');
    if (snd === '__none__') return '';
    const vol = gen.valueToCode(block, 'VOL', Order.NONE) || '1';
    return 'game.play_sound("' + snd + '", ' + vol + ')\n';
  };
  pythonGenerator.forBlock['game_stop_sounds'] = function() {
    return 'game.stop_sounds()\n';
  };

  pythonGenerator.forBlock['game_shake'] = function(block, gen) {
    const i = gen.valueToCode(block, 'INTENSITY', Order.NONE) || '5';
    const d = gen.valueToCode(block, 'DUR', Order.NONE) || '300';
    return 'game.shake(' + i + ', ' + d + ')\n';
  };
  pythonGenerator.forBlock['game_flash'] = function(block, gen) {
    const color = block.getFieldValue('COLOR') || '#ffffff';
    const dur = gen.valueToCode(block, 'DUR', Order.NONE) || '200';
    return 'game.flash("' + color + '", ' + dur + ')\n';
  };
  pythonGenerator.forBlock['game_transition'] = function(block, gen) {
    const type = block.getFieldValue('TYPE');
    const dur = gen.valueToCode(block, 'DUR', Order.NONE) || '500';
    const color = block.getFieldValue('COLOR') || '#000000';
    return 'game.transition("' + type + '", ' + dur + ', "' + color + '")\n';
  };
  pythonGenerator.forBlock['game_define_scene'] = function(block, gen) {
    const name = gen.valueToCode(block, 'NAME', Order.NONE) || '"scene1"';
    const body = gen.statementToCode(block, 'DO') || gen.INDENT + 'pass\n';
    const fnName = 'setup_scene_' + name.replace(/[^a-zA-Z0-9]/g, '_');
    return 'def ' + fnName + '():\n' + body + 'game.on_scene(' + name + ', ' + fnName + ')\n';
  };
  pythonGenerator.forBlock['game_switch_scene'] = function(block, gen) {
    const name = gen.valueToCode(block, 'NAME', Order.NONE) || '"scene1"';
    return 'game.scene(' + name + ')\n';
  };
  pythonGenerator.forBlock['game_switch_scene_transition'] = function(block, gen) {
    const name = gen.valueToCode(block, 'NAME', Order.NONE) || '"scene1"';
    const type = block.getFieldValue('TYPE');
    const dur = gen.valueToCode(block, 'DUR', Order.NONE) || '500';
    const color = block.getFieldValue('COLOR') || '#000000';
    return 'game.scene_transition(' + name + ', "' + type + '", ' + dur + ', "' + color + '")\n';
  };
  pythonGenerator.forBlock['game_get_scene'] = function() {
    return ['game.get_scene()', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_preset'] = function(block, gen) {
    const p = block.getFieldValue('PRESET');
    const x = gen.valueToCode(block, 'X', Order.NONE) || '300';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '300';
    return 'game.preset("' + p + '", ' + x + ', ' + y + ')\n';
  };

  pythonGenerator.forBlock['game_camera_follow'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const smooth = gen.valueToCode(block, 'SMOOTH', Order.NONE) || '0.1';
    return 'game.camera_follow(' + obj + ', ' + smooth + ')\n';
  };
  pythonGenerator.forBlock['game_camera_set'] = function(block, gen) {
    const axis = block.getFieldValue('AXIS');
    const val = gen.valueToCode(block, 'VAL', Order.NONE) || '0';
    return 'game.camera_' + axis + '(' + val + ')\n';
  };
  pythonGenerator.forBlock['game_camera_get'] = function(block) {
    return ['game.camera_' + block.getFieldValue('AXIS') + '()', Order.FUNCTION_CALL];
  };

  // ────── HUD generators ──────
  pythonGenerator.forBlock['hud_create_score'] = function(block, gen) {
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    const x = gen.valueToCode(block, 'X', Order.NONE) || '10';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '10';
    return v + ' = game.Score(' + x + ', ' + y + ')\n';
  };
  pythonGenerator.forBlock['hud_create_lives'] = function(block, gen) {
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    const x = gen.valueToCode(block, 'X', Order.NONE) || '10';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '40';
    const max = gen.valueToCode(block, 'MAX', Order.NONE) || '3';
    const icon = block.getFieldValue('ICON');
    if (icon && icon !== '__hearts__') {
      return v + ' = game.Lives(' + x + ', ' + y + ', ' + max + ', None, None, "' + icon + '")\n';
    }
    return v + ' = game.Lives(' + x + ', ' + y + ', ' + max + ')\n';
  };
  pythonGenerator.forBlock['hud_create_healthbar'] = function(block, gen) {
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    const x = gen.valueToCode(block, 'X', Order.NONE) || '10';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '70';
    return v + ' = game.HealthBar(' + x + ', ' + y + ')\n';
  };
  pythonGenerator.forBlock['hud_create_timer'] = function(block, gen) {
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    const mode = block.getFieldValue('MODE');
    const x = gen.valueToCode(block, 'X', Order.NONE) || '500';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '10';
    if (mode === 'down') {
      const secs = gen.valueToCode(block, 'SECS', Order.NONE) || '60';
      return v + ' = game.Timer(' + x + ', ' + y + ', ' + secs + ', True)\n';
    }
    return v + ' = game.Timer(' + x + ', ' + y + ')\n';
  };
  pythonGenerator.forBlock['hud_message'] = function(block, gen) {
    const text = gen.valueToCode(block, 'TEXT', Order.NONE) || '"Hello!"';
    const dur = gen.valueToCode(block, 'DUR', Order.NONE) || '2';
    return 'game.Message(' + text + ', ' + dur + ' * 1000)\n';
  };
  pythonGenerator.forBlock['hud_score_add'] = function(block, gen) {
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    const amount = gen.valueToCode(block, 'AMOUNT', Order.NONE) || '1';
    return v + '.add(' + amount + ')\n';
  };
  pythonGenerator.forBlock['hud_lives_change'] = function(block, gen) {
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    const action = block.getFieldValue('ACTION');
    const amount = gen.valueToCode(block, 'AMOUNT', Order.NONE) || '1';
    return v + '.' + action + '(' + amount + ')\n';
  };
  pythonGenerator.forBlock['hud_health_change'] = function(block, gen) {
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    const action = block.getFieldValue('ACTION');
    const amount = gen.valueToCode(block, 'AMOUNT', Order.NONE) || '10';
    return v + '.' + action + '(' + amount + ')\n';
  };
  pythonGenerator.forBlock['hud_timer_action'] = function(block, gen) {
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    const action = block.getFieldValue('ACTION');
    return v + '.' + action + '()\n';
  };
  pythonGenerator.forBlock['hud_get_value'] = function(block, gen) {
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    return [v + '.value', Order.MEMBER];
  };
  pythonGenerator.forBlock['hud_set_value'] = function(block, gen) {
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    const val = gen.valueToCode(block, 'VALUE', Order.NONE) || '0';
    return v + '.value = ' + val + '\n';
  };
  pythonGenerator.forBlock['hud_is_dead'] = function(block, gen) {
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    return [v + '.is_dead()', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['hud_timer_done'] = function(block, gen) {
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    return [v + '.is_done()', Order.FUNCTION_CALL];
  };

  // ────── HUD Event generators ──────
  function _addIndent(code, indent) {
    return code.split('\n').map(function(l) { return l.trim() ? indent + l : l; }).join('\n');
  }
  pythonGenerator.forBlock['hud_on_score_reach'] = function(block, gen) {
    const I = gen.INDENT;
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    const val = gen.valueToCode(block, 'VALUE', Order.NONE) || '100';
    const body = gen.statementToCode(block, 'DO') || I + 'pass\n';
    const flag = '_reached_' + v;
    const fn = '_watch_' + v + '_reach';
    return flag + ' = False\n' +
      'def ' + fn + '():\n' +
      I + 'global ' + flag + '\n' +
      I + 'if not ' + flag + ' and ' + v + '.value >= ' + val + ':\n' +
      I + I + flag + ' = True\n' +
      _addIndent(body, I) +
      'game.on_update(' + fn + ')\n';
  };
  pythonGenerator.forBlock['hud_on_zero'] = function(block, gen) {
    const I = gen.INDENT;
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    const body = gen.statementToCode(block, 'DO') || I + 'pass\n';
    const flag = '_zero_' + v;
    const fn = '_watch_' + v + '_zero';
    return flag + ' = False\n' +
      'def ' + fn + '():\n' +
      I + 'global ' + flag + '\n' +
      I + 'if not ' + flag + ' and ' + v + '.is_dead():\n' +
      I + I + flag + ' = True\n' +
      _addIndent(body, I) +
      'game.on_update(' + fn + ')\n';
  };
  pythonGenerator.forBlock['hud_on_timer_done'] = function(block, gen) {
    const I = gen.INDENT;
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    const body = gen.statementToCode(block, 'DO') || I + 'pass\n';
    const flag = '_done_' + v;
    const fn = '_watch_' + v + '_done';
    return flag + ' = False\n' +
      'def ' + fn + '():\n' +
      I + 'global ' + flag + '\n' +
      I + 'if not ' + flag + ' and ' + v + '.is_done():\n' +
      I + I + flag + ' = True\n' +
      _addIndent(body, I) +
      'game.on_update(' + fn + ')\n';
  };
  pythonGenerator.forBlock['hud_on_value_change'] = function(block, gen) {
    const I = gen.INDENT;
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    const body = gen.statementToCode(block, 'DO') || I + 'pass\n';
    const prev = '_prev_' + v;
    const fn = '_watch_' + v + '_change';
    return prev + ' = None\n' +
      'def ' + fn + '():\n' +
      I + 'global ' + prev + '\n' +
      I + '_cur = ' + v + '.value\n' +
      I + 'if ' + prev + ' is None:\n' +
      I + I + prev + ' = _cur\n' +
      I + 'if _cur != ' + prev + ':\n' +
      I + I + prev + ' = _cur\n' +
      _addIndent(body, I) +
      'game.on_update(' + fn + ')\n';
  };

  pythonGenerator.forBlock['game_tween'] = function(block, gen) {
    const prop = block.getFieldValue('PROP');
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const target = gen.valueToCode(block, 'TARGET', Order.NONE) || '0';
    const dur = gen.valueToCode(block, 'DUR', Order.NONE) || '500';
    const easing = block.getFieldValue('EASING');
    return 'game.tween(' + obj + ', "' + prop + '", ' + target + ', ' + dur + ', "' + easing + '")\n';
  };
  pythonGenerator.forBlock['game_cancel_tweens'] = function(block, gen) {
    return 'game.cancel_tweens(' + gen.getVariableName(block.getFieldValue('OBJ')) + ')\n';
  };

  pythonGenerator.forBlock['game_anim_play'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const fps = gen.valueToCode(block, 'FPS', Order.NONE) || '8';
    return obj + '.play(' + fps + ')\n';
  };
  pythonGenerator.forBlock['game_anim_stop'] = function(block, gen) {
    return gen.getVariableName(block.getFieldValue('OBJ')) + '.stop()\n';
  };
  pythonGenerator.forBlock['game_anim_set_frame'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const frame = gen.valueToCode(block, 'FRAME', Order.NONE) || '0';
    return obj + '.set_frame(' + frame + ')\n';
  };
  pythonGenerator.forBlock['game_anim_frame'] = function(block, gen) {
    return [gen.getVariableName(block.getFieldValue('OBJ')) + '.frame', Order.MEMBER];
  };
  pythonGenerator.forBlock['game_anim_frame_count'] = function(block, gen) {
    return [gen.getVariableName(block.getFieldValue('OBJ')) + '.frame_count', Order.MEMBER];
  };
  pythonGenerator.forBlock['game_anim_is_animating'] = function(block, gen) {
    return [gen.getVariableName(block.getFieldValue('OBJ')) + '.animating', Order.MEMBER];
  };

  pythonGenerator.forBlock['game_random_int'] = function(block, gen) {
    const mn = gen.valueToCode(block, 'MIN', Order.NONE) || '0';
    const mx = gen.valueToCode(block, 'MAX', Order.NONE) || '100';
    return ['game.random_int(' + mn + ', ' + mx + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_log'] = function(block, gen) {
    const num = gen.valueToCode(block, 'NUM', Order.NONE) || '1';
    const base = block.getFieldValue('BASE');
    if (base === 'e') return ['math.log(' + num + ')', Order.FUNCTION_CALL];
    return ['math.log(' + num + ', ' + base + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_sqrt'] = function(block, gen) {
    const num = gen.valueToCode(block, 'NUM', Order.NONE) || '0';
    return ['math.sqrt(' + num + ')', Order.FUNCTION_CALL];
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
  pythonGenerator.forBlock['game_to_number'] = function(block, gen) {
    const val = gen.valueToCode(block, 'VALUE', Order.NONE) || '""';
    return ['float(' + val + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_substring'] = function(block, gen) {
    const text = gen.valueToCode(block, 'TEXT', Order.MEMBER) || '""';
    const from = gen.valueToCode(block, 'FROM', Order.NONE) || '0';
    const to = gen.valueToCode(block, 'TO', Order.NONE) || '1';
    return [text + '[int(' + from + '):int(' + to + ')]', Order.MEMBER];
  };
  pythonGenerator.forBlock['game_chr'] = function(block, gen) {
    const code = gen.valueToCode(block, 'CODE', Order.NONE) || '65';
    return ['chr(int(' + code + '))', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_ord'] = function(block, gen) {
    const text = gen.valueToCode(block, 'TEXT', Order.NONE) || '"A"';
    return ['ord(' + text + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_is_empty'] = function(block, gen) {
    const text = gen.valueToCode(block, 'TEXT', Order.NONE) || '""';
    return ['len(' + text + ') == 0', Order.RELATIONAL];
  };

  // ────── Events (collision / click / timer) generators ──────
  pythonGenerator.forBlock['game_on_overlap'] = function(block, gen) {
    const a = gen.getVariableName(block.getFieldValue('A'));
    const b = gen.getVariableName(block.getFieldValue('B'));
    const body = gen.statementToCode(block, 'DO') || gen.INDENT + 'pass\n';
    return 'def _on_overlap_' + a + '_' + b + '(' + a + ', ' + b + '):\n' + body +
           'game.on_overlap(' + a + ', ' + b + ', _on_overlap_' + a + '_' + b + ')\n';
  };
  pythonGenerator.forBlock['game_on_click_obj'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const body = gen.statementToCode(block, 'DO') || gen.INDENT + 'pass\n';
    return 'def _on_click_' + obj + '(' + obj + ', _x, _y):\n' + body +
           obj + '.on_click(_on_click_' + obj + ')\n';
  };
  pythonGenerator.forBlock['game_on_hover_obj'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const body = gen.statementToCode(block, 'DO') || gen.INDENT + 'pass\n';
    return 'def _on_hover_' + obj + '(' + obj + ', _x, _y):\n' + body +
           obj + '.on_hover(_on_hover_' + obj + ')\n';
  };
  pythonGenerator.forBlock['game_on_clone'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const clone = gen.getVariableName(block.getFieldValue('CLONE'));
    const body = gen.statementToCode(block, 'DO') || gen.INDENT + 'pass\n';
    return 'def _on_clone_' + obj + '(' + obj + ', ' + clone + '):\n' + body +
           'if ' + obj + ' is not None:\n' + gen.INDENT + 'game.on_clone(' + obj + ', _on_clone_' + obj + ')\n';
  };
  pythonGenerator.forBlock['game_on_array_item_where'] = function(block, gen) {
    const listVar = getArrayVarName(block, gen);
    const item = gen.getVariableName(block.getFieldValue('ITEM'));
    const cond = gen.valueToCode(block, 'COND', Order.NONE) || 'False';
    const safeId = makeSafeIdentifier(block.id, 'array_where');
    const fn = '_on_array_where_' + safeId;
    const activeVar = '_array_where_active_' + safeId;
    const nextVar = '_array_where_next_' + safeId;
    const indexVar = '_array_where_idx_' + safeId;
    const body = gen.statementToCode(block, 'DO') || gen.INDENT + 'pass\n';
    const indentedBody = indentCode(body, 3, gen.INDENT);
    return activeVar + ' = []\n' +
      'def ' + fn + '():\n' +
      gen.INDENT + 'global ' + activeVar + '\n' +
      gen.INDENT + nextVar + ' = []\n' +
      gen.INDENT + 'for ' + indexVar + ', ' + item + ' in enumerate(' + listVar + '):\n' +
      gen.INDENT.repeat(2) + 'if ' + cond + ':\n' +
      gen.INDENT.repeat(3) + nextVar + '.append(' + indexVar + ')\n' +
      gen.INDENT.repeat(3) + 'if ' + indexVar + ' not in ' + activeVar + ':\n' +
      indentedBody +
      gen.INDENT + activeVar + ' = ' + nextVar + '\n' +
      'game.on_update(' + fn + ')\n';
  };
  pythonGenerator.forBlock['game_after'] = function(block, gen) {
    const timer = gen.getVariableName(block.getFieldValue('TIMER'));
    const ms = gen.valueToCode(block, 'MS', Order.NONE) || '1000';
    const body = gen.statementToCode(block, 'DO') || gen.INDENT + 'pass\n';
    const fn = '_after_' + timer;
    return 'def ' + fn + '():\n' + body + timer + ' = game.after(' + ms + ', ' + fn + ')\n';
  };
  pythonGenerator.forBlock['game_wait'] = function(block, gen) {
    const ms = gen.valueToCode(block, 'MS', Order.NONE) || '1000';
    return 'game.wait(' + ms + ')\n';
  };
  pythonGenerator.forBlock['game_every'] = function(block, gen) {
    const timer = gen.getVariableName(block.getFieldValue('TIMER'));
    const ms = gen.valueToCode(block, 'MS', Order.NONE) || '1000';
    const body = gen.statementToCode(block, 'DO') || gen.INDENT + 'pass\n';
    const fn = '_every_' + timer;
    return 'def ' + fn + '():\n' + body + timer + ' = game.every(' + ms + ', ' + fn + ')\n';
  };
  pythonGenerator.forBlock['game_cancel_timer'] = function(block, gen) {
    return 'game.cancel_timer(' + gen.getVariableName(block.getFieldValue('VAR')) + ')\n';
  };
  pythonGenerator.forBlock['game_stop'] = function() {
    return 'game.stop()\n';
  };
  pythonGenerator.forBlock['game_restart'] = function() {
    return 'game.restart()\n';
  };
  pythonGenerator.forBlock['game_print'] = function(block, gen) {
    const text = gen.valueToCode(block, 'TEXT', Order.NONE) || '""';
    return 'print(' + text + ')\n';
  };
  pythonGenerator.forBlock['game_remove_all'] = function() {
    return 'game.remove_all()\n';
  };

  // ────── Group generators ──────
  pythonGenerator.forBlock['game_create_group'] = function(block, gen) {
    return gen.getVariableName(block.getFieldValue('VAR')) + ' = game.Group()\n';
  };
  pythonGenerator.forBlock['game_group_add'] = function(block, gen) {
    const grp = gen.getVariableName(block.getFieldValue('GROUP'));
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    return grp + '.add(' + obj + ')\n';
  };
  pythonGenerator.forBlock['game_group_remove'] = function(block, gen) {
    const grp = gen.getVariableName(block.getFieldValue('GROUP'));
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    return grp + '.remove(' + obj + ')\n';
  };
  pythonGenerator.forBlock['game_group_count'] = function(block, gen) {
    return [gen.getVariableName(block.getFieldValue('GROUP')) + '.count()', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_group_any_touch'] = function(block, gen) {
    const grp = gen.getVariableName(block.getFieldValue('GROUP'));
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    return [grp + '.any_touch(' + obj + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_group_remove_all'] = function(block, gen) {
    return gen.getVariableName(block.getFieldValue('GROUP')) + '.remove_all()\n';
  };

  // ────── TileMap generators ──────
  pythonGenerator.forBlock['game_create_tilemap'] = function(block, gen) {
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    const cols = gen.valueToCode(block, 'COLS', Order.NONE) || '20';
    const rows = gen.valueToCode(block, 'ROWS', Order.NONE) || '15';
    const size = gen.valueToCode(block, 'SIZE', Order.NONE) || '32';
    return v + ' = game.TileMap(' + cols + ', ' + rows + ', ' + size + ')\n';
  };
  pythonGenerator.forBlock['game_set_tile'] = function(block, gen) {
    const tm = gen.getVariableName(block.getFieldValue('TM'));
    const col = gen.valueToCode(block, 'COL', Order.NONE) || '0';
    const row = gen.valueToCode(block, 'ROW', Order.NONE) || '0';
    const type = gen.valueToCode(block, 'TYPE', Order.NONE) || '1';
    return tm + '.set_tile(' + col + ', ' + row + ', ' + type + ')\n';
  };
  pythonGenerator.forBlock['game_get_tile'] = function(block, gen) {
    const tm = gen.getVariableName(block.getFieldValue('TM'));
    const col = gen.valueToCode(block, 'COL', Order.NONE) || '0';
    const row = gen.valueToCode(block, 'ROW', Order.NONE) || '0';
    return [tm + '.get_tile(' + col + ', ' + row + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_set_tile_palette'] = function(block, gen) {
    const tm = gen.getVariableName(block.getFieldValue('TM'));
    const type = gen.valueToCode(block, 'TYPE', Order.NONE) || '1';
    const color = block.getFieldValue('COLOR') || '#8b4513';
    const solid = block.getFieldValue('SOLID');
    return tm + '.set_palette(' + type + ', "' + color + '", ' + solid + ')\n';
  };
  pythonGenerator.forBlock['game_tile_at_pixel'] = function(block, gen) {
    const tm = gen.getVariableName(block.getFieldValue('TM'));
    const x = gen.valueToCode(block, 'X', Order.NONE) || '0';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '0';
    return [tm + '.tile_at_pixel(' + x + ', ' + y + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_overlaps_solid'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const tm = gen.getVariableName(block.getFieldValue('TM'));
    return [tm + '.overlaps_solid(' + obj + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_tilemap_push_out'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const tm = gen.getVariableName(block.getFieldValue('TM'));
    return tm + '.push_out(' + obj + ')\n';
  };
  pythonGenerator.forBlock['game_set_tile_data'] = function(block, gen) {
    const tm = gen.getVariableName(block.getFieldValue('TM'));
    const data = gen.getVariableName(block.getFieldValue('DATA'));
    return tm + '.set_data(' + data + ')\n';
  };

  // ────── Color detection generators ──────
  pythonGenerator.forBlock['game_color_at'] = function(block, gen) {
    const x = gen.valueToCode(block, 'X', Order.NONE) || '0';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '0';
    return ['game.color_at(' + x + ', ' + y + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_touching_color'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const color = block.getFieldValue('COLOR') || '#ff0000';
    return ['game.touching_color(' + obj + ', "' + color + '")', Order.FUNCTION_CALL];
  };

  // ────── Button generator ──────
  pythonGenerator.forBlock['game_create_button'] = function(block, gen) {
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    const text = block.getFieldValue('TEXT') || 'Play';
    const color = block.getFieldValue('COLOR') || '#FF6B35';
    const x = gen.valueToCode(block, 'X', Order.NONE) || '200';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '300';
    return v + ' = game.Button("' + text + '", ' + x + ', ' + y + ', 0, 0, "' + color + '")\n';
  };

  // ────── Emitter generators ──────
  pythonGenerator.forBlock['game_create_emitter'] = function(block, gen) {
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    const preset = block.getFieldValue('PRESET');
    const x = gen.valueToCode(block, 'X', Order.NONE) || '300';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '300';
    const presetMap = {
      fire: 'count=25, colors=["#FF0000","#FF4400","#FF8800","#FFCC00","#FFFF00"], speed=3, life=30, size=8, gravity=-0.2, shrink=True, spread=1.57, angle=-1.57',
      smoke: 'count=12, colors=["#666666","#888888","#AAAAAA"], speed=1.5, life=50, size=12, gravity=-0.05, grow=0.3',
      sparkle: 'count=15, colors=["#FFD700","#FFF8DC","#FFFFFF"], speed=2, life=30, size=5, shape="star", spin=0.2',
      snow: 'count=8, colors=["#FFFFFF","#E8E8FF"], speed=1, life=80, size=5, gravity=0.02, spread=0.94, angle=1.57',
      bubbles: 'count=10, colors=["rgba(100,200,255,0.6)"], speed=2, life=60, size=10, gravity=-0.1, shape="ring", grow=0.2',
      trail: 'count=5, colors=["#00FFFF","#0088FF","#0044FF"], speed=0.5, life=20, size=6, shrink=True, spread=0.94',
    };
    const opts = presetMap[preset] || presetMap.fire;
    return v + ' = game.Emitter(' + x + ', ' + y + ', ' + opts + ')\n';
  };
  pythonGenerator.forBlock['game_emitter_toggle'] = function(block, gen) {
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    const state = block.getFieldValue('STATE');
    return 'game.emitter_' + state + '(' + v + ')\n';
  };
  pythonGenerator.forBlock['game_move_emitter'] = function(block, gen) {
    const v = gen.getVariableName(block.getFieldValue('VAR'));
    const x = gen.valueToCode(block, 'X', Order.NONE) || '0';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '0';
    return 'game.move_emitter(' + v + ', ' + x + ', ' + y + ')\n';
  };
  pythonGenerator.forBlock['game_remove_emitter'] = function(block, gen) {
    return 'game.remove_emitter(' + gen.getVariableName(block.getFieldValue('VAR')) + ')\n';
  };

  // ────── Line generator ──────
  pythonGenerator.forBlock['game_create_line'] = function(block, gen) {
    const x1 = gen.valueToCode(block, 'X1', Order.NONE) || '0';
    const y1 = gen.valueToCode(block, 'Y1', Order.NONE) || '0';
    const x2 = gen.valueToCode(block, 'X2', Order.NONE) || '100';
    const y2 = gen.valueToCode(block, 'Y2', Order.NONE) || '100';
    const c = block.getFieldValue('COLOR') || '#ffffff';
    const w = gen.valueToCode(block, 'WIDTH', Order.NONE) || '2';
    return ['game.Line(' + x1 + ', ' + y1 + ', ' + x2 + ', ' + y2 + ', "' + c + '", ' + w + ')', Order.FUNCTION_CALL];
  };

  // ────── Object misc generators ──────
  pythonGenerator.forBlock['game_set_fixed'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const fixed = block.getFieldValue('FIXED');
    return obj + '.fixed = ' + fixed + '\n';
  };
  pythonGenerator.forBlock['game_set_layer'] = function(block, gen) {
    const obj = gen.getVariableName(block.getFieldValue('OBJ'));
    const layer = gen.valueToCode(block, 'LAYER', Order.NONE) || '0';
    return obj + '.layer = ' + layer + '\n';
  };
  pythonGenerator.forBlock['game_is_out'] = function(block, gen) {
    return [gen.getVariableName(block.getFieldValue('OBJ')) + '.is_out()', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_hit_test'] = function(block, gen) {
    const x = gen.valueToCode(block, 'X', Order.NONE) || '0';
    const y = gen.valueToCode(block, 'Y', Order.NONE) || '0';
    return ['game.hit_test(' + x + ', ' + y + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_physics_toggle'] = function(block) {
    return 'game.physics_enabled(' + block.getFieldValue('STATE') + ')\n';
  };
  pythonGenerator.forBlock['game_frame_count'] = function() {
    return ['game.frame_count()', Order.FUNCTION_CALL];
  };

  // ────── Math helpers generators ──────
  pythonGenerator.forBlock['game_lerp'] = function(block, gen) {
    const a = gen.valueToCode(block, 'A', Order.NONE) || '0';
    const b = gen.valueToCode(block, 'B', Order.NONE) || '1';
    const t = gen.valueToCode(block, 'T', Order.NONE) || '0.5';
    return ['game.lerp(' + a + ', ' + b + ', ' + t + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_clamp'] = function(block, gen) {
    const val = gen.valueToCode(block, 'VAL', Order.NONE) || '0';
    const mn = gen.valueToCode(block, 'MIN', Order.NONE) || '0';
    const mx = gen.valueToCode(block, 'MAX', Order.NONE) || '100';
    return ['game.clamp(' + val + ', ' + mn + ', ' + mx + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_random_float'] = function(block, gen) {
    const mn = gen.valueToCode(block, 'MIN', Order.NONE) || '0';
    const mx = gen.valueToCode(block, 'MAX', Order.NONE) || '1';
    return ['game.random_float(' + mn + ', ' + mx + ')', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_random_color'] = function() {
    return ['game.random_color()', Order.FUNCTION_CALL];
  };
  pythonGenerator.forBlock['game_choice'] = function(block, gen) {
    const lst = gen.valueToCode(block, 'LIST', Order.NONE) || '[]';
    return ['game.choice(' + lst + ')', Order.FUNCTION_CALL];
  };

  // ═══════════════════ Return block with toggleable value ═══════════════════

  const RETURN_MINUS_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">' +
    '<circle cx="12" cy="12" r="10" fill="#2c3e50" />' +
    '<rect x="7" y="11" width="10" height="2" fill="#ffffff" rx="1" />' +
    '</svg>'
  );
  const RETURN_PLUS_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">' +
    '<circle cx="12" cy="12" r="10" fill="#2c3e50" />' +
    '<rect x="11" y="7" width="2" height="10" fill="#ffffff" rx="1" />' +
    '<rect x="7" y="11" width="10" height="2" fill="#ffffff" rx="1" />' +
    '</svg>'
  );

  Blockly.Blocks['gm_return'] = {
    hasValue_: true,
    init() {
      this.setPreviousStatement(true);
      this.setColour(290);
      this.setTooltip('Return from a custom block – click the button to toggle the return value');
      this.updateShape_();
    },
    updateShape_() {
      if (this.getInput('VALUE')) this.removeInput('VALUE');
      if (this.getInput('BTN_ROW')) this.removeInput('BTN_ROW');
      if (this.getInput('EMPTY')) this.removeInput('EMPTY');

      if (this.hasValue_) {
        const btn = new Blockly.FieldImage(RETURN_MINUS_SVG, 18, 18, '-');
        btn.setOnClickHandler(() => { this.hasValue_ = false; this.updateShape_(); });
        this.appendValueInput('VALUE').appendField('return');
        this.appendDummyInput('BTN_ROW').appendField(btn);
        this.setInputsInline(true);
      } else {
        const btn = new Blockly.FieldImage(RETURN_PLUS_SVG, 18, 18, '+');
        btn.setOnClickHandler(() => { this.hasValue_ = true; this.updateShape_(); });
        this.appendDummyInput('EMPTY').appendField('return').appendField(btn);
        this.setInputsInline(true);
      }
    },
    saveExtraState() {
      return { hasValue: this.hasValue_ };
    },
    loadExtraState(state) {
      this.hasValue_ = state.hasValue !== false;
      this.updateShape_();
    },
    mutationToDom() {
      const container = Blockly.utils.xml.createElement('mutation');
      container.setAttribute('has_value', this.hasValue_ ? '1' : '0');
      return container;
    },
    domToMutation(xml) {
      this.hasValue_ = xml.getAttribute('has_value') !== '0';
      this.updateShape_();
    },
  };

  pythonGenerator.forBlock['gm_return'] = function(block, gen) {
    if (block.hasValue_ && block.getInput('VALUE')) {
      const val = gen.valueToCode(block, 'VALUE', Order.NONE);
      if (val) return 'return ' + val + '\n';
    }
    return 'return\n';
  };

  // ═══════════════════ Growable if/else-if/else (ported from MCU lab) ═══════════════════

  const MINUS_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">' +
    '<circle cx="12" cy="12" r="10" fill="#2c3e50" />' +
    '<rect x="7" y="11" width="10" height="2" fill="#ffffff" rx="1" />' +
    '</svg>'
  );
  const PLUS_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">' +
    '<circle cx="12" cy="12" r="10" fill="#2c3e50" />' +
    '<rect x="11" y="7" width="2" height="10" fill="#ffffff" rx="1" />' +
    '<rect x="7" y="11" width="10" height="2" fill="#ffffff" rx="1" />' +
    '</svg>'
  );

  function makeShadowBool(conn, val) {
    if (!conn) return;
    const shadow = Blockly.utils.xml.createElement('shadow');
    shadow.setAttribute('type', 'logic_boolean');
    const field = Blockly.utils.xml.createElement('field');
    field.setAttribute('name', 'BOOL');
    field.textContent = val;
    shadow.appendChild(field);
    conn.setShadowDom(shadow);
  }

  Blockly.Blocks['gm_if_chain'] = {
    elseifCount_: 0,
    hasElse_: false,
    init() {
      this.elseifCount_ = 0;
      this.hasElse_ = false;
      this.appendValueInput('IF0').setCheck('Boolean').appendField('if');
      this.appendDummyInput('THEN0').appendField('then');
      this.appendStatementInput('DO0').setCheck(null);
      this.appendDummyInput('PLUS_ROW').setAlign(Blockly.inputs.Align.RIGHT);
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(210);
      this.setTooltip('If condition is true, run the blocks inside. Use + to add else.');
      makeShadowBool(this.getInput('IF0')?.connection, 'TRUE');
      this.updateShape_();
    },
    mutationToDom() {
      const c = document.createElement('mutation');
      c.setAttribute('elseif', String(this.elseifCount_));
      c.setAttribute('else', this.hasElse_ ? '1' : '0');
      return c;
    },
    domToMutation(xml) {
      this.elseifCount_ = parseInt(xml.getAttribute('elseif') || '0', 10);
      this.hasElse_ = (xml.getAttribute('else') || '0') === '1';
      this.updateShape_();
    },
    saveExtraState() {
      return { elseIfCount: this.elseifCount_, hasElse: this.hasElse_ };
    },
    loadExtraState(state) {
      this.elseifCount_ = state.elseIfCount || 0;
      this.hasElse_ = !!state.hasElse;
      this.updateShape_();
    },
    updateShape_() {
      let i = 1;
      while (this.getInput('IF' + i)) {
        this.removeInput('IF' + i);
        this.removeInput('DO' + i);
        if (this.getInput('THEN' + i)) this.removeInput('THEN' + i);
        i++;
      }
      if (this.getInput('ELSE')) this.removeInput('ELSE');
      if (this.getInput('ELSE_HDR')) this.removeInput('ELSE_HDR');
      if (this.getInput('PLUS_ROW')) this.removeInput('PLUS_ROW');

      for (let n = 1; n <= this.elseifCount_; n++) {
        this.appendValueInput('IF' + n).setCheck('Boolean').appendField('else if');
        makeShadowBool(this.getInput('IF' + n)?.connection, 'FALSE');
        const minusBtn = new Blockly.FieldImage(MINUS_SVG, 18, 18, '-');
        minusBtn.setOnClickHandler(((idx) => () => this.removeElseIfAt_(idx))(n));
        const hdr = this.appendDummyInput('THEN' + n);
        hdr.appendField('then');
        hdr.appendField(minusBtn, 'MINUS_' + n);
        hdr.setAlign(Blockly.inputs.Align.RIGHT);
        this.appendStatementInput('DO' + n).setCheck(null);
      }

      if (this.hasElse_) {
        const minusBtn = new Blockly.FieldImage(MINUS_SVG, 18, 18, '-');
        minusBtn.setOnClickHandler(() => this.removeElse_());
        const hdr = this.appendDummyInput('ELSE_HDR');
        hdr.appendField('else');
        hdr.appendField(minusBtn, 'MINUS_ELSE');
        hdr.setAlign(Blockly.inputs.Align.RIGHT);
        this.appendStatementInput('ELSE').setCheck(null);
      }

      const plus = new Blockly.FieldImage(PLUS_SVG, 20, 20, '+');
      plus.setOnClickHandler(() => this.addCase_());
      const plusRow = this.appendDummyInput('PLUS_ROW');
      plusRow.setAlign(Blockly.inputs.Align.RIGHT);
      plusRow.appendField(plus, 'PLUS_BTN');
    },
    addCase_() {
      if (!this.hasElse_) {
        this.hasElse_ = true;
      } else {
        this.elseifCount_++;
      }
      this.updateShape_();
    },
    removeElseIfAt_(removeIdx) {
      const valConns = [], stmtConns = [];
      for (let i = 1; i <= this.elseifCount_; i++) {
        if (i === removeIdx) continue;
        valConns[i] = this.getInput('IF' + i)?.connection?.targetConnection || null;
        stmtConns[i] = this.getInput('DO' + i)?.connection?.targetConnection || null;
      }
      this.elseifCount_ = Math.max(0, this.elseifCount_ - 1);
      this.updateShape_();
      let dest = 1;
      for (let i = 1; i <= this.elseifCount_ + 1; i++) {
        if (i === removeIdx) continue;
        if (valConns[i]) this.getInput('IF' + dest)?.connection?.connect(valConns[i]);
        if (stmtConns[i]) this.getInput('DO' + dest)?.connection?.connect(stmtConns[i]);
        dest++;
      }
    },
    removeElse_() {
      this.hasElse_ = false;
      this.updateShape_();
    },
  };

  pythonGenerator.forBlock['gm_if_chain'] = function(block) {
    const cond0 = pythonGenerator.valueToCode(block, 'IF0', Order.NONE) || 'False';
    let code = 'if ' + cond0 + ':\n';
    let branch = pythonGenerator.statementToCode(block, 'DO0');
    code += branch || '  pass\n';
    let n = 1;
    while (block.getInput('IF' + n)) {
      const cond = pythonGenerator.valueToCode(block, 'IF' + n, Order.NONE) || 'False';
      code += 'elif ' + cond + ':\n';
      const doCode = pythonGenerator.statementToCode(block, 'DO' + n);
      code += doCode || '  pass\n';
      n++;
    }
    if (block.getInput('ELSE')) {
      code += 'else:\n';
      const elseCode = pythonGenerator.statementToCode(block, 'ELSE');
      code += elseCode || '  pass\n';
    }
    return code;
  };

  // Pre-configured if/else variant
  Blockly.Blocks['gm_if_else_chain'] = {
    elseifCount_: 0,
    hasElse_: true,
    init() {
      Blockly.Blocks['gm_if_chain'].init.call(this);
      this.hasElse_ = true;
      this.updateShape_();
    },
    mutationToDom: Blockly.Blocks['gm_if_chain'].mutationToDom,
    domToMutation: Blockly.Blocks['gm_if_chain'].domToMutation,
    saveExtraState: Blockly.Blocks['gm_if_chain'].saveExtraState,
    loadExtraState: Blockly.Blocks['gm_if_chain'].loadExtraState,
    updateShape_: Blockly.Blocks['gm_if_chain'].updateShape_,
    addCase_: Blockly.Blocks['gm_if_chain'].addCase_,
    removeElseIfAt_: Blockly.Blocks['gm_if_chain'].removeElseIfAt_,
    removeElse_: Blockly.Blocks['gm_if_chain'].removeElse_,
  };

  pythonGenerator.forBlock['gm_if_else_chain'] = pythonGenerator.forBlock['gm_if_chain'];
}

export function generateCode(workspace) {
  pythonGenerator.init(workspace);

  const EVENT_TYPES = ['game_on_overlap', 'game_on_click_obj', 'game_on_hover_obj', 'game_on_clone', 'game_on_array_item_where', 'game_after', 'game_every', 'hud_on_score_reach', 'hud_on_zero', 'hud_on_timer_done', 'hud_on_value_change'];
  const topBlocks = workspace.getTopBlocks(true);
  const startBlocks = [];
  const procBlocks = [];
  const eventBlocks = [];
  const otherBlocks = [];
  for (const b of topBlocks) {
    if (b.type === 'game_on_start') startBlocks.push(b);
    else if (b.type.startsWith('procedures_def') || b.type === 'game_define_scene') procBlocks.push(b);
    else if (EVENT_TYPES.includes(b.type)) eventBlocks.push(b);
    else otherBlocks.push(b);
  }

  const normalizeTopLevelCode = (blockCode) => {
    if (!blockCode) return '';
    const codeText = Array.isArray(blockCode) ? blockCode[0] : blockCode;
    if (!codeText) return '';
    return codeText.endsWith('\n') ? codeText : codeText + '\n';
  };

  let code = '';
  for (const b of [...startBlocks, ...procBlocks, ...otherBlocks, ...eventBlocks]) {
    code += normalizeTopLevelCode(pythonGenerator.blockToCode(b));
  }

  code = pythonGenerator.finish(code);

  const playerVariable = workspace.getVariableMap?.()?.getAllVariables?.().find((variable) => variable?.name === 'Player');
  const playerBootstrap = playerVariable
    ? pythonGenerator.getVariableName(playerVariable.getId()) + ' = game.Sprite("player", 100, 100, 5)\n'
    : '';

  code = 'import game\n' + playerBootstrap + code;
  if (!code.includes('game.start()')) {
    code += '\ngame.start()\n';
  }
  return code;
}
