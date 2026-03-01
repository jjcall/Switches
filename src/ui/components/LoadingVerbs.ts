const LOADING_VERBS = [
  'Pixelating',
  'Bezifying',
  'Kerninating',
  'Layerifying',
  'Vectorizing',
  'Gradientifying',
  'Strokeulating',
  'Opacitating',
  'Gridifying',
  'Alignifying',
  'Rasterificating',
  'Typographizing',
  'Compositifying',
  'Framulating',
  'Maskifying',
  'Blendinating',
  'Swatchulating',
  'Canvasifying',
  'Skeuomorphing',
  'Antialiasifying',
  'Pantoneifying',
  'Whitespacing',
  'Gutterizing',
  'Prototypulating',
  'Componentizing',
  'Autolayouting',
  'Constraintifying',
  'Shadolating',
  'Radiusing',
  'Dropshading',
];

let lastIndex = -1;

export function getRandomVerb(): string {
  let index: number;
  do {
    index = Math.floor(Math.random() * LOADING_VERBS.length);
  } while (index === lastIndex && LOADING_VERBS.length > 1);
  lastIndex = index;
  return LOADING_VERBS[index];
}
