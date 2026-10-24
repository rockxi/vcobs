/** Decorative, bounded WebGL1 renderer. No textures, models or network requests. */
export const chromeRenderPolicy = Object.freeze({ maxPixels: 800_000, maxDpr: 1.5, framesPerSecond: 24 });

// The CPU reference and GLSL use the same filmic coefficients. Preserve dark
// negative fill while mapping HDR studio panels to near-white reflections.
const chromeToneCurve = Object.freeze({ a: 2.51, b: .03, c: 2.43, d: .59, e: .14 });
export function chromeToneMap(value: number) {
  const x = Math.max(0, value);
  const { a, b, c, d, e } = chromeToneCurve;
  return Math.max(0, Math.min(1, (x * (a * x + b)) / (x * (c * x + d) + e)));
}
const pendingContextRelease = new WeakMap<HTMLCanvasElement, ReturnType<typeof setTimeout>>();

export function chromeRenderSize(width: number, height: number, dpr: number) {
  const w = Math.max(1, Number.isFinite(width) ? width : 1);
  const h = Math.max(1, Number.isFinite(height) ? height : 1);
  const ratio = Math.min(chromeRenderPolicy.maxDpr, Math.max(1, Number.isFinite(dpr) ? dpr : 1), Math.sqrt(chromeRenderPolicy.maxPixels / (w * h)));
  return { width: Math.max(1, Math.floor(w * ratio)), height: Math.max(1, Math.floor(h * ratio)) };
}

