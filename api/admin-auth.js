export default function handler(req, res) {
  const { username, password } = req.body;

  const isAdmin = username === "rakanaditya" && password === "aditganteng213";

  res.status(200).json({ isAdmin });
}
