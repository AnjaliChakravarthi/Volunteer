import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

async function runAuthProof() {
  console.log('--- Starting Server ---');
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('/api/v1');
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(PORT);
  console.log(`Server listening on port ${PORT}`);

  try {
    // 1. Setup default org
    await prisma.organization.deleteMany({});
    const org = await prisma.organization.create({ data: { name: 'Auth Org', slug: 'auth-org' } });
    process.env.DEFAULT_ORG_ID = org.id;

    console.log('\n--- 1. Register ---');
    const registerRes = await axios.post(`${BASE_URL}/auth/register`, {
      email: 'auth_test@example.com',
      password: 'StrongPassword123!',
      fullName: 'Auth Test User'
    });
    console.log('Register Response:', registerRes.status, registerRes.data);

    console.log('\n--- 2. Login ---');
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'auth_test@example.com',
      password: 'StrongPassword123!'
    });
    console.log('Login Response:', loginRes.status, loginRes.data);
    const token = loginRes.data.data.access_token;

    console.log('\n--- 3. Access Protected Route (Valid Token) ---');
    const meRes = await axios.get(`${BASE_URL}/volunteers/${registerRes.data.data.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Protected Route Response:', meRes.status, meRes.data);

    console.log('\n--- 4. Access Protected Route (Invalid Token) ---');
    try {
      await axios.get(`${BASE_URL}/volunteers/${registerRes.data.data.id}`, {
        headers: { Authorization: `Bearer INVALID_TOKEN` }
      });
    } catch (err: any) {
      console.log('Invalid Token Response:', err.response.status, err.response.data);
    }

    console.log('\n--- 5. Attempt without required role (Expect 403) ---');
    // The route GET /volunteers lists all volunteers and requires COORDINATOR+
    try {
      await axios.get(`${BASE_URL}/volunteers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err: any) {
      console.log('Missing Role Response:', err.response.status, err.response.data);
    }

    console.log('\n--- 6. MFA Flow ---');
    console.log('Setting up MFA...');
    const mfaSetupRes = await axios.get(`${BASE_URL}/auth/mfa/setup`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('MFA Setup Response:', mfaSetupRes.status, mfaSetupRes.data);
    const secret = mfaSetupRes.data.data.secret;

    // Generate TOTP code
    const { authenticator } = require('otplib');
    const code = authenticator.generate(secret);
    
    console.log('Confirming MFA...');
    const mfaConfirmRes = await axios.post(`${BASE_URL}/auth/mfa/confirm`, { code }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('MFA Confirm Response:', mfaConfirmRes.status, mfaConfirmRes.data);

    console.log('Logging in with MFA enabled...');
    const loginMfaRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'auth_test@example.com',
      password: 'StrongPassword123!'
    });
    console.log('Login MFA Response:', loginMfaRes.status, loginMfaRes.data);
    const pendingToken = loginMfaRes.data.data.pending_token;

    const code2 = authenticator.generate(secret);
    console.log('Verifying MFA...');
    const verifyMfaRes = await axios.post(`${BASE_URL}/auth/mfa/verify`, {
      pendingToken,
      code: code2
    });
    console.log('Verify MFA Response:', verifyMfaRes.status, !!verifyMfaRes.data.data.access_token ? 'Access Token Received' : 'No Token');

  } catch (err: any) {
    if (err.response) {
      console.log('Unexpected Error:', err.response.status, err.response.data);
    } else {
      console.log('Error:', err.message);
    }
  } finally {
    await prisma.organization.deleteMany({});
    await app.close();
    await prisma.$disconnect();
  }
}

runAuthProof();
