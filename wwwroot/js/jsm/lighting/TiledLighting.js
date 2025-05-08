import { Lighting } from '/js/three.webgpu.js';
import { tiledLights } from '../tsl/lighting/TiledLightsNode.js';

export class TiledLighting extends Lighting {

	constructor() {

		super();

	}

	createNode( lights = [] ) {

		return tiledLights().setLights( lights );

	}

}
