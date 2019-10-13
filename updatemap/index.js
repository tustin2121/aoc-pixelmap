#!node

const fs = require('fs');
const PATH = require('path');
const JSON5 = require('json5');
const { createCanvas, createImageData, loadImage } = require('canvas');

const currentConfig = require('../data/config');
const waypointList = [];

/**
 * Merges the images by layering them on top of one another.
 * @param {Buffer[]} srcs 
 */
async function mergeImages(...srcs=[]) {
	const canvas = createCanvas(512, 512);
	const ctx = canvas.getContext('2d');
	for (const buf of srcs) {
		let img = await loadImage(buf);
		ctx.drawImage(img, 0, 0);
	}
	return canvas.toBuffer();
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
		dbuf = mergeImages(dbuf, sbuf);
		fs.writeFileSync(dpath);
		console.log("Wrote", dpath);
	}
}

async function scanDimension(srcRoot, dstRoot) {
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
		layers:["day", "night", "topo", "0", "1", "2", "3", "4"],
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
		for (let dimName of currentConfig.dimensions) {
			let dim = currentConfig.dimensions[dimName];
			
			if (waypoint.dimensions.contains(Number(dimName))) continue;
			if (dim.markers.filter(x=>x.wayid === waypoint.id).length > 0) continue;
			// If we got here, we haven't added this waypoint yet
			
			let marker = {
				wayid: waypoint.id,
				type: waypoint.type === 'Normal'? 'poi' : waypoint.type,
				name: waypoint.name,
				x: waypoint.x,
				z: waypoint.z,
			};
			dim.markers.push(marker);
		}
	}
	
	let out = JSON5.stringify(currentConfig, null, '\t');
	
	fs.writeFileSync(`module.exports = ${out};`, require.resolve('../data/config.js'));
	console.log('Wrote config file.');
}

////////////////////////////////////////

if (process.argv.length < 3) {
	console.log('Must supply path to the JourneyMap server folder.');
	return;
}

scanDirectory(process.argv[2], require.resolve('../data'))
	.then(updateConfig)
	.then(()=> console.log('Done.'))
	.catch((e)=>{ process.nextTick(()=>{ throw e; }) });