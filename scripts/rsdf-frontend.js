// Unindented callback for readability
addEventListener("load", () => {
function UploadSVG(e)
{
	svg_overlay_group = null;

	svg_input?.remove();
	svg_input = null;

	OUTPUT_RSDF.style.display = "none";
	OUTPUT_REGIONS.style.display = "none";
	OUTPUT_FALSECOLOUR.style.display = "none;"
	OUTPUT_COLOUR.style.display = "none";
	OUTPUT_PLACEHOLDER.style.display = "flex";
	import_converter = undefined;

	let file = e.target.files[0];
	filename = "";

	if (!file)
	{
		INPUT_NAME.textContent = NO_FILE_TEXT;
		return;
	}

	const reader = new FileReader();

	reader.onload = () => {
		INPUT_NAME.textContent = `"${file.name}" (${file.size} bytes)`;
		INPUT_SVG.innerHTML = reader.result;
		svg_input = INPUT_SVG.querySelector("svg");
		// Remove svg size so it fits to the page
		// The viewbox will still take care of units & aspect
		svg_input.removeAttribute("width");
		svg_input.removeAttribute("height");

		if (!svg_input.hasAttribute("viewBox"))
			throw new Error("SVG has no viewBox!");
		
		const viewbox = svg_input
			.getAttribute("viewBox")
			.split(/\s+|,/);

		if (viewbox.length != 4)
			throw new Error(`Expected 4 arguments for SVG viewbox, got ${viewbox.length}!`);

		filename = file.name
			.split('.')
			.slice(0,-1) // Exclude file extension
			.join(".");

		const viewbox_pos = new Point(
			Number(viewbox[0]),
			Number(viewbox[1])
		);

		const viewbox_size = new Point(
			Number(viewbox[2]),
			Number(viewbox[3])
		);

		CONVERTER.viewbox = new Bounds(
			viewbox_pos,
			viewbox_pos.Add(viewbox_size)
		);

		INPUT_PLACEHOLDER.style.display = "none";
	};

	reader.onerror = () => {
		showMessage("Error reading the file. Please try again.", "error");
		INPUT_NAME.textContent = NO_FILE_TEXT;
		INPUT_SVG.innerHTML = "";
		INPUT_PLACEHOLDER.style.display = "flex";
	};

	reader.readAsText(file);
}

function UpdateLayers(e)
{
	svg_overlay_group?.remove();
	svg_overlay_group = null;
		
	// TODO?: Support high-resolution bitmaps (completely different pipeline, but common use-case)
	if (!svg_input)
		return;
	
	if (!import_converter || !import_converter.ImportIsClean(CONVERTER))
	{
		const graphics = CONVERTER.SVGExtractGraphics(svg_input);
		layers = CONVERTER.FlattenGraphicsToLayers(
			graphics,
			true
		);
		layers = CONVERTER.SeparateLayerPolys(layers);
		layers = CONVERTER.CullSmallLayers(layers);
		CONVERTER.ConnectLayers(layers);
		layers.forEach(layer => layer.poly = CONVERTER.CPolyToPoints(layer.poly));
		CONVERTER.SetupGraph(layers);
		layers = CONVERTER.LayersCalculateVectors(layers);
		layer_distances = CONVERTER.GetInterRegionDistances(layers);
		import_converter = CONVERTER.Copy();
	}
	else
	{
		layers.forEach(layer =>
			CONVERTER.LabelLayer(layer, RSDFConverter.LABEL_UNKNOWN)
		);
	}

	if (!(CONVERTER.separated
		? CONVERTER.LabelGraphSeparated(layers, layer_distances)
		: CONVERTER.LabelGraph(layers)))
	{
		DisplayLayers();
		layers = undefined;
		console.error("Could not label layers!");
		return;
	}

	DisplayLayers();

	setTimeout(RenderSDF,0);
}

function RenderSDF()
{
	mapping = CONVERTER.GetImageMapping(layers);

	// TODO: Move processing to a web worker so the page does not lock up, and progress can be displayed
	dists = CONVERTER.LabelledLayersToDistances(layers, mapping);

	sdf_img = CONVERTER.DistancesToSDFImage(
		dists,
		mapping
	);

	img_converter = CONVERTER.Copy();

	OUTPUT_PLACEHOLDER.style.display = "none";

	if (CONVERTER.render_falsecolour)
		setTimeout(RenderFalseColour,0);
	else
		OUTPUT_FALSECOLOUR.style.display = "none;"

	if (CONVERTER.render_regions)
		setTimeout(RenderRegions,0);
	else
		OUTPUT_REGIONS.style.display = "none";

	if (CONVERTER.render_colour)
		setTimeout(RenderColour,0);
	else
		OUTPUT_COLOUR.style.display = "none";

	setTimeout(RenderRSDF,0);

	// TODO: Create combined preview using RSDF sampling in a shader
}

function DisplayLayers()
{	
	const SVG_SIZE = CONVERTER.svg_size;
	const visited = new Set();
	svg_overlay_group = CreateSVGElement("g","overlay");
	let edges = CreateSVGElement("g","edges");
	let nodes = CreateSVGElement("g","nodes");

	layers
	.forEach((layer) => {
		layer.center = GetPathsCenter(layer.poly);
	});

	layers
	.forEach(layer => {
		const fill = RSDFConverter.VISUALISATION_LABELS.get(layer.graph_label);
		
		AddPaths(
			svg_overlay_group,
			PathsToString(layer.poly),
			fill,
			ClipperLib.JS.AreaOfPolygons(layer.poly) >= 0 ? "#777" : "#f33",
			SVG_SIZE * CONVERTER.graph_thickness
		);

		visited.add(layer);

		[...layer.connections
			.difference(visited)]
		.forEach(connection => {
			let line = CreateSVGElement("line");
	
			SetAttributes(
				line,
				{
					stroke: "#F00",
					"stroke-width": SVG_SIZE * CONVERTER.graph_thickness,
					"stroke-linejoin": "round",
					x1: layer.center.X,
					y1: layer.center.Y,
					x2: connection.center.X,
					y2: connection.center.Y,
				}
			);
			
			edges.appendChild(line);
		});
		
		let circle = CreateSVGElement("circle");
		
		SetAttributes(
			circle,
			{
				fill: fill,
				stroke: "#F00",
				"stroke-width": SVG_SIZE * CONVERTER.graph_thickness,
				"stroke-linejoin": "round",
				cx: layer.center.X,
				cy: layer.center.Y,
				r: SVG_SIZE * CONVERTER.graph_thickness * 4
			}
		);
		
		nodes.appendChild(circle);
	});

	svg_overlay_group.appendChild(edges);
	svg_overlay_group.appendChild(nodes);
	svg_input.appendChild(svg_overlay_group);
}

function RenderFalseColour()
{
	const ctx = OUTPUT_FALSECOLOUR.getContext("2d");
	const img_data = ctx.getImageData(0,0,mapping.size.X,mapping.size.Y);
	const data = img_data.data;

	OUTPUT_FALSECOLOUR.style.display = "";
	OUTPUT_FALSECOLOUR.width = mapping.size.X;
	OUTPUT_FALSECOLOUR.height = mapping.size.Y;

	falsecolour_img = [...sdf_img];

	if (CONVERTER.inverted)
		falsecolour_img = CONVERTER.InvertSDFImage(falsecolour_img);

	falsecolour_img = CONVERTER.FalseColourSDFImage(falsecolour_img);

	falsecolour_img.forEach((v,i) => data[i] = v);
	ctx.putImageData(img_data,0,0);
}

function RenderRegions()
{
	const regions_ctx = OUTPUT_REGIONS.getContext("2d");
	const regions_img_data = regions_ctx.getImageData(0,0,mapping.size.X,mapping.size.Y);
	const regions_data = regions_img_data.data;

	OUTPUT_REGIONS.style.display = "";
	OUTPUT_REGIONS.width = mapping.size.X;
	OUTPUT_REGIONS.height = mapping.size.Y;

	regions_img = CONVERTER.SaturateSDFImage([...sdf_img]);

	if (CONVERTER.inverted)
		regions_img = CONVERTER.InvertSDFImage(regions_img);

	if (CONVERTER.render_falsecolour)
		regions_img = CONVERTER.FalseColourSDFImage(regions_img);

	regions_img.forEach((v,i) => regions_data[i] = v);
	regions_ctx.putImageData(regions_img_data,0,0);
}

function RenderColour()
{
	const ctx = OUTPUT_COLOUR.getContext("2d");
	const img_data = ctx.getImageData(0,0,mapping.size.X,mapping.size.Y);
	const data = img_data.data;

	OUTPUT_COLOUR.style.display = "";
	OUTPUT_COLOUR.width = mapping.size.X;
	OUTPUT_COLOUR.height = mapping.size.Y;

	colour_img = CONVERTER.DistancesToColourImage(
		dists,
		sdf_img,
		mapping
	);
	
	colour_img.forEach((v,i) => data[i] = v);
	ctx.putImageData(img_data,0,0);
}

function RenderRSDF()
{
	const ctx = OUTPUT_RSDF.getContext("2d");
	const img_data = ctx.getImageData(0,0,mapping.size.X,mapping.size.Y);
	const data = img_data.data;

	OUTPUT_RSDF.style.display = "";
	OUTPUT_RSDF.width = mapping.size.X;
	OUTPUT_RSDF.height = mapping.size.Y;
	
	rsdf_img = [...sdf_img];

	if (CONVERTER.inverted)
		rsdf_img = CONVERTER.InvertSDFImage(rsdf_img);

	rsdf_img.forEach((v,i) => data[i] = v);
	ctx.putImageData(img_data,0,0);
}

// https://stackoverflow.com/a/58652379
function SaveCanvas(data, name)
{
	let p = new png.PNG(
		{
			width: mapping.size.X,
			height: mapping.size.Y,
			bitDepth: img_converter.bit_depth
		}
	);

	data.forEach((v,i) => p.data[i] = v);

	let base64 = png.PNG.sync
		.write(p)
		.toBase64();

	let download_link = document.createElement("a");
	download_link.href = `data:image/png;base64,${base64}`;
	download_link.download = `${name}.png`;
	download_link.click();
	download_link.remove();
}

function SaveSDFs(e)
{
	const filename_prefix = `${
		filename
	}_${
		mapping.size.X == mapping.size.Y 
		? mapping.size.X
		: `${mapping.size.X}x${mapping.size.Y}`	
	}_`;

	const inner = -img_converter.inner_px.toFixed(2);
	const outer = img_converter.outer_px.toFixed(2);

	const filename_suffix = `_${
		inner == outer
		? (img_converter.outer_px - img_converter.inner_px).toFixed(2)
		: `-${inner}_+${outer}`
	}${
		img_converter.inverted
		? "_Inverted"
		: ""
	}`;

	if (OUTPUT_RSDF.style.display != "none")
		SaveCanvas(
			rsdf_img,
			filename_prefix + "RSDF" + filename_suffix
		);

	if (OUTPUT_FALSECOLOUR.style.display != "none")
		SaveCanvas(
			falsecolour_img,
			filename_prefix + "FalseColour" + filename_suffix
		);

	if (OUTPUT_REGIONS.style.display != "none")
		SaveCanvas(
			regions_img,
			filename_prefix + "Regions" + filename_suffix
		);

	if (OUTPUT_COLOUR.style.display != "none")
		SaveCanvas(
			colour_img,
			filename_prefix + "Colour" + filename_suffix
		);
}

function AddCallbacks()
{
	const BOOLEANS = {
		"output-colour": "render_colour",
		"output-regions": "render_regions",
		"output-falsecolour": "render_falsecolour",
		"sdf-perpendicular": "perpendicular",
		"sdf-inverted": "inverted",
		"sdf-separated": "separated",
		"sdf-separation-limit": "separation_limit",
		"colour-background-enabled": "background_enabled",
		"colour-linear": "linear_enabled",
		"placement-fixed-aspect": "fixed_aspect",
		"placement-outer-margin": "outer_margin",
		"placement-sample-borders": "sample_borders",
		"core-bvh": "bvh_enabled",
		"core-print-debug": "print_debug",
		"core-print-performance": "print_performance",
	};

	const ENUMS = {
		"colour-bleedmode":
		{
			prop: "bleed_mode",
			map: {
				"extend": RSDFConverter.BLEED.EXTEND,
				"average": RSDFConverter.BLEED.AVERAGE,
				"mark": RSDFConverter.BLEED.MARK
			},
			default: "extend"
		},
		"colour-bitdepth":
		{
			prop: "bit_depth",
			map: {
				"8": 8,
				"16": 16
			},
			default: "8"
		},
		"placement-contentbox":
		{
			prop: "content_box",
			map: {
				"viewbox": RSDFConverter.CONTENT_BOX.VIEWBOX,
				"bounds": RSDFConverter.CONTENT_BOX.BOUNDS
			},
			default: "viewbox"
		},
		"placement-aspect-mode":
		{
			prop: "aspect_mode",
			map: {
				"yx": RSDFConverter.ASPECT.Y_X,
				"xy": RSDFConverter.ASPECT.X_Y
			},
			default: "yx"
		},
		"placement-scaling":
		{
			prop: "scaling",
			map: {
				"fit": RSDFConverter.SCALING.FIT,
				"cover": RSDFConverter.SCALING.COVER,
				"stretch": RSDFConverter.SCALING.STRETCH,
			},
			default: "fit"
		}
	};

	const COLOURS = {
		"colour-background": "background_colour",
		"settings-colour-bleed": "bleed_colour",
		"settings-colour-invalid": "invalid_colour"
	};

	const NUM_SINGLES = {
		"output-size": "size",
		"sdf-inner": "inner_px",
		"sdf-outer": "outer_px",
		"sdf-separation-minimum": "separation_minimum",
		"placement-aspect": "aspect",
		"placement-alignment-x": "alignment_x",
		"placement-alignment-y": "alignment_y",
		"core-leafsize": "bvh_leaf_size",
	};

	const NUM_PAIRS = {
		"core-working-scale": {pow2:true,prop:"working_scale"},
		"core-poly-delta": {pow2:true,prop:"poly_delta"},
		"core-cleanup-delta": {pow2:true,prop:"cleanup_delta"},
		"core-min-area": {pow2:true,prop:"min_area"},
		"core-adjacency-distance": {pow2:true,prop:"max_distance"},
		"core-adjacency-angle": {pow2:true,prop:"angle_steps"},
		"core-adjacency-graphthickness": {pow2:true,prop:"graph_thickness"},
	}

	INPUT_UPLOAD.addEventListener("change", UploadSVG);
	BUTTON_CONVERT.addEventListener("click", UpdateLayers);
	BUTTON_SAVE.addEventListener("click", SaveSDFs);

	const SETTINGS = document.getElementById("rsdf-settings");

	[...Object.entries(BOOLEANS)]
	.forEach(([id,prop]) => {
		const ELEMENT = SETTINGS.querySelector(`input#${id}`);
		
		if (!ELEMENT)
			return;
		
		ELEMENT.addEventListener("change", () => {
			CONVERTER[prop] = ELEMENT.checked;
		});
	});

	[...Object.entries(ENUMS)]
	.forEach(([id,obj]) => {
		const ELEMENT = SETTINGS.querySelector(`select#${id}`);
		
		if (!ELEMENT)
			return;
		
		ELEMENT.addEventListener("change", () => {
			CONVERTER[obj.prop] = obj.map[
				ELEMENT.value in obj.map
				? ELEMENT.value
				: obj.default
			];
		});
	});

	[...Object.entries(COLOURS)]
	.forEach(([id,prop]) => {
		const RGB_ELEMENT = SETTINGS.querySelector(`input#${id}colour`);
		const A_ELEMENT = SETTINGS.querySelector(`input#${id}alpha`);
		
		if (!RGB_ELEMENT || !A_ELEMENT)
			return;
		
		RGB_ELEMENT.addEventListener("change", () => {
			if (!RGB_ELEMENT.validity.valid)
				return;
			
			const COLOUR = RGB.FromString(RGB_ELEMENT.value);
			
			CONVERTER[prop].r = COLOUR.r;
			CONVERTER[prop].g = COLOUR.g;
			CONVERTER[prop].b = COLOUR.b;
		})
		
		A_ELEMENT.addEventListener("change", () => {
			if (!A_ELEMENT.validity.valid)
				return;
			
			CONVERTER[prop].a = Number(A_ELEMENT.value);
		})
	});

	[...Object.entries(NUM_SINGLES)]
	.forEach(([id,prop]) => {
		const ELEMENT = SETTINGS.querySelector(`input#${id}`);
		
		if (!ELEMENT)
			return;
		
		ELEMENT.addEventListener("change", () => {				
			if (!ELEMENT.validity.valid)
				return;
			
			CONVERTER[prop] = Number(ELEMENT.value);
		});
	});

	[...Object.entries(NUM_PAIRS)]
	.forEach(([id,obj]) => {
		const SLIDER = SETTINGS.querySelector(`input#${id}-slider`);
		const NUMBER = SETTINGS.querySelector(`input#${id}-number`);
		
		if (!SLIDER || !NUMBER)
			return;
		
		SLIDER.addEventListener("change", () => {
			if (!SLIDER.validity.valid)
				return;
			
			NUMBER.value = SLIDER.value;
			
			CONVERTER[obj.prop] = obj.pow2
				? Math.pow(2,Number(SLIDER.value))
				: Number(SLIDER.value);					
		});

		SLIDER.addEventListener("input", () => {			
			NUMBER.value = SLIDER.value;				
		});
		
		NUMBER.addEventListener("change", () => {
			if (!NUMBER.validity.valid)
				return;
			
			SLIDER.value = NUMBER.value;
			
			CONVERTER[obj.prop] = obj.pow2
				? Math.pow(2,Number(NUMBER.value))
				: Number(NUMBER.value);					
		});
	});
}

const CONVERTER = new RSDFConverter();

const INPUT_UPLOAD = document.getElementById("input-upload");
const BUTTON_CONVERT = document.getElementById("button-convert");
const BUTTON_SAVE = document.getElementById("button-save");

const INPUT_NAME = document.getElementById("input-name");
const INPUT_SVG = document.getElementById("input-svg");
const INPUT_PLACEHOLDER = document.getElementById("input-placeholder");

const OUTPUT = document.getElementById("rsdf-output");
const OUTPUT_RSDF = OUTPUT.querySelector("#output-rsdf");
const OUTPUT_FALSECOLOUR = OUTPUT.querySelector("#output-falsecolour");
const OUTPUT_REGIONS = OUTPUT.querySelector("#output-saturated");
const OUTPUT_COLOUR = OUTPUT.querySelector("#output-colour");
const OUTPUT_PLACEHOLDER = OUTPUT.querySelector("#output-placeholder");

const NO_FILE_TEXT = "No file selected (0 bytes)";

let svg_input = null;
let svg_overlay_group = null;
let layers = [];
let layer_distances = [];
let filename = "";

let import_converter = undefined; // The converter settings used to import the SVG to polygons
let img_converter = undefined; // The converter settings used for the current generated image/s
let mapping = undefined; // Mapping from pixels to SVG units
let dists = [];
let sdf_img = [];
let falsecolour_img = [];
let saturated_img = [];
let colour_img = [];
let rsdf_img = [];

AddCallbacks();
INPUT_NAME.textContent = NO_FILE_TEXT;
});