#!/usr/bin/env node

/**
 * Script to check Twilio configuration
 * Run with: node scripts/check-twilio.js
 */

require('dotenv/config');

const twilio = require('twilio');

console.log('Checking Twilio Configuration...\n');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

console.log('Environment Variables:');
console.log(`  TWILIO_ACCOUNT_SID: ${accountSid ? '✓ SET' : '✗ NOT SET'}`);
console.log(`  TWILIO_AUTH_TOKEN: ${authToken ? '✓ SET' : '✗ NOT SET'}`);
console.log(`  TWILIO_PHONE_NUMBER: ${phoneNumber || '✗ NOT SET'}`);
console.log(`  APP_URL: ${process.env.APP_URL || 'NOT SET (will default to localhost:5000)'}\n`);

if (!accountSid || !authToken) {
  console.log('❌ Twilio credentials are missing!');
  console.log('\nTo fix this:');
  console.log('1. Get your credentials from https://console.twilio.com');
  console.log('2. Add them to your .env file:');
  console.log('   TWILIO_ACCOUNT_SID=your_account_sid');
  console.log('   TWILIO_AUTH_TOKEN=your_auth_token');
  console.log('   TWILIO_PHONE_NUMBER=+1234567890');
  process.exit(1);
}

if (!phoneNumber) {
  console.log('⚠️  TWILIO_PHONE_NUMBER is not set!');
  console.log('   You need a Twilio phone number to make calls.');
  console.log('   Get one from: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming\n');
}

// Test Twilio connection
try {
  const client = twilio(accountSid, authToken);
  console.log('Testing Twilio connection...');
  
  client.api.accounts(accountSid)
    .fetch()
    .then(account => {
      console.log('✓ Twilio connection successful!');
      console.log(`  Account Name: ${account.friendlyName}`);
      console.log(`  Account Status: ${account.status}`);
      console.log('\n✅ Twilio is properly configured!\n');
    })
    .catch(error => {
      console.log('❌ Twilio connection failed!');
      console.log(`  Error: ${error.message}`);
      console.log('\nPlease check your credentials.\n');
      process.exit(1);
    });
} catch (error) {
  console.log('❌ Failed to initialize Twilio client');
  console.log(`  Error: ${error.message}`);
  process.exit(1);
}

