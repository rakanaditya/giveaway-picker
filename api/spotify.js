export default async function handler(req, res) {
  const clientId = process.env.Client_ID_Spotify;
  const clientSecret = process.env.Client_ID_Secret_Spotify;

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      error: "Environment variable Client_ID_Spotify atau Client_ID_Secret_Spotify belum diatur di Vercel."
    });
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  try {
    // 1. Buat URL Login OAuth2 Spotify
    if (req.method === "GET" && req.query.action === "login") {
      const redirectUri = req.query.redirect_uri;
      if (!redirectUri) {
        return res.status(400).json({ error: "Parameter redirect_uri wajib disertakan." });
      }

      const scopes = [
        "streaming",
        "user-read-email",
        "user-read-private",
        "playlist-read-private",
        "playlist-read-collaborative",
        "user-modify-playback-state",
        "user-read-playback-state"
      ].join(" ");

      const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        scope: scopes,
        redirect_uri: redirectUri,
        show_dialog: "true"
      });

      return res.status(200).json({
        authUrl: `https://accounts.spotify.com/authorize?${params.toString()}`
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    // 2. Tukar Authorization Code menjadi Access Token + Refresh Token
    if (body.action === "exchange") {
      const { code, redirect_uri } = body;
      if (!code || !redirect_uri) {
        return res.status(400).json({ error: "Code dan redirect_uri wajib diisi." });
      }

      const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri
        })
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        return res.status(tokenRes.status).json(tokenData);
      }

      return res.status(200).json(tokenData);
    }

    // 3. Refresh Access Token Otomatis
    if (body.action === "refresh") {
      const { refresh_token } = body;
      if (!refresh_token) {
        return res.status(400).json({ error: "refresh_token wajib diisi." });
      }

      const refreshRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token
        })
      });

      const refreshData = await refreshRes.json();
      if (!refreshRes.ok) {
        return res.status(refreshRes.status).json(refreshData);
      }

      return res.status(200).json(refreshData);
    }

    // 4. Sinkronisasi Profil, Playlist & Tracks Spotify User (OAuth Login)
    if (body.action === "sync") {
      const { access_token } = body;
      if (!access_token) {
        return res.status(401).json({ error: "access_token tidak ditemukan." });
      }

      const authHeader = { Authorization: `Bearer ${access_token}` };

      const meRes = await fetch("https://api.spotify.com/v1/me", { headers: authHeader });
      if (!meRes.ok) {
        return res.status(meRes.status).json({ error: "Gagal mengambil profil Spotify." });
      }
      const profile = await meRes.json();

      const plRes = await fetch("https://api.spotify.com/v1/me/playlists?limit=20", {
        headers: authHeader
      });
      const plData = plRes.ok ? await plRes.json() : { items: [] };
      const playlists = [];

      for (const pl of plData.items || []) {
        if (!pl || !pl.id) continue;

        const tracksRes = await fetch(
          `https://api.spotify.com/v1/playlists/${pl.id}/tracks?limit=50`,
          { headers: authHeader }
        );
        const tracksJson = tracksRes.ok ? await tracksRes.json() : { items: [] };

        const cleanTracks = (tracksJson.items || [])
          .map((entry) => entry?.track)
          .filter((t) => t && t.id && t.type === "track")
          .map((t) => ({
            spotifyTrackId: t.id,
            spotifyUri: t.uri,
            name: `${t.name} - ${(t.artists || []).map((a) => a.name).join(", ")}`,
            url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
            embedUrl: `https://open.spotify.com/embed/track/${t.id}?utm_source=generator&theme=0`,
            thumbnail: t.album?.images?.[0]?.url || null,
            durationMs: t.duration_ms || 0
          }));

        playlists.push({
          spotifyPlaylistId: pl.id,
          name: pl.name,
          tracks: cleanTracks
        });
      }

      return res.status(200).json({
        profile: {
          id: profile.id,
          display_name: profile.display_name || profile.id,
          product: profile.product || "free"
        },
        playlists
      });
    }

    // 5. Resolve URL Publik Spotify (Playlist / Album / Track) Tanpa Login User
    if (body.action === "resolve_url") {
      const { url } = body;
      const match = String(url || "").match(
        /open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track)\/([a-zA-Z0-9]+)/
      );

      if (!match) {
        return res.status(400).json({ error: "Link Spotify tidak valid." });
      }

      const [, kind, id] = match;

      // Helper Fallback: Ekstrak daftar lagu langsung dari halaman embed publik Spotify (tanpa perlu login OAuth)
      async function resolveViaPublicEmbed(targetKind, targetId) {
        const embedPageUrl = `https://open.spotify.com/embed/${targetKind}/${targetId}`;
        const htmlRes = await fetch(embedPageUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
          }
        });
        if (!htmlRes.ok) return null;

        const html = await htmlRes.text();
        const nextDataMatch = html.match(
          /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
        );
        if (!nextDataMatch) return null;

        const nextJson = JSON.parse(nextDataMatch[1]);
        const entity = nextJson?.props?.pageProps?.state?.data?.entity;
        if (!entity) return null;

        const cover =
          entity.visualIdentity?.image?.[0]?.url ||
          entity.coverArt?.sources?.[0]?.url ||
          null;

        if (targetKind === "track") {
          const trackId = entity.id || targetId;
          const artists = (entity.artists || []).map((a) => a.name).join(", ");
          return {
            kind: "track",
            folderName: entity.name || "Spotify Track",
            thumbnail: cover,
            tracks: [
              {
                spotifyTrackId: trackId,
                spotifyUri: `spotify:track:${trackId}`,
                name: artists ? `${entity.name} - ${artists}` : entity.name,
                url: `https://open.spotify.com/track/${trackId}`,
                embedUrl: `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`,
                thumbnail: cover,
                durationMs: entity.duration || 0
              }
            ]
          };
        }

        const trackList = entity.trackList || [];
        const cleanTracks = trackList
          .map((t) => {
            const uriParts = String(t.uri || "").split(":");
            const trId = uriParts[2] || t.uid;
            if (!trId) return null;
            const title = t.title || t.name || "Unknown Track";
            const artist = t.subtitle || "";
            return {
              spotifyTrackId: trId,
              spotifyUri: `spotify:track:${trId}`,
              name: artist ? `${title} - ${artist}` : title,
              url: `https://open.spotify.com/track/${trId}`,
              embedUrl: `https://open.spotify.com/embed/track/${trId}?utm_source=generator&theme=0`,
              thumbnail: cover,
              durationMs: t.duration || 0
            };
          })
          .filter(Boolean);

        return {
          kind: targetKind,
          folderName: entity.name || entity.title || "Spotify Playlist",
          thumbnail: cover,
          tracks: cleanTracks
        };
      }

      // Jalur Utama: Spotify Web API (Client Credentials)
      let apiResult = null;
      try {
        const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: {
            Authorization: `Basic ${basicAuth}`,
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({ grant_type: "client_credentials" })
        });
        const tokenData = await tokenRes.json();

        if (tokenRes.ok && tokenData.access_token) {
          const appHeaders = { Authorization: `Bearer ${tokenData.access_token}` };

          if (kind === "playlist") {
            const plRes = await fetch(`https://api.spotify.com/v1/playlists/${id}`, {
              headers: appHeaders
            });
            if (plRes.ok) {
              const plData = await plRes.json();
              const plCover = plData.images?.[0]?.url || null;
              const cleanTracks = (plData.tracks?.items || [])
                .map((entry) => entry?.track)
                .filter((t) => t && t.id && t.type === "track")
                .map((t) => ({
                  spotifyTrackId: t.id,
                  spotifyUri: t.uri || `spotify:track:${t.id}`,
                  name: `${t.name} - ${(t.artists || []).map((a) => a.name).join(", ")}`,
                  url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
                  embedUrl: `https://open.spotify.com/embed/track/${t.id}?utm_source=generator&theme=0`,
                  thumbnail: t.album?.images?.[0]?.url || plCover,
                  durationMs: t.duration_ms || 0
                }));

              if (cleanTracks.length > 0) {
                apiResult = {
                  kind: "playlist",
                  folderName: plData.name,
                  thumbnail: plCover,
                  tracks: cleanTracks
                };
              }
            }
          } else if (kind === "album") {
            const alRes = await fetch(`https://api.spotify.com/v1/albums/${id}`, {
              headers: appHeaders
            });
            if (alRes.ok) {
              const alData = await alRes.json();
              const alCover = alData.images?.[0]?.url || null;
              const cleanTracks = (alData.tracks?.items || [])
                .filter((t) => t && t.id)
                .map((t) => ({
                  spotifyTrackId: t.id,
                  spotifyUri: t.uri || `spotify:track:${t.id}`,
                  name: `${t.name} - ${(t.artists || []).map((a) => a.name).join(", ")}`,
                  url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
                  embedUrl: `https://open.spotify.com/embed/track/${t.id}?utm_source=generator&theme=0`,
                  thumbnail: alCover,
                  durationMs: t.duration_ms || 0
                }));

              if (cleanTracks.length > 0) {
                apiResult = {
                  kind: "album",
                  folderName: alData.name,
                  thumbnail: alCover,
                  tracks: cleanTracks
                };
              }
            }
          } else if (kind === "track") {
            const trRes = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
              headers: appHeaders
            });
            if (trRes.ok) {
              const trData = await trRes.json();
              apiResult = {
                kind: "track",
                folderName: trData.album?.name || "Spotify Track",
                thumbnail: trData.album?.images?.[0]?.url || null,
                tracks: [
                  {
                    spotifyTrackId: trData.id,
                    spotifyUri: trData.uri || `spotify:track:${trData.id}`,
                    name: `${trData.name} - ${(trData.artists || []).map((a) => a.name).join(", ")}`,
                    url: trData.external_urls?.spotify || `https://open.spotify.com/track/${trData.id}`,
                    embedUrl: `https://open.spotify.com/embed/track/${trData.id}?utm_source=generator&theme=0`,
                    thumbnail: trData.album?.images?.[0]?.url || null,
                    durationMs: trData.duration_ms || 0
                  }
                ]
              };
            }
          }
        }
      } catch (_) {}

      // Jika Spotify API menolak akses playlist tanpa login user, otomatis gunakan Public Embed Parser
      const finalResolved = apiResult || (await resolveViaPublicEmbed(kind, id));

      if (!finalResolved || !finalResolved.tracks?.length) {
        return res.status(404).json({
          error: "Playlist atau lagu Spotify tidak ditemukan / bersifat privat."
        });
      }

      return res.status(200).json({
        playlistId: id,
        ...finalResolved
      });
    }

    return res.status(400).json({ error: "Action tidak dikenali." });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
}
