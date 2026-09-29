// wire plate: shared GLSL for the puppet shots (shade with a costume override, strings, haze).
export const GLSL_WIRE_SHADE = /* glsl */ `
// shade a hit like stageShade, with an optional costume albedo override (suits, blazers)
vec3 wShade(vec3 p, vec3 n, vec3 rd, float m, vec4 costume, StageLight key, StageLight fill, StageLight rim) {
  float rough; vec3 emit;
  vec4 mat = castMaterial(m, p, rough, emit);
  vec3 alb = mat.rgb; float metal = mat.a;
  if (costume.a > 0.0) { alb = mix(alb, costume.rgb, costume.a); metal *= 1.0 - costume.a; rough = mix(rough, 0.6, costume.a); }
  float ao = castAO(p, n);
  vec3 c = cs_light(key, p, n, rd, alb, metal, rough, true);
  c += cs_light(fill, p, n, rd, alb, metal, rough, false) * ao;
  c += cs_light(rim, p, n, rd, alb, metal, rough, false) * 0.8;
  vec3 r = reflect(rd, n);
  vec3 env = mix(C_INK * 0.6, C_LILAC * 0.25, smoothstep(-0.2, 0.8, r.y));
  c += env * mix(0.12, 0.8, metal) * ao * mix(alb, vec3(1.0), metal);
  return c + emit;
}
// a check pattern (the loud blazer)
vec3 checkCloth(vec3 q, vec3 a, vec3 b) {
  vec2 g = floor(q.xy * 18.0 + vec2(q.z * 18.0, 0.0));
  float k = mod(g.x + g.y, 2.0);
  vec2 f = abs(fract(q.xy * 18.0) - 0.5);
  float line = step(0.44, max(f.x, f.y));
  return mix(mix(a, b, k), C_BONE * 0.8, line * 0.5);
}
// haze in a spotlight cone along the view ray
float coneHaze(vec3 ro, vec3 rd, float tEnd, StageLight L, int N) {
  float acc = 0.0;
  for (int i = 0; i < 24; i++) {
    if (i >= N) break;
    float s = (float(i) + 0.5) / float(N) * tEnd;
    vec3 q = ro + rd * s; vec3 ld = normalize(q - L.pos);
    acc += smoothstep(L.cone, mix(L.cone, 1.0, 0.3), dot(ld, normalize(L.dir)));
  }
  return acc / float(N);
}
`;
