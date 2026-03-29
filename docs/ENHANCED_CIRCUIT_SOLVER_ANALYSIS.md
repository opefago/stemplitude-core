# Enhanced Circuit Solver (MNA-based) — Analysis Report

**File:** `src/labs/mcu/lib/circuit/EnhancedCircuitSolver.ts`  
**Date:** March 1, 2025

---

## Executive Summary

The Enhanced Circuit Solver implements Modified Nodal Analysis (MNA) with support for DC analysis, transient analysis, and nonlinear elements (LEDs, transistors). The overall formulation is mathematically sound, but several bugs and edge cases were identified that can cause incorrect simulation results.

---

## 1. MNA Matrix Stamping — Component-by-Component Review

### 1.1 Resistor (Lines 408–428) — ✅ Correct

- Conductance stamp: `G[n1][n1] += g`, `G[n1][n2] -= g`, `G[n2][n2] += g`, `G[n2][n1] -= g`
- Ground handling: `n >= 0` checks correctly skip ground (index -1)
- KCL: I = G(V1 − V2) is correctly implemented

### 1.2 Battery / Voltage Source (Lines 434–456) — ✅ Correct

- B, C matrices: +1 at positive node, −1 at negative node
- e vector: source voltage
- Standard ideal voltage source stamp

### 1.3 AC Source (Lines 516–539) — ✅ Correct

- Same stamp as battery; voltage comes from `getCircuitProperties().voltage`
- CircuitScene updates AC source voltage via `updateVoltageAtTime()` before each `simulateTimeStep()`

### 1.4 Inductor DC (Lines 461–479) — ✅ Correct

- DC steady state: inductor ≈ short circuit
- Uses high conductance (1e6 S) to approximate short
- Avoids singular matrix

### 1.5 Capacitor DC — ✅ Correct

- Capacitor omitted in DC analysis (open circuit)
- No stamp added

### 1.6 LED (Lines 549–576) — ⚠️ Simplified Model

- Model: V_anode − V_cathode = Vf + Rd·I
- D matrix: `D[vsIndex][vsIndex] = -Rd` — correct for series resistance
- **Issue:** No reverse-bias handling. When reverse biased, the model still allows current. Real diodes/LEDs block reverse current. For educational use this may be acceptable, but results can be wrong in reverse bias.

### 1.7 Switch (Lines 445–463) — ✅ Correct

- Uses `getCircuitProperties().resistance` (0.001 Ω closed, 1e12 Ω open)
- Stamped as resistor

### 1.8 Ammeter (Lines 469–487) — ✅ Correct

- Low resistance (0.001 Ω default)
- Stamped as resistor

### 1.9 Voltmeter / Oscilloscope (Lines 493–511) — ✅ Correct

- High resistance (1e9 Ω)
- Stamped as resistor

### 1.10 NPN / PNP Transistors (Lines 586–731) — ✅ Stamps Correct

- Piecewise-linear model: cutoff vs active/saturated
- Pull-down (NPN) / pull-up (PNP) for floating base
- Stamps are consistent with the model

### 1.11 Capacitor Transient (Lines 734–762) — ✅ Correct

- Backward Euler companion model: gEq = C/Δt, iEq = gEq·V_prev
- Conductance and current source stamps are correct

### 1.12 Inductor Transient (Lines 768–795) — ❌ BUG: Wrong Sign

**Lines 791–794:**

```typescript
this.i[n1] += vEq / (this.timeStep / inductance);  // = I_prev
this.i[n2] -= vEq / (this.timeStep / inductance);  // = -I_prev
```

For backward Euler, Norton equivalent: I = gEq·(V1 − V2) + I_prev.  
KCL at node 1: current entering = −I_prev; at node 2: +I_prev.

**Correct RHS contributions:** `i[n1] -= I_prev`, `i[n2] += I_prev`  
**Current code:** `i[n1] += I_prev`, `i[n2] -= I_prev` — signs are reversed.

**Impact:** Inductor currents and related node voltages are wrong in transient analysis.

---

## 2. Node Indexing and Ground Handling

### 2.1 Node Map — ✅ Correct

- Ground: `nodeMap.set("ground", 0)`
- Non-ground nodes: indices 1, 2, 3, …
- Matrix indices: `nodeMap.get(...) - 1` so ground → −1 (excluded), node 1 → 0, etc.

### 2.2 Matrix Size (Line 386)

```typescript
const numNodes = Math.max(...Array.from(this.nodeMap.values()));
```

- `numNodes` = highest node index (e.g. 3 for nodes 0–3)
- G is `numNodes × numNodes` (e.g. 3×3 for nodes 1–3)
- Mapping is consistent

### 2.3 Connected Nodes (rebuildNodeMap)

- Union-find / DFS groups connected nodes
- Nodes in the same group share the same index
- Ground groups map to index 0
- Logic is correct

### 2.4 Edge Case: Only Ground (Lines 386, 811)

- `nodeMap.values()` = [0] → `numNodes = 0`
- Empty matrices; `solveMNA()` returns early
- No crash

---

## 3. Matrix Construction and Solving

### 3.1 Augmented System (Lines 815–826)

- Builds `[G B; C D]` and RHS `[i; e]`
- Uses `lusolve` from mathjs
- Structure matches standard MNA

### 3.2 Singular Matrix

