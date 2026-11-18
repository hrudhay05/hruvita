import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listAddressesByUser,
  getAddressByIdForUser,
  createAddressForUser,
  updateAddressForUser,
  setDefaultAddressForUser,
  deleteAddressForUser,
  findUserById,
  sanitizeUser,
} from '../store/repository.js';

const router = Router();

router.use(requireAuth);

// PART 5: REVERSE GEOCODING ENDPOINT (GET /api/addresses/reverse-geocode?lat=...&lon=...)
// Never invents missing fields: leaves unidentified fields blank ('')
router.get('/reverse-geocode', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: 'Valid latitude and longitude coordinates are required.' });
    }

    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en-IN,en;q=0.9',
        'User-Agent': 'HRUVITA-Food-Platform/1.0 (contact@hruvita.com)',
      },
    });

    if (!response.ok) {
      return res.status(502).json({
        error: 'Reverse geocoding provider is temporarily unavailable. Please enter address fields manually.',
      });
    }

    const data = await response.json();
    const addr = data.address || {};

    const detected = {
      doorNumber: addr.house_number || '',
      apartmentName: addr.building || addr.apartment || addr.residential || '',
      street: addr.road || addr.pedestrian || addr.street || '',
      locality: addr.neighbourhood || addr.quarter || addr.hamlet || '',
      area: addr.suburb || addr.city_district || addr.village || addr.town || '',
      mandal: addr.county || addr.municipality || addr.subdistrict || '',
      district: addr.state_district || addr.city || addr.town || '',
      state: addr.state || '',
      country: addr.country || '',
      pincode: addr.postcode ? String(addr.postcode).replace(/\D/g, '').slice(0, 6) : '',
      latitude: lat,
      longitude: lon,
      displayName: data.display_name || '',
    };

    return res.json({ detected });
  } catch (err) {
    return res.status(502).json({
      error: err.message || 'Network error while reverse geocoding coordinates.',
    });
  }
});

function validateAddressInput(body, isUpdate = false) {
  const recipientName = String(body.recipientName || body.recipient || '').trim();
  const mobileDigits = String(body.mobileNumber || body.phone || '')
    .replace(/\D/g, '')
    .slice(-10);
  const altDigits = body.alternateMobileNumber
    ? String(body.alternateMobileNumber).replace(/\D/g, '').slice(-10)
    : '';
  const pincode = String(body.pincode || '').trim();

  if (!isUpdate || body.recipientName !== undefined || body.recipient !== undefined) {
    if (!recipientName) return 'Recipient name is required.';
  }
  if (!isUpdate || body.mobileNumber !== undefined || body.phone !== undefined) {
    if (!/^[6-9]\d{9}$/.test(mobileDigits)) {
      return 'Enter a valid 10-digit Indian mobile number starting with 6–9.';
    }
  }
  if (altDigits && !/^[6-9]\d{9}$/.test(altDigits)) {
    return 'Alternate mobile number must be a valid 10-digit Indian mobile number.';
  }
  if (!isUpdate || body.pincode !== undefined) {
    if (!/^\d{6}$/.test(pincode)) {
      return 'Enter a valid 6-digit PIN code.';
    }
  }
  if (body.addressLabel && !['Home', 'Office', 'Hostel', 'Other'].includes(body.addressLabel)) {
    return 'Address label must be Home, Office, Hostel, or Other.';
  }
  return null;
}

// GET /api/addresses — View all saved addresses for the authenticated user
router.get('/', async (req, res) => {
  const addresses = await listAddressesByUser(req.user.id);
  return res.json({ addresses });
});

// GET /api/addresses/:id — Get a single address owned by the authenticated user
router.get('/:id', async (req, res) => {
  const address = await getAddressByIdForUser(req.params.id, req.user.id);
  if (!address) {
    return res.status(404).json({ error: 'Address not found or access denied.' });
  }
  return res.json({ address });
});

// POST /api/addresses — Create a new address for the authenticated user
router.post('/', async (req, res) => {
  try {
    const errMsg = validateAddressInput(req.body || {}, false);
    if (errMsg) {
      return res.status(400).json({ error: errMsg });
    }

    const address = await createAddressForUser(req.user.id, req.body || {});
    const updatedUser = await findUserById(req.user.id);
    const addresses = await listAddressesByUser(req.user.id);

    return res.status(201).json({
      message: 'Address saved successfully.',
      address,
      addresses,
      user: await sanitizeUser(updatedUser),
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to save address.' });
  }
});

// PUT /api/addresses/:id — Edit an existing address owned by the authenticated user
router.put('/:id', async (req, res) => {
  try {
    const errMsg = validateAddressInput(req.body || {}, true);
    if (errMsg) {
      return res.status(400).json({ error: errMsg });
    }

    const updated = await updateAddressForUser(req.params.id, req.user.id, req.body || {});
    if (!updated) {
      return res.status(404).json({ error: 'Address not found or access denied.' });
    }

    const updatedUser = await findUserById(req.user.id);
    const addresses = await listAddressesByUser(req.user.id);

    return res.json({
      message: 'Address updated successfully.',
      address: updated,
      addresses,
      user: await sanitizeUser(updatedUser),
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to update address.' });
  }
});

// PATCH /api/addresses/:id/default — Set an address as the default for the authenticated user
router.patch('/:id/default', async (req, res) => {
  try {
    const updated = await setDefaultAddressForUser(req.params.id, req.user.id);
    if (!updated) {
      return res.status(404).json({ error: 'Address not found or access denied.' });
    }

    const updatedUser = await findUserById(req.user.id);
    const addresses = await listAddressesByUser(req.user.id);

    return res.json({
      message: 'Default address updated.',
      address: updated,
      addresses,
      user: await sanitizeUser(updatedUser),
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to set default address.' });
  }
});

// DELETE /api/addresses/:id — Delete an address owned by the authenticated user
router.delete('/:id', async (req, res) => {
  try {
    const ok = await deleteAddressForUser(req.params.id, req.user.id);
    if (!ok) {
      return res.status(404).json({ error: 'Address not found or access denied.' });
    }

    const updatedUser = await findUserById(req.user.id);
    const addresses = await listAddressesByUser(req.user.id);

    return res.json({
      deleted: true,
      message: 'Address deleted.',
      addresses,
      user: await sanitizeUser(updatedUser),
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to delete address.' });
  }
});

export default router;
