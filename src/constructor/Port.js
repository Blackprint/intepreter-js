let TypeAny = {name:'Any', any:true};

Blackprint.Engine.Port = class Port extends Blackprint.Engine.CustomEvent{
	constructor(name, type, def, source, iface, haveFeature){
		super();

		this.name = name;
		this.type = type;
		this.cables = [];
		this.source = source;
		this.iface = iface;
		this.classAdd ='';

		// this.value;
		this.default = def;

		// this.feature == BP_Port.Listener | BP_Port.ArrayOf | BP_Port.Async

		if(haveFeature){
			this.feature = haveFeature;

			if(haveFeature === BP_Port.ArrayOf)
				this.classAdd = 'ArrayOf ';
		}
	}

	disconnectAll(hasRemote){
		var cables = this.cables;
		for (var i = cables.length - 1; i >= 0; i--){
			let cable = cables[i];

			if(hasRemote)
				cable._evDisconnected = true;

			cable.disconnect();
		}
	}

	// Set for the linked port (Handle for ScarletsFrame)
	// ex: linkedPort = node.output.portName
	createLinker(){
		var port = this;

		// Only for output (type: trigger/function)
		if(this.source === 'output' && this.type === Function){
			// Disable sync
			port.sync = false;

			return function(obj){
				if(!port.iface.node.disablePorts){
					var cables = port.cables;
					for (var i = 0; i < cables.length; i++) {
						var cable = cables[i];

						var target = cable.input;
						if(target === void 0)
							continue;

						if(Blackprint.settings.visualizeFlow)
							cable.visualizeFlow();

						target.iface.input[target.name].default();
					}
				}

				port.emit('call', obj);
				// port.iface.node._instance.emit('port.output.call', temp);
			};
		}

		var prepare = {
			configurable:true,
			enumerable:true,
			get(){
				// This port must use values from connected output
				if(port.source === 'input'){
					if(port.cables.length === 0)
						return port.default;

					if(port._cache !== void 0) return port._cache;

					// Flag current node is requesting value to other node
					port.iface._requesting = true;

					// Return single data
					if(port.cables.length === 1){
						var cable = port.cables[0];

						if(cable.connected === false || cable.disabled){
							port.iface._requesting = void 0;
							if(port.feature === BP_Port.ArrayOf)
								return port._cache = [];

							return port._cache = port.default;
						}

						var output = cable.output;

						// Request the data first
						if(output.iface.node.request)
							output.iface.node.request(output, port.iface);

						if(Blackprint.settings.visualizeFlow)
							cable.visualizeFlow();

						port.iface._requesting = void 0;
						if(port.feature === BP_Port.ArrayOf)
							return port._cache = [output.value];

						return port._cache = output.value ?? port.default;
					}

					let isNotArrayPort = port.feature !== BP_Port.ArrayOf;

					// Return multiple data as an array
					var cables = port.cables;
					var data = [];
					for (var i = 0; i < cables.length; i++) {
						var cable = cables[i];
						if(cable.connected === false || cable.disabled)
							continue;

						var output = cable.output;

						// Request the data first
						if(output.iface.node.request)
							output.iface.node.request(output, port.iface);

						if(Blackprint.settings.visualizeFlow)
							cable.visualizeFlow();

						if(isNotArrayPort){
							port.iface._requesting = void 0;
							return port._cache = output.value ?? port.default;
						}

						data.push(output.value ?? port.default);
					}

					port.iface._requesting = void 0;
					return port._cache = data;
				}

				// else type: output port, let's just return the value
				return port.value;
			}
		};

		// Can only obtain data when accessing input port
		if(port.source !== 'input'){
			prepare.set = function(val){ // for output/property port
				if(port.value === val || port.iface.node.disablePorts)
					return;

				if(val == null)
					val = port.default;

				// Data type validation
				else if(val.constructor !== port.type){
					if(port.type === TypeAny); // Pass
					else if(!(val instanceof port.type))
						throw new Error(port.iface.title+"> "+getDataType(val) + " is not instance of "+port.type.name);
				}

				port.value = val;
				port.emit('value', { port });
				// port.iface.node._instance.emit('port.output.value', temp);
				port.sync(); // emit event to all input port connected to this port
			}
		}

		// Disable sync
		else port.sync = false;

		return prepare;
	}

	// this= output/property, target=input
	sync(){
		// Check all connected cables, if any node need to synchronize
		var cables = this.cables;

		for (var i = 0; i < cables.length; i++) {
			var cable = cables[i];
			if(cable.hasBranch)
				continue;

			var inp = cable.input;
			if(inp !== void 0) inp._cache = void 0;
			else continue;

			if(inp.iface.node.update && inp.iface._requesting === void 0)
				inp.iface.node.update(inp, this, cable);

			let temp = { port: inp, target: this, cable };

			inp.emit('value', temp);
			inp.iface.emit('port.value', temp);
		}
	}

	disableCables(enable=false){
		var cables = this.cables;
		var i = 0;

		if(enable.constructor === Number) for(; i < cables.length; i++)
			cables[i].disabled += enable;
		else if(enable) for(; i < cables.length; i++)
			cables[i].disabled = 1;
		else for(; i < cables.length; i++)
			cables[i].disabled = 0;
	}

	_cableConnectError(name, obj){
		let msg = `Cable notify: ${name}`;
		if(obj.iface) msg += `\nIFace: ${obj.iface.namespace}`;

		if(obj.port)
			msg += `\nFrom port: ${obj.port.name}\n - Type: ${obj.port.source} (${obj.port.type.name})`;

		if(obj.target)
			msg += `\nTo port: ${obj.target.name}\n - Type: ${obj.target.source} (${obj.target.type.name})`;

		obj.message = msg;
		this.iface.node._instance.emit(name, obj);
	}

	connectCable(cable){
		if(cable === void 0 && this._scope !== void 0)
			cable = this._scope('cables').currentCable;

		// It's not a cable might
		if(cable === void 0)
			return;

		if(cable.branch != null && cable.branch.length !== 0)
			throw new Error("Can't attach cable that have branch to this port");

		if(cable.owner === this) // It's referencing to same port
			return cable.disconnect();

		// Remove cable if ...
		if((cable.source === 'output' && this.source !== 'input') // Output source not connected to input
			|| (cable.source === 'input' && this.source !== 'output')  // Input source not connected to output
			|| (cable.source === 'property' && this.source !== 'property')  // Property source not connected to property
		){
			this._cableConnectError('cable.wrong_pair', {cable, port: this, target: cable.owner});
			cable.disconnect();
			return;
		}

		if(cable.owner.source === 'output'){
			if((this.feature === BP_Port.ArrayOf && !BP_Port.ArrayOf.validate(this.type, cable.owner.type))
			   || (this.feature === BP_Port.Union && !BP_Port.Union.validate(this.type, cable.owner.type))){
				this._cableConnectError('cable.wrong_type', {cable, iface: this.iface, port: cable.owner, target: this});
				return cable.disconnect();
			}
		}

		else if(this.source === 'output'){
			if((cable.owner.feature === BP_Port.ArrayOf && !BP_Port.ArrayOf.validate(cable.owner.type, this.type))
			   || (cable.owner.feature === BP_Port.Union && !BP_Port.Union.validate(cable.owner.type, this.type))){
				this._cableConnectError('cable.wrong_type', {cable, iface: this.iface, port: this, target: cable.owner});
				return cable.disconnect();
			}
		}

		// ToDo: recheck why we need to check if the constructor is a function
		var isInstance = true;
		if(cable.owner.type !== this.type
		   && cable.owner.type.constructor === Function
		   && this.type.constructor === Function){
			if(cable.owner.source === 'output')
				isInstance = cable.owner.type.prototype instanceof this.type;
			else isInstance =  this.type.prototype instanceof cable.owner.type;
		}

		// Remove cable if type restriction
		if(!isInstance || (
			   cable.owner.type === Function && this.type !== Function
			|| cable.owner.type !== Function && this.type === Function
		)){
			this._cableConnectError('cable.wrong_type_pair', {cable, port: this, target: cable.owner});
			cable.disconnect();
			return;
		}

		var sourceCables = cable.owner.cables;

		// Remove cable if there are similar connection for the ports
		for (var i = 0; i < sourceCables.length; i++) {
			if(this.cables.includes(sourceCables[i])){
				this._cableConnectError('cable.duplicate_removed', {cable, port: this, target: cable.owner});
				cable.disconnect();
				return;
			}
		}

		// Put port reference to the cable
		cable.target = this;

		let inp, out;
		if(cable.target.source === 'input'){
			inp = cable.target;
			out = cable.owner;
		}
		else {
			inp = cable.owner;
			out = cable.target;
		}

		// Remove old cable if the port not support array
		if(inp.feature !== BP_Port.ArrayOf && inp.type !== Function){
			let _cables = inp.cables; // Cables in input port

			if(_cables.length !== 0){
				_cables = _cables[0];

				if(_cables === cable)
					_cables = _cables[1];

				if(_cables !== void 0){
					inp._cableConnectError('cable.replaced', {cable, oldCable: _cables, port: inp, target: out});
					_cables.disconnect();
				}
			}
		}

		// Connect this cable into port's cable list
		this.cables.push(cable);
		cable.connecting();

		return true;
	}

	connectPort(port){
		if(!(port instanceof Engine.Port))
			throw new Error("First parameter must be instance of Port");

		let cable;

		if(port._scope != null){
			let list = port.iface[port.source]._list;
			let rect;

			if(list.getElement == null || DOMRect.fromRect == null){
				rect = new DOMRect(); // use fake DOMRect (usually for testing with Jest)
				rect.height = rect.width = rect.y = rect.x = 10;
			}
			else rect = port.findPortElement(list.getElement(port)).getBoundingClientRect();

			cable = port.createCable(rect, true);
		}
		else cable = new Engine.Cable(port);

		if(port._ghost) cable._ghost = true;

		port.cables.push(cable);
		if(this.connectCable(cable))
			return true;

		return false;
	}
}

function getDataType(which){
	return which.constructor.name;
}