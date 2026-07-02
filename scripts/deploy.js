'use strict';

require('dotenv').config();

const { GoogleAuth } = require('google-auth-library');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { createProxyBundle } = require('./bundle');

const APIGEE_API = 'https://apigee.googleapis.com/v1';

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getAccessToken() {
  // Supports both GOOGLE_APPLICATION_CREDENTIALS (file path) and
  // GOOGLE_SERVICE_ACCOUNT_KEY (raw JSON string used in CI secrets).
  let credentials;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  }

  const auth = new GoogleAuth({
    ...(credentials && { credentials }),
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token;
}

// ── Apigee Management API helpers ─────────────────────────────────────────────

/**
 * Uploads the proxy zip as a new revision.
 * Returns the imported proxy metadata (including the new revision number).
 */
async function importProxy(token, org, proxyName, bundlePath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(bundlePath), {
    filename: `${proxyName}.zip`,
    contentType: 'application/zip',
  });

  const url = `${APIGEE_API}/organizations/${org}/apis?action=import&name=${proxyName}`;
  console.log(`Importing proxy bundle to: ${url}`);

  const response = await axios.post(url, form, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  return response.data;
}

/**
 * Deploys a specific revision of a proxy to the target environment.
 * Pass override=true to replace any existing deployment in that environment.
 */
async function deployRevision(token, org, env, proxyName, revision) {
  const url =
    `${APIGEE_API}/organizations/${org}/environments/${env}` +
    `/apis/${proxyName}/revisions/${revision}/deployments?override=true`;

  console.log(`Deploying revision ${revision} to environment '${env}'...`);

  const response = await axios.post(url, {}, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  return response.data;
}

/**
 * Returns the current deployment state of a proxy in an environment.
 */
async function getDeploymentStatus(token, org, env, proxyName, revision) {
  const url =
    `${APIGEE_API}/organizations/${org}/environments/${env}` +
    `/apis/${proxyName}/revisions/${revision}/deployments`;

  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return response.data;
}

/**
 * Polls until the deployment reaches a terminal state (READY or ERROR).
 * Throws if deployment fails or times out after maxWaitMs.
 */
async function waitForDeployment(token, org, env, proxyName, revision, maxWaitMs = 120000) {
  const pollInterval = 5000;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const status = await getDeploymentStatus(token, org, env, proxyName, revision);
    const state = (status.state || '').toUpperCase();

    console.log(`  Deployment state: ${state}`);

    if (state === 'READY') return status;
    if (state === 'ERROR') throw new Error(`Deployment error: ${JSON.stringify(status.errors)}`);

    await new Promise(r => setTimeout(r, pollInterval));
  }

  throw new Error(`Deployment timed out after ${maxWaitMs / 1000}s`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const org = process.env.APIGEE_ORG;
  const env = process.env.APIGEE_ENV || 'eval';
  const proxyName = process.env.APIGEE_PROXY_NAME || 'HelloWorld';

  if (!org) {
    console.error('Error: APIGEE_ORG environment variable is required.');
    process.exit(1);
  }

  console.log(`\n=== Apigee Proxy Deployment ===`);
  console.log(`Organization : ${org}`);
  console.log(`Environment  : ${env}`);
  console.log(`Proxy        : ${proxyName}`);
  console.log(`================================\n`);

  // Step 1 – bundle
  console.log('Step 1/3: Creating proxy bundle...');
  const bundlePath = await createProxyBundle('apiproxy', proxyName);

  // Step 2 – import
  console.log('\nStep 2/3: Importing proxy to Apigee...');
  const token = await getAccessToken();
  const imported = await importProxy(token, org, proxyName, bundlePath);
  const revision = imported.revision;
  console.log(`Imported as revision ${revision}`);

  // Step 3 – deploy
  console.log('\nStep 3/3: Deploying proxy...');
  await deployRevision(token, org, env, proxyName, revision);
  const finalStatus = await waitForDeployment(token, org, env, proxyName, revision);

  // Clean up temp zip
  fs.unlinkSync(bundlePath);

  console.log(`\nDeployment complete. State: ${finalStatus.state}`);
  console.log(`Revision ${revision} of '${proxyName}' is live in '${env}'.`);
}

main().catch(err => {
  console.error('\nDeployment failed:', err.response?.data || err.message);
  process.exit(1);
});
