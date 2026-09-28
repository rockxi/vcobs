"use client";

import { useEffect, useRef } from "react";

const vertexShader = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

// One static, low-resolution WebGL draw. The material and readable text stay in CSS/HTML.
const fragmentShader = `
precision mediump float;
uniform vec2 resolution;

float band(vec2 p, vec2 center, vec2 radius) {
  vec2 d = (p - center) / radius;
  return exp(-dot(d, d) * 1.7);
}

void main() {
  vec2 p = gl_FragCoord.xy / resolution.xy;
  float aspect = resolution.x / resolution.y;
  p.x *= aspect;
  float fold = sin(p.x * 4.4 + sin(p.y * 5.2) * .42) * .035;
  float blue = band(p + vec2(fold, 0.0), vec2(aspect * .18, .91), vec2(aspect * .52, .25));
  float violet = band(p - vec2(fold, 0.0), vec2(aspect * .88, .44), vec2(aspect * .36, .35));
  float silver = band(p, vec2(aspect * .53, .12), vec2(aspect * .48, .18));
  vec3 color = vec3(.055, .058, .077);
  color += vec3(.065, .085, .135) * blue;
  color += vec3(.065, .054, .105) * violet;
  color += vec3(.034, .041, .055) * silver;
  float vignette = 1.0 - smoothstep(.25, 1.05, length((p - vec2(aspect * .5, .5)) / vec2(aspect, 1.0)));
  color *= .72 + .28 * vignette;
  gl_FragColor = vec4(color, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

export function LiquidGlassBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
    if (!gl) return;
    const vertex = compile(gl, gl.VERTEX_SHADER, vertexShader);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentShader);
    if (!vertex || !fragment) return;
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    if (!program || !buffer) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const resolution = gl.getUniformLocation(program, "resolution");
    let frame = 0;
    const draw = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const scale = Math.min(window.devicePixelRatio || 1, 1) * .65;
      canvas.width = Math.min(1440, Math.max(1, Math.round(parent.clientWidth * scale)));
      canvas.height = Math.min(1440, Math.max(1, Math.round(parent.clientHeight * scale)));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    });
    observer.observe(canvas.parentElement ?? canvas);
    draw();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return <canvas ref={canvasRef} className="liquid-glass-backdrop" aria-hidden="true" />;
}
