import { BaseScene } from "./BaseScene";
import { EditorScene } from "./EditorScene";
import { Motor } from "./components/Motor";
import { Gear } from "./components/Gear";
import { Pulley } from "./components/Pulley";
import { Forklift } from "./components/Forklift";

export class DemoScene extends BaseScene {
  private autoStartTimeouts: number[] = [];
  private manualControlUsed: boolean = false;
  private editorScene: EditorScene;

  constructor() {
    super();
    this.editorScene = new EditorScene();
  }

  /**
   * Clear all auto-start timeouts and enable manual control
   */
  private enableManualControl(): void {
    this.manualControlUsed = true;
    this.autoStartTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.autoStartTimeouts = [];
    console.log("Manual control enabled - auto-start timeouts cleared");
  }

  /**
   * Create the demo scene with motor → pulley → gear → forklift chain
   */
  public createDemoScene(): void {
    // Create motor with pulley
    const motor = new Motor("demo_motor", {
      radius: 15,
      mass: 5,
      inertia: 2,
      friction: 0.1,
      efficiency: 0.95,
      maxRPM: 1200,
      nominalTorque: 50,
      pulleyRadius: 20,
    });
    motor.setPosition(100, 200);
    this.addMechanicalComponent("motor", motor);

    // Create intermediate pulley
    const pulley1 = new Pulley("intermediate_pulley", {
      radius: 30,
      grooveDepth: 3,
      mass: 2,
      inertia: 1,
      friction: 0.05,
      efficiency: 0.98,
    });
    pulley1.setPosition(250, 200);
    this.addMechanicalComponent("pulley1", pulley1);

    // Create gear system
    const gear1 = new Gear("gear1", {
      radius: 25,
      beltRadius: 20,
      teeth: 20,
      mass: 3,
      inertia: 1.5,
      friction: 0.08,
      efficiency: 0.96,
    });
    gear1.setPosition(400, 200);
    this.addMechanicalComponent("gear1", gear1);

    const gear2 = new Gear("gear2", {
      radius: 40,
      beltRadius: 35,
      teeth: 32,
      mass: 5,
      inertia: 3,
      friction: 0.08,
      efficiency: 0.96,
    });
    gear2.setPosition(470, 200); // Positioned for gear meshing
    this.addMechanicalComponent("gear2", gear2);

    // Create second pulley after gears
    const pulley2 = new Pulley("pulley2", {
      radius: 15,
      grooveDepth: 2,
      mass: 1.5,
      inertia: 0.8,
      friction: 0.05,
      efficiency: 0.98,
    });
    pulley2.setPosition(600, 200);
    this.addMechanicalComponent("pulley2", pulley2);

    // Create forklift
    const forklift = new Forklift("forklift", {
      radius: 10,
      mass: 20,
      inertia: 5,
      friction: 0.1,
      efficiency: 0.92,
      armLength: 60,
      baseHeight: 20,
      maxLiftWeight: 500,
      gearRatio: 5, // 5:1 reduction for lifting
      pulleyRadius: 8,
    });
    forklift.setPosition(750, 250);
    this.addMechanicalComponent("forklift", forklift);

    // Add a load to the forklift
    forklift.loadItem({
      weight: 200, // 200N load
      name: "Box",
      color: 0xcc6600,
    });

    // Create belt connections

    // Belt 1: Motor to Pulley1 (High resolution - very smooth)
    console.log("Creating belt connection: motor to pulley1");
    this.createBeltConnection(
      "motor",
      "pulley1",
      {
        maxLength: 200,
        width: 2,
        tensionCapacity: 100,
        slipCoefficient: 0.8,
        mass: 1,
        inertia: 0.1,
        friction: 0.1,
        efficiency: 0.96,
        arcResolution: 12, // High resolution for ultra-smooth belts
      },
      {
        radius1: 20, // Motor pulley radius
        radius2: 30, // Pulley1 radius
        crossed: false,
      },
    );

    // Belt 2: Pulley1 to Gear1 (Low resolution - more angular)
    console.log("Creating belt connection: pulley1 to gear1");
    this.createBeltConnection(
      "pulley1",
      "gear1",
      {
        maxLength: 180,
        width: 2,
        tensionCapacity: 80,
        slipCoefficient: 0.8,
        mass: 0.8,
        inertia: 0.08,
        friction: 0.1,
        efficiency: 0.96,
        arcResolution: 3, // Low resolution for more angular appearance
      },
      {
        radius1: 30, // Pulley1 radius
        radius2: 20, // Gear1 belt radius
        crossed: false,
      },
    );

    // Gear meshing: Gear1 to Gear2
    this.connectComponents("gear1", "gear2", "gear_mesh");

    // Belt 3: Gear2 to Pulley2 (Default resolution)
    this.createBeltConnection(
      "gear2",
      "pulley2",
      {
        maxLength: 160,
        width: 2,
        tensionCapacity: 60,
        slipCoefficient: 0.8,
        mass: 0.6,
        inertia: 0.06,
        friction: 0.1,
        efficiency: 0.96,
        // arcResolution not specified - will use default (6)
      },
      {
        radius1: 35, // Gear2 belt radius
        radius2: 15, // Pulley2 radius
        crossed: false,
      },
    );

    // Belt 4: Pulley2 to Forklift
    this.createBeltConnection(
      "pulley2",
      "forklift",
      {
        maxLength: 180,
        width: 2,
        tensionCapacity: 80,
        slipCoefficient: 0.9,
        mass: 0.7,
        inertia: 0.07,
        friction: 0.1,
        efficiency: 0.94,
      },
      {
        radius1: 15, // Pulley2 radius
        radius2: 8, // Forklift pulley radius
        crossed: false,
      },
    );

    console.log(
      "Demo scene created with motor → pulley → gear → forklift chain",
    );

    // Center camera on all components
    this.getGameManager().recenterCamera();

    // Start the motor after a short delay (unless manual control is used)
    const autoStartTimeout = setTimeout(() => {
      if (!this.manualControlUsed) {
        motor.start(300); // Start at 300 RPM
        console.log("Motor auto-started at 300 RPM");
      } else {
        console.log("Auto-start skipped - manual control was used");
      }
    }, 1000);
    this.autoStartTimeouts.push(autoStartTimeout);
  }

