/* =============================================
   FOR HER — APP ENGINE
   Drives index.html: YouTube audio + slide system
   ============================================= */

'use strict';

const App = (() => {

  // ─────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────
  let SONGS   = [];
  let SLIDES  = [];
  let cur     = -1;
  let stTimer = null;
  let running = false;
  let ytPlrs  = {};
  let ytOk    = false;
  let activeSng = -1;

  // ─────────────────────────────────────────────
  // DOM
  // ─────────────────────────────────────────────
  const $  = id => document.getElementById(id);
  let $stage, $pb, $pw, $ctr, $mbars, $slbl, $intro, $ec, $ytc;

  // ─────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────
  async function init() {
    $stage = $('stage');
    $pb    = $('pb');
    $pw    = $('pw');
    $ctr   = $('ctr');
    $mbars = $('mbars');
    $slbl  = $('slbl');
    $intro = $('intro');
    $ec    = $('ec');
    $ytc   = $('ytc');

    const data = await loadContent();
    SONGS  = data.songs  || getFallbackSongs();
    SLIDES = data.slides || getFallbackSlides();

    buildSlides();
    loadYT();

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
    try {
      const res = await fetch('content.json');
      if (!res.ok) throw new Error('fetch failed');
      return await res.json();
    } catch {
      return {
        songs:  getFallbackSongs(),
        slides: getFallbackSlides()
      };
    }
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

      // Ken Burns class map
      const kbMap = {
        'zoom-in'  : 'kb-zi',
        'zoom-out' : 'kb-zo',
        'pan-right': 'kb-pr',
        'pan-left' : 'kb-pl',
        'drift-up' : 'kb-du'
      };
      const kbCls = kbMap[s.kenBurns] || 'kb-zi';

      // Build lyric lines HTML
      const linesHTML = (s.lines || []).map(l => {
        const cls = [
          'll',
          l.delay  ? `d${l.delay}`  : 'd1',
          l.style  ? l.style        : '',
          l.size   ? l.size         : '',
          l.color  ? l.color        : ''
        ].filter(Boolean).join(' ');
        return `<span class="${cls}">${escHtml(l.text)}</span>`;
      }).join('');

      d.innerHTML = `
        <div class="sbg ${kbCls}" style="background-image:url('${escAttr(s.image)}')"></div>
        <div class="sovl"></div>
        <div class="stint" style="background:${escAttr(s.tint || 'rgba(0,0,0,0.28)')}"></div>
        <div class="lw ${escAttr(s.pos || 'pos-bc')}">
          ${linesHTML}
        </div>`;

      $stage.appendChild(d);
    });
  }

  // ─────────────────────────────────────────────
  // GO TO SLIDE
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
        setTimeout(() => pe.classList.remove('active'), 1500);
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
      activeSng = sng;
      switchSong(sng);
    }

    // Schedule next slide
    clearTimeout(stTimer);
    stTimer = setTimeout(() => goSlide(cur + 1), dur);
  }

  // ─────────────────────────────────────────────
  // YOUTUBE INTEGRATION
  // ─────────────────────────────────────────────
  function loadYT() {
    if (window.YT && window.YT.Player) {
      onYouTubeIframeAPIReady();
      return;
    }
    const t = document.createElement('script');
    t.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(t);
  }

  window.onYouTubeIframeAPIReady = function () {
    ytOk = true;
    SONGS.forEach((s, i) => {
      const el = document.createElement('div');
      el.id = `yt-${i}`;
      $ytc.appendChild(el);

      ytPlrs[i] = new YT.Player(`yt-${i}`, {
        height: '1', width: '1',
        videoId: s.ytId,
        playerVars: {
          start        : s.start || 0,
          autoplay     : 0,
          controls     : 0,
          disablekb    : 1,
          fs           : 0,
          modestbranding: 1,
          rel          : 0
        },
        events: {
          onReady: e => e.target.setVolume(0)
        }
      });
    });
  };

  function switchSong(idx) {
    // Update song label
    $slbl.classList.remove('on');
    setTimeout(() => {
      $slbl.textContent = SONGS[idx] ? SONGS[idx].title : '';
      $slbl.classList.add('on');
    }, 350);

    if (!ytOk) return;

    // Fade out all other songs
    SONGS.forEach((_, i) => {
      if (i !== idx && ytPlrs[i]) {
        fadeVol(ytPlrs[i], 0, () => {
          try { ytPlrs[i].pauseVideo(); } catch {}
        });
      }
    });

    // Fade in new song
    if (ytPlrs[idx]) {
      try {
        ytPlrs[idx].seekTo(SONGS[idx].start || 0, true);
        ytPlrs[idx].playVideo();
        fadeVol(ytPlrs[idx], 82);
      } catch (e) {}
    }
  }

  function fadeVol(player, to, cb) {
    let v = 0;
    try { v = player.getVolume() || 0; } catch {}
    const step = to > v ? 3 : -3;
    const iv = setInterval(() => {
      v += step;
      if ((step > 0 && v >= to) || (step < 0 && v <= to)) {
        v = to;
        clearInterval(iv);
        if (cb) cb();
      }
      try { player.setVolume(Math.max(0, Math.min(100, v))); } catch {}
    }, 80);
  }

  // ─────────────────────────────────────────────
  // START
  // ─────────────────────────────────────────────
  function start() {
    $intro.classList.add('gone');
    [$pw, $ctr, $mbars, $slbl].forEach(e => e.classList.add('on'));
    running = true;
    setTimeout(() => goSlide(0), 1600);
  }

  // ─────────────────────────────────────────────
  // END
  // ─────────────────────────────────────────────
  function showEnd() {
    running = false;
    $pb.style.width = '100%';
    SONGS.forEach((_, i) => {
      if (ytPlrs[i]) {
        fadeVol(ytPlrs[i], 0, () => {
          try { ytPlrs[i].pauseVideo(); } catch {}
        });
      }
    });
    setTimeout(() => $ec.classList.add('on'), 2000);
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
    setTimeout(() => goSlide(0), 800);
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
  // FALLBACK DATA (mirrors index.html defaults)
  // ─────────────────────────────────────────────
  function getFallbackSongs() {
    return [
      { title: "Kasoor — Prateek Kuhad",      ytId: "N3vQBQ3XPCY", start: 30 },
      { title: "Baarishein — Atif Aslam",      ytId: "ixrSQoJ57WM", start: 15 },
      { title: "Tum Hi Ho — Arijit Singh",     ytId: "Umqb9KENgmk", start: 10 },
      { title: "Tera Yaar Hoon Main — Arijit", ytId: "f0Z1dOOzN5E", start: 12 },
      { title: "Khairiyat — Arijit Singh",     ytId: "dBgtCsrR4xU", start: 18 }
    ];
  }

  function getFallbackSlides() {
    return [
      {
        img: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=1600&q=85",
        tint: "rgba(40,20,8,0.32)", kenBurns: "zoom-in", pos: "pos-bc", song: 0, dur: 9000,
        lines: [
          { text: "There are people you meet", delay: 1 },
          { text: "and the world quietly shifts.", delay: 2, color: "gold" }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=1600&q=85",
        tint: "rgba(30,12,5,0.3)", kenBurns: "pan-right", pos: "pos-bl", song: 0, dur: 9000,
        lines: [
          { text: "She was one of them.", delay: 1, size: "big", color: "gold" }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1531306728370-e2ebd9d7bb99?w=1600&q=85",
        tint: "rgba(20,10,20,0.28)", kenBurns: "zoom-out", pos: "pos-mc", song: 0, dur: 10000,
        lines: [
          { text: "Kuch toh tha,", delay: 1, color: "gold" },
          { text: "jo aaँkhon ne bola,", delay: 2 },
          { text: "jo lafzon ne nahi.", delay: 3, color: "rose" }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=1600&q=85",
        tint: "rgba(10,5,25,0.3)", kenBurns: "pan-left", pos: "pos-tr", song: 0, dur: 9000,
        lines: [
          { text: "The kind of person", delay: 1, style: "sm" },
          { text: "you remember", delay: 2 },
          { text: "on ordinary days.", delay: 3, color: "rose" }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=1600&q=85",
        tint: "rgba(30,10,5,0.28)", kenBurns: "drift-up", pos: "pos-bc", song: 0, dur: 9000,
        lines: [
          { text: "Kasoor tera nahi.", delay: 1, size: "big", color: "gold" },
          { text: "Aur mera bhi nahi.", delay: 2 }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1519692933481-e162a57d6721?w=1600&q=85",
        tint: "rgba(5,15,32,0.38)", kenBurns: "zoom-in", pos: "pos-bc", song: 1, dur: 9500,
        lines: [
          { text: "Baarish jab bhi ho —", delay: 1, color: "blue" },
          { text: "teri yaad aati hai.", delay: 2 }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=1600&q=85",
        tint: "rgba(5,18,35,0.35)", kenBurns: "drift-up", pos: "pos-ml", song: 1, dur: 9000,
        lines: [
          { text: "Some feelings", delay: 1, style: "caps" },
          { text: "don't have names.", delay: 2, size: "big" },
          { text: "They just live.", delay: 3, color: "blue" }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1473621038790-b778b4750efe?w=1600&q=85",
        tint: "rgba(8,12,30,0.38)", kenBurns: "pan-right", pos: "pos-tc", song: 1, dur: 9500,
        lines: [
          { text: "Jo dil mein tha —", delay: 1 },
          { text: "woh kabhi keh nahi paaye.", delay: 2, color: "rose" }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1600&q=85",
        tint: "rgba(5,10,28,0.35)", kenBurns: "zoom-out", pos: "pos-bc", song: 1, dur: 9000,
        lines: [
          { text: "And still —", delay: 1, style: "sm" },
          { text: "she stayed.", delay: 2, size: "big", color: "blue" },
          { text: "Like rain that never felt like sadness.", delay: 3 }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=85",
        tint: "rgba(5,8,25,0.32)", kenBurns: "pan-left", pos: "pos-br", song: 1, dur: 9000,
        lines: [
          { text: "Baarishein thi,", delay: 1, color: "blue" },
          { text: "aur tum bhi.", delay: 2, color: "gold" }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1600&q=85",
        tint: "rgba(30,8,5,0.28)", kenBurns: "zoom-in", pos: "pos-mc", song: 2, dur: 10000,
        lines: [
          { text: "Tum hi ho.", delay: 1, size: "big", color: "gold" }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=1600&q=85",
        tint: "rgba(22,8,5,0.28)", kenBurns: "pan-left", pos: "pos-bl", song: 2, dur: 9000,
        lines: [
          { text: "Har ek lamhe mein,", delay: 1 },
          { text: "sirf tum.", delay: 2, size: "big", color: "gold" }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1474631245212-32dc3c8310c6?w=1600&q=85",
        tint: "rgba(18,6,4,0.3)", kenBurns: "drift-up", pos: "pos-tc", song: 2, dur: 9500,
        lines: [
          { text: "There is something rare", delay: 1, style: "sm" },
          { text: "about a person who makes", delay: 2 },
          { text: "the world feel like home.", delay: 3, color: "gold" }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=1600&q=85",
        tint: "rgba(25,8,4,0.28)", kenBurns: "pan-right", pos: "pos-bc", song: 2, dur: 9000,
        lines: [
          { text: "Ab tere bina kya nahi —", delay: 1, color: "rose" },
          { text: "yeh dil jaanta hai.", delay: 2 }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1600&q=85",
        tint: "rgba(28,15,0,0.25)", kenBurns: "zoom-out", pos: "pos-tc", song: 3, dur: 9000,
        lines: [
          { text: "Tera yaar hoon main.", delay: 1, size: "big", color: "gold" },
          { text: "Sada ke liye.", delay: 2 }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1524117074681-31bd4de22ad3?w=1600&q=85",
        tint: "rgba(30,18,0,0.26)", kenBurns: "pan-right", pos: "pos-bl", song: 3, dur: 9000,
        lines: [
          { text: "The laughs that made", delay: 1 },
          { text: "everything okay.", delay: 2, color: "gold" }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1504196606672-aef5c9cefc92?w=1600&q=85",
        tint: "rgba(22,12,0,0.26)", kenBurns: "pan-left", pos: "pos-mc", song: 3, dur: 9500,
        lines: [
          { text: "Woh waqt,", delay: 1 },
          { text: "jo kabhi lautega nahi —", delay: 2 },
          { text: "par dil mein hai.", delay: 3, color: "gold" }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&q=85",
        tint: "rgba(20,10,0,0.28)", kenBurns: "zoom-in", pos: "pos-tr", song: 3, dur: 9000,
        lines: [
          { text: "Saath nibhaana,", delay: 1, color: "gold" },
          { text: "yeh waada mera.", delay: 2 }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1500622944204-b135684e99fd?w=1600&q=85",
        tint: "rgba(5,5,22,0.33)", kenBurns: "drift-up", pos: "pos-bc", song: 4, dur: 9500,
        lines: [
          { text: "Khairiyat pooch,", delay: 1, color: "blue" },
          { text: "kabhi toh khairiyat pooch.", delay: 2 }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1600&q=85",
        tint: "rgba(5,5,22,0.32)", kenBurns: "pan-left", pos: "pos-ml", song: 4, dur: 9500,
        lines: [
          { text: "Distance changes nothing", delay: 1 },
          { text: "that was ever real.", delay: 2, color: "rose" }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=1600&q=85",
        tint: "rgba(8,5,20,0.35)", kenBurns: "zoom-in", pos: "pos-bc", song: 4, dur: 10000,
        lines: [
          { text: "And today —", delay: 1, style: "caps" },
          { text: "on your birthday,", delay: 2, size: "big", color: "gold" },
          { text: "I just want you to feel it all.", delay: 3 }
        ]
      },
      {
        img: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1600&q=85",
        tint: "rgba(5,0,18,0.35)", kenBurns: "zoom-out", pos: "pos-mc", song: 4, dur: 13000,
        lines: [
          { text: "Happy Birthday.", delay: 1, size: "big", color: "gold" },
          { text: "You deserve every beautiful thing.", delay: 2 },
          { text: "Every single one.", delay: 3, color: "rose" }
        ]
      }
    ];
  }

  // ─────────────────────────────────────────────
  // EXPOSE replay globally (called by HTML button)
  // ─────────────────────────────────────────────
  window.replay = replay;

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
