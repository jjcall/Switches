/// <reference types="@figma/plugin-typings" />

import { registerMessageHandler, sendSelectionContext } from './message-handler';

figma.showUI(__html__, { width: 300, height: 120, title: 'On-Demand Plugin' });

registerMessageHandler();

// Resend the real selection whenever it changes.
figma.on('selectionchange', () => {
  sendSelectionContext();
});

console.log('[main] Plugin loaded');
