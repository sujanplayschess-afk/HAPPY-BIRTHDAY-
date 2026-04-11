let data;
let sceneIndex = 0;
let startTime = 0;

const audio = document.getElementById("audio");
const sceneDiv = document.getElementById("scene");
const textDiv = document.getElementById("text");
const progress = document.getElementById("progress");

fetch("content.json")
.then(res => res.json())
.then(json => data = json);

function start(skip=false) {
  document.getElementById("intro").style.display = "none";
  startTime = Date.now();
  if(skip) sceneIndex = 2;
  playScene();
}

/* MAIN PLAYER */
function playScene() {
  if (sceneIndex >= data.scenes.length) return;

  const scene = data.scenes[sceneIndex];

  // background change
  sceneDiv.style.backgroundImage =
    `url(${scene.image}), url(https://picsum.photos/1920/1080?random=${sceneIndex})`;

  // text animation
  textDiv.style.opacity = 0;
  textDiv.innerText = scene.text;

  setTimeout(() => {
    textDiv.style.transition = "all 1s ease";
    textDiv.style.opacity = 1;
    textDiv.style.transform = "translateY(0)";
  }, 500);

  playMusic();

  animateProgress(scene.duration);

  setTimeout(() => {
    sceneIndex++;
    playScene();
  }, scene.duration * 1000);
}

/* MUSIC CONTROL */
function playMusic() {
  const elapsed = (Date.now() - startTime) / 1000;

  const track = data.music.find(m => m.start <= elapsed);

  if (track && audio.src !== track.file) {
    fadeOut(() => {
      audio.src = track.file;
      audio.play();
      fadeIn();
    });
  }
}

/* PROGRESS BAR */
function animateProgress(duration) {
  progress.style.transition = "none";
  progress.style.width = "0%";

  setTimeout(() => {
    progress.style.transition = `width ${duration}s linear`;
    progress.style.width = "100%";
  }, 50);
}

/* AUDIO FADE */
function fadeOut(cb) {
  let fade = setInterval(() => {
    if (audio.volume > 0.05) {
      audio.volume -= 0.05;
    } else {
      clearInterval(fade);
      cb();
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
