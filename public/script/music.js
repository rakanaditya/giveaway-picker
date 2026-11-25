(function () {
  const ICON_PLAY = '<path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"/>';
  const ICON_PAUSE = '<path d="M2.7 1a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7H2.7zm8 0a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-2.6z"/>';
  const DEFAULT_ALBUM_SVG = '<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';

  const audio = document.getElementById("audio");
  const videoPlayer = document.getElementById("videoPlayer");
  const cvs = document.getElementById("c");
  const g = cvs.getContext("2d");
  const ytContainer = document.getElementById("ytContainer");
  const spotifyEmbedContainer = document.getElementById("spotifyEmbedContainer");
  const playPauseIcon = document.getElementById("playPauseIcon");
  const toggleVideoBtn = document.getElementById("toggleVideoBtn");

  let activeMediaEl = audio;
  let ctx, analyser, data, bassEQ, gainNode;
  let audioSrcNode, videoSrcNode;
  let tracks = [];
  let currentIndex = -1;
  let activeBlobUrl = null;
  let isLoop = false;
  let isShuffle = false;
  let isVideoDisplayMode = true;
  let isHybridAudioPlaying = false;

  /* === SPOTIFY OAUTH, WEB PLAYBACK SDK & LIBRARY STATE === */
  const SP_TOKEN_KEY = "gp_spotify_auth_v1";
  const SP_LIBRARY_CACHE_KEY = "gp_spotify_library_cache_v1";
  let spAuth = JSON.parse(localStorage.getItem(SP_TOKEN_KEY) || "null");
  let spLibraryCache = JSON.parse(localStorage.getItem(SP_LIBRARY_CACHE_KEY) || "null");
  let spDeviceId = null;
  let spSdkPlayer = null;
  let spIsPlaying = false;
  let spProgressTimer = null;
  let spCurrentPosition = 0;
  let spCurrentDuration = 0;

  let activeLibraryTab = "local"; // "local" | "spotify"
  let spSelectedPlaylistId = "all";
  let spSearchQuery = "";
  let spCurrentPage = 1;
  const SP_ITEMS_PER_PAGE = 15;

  function saveSpotifyAuth(data) {
    spAuth = data;
    if (data) localStorage.setItem(SP_TOKEN_KEY, JSON.stringify(data));
    else localStorage.removeItem(SP_TOKEN_KEY);
    updateSpotifyAuthUI();
  }

  function updateSpotifyAuthUI() {
    const loginBtn = document.getElementById("spotifyLoginBtn");
    const syncBtn = document.getElementById("spotifySyncNowBtn");
    const tabsWrap = document.getElementById("libraryViewTabs");
    const isConnected = Boolean(spAuth && spAuth.access_token);
    const hasPublicLibrary = Boolean(
      spLibraryCache && Array.isArray(spLibraryCache.playlists) && spLibraryCache.playlists.length > 0
    );

    if (tabsWrap) {
      tabsWrap.style.display = isConnected || hasPublicLibrary ? "grid" : "none";
    }

    if (!loginBtn) return;

    if (isConnected) {
      const userName = spAuth.profile?.display_name || "Terhubung";
      loginBtn.textContent = `✅ Spotify: ${userName}`;
      if (syncBtn) syncBtn.style.display = "inline-flex";
    } else {
      loginBtn.textContent = "🎧 Login Spotify & Sync Folder";
      if (syncBtn) syncBtn.style.display = "none";
    }
  }

  async function ensureValidSpotifyToken() {
    if (!spAuth || !spAuth.access_token) return null;
    if (spAuth.expires_at && Date.now() < spAuth.expires_at - 60000) {
      return spAuth.access_token;
    }
    if (!spAuth.refresh_token) return spAuth.access_token;

    try {
      const res = await fetch("/api/spotify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refresh",
          refresh_token: spAuth.refresh_token
        })
      });
      const refreshed = await res.json();
      if (res.ok && refreshed.access_token) {
        saveSpotifyAuth({
          ...spAuth,
          access_token: refreshed.access_token,
          expires_at: Date.now() + (refreshed.expires_in || 3600) * 1000
        });
        return refreshed.access_token;
      }
    } catch (_) {}
    return spAuth.access_token;
  }

  async function syncSpotifyFoldersAndTracks(silent = false) {
    const token = await ensureValidSpotifyToken();
    if (!token) return;

    const loginBtn = document.getElementById("spotifyLoginBtn");
    if (loginBtn) loginBtn.textContent = "⏳ Menyinkronkan Folder Spotify...";

    try {
      const res = await fetch("/api/spotify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", access_token: token })
      });

      if (res.status === 401) {
        saveSpotifyAuth(null);
        switchLibraryTab("local");
        if (!silent) alert("Sesi Spotify berakhir, silakan klik Login Spotify lagi.");
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal sinkronisasi Spotify");

      saveSpotifyAuth({
        ...spAuth,
        profile: data.profile
      });

      spLibraryCache = {
        profile: data.profile,
        playlists: data.playlists || []
      };
      localStorage.setItem(SP_LIBRARY_CACHE_KEY, JSON.stringify(spLibraryCache));

      const existingTracks = await window.getAllTracksDB();
      let addedFolders = 0;
      let addedTracks = 0;

      for (const pl of data.playlists || []) {
        const folderId = `sp_fld_${pl.spotifyPlaylistId}`;
        const folderLabel = `Spotify • ${pl.name}`.slice(0, 32);

        let folderObj = customFolders.find((f) => f.id === folderId);
        if (!folderObj) {
          customFolders.push({ id: folderId, name: folderLabel, isSpotifySynced: true });
          addedFolders++;
        } else {
          folderObj.name = folderLabel;
        }

        for (const item of pl.tracks || []) {
          const alreadyExists = existingTracks.some(
            (t) =>
              t.folderId === folderId &&
              (t.spotifyUri === item.spotifyUri || t.url === item.url)
          );
          if (!alreadyExists) {
            await addTrackDB({
              name: item.name,
              type: "spotify",
              spotifyUri: item.spotifyUri,
              url: item.url,
              embedUrl: item.embedUrl,
              thumbnail: item.thumbnail,
              folderId,
              pendingSync: false
            });
            addedTracks++;
          }
        }
      }

      saveCustomFolders();
      await window.refreshPlaylist();
      updateSpotifyAuthUI();
      switchLibraryTab("spotify");

      if (!silent) {
        alert(
          `✅ Sinkronisasi Spotify selesai!\n• Akun: ${data.profile.display_name} (${data.profile.product.toUpperCase()})\n• ${addedFolders} folder playlist baru\n• ${addedTracks} lagu baru ditambahkan ke penyimpanan lokal`
        );
      }
    } catch (err) {
      updateSpotifyAuthUI();
      if (!silent) alert("Gagal sinkronisasi Spotify: " + err.message);
    }
  }

  async function initSpotifyFlow() {
    const redirectUri = window.location.origin + window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    if (code) {
      window.history.replaceState({}, document.title, redirectUri);
      try {
        const res = await fetch("/api/spotify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "exchange",
            code,
            redirect_uri: redirectUri
          })
        });
        const tokenData = await res.json();
        if (res.ok && tokenData.access_token) {
          saveSpotifyAuth({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || null,
            expires_at: Date.now() + (tokenData.expires_in || 3600) * 1000
          });
          initSpotifyWebPlaybackSDK();
          await syncSpotifyFoldersAndTracks(false);
        } else {
          alert("Login Spotify gagal: " + (tokenData.error_description || tokenData.error || "Unknown error"));
        }
      } catch (err) {
        alert("Gagal terhubung ke API Spotify: " + err.message);
      }
    } else if (spAuth && spAuth.access_token) {
      updateSpotifyAuthUI();
      initSpotifyWebPlaybackSDK();
      if (spLibraryCache && Array.isArray(spLibraryCache.playlists)) {
        switchLibraryTab("spotify");
      } else {
        await syncSpotifyFoldersAndTracks(true);
      }
    } else if (spLibraryCache && Array.isArray(spLibraryCache.playlists) && spLibraryCache.playlists.length > 0) {
      updateSpotifyAuthUI();
      switchLibraryTab("spotify");
    } else {
      updateSpotifyAuthUI();
    }
  }

  function initSpotifyWebPlaybackSDK() {
    if (!window.Spotify || spSdkPlayer || !spAuth?.access_token) return;

    spSdkPlayer = new Spotify.Player({
      name: "Giveaways Picker Music",
      getOAuthToken: async (cb) => {
        const validToken = await ensureValidSpotifyToken();
        if (validToken) cb(validToken);
      },
      volume: parseFloat(document.getElementById("vol").value || 1)
    });

    spSdkPlayer.addListener("ready", ({ device_id }) => {
      spDeviceId = device_id;
    });

    spSdkPlayer.addListener("player_state_changed", (state) => {
      if (!state) return;
      spIsPlaying = !state.paused;
      spCurrentPosition = state.position;
      spCurrentDuration = state.duration;
      setPlayIcon(spIsPlaying);

      const currentTrackMeta = state.track_window?.current_track;
      if (currentTrackMeta?.album?.images?.[0]?.url) {
        setAlbumThumbnail(currentTrackMeta.album.images[0].url);
      }

      if (
        state.paused &&
        state.position === 0 &&
        state.track_window?.previous_tracks?.length > 0 &&
        tracks[currentIndex]?.type === "spotify"
      ) {
        const autoNext = window.GP_PWA ? window.GP_PWA.getSettings().autoNext : true;
        if (isLoop) {
          playTrack(currentIndex);
        } else if (autoNext) {
          playNext();
        }
      }
    });

    spSdkPlayer.addListener("authentication_error", () => {
      saveSpotifyAuth(null);
      switchLibraryTab("local");
    });

    spSdkPlayer.connect();
  }

  window.onSpotifyWebPlaybackSDKReady = () => {
    initSpotifyWebPlaybackSDK();
  };

  const spotifyLoginBtn = document.getElementById("spotifyLoginBtn");
  if (spotifyLoginBtn) {
    spotifyLoginBtn.onclick = async () => {
      if (spAuth && spAuth.access_token) {
        const choice = confirm(
          `Akun Spotify "${spAuth.profile?.display_name || "User"}" sedang terhubung.\n\nKlik OK untuk Sinkronkan Ulang Folder & Lagu.\nKlik Cancel jika ingin Logout.`
        );
        if (choice) {
          await syncSpotifyFoldersAndTracks(false);
        } else if (confirm("Putuskan koneksi akun Spotify? (Lagu & folder lokal tetap tersimpan)")) {
          if (spSdkPlayer) spSdkPlayer.disconnect();
          spSdkPlayer = null;
          spDeviceId = null;
          localStorage.removeItem(SP_LIBRARY_CACHE_KEY);
          spLibraryCache = null;
          saveSpotifyAuth(null);
          switchLibraryTab("local");
        }
        return;
      }

      try {
        const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
        const res = await fetch(`/api/spotify?action=login&redirect_uri=${redirectUri}`);
        const data = await res.json();
        if (data.authUrl) {
          window.location.href = data.authUrl;
        } else {
          alert(data.error || "Gagal membuat link login Spotify.");
        }
      } catch (err) {
        alert("Gagal memanggil /api/spotify: " + err.message);
      }
    };
  }

  const spotifySyncNowBtn = document.getElementById("spotifySyncNowBtn");
  if (spotifySyncNowBtn) {
    spotifySyncNowBtn.onclick = () => syncSpotifyFoldersAndTracks(false);
  }

  function ensureVisualizerBuffer() {
    if (!data) {
      data = new Uint8Array(128);
    }
  }
  ensureVisualizerBuffer();

  function applyStageDisplayMode() {
    if (toggleVideoBtn) {
      toggleVideoBtn.textContent = isVideoDisplayMode ? "🎬 Mode: Video" : "📊 Mode: Visualizer";
    }

    if (currentIndex === -1 || !tracks[currentIndex]) {
      videoPlayer.style.display = "none";
      ytContainer.style.display = "none";
      spotifyEmbedContainer.style.display = "none";
      cvs.style.display = "block";
      resizeCanvas();
      return;
    }

    const track = tracks[currentIndex];

    if (track.type === "video") {
      videoPlayer.style.display = isVideoDisplayMode ? "block" : "none";
      cvs.style.display = isVideoDisplayMode ? "none" : "block";
    } else if (track.type === "youtube") {
      ytContainer.style.display = "block";
      if (isVideoDisplayMode) {
        ytContainer.style.opacity = "1";
        ytContainer.style.pointerEvents = "auto";
        ytContainer.style.zIndex = "2";
        cvs.style.display = "none";
      } else {
        ytContainer.style.opacity = "0";
        ytContainer.style.pointerEvents = "none";
        ytContainer.style.zIndex = "0";
        cvs.style.display = "block";
      }
    } else if (track.type === "spotify") {
      if ((spDeviceId && spAuth?.profile?.product === "premium") || isHybridAudioPlaying) {
        spotifyEmbedContainer.style.display = "none";
        if (isHybridAudioPlaying) {
          ytContainer.style.display = "block";
          ytContainer.style.opacity = "0";
          ytContainer.style.pointerEvents = "none";
          ytContainer.style.zIndex = "0";
        }
        cvs.style.display = "block";
      } else {
        spotifyEmbedContainer.style.display = "block";
        if (isVideoDisplayMode) {
          spotifyEmbedContainer.style.opacity = "1";
          spotifyEmbedContainer.style.pointerEvents = "auto";
          spotifyEmbedContainer.style.zIndex = "2";
          cvs.style.display = "none";
        } else {
          spotifyEmbedContainer.style.opacity = "0";
          spotifyEmbedContainer.style.pointerEvents = "none";
          spotifyEmbedContainer.style.zIndex = "0";
          cvs.style.display = "block";
        }
      }
    } else {
      videoPlayer.style.display = "none";
      ytContainer.style.display = "none";
      spotifyEmbedContainer.style.display = "none";
      cvs.style.display = "block";
    }

    resizeCanvas();
  }

  if (toggleVideoBtn) {
    toggleVideoBtn.onclick = () => {
      isVideoDisplayMode = !isVideoDisplayMode;
      applyStageDisplayMode();
    };
  }

