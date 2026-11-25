export default async function handler(req, res) {
  try {
    const artist = String(req.query.artist || "").trim();
    const title = String(req.query.title || "").trim();

    if (!title && !artist) {
      return res.status(400).json({ error: "Parameter title atau artist wajib diisi." });
    }

    let lyrics = null;

    try {
      const mod = await import("lyrics-finder");
      const finder = mod.default || mod;
      if (typeof finder === "function") {
        lyrics = (await finder(artist, title)) || null;
      }
    } catch (_) {}

    if (lyrics) {
      res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    }

    return res.status(200).json({ lyrics });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Gagal mengambil lirik", lyrics: null });
  }
}
