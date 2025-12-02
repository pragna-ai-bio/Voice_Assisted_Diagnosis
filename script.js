// Voice recording functionality
const recordBtn = document.getElementById("record-btn");
const stopBtn = document.getElementById("stop-btn");
const playBtn = document.getElementById("play-btn");
const recordingIndicator = document.getElementById("recording-indicator");
const audioPlayer = document.getElementById("audio-player");
const analysisResult = document.getElementById("analysis-result");
const graphCanvas = document.getElementById("graph-canvas");
const status = document.getElementById("status");
const spinner = document.getElementById("spinner");

let mediaRecorder;
let audioChunks = [];
let audioContext;
let analyser;
let dataArray;
let graphCtx;
let animationId;

// Read graph styling from CSS variables with safe fallbacks
function getGraphStyles() {
  const root = getComputedStyle(document.documentElement);
  return {
    graphBg: (root.getPropertyValue('--graph-bg') || 'rgba(10, 10, 10, 0.8)').trim(),
    axisColor: (root.getPropertyValue('--graph-axis') || '#555').trim(),
    labelColor: (root.getPropertyValue('--graph-label') || '#999').trim(),
    titleColor: (root.getPropertyValue('--graph-title') || '#fff').trim(),
    accentColor: (root.getPropertyValue('--graph-accent') || 'rgba(255,215,0,0.9)').trim(),
    fillColor: (root.getPropertyValue('--graph-fill') || 'rgba(255,215,0,0.12)').trim(),
    hintColor: (root.getPropertyValue('--graph-hint') || '#777').trim(),
    titleSize: (root.getPropertyValue('--graph-font-title-size') || '16px').trim(),
    labelSize: (root.getPropertyValue('--graph-font-label-size') || '14px').trim(),
    hintSize: (root.getPropertyValue('--graph-font-hint-size') || '15px').trim()
  };
}

// DPR-aware canvas sizing helper. Keeps canvas pixel buffer scaled for crisp rendering.
function updateCanvasSize() {
  if (!graphCanvas) return;
  const rect = graphCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const pixelWidth = Math.max(1, Math.floor(rect.width * dpr));
  const pixelHeight = Math.max(1, Math.floor(rect.height * dpr));
  if (graphCanvas.width !== pixelWidth || graphCanvas.height !== pixelHeight) {
    graphCanvas.width = pixelWidth;
    graphCanvas.height = pixelHeight;
  }
  // Ensure we use a 2D context and set transform so drawing uses CSS pixels
  graphCtx = graphCanvas.getContext('2d');
  graphCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function initializeGraph() {
  if (graphCanvas && !graphCtx) {
    // Size canvas for current DPR and draw axes
    updateCanvasSize();
    drawEmptyGraph();
  }
}

const voicePage = document.getElementById("voice-page");
if (voicePage) {
  const observer = new MutationObserver(() => {
    if (voicePage.classList.contains("active")) {
      initializeGraph();
    }
  });
  observer.observe(voicePage, { attributes: true, attributeFilter: ["class"] });
}

// Resize canvas on window resize
window.addEventListener('resize', () => {
  if (graphCanvas) {
    updateCanvasSize();
    drawEmptyGraph();
  }
});

// Check if browser supports media recording
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  recordBtn.addEventListener("click", startRecording);
  stopBtn.addEventListener("click", stopRecording);
  playBtn.addEventListener("click", playRecording);
} else {
  recordBtn.disabled = true;
  recordBtn.innerHTML =
    '<i class="fas fa-microphone-slash"></i> Recording Not Supported';
}

