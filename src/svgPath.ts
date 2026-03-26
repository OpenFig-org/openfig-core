/**
 * SVG path serialization, transformation, and stroke/cap enum mapping.
 */

import { parseSVGPathData } from "./vector.js";
import type { VectorPathCommand } from "./vector.js";

export function serializeSvgPathData(commands: readonly VectorPathCommand[]): string {
  return commands
    .map((command) => {
      switch (command.type) {
        case "M":
          return `M${command.x} ${command.y}`;
        case "L":
          return `L${command.x} ${command.y}`;
        case "C":
          return `C${command.c1x} ${command.c1y} ${command.c2x} ${command.c2y} ${command.x} ${command.y}`;
        case "Z":
          return "Z";
      }
    })
    .join(" ");
}

export function transformSvgPathData(
  svgPath: string,
  {
    scaleX = 1,
    scaleY = 1,
    translateX = 0,
    translateY = 0,
  }: { scaleX?: number; scaleY?: number; translateX?: number; translateY?: number },
): string {
  const commands = parseSVGPathData(svgPath).map((command) => {
    switch (command.type) {
      case "M":
      case "L":
        return {
          ...command,
          x: command.x * scaleX + translateX,
          y: command.y * scaleY + translateY,
        };
      case "C":
        return {
          ...command,
          c1x: command.c1x * scaleX + translateX,
          c1y: command.c1y * scaleY + translateY,
          c2x: command.c2x * scaleX + translateX,
          c2y: command.c2y * scaleY + translateY,
          x: command.x * scaleX + translateX,
          y: command.y * scaleY + translateY,
        };
      case "Z":
        return command;
    }
  });

  return serializeSvgPathData(commands);
}

export function mapStrokeJoin(value: string | undefined): string {
  switch ((value || "").toLowerCase()) {
    case "round":
      return "ROUND";
    case "bevel":
      return "BEVEL";
    default:
      return "MITER";
  }
}

export function mapStrokeCap(value: string | undefined): string {
  switch ((value || "").toLowerCase()) {
    case "round":
      return "ROUND";
    case "square":
      return "SQUARE";
    default:
      return "NONE";
  }
}
