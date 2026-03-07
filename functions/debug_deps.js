const deps = [
  'firebase-functions/v2/scheduler',
  'firebase-functions/v2/firestore',
  'firebase-functions/v2',
  'https',
  'zlib',
  'crypto',
  'firebase-admin',
  'rss-parser'
];

async function run() {
  for (const dep of deps) {
    const start = Date.now();
    try {
      console.log(`Loading ${dep}...`);
      require(dep);
      console.log(`  Loaded ${dep} in ${Date.now() - start}ms`);
    } catch (e) {
      console.error(`  Error loading ${dep}:`, e.message);
    }
  }
}

run();
