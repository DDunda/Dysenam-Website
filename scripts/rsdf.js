const POLY_STEP = 0.85;
const CLEANUP_DELTA = 0.01;
const WORKING_SCALE = 1000; 

const UNION_ID        = "UNION";
const INTERSECTION_ID = "INTERSECTION";
const DIFFERENCE_ID   = "DIFFERENCE";
const XOR_ID          = "XOR";

const ID_MAP = {
	[UNION_ID]:        ClipperLib.ClipType.ctUnion,
	[INTERSECTION_ID]: ClipperLib.ClipType.ctIntersection,
	[DIFFERENCE_ID]:   ClipperLib.ClipType.ctDifference,
	[XOR_ID]:          ClipperLib.ClipType.ctXor,
};

const SVG_ELEMENTS = ["PATH","ELLIPSE","CIRCLE","POLGON","RECT","TEXT","G"];

const ARG_COUNT = {
	// Move (new subpath):
	"M": 2, // x,y
	// Line:
	"L": 2, // x,y
	// Horizontal line:
	"H": 1, // x
	// Vertical line:
	"V": 1, // y
	// Close path:
	"Z": 0, 
	// Cubic bezier: 
	"C": 6, // c1x,c1y,c2x,c2y,x,y
	// Cubic bezier (borrowed control): 
	"S": 4, // c2x,x2y,x,y
	// Quadratic bezier: 
	"Q": 4, // cx,cy,x,y
	// Quadratic bezier (borrowed control): 
	"T": 2, // x,y
	// Arc (ellipse):
	"A": 7 // rx,ry,r,lf,sf,x,y
}

const RELATIVE_ARGS = ["m","l","h","v","z","c","s","q","t","a"];

// Each argument is normalised (0-1) within the in-gamut range
function oklch_normalised_wheel(luma, chroma, hue)
{
	return `oklch(${75.0153618202436 * luma}% ${0.12752921926631577 * chroma * luma} ${360 * hue})`;
}

// Each argument is normalised (0-1) within the in-gamut range
function oklch_normalised_random(min_luma, max_luma, min_chroma, max_chroma, min_hue, max_hue)
{
	var rand_luma = min_luma != max_luma ? min_luma + (max_luma - min_luma) * Math.random() : max_luma;
	var rand_chroma = min_chroma != max_chroma ? min_chroma + (max_chroma - min_chroma) * Math.random() : max_chroma;
	var rand_hue =  min_hue != max_hue ? min_hue + (max_hue - min_hue) * Math.random() : max_hue;
	return oklch_normalised_wheel(rand_luma, rand_chroma, rand_hue);
}

function CreateSVGElement(name) {
	return document.createElementNS("http://www.w3.org/2000/svg", name);
}

function PointDistance(a,b) {
	let dx = a[0] - b[0];
	let dy = a[1] - b[1];
	return Math.sqrt(dx * dx + dy * dy);
}

function AddPaths(element, path_string, fill_colour, stroke_colour, stroke_width = 1)
{
	let path = CreateSVGElement("path");

	let attributes = {
		"d": path_string,
		"stroke": stroke_colour,
		"vector-effect": "non-scaling-stroke",
		"stroke-width": stroke_width,
		"fill": fill_colour,
		"stroke-linejoin": "round",
		"stroke-linecap": "round",
	};

	Object.entries(attributes)
	.forEach(([key,value]) => path.setAttribute(key, value));

	element.appendChild(path);   
}

// Converts a list of vertices to a JsClipper
// compatible format.
function PointsToCPoly(points)
{
	let cpoly = points.map(p => p.map(v => { return { X:v[0], Y:v[1] }; }));
	ClipperLib.JS.ScaleUpPaths(cpoly, WORKING_SCALE);
	return cpoly;
}

function CPolyToPoints(cpoly)
{
	ClipperLib.JS.ScaleDownPaths(cpoly, WORKING_SCALE);
	return cpoly.map(p => p.map(v => [v.X, v.Y]));
}