  /**
   * Create alternative demo with crossed belt
   */
  public createCrossedBeltDemo(): void {
    // Create two motors with crossed belt connection
    const motor1 = new Motor("motor1", {
      radius: 15,
      mass: 3,
      inertia: 1.5,
      friction: 0.1,
      efficiency: 0.95,
      maxRPM: 800,
      nominalTorque: 40,
      pulleyRadius: 25,
    });
    motor1.setPosition(150, 150);
    this.addMechanicalComponent("motor", motor1); // Use consistent "motor" name for UI controls

    const motor2 = new Motor("motor2", {
      radius: 15,
      mass: 3,
      inertia: 1.5,
      friction: 0.1,
      efficiency: 0.95,
      maxRPM: 800,
      nominalTorque: 40,
      pulleyRadius: 25,
    });
    motor2.setPosition(350, 350);
    this.addMechanicalComponent("motor2", motor2);

    // Crossed belt connection
    console.log("Creating crossed belt connection: motor to motor2");
    this.createBeltConnection(
      "motor",
      "motor2",
      {
        maxLength: 300,
        width: 3,
        tensionCapacity: 120,
        slipCoefficient: 0.8,
        mass: 1.2,
        inertia: 0.12,
        friction: 0.1,
        efficiency: 0.96,
      },
      {
        radius1: 25,
        radius2: 25,
        crossed: true, // Crossed belt - motors will rotate in opposite directions
      },
    );

    // Center camera on all components
    this.getGameManager().recenterCamera();

    // Start first motor (unless manual control is used)
    const autoStartTimeout2 = setTimeout(() => {
      if (!this.manualControlUsed) {
        motor1.start(200);
        console.log(
          "Crossed belt demo: Motor1 auto-started, Motor2 should rotate opposite direction",
        );
      } else {
        console.log(
          "Auto-start skipped for crossed belt demo - manual control was used",
        );
      }
    }, 500);
    this.autoStartTimeouts.push(autoStartTimeout2);
  }

