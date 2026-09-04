/* =========================================================
   OPENSDR — CLEAN FRONTEND JS
   No built-in stations/signals
   Frequency: 45.000 MHz → 108.000 MHz
   ========================================================= */

(() => {
  "use strict";

  /* -----------------------------
     CONFIG
  ----------------------------- */

  const MIN_FREQ = 45.000;
  const MAX_FREQ = 108.000;

  let frequency = 94.700;
  let mode = "WFM";
  let bandwidth = 180;
  let volume = 70;
  let squelch = 0;
  let zoom = 1;

  let running = false;
  let audioContext = null;
  let analyser = null;
  let mediaStream = null;
  let mediaSource = null;
  let gainNode = null;

  let animationFrame = null;

  /* -----------------------------
     DOM HELPERS
  ----------------------------- */

  const $ = id => document.getElementById(id);

  const freqDisplay =
    $("frequency") ||
    $("freqDisplay") ||
    $("frequencyDisplay");

  const freqInput =
    $("frequencyInput") ||
    $("freqInput");

  const spectrumCanvas =
    $("spectrum") ||
    $("spectrumCanvas");

  const waterfallCanvas =
    $("waterfall") ||
    $("waterfallCanvas");

  const volumeSlider =
    $("volume");

  const squelchSlider =
    $("squelch");

  const bandwidthSelect =
    $("bandwidth");

  const zoomInButton =
    $("zoomIn");

  const zoomOutButton =
    $("zoomOut");

  const listenButton =
    $("listen") ||
    $("startButton");

  const stopButton =
    $("stop");

  const micButton =
    $("mic");

  /* -----------------------------
     CANVAS SETUP
  ----------------------------- */

  const spectrumCtx =
    spectrumCanvas ?
      spectrumCanvas.getContext("2d") :
      null;

  const waterfallCtx =
    waterfallCanvas ?
      waterfallCanvas.getContext("2d") :
      null;

  function resizeCanvases() {
    if (spectrumCanvas) {
      const rect = spectrumCanvas.getBoundingClientRect();

      spectrumCanvas.width =
        Math.max(1, Math.floor(rect.width * devicePixelRatio));

      spectrumCanvas.height =
        Math.max(1, Math.floor(rect.height * devicePixelRatio));

      spectrumCtx.setTransform(
        devicePixelRatio,
        0,
        0,
        devicePixelRatio,
        0,
        0
      );
    }

    if (waterfallCanvas) {
      const rect = waterfallCanvas.getBoundingClientRect();

      waterfallCanvas.width =
        Math.max(1, Math.floor(rect.width * devicePixelRatio));

      waterfallCanvas.height =
        Math.max(1, Math.floor(rect.height * devicePixelRatio));

      waterfallCtx.setTransform(
        devicePixelRatio,
        0,
        0,
        devicePixelRatio,
        0,
        0
      );
    }
  }

  window.addEventListener("resize", resizeCanvases);
  resizeCanvases();

  /* -----------------------------
     FREQUENCY
  ----------------------------- */

  function clampFrequency(value) {
    return Math.min(
      MAX_FREQ,
      Math.max(MIN_FREQ, value)
    );
  }

  function setFrequency(value) {
    value = Number(value);

    if (!Number.isFinite(value)) return;

    frequency = clampFrequency(value);

    updateFrequencyUI();
  }

  function tune(amount) {
    setFrequency(frequency + amount);
  }

  function updateFrequencyUI() {
    if (freqDisplay) {
      freqDisplay.textContent =
        frequency.toFixed(3) + " MHz";
    }

    if (freqInput) {
      freqInput.value =
        frequency.toFixed(3);
    }

    const event =
      new CustomEvent("sdrfrequencychange", {
        detail: {
          frequency,
          hz: frequency * 1000000
        }
      });

    window.dispatchEvent(event);
  }

  /* -----------------------------
     FREQUENCY INPUT
  ----------------------------- */

  if (freqInput) {
    freqInput.addEventListener("change", () => {
      setFrequency(freqInput.value);
    });

    freqInput.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        setFrequency(freqInput.value);
        freqInput.blur();
      }
    });
  }

  /* -----------------------------
     MODE
  ----------------------------- */

  function setMode(newMode) {
    mode = String(newMode).toUpperCase();

    document
      .querySelectorAll(
        "[data-mode], .mode-button, .mode-btn"
      )
      .forEach(button => {
        const buttonMode =
          button.dataset.mode ||
          button.textContent.trim().toUpperCase();

        button.classList.toggle(
          "active",
          buttonMode === mode
        );
      });

    updateBandwidthForMode();

    window.dispatchEvent(
      new CustomEvent("sdrmodechange", {
        detail: {
          mode
        }
      })
    );
  }

  document.addEventListener("click", event => {
    const button =
      event.target.closest(
        "[data-mode], .mode-button, .mode-btn"
      );

    if (!button) return;

    const selected =
      button.dataset.mode ||
      button.textContent.trim();

    const supported = [
      "WFM",
      "NFM",
      "FM",
      "AM",
      "USB",
      "LSB",
      "CW"
    ];

    const found =
      supported.find(
        item =>
          item.toUpperCase() ===
          selected.toUpperCase()
      );

    if (found) {
      setMode(found);
    }
  });

  /* -----------------------------
     BANDWIDTH
  ----------------------------- */

  function updateBandwidthForMode() {
    if (!bandwidthSelect) return;

    if (mode === "WFM") {
      bandwidth = 180;
    } else if (
      mode === "NFM" ||
      mode === "FM"
    ) {
      bandwidth = 12;
    } else if (mode === "AM") {
      bandwidth = 10;
    } else if (
      mode === "USB" ||
      mode === "LSB"
    ) {
      bandwidth = 2.7;
    } else if (mode === "CW") {
      bandwidth = 0.5;
    }

    const possible =
      [...bandwidthSelect.options]
        .find(
          option =>
            Number(option.value) === bandwidth
        );

    if (possible) {
      bandwidthSelect.value =
        possible.value;
    }
  }

  if (bandwidthSelect) {
    bandwidthSelect.addEventListener(
      "change",
      () => {
        bandwidth =
          Number(bandwidthSelect.value);

        window.dispatchEvent(
          new CustomEvent(
            "sdrbandwidthchange",
            {
              detail: {
                bandwidth
              }
            }
          )
        );
      }
    );
  }

  /* -----------------------------
     ZOOM
  ----------------------------- */

  function setZoom(value) {
    zoom =
      Math.max(
        1,
        Math.min(10, value)
      );

    window.dispatchEvent(
      new CustomEvent("sdrzoomchange", {
        detail: {
          zoom
        }
      })
    );
  }

  if (zoomInButton) {
    zoomInButton.addEventListener(
      "click",
      () => setZoom(zoom + 1)
    );
  }

  if (zoomOutButton) {
    zoomOutButton.addEventListener(
      "click",
      () => setZoom(zoom - 1)
    );
  }

  /* -----------------------------
     MOUSE TUNING
  ----------------------------- */

  function tuneFromCanvas(
    canvas,
    event
  ) {
    const rect =
      canvas.getBoundingClientRect();

    const x =
      event.clientX -
      rect.left;

    const ratio =
      Math.max(
        0,
        Math.min(
          1,
          x / rect.width
        )
      );

    const visibleRange =
      (MAX_FREQ - MIN_FREQ) / zoom;

    const center =
      frequency;

    const start =
      Math.max(
        MIN_FREQ,
        center -
          visibleRange / 2
      );

    const end =
      Math.min(
        MAX_FREQ,
        center +
          visibleRange / 2
      );

    const newFrequency =
      start +
      ratio *
      (end - start);

    setFrequency(newFrequency);
  }

  if (spectrumCanvas) {
    spectrumCanvas.addEventListener(
      "click",
      event => {
        tuneFromCanvas(
          spectrumCanvas,
          event
        );
      }
    );
  }

  /* -----------------------------
     KEYBOARD TUNING
  ----------------------------- */

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.target.matches(
          "input, textarea, select"
        )
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        tune(-0.025);
      }

      if (event.key === "ArrowRight") {
        tune(0.025);
      }

      if (event.key === "PageUp") {
        tune(1);
      }

      if (event.key === "PageDown") {
        tune(-1);
      }

      if (event.key === "+") {
        setZoom(zoom + 1);
      }

      if (event.key === "-") {
        setZoom(zoom - 1);
      }
    }
  );

  /* -----------------------------
     AUDIO
  ----------------------------- */

  async function createAudio() {
    if (audioContext) {
      await audioContext.resume();
      return;
    }

    audioContext =
      new (
        window.AudioContext ||
        window.webkitAudioContext
      )();

    analyser =
      audioContext.createAnalyser();

    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.75;

    gainNode =
      audioContext.createGain();

    gainNode.gain.value =
      volume / 100;

    analyser.connect(
      gainNode
    );

    gainNode.connect(
      audioContext.destination
    );
  }

  /* -----------------------------
     MICROPHONE INPUT
  ----------------------------- */

  async function startMicrophone() {
    try {
      await createAudio();

      if (mediaStream) {
        mediaStream
          .getTracks()
          .forEach(track =>
            track.stop()
          );
      }

      mediaStream =
        await navigator.mediaDevices
          .getUserMedia({
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false
            }
          });

      mediaSource =
        audioContext
          .createMediaStreamSource(
            mediaStream
          );

      mediaSource.connect(
        analyser
      );

      running = true;

      setStatus(
        "MIC ACTIVE"
      );

      startAnimation();

    } catch (error) {
      console.error(error);

      setStatus(
        "MIC ACCESS DENIED"
      );
    }
  }

  if (micButton) {
    micButton.addEventListener(
      "click",
      startMicrophone
    );
  }

  /* -----------------------------
     AUDIO FILE INPUT
     ----------------------------- */

  document.addEventListener(
    "change",
    event => {
      if (
        !event.target.matches(
          "#audioFile, #fileInput"
        )
      ) {
        return;
      }

      const file =
        event.target.files[0];

      if (!file) return;

      playAudioFile(file);
    }
  );

  async function playAudioFile(file) {
    try {
      await createAudio();

      const url =
        URL.createObjectURL(file);

      const audio =
        new Audio(url);

      audio.crossOrigin =
        "anonymous";

      const source =
        audioContext
          .createMediaElementSource(
            audio
          );

      source.connect(
        analyser
      );

      audio.play();

      running = true;

      setStatus(
        "AUDIO INPUT"
      );

      startAnimation();

      audio.addEventListener(
        "ended",
        () => {
          URL.revokeObjectURL(url);
          running = false;
        }
      );

    } catch (error) {
      console.error(error);
      setStatus("AUDIO ERROR");
    }
  }

  /* -----------------------------
     STREAM URL
  ----------------------------- */

  async function playStream(url) {
    try {
      await createAudio();

      const audio =
        new Audio();

      audio.src = url;
      audio.crossOrigin = "anonymous";
      audio.controls = false;

      const source =
        audioContext
          .createMediaElementSource(
            audio
          );

      source.connect(
        analyser
      );

      await audio.play();

      running = true;

      setStatus(
        "STREAM CONNECTED"
      );

      startAnimation();

    } catch (error) {
      console.error(error);

      setStatus(
        "STREAM FAILED"
      );
    }
  }

  window.playSDRStream =
    playStream;

  /* -----------------------------
     LISTEN / STOP
  ----------------------------- */

  async function startReceiver() {
    try {
      await createAudio();

      running = true;

      setStatus(
        "RECEIVER RUNNING"
      );

      startAnimation();

    } catch (error) {
      console.error(error);

      setStatus(
        "AUDIO ERROR"
      );
    }
  }

  function stopReceiver() {
    running = false;

    if (mediaStream) {
      mediaStream
        .getTracks()
        .forEach(track =>
          track.stop()
        );

      mediaStream = null;
    }

    if (animationFrame) {
      cancelAnimationFrame(
        animationFrame
      );

      animationFrame = null;
    }

    setStatus(
      "RECEIVER STOPPED"
    );
  }

  if (listenButton) {
    listenButton.addEventListener(
      "click",
      startReceiver
    );
  }

  if (stopButton) {
    stopButton.addEventListener(
      "click",
      stopReceiver
    );
  }

  /* -----------------------------
     VOLUME
  ----------------------------- */

  if (volumeSlider) {
    volume =
      Number(
        volumeSlider.value
      ) || 70;

    volumeSlider.addEventListener(
      "input",
      () => {
        volume =
          Number(
            volumeSlider.value
          );

        if (gainNode) {
          gainNode.gain.value =
            volume / 100;
        }
      }
    );
  }

  /* -----------------------------
     SQUELCH
  ----------------------------- */

  if (squelchSlider) {
    squelch =
      Number(
        squelchSlider.value
      ) || 0;

    squelchSlider.addEventListener(
      "input",
      () => {
        squelch =
          Number(
            squelchSlider.value
          );
      }
    );
  }

  /* -----------------------------
     STATUS
  ----------------------------- */

  function setStatus(text) {
    const elements =
      document.querySelectorAll(
        "#status, .status, #receiverStatus"
      );

    elements.forEach(
      element => {
        element.textContent =
          text;
      }
    );
  }

  /* -----------------------------
     EMPTY SPECTRUM
     NO BUILT-IN SIGNALS
  ----------------------------- */

  function drawSpectrum() {
    if (!spectrumCanvas) return;

    const rect =
      spectrumCanvas.getBoundingClientRect();

    const width =
      rect.width;

    const height =
      rect.height;

    spectrumCtx.clearRect(
      0,
      0,
      width,
      height
    );

    /* background */
    spectrumCtx.fillStyle =
      "#071018";

    spectrumCtx.fillRect(
      0,
      0,
      width,
      height
    );

    /* grid */
    spectrumCtx.strokeStyle =
      "rgba(255,255,255,0.07)";

    spectrumCtx.lineWidth = 1;

    for (
      let x = 0;
      x < width;
      x += 80
    ) {
      spectrumCtx.beginPath();

      spectrumCtx.moveTo(
        x,
        0
      );

      spectrumCtx.lineTo(
        x,
        height
      );

      spectrumCtx.stroke();
    }

    for (
      let y = 0;
      y < height;
      y += 40
    ) {
      spectrumCtx.beginPath();

      spectrumCtx.moveTo(
        0,
        y
      );

      spectrumCtx.lineTo(
        width,
        y
      );

      spectrumCtx.stroke();
    }

    /*
      Real analyser data if available.
      Otherwise show a quiet RF noise floor.
    */

    if (
      analyser &&
      running
    ) {
      const data =
        new Uint8Array(
          analyser.frequencyBinCount
        );

      analyser.getByteFrequencyData(
        data
      );

      drawAnalyserSpectrum(
        data,
        width,
        height
      );

    } else {
      drawNoiseFloor(
        width,
        height
      );
    }

    /* center frequency marker */

    spectrumCtx.strokeStyle =
      "rgba(255,255,255,0.85)";

    spectrumCtx.lineWidth = 1;

    spectrumCtx.beginPath();

    spectrumCtx.moveTo(
      width / 2,
      0
    );

    spectrumCtx.lineTo(
      width / 2,
      height
    );

    spectrumCtx.stroke();
  }

  /* -----------------------------
     REAL AUDIO SPECTRUM
  ----------------------------- */

  function drawAnalyserSpectrum(
    data,
    width,
    height
  ) {
    spectrumCtx.beginPath();

    for (
      let x = 0;
      x < width;
      x++
    ) {
      const index =
        Math.floor(
          x /
          width *
          data.length
        );

      const value =
        data[index] || 0;

      const normalized =
        value / 255;

      const y =
        height -
        normalized *
        height *
        0.9;

      if (x === 0) {
        spectrumCtx.moveTo(
          x,
          y
        );
      } else {
        spectrumCtx.lineTo(
          x,
          y
        );
      }
    }

    spectrumCtx.strokeStyle =
      "#36e6a1";

    spectrumCtx.lineWidth = 1.5;

    spectrumCtx.stroke();
  }

  /* -----------------------------
     NOISE FLOOR
  ----------------------------- */

  function drawNoiseFloor(
    width,
    height
  ) {
    spectrumCtx.beginPath();

    let last =
      height * 0.78;

    for (
      let x = 0;
      x < width;
      x++
    ) {
      const movement =
        (Math.random() - 0.5) *
        5;

      last += movement;

      last =
        Math.max(
          height * 0.68,
          Math.min(
            height * 0.86,
            last
          )
        );

      if (x === 0) {
        spectrumCtx.moveTo(
          x,
          last
        );
      } else {
        spectrumCtx.lineTo(
          x,
          last
        );
      }
    }

    spectrumCtx.strokeStyle =
      "rgba(90,180,150,0.65)";

    spectrumCtx.lineWidth = 1;

    spectrumCtx.stroke();
  }

  /* -----------------------------
     WATERFALL
  ----------------------------- */

  function drawWaterfall() {
    if (!waterfallCanvas) return;

    const rect =
      waterfallCanvas.getBoundingClientRect();

    const width =
      rect.width;

    const height =
      rect.height;

    /*
      Shift existing waterfall down.
    */

    const image =
      waterfallCtx.getImageData(
        0,
        0,
        waterfallCanvas.width,
        waterfallCanvas.height
      );

    waterfallCtx.putImageData(
      image,
      0,
      devicePixelRatio
    );

    /*
      Draw new row.
    */

    for (
      let x = 0;
      x < width;
      x++
    ) {
      let intensity;

      if (
        analyser &&
        running
      ) {
        const data =
          new Uint8Array(
            analyser.frequencyBinCount
          );

        analyser.getByteFrequencyData(
          data
        );

        const index =
          Math.floor(
            x /
            width *
            data.length
          );

        intensity =
          data[index] || 0;

      } else {
        intensity =
          25 +
          Math.random() * 25;
      }

      const value =
        Math.max(
          0,
          Math.min(
            255,
            intensity
          )
        );

      waterfallCtx.fillStyle =
        `rgb(
          ${Math.floor(value * 0.18)},
          ${Math.floor(value * 0.75)},
          ${Math.floor(value * 0.45)}
        )`;

      waterfallCtx.fillRect(
        x,
        0,
        1,
        1
      );
    }
  }

  /* -----------------------------
     MAIN ANIMATION
  ----------------------------- */

  function render() {
    drawSpectrum();
    drawWaterfall();

    updateSignalMeter();

    animationFrame =
      requestAnimationFrame(
        render
      );
  }

  function startAnimation() {
    if (animationFrame) return;

    render();
  }

  /* -----------------------------
     SIGNAL METER
  ----------------------------- */

  function updateSignalMeter() {
    const meters =
      document.querySelectorAll(
        "#signalMeter, .signal-meter, #sMeter"
      );

    let level = 0;

    if (
      analyser &&
      running
    ) {
      const data =
        new Uint8Array(
          analyser.frequencyBi
