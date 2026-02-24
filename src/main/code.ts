/// <reference types="@figma/plugin-typings" />

figma.showUI(__html__, { width: 300, height: 120, title: 'On-Demand Plugin' });

figma.ui.onmessage = (message: unknown) => {
  if (!message || typeof message !== 'object') return;
  const msg = message as Record<string, unknown>;

  if (msg.type === 'resize') {
    const width = typeof msg.width === 'number' ? msg.width : 300;
    const height = typeof msg.height === 'number' ? msg.height : 400;
    figma.ui.resize(width, height);
    return;
  }

  console.log('[main] received message:', message);
};

figma.on('selectionchange', () => {
  console.log('[main] selection changed:', figma.currentPage.selection.map(n => n.name));
});

console.log('[main] Plugin loaded');
