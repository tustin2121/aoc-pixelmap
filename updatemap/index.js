#!node

const fs = require('fs');
const PATH = require('path');
const { createCanvas, loadImage } = require('canvas');

const currentConfig = require('../data/config');
const waypointList = [];

/**
 * Merges the images by layering them on top of one another.
 * @param {Buffer[]} srcs 
 */
async function mergeImages(...srcs) {
	const canvas = createCanvas(512, 512);
	const ctx = canvas.getContext('2d');
	for (const buf of srcs) {
		let img = await loadImage(buf);
		ctx.drawImage(img, 0, 0);
	}
	return canvas.toBuffer("image/png");
}

/**
 * 
 * @param {string} srcRoot - Root path of the images to update from.
 * @param {string} dstRoot - Root path of the images to update to.
 */
async function updateImages(srcRoot, dstRoot) {
	const dirList = fs.readdirSync(srcRoot);
	for (const filename of dirList) {
		let spath = PATH.join(srcRoot, filename);
		let dpath = PATH.join(dstRoot, filename);
		let dbuf, sbuf;
		try {
			dbuf = fs.readFileSync(dpath);
		} catch (e) {
			// If the destination file doesn't exist
			if (e.code === 'ENOENT') {
				// Copy the new file to the data directory
				fs.copyFileSync(spath, dpath, fs.constants.COPYFILE_EXCL);
				continue; //next file!
			} else throw e; //rethrow
		}
		// If we got here, we have the destination file as a buffer
		sbuf = fs.readFileSync(spath); //if this throws, then there's worse problems.
		// Merge the images
		dbuf = await mergeImages(dbuf, sbuf);
		fs.writeFileSync(dpath, dbuf);
		console.log("Wrote", dpath);
	}
}

async function scanDimension(srcRoot, dstRoot) {
	console.log(`Scanning dimension directory ${srcRoot}`);
	const dirList = fs.readdirSync(srcRoot);
	for (const filename of dirList) {
		let spath = PATH.join(srcRoot, filename);
		let dpath = PATH.join(dstRoot, filename);
		try {
			let dstat = fs.statSync(dpath);
			if (!dstat.isDirectory()) throw new Error(`Destination is not a directory! ${dpath}`);
		} catch (e) {
			if (e.code === 'ENOENT') {
				fs.mkdirSync(dpath);
			} else throw e;
		}
		await updateImages(spath, dpath);
	}
}

async function scanWaypoints(srcRoot) {
	console.log(`Reading waypoints directory.`);
	// Store the waypoints off for later processing.
	const dirList = fs.readdirSync(srcRoot);
	for (const filename of dirList) {
		if (filename.startsWith("Death")) continue; //ignore death waypoints
		if (filename.startsWith("(")) continue; //ignore private waypoints
		let spath = PATH.join(srcRoot, filename);
		let json = require(spath);
		waypointList.push(json);
	}
}

async function scanDirectory(srcRoot, dstRoot) {
	console.log(`Scanning directory ${srcRoot}`);
	console.log(`[Pairing with ${dstRoot}]`);
	try {
		let stat = fs.statSync(PATH.join(srcRoot, "DIM0"));
		if (!stat.isDirectory()) throw new Error("DIM0 is not a directory!");
		stat = fs.statSync(PATH.join(srcRoot, "waypoints"));
		if (!stat.isDirectory()) throw new Error("waypoints is not a directory!");
	} catch (e) {
		e.message = `Is this the right path? ${srcRoot}\n${e.message}`;
		throw e;
	}
	const dirList = fs.readdirSync(srcRoot);
	for (const filename of dirList) {
		let spath = PATH.join(srcRoot, filename);
		let dpath = PATH.join(dstRoot, filename);
		if (filename === 'waypoints') {
			scanWaypoints(spath);
		} else if (filename.startsWith('DIM')) {
			let sstat = fs.statSync(spath);
			if (sstat.isDirectory()) {
				try {
					let dstat = fs.statSync(dpath);
					if (!dstat.isDirectory()) throw new Error(`Destination is not a directory! ${dpath}`);
				} catch (e) {
					if (e.code === 'ENOENT') {
						fs.mkdirSync(dpath);
					} else throw e;
				}
				currentConfig.dimensions[filename] = currentConfig.dimensions[filename] || newDim(filename);
				await scanDimension(spath, dpath);
			}
		}
	}
}

