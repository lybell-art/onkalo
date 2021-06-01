import {
	BackSide,
	BoxGeometry,
	Mesh,
	ShaderMaterial,
	UniformsUtils,
	Vector3
} from '../libs/three.module.js';


//modified sunShader

class EnvShader extends Mesh {
	constructor() {
		const shader = EnvShader.Shader;
		const material = new ShaderMaterial( {
			fragmentShader: shader.fragmentShader,
			vertexShader: shader.vertexShader,
			uniforms: UniformsUtils.clone( shader.uniforms ),
			side: BackSide,
			depthWrite: false
		} );
		super( new BoxGeometry( 1, 1, 1 ), material );
	}
}

EnvShader.Shader = {
	uniforms: {
		'processAmount' : { value: 0.0 },
		'sunDirection' : {value: new Vector3(0.0,1.0,-1.0)}
	},
	vertexShader:`
		uniform vec3 sunDirection;
		uniform float processAmount;

		varying vec3 vPosition;
		varying vec3 vWorldPosition;
		varying vec3 vSunDirection;
		void main() {
			vPosition = position;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			gl_Position.z = gl_Position.w; // set z to camera.far

			vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
			vWorldPosition = worldPosition.xyz;
			vSunDirection = normalize( sunDirection );
		}
	`,
	fragmentShader:`
		uniform float processAmount;

		varying vec3 vPosition;
		varying vec3 vWorldPosition;
		varying vec3 vSunDirection;

		const vec3 cameraPos = vec3( 0.0, 0.0, 0.0 );
		const vec3 sunColor = vec3(1.0,1.0,1.0);

		vec3 getUpperCol()
		{
			vec3 phase1 = vec3(0.95,1.0,1.0);
			vec3 phase2 = vec3(0.3,0.3,0.3);
			vec3 phase3 = vec3(0.1,0.1,0.12);
			vec3 phase4 = vec3(0.1,0.02,0.01);

			float phaseCnt= smoothstep(0.9, 1.1, processAmount)+
							smoothstep(1.9, 2.1, processAmount)+
							smoothstep(2.9, 3.1, processAmount);

			if(phaseCnt < 1.0) return mix(phase1, phase2, phaseCnt);
			else if(phaseCnt < 2.0) return mix(phase2, phase3, phaseCnt-1.0);
			else return mix(phase3, phase4, phaseCnt-2.0);
		}
		vec3 getLowerCol()
		{
			vec3 phase1 = vec3(0.7,0.95,1.0);
			vec3 phase2 = vec3(0.1,0.1,0.1);
			vec3 phase3 = vec3(0.07,0.05,0.05);
			vec3 phase4 = vec3(0.05,0.2,0.08);

			float phaseCnt= smoothstep(0.9, 1.1, processAmount)+
							smoothstep(1.9, 2.1, processAmount)+
							smoothstep(2.9, 3.1, processAmount);

			if(phaseCnt < 1.0) return mix(phase1, phase2, phaseCnt);
			else if(phaseCnt < 2.0) return mix(phase2, phase3, phaseCnt-1.0);
			else return mix(phase3, phase4, phaseCnt-2.0);
		}
		vec3 sunOverlay(vec3 sky, float sun)
		{
			return (sun > 0.5) ? 1.0 - 2.0*(1.0-sky)*(1.0-sun) : 2.0*sky*sun;
		}

		void main()
		{
			vec3 direction = normalize( vWorldPosition - cameraPos );
			float cosTheta = dot( direction, vSunDirection );

			float height= smoothstep(0.50, 0.60, vPosition.y + 0.5);
			float sunDisk= smoothstep(0.9996,0.99967, cosTheta);
			float sunShine= smoothstep(0.8,1.2, cosTheta);
			float sun=clamp(mix(0.0, 1.0, sunDisk + sunShine), 0.0, 1.0);

			vec3 res=mix(getLowerCol(), getUpperCol(), height);
			vec3 res2=sunOverlay(res, sun) + res;
			gl_FragColor = vec4(res2, 1.0);
			#include <tonemapping_fragment>
			#include <encodings_fragment>
		}
	`
}

let FleshShader = {
	uniforms:{
		'map': { value: null },
		'fakeMap': { value: null },
		'displacementMap': {value:null},
		'normalMap': {value:null},
		'uTime':{value:0.0},
		'transition':{value:0.0}
	},
	vertexShader:`
		varying float mag;
		varying vec2 vUV;
		varying vec3 vWorldPosition;
		varying vec3 vNormal;
		varying vec3 debugger;
		varying float intensity;

		uniform sampler2D displacementMap;
		uniform sampler2D normalMap;
		uniform float uTime;
		uniform float transition;
		float heartBeat(float t)
		{
			float x=t * 2.0;
			return pow(sin(x),7.0) * sin(x+1.5) * 2.0;
//			return sin(x+1.5) * 4.0;
//			return clamp( pow(sin(x),7.0)*sin(x+1.5)*2.0 , -0.45, 1.0);
		}

		void main()
		{
			//normal change
			vec4 normalColor= texture2D(normalMap, uv);
			vec3 normalVector = normalize( normalColor.rgb * 2.0 - 1.0 );
			vec3 up=vec3(0.0,1.0,0.0);
			vec3 T=normalize(cross(up, normal));
			vec3 B=normalize(cross(normal, T));

			mat3 TBN;
			TBN[0]=T;
			TBN[1]=B;
			TBN[2]=normal;
//			TBN = transpose(TBN);

			vec3 warpedNormal = TBN * normalVector;
			vNormal= mix(normal, warpedNormal, transition);


			vUV=uv;

			//displacement
			vec4 disp = texture2D(displacementMap, uv);
			mag = heartBeat(uTime);
			float bumper = disp.r  - 0.7;
			intensity = mag*bumper * 1.2 * transition;
			vec3 newPos = position.xyz + normal * intensity;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( newPos, 1.0 );
			vWorldPosition = (modelMatrix * vec4( position, 1.0 )).xyz;
		}
	`,
	fragmentShader:`
		varying float mag;
		varying vec2 vUV;
		varying vec3 vWorldPosition;
		varying vec3 vNormal;
		
		varying float intensity;
		varying vec3 debugger;


		uniform sampler2D map;
		uniform sampler2D fakeMap;
		uniform float transition;

		void main()
		{
			vec3 lightpos = normalize(vec3(0.9, 1.0, 1.1));
			vec3 texCol = texture2D(map, vUV).xyz;
			vec3 fakeTexCol = texture2D(fakeMap, vUV).xyz;


			float diffuseAmount = dot(lightpos, vNormal);
			diffuseAmount = max(0.0, diffuseAmount);
			float lightAmount = (diffuseAmount - 0.5) * 0.7 + 1.0;

			vec3 resCol = mix(fakeTexCol, texCol, transition) * lightAmount;
			resCol.g *= 1.1;
			resCol.r *= 0.9;

			gl_FragColor = vec4(resCol, 1.0);
		}
	`
}


export { EnvShader, FleshShader };