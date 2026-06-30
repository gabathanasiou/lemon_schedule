const IS_BROWSER = typeof window !== 'undefined';
export const IS_COARSE = IS_BROWSER && window.matchMedia('(pointer: coarse)').matches;