// Converts Paths to an SVG path string
function PathsToString(paths)
{
	return SimplifyPoints(paths).map((p) => {
		let svgpath = `${p[0][0]},${p[0][1]} L`

		for (let j = 1; j < p.length; j++)
		{
			svgpath += `${p[j][0]},${p[j][1]} `;
		}

		return `M${svgpath}Z`;
	})
	.join(" ") || "M0,0";
}

function SimplifyPoints(points)
{
	let pts = points.map((p) => {
		while (p.length > 1 &&
			p[0][0] == p[p.length - 1][0] &&
			p[0][1] == p[p.length - 1][1])
			p.pop();

		if (p.length < 2)
			return [];

		let subpath = [p[0]];
		for (let j = 1; j < p.length; j++)
		{
			if (p[j-1][0] == p[j][0] &&
				p[j-1][1] == p[j][1]) 
				continue;

			subpath.push(p[j]);
		}
		return subpath;
	})
	.filter((p) => { return p.length > 0; });

	return pts;
}

// Takes an svg as segments, and converts them
// to a list of subpath polygon vertex lists.
// Points are [x,y] arrays.
// Returns a path list of subpath lists of points.
function SegmentsToPoints(segments)
{
	if (segments.length == 0)
		throw Error("SegmentsToPoints: No segments!");

	let rPoints = [[[0,0]]];
	let lastPoint = [0,0];
	let lastSControl = lastPoint;
	let lastTControl = lastPoint;
	let nextPoint = lastPoint;
	let nextSControl = lastPoint;
	let nextTControl = lastPoint;
	let pathIndex = 0;
	//let d = "";

	for (let i = 0; i < segments.length; i++,
		//d += `${nextPoint[0]},${nextPoint[1]} `,
		lastSControl = nextSControl,
		lastTControl = nextTControl,
		nextSControl = nextPoint,
		nextTControl = nextPoint,
		lastPoint = nextPoint,
		rPoints[pathIndex].push(nextPoint)
	)
	{
		let type = segments[i].type;
		let upper_type = type.toUpperCase();

		if (!upper_type in ARG_COUNT)
			throw Error(`SegmentsToPoints: Unknown command '${type}'!`);

		let args = segments[i].values.length;
		let req_args = ARG_COUNT[upper_type];

		if (args != req_args) 
			throw Error(`SegmentsToPoints: Improper command args! (got ${args} for '${type}', expected ${req_args})`);

		let values = segments[i].values;

		if (type != upper_type)
		{
			type = upper_type;

			if      (type == "H") values[0] += lastPoint[0];
			else if (type == "V") values[0] += lastPoint[1];
			else if (type == "A")
			{
				values[6] += lastPoint[0];
				values[7] += lastPoint[1];
			}
			else if (type != "Z")
			{
				values = values.map(
					(v,i) => (v + lastPoint[i % 2])
				);
			}
		}

		values.reverse(); // Reverse so popping and pushing works from the old front

		if (type == "M")
		{
			if (rPoints[pathIndex].length > 1)
				pathIndex++;
			else
				rPoints.pop() // Empty or single-point path

			nextPoint = [ values.pop(), values.pop() ];

			rPoints.push([]);
			continue;
		}
		
		if (type == "S")
		{
			values.push(lastSControl[1])
			values.push(lastSControl[0])
			type = "C"
		}
		else if (type == "T")
		{
			values.push(lastTControl[1])
			values.push(lastTControl[0])
			type = "Q"
		}
		else if ("LHVZ".includes(type))
		{
			if      (type == "L") nextPoint = [ values.pop(), values.pop() ];
			else if (type == "H") nextPoint[0] = values.pop();
			else if (type == "V") nextPoint[1] = values.pop();
			else if (type == "Z") nextPoint = rPoints[pathIndex][0];
			continue;
		}

		// Used to sample along an edge
		let curve = CreateSVGElement("path", "temp");

		if (type == "C")
		{
			let control1 = [ values.pop(), values.pop() ];
			let control2 = [ values.pop(), values.pop() ];
			nextPoint = [ values.pop(), values.pop() ];
			nextSControl = [ 2 * nextPoint[0] - control2[0], 2 * nextPoint[1] - control2[1] ];

			if (control1[0] == lastPoint[0] && control1[1] == lastPoint[1] &&
				control2[0] == nextPoint[0] && control2[1] == nextPoint[1])
				continue;

			curve.setAttribute("d",
				`M${lastPoint[0]},${lastPoint[1]} `+
				`C${control1[0]},${control1[1]} `+
				`${control2[0]},${control2[1]} `+
				`${nextPoint[0]},${nextPoint[1]} `
			);
		}
		else if (type == "Q")
		{
			let control = [ values.pop(), values.pop() ];
			nextPoint = [ values.pop(), values.pop() ];
			nextTControl = [ 2 * nextPoint[0] - control[0], 2 * nextPoint[1] - control[1] ];

			if (control[0] == lastPoint[0] && control[1] == lastPoint[1] ||
				control[0] == nextPoint[0] && control[1] == nextPoint[1])
				continue;

			curve.setAttribute("d",
				`M${lastPoint[0]},${lastPoint[1]} `+
				`Q${control[0]},${control[1]} `+
				`${nextPoint[0]},${nextPoint[1]} `
			);
		}
		else // A
		{
			let radii = [ values.pop(), values.pop() ];
			let rotation = values.pop();
			let large_arc = values.pop();
			let sweep = values.pop();
			nextPoint = [ values.pop(), values.pop() ];

			curve.setAttribute("d",
				`M${lastPoint[0]},${lastPoint[1]} `+
				`A${radii[0]},${radii[1]} `+
				`${rotation} ${large_arc} ${sweep} `+
				`${nextPoint[0]},${nextPoint[1]} `
			);
		}

		// Some malformed geometry fails on tiny curves
		if (PointDistance(lastPoint, nextPoint) <= POLY_STEP)
			continue;

		let length = curve.getTotalLength();
		let edges = Math.ceil(length / POLY_STEP);
		let step = length / edges;

		// Sample points along curve to create a polygon
		for (let j = 1; j < edges; j++)
		{
			let point = curve.getPointAtLength(j * step);
			let pz = [ point.x, point.y ];
			rPoints[pathIndex].push( pz );
		}
	}

	rPoints = SimplifyPoints(rPoints);

	return rPoints;
}

