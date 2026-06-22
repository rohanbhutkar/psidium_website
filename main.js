const canvas = document.getElementById('bg');
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
if(!gl){
  console.error('WebGL2 not available — falling back to 2D canvas');
}

let pixelWidth = 0;
let pixelHeight = 0;
function resize(){
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(innerWidth * dpr));
  const height = Math.max(1, Math.floor(innerHeight * dpr));
  if(width === pixelWidth && height === pixelHeight) return;
  pixelWidth = width;
  pixelHeight = height;
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  if(gl) gl.viewport(0, 0, width, height);
}
window.addEventListener('resize', resize);
resize();

const vert = `#version 300 es
precision highp float;
layout(location=0) in vec2 position;
out vec2 v_uv;
void main(){
  v_uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const frag = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform vec2 u_resolution;
uniform float u_time;

float hash(vec2 p){
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.5);
  return fract(p.x * p.y);
}

float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i + vec2(0.0, 0.0));
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p){
  float value = 0.0;
  float amplitude = 0.6;
  for(int i = 0; i < 5; i++){
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

vec2 curl(vec2 p){
  float e = 0.001;
  float n1 = fbm(p + vec2(0.0, e));
  float n2 = fbm(p - vec2(0.0, e));
  float n3 = fbm(p + vec2(e, 0.0));
  float n4 = fbm(p - vec2(e, 0.0));
  return normalize(vec2(n1 - n2, n4 - n3));
}

void main(){
  vec2 uv = (v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
  float t = u_time * 0.04;

  vec2 flow1 = curl(uv * 1.8 + vec2(t * 0.18, -t * 0.12));
  vec2 flow2 = curl(uv * 2.4 + vec2(-t * 0.16, t * 0.22));
  vec2 pos = uv + flow1 * 0.27 + flow2 * 0.18;

  float s1 = fbm(pos * 1.8 + vec2(t * 0.09, -t * 0.05));
  float s2 = fbm(pos * 3.1 + vec2(-t * 0.11, t * 0.07));
  float s3 = fbm(pos * 5.5 + vec2(t * 0.04, t * 0.12));

  float veins = smoothstep(0.52, 0.62, abs(s2 - s1) * 1.5);
  float cloud = smoothstep(0.18, 0.52, s1 * 0.9 + s2 * 0.5 + s3 * 0.25);
  float pulse = smoothstep(0.16, 0.4, length(pos + vec2(s3 * 0.2, s2 * 0.15)));

  vec3 base = vec3(0.0706, 0.0235, 0.0392);
  vec3 accentA = vec3(0.3059, 0.1019, 0.0706); // #4E1B12
  vec3 accentB = vec3(0.5961, 0.1490, 0.0980); // #982619
  vec3 accentC = vec3(0.8431, 0.7765, 0.7333); // #D7C6BB

  vec3 color = base;
  color += accentA * cloud * 0.72;
  color += accentB * veins * 0.32;
  color += accentC * pulse * 0.22;

  float deep = smoothstep(0.0, 0.5, s1 * 0.58 + s3 * 0.42);
  color *= mix(0.86, 1.0, deep);

  float vignette = smoothstep(0.7, 0.35, length(v_uv - 0.5));
  color *= mix(0.88, 1.0, 1.0 - vignette);

  color = pow(color, vec3(0.92));
  color = clamp(color, 0.0, 1.0);

  outColor = vec4(color, 1.0);
}`;

function createProgram(gl, vsSource, fsSource){
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vsSource);
  gl.compileShader(vs);
  if(!gl.getShaderParameter(vs, gl.COMPILE_STATUS)){
    console.error('Vertex shader error', gl.getShaderInfoLog(vs));
  }
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, fsSource);
  gl.compileShader(fs);
  if(!gl.getShaderParameter(fs, gl.COMPILE_STATUS)){
    console.error('Fragment shader error', gl.getShaderInfoLog(fs));
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog, gl.LINK_STATUS)){
    console.error('Program link error', gl.getProgramInfoLog(prog));
  }
  return prog;
}

const program = gl ? createProgram(gl, vert, frag) : null;
const start = performance.now();

if(gl && program){
  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  const quad = new Float32Array([-1, -1,  1, -1,  -1, 1,  -1, 1,  1, -1,  1, 1]);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const u_resolution = gl.getUniformLocation(program, 'u_resolution');
  const u_time = gl.getUniformLocation(program, 'u_time');

  function render(){
    resize();
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.uniform2f(u_resolution, pixelWidth, pixelHeight);
    gl.uniform1f(u_time, (performance.now() - start) * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
} else {
  const ctx = canvas.getContext('2d');
  const lines = [];
  for(let i = 0; i < 28; i++){
    lines.push({
      x: Math.random(),
      y: Math.random(),
      phase: Math.random() * Math.PI * 2,
      width: 0.006 + Math.random() * 0.02,
      speed: 0.0007 + Math.random() * 0.0013
    });
  }

  function fallbackRender(){
    resize();
    const t = (performance.now() - start) * 0.00025;
    const w = canvas.width;
    const h = canvas.height;

    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, '#12060a');
    gradient.addColorStop(0.35, '#3f1014');
    gradient.addColorStop(1, '#5f1f24');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#F7F0E4';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for(const line of lines){
      const offsetX = Math.sin(t * 0.78 + line.phase) * 0.07;
      const offsetY = Math.cos(t * 0.64 + line.phase) * 0.06;
      const x0 = w * (line.x + offsetX * 0.25);
      const y0 = h * (line.y + offsetY * 0.18);
      const x1 = w * (line.x + 0.14 + offsetX * 0.19);
      const y1 = h * (line.y + 0.28 + offsetY * 0.14);
      ctx.lineWidth = line.width * w;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(x0 + 0.07*w, y0 + 0.08*h, x1 - 0.08*w, y1 - 0.08*h, x1, y1);
      ctx.stroke();
      line.x += line.speed * Math.cos(line.phase + t * 0.2);
      line.y += line.speed * Math.sin(line.phase + t * 0.2);
      if(line.x < -0.18) line.x = 1.18;
      if(line.x > 1.18) line.x = -0.18;
      if(line.y < -0.18) line.y = 1.18;
      if(line.y > 1.18) line.y = -0.18;
    }

    ctx.globalAlpha = 1.0;
    requestAnimationFrame(fallbackRender);
  }

  requestAnimationFrame(fallbackRender);
}
