// server.js
const express = require("express");
const ytdl = require("ytdl-core");
const path = require("path");

const app = express();
const PORT = 3000;

// Serve file statis (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, "public")));

// Endpoint download audio dari YouTube
app.get("/youtube", async (req, res) => {
  const videoURL = req.query.url;
  if (!videoURL || !ytdl.validateURL(videoURL)) {
    return res.status(400).send("URL YouTube tidak valid.");
  }

  res.header("Content-Disposition", 'attachment; filename="audio.mp3"');
  res.header("Content-Type", "audio/mpeg");

  try {
    ytdl(videoURL, { filter: "audioonly", quality: "highestaudio" })
      .pipe(res);
  } catch (err) {
    res.status(500).send("Gagal mengambil audio: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