function startRecording() {
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      // Set up audio context for analysis
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 2048;
      dataArray = new Uint8Array(analyser.fftSize);

      // Set up media recorder
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
        const audioUrl = URL.createObjectURL(audioBlob);
        audioPlayer.src = audioUrl;
        playBtn.disabled = false;

        // Show analysis result
        status.textContent = "Analyzing voice recording...";
        spinner.style.display = "block";

        setTimeout(() => {
          spinner.style.display = "none";
          analysisResult.style.display = "block";
          status.textContent = "Analysis complete. See results below.";

          // Generate a random result for demo purposes
          const randomResult = Math.floor(Math.random() * 15);
          document.querySelector(".result-value").textContent =
            randomResult + "%";

          // Update the graph
          drawPhotoacousticGraphFromRecording(randomResult);
        }, 3000);
      };

      mediaRecorder.start();
      recordBtn.disabled = true;
      stopBtn.disabled = false;
      recordingIndicator.classList.add("active");
      audioPlayer.style.display = "none";
      analysisResult.style.display = "none";

      // Start drawing real-time graph while recording
      drawRealTimeGraph();
    })
    .catch((err) => {
      console.error("Error accessing microphone:", err);
      alert(
        "Unable to access your microphone. Please check your permissions and try again."
      );
    });
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    recordingIndicator.classList.remove("active");
    audioPlayer.style.display = "block";

    // Stop all audio tracks
    mediaRecorder.stream.getTracks().forEach((track) => track.stop());

    // Stop real-time graph animation IMMEDIATELY
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    // Close audio context
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
  }
}

function playRecording() {
  audioPlayer.play();
}

function drawEmptyGraph() {
  if (!graphCtx || !graphCanvas) return;
  // Ensure canvas pixel sizing is up to date
  updateCanvasSize();
  const rect = graphCanvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const styles = getGraphStyles();

  // Clear canvas
  graphCtx.clearRect(0, 0, width, height);

  // Background fill
  graphCtx.fillStyle = styles.graphBg;
  graphCtx.fillRect(0, 0, width, height);
  // Draw axes and get centerY for placing messages
  const centerY = drawAxes(width, height);

  // Draw title (avoid overlap by placing at top with padding)
  graphCtx.fillStyle = styles.titleColor;
  graphCtx.font = styles.titleSize + " Arial";
  graphCtx.textAlign = "center";
  graphCtx.fillText("Voice Waveform (No Data)", width / 2, 18);

  // Small hint message below center, using centerY from axes
  graphCtx.fillStyle = styles.hintColor;
  graphCtx.font = styles.hintSize + " Arial";
  graphCtx.fillText("Record voice to see real-time waveform", width / 2, centerY + 6);
}

// Helper: draw time/amplitude axes and labels, returns centerY used for waveforms
function drawAxes(width, height) {
  const styles = getGraphStyles();
  // Draw central time axis and left amplitude axis
  graphCtx.strokeStyle = styles.axisColor;
  graphCtx.lineWidth = 1;
  graphCtx.beginPath();
  // Y axis (left)
  graphCtx.moveTo(50, 20);
  graphCtx.lineTo(50, height - 30);
  // X axis (center horizontal)
  const centerY = (height - 50) / 2 + 20;
  graphCtx.moveTo(50, centerY);
  graphCtx.lineTo(width - 20, centerY);
  graphCtx.stroke();

  // Draw labels (Time on X, Amplitude on Y)
  graphCtx.fillStyle = styles.labelColor;
  graphCtx.font = styles.labelSize + " Arial";
  graphCtx.textAlign = "center";
  graphCtx.fillText("Time", width / 2, height - 5);

  graphCtx.save();
  graphCtx.translate(18, centerY);
  graphCtx.rotate(-Math.PI / 2);
  graphCtx.textAlign = 'center';
  graphCtx.fillText("Amplitude", 0, 0);
  graphCtx.restore();

  return centerY;
}

