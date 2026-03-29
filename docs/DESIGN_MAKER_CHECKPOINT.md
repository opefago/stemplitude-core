# Design Maker checkpoint (scale handles, floor plan)

- **Uniform (proportional) scale**: Cube handle at `pos: [0, hh + 15, 0]`; Shift+drag on any scale handle also does uniform scale.
- **Scale handles on floor plan**: Text and box-like shapes use base Y (`by = -height/2`) for W/D scale handles; only H handle at top.
- **Text scale handles**: Width and depth handles at base (`by`); height at top.

---

## Three.js outline options (for reference)

**Built-in (official):**
- **OutlineEffect** – `three/addons/effects/OutlineEffect.js`, works with WebGLRenderer. Options: thickness (default 0.003), color, alpha.
- **OutlinePass** – Post-processing pass with EffectComposer (render to target, then outline pass).
- **WebGPU**: Use `ToonOutlinePassNode` with WebGPURenderer.

**Community:**
- [webgl-outlines](https://github.com/OmarShehata/webgl-outlines) – Post-process outline shader for Three.js (and PlayCanvas).

**Typical setup:** EffectComposer → RenderPass → OutlinePass (or custom ShaderPass) → optional FXAA.
