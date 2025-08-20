// Copy public/ to dist/public after TypeScript build
// Cross-platform, no extra deps
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.join(projectRoot, 'public');
const destDir = path.join(projectRoot, 'dist', 'public');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

copyDir(srcDir, destDir);
console.log(`[postbuild] Copied public/ to dist/public (${srcDir} -> ${destDir})`);
