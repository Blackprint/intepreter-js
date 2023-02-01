class InstanceEvents extends CustomEvent {
	constructor(instance){
		super();
		this.list = {};
		this.instance = instance;
	}

	// This only available on Blackprint.Sketch
	_updateTreeList(){
		if(!this.instance.isSketch) return;
		this.totalEvent = 0;

		// Clear object by using for in to reuse the object
		let treeList = this.treeList ??= {};
		for (let key in treeList) {
			delete treeList[key];
		}

		let list = this.list;
		Object.assign(list, Blackprint._events);
		for (let key in list) {
			deepProperty(this.treeList, key.split('/'), list[key]);
			this.totalEvent++;
		}

		// Refresh ScarletsFrame's object watcher
		treeList.refresh?.();
	}

	createEvent(namespace){
		if(namespace in this.list) return;
		this.list[namespace] = new InstanceEvent({schema: {}});
		this._updateTreeList();
	}

	refreshFields(namespace){
		let schema = this.list[namespace]?.schema;
		if(schema == null) return;

		function refreshPorts(iface, target){
			let ports = iface[target];
			let node = iface.node;

			// Delete port that not exist or different type first
			let isEmitPort = true;
			for (let name in ports) {
				if(isEmitPort) { isEmitPort = false; continue; }
				if(schema[name] != ports[name]._config){
					node.deletePort(target, name);
				}
			}

			// Create port that not exist
			for (let name in schema) {
				if(ports[target] == null)
					node.createPort(target, name, schema[name]);
			}
		}

		function iterateList(ifaceList){
			for (let i=0; i < ifaceList.length; i++) {
				let iface = ifaceList[i];
				if(iface._enum === _InternalNodeEnum.BPEventListen){
					if(iface.data.namespace === namespace)
						refreshPorts(iface, 'output');
				}
				else if(iface._enum === _InternalNodeEnum.BPEventEmit){
					if(iface.data.namespace === namespace)
						refreshPorts(iface, 'input');
				}
				else if(iface._enum === _InternalNodeEnum.BPFnMain){
					iterateList(iface.bpInstance.ifaceList);
				}
			}
		}

		iterateList(this.instance.ifaceList);
	}
}

class InstanceEvent {
	constructor(options){
		this.schema = options.schema;
	}
}