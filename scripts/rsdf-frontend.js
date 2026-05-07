// Unindented callback for readability
addEventListener("load", () => {
function UploadSVG(e)
{
	svg_overlay_group = null;

	svg_input?.remove();
	svg_input = null;

	OUTPUT_CANVAS.style.display = "none";
	SATURATED_CANVAS.style.display = "none";
	FALSECOLOUR_CANVAS.style.display = "none;"
	COLOUR_CANVAS.style.display = "none";
	import_converter = undefined;

	let file = e.target.files[0];
	filename = "";

	if (!file)
	{
		SVG_NAME.textContent = NO_FILE_TEXT;
		return;
	}

	const reader = new FileReader();

	reader.onload = () => {
		SVG_NAME.textContent = `"${file.name}" (${file.size} bytes)`;
		SVG_PREVIEW.innerHTML = reader.result;
		svg_input = SVG_PREVIEW.querySelector("svg");
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
	};

	reader.onerror = () => {
		showMessage("Error reading the file. Please try again.", "error");
		SVG_NAME.textContent = NO_FILE_TEXT;
		SVG_PREVIEW.innerHTML = "";
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
		import_converter = CONVERTER.Copy();
	}
	else
	{
		layers.forEach(layer =>
			CONVERTER.LabelLayer(layer, RSDFConverter.LABEL_UNKNOWN)
		);
	}

	if (!CONVERTER.LabelGraph(layers))
	{
		DisplayLayers();
		layers = undefined;
		console.error("Could not label layers!");
		return;
	}

	DisplayLayers();

	setTimeout(RenderSDF,0);
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

function RenderSDF()
{
	mapping = CONVERTER.GetImageMapping(layers);

	// Todo: Move processing to a web worker so the page does not lock up, and progress can be displayed
	const dists = CONVERTER.LabelledLayersToDistances(layers, mapping);

	sdf_img = CONVERTER.DistancesToSDFImage(
		dists,
		mapping
	);

	img_converter = CONVERTER.Copy();

	if (CONVERTER.render_falsecolour)
	{
		FALSECOLOUR_CANVAS.style.display = "";
		FALSECOLOUR_CANVAS.width = mapping.size.X;
		FALSECOLOUR_CANVAS.height = mapping.size.Y;

		const falsecolour_img_data = FALSECOLOUR_CTX.getImageData(0,0,mapping.size.X,mapping.size.Y);
		const falsecolour_data = falsecolour_img_data.data;

		falsecolour_img = [...sdf_img];

		if (CONVERTER.inverted)
			falsecolour_img = CONVERTER.InvertSDFImage(falsecolour_img);

		falsecolour_img = CONVERTER.FalseColourSDFImage(falsecolour_img);

		falsecolour_img.forEach((v,i) => falsecolour_data[i] = v);
		FALSECOLOUR_CTX.putImageData(falsecolour_img_data,0,0);
	}

	if (CONVERTER.render_regions)
	{
		SATURATED_CANVAS.style.display = "";
		SATURATED_CANVAS.width = mapping.size.X;
		SATURATED_CANVAS.height = mapping.size.Y;

		const saturated_img_data = SATURATED_CTX.getImageData(0,0,mapping.size.X,mapping.size.Y);
		const saturated_data = saturated_img_data.data;

		saturated_img = CONVERTER.SaturateSDFImage([...sdf_img]);

		if (CONVERTER.inverted)
			saturated_img = CONVERTER.InvertSDFImage(saturated_img);

		if (CONVERTER.render_falsecolour)
			saturated_img = CONVERTER.FalseColourSDFImage(saturated_img);

		saturated_img.forEach((v,i) => saturated_data[i] = v);
		SATURATED_CTX.putImageData(saturated_img_data,0,0);
	}

	if (CONVERTER.render_colour)
	{
		COLOUR_CANVAS.style.display = "";
		COLOUR_CANVAS.width = mapping.size.X;
		COLOUR_CANVAS.height = mapping.size.Y;

		const colour_img_data = COLOUR_CTX.getImageData(0,0,mapping.size.X,mapping.size.Y);
		const colour_data = colour_img_data.data;

		colour_img = CONVERTER.DistancesToColourImage(
			dists,
			sdf_img,
			mapping
		);
		
		colour_img.forEach((v,i) => colour_data[i] = v);
		COLOUR_CTX.putImageData(colour_img_data,0,0);
	}

	OUTPUT_CANVAS.style.display = "";
	OUTPUT_CANVAS.width = mapping.size.X;
	OUTPUT_CANVAS.height = mapping.size.Y;

	const img_data = CANVAS_CTX.getImageData(0,0,mapping.size.X,mapping.size.Y);
	const data = img_data.data;

	if (CONVERTER.inverted)
		sdf_img = CONVERTER.InvertSDFImage(sdf_img);

	sdf_img.forEach((v,i) => data[i] = v);
	CANVAS_CTX.putImageData(img_data,0,0);

	// TODO: Create combined preview using RSDF sampling in a shader
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

	if (OUTPUT_CANVAS.style.display != "none")
		SaveCanvas(
			sdf_img,
			filename_prefix + "RSDF" + filename_suffix
		);

	if (FALSECOLOUR_CANVAS.style.display != "none")
		SaveCanvas(
			falsecolour_img,
			filename_prefix + "FalseColour" + filename_suffix
		);

	if (SATURATED_CANVAS.style.display != "none")
		SaveCanvas(
			saturated_img,
			filename_prefix + "Saturated" + filename_suffix
		);

	if (COLOUR_CANVAS.style.display != "none")
		SaveCanvas(
			colour_img,
			filename_prefix + "Colour" + filename_suffix
		);
}

function AddCallbacks()
{
	UPLOAD_INPUT.addEventListener("change", UploadSVG);
	BUTTON_CONVERT.addEventListener("click", UpdateLayers);
	BUTTON_SAVE.addEventListener("click", SaveSDFs);
}

const CONVERTER = new RSDFConverter();

const UPLOAD_INPUT = document.getElementById("upload-input");
const BUTTON_CONVERT = document.getElementById("button-convert");
const BUTTON_SAVE = document.getElementById("button-save");

const SVG_NAME = document.getElementById("input-preview-name");
const SVG_PREVIEW = document.getElementById("input-preview-svg");
const SETTINGS = document.getElementById("rsdf-settings");
const OUTPUT_CANVAS = document.getElementById("output-canvas");
const FALSECOLOUR_CANVAS = document.getElementById("falsecolour-canvas");
const SATURATED_CANVAS = document.getElementById("saturated-canvas");
const COLOUR_CANVAS = document.getElementById("colour-canvas");

const CANVAS_CTX = OUTPUT_CANVAS.getContext("2d");
const FALSECOLOUR_CTX = FALSECOLOUR_CANVAS.getContext("2d");
const SATURATED_CTX = SATURATED_CANVAS.getContext("2d");
const COLOUR_CTX = COLOUR_CANVAS.getContext("2d");

const NO_FILE_TEXT = "No file selected (0 bytes)";

let svg_input = null;
let svg_overlay_group = null;
let layers = [];
let filename = "";

let import_converter = undefined; // The converter settings used to import the SVG to polygons
let img_converter = undefined; // The converter settings used for the current generated image/s
let mapping = undefined; // Mapping from pixels to SVG units
let sdf_img = [];
let falsecolour_img = [];
let saturated_img = [];
let colour_img = [];

AddCallbacks();
SVG_NAME.textContent = NO_FILE_TEXT;
});