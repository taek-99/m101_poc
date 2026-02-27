// lib/face/pose.ts
import * as THREE from "three";
import type { PoseAngles, PoseStatus } from "@/lib/face/types";

function radToDeg(r: number) {
  return (r * 180) / Math.PI;
}

export function getHeadPoseFromMatrix(
  matrixData: ArrayLike<number>,
  yawSign = 1
): PoseAngles {
  const m = new THREE.Matrix4().fromArray(Array.from(matrixData));
  const e = new THREE.Euler().setFromRotationMatrix(m);

  return {
    pitch: radToDeg(e.x),
    yaw: radToDeg(e.y) * yawSign,
    roll: radToDeg(e.z),
  };
}

export function classifyPose(p: PoseAngles): PoseStatus {
  const { yaw, pitch, roll } = p;

  const FRONT =
    Math.abs(yaw) < 12 && Math.abs(pitch) < 12 && Math.abs(roll) < 15;
  if (FRONT) return "front";

  const SIDE_OK = Math.abs(pitch) < 20 && Math.abs(roll) < 25;

  if (SIDE_OK && yaw > 30 && yaw < 95) return "right";
  if (SIDE_OK && yaw < -30 && yaw > -95) return "left";

  return "none";
}