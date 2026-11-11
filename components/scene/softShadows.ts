import { ShaderChunk } from "three";

/**
 * Clean shadows for the stage lights. Patches three's shadow shader code
 * once, before anything compiles.
 *
 * On a smooth, curvy body three's defaults go wrong in two ways:
 *  - Light skimming a surface (Split from the side, Top from above) makes
 *    jagged stripes: one shadow-map texel spans a lot of depth there.
 *  - Wide soft shadows built from a few scattered samples look grainy or
 *    blotchy, because neighbouring pixels land on different samples.
 *
 * What this does instead:
 *  1. Slope-scaled depth bias (vertex shader): each point is tested a
 *     little closer to the light, more where the light skims it, so skin
 *     never shadows itself. Paired with recording the light-facing side of
 *     the body (Mannequin), so a real blocker is a whole limb away. It moves
 *     points straight toward the light, never sideways, so outlines stay
 *     exact. `shadow.normalBias` carries its base amount in metres.
 *  2. A dense, regular filter (fragment shader): a 5×5 grid of hardware-
 *     filtered taps exactly one texel apart. That's a true smooth blur, with
 *     no randomness to show up as grain or patches. Softness comes from the
 *     shadow map's resolution instead (StageLights): a soft light renders a
 *     coarser map, which this filter blurs across more of the body.
 *  3. A per-tap slope allowance: a neighbour only counts as blocking if it
 *     is clearly closer to the light than the receiver's own curved surface
 *     could be.
 *
 * If a three upgrade changes the code this looks for, three's own version
 * stays in place (with a warning in development).
 */

/** The shadow camera every stage light uses (see StageLights): ±3 m wide, 7 m deep. */
export const SHADOW_HALF_SIZE = 3;
export const SHADOW_DEPTH = 7;

/** Steepest own-surface rise (tan) that never counts as a blocker. */
const SELF_SLOPE = 1.2;
const WIDTH = SHADOW_HALF_SIZE * 2;
const f = (n: number) => n.toFixed(6);

/* ---------------------------------------------- 1. vertex: slope-scaled bias */

const VERTEX_OFFSET =
  /shadowWorldPosition = worldPosition \+ vec4\( shadowWorldNormal \* directionalLightShadows\[ i \]\.shadowNormalBias, 0 \);\s*vDirectionalShadowCoord\[ i \] = directionalShadowMatrix\[ i \] \* shadowWorldPosition;/;
const VERTEX_SCALED = `shadowWorldPosition = worldPosition;
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
			{
				// The light's axis, from the shadow matrix (sign irrelevant: only |cos| is used).
				vec3 lightAxis = normalize( vec3( directionalShadowMatrix[ i ][ 0 ][ 2 ], directionalShadowMatrix[ i ][ 1 ][ 2 ], directionalShadowMatrix[ i ][ 2 ][ 2 ] ) );
				float cosL = abs( dot( shadowWorldNormal, lightAxis ) );
				float tanL = sqrt( max( 1.0 - cosL * cosL, 0.0 ) ) / max( cosL, 0.15 );
				float lift = directionalLightShadows[ i ].shadowNormalBias * ( 0.5 + tanL ) / ${f(SHADOW_DEPTH)} * vDirectionalShadowCoord[ i ].w;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					vDirectionalShadowCoord[ i ].z += lift;
				#else
					vDirectionalShadowCoord[ i ].z -= lift;
				#endif
			}`;

/* ------------------------------------------ 2–3. fragment: smooth 5×5 filter */

const FIVE_TAP = /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \)[\s\S]*?\) \* 0\.2;/;

const FILTER = `
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float towardLight = 1.0;
				#else
					float towardLight = - 1.0;
				#endif
				// Depth units per uv unit of the self-slope allowance.
				float slope = ${f((SELF_SLOPE * WIDTH) / SHADOW_DEPTH)};
				shadow = 0.0;
				for ( int x = - 2; x <= 2; x ++ ) {
					for ( int y = - 2; y <= 2; y ++ ) {
						vec2 offset = vec2( float( x ), float( y ) ) * texelSize;
						float allowance = slope * ( length( offset ) + texelSize.x );
						shadow += texture( shadowMap, vec3( shadowCoord.xy + offset, shadowCoord.z + towardLight * allowance ) );
					}
				}
				shadow /= 25.0;`;

/* ------------------------------------------------------------------ apply */

const vertex = ShaderChunk.shadowmap_vertex;
const fragment = ShaderChunk.shadowmap_pars_fragment;
if (VERTEX_OFFSET.test(vertex) && FIVE_TAP.test(fragment)) {
  ShaderChunk.shadowmap_vertex = vertex.replace(VERTEX_OFFSET, VERTEX_SCALED);
  ShaderChunk.shadowmap_pars_fragment = fragment.replace(FIVE_TAP, FILTER);
} else if (process.env.NODE_ENV === "development") {
  console.warn("[softShadows] three's shadow shaders changed; using its default filter.");
}

/**
 * Shadow-map size for a light's softness: crisp = fine map (≈3 mm texels),
 * soft = coarse map (≈1.5 cm texels), which the 5×5 filter turns into a
 * wide, smooth edge. Rounded so dragging the slider only reallocates the map
 * at a few steps.
 */
export function shadowMapSize(softness: number, max: number): number {
  const size = 2048 / (1 + 4 * Math.min(1, Math.max(0, softness)));
  return Math.min(max, Math.max(384, Math.round(size / 128) * 128));
}

/** Base of the slope-scaled bias: about one texel of that map, in metres. */
export function shadowBiasFor(mapSize: number): number {
  return WIDTH / mapSize;
}
