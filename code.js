import * as THREE from '/libs/three.module.js';
import { MTLLoader } from '/libs/plugins/MTLLoader.js';
import { OBJLoader } from '/libs/plugins/OBJLoader.js';
import { EnvShader, FleshShader } from '/js/shaders.js';
import { PointerLockControls } from '/libs/plugins/PointerLockControls.js';

import Stats from '/libs/plugins/stats.module.js';

const stats = new Stats();
document.body.appendChild( stats.dom );
stats.dom.style.display="none";

const scene=new THREE.Scene();
const projectScene=new THREE.Scene();

const mainCamera=new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.2, 2400);
const fakeCamera=new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.2, 2400);
const renderer = new THREE.WebGLRenderer({antialias:true});
const projectionRenderer = new THREE.WebGLRenderTarget(1200,1200);
const pmremGenerator = new THREE.PMREMGenerator( renderer );

const sky=new EnvShader();
let spikes, fakeFloor, monoliths, fleshUniform;
const floorOffset=new THREE.Vector2(0,0);

const raycaster = new THREE.Raycaster();
const easeRotate=new THREE.Vector2(0,0);
const keyStates = {};
const crossHead = document.getElementById( 'crossHead' );
let isMousePressed = false;
let player;
let phase=3.0;
const clock = new THREE.Clock();
const isActive=()=>document.pointerLockElement === document.body;

let soundManager;
let isSoundLoaded=false;

const MONOLITH_IDLE=0;
const MONOLITH_RISE=1;
const MONOLITH_PENDING=2;
const MONOLITH_FALL=3;


function randomDegree()
{
	return Math.random() * Math.PI * 2;
}

function initHall()
{
	const objLoader = new OBJLoader();
	objLoader.load( 'assets/room.obj', function ( object ) {
		object.children[0].material=new THREE.MeshLambertMaterial({
			color: 0xffffff,
			map: projectionRenderer.texture,
			side: THREE.DoubleSide});
		object.scale.set(20,20,20);
		object.rotation.y=Math.PI /8;

		scene.add( object );
	});
}

function initFloor(parent, isMovable=false)
{
	const textureLoader = new THREE.TextureLoader();
	const normalMap = textureLoader.load( "assets/textures/floor_normal.jpg" );
	const texMap = textureLoader.load( "assets/textures/floor_texture.jpg" );
	const displacementMap = textureLoader.load( "assets/textures/floor_displacement.png" );
	const mapList=[normalMap, texMap, displacementMap];
	for(let i=0;i<mapList.length;i++)
	{
		mapList[i].wrapS = mapList[i].wrapT = THREE.RepeatWrapping;
		mapList[i].repeat.set(4,4);
		mapList[i].anisotropy=4;
		if(isMovable) mapList[i].offset = floorOffset;
	}

	const material = new THREE.MeshStandardMaterial( {

		color: 0xffffff,
		roughness: 0.65,

		map: texMap,

		normalMap: normalMap,
		normalScale: new THREE.Vector2( 4, 4 ), // why does the normal map require negation in this case?

		displacementMap: displacementMap, 
		displacementScale: 20,
//		displacementBias: -0.428408, // from original model
		
		side:THREE.DoubleSide
	} );
	const geometry = new THREE.PlaneBufferGeometry( 4096,4096, 256,256);
	let mesh=new THREE.Mesh(geometry, material);
	mesh.rotation.x=-Math.PI/2;
//	mesh.position.x=2048;
	if(isMovable) fakeFloor = mesh;
	parent.add(mesh);  //displacement map 이용시 성능저하가 일어남
}

function floorMove()
{
	fakeFloor.position.x = fakeCamera.position.x;
	fakeFloor.position.z = fakeCamera.position.z;
	let camDir=new THREE.Vector3();
	mainCamera.getWorldDirection( camDir );
	camDir.y=0;
	camDir.normalize();
	camDir.multiplyScalar(0.0008);
	floorOffset.x+=camDir.x;
	floorOffset.y-=camDir.z;
}

function initLights()
{
	const hemiLight = new THREE.HemisphereLight(0xddefff, 0x333333, 3);
	hemiLight.intensity = 0.7;
//	scene.add(hemiLight);
	const light = new THREE.PointLight( 0xddefff, 0, 1500, 2 );
	light.position.set(150,500,300);
	light.power=65;

	scene.add(light);

	const directionalLight = new THREE.DirectionalLight( 0xffffff, 1.5 );
	directionalLight.position.set(0.9,1,1.1);
	scene.add( directionalLight );

	const ambient = new THREE.AmbientLight( 0x444444 ); // soft white light
	scene.add( ambient );
}

