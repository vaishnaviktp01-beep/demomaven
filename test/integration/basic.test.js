'use strict';

require('dotenv').config();

const axios = require('axios');

const org = process.env.APIGEE_ORG;
const env = process.env.APIGEE_ENV || 'eval';
const proxyName = process.env.APIGEE_PROXY_NAME || 'HelloWorld';
// Apigee X runtime host is a custom hostname set in the Environment Group.
// Set APIGEE_RUNTIME_HOST in GitHub Actions secrets/variables (e.g. api.example.com).
const runtimeHost = process.env.APIGEE_RUNTIME_HOST;

const baseUrl = `https://${runtimeHost}/v1/hello`;

const TIMEOUT_MS = 10000;

let passed = 0;
let failed = 0;

async function assert(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
    failed++;
  }
}

async function runTests() {
  if (!org) {
    console.error('APIGEE_ORG is required for integration tests.');
    process.exit(1);
  }
  if (!runtimeHost) {
    console.error('APIGEE_RUNTIME_HOST is required (your Apigee X envgroup hostname).');
    process.exit(1);
  }

  console.log(`\nIntegration tests for '${proxyName}' on '${env}'`);
  console.log(`Base URL: ${baseUrl}\n`);

  await assert('GET / returns HTTP 200', async () => {
    const res = await axios.get(baseUrl, { timeout: TIMEOUT_MS });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });

  await assert('Response includes X-API-Version header', async () => {
    const res = await axios.get(baseUrl, { timeout: TIMEOUT_MS });
    if (!res.headers['x-api-version']) {
      throw new Error('Missing X-API-Version response header');
    }
  });

  await assert('Response body is valid JSON', async () => {
    const res = await axios.get(baseUrl, {
      timeout: TIMEOUT_MS,
      responseType: 'json',
    });
    if (typeof res.data !== 'object' || res.data === null) {
      throw new Error('Response body is not a JSON object');
    }
  });

  await assert('Non-existent path returns 404', async () => {
    const res = await axios.get(`${baseUrl}/nonexistent`, {
      timeout: TIMEOUT_MS,
      validateStatus: () => true,
    });
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner error:', err.message);
  process.exit(1);
});
