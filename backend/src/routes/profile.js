import { Router } from 'express';
import bcrypt from 'bcrypt';
import { requireAuth } from '../middleware/auth.js';
import { validateStrongPassword } from './auth.js';
import {
  findUserById,
  findUserByUsername,
  updateUser,
  deleteUser,
  sanitizeUser,
  getProductById,
  updateProduct,
  listUserNotifications,
  markAllNotificationsRead,
  revokeAllUserRefreshSessions,
} from '../store/repository.js';
import { sendUserNotification } from '../utils/emailService.js';

const router = Router();

router.use(requireAuth);

// GET /api/users/profile & GET /api/profile
router.get(['/', '/profile'], async (req, res) => {
  const user = await findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  return res.json({ user: await sanitizeUser(user) });
});

// PART 3: PERSONAL PROFILE COMPLETION (POST /api/users/complete-profile)
router.post('/complete-profile', async (req, res) => {
  try {
    const { username, mobileNumber, gender, dateOfBirth, fullName } = req.body || {};

    const cleanUsername = String(username || '')
      .toLowerCase()
      .trim();
    const cleanMobile = String(mobileNumber || '')
      .replace(/\D/g, '')
      .trim();
    const cleanGender = String(gender || '').trim();

    if (!cleanUsername || !/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
      return res.status(400).json({
        error: 'Username must be 3–24 characters and contain only letters, numbers, or underscores.',
      });
    }

    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      return res.status(400).json({
        error: 'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.',
      });
    }

    if (!['Male', 'Female', 'Prefer not to say'].includes(cleanGender)) {
      return res.status(400).json({
        error: 'Please select a valid gender option (Male, Female, or Prefer not to say).',
      });
    }

    if (!dateOfBirth || Number.isNaN(new Date(dateOfBirth).getTime())) {
      return res.status(400).json({ error: 'Please provide a valid Date of Birth.' });
    }

    const existingWithUsername = await findUserByUsername(cleanUsername);
    if (existingWithUsername && existingWithUsername.id !== req.user.id) {
      return res.status(409).json({
        error: 'This username is already taken. Please choose another username.',
      });
    }

    const patch = {
      username: cleanUsername,
      mobileNumber: cleanMobile,
      phone: cleanMobile,
      gender: cleanGender,
      dateOfBirth: new Date(dateOfBirth),
      isProfileCompleted: true,
    };
    if (fullName && String(fullName).trim()) {
      patch.fullName = String(fullName).trim();
      patch.name = String(fullName).trim();
    }

    const updated = await updateUser(req.user.id, patch);
    return res.json({
      message: 'Personal profile completed successfully!',
      user: await sanitizeUser(updated),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to complete profile.' });
  }
});

// PUT /api/users/profile & PUT /api/profile
async function handleUpdateProfile(req, res) {
  try {
    const {
      fullName,
      name,
      username,
      mobileNumber,
      phone,
      gender,
      dateOfBirth,
      photoUrl,
      preferences,
    } = req.body || {};

    const current = await findUserById(req.user.id);
    if (!current) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const patch = {};
    const nextName = String(fullName || name || '').trim();
    if (nextName) {
      patch.fullName = nextName;
      patch.name = nextName;
    }

    if (username !== undefined && String(username).trim()) {
      const cleanUsername = String(username).toLowerCase().trim();
      if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
        return res.status(400).json({
          error: 'Username must be 3–24 characters (letters, numbers, underscores).',
        });
      }
      const existingWithUsername = await findUserByUsername(cleanUsername);
      if (existingWithUsername && existingWithUsername.id !== req.user.id) {
        return res.status(409).json({ error: 'Username is already taken.' });
      }
      patch.username = cleanUsername;
    }

    const rawPhone = mobileNumber !== undefined ? mobileNumber : phone;
    if (rawPhone !== undefined) {
      const digits = String(rawPhone).replace(/\D/g, '').slice(-10);
      if (digits && !/^[6-9]\d{9}$/.test(digits)) {
        return res.status(400).json({
          error: 'Please enter a valid 10-digit Indian mobile number.',
        });
      }
      patch.mobileNumber = digits;
      patch.phone = digits;
    }

    if (gender !== undefined && ['Male', 'Female', 'Prefer not to say', ''].includes(gender)) {
      patch.gender = gender;
    }

    if (dateOfBirth !== undefined && dateOfBirth) {
      const dob = new Date(dateOfBirth);
      if (!Number.isNaN(dob.getTime())) patch.dateOfBirth = dob;
    }

    if (photoUrl !== undefined) patch.photoUrl = String(photoUrl).trim();

    if (preferences && typeof preferences === 'object') {
      patch.preferences = {
        ...current.preferences,
        vegOnly:
          preferences.vegOnly !== undefined
            ? Boolean(preferences.vegOnly)
            : current.preferences?.vegOnly ?? true,
        spiceLevel: ['mild', 'medium', 'spicy'].includes(preferences.spiceLevel)
          ? preferences.spiceLevel
          : current.preferences?.spiceLevel || 'medium',
        allergies: Array.isArray(preferences.allergies)
          ? preferences.allergies
          : String(preferences.allergies || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
        deliveryNotes:
          preferences.deliveryNotes !== undefined
            ? String(preferences.deliveryNotes).trim()
            : current.preferences?.deliveryNotes || '',
      };
    }

    const updated = await updateUser(req.user.id, patch);
    return res.json({ user: await sanitizeUser(updated) });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to update profile.' });
  }
}

router.put('/', handleUpdateProfile);
router.put('/profile', handleUpdateProfile);

// PUT /api/users/change-password & PUT /api/profile/password
async function handleChangePassword(req, res) {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required.' });
    }
    if (confirmPassword !== undefined && String(newPassword) !== String(confirmPassword)) {
      return res.status(400).json({ error: 'New password and confirm password do not match.' });
    }
    const pwdError = validateStrongPassword(newPassword);
    if (pwdError) {
      return res.status(400).json({ error: pwdError });
    }

    const current = await findUserById(req.user.id, true);
    if (!current) return res.status(404).json({ error: 'User not found.' });

    const storedHash = current.password || current.passwordHash || '';
    if (storedHash) {
      const valid = await bcrypt.compare(String(currentPassword || ''), storedHash);
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 12);
    await updateUser(req.user.id, { password: passwordHash });
    await revokeAllUserRefreshSessions(req.user.id);

    await sendUserNotification({
      userId: current.id,
      email: current.email,
      type: 'security',
      title: 'Password Changed Successfully',
      message:
        'Your HRUVITA account password was updated. If you did not make this change, contact support immediately.',
    });

    return res.json({ updated: true, message: 'Password updated successfully.' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to update password.' });
  }
}

router.put('/password', handleChangePassword);
router.put('/change-password', handleChangePassword);

router.get('/notifications', async (req, res) => {
  const notifications = await listUserNotifications(req.user.id);
  return res.json({ notifications });
});

router.post('/notifications/read-all', async (req, res) => {
  const notifications = await markAllNotificationsRead(req.user.id);
  return res.json({ notifications });
});

router.post('/wishlist/:productId', async (req, res) => {
  try {
    const current = await findUserById(req.user.id);
    const productId = req.params.productId;
    const list = Array.isArray(current.wishlist) ? [...current.wishlist] : [];
    const alreadyLiked = list.includes(productId);
    const nextWishlist = alreadyLiked
      ? list.filter((id) => id !== productId)
      : [...list, productId];
    const updated = await updateUser(req.user.id, { wishlist: nextWishlist });

    const prod = await getProductById(productId);
    let updatedProduct = null;
    if (prod) {
      const nextLikes = Math.max(0, (prod.likes || 24) + (alreadyLiked ? -1 : 1));
      updatedProduct = await updateProduct(productId, { likes: nextLikes });
    }

    return res.json({
      user: await sanitizeUser(updated),
      product: updatedProduct,
      liked: !alreadyLiked,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to update wishlist.' });
  }
});

router.delete('/', async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(400).json({ error: 'Primary admin account cannot be self-deleted.' });
    }
    await deleteUser(req.user.id);
    return res.json({ deleted: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to delete account.' });
  }
});

export default router;
