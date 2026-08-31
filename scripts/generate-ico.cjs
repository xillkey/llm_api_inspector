const { runIconsTool } = require('app-builder-lib/out/toolsets/icons');
const { mkdir, rename } = require('fs/promises');
const path = require('path');

async function main() {
  const root = path.join(__dirname, '..');
  const outDir = path.join(root, 'build/ico-out');
  await mkdir(outDir, { recursive: true });
  await runIconsTool({
    inputFile: path.join(root, 'build/icon.png'),
    outputFormat: 'ico',
    outDir,
  });
  await rename(path.join(outDir, 'icon.ico'), path.join(root, 'build/icon.ico'));
  console.log('Generated build/icon.ico');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
