export const examples = [
  {
    name: "Hello World",
    description: "Draw shapes and text on screen",
    code: `import game

game.title("Hello World")
game.background("#1a1a2e")

# Create shapes — they're real Python objects!
box = game.Rect(80, 80, 140, 100, "cyan")
sun = game.Circle(380, 150, 55, "yellow")
frame = game.Rect(220, 300, 160, 80, "lime", True)
divider = game.Line(0, 460, 600, 460, "white", 2)

# Text object
title = game.Text("Hello, STEMplitude!", 100, 500, "white", 32)
info = game.Text("Canvas: " + str(game.WIDTH) + "x" + str(game.HEIGHT), 170, 30, "gray", 18)

# You can change properties directly!
box.opacity = 0.8
sun.color = "gold"
title.rotation = -2

print("Objects are real Python objects:")
print(box)
print(sun)
game.start()
`,
  },
  {
    name: "Catch the Star",
    description: "Move your player to collect stars",
    code: `import game

game.title("Catch the Star!")
game.background("#0a0a23")

W = game.WIDTH
H = game.HEIGHT

player = game.Rect(W / 2 - 15, H - 80, 30, 30, "cyan")
star = game.Circle(
    game.random_int(20, W - 20),
    game.random_int(20, H - 100),
    12, "gold"
)

score = 0
score_text = game.Text("Score: 0", 10, 10, "white", 26)
speed = 5

def update():
    global score, speed

    if game.key_pressed("right"):
        player.move(speed, 0)
    if game.key_pressed("left"):
        player.move(-speed, 0)
    if game.key_pressed("up"):
        player.move(0, -speed)
    if game.key_pressed("down"):
        player.move(0, speed)

    # Keep player on screen
    if player.x < 0:
        player.x = 0
    if player.x > W - 30:
        player.x = W - 30
    if player.y < 0:
        player.y = 0
    if player.y > H - 30:
        player.y = H - 30

    # Collect star
    if player.touches(star):
        score += 1
        score_text.content = "Score: " + str(score)
        star.x = game.random_int(20, W - 20)
        star.y = game.random_int(20, H - 100)
        game.sound(880, 100)

        if score % 5 == 0:
            speed += 1

game.on_update(update)
game.start()
`,
  },
  {
    name: "Bouncing Ball",
    description: "A ball that bounces around the screen",
    code: `import game

game.title("Bouncing Ball")
game.background("#0d0d2b")

W = game.WIDTH
H = game.HEIGHT

ball = game.Circle(300, 300, 18, "orange")
dx = 4
dy = 3

def update():
    global dx, dy

    ball.move(dx, dy)

    if ball.x <= 18 or ball.x >= W - 18:
        dx = -dx
        game.sound(440, 50)
    if ball.y <= 18 or ball.y >= H - 18:
        dy = -dy
        game.sound(330, 50)

    # Color shifts with position
    r = int(ball.x / W * 255)
    g = int(ball.y / H * 255)
    ball.color = "rgb(" + str(r) + "," + str(g) + ",150)"

game.on_update(update)
game.start()
`,
  },
  {
    name: "Snake",
    description: "Classic snake game — eat food to grow!",
    code: `import game

game.title("Snake")
game.background("#0a1628")

CELL = 20
COLS = 30
ROWS = 30

snake = [[15, 15]]
snake_parts = [game.Rect(15 * CELL, 15 * CELL, CELL - 2, CELL - 2, "lime")]
dir_x = 1
dir_y = 0
next_dir_x = 1
next_dir_y = 0

food_x = game.random_int(0, COLS - 1)
food_y = game.random_int(0, ROWS - 1)
food = game.Rect(food_x * CELL, food_y * CELL, CELL - 2, CELL - 2, "red")

score = 0
score_text = game.Text("Score: 0", 10, 10, "white", 22)

timer = 0
SPEED = 7
game_over = False

def update():
    global dir_x, dir_y, next_dir_x, next_dir_y
    global food_x, food_y, timer, score, game_over

    if game_over:
        return

    if game.key_pressed("right") and dir_x != -1:
        next_dir_x = 1
        next_dir_y = 0
    if game.key_pressed("left") and dir_x != 1:
        next_dir_x = -1
        next_dir_y = 0
    if game.key_pressed("up") and dir_y != 1:
        next_dir_x = 0
        next_dir_y = -1
    if game.key_pressed("down") and dir_y != -1:
        next_dir_x = 0
        next_dir_y = 1

    timer += 1
    if timer < SPEED:
        return
    timer = 0

    dir_x = next_dir_x
    dir_y = next_dir_y

    head_x = snake[0][0] + dir_x
    head_y = snake[0][1] + dir_y

    if head_x < 0 or head_x >= COLS or head_y < 0 or head_y >= ROWS:
        game_over = True
        game.Text("GAME OVER!", 180, 270, "red", 40)
        game.sound(200, 500)
        return

    for part in snake:
        if part[0] == head_x and part[1] == head_y:
            game_over = True
            game.Text("GAME OVER!", 180, 270, "red", 40)
            game.sound(200, 500)
            return

    snake.insert(0, [head_x, head_y])
    new_part = game.Rect(
        head_x * CELL, head_y * CELL,
        CELL - 2, CELL - 2, "lime"
    )
    snake_parts.insert(0, new_part)

    if head_x == food_x and head_y == food_y:
        score += 1
        score_text.content = "Score: " + str(score)
        food_x = game.random_int(0, COLS - 1)
        food_y = game.random_int(0, ROWS - 1)
        food.move_to(food_x * CELL, food_y * CELL)
        game.sound(660, 100)
    else:
        snake.pop()
        snake_parts.pop().remove()

    for i in range(len(snake_parts)):
        g = 255 - int(i * 160 / max(len(snake_parts), 1))
        if g < 80:
            g = 80
        snake_parts[i].color = "rgb(0," + str(g) + ",0)"

game.on_update(update)
game.start()
`,
  },
  {
    name: "Space Dodge",
    description: "Dodge falling asteroids as long as you can",
    code: `import game

game.title("Space Dodge")
game.background("#050510")

W = game.WIDTH
H = game.HEIGHT

# Starfield
for i in range(50):
    game.Circle(game.random_int(0, W), game.random_int(0, H), 1, "#333")

ship = game.Rect(W / 2 - 15, H - 60, 30, 20, "cyan")

asteroids = []
asteroid_speeds = []

score = 0
score_text = game.Text("Score: 0", 10, 10, "white", 22)
lives = 3
lives_text = game.Text("Lives: 3", W - 120, 10, "red", 22)
spawn_timer = 0
difficulty = 28
game_over = False

def spawn_asteroid():
    x = game.random_int(0, W - 25)
    sz = game.random_int(12, 30)
    colors = ["gray", "#8B4513", "#A0522D", "#696969"]
    c = colors[game.random_int(0, 3)]
    a = game.Rect(x, -35, sz, sz, c)
    asteroids.append(a)
    asteroid_speeds.append(game.random_int(2, 6))

def update():
    global score, spawn_timer, difficulty, lives, game_over

    if game_over:
        return

    if game.key_pressed("left"):
        ship.move(-7, 0)
    if game.key_pressed("right"):
        ship.move(7, 0)

    if ship.x < 0:
        ship.x = 0
    if ship.x > W - 30:
        ship.x = W - 30

    spawn_timer += 1
    if spawn_timer >= difficulty:
        spawn_asteroid()
        spawn_timer = 0

    i = 0
    while i < len(asteroids):
        asteroids[i].move(0, asteroid_speeds[i])

        if ship.touches(asteroids[i]):
            lives -= 1
            lives_text.content = "Lives: " + str(lives)
            asteroids[i].remove()
            asteroids.pop(i)
            asteroid_speeds.pop(i)
            game.sound(200, 300)
            if lives <= 0:
                game_over = True
                game.Text("GAME OVER!", W / 2 - 120, H / 2 - 30, "red", 40)
                game.Text("Score: " + str(score), W / 2 - 80, H / 2 + 30, "white", 30)
                return
            continue

        if asteroids[i].is_out():
            asteroids[i].remove()
            asteroids.pop(i)
            asteroid_speeds.pop(i)
            score += 1
            score_text.content = "Score: " + str(score)
            if score % 10 == 0 and difficulty > 10:
                difficulty -= 2
            continue

        i += 1

game.on_update(update)
game.start()
`,
  },
  {
    name: "Pong",
    description: "Two-player Pong — W/S vs Arrow keys",
    code: `import game

game.title("Pong")
game.background("#0a0a23")

W = game.WIDTH
H = game.HEIGHT

# Center line
for i in range(0, H, 24):
    game.Rect(W / 2 - 2, i, 4, 12, "#222")

paddle1 = game.Rect(15, H / 2 - 40, 12, 80, "cyan")
paddle2 = game.Rect(W - 27, H / 2 - 40, 12, 80, "orange")
ball = game.Circle(W / 2, H / 2, 10, "white")

ball_dx = 5
ball_dy = 3
p1_score = 0
p2_score = 0
p1_text = game.Text("0", W / 2 - 80, 15, "cyan", 40)
p2_text = game.Text("0", W / 2 + 50, 15, "orange", 40)

SPEED = 6

def update():
    global ball_dx, ball_dy, p1_score, p2_score

    if game.key_pressed("w"):
        paddle1.move(0, -SPEED)
    if game.key_pressed("s"):
        paddle1.move(0, SPEED)
    if game.key_pressed("up"):
        paddle2.move(0, -SPEED)
    if game.key_pressed("down"):
        paddle2.move(0, SPEED)

    # Clamp paddles
    if paddle1.y < 0: paddle1.y = 0
    if paddle1.y > H - 80: paddle1.y = H - 80
    if paddle2.y < 0: paddle2.y = 0
    if paddle2.y > H - 80: paddle2.y = H - 80

    ball.move(ball_dx, ball_dy)

    if ball.y <= 10 or ball.y >= H - 10:
        ball_dy = -ball_dy
        game.sound(440, 30)

    if ball.touches(paddle1) and ball_dx < 0:
        ball_dx = -ball_dx
        game.sound(660, 50)
    if ball.touches(paddle2) and ball_dx > 0:
        ball_dx = -ball_dx
        game.sound(660, 50)

    if ball.x < -15:
        p2_score += 1
        p2_text.content = str(p2_score)
        ball.move_to(W / 2, H / 2)
        ball_dx = 5
        game.sound(220, 200)
    if ball.x > W + 15:
        p1_score += 1
        p1_text.content = str(p1_score)
        ball.move_to(W / 2, H / 2)
        ball_dx = -5
        game.sound(220, 200)

game.on_update(update)
game.start()
`,
  },
  {
    name: "Drawing App",
    description: "Click and drag to paint on the canvas",
    code: `import game

game.title("Drawing App")
game.background("white")

W = game.WIDTH
H = game.HEIGHT

game.Text("Click and drag to draw!", W / 2 - 130, 10, "#555", 20)
game.Text("Press C to clear, G for grid", W / 2 - 140, H - 30, "#999", 16)

dots = []

def update():
    if game.mouse_down():
        mx = game.mouse_x()
        my = game.mouse_y()
        r = mx % 256
        b = my % 256
        color = "rgb(" + str(r) + ",100," + str(b) + ")"
        dot = game.Circle(mx, my, 6, color)
        dots.append(dot)

    if game.key_pressed("c"):
        for d in dots:
            d.remove()
        dots.clear()

    if game.key_pressed("g"):
        game.show_grid(True)

game.on_update(update)
game.start()
`,
  },
  {
    name: "Flappy Bird",
    description: "Press Space to flap and dodge the pipes!",
    code: `import game

game.title("Flappy Bird")
game.background("#70c5ce")

W = game.WIDTH
H = game.HEIGHT

ground = game.Rect(0, H - 50, W, 50, "#ded895")
bird = game.Circle(120, H / 2, 14, "#f7dc6f")

velocity = 0
gravity = 0.4
jump = -7.5
flap_cooldown = 0

pipes = []
pipe_speed = 3
pipe_timer = 0
pipe_gap = 150
pipe_width = 50

score = 0
score_text = game.Text("0", W / 2 - 10, 25, "white", 40)
game_over = False
started = False
start_text = game.Text("Press SPACE to start", W / 2 - 140, H / 2 - 10, "white", 24)

def spawn_pipe():
    gap_y = game.random_int(100, H - 200)
    top = game.Rect(W + 10, 0, pipe_width, gap_y, "#2ecc71")
    bot = game.Rect(W + 10, gap_y + pipe_gap, pipe_width, H - gap_y - pipe_gap - 50, "#2ecc71")
    pipes.append([top, bot, False])

def update():
    global velocity, pipe_timer, score
    global game_over, started, flap_cooldown

    if game_over:
        return

    if not started:
        if game.key_pressed("space"):
            started = True
            start_text.remove()
            velocity = jump
        return

    flap_cooldown -= 1
    if game.key_pressed("space") and flap_cooldown <= 0:
        velocity = jump
        flap_cooldown = 10
        game.sound(500, 50)

    velocity += gravity
    bird.move(0, velocity)

    if bird.y > H - 64 or bird.y < 14:
        game_over = True
        game.Text("GAME OVER!", W / 2 - 120, H / 2 - 20, "red", 40)
        game.sound(200, 400)
        return

    pipe_timer += 1
    if pipe_timer >= 85:
        spawn_pipe()
        pipe_timer = 0

    i = 0
    while i < len(pipes):
        top = pipes[i][0]
        bot = pipes[i][1]
        scored = pipes[i][2]

        top.move(-pipe_speed, 0)
        bot.move(-pipe_speed, 0)

        if bird.touches(top) or bird.touches(bot):
            game_over = True
            game.Text("GAME OVER!", W / 2 - 120, H / 2 - 20, "red", 40)
            game.sound(200, 400)
            return

        if top.x + pipe_width < 120 and not scored:
            score += 1
            score_text.content = str(score)
            pipes[i][2] = True
            game.sound(880, 50)

        if top.x < -pipe_width:
            top.remove()
            bot.remove()
            pipes.pop(i)
            continue

        i += 1

game.on_update(update)
game.start()
`,
  },
  {
    name: "Sprite Gallery",
    description: "See all built-in sprites + custom pixel art",
    code: `import game

game.title("Sprite Gallery")
game.background("#1a1a2e")

W = game.WIDTH
H = game.HEIGHT

names = game.sprite_names()
game.Text("Built-in Sprites (" + str(len(names)) + ")", 20, 10, "white", 22)

col = 0
row = 0
for name in names:
    x = 30 + col * 90
    y = 50 + row * 90
    s = game.Sprite(name, x, y, 5)
    game.Text(name, x - 5, y + 45, "#8b949e", 11)
    col += 1
    if col >= 6:
        col = 0
        row += 1

# Custom pixel art section
cy = 50 + (row + 1) * 90 + 20
game.Text("Custom Pixel Art:", 20, cy, "white", 22)

robot = game.PixelSprite(30, cy + 40, [
    "..sss...",
    ".swkws..",
    ".sssss..",
    "..bbb...",
    ".bbrbb..",
    ".bbbbb..",
    "..b.b...",
    "..k.k...",
], {"s": "#c0c0c0", "w": "white", "k": "#333",
    "b": "#4a9eff", "r": "red"}, 5)
game.Text("robot", 30, cy + 85, "#8b949e", 11)

alien = game.PixelSprite(150, cy + 40, [
    "..g..g..",
    ".gggggg.",
    "ggwkwkgg",
    "gggggggg",
    ".gggGgg.",
    "..gggg..",
    ".g....g.",
    "........",
], {"g": "#4ade80", "G": "#16a34a",
    "w": "white", "k": "#333"}, 5)
game.Text("alien", 150, cy + 85, "#8b949e", 11)

car = game.PixelSprite(270, cy + 40, [
    "........",
    "...rrr..",
    "..rrrrr.",
    ".rrrrrrr",
    "rrrrrrrr",
    "rkrrrrkr",
    ".k....k.",
    "........",
], {"r": "red", "k": "#333"}, 5)
game.Text("car", 278, cy + 85, "#8b949e", 11)
game.start()
`,
  },
  {
    name: "Dungeon Collect",
    description: "Collect gems and dodge enemies with sprites!",
    code: `import game

game.title("Dungeon Collect")
game.background("#0f0a1e")

W = game.WIDTH
H = game.HEIGHT

player = game.Sprite("player", W / 2, H - 80, 5)
speed = 5
facing_right = True

# Collectibles
gems = []
for i in range(5):
    g = game.Sprite("gem",
        game.random_int(30, W - 60),
        game.random_int(30, H - 150), 4)
    gems.append(g)

# Enemies
enemies = []
enemy_dx = []
for i in range(3):
    e = game.Sprite("enemy",
        game.random_int(50, W - 80),
        game.random_int(80, H - 200), 4)
    dx = game.random_int(1, 3)
    if game.random_int(0, 1) == 0:
        dx = -dx
    enemies.append(e)
    enemy_dx.append(dx)

# HUD
score = 0
score_text = game.Text("Gems: 0", 10, 10, "cyan", 22)

hearts = []
for i in range(3):
    h = game.Sprite("heart", W - 45 - i * 40, 8, 3)
    h.layer = 10
    hearts.append(h)

lives = 3
game_over = False

def update():
    global score, lives, game_over, facing_right

    if game_over:
        return

    # Move player
    if game.key_pressed("right"):
        player.move(speed, 0)
        if not facing_right:
            player.flip_x = False
            facing_right = True
    if game.key_pressed("left"):
        player.move(-speed, 0)
        if facing_right:
            player.flip_x = True
            facing_right = False
    if game.key_pressed("up"):
        player.move(0, -speed)
    if game.key_pressed("down"):
        player.move(0, speed)

    # Clamp
    if player.x < 0: player.x = 0
    if player.x > W - 40: player.x = W - 40
    if player.y < 0: player.y = 0
    if player.y > H - 40: player.y = H - 40

    # Move enemies
    for i in range(len(enemies)):
        enemies[i].move(enemy_dx[i], 0)
        if enemies[i].x <= 10 or enemies[i].x >= W - 50:
            enemy_dx[i] = -enemy_dx[i]
            enemies[i].flip_x = not enemies[i].flip_x

    # Collect gems
    i = 0
    while i < len(gems):
        if player.touches(gems[i]):
            gems[i].remove()
            gems.pop(i)
            score += 1
            score_text.content = "Gems: " + str(score)
            game.sound(880, 80)

            # Spawn replacement
            g = game.Sprite("gem",
                game.random_int(30, W - 60),
                game.random_int(30, H - 150), 4)
            gems.append(g)
            continue
        i += 1

    # Enemy collision
    for e in enemies:
        if player.touches(e):
            lives -= 1
            if len(hearts) > 0:
                hearts.pop().remove()
            player.move_to(W / 2, H - 80)
            game.sound(220, 300)
            if lives <= 0:
                game_over = True
                game.Text("GAME OVER!", W / 2 - 120, H / 2 - 30, "red", 40)
                game.Text("Gems: " + str(score), W / 2 - 70, H / 2 + 30, "white", 28)
            break

game.on_update(update)
game.start()
`,
  },
  {
    name: "Animated Sprites",
    description: "Control sprite animation frames",
    code: `import game

game.title("Animation Control")
game.background("#0d1117")

# Animated sprites auto-play their frames
torch = game.Sprite("fire", 80, 60, 6)
sparkle = game.Sprite("sparkle", 200, 70, 6)
water = game.Sprite("water", 310, 60, 6)

# Labels
game.Text("Auto-playing:", 20, 30, "gray", 16)
game.Text("fire", 80, 120, "#fb923c", 14)
game.Text("sparkle", 190, 120, "#fbbf24", 14)
game.Text("water", 310, 120, "#4a9eff", 14)

# This coin does NOT auto-play: we control it manually
coin = game.Sprite("coin_spin", 100, 220, 6)
coin.stop()
coin.set_frame(0)
game.Text("Manual frame:", 20, 190, "gray", 16)

frame_label = game.Text("Frame: 0", 200, 230, "white", 18)
timer = 0

# Walking character: starts animated, press SPACE to freeze
walker = game.Sprite("player_run", 80, 340, 6)
walker.play(8)
state_label = game.Text("SPACE = pause/play", 180, 350, "gray", 14)
walk_label = game.Text("Walking (8 fps)", 180, 380, "#4ade80", 16)

def update():
    global timer

    # Cycle coin frame manually every 30 ticks
    timer += 1
    if timer % 30 == 0:
        next_f = (coin.frame + 1) % coin.frame_count
        coin.set_frame(next_f)
        frame_label.remove()

    # Toggle walker animation with SPACE
    if game.key_pressed("space"):
        if walker.animating:
            walker.stop()
            walk_label.color = "#f87171"
            walk_label.content = "Stopped (frame " + str(walker.frame) + ")"
        else:
            walker.play(8)
            walk_label.color = "#4ade80"
            walk_label.content = "Walking (8 fps)"

game.on_update(update)
game.start()
`,
  },
  {
    name: "Wizard Adventure",
    description: "Explore a forest, collect potions, dodge ghosts!",
    code: `import game

game.title("Wizard Adventure")
W = game.WIDTH
H = game.HEIGHT

wizard = None
door = None
potions = []
keys_list = []
coins = []
ghosts = []
ghost_dy = []
slimes = []
slime_dx = []
score = None
key_count = 0
key_text = None
lives = None
game_over = False
won = False
facing_right = True

def show_end(title, color, info_text):
    bg = game.Rect(0, 0, W, H, "rgba(0,0,0,0.75)")
    bg.layer = 900
    bg.fixed = True
    t = game.Text(title, W / 2, 200, color, 44)
    t.bold = True
    t.font = "Impact"
    t.align = "center"
    t.layer = 901
    t.fixed = True
    inf = game.Text(info_text, W / 2, 260, "white", 22)
    inf.align = "center"
    inf.font = "Arial"
    inf.layer = 901
    inf.fixed = True
    retry = game.Button("Retry", 150, 330, 130, 48, "#238636")
    retry.hover_color = "#2ea043"
    retry.radius = 10
    retry.layer = 901
    retry.fixed = True
    retry.on_click(lambda s, x, y: game.scene("game"))
    quit = game.Button("Exit", 320, 330, 130, 48, "#555")
    quit.hover_color = "#777"
    quit.radius = 10
    quit.layer = 901
    quit.fixed = True
    quit.on_click(lambda s, x, y: game.stop())

def build_game():
    global wizard, door, potions, keys_list, coins
    global ghosts, ghost_dy, slimes, slime_dx
    global score, key_count, key_text, lives
    global game_over, won, facing_right

    game.background("#0f1a0f")
    game_over = False
    won = False
    key_count = 0
    facing_right = True

    # Scenery
    for i in range(6):
        game.Sprite("tree", game.random_int(0, W - 40), game.random_int(20, 120), 4)
    for i in range(4):
        game.Sprite("rock", game.random_int(0, W - 40), game.random_int(200, H - 150), 3)
    for i in range(5):
        game.Sprite("flower", game.random_int(0, W - 30), game.random_int(150, H - 80), 3)
    game.Sprite("mushroom", 50, 260, 4)
    game.Sprite("mushroom", 480, 400, 4)
    game.Sprite("house", 490, 30, 5)

    door = game.Sprite("door", W - 70, 80, 5)
    wizard = game.Sprite("wizard", 40, H - 80, 5)

    potions = []
    for i in range(4):
        potions.append(game.Sprite("potion",
            game.random_int(60, W - 80),
            game.random_int(150, H - 100), 4))

    keys_list = []
    for i in range(2):
        keys_list.append(game.Sprite("key",
            game.random_int(60, W - 80),
            game.random_int(150, H - 100), 4))

    coins = []
    for i in range(6):
        coins.append(game.Sprite("coin_spin",
            game.random_int(40, W - 60),
            game.random_int(140, H - 80), 3))

    ghosts = []
    ghost_dy = []
    for i in range(3):
        ghosts.append(game.Sprite("ghost",
            game.random_int(80, W - 100),
            game.random_int(150, H - 120), 4))
        ghost_dy.append(game.random_float(1, 2.5))

    slimes = []
    slime_dx = []
    for i in range(2):
        slimes.append(game.Sprite("slime",
            game.random_int(100, W - 120),
            game.random_int(300, H - 80), 4))
        slime_dx.append(game.random_float(1, 2))

    score = game.Score(10, 10, "Potions: ", "cyan", 22)
    key_text = game.Text("Keys: 0/2", 10, 40, "gold", 18)
    key_text.bold = True
    lives = game.Lives(W - 40, 8, 3, "red", 20)

    def update():
        global game_over, won, facing_right, key_count

        if game_over or won:
            return

        speed = 4
        if game.key_pressed("right"):
            wizard.move(speed, 0)
            if not facing_right:
                wizard.flip_x = False
                facing_right = True
        if game.key_pressed("left"):
            wizard.move(-speed, 0)
            if facing_right:
                wizard.flip_x = True
                facing_right = False
        if game.key_pressed("up"):
            wizard.move(0, -speed)
        if game.key_pressed("down"):
            wizard.move(0, speed)

        wizard.keep_inside()

        i = 0
        while i < len(potions):
            if wizard.touches(potions[i]):
                game.preset("sparkle", potions[i].x + 16, potions[i].y + 16)
                game.sound(880, 80)
                potions[i].remove()
                potions.pop(i)
                score.add(1)
                continue
            i += 1

        i = 0
        while i < len(keys_list):
            if wizard.touches(keys_list[i]):
                game.preset("magic", keys_list[i].x + 12, keys_list[i].y + 12)
                game.sound(660, 150, "sine")
                keys_list[i].remove()
                keys_list.pop(i)
                key_count += 1
                key_text.content = "Keys: " + str(key_count) + "/2"
                continue
            i += 1

        i = 0
        while i < len(coins):
            if wizard.touches(coins[i]):
                game.sound(1200, 50)
                coins[i].remove()
                coins.pop(i)
                score.add(1)
                continue
            i += 1

        for i in range(len(ghosts)):
            ghosts[i].move(0, ghost_dy[i])
            if ghosts[i].y < 100 or ghosts[i].y > H - 60:
                ghost_dy[i] = -ghost_dy[i]

        for i in range(len(slimes)):
            slimes[i].move(slime_dx[i], 0)
            if slimes[i].x < 30 or slimes[i].x > W - 60:
                slime_dx[i] = -slime_dx[i]
                slimes[i].flip_x = not slimes[i].flip_x

        for g in ghosts:
            if wizard.touches(g):
                lives.lose()
                game.shake(6, 200)
                game.flash("red", 150)
                wizard.move_to(40, H - 80)
                if lives.is_dead():
                    game_over = True
                    show_end("GAME OVER!", "red",
                        "Potions: " + str(score.value))
                break

        for s in slimes:
            if wizard.touches(s):
                lives.lose()
                game.shake(6, 200)
                game.flash("red", 150)
                wizard.move_to(40, H - 80)
                if lives.is_dead():
                    game_over = True
                    show_end("GAME OVER!", "red",
                        "Potions: " + str(score.value))
                break

        if wizard.touches(door):
            if key_count >= 2:
                won = True
                game.preset("confetti", W / 2, H / 2)
                show_end("YOU WIN!", "gold",
                    "Potions: " + str(score.value))
                game.sound(523, 200, "sine")
                game.after(200, lambda: game.sound(659, 200, "sine"))
                game.after(400, lambda: game.sound(784, 400, "sine"))

    game.on_update(update)

game.on_scene("game", build_game)
game.scene("game")
game.start()
`,
  },
  {
    name: "Space Battle",
    description: "Shoot down UFOs with your ship and rockets!",
    code: `import game

game.title("Space Battle")
game.background("#050510")

W = game.WIDTH
H = game.HEIGHT

# Starfield
for i in range(60):
    sz = game.random_int(1, 2)
    game.Circle(
        game.random_int(0, W),
        game.random_int(0, H),
        sz, "#222")

# Player ship
ship = game.Sprite("rocket", W / 2 - 16, H - 70, 5)
speed = 5
facing = "right"

# Bullets
bullets = []
shoot_cooldown = 0

# UFOs
ufos = []
ufo_speeds = []
spawn_timer = 0
spawn_rate = 50

# Score & HUD
score = game.Score(10, 10, "Score: ", "cyan", 22)
lives = game.Lives(W - 40, 8, 5, "red", 20)
game_over = False
wave = 1
wave_text = game.Text("Wave 1", W / 2, 10, "#555", 16)
wave_text.align = "center"
wave_kills = 0

def spawn_ufo():
    x = game.random_int(30, W - 60)
    u = game.Sprite("ufo", x, -40, 4)
    ufos.append(u)
    s = game.random_float(1, 2 + wave * 0.3)
    ufo_speeds.append(s)

def fire():
    bx = ship.x + ship.width / 2 - 3
    by = ship.y - 8
    b = game.Rect(bx, by, 6, 14, "cyan")
    b.layer = -1
    bullets.append(b)
    game.sound(1200, 40, "square", 0.08)

def update():
    global shoot_cooldown, spawn_timer, game_over
    global wave, spawn_rate, wave_kills

    if game_over:
        return

    # Ship movement
    if game.key_pressed("left"):
        ship.move(-speed, 0)
    if game.key_pressed("right"):
        ship.move(speed, 0)
    if game.key_pressed("up"):
        ship.move(0, -speed)
    if game.key_pressed("down"):
        ship.move(0, speed)

    ship.keep_inside()

    # Shooting
    shoot_cooldown -= 1
    if game.key_pressed("space") and shoot_cooldown <= 0:
        fire()
        shoot_cooldown = 8

    # Move bullets
    i = 0
    while i < len(bullets):
        bullets[i].move(0, -10)
        if bullets[i].y < -20:
            bullets[i].remove()
            bullets.pop(i)
            continue
        i += 1

    # Spawn UFOs
    spawn_timer += 1
    if spawn_timer >= spawn_rate:
        spawn_ufo()
        spawn_timer = 0

    # Move UFOs
    i = 0
    while i < len(ufos):
        ufos[i].move(0, ufo_speeds[i])

        # Check bullet hits
        hit = False
        j = 0
        while j < len(bullets):
            if ufos[i].touches(bullets[j]):
                game.preset("explosion", ufos[i].x + 16, ufos[i].y + 16)
                game.sound(300, 150)
                score.add(10)
                wave_kills += 1
                ufos[i].remove()
                ufos.pop(i)
                ufo_speeds.pop(i)
                bullets[j].remove()
                bullets.pop(j)
                hit = True
                break
            j += 1
        if hit:
            continue

        # UFO hits ship
        if ufos[i].touches(ship):
            game.preset("fire", ship.x + 16, ship.y + 16)
            game.shake(8, 300)
            game.flash("red", 100)
            lives.lose()
            ufos[i].remove()
            ufos.pop(i)
            ufo_speeds.pop(i)
            if lives.is_dead():
                game_over = True
                game.Message("GAME OVER!\\nScore: " + str(score.value), 0, "red", 36)
            continue

        # UFO escapes
        if ufos[i].y > H + 30:
            ufos[i].remove()
            ufos.pop(i)
            ufo_speeds.pop(i)
            continue

        i += 1

    # Wave progression
    if wave_kills >= 8 + wave * 4:
        wave += 1
        wave_kills = 0
        spawn_rate = max(15, spawn_rate - 5)
        wave_text.content = "Wave " + str(wave)
        game.flash("cyan", 100)
        game.preset("sparkle", W / 2, H / 2)

game.on_update(update)
game.start()
`,
  },
  {
    name: "Music & Sounds",
    description: "Play tones, notes, and melodies",
    code: `import game

game.title("Music & Sounds")
game.background("#0d1117")

game.Text("Click keys to play notes!", 100, 20, "white", 20)
game.Text("Press 1-7 for a scale", 130, 50, "gray", 14)
game.Text("Press SPACE for a melody", 120, 75, "gray", 14)

# Piano keys
notes = ["C4", "D4", "E4", "F4", "G4", "A4", "B4"]
colors = ["#ef4444", "#fb923c", "#fbbf24", "#4ade80", "#22d3ee", "#4a9eff", "#a78bfa"]
keys = []

for i in range(7):
    kw = 70
    kx = 30 + i * (kw + 10)
    ky = 150
    k = game.Rect(kx, ky, kw, 180, colors[i])
    label = game.Text(notes[i], kx + 12, ky + 140, "white", 16)
    num = game.Text(str(i + 1), kx + 28, ky + 10, "white", 20)
    keys.append(k)

# Waveform selector
wave_types = ["square", "sine", "sawtooth", "triangle"]
wave_idx = 0
wave_label = game.Text("Wave: square", 20, 380, "#58a6ff", 16)

# Melody state
melody = ["E4", "E4", "F4", "G4", "G4", "F4", "E4", "D4",
          "C4", "C4", "D4", "E4", "E4", "D4", "D4"]
melody_pos = -1
melody_timer = 0
playing_melody = False

# Volume bar
vol = 0.2
vol_bar = game.Rect(20, 430, int(vol * 500), 12, "#4ade80")
vol_label = game.Text("Vol: " + str(int(vol * 100)) + "%", 20, 450, "gray", 12)

def update():
    global wave_idx, melody_pos, melody_timer, playing_melody, vol

    # Number keys play individual notes
    for i in range(7):
        if game.key_pressed(str(i + 1)):
            game.note(notes[i], 250, vol, wave_types[wave_idx])
            keys[i].color = "white"
        else:
            keys[i].color = colors[i]

    # W to change waveform
    if game.key_pressed("w"):
        wave_idx = (wave_idx + 1) % 4
        wave_label.content = "Wave: " + wave_types[wave_idx]

    # UP/DOWN to change volume
    if game.key_pressed("up"):
        vol = min(1.0, vol + 0.02)
    if game.key_pressed("down"):
        vol = max(0.0, vol - 0.02)
    vol_bar.width = int(vol * 500)
    vol_label.content = "Vol: " + str(int(vol * 100)) + "%"

    # SPACE to play melody
    if game.key_pressed("space") and not playing_melody:
        playing_melody = True
        melody_pos = 0
        melody_timer = 0

    if playing_melody:
        melody_timer += 1
        if melody_timer % 12 == 0:
            if melody_pos < len(melody):
                game.note(melody[melody_pos], 200, vol, wave_types[wave_idx])
                # Highlight the key
                n = melody[melody_pos]
                if n in notes:
                    idx = notes.index(n)
                    keys[idx].color = "white"
                melody_pos += 1
            else:
                playing_melody = False

    # Upload your own sounds in the Sounds tab!
    # Then play them with: game.play_sound("sound_name")

game.on_update(update)
game.start()
`,
  },
  {
    name: "Input Demo",
    description: "Mouse clicks, key events, just-pressed detection",
    code: `import game

game.title("Input Demo")
game.background("#0d1117")

game.Text("Click anywhere or press any key!", 60, 20, "white", 20)

# Marker that follows the mouse
marker = game.Circle(300, 300, 12, "#58a6ff", True)

# Display labels
key_label = game.Text("Key: (none)", 20, 560, "gray", 16)
click_label = game.Text("Click: (none)", 320, 560, "gray", 16)
counter = 0
click_count = 0

# Dots placed on click
dots = []

# Event-driven: called once per key press
def on_key_press(key):
    game.tone(440 + len(key) * 50, 80, 0.1, "sine")

game.on_key(on_key_press)

# Event-driven: called once per mouse click
def on_mouse_click(x, y):
    global click_count
    click_count += 1
    dot = game.Circle(x, y, 8, "lime")
    dots.append(dot)
    game.tone(600, 60, 0.1, "sine")
    if len(dots) > 20:
        dots[0].remove()
        dots.pop(0)

game.on_click(on_mouse_click)

def update():
    global counter

    # Smooth marker follows mouse
    marker.x += (game.mouse_x() - marker.x) * 0.2
    marker.y += (game.mouse_y() - marker.y) * 0.15

    # Change marker color when mouse held
    if game.mouse_down():
        marker.color = "#f97316"
        marker.radius = 16
    else:
        marker.color = "#58a6ff"
        marker.radius = 12

    # Detect single-frame key press (not held)
    if game.key_just_pressed("space"):
        counter += 1
        for d in dots:
            d.remove()
        dots.clear()

    # Show held keys
    held = []
    for k in ["up","down","left","right","space","a","w","s","d"]:
        if game.key_pressed(k):
            held.append(k)
    if held:
        key_label.content = "Held: " + ", ".join(held)
        key_label.color = "#4ade80"
    else:
        key_label.content = "Key: (none)"
        key_label.color = "gray"

    click_label.content = "Clicks: " + str(click_count) + "  SPACE clears: " + str(counter)

game.on_update(update)
game.start()
`,
  },
  {
    name: "Fancy Text",
    description: "Text styling: bold, italic, outline, shadow, backgrounds",
    code: `import game

game.title("Fancy Text Demo")
game.background("#0f0f23")

# Big bold title with outline
title = game.Text("STEMPLITUDE", 300, 30, "#FF6B35", 48)
title.bold = True
title.font = "Impact"
title.align = "center"
title.outline_color = "#0066FF"
title.outline_width = 3

# Italic subtitle with shadow
sub = game.Text("Where Creativity Meets Engineering", 300, 90, "#82aaff", 18)
sub.italic = True
sub.font = "Georgia"
sub.align = "center"
sub.shadow_color = "rgba(0,0,0,0.6)"
sub.shadow_blur = 6
sub.shadow_x = 2
sub.shadow_y = 2

# Text with background (badge style)
badge = game.Text(" NEW! ", 300, 140, "white", 16)
badge.bold = True
badge.font = "Arial"
badge.align = "center"
badge.background = "#e74c3c"
badge.padding = 6

# Underline and strikethrough
info = game.Text("Underlined text", 50, 200, "#4ade80", 22)
info.underline = True
info.font = "Arial"

old = game.Text("Old price: $299", 50, 240, "#888", 20)
old.strikethrough = True
old.font = "Arial"

deal = game.Text("Now: $150/month!", 50, 275, "#ffe082", 24)
deal.bold = True
deal.font = "Arial"

# Letter spacing
spaced = game.Text("W I D E  T E X T", 300, 340, "cyan", 20)
spaced.font = "monospace"
spaced.align = "center"
spaced.letter_spacing = 4

# Glowing neon effect
neon = game.Text("GAME ON", 300, 400, "#0ff", 52)
neon.bold = True
neon.font = "Impact"
neon.align = "center"
neon.shadow_color = "#0ff"
neon.shadow_blur = 20

# Animate the neon glow
glow_up = True
def update():
    global glow_up
    b = neon.shadow_blur
    if glow_up:
        b = b + 0.3
        if b > 30: glow_up = False
    else:
        b = b - 0.3
        if b < 5: glow_up = True
    neon.shadow_blur = b

game.on_update(update)
game.start()
`,
  },
  {
    name: "Talk Bubbles",
    description: "Speech and thought bubbles on any game object",
    code: `import game

game.title("Talk Bubbles")
game.background("#2d5a27")

# --- Characters ---
wizard = game.Sprite("wizard", 80, 300, 5)
ghost = game.Sprite("ghost", 420, 280, 5)
slime = game.Sprite("slime", 250, 450, 4)
npc = game.Sprite("princess", 480, 120, 5)

# Scenery
for i in range(8):
    game.Sprite("flower", game.random_int(0, 560), game.random_int(80, 560), 3)
game.Sprite("tree", 20, 50, 5)
game.Sprite("tree", 500, 380, 5)
game.Sprite("house", 300, 30, 6)

# --- Shapes can talk too! ---
sign = game.Rect(130, 100, 100, 50, "#8B4513")
sign_text = game.Text("SIGN", 155, 115, "white", 16)

# --- HUD ---
info = game.Text("Click any character to hear them speak!", 10, 10, "white", 16)
info.bold = True
tip = game.Text("Right-click the ghost to see it think!", 10, 35, "#aaa", 13)

# --- Initial greetings ---
wizard.say("Welcome to the village!", 4000)
game.after(500, lambda: ghost.think("I'm so spooky...", 3500))
game.after(1000, lambda: slime.say("Bloop!", 2500))
game.after(1500, lambda: npc.say("Hello there, traveler!", 3000))

# --- Conversations ---
lines_wizard = [
    "I cast fireball!",
    "Need a potion?",
    "The dungeon is dangerous...",
    "Watch out for ghosts!",
    "I've been studying spells all day.",
]

lines_ghost = [
    "Boo!",
    "I'm not scary, I promise.",
    "Want to be friends?",
    "I float because I can.",
    "The afterlife is boring.",
]

lines_slime = [
    "Bloop bloop!",
    "I'm squishy!",
    "Don't step on me!",
    "Slime time!",
]

lines_npc = [
    "The wizard can help you.",
    "Have you seen the key?",
    "Beware of the forest at night!",
    "I love this village.",
]

line_idx = {"wizard": 0, "ghost": 0, "slime": 0, "npc": 0}

def on_click_wizard(s, x, y):
    i = line_idx["wizard"]
    wizard.say(lines_wizard[i], 3000)
    line_idx["wizard"] = (i + 1) % len(lines_wizard)

def on_click_ghost(s, x, y):
    i = line_idx["ghost"]
    ghost.say(lines_ghost[i], 3000)
    line_idx["ghost"] = (i + 1) % len(lines_ghost)

def on_click_slime(s, x, y):
    i = line_idx["slime"]
    slime.say(lines_slime[i], 2500)
    line_idx["slime"] = (i + 1) % len(lines_slime)

def on_click_npc(s, x, y):
    i = line_idx["npc"]
    npc.say(lines_npc[i], 3000)
    line_idx["npc"] = (i + 1) % len(lines_npc)

def on_click_sign(s, x, y):
    sign.say("This is a sign. Signs can talk now!", 3000, 30)

wizard.on_click(on_click_wizard)
ghost.on_click(on_click_ghost)
slime.on_click(on_click_slime)
npc.on_click(on_click_npc)
sign.on_click(on_click_sign)

# Right-click ghost to see thought bubble
think_idx = [0]
think_lines = [
    "Why do they always run from me?",
    "Maybe I should try being less transparent.",
    "I wonder what it's like to eat food...",
    "Being a ghost is lonely sometimes.",
]

# Long text scroll demo
def demo_scroll():
    wizard.say("This is a long message to demonstrate the scrolling feature. When the text is too long for the bubble, it automatically scrolls up and down so you can read everything!", 8000, 35)

game.after(6000, demo_scroll)

# --- Movement ---
facing_right = True
def update():
    global facing_right
    speed = 3
    if game.key_pressed("right"):
        wizard.move(speed, 0)
        if not facing_right:
            wizard.flip_x = False
            facing_right = True
    if game.key_pressed("left"):
        wizard.move(-speed, 0)
        if facing_right:
            wizard.flip_x = True
            facing_right = False
    if game.key_pressed("up"):
        wizard.move(0, -speed)
    if game.key_pressed("down"):
        wizard.move(0, speed)
    wizard.keep_inside()

    # Ghost floats up and down
    ghost.move(0, game.random_float(-0.5, 0.5))
    ghost.keep_inside()

    # Slime bounces
    slime.move(game.random_float(-0.3, 0.3), 0)
    slime.keep_inside()

game.on_update(update)
game.start()
`,
  },
  {
    name: "Game Menu",
    description: "Buttons for menus, HUDs, retries, and pause screens",
    code: `import game

game.title("Game Menu Demo")
game.background("#1a1a2e")

# ---- State ----
state = "menu"  # "menu", "playing", "paused", "gameover"
score = 0
player = None
stars = []

# ---- Menu Screen ----
title_text = game.Text("STAR CATCHER", 300, 80, "#FF6B35", 40)
title_text.bold = True
title_text.font = "Impact"
title_text.align = "center"
title_text.shadow_color = "#FF6B35"
title_text.shadow_blur = 15

play_btn = game.Button("Play Game", 200, 220, 200, 50, "#FF6B35")
play_btn.hover_color = "#ff8c55"
play_btn.press_color = "#e05520"
play_btn.radius = 12
play_btn.shadow_color = "rgba(255,107,53,0.4)"
play_btn.shadow_blur = 10
play_btn.shadow_y = 4

how_btn = game.Button("How to Play", 200, 290, 200, 50)
how_btn.color = "#0066FF"
how_btn.hover_color = "#2288ff"
how_btn.radius = 12

quit_btn = game.Button("Quit", 200, 360, 200, 50)
quit_btn.color = "#444"
quit_btn.hover_color = "#666"
quit_btn.radius = 12

# ---- Game HUD ----
score_label = game.Text("Score: 0", 10, 10, "white", 20)
score_label.bold = True
score_label.font = "Arial"
score_label.visible = False

pause_btn = game.Button("||", 555, 5, 40, 35, "#333")
pause_btn.hover_color = "#555"
pause_btn.radius = 6
pause_btn.text_size = 16
pause_btn.visible = False

# ---- Pause overlay ----
pause_bg = game.Rect(100, 150, 400, 300, "rgba(0,0,0,0.8)")
pause_bg.visible = False
pause_title = game.Text("PAUSED", 300, 190, "white", 36)
pause_title.bold = True
pause_title.font = "Impact"
pause_title.align = "center"
pause_title.visible = False

resume_btn = game.Button("Resume", 200, 270, 200, 50, "#4ade80")
resume_btn.hover_color = "#6ee7a0"
resume_btn.radius = 12
resume_btn.visible = False

menu_btn = game.Button("Main Menu", 200, 340, 200, 50, "#888")
menu_btn.hover_color = "#aaa"
menu_btn.radius = 12
menu_btn.visible = False

# ---- Game Over ----
go_title = game.Text("GAME OVER", 300, 150, "#ff4444", 44)
go_title.bold = True
go_title.font = "Impact"
go_title.align = "center"
go_title.visible = False

go_score = game.Text("", 300, 220, "white", 24)
go_score.font = "Arial"
go_score.align = "center"
go_score.visible = False

retry_btn = game.Button("Try Again", 200, 300, 200, 50, "#FF6B35")
retry_btn.hover_color = "#ff8c55"
retry_btn.radius = 12
retry_btn.visible = False

go_menu_btn = game.Button("Main Menu", 200, 370, 200, 50, "#555")
go_menu_btn.hover_color = "#777"
go_menu_btn.radius = 12
go_menu_btn.visible = False

def show_screen(name):
    is_menu = name == "menu"
    is_play = name == "playing"
    is_pause = name == "paused"
    is_over = name == "gameover"

    for obj in [title_text, play_btn, how_btn, quit_btn]:
        obj.visible = is_menu
    for obj in [score_label, pause_btn]:
        obj.visible = is_play or is_pause
    for obj in [pause_bg, pause_title, resume_btn, menu_btn]:
        obj.visible = is_pause
    for obj in [go_title, go_score, retry_btn, go_menu_btn]:
        obj.visible = is_over

def start_game():
    global state, score, player, stars
    state = "playing"
    score = 0
    score_label.content = "Score: 0"
    for s in stars:
        s.remove()
    stars = []
    if player:
        player.remove()
    player = game.Rect(275, 520, 50, 50, "cyan")
    show_screen("playing")

def spawn_star():
    x = game.random_int(20, 560)
    s = game.Circle(x, -10, 12, "gold")
    stars.append(s)

play_btn.on_click(lambda s, x, y: start_game())
how_btn.on_click(lambda s, x, y: None)
quit_btn.on_click(lambda s, x, y: game.stop())
pause_btn.on_click(lambda s, x, y: pause_game())
resume_btn.on_click(lambda s, x, y: resume_game())
menu_btn.on_click(lambda s, x, y: go_to_menu())
retry_btn.on_click(lambda s, x, y: start_game())
go_menu_btn.on_click(lambda s, x, y: go_to_menu())

def pause_game():
    global state
    state = "paused"
    show_screen("paused")

def resume_game():
    global state
    state = "playing"
    show_screen("playing")

def go_to_menu():
    global state, player, stars
    state = "menu"
    if player:
        player.remove()
        player = None
    for s in stars:
        s.remove()
    stars = []
    show_screen("menu")

def update():
    global score, state
    if state != "playing":
        return

    if game.key_pressed("left") and player.x > 0:
        player.move(-6, 0)
    if game.key_pressed("right") and player.x < 550:
        player.move(6, 0)
    if game.key_just_pressed("escape"):
        pause_game()
        return

    if game.frame_count() % 30 == 0:
        spawn_star()

    for s in stars[:]:
        s.move(0, 3)
        if s.touches(player):
            score = score + 1
            score_label.content = "Score: " + str(score)
            game.tone(660, 80, 0.1, "sine")
            s.remove()
            stars.remove(s)
        elif s.is_out():
            state = "gameover"
            go_score.content = "Final Score: " + str(score)
            show_screen("gameover")
            game.tone(200, 400, 0.15, "sawtooth")
            return

game.on_update(update)
show_screen("menu")
game.start()
`,
  },
  {
    name: "Physics Playground",
    description: "Gravity, bounce, velocity, and friction",
    code: `import game

game.title("Physics Playground")
game.background("#0f0f23")

info = game.Text("Click to spawn bouncy balls! Arrow keys = wind", 300, 15, "gray", 14)
info.align = "center"

balls = []

def spawn(x, y):
    colors = ["#ff4444", "#44ff44", "#4488ff", "#ffff44", "#ff44ff", "#44ffff", "#ff8800"]
    c = game.choice(colors)
    ball = game.Circle(x, y, game.random_int(8, 20), c)
    ball.vx = game.random_float(-3, 3)
    ball.vy = game.random_float(-5, -1)
    ball.ay = 0.4
    ball.bounce = game.random_float(0.6, 0.95)
    ball.friction = 0.999
    balls.append(ball)
    game.emit(x, y, {"color": c, "count": 10, "speed": 2, "life": 20})

game.on_click(lambda x, y: spawn(x, y))

def update():
    if game.key_pressed("left"):
        for b in balls:
            b.vx = b.vx - 0.2
    if game.key_pressed("right"):
        for b in balls:
            b.vx = b.vx + 0.2
    if game.key_pressed("up"):
        for b in balls:
            b.vy = b.vy - 0.5
    if game.key_just_pressed("r"):
        for b in balls:
            b.remove()
        balls.clear()

game.on_update(update)
game.start()
`,
  },
  {
    name: "Tweens & Effects",
    description: "Smooth animations, particles, screen shake, transitions",
    code: `import game

game.title("Tweens & Effects")
game.background("#1a1a2e")

title = game.Text("Click the boxes!", 300, 30, "white", 22)
title.bold = True
title.font = "Arial"
title.align = "center"

score = 0
score_text = game.Text("Score: 0", 300, 560, "gray", 16)
score_text.align = "center"
score_text.font = "Arial"

boxes = []
for i in range(5):
    x = 60 + i * 110
    b = game.Rect(x, 250, 60, 60, game.random_color())
    b.opacity = 0
    game.tween(b, "opacity", 1, 500 + i * 200, "ease_out")
    game.tween(b, "y", 250, 800 + i * 150, "bounce")

    def make_click(box):
        def on_click(self, mx, my):
            global score
            score = score + 1
            score_text.content = "Score: " + str(score)
            game.emit(box.x + 30, box.y + 30, {"color": box.color, "count": 25, "speed": 4, "shape": "star"})
            game.shake(4, 200)
            game.tone(440 + score * 40, 100, 0.1, "sine")
            box.color = game.random_color()
            game.tween(box, "rotation", box.rotation + 360, 500, "ease_out")
            game.tween(box, "y", box.y - 30, 200, "ease_out")
            game.after(200, lambda: game.tween(box, "y", 250, 400, "bounce"))
        return on_click

    b.on_click(make_click(b))
    boxes.append(b)

# Transition demo button
def do_transition(self, mx, my):
    game.flash("white", 150)
    game.transition("circle", 1000, "black",
        lambda: game.background(game.random_color()),
        None)

trans_btn = game.Button("Transition!", 230, 450, 140, 40, "#0066FF")
trans_btn.hover_color = "#2288ff"
trans_btn.radius = 10
trans_btn.on_click(do_transition)

# High score with persistent storage
best = game.load("best_score", 0)
best_text = game.Text("Best: " + str(best), 300, 580, "#666", 14)
best_text.align = "center"
best_text.font = "Arial"

def update():
    global best
    if score > best:
        best = score
        game.save("best_score", best)
        best_text.content = "Best: " + str(best)

game.on_update(update)
game.start()
`,
  },
  {
    name: "Particle Showcase",
    description: "Presets, shapes, emitters, and custom particles",
    code: `import game

game.title("Particle Showcase")
game.background("#111122")
W = game.WIDTH
H = game.HEIGHT

label = game.Text("Click anywhere! Press 1-9 for presets", W / 2, 20, "white", 18)
label.align = "center"
label.font = "Arial"

info = game.Text("", W / 2, H - 20, "#888", 14)
info.align = "center"
info.font = "Arial"

shape_label = game.Text("", W / 2, H - 40, "#aaa", 14)
shape_label.align = "center"
shape_label.font = "Arial"

shapes = ["circle", "star", "square", "spark", "ring", "heart", "diamond", "triangle"]
shape_idx = 0

# Continuous emitter following a moving circle
orb = game.Circle(W / 2, H / 2, 12, "cyan")
trail = game.Emitter(W / 2, H / 2, {
    "rate": 1.5, "shape": "circle",
    "colors": ["cyan", "#0088ff", "#00ccff"],
    "count": 1, "speed": 0.8, "size": 6,
    "life": 25, "shrink": True, "fade": True
})

angle = 0

presets = {
    "1": "explosion", "2": "sparkle", "3": "smoke",
    "4": "fire", "5": "confetti", "6": "snow",
    "7": "hearts", "8": "bubbles", "9": "magic"
}

def on_click(mx, my):
    global shape_idx
    game.emit(mx, my, {
        "shape": shapes[shape_idx],
        "colors": ["#ff4444", "#ffcc00", "#ff6b35", "#ffffff"],
        "count": 30, "speed": 5, "size": 8,
        "gravity": 0.1, "spin": 0.1
    })
    shape_label.content = "Shape: " + shapes[shape_idx]
    shape_idx = (shape_idx + 1) % len(shapes)

game.on_click(on_click)

def on_key(key):
    if key in presets:
        name = presets[key]
        game.preset(name, W / 2, H / 2)
        info.content = "Preset: " + name
    elif key == "space":
        game.preset("explosion", W / 2, H / 2, {"count": 60, "speed": 8, "size": 10})
        info.content = "Big Explosion!"

game.on_key(on_key)

import math
def update():
    global angle
    angle = angle + 0.03
    ox = W / 2 + math.cos(angle) * 120
    oy = H / 2 + math.sin(angle) * 80
    orb.x = ox
    orb.y = oy
    game.move_emitter(trail, ox, oy)

game.on_update(update)
game.start()
`,
  },
  {
    name: "Groups & Collision",
    description: "Object groups, keep_inside, push_out",
    code: `import game

game.title("Groups & Collision")
game.background("#0a0a23")

W = game.WIDTH
H = game.HEIGHT

# Player
player = game.Rect(W / 2 - 15, H - 60, 30, 30, "cyan")
speed = 5

# Walls
walls = game.Group()
walls.add(game.Rect(100, 200, 200, 20, "#444"))
walls.add(game.Rect(300, 350, 200, 20, "#444"))
walls.add(game.Rect(50, 480, 150, 20, "#444"))
walls.add(game.Rect(400, 100, 20, 200, "#444"))

# Coins
coins = game.Group()
for i in range(8):
    c = game.Circle(
        game.random_int(40, W - 40),
        game.random_int(40, H - 40),
        8, "gold"
    )
    coins.add(c)

score = 0
score_text = game.Text("Coins: 0", 10, 10, "white", 22)
info = game.Text("Arrow keys to move, collect coins!", 120, H - 20, "gray", 14)

def update():
    global score

    # Movement
    if game.key_pressed("left"):
        player.x -= speed
    if game.key_pressed("right"):
        player.x += speed
    if game.key_pressed("up"):
        player.y -= speed
    if game.key_pressed("down"):
        player.y += speed

    # Stay on screen
    player.keep_inside()

    # Solid walls
    def check_wall(w):
        if player.touches(w):
            player.push_out(w)
    walls.for_each(check_wall)

    # Collect coins
    for c in coins.get_touching(player):
        score += 1
        score_text.content = "Coins: " + str(score)
        game.preset("sparkle", c.x, c.y)
        game.sound(660 + score * 40, 100, "sine")
        c.remove()
        coins.remove(c)

    if coins.count() == 0:
        score_text.content = "You win! All coins collected!"
        game.preset("confetti", W / 2, H / 2)

game.on_update(update)
game.start()
`,
  },
  {
    name: "Scenes / Levels",
    description: "Multi-scene game with menu and levels",
    code: `import game

game.title("Scene Demo")
W = game.WIDTH
H = game.HEIGHT

score = 0

# ===== Menu Scene =====
def build_menu():
    game.background("#0a0a23")
    game.Text("Space Runner", 130, 150, "cyan", 42)
    game.Text("Dodge the red blocks!", 170, 220, "gray", 18)

    play_btn = game.Button("Play Level 1", 200, 320, 200, 50, "#238636")
    def go_play(b, x, y):
        game.scene("level1")
    play_btn.on_click(go_play)

game.on_scene("menu", build_menu)

# ===== Level 1 =====
def build_level1():
    global score
    score = 0
    game.background("#1a1a2e")

    p = game.Rect(W / 2 - 15, H - 60, 30, 30, "cyan")
    score_text = game.Text("Score: 0", 10, 10, "white", 22)
    level_text = game.Text("Level 1", W - 100, 10, "#58a6ff", 18)
    enemies = game.Group()

    def spawn():
        e = game.Rect(
            game.random_int(0, W - 30), -30,
            30, 30, "red"
        )
        e.vy = game.random_int(2, 4)
        enemies.add(e)
    game.every(800, spawn)

    def update():
        global score
        if game.key_pressed("left"):
            p.x -= 6
        if game.key_pressed("right"):
            p.x += 6
        p.keep_inside()

        def move_e(e):
            if e.is_out():
                e.remove()
                enemies.remove(e)
        enemies.for_each(move_e)

        if enemies.any_touch(p):
            game.shake(10, 300)
            game.flash("red", 200)
            game.transition("fade", 400, "black",
                lambda: game.scene("gameover"))
            return

        score += 1
        score_text.content = "Score: " + str(score)

        if score >= 300:
            game.transition("wipe_right", 500, "black",
                lambda: game.scene("level2"))

    game.on_update(update)
    game.start()

game.on_scene("level1", build_level1)

# ===== Level 2 =====
def build_level2():
    game.background("#1a0a2e")
    game.Text("Level 2 - Harder!", 180, 280, "gold", 28)
    game.Text("(You made it!)", 220, 330, "gray", 16)
    btn = game.Button("Back to Menu", 200, 400, 200, 50, "#FF6B35")
    btn.on_click(lambda b, x, y: game.scene("menu"))

game.on_scene("level2", build_level2)

# ===== Game Over =====
def build_gameover():
    game.background("#1a0a0a")
    game.Text("Game Over", 180, 200, "red", 40)
    game.Text("Score: " + str(score), 230, 270, "white", 24)
    retry = game.Button("Retry", 180, 350, 100, 45, "#238636")
    retry.on_click(lambda b, x, y: game.scene("level1"))
    menu = game.Button("Menu", 310, 350, 100, 45, "#FF6B35")
    menu.on_click(lambda b, x, y: game.scene("menu"))

game.on_scene("gameover", build_gameover)

# Start at the menu
game.scene("menu")
game.start()
`,
  },
];
