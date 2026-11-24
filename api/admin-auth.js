// api/admin-auth.js
import { connectDB, User } from '../db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method tidak diizinkan' });
  }

  try {
    const { username, password } = req.body || {};
    const cleanUsername = String(username || '').trim();
    const cleanPassword = String(password || '').trim();

    if (!cleanUsername || !cleanPassword) {
      return res.status(400).json({ isAdmin: false, message: 'Username dan password wajib diisi' });
    }

    const adminUsername = String(process.env.ADMIN_USERNAME || '').trim();
    const adminPassword = String(process.env.ADMIN_PASSWORD || '').trim();

    const isEnvAdmin =
      adminUsername !== '' &&
      adminPassword !== '' &&
      cleanUsername.toLowerCase() === adminUsername.toLowerCase() &&
      cleanPassword === adminPassword;

    await connectDB();

    if (isEnvAdmin) {
      await User.findOneAndUpdate(
        { username: cleanUsername.toLowerCase() },
        { username: cleanUsername.toLowerCase(), password: cleanPassword, isAdmin: true },
        { upsert: true, new: true }
      );
      return res.status(200).json({ isAdmin: true });
    }

    const existingUser = await User.findOne({
      username: cleanUsername.toLowerCase(),
      password: cleanPassword
    });

    return res.status(200).json({ isAdmin: Boolean(existingUser?.isAdmin) });
  } catch (err) {
    console.error('Admin Auth Error:', err);
    return res.status(500).json({ isAdmin: false, error: 'Server Error', details: err.message });
  }
}