/* === AUTO LYRICS ENGINE (PRESISI ARTIST/TITLE + DURATION SCORING + FALLBACK API) === */
  const LYRICS_CACHE_KEY = "gp_lyrics_cache_v1";
  let lyricsCache = JSON.parse(localStorage.getItem(LYRICS_CACHE_KEY) || "{}");
  let parsedLrcLines = [];
  let activeLyricIdx = -1;

  function saveLyricsCache(key, payload) {
    try {
      const keys = Object.keys(lyricsCache);
      if (keys.length > 80) delete lyricsCache[keys[0]];
      lyricsCache[key] = payload;
      localStorage.setItem(LYRICS_CACHE_KEY, JSON.stringify(lyricsCache));
    } catch (_) {}
  }

  function extractArtistAndTitle(rawTitle) {
    let cleaned = String(rawTitle || "")
      .replace(/\.[^/.]+$/, "")
      .replace(/\[.*?\]|\(.*?\)/g, " ")
      .replace(/\b(official\s*(music\s*)?video|official\s*audio|lyric\s*video|lyrics?|lirik(\s*lagu)?|mv|hd|4k|full\s*album|audio\s*only|sped\s*up|slowed\s*(\+\s*reverb)?)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Pisahkan jika format "Bagian 1 - Bagian 2"
    const dashParts = cleaned.split(/\s+[-–—]\s+/);
    if (dashParts.length >= 2) {
      const partA = dashParts[0].replace(/\s+(feat|ft|prod)\.?\s+.*/i, "").trim();
      const partB = dashParts.slice(1).join(" - ").replace(/\s+(feat|ft|prod)\.?\s+.*/i, "").trim();
      return {
        fullQuery: `${partA} ${partB}`.trim(),
        partA,
        partB
      };
    }

    const single = cleaned.replace(/\s+(feat|ft|prod)\.?\s+.*/i, "").trim();
    return {
      fullQuery: single,
      partA: single,
      partB: ""
    };
  }

  function scoreLyricCandidate(candidate, parsed, targetDurationSec) {
    let score = 0;
    const candTrack = (candidate.trackName || "").toLowerCase();
    const candArtist = (candidate.artistName || "").toLowerCase();
    const a = parsed.partA.toLowerCase();
    const b = parsed.partB.toLowerCase();

    // Cek kecocokan judul & artis (mendukung format "Title - Artist" dari Spotify maupun "Artist - Title" dari YouTube)
    if (b) {
      if (candTrack.includes(a) && candArtist.includes(b)) score += 60;
      else if (candTrack.includes(b) && candArtist.includes(a)) score += 60;
      else if (candTrack.includes(a) || candTrack.includes(b)) score += 25;
      if (candArtist.includes(a) || candArtist.includes(b)) score += 25;
    } else if (candTrack.includes(a)) {
      score += 45;
    }

    // Prioritaskan durasi yang paling mendekati media yang sedang diputar
    if (targetDurationSec > 0 && candidate.duration > 0) {
      const diff = Math.abs(candidate.duration - targetDurationSec);
      if (diff <= 3) score += 35;
      else if (diff <= 7) score += 20;
      else if (diff > 20) score -= 25;
    }

    // Bonus jika memiliki lirik tersinkronisasi (LRC)
    if (candidate.syncedLyrics) score += 15;
    else if (candidate.plainLyrics) score += 5;

    return score;
  }

  function getCurrentTrackDurationSec() {
    if (currentIndex === -1 || !tracks[currentIndex]) return 0;
    const tr = tracks[currentIndex];
    if (tr.type === "spotify" && spCurrentDuration > 0) return Math.round(spCurrentDuration / 1000);
    if (tr.type === "youtube" && ytReady && ytPlayer && typeof ytPlayer.getDuration === "function") {
      return Math.round(ytPlayer.getDuration() || 0);
    }
    if (activeMediaEl && activeMediaEl.duration && !isNaN(activeMediaEl.duration)) {
      return Math.round(activeMediaEl.duration);
    }
    return 0;
  }

  function parseLrcText(lrcString) {
    const lines = lrcString.split("\n");
    const result = [];
    const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

    for (const line of lines) {
      const matches = [...line.matchAll(timeRegex)];
      const text = line.replace(/\[.*?\]/g, "").trim();
      if (matches.length > 0 && text) {
        for (const match of matches) {
          const mins = parseInt(match[1], 10);
          const secs = parseInt(match[2], 10);
          const ms = match[3] ? parseInt(match[3].padEnd(3, "0"), 10) : 0;
          result.push({ time: mins * 60 + secs + ms / 1000, text });
        }
      }
    }
    return result.sort((a, b) => a.time - b.time);
  }

  function renderLyricsUI(syncedLines, plainText, sourceLabel = "Auto") {
    const container = document.getElementById("lyricsContent");
    const badge = document.getElementById("lyricsStatusBadge");
    if (!container) return;

    parsedLrcLines = syncedLines || [];
    activeLyricIdx = -1;
    if (badge) badge.textContent = sourceLabel;

    if (parsedLrcLines.length > 0) {
      container.innerHTML = parsedLrcLines
        .map((item, idx) => `<div class="lyric-line" data-idx="${idx}" data-time="${item.time}">${item.text}</div>`)
        .join("");

      container.querySelectorAll(".lyric-line").forEach((el) => {
        el.onclick = () => {
          const targetSec = parseFloat(el.dataset.time);
          const currentTrack = currentIndex !== -1 ? tracks[currentIndex] : null;
          if (
            (currentTrack?.type === "youtube" || isHybridAudioPlaying) &&
            ytReady &&
            ytPlayer &&
            typeof ytPlayer.seekTo === "function"
          ) {
            ytPlayer.seekTo(targetSec, true);
          } else if (currentTrack?.type === "spotify" && spSdkPlayer) {
            spSdkPlayer.seek(Math.floor(targetSec * 1000));
          } else if (activeMediaEl) {
            activeMediaEl.currentTime = targetSec;
          }
        };
      });
    } else if (plainText) {
      container.innerHTML = `<div class="plain-lyrics">${plainText}</div>`;
    } else {
      container.innerHTML = `<div class="empty-playlist">Lirik tidak ditemukan untuk lagu ini.<br>Coba ubah kata kunci <strong>Artis - Judul</strong> di kotak atas atau upload file <strong>.LRC</strong>.</div>`;
    }
  }

  function syncLyricsHighlight(currentSeconds) {
    if (!parsedLrcLines.length) return;
    let foundIdx = -1;
    for (let i = 0; i < parsedLrcLines.length; i++) {
      if (currentSeconds >= parsedLrcLines[i].time) {
        foundIdx = i;
      } else {
        break;
      }
    }

    if (foundIdx !== -1 && foundIdx !== activeLyricIdx) {
      activeLyricIdx = foundIdx;
      const container = document.getElementById("lyricsContent");
      if (!container) return;
      container.querySelectorAll(".lyric-line").forEach((el, idx) => {
        el.classList.toggle("active", idx === foundIdx);
      });
      const activeEl = container.querySelector(`.lyric-line[data-idx="${foundIdx}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  async function fetchAutoLyrics(rawQuery, forceRefresh = false) {
    const container = document.getElementById("lyricsContent");
    const badge = document.getElementById("lyricsStatusBadge");
    const searchInput = document.getElementById("lyricsSearchInput");
    if (!container) return;

    const parsed = extractArtistAndTitle(rawQuery);
    const cacheKey = parsed.fullQuery.toLowerCase();

    if (searchInput) searchInput.value = parsed.fullQuery;
    parsedLrcLines = [];

    if (!forceRefresh && lyricsCache[cacheKey]) {
      const cached = lyricsCache[cacheKey];
      renderLyricsUI(cached.synced || [], cached.plain || null, cached.label || "Cache ⚡");
      return;
    }

    if (badge) badge.textContent = "Mencari...";
    container.innerHTML = `<div class="empty-playlist">⏳ Mencocokkan lirik presisi untuk:<br><strong>${parsed.fullQuery}</strong></div>`;

    if (!navigator.onLine) {
      if (badge) badge.textContent = "Offline";
      container.innerHTML = `<div class="empty-playlist">Mode Offline: Upload file <strong>.LRC</strong> lokal untuk menampilkan lirik.</div>`;
      return;
    }

    try {
      const targetDur = getCurrentTrackDurationSec();
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(parsed.fullQuery)}`);
      const results = res.ok ? await res.json() : [];

      if (Array.isArray(results) && results.length > 0) {
        const ranked = results
          .map((item) => ({ item, score: scoreLyricCandidate(item, parsed, targetDur) }))
          .sort((a, b) => b.score - a.score);

        const best = ranked[0].item;
        if (best && (best.syncedLyrics || best.plainLyrics)) {
          const synced = best.syncedLyrics ? parseLrcText(best.syncedLyrics) : [];
          const label = synced.length > 0 ? "Synced ⚡" : "Teks";
          saveLyricsCache(cacheKey, { synced, plain: best.plainLyrics || null, label });
          renderLyricsUI(synced, best.plainLyrics, label);
          return;
        }
      }

      // Jalur 2 (Fallback ke /api/lyrics -> lyrics-finder)
      const apiParams = new URLSearchParams({
        artist: parsed.partB || "",
        title: parsed.partA || parsed.fullQuery
      });
      const fallbackRes = await fetch(`/api/lyrics?${apiParams.toString()}`);
      if (fallbackRes.ok) {
        const fbData = await fallbackRes.json();
        if (fbData.lyrics) {
          saveLyricsCache(cacheKey, { synced: [], plain: fbData.lyrics, label: "Lyrics API" });
          renderLyricsUI([], fbData.lyrics, "Lyrics API");
          return;
        }
      }

      renderLyricsUI([], null, "Tidak Ada");
    } catch (_) {
      renderLyricsUI([], null, "Error");
    }
  }

  const searchLyricsBtn = document.getElementById("searchLyricsBtn");
  const lyricsSearchInput = document.getElementById("lyricsSearchInput");
  if (searchLyricsBtn && lyricsSearchInput) {
    searchLyricsBtn.onclick = () => {
      if (lyricsSearchInput.value.trim()) fetchAutoLyrics(lyricsSearchInput.value.trim(), true);
    };
    lyricsSearchInput.onkeydown = (e) => {
      if (e.key === "Enter" && lyricsSearchInput.value.trim()) {
        fetchAutoLyrics(lyricsSearchInput.value.trim(), true);
      }
    };
  }

  const uploadLrcBtn = document.getElementById("uploadLrcBtn");
  const lrcFileInput = document.getElementById("lrcFileInput");
  if (uploadLrcBtn && lrcFileInput) {
    uploadLrcBtn.onclick = () => lrcFileInput.click();
    lrcFileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const synced = parseLrcText(text);
      const currentKey = lyricsSearchInput?.value.trim().toLowerCase();
      if (synced.length > 0) {
        if (currentKey) saveLyricsCache(currentKey, { synced, plain: text, label: "File LRC" });
        renderLyricsUI(synced, text, "File LRC");
      } else {
        if (currentKey) saveLyricsCache(currentKey, { synced: [], plain: text, label: "File TXT" });
        renderLyricsUI([], text, "File TXT");
      }
      e.target.value = "";
    };
  }

  /* === THUMBNAIL HELPER === */
  function setAlbumThumbnail(thumbUrl) {
    const artBox = document.querySelector(".album-art");
    if (!artBox) return;
    if (thumbUrl) {
      artBox.innerHTML = `<img src="${thumbUrl}" alt="Thumbnail" style="width:100%;height:100%;object-fit:cover;border-radius:10px;" />`;
      const img = artBox.querySelector("img");
      if (img) {
        img.onerror = () => {
          artBox.innerHTML = DEFAULT_ALBUM_SVG;
        };
      }
    } else {
      artBox.innerHTML = DEFAULT_ALBUM_SVG;
    }
  }

  /* === YOUTUBE IFRAME PLAYER === */
  let ytPlayer = null;
  let ytReady = false;
  let ytTimer = null;

  function createYTPlayer() {
    if (ytPlayer || !window.YT || typeof window.YT.Player !== "function") return;
    ytPlayer = new YT.Player("ytPlayer", {
      height: "100%",
      width: "100%",
      playerVars: { autoplay: 1, controls: 1, playsinline: 1, rel: 0 },
      events: {
        onReady: () => {
          ytReady = true;
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) {
            setPlayIcon(true);
            startYtProgress();
          } else if (e.data === YT.PlayerState.PAUSED) {
            setPlayIcon(false);
          } else if (e.data === YT.PlayerState.ENDED) {
            const autoNext = window.GP_PWA ? window.GP_PWA.getSettings().autoNext : true;
            if (isLoop) {
              ytPlayer.seekTo(0);
              ytPlayer.playVideo();
            } else if (autoNext) {
              playNext();
            }
          }
        }
      }
    });
  }

  window.onYouTubeIframeAPIReady = function () {
    createYTPlayer();
  };

  if (window.YT && typeof window.YT.Player === "function") {
    createYTPlayer();
  }

  function startYtProgress() {
    clearInterval(ytTimer);
    ytTimer = setInterval(() => {
      if (!ytPlayer || typeof ytPlayer.getCurrentTime !== "function") return;
      const curr = ytPlayer.getCurrentTime() || 0;
      const dur = ytPlayer.getDuration() || 0;
      syncLyricsHighlight(curr);
      if (dur > 0) {
        document.getElementById("seek").value = (curr / dur) * 100;
        document.getElementById("currTime").textContent = formatTime(curr);
        document.getElementById("durTime").textContent = formatTime(dur);
      }
    }, 400);
  }

  function setPlayIcon(isPlaying) {
    playPauseIcon.innerHTML = isPlaying ? ICON_PAUSE : ICON_PLAY;
  }

  /* === PARSER LINK SPOTIFY & YOUTUBE === */
  function parseMediaLink(rawUrl) {
    const url = rawUrl.trim();

    const spMatch = url.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist|episode)\/([a-zA-Z0-9]+)/);
    if (spMatch) {
      const kind = spMatch[1];
      const id = spMatch[2];
      return {
        type: "spotify",
        spotifyUri: `spotify:${kind}:${id}`,
        name: `Spotify ${kind.charAt(0).toUpperCase() + kind.slice(1)} (${id.slice(0, 6)})`,
        embedUrl: `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator&theme=0`,
        url,
        pendingSync: !navigator.onLine
      };
    }

    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      const videoId = ytMatch[1];
      return {
        type: "youtube",
        name: `YouTube Video (${videoId})`,
        videoId,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        url,
        pendingSync: !navigator.onLine
      };
    }

    const cleanName = url.split("/").pop().split("?")[0] || "Audio Stream";
    return {
      type: "url",
      name: decodeURIComponent(cleanName),
      url,
      pendingSync: false
    };
  }

  /* === INDEXEDDB PENYIMPANAN LOKAL BROWSER === */
  const DB_NAME = "GiveawayMusicPWA_DB";
  const STORE_NAME = "playlist";

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  window.getAllTracksDB = async function () {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  };

  async function addTrackDB(item) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).add(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  window.updateTrackDB = async function (item) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  };

  async function deleteTrackDB(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function clearTracksDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /* === AUDIO GRAPH & VISUALIZER === */
  function resizeCanvas() {
    const box = cvs.parentElement;
    if (!box) return;
    cvs.width = box.clientWidth;
    cvs.height = box.clientHeight;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  function initAudioGraph(targetEl) {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      data = new Uint8Array(analyser.frequencyBinCount);

      gainNode = ctx.createGain();
      gainNode.gain.value = document.getElementById("vol").value;

      bassEQ = ctx.createBiquadFilter();
      bassEQ.type = "lowshelf";
      bassEQ.frequency.value = 150;
      bassEQ.gain.value = document.getElementById("bass").value;

      bassEQ.connect(gainNode);
      gainNode.connect(analyser);
      analyser.connect(ctx.destination);
    }

    if (ctx.state === "suspended") ctx.resume();

    if (targetEl === audio && !audioSrcNode) {
      audioSrcNode = ctx.createMediaElementSource(audio);
      audioSrcNode.connect(bassEQ);
    } else if (targetEl === videoPlayer && !videoSrcNode) {
      videoSrcNode = ctx.createMediaElementSource(videoPlayer);
      videoSrcNode.connect(bassEQ);
    }
  }

  let shake = 0;
  function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);
    if (cvs.style.display === "none") return;

    const currentTrack = currentIndex !== -1 ? tracks[currentIndex] : null;
    const isYtPlaying =
      currentTrack &&
      (currentTrack.type === "youtube" || isHybridAudioPlaying) &&
      ytReady &&
      ytPlayer &&
      typeof ytPlayer.getPlayerState === "function" &&
      ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;

    const isSpActive = currentTrack && currentTrack.type === "spotify" && spIsPlaying;

    if (isYtPlaying || isSpActive) {
      const t = performance.now() * 0.006;
      for (let i = 0; i < data.length; i++) {
        const wave = Math.sin(t + i * 0.22) * 0.5 + 0.5;
        const pulse = Math.cos(t * 1.7 - i * 0.1) * 0.35 + 0.65;
        data[i] = Math.floor(wave * pulse * 210);
      }
    } else if (analyser) {
      analyser.getByteFrequencyData(data);
    } else {
      data.fill(0);
    }

    const settings = window.GP_PWA ? window.GP_PWA.getSettings() : { vizStyle: "bars", bassShake: true };
    const bassAvg = data.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
    if (settings.bassShake && bassAvg > 175) shake = 8;

    g.clearRect(0, 0, cvs.width, cvs.height);
    g.save();
    g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shake *= 0.88;

    const bars = data.length;
    const w = cvs.width / bars;

    if (settings.vizStyle === "wave") {
      g.beginPath();
      g.lineWidth = 3;
      g.strokeStyle = settings.accentColor || "#1db954";
      g.shadowBlur = 14;
      g.shadowColor = settings.accentColor || "#1db954";
      for (let i = 0; i < bars; i++) {
        const v = data[i] / 255;
        const x = i * w;
        const y = cvs.height / 2 + Math.sin(i * 0.25) * v * (cvs.height * 0.42);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    } else {
      for (let i = 0; i < bars; i++) {
        const v = data[i];
        const h = (v / 255) * (cvs.height * 0.85);
        const x = i * w;
        const y = cvs.height / 2 - h / 2;
        const hue = (140 + i * 1.8 + bassAvg * 0.6) % 360;

        const grd = g.createLinearGradient(0, y, 0, y + h);
        grd.addColorStop(0, `hsl(${hue}, 90%, 55%)`);
        grd.addColorStop(1, `hsl(${(hue + 50) % 360}, 90%, 45%)`);

        g.fillStyle = grd;
        g.shadowBlur = 12;
        g.shadowColor = `hsl(${hue}, 90%, 55%)`;
        g.fillRect(x + 1, y, Math.max(w - 2, 1), h);
      }
    }
    g.restore();
  }
  drawVisualizer();

  /* === RESET SEMUA ENGINE PEMUTAR === */
  function stopAllEngines() {
    audio.pause();
    audio.currentTime = 0;
    videoPlayer.pause();
    videoPlayer.currentTime = 0;
    videoPlayer.dataset.hasVideo = "false";
    videoPlayer.style.display = "none";

    clearInterval(ytTimer);
    if (ytReady && ytPlayer && typeof ytPlayer.stopVideo === "function") {
      ytPlayer.stopVideo();
    }
    const ytFallback = document.getElementById("ytFallbackFrame");
    if (ytFallback) ytFallback.remove();

    clearInterval(spProgressTimer);
    spIsPlaying = false;
    isHybridAudioPlaying = false;
    if (spSdkPlayer && typeof spSdkPlayer.pause === "function") {
      spSdkPlayer.pause().catch(() => {});
    }
    spotifyEmbedContainer.innerHTML = "";
    spotifyEmbedContainer.style.opacity = "1";
    spotifyEmbedContainer.style.pointerEvents = "auto";
    spotifyEmbedContainer.style.zIndex = "2";
    spotifyEmbedContainer.style.display = "none";

    ytContainer.style.opacity = "1";
    ytContainer.style.pointerEvents = "auto";
    ytContainer.style.zIndex = "2";
    ytContainer.style.display = "none";

    cvs.style.display = "block";
    setAlbumThumbnail(null);
    setPlayIcon(false);
  }

  /* === KELOLA FOLDER CUSTOM (LOCALSTORAGE) === */
  const FOLDERS_KEY = "gp_custom_folders_v1";
  let customFolders = JSON.parse(localStorage.getItem(FOLDERS_KEY) || "[]");
  let activeFolder = "all";
  let searchKeyword = "";

  function saveCustomFolders() {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(customFolders));
  }

  function renderFolderDropdown() {
    const select = document.getElementById("folderSelect");
    const editBtn = document.getElementById("editFolderBtn");
    const delBtn = document.getElementById("delFolderBtn");

    let html = `
      <option value="all">📂 Semua Media</option>
      <option value="mp3">🎵 Folder MP3 (Audio)</option>
      <option value="mp4">🎬 Folder MP4 (Video)</option>
    `;

    customFolders.forEach((f) => {
      html += `<option value="${f.id}">📁 ${f.name}</option>`;
    });

    select.innerHTML = html;

    const isCustom = customFolders.some((f) => f.id === activeFolder);
    if (activeFolder !== "all" && activeFolder !== "mp3" && activeFolder !== "mp4" && !isCustom) {
      activeFolder = "all";
    }
    select.value = activeFolder;

    editBtn.disabled = !isCustom;
    delBtn.disabled = !isCustom;
  }

  document.getElementById("folderSelect").onchange = (e) => {
    activeFolder = e.target.value;
    renderFolderDropdown();
    window.refreshPlaylist();
  };

  document.getElementById("addFolderBtn").onclick = () => {
    const rawName = prompt("Masukkan nama folder playlist baru:");
    if (!rawName || !rawName.trim()) return;
    const cleanName = rawName.trim().slice(0, 32);

    const newFolder = {
      id: "fld_" + Date.now(),
      name: cleanName
    };
    customFolders.push(newFolder);
    saveCustomFolders();
    activeFolder = newFolder.id;
    renderFolderDropdown();
    window.refreshPlaylist();
  };

  document.getElementById("editFolderBtn").onclick = () => {
    const folder = customFolders.find((f) => f.id === activeFolder);
    if (!folder) return;

    const newName = prompt("Ubah nama folder:", folder.name);
    if (!newName || !newName.trim()) return;
    folder.name = newName.trim().slice(0, 32);
    saveCustomFolders();
    renderFolderDropdown();
    window.refreshPlaylist();
  };

  document.getElementById("delFolderBtn").onclick = async () => {
    const folder = customFolders.find((f) => f.id === activeFolder);
    if (!folder) return;

    if (!confirm(`Hapus folder "${folder.name}"?\n(Lagu di dalamnya tidak terhapus dan tetap ada di Semua Media)`)) {
      return;
    }

    const all = await window.getAllTracksDB();
    for (const item of all) {
      if (item.folderId === folder.id) {
        delete item.folderId;
        await window.updateTrackDB(item);
      }
    }

    customFolders = customFolders.filter((f) => f.id !== folder.id);
    saveCustomFolders();
    activeFolder = "all";
    renderFolderDropdown();
    await window.refreshPlaylist();
  };

  const searchInputEl = document.getElementById("playlistSearchInput");
  const clearSearchBtn = document.getElementById("clearSearchBtn");

  searchInputEl.oninput = (e) => {
    searchKeyword = e.target.value.trim().toLowerCase();
    clearSearchBtn.style.display = searchKeyword ? "block" : "none";
    window.refreshPlaylist();
  };

  clearSearchBtn.onclick = () => {
    searchInputEl.value = "";
    searchKeyword = "";
    clearSearchBtn.style.display = "none";
    window.refreshPlaylist();
  };

  function getActiveFolderIndices() {
    const indices = [];
    tracks.forEach((t, idx) => {
      if (activeFolder === "all") {
        indices.push(idx);
      } else if (activeFolder === "mp3" && (t.type === "file" || t.type === "url")) {
        indices.push(idx);
      } else if (activeFolder === "mp4" && t.type === "video") {
        indices.push(idx);
      } else if (t.folderId === activeFolder) {
        indices.push(idx);
      }
    });
    return indices;
  }

  /* === RENDER & PLAYBACK (PLAYLIST LOKAL) === */
  window.refreshPlaylist = async function () {
    tracks = await window.getAllTracksDB();
    renderFolderDropdown();

    const localTabCount = document.getElementById("localTabCount");
    if (localTabCount) localTabCount.textContent = tracks.length;

    const folderIndices = getActiveFolderIndices();
    const playFolderBtn = document.getElementById("playFolderBtn");
    if (playFolderBtn) {
      playFolderBtn.disabled = folderIndices.length === 0;
    }

    const visibleTracks = folderIndices
      .map((realIdx) => ({ track: tracks[realIdx], realIdx }))
      .filter(({ track }) => {
        if (!searchKeyword) return true;
        const folderObj = customFolders.find((f) => f.id === track.folderId);
        const folderLabel = folderObj ? folderObj.name : track.type === "video" ? "mp4" : "mp3";
        return `${track.name} ${folderLabel}`.toLowerCase().includes(searchKeyword);
      });

    if (activeLibraryTab === "local") {
      const isFiltered = activeFolder !== "all" || searchKeyword !== "";
      document.getElementById("trackCount").textContent = isFiltered
        ? `${visibleTracks.length}/${tracks.length} Media`
        : `${tracks.length} Media`;
    }

    const container = document.getElementById("playlistContainer");
    if (tracks.length === 0) {
      container.innerHTML = `
        <div class="empty-playlist">
          Playlist masih kosong.<br>Tambahkan file lagu/video lokal atau tempel link <strong>Spotify</strong> / <strong>YouTube</strong>.
        </div>
      `;
      return;
    }

    if (visibleTracks.length === 0) {
      container.innerHTML = `
        <div class="empty-playlist">
          Tidak ada lagu di folder ini${searchKeyword ? ` dengan kata kunci "<strong>${searchKeyword}</strong>"` : ""}.
        </div>
      `;
      return;
    }

    container.innerHTML = "";
    visibleTracks.forEach(({ track: t, realIdx }, displayIdx) => {
      let badgeHtml = `<span class="tag-pill tag-local">MP3</span>`;
      if (t.type === "video") badgeHtml = `<span class="tag-pill tag-video">MP4</span>`;
      else if (t.type === "spotify") badgeHtml = `<span class="tag-pill tag-spotify">Spotify</span>`;
      else if (t.type === "youtube") badgeHtml = `<span class="tag-pill tag-youtube">YouTube</span>`;

      const folderObj = customFolders.find((f) => f.id === t.folderId);
      const folderTag = folderObj ? `<span class="tag-pill tag-folder">📁 ${folderObj.name}</span>` : "";
      const syncTag = t.pendingSync ? `<span class="tag-pill tag-sync">Antre Online</span>` : "";

      const div = document.createElement("div");
      div.className = "track-item" + (realIdx === currentIndex ? " active" : "");
      div.innerHTML = `
        <div class="track-info">
          <span class="track-num">${realIdx === currentIndex ? "▶" : displayIdx + 1}</span>
          <div class="track-meta">
            <div class="track-title">${t.name}</div>
            <div class="track-source">${badgeHtml} ${folderTag} ${syncTag}</div>
          </div>
        </div>
        <div class="track-actions">
          <button type="button" class="btn-move-track" title="Pindahkan ke Folder">📁</button>
          <button type="button" class="btn-del-track" title="Hapus">✕</button>
        </div>
      `;

      div.querySelector(".track-info").onclick = () => playTrack(realIdx);

      div.querySelector(".btn-move-track").onclick = async (e) => {
        e.stopPropagation();
        if (!customFolders.length) {
          alert("Belum ada folder custom. Klik tombol ➕ di atas untuk membuat folder dulu.");
          return;
        }
        const listText = customFolders.map((f, i) => `${i + 1}. ${f.name}`).join("\n");
        const choice = prompt(
          `Pindahkan "${t.name}" ke folder:\n0. Keluarkan dari folder (Semua Media)\n${listText}\n\nKetik nomor pilihan:`
        );
        if (choice === null) return;
        const num = parseInt(choice.trim(), 10);
        if (num === 0) {
          delete t.folderId;
          await window.updateTrackDB(t);
          await window.refreshPlaylist();
        } else if (num >= 1 && num <= customFolders.length) {
          t.folderId = customFolders[num - 1].id;
          await window.updateTrackDB(t);
          await window.refreshPlaylist();
        }
      };

      div.querySelector(".btn-del-track").onclick = async (e) => {
        e.stopPropagation();
        await deleteTrackDB(t.id);
        if (realIdx === currentIndex) {
          stopAllEngines();
          currentIndex = -1;
          applyStageDisplayMode();
          document.getElementById("nowTitle").textContent = "Belum ada media dipilih";
          document.getElementById("nowBadge").textContent = "SIAP DIPUTAR";
        } else if (realIdx < currentIndex) {
          currentIndex--;
        }
        await window.refreshPlaylist();
        if (activeLibraryTab === "spotify") renderSpotifyLibraryPage();
      };

      container.appendChild(div);
    });
  };

  function getSpotifyUriFromTrack(track) {
    if (track.spotifyUri) return track.spotifyUri;
    const m = (track.url || track.embedUrl || "").match(/spotify\.com\/(?:embed\/)?(?:intl-[a-z]+\/)?(track|album|playlist|episode)\/([a-zA-Z0-9]+)/);
    return m ? `spotify:${m[1]}:${m[2]}` : null;
  }

  async function playSpotifyViaWebApi(track) {
    const token = await ensureValidSpotifyToken();
    const spUri = getSpotifyUriFromTrack(track);
    if (!token || !spDeviceId || !spUri) return false;

    const payload = spUri.includes(":track:") ? { uris: [spUri] } : { context_uri: spUri };
    const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spDeviceId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) return false;

    clearInterval(spProgressTimer);
    spProgressTimer = setInterval(() => {
      if (!spIsPlaying) return;
      spCurrentPosition += 400;
      const currSec = spCurrentPosition / 1000;
      const durSec = spCurrentDuration / 1000;
      syncLyricsHighlight(currSec);
      if (durSec > 0) {
        document.getElementById("seek").value = (currSec / durSec) * 100;
        document.getElementById("currTime").textContent = formatTime(currSec);
        document.getElementById("durTime").textContent = formatTime(durSec);
      }
    }, 400);

    return true;
  }

  function loadHybridYoutubeAudio(videoId, track, folderSubLabel) {
    isHybridAudioPlaying = true;
    document.getElementById("nowBadge").textContent = "SPOTIFY FULL AUDIO" + folderSubLabel;
    document.getElementById("nowSub").textContent = track.url;

    ytContainer.style.display = "block";
    ytContainer.style.opacity = "0";
    ytContainer.style.pointerEvents = "none";
    ytContainer.style.zIndex = "0";
    spotifyEmbedContainer.style.display = "none";
    cvs.style.display = "block";
    resizeCanvas();

    if (ytReady && ytPlayer && typeof ytPlayer.loadVideoById === "function") {
      const ytPlayerDiv = document.getElementById("ytPlayer");
      if (ytPlayerDiv) ytPlayerDiv.style.display = "block";
      ytPlayer.loadVideoById(videoId);
      ytPlayer.setVolume(document.getElementById("vol").value * 100);
      setPlayIcon(true);
    } else {
      const ytPlayerDiv = document.getElementById("ytPlayer");
      if (ytPlayerDiv) ytPlayerDiv.style.display = "none";
      ytContainer.insertAdjacentHTML(
        "beforeend",
        `<iframe id="ytFallbackFrame" src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1" allow="autoplay; encrypted-media" style="width:100%;height:100%;border:none;"></iframe>`
      );
      setPlayIcon(true);
    }
  }

  async function playTrack(idx) {
    if (idx < 0 || idx >= tracks.length) return;
    currentIndex = idx;
    const track = tracks[idx];
    const folderObj = customFolders.find((f) => f.id === track.folderId);
    const folderSubLabel = folderObj ? ` • Folder: ${folderObj.name}` : "";

    stopAllEngines();
    document.getElementById("seek").value = 0;
    document.getElementById("currTime").textContent = "0:00";
    document.getElementById("durTime").textContent = "0:00";
    document.getElementById("nowTitle").textContent = track.name;
    fetchAutoLyrics(track.name);

    if (track.type === "spotify") {
      if (track.thumbnail) setAlbumThumbnail(track.thumbnail);

      if (!navigator.onLine) {
        document.getElementById("nowBadge").textContent = "OFFLINE - TERSIMPAN";
        document.getElementById("nowSub").textContent = "Link Spotify tersimpan lokal, putar saat internet aktif";
        window.refreshPlaylist();
        if (activeLibraryTab === "spotify") renderSpotifyLibraryPage();
        return;
      }

      // 1. Jika Owner Login Spotify Premium -> Putar via Spotify Web Playback SDK
      const playedViaSdk = await playSpotifyViaWebApi(track);
      if (playedViaSdk) {
        document.getElementById("nowBadge").textContent = "SPOTIFY WEB API" + folderSubLabel;
        document.getElementById("nowSub").textContent = track.url;
        applyStageDisplayMode();
        setPlayIcon(true);
        window.refreshPlaylist();
        if (activeLibraryTab === "spotify") renderSpotifyLibraryPage();
        return;
      }

      // 2. Jika Non-Login / Free -> Cek Cache videoId Lokal dulu (0 API call)
      if (track.matchedVideoId) {
        loadHybridYoutubeAudio(track.matchedVideoId, track, folderSubLabel);
        window.refreshPlaylist();
        if (activeLibraryTab === "spotify") renderSpotifyLibraryPage();
        return;
      }

      // 3. Cari Full Audio via /api/spotify (yt-search + Vercel CDN Cache)
      document.getElementById("nowBadge").textContent = "MENCARI FULL AUDIO...";
      document.getElementById("nowSub").textContent = track.url;
      try {
        const matchRes = await fetch("/api/spotify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "match_audio", query: track.name })
        });
        const matched = await matchRes.json();

        if (matchRes.ok && matched.videoId) {
          track.matchedVideoId = matched.videoId;
          if (track.id) {
            await window.updateTrackDB(track);
          }
          loadHybridYoutubeAudio(matched.videoId, track, folderSubLabel);
          window.refreshPlaylist();
          if (activeLibraryTab === "spotify") renderSpotifyLibraryPage();
          return;
        }
      } catch (_) {}

      // 4. Fallback terakhir ke Spotify Embed jika pencarian audio gagal
      document.getElementById("nowBadge").textContent = "SPOTIFY EMBED" + folderSubLabel;
      document.getElementById("nowSub").textContent = track.url;
      applyStageDisplayMode();
      spotifyEmbedContainer.innerHTML = `<iframe src="${track.embedUrl}" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
      setPlayIcon(false);

      window.refreshPlaylist();
      if (activeLibraryTab === "spotify") renderSpotifyLibraryPage();
      return;
    }

    if (track.type === "youtube") {
      const thumbUrl = track.thumbnail || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`;
      setAlbumThumbnail(thumbUrl);

      if (!navigator.onLine) {
        document.getElementById("nowBadge").textContent = "OFFLINE - TERSIMPAN";
        document.getElementById("nowSub").textContent = "Link YouTube tersimpan lokal, putar saat internet aktif";
        window.refreshPlaylist();
        return;
      }

      document.getElementById("nowBadge").textContent = "YOUTUBE VIDEO" + folderSubLabel;
      document.getElementById("nowSub").textContent = track.url;
      applyStageDisplayMode();

      if (ytReady && ytPlayer && typeof ytPlayer.loadVideoById === "function") {
        const ytPlayerDiv = document.getElementById("ytPlayer");
        if (ytPlayerDiv) ytPlayerDiv.style.display = "block";
        ytPlayer.loadVideoById(track.videoId);
        ytPlayer.setVolume(document.getElementById("vol").value * 100);
        setPlayIcon(true);
      } else {
        const ytPlayerDiv = document.getElementById("ytPlayer");
        if (ytPlayerDiv) ytPlayerDiv.style.display = "none";
        ytContainer.insertAdjacentHTML(
          "beforeend",
          `<iframe id="ytFallbackFrame" src="https://www.youtube.com/embed/${track.videoId}?autoplay=1&rel=0&playsinline=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen style="width:100%;height:100%;border:none;"></iframe>`
        );
        setPlayIcon(true);
      }

      window.refreshPlaylist();
      return;
    }

    if (activeBlobUrl) {
      URL.revokeObjectURL(activeBlobUrl);
      activeBlobUrl = null;
    }

    if (track.type === "video" && track.blob) {
      activeBlobUrl = URL.createObjectURL(track.blob);
      activeMediaEl = videoPlayer;
      videoPlayer.src = activeBlobUrl;
      videoPlayer.loop = isLoop;
      videoPlayer.dataset.hasVideo = "true";

      applyStageDisplayMode();

      document.getElementById("nowBadge").textContent = "VIDEO OFFLINE LOKAL" + folderSubLabel;
      document.getElementById("nowSub").textContent = "Diputar dari Penyimpanan Lokal Browser";

      initAudioGraph(videoPlayer);
      videoPlayer.play().then(() => setPlayIcon(true)).catch(() => setPlayIcon(false));
      window.refreshPlaylist();
      return;
    }

    activeMediaEl = audio;
    if (track.type === "file" && track.blob) {
      activeBlobUrl = URL.createObjectURL(track.blob);
      audio.src = activeBlobUrl;
      document.getElementById("nowBadge").textContent = "AUDIO OFFLINE LOKAL" + folderSubLabel;
      document.getElementById("nowSub").textContent = "Diputar dari Penyimpanan Lokal Browser";
    } else {
      audio.src = track.url;
      document.getElementById("nowBadge").textContent = "STREAMING AUDIO" + folderSubLabel;
      document.getElementById("nowSub").textContent = track.url;
    }

    applyStageDisplayMode();
    audio.loop = isLoop;
    initAudioGraph(audio);
    audio.play().then(() => setPlayIcon(true)).catch(() => setPlayIcon(false));
    window.refreshPlaylist();
  }

  /* === PUTAR OTOMATIS HANYA DI FOLDER YANG SEDANG DIBUKA === */
  function playNext() {
    const pool = getActiveFolderIndices();
    if (!pool.length) return;

    if (isShuffle && pool.length > 1) {
      const candidates = pool.filter((idx) => idx !== currentIndex);
      const randIdx = candidates[Math.floor(Math.random() * candidates.length)];
      playTrack(randIdx);
      return;
    }

    const posInPool = pool.indexOf(currentIndex);
    if (posInPool === -1) {
      playTrack(pool[0]);
    } else {
      const nextPos = posInPool < pool.length - 1 ? posInPool + 1 : 0;
      playTrack(pool[nextPos]);
    }
  }

  /* === TRIGGER INPUT FILE === */
  const openFilePickerBtn = document.getElementById("openFilePickerBtn");
  if (openFilePickerBtn) {
    openFilePickerBtn.onclick = () => document.getElementById("fileInput").click();
  }

  const triggerImportBtn = document.getElementById("triggerImportBtn");
  if (triggerImportBtn) {
    triggerImportBtn.onclick = () => document.getElementById("importPlaylistInput").click();
  }

  const triggerBgFileBtn = document.getElementById("triggerBgFileBtn");
  if (triggerBgFileBtn) {
    triggerBgFileBtn.onclick = () => document.getElementById("setBgFile").click();
  }

  /* === TAMBAH FILE LOKAL === */
  document.getElementById("fileInput").onchange = async (e) => {
    const selected = [...e.target.files];
    if (!selected.length) return;
    const isCustom = customFolders.some((f) => f.id === activeFolder);
    const beforeCount = getActiveFolderIndices().length;

    for (const file of selected) {
      const isVideoFile = file.type.startsWith("video/");
      const record = {
        name: file.name.replace(/\.[^/.]+$/, ""),
        type: isVideoFile ? "video" : "file",
        blob: file,
        pendingSync: false
      };
      if (isCustom) record.folderId = activeFolder;
      await addTrackDB(record);
    }
    e.target.value = "";
    switchLibraryTab("local");
    await window.refreshPlaylist();

    const updatedPool = getActiveFolderIndices();
    if (beforeCount === 0 && updatedPool.length > 0) {
      playTrack(updatedPool[0]);
    }
  };

  /* === TAMBAH LINK (OTOMATIS PECAH FOLDER & LAGU SPOTIFY ANTI-LIMIT) === */
  document.getElementById("addUrlBtn").onclick = async () => {
    const urlEl = document.getElementById("urlInput");
    const addBtn = document.getElementById("addUrlBtn");
    const rawUrl = urlEl.value.trim();
    if (!rawUrl) return;

    const isCustom = customFolders.some((f) => f.id === activeFolder);
    const beforeCount = getActiveFolderIndices().length;
    const parsed = parseMediaLink(rawUrl);

    if (navigator.onLine && parsed.type === "spotify") {
      const oriBtnText = addBtn.textContent;
      addBtn.textContent = "⏳...";
      addBtn.disabled = true;

      try {
        const res = await fetch("/api/spotify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resolve_url", url: rawUrl })
        });

        if (res.ok) {
          const resolved = await res.json();

          if (Array.isArray(resolved.tracks) && resolved.tracks.length > 0) {
            const plId = resolved.playlistId || String(Date.now());
            const folderName = (resolved.folderName || "Spotify Playlist").trim();
            const folderId = `sp_fld_${plId}`;
            const folderLabel = `Spotify • ${folderName}`.slice(0, 32);

            if (!spLibraryCache || !Array.isArray(spLibraryCache.playlists)) {
              spLibraryCache = { profile: spAuth?.profile || null, playlists: [] };
            }
            const existingPlIdx = spLibraryCache.playlists.findIndex((p) => p.spotifyPlaylistId === plId);
            const plPayload = {
              spotifyPlaylistId: plId,
              name: folderName,
              tracks: resolved.tracks
            };
            if (existingPlIdx !== -1) spLibraryCache.playlists[existingPlIdx] = plPayload;
            else spLibraryCache.playlists.push(plPayload);
            localStorage.setItem(SP_LIBRARY_CACHE_KEY, JSON.stringify(spLibraryCache));

            let targetFolder = customFolders.find((f) => f.id === folderId);
            if (!targetFolder) {
              targetFolder = { id: folderId, name: folderLabel, isSpotifySynced: true };
              customFolders.push(targetFolder);
              saveCustomFolders();
            }

            const existingTracks = await window.getAllTracksDB();
            for (const item of resolved.tracks) {
              const duplicate = existingTracks.some(
                (t) => t.folderId === targetFolder.id && t.spotifyUri === item.spotifyUri
              );
              if (!duplicate) {
                await addTrackDB({
                  name: item.name,
                  type: "spotify",
                  spotifyUri: item.spotifyUri,
                  url: item.url,
                  embedUrl: item.embedUrl,
                  thumbnail: item.thumbnail,
                  folderId: targetFolder.id,
                  pendingSync: false
                });
              }
            }

            urlEl.value = "";
            spSelectedPlaylistId = plId;
            spCurrentPage = 1;
            updateSpotifyAuthUI();
            await window.refreshPlaylist();
            switchLibraryTab("spotify");

            const firstTrackIndex = tracks.findIndex((t) => t.folderId === targetFolder.id);
            if (firstTrackIndex !== -1) {
              await playTrack(firstTrackIndex);
            }
            return;
          }
        }
      } catch (_) {
      } finally {
        addBtn.textContent = oriBtnText;
        addBtn.disabled = false;
      }
    }

    // Fallback default (YouTube / MP3 URL)
    if (isCustom) parsed.folderId = activeFolder;

    if (navigator.onLine && parsed.type === "youtube") {
      try {
        const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`);
        if (res.ok) {
          const info = await res.json();
          if (info.title) {
            parsed.name = info.title;
            parsed.pendingSync = false;
          }
          if (info.thumbnail_url) {
            parsed.thumbnail = info.thumbnail_url;
          }
        }
      } catch (_) {}
    }

    await addTrackDB(parsed);
    urlEl.value = "";
    switchLibraryTab("local");
    await window.refreshPlaylist();

    if (parsed.type === "youtube" && currentIndex === -1) {
      setAlbumThumbnail(parsed.thumbnail);
      document.getElementById("nowBadge").textContent = "YOUTUBE SIAP DIPUTAR";
      document.getElementById("nowTitle").textContent = parsed.name;
      document.getElementById("nowSub").textContent = "Klik tombol Play (▶) untuk memutar media";
    }

    const updatedPool = getActiveFolderIndices();
    if (beforeCount === 0 && updatedPool.length > 0) {
      playTrack(updatedPool[0]);
    }
  };

  /* === RESET SEMUA === */
  document.getElementById("resetBtn").onclick = async () => {
    if (!confirm("Reset dan hapus semua lagu & video dari playlist lokal browser?")) return;
    stopAllEngines();
    if (activeBlobUrl) {
      URL.revokeObjectURL(activeBlobUrl);
      activeBlobUrl = null;
    }
    currentIndex = -1;
    parsedLrcLines = [];
    applyStageDisplayMode();
    await clearTracksDB();

    document.getElementById("nowBadge").textContent = "SIAP DIPUTAR";
    document.getElementById("nowTitle").textContent = "Belum ada media dipilih";
    document.getElementById("nowSub").textContent = "Playlist telah di-reset";
    document.getElementById("seek").value = 0;
    document.getElementById("currTime").textContent = "0:00";
    document.getElementById("durTime").textContent = "0:00";

    const lyricsContainer = document.getElementById("lyricsContent");
    if (lyricsContainer) {
      lyricsContainer.innerHTML = `<div class="empty-playlist">Putar lagu atau video untuk mendeteksi lirik otomatis (mendukung Synced Lyrics real-time).</div>`;
    }

    await window.refreshPlaylist();
  };

  /* === PLAY / PAUSE / STOP === */
  document.getElementById("playPauseBtn").onclick = () => {
    const pool = getActiveFolderIndices();
    if (!pool.length) return;

    if (currentIndex === -1 || !pool.includes(currentIndex)) {
      playTrack(pool[0]);
      return;
    }

    const track = tracks[currentIndex];

    if (track.type === "youtube" || (track.type === "spotify" && isHybridAudioPlaying)) {
      if (ytReady && ytPlayer && typeof ytPlayer.getPlayerState === "function") {
        const state = ytPlayer.getPlayerState();
        if (state === YT.PlayerState.PLAYING) {
          ytPlayer.pauseVideo();
          setPlayIcon(false);
        } else {
          ytPlayer.playVideo();
          setPlayIcon(true);
        }
      } else {
        playTrack(currentIndex);
      }
      return;
    }

    if (track.type === "spotify") {
      if (spSdkPlayer && spDeviceId) {
        spSdkPlayer.togglePlay().catch(() => playTrack(currentIndex));
      } else {
        playTrack(currentIndex);
      }
      return;
    }

    if (activeMediaEl.paused) {
      initAudioGraph(activeMediaEl);
      activeMediaEl.play().then(() => setPlayIcon(true)).catch(() => setPlayIcon(false));
    } else {
      activeMediaEl.pause();
      setPlayIcon(false);
    }
  };

  document.getElementById("playFolderBtn").onclick = () => {
    const pool = getActiveFolderIndices();
    if (!pool.length) {
      alert("Folder ini masih kosong, belum ada media yang bisa diputar.");
      return;
    }

    if (isShuffle && pool.length > 1) {
      const randIdx = pool[Math.floor(Math.random() * pool.length)];
      playTrack(randIdx);
    } else {
      playTrack(pool[0]);
    }
  };

  document.getElementById("stopBtn").onclick = () => {
    if (currentIndex === -1) return;
    const track = tracks[currentIndex];

    if ((track.type === "youtube" || isHybridAudioPlaying) && ytReady && ytPlayer) {
      ytPlayer.seekTo(0);
      ytPlayer.pauseVideo();
    } else if (track.type === "spotify" && spSdkPlayer) {
      spSdkPlayer.seek(0);
      spSdkPlayer.pause();
      spIsPlaying = false;
    } else {
      activeMediaEl.pause();
      activeMediaEl.currentTime = 0;
    }
    setPlayIcon(false);
    document.getElementById("seek").value = 0;
    document.getElementById("currTime").textContent = "0:00";
  };

  document.getElementById("prevBtn").onclick = () => {
    const pool = getActiveFolderIndices();
    if (!pool.length) return;

    const posInPool = pool.indexOf(currentIndex);
    if (posInPool === -1) {
      playTrack(pool[0]);
    } else {
      const prevPos = posInPool > 0 ? posInPool - 1 : pool.length - 1;
      playTrack(pool[prevPos]);
    }
  };

  document.getElementById("nextBtn").onclick = playNext;

  document.getElementById("loopBtn").onclick = (e) => {
    isLoop = !isLoop;
    audio.loop = isLoop;
    videoPlayer.loop = isLoop;
    e.currentTarget.classList.toggle("active", isLoop);
  };

  document.getElementById("shuffleBtn").onclick = (e) => {
    isShuffle = !isShuffle;
    e.currentTarget.classList.toggle("active", isShuffle);
  };

  document.getElementById("vol").oninput = (e) => {
    const val = parseFloat(e.target.value);
    if (gainNode) gainNode.gain.value = val;
    else {
      audio.volume = val;
      videoPlayer.volume = val;
    }
    if (ytReady && ytPlayer && typeof ytPlayer.setVolume === "function") {
      ytPlayer.setVolume(val * 100);
    }
    if (spSdkPlayer && typeof spSdkPlayer.setVolume === "function") {
      spSdkPlayer.setVolume(val);
    }
  };

  document.getElementById("bass").oninput = (e) => {
    if (bassEQ) bassEQ.gain.value = e.target.value;
  };

  function formatTime(sec) {
    if (!sec || isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = String(Math.floor(sec % 60)).padStart(2, "0");
    return `${m}:${s}`;
  }

  function bindProgress(el) {
    el.ontimeupdate = () => {
      if (activeMediaEl !== el) return;
      syncLyricsHighlight(el.currentTime);
      const pct = (el.currentTime / el.duration) * 100 || 0;
      document.getElementById("seek").value = pct;
      document.getElementById("currTime").textContent = formatTime(el.currentTime);
      document.getElementById("durTime").textContent = formatTime(el.duration);
    };
    el.onended = () => {
      const autoNext = window.GP_PWA ? window.GP_PWA.getSettings().autoNext : true;
      if (!isLoop && autoNext) playNext();
      else setPlayIcon(false);
    };
  }

  bindProgress(audio);
  bindProgress(videoPlayer);

  document.getElementById("seek").oninput = (e) => {
    if (currentIndex === -1) return;
    const track = tracks[currentIndex];
    const pct = parseFloat(e.target.value) / 100;

    if ((track.type === "youtube" || isHybridAudioPlaying) && ytReady && ytPlayer) {
      const dur = ytPlayer.getDuration();
      if (dur) ytPlayer.seekTo(pct * dur, true);
    } else if (track.type === "spotify" && spSdkPlayer && spCurrentDuration > 0) {
      spSdkPlayer.seek(Math.floor(pct * spCurrentDuration));
    } else if (activeMediaEl.duration) {
      activeMediaEl.currentTime = pct * activeMediaEl.duration;
    }
  };

  /* === EXPORT & IMPORT PLAYLIST === */
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function base64ToBlob(dataUrl) {
    const [header, base64Data] = dataUrl.split(",");
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
    const binary = atob(base64Data);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  document.getElementById("exportPlaylistBtn").onclick = async () => {
    const allTracks = await window.getAllTracksDB();
    if (!allTracks.length && !customFolders.length) {
      alert("Playlist dan folder masih kosong, tidak ada yang bisa di-export.");
      return;
    }

    const btn = document.getElementById("exportPlaylistBtn");
    const oriText = btn.textContent;
    btn.textContent = "⏳ Mengemas...";
    btn.disabled = true;

    try {
      const exportedItems = [];
      for (const item of allTracks) {
        const copy = {
          name: item.name,
          type: item.type,
          url: item.url || null,
          spotifyUri: item.spotifyUri || null,
          embedUrl: item.embedUrl || null,
          videoId: item.videoId || null,
          matchedVideoId: item.matchedVideoId || null,
          thumbnail: item.thumbnail || null,
          folderId: item.folderId || null,
          pendingSync: item.pendingSync || false
        };
        if (item.blob instanceof Blob) {
          copy.blobData = await blobToBase64(item.blob);
        }
        exportedItems.push(copy);
      }

      const payload = {
        app: "GiveawaysPickerMusic",
        version: 2,
        exportedAt: new Date().toISOString(),
        totalFolders: customFolders.length,
        totalTracks: exportedItems.length,
        folders: customFolders,
        tracks: exportedItems
      };

      const fileBlob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const downloadUrl = URL.createObjectURL(fileBlob);
      const a = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = downloadUrl;
      a.download = `GP-Music-Playlist-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      alert("Gagal melakukan export playlist: " + err.message);
    } finally {
      btn.textContent = oriText;
      btn.disabled = false;
    }
  };

  document.getElementById("importPlaylistInput").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed.tracks) ? parsed.tracks : Array.isArray(parsed) ? parsed : null;
      const importedFolders = Array.isArray(parsed.folders) ? parsed.folders : [];

      if (!list) {
        alert("File backup playlist tidak valid.");
        e.target.value = "";
        return;
      }

      const folderIdMap = {};
      let restoredFolderCount = 0;

      for (const f of importedFolders) {
        if (!f || !f.name) continue;
        const existingById = customFolders.find((cf) => cf.id === f.id);
        const existingByName = customFolders.find(
          (cf) => cf.name.toLowerCase() === f.name.trim().toLowerCase()
        );

        if (existingById) {
          folderIdMap[f.id] = existingById.id;
        } else if (existingByName) {
          folderIdMap[f.id] = existingByName.id;
        } else {
          const newId = f.id || "fld_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
          customFolders.push({ id: newId, name: f.name.trim().slice(0, 32) });
          folderIdMap[f.id] = newId;
          restoredFolderCount++;
        }
      }
      saveCustomFolders();

      const beforePoolCount = getActiveFolderIndices().length;
      let importedTrackCount = 0;

      for (const item of list) {
        const trackRecord = {
          name: item.name || "Media Imported",
          type: item.type || "url",
          url: item.url || null,
          spotifyUri: item.spotifyUri || null,
          embedUrl: item.embedUrl || null,
          videoId: item.videoId || null,
          matchedVideoId: item.matchedVideoId || null,
          thumbnail: item.thumbnail || null,
          pendingSync: Boolean(item.pendingSync)
        };

        if (item.folderId && folderIdMap[item.folderId]) {
          trackRecord.folderId = folderIdMap[item.folderId];
        }

        if (item.blobData && typeof item.blobData === "string" && item.blobData.startsWith("data:")) {
          trackRecord.blob = base64ToBlob(item.blobData);
        }

        await addTrackDB(trackRecord);
        importedTrackCount++;
      }

      await window.refreshPlaylist();
      const updatedPool = getActiveFolderIndices();
      if (beforePoolCount === 0 && updatedPool.length > 0) {
        playTrack(updatedPool[0]);
      }

      alert(
        `✅ Import selesai!\n• ${importedTrackCount} lagu/video berhasil dimuat\n• ${restoredFolderCount} folder baru dipulihkan`
      );
    } catch (err) {
      alert("Gagal membaca file backup JSON: " + err.message);
    } finally {
      e.target.value = "";
    }
  };

  /* === PENGELOLA HALAMAN TAB (LOKAL VS SPOTIFY LIBRARY) === */
  function switchLibraryTab(tabName) {
    activeLibraryTab = tabName;
    const localPane = document.getElementById("localLibraryPage");
    const spPane = document.getElementById("spotifyLibraryPage");
    const tabLocalBtn = document.getElementById("tabLocalLibraryBtn");
    const tabSpBtn = document.getElementById("tabSpotifyLibraryBtn");
    const isConnected = Boolean(spAuth && spAuth.access_token);
    const hasPublicLibrary = Boolean(
      spLibraryCache && Array.isArray(spLibraryCache.playlists) && spLibraryCache.playlists.length > 0
    );

    if (!localPane || !spPane) return;

    if (tabName === "spotify" && (isConnected || hasPublicLibrary)) {
      localPane.style.display = "none";
      spPane.style.display = "flex";
      tabLocalBtn?.classList.remove("active");
      tabSpBtn?.classList.add("active");
      renderSpotifyLibraryPage();
    } else {
      activeLibraryTab = "local";
      spPane.style.display = "none";
      localPane.style.display = "flex";
      tabSpBtn?.classList.remove("active");
      tabLocalBtn?.classList.add("active");
      window.refreshPlaylist();
    }
  }

  document.getElementById("tabLocalLibraryBtn")?.addEventListener("click", () => switchLibraryTab("local"));
  document.getElementById("tabSpotifyLibraryBtn")?.addEventListener("click", () => switchLibraryTab("spotify"));

  function getFlattenedSpotifyTracks() {
    if (!spLibraryCache || !Array.isArray(spLibraryCache.playlists)) return [];
    const list = [];
    for (const pl of spLibraryCache.playlists) {
      if (spSelectedPlaylistId !== "all" && pl.spotifyPlaylistId !== spSelectedPlaylistId) continue;
      for (const tr of pl.tracks || []) {
        list.push({
          ...tr,
          playlistId: pl.spotifyPlaylistId,
          playlistName: pl.name
        });
      }
    }
    if (!spSearchQuery) return list;
    return list.filter((item) =>
      `${item.name} ${item.playlistName}`.toLowerCase().includes(spSearchQuery)
    );
  }

  function renderSpotifyLibraryPage() {
    const container = document.getElementById("spotifyTracksContainer");
    const plSelect = document.getElementById("spPlaylistFilter");
    const pageInfo = document.getElementById("spPageInfo");
    const prevPageBtn = document.getElementById("spPrevPageBtn");
    const nextPageBtn = document.getElementById("spNextPageBtn");
    const profileNameEl = document.getElementById("spProfileName");
    const profileSubEl = document.getElementById("spProfileSub");
    const spTabCountEl = document.getElementById("spotifyTabCount");

    if (!container) return;

    const playlists = spLibraryCache?.playlists || [];
    const totalAllSongs = playlists.reduce((acc, p) => acc + (p.tracks?.length || 0), 0);

    if (spTabCountEl) spTabCountEl.textContent = totalAllSongs;

    if (profileNameEl) {
      profileNameEl.textContent = spAuth?.profile?.display_name || "Spotify Public Library";
    }
    if (profileSubEl) {
      const plan = spAuth?.access_token ? (spAuth?.profile?.product || "free").toUpperCase() : "GUEST MODE";
      profileSubEl.textContent = `${plan} • ${playlists.length} Playlist • ${totalAllSongs} Lagu`;
    }

    if (plSelect) {
      let opts = `<option value="all">🎵 Semua Lagu Spotify (${totalAllSongs})</option>`;
      playlists.forEach((pl) => {
        opts += `<option value="${pl.spotifyPlaylistId}">📁 ${pl.name} (${pl.tracks.length})</option>`;
      });
      plSelect.innerHTML = opts;
      plSelect.value = playlists.some((p) => p.spotifyPlaylistId === spSelectedPlaylistId)
        ? spSelectedPlaylistId
        : "all";
    }

    const filtered = getFlattenedSpotifyTracks();
    if (activeLibraryTab === "spotify") {
      document.getElementById("trackCount").textContent = `${filtered.length} Spotify`;
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / SP_ITEMS_PER_PAGE));
    if (spCurrentPage > totalPages) spCurrentPage = totalPages;
    if (spCurrentPage < 1) spCurrentPage = 1;

    const startIdx = (spCurrentPage - 1) * SP_ITEMS_PER_PAGE;
    const pageItems = filtered.slice(startIdx, startIdx + SP_ITEMS_PER_PAGE);

    if (pageInfo) pageInfo.textContent = `Hal ${spCurrentPage} / ${totalPages}`;
    if (prevPageBtn) prevPageBtn.disabled = spCurrentPage <= 1;
    if (nextPageBtn) nextPageBtn.disabled = spCurrentPage >= totalPages;

    if (pageItems.length === 0) {
      container.innerHTML = `<div class="empty-playlist">Tidak ada lagu Spotify yang ditemukan.</div>`;
      return;
    }

    container.innerHTML = "";
    pageItems.forEach((item, idx) => {
      const globalNum = startIdx + idx + 1;
      const isCurrentlyPlaying =
        currentIndex !== -1 &&
        tracks[currentIndex]?.type === "spotify" &&
        (tracks[currentIndex]?.spotifyUri === item.spotifyUri || tracks[currentIndex]?.url === item.url);

      const row = document.createElement("div");
      row.className = "track-item" + (isCurrentlyPlaying ? " active" : "");
      row.innerHTML = `
        <div class="track-info">
          <span class="track-num">${isCurrentlyPlaying ? "▶" : globalNum}</span>
          ${item.thumbnail ? `<img src="${item.thumbnail}" class="sp-track-thumb" alt="" />` : ""}
          <div class="track-meta">
            <div class="track-title">${item.name}</div>
            <div class="track-source">
              <span class="tag-pill tag-spotify">Spotify</span>
              <span class="tag-pill tag-folder">📁 ${item.playlistName}</span>
            </div>
          </div>
        </div>
        <div class="track-actions">
          <button type="button" class="btn-move-track" title="Simpan ke Playlist Lokal">➕</button>
        </div>
      `;

      row.querySelector(".track-info").onclick = async () => {
        const folderId = `sp_fld_${item.playlistId}`;
        let idxInTracks = tracks.findIndex(
          (t) => t.folderId === folderId && (t.spotifyUri === item.spotifyUri || t.url === item.url)
        );
        if (idxInTracks === -1) {
          await addTrackDB({
            name: item.name,
            type: "spotify",
            spotifyUri: item.spotifyUri,
            url: item.url,
            embedUrl: item.embedUrl,
            thumbnail: item.thumbnail,
            folderId,
            pendingSync: false
          });
          tracks = await window.getAllTracksDB();
          idxInTracks = tracks.findIndex(
            (t) => t.folderId === folderId && (t.spotifyUri === item.spotifyUri || t.url === item.url)
          );
        }
        if (idxInTracks !== -1) {
          await playTrack(idxInTracks);
          renderSpotifyLibraryPage();
        }
      };

      row.querySelector(".btn-move-track").onclick = async (e) => {
        e.stopPropagation();
        await addTrackDB({
          name: item.name,
          type: "spotify",
          spotifyUri: item.spotifyUri,
          url: item.url,
          embedUrl: item.embedUrl,
          thumbnail: item.thumbnail,
          pendingSync: false
        });
        await window.refreshPlaylist();
        alert(`✅ "${item.name}" ditambahkan ke Playlist Lokal!`);
      };

      container.appendChild(row);
    });
  }

  document.getElementById("spPlaylistFilter")?.addEventListener("change", (e) => {
    spSelectedPlaylistId = e.target.value;
    spCurrentPage = 1;
    renderSpotifyLibraryPage();
  });

  document.getElementById("spTrackSearchInput")?.addEventListener("input", (e) => {
    spSearchQuery = e.target.value.trim().toLowerCase();
    spCurrentPage = 1;
    renderSpotifyLibraryPage();
  });

  document.getElementById("spPrevPageBtn")?.addEventListener("click", () => {
    if (spCurrentPage > 1) {
      spCurrentPage--;
      renderSpotifyLibraryPage();
    }
  });

  document.getElementById("spNextPageBtn")?.addEventListener("click", () => {
    spCurrentPage++;
    renderSpotifyLibraryPage();
  });

  document.getElementById("spPlayAllBtn")?.addEventListener("click", () => {
    const firstRowInfo = document.querySelector("#spotifyTracksContainer .track-info");
    if (firstRowInfo) firstRowInfo.click();
  });

  document.getElementById("spLogoutBtn")?.addEventListener("click", () => {
    if (!confirm("Logout dari akun Spotify? (Playlist & folder lokal tetap aman tersimpan)")) return;
    if (spSdkPlayer) spSdkPlayer.disconnect();
    spSdkPlayer = null;
    spDeviceId = null;
    localStorage.removeItem(SP_LIBRARY_CACHE_KEY);
    spLibraryCache = null;
    saveSpotifyAuth(null);
    switchLibraryTab("local");
  });

  window.refreshPlaylist();
  initSpotifyFlow();
})();
