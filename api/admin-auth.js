export default function handler(req, res) {
  const { username, password } = req.body;

  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  const isAdmin = username === adminUsername && password === adminPassword;

  res.status(200).json({ isAdmin });
}
