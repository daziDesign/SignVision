import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Clock3,
  Hand,
  History,
  Library,
  Settings,
  SlidersHorizontal,
  UserRound,
  Video,
  Waves,
  X,
} from "lucide-react";
import RobotScene from "./components/RobotScene";
import { GESTURES, STATUS_COPY } from "./data/gestures";
import signsSprite from "./assets/signs/chinese-signs-sprite.png";
import { makeStabilityFilter, recognizeHands } from "./lib/gestureRecognizer";
import { createHandTracker, drawLandmarks } from "./lib/handTracking";

const navItems = [
  { id: "dashboard", label: "控制台" },
  { id: "history", label: "历史" },
  { id: "dictionary", label: "语料库" },
  { id: "settings", label: "设置" },
];

const defaultSettings = {
  cameraEnabled: true,
  mirrored: true,
  showLandmarks: true,
  confidenceThreshold: 0.75,
  stableFrames: 6,
  demoMode: false,
  performanceMode: true,
};

function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function getStatusMessage(state, currentGesture) {
  if (state === "recognized" && currentGesture) {
    return { title: currentGesture.label, subtitle: currentGesture.meaning };
  }
  if (state === "candidate_found" && currentGesture) {
    return { title: "即将确认", subtitle: `请保持“${currentGesture.label}”手势` };
  }
  if (state === "low_confidence" && currentGesture) {
    return { title: "请重试", subtitle: `“${currentGesture.label}”还不够稳定` };
  }
  return STATUS_COPY[state] ?? STATUS_COPY.idle;
}

function signalText(state) {
  if (state === "recognized") return "识别成功";
  if (state === "candidate_found") return "请保持...";
  if (state === "no_hand") return "未检测到手部";
  if (state === "camera_blocked") return "摄像头权限受限";
  if (state === "error") return "检测模块不可用";
  if (state === "idle") return "准备就绪";
  return "正在识别手语...";
}

function getRecognitionKey(gesture) {
  return gesture?.recognitionId ?? gesture?.id ?? null;
}

function getPracticeResult({ systemState, currentGesture, practiceTarget }) {
  if (!practiceTarget?.supported) {
    return { tone: "pending", label: "暂不可用", detail: "当前语料未接入识别规则。" };
  }
  if (systemState === "recognized" && currentGesture) {
    const matched = getRecognitionKey(currentGesture) === practiceTarget.recognitionId;
    return matched
      ? { tone: "success", label: "成功", detail: "识别匹配，3 秒后进入下一个。" }
      : { tone: "mismatch", label: "不匹配", detail: `检测到“${currentGesture.label}”，请跟随当前语料。` };
  }
  if (systemState === "candidate_found") {
    return { tone: "active", label: "识别中", detail: "保持当前动作，等待确认。" };
  }
  if (systemState === "low_confidence") {
    return { tone: "warning", label: "低置信度", detail: "动作还不够稳定，请放慢并保持。" };
  }
  if (systemState === "no_hand") {
    return { tone: "waiting", label: "等待动作", detail: "把手放入识别框，跟着右侧语料练习。" };
  }
  return { tone: "waiting", label: "准备练习", detail: "跟随当前语料做动作，成功后自动切换。" };
}

