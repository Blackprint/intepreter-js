// import { Cable } from "./Cable.js";

// This will be extended if Blackprint Sketch is loaded
Blackprint.RoutePort = class RoutePort {
	constructor(iface){
		this.iface = iface;

		this.in = []; // Allow incoming route from multiple path
		this.out = null; // Only one route/path
	}

	// For creating output cable
	createCable(cable){
		this.out?.disconnect();
		cable = this.out = cable || new Cable(this);
		cable.isRoute = true;
		cable.output = this;

		return cable;
	}

	// Connect to input route
	connectCable(cable){
		if(this.in.includes(cable)) return false;
		this.in.push(cable);
		cable.input = this;
		cable.connected = true;

		return true;
	}
}