function drawRealTimeGraph() {
  if (!analyser || !graphCtx) return;

  // Ensure canvas size is correct for DPR
  updateCanvasSize();
  const rect = graphCanvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const styles = getGraphStyles();

  function draw() {
    if (!analyser || !mediaRecorder || mediaRecorder.state !== "recording") return;

    // Read time-domain waveform
    analyser.getByteTimeDomainData(dataArray);

    // Clear canvas and background
    graphCtx.fillStyle = styles.graphBg;
    graphCtx.fillRect(0, 0, width, height);

    // Draw axes and get centerY for waveform
    const centerY = drawAxes(width, height);

    // Draw title
    graphCtx.fillStyle = styles.titleColor;
    graphCtx.font = styles.titleSize + " Arial";
    graphCtx.textAlign = "center";
    graphCtx.fillText("Real-time Voice Waveform (Recording)", width / 2, 15);

    // Draw waveform
    graphCtx.lineWidth = 2;
    graphCtx.strokeStyle = "rgba(255, 215, 0, 0.9)";
    graphCtx.beginPath();

    const sliceWidth = (width - 70) / dataArray.length;
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128.0;
      const x = 50 + i * sliceWidth;
      const y = centerY + v * (height - 80) / 2;
      if (i === 0) graphCtx.moveTo(x, y); else graphCtx.lineTo(x, y);
    }
    graphCtx.stroke();

    // Fill under curve
    graphCtx.fillStyle = styles.fillColor;
    graphCtx.lineTo(50 + (dataArray.length - 1) * sliceWidth, centerY + (height - 80) / 2);
    graphCtx.lineTo(50, centerY + (height - 80) / 2);
    graphCtx.closePath();
    graphCtx.fill();

    // Continue animation if still recording
    if (mediaRecorder && mediaRecorder.state === "recording") {
      animationId = requestAnimationFrame(draw);
    }
  }

  animationId = requestAnimationFrame(draw);
}

function drawPhotoacousticGraphFromRecording(result) {
  if (!graphCtx) return;

  // Ensure canvas pixel sizing is up to date
  updateCanvasSize();
  const rect = graphCanvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const styles = getGraphStyles();

  // Clear canvas and draw background
  graphCtx.fillStyle = styles.graphBg;
  graphCtx.fillRect(0, 0, width, height);

  // Draw axes and get centerY for waveform
  const centerY = drawAxes(width, height);

  // Draw title
  graphCtx.fillStyle = styles.titleColor;
  graphCtx.font = styles.titleSize + " Arial";
  graphCtx.textAlign = "center";
  graphCtx.fillText("Photoacoustic Simulated Waveform", width / 2, 15);

  // Draw a simulated time-domain waveform (sum of harmonics) as a sine-like graph
  const dataPoints = 1024;
  const sliceWidth = (width - 70) / dataPoints;

  graphCtx.lineWidth = 2;
  graphCtx.strokeStyle = styles.accentColor || 'rgba(255, 215, 0, 0.9)';
  graphCtx.beginPath();

  const baseFreq = 2.5; // visual cycles across the canvas
  for (let i = 0; i < dataPoints; i++) {
    const t = i / dataPoints;
    // Create a complex waveform by summing a few harmonics
    let v = Math.sin(2 * Math.PI * baseFreq * t) * 0.8;
    v += Math.sin(2 * Math.PI * baseFreq * 2 * t + 0.5) * 0.4;
    v += Math.sin(2 * Math.PI * baseFreq * 3 * t + 1.2) * 0.25;
    v += (Math.random() - 0.5) * 0.05; // light noise

    const x = 50 + i * sliceWidth;
    const y = centerY + v * (height - 80) / 2;
    if (i === 0) graphCtx.moveTo(x, y); else graphCtx.lineTo(x, y);
  }
  graphCtx.stroke();

  // Fill under curve
  graphCtx.fillStyle = styles.fillColor;
  graphCtx.lineTo(50 + (dataPoints - 1) * sliceWidth, centerY + (height - 80) / 2);
  graphCtx.lineTo(50, centerY + (height - 80) / 2);
  graphCtx.closePath();
  graphCtx.fill();
}
