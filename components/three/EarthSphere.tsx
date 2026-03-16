"use client";

import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";

interface EarthSphereProps {
  radius?: number;
  showAtmosphere?: boolean;
  rotationSpeed?: number;
  atmosphereIntensity?: number;
}

// Day/Night shader — blends day and night textures based on real-time sun position
const EarthDayNightShader = {
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vWorldNormal;
    void main() {
      vUv = uv;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D dayMap;
    uniform sampler2D nightMap;
    uniform vec3 sunDirection;
    varying vec2 vUv;
    varying vec3 vWorldNormal;
    void main() {
      vec3 day = texture2D(dayMap, vUv).rgb;
      vec3 night = texture2D(nightMap, vUv).rgb;

      float NdotL = dot(vWorldNormal, sunDirection);

      // Smooth terminator — gradual blend over ~15 degrees
      float blend = smoothstep(-0.15, 0.2, NdotL);

      // Day side: diffuse lighting with minimal ambient
      float diffuse = max(0.0, NdotL);
      vec3 dayLit = day * (0.03 + 1.4 * diffuse);

      // Night side: very dark base with bright city lights punching through
      float cityBrightness = dot(night, vec3(0.299, 0.587, 0.114));
      // Boost city light contrast — make dim areas darker, bright areas pop
      float cityMask = smoothstep(0.08, 0.45, cityBrightness);
      vec3 nightLit = night * cityMask * 1.2;

      gl_FragColor = vec4(mix(nightLit, dayLit, blend), 1.0);
    }
  `,
};

// Cloud shader — blends cloud texture with procedural fractal noise for denser coverage
const CloudShader = {
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vWorldNormal;
    void main() {
      vUv = uv;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D cloudMap;
    uniform float time;
    uniform vec3 sunDirection;
    varying vec2 vUv;
    varying vec3 vWorldNormal;

    // Hash-based pseudo-random
    vec2 hash(vec2 p) {
      p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
      return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
    }

    // Simplex-style gradient noise
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(dot(hash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
            dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
        mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
            dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    // Fractal Brownian motion — 6 octaves for detailed cloud shapes
    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      float frequency = 1.0;
      for (int i = 0; i < 6; i++) {
        value += amplitude * noise(p * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
      }
      return value;
    }

    void main() {
      vec4 texCloud = texture2D(cloudMap, vUv);
      float texVal = dot(texCloud.rgb, vec3(0.299, 0.587, 0.114));

      // Fractal noise clouds — two layers drifting at different speeds
      vec2 uv1 = vUv * 8.0 + vec2(time * 0.01, time * 0.005);
      vec2 uv2 = vUv * 14.0 + vec2(-time * 0.007, time * 0.012);
      float fractal1 = fbm(uv1);
      float fractal2 = fbm(uv2) * 0.6;

      // Combine texture clouds with fractal clouds
      float clouds = texVal * 0.7 + (fractal1 + fractal2) * 0.35;
      clouds = smoothstep(0.15, 0.75, clouds);

      // Simple sun-facing brightness
      float NdotL = dot(vWorldNormal, sunDirection);
      float light = smoothstep(-0.1, 0.3, NdotL);
      float brightness = mix(0.12, 1.0, light);

      gl_FragColor = vec4(vec3(brightness), clouds * 0.6);
    }
  `,
};

// Fresnel atmosphere shader — glows at edges like real atmospheric scattering
const AtmosphereShader = {
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    uniform vec3 glowColor;
    uniform float intensity;
    void main() {
      vec3 viewDir = normalize(-vPosition);
      float fresnel = 1.0 - dot(viewDir, vNormal);
      // Steep falloff so glow fades from limb into space, not a solid ring
      fresnel = pow(fresnel, 5.0) * intensity;
      fresnel *= smoothstep(1.0, 0.2, fresnel);
      gl_FragColor = vec4(glowColor, fresnel);
    }
  `,
};

/**
 * Realistic Earth sphere with day/night textures blended
 * based on real-time UTC sun position, plus Fresnel atmosphere glow.
 */
export default function EarthSphere({
  radius = 1,
  showAtmosphere = true,
  rotationSpeed = 0.003,
  atmosphereIntensity = 0.12,
}: EarthSphereProps) {
  const earthRef = useRef<THREE.Mesh>(null);
  const cloudRef = useRef<THREE.Mesh>(null);
  const sunDirRef = useRef(new THREE.Vector3(1, 0.3, 0));

  // Load textures
  const dayMap = useTexture("/textures/earth_daymap.jpg");
  const nightMap = useTexture("/textures/earth_night.jpg");
  const cloudMap = useTexture("/textures/earth_clouds.jpg");

  // Earth day/night material
  const earthMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: EarthDayNightShader.vertexShader,
        fragmentShader: EarthDayNightShader.fragmentShader,
        uniforms: {
          dayMap: { value: dayMap },
          nightMap: { value: nightMap },
          sunDirection: { value: sunDirRef.current },
        },
      }),
    [dayMap, nightMap]
  );

  useFrame((_, delta) => {
    // Slow visual rotation
    if (earthRef.current) {
      earthRef.current.rotation.y += delta * rotationSpeed;
    }
    // Clouds drift slightly faster than the surface
    if (cloudRef.current) {
      cloudRef.current.rotation.y += delta * rotationSpeed * 1.15;
    }
    // Advance cloud fractal noise time
    if (cloudMaterial) {
      cloudMaterial.uniforms.time.value += delta;
    }

    // Compute sun direction from current UTC time
    // Three.js SphereGeometry maps UV u=0.5 (prime meridian) to +X axis.
    // Vertex positions at the equator: x = -cos(phi), z = sin(phi) where phi = u * 2π.
    // So for longitude λ°: phi = (λ + 180) * π / 180, giving x = -cos(phi), z = sin(phi).
    const now = new Date();
    const utcHours =
      now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;

    // Subsolar longitude: at UTC 12:00, sun is at 0° longitude; moves 15°/hr west
    // phi_sun in Three.js coords: phi = (λ_sun + 180) * π/180 = (180 - 15(h-12)) * π/180
    // Simplifies to: x = -cos(h * π/12), z = -sin(h * π/12)
    const hourRad = utcHours * (Math.PI / 12);

    // Sun declination based on day of year (Earth's 23.44° axial tilt)
    const dayOfYear = Math.floor(
      (Date.now() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000
    );
    const declination =
      23.44 *
      Math.sin((2 * Math.PI / 365.25) * (dayOfYear - 81)) *
      (Math.PI / 180);

    // Sun direction in world space (matches Three.js SphereGeometry coordinate system)
    sunDirRef.current
      .set(
        Math.cos(declination) * -Math.cos(hourRad),
        Math.sin(declination),
        Math.cos(declination) * -Math.sin(hourRad)
      )
      .normalize();
  });

  // Cloud material with fractal noise
  const cloudMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: CloudShader.vertexShader,
        fragmentShader: CloudShader.fragmentShader,
        uniforms: {
          cloudMap: { value: cloudMap },
          time: { value: 0 },
          sunDirection: { value: sunDirRef.current },
        },
        transparent: true,
        depthWrite: false,
      }),
    [cloudMap]
  );

  // Atmosphere — single outer Fresnel glow
  const atmosMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: AtmosphereShader.vertexShader,
        fragmentShader: AtmosphereShader.fragmentShader,
        uniforms: {
          glowColor: { value: new THREE.Color("#4a9ae0") },
          intensity: { value: atmosphereIntensity },
        },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [atmosphereIntensity]
  );

  return (
    <group>
      {/* Earth — single mesh with day/night shader */}
      <mesh ref={earthRef} material={earthMaterial}>
        <sphereGeometry args={[radius, 192, 192]} />
      </mesh>

      {/* Cloud layer — texture + fractal noise */}
      <mesh ref={cloudRef} material={cloudMaterial}>
        <sphereGeometry args={[radius * 1.005, 192, 192]} />
      </mesh>

      {/* Fresnel atmosphere glow — single outer layer */}
      {showAtmosphere && (
        <mesh material={atmosMaterial}>
          <sphereGeometry args={[radius * 1.03, 64, 64]} />
        </mesh>
      )}
    </group>
  );
}
