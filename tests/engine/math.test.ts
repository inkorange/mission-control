import { describe, it, expect } from "vitest";
import {
  add,
  sub,
  scale,
  magnitude,
  normalize,
  dot,
  cross2D,
  rotate,
  degToRad,
  radToDeg,
  clamp,
  lerp,
} from "@/lib/math";

describe("Vector2D operations", () => {
  it("add", () => {
    const result = add({ x: 1, y: 2 }, { x: 3, y: 4 });
    expect(result).toEqual({ x: 4, y: 6 });
  });

  it("sub", () => {
    const result = sub({ x: 5, y: 3 }, { x: 2, y: 1 });
    expect(result).toEqual({ x: 3, y: 2 });
  });

  it("scale", () => {
    const result = scale({ x: 2, y: 3 }, 4);
    expect(result).toEqual({ x: 8, y: 12 });
  });

  it("magnitude", () => {
    expect(magnitude({ x: 3, y: 4 })).toBe(5);
    expect(magnitude({ x: 0, y: 0 })).toBe(0);
  });

  it("normalize", () => {
    const n = normalize({ x: 3, y: 4 });
    expect(n.x).toBeCloseTo(0.6, 5);
    expect(n.y).toBeCloseTo(0.8, 5);
    expect(magnitude(n)).toBeCloseTo(1, 5);
  });

  it("normalize zero vector returns zero", () => {
    const n = normalize({ x: 0, y: 0 });
    expect(n).toEqual({ x: 0, y: 0 });
  });

  it("dot product", () => {
    expect(dot({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(0); // perpendicular
    expect(dot({ x: 2, y: 3 }, { x: 4, y: 5 })).toBe(23);
  });

  it("cross2D", () => {
    // Cross product of x-hat and y-hat should be 1 (z-hat)
    expect(cross2D({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(1);
    expect(cross2D({ x: 0, y: 1 }, { x: 1, y: 0 })).toBe(-1);
  });

  it("rotate 90 degrees", () => {
    const v = { x: 1, y: 0 };
    const rotated = rotate(v, Math.PI / 2);
    expect(rotated.x).toBeCloseTo(0, 5);
    expect(rotated.y).toBeCloseTo(1, 5);
  });
});

describe("utility functions", () => {
  it("degToRad", () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI, 5);
    expect(degToRad(90)).toBeCloseTo(Math.PI / 2, 5);
    expect(degToRad(0)).toBe(0);
  });

  it("radToDeg", () => {
    expect(radToDeg(Math.PI)).toBeCloseTo(180, 5);
    expect(radToDeg(Math.PI / 2)).toBeCloseTo(90, 5);
  });

  it("clamp", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("lerp", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});