// Takes an svg path as a string, and converts
// it to a format usable by JsClipper.
function SegmentsToCPoly(segments)
{
	return PointsToCPoly(
		SegmentsToPoints(segments)
	);
}

// Takes an svg path as an element, and converts
// it to a format usable by JsClipper.
function PathToCPoly(path)
{
	return SegmentsToCPoly(
		path.getPathData({normalize: true})
	);
}

// Takes an svg path as an ID, and converts
// it to a format usable by JsClipper.
function IdToCPoly(id)
{
	return PathToCPoly(
		document.getElementById(id)
	);
}

function SVGExtractGraphics(root)
{
	let graphics = [];
	let to_visit = Array.from(root.childNodes)
	.filter(e => e.tagName) // Remove text (newlines, spaces...)
	.map(e => (
		{
			element: e,
			transform: e.transform
				? Array.from(e.transform.baseVal)
				: [],
		}
	));

	while (to_visit.length > 0)
	{
		let e = to_visit.pop();

		if (!(e.element.tagName)) continue;

		let tag = e.element.tagName.toUpperCase();
		if (!SVG_ELEMENTS.some(t => t == tag)) continue;

		// Is not a group; push as graphical element and continue
		if (tag != "G")
		{
			// TODO: Convert colours to a non-arbitrary format such that they may be fused later
			// TODO: Store blending and transparency information
			e.fill = e.element.fill || window.getComputedStyle(e.element).getPropertyValue("fill") || "rgb(0, 0, 0)";
			e.stroke = e.element.stroke;
			e.fill_type = ClipperLib.PolyFillType.pftNonZero;
			graphics.push(e);
			continue;
		}

		// Add the group's children to be visited
		Array.from(e.element.childNodes)
		.filter(c => c.tagName)
		.forEach(c => {
			to_visit.push({
				element: c,
				transform: e.transform.concat(
					c.transform
						? Array.from(c.transform.baseVal)
						: []
				),
			});
		});
	}
	return graphics;
}

