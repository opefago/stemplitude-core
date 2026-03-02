import { CircuitComponent, SimulationResults } from "../types/Circuit";

export interface HintMessage {
  type: "success" | "warning" | "error" | "tip";
  title: string;
  message: string;
  emoji: string;
}

export class KidsHelper {
  static getComponentDescription(component: CircuitComponent): string {
    switch (component.type) {
      case "resistor":
        return `🌊 A resistor slows down the electric current, like a narrow pipe slows down water!`;
      case "battery":
        return `🔋 A battery pushes electrons around the circuit, like a water pump!`;
      case "led":
        return `💡 An LED lights up when electrons flow through it in the right direction!`;
      case "capacitor":
        return `⚡ A capacitor stores electricity like a water tank stores water!`;
      case "switch":
        return `🔘 A switch can break or connect the circuit, like a bridge that opens and closes!`;
      case "ground":
        return `🌍 Ground is where all the electricity eventually goes, like water flowing to the ocean!`;
      default:
        return `⚙️ This is an electronic component that does something special in circuits!`;
    }
  }

  static getCircuitHints(
    components: CircuitComponent[],
    results: SimulationResults | null
  ): HintMessage[] {
    const hints: HintMessage[] = [];

    // Check if circuit is empty
    if (components.length === 0) {
      hints.push({
        type: "tip",
        title: "Getting Started",
        message:
          "Start by adding a battery from the toolbar! It will provide power to your circuit.",
        emoji: "🌟",
      });
      return hints;
    }

    const hasBattery = components.some((c) => c.type === "battery");
    const hasLED = components.some((c) => c.type === "led");
    const hasResistor = components.some((c) => c.type === "resistor");
    const hasGround = components.some((c) => c.type === "ground");

    // Battery hints
    if (!hasBattery) {
      hints.push({
        type: "tip",
        title: "Need Power!",
        message:
          "Every circuit needs a battery to push electrons around. Try adding one!",
        emoji: "🔋",
      });
    }

    // Ground hints
    if (hasBattery && !hasGround) {
      hints.push({
        type: "tip",
        title: "Complete the Circuit",
        message:
          "Add a ground connection so the electrons have somewhere to go back to!",
        emoji: "🌍",
      });
    }

    // LED without resistor warning
    if (hasLED && !hasResistor && results?.isValid) {
      const ledComponents = components.filter((c) => c.type === "led");
      ledComponents.forEach((led) => {
        const current = results.componentCurrents[led.id] || 0;
        if (current > 0.025) {
          // 25mA is dangerous for most LEDs
          hints.push({
            type: "warning",
            title: "LED in Danger!",
            message: `Your LED might burn out! Current is ${(current * 1000).toFixed(1)}mA. Add a resistor to protect it!`,
            emoji: "⚠️",
          });
        }
      });
    }

    // Successful circuit
    if (results?.isValid && hasLED && hasResistor && hasBattery) {
      const ledComponents = components.filter((c) => c.type === "led");
      const workingLEDs = ledComponents.filter(
        (led) => (results.componentCurrents[led.id] || 0) > 0.005
      );

      if (workingLEDs.length > 0) {
        hints.push({
          type: "success",
          title: "Great Circuit!",
          message: `Awesome! Your LED is glowing with ${(results.componentCurrents[workingLEDs[0].id] * 1000).toFixed(1)}mA of current!`,
          emoji: "🎉",
        });
      }
    }

    // Educational tips
    if (components.length >= 3 && results?.isValid) {
      hints.push({
        type: "tip",
        title: "Learning Time!",
        message:
          "Did you know? Current flows from + to - on the outside of the battery, but electrons actually move the opposite way inside the wires!",
        emoji: "🤓",
      });
    }

    return hints;
  }

  static getComponentTips(
    component: CircuitComponent,
    results: SimulationResults | null
  ): string[] {
    const tips: string[] = [];

    if (!results) return tips;

    const current = results.componentCurrents[component.id] || 0;
    const power = results.componentPowers[component.id] || 0;

    switch (component.type) {
      case "resistor":
        tips.push(`🌊 Current: ${(current * 1000).toFixed(1)}mA`);
        tips.push(`🔥 Power: ${(power * 1000).toFixed(1)}mW`);
        if (power > 0.1) {
          tips.push(`⚠️ Getting warm! This resistor is working hard!`);
        }
        break;

      case "led":
        tips.push(`💡 Current: ${(current * 1000).toFixed(1)}mA`);
        if (current > 0.001) {
          tips.push(`✨ I'm glowing! The electrons are making me light up!`);
        } else {
          tips.push(`😴 I'm not glowing. Check my connections or polarity!`);
        }
        if (current > 0.025) {
          tips.push(`🆘 Too much current! I might break! Add a resistor!`);
        }
        break;

      case "battery":
        tips.push(`🔋 Voltage: ${component.properties.voltage || 9}V`);
        tips.push(`⚡ I'm pushing electrons around the circuit!`);
        if (current > 0.1) {
          tips.push(`💪 Working hard! Pushing lots of current!`);
        }
        break;

      case "capacitor":
        tips.push(`⚪ Capacitance: ${component.properties.capacitance || 1}mF`);
        tips.push(`🏪 I store electricity like a tiny battery!`);
        break;
    }

    return tips;
  }

  static getVoltageExplanation(voltage: number): string {
    if (voltage < 1) {
      return `${voltage.toFixed(2)}V - That's like a gentle stream! 🏞️`;
    } else if (voltage < 5) {
      return `${voltage.toFixed(1)}V - Perfect for small electronics! 📱`;
    } else if (voltage < 12) {
      return `${voltage.toFixed(1)}V - Great power for LEDs and motors! ⚡`;
    } else {
      return `${voltage.toFixed(1)}V - That's powerful! Be careful! ⚠️`;
    }
  }

  static getCurrentExplanation(current: number): string {
    const milliamps = current * 1000;
    if (milliamps < 1) {
      return `${milliamps.toFixed(2)}mA - Just a tiny trickle of electrons! 🐭`;
    } else if (milliamps < 20) {
      return `${milliamps.toFixed(1)}mA - Perfect for LEDs! Just right! ✨`;
    } else if (milliamps < 100) {
      return `${milliamps.toFixed(0)}mA - That's a good strong current! 💪`;
    } else {
      return `${milliamps.toFixed(0)}mA - Wow! That's a lot of electrons moving! ⚡`;
    }
  }

  static getRandomEncouragement(): string {
    const encouragements = [
      "Great job experimenting! 🌟",
      "You're learning electronics like a pro! 🤓",
      "Keep building awesome circuits! ⚡",
      "Science is fun, isn't it? 🧪",
      "You're going to be an amazing engineer! 👩‍🔬",
      "Every mistake is a learning opportunity! 💡",
      "Circuits are like puzzles - keep solving! 🧩",
    ];
    return encouragements[Math.floor(Math.random() * encouragements.length)];
  }
}
