// VisionPlay Computer Vision Module (cv.js)

const cvState = {
  videoElement: null,
  overlayCanvas: null,
  overlayCtx: null,
  handsDetector: null,
  cameraInstance: null,
  
  // Hand tracking state
  handDetected: false,
  pointerX: 0, // 0 to 1 scale
  pointerY: 0,
  isPinching: false,
  pinchThreshold: 0.065, // Normalized distance
  
  // Color tracking state
  dominantColor: { r: 0, g: 0, b: 0 },
  dominantColorName: "None",
  
  // Callbacks
  onFrameProcessed: null,
  
  // Mouse fallback
  mouseFallbackActive: true,
  isCamActive: false
};

// Initialize HTML elements
document.addEventListener("DOMContentLoaded", () => {
  cvState.videoElement = document.getElementById("webcam-video");
  cvState.overlayCanvas = document.getElementById("overlay-canvas");
  cvState.overlayCtx = cvState.overlayCanvas.getContext("2d");
  
  // Handle resize of overlay canvas
  resizeOverlay();
  window.addEventListener("resize", resizeOverlay);
});

function resizeOverlay() {
  if (cvState.overlayCanvas && cvState.videoElement) {
    // Keep internal canvas dimensions matching display size
    cvState.overlayCanvas.width = cvState.videoElement.clientWidth || 640;
    cvState.overlayCanvas.height = cvState.videoElement.clientHeight || 480;
  }
}

// Toggle Camera and CV pipeline
async function toggleCamera() {
  const statusBadge = document.getElementById("cv-status");
  const loadingOverlay = document.getElementById("camera-loading");
  const toggleBtn = document.getElementById("btn-toggle-cam");
  
  if (cvState.isCamActive) {
    stopCamera();
    toggleBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      Initialize Camera
    `;
    statusBadge.className = "status-badge";
    statusBadge.innerHTML = `<span class="status-dot"></span>Camera Off`;
    cvState.mouseFallbackActive = true;
    return;
  }
  
  loadingOverlay.style.display = "flex";
  
  try {
    // Request webcam access
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user"
      },
      audio: false
    });
    
    cvState.videoElement.srcObject = stream;
    cvState.isCamActive = true;
    cvState.mouseFallbackActive = false; // Disable fallback when camera is live
    
    // Initialize MediaPipe Hands
    await initMediaPipe();
    
    // Start tracking loop
    cvState.cameraInstance = new window.Camera(cvState.videoElement, {
      onFrame: async () => {
        if (cvState.isCamActive) {
          await cvState.handsDetector.send({ image: cvState.videoElement });
          processColorTracker();
          if (cvState.onFrameProcessed) cvState.onFrameProcessed();
        }
      },
      width: 640,
      height: 480
    });
    
    await cvState.cameraInstance.start();
    
    statusBadge.className = "status-badge connected";
    statusBadge.innerHTML = `<span class="status-dot"></span>Camera Active`;
    toggleBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 3.86a6 6 0 0 1 8.64 8.64l-8.64 8.64a6 6 0 0 1-8.64-8.64l8.64-8.64z"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="20" y1="16" x2="16" y2="20"/></svg>
      Stop Camera
    `;
    const snapBtn = document.getElementById("btn-webcam-snapshot");
    if (snapBtn) snapBtn.disabled = false;
  } catch (err) {
    console.error("Camera or MediaPipe initialization failed: ", err);
    alert("Could not access camera or start MediaPipe. Activating Mouse/Touch Simulation fallback! Move your mouse on the boards to play.");
    cvState.mouseFallbackActive = true;
    statusBadge.className = "status-badge";
    statusBadge.innerHTML = `<span class="status-dot"></span>Simulation Mode`;
    const snapBtn = document.getElementById("btn-webcam-snapshot");
    if (snapBtn) snapBtn.disabled = true;
  } finally {
    loadingOverlay.style.display = "none";
  }
}

function stopCamera() {
  if (cvState.isCamActive) {
    if (cvState.cameraInstance) {
      cvState.cameraInstance.stop();
    }
    const stream = cvState.videoElement.srcObject;
    if (stream) {
      const tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
    }
    cvState.videoElement.srcObject = null;
    cvState.isCamActive = false;
    cvState.handDetected = false;
    cvState.overlayCtx.clearRect(0, 0, cvState.overlayCanvas.width, cvState.overlayCanvas.height);
    const snapBtn = document.getElementById("btn-webcam-snapshot");
    if (snapBtn) snapBtn.disabled = true;
  }
}

// MediaPipe Hands setup
async function initMediaPipe() {
  if (cvState.handsDetector) return;
  
  cvState.handsDetector = new window.Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });
  
  cvState.handsDetector.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.65,
    minTrackingConfidence: 0.65
  });
  
  cvState.handsDetector.onResults(onHandResults);
}

