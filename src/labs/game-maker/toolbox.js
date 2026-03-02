export const toolbox = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category', name: 'Events', colour: '40',
      contents: [
        { kind: 'block', type: 'game_every_frame' },
      ],
    },
    {
      kind: 'category', name: 'Setup', colour: '215',
      contents: [
        { kind: 'block', type: 'game_title' },
        { kind: 'block', type: 'game_background' },
      ],
    },
    {
      kind: 'category', name: 'Objects', colour: '160',
      contents: [
        { kind: 'block', type: 'game_create_rect', inputs: {
          X: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
          Y: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
          W: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
          H: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
        }},
        { kind: 'block', type: 'game_create_circle', inputs: {
          X: { shadow: { type: 'math_number', fields: { NUM: 300 } } },
          Y: { shadow: { type: 'math_number', fields: { NUM: 300 } } },
          R: { shadow: { type: 'math_number', fields: { NUM: 15 } } },
        }},
        { kind: 'block', type: 'game_create_text', inputs: {
          X: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
          Y: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
          SIZE: { shadow: { type: 'math_number', fields: { NUM: 24 } } },
        }},
        { kind: 'block', type: 'game_create_sprite', inputs: {
          X: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
          Y: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
          SCALE: { shadow: { type: 'math_number', fields: { NUM: 5 } } },
        }},
      ],
    },
    {
      kind: 'category', name: 'Motion', colour: '230',
      contents: [
        { kind: 'block', type: 'game_move', inputs: {
          DX: { shadow: { type: 'math_number', fields: { NUM: 5 } } },
          DY: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
        }},
        { kind: 'block', type: 'game_move_to', inputs: {
          X: { shadow: { type: 'math_number', fields: { NUM: 300 } } },
          Y: { shadow: { type: 'math_number', fields: { NUM: 300 } } },
        }},
        { kind: 'block', type: 'game_keep_inside' },
      ],
    },
    {
      kind: 'category', name: 'Looks', colour: '280',
      contents: [
        { kind: 'block', type: 'game_set_prop', inputs: {
          VALUE: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
        }},
        { kind: 'block', type: 'game_get_prop' },
        { kind: 'block', type: 'game_say', inputs: {
          TEXT: { shadow: { type: 'text', fields: { TEXT: 'Hello!' } } },
          DUR: { shadow: { type: 'math_number', fields: { NUM: 3000 } } },
        }},
        { kind: 'block', type: 'game_remove' },
        { kind: 'block', type: 'game_shake', inputs: {
          INTENSITY: { shadow: { type: 'math_number', fields: { NUM: 5 } } },
          DUR: { shadow: { type: 'math_number', fields: { NUM: 300 } } },
        }},
        { kind: 'block', type: 'game_preset', inputs: {
          X: { shadow: { type: 'math_number', fields: { NUM: 300 } } },
          Y: { shadow: { type: 'math_number', fields: { NUM: 300 } } },
        }},
      ],
    },
    {
      kind: 'category', name: 'Sensing', colour: '195',
      contents: [
        { kind: 'block', type: 'game_key_pressed' },
        { kind: 'block', type: 'game_touches' },
        { kind: 'block', type: 'game_mouse_x' },
        { kind: 'block', type: 'game_mouse_y' },
        { kind: 'block', type: 'game_mouse_down' },
        { kind: 'block', type: 'game_distance' },
        { kind: 'block', type: 'game_width' },
        { kind: 'block', type: 'game_height' },
      ],
    },
    {
      kind: 'category', name: 'Sound', colour: '310',
      contents: [
        { kind: 'block', type: 'game_sound', inputs: {
          FREQ: { shadow: { type: 'math_number', fields: { NUM: 440 } } },
          DUR: { shadow: { type: 'math_number', fields: { NUM: 200 } } },
        }},
        { kind: 'block', type: 'game_note', inputs: {
          DUR: { shadow: { type: 'math_number', fields: { NUM: 300 } } },
        }},
      ],
    },
    { kind: 'sep' },
    {
      kind: 'category', name: 'Logic', colour: '210',
      contents: [
        { kind: 'block', type: 'controls_if' },
        { kind: 'block', type: 'controls_ifelse' },
        { kind: 'block', type: 'logic_compare' },
        { kind: 'block', type: 'logic_operation' },
        { kind: 'block', type: 'logic_negate' },
        { kind: 'block', type: 'logic_boolean' },
      ],
    },
    {
      kind: 'category', name: 'Loops', colour: '120',
      contents: [
        { kind: 'block', type: 'controls_repeat_ext', inputs: {
          TIMES: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
        }},
        { kind: 'block', type: 'controls_whileUntil' },
        { kind: 'block', type: 'controls_for', inputs: {
          FROM: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
          TO: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
          BY: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
        }},
      ],
    },
    {
      kind: 'category', name: 'Math', colour: '230',
      contents: [
        { kind: 'block', type: 'math_number', fields: { NUM: 0 } },
        { kind: 'block', type: 'math_arithmetic' },
        { kind: 'block', type: 'game_random_int', inputs: {
          MIN: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
          MAX: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
        }},
        { kind: 'block', type: 'math_modulo' },
      ],
    },
    {
      kind: 'category', name: 'Text', colour: '160',
      contents: [
        { kind: 'block', type: 'text', fields: { TEXT: 'hello' } },
        { kind: 'block', type: 'game_join', inputs: {
          A: { shadow: { type: 'text', fields: { TEXT: 'Score: ' } } },
          B: { shadow: { type: 'text', fields: { TEXT: '' } } },
        }},
        { kind: 'block', type: 'game_str' },
      ],
    },
    {
      kind: 'category', name: 'Variables', colour: '330',
      custom: 'VARIABLE',
    },
  ],
};
