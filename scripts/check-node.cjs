const major = Number.parseInt(process.version.slice(1).split('.')[0], 10);

if (!Number.isFinite(major) || major < 22) {
  console.error(
    `Node.js >= 22 is required to build (current: ${process.version}).\n` +
      'Run: nvm use'
  );
  process.exit(1);
}