// MediaPipe results handler
function onHandResults(results) {
  const ctx = cvState.overlayCtx;
  const width = cvState.overlayCanvas.width;
  const height = cvState.overlayCanvas.height;
  
  // Clear overlay
  ctx.clearRect(0, 0, width, height);
  
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    cvState.handDetected = false;
    document.getElementById("calibration-warning").style.display = "block";
    return;
  }
  
  document.getElementById("calibration-warning").style.display = "none";
  cvState.handDetected = true;
  
  const landmarks = results.multiHandLandmarks[0];
  
  // Extract key points
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  
  // Smoothly interpolate pointer coordinate (average position of index and thumb tips)
  const targetX = (thumbTip.x + indexTip.x) / 2;
  const targetY = (thumbTip.y + indexTip.y) / 2;
  
  // Smooth interpolation filter
  cvState.pointerX = cvState.pointerX * 0.4 + targetX * 0.6;
  cvState.pointerY = cvState.pointerY * 0.4 + targetY * 0.6;
  
  // Calculate pinch distance in 3D normalized coordinates
  const pinchDist = Math.hypot(
    thumbTip.x - indexTip.x,
    thumbTip.y - indexTip.y,
    thumbTip.z - indexTip.z
  );
  
  cvState.isPinching = (pinchDist < cvState.pinchThreshold);
  
  // Draw hand visuals
  drawHandVisuals(ctx, landmarks, width, height);
}

// Draw hand landmarks, connections, and pinch indicator
function drawHandVisuals(ctx, landmarks, w, h) {
  // Mirroring handled in CSS via transform: scaleX(-1) on canvas/video
  
  // Draw connections
  ctx.strokeStyle = "rgba(139, 92, 246, 0.4)";
  ctx.lineWidth = 3;
  
  // Simple finger skeleton lines
  const fingers = [
    [0, 1, 2, 3, 4],       // Thumb
    [0, 5, 6, 7, 8],       // Index
    [9, 10, 11, 12],       // Middle
    [13, 14, 15, 16],      // Ring
    [0, 17, 18, 19, 20],   // Pinky
    [5, 9, 13, 17]         // Knuckles
  ];
  
  fingers.forEach(line => {
    ctx.beginPath();
    for (let i = 0; i < line.length; i++) {
      const pt = landmarks[line[i]];
      if (i === 0) ctx.moveTo(pt.x * w, pt.y * h);
      else ctx.lineTo(pt.x * w, pt.y * h);
    }
    ctx.stroke();
  });
  
  // Draw keypoints
  landmarks.forEach((pt, index) => {
    // Only draw essential tip keypoints to keep UI tidy and premium
    if ([4, 8, 12, 16, 20].includes(index)) {
      ctx.beginPath();
      ctx.arc(pt.x * w, pt.y * h, 6, 0, 2 * Math.PI);
      ctx.fillStyle = index === 8 || index === 4 ? "#ec4899" : "#8b5cf6";
      ctx.fill();
    }
  });
  
  // Draw visual pinch helper
  const pX = cvState.pointerX * w;
  const pY = cvState.pointerY * h;
  
  ctx.beginPath();
  ctx.arc(pX, pY, cvState.isPinching ? 18 : 25, 0, 2 * Math.PI);
  ctx.strokeStyle = cvState.isPinching ? "#10b981" : "#06b6d4";
  ctx.lineWidth = cvState.isPinching ? 4 : 2;
  ctx.shadowColor = cvState.isPinching ? "#10b981" : "#06b6d4";
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0; // reset
  
  // Pinch label
  if (cvState.isPinching) {
    ctx.fillStyle = "#10b981";
    ctx.font = "bold 12px Space Grotesk";
    ctx.fillText("GRABBED", pX + 24, pY + 4);
  }
}

// Color tracker analysis inside the center reticle
function processColorTracker() {
  if (!cvState.isCamActive || activeMode !== 'chroma') return;
  
  const w = cvState.overlayCanvas.width;
  const h = cvState.overlayCanvas.height;
  const ctx = cvState.overlayCtx;
  
  // Reticle params
  const size = 60;
  const rx = w / 2 - size / 2;
  const ry = h / 2 - size / 2;
  
  // Draw reticle overlay
  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = 2;
  ctx.strokeRect(rx, ry, size, size);
  
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 4, 0, 2 * Math.PI);
  ctx.fillStyle = "#fff";
  ctx.fill();
  
  // Sample pixels from video feed. Note: video feed matches video width/height
  const vidW = cvState.videoElement.videoWidth;
  const vidH = cvState.videoElement.videoHeight;
  if (!vidW || !vidH) return;
  
  // Calculate relative reticle position on actual video buffer
  const sampleSize = 20;
  const sampleX = (vidW / 2) - (sampleSize / 2);
  const sampleY = (vidH / 2) - (sampleSize / 2);
  
  // Create offscreen canvas for sampling
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = sampleSize;
  sampleCanvas.height = sampleSize;
  const sampleCtx = sampleCanvas.getContext("2d");
  
  // Draw sampled section
  sampleCtx.drawImage(
    cvState.videoElement,
    sampleX, sampleY, sampleSize, sampleSize,
    0, 0, sampleSize, sampleSize
  );
  
  const imgData = sampleCtx.getImageData(0, 0, sampleSize, sampleSize);
  const data = imgData.data;
  
  let totalR = 0, totalG = 0, totalB = 0;
  let count = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    totalR += data[i];
    totalG += data[i+1];
    totalB += data[i+2];
    count++;
  }
  
  const r = Math.round(totalR / count);
  const g = Math.round(totalG / count);
  const b = Math.round(totalB / count);
  
  cvState.dominantColor = { r, g, b };
}
