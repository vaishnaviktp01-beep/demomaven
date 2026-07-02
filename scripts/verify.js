'use strict';

require('dotenv').config();

const { GoogleAuth } = require('google-auth-library');
const axios = require('axios');

const APIGEE_API = 'https://apigee.googleapis.com/v1';

async function getAccessToken() {
  let credentials;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  }
  const auth = new GoogleAuth({
    ...(credentials && { credentials }),
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const t = await client.getAccessToken();
  return t.token;
}

async function listDeployments(token, org, env, proxyName) {
  const url = `${APIGEE_API}/organizations/${org}/environments/${env}/apis/${proxyName}/deployments`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

async function main() {
  const org = process.env.APIGEE_ORG;
  const env = process.env.APIGEE_ENV || 'eval';
  const proxyName = process.env.APIGEE_PROXY_NAME || 'HelloWorld';

  if (!org) {
    console.error('APIGEE_ORG is required');
    process.exit(1);
  }

  const token = await getAccessToken();
  const deployments = await listDeployments(token, org, env, proxyName);

  console.log(`\nDeployments for '${proxyName}' in '${env}':`);
  if (!deployments.deployments || deployments.deployments.length === 0) {
    console.log('  No active deployments found.');
    process.exit(1);
  }

  for (const d of deployments.deployments) {
    const state = (d.state || '').toUpperCase();
    console.log(`  Revision ${d.revision}  State: ${state}`);
    if (state !== 'READY') {
      console.error(`  ERROR: Revision ${d.revision} is not in READY state.`);
      process.exit(1);
    }
  }

  console.log('\nVerification passed: proxy is deployed and READY.');
}

main().catch(err => {
  console.error('Verification failed:', err.response?.data || err.message);
  process.exit(1);
});
