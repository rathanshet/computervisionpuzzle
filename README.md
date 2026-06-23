# 🌌 VisionPlay: Interactive Computer Vision Puzzle Hub

VisionPlay is a premium, web-based computer vision puzzle game hub that brings physical interaction to the browser using real-time webcam gesture processing and color matching algorithms.

Designed with a state-of-the-art cyber-neon glassmorphism UI, VisionPlay runs entirely in the browser with **zero server-side processing dependencies**.

---

## 🎮 Game Modes

### 1. 🖐️ Gesture Jigsaw Puzzle
A sliding/drag-and-drop jigsaw puzzle game where your hand is the controller.
* **Hand Tracking**: Powered by **MediaPipe Hands** via CDN.
* **Pinch Gesture Grab**: Hover your hand over a piece, pinch your **index finger and thumb** together to grab, drag, and release to snap it into place.
* **Sound & Particle FX**: Custom retro audio tones synthesized dynamically via the **Web Audio API** and a canvas particle spark engine on snaps.
* **Custom Game Images**:
  * 📁 **Local Upload**: Drag or pick any image from your local device to play.
  * 📸 **Face Snapshot**: Activate the webcam, take a live snap of your face, crop it to a perfect square, and play immediately (features a camera shutter sound synth and screen flash effect!).
* **Mouse Fallback**: If a camera is not available, the game seamlessly transitions to a mouse click-and-drag simulation so you can play anywhere.

### 2. 🎨 Chroma Match (Color Scavenger Hunt)
A fast-paced scavenger hunt where you find physical objects around your room matching target colors.
* **Webcam Sampling Reticle**: Samples average pixel values from a central reticle on your webcam feed.
* **Weighted HSL Comparison**: Computes color similarity focusing on Hue to account for ambient room lighting and exposure variations.
* **Game Loop**: Solve as many target colors (like *Neon Red*, *Electric Blue*, *Cyber Purple*) as you can under a 60-second timer to score high-score multipliers.

---

## 🚀 Technical Stack & Architecture

* **Frontend Structure**: Semantic HTML5 (incorporating `<dialog>`, `<video>`, and responsive grids).
* **Styling**: Pure Vanilla CSS with a bespoke glassmorphism theme, CSS custom variables, and keyframe animations.
* **Computer Vision**: Mediapipe Hands skeleton model trackers and custom HTML Canvas pixel color extractors.
* **Audio Design**: Synthesized retro sounds using the **Web Audio API** (no external `.mp3`/`.wav` assets to fetch).
* **VFX Engine**: Pure Javascript coordinate-based particle physics system.

---

## 🛠️ Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) installed (for running the lightweight development server).

### Installation
1. Clone the repository:
   ```bash
   git clone <your-repository-url>
   cd vision-play
   ```
2. Install the lightweight development server dependencies:
   ```bash
   npm install
   ```

### Running Locally
1. Start the development server:
   ```bash
   npm run dev
   ```
2. Open your browser and navigate to **http://localhost:8080**.

> [!IMPORTANT]
> **Webcam Permissions**: Web browsers restrict webcam access (`getUserMedia`) to secure contexts. When testing locally, always access the application via `localhost` (or `127.0.0.1`) or serve it over `https://`.

---

## 📂 Project Structure

```text
vision-play/
├── assets/
│   └── puzzle_nebula.png   # Default cosmic nebula puzzle background
├── app.js                 # Jigsaw logic, audio synthesizer, and particle physics
├── cv.js                  # MediaPipe camera streams, gesture filters, and color metrics
├── index.html             # Layout panels and UI components
├── style.css              # Cyber glassmorphism layout and keyframe frames
├── package.json           # Dev scripts and server dependencies
└── README.md              # Project documentation
```

---

## 🔒 Privacy & Safety
All computer vision computations, hand landmarks, and webcam snapshots are processed **entirely locally inside your browser sandbox**. No video frames, face data, or user uploads are ever transmitted over the network or stored on any server.
