// public/js/music-mobile-pwa.js
(function () {
  /* === 1. REGISTRASI SERVICE WORKER (MODE OFFLINE) === */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  /* === 2. TOMBOL INSTALL KE LAYAR UTAMA (SEPERTI APK) === */
  let deferredPrompt = null;
  const installBtn = document.getElementById("installAppBtn");
  const iosHint = document.getElementById("iosInstallHint");

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.style.display = "inline-flex";
  });

  if (installBtn) {
    installBtn.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        installBtn.style.display = "none";
      }
      deferredPrompt = null;
    });
  }

  // Deteksi Safari iOS (iPhone/iPad) untuk petunjuk "Tambah ke Layar Utama"
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (isIOS && !isStandalone && iosHint) {
    iosHint.style.display = "block";
  }

  /* === 3. DETEKSI ONLINE / OFFLINE & SINKRONISASI ANTREAN === */
  const netBadge = document.getElementById("networkStatusBadge");

  async function syncPendingOfflineLinks() {
    if (!navigator.onLine || typeof window.getAllTracksDB !== "function") return;
    const allTracks = await window.getAllTracksDB();
    let updated = false;

    for (const track of allTracks) {
      if (track.pendingSync && (track.type === "spotify" || track.type === "youtube")) {
        try {
          const endpoint =
            track.type === "spotify"
              ? `https://open.spotify.com/oembed?url=${encodeURIComponent(track.url)}`
              : `https://www.youtube.com/oembed?url=${encodeURIComponent(track.url)}&format=json`;
          const res = await fetch(endpoint);
          if (res.ok) {
            const info = await res.json();
            if (info.title) {
              track.name = info.title;
              track.pendingSync = false;
              await window.updateTrackDB(track);
              updated = true;
            }
          }
        } catch (_) {}
      }
    }

    if (updated && typeof window.refreshPlaylist === "function") {
      await window.refreshPlaylist();
    }
  }

  function updateNetworkUI() {
    if (!netBadge) return;
    if (navigator.onLine) {
      netBadge.textContent = "🟢 Online";
      netBadge.className = "net-badge online";
      syncPendingOfflineLinks();
    } else {
      netBadge.textContent = "🟠 Offline (Lokal Aktif)";
      netBadge.className = "net-badge offline";
    }
  }

  window.addEventListener("online", updateNetworkUI);
  window.addEventListener("offline", updateNetworkUI);
  window.addEventListener("DOMContentLoaded", () => {
    updateNetworkUI();
  });

  /* === 4. TOGGLE MODE TAMPILAN: VIDEO vs VISUALIZER === */
  const toggleViewBtn = document.getElementById("toggleVideoBtn");
  const videoEl = document.getElementById("videoPlayer");
  const canvasEl = document.getElementById("c");
  let showVideoMode = true;

  if (toggleViewBtn) {
    toggleViewBtn.addEventListener("click", () => {
      showVideoMode = !showVideoMode;
      toggleViewBtn.textContent = showVideoMode ? "🎬 Mode: Video" : "📊 Mode: Visualizer";

      if (videoEl && videoEl.dataset.hasVideo === "true") {
        videoEl.style.display = showVideoMode ? "block" : "none";
        canvasEl.style.display = showVideoMode ? "none" : "block";
      }
    });
  }

  // Ekspor helper ke global window agar bisa dipanggil oleh music.html
  window.GP_PWA = {
    isVideoMode: () => showVideoMode,
    syncPendingOfflineLinks
  };
})();