function initMonolith1(callback)
{
	new MTLLoader().load( 'assets/monolith1.mtl', function ( materials ) {
		materials.preload();
		const objLoader = new OBJLoader();
		objLoader.setMaterials( materials );
		objLoader.load( 'assets/monolith1.obj', function ( object ) {
				let resObj=object.children[0];
				resObj.castShadow=true;
				resObj.scale.multiplyScalar(79);
				callback(resObj);
			});
	});
}
function initMonolith2(callback)
{
	new MTLLoader().load( 'assets/monolith2.mtl', function ( materials ) {
		materials.preload();
		const objLoader = new OBJLoader();
		objLoader.setMaterials( materials );
		objLoader.load( 'assets/monolith2.obj', function ( object ) {
				let resObj=object.children[0];
				resObj.castShadow=true;
				resObj.scale.multiplyScalar(79);
				callback(resObj);
			});
	});
}
function initMonolith3(callback)
{
	const textureLoader = new THREE.TextureLoader();
	const faketexMap = textureLoader.load( "assets/textures/monolith1-texture.png" );
	const texMap = textureLoader.load( "assets/textures/monolith3-texture.jpg" );
	const displacementMap = textureLoader.load( "assets/textures/monolith3-displacement.jpg" );
	const normalMap = textureLoader.load( "assets/textures/monolith3-normal.jpg" );
	const shader = FleshShader;

	const objLoader = new OBJLoader();
	objLoader.load( 'assets/monolith3.obj', function ( object ) {
		let resObj=object.children[0];
		resObj.castShadow=true;
		resObj.material =  new THREE.ShaderMaterial( {
			fragmentShader: shader.fragmentShader,
			vertexShader: shader.vertexShader,
			uniforms: THREE.UniformsUtils.clone( shader.uniforms )
		} );
		fleshUniform=resObj.material.uniforms;
		resObj.material.uniforms[ 'fakeMap' ].value = faketexMap;
		resObj.material.uniforms[ 'map' ].value = texMap;
		resObj.material.uniforms[ 'displacementMap' ].value = displacementMap;
		resObj.material.uniforms[ 'normalMap' ].value = normalMap;

		resObj.scale.multiplyScalar(79);
		callback(resObj);
	});
}

function getSpikeMaterial()
{
	const textureLoader = new THREE.TextureLoader();
	const texMap = textureLoader.load( "assets/textures/spike_texture.jpg" );
	const bumpMap = textureLoader.load( "assets/textures/spike_bump.jpg" );
	const mapList=[texMap, bumpMap];
	for(let i=0;i<mapList.length;i++)
	{
		mapList[i].wrapS = mapList[i].wrapT = THREE.RepeatWrapping;
		mapList[i].repeat.set(1,4);
//		mapList[i].anisotropy=4;
	}

	return new THREE.MeshStandardMaterial({
		color:0x886547,
		roughness:0.25,
		map:texMap,
		bumpMap: bumpMap,
		bumpScale: 2,
	});
}

class Spike
{
	static geometry=new THREE.ConeBufferGeometry(30,500,32,1);
	static material=getSpikeMaterial();

	constructor(parent, pos, scale=1.0)
	{
		this.pos=pos.clone();
		this.xAngle=(Math.random() * 10 + 10 ) * Math.PI / 180;
		this.yAngle=randomDegree();
		this.mesh=new THREE.Mesh(Spike.geometry, Spike.material);
		this.mesh.position.x=this.pos.x;
		this.mesh.position.z=this.pos.y;
		this.mesh.rotation.z=this.xAngle;
		this.mesh.rotation.y=this.yAngle;
		this.setScale(scale);
		parent.add(this.mesh);
	}
	setScale(mag)
	{
		this.mesh.scale.setScalar(mag);
	}
}

