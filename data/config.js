var mapConfig = {
	layerLabels: {
		"day": "Day View",
		"night": "Night view",
		"topo": "Topographical",
		"towns": "Towns",
		"routes": "Routes",
		"areas": "Areas",
		"pois": "Points of Interest",
	},
	dimensions: {
		"DIM0": {
			name: "Overworld",
			bounds: [[0,0],[0,0]],
			layers: ["day","night","topo"],
			center: { x:4*512+238, z:21*512+164 },
			towns: [
				{ name: "Spawn Town", x:4*512+238, z:21*512+164, rad:50 },
			],
			routes: [
				{ name: "Route 1", path:[[2352,10848], [2724,10749]] },
			],
			areas: [
				{ name: "Fields of Wheat", boundery:[[2250,10988], [2367,10966], [2401,11041], [2369,11094], [2306,11093]] },
			],
			pois: [
				{ name: "Crator Lake", x:2594, z:11186 },
			],
		},
	},
};