async function initInteractiveAssets() {
  const cards = Array.from(document.querySelectorAll(".model-card"));
  if (!cards.length) return;

  const carousel = document.querySelector(".model-carousel");
  const prevButton = document.querySelector("[data-carousel-prev]");
  const nextButton = document.querySelector("[data-carousel-next]");

  if (carousel) {
    const scrollByCard = (direction) => {
      const firstCard = cards[0];
      const step = firstCard
        ? firstCard.getBoundingClientRect().width + 20
        : carousel.clientWidth * 0.85;

      carousel.scrollBy({
        left: direction * step,
        behavior: "smooth",
      });
    };

    prevButton?.addEventListener("click", () => scrollByCard(-1));
    nextButton?.addEventListener("click", () => scrollByCard(1));
  }

  const three = await import("three");
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const { DRACOLoader } = await import("three/addons/loaders/DRACOLoader.js");
  const { OrbitControls } = await import(
    "three/addons/controls/OrbitControls.js"
  );

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("assets/vendor/libs/draco/");

  function loadCard(card) {
    if (card.dataset.loaded === "true") return Promise.resolve();
    card.dataset.loaded = "true";
    card.classList.remove("is-idle");
    card.classList.add("is-pending");
    return initAssetViewer(card, { three, GLTFLoader, dracoLoader, OrbitControls });
  }

  cards.forEach((card) => {
    card.classList.add("is-idle");

    const playButton = card.querySelector("[data-model-play]");
    const timeInput = card.querySelector("[data-model-time]");

    if (playButton) playButton.disabled = true;
    if (timeInput) timeInput.disabled = true;
  });

  for (const card of cards) {
    await loadCard(card);
  }
}

async function initAssetViewer(
  card,
  { three, GLTFLoader, dracoLoader, OrbitControls }
) {
  const host = card.querySelector(".model-viewer");
  const status = card.querySelector(".model-status");
  const playButton = card.querySelector("[data-model-play]");
  const timeInput = card.querySelector("[data-model-time]");
  const timeLabel = card.querySelector("[data-model-time-label]");
  const modelSrc = host?.dataset.modelSrc;

  if (!host || !modelSrc) return;

  try {
    const scene = new three.Scene();
    scene.background = new three.Color(0xffffff);

    const camera = new three.PerspectiveCamera(35, 1, 0.01, 100);
    camera.position.set(0, 0.2, 4);

    const renderer = new three.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = three.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    host.replaceChildren(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.autoRotate = false;
    controls.target.set(0, 0, 0);

    scene.add(new three.HemisphereLight(0xffffff, 0xa8a8a8, 2.45));
    const key = new three.DirectionalLight(0xffffff, 3.05);
    key.position.set(3, 4, 5);
    scene.add(key);

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    const gltf = await loader.loadAsync(modelSrc);
    const model = gltf.scene;
    scene.add(model);

    const box = new three.Box3().setFromObject(model);
    const center = box.getCenter(new three.Vector3());
    const size = box.getSize(new three.Vector3());
    const maxSide = Math.max(size.x, size.y, size.z) || 1;
    const modelScale = 1.25 / maxSide;

    model.position.sub(center);
    scene.remove(model);

    const pivot = new three.Group();
    pivot.scale.setScalar(modelScale);
    pivot.add(model);
    scene.add(pivot);

    const clock = new three.Clock();
    const mixer = gltf.animations.length
      ? new three.AnimationMixer(model)
      : null;
    const clip = gltf.animations[0];
    const duration = clip ? clip.duration : 0;
    let isPlaying = Boolean(mixer && clip);

    if (mixer && clip) {
      mixer.clipAction(clip).play();
    }

    function updateTimeUi(seconds) {
      if (!duration) return;

      const wrapped = ((seconds % duration) + duration) % duration;

      if (timeInput && document.activeElement !== timeInput) {
        timeInput.value = String(Math.round((wrapped / duration) * 1000));
      }

      if (timeLabel) {
        timeLabel.textContent = `${wrapped.toFixed(2)}s`;
      }
    }

    if (playButton) {
      playButton.disabled = !mixer;
      playButton.textContent = isPlaying ? "Pause" : "Play";
      playButton.addEventListener("click", () => {
        isPlaying = !isPlaying;
        playButton.textContent = isPlaying ? "Pause" : "Play";
        clock.getDelta();
      });
    }

    if (timeInput) {
      timeInput.disabled = !mixer;
      timeInput.addEventListener("input", () => {
        if (!mixer || !duration) return;

        const seconds = (Number(timeInput.value) / 1000) * duration;
        mixer.setTime(seconds);
        isPlaying = false;
        if (playButton) playButton.textContent = "Play";
        updateTimeUi(seconds);
      });
    }

    card.classList.remove("is-pending");
    card.classList.add("is-loaded");
    if (status) status.hidden = true;

    let lastWidth = 0;
    let lastHeight = 0;

    function resize() {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);

      if (width === lastWidth && height === lastHeight) return;

      lastWidth = width;
      lastHeight = height;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;

      const fitFov =
        2 *
        Math.atan(
          Math.tan(three.MathUtils.degToRad(camera.fov) / 2) *
            Math.min(camera.aspect, 1)
        );
      const radius = 0.7;
      const distance = radius / Math.sin(fitFov / 2);
      camera.position.set(0, 0.15, distance * 1.35);
      camera.updateProjectionMatrix();
    }

    function animate() {
      const delta = clock.getDelta();

      resize();

      if (mixer && isPlaying) {
        mixer.update(delta);
        updateTimeUi(mixer.time);
      }

      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }

    animate();
  } catch (error) {
    console.error(error);
    card.classList.remove("is-pending");
    card.classList.add("is-loaded");

    if (status) {
      status.hidden = false;
      status.textContent = `Interactive model failed: ${error.message}`;
    } else {
      host.textContent = `Interactive model failed to load: ${error.message}`;
      host.classList.add("model-error");
    }
  }
}

initInteractiveAssets();
