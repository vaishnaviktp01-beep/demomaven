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

  await assert('Response body is non-empty', async () => {
    const res = await axios.get(baseUrl, { timeout: TIMEOUT_MS });
    const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    if (!body || body.length === 0) {
      throw new Error('Response body is empty');
    }
  });

  await assert('Response includes X-Request-ID header', async () => {
    const res = await axios.get(baseUrl, { timeout: TIMEOUT_MS });
    if (!res.headers['x-request-id']) {
      throw new Error('Missing X-Request-ID response header');
    }
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner error:', err.message);
  process.exit(1);
});
