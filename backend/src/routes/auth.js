import crypto from 'crypto';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import {
  findUserByEmail,
  findUserByEmailOrUsername,
  findUserById,
  findUserByResetTokenHash,
  createUser,
  updateUser,
  sanitizeUser,
  recordAudit,
  createOrUpdateOtpRecord,
  getOtpRecordByEmail,
  incrementOtpAttempts,
  deleteOtpRecordByUserId,
  createRefreshSession,
  findValidRefreshSession,
  revokeRefreshSessionByHash,
  revokeAllUserRefreshSessions,
  createNotification,
} from '../store/repository.js';
import {
  requireAuth,
  signToken,
  signRefreshToken,
  verifyRefreshTokenJwt,
  hashToken,
  setAuthCookies,
  clearAuthCookies,
  REFRESH_COOKIE_NAME,
} from '../middleware/auth.js';
import {
  sendOtpEmail,
  sendAccountCreatedCongratsEmail,
  sendPasswordResetEmail,
  sendUserNotification,
} from '../utils/emailService.js';

const router = Router();
const loginAttempts = new Map();

export function validateStrongPassword(password) {
  const pwd = String(password || '');
  if (pwd.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[A-Z]/.test(pwd)) return 'Password must contain at least one uppercase letter (A-Z).';
  if (!/[a-z]/.test(pwd)) return 'Password must contain at least one lowercase letter (a-z).';
  if (!/[0-9]/.test(pwd)) return 'Password must contain at least one number (0-9).';
  if (!/[^A-Za-z0-9]/.test(pwd)) {
    return 'Password must contain at least one special character (@, #, $, !, etc.).';
  }
  return null;
}

function generateSixDigitOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

async function issueSessionAndCookies(req, res, userObj, rememberMe = false) {
  const clean = await sanitizeUser(userObj);
  const accessToken = signToken(clean);
  const refreshToken = signRefreshToken(clean, rememberMe);
  const hashedRefreshToken = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000);

  await createRefreshSession({
    userId: clean.id,
    hashedRefreshToken,
    rememberMe,
    userAgent: req.headers['user-agent'] || '',
    ipAddress: req.ip || '',
    expiresAt,
  });

  setAuthCookies(res, accessToken, refreshToken, rememberMe);
  return { user: clean, token: accessToken };
}

