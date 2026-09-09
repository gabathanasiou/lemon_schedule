import React, { createContext, useContext } from 'react';

/**
 * Cross-block highlight signal (item 115): the Call Sheet editor sets the
 * hovered element row's FIRST scene id, and the ribbon block's `Strip` reads it
 * to draw a highlight ring. Default null everywhere (designer/preview/print),
 * so non-editor surfaces are unaffected.
 */
export const SceneHighlightContext = createContext<string | null>(null);

export const useHighlightedScene = (): string | null => useContext(SceneHighlightContext);
