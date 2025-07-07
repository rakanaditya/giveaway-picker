export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { username, password } = req.body;

  // Fixed admin (bisa juga nanti dari ENV)
  const ADMIN_USERNAME = "rakanaditya";
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  const isAdmin =
    username === ADMIN_USERNAME && password === ADMIN_PASSWORD;

  return res.status(200).json({ isAdmin });
}
