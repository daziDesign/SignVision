import { GESTURES } from "../data/gestures";

const byId = Object.fromEntries(GESTURES.map((gesture) => [gesture.id, gesture]));

const tipIds = {
  thumb: 4,
  index: 8,
  middle: 12,
  ring: 16,
  pinky: 20,
};

const pipIds = {
  index: 6,
  middle: 10,
  ring: 14,
  pinky: 18,
};

const mcpIds = {
  index: 5,
  middle: 9,
  ring: 13,
  pinky: 17,
};

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isFingerExtended(landmarks, finger) {
  const tip = landmarks[tipIds[finger]];
  const pip = landmarks[pipIds[finger]];
  const mcp = landmarks[mcpIds[finger]];
  return tip.y < pip.y && pip.y < mcp.y;
}

function isFingerFolded(landmarks, finger) {
  const tip = landmarks[tipIds[finger]];
  const pip = landmarks[pipIds[finger]];
  return tip.y > pip.y;
}

function isThumbUp(landmarks) {
  const thumbTip = landmarks[tipIds.thumb];
  const thumbBase = landmarks[2];
  const wrist = landmarks[0];
  return thumbTip.y < thumbBase.y && thumbTip.y < wrist.y;
}

function palmScale(landmarks) {
  return Math.max(0.05, distance(landmarks[0], landmarks[9]));
}

export function recognizeGesture(landmarks, threshold = 0.75) {
  if (!landmarks || landmarks.length < 21) return null;

  const scale = palmScale(landmarks);
  const thumbIndexDistance = distance(landmarks[tipIds.thumb], landmarks[tipIds.index]) / scale;
  const extended = {
    index: isFingerExtended(landmarks, "index"),
    middle: isFingerExtended(landmarks, "middle"),
    ring: isFingerExtended(landmarks, "ring"),
    pinky: isFingerExtended(landmarks, "pinky"),
  };
  const folded = {
    index: isFingerFolded(landmarks, "index"),
    middle: isFingerFolded(landmarks, "middle"),
    ring: isFingerFolded(landmarks, "ring"),
    pinky: isFingerFolded(landmarks, "pinky"),
  };

  const candidates = [
    {
      id: "mingbai",
      score:
        (thumbIndexDistance < 0.38 ? 0.42 : 0) +
        (extended.middle ? 0.2 : 0) +
        (extended.ring ? 0.18 : 0) +
        (extended.pinky ? 0.16 : 0) +
        0.08,
    },
    {
      id: "mingbai",
      score:
        (isThumbUp(landmarks) ? 0.42 : 0) +
        (folded.index ? 0.16 : 0) +
        (folded.middle ? 0.16 : 0) +
        (folded.ring ? 0.13 : 0) +
        (folded.pinky ? 0.13 : 0),
    },
    {
      id: "shuziyi",
      score:
        (extended.index ? 0.44 : 0) +
        (folded.middle ? 0.18 : 0) +
        (folded.ring ? 0.18 : 0) +
        (folded.pinky ? 0.16 : 0) +
        0.04,
    },
    {
      id: "bangzhu",
      score:
        (folded.index ? 0.25 : 0) +
        (folded.middle ? 0.25 : 0) +
        (folded.ring ? 0.22 : 0) +
        (folded.pinky ? 0.22 : 0) +
        0.06,
    },
    {
      id: "nihao",
      score:
        (extended.index ? 0.22 : 0) +
        (extended.middle ? 0.22 : 0) +
        (extended.ring ? 0.2 : 0) +
        (extended.pinky ? 0.2 : 0) +
        (thumbIndexDistance > 0.75 ? 0.16 : 0),
    },
    {
      id: "tingzhi",
      score:
        (extended.index ? 0.2 : 0) +
        (extended.middle ? 0.2 : 0) +
        (extended.ring ? 0.18 : 0) +
        (extended.pinky ? 0.18 : 0) +
        (landmarks[0].y > landmarks[9].y ? 0.18 : 0) +
        0.06,
    },
  ].sort((a, b) => b.score - a.score);

  const best = candidates[0];
  const confidence = Math.max(0, Math.min(0.99, best.score));
  if (confidence < threshold * 0.78) return null;

  return {
    ...byId[best.id],
    confidence,
    state: confidence >= threshold ? "candidate_found" : "low_confidence",
  };
}

export function recognizeHands(handLandmarks, threshold = 0.75) {
  const hands = Array.isArray(handLandmarks) ? handLandmarks.filter((hand) => hand?.length >= 21) : [];
  if (!hands.length) return null;

  if (hands.length >= 2) {
    return {
      ...byId.bangzhu,
      confidence: Math.max(threshold, 0.9),
      state: "candidate_found",
      handCount: hands.length,
    };
  }

  return recognizeGesture(hands[0], threshold);
}

export function makeStabilityFilter(size = 6) {
  let window = [];
  let lastConfirmedId = null;

  return {
    update(candidate) {
      if (!candidate) {
        window = [];
        return { state: "no_hand", candidate: null, confirmed: null };
      }

      window = [...window, candidate].slice(-size);
      const matches = window.filter((item) => item.id === candidate.id);
      const stable = matches.length >= size;
      const confidence =
        matches.reduce((sum, item) => sum + item.confidence, 0) / Math.max(1, matches.length);

      if (stable) {
        const confirmed = { ...candidate, confidence };
        const isNew = confirmed.id !== lastConfirmedId;
        lastConfirmedId = confirmed.id;
        return { state: "recognized", candidate, confirmed, isNew };
      }

      return { state: candidate.state, candidate, confirmed: null };
    },
    reset() {
      window = [];
      lastConfirmedId = null;
    },
  };
}
