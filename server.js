import express from "express";
import ytdl from "ytdl-core";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Serve frontend files
app.use(express.static(path.join(__dirname, "public")));

// API endpoint untuk ambil audio dari YouTube
app.get("/api/ytaudio", async (req, res) => {
  const videoURL = req.query.url;
  if (!videoURL || !ytdl.validateURL(videoURL)) {
    return res.status(400).json({ error: "URL YouTube tidak valid" });
  }

  try {
    const info = await ytdl.getInfo(videoURL);
    const title = info.videoDetails.title.replace(/[^\w\s]/gi, "_");

    res.setHeader("Content-Disposition", `attachment; filename="${title}.mp3"`);
    res.setHeader("Content-Type", "audio/mpeg");

    ytdl(videoURL, {
      filter: "audioonly",
      quality: "highestaudio"
    }).pipe(res);
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil audio: " + err.message });
  }
});

// Jalankan server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server berjalan di http://localhost:${PORT}`));