class Spikes
{
	constructor(parent)
	{
		this.meshes=new THREE.Group();
		this.children=[];
		this.age=1;
		for(let i=0;i<30;i++)
		{
			let rad=randomDegree();
			let dist=Math.random() * 600 + 500;
			const pos=new THREE.Vector2(Math.sin(rad), Math.cos(rad));
			pos.multiplyScalar(dist);
			this.children.push(new Spike(this.meshes, pos, 0.0));
		}
		parent.add(this.meshes);
	}
	get length()
	{
		return this.children.length;
	}
	generate(_pos, _dir)
	{
		const far=1500;
		const last=1000;
		let dir=new THREE.Vector2(-_dir.y, _dir.x).normalize();
		if(Math.random() > 0.5) dir.negate();
		let mag=Math.random() * far/2.5 + 100;
		let realDir=_dir.clone().multiplyScalar(far);
		realDir.addScaledVector(dir,mag);
		let pos=_pos.clone().add(realDir);

		this.children.push(new Spike(this.meshes, pos, this.age/last));
	}
	grow()
	{
		const last=1000;
		if(this.age >= last || phase < 0.4) return;

		for(let i=0;i<this.length;i++)
		{
			this.children[i].setScale(this.age/last);
		}
		this.age++;
	}
	removal(_pos, _dir)
	{
		const far=1500;
		const removalFar=Math.sqrt( far*far + (far*far*0.16+10000) ) + 10;
		for(let i=this.length-1; i>=0; i--)
		{
			let spike=this.children[i];
			if(_pos.distanceTo(spike.pos) > removalFar)
			{
				this.meshes.remove( spike.mesh );
				this.children.splice(i,1);
			}
		}
	}
}

class MonolithMarker
{
	static BOTTOM = -400;
	constructor(parent)
	{
		this.markers=[null,null,null];
		this.no=0;
		this.y=MonolithMarker.BOTTOM;
		this.initializedMarker=[false, false, false];
		this.checkedMarker=[false, false, false];
		this.heights=[400,220,420];
		this.status=MONOLITH_IDLE;
		let markerClass=this.markers;
		let _heights=this.heights;
		initMonolith1((e)=>{e.position.y = -_heights[0]; markerClass[0]=e; parent.add(e);});
		initMonolith2((e)=>{e.position.y = -_heights[1]; markerClass[1]=e; parent.add(e);});
		initMonolith3((e,)=>{e.position.y = -_heights[2]; markerClass[2]=e; parent.add(e);});
		this.rise_sfx=null;
		this.fall_sfx=null;
	}
	get isActive()
	{
		return this.status != MONOLITH_IDLE;
	}
	get activatedMonolith()
	{
		let res=[];
		if(this.status == MONOLITH_PENDING) res=[this.markers[this.no]];
		return res;
	}
	initRise(no)
	{
		this.no=no;
		this.status=MONOLITH_RISE;
		this.initializedMarker[no] = true;
		this.y = -this.heights[no];
		this.rise_sfx.play();
		if(no == 2) this.markers[no].children[0].play();
	}
	initFall()
	{
		this.status=MONOLITH_FALL;
		this.fall_sfx.play();
	}
	move(deltaTime)
	{
		if(this.status == MONOLITH_IDLE || this.status == MONOLITH_PENDING) return;
		switch(this.status)
		{
			case MONOLITH_RISE:
				this.y+=deltaTime*40;
				fleshUniform[ 'transition' ].value = 1 - (this.y / -this.heights[2]);
				if(this.y > 0)
				{
					this.y=0;
					this.status=MONOLITH_PENDING;
					fleshUniform[ 'transition' ].value = 1.0;
				}
				break;
			case MONOLITH_FALL:
				this.y-=deltaTime*40;
				if(this.y < -this.heights[this.no]){
					this.y=MonolithMarker.BOTTOM;
					this.status=MONOLITH_IDLE;
					this.checkedMarker[this.no]=true;
				}
				break;
		}
		this.markers[this.no].position.y = this.y;
	}
}

function fleshBeat()
{
	if(fleshUniform === undefined) return;
	fleshUniform[ 'uTime' ].value = performance.now() / 1000;
}


