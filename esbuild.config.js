const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');
const isPreview = process.argv.includes('--preview');

// Read the HTML template and inject the bundled JS inline.
// Figma's `ui` field expects a single self-contained HTML file.
async function buildUI() {
  const result = await esbuild.build({
    entryPoints: ['src/ui/App.tsx'],
    bundle: true,
    write: false,
    outfile: 'dist/_ui_bundle.js',
    format: 'iife',
    jsx: 'automatic',
    loader: { '.tsx': 'tsx', '.ts': 'ts', '.css': 'css' },
    minify: false,
    sourcemap: false,
    define: {
      'process.env.NODE_ENV': '"development"',
    },
  });

  // When outfile is set, outputFiles[0] is the JS bundle; CSS is outputFiles[1] if present.
  const js = result.outputFiles.find(f => f.path.endsWith('.js'))?.text ?? '';
  const css = result.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '';

  const template = fs.readFileSync('src/ui/index.html', 'utf8');
  const html = template
    .replace('/* __CSS__ */', css)
    .replace('// __JS__', js);

  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/ui.html', html);
  console.log('Built dist/ui.html');
}

// Build the main thread (Figma sandbox — no DOM, no JSX).
async function buildMain() {
  await esbuild.build({
    entryPoints: ['src/main/code.ts'],
    bundle: true,
    outfile: 'dist/code.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2017',
    minify: false,
    sourcemap: false,
  });
  console.log('Built dist/code.js');
}

// Build the standalone preview page for viewing controls in a browser.
async function buildPreview() {
  const result = await esbuild.build({
    entryPoints: ['src/preview/Preview.tsx'],
    bundle: true,
    write: false,
    outfile: 'dist/_preview_bundle.js',
    format: 'iife',
    jsx: 'automatic',
    loader: { '.tsx': 'tsx', '.ts': 'ts', '.css': 'css' },
    minify: false,
    sourcemap: false,
    define: {
      'process.env.NODE_ENV': '"development"',
    },
  });

  const js = result.outputFiles.find(f => f.path.endsWith('.js'))?.text ?? '';
  const css = result.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '';

  const template = fs.readFileSync('src/preview/index.html', 'utf8');
  const html = template
    .replace('/* __CSS__ */', css)
    .replace('// __JS__', js);

  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/preview.html', html);
  console.log('Built dist/preview.html');
}

// Serve dist/preview.html on localhost:3333
function servePreview() {
  const http = require('http');
  const server = http.createServer((req, res) => {
    const filePath = path.join(__dirname, 'dist', 'preview.html');
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found — run the build first.');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(filePath));
  });
  server.listen(3333, () => {
    console.log('Preview server running at http://localhost:3333');
  });
}

async function build() {
  await Promise.all([buildMain(), buildUI()]);
}

if (isPreview) {
  // Preview mode: build preview page, watch for changes, serve on localhost:3333
  (async () => {
    await buildPreview();
    servePreview();

    let lastMtimes = {};
    const watchGlob = ['src'];

    function getMtimes() {
      const mtimes = {};
      function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else {
            mtimes[full] = fs.statSync(full).mtimeMs;
          }
        }
      }
      for (const d of watchGlob) {
        if (fs.existsSync(d)) walk(d);
      }
      return mtimes;
    }

    lastMtimes = getMtimes();

    setInterval(async () => {
      const current = getMtimes();
      const changed = Object.keys(current).some(
        f => current[f] !== lastMtimes[f] || !(f in lastMtimes)
      );
      if (changed) {
        lastMtimes = current;
        console.log('Change detected, rebuilding preview...');
        try {
          await buildPreview();
        } catch (e) {
          console.error('Preview build error:', e.message);
        }
      }
    }, 500);
  })();
} else if (isWatch) {
  // Simple watch using esbuild's context API
  (async () => {
    await build();
    console.log('Watching for changes...');

    // Poll for changes every 500ms (simplest approach for now)
    let lastMtimes = {};
    const watchGlob = ['src'];

    function getMtimes() {
      const mtimes = {};
      function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else {
            mtimes[full] = fs.statSync(full).mtimeMs;
          }
        }
      }
      for (const d of watchGlob) {
        if (fs.existsSync(d)) walk(d);
      }
      return mtimes;
    }

    lastMtimes = getMtimes();

    setInterval(async () => {
      const current = getMtimes();
      const changed = Object.keys(current).some(
        f => current[f] !== lastMtimes[f] || !(f in lastMtimes)
      );
      if (changed) {
        lastMtimes = current;
        console.log('Change detected, rebuilding...');
        try {
          await build();
        } catch (e) {
          console.error('Build error:', e.message);
        }
      }
    }, 500);
  })();
} else {
  build().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