function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("signvision-settings");
      return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });
  const [systemState, setSystemState] = useState("idle");
  const [currentGesture, setCurrentGesture] = useState(null);
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem("signvision-history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [trackerReady, setTrackerReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [practiceIndex, setPracticeIndex] = useState(0);

  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const streamRef = useRef(null);
  const trackerRef = useRef(null);
  const filterRef = useRef(makeStabilityFilter(defaultSettings.stableFrames));
  const frameRef = useRef(null);
  const lastDetectRef = useRef(0);
  const practiceTimerRef = useRef(null);
  const pendingPracticeAdvanceRef = useRef(null);

  const screen = useMemo(
    () => getStatusMessage(systemState, currentGesture),
    [systemState, currentGesture],
  );
  const practiceItems = useMemo(() => GESTURES.filter((gesture) => gesture.supported), []);
  const practiceTarget = practiceItems[practiceIndex] ?? practiceItems[0] ?? GESTURES[0];
  const practiceResult = useMemo(
    () => getPracticeResult({ systemState, currentGesture, practiceTarget }),
    [systemState, currentGesture, practiceTarget],
  );

  const goToPractice = useCallback((offset) => {
    window.clearTimeout(practiceTimerRef.current);
    pendingPracticeAdvanceRef.current = null;
    setPracticeIndex((current) => (current + offset + practiceItems.length) % practiceItems.length);
    setSystemState((state) => (state === "recognized" ? "detecting" : state));
    setCurrentGesture(null);
  }, [practiceItems.length]);

  useEffect(() => {
    localStorage.setItem("signvision-settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem("signvision-history", JSON.stringify(history.slice(0, 30)));
  }, [history]);

  useEffect(() => {
    filterRef.current = makeStabilityFilter(settings.stableFrames);
  }, [settings.stableFrames]);

  useEffect(() => {
    const matched =
      practiceTarget.supported &&
      systemState === "recognized" &&
      getRecognitionKey(currentGesture) === practiceTarget.recognitionId;

    if (!matched || pendingPracticeAdvanceRef.current === practiceTarget.id) return;

    pendingPracticeAdvanceRef.current = practiceTarget.id;
    window.clearTimeout(practiceTimerRef.current);
    practiceTimerRef.current = window.setTimeout(() => {
      pendingPracticeAdvanceRef.current = null;
      goToPractice(1);
    }, 3000);
  }, [currentGesture, goToPractice, practiceTarget, systemState]);

  useEffect(() => () => window.clearTimeout(practiceTimerRef.current), []);

  const addHistory = useCallback((gesture, source = "camera") => {
    const entry = {
      id: `${Date.now()}-${gesture.id}`,
      time: formatTime(),
      label: gesture.label,
      meaning: gesture.meaning,
      confidence: Math.round((gesture.confidence ?? 0.94) * 100),
      source,
    };
    setHistory((items) => [entry, ...items].slice(0, 30));
  }, []);

  const stopCamera = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const runDetection = useCallback(() => {
    const video = videoRef.current;
    const tracker = trackerRef.current;
    if (!video || !tracker || video.readyState < 2 || settings.demoMode || !settings.cameraEnabled) {
      frameRef.current = requestAnimationFrame(runDetection);
      return;
    }

    const now = performance.now();
    const interval = settings.performanceMode ? 85 : 40;
    if (now - lastDetectRef.current < interval) {
      frameRef.current = requestAnimationFrame(runDetection);
      return;
    }

    lastDetectRef.current = now;
    try {
      const result = tracker.detectForVideo(video, now);
      const handLandmarks = result.landmarks ?? [];
      if (settings.showLandmarks) {
        drawLandmarks(overlayRef.current, video, handLandmarks, settings.mirrored);
      } else {
        drawLandmarks(overlayRef.current, video, null, settings.mirrored);
      }

      if (!handLandmarks.length) {
        const filtered = filterRef.current.update(null);
        setSystemState(filtered.state);
        setCurrentGesture(null);
      } else {
        const candidate = recognizeHands(handLandmarks, settings.confidenceThreshold);
        const filtered = filterRef.current.update(candidate);
        setSystemState(filtered.state);
        setCurrentGesture(filtered.confirmed ?? filtered.candidate);
        if (filtered.confirmed && filtered.isNew) addHistory(filtered.confirmed, "camera");
      }
    } catch (error) {
      setSystemState("error");
      setCameraError(error.message);
    }

    frameRef.current = requestAnimationFrame(runDetection);
  }, [addHistory, settings]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      stopCamera();
      filterRef.current.reset();
      setCurrentGesture(null);
      setCameraError("");

      if (settings.demoMode || !settings.cameraEnabled) {
        setSystemState("idle");
        drawLandmarks(overlayRef.current, videoRef.current, null, settings.mirrored);
        return;
      }

      setSystemState("camera_permission_pending");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setSystemState("camera_ready");

        if (!trackerRef.current) {
          trackerRef.current = await createHandTracker();
          setTrackerReady(true);
        }

        frameRef.current = requestAnimationFrame(runDetection);
      } catch (error) {
        setSystemState(error.name === "NotAllowedError" ? "camera_blocked" : "error");
        setCameraError(error.message || "Camera is unavailable.");
      }
    }

    start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [
    settings.cameraEnabled,
    settings.demoMode,
    settings.mirrored,
    settings.performanceMode,
    stopCamera,
    runDetection,
  ]);

  function updateSetting(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function removeHistory(id) {
    setHistory((items) => items.filter((entry) => entry.id !== id));
  }

  function clearHistory() {
    setHistory([]);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setActivePage("dashboard")} type="button">
          <span className="brand-mark">
            <Hand size={27} strokeWidth={2.5} />
          </span>
          <span>SignVision</span>
        </button>
        <nav className="nav">
          {navItems.map((item) => (
            <button
              className={activePage === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setActivePage(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button className="profile-button" type="button" aria-label="Profile">
          <UserRound size={24} />
        </button>
      </header>

      <main>
        {activePage === "dashboard" && (
          <Dashboard
            cameraError={cameraError}
            currentGesture={currentGesture}
            screen={screen}
            settings={settings}
            signal={signalText(systemState)}
            systemState={systemState}
            practiceIndex={practiceIndex}
            practiceResult={practiceResult}
            practiceTarget={practiceTarget}
            practiceTotal={practiceItems.length}
            trackerReady={trackerReady}
            goToPractice={goToPractice}
            updateSetting={updateSetting}
            videoRef={videoRef}
            overlayRef={overlayRef}
          />
        )}
        {activePage === "history" && (
          <HistoryPage history={history} clearHistory={clearHistory} removeHistory={removeHistory} />
        )}
        {activePage === "dictionary" && <DictionaryPage />}
        {activePage === "settings" && (
          <SettingsPage settings={settings} updateSetting={updateSetting} cameraError={cameraError} />
        )}
      </main>
    </div>
  );
}

function Dashboard({
  cameraError,
  currentGesture,
  screen,
  settings,
  signal,
  systemState,
  practiceIndex,
  practiceResult,
  practiceTarget,
  practiceTotal,
  trackerReady,
  goToPractice,
  updateSetting,
  videoRef,
  overlayRef,
}) {
  const connected =
    systemState !== "camera_blocked" &&
    systemState !== "error" &&
    (settings.demoMode || settings.cameraEnabled);

  return (
    <section className="dashboard">
      <aside className="camera-card">
        <div className="section-title">
          <Camera size={22} />
          <span>摄像头识别</span>
        </div>

        <div className="camera-window">
          <video
            ref={videoRef}
            muted
            playsInline
            className={settings.mirrored ? "mirrored" : ""}
          />
          <canvas ref={overlayRef} className="landmark-layer" />
          {settings.demoMode && (
            <div className="camera-placeholder">
              <Video size={34} />
              <span>演示模式</span>
            </div>
          )}
          {!settings.demoMode && !settings.cameraEnabled && (
            <div className="camera-placeholder">
              <Video size={34} />
              <span>摄像头已关闭</span>
            </div>
          )}
          <span className="corner corner-tl" />
          <span className="corner corner-tr" />
          <span className="corner corner-bl" />
          <span className="corner corner-br" />
        </div>

        <div className="recognition-status">
          <span className={`status-dot ${systemState}`} />
          <div>
            <strong>{signal}</strong>
            <small>{currentGesture ? `置信度 ${Math.round(currentGesture.confidence * 100)}%` : "等待稳定手势"}</small>
          </div>
          <Waves size={24} className="wave-icon" />
        </div>

        {cameraError && <p className="error-note">{cameraError}</p>}

        <div className="quick-toggles">
          <Toggle
            label="关键点"
            checked={settings.showLandmarks}
            onChange={(value) => updateSetting("showLandmarks", value)}
          />
          <Toggle
            label="演示"
            checked={settings.demoMode}
            onChange={(value) => updateSetting("demoMode", value)}
          />
        </div>
      </aside>

      <section className="hero-stage">
        <div className="robot-wrap">
          <RobotScene screen={screen} systemState={systemState} />
        </div>
        <div className={`device-pill ${connected ? "online" : "offline"}`}>
          <span />
          {connected ? "设备已连接" : screen.subtitle}
        </div>
        <PracticeCard
          practiceIndex={practiceIndex}
          practiceResult={practiceResult}
          practiceTarget={practiceTarget}
          practiceTotal={practiceTotal}
          goToPractice={goToPractice}
        />
        <div className="tracker-pill">
          <CheckCircle2 size={16} />
          {trackerReady ? "MediaPipe 已就绪" : "MediaPipe 加载中"}
        </div>
      </section>
    </section>
  );
}

function HistoryPage({ history, clearHistory, removeHistory }) {
  return (
    <section className="content-panel">
      <div className="panel-heading">
        <div>
          <p>识别记录</p>
          <h1>历史</h1>
        </div>
        <button className="ghost-button" onClick={clearHistory} type="button">
          清空全部
        </button>
      </div>
      <div className="history-list">
        {history.length === 0 ? (
          <div className="empty-state">
            <History size={32} />
            <p>暂无识别记录。打开控制台跟练，成功识别后会写入这里。</p>
          </div>
        ) : (
          history.map((entry) => (
            <article className="history-row" key={entry.id}>
              <Clock3 size={18} />
              <div>
                <strong>{entry.label}</strong>
                <span>{entry.meaning}</span>
              </div>
              <small>{entry.confidence}%</small>
              <small>{entry.source === "camera" ? "摄像头" : "演示"}</small>
              <time>{entry.time}</time>
              <button aria-label={`Remove ${entry.label}`} onClick={() => removeHistory(entry.id)} type="button">
                <X size={16} />
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function DictionaryPage() {
  return (
    <section className="content-panel">
      <div className="panel-heading">
        <div>
          <p>中文手语语料库</p>
          <h1>语料库</h1>
        </div>
        <Library size={28} />
      </div>
      <div className="dictionary-grid">
        {GESTURES.map((gesture) => (
          <article className="gesture-card" key={gesture.id}>
            <div>
              <div
                className="sign-illustration"
                style={{
                  backgroundImage: `url(${signsSprite})`,
                  backgroundPosition: gesture.imagePosition,
                }}
                role="img"
                aria-label={`${gesture.label} 手语示意图`}
              />
              <span className="gesture-badge">可识别跟练</span>
              <span className="gesture-category">{gesture.category}</span>
              <h2>{gesture.label}</h2>
              <p>{gesture.meaning}</p>
            </div>
            <small>{gesture.practiceHint}</small>
          </article>
        ))}
      </div>
      <p className="dictionary-note">
        注：当前仅展示已接入原型识别并有对应示意图的可演示语料；这些仍是原型规则，不等同于正式标准中国手语教材动作。后续如接入标准素材，再逐条扩展语料库。
      </p>
    </section>
  );
}

function PracticeCard({ practiceIndex, practiceResult, practiceTarget, practiceTotal, goToPractice }) {
  return (
    <aside className={`practice-card ${practiceResult.tone}`}>
      <div className="practice-card-top">
        <span>当前语料</span>
        <strong>
          {practiceIndex + 1} / {practiceTotal}
        </strong>
      </div>
      <div
        className="practice-illustration"
        style={{
          backgroundImage: `url(${signsSprite})`,
          backgroundPosition: practiceTarget.imagePosition,
        }}
        role="img"
        aria-label={`${practiceTarget.label} 手语示意图`}
      />
      <div className="practice-copy">
        <span className="gesture-category">{practiceTarget.category}</span>
        <h2>{practiceTarget.label}</h2>
      </div>
      {practiceResult.tone === "success" && (
        <div className="practice-status">
          <span>{practiceResult.label}</span>
        </div>
      )}
      <div className="practice-actions">
        <button type="button" onClick={() => goToPractice(-1)}>
          上一个
        </button>
        <button type="button" onClick={() => goToPractice(1)}>
          下一个
        </button>
      </div>
    </aside>
  );
}

function SettingsPage({ settings, updateSetting, cameraError }) {
  return (
    <section className="content-panel settings-panel">
      <div className="panel-heading">
        <div>
          <p>原型控制</p>
          <h1>设置</h1>
        </div>
        <Settings size={28} />
      </div>

      <div className="settings-grid">
        <SettingBlock icon={<Camera size={22} />} title="摄像头">
          <Toggle
            label="启用摄像头"
            checked={settings.cameraEnabled}
            onChange={(value) => updateSetting("cameraEnabled", value)}
          />
          <Toggle
            label="镜像预览"
            checked={settings.mirrored}
            onChange={(value) => updateSetting("mirrored", value)}
          />
          <Toggle
            label="演示模式"
            checked={settings.demoMode}
            onChange={(value) => updateSetting("demoMode", value)}
          />
        </SettingBlock>

        <SettingBlock icon={<SlidersHorizontal size={22} />} title="识别">
          <label className="range-row">
            <span>置信度阈值</span>
            <strong>{Math.round(settings.confidenceThreshold * 100)}%</strong>
            <input
              type="range"
              min="0.55"
              max="0.95"
              step="0.01"
              value={settings.confidenceThreshold}
              onChange={(event) => updateSetting("confidenceThreshold", Number(event.target.value))}
            />
          </label>
          <label className="range-row">
            <span>稳定帧数</span>
            <strong>{settings.stableFrames}</strong>
            <input
              type="range"
              min="3"
              max="12"
              step="1"
              value={settings.stableFrames}
              onChange={(event) => updateSetting("stableFrames", Number(event.target.value))}
            />
          </label>
          <Toggle
            label="性能模式"
            checked={settings.performanceMode}
            onChange={(value) => updateSetting("performanceMode", value)}
          />
        </SettingBlock>

        <SettingBlock icon={<Hand size={22} />} title="显示">
          <Toggle
            label="显示关键点"
            checked={settings.showLandmarks}
            onChange={(value) => updateSetting("showLandmarks", value)}
          />
          <p className="setting-note">
            当前版本使用 MediaPipe 双手关键点与几何规则识别，最多同时检测两只手。
            数据采集与训练分类器保留为后续扩展。
          </p>
          {cameraError && <p className="error-note">{cameraError}</p>}
        </SettingBlock>
      </div>
    </section>
  );
}

function SettingBlock({ icon, title, children }) {
  return (
    <article className="setting-block">
      <div className="setting-block-title">
        {icon}
        <h2>{title}</h2>
      </div>
      {children}
    </article>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <button
        className={`toggle ${checked ? "on" : ""}`}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </label>
  );
}

export default App;