// PART 1: USER SIGNUP (POST /api/auth/signup & /api/auth/register)
async function handleSignup(req, res) {
  try {
    const {
      fullName,
      name,
      email,
      password,
      confirmPassword,
      termsAccepted,
      referredBy = '',
    } = req.body || {};

    const finalFullName = String(fullName || name || '').trim();
    const emailClean = String(email || '').toLowerCase().trim();

    if (!finalFullName || !emailClean || !password) {
      return res.status(400).json({ error: 'Full name, email address, and password are required.' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    if (confirmPassword !== undefined && String(password) !== String(confirmPassword)) {
      return res.status(400).json({ error: 'Password and confirm password do not match.' });
    }

    if (termsAccepted !== undefined && !termsAccepted) {
      return res.status(400).json({ error: 'You must accept the Terms and Conditions to sign up.' });
    }

    const pwdError = validateStrongPassword(password);
    if (pwdError) {
      return res.status(400).json({ error: pwdError });
    }

    const existing = await findUserByEmail(emailClean, true);
    if (existing && existing.isEmailVerified) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    // Hash password with bcrypt cost factor 12 ($2b$12$...)
    const passwordHash = await bcrypt.hash(String(password), 12);

    let user;
    if (existing && !existing.isEmailVerified) {
      user = await updateUser(existing.id, {
        fullName: finalFullName,
        name: finalFullName,
        password: passwordHash,
        termsAccepted: true,
      });
    } else {
      user = await createUser({
        fullName: finalFullName,
        name: finalFullName,
        email: emailClean,
        password: passwordHash,
        isEmailVerified: false,
        isProfileCompleted: false,
        termsAccepted: true,
        referredBy,
        role: 'customer',
        rewardPoints: referredBy ? 50 : 25,
      });
    }

    // Generate 6-digit OTP and store plain 6-digit OTP in EmailVerification collection (10m expiry)
    const otp = generateSixDigitOtp();
    await createOrUpdateOtpRecord({
      userId: user.id,
      email: emailClean,
      otp,
      isResend: false,
    });

    await sendOtpEmail({
      to: emailClean,
      fullName: finalFullName,
      otp,
    });

    return res.status(201).json({
      message: 'Account created! A 6-digit verification OTP has been sent to your email.',
      requiresEmailVerification: true,
      email: emailClean,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Signup failed.' });
  }
}

router.post('/signup', handleSignup);
router.post('/register', handleSignup);

// PART 2 & LOGIN 2FA: VERIFY EMAIL OTP (POST /api/auth/verify-email)
router.post('/verify-email', async (req, res) => {
  try {
    const { email, otp, rememberMe = false } = req.body || {};
    const emailClean = String(email || '').toLowerCase().trim();
    const otpClean = String(otp || '').trim();

    if (!emailClean || !/^\d{6}$/.test(otpClean)) {
      return res.status(400).json({ error: 'Valid email and 6-digit numeric OTP are required.' });
    }

    const user = await findUserByEmail(emailClean);
    if (!user) {
      return res.status(404).json({ error: 'Account not found for this email address.' });
    }

    const record = await getOtpRecordByEmail(emailClean);
    if (!record) {
      return res.status(400).json({ error: 'OTP has expired or was not found. Please request a new OTP.' });
    }

    if (new Date(record.expiresAt) < new Date()) {
      await deleteOtpRecordByUserId(user.id);
      return res.status(400).json({ error: 'OTP has expired (valid for 10 minutes). Please resend OTP.' });
    }

    if ((record.attempts || 0) >= 5) {
      await deleteOtpRecordByUserId(user.id);
      return res.status(429).json({
        error: 'Too many incorrect OTP attempts. Please click Resend OTP to generate a new code.',
      });
    }

    if (String(record.otp) !== otpClean) {
      const updatedRec = await incrementOtpAttempts(user.id);
      const remaining = Math.max(0, 5 - (updatedRec?.attempts || 1));
      return res.status(400).json({
        error: `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      });
    }

    // Valid OTP: delete OTP record
    await deleteOtpRecordByUserId(user.id);
    const wasFirstTimeVerification = !user.isEmailVerified;
    const verifiedUser = wasFirstTimeVerification
      ? await updateUser(user.id, { isEmailVerified: true })
      : user;

    if (wasFirstTimeVerification) {
      await sendAccountCreatedCongratsEmail({
        to: verifiedUser.email,
        fullName: verifiedUser.fullName || verifiedUser.name || 'Customer',
        referralCode: verifiedUser.referralCode || '',
        rewardPoints: verifiedUser.rewardPoints || 25,
      });

      await createNotification({
        userId: verifiedUser.id,
        type: 'welcome',
        title: '🎉 Congratulations! Your HRUVITA Account is Created',
        message: `Welcome ${verifiedUser.fullName}! Your email (${verifiedUser.email}) is verified and ${verifiedUser.rewardPoints || 25} reward points are ready in your wallet.`,
        emailSent: true,
      });
    } else {
      await sendUserNotification({
        userId: verifiedUser.id,
        email: verifiedUser.email,
        type: 'security',
        title: 'New Sign-In Verified via OTP',
        message: `Your HRUVITA account (${verifiedUser.email}) was signed in using 2-step OTP verification at ${new Date().toLocaleTimeString('en-IN')}.`,
      });
    }

    const session = await issueSessionAndCookies(req, res, verifiedUser, Boolean(rememberMe));

    if (session.user.role === 'admin' || session.user.role === 'staff') {
      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        action: 'ADMIN_LOGIN',
        entity: 'user',
        entityId: session.user.id,
      });
    }

    return res.json({
      message: wasFirstTimeVerification
        ? 'Email verified! Congratulations, your account is created.'
        : 'OTP verified! Signed in successfully.',
      ...session,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'OTP verification failed.' });
  }
});

// PART 2: RESEND OTP (POST /api/auth/resend-otp) — Works for both Signup & Login OTP
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body || {};
    const emailClean = String(email || '').toLowerCase().trim();
    if (!emailClean) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const user = await findUserByEmail(emailClean);
    if (!user) {
      return res.status(404).json({ error: 'Account not found for this email address.' });
    }

    const otp = generateSixDigitOtp();
    await createOrUpdateOtpRecord({
      userId: user.id,
      email: emailClean,
      otp,
      isResend: true,
    });

    await sendOtpEmail({
      to: emailClean,
      fullName: user.fullName || user.name || 'Customer',
      otp,
      mode: user.isEmailVerified ? 'login' : 'signup',
    });

    return res.json({
      message: 'A new 6-digit OTP has been sent to your email.',
      email: emailClean,
    });
  } catch (err) {
    return res.status(429).json({ error: err.message || 'Could not resend OTP.' });
  }
});

// PART 6: SECURE LOGIN WITH OTP VERIFICATION (POST /api/auth/login)
router.post('/login', async (req, res) => {
  try {
    const {
      emailOrUsername,
      email,
      username,
      password,
      rememberMe = false,
      directDemo = false,
    } = req.body || {};
    const identifier = String(emailOrUsername || email || username || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email/Username and password are required.' });
    }

    const attemptKey = identifier.toLowerCase();
    const attempt = loginAttempts.get(attemptKey);
    if (attempt && attempt.count >= 5 && Date.now() - attempt.lastAt < 10 * 60 * 1000) {
      return res.status(429).json({
        error: 'Too many failed login attempts. Account locked for 10 minutes for your security.',
      });
    }

    const user = await findUserByEmailOrUsername(identifier, true);
    const storedHash = user?.password || user?.passwordHash || '';
    if (!user || !storedHash) {
      loginAttempts.set(attemptKey, { count: (attempt?.count || 0) + 1, lastAt: Date.now() });
      return res.status(401).json({ error: 'Invalid email/username or password.' });
    }

    if (user.blocked) {
      return res.status(403).json({ error: 'This account has been suspended by admin.' });
    }

    const valid = await bcrypt.compare(String(password), storedHash);
    if (!valid) {
      loginAttempts.set(attemptKey, { count: (attempt?.count || 0) + 1, lastAt: Date.now() });
      return res.status(401).json({ error: 'Invalid email/username or password.' });
    }

    loginAttempts.delete(attemptKey);

    // Unverified user: send signup verification OTP and block direct login
    if (user.isEmailVerified === false) {
      const otp = generateSixDigitOtp();
      await createOrUpdateOtpRecord({
        userId: user.id,
        email: user.email,
        otp,
        isResend: false,
      });
      await sendOtpEmail({
        to: user.email,
        fullName: user.fullName || user.name || 'Customer',
        otp,
        mode: 'signup',
      });

      return res.status(403).json({
        error: 'Please verify your email address with the 6-digit OTP sent to your email.',
        requiresEmailVerification: true,
        requiresOtpVerification: true,
        mode: 'signup',
        email: user.email,
      });
    }

    // Optional instant demo button bypass (only for seeded demo accounts when explicitly requested)
    if (directDemo && (user.email === 'customer@hruvita.com' || user.email === 'admin@hruvita.com')) {
      const session = await issueSessionAndCookies(req, res, user, Boolean(rememberMe));
      return res.json(session);
    }

    // Standard Login Flow: Generate 6-digit Login OTP -> Send to Email -> Verify OTP then Login!
    const otp = generateSixDigitOtp();
    await createOrUpdateOtpRecord({
      userId: user.id,
      email: user.email,
      otp,
      isResend: false,
    });

    await sendOtpEmail({
      to: user.email,
      fullName: user.fullName || user.name || 'Customer',
      otp,
      mode: 'login',
    });

    return res.json({
      requiresOtpVerification: true,
      mode: 'login',
      email: user.email,
      rememberMe: Boolean(rememberMe),
      message: `Credentials verified! A 6-digit login OTP has been sent to ${user.email}.`,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Sign in failed.' });
  }
});

// PART 6: REFRESH TOKEN ROTATION (POST /api/auth/refresh)
router.post('/refresh', async (req, res) => {
  try {
    const rawRefresh = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken || '';
    if (!rawRefresh) {
      return res.status(401).json({ error: 'Refresh token missing.' });
    }

    const decoded = verifyRefreshTokenJwt(rawRefresh);
    const hashed = hashToken(rawRefresh);
    const existingSession = await findValidRefreshSession(hashed);
    if (!existingSession) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Refresh session is expired or revoked.' });
    }

    // Rotate refresh token: revoke old session and issue a new one
    await revokeRefreshSessionByHash(hashed);

    const user = await findUserById(decoded.id);
    if (!user || user.blocked) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'User account unavailable.' });
    }

    const session = await issueSessionAndCookies(req, res, user, Boolean(existingSession.rememberMe));
    return res.json(session);
  } catch {
    clearAuthCookies(res);
    return res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }
});

// PART 6: LOGOUT & SESSION INVALIDATION (POST /api/auth/logout)
router.post('/logout', async (req, res) => {
  try {
    const rawRefresh = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken || '';
    if (rawRefresh) {
      await revokeRefreshSessionByHash(hashToken(rawRefresh));
    }
    clearAuthCookies(res);
    return res.json({ loggedOut: true, message: 'Signed out and session invalidated.' });
  } catch {
    clearAuthCookies(res);
    return res.json({ loggedOut: true });
  }
});

// PART 7: FORGOT PASSWORD (POST /api/auth/forgot-password)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    const emailClean = String(email || '').toLowerCase().trim();
    if (!emailClean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
      return res.status(400).json({ error: 'Please enter a valid registered email address.' });
    }

    const user = await findUserByEmail(emailClean);
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await updateUser(user.id, {
        resetPasswordTokenHash: tokenHash,
        resetPasswordExpiresAt: expiresAt,
      });

      const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:5174').split(',')[0].trim();
      const resetUrl = `${frontendBase}/reset-password?token=${rawToken}&email=${encodeURIComponent(emailClean)}`;

      await sendPasswordResetEmail({
        to: emailClean,
        fullName: user.fullName || user.name || 'Customer',
        resetUrl,
      });
    }

    return res.json({
      message: 'If that email address is registered, a password reset link has been sent.',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Could not process forgot password request.' });
  }
});

// PART 7: RESET PASSWORD (POST /api/auth/reset-password)
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body || {};
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Reset token and new password are required.' });
    }

    if (confirmPassword !== undefined && String(newPassword) !== String(confirmPassword)) {
      return res.status(400).json({ error: 'Password and confirm password do not match.' });
    }

    const pwdError = validateStrongPassword(newPassword);
    if (pwdError) {
      return res.status(400).json({ error: pwdError });
    }

    const tokenHash = hashToken(String(token).trim());
    const user = await findUserByResetTokenHash(tokenHash);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired password reset link.' });
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 12);
    await updateUser(user.id, {
      password: passwordHash,
      resetPasswordTokenHash: null,
      resetPasswordExpiresAt: null,
    });

    // Invalidate all existing sessions after password reset
    await revokeAllUserRefreshSessions(user.id);
    clearAuthCookies(res);

    await sendUserNotification({
      userId: user.id,
      email: user.email,
      type: 'security',
      title: 'Password Reset Complete',
      message: 'Your password was reset successfully and all active sessions were signed out.',
    });

    return res.json({
      message: 'Password reset successful! You can now sign in with your new password.',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Password reset failed.' });
  }
});

router.post('/google', async (req, res) => {
  try {
    const { email, name, photoUrl = '' } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'Google email is required.' });
    }

    let user = await findUserByEmail(email);
    let isNew = false;
    if (!user) {
      isNew = true;
      const randomPwd = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12);
      user = await createUser({
        fullName: name || email.split('@')[0],
        name: name || email.split('@')[0],
        email,
        password: randomPwd,
        isEmailVerified: true,
        isProfileCompleted: false,
        photoUrl,
        role: 'customer',
        rewardPoints: 25,
      });
    } else if (user.blocked) {
      return res.status(403).json({ error: 'This account has been blocked by admin.' });
    }

    const session = await issueSessionAndCookies(req, res, user, true);

    await sendUserNotification({
      userId: session.user.id,
      email: session.user.email,
      type: isNew ? 'welcome' : 'security',
      title: isNew ? 'Welcome to HRUVITA via Google!' : 'Google Sign-In Successful',
      message: isNew
        ? `Welcome ${session.user.fullName}! We added 25 reward points to your account.`
        : `Signed in with Google (${session.user.email}).`,
    });

    return res.json(session);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Google sign-in failed.' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  return res.json({ user: req.user });
});

// Quiet session probe so logged-out storefront visitors don't see 401 console errors
router.get('/session', async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const token =
      req.cookies?.hruvita_access_token ||
      (header.startsWith('Bearer ') ? header.slice(7).trim() : '');
    if (!token) return res.json({ authenticated: false, user: null });

    const jwtMod = await import('jsonwebtoken');
    const decoded = jwtMod.default.verify(
      token,
      process.env.JWT_SECRET || 'hruvita-jwt-access-secret-2026-secure'
    );
    const user = await findUserById(decoded.id);
    if (!user || user.blocked) return res.json({ authenticated: false, user: null });
    return res.json({ authenticated: true, user: await sanitizeUser(user) });
  } catch {
    return res.json({ authenticated: false, user: null });
  }
});

export default router;
