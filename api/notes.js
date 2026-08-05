import { put, get } from '@vercel/blob';
import { Readable } from 'node:stream';
import { verifyToken } from './auth.js';

// Shared cloud storage for the Notes & Observations tab. One JSON blob holds
// the whole notes array, so every device that logs in reads and writes the
// same list. GET returns the notes; PUT overwrites them.
const BLOB_PATH = 'nl-rev-mgmt/notes.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!verifyToken(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const result = await get(BLOB_PATH, { access: 'private' });
      if (!result || result.statusCode !== 200) {
        return res.status(200).json({ notes: null });
      }
      res.setHeader('Content-Type', 'application/json');
      Readable.fromWeb(result.stream).pipe(res);
    } catch (err) {
      // No blob yet (first run) — tell the client to seed defaults.
      return res.status(200).json({ notes: null });
    }
  } else if (req.method === 'PUT') {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const notes = Array.isArray(body.notes) ? body.notes : [];
      // `seeded` tracks one-time note injections already applied to this shared
      // list, so they aren't re-added on the next device that loads.
      const seeded = Array.isArray(body.seeded) ? body.seeded : [];
      await put(BLOB_PATH, JSON.stringify({ notes, seeded }), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Notes save error:', err);
      return res.status(500).json({ error: 'Failed to save notes' });
    }
  } else {
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }
}
