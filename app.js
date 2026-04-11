let data;
let currentMusic = "";
const audio = document.getElementById("audio");

fetch("content.json")
  .then(res => res.json())
  .then(json => data = json);

function start() {
  document.getElementById("intro").style.display = "none";
  loadScenes();
  setTimeout(autoScroll, 1500);
}

function loadScenes() {
  const app = document.getElementById("app");

  data.scenes.forEach((scene, index) => {

    const sec = document.createElement("div");
    sec.className = "scene";

    sec.style.backgroundImage =
      `url(${scene.image}), url(https://picsum.photos/1920/1080?random=${index})`;

    sec.innerHTML = `<div class="text">${scene.text}</div>`;

    sec.onmouseenter = () => playMusic(index);

    app.appendChild(sec);
  });
}

/* AUTO SCROLL */
let i = 0;
function autoScroll() {
  const scenes = document.querySelectorAll(".scene");

  if (i < scenes.length) {
    scenes[i].scrollIntoView({ behavior: "smooth" });
    playMusic(i);
    i++;
    setTimeout(autoScroll, 4000);
  }
}

/* MUSIC SYSTEM */
function playMusic(sceneIndex) {
  const track = data.music.find(m => m.startScene === sceneIndex);

  if (track && currentMusic !== track.file) {
    fadeOut(() => {
      audio.src = track.file;
      audio.play();
      fadeIn();
      currentMusic = track.file;
    });
  }
}

/* FADE EFFECT */
function fadeOut(callback) {
  let fade = setInterval(() => {
    if (audio.volume > 0.05) {
      audio.volume -= 0.05;
    } else {
      clearInterval(fade);
      callback();
    }
  }, 100);
}

function fadeIn() {
  audio.volume = 0;
  let fade = setInterval(() => {
    if (audio.volume < 0.9) {
      audio.volume += 0.05;
    } else {
      clearInterval(fade);
    }
  }, 100);
}