function GraphicsToLayers(graphics)
{
	return graphics
	.filter(e => e.element.tagName && e.element.tagName.toUpperCase() == "PATH") // TODO: Support ELLIPSE, CIRCLE, POLYGON, RECT, TEXT
	.map(e => {
		segments = e.element.getPathData();
		e.points = SegmentsToPoints(segments); // TODO: Respect stroke data by using jsclipper offset functions, and difference clipping

		if (e.transform.length > 0)
		{
			let transform = e.transform.length > 1
			? e.transform.reduce((p,c) => p.appendItem(c), new SVGTransformList()).consolidate()
			: e.transform[0];

			let matrix = transform.matrix;

			// Apply transform to get true coordinates
			e.points = e.points.map(p => p.map(v => [
				v[0] * matrix.a + v[1] * matrix.c + matrix.e,
				v[0] * matrix.b + v[1] * matrix.d + matrix.f
			]));
		}

		e.poly = PointsToCPoly(e.points);
		e.poly = ClipperLib.Clipper.SimplifyPolygons(e.poly, ClipperLib.PolyFillType.pftNonZero);
		e.poly = ClipperLib.Clipper.CleanPolygons(e.poly, CLEANUP_DELTA * WORKING_SCALE);

		delete e.points;
		delete e.transform;

		return e;
	});
}

// Takes layers and clips what each layer occludes from beneath
function ClipOccludedLayers(layers)
{
	let clip_polys = [];

	let clipper = new ClipperLib.Clipper();

	return layers
	.map(
		layer => {
			let subj_poly = layer.poly;

			if (clip_polys.length == 0)
			{
				clip_polys = clip_polys.concat(subj_poly);
				layer.poly = subj_poly;
				return layer;
			}

			let solution_paths = new ClipperLib.Paths();

			// TODO: Respect transparency and non-opaque blend modes with separate stack
			clipper.Clear();
			clipper.AddPaths(subj_poly, ClipperLib.PolyType.ptSubject, true);
			clipper.AddPaths(clip_polys, ClipperLib.PolyType.ptClip, true);
			clipper.Execute(
				ClipperLib.ClipType.ctDifference,
				solution_paths,
				ClipperLib.PolyFillType.pftNonZero,
				ClipperLib.PolyFillType.pftNonZero
			);

			clip_polys = clip_polys.concat(subj_poly);

			layer.poly = solution_paths;

			return layer;
		}
	)
	.filter(
		layer => layer.poly.flat(1).length > 0
	)
	.reverse();
}

function FuseLayerColours(layers)
{
	var colour_groups = {};

	layers.forEach(
		layer =>
		{
			if (!(layer.fill in colour_groups))
			{
				colour_groups[layer.fill] = [];
			}
			colour_groups[layer.fill].push(layer.poly);
		}
	);
	
	return Object.entries(colour_groups).map(
		([colour,polys]) =>
		{
			if (polys.length < 2)
			{
				return {
					poly: polys[0],
					fill: colour
				};
			}

			let subj_poly = polys[0];

			let clipper = new ClipperLib.Clipper();

			for (let i = 1; i < polys.length; i++)
			{
				let clip_poly = polys[i];

				let solution = new ClipperLib.Paths();

				clipper.Clear();
				clipper.AddPaths(subj_poly, ClipperLib.PolyType.ptSubject, true);
				clipper.AddPaths(clip_poly, ClipperLib.PolyType.ptClip, true);
				clipper.Execute(
					ClipperLib.ClipType.ctUnion,
					solution,
					ClipperLib.PolyFillType.pftNonZero,
					ClipperLib.PolyFillType.pftNonZero
				);

				subj_poly = solution;
			}

			subj_poly = ClipperLib.Clipper.SimplifyPolygons(subj_poly, ClipperLib.PolyFillType.pftNonZero);
			subj_poly = ClipperLib.Clipper.CleanPolygons(subj_poly, CLEANUP_DELTA * WORKING_SCALE);

			return {
				poly: subj_poly,
				fill: colour
			}
		}
	).filter(layer => layer.poly.flat(1).length > 0);
}

