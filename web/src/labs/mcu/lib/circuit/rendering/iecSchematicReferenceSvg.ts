/**
 * Original SVG reference strings (chris-pikul/electronic-symbols, MIT).
 * Geometry is implemented in iecSchematicDraw.ts, logicGateAndZenerSchematicDraw.ts, and ledSchematicDraw.ts via Pixi Graphics.
 */

export const INDUCTOR_COM_MAGNETIC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><path fill="none" stroke="#000" stroke-linejoin="round" stroke-width="5" d="M0 75.13h12.5s0-18.82 15.63-18.82S43.75 75 43.75 75s0-18.75 15.63-18.75S75 75 75 75s0-18.75 15.63-18.75S106.25 75 106.25 75s0-18.75 15.63-18.75S137.5 75 137.5 75H150M12.5 43.75h125m-125-12.5h125"/></svg>`;

export const MOSFET_N_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><g fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5"><circle cx="75" cy="75" r="50"/><path d="M0 75h50m12.5-31.25v62.5M99.66 0v56.25H62.5M99.66 150V93.75H62.5M50 50v50"/></g></svg>`;

export const MOSFET_P_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><g fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5"><circle cx="75" cy="75" r="50"/><path d="M0 75h31.25M62.5 43.75v62.5M99.66 0v56.25H62.5M99.66 150V93.75H62.5M50 50v50"/><circle cx="37.5" cy="75" r="6.25"/></g></svg>`;

export const RELAY_COM_SPST_NO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><path fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5" d="M25 37.5h100v25H25zM125 50h25M0 49.81h25m125 50.07H93.75M0 99.69h25"/><circle cx="31.25" cy="100" r="6.25" fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5"/><path d="M93.75 102.25h12.5l-6.25 9.5-6.25-9.5z"/><path fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5" d="M37.25 104 100 137.5"/><g fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5"><path d="M74.88 62.5V65"/><path stroke-dasharray="5 5" d="M74.88 70v47.5"/><path d="M74.88 120v2.5"/></g></svg>`;

export const SWITCH_SPST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><g fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5"><circle cx="37.5" cy="75" r="6.25"/><path d="M0 74.94h31.25"/><circle cx="112.5" cy="75" r="6.25"/><path d="M150 75.06h-31.25m-75-3.31L102 36.5"/></g></svg>`;

export const SWITCH_SPDT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><g fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5"><circle cx="37.5" cy="75" r="6.25"/><path d="M0 74.94h31.25"/><circle cx="112.5" cy="37.5" r="6.25"/><path d="M150 37.56h-31.25m-75 34.19 81.25-25"/><circle cx="112.5" cy="112.5" r="6.25"/><path d="M150 112.56h-31.25"/></g></svg>`;

export const PUSHBUTTON_NO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><g fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5"><circle cx="50" cy="75" r="6.25"/><path d="M0 74.94h43.75"/><circle cx="100" cy="75" r="6.25"/><path d="M150 75.06h-43.75M37.5 50h75M75 31.25V50M62.5 31.25h25"/></g></svg>`;

export const PUSHBUTTON_NC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><g fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5"><circle cx="50" cy="75" r="6.25"/><path d="M0 74.94h43.75"/><circle cx="100" cy="75" r="6.25"/><path d="M150 75.06h-43.75M37.5 87.5h75M75 68.75V87.5M62.5 68.75h25"/></g></svg>`;

export const POTENTIOMETER_IEC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><path fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5" d="M25 56.25h100v37.5H25zM25 75H0m125 0h25m-74.94 75v-32.21"/><path d="m85.03 120.71-9.97-17.27-9.97 17.27h19.94z"/></svg>`;

export const CAPACITOR_POLARIZED_IEC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><path fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5" d="M0 74.97h65.5m84.5.28H84.5m0-31.25v62m-19-62v62m65.75-56h-25m12.5-12.5v25"/></svg>`;

export const DIODE_COM_ZENER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><g fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5"><path d="m100 75-50 31.25v-62.5L100 75zm-50 0H0m100 0h50"/><path d="M112.5 109.5 100 100V50l-12.5-9.5"/></g></svg>`;

export const LOGIC_AND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><path fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5" d="M31.25 37.5h25c18.75 0 56.25 0 56.25 37.5S75 112.5 56.25 112.5h-25ZM0 49.81h31.25M0 100.06h31.25M112.5 75H150"/></svg>`;

export const LOGIC_OR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><path fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5" d="M31.25 37.5h25c37.5 0 56.25 37.5 56.25 37.5s-18.75 37.5-56.25 37.5h-25s12.5-18.75 12.5-37.5-12.5-37.5-12.5-37.5ZM0 49.81h37.5M0 100.06h37.5m75-25.06H150"/></svg>`;

export const LOGIC_NAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><g fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5"><path d="M31.25 37.5h25c18.75 0 56.25 0 56.25 37.5S75 112.5 56.25 112.5h-25ZM0 49.81h31.25M0 100.06h31.25M134.5 75H150"/><circle cx="124.88" cy="74.88" r="9.38"/></g></svg>`;

export const LOGIC_NOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><g fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5"><path d="M31.25 37.5h25c37.5 0 56.25 37.5 56.25 37.5s-18.75 37.5-56.25 37.5h-25s12.5-18.75 12.5-37.5-12.5-37.5-12.5-37.5ZM0 49.81h37.5M0 100.06h37.5m97-24.93H150"/><circle cx="124.88" cy="75" r="9.38"/></g></svg>`;

export const LOGIC_XOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><g fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5"><path d="M31.25 37.5h25c37.5 0 56.25 37.5 56.25 37.5s-18.75 37.5-56.25 37.5h-25s12.5-18.75 12.5-37.5-12.5-37.5-12.5-37.5ZM0 49.81h37.5M0 100.06h37.5m75-25.06H150"/><path d="M18.75 113s12.5-18.75 12.5-37.5-12.5-38-12.5-38"/></g></svg>`;

export const LOGIC_INVERTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><g fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5"><path d="M22 37.5v75L112.5 75 22 37.5zM22 75H0m137.75 0H150"/><circle cx="128.13" cy="74.88" r="9.38"/></g></svg>`;

export const DIODE_COM_LED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><path fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5" d="m100 75-50 31.25v-62.5L100 75zm0-34.25v68.5M50 75H0m100 0h50m-50-43.75 18.75-18.75"/><path d="m122.49 19.34 3.87-14.45-14.45 3.87 10.58 10.58z"/><path fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="5" d="m118.75 50 18.75-18.75"/><path d="m141.24 38.09 3.87-14.45-14.45 3.87 10.58 10.58z"/></svg>`;
