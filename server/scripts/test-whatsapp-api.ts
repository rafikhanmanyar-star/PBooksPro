/**
 * Test script for WhatsApp API endpoints
 * Run with: npx tsx server/scripts/test-whatsapp-api.ts
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPath = resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const API_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_TENANT_ID = process.env.TEST_TENANT_ID || 'test_tenant_123';
const TEST_USER_TOKEN = process.env.TEST_USER_TOKEN || '';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

async function testEndpoint(
  method: string,
  path: string,
  body?: any,
  token?: string
): Promise<{ status: number; data: any }> {
  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({ error: 'Invalid JSON response' }));
    return { status: response.status, data };
  } catch (error: any) {
    return { status: 0, data: { error: error.message } };
  }
}

async function runTests() {
  logSection('WhatsApp API Backend Testing');
  
  log('\n📋 Prerequisites:', 'yellow');
  log('1. Server should be running (npm run dev in server directory)');
  log('2. Database migration should be run (check if tables exist)');
  log('3. You need a valid JWT token for testing protected endpoints');
  log('4. Set TEST_USER_TOKEN environment variable or login first\n');

  // Test 1: Check if server is running
  logSection('Test 1: Server Health Check');
  const healthCheck = await testEndpoint('GET', '/health');
  if (healthCheck.status === 200) {
    log('✅ Server is running', 'green');
    console.log('Response:', JSON.stringify(healthCheck.data, null, 2));
  } else {
    log('❌ Server is not running or not accessible', 'red');
    log('Make sure to start the server with: npm run dev', 'yellow');
    return;
  }

  // Test 2: Check database migration (if we can access config endpoint)
  logSection('Test 2: Database Migration Check');
  log('Checking if whatsapp_configs table exists...', 'blue');
  if (!TEST_USER_TOKEN) {
    log('⚠️  Skipping database check - need authentication token', 'yellow');
    log('To get a token, login first and set TEST_USER_TOKEN environment variable', 'yellow');
  } else {
    const configCheck = await testEndpoint('GET', '/api/whatsapp/config', undefined, TEST_USER_TOKEN);
    if (configCheck.status === 404) {
      log('✅ Database tables exist (got 404 - config not set, which is expected)', 'green');
    } else if (configCheck.status === 401) {
      log('❌ Authentication failed - invalid token', 'red');
      log('Please login and get a valid token', 'yellow');
    } else if (configCheck.status === 500) {
      log('❌ Database error - tables might not exist', 'red');
      log('Run migration: npm run migrate in server directory', 'yellow');
    } else {
      log('✅ Database accessible', 'green');
      console.log('Response:', JSON.stringify(configCheck.data, null, 2));
    }
  }

  // Test 3: Test configuration endpoints
  logSection('Test 3: Configuration Endpoints');
  
  if (!TEST_USER_TOKEN) {
    log('⚠️  Skipping configuration tests - need authentication token', 'yellow');
    log('\nTo test configuration endpoints:', 'blue');
    log('1. Login to get a token');
    log('2. Set TEST_USER_TOKEN environment variable');
    log('3. Run this script again\n');
  } else {
    // GET config (should return 200 with configured: false if not configured)
    log('\n3.1 GET /api/whatsapp/config', 'blue');
    const getConfig = await testEndpoint('GET', '/api/whatsapp/config', undefined, TEST_USER_TOKEN);
    log(`Status: ${getConfig.status}`, getConfig.status === 200 ? 'green' : 'yellow');
    if (getConfig.data?.configured === false) {
      log('✓ Not configured (expected)', 'green');
    } else if (getConfig.data?.configured === true) {
      log('✓ Already configured', 'green');
    }
    console.log('Response:', JSON.stringify(getConfig.data, null, 2));

    // POST config (create configuration)
    log('\n3.2 POST /api/whatsapp/config', 'blue');
    log('Note: This requires valid WhatsApp API credentials', 'yellow');
    const testConfig = {
      apiKey: 'TEST_ACCESS_TOKEN',
      phoneNumberId: 'TEST_PHONE_NUMBER_ID',
      verifyToken: 'TEST_VERIFY_TOKEN_12345',
      webhookUrl: 'https://your-domain.com/api/whatsapp/webhook',
    };
    
    log('Attempting to save test config...', 'blue');
    const postConfig = await testEndpoint('POST', '/api/whatsapp/config', testConfig, TEST_USER_TOKEN);
    log(`Status: ${postConfig.status}`, postConfig.status === 200 ? 'green' : 'yellow');
    console.log('Response:', JSON.stringify(postConfig.data, null, 2));

    // DELETE config (cleanup)
    log('\n3.3 DELETE /api/whatsapp/config', 'blue');
    const deleteConfig = await testEndpoint('DELETE', '/api/whatsapp/config', undefined, TEST_USER_TOKEN);
    log(`Status: ${deleteConfig.status}`, deleteConfig.status === 200 ? 'green' : 'yellow');
    console.log('Response:', JSON.stringify(deleteConfig.data, null, 2));
  }

  // Test 4: Test webhook endpoint (public, no auth)
  logSection('Test 4: Webhook Endpoint (Public)');
  
  log('\n4.1 GET /api/whatsapp/webhook (Verification)', 'blue');
  const webhookVerify = await testEndpoint('GET', '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=TEST_VERIFY_TOKEN_12345&hub.challenge=test_challenge');
  log(`Status: ${webhookVerify.status}`, webhookVerify.status === 200 || webhookVerify.status === 403 ? 'yellow' : 'red');
  console.log('Response:', webhookVerify.data);

  log('\n4.2 POST /api/whatsapp/webhook (Event)', 'blue');
  const webhookEvent = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            phone_number_id: 'TEST_PHONE_NUMBER_ID',
          },
          messages: [{
            from: '1234567890',
            id: 'wamid.test123',
            timestamp: Math.floor(Date.now() / 1000).toString(),
            text: {
              body: 'Test message',
            },
            type: 'text',
          }],
        },
        field: 'messages',
      }],
    }],
  };
  const webhookPost = await testEndpoint('POST', '/api/whatsapp/webhook', webhookEvent);
  log(`Status: ${webhookPost.status}`, webhookPost.status === 200 ? 'green' : 'yellow');
  console.log('Response:', JSON.stringify(webhookPost.data, null, 2));

  // Test 5: Test message endpoints (requires config)
  logSection('Test 5: Message Endpoints');
  
  if (!TEST_USER_TOKEN) {
    log('⚠️  Skipping message tests - need authentication token', 'yellow');
  } else {
    log('\n5.1 GET /api/whatsapp/messages', 'blue');
    const getMessages = await testEndpoint('GET', '/api/whatsapp/messages', undefined, TEST_USER_TOKEN);
    log(`Status: ${getMessages.status}`, getMessages.status === 200 ? 'green' : 'yellow');
    console.log('Response:', JSON.stringify(getMessages.data, null, 2));

    log('\n5.2 GET /api/whatsapp/unread-count', 'blue');
    const unreadCount = await testEndpoint('GET', '/api/whatsapp/unread-count', undefined, TEST_USER_TOKEN);
    log(`Status: ${unreadCount.status}`, unreadCount.status === 200 ? 'green' : 'yellow');
    console.log('Response:', JSON.stringify(unreadCount.data, null, 2));
  }

  // Summary
  logSection('Test Summary');
  log('✅ Basic connectivity tests passed', 'green');
  log('⚠️  Some tests require authentication token', 'yellow');
  log('⚠️  Some tests require WhatsApp API configuration', 'yellow');
  
  log('\n📝 Next Steps:', 'cyan');
  log('1. Run database migration: npm run migrate');
  log('2. Login to get authentication token');
  log('3. Configure WhatsApp API credentials');
  log('4. Test with real WhatsApp API credentials\n');
}

// Run tests
runTests().catch((error) => {
  log(`\n❌ Test script error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