function SeparateLayerIslands(layers)
{
	let clipper = new ClipperLib.Clipper();

	let new_layers = [];
	layers.forEach(
		layer =>
		{
			let polytree = new ClipperLib.PolyTree();

			// TODO: Replace this hack with a direct convertion to polytree, if it exists (I could not find it)
			clipper.Clear();
			clipper.AddPaths(layer.poly, ClipperLib.PolyType.ptSubject, true);
			clipper.Execute(
				ClipperLib.ClipType.ctUnion,
				polytree,
				ClipperLib.PolyFillType.pftNonZero,
				ClipperLib.PolyFillType.pftNonZero
			);
			new_layers.push(layer);

			// TODO: Parse the polytree and separate disconnected islands into different layer objects
		}
	)
	return new_layers;
}

const UPLOAD_INPUT = document.getElementById("upload_input");
const SVG_NAME = document.getElementById("input_preview_name");
const SVG_PREVIEW = document.getElementById("input_preview_svg");
const BUTTON_CONVERT = document.getElementById("button-convert");
const SETTINGS = document.getElementById("rsdf-settings");

const NO_FILE_TEXT = "No file selected (0 bytes)";
SVG_NAME.textContent = NO_FILE_TEXT;

var svg_input = null;
var svg_overlay_group = null;

UPLOAD_INPUT.addEventListener("change",
	e =>
	{
		svg_overlay_group = null;

		if (svg_input)
		{
			svg_input.remove();
			svg_input = null;
		}

		let file = e.target.files[0];

		if (!file)
		{
			SVG_NAME.textContent = NO_FILE_TEXT;
			return;
		}

		const reader = new FileReader();

		reader.onload = () => {
			SVG_NAME.textContent = `"${file.name}" (${file.size} bytes)`
			SVG_PREVIEW.innerHTML = reader.result;
			svg_input = SVG_PREVIEW.querySelector("svg");
			// Remove svg size so it fits to the page
			// The viewbox will still take care of units & aspect
			svg_input.removeAttribute("width");
			svg_input.removeAttribute("height");
		};

		reader.onerror = () => {
			showMessage("Error reading the file. Please try again.", "error");
			SVG_NAME.textContent = NO_FILE_TEXT;
			SVG_PREVIEW.innerHTML = "";
		};

		reader.readAsText(file);
	}
);

SETTINGS.addEventListener("submit",
	e =>
	{
		e.preventDefault();

		if (svg_overlay_group)
		{
			svg_overlay_group.innerHTML = "";
		}
		else
		{
			svg_overlay_group = CreateSVGElement("g","overlay")
			svg_input.appendChild(svg_overlay_group);
		}

		// TODO?: Support high-resolution bitmaps (completely different pipeline, but common use-case)
		if (!svg_input) return;
		let graphics = SVGExtractGraphics(svg_input);
		let layers = GraphicsToLayers(graphics);
		layers = ClipOccludedLayers(layers);
		layers = FuseLayerColours(layers);
		layers = SeparateLayerIslands(layers);
		// TODO: Construct graph from region adjacency
		// TODO: 4-colour graph as basis for rsdf
		// TODO: Render an SDF image for each colour
		// TODO: Composite SDF images into channel packed RSDF
		console.log(layers)

		layers.forEach(
			(layer, i) => 
			{
				let fill = oklch_normalised_wheel(1, 1, i / layers.length - .083);
				//let fill = oklch_normalised_random(1, 1, 0.5, 1, 0, 1);
				AddPaths(
					svg_overlay_group,
					PathsToString(
						CPolyToPoints(layer.poly)
					),
					fill,
					"#F00",
					1
				);
			}
		);
	}
);