/// <reference types="@figma/plugin-typings" />

import { registerMessageHandler, sendSelectionContext } from './message-handler';

figma.showUI(__html__, { width: 300, height: 120, title: 'Switches' });

registerMessageHandler();

// Debounce selection changes to avoid redundant serialization during rapid clicks.
let selectionTimer: ReturnType<typeof setTimeout> | null = null;
figma.on('selectionchange', () => {
  if (selectionTimer) clearTimeout(selectionTimer);
  selectionTimer = setTimeout(() => {
    selectionTimer = null;
    sendSelectionContext();
  }, 150);
});

console.log('[main] Plugin loaded');