class Player
{
	constructor()
	{
		this.scene=1;
		this.velocity=new THREE.Vector3(0,0,0);
		this.cam=mainCamera;
		this.cam2=fakeCamera;
		this.sfx=null;
	}
	get forwardKey()
	{
		return keyStates['KeyW'] === true || keyStates['ArrowUp'] === true;
	}
	get backwardKey()
	{
		return keyStates['KeyS'] === true || keyStates['ArrowDown'] === true;
	}
	get leftKey()
	{
		return keyStates['KeyA'] === true || keyStates['ArrowLeft'] === true;
	}
	get rightKey()
	{
		return keyStates['KeyD'] === true || keyStates['ArrowRight'] === true;
	}
	get x()
	{
		return this.cam.position.x;
	}
	get y()
	{
		return this.cam.position.y;
	}
	get z()
	{
		return this.cam.position.z;
	}
	get parellelPos()
	{
		let pos= new THREE.Vector2(this.cam2.position.x, this.cam2.position.z);
		return pos;
	}
	get direction()
	{
		let dir=new THREE.Vector3();
		this.cam.getWorldDirection( dir );
		dir.y = 0;
		dir.normalize();
		return dir;
	}
	get direction2D()
	{
		let dir=new THREE.Vector2(this.direction.x, this.direction.z);
		return dir;
	}
	getForwardVector()
	{
		return this.direction;
	}
	getSideVector()
	{
		let sideDir=this.direction.cross(this.cam.up);
		sideDir.y = 0;
		sideDir.normalize();
		return sideDir;
	}
	cameraRotate()
	{
		if(isActive())
		{
			this.cam.rotation.y = this.cam.rotation.y * 0.8 + easeRotate.x * 0.2;
			this.cam.rotation.x = this.cam.rotation.x * 0.8 + easeRotate.y * 0.2;
		}
	}
	isInsideWall(x, y)
	{
		const width = 600;
		const radius = width * (1 + Math.sqrt(2)) / 2;
		const radius2 = radius * Math.sqrt(2);
		const between=(a,min,max)=>(min<=a && a<=max);
		let res=between(x, -radius, radius) && between(y, -radius, radius);
		let res2=between(y-x, -radius2, radius2) && between(x+y, -radius2, radius2);
		return res&&res2;
	}
	movement(deltaTime)
	{
		let speed=10, maxSpeed=20;
		let progress=false, backward=false;
		const decay= Math.exp( - 3 * deltaTime ) - 1;
		this.velocity.addScaledVector(this.velocity, decay);
		if(this.forwardKey){this.velocity.addScaledVector( this.getForwardVector(), speed*deltaTime ); progress=true;}
		if(this.backwardKey){this.velocity.addScaledVector( this.getForwardVector(),-speed*deltaTime );}
		if(this.leftKey){this.velocity.addScaledVector( this.getSideVector(),-speed*deltaTime); progress=true;}
		if(this.rightKey){this.velocity.addScaledVector( this.getSideVector(),speed*deltaTime ); progress=true;}
		this.velocity.clampLength(0,maxSpeed);

		backward = ( this.velocity.dot(this.getForwardVector()) ) < 0;

		if(this.isInsideWall(this.x + this.velocity.x, this.z + this.velocity.z))
		{
			if(this.velocity.length() > 0.1) this.playSFX();
			else this.stopSFX();
			this.cam.position.add(this.velocity);
		}
		else
		{
			if(!progress && backward) 
			{
				this.stopSFX();
				if(phase < 2.9) location.href='good.html';
				else location.href='dead.html';
			}
		}


		let camDir=new THREE.Vector3();
		this.cam.getWorldDirection( camDir );
		camDir.y=0;
		camDir.normalize();
		camDir.multiplyScalar(20*deltaTime);
		this.cam2.position.add(camDir);

		if(progress) increasePhase(deltaTime);
	}
	tp(x,y,z)
	{
		if(x instanceof THREE.Vector3) this.cam.position.copy(x);
		else this.cam.position.set(x,y,z);
	}
	playSFX()
	{
		if(this.sfx == null) return false;
		if(!this.sfx.isPlaying) this.sfx.play();
	}
	stopSFX()
	{
		if(this.sfx == null) return false;
		if(this.sfx.isPlaying) this.sfx.stop();
	}
}

class SoundManager
{
	static loader=new THREE.AudioLoader();
	constructor()
	{
		this.listener=new THREE.AudioListener();
		mainCamera.add(this.listener);
		this.children=[];
		this.playingChildren=[];
		this.isPaused=true;
	}
	loadSound(src, volume=1.0, loop=false, autoplay=false, callback=(e)=>{})
	{
		const sound = new THREE.Audio( this.listener );
		let soundList=this.children;
		SoundManager.loader.load( src, function ( buffer ) {
			sound.setBuffer( buffer );
			sound.setLoop( loop );
			sound.setVolume( volume );
			if(autoplay) sound.play();
			soundList.push(sound);
			callback(sound);
		} );
	}
	playAll()
	{
		if(this.listener == null) return;
		for(let i=0;i<this.playingChildren.length;i++)
		{
			let no=this.playingChildren[i];
			this.children[no].play();
		}
		this.isPaused=false;
	}
	pauseAll()
	{
		if(this.listener == null || this.isPaused) return;
		this.playingChildren=[];
		for(let i=0;i<this.children.length;i++)
		{
			if(this.children[i].isPlaying)
			{
				this.playingChildren.push(i);
				this.children[i].pause();
			}
		}
		this.isPaused=true;
	}
}

