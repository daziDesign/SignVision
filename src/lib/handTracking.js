import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const wasmBase = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const modelUrl =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export async function createHandTracker() {
  const vision = await FilesetResolver.forVisionTasks(wasmBase);
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: modelUrl,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
  });
}

export function drawLandmarks(canvas, video, hands, mirrored) {
  const ctx = canvas.getContext("2d");
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.clearRect(0, 0, width, height);
  const handList = Array.isArray(hands?.[0]) ? hands : hands?.length ? [hands] : [];
  if (!handList.length || !video?.videoWidth) return;

  const connections = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [0, 5],
    [5, 6],
    [6, 7],
    [7, 8],
    [5, 9],
    [9, 10],
    [10, 11],
    [11, 12],
    [9, 13],
    [13, 14],
    [14, 15],
    [15, 16],
    [13, 17],
    [17, 18],
    [18, 19],
    [19, 20],
    [0, 17],
  ];

  const point = (landmark) => ({
    x: mirrored ? width - landmark.x * width : landmark.x * width,
    y: landmark.y * height,
  });

  const colors = ["rgba(20, 115, 255, 0.72)", "rgba(32, 217, 96, 0.72)"];

  handList.forEach((landmarks, handIndex) => {
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors[handIndex % colors.length];
    connections.forEach(([start, end]) => {
      const a = point(landmarks[start]);
      const b = point(landmarks[end]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });

    landmarks.forEach((landmark, index) => {
      const p = point(landmark);
      ctx.beginPath();
      ctx.arc(p.x, p.y, index === 4 || index === 8 ? 5 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle =
        index === 4 || index === 8
          ? handIndex === 0
            ? "#1473ff"
            : "#20d960"
          : "rgba(255,255,255,0.95)";
      ctx.fill();
    });
  });
}
