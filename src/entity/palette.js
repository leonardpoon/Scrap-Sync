// ENTITY: the fixed background palette (handoff 3E). Preset swatches only.
// key -> { label shown in the bot, hex used by the web viewer }
export const PALETTE = {
  cream:   { label: 'Cream',       hex: '#f5efe0' },
  kraft:   { label: 'Kraft brown', hex: '#c8a97e' },
  blush:   { label: 'Blush pink',  hex: '#f3d9dc' },
  sage:    { label: 'Sage green',  hex: '#cdd8c1' },
  charcoal:{ label: 'Charcoal',    hex: '#33312e' },
};

export const DEFAULT_COLOR = 'cream';

export function isValidColor(key) {
  return Object.prototype.hasOwnProperty.call(PALETTE, key);
}

export function hexFor(key) {
  return (PALETTE[key] || PALETTE[DEFAULT_COLOR]).hex;
}

// Charcoal is dark; the viewer needs light text on it.
export function isDark(key) {
  return key === 'charcoal';
}
