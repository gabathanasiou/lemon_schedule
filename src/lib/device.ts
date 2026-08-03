const IS_BROWSER = typeof window !== 'undefined';
export const IS_COARSE = IS_BROWSER && window.matchMedia('(pointer: coarse)').matches;
export const IS_TOUCH_CAPABLE = IS_BROWSER && (window.matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0);
