import * as T from 'three';
import {Sky} from 'three/addons/objects/Sky.js';
import {hexToRgb} from './lighting.js';

// three's Sky only knows one blue gradient. This keeps its scattering model and adds what a time-of-day sky needs:
// a haze band towards the horizon (shared with the fog colour), a soft glow around the sun, and a proper sun disc
// in plain colour instead of the stock disc, which would be multiplied by the blue tint.
export const SKY_SHADER_VERSION='sky-gradient-v2';

export function patchSkyFragment(source){
 const declarations='uniform vec3 skyTint;uniform vec3 horizonColor;uniform vec2 hazeParams;uniform vec3 glowColor;uniform vec2 glowParams;uniform vec3 discColor;\nvarying vec3 vWorldPosition;';
 const composite=`vec3 skyCol=retColor*skyTint;
			float haze=clamp(pow(1.0-clamp(direction.y,0.0,1.0),hazeParams.y)*hazeParams.x,0.0,1.0);
			skyCol=mix(skyCol,horizonColor,haze);
			float sunCos=max(dot(direction,vSunDirection),0.0);
			skyCol+=glowColor*(glowParams.x*pow(sunCos,5.0)+glowParams.y*pow(sunCos,90.0));
			skyCol+=discColor*smoothstep(0.999955,0.999975,sunCos);
			gl_FragColor = vec4( skyCol, 1.0 );`;
 return source
  .replace('varying vec3 vWorldPosition;',declarations)
  .replace('L0 += ( vSunE * 19000.0 * Fex ) * sundisk;','')
  .replace('gl_FragColor = vec4( retColor, 1.0 );',composite);
}

export function createSky(){
 const sky=new Sky();
 sky.scale.setScalar(200000);sky.renderOrder=-1000;
 const u=sky.material.uniforms;
 u.skyTint={value:new T.Vector3(1,1,1)};
 u.horizonColor={value:new T.Vector3(.7,.8,.9)};
 u.hazeParams={value:new T.Vector2(.9,3.4)};
 u.glowColor={value:new T.Vector3()};u.glowParams={value:new T.Vector2()};
 u.discColor={value:new T.Vector3()};
 sky.material.fragmentShader=patchSkyFragment(sky.material.fragmentShader);
 sky.material.customProgramCacheKey=()=>SKY_SHADER_VERSION;
 sky.material.needsUpdate=true;
 return sky;
}

// `horizon` is the pre-tone-mapping colour (see lighting.js). `discScale` lets the reflection probe use a gentler sun.
export function applySkyPreset(sky,preset,horizon,sunDirection,{discScale=1,tintMix=1}={}){
 const u=sky.material.uniforms,s=preset.sky;
 u.turbidity.value=s.turbidity;u.rayleigh.value=s.rayleigh;u.mieCoefficient.value=s.mie;u.mieDirectionalG.value=s.mieG;
 u.skyTint.value.set(...s.tint.map(c=>1+(c-1)*tintMix));
 u.horizonColor.value.set(...horizon);
 u.hazeParams.value.set(s.haze,s.hazePower);
 u.glowColor.value.set(...hexToRgb(s.glow).map(c=>c*c));
 u.glowParams.value.set(s.glowWide,s.glowTight);
 u.discColor.value.set(...hexToRgb(s.disc).map(c=>c*c*s.discPower*discScale));
 u.sunPosition.value.copy(sunDirection);
}
