import { BackSide, Color, ShaderMaterial, Vector2 } from "three";

/**
 * Inverted-hull contour for cel-shaded line art.
 *
 * Renders the mesh's back faces pushed outward along their normals in
 * *screen space*, so the line is a constant pixel width at any zoom —
 * what an artist tracing silhouettes wants. Skinning chunks are included,
 * so it follows the skeleton once the mannequin is posed.
 */
export class OutlineMaterial extends ShaderMaterial {
  constructor() {
    super({
      side: BackSide,
      uniforms: {
        color: { value: new Color("#0d0d0f") },
        /** Line width in drawing-buffer pixels (CSS px × devicePixelRatio). */
        width: { value: 2.5 },
        resolution: { value: new Vector2(1, 1) },
        /** View-space metres the shell sits behind the body. */
        depthPush: { value: 0.012 },
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <skinning_pars_vertex>
        uniform float width;
        uniform vec2 resolution;
        uniform float depthPush;

        void main() {
          #include <beginnormal_vertex>
          #include <skinbase_vertex>
          #include <skinnormal_vertex>
          #include <begin_vertex>
          #include <skinning_vertex>

          // Nudge the shell away from the camera so shallow grooves (navel,
          // collarbone) don't leak line fragments through the surface.
          // Real overlaps, like an arm across the chest, are far deeper.
          vec4 mvPos = modelViewMatrix * vec4(transformed, 1.0);
          mvPos.xyz += normalize(mvPos.xyz) * depthPush;
          vec4 clipPos = projectionMatrix * mvPos;
          vec3 viewNormal = normalize(normalMatrix * objectNormal);
          vec2 dir = (projectionMatrix * vec4(viewNormal, 0.0)).xy;
          float len = length(dir);
          dir = len > 1e-6 ? dir / len : vec2(0.0);

          // Offset in NDC (x2 because NDC spans 2 units), scaled by w so the
          // perspective divide leaves it at a fixed pixel width.
          clipPos.xy += dir * width * 2.0 / resolution * clipPos.w;
          gl_Position = clipPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        void main() {
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
  }
}