  /**
   * Create gear train demo
   */
  public createGearTrainDemo(): void {
    // Create a series of meshing gears with increasing size
    const gearSizes = [
      { teeth: 12, radius: 15 },
      { teeth: 20, radius: 25 },
      { teeth: 32, radius: 40 },
      { teeth: 50, radius: 62 },
    ];

    let x = 100;
    const y = 300;

    let prevX = 0;

    for (let i = 0; i < gearSizes.length; i++) {
      const gearData = gearSizes[i];

      // Calculate position for proper meshing
      if (i === 0) {
        x = 100; // Starting position
      } else {
        const prevRadius = gearSizes[i - 1].radius;
        x = prevX + prevRadius + gearData.radius; // Gears touch exactly
      }

      const gear = new Gear(`gear_train_${i}`, {
        radius: gearData.radius,
        beltRadius: gearData.radius * 0.8,
        teeth: gearData.teeth,
        mass: gearData.radius * 0.1,
        inertia: gearData.radius * 0.05,
        friction: 0.08,
        efficiency: 0.97,
      });

      gear.setPosition(x, y);
      this.addMechanicalComponent(`gear_train_${i}`, gear);
      console.log(
        `Gear ${i}: position=(${x}, ${y}), radius=${gearData.radius}, teeth=${gearData.teeth}`,
      );

      // Connect to previous gear
      if (i > 0) {
        const prevGearData = gearSizes[i - 1];
        const distance = Math.abs(x - prevX);
        const requiredDistance = gearData.radius + prevGearData.radius;
        console.log(
          `Connecting gear ${i - 1} to gear ${i}: distance=${distance.toFixed(1)}, required=${requiredDistance}, within tolerance=${Math.abs(distance - requiredDistance) <= requiredDistance * 0.1}`,
        );

        const connected = this.connectComponents(
          `gear_train_${i - 1}`,
          `gear_train_${i}`,
          "gear_mesh",
        );

        if (!connected) {
          console.error(`Failed to connect gear ${i - 1} to gear ${i}!`);
        } else {
          console.log(`Successfully connected gear ${i - 1} to gear ${i}`);
        }
      }

      prevX = x;
    }

    // Add motor to drive the gear train
    const driveMotor = new Motor("gear_train_motor", {
      radius: 12,
      mass: 2,
      inertia: 1,
      friction: 0.1,
      efficiency: 0.95,
      maxRPM: 600,
      nominalTorque: 30,
      pulleyRadius: 15,
    });

    // Position motor close to the first gear for shaft connection
    const firstGearX = 100;
    const firstGearRadius = gearSizes[0].radius;
    const motorX = firstGearX - firstGearRadius - 25; // Position motor to the left of first gear
    driveMotor.setPosition(motorX, 300);
    this.addMechanicalComponent("motor", driveMotor); // Use consistent "motor" name for UI controls
    console.log(
      `Motor positioned at (${motorX}, 300) to drive first gear at (${firstGearX}, 300)`,
    );

    // Connect motor to first gear via shaft connection (both now support shaft_connection)
    const motorConnected = this.connectComponents(
      "motor",
      "gear_train_0",
      "shaft_connection",
    );

    if (!motorConnected) {
      console.error("Failed to connect motor to first gear!");
      console.log("Motor connection points:", driveMotor.getConnections());
      const firstGear =
        this.getGameManager().getMechanicalComponent("gear_train_0");
      if (firstGear) {
        console.log(
          "First gear connection points:",
          firstGear.getConnections(),
        );
      }
    } else {
      console.log(
        "Successfully connected motor to first gear via shaft connection",
      );
    }

    // Center camera on all components
    this.getGameManager().recenterCamera();

    // Start the gear train (unless manual control is used)
    const autoStartTimeout3 = setTimeout(() => {
      if (!this.manualControlUsed) {
        driveMotor.start(400);
        console.log(
          "Gear train demo: Motor auto-started, observe speed reduction through gear train",
        );
      } else {
        console.log(
          "Auto-start skipped for gear train demo - manual control was used",
        );
      }
    }, 1000);
    this.autoStartTimeouts.push(autoStartTimeout3);
  }

  /**
   * Get interactive controls for the demo
   */
  public createInteractiveControls(): HTMLElement {
    const controlPanel = document.createElement("div");
    controlPanel.style.position = "absolute";
    controlPanel.style.top = "10px";
    controlPanel.style.left = "10px";
    controlPanel.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
    controlPanel.style.color = "white";
    controlPanel.style.padding = "15px";
    controlPanel.style.borderRadius = "8px";
    controlPanel.style.fontFamily = "Arial, sans-serif";
    controlPanel.style.fontSize = "12px";
    controlPanel.style.zIndex = "1000";

    controlPanel.innerHTML = `
      <h3>Mechanical System Controls</h3>
      <div>
        <label>Motor Speed:</label>
        <input type="range" id="motorSpeed" min="0" max="1000" value="300" step="10">
        <span id="speedDisplay">300 RPM</span>
      </div>
      <div style="margin-top: 10px;">
        <button id="startMotor">Start Motor</button>
        <button id="stopMotor">Stop Motor</button>
        <button id="reverseMotor">Reverse</button>
      </div>
      <div style="margin-top: 10px;">
        <button id="recenterCamera">Recenter Camera</button>
      </div>
      <div style="margin-top: 10px;">
        <button id="loadDemo1">Main Demo</button>
        <button id="loadDemo2">Crossed Belt</button>
        <button id="loadDemo3">Gear Train</button>
        <button id="loadEditor" style="background: #3498db; color: white;">Scene Editor</button>
      </div>
      <div style="margin-top: 10px;">
        <label>Forklift Angle:</label>
        <input type="range" id="forkliftAngle" min="-45" max="90" value="0" step="5">
        <span id="angleDisplay">0°</span>
      </div>
    `;

    // Add event listeners
    this.setupControlEventListeners(controlPanel);

    return controlPanel;
  }

