import { hexToLinear } from './util';

// The studio palette ("End of the Decade"). Role names are kept from upstream (ink = darkest, bone = lightest,
// signal = the one colour that glows) but every value is new: a cool navy stage, porcelain lab white, caution yellow.
// Accents belong to one part of the story each: lilac (the too-neat daytime town / the lab), brass (the money, the
// hands), dawn (only the real sunrise at the end), shadow (the fear: the big shadow).
export const HEX = {
  ink: '#0A0E1A', // navy-black stage (backgrounds, night)
  ink2: '#141A2C', // raised navy (panels, props in the dark)
  graphite: '#4E5668', // dim lines, secondary text (cool)
  ash: '#98A0B2', // mid grey (cool)
  bone: '#F2F4F7', // porcelain lab white: paper, primary type
  signal: '#FFD21F', // caution yellow: the sung word, smiles, the countdown, the spotlight, hazard tape
  ember: '#FFF1A6', // pale hot yellow: cores and highlights of signal
  blood: '#B07A00', // deep amber: signal's shadow side
  lilac: '#B8A6FF', // candy lilac: the neat daytime town, the lab's soft light
  brass: '#B8903F', // dirty gold: money, cufflinks, badges, cheques
  dawn: '#FFA98A', // peach dawn: ONLY the real sunrise at the end
  shadow: '#20163D', // bruise indigo: the big shadow (fear)
} as const;

export type PaletteKey = keyof typeof HEX;

/** Linear RGB triplets for GL uniforms. */
export const LIN: Record<PaletteKey, [number, number, number]> = Object.fromEntries(
  Object.entries(HEX).map(([k, v]) => [k, hexToLinear(v)]),
) as Record<PaletteKey, [number, number, number]>;

/** CSS rgba() for Canvas2D. */
export function rgba(key: PaletteKey | string, a = 1): string {
  const hex = (HEX as Record<string, string>)[key] ?? key;
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
