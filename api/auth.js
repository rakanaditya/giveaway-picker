// pages/api/auth.js

import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method not allowed");

  const { username, password, mode } = req.body;
  const GAS_URL = process.env.GAS_AUTH_URL;

  if (!GAS_URL) return res.status(500).send("GAS_AUTH_URL not set in environment");
  if (!username || !password || !mode) return res.status(400).json({ success: false, message: "Missing fields" });

  const hashed = crypto.createHash("sha256").update(password).digest("hex");

  try {
    const response = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: hashed, mode })
    });

    const data = await response.json();
    if (data.success) {
      res.status(200).json({ success: true });
    } else {
      res.status(401).json({ success: false, message: data.message || "Gagal" });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
}