  private setupControlEventListeners(controlPanel: HTMLElement): void {
    const speedSlider = controlPanel.querySelector(
      "#motorSpeed",
    ) as HTMLInputElement;
    const speedDisplay = controlPanel.querySelector(
      "#speedDisplay",
    ) as HTMLSpanElement;
    const startButton = controlPanel.querySelector(
      "#startMotor",
    ) as HTMLButtonElement;
    const stopButton = controlPanel.querySelector(
      "#stopMotor",
    ) as HTMLButtonElement;
    const reverseButton = controlPanel.querySelector(
      "#reverseMotor",
    ) as HTMLButtonElement;
    const recenterButton = controlPanel.querySelector(
      "#recenterCamera",
    ) as HTMLButtonElement;
    const angleSlider = controlPanel.querySelector(
      "#forkliftAngle",
    ) as HTMLInputElement;
    const angleDisplay = controlPanel.querySelector(
      "#angleDisplay",
    ) as HTMLSpanElement;

    // Motor speed control
    speedSlider?.addEventListener("input", () => {
      const speed = parseInt(speedSlider.value);
      speedDisplay.textContent = `${speed} RPM`;

      const motor = this.getGameManager().getMechanicalComponent(
        "motor",
      ) as Motor;
      if (motor && motor.getIsRunning()) {
        this.enableManualControl();
        motor.setSpeed(speed);
      }
    });

    // Motor control buttons
    startButton?.addEventListener("click", () => {
      this.enableManualControl();
      const motor = this.getGameManager().getMechanicalComponent(
        "motor",
      ) as Motor;
      const speed = parseInt(speedSlider.value);
      motor?.start(speed);
    });

    stopButton?.addEventListener("click", () => {
      this.enableManualControl();
      const motor = this.getGameManager().getMechanicalComponent(
        "motor",
      ) as Motor;
      motor?.stop();
    });

    reverseButton?.addEventListener("click", () => {
      this.enableManualControl();
      const motor = this.getGameManager().getMechanicalComponent(
        "motor",
      ) as Motor;
      motor?.reverse();
    });

    // Recenter camera button
    recenterButton?.addEventListener("click", () => {
      this.getGameManager().recenterCamera();
      console.log("Camera recentered manually");
    });

    // Forklift angle control
    angleSlider?.addEventListener("input", () => {
      const angle = parseInt(angleSlider.value);
      angleDisplay.textContent = `${angle}°`;

      const forklift = this.getGameManager().getMechanicalComponent(
        "forklift",
      ) as Forklift;
      if (forklift) {
        forklift.setTargetAngle((angle * Math.PI) / 180); // Convert to radians
      }
    });

    // Demo selection buttons
    controlPanel.querySelector("#loadDemo1")?.addEventListener("click", () => {
      this.clearCurrentScene();
      this.createDemoScene();
    });

    controlPanel.querySelector("#loadDemo2")?.addEventListener("click", () => {
      this.clearCurrentScene();
      this.createCrossedBeltDemo();
    });

    controlPanel.querySelector("#loadDemo3")?.addEventListener("click", () => {
      this.clearCurrentScene();
      this.createGearTrainDemo();
    });

    controlPanel.querySelector("#loadEditor")?.addEventListener("click", () => {
      this.clearCurrentScene();
      this.editorScene.createEditorScene();
    });
  }

  private clearCurrentScene(): void {
    // Clear all auto-start timeouts
    this.autoStartTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.autoStartTimeouts = [];

    // Reset manual control flag to allow auto-start in new demo
    this.manualControlUsed = false;

    // Clear scene objects
    this.clearScene();

    console.log("Demo scene cleared - ready for new demo");
  }

  protected override onSceneCleared(): void {
    // Called after scene is cleared - can add demo-specific cleanup here
  }
}
