import lyricsFinder from "lyrics-finder";

export default async function handler(req, res) {
  const { artist = "", title = "" } = req.query;
  const lyrics = (await lyricsFinder(artist, title)) || null;
  res.status(200).json({ lyrics });
}
