export default async function handler(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10), 1), 20);

    if (!q) {
      return res.status(400).json({ error: "Parameter pencarian (q) wajib diisi.", results: [] });
    }

    let results = [];

    // 1. Prioritas: Gunakan YouTube Data API v3 jika YOUTUBE_API_KEY tersedia di env Vercel
    const ytApiKey = process.env.YOUTUBE_API_KEY;
    if (ytApiKey) {
      try {
        const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${limit}&q=${encodeURIComponent(q)}&key=${ytApiKey}`;
        const apiRes = await fetch(apiUrl);
        if (apiRes.ok) {
          const data = await apiRes.json();
          results = (data.items || [])
            .filter((item) => item.id?.videoId)
            .map((item) => ({
              videoId: item.id.videoId,
              title: item.snippet.title,
              channel: item.snippet.channelTitle,
              thumbnail:
                item.snippet.thumbnails?.high?.url ||
                item.snippet.thumbnails?.medium?.url ||
                `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg`,
              duration: "",
              url: `https://www.youtube.com/watch?v=${item.id.videoId}`
            }));
        }
      } catch (_) {}
    }

    // 2. Fallback Otomatis Tanpa API Key (via yt-search jika terinstall)
    if (!results.length) {
      try {
        const mod = await import("yt-search");
        const yts = mod.default || mod;
        const searchRes = await yts(q);
        results = (searchRes.videos || []).slice(0, limit).map((v) => ({
          videoId: v.videoId,
          title: v.title,
          channel: v.author?.name || "YouTube",
          thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
          duration: v.timestamp || "",
          url: v.url || `https://www.youtube.com/watch?v=${v.videoId}`
        }));
      } catch (_) {}
    }

    // 3. Fallback Murni Fetch HTML YouTube (Tanpa Package Tambahan & Tanpa API Key)
    if (!results.length) {
      const ytHtmlRes = await fetch(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9"
          }
        }
      );
      const html = await ytHtmlRes.text();
      const match = html.match(/var ytInitialData = ({.*?});<\/script>/);

      if (match && match[1]) {
        const initialData = JSON.parse(match[1]);
        const sections =
          initialData?.contents?.twoColumnSearchResultsRenderer?.primaryContents
            ?.sectionListRenderer?.contents || [];

        for (const sec of sections) {
          const items = sec?.itemSectionRenderer?.contents || [];
          for (const item of items) {
            const vr = item.videoRenderer;
            if (!vr || !vr.videoId) continue;

            const titleText =
              vr.title?.runs?.map((r) => r.text).join("") ||
              vr.title?.simpleText ||
              `YouTube Video (${vr.videoId})`;
            const channelText =
              vr.ownerText?.runs?.map((r) => r.text).join("") ||
              vr.longBylineText?.runs?.map((r) => r.text).join("") ||
              "YouTube";
            const durText = vr.lengthText?.simpleText || "";

            results.push({
              videoId: vr.videoId,
              title: titleText,
              channel: channelText,
              thumbnail: `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
              duration: durText,
              url: `https://www.youtube.com/watch?v=${vr.videoId}`
            });

            if (results.length >= limit) break;
          }
          if (results.length >= limit) break;
        }
      }
    }

    if (results.length) {
      res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    }

    return res.status(200).json({ results });
  } catch (err) {
    return res.status(500).json({
      error: err.message || "Gagal mencari video YouTube",
      results: []
    });
  }
}
