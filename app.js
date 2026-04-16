/* =============================================
   FOR HER — APP ENGINE
   Drives index.html: IndexedDB audio + slide system
   ============================================= */

'use strict';

const App = (() => {

  // ─────────────────────────────────────────────
  // INDEXEDDB SETUP
  // ─────────────────────────────────────────────
  const DB_NAME = 'ForHerDB';
  const DB_VERSION = 1;
  let db = null;

  function initDB() {
    return new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      
      req.onerror = () => {
        console.warn('IndexedDB error');
        resolve(null);
      };
      req.onsuccess = () => {
        db = req.result;
        console.log('✓ IndexedDB ready');
        resolve(db);
      };
      
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('content')) {
          d.createObjectStore('content', { keyPath: 'id' });
        }
      };
    });
  }

  // ─────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────
  let SONGS   = [];
  let SLIDES  = [];
  let END_CARD = {};
  let PAGE_DATA = {};
  let cur     = -1;
  let stTimer = null;
  let running = false;
  let audioElements = [];
  let activeSng = -1;

  // ─────────────────────────────────────────────
  // DOM
  // ─────────────────────────────────────────────
  const $  = id => document.getElementById(id);
  let $stage, $pb, $pw, $ctr, $mbars, $intro, $ec, $loader;

  // ─────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────
  async function init() {
    // Init DOM refs
    $stage  = $('stage');
    $pb     = $('pb');
    $pw     = $('pw');
    $ctr    = $('ctr');
    $mbars  = $('mbars');
    $intro  = $('intro');
    $ec     = $('ec');
    $loader = $('loader');

    // Init IndexedDB
    await initDB();

    // Load content
    const data = await loadContent();
    SONGS     = data.songs  || getFallbackSongs();
    SLIDES    = normalizeSlides(data.slides || getFallbackSlides());
    END_CARD  = data.endCard || getFallbackEndCard();
    PAGE_DATA = data.page || getFallbackPageData();

    // Apply page data
    applyPageData();
    applyEndCard();

    // Build UI
    buildSlides();
    setupAudio();

    // Hide loader
    $loader.classList.add('gone');

    // Event listeners
    $('playBtn').addEventListener('click', start);
    $('replayBtn').addEventListener('click', replay);

    // Keyboard nav
    document.addEventListener('keydown', e => {
      if (!running) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        clearTimeout(stTimer);
        goSlide(cur + 1);
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        clearTimeout(stTimer);
        goSlide(Math.max(0, cur - 1));
      }
    });
  }

  // ─────────────────────────────────────────────
  // LOAD CONTENT
  // ─────────────────────────────────────────────
  async function loadContent() {
    // Try IndexedDB first
    if (db) {
      try {
        const dbData = await new Promise((resolve) => {
          const tx = db.transaction(['content'], 'readonly');
          const store = tx.objectStore('content');
          const req = store.get('main');
          req.onsuccess = () => {
            if (req.result?.data) resolve(req.result.data);
            else resolve(null);
          };
          req.onerror = () => resolve(null);
        });
        
        if (dbData) {
          console.log('✓ Loaded from IndexedDB');
          return dbData;
        }
      } catch (e) {
        console.warn('IndexedDB load error:', e);
      }
    }

    // Fallback to content.json
    try {
      const res = await fetch('content.json?' + Date.now());
      if (!res.ok) throw new Error('fetch failed');
      console.log('✓ Loaded from content.json');
      return await res.json();
    } catch (e) {
      console.warn('content.json error:', e);
      return {
        songs:  getFallbackSongs(),
        slides: getFallbackSlides(),
        endCard: getFallbackEndCard(),
        page: getFallbackPageData()
      };
    }
  }

  // ─────────────────────────────────────────────
  // NORMALIZE SLIDES
  // ─────────────────────────────────────────────
  function normalizeSlides(raw) {
    const kbMap = {
      'zoom-in':'kb-zi', 'zoom-out':'kb-zo',
      'pan-right':'kb-pr', 'pan-left':'kb-pl',
      'drift-up':'kb-du', 'drift-down':'kb-dr'
    };

    return raw.map(s => ({
      img:    s.img || s.image || '',
      tint:   s.tint || s.overlay || 'rgba(0,0,0,0.26)',
      kb:     kbMap[s.kenBurns] || 'kb-zi',
      pos:    s.pos || 'pos-bc',
      song:   typeof s.song === 'number' ? s.song : 0,
      dur:    s.dur || (s.duration ? s.duration * 1000 : 9000),
      chapter:s.chapter || '',
      lines:  (s.lines || []).map(ln => {
        if (ln.cls !== undefined) return ln;
        const parts = [];
        if (ln.delay != null) parts.push(`d${ln.delay}`);
        if (ln.color) parts.push(ln.color);
        if (ln.size)  parts.push(ln.size);
        if (ln.style) parts.push(ln.style);
        return { text: ln.text || '', cls: parts.join(' ') };
      })
    }));
  }

  // ─────────────────────────────────────────────
  // APPLY PAGE DATA
  // ─────────────────────────────────────────────
  function applyPageData() {
    const el = $('intro-name');
    if (el) el.textContent = PAGE_DATA.name || 'Her';
    const btn = $('intro-btn');
    if (btn) btn.textContent = PAGE_DATA.btn || 'Begin';
    document.title = PAGE_DATA.tabTitle || `For ${PAGE_DATA.name || 'Her'}`;
  }

  function applyEndCard() {
    const setTxt = (id, txt) => {
      const el = $(id);
      if (el) el.textContent = txt;
    };
    setTxt('ec-pre',  END_CARD.pre   || 'With love, always');
    setTxt('ec-name', END_CARD.title || 'Happy Birthday.');
    setTxt('ec-year', END_CARD.sub   || END_CARD.year || 'You deserve the whole world.');
    setTxt('ec-msg',  (END_CARD.msg  || 'Every song, every frame —\nmade only for you.').replace(/\\n/g,'\n'));
  }

  // ─────────────────────────────────────────────
  // BUILD SLIDES IN DOM
  // ─────────────────────────────────────────────
  function buildSlides() {
    $stage.innerHTML = '';
    SLIDES.forEach((s, i) => {
      const d = document.createElement('div');
      d.className = 'slide';
      d.id = `sl-${i}`;

      // Build lyric lines HTML
      const linesHTML = (s.lines || []).map(l => {
        const cls = [
          'll',
          l.cls || `d${l.delay || 1}`
        ].filter(Boolean).join(' ');
        return `<span class="${cls}">${escHtml(l.text)}</span>`;
      }).join('');

      // Build chapter
      const chapterHTML = s.chapter ? `
        <div class="chapter">
          <div class="chapter-line"></div>
          ${escHtml(s.chapter)}
          <div class="chapter-line"></div>
        </div>` : '';

      d.innerHTML = `
        <div class="sbg ${s.kb}" style="background-image:url('${escAttr(s.img)}')"></div>
        <div class="sovl"></div>
        <div class="stint" style="background:${escAttr(s.tint)}"></div>
        <div class="sbar-t"></div>
        <div class="sbar-b"></div>
        <div class="sbar-l"></div>
        <div class="sbar-r"></div>
        ${chapterHTML}
        <div class="scene-n">${String(i+1).padStart(2,'0')}</div>
        <div class="lw ${escAttr(s.pos)}">
          ${linesHTML}
        </div>`;

      $stage.appendChild(d);
    });
  }

  // ─────────────────────────────────────────────
  // AUDIO SETUP (HTML5)
  // ─────────────────────────────────────────────
  function setupAudio() {
    audioElements = [];
    SONGS.forEach((song, i) => {
      const audio = new Audio();
      
      // Check for uploaded audio (base64)
      const audioSrc = song.audioData || song.audioUrl || song.src;
      
      if (audioSrc && audioSrc.startsWith('data:')) {
        audio.src = audioSrc;
      } else {
        audio.src = '';
      }

      audio.preload = 'auto';
      audio.volume = 0;
      audio.loop = false;

      // Loop back to start
      audio.addEventListener('ended', () => {
        audio.currentTime = song.start || 0;
        audio.play().catch(() => {});
      });

      audioElements[i] = audio;
    });
  }

  function playAudio(idx) {
    if (!audioElements[idx] || !audioElements[idx].src) return;
    
    const audio = audioElements[idx];
    const song = SONGS[idx];
    
    audio.currentTime = song.start || 0;
    audio.play().catch(() => {});
    
    fadeAudio(audio, 0, (song.volume != null ? song.volume : 0.85), song.fadeIn || 800);
  }

  function stopAudio(idx) {
    if (!audioElements[idx]) return;
    
    const audio = audioElements[idx];
    const song = SONGS[idx];
    
    fadeAudio(audio, null, 0, song.fadeOut || 1200, () => {
      audio.pause();
    });
  }

  function fadeAudio(audio, fromVol, toVol, duration, callback) {
    let vol = fromVol != null ? fromVol : audio.volume;
    const steps = 30;
    const stepTime = duration / steps;
    const delta = (toVol - vol) / steps;
    
    let step = 0;
    const interval = setInterval(() => {
      vol += delta;
      audio.volume = Math.max(0, Math.min(1, vol));
      step++;
      
      if (step >= steps) {
        clearInterval(interval);
        audio.volume = toVol;
        if (callback) callback();
      }
    }, stepTime);
  }

  function switchAudio(idx) {
    if (idx === activeSng) return;
    
    // Stop current
    if (activeSng >= 0 && activeSng < audioElements.length) {
      stopAudio(activeSng);
    }
    
    activeSng = idx;
    
    // Play new
    if (idx >= 0 && idx < audioElements.length) {
      playAudio(idx);
    }
  }

  // ─────────────────────────────────────────────
  // BUILD SLIDES
  // ─────────────────────────────────────────────
  function goSlide(idx) {
    if (idx >= SLIDES.length) { showEnd(); return; }

    const prev = cur;
    cur = idx;

    // Deactivate previous slide
    if (prev >= 0) {
      const pe = $(`sl-${prev}`);
      if (pe) {
        pe.querySelectorAll('.ll').forEach(l => {
          l.classList.remove('in');
          l.classList.add('out');
        });
        setTimeout(() => pe.classList.remove('active'), 2200);
      }
    }

    const el = $(`sl-${idx}`);

    // Reset Ken Burns by cloning the bg node
    const ob = el.querySelector('.sbg');
    if (ob) {
      const nb = document.createElement('div');
      nb.className  = ob.className;
      nb.style.cssText = ob.style.cssText;
      ob.parentNode.replaceChild(nb, ob);
    }

    el.classList.add('active');

    // Animate lyrics in
    const lls = el.querySelectorAll('.ll');
    lls.forEach(l => l.classList.remove('out'));
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        lls.forEach(l => l.classList.add('in'))
      )
    );

    // Progress bar
    const dur = SLIDES[idx].dur || 9000;
    $pb.style.transition = 'none';
    $pb.style.width = '0%';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        $pb.style.transition = `width ${dur / 1000}s linear`;
        $pb.style.width = '100%';
      })
    );

    // Counter
    $ctr.textContent =
      `${String(idx + 1).padStart(2, '0')} / ${String(SLIDES.length).padStart(2, '0')}`;

    // Song switch
    const sng = SLIDES[idx].song || 0;
    if (sng !== activeSng) {
      switchAudio(sng);
    }

    // Schedule next slide
    clearTimeout(stTimer);
    stTimer = setTimeout(() => goSlide(cur + 1), dur);
  }

  // ─────────────────────────────────────────────
  // START
  // ─────────────────────────────────────────────
  function start() {
    $intro.classList.add('gone');
    [$pw, $ctr, $mbars].forEach(e => e.classList.add('on'));
    running = true;
    
    // Play first audio
    if (audioElements[0] && audioElements[0].src) {
      playAudio(0);
      activeSng = 0;
    }
    
    setTimeout(() => goSlide(0), 1800);
  }

  // ─────────────────────────────────────────────
  // END
  // ─────────────────────────────────────────────
  function showEnd() {
    running = false;
    $pb.style.width = '100%';
    
    // Fade out all audio
    audioElements.forEach((audio, i) => {
      if (audio && audio.src) stopAudio(i);
    });
    
    setTimeout(() => $ec.classList.add('on'), 2400);
  }

  // ─────────────────────────────────────────────
  // REPLAY
  // ─────────────────────────────────────────────
  function replay() {
    $ec.classList.remove('on');
    cur = -1;
    activeSng = -1;

    document.querySelectorAll('.slide').forEach(s => {
      s.classList.remove('active');
      s.querySelectorAll('.ll').forEach(l =>
        l.classList.remove('in', 'out')
      );
    });

    running = true;
    
    if (audioElements[0] && audioElements[0].src) {
      playAudio(0);
      activeSng = 0;
    }
    
    setTimeout(() => goSlide(0), 900);
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escAttr(str) {
    return String(str).replace(/"/g, '&quot;');
  }

  // ─────────────────────────────────────────────
  // FALLBACK DATA
  // ─────────────────────────────────────────────
  function getFallbackSongs() {
    return [
      { title: "Kasoor — Prateek Kuhad",      start: 30, volume: 0.85, fadeIn: 800,  fadeOut: 1200 },
      { title: "Baarishein — Atif Aslam",      start: 15, volume: 0.85, fadeIn: 800,  fadeOut: 1200 },
      { title: "Tum Hi Ho — Arijit Singh",     start: 10, volume: 0.85, fadeIn: 800,  fadeOut: 1200 },
      { title: "Tera Yaar Hoon Main — Arijit", start: 12, volume: 0.85, fadeIn: 800,  fadeOut: 1200 },
      { title: "Khairiyat — Arijit Singh",     start: 18, volume: 0.85, fadeIn: 1000, fadeOut: 1200 }
    ];
  }

  function getFallbackSlides() {
    return [
      { img: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=1600&q=85", tint: "rgba(40,20,8,0.32)", kenBurns: "zoom-in", pos: "pos-bc", song: 0, dur: 9000, lines: [{ text: "There are people you meet", delay: 1 }, { text: "and the world quietly shifts.", delay: 2, color: "gold" }] },
      { img: "https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=1600&q=85", tint: "rgba(30,12,5,0.3)", kenBurns: "pan-right", pos: "pos-bl", song: 0, dur: 9000, lines: [{ text: "She was one of them.", delay: 1, size: "big", color: "gold" }] },
      { img: "https://images.unsplash.com/photo-1531306728370-e2ebd9d7bb99?w=1600&q=85", tint: "rgba(20,10,20,0.28)", kenBurns: "zoom-out", pos: "pos-mc", song: 0, dur: 10000, lines: [{ text: "Kuch toh tha,", delay: 1, color: "gold" }, { text: "jo aankhon ne bola,", delay: 2 }, { text: "jo lafzon ne nahi.", delay: 3, color: "rose" }] },
      { img: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=1600&q=85", tint: "rgba(30,10,5,0.28)", kenBurns: "drift-up", pos: "pos-bc", song: 0, dur: 9000, lines: [{ text: "Kasoor tera nahi.", delay: 1, size: "big", color: "gold" }, { text: "Aur mera bhi nahi.", delay: 2 }] },
      { img: "https://images.unsplash.com/photo-1519692933481-e162a57d6721?w=1600&q=85", tint: "rgba(5,15,32,0.38)", kenBurns: "zoom-in", pos: "pos-bc", song: 1, dur: 9500, lines: [{ text: "Baarish jab bhi ho —", delay: 1, color: "blue" }, { text: "teri yaad aati hai.", delay: 2 }] },
      { img: "https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=1600&q=85", tint: "rgba(5,18,35,0.35)", kenBurns: "drift-up", pos: "pos-ml", song: 1, dur: 9000, lines: [{ text: "Some feelings", delay: 1 }, { text: "don't have names.", delay: 2, size: "big" }, { text: "They just live.", delay: 3, color: "blue" }] },
      { img: "https://images.unsplash.com/photo-1473621038790-b778b4750efe?w=1600&q=85", tint: "rgba(8,12,30,0.38)", kenBurns: "pan-right", pos: "pos-tc", song: 1, dur: 9500, lines: [{ text: "Jo dil mein tha —", delay: 1 }, { text: "woh kabhi keh nahi paaye.", delay: 2, color: "rose" }] },
      { img: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1600&q=85", tint: "rgba(30,8,5,0.28)", kenBurns: "zoom-in", pos: "pos-mc", song: 2, dur: 10000, lines: [{ text: "Tum hi ho.", delay: 1, size: "big", color: "gold" }] },
      { img: "https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=1600&q=85", tint: "rgba(22,8,5,0.28)", kenBurns: "pan-left", pos: "pos-bl", song: 2, dur: 9000, lines: [{ text: "Har ek lamhe mein,", delay: 1 }, { text: "sirf tum.", delay: 2, size: "big", color: "gold" }] },
      { img: "https://images.unsplash.com/photo-1474631245212-32dc3c8310c6?w=1600&q=85", tint: "rgba(18,6,4,0.3)", kenBurns: "drift-up", pos: "pos-tc", song: 2, dur: 9500, lines: [{ text: "There is something rare", delay: 1 }, { text: "about a person who makes", delay: 2 }, { text: "the world feel like home.", delay: 3, color: "gold" }] },
      { img: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1600&q=85", tint: "rgba(28,15,0,0.25)", kenBurns: "zoom-out", pos: "pos-tc", song: 3, dur: 9000, lines: [{ text: "Tera yaar hoon main.", delay: 1, size: "big", color: "gold" }, { text: "Sada ke liye.", delay: 2 }] },
      { img: "https://images.unsplash.com/photo-1524117074681-31bd4de22ad3?w=1600&q=85", tint: "rgba(30,18,0,0.26)", kenBurns: "pan-right", pos: "pos-bl", song: 3, dur: 9000, lines: [{ text: "The laughs that made", delay: 1 }, { text: "everything okay.", delay: 2, color: "gold" }] },
      { img: "https://images.unsplash.com/photo-1504196606672-aef5c9cefc92?w=1600&q=85", tint: "rgba(22,12,0,0.26)", kenBurns: "pan-left", pos: "pos-mc", song: 3, dur: 9500, lines: [{ text: "Woh waqt,", delay: 1 }, { text: "jo kabhi lautega nahi —", delay: 2 }, { text: "par dil mein hai.", delay: 3, color: "gold" }] },
      { img: "https://images.unsplash.com/photo-1500622944204-b135684e99fd?w=1600&q=85", tint: "rgba(5,5,22,0.33)", kenBurns: "drift-up", pos: "pos-bc", song: 4, dur: 9500, lines: [{ text: "Khairiyat pooch,", delay: 1, color: "blue" }, { text: "kabhi toh khairiyat pooch.", delay: 2 }] },
      { img: "https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=1600&q=85", tint: "rgba(8,5,20,0.35)", kenBurns: "zoom-in", pos: "pos-bc", song: 4, dur: 10000, lines: [{ text: "And today —", delay: 1 }, { text: "on your birthday,", delay: 2, size: "big", color: "gold" }, { text: "I just want you to feel it all.", delay: 3 }] },
      { img: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1600&q=85", tint: "rgba(5,0,18,0.35)", kenBurns: "zoom-out", pos: "pos-mc", song: 4, dur: 13000, lines: [{ text: "Happy Birthday.", delay: 1, size: "big", color: "gold" }, { text: "You deserve every beautiful thing.", delay: 2 }, { text: "Every single one.", delay: 3, color: "rose" }] }
    ];
  }

  function getFallbackEndCard() {
    return {
      pre:   "With love, always",
      title: "Happy Birthday.",
      sub:   "You deserve the whole world.",
      msg:   "Every song, every frame —\nmade only for you."
    };
  }

  function getFallbackPageData() {
    return {
      eyebrow: "A little something — made just for you",
      title:   "For Her.",
      name:    "Her",
      btn:     "Begin"
    };
  }

  // ─────────────────────────────────────────────
  // EXPOSE GLOBALLY
  // ─────────────────────────────────────────────
  window.replay = replay;

  return { init };
})();

// ─────────────────────────────────────────────
// AUTO-INIT ON DOM READY
// ─────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', App.init);
} else {
  App.init();
}