- No special handling for singular systems (e.g. conflicting voltage sources)
- `lusolve` will throw; error is logged and rethrown
- No recovery or user-friendly message

### 3.3 B[0]?.length (Line 811)

- Safe when m = 0: `B[0]?.length || 0` avoids access errors

---

## 4. Newton–Raphson for Nonlinear Elements

### 4.1 Iteration Loop (Lines 189–220, 260–319)

- DC: up to 10 iterations, 1 mV tolerance
- Transient: up to 20 iterations, 10 mV tolerance
- Convergence based on max change in node voltages

### 4.2 Transistors

- Use previous iteration’s node voltages to choose region (cutoff/active/saturated)
- Piecewise-linear, not full Newton–Raphson
- Can oscillate or converge slowly near VBE ≈ 0.7 V

### 4.3 LEDs

- Linear model (Vf + Rd·I) in MNA
- No iteration on LED model itself
- Reverse bias not modeled

### 4.4 Damping (Lines 274–285)

- Transient uses 50% damping to reduce oscillation
- On non-convergence, restores previous stable state

---

## 5. Transient Analysis

### 5.1 Integration Method

- Backward Euler for both capacitor and inductor
- No trapezoidal or other methods

### 5.2 Capacitor Companion Model — ✅ Correct

- gEq = C/Δt
- iEq = gEq·V_prev
- Stamps match backward Euler

### 5.3 Inductor Companion Model — ❌ Wrong Sign (see §1.12)

### 5.4 Initial Conditions — ⚠️ Not Used

- Capacitor: `prevState?.voltage || 0`
- Inductor: `prevState?.current || 0`
- `CircuitProperties.initialCondition` is never used
- First step always assumes V_cap = 0, I_L = 0
- Precharged capacitors or inductor bias cannot be modeled

### 5.5 previousState Storage (Lines 1206–1214)

- Stores `voltage` and `current` from `getCircuitProperties()`
- For capacitors: voltage across component
- For inductors: current through component
- Stored at end of each time step — correct

---

## 6. updateComponentStates — Critical Bug

### 6.1 Three-Node Components (Lines 837–908)

**Lines 844–846, 902–903:**

```typescript
const n1 = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1;
const n2 = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1;
// ...
nodes[0].voltage = v1;
nodes[1].voltage = v2;
```

Only the first two nodes are updated. Transistors have base (0), collector (1), emitter (2).

**Bug:** `nodes[2].voltage` (emitter) is never set from the solution.

**Impact:**

- Transistor uses `nodes[0].voltage` and `nodes[2].voltage` for VBE
- Emitter voltage stays at 0 or stale value
- Wrong VBE → wrong region (cutoff/active/saturation) in next iteration
- Incorrect transistor behavior and convergence issues

**Fix:** Update all nodes for each component, e.g.:

```typescript
nodes.forEach((node, idx) => {
  const ni = this.nodeMap.get(`${componentId}_${node.id}`)! - 1;
  if (ni >= 0) node.voltage = solution.nodeVoltages[ni];
});
```

---

## 7. Other Issues

### 7.1 getAnalysisResults (Lines 968–971)

- `nodeVoltages` is always 0 (“Would need to store from last solve”)
- Node voltages from the solution are not exposed

### 7.2 Floating Nodes

- No conductance to ground for floating nodes
- Can produce singular or ill-conditioned systems
- No detection or handling

### 7.3 Capacitor Component updateNodeVoltages

- Capacitor’s `updateNodeVoltages()` sets `nodes[0].voltage = circuitProps.voltage`, `nodes[1].voltage = 0`
- Assumes negative terminal at ground
- Called from `updateCircuitState()` and overwrites solver-assigned node voltages
- This is in the Capacitor component, not the solver, but can corrupt shared node state

---

## 8. Missing or Incomplete Support

| Component        | Status                                                                 |
|-----------------|------------------------------------------------------------------------|
| Current sources  | Not implemented                                                        |
| Diodes (generic) | Only LED; no generic diode                                            |
| MOSFETs          | Not implemented                                                        |
| Op-amps          | Not implemented                                                        |
| Trapezoidal rule | Only backward Euler                                                    |
| AC analysis      | No phasor/frequency-domain analysis                                   |

---

## 9. Summary of Bugs and Fixes

| # | Severity | Location        | Issue                                      | Fix                                                                 |
|---|----------|-----------------|--------------------------------------------|---------------------------------------------------------------------|
| 1 | High     | 791–794         | Inductor transient: wrong sign for I_prev | Use `i[n1] -= I_prev`, `i[n2] += I_prev`                             |
| 2 | High     | 844–846, 902–903| Three-node components: emitter not updated| Update all nodes from solution, not just first two                 |
| 3 | Medium   | 752–754, 768–769| Initial conditions ignored                | Use `initialCondition` when `previousState` is empty               |
| 4 | Low      | 968–971         | Node voltages not returned                | Store and return solution node voltages in `getAnalysisResults()`   |

---

## 10. Conclusion

The MNA formulation and most stamps are correct. The main problems are:

1. **Inductor transient sign error** — inductor currents and related voltages are wrong.
2. **Three-node update bug** — transistor emitter (and any third node) is never updated, breaking transistor behavior and convergence.
3. **Initial conditions** — precharged capacitors and inductor bias are not supported.

Fixing items 1 and 2 is important for correct transient and transistor simulation. Item 3 is useful for more realistic initial conditions.