function increasePhase(deltaTime)
{
	if(phase > 0.5 && !monoliths.initializedMarker[0]) monoliths.initRise(0);
	else if(phase > 1.8 && !monoliths.initializedMarker[1]) monoliths.initRise(1);
	else if(phase > 3.2 && !monoliths.initializedMarker[2]) monoliths.initRise(2);
	else if(phase > 4.0) location.href='dead.html';
	if(!monoliths.isActive) phase+=deltaTime / 20;
}

function checkingMarker()
{
	if(monoliths.status != MONOLITH_PENDING) return;
	raycaster.setFromCamera( new THREE.Vector2( 0,0 ), mainCamera );
	const intersects = raycaster.intersectObjects( monoliths.activatedMonolith );
	if(intersects.length > 0 && monoliths.no < 2)
	{
		monoliths.initFall();
	}
}

function initSounds()
{
	soundManager.loadSound('assets/sounds/bgm.mp3', 0.2, true, true, );
	soundManager.loadSound('assets/sounds/monolith_rise.mp3', 0.8, false, false, (e)=>{monoliths.rise_sfx=e;});
	soundManager.loadSound('assets/sounds/monolith_fall.mp3', 0.8, false, false, (e)=>{monoliths.fall_sfx=e;});
	soundManager.loadSound('assets/sounds/walk.mp3', 0.2, true, false, (e)=>{player.sfx=e;});

	const heartbeat= new THREE.Audio(soundManager.listener);
	const heartbeat_pos = new THREE.PositionalAudio(soundManager.listener);
	SoundManager.loader.load( 'assets/sounds/heartbeat.mp3', function ( buffer ) {
		heartbeat.setBuffer( buffer );
		heartbeat.setLoop( true );
		soundManager.heartbeat=heartbeat;
		soundManager.children.push(heartbeat);

		heartbeat_pos.setBuffer( buffer );
		heartbeat_pos.setRefDistance(100);
		heartbeat_pos.setLoop(true);
		heartbeat_pos.setVolume(2.5);
		monoliths.markers[2].add(heartbeat_pos);
		soundManager.children.push(heartbeat_pos);
	} )
	isSoundLoaded=true;
}

function initPointLock(e)
{
	e.preventDefault();
	document.body.requestPointerLock();
	if(!isSoundLoaded) initSounds();
	soundManager.playAll();
//	showCaption(1);
}

function initEventListers()
{
	const blocker = document.getElementById( 'blocker' );
	const instructions = document.getElementById( 'instructions' );
	instructions.addEventListener('click',initPointLock);
	instructions.addEventListener('touchStart',initPointLock);
	document.addEventListener('pointerlockchange',(e)=>{
		if(isActive())
		{
			instructions.style.display = 'none';
			blocker.style.display = 'none';
			easeRotate.set(mainCamera.rotation.y, mainCamera.rotation.x);
		}
		else{
			blocker.style.display = 'block';
			instructions.style.display = '';
			easeRotate.set(mainCamera.rotation.y, mainCamera.rotation.x);
		}
	});
	window.addEventListener( 'resize', onWindowResize );
	document.addEventListener( 'mousedown', onMousePressed );
	document.body.addEventListener( 'mousemove', onMouseMoved , false);
	window.addEventListener( 'mouseup', onMouseReleased );
	document.addEventListener( 'keydown', ( e ) => {
		keyStates[ e.code ] = true;
	//	player.playSFX();
		if(e.code === 'KeyC')
		{
			stats.dom.style.display = (stats.dom.style.display=='none')? 'block' : 'none' ;
		}
	} );
	document.addEventListener( 'keyup', ( e ) => {
		keyStates[ e.code ] = false;
	//	player.stopSFX();
	} );
}

