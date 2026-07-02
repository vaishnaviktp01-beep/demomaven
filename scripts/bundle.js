'use strict';

const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

/**
 * Creates a zip bundle of the apiproxy directory suitable for upload to Apigee.
 * @param {string} proxyDir  - Path to the apiproxy directory (default: 'apiproxy')
 * @param {string} proxyName - Name of the proxy (used as the output filename)
 * @param {string} outDir    - Where to write the zip (default: current working directory)
 * @returns {Promise<string>} Absolute path to the generated zip file
 */
async function createProxyBundle(proxyDir = 'apiproxy', proxyName, outDir = process.cwd()) {
  const proxyDirAbs = path.resolve(proxyDir);

  if (!fs.existsSync(proxyDirAbs)) {
    throw new Error(`Proxy directory not found: ${proxyDirAbs}`);
  }

  const outputPath = path.join(outDir, `${proxyName}.zip`);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`Bundle created: ${outputPath} (${archive.pointer()} bytes)`);
      resolve(outputPath);
    });

    archive.on('error', reject);
    archive.pipe(output);

    // Apigee expects the zip to contain an 'apiproxy/' folder at the root
    archive.directory(proxyDirAbs, 'apiproxy');
    archive.finalize();
  });
}

// Allow running as standalone: node scripts/bundle.js
if (require.main === module) {
  const proxyName = process.env.APIGEE_PROXY_NAME || 'HelloWorld';
  createProxyBundle('apiproxy', proxyName)
    .then(p => console.log('Bundle ready:', p))
    .catch(err => { console.error(err.message); process.exit(1); });
}

module.exports = { createProxyBundle };