type Vec3 = [number, number, number];
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Vec3): Vec3 => { const n = Math.hypot(...a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };

function centre(t: number): Vec3 {
  const radius = 1.02 + .29 * Math.cos(3 * t);
  return [radius * Math.cos(2 * t), radius * Math.sin(2 * t), .38 * Math.sin(3 * t)];
}

function surface(t: number, v: number): Vec3 {
  const c = centre(t);
  const tangent = normalize(subtract(centre(t + .001), centre(t - .001)));
  const radial = normalize(cross(tangent, [0, 0, 1]));
  const binormal = normalize(cross(tangent, radial));
  const twist = v + .6 * Math.sin(t * 3);
  const radius = .19 + .065 * Math.cos(3 * t + .8) + .025 * Math.sin(7 * t);
  return c.map((value, i) => value + radius * (radial[i] * Math.cos(twist) + binormal[i] * Math.sin(twist) * .7)) as Vec3;
}

/** Closed, smoothly normalled deformed torus-knot mesh, below WebGL1 Uint16 limits. */
export function createChromeGeometry(segments = 192, sides = 24) {
  if (!Number.isInteger(segments) || !Number.isInteger(sides) || segments < 8 || sides < 3 || (segments + 1) * (sides + 1) > 65535) throw new RangeError("Invalid chrome mesh resolution");
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (let u = 0; u <= segments; u++) for (let v = 0; v <= sides; v++) {
    const t = u / segments * Math.PI * 2, angle = v / sides * Math.PI * 2;
    positions.push(...surface(t, angle));
    const dt = subtract(surface(t + .001, angle), surface(t - .001, angle));
    const dv = subtract(surface(t, angle + .001), surface(t, angle - .001));
    normals.push(...normalize(cross(dv, dt)));
    if (u < segments && v < sides) {
      const a = u * (sides + 1) + v, b = a + sides + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

export const chromeVertexShader = `
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform float uAspect;
uniform float uTime;
uniform float uScale;
uniform vec2 uPointer;
uniform vec3 uPlacement;
varying vec3 vNormal;
varying vec3 vPosition;
mat3 rotateY(float a) { float s=sin(a),c=cos(a); return mat3(c,0.,-s,0.,1.,0.,s,0.,c); }
mat3 rotateZ(float a) { float s=sin(a),c=cos(a); return mat3(c,s,0.,-s,c,0.,0.,0.,1.); }
void main() {
  mat3 rotation = rotateZ(uPlacement.z + .045*sin(uTime*.25)) * rotateY(.48 + uPointer.x*.14 + sin(uTime*.18)*.09);
  vec3 p = rotation * aPosition;
  p.xy *= uScale;
  p.xy += vec2(uPlacement.x*uAspect,uPlacement.y);
  vPosition = p;
  vNormal = rotation * aNormal;
  gl_Position = vec4(p.x/uAspect,p.y,-p.z*.15,1.);
}`;

export const chromeFragmentShader = `
precision highp float;
uniform vec2 uPointer;
varying vec3 vNormal;
varying vec3 vPosition;
float strip(float x,float centre,float width) { return 1.-smoothstep(width,width+.035,abs(x-centre)); }
void main() {
  vec3 n=normalize(vNormal);
  if(!gl_FrontFacing) n=-n;
  vec3 view=normalize(vec3(-vPosition.xy*.14,4.));
  vec3 r=reflect(-view,n);
  float longitude=atan(r.z,r.x);
  float studio=strip(longitude,-.72+uPointer.y*.06,.25);
  float rim=strip(longitude,1.25,.035);
  float overhead=smoothstep(.25,.68,r.y)*(1.-smoothstep(.78,.98,r.y));
  float blackBand=1.-smoothstep(.10,.16,abs(r.y+.07));
  vec3 environment=vec3(.004,.008,.016);
  environment+=vec3(.19,.25,.35)*smoothstep(-.7,.5,r.y);
  environment+=vec3(3.2,3.5,3.9)*studio;
  environment+=vec3(4.5,4.6,4.8)*rim;
  environment+=vec3(1.8,2.0,2.3)*overhead;
  environment=mix(environment,vec3(.002,.004,.008),blackBand*.995);
  float blue=pow(max(0.,dot(r,normalize(vec3(-1.,-.15,.7)))),10.);
  environment+=vec3(.015,.07,.20)*blue;
  float fresnel=pow(1.-max(dot(n,view),0.),4.);
  vec3 linear=environment*(1.15+.10*fresnel)+vec3(.002,.004,.008)*fresnel;
  vec3 metal=clamp((linear*(${chromeToneCurve.a.toFixed(2)}*linear+${chromeToneCurve.b.toFixed(2)}))/(linear*(${chromeToneCurve.c.toFixed(2)}*linear+${chromeToneCurve.d.toFixed(2)})+${chromeToneCurve.e.toFixed(2)}),0.,1.);
  metal=pow(metal,vec3(1./2.2));
  gl_FragColor=vec4(metal,1.);
}`;

export function createChromeRenderer(canvas: HTMLCanvasElement, onReady: (ready: boolean) => void) {
  const pending = pendingContextRelease.get(canvas);
  if (pending !== undefined) { clearTimeout(pending); pendingContextRelease.delete(canvas); }
  let gl: WebGLRenderingContext | null;
  try { gl = canvas.getContext("webgl", { alpha: true, antialias: true, depth: true, powerPreference: "low-power", preserveDrawingBuffer: false }); }
  catch { onReady(false); return null; }
  if (!gl) return null;
  let disposed = false, lost = false, frame = 0, lastFrame = -Infinity, time = 0;
  const shaders: WebGLShader[] = [], buffers: WebGLBuffer[] = [];
  let program: WebGLProgram | null = null;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointer = { x: 0, y: 0 };
  function release() {
    for (const buffer of buffers) gl!.deleteBuffer(buffer);
    if (program) gl!.deleteProgram(program);
    for (const shader of shaders) gl!.deleteShader(shader);
  }
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, chromeVertexShader], [gl.FRAGMENT_SHADER, chromeFragmentShader]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Shader allocation failed");
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Chrome shader compilation failed");
    }
    program = gl.createProgram();
    if (!program) throw new Error("Program allocation failed");
    for (const shader of shaders) gl.attachShader(program, shader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Chrome shader link failed");
    gl.useProgram(program);
    const geometry = createChromeGeometry();
    for (const [name, data] of [["aPosition", geometry.positions], ["aNormal", geometry.normals]] as const) {
      const buffer = gl.createBuffer(); if (!buffer) throw new Error("Buffer allocation failed"); buffers.push(buffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, name); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
    }
    const index = gl.createBuffer(); if (!index) throw new Error("Buffer allocation failed"); buffers.push(index);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
    const aspect = gl.getUniformLocation(program, "uAspect"), scale = gl.getUniformLocation(program, "uScale"), clock = gl.getUniformLocation(program, "uTime"), cursor = gl.getUniformLocation(program, "uPointer"), placement = gl.getUniformLocation(program, "uPlacement");
    gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
    function draw() {
      if (disposed || lost || document.hidden) return;
      gl!.viewport(0, 0, canvas.width, canvas.height); gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
      gl!.uniform1f(aspect, canvas.width / canvas.height); gl!.uniform1f(clock, reducedMotion.matches ? 0 : time);
      gl!.uniform1f(scale, Math.min(.68, canvas.width / canvas.height * .6));
      gl!.uniform2f(cursor, reducedMotion.matches ? 0 : pointer.x, reducedMotion.matches ? 0 : pointer.y);
      for (const p of [[1.12, .45, -.43], [-1.2, -.7, 1.6]]) {
        gl!.uniform3f(placement, p[0], p[1], p[2]); gl!.drawElements(gl!.TRIANGLES, geometry.indices.length, gl!.UNSIGNED_SHORT, 0);
      }
    }
    function tick(now: number) {
      frame = 0;
      if (disposed || lost || document.hidden || reducedMotion.matches) return;
      if (now - lastFrame >= 1000 / chromeRenderPolicy.framesPerSecond) {
        // Only advance by rendered time: returning from a hidden tab cannot jump the material.
        time += Math.min((now - lastFrame) / 1000 || 0, .06); lastFrame = now; draw();
      }
      frame = window.requestAnimationFrame(tick);
    }
    function schedule() {
      if (frame) window.cancelAnimationFrame(frame); frame = 0; lastFrame = -Infinity;
      draw();
      if (!disposed && !lost && !document.hidden && !reducedMotion.matches) frame = window.requestAnimationFrame(tick);
    }
    function resize() {
      const size = chromeRenderSize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
      canvas.width = size.width; canvas.height = size.height; schedule();
    }
    function move(event: PointerEvent) { pointer.x = event.clientX / window.innerWidth * 2 - 1; pointer.y = event.clientY / window.innerHeight * 2 - 1; }
    function contextLost(event: Event) { event.preventDefault(); lost = true; if (frame) window.cancelAnimationFrame(frame); frame = 0; onReady(false); }
    // A lost decorative context stays on the CSS fallback until the theme is selected again.
    canvas.addEventListener("webglcontextlost", contextLost);
    window.addEventListener("resize", resize); window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("visibilitychange", schedule); reducedMotion.addEventListener("change", schedule);
    resize(); onReady(true);
    return { dispose() {
      disposed = true; if (frame) window.cancelAnimationFrame(frame);
      canvas.removeEventListener("webglcontextlost", contextLost);
      window.removeEventListener("resize", resize); window.removeEventListener("pointermove", move);
      document.removeEventListener("visibilitychange", schedule); reducedMotion.removeEventListener("change", schedule);
      release();
      // React StrictMode replays effects synchronously on the same canvas. Release
      // buffers immediately, but let a replacement renderer cancel context loss.
      pendingContextRelease.set(canvas, setTimeout(() => {
        pendingContextRelease.delete(canvas); gl!.getExtension("WEBGL_lose_context")?.loseContext();
      }, 0));
    } };
  } catch {
    release(); gl.getExtension("WEBGL_lose_context")?.loseContext(); onReady(false); return null;
  }
}
