export const toolbox = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category', name: 'Objects', colour: '160',
      contents: [
        { kind: 'label', text: 'Create' },
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
        { kind: 'block', type: 'game_create_line', inputs: {
          X1: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          Y1: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          X2: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
          Y2: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
          WIDTH: { shadow: { type: 'math_number', fields: { NUM: 2 } } },
        }},
        { kind: 'block', type: 'game_create_button', inputs: {
          X: { shadow: { type: 'math_number', fields: { NUM: 200 } } },
          Y: { shadow: { type: 'math_number', fields: { NUM: 300 } } },
        }},
        { kind: 'block', type: 'game_clone' },
        { kind: 'block', type: 'game_remove_all' },
        { kind: 'sep', gap: '16' },
        { kind: 'label', text: 'Physics' },
        { kind: 'block', type: 'game_set_velocity', inputs: {
          VX: { shadow: { type: 'math_number', fields: { NUM: 3 } } },
          VY: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
        }},
        { kind: 'block', type: 'game_set_acceleration', inputs: {
          AX: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          AY: { shadow: { type: 'math_number', fields: { NUM: 0.5 } } },
        }},
        { kind: 'block', type: 'game_set_bounce', inputs: {
          VAL: { shadow: { type: 'math_number', fields: { NUM: 0.8 } } },
        }},
        { kind: 'block', type: 'game_set_friction', inputs: {
          VAL: { shadow: { type: 'math_number', fields: { NUM: 0.98 } } },
        }},
        { kind: 'block', type: 'game_physics_toggle' },
        { kind: 'sep', gap: '16' },
        { kind: 'label', text: 'Collision' },
        { kind: 'block', type: 'game_push_out' },
        { kind: 'block', type: 'game_bounce_off' },
        { kind: 'sep', gap: '16' },
        { kind: 'label', text: 'Groups' },
        { kind: 'block', type: 'game_create_group' },
        { kind: 'block', type: 'game_group_add' },
        { kind: 'block', type: 'game_group_remove' },
        { kind: 'block', type: 'game_group_count' },
        { kind: 'block', type: 'game_group_any_touch' },
        { kind: 'block', type: 'game_group_remove_all' },
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
        { kind: 'block', type: 'game_follow', inputs: {
          SPEED: { shadow: { type: 'math_number', fields: { NUM: 3 } } },
        }},
        { kind: 'sep', gap: '16' },
        { kind: 'label', text: 'Tween' },
        { kind: 'block', type: 'game_tween', inputs: {
          TARGET: { shadow: { type: 'math_number', fields: { NUM: 300 } } },
          DUR: { shadow: { type: 'math_number', fields: { NUM: 500 } } },
        }},
        { kind: 'block', type: 'game_cancel_tweens' },
      ],
    },
    {
      kind: 'category', name: 'Events', colour: '40',
      contents: [
        { kind: 'block', type: 'game_on_start' },
        { kind: 'block', type: 'game_every_frame' },
        { kind: 'sep', gap: '16' },
        { kind: 'block', type: 'game_on_overlap' },
        { kind: 'block', type: 'game_on_click_obj' },
        { kind: 'block', type: 'game_on_hover_obj' },
        { kind: 'sep', gap: '16' },
        { kind: 'block', type: 'game_after', inputs: {
          MS: { shadow: { type: 'math_number', fields: { NUM: 1000 } } },
        }},
        { kind: 'block', type: 'game_every', inputs: {
          MS: { shadow: { type: 'math_number', fields: { NUM: 1000 } } },
        }},
        { kind: 'block', type: 'game_cancel_timer' },
        { kind: 'sep', gap: '16' },
        { kind: 'label', text: 'Game Control' },
        { kind: 'block', type: 'game_stop' },
        { kind: 'block', type: 'game_restart' },
        { kind: 'block', type: 'game_print', inputs: {
          TEXT: { shadow: { type: 'text', fields: { TEXT: 'hello' } } },
        }},
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
        { kind: 'block', type: 'game_hide' },
        { kind: 'block', type: 'game_show' },
        { kind: 'sep', gap: '16' },
        { kind: 'block', type: 'game_set_fixed' },
        { kind: 'block', type: 'game_set_layer', inputs: {
          LAYER: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
        }},
        { kind: 'sep', gap: '16' },
        { kind: 'label', text: 'Particles' },
        { kind: 'block', type: 'game_preset', inputs: {
          X: { shadow: { type: 'math_number', fields: { NUM: 300 } } },
          Y: { shadow: { type: 'math_number', fields: { NUM: 300 } } },
        }},
        { kind: 'block', type: 'game_create_emitter', inputs: {
          X: { shadow: { type: 'math_number', fields: { NUM: 300 } } },
          Y: { shadow: { type: 'math_number', fields: { NUM: 500 } } },
        }},
        { kind: 'block', type: 'game_emitter_toggle' },
        { kind: 'block', type: 'game_move_emitter', inputs: {
          X: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          Y: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
        }},
        { kind: 'block', type: 'game_remove_emitter' },
      ],
    },
    {
      kind: 'category', name: 'Sensing', colour: '195',
      contents: [
        { kind: 'label', text: 'Keyboard' },
        { kind: 'block', type: 'game_on_key' },
        { kind: 'block', type: 'game_key_pressed' },
        { kind: 'sep', gap: '16' },
        { kind: 'label', text: 'Mouse' },
        { kind: 'block', type: 'game_on_mouse' },
        { kind: 'block', type: 'game_mouse_x' },
        { kind: 'block', type: 'game_mouse_y' },
        { kind: 'block', type: 'game_mouse_down' },
        { kind: 'sep', gap: '16' },
        { kind: 'label', text: 'Collision' },
        { kind: 'block', type: 'game_touches' },
        { kind: 'block', type: 'game_distance' },
        { kind: 'block', type: 'game_is_out' },
        { kind: 'block', type: 'game_hit_test', inputs: {
          X: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          Y: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
        }},
        { kind: 'block', type: 'game_frame_count' },
        { kind: 'sep', gap: '16' },
        { kind: 'label', text: 'Color' },
        { kind: 'block', type: 'game_color_at', inputs: {
          X: { shadow: { type: 'math_number', fields: { NUM: 300 } } },
          Y: { shadow: { type: 'math_number', fields: { NUM: 300 } } },
        }},
        { kind: 'block', type: 'game_touching_color' },
        { kind: 'sep', gap: '16' },
        { kind: 'label', text: 'Mobile' },
        { kind: 'block', type: 'game_show_controls' },
        { kind: 'block', type: 'game_hide_controls' },
        { kind: 'block', type: 'game_on_dpad' },
        { kind: 'block', type: 'game_dpad_pressed' },
        { kind: 'block', type: 'game_on_button' },
        { kind: 'block', type: 'game_button_pressed' },
        { kind: 'sep', gap: '16' },
        { kind: 'block', type: 'game_request_tilt' },
        { kind: 'block', type: 'game_tilt' },
      ],
    },
    { kind: 'sep' },
    {
      kind: 'category', name: 'Logic', colour: '210',
      contents: [
        { kind: 'block', type: 'gm_if_chain' },
        { kind: 'block', type: 'gm_if_else_chain' },
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
        { kind: 'block', type: 'controls_flow_statements' },
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
        { kind: 'block', type: 'game_random_float', inputs: {
          MIN: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          MAX: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
        }},
        { kind: 'block', type: 'game_random_color' },
        { kind: 'block', type: 'game_choice' },
        { kind: 'sep', gap: '16' },
        { kind: 'block', type: 'math_modulo' },
        { kind: 'block', type: 'game_sqrt', inputs: {
          NUM: { shadow: { type: 'math_number', fields: { NUM: 9 } } },
        }},
        { kind: 'block', type: 'game_log', inputs: {
          NUM: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
        }},
        { kind: 'sep', gap: '16' },
        { kind: 'block', type: 'mp_round', inputs: {
          NUM: { shadow: { type: 'math_number', fields: { NUM: 3.7 } } },
        }},
        { kind: 'block', type: 'mp_floor', inputs: {
          NUM: { shadow: { type: 'math_number', fields: { NUM: 3.7 } } },
        }},
        { kind: 'block', type: 'mp_ceil', inputs: {
          NUM: { shadow: { type: 'math_number', fields: { NUM: 3.2 } } },
        }},
        { kind: 'block', type: 'mp_abs', inputs: {
          NUM: { shadow: { type: 'math_number', fields: { NUM: -5 } } },
        }},
        { kind: 'sep', gap: '16' },
        { kind: 'block', type: 'mp_min', inputs: {
          A: { shadow: { type: 'math_number', fields: { NUM: 5 } } },
          B: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
        }},
        { kind: 'block', type: 'mp_max', inputs: {
          A: { shadow: { type: 'math_number', fields: { NUM: 5 } } },
          B: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
        }},
        { kind: 'block', type: 'game_lerp', inputs: {
          A: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          B: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
          T: { shadow: { type: 'math_number', fields: { NUM: 0.5 } } },
        }},
        { kind: 'block', type: 'game_clamp', inputs: {
          VAL: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
          MIN: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          MAX: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
        }},
        { kind: 'sep', gap: '16' },
        { kind: 'block', type: 'mp_sin', inputs: {
          NUM: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
        }},
        { kind: 'block', type: 'mp_cos', inputs: {
          NUM: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
        }},
        { kind: 'block', type: 'mp_pi' },
        { kind: 'block', type: 'mp_e' },
        { kind: 'block', type: 'mp_degrees', inputs: {
          NUM: { shadow: { type: 'math_number', fields: { NUM: 3.14 } } },
        }},
        { kind: 'block', type: 'mp_radians', inputs: {
          NUM: { shadow: { type: 'math_number', fields: { NUM: 180 } } },
        }},
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
        { kind: 'block', type: 'game_to_number' },
        { kind: 'sep', gap: '16' },
        { kind: 'block', type: 'mp_string_length', inputs: {
          TEXT: { shadow: { type: 'text', fields: { TEXT: 'hello' } } },
        }},
        { kind: 'block', type: 'game_is_empty' },
        { kind: 'block', type: 'mp_string_char_at', inputs: {
          INDEX: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          TEXT: { shadow: { type: 'text', fields: { TEXT: 'hello' } } },
        }},
        { kind: 'block', type: 'game_substring', inputs: {
          TEXT: { shadow: { type: 'text', fields: { TEXT: 'hello world' } } },
          FROM: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          TO: { shadow: { type: 'math_number', fields: { NUM: 5 } } },
        }},
        { kind: 'block', type: 'mp_string_find', inputs: {
          TEXT: { shadow: { type: 'text', fields: { TEXT: 'o' } } },
          SEARCH: { shadow: { type: 'text', fields: { TEXT: 'hello' } } },
        }},
        { kind: 'sep', gap: '16' },
        { kind: 'block', type: 'mp_string_upper', inputs: {
          TEXT: { shadow: { type: 'text', fields: { TEXT: 'hello' } } },
        }},
        { kind: 'block', type: 'mp_string_lower', inputs: {
          TEXT: { shadow: { type: 'text', fields: { TEXT: 'HELLO' } } },
        }},
        { kind: 'block', type: 'mp_string_strip', inputs: {
          TEXT: { shadow: { type: 'text', fields: { TEXT: '  text  ' } } },
        }},
        { kind: 'sep', gap: '16' },
        { kind: 'block', type: 'mp_string_contains', inputs: {
          TEXT: { shadow: { type: 'text', fields: { TEXT: 'hello world' } } },
          SEARCH: { shadow: { type: 'text', fields: { TEXT: 'world' } } },
        }},
        { kind: 'block', type: 'game_chr', inputs: {
          CODE: { shadow: { type: 'math_number', fields: { NUM: 65 } } },
        }},
        { kind: 'block', type: 'game_ord' },
      ],
    },
    {
      kind: 'category', name: 'Arrays', colour: '200',
      contents: [
        { kind: 'label', text: 'Create' },
        { kind: 'block', type: 'mp_array_create' },
        { kind: 'block', type: 'mp_array_empty' },
        { kind: 'sep', gap: '16' },
        { kind: 'label', text: 'Read' },
        { kind: 'block', type: 'mp_array_length' },
        { kind: 'block', type: 'mp_array_get_index', inputs: {
          INDEX: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
        }},
        { kind: 'block', type: 'mp_array_first' },
        { kind: 'block', type: 'mp_array_last' },
        { kind: 'block', type: 'mp_array_pop_last' },
        { kind: 'block', type: 'mp_array_pop_first' },
        { kind: 'block', type: 'mp_array_pop_at', inputs: {
          INDEX: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
        }},
        { kind: 'sep', gap: '16' },
        { kind: 'label', text: 'Modify' },
        { kind: 'block', type: 'mp_array_set_index', inputs: {
          INDEX: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
        }},
        { kind: 'block', type: 'mp_array_push' },
        { kind: 'block', type: 'mp_array_unshift' },
        { kind: 'block', type: 'mp_array_insert_at', inputs: {
          INDEX: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
        }},
        { kind: 'sep', gap: '16' },
        { kind: 'block', type: 'mp_array_remove_last' },
        { kind: 'block', type: 'mp_array_remove_first' },
        { kind: 'block', type: 'mp_array_remove_index', inputs: {
          INDEX: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
        }},
        { kind: 'sep', gap: '16' },
        { kind: 'label', text: 'Operations' },
        { kind: 'block', type: 'mp_array_find' },
        { kind: 'block', type: 'mp_array_reverse' },
      ],
    },
    {
      kind: 'category', name: 'Variables', colour: '330',
      custom: 'VARIABLE',
    },
    {
      kind: 'category', name: 'Functions', colour: '290',
      custom: 'GM_PROCEDURES',
    },
    { kind: 'sep' },
    {
      kind: 'category', name: 'Stage', colour: '215',
      contents: [
        { kind: 'block', type: 'game_title' },
        { kind: 'block', type: 'game_background' },
        { kind: 'block', type: 'game_set_bg_image' },
        { kind: 'block', type: 'game_clear_bg_image' },
        { kind: 'block', type: 'game_width' },
        { kind: 'block', type: 'game_height' },
        { kind: 'sep', gap: '16' },
        { kind: 'label', text: 'Effects' },
        { kind: 'block', type: 'game_shake', inputs: {
          INTENSITY: { shadow: { type: 'math_number', fields: { NUM: 5 } } },
          DUR: { shadow: { type: 'math_number', fields: { NUM: 300 } } },
        }},
        { kind: 'block', type: 'game_flash', inputs: {
          DUR: { shadow: { type: 'math_number', fields: { NUM: 200 } } },
        }},
        { kind: 'block', type: 'game_transition', inputs: {
          DUR: { shadow: { type: 'math_number', fields: { NUM: 500 } } },
        }},
        { kind: 'sep', gap: '16' },
        { kind: 'label', text: 'Scenes' },
        { kind: 'block', type: 'game_define_scene', inputs: {
          NAME: { shadow: { type: 'text', fields: { TEXT: 'menu' } } },
        }},
        { kind: 'block', type: 'game_switch_scene', inputs: {
          NAME: { shadow: { type: 'text', fields: { TEXT: 'menu' } } },
        }},
        { kind: 'block', type: 'game_switch_scene_transition', inputs: {
          NAME: { shadow: { type: 'text', fields: { TEXT: 'level1' } } },
          DUR: { shadow: { type: 'math_number', fields: { NUM: 500 } } },
        }},
        { kind: 'block', type: 'game_get_scene' },
        { kind: 'sep', gap: '16' },
        { kind: 'label', text: 'Camera' },
        { kind: 'block', type: 'game_camera_follow', inputs: {
          SMOOTH: { shadow: { type: 'math_number', fields: { NUM: 0.1 } } },
        }},
        { kind: 'block', type: 'game_camera_set', inputs: {
          VAL: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
        }},
        { kind: 'block', type: 'game_camera_get' },
        { kind: 'sep', gap: '16' },
        { kind: 'label', text: 'TileMap' },
        { kind: 'block', type: 'game_create_tilemap', inputs: {
          COLS: { shadow: { type: 'math_number', fields: { NUM: 20 } } },
          ROWS: { shadow: { type: 'math_number', fields: { NUM: 15 } } },
          SIZE: { shadow: { type: 'math_number', fields: { NUM: 32 } } },
        }},
        { kind: 'block', type: 'game_set_tile_palette', inputs: {
          TYPE: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
        }},
        { kind: 'block', type: 'game_set_tile', inputs: {
          COL: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          ROW: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          TYPE: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
        }},
        { kind: 'block', type: 'game_get_tile', inputs: {
          COL: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          ROW: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
        }},
        { kind: 'block', type: 'game_set_tile_data' },
        { kind: 'block', type: 'game_tile_at_pixel', inputs: {
          X: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          Y: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
        }},
        { kind: 'block', type: 'game_overlaps_solid' },
        { kind: 'block', type: 'game_tilemap_push_out' },
      ],
    },
    {
      kind: 'category', name: 'Sound', colour: '310',
      contents: [
        { kind: 'block', type: 'game_play_custom_sound', inputs: {
          VOL: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
        }},
        { kind: 'block', type: 'game_stop_sounds' },
        { kind: 'sep', gap: '16' },
        { kind: 'block', type: 'game_sound', inputs: {
          FREQ: { shadow: { type: 'math_number', fields: { NUM: 440 } } },
          DUR: { shadow: { type: 'math_number', fields: { NUM: 200 } } },
        }},
        { kind: 'block', type: 'game_note', inputs: {
          DUR: { shadow: { type: 'math_number', fields: { NUM: 300 } } },
        }},
      ],
    },
    {
      kind: 'category', name: 'Animation', colour: '45',
      contents: [
        { kind: 'block', type: 'game_anim_play', inputs: {
          FPS: { shadow: { type: 'math_number', fields: { NUM: 8 } } },
        }},
        { kind: 'block', type: 'game_anim_stop' },
        { kind: 'block', type: 'game_anim_set_frame', inputs: {
          FRAME: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
        }},
        { kind: 'block', type: 'game_anim_frame' },
        { kind: 'block', type: 'game_anim_frame_count' },
        { kind: 'block', type: 'game_anim_is_animating' },
      ],
    },
    {
      kind: 'category', name: 'Game Info', colour: '20',
      contents: [
        { kind: 'block', type: 'hud_create_score', inputs: {
          X: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
          Y: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
        }},
        { kind: 'block', type: 'hud_create_lives', inputs: {
          X: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
          Y: { shadow: { type: 'math_number', fields: { NUM: 40 } } },
          MAX: { shadow: { type: 'math_number', fields: { NUM: 3 } } },
        }},
        { kind: 'block', type: 'hud_create_healthbar', inputs: {
          X: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
          Y: { shadow: { type: 'math_number', fields: { NUM: 70 } } },
        }},
        { kind: 'block', type: 'hud_create_timer', inputs: {
          X: { shadow: { type: 'math_number', fields: { NUM: 500 } } },
          Y: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
          SECS: { shadow: { type: 'math_number', fields: { NUM: 60 } } },
        }},
        { kind: 'sep', gap: '16' },
        { kind: 'block', type: 'hud_message', inputs: {
          TEXT: { shadow: { type: 'text', fields: { TEXT: 'Game Over!' } } },
          DUR: { shadow: { type: 'math_number', fields: { NUM: 2 } } },
        }},
        { kind: 'sep', gap: '16' },
        { kind: 'block', type: 'hud_score_add', inputs: {
          AMOUNT: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
        }},
        { kind: 'block', type: 'hud_lives_change', inputs: {
          AMOUNT: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
        }},
        { kind: 'block', type: 'hud_health_change', inputs: {
          AMOUNT: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
        }},
        { kind: 'block', type: 'hud_timer_action' },
        { kind: 'sep', gap: '16' },
        { kind: 'block', type: 'hud_get_value' },
        { kind: 'block', type: 'hud_set_value', inputs: {
          VALUE: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
        }},
        { kind: 'block', type: 'hud_is_dead' },
        { kind: 'block', type: 'hud_timer_done' },
        { kind: 'sep', gap: '16' },
        { kind: 'label', text: 'Events' },
        { kind: 'block', type: 'hud_on_score_reach', inputs: {
          VALUE: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
        }},
        { kind: 'block', type: 'hud_on_zero' },
        { kind: 'block', type: 'hud_on_timer_done' },
        { kind: 'block', type: 'hud_on_value_change' },
      ],
    },
  ],
};
