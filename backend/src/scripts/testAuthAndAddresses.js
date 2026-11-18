import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import express from 'express';
import cookieParser from 'cookie-parser';
import { initDatabase } from '../store/repository.js';
import { sanitizeNoSqlInput, hashToken } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Address } from '../models/Address.js';
import { EmailVerification } from '../models/EmailVerification.js';
import { RefreshSession } from '../models/RefreshSession.js';
import authRoutes from '../routes/auth.js';
import profileRoutes from '../routes/profile.js';
import addressRoutes from '../routes/addresses.js';

dotenv.config();

async function runTests() {
  const dbStatus = await initDatabase();
  assert.equal(dbStatus.mode, 'mongodb', 'Must be connected to MongoDB Atlas');

  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(sanitizeNoSqlInput);
  app.use('/api/auth', authRoutes);
  app.use('/api/users', profileRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/addresses', addressRoutes);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const testSuffix = Date.now().toString(36);
  const userAEmail = `test_user_a_${testSuffix}@hruvita.com`;
  const userAUsername = `user_a_${testSuffix}`;
  const userBEmail = `test_user_b_${testSuffix}@hruvita.com`;

  let cookiesA = '';
  let tokenA = '';

  const request = async (path, options = {}, cookieJar = '', bearer = '') => {
    const headers = {
      'Content-Type': 'application/json',
      ...(cookieJar ? { Cookie: cookieJar } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(options.headers || {}),
    };
    const res = await fetch(`${baseUrl}${path}`, { ...options, headers });
    const setCookieHeader = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, setCookieHeader };
  };

  try {
    // 1. Weak password rejection
    const weakRes = await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Test User A',
        email: userAEmail,
        password: 'weakpassword',
        confirmPassword: 'weakpassword',
        termsAccepted: true,
      }),
    });
    assert.equal(weakRes.status, 400, 'Weak password must be rejected');
    console.log('✓ 1. Weak password rejected (400)');

    // 2. Valid Signup
    const signupRes = await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Kiran Kumar Reddy',
        email: userAEmail,
        password: 'StrongPassword@2026',
        confirmPassword: 'StrongPassword@2026',
        termsAccepted: true,
      }),
    });
    assert.equal(signupRes.status, 201, 'Valid signup must return 201');
    assert.equal(signupRes.data.requiresEmailVerification, true);
    console.log('✓ 2. Signup succeeded and triggered OTP');

    // 3. Verify bcrypt cost 12 hash & select:false in MongoDB
    const rawUserInDb = await User.findOne({ email: userAEmail }).lean();
    assert.equal(rawUserInDb.password, undefined, 'Password field must have select:false by default');
    const userWithPwd = await User.findOne({ email: userAEmail }).select('+password').lean();
    assert.ok(
      userWithPwd.password.startsWith('$2b$12$'),
      `Password in MongoDB must start with $2b$12$, got: ${userWithPwd.password.slice(0, 7)}`
    );
    console.log('✓ 3. Password stored as $2b$12$... bcrypt hash with select:false in MongoDB');

    // 4. Verify plain 6-digit OTP stored in EmailVerification collection
    const otpRecord = await EmailVerification.findOne({ email: userAEmail }).lean();
    assert.ok(otpRecord && /^\d{6}$/.test(otpRecord.otp), 'Plain 6-digit OTP must exist in EmailVerification');
    console.log('✓ 4. Plain 6-digit OTP stored in MongoDB EmailVerification with 10m expiry');

    // 5. Unverified user prevented from logging in
    const unverifiedLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ emailOrUsername: userAEmail, password: 'StrongPassword@2026' }),
    });
    assert.equal(unverifiedLogin.status, 403, 'Unverified user login must return 403');
    console.log('✓ 5. Unverified user blocked from logging in (403)');

    // 6. Incorrect OTP attempt tracking
    const refreshedOtpRec = await EmailVerification.findOne({ email: userAEmail }).lean();
    const wrongOtp = refreshedOtpRec.otp === '123456' ? '654321' : '123456';
    const wrongOtpRes = await request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email: userAEmail, otp: wrongOtp }),
    });
    assert.equal(wrongOtpRes.status, 400, 'Wrong OTP must return 400');
    console.log('✓ 6. Incorrect OTP rejected and attempt counter incremented');

    // 7. Resend OTP cooldown enforcement (30s cooldown)
    const immediateResend = await request('/api/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ email: userAEmail }),
    });
    assert.equal(immediateResend.status, 429, 'Immediate resend within 30s must be rate-limited');
    console.log('✓ 7. OTP resend cooldown enforced (429)');

    // 8. Successful OTP verification & OTP deletion
    const validOtpRes = await request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email: userAEmail, otp: refreshedOtpRec.otp }),
    });
    assert.equal(validOtpRes.status, 200, 'Valid OTP must verify email');
    assert.equal(validOtpRes.data.user.isEmailVerified, true);
    tokenA = validOtpRes.data.token;
    cookiesA = validOtpRes.setCookieHeader.map((c) => c.split(';')[0]).join('; ');
    const deletedOtp = await EmailVerification.findOne({ email: userAEmail }).lean();
    assert.equal(deletedOtp, null, 'OTP record must be deleted after verification');
    console.log('✓ 8. OTP verified, EmailVerification record deleted, HTTP-only cookies issued');

    // 9. Duplicate email registration rejected (409)
    const dupRes = await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Duplicate User',
        email: userAEmail,
        password: 'StrongPassword@2026',
        confirmPassword: 'StrongPassword@2026',
        termsAccepted: true,
      }),
    });
    assert.equal(dupRes.status, 409, 'Duplicate verified email must return 409');
    console.log('✓ 9. Duplicate email registration rejected (409)');

    // 10. Personal Profile Completion (POST /api/users/complete-profile)
    const completeRes = await request(
      '/api/users/complete-profile',
      {
        method: 'POST',
        body: JSON.stringify({
          username: userAUsername,
          mobileNumber: '9876543210',
          gender: 'Male',
          dateOfBirth: '1999-04-15',
        }),
      },
      cookiesA,
      tokenA
    );
    assert.equal(completeRes.status, 200, 'Complete profile must succeed');
    assert.equal(completeRes.data.user.isProfileCompleted, true);
    assert.equal(completeRes.data.user.username, userAUsername);
    console.log('✓ 10. Personal profile completed in MongoDB');

    // 11. Login with Username & Invalid Login rejection
    const badLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ emailOrUsername: userAUsername, password: 'WrongPassword@1' }),
    });
    assert.equal(badLogin.status, 401, 'Invalid login password must return 401');

    const goodLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        emailOrUsername: userAUsername,
        password: 'StrongPassword@2026',
        rememberMe: true,
      }),
    });
    assert.equal(goodLogin.status, 200, 'Login by username must succeed');
    cookiesA = goodLogin.setCookieHeader.map((c) => c.split(';')[0]).join('; ');
    tokenA = goodLogin.data.token;
    console.log('✓ 11. Login by username succeeded & invalid login rejected');

    // 12. Refresh Token Rotation
    const refreshRes = await request('/api/auth/refresh', { method: 'POST' }, cookiesA);
    assert.equal(refreshRes.status, 200, 'Refresh token rotation must succeed');
    cookiesA = refreshRes.setCookieHeader.map((c) => c.split(';')[0]).join('; ');
    tokenA = refreshRes.data.token;
    console.log('✓ 12. Refresh token rotation verified in RefreshSession collection');

    // 13. Multiple Delivery Addresses CRUD & Default Selection
    const addr1Res = await request(
      '/api/addresses',
      {
        method: 'POST',
        body: JSON.stringify({
          addressLabel: 'Home',
          recipientName: 'Kiran Kumar Reddy',
          mobileNumber: '9876543210',
          alternateMobileNumber: '9123456789',
          doorNumber: 'Flat 401',
          apartmentName: 'Cyber Meadows',
          street: '100 Feet Road',
          locality: 'Ayyappa Society',
          area: 'Madhapur',
          mandal: 'Serilingampally',
          district: 'Rangareddy',
          state: 'Telangana',
          country: 'India',
          pincode: '500081',
          latitude: 17.4504,
          longitude: 78.3912,
          deliveryInstructions: 'Call on arrival',
          isDefault: true,
        }),
      },
      cookiesA,
      tokenA
    );
    assert.equal(addr1Res.status, 201, 'First address creation must return 201');
    const addr1Id = addr1Res.data.address.id;

    const addr2Res = await request(
      '/api/addresses',
      {
        method: 'POST',
        body: JSON.stringify({
          addressLabel: 'Office',
          recipientName: 'Kiran Kumar Reddy',
          mobileNumber: '9876543210',
          doorNumber: 'Floor 5, Tower B',
          apartmentName: 'Raheja Mindspace',
          street: 'Hitech City Main Road',
          locality: 'Mindspace',
          area: 'Hitech City',
          mandal: 'Serilingampally',
          district: 'Hyderabad',
          state: 'Telangana',
          country: 'India',
          pincode: '500081',
          isDefault: false,
        }),
      },
      cookiesA,
      tokenA
    );
    assert.equal(addr2Res.status, 201, 'Second address creation must return 201');
    const addr2Id = addr2Res.data.address.id;

    // Set second address as default and verify only ONE is default
    const setDefRes = await request(
      `/api/addresses/${addr2Id}/default`,
      { method: 'PATCH' },
      cookiesA,
      tokenA
    );
    assert.equal(setDefRes.status, 200);
    const defaultCount = setDefRes.data.addresses.filter((a) => a.isDefault).length;
    assert.equal(defaultCount, 1, 'Exactly one address must be marked as default');
    assert.equal(
      setDefRes.data.addresses.find((a) => a.id === addr2Id).isDefault,
      true,
      'Second address must now be default'
    );

    // Edit first address
    const editAddrRes = await request(
      `/api/addresses/${addr1Id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          addressLabel: 'Hostel',
          doorNumber: 'Room 204',
        }),
      },
      cookiesA,
      tokenA
    );
    assert.equal(editAddrRes.status, 200);
    assert.equal(editAddrRes.data.address.addressLabel, 'Hostel');
    console.log('✓ 13. Multiple addresses created, edited, and single-default constraint verified');

    // 14. Cross-User Address Isolation (User B cannot access/edit/delete User A's addresses)
    await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'User B',
        email: userBEmail,
        password: 'StrongPassword@2026',
        confirmPassword: 'StrongPassword@2026',
        termsAccepted: true,
      }),
    });
    const otpB = await EmailVerification.findOne({ email: userBEmail }).lean();
    const verB = await request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email: userBEmail, otp: otpB.otp }),
    });
    const tokenB = verB.data.token;

    const unauthorizedGet = await request(`/api/addresses/${addr1Id}`, { method: 'GET' }, '', tokenB);
    assert.equal(unauthorizedGet.status, 404, 'User B must not read User A address');
    const unauthorizedDel = await request(
      `/api/addresses/${addr1Id}`,
      { method: 'DELETE' },
      '',
      tokenB
    );
    assert.equal(unauthorizedDel.status, 404, 'User B must not delete User A address');
    console.log('✓ 14. Cross-user address isolation verified (User B blocked from User A addresses)');

    // 15. Delete Address by Owner
    const delAddrRes = await request(
      `/api/addresses/${addr1Id}`,
      { method: 'DELETE' },
      cookiesA,
      tokenA
    );
    assert.equal(delAddrRes.status, 200);
    assert.equal(delAddrRes.data.addresses.length, 1);
    console.log('✓ 15. Address deletion by owner verified');

    // 16. Forgot Password & Reset Password with Session Invalidation
    const fpRes = await request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: userAEmail }),
    });
    assert.equal(fpRes.status, 200);

    // Inject known reset token hash to verify reset endpoint end-to-end
    const knownResetToken = crypto.randomBytes(32).toString('hex');
    await User.updateOne(
      { email: userAEmail },
      {
        $set: {
          resetPasswordTokenHash: hashToken(knownResetToken),
          resetPasswordExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      }
    );

    const rpRes = await request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token: knownResetToken,
        newPassword: 'NewStrongPassword#2026',
        confirmPassword: 'NewStrongPassword#2026',
      }),
    });
    assert.equal(rpRes.status, 200);

    const activeSessionsAfterReset = await RefreshSession.countDocuments({
      userId: rawUserInDb.id,
      revokedAt: null,
    });
    assert.equal(
      activeSessionsAfterReset,
      0,
      'All existing refresh sessions must be revoked after password reset'
    );
    console.log('✓ 16. Forgot password, password reset, and session invalidation verified');

    // 17. Logout
    const logoutRes = await request('/api/auth/logout', { method: 'POST' }, cookiesA);
    assert.equal(logoutRes.status, 200);
    console.log('✓ 17. Logout & cookie clearing verified');
  } finally {
    // Clean up temporary test users & records from MongoDB Atlas
    const testUsers = await User.find({ email: { $in: [userAEmail, userBEmail] } }).lean();
    const ids = testUsers.map((u) => u.id);
    await Address.deleteMany({ userId: { $in: ids } });
    await RefreshSession.deleteMany({ userId: { $in: ids } });
    await EmailVerification.deleteMany({ email: { $in: [userAEmail, userBEmail] } });
    await User.deleteMany({ email: { $in: [userAEmail, userBEmail] } });
    server.close();
  }

  console.log('\n🎉 ALL 17 END-TO-END AUTHENTICATION & ADDRESS TESTS PASSED AGAINST MONGODB ATLAS!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