function changeFog(phase)
{
	const phase1 = new THREE.Color(0xaabccc); // 0xd7e1e2
	const phase2 = new THREE.Color(0x171717); // 0x565656
	const phase3 = new THREE.Color(0x0d0808); // 0x403232
	const phase4 = new THREE.Color(0x0d3a17); // 0x36854f
	const phaseCnt= THREE.MathUtils.smoothstep(phase, 0.9, 1.1)+
					THREE.MathUtils.smoothstep(phase, 1.9, 2.1)+
					THREE.MathUtils.smoothstep(phase, 2.9, 3.1);

//	console.log(phaseCnt);
	if(phaseCnt < 1.0) return new THREE.Color().lerpColors(phase1, phase2, phaseCnt);
	else if(phaseCnt < 2.0) return new THREE.Color().lerpColors(phase2, phase3, phaseCnt-1.0);
	else return new THREE.Color().lerpColors(phase3, phase4, phaseCnt-2.0);
}

function changeEnv()
{
	if(phase > 3.09 || phase < 0.5) return;
	let fractPhase = phase - Math.floor(phase);
	if(fractPhase < 0.1  || fractPhase > 0.9)
	{
		let skyBG=pmremGenerator.fromScene( sky ).texture;
		scene.environment = skyBG;
		projectScene.environment = skyBG;
		projectScene.fog.color=changeFog(phase);
	}

}

function init()
{
	mainCamera.position.set(0, 100, 700);
	mainCamera.rotation.order = 'YXZ';
	fakeCamera.position.set(0,200,0);

	projectScene.fog=new THREE.FogExp2( changeFog(phase).getHex(), 0.0010 );
	initHall();
	initFloor(scene);

	spikes=new Spikes(projectScene);
	monoliths = new MonolithMarker(scene);
	initFloor(projectScene, true);
	sky.scale.setScalar(450000);
	projectScene.add(sky);
	sky.material.uniforms[ 'processAmount' ].value = phase;
	let skyBG=pmremGenerator.fromScene( sky ).texture;
	projectScene.environment = skyBG;
	scene.environment = skyBG;

	initLights();

	//renderer setting
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.physicallyCorrectLights = true;
	renderer.shadowMap.enabled = true;

	renderer.physicallyCorrectLights = true;
	renderer.outputEncoding = THREE.sRGBEncoding;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.0;

	projectionRenderer.physicallyCorrectLights = true;
	projectionRenderer.outputEncoding = THREE.sRGBEncoding;
	projectionRenderer.toneMapping = THREE.ACESFilmicToneMapping;
	projectionRenderer.toneMappingExposure = 1.0;

	document.body.appendChild( renderer.domElement );

	//controller setting
	player=new Player();
	initEventListers();

	spikes.grow();

	soundManager = new SoundManager();
}

function animate()
{
	requestAnimationFrame( animate );
	const deltaTime = Math.min( 0.1, clock.getDelta() );
	const elapsedTime = clock.getElapsedTime();
	if(isActive())
	{
		player.movement(deltaTime);
		player.cameraRotate();
		floorMove();
		spikes.grow();
		monoliths.move(deltaTime);

		if(elapsedTime % 3 < 0.03)
		{
			spikes.generate(player.parellelPos, player.direction2D);
			spikes.removal(player.parellelPos, player.direction2D);
		}

		let sun=new THREE.Vector3();
		sun.setFromSphericalCoords(1, 90-(phase*2+20), 0);
		sky.material.uniforms[ 'sunDirection' ].value.copy( sun );
		sky.material.uniforms[ 'processAmount' ].value = phase;
		fleshBeat();
	}
	else soundManager.pauseAll();
	render();
}

function render()
{
	changeEnv();
	renderer.setRenderTarget( projectionRenderer );
	renderer.clear();
	renderer.render(projectScene,fakeCamera);

	renderer.setRenderTarget(null);
	renderer.clear();
//	renderer.render(projectScene,fakeCamera);
	renderer.render( scene, mainCamera);
	stats.update();
}

init();
animate();


function onWindowResize() {

	mainCamera.aspect = window.innerWidth / window.innerHeight;
	mainCamera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );
}

function onMousePressed(e) {
	
	isMousePressed=true;
	crossHead.style.display='block';
	if(isActive()) checkingMarker();
}
function onMouseMoved(e) {
	if ( isActive() ) {
		easeRotate.set(easeRotate.x-e.movementX/500, easeRotate.y-e.movementY/500);
		const clamp=(n,min,max)=> Math.min(Math.max(n, min), max);
		easeRotate.y = clamp(easeRotate.y, -Math.PI/2, Math.PI/2);
	}
}
function onMouseReleased(e) {
	isMousePressed=false;
	crossHead.style.display='none';
}