function newDim(name) {
	return {
		name, bounds: [[0,0],[0,0]], center: { x:0, z:0 },
		layers:["day", "night", "topo", "4", "3", "2", "1", "0"],
		markers: [
			
			// towns: [], gyms: [], centers: [],
			// routes: [], areas: [], pois: [],
		],
	};
}

async function updateConfig() {
	// process the waypoints first
	for (let waypoint of waypointList) {
		// For every dimension they apply to, check to see if there's a marker in that dim that represents it already
		// if there is, skip it. If there isn't, make a new marker.
		for (let dimName in currentConfig.dimensions) {
			let dim = currentConfig.dimensions[dimName];
			let dimNum = Number.parseInt(dimName.slice(3), 10);
			
			console.log(`waypoint.dimensions.includes(Number(dimName)) => `, waypoint.dimensions, dimNum, waypoint.dimensions.includes(Number(dimName)));
			if (!waypoint.dimensions.includes(dimNum)) continue;
			if (dim.markers.filter(x=>x.wayid === waypoint.id).length > 0) continue;
			// If we got here, we haven't added this waypoint yet
			
			console.log(`Adding marker for ${waypoint.id}.`);
			let marker = {
				wayid: waypoint.id,
				type: waypoint.type === 'Normal'? 'poi' : waypoint.type,
				name: waypoint.name,
				x: waypoint.x,
				y: waypoint.y,
				z: waypoint.z,
			};
			dim.markers.push(marker);
		}
	}
	
	// let out = JSON5.stringify(currentConfig, null, '\t');
	let out = printJSON(currentConfig);
	
	fs.writeFileSync(require.resolve('../data/config.js'), `module.exports = ${out};`);
	console.log('Wrote config file.');
}

////////////////////////////////////////

/**
 * 
 * @param {object} obj 
 * @param {string} tab 
 */
function printJSON(obj, level=0, forceInline=false) {
	let nl = (shouldNewLine()) ? '\n' : '';
	let tab = nl ? '\t'.repeat(level+1) : '';
	
	if (obj === null) {
		return "null";
	} else if (Array.isArray(obj)) {
		if (obj.length === 0) return '[]';
		
		let out = `[${nl}`;
		for (let val of obj) {
			out += `${tab}${printValue(val)},${nl}`;
		}
		if (!nl) out = out.slice(0, -1);
		out += `${nl?'\t'.repeat(level):''}]`;
		return out;
	} else if (typeof obj === 'object') {
		if (Object.keys(obj).length == 0) return '{}';
		
		let nl1 = nl?nl:' ';
		let out = `{${nl1}`;
		for (let key in obj) {
			out += `${tab}${printKey(key)}: ${printValue(obj[key], key)},${nl1}`;
		}
		if (!nl) out = out.slice(0, -2);
		out += `${nl?'\t'.repeat(level):' '}}`;
		return out;
	} else {
		return printValue(obj);
	}
	
	function shouldNewLine() {
		if (forceInline) return false;
		if (level == 0) return true;
		if (Array.isArray(obj)) {
			if (typeof obj[0] === 'object') return true;
			if (obj.length < 8) return false;
		}
		else if (typeof obj === 'object') {
			let keys = Object.keys(obj);
			if (typeof obj[keys[0]] === 'object') return true;
			if (keys.length < 3) return false;
		}
		return true;
	}
	function printKey(key) {
		if (key.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/i)) return key;
		return `"${key}"`;
	}
	function printValue(val, key) {
		let fi = false;
		if (key) switch (key) {
			case "bounds": case "layers": 
				fi = true; break;
		}
		switch(typeof val) {
			case "string": return `"${val}"`;
			case "bigint":
			case "number": return val.toString(10);
			case "symbol":
			case "boolean": return val.toString();
			case "function": return "null";
			case "undefined": return "undefined";
			case "object": return printJSON(val, level+1, fi);
		}
	}
}

////////////////////////////////////////

if (process.argv.length < 3) {
	console.log('Must supply path to the JourneyMap server folder.');
	return;
}

console.log(`Current config: `, currentConfig);
scanDirectory(process.argv[2], PATH.resolve(__dirname, '../data'))
	.then(updateConfig)
	.then(()=> console.log('Done.'))
	.catch((e)=>{ process.nextTick(()=>{ throw e; }) });