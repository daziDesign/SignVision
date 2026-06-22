import React, { useEffect, useRef } from "react";
import * as THREE from "three";

function roundedRectShape(width, height, radius) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function makeRoundedBox(width, height, depth, radius, material) {
  const geometry = new THREE.ExtrudeGeometry(roundedRectShape(width, height, radius), {
    depth,
    bevelEnabled: true,
    bevelThickness: radius * 0.25,
    bevelSize: radius * 0.24,
    bevelSegments: 12,
  });
  geometry.center();
  return new THREE.Mesh(geometry, material);
}

function makeCapsulePanel(width, height, depth, radius, material) {
  const mesh = makeRoundedBox(width, height, depth, radius, material);
  mesh.scale.z = 0.95;
  return mesh;
}

function makeScreenTexture(title, subtitle, accent = "#1473ff") {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(512, 230, 80, 512, 250, 620);
  gradient.addColorStop(0, "#071017");
  gradient.addColorStop(0.58, "#02090d");
  gradient.addColorStop(1, "#000000");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 512);

  const shine = ctx.createLinearGradient(0, 0, 1024, 0);
  shine.addColorStop(0, "rgba(255,255,255,0)");
  shine.addColorStop(0.18, "rgba(255,255,255,0.11)");
  shine.addColorStop(0.46, "rgba(255,255,255,0.03)");
  shine.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = shine;
  ctx.fillRect(72, 46, 880, 26);
  ctx.fillStyle = "rgba(255,255,255,0.17)";
  ctx.fillRect(906, 88, 8, 320);

  ctx.shadowColor = accent;
  ctx.shadowBlur = 42;
  ctx.fillStyle = accent;
  ctx.font = "900 178px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title || "Ready", 512, 224);

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 42px Inter, Arial, sans-serif";
  ctx.fillText(subtitle || "Start camera or use demo mode", 512, 352);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export default function RobotScene({ screen, systemState }) {
  const hostRef = useRef(null);
  const refs = useRef({});

  useEffect(() => {
    const host = hostRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, host.clientWidth / host.clientHeight, 0.1, 100);
    camera.position.set(0, 0.03, 8.6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const shell = new THREE.MeshPhysicalMaterial({
      color: "#fbfcff",
      roughness: 0.18,
      metalness: 0.0,
      clearcoat: 1,
      clearcoatRoughness: 0.18,
      transmission: 0.18,
      thickness: 1.1,
      ior: 1.32,
      transparent: true,
      opacity: 0.92,
    });
    const shellGlow = new THREE.MeshPhysicalMaterial({
      color: "#eef2ff",
      roughness: 0.55,
      metalness: 0,
      transparent: true,
      opacity: 0.32,
      clearcoat: 0.55,
    });
    const side = new THREE.MeshPhysicalMaterial({
      color: "#53565a",
      roughness: 0.34,
      metalness: 0.16,
      clearcoat: 0.55,
      clearcoatRoughness: 0.26,
    });
    const glass = new THREE.MeshPhysicalMaterial({
      color: "#02070a",
      roughness: 0.08,
      metalness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
    });

    const bodyGlow = makeRoundedBox(4.98, 3.58, 1.02, 0.84, shellGlow);
    bodyGlow.position.set(0, 0.02, -0.05);
    bodyGlow.castShadow = true;
    group.add(bodyGlow);

    const body = makeRoundedBox(4.78, 3.28, 1.08, 0.78, shell);
    body.castShadow = true;
    group.add(body);

    const screenShadow = makeRoundedBox(3.7, 1.92, 0.18, 0.34, new THREE.MeshBasicMaterial({
      color: "#000000",
      transparent: true,
      opacity: 0.22,
    }));
    screenShadow.position.set(0.04, -0.1, 0.63);
    group.add(screenShadow);

    const screenBase = makeRoundedBox(3.72, 1.94, 0.42, 0.34, glass);
    screenBase.position.set(0, 0.03, 0.72);
    screenBase.castShadow = true;
    group.add(screenBase);

    const screenRim = makeRoundedBox(
      3.92,
      2.1,
      0.12,
      0.38,
      new THREE.MeshPhysicalMaterial({
        color: "#111820",
        roughness: 0.16,
        metalness: 0.12,
        clearcoat: 0.8,
        clearcoatRoughness: 0.08,
      }),
    );
    screenRim.position.set(0, 0.03, 0.59);
    group.add(screenRim);

    const screenTexture = makeScreenTexture(screen.title, screen.subtitle, "#1473ff");
    const screenMaterial = new THREE.MeshBasicMaterial({
      map: screenTexture,
      transparent: true,
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const screenPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.28, 1.48), screenMaterial);
    screenPlane.position.set(0, 0.03, 1.02);
    screenPlane.renderOrder = 3;
    group.add(screenPlane);

    const leftEar = makeCapsulePanel(0.58, 1.25, 0.92, 0.29, side);
    leftEar.position.set(-2.54, -0.04, -0.2);
    leftEar.castShadow = true;
    group.add(leftEar);

    const rightEar = leftEar.clone();
    rightEar.position.x = 2.54;
    group.add(rightEar);

    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.76, 56, 28), shellGlow);
    chin.scale.set(1, 0.52, 1);
    chin.position.set(0, -1.8, -0.28);
    group.add(chin);

    const orbMaterial = new THREE.MeshPhysicalMaterial({
      color: "#f3f5ff",
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.18,
      transmission: 0.08,
    });
    const orbLeft = new THREE.Mesh(new THREE.SphereGeometry(0.42, 48, 28), orbMaterial);
    orbLeft.position.set(-2.63, -1.98, 0.18);
    group.add(orbLeft);
    const orbRight = orbLeft.clone();
    orbRight.position.x = 2.66;
    group.add(orbRight);

    const floorShadow = new THREE.Mesh(
      new THREE.CircleGeometry(3.35, 96),
      new THREE.MeshBasicMaterial({ color: "#9ba4b7", transparent: true, opacity: 0.16 }),
    );
    floorShadow.rotation.x = -Math.PI / 2;
    floorShadow.scale.set(1.35, 0.38, 1);
    floorShadow.position.set(0, -2.73, -0.72);
    scene.add(floorShadow);

    scene.add(new THREE.AmbientLight("#ffffff", 2.25));
    const key = new THREE.DirectionalLight("#ffffff", 3.8);
    key.position.set(2.8, 5.2, 4.6);
    scene.add(key);
    const fill = new THREE.DirectionalLight("#e9edff", 2.1);
    fill.position.set(-3.4, 2.4, 3.8);
    scene.add(fill);
    const rim = new THREE.PointLight("#dfe5ff", 5.5, 7);
    rim.position.set(1.9, 1.7, 1.4);
    group.add(rim);
    const blue = new THREE.PointLight("#1473ff", 4.2, 7);
    blue.position.set(0, 0.04, 2.05);
    group.add(blue);

    refs.current = { renderer, camera, scene, group, screenMaterial, blue, orbLeft, orbRight };

    let frame = 0;
    let animationId;
    const animate = () => {
      frame += 0.016;
      const recognized = systemState === "recognized";
      group.position.y = Math.sin(frame * 1.4) * 0.075 + (recognized ? 0.07 : 0);
      group.rotation.x = Math.sin(frame * 0.9) * 0.025;
      group.rotation.y = Math.sin(frame * 0.7) * 0.035;
      orbLeft.position.y = -1.98 + Math.sin(frame * 1.8) * 0.11;
      orbRight.position.y = -1.98 + Math.sin(frame * 1.8 + 1.6) * 0.11;
      blue.intensity = recognized ? 6 + Math.sin(frame * 8) * 0.8 : 3.8;
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animationId);
      host.removeChild(renderer.domElement);
      screenTexture.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const { screenMaterial } = refs.current;
    if (!screenMaterial) return;
    const accent =
      systemState === "camera_blocked" || systemState === "error"
        ? "#ff5d52"
        : systemState === "low_confidence"
          ? "#7b879c"
          : "#1473ff";
    const texture = makeScreenTexture(screen.title, screen.subtitle, accent);
    const previous = screenMaterial.map;
    screenMaterial.map = texture;
    screenMaterial.needsUpdate = true;
    previous?.dispose();
  }, [screen.title, screen.subtitle, systemState]);

  return <div className="robot-scene" ref={hostRef} aria-label="Three.js robot feedback scene" />;
}
