const POLY_STEP = Math.pow(2,-9);
const CLEANUP_DELTA = Math.pow(2,-20);
const WORKING_SCALE = Math.pow(2,32);
const DEBUG_LINE_THICKNESS = Math.pow(2,-11);
const ADJACENCY_MAX_DISTANCE = POLY_STEP * Math.pow(2,-1);
const ADJACENCY_ANGLE_STEPS = Math.pow(2,8);
const MIN_AREA = Math.pow(2,-18);
let svg_size = 5;
const SDF_SIZE = Math.pow(2,8); // Size of rendered sdf
const SDF_PERPENDICULAR = false; // Whether distance should be perpendicular rather than euclidean
const SDF_INVERT = false; // Whether to map distances from [0,1] to [1,0]
const SDF_SATURATE = true; // Whether to set distances to exclusively the minima. Good for debugging, finding doubles, making colour maps by hand...
const SDF_FALSECOLOUR = false; // Whether the SDF should render with false colour (fully opaque within 3 channels)
const SDF_INNER_RANGE = 1; // Pixels relative to size of image
const SDF_OUTER_RANGE = 1; // Pixels relative to size of image
const SDF_COLOUR_DEPTH = 8;
const SDF_MAX_VALUE = Math.pow(2, SDF_COLOUR_DEPTH) - 1;

const DIST_EUCLIDEAN = "de";
const DIST_PERPENDICULAR = "dp";
const DIST_LAYER = "l";

const UNKNOWN_COLOUR = -1;
const COLOUR1_COLOUR = 1;
const COLOUR2_COLOUR = 2;
const COLOUR3_COLOUR = 3;
const COLOUR4_COLOUR = 4;

const GRAPH_COLOURS = new Set([
	UNKNOWN_COLOUR,
	COLOUR1_COLOUR,
	COLOUR2_COLOUR,
	COLOUR3_COLOUR,
	COLOUR4_COLOUR
]);

const VISUALISATION_COLOURS = new Map([
	[UNKNOWN_COLOUR, "oklch(0.719 0.0000   0.00)"],
	[COLOUR1_COLOUR, "oklch(0.719 0.1635  59.72)"],
	[COLOUR2_COLOUR, "oklch(0.719 0.1635 149.72)"],
	[COLOUR3_COLOUR, "oklch(0.719 0.1635 239.72)"],
	[COLOUR4_COLOUR, "oklch(0.719 0.1635 329.72)"]
]);

const CHANNEL_MAPPING = new Map([
	[COLOUR1_COLOUR,0],
	[COLOUR2_COLOUR,1],
	[COLOUR3_COLOUR,2],
	[COLOUR4_COLOUR,3],
]);

const SVG_ELEMENTS = ["PATH","ELLIPSE","CIRCLE","POLYGON","RECT","TEXT","G"];

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

// Consider this a multiplication in the form:
// ┌             ┐   ┌     ┐
// │ m.a m.c m.e │   | v.0 │
// │ m.b m.d m.f │ × │ v.1 │
// │  0   0   1  │   |  1  │
// └             ┘   └     ┘
function SVGMatMulVec(m,v)
{
	return [
		v.X * m.a + v.Y * m.c + m.e,
		v.X * m.b + v.Y * m.d + m.f,
	];
}

function CreateSVGElement(name) {
	return document.createElementNS("http://www.w3.org/2000/svg", name);
}

function PointDotProduct(a,b)
{
	return a.X * b.X + a.Y * b.Y;
}

function PointsEqual(a,b)
{
	return a.X == b.X && a.Y == b.Y;
}

function PointAdd(a,b)
{
	return {
		X: a.X + b.X,
		Y: a.Y + b.Y
	};
}

function PointSubtract(a,b)
{
	return {
		X: a.X - b.X,
		Y: a.Y - b.Y
	};
}

function PointScale(point,scale)
{
	return {
		X: point.X * scale,
		Y: point.Y * scale
	};
}

function PointScaleInv(point,scale)
{
	return {
		X: point.X / scale,
		Y: point.Y / scale
	};
}

function PointLengthSqr(point)
{
	return PointDotProduct(point, point);
}

function PointLength(point)
{
	return Math.sqrt(
		PointLengthSqr(point)
	);
}

function PointDistance(a,b)
{
	return PointLength(
		PointSubtract(a,b)
	);
}

function PointNormalise(point)
{
	return PointScaleInv(
		point,
		PointLength(point)
	);
}

function NormalFromTangent(tangent)
{
	return {
		X: tangent.Y,
		Y: -tangent.X
	};
}

function SetAttributes(element, attributes)
{
	Object.entries(attributes).forEach(
		([k,v]) => element.setAttribute(k,v)
	);
}

function AddPaths(element, path_string, fill_colour, stroke_colour, stroke_width = 1)
{
	let path = CreateSVGElement("path");

	SetAttributes(
		path,
		{
			"d": path_string,
			"stroke": stroke_colour,
			"stroke-width": stroke_width,
			"fill": fill_colour,
			"stroke-linejoin": "round",
			"stroke-linecap": "round",
		}
	);

	element.appendChild(path);   
}

// Converts a list of vertices to a JsClipper
// compatible format.
function PointsToCPoly(points)
{
	let copied_points = JSON.parse(JSON.stringify(points));
	ClipperLib.JS.ScaleUpPaths(copied_points, WORKING_SCALE / svg_size);
	return copied_points;
}

function CPolyToPoints(cpoly)
{
	let copied_poly = JSON.parse(JSON.stringify(cpoly));
	ClipperLib.JS.ScaleDownPaths(copied_poly, WORKING_SCALE / svg_size);
	return copied_poly;
}

// Converts Paths to an SVG path string
function PathsToString(paths)
{
	return SimplifyPaths(paths).map(p => {
		let svgpath = `${p[0].X},${p[0].Y} L`

		for (let i = 1; i < p.length; i++)
			svgpath += `${p[i].X},${p[i].Y} `;

		return `M${svgpath}Z`;
	})
	.join(" ") || "M0,0";
}

function SimplifyPaths(paths)
{
	return paths
	.filter(path => path.length > 1)
	.map(path => [path[0]].concat(
		path
		.slice(1)
		.filter(
			(point,i) => !PointsEqual(point,path.at(i)),
		))
	)
	.filter(path => path.length > 1);
}

// Using a mean of points for now.
// For a more accurate center, the points may be
// triangulated and combined with a corresponding "mass".
function GetPathsCenter(paths)
{
	let sum = {X:0,Y:0};
	let count = 0;
	paths.forEach(
		path => path.forEach(
			point => {
				sum = PointAdd(sum, point);
				count++;
			}
		)
	);
	return count > 0 ? PointScaleInv(sum, count) : undefined;
}

// Takes an svg as segments, and converts them
// to a list of subpath polygon vertex lists.
// Points are [x,y] arrays.
// Returns a path list of subpath lists of points.
function SegmentsToPoints(segments)
{
	if (segments.length == 0)
		return [];

	let curPath = [];
	let rPoints = [curPath];
	let lastPoint = undefined;
	let lastSControl = undefined;
	let lastTControl = undefined;
	let nextPoint = {X:0,Y:0};
	let nextSControl = undefined;
	let nextTControl = undefined;

	// Used to sample along an edge
	let curve = CreateSVGElement("path", "temp");

	segments.forEach(segment =>
	{
		if (nextPoint)
		{
			curPath.push({X:nextPoint.X, Y:nextPoint.Y});
			lastPoint = nextPoint;
		}
		
		lastSControl = nextSControl ?? lastPoint;
		lastTControl = nextTControl ?? lastPoint;
		nextSControl = undefined;
		nextTControl = undefined;
		nextPoint = undefined;
		
		let type = segment.type;
		let upper_type = type.toUpperCase();

		if (!(upper_type in ARG_COUNT))
			throw Error(`SegmentsToPoints: Unknown command '${type}'!`);

		let args = segment.values.length;
		let req_args = ARG_COUNT[upper_type];

		if (args != req_args) 
			throw Error(`SegmentsToPoints: Improper command args! (got ${args} for '${type}', expected ${req_args})`);

		let values = [...segment.values];

		if (type != upper_type)
		{
			type = upper_type;

			if (type == "A")
			{
				values[5] += lastPoint.X;
				values[6] += lastPoint.Y;
			}
			else if (type == "H") values[0] += lastPoint.X;
			else if (type == "V") values[0] += lastPoint.Y;
			else if (type != "Z")
			{
				values = values.map(
					(v,i) => v + [lastPoint.X,lastPoint.Y][i % 2]
				);
			}
		}

		values.reverse(); // Reverse so popping and pushing works from the old front

		if (type == "M")
		{
			if (curPath.length <= 1)
				rPoints.pop(); // Empty or single-point path

			nextPoint = {X: values.pop(), Y: values.pop()};

			curPath = [];
			rPoints.push(curPath);
			return;
		}
		
		if ("LHVZ".includes(type))
		{
			if      (type == "L") nextPoint = {X: values.pop(), Y: values.pop()};
			else if (type == "H") nextPoint = {X: values.pop(), Y: lastPoint.Y};
			else if (type == "V") nextPoint = {X: lastPoint.X, Y: values.pop()};
			else if (type == "Z") nextPoint = curPath[0];
			return;
		}
		
		let d = `M${lastPoint.X},${lastPoint.Y} `;

		if (type == "C" || type == "S")
		{			
			let control1 = type == "C"
				? {X: values.pop(), Y: values.pop()}
				: lastSControl;
			let control2 = {X: values.pop(), Y: values.pop()};
			nextPoint = {X: values.pop(), Y: values.pop()};
			nextSControl = PointSubtract(PointScale(nextPoint, 2), control2);

			if ((PointsEqual(control1,lastPoint) || PointsEqual(control1,nextPoint)) &&
				(PointsEqual(control2,lastPoint) || PointsEqual(control2,nextPoint)))
				return;

			d += `C${control1.X},${control1.Y} ${control2.X},${control2.Y}`;
		}
		else if (type == "Q" || type == "T")
		{			
			let control = type == "Q"
				? {X:values.pop(), Y:values.pop()}
				: lastTControl;
			nextPoint = {X: values.pop(), Y: values.pop()};
			nextTControl = PointSubtract(PointScale(nextPoint, 2), control2);

			if (PointsEqual(control,lastPoint) || PointsEqual(control, nextPoint))
				return;

			d += `Q${control.X},${control.Y}`;
		}
		else // A
		{
			let radii = {X: values.pop(), Y: values.pop()};
			let rotation = values.pop();
			let large_arc = values.pop();
			let sweep = values.pop();
			nextPoint = {X: values.pop(), Y: values.pop()};
				
			d += `A${radii.X},${radii.Y} ${rotation} ${large_arc} ${sweep}`;
		}
		
		d += ` ${nextPoint.X},${nextPoint.Y}`;
		curve.setAttribute("d",d);

		// Some malformed geometry fails on tiny curves
		if (PointDistance(lastPoint, nextPoint) <= POLY_STEP * svg_size)
			return;

		let length = curve.getTotalLength();

		if (length < 0)
			throw Error(`SegmentsToPoints: Length of curve is '${length}'! (${segments[i].type + segments[i].values.join(" ")})`);

		let edges = Math.ceil(length / (POLY_STEP * svg_size));
		let step = length / edges;

		// Sample points along curve to create a polygon
		for (let j = 1; j < edges; j++)
		{
			let point = curve.getPointAtLength(j * step);
			curPath.push({X: point.x, Y: point.y});
		}
	});

	curve.remove();

	if (nextPoint)
		curPath.push(nextPoint);

	return SimplifyPaths(rPoints);
}

function SVGRectToPoints(rect)
{
	let x = Number(rect.getAttribute("x") ?? 0);
	let y = Number(rect.getAttribute("y") ?? 0);
	let w = Number(rect.getAttribute("width") ?? 0);
	let h = Number(rect.getAttribute("height") ?? 0);
	let rx = Number((rect.getAttribute("rx") ?? rect.getAttribute("ry")) ?? 0);
	let ry = Number((rect.getAttribute("ry") ?? rect.getAttribute("rx")) ?? 0);

	if (rx == 0 || ry == 0)
	{
		return [[
			{X:x,  Y:y  },
			{X:x+w,Y:y  },
			{X:x+w,Y:y+h},
			{X:x,  Y:y+h}
		]];
	}

	let segments = [
		{type: "M", values: [x + rx, y]},
		{type: "h", values: [w - rx * 2], value: w - rx * 2},
		{type: "a", values: [rx,ry,0,0,1,rx,ry]},
		{type: "v", values: [h - ry * 2], value: h - ry * 2},
		{type: "a", values: [rx,ry,0,0,1,-rx,ry]},
		{type: "h", values: [-(w - rx * 2)], value: -(w - rx * 2)},
		{type: "a", values: [rx,ry,0,0,1,-rx,-ry]},
		{type: "v", values: [-(h - ry * 2)], value: -(h - ry * 2)},
		{type: "a", values: [rx,ry,0,0,1,rx,-ry]}
	];

	return SegmentsToPoints(segments);
}

function SVGPathToPoints(path)
{
	return SegmentsToPoints(path.getPathData());
}

function SVGElementToPoints(element)
{
	let tag = element.tagName.toUpperCase();
	switch(tag)
	{
		case "RECT": return SVGRectToPoints(element);
		case "PATH": return SVGPathToPoints(element);
	}
	throw Error(`SVGElementToPoints: Unknown element tag '${element.tagName}'`);
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
	let to_visit = Array.from(root.children)
	.map(child => (
		{
			element: child,
			matrix: child.transform?.baseVal.consolidate()?.matrix ?? new DOMMatrix()
		}
	));

	while (to_visit.length > 0)
	{
		let e = to_visit.pop();

		let tag = e.element.tagName.toUpperCase();
		if (!SVG_ELEMENTS.includes(tag)) continue;

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
		Array.from(e.element.children)
		.forEach(
			child => to_visit.push({
				element: child,
				matrix: (child.transform?.baseVal.numberOfItems ?? 0) > 0
					? DOMMatrix.fromMatrix(e.matrix).multiplySelf(
						child.transform.baseVal.consolidate().matrix
					)
					: e.matrix
			}),
		);
	}
	return graphics.reverse(); // Reverse since the search was performed back-to-front
}

function GraphicsToLayers(graphics)
{
	return graphics
	.filter(e => e.element.tagName &&
		// TODO: Support ELLIPSE, CIRCLE, POLYGON, TEXT
		["PATH","RECT"].includes(e.element.tagName.toUpperCase()))
	.map(e => {
		e.points = SVGElementToPoints(e.element);
		// TODO: Respect stroke data by using jsclipper offset functions, and difference clipping

		if (!e.matrix.isIdentity)
		{
			let matrix = e.matrix;

			// Apply transform to get true coordinates
			e.points = e.points.map(p => p.map(v => 
				SVGMatMulVec(matrix, v)
			));
		}

		e.poly = PointsToCPoly(e.points);
		e.poly = ClipperLib.Clipper.SimplifyPolygons(e.poly, ClipperLib.PolyFillType.pftNonZero);
		e.poly = ClipperLib.Clipper.CleanPolygons(e.poly, CLEANUP_DELTA * WORKING_SCALE);

		delete e.points;
		delete e.matrix;

		return e;
	});
}

// Takes layers and clips what each layer occludes from beneath
function ClipOccludedLayers(layers)
{
	let clip_polys = [];

	let clipper = new ClipperLib.Clipper();

	return layers
	.reverse() // Start from top layer
	.map(
		layer => {
			if (clip_polys.length == 0)
			{
				clip_polys = clip_polys.concat(layer.poly);
				return layer;
			}

			let solution_paths = new ClipperLib.Paths();

			// TODO: Respect transparency and non-opaque blend modes with separate stack
			clipper.Clear();
			clipper.AddPaths(layer.poly, ClipperLib.PolyType.ptSubject, true);
			clipper.AddPaths(clip_polys, ClipperLib.PolyType.ptClip, true);
			clipper.Execute(
				ClipperLib.ClipType.ctDifference,
				solution_paths,
				ClipperLib.PolyFillType.pftNonZero,
				ClipperLib.PolyFillType.pftNonZero
			);

			clip_polys = clip_polys.concat(layer.poly);

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
			};
		}
	).filter(layer => layer.poly.flat(1).length > 0);
}

function SeparateLayerPolys(layers)
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

			let expolygons = ClipperLib.JS.PolyTreeToExPolygons(polytree);
			
			expolygons.forEach(
				exp => new_layers.push({
					poly: ClipperLib.JS.ExPolygonsToPaths([exp]),
					fill: layer.fill
				})
			);
		}
	);
	return new_layers;
}

function CullSmallLayers(layers)
{
	return layers.filter(
		layer => layer.poly.reduce(
			(prev,path) => prev + ClipperLib.Clipper.Area(path),
			0
		) >= WORKING_SCALE * WORKING_SCALE * MIN_AREA
	);
}

function ConnectLayers(layers)
{
	let connections = [
		...layers.reduce(
			(p1,layer,layerIndex) => layer.poly.reduce(
				(p2,path) => path.reduce(
					(p3,v,i) =>
					{
						let v1 = {X:v.X,Y:v.Y};
						let v2 = path[(i + 1) % path.length];
						v2 = {X:v2.X,Y:v2.Y};

						if (v2.X < v1.X || (v2.X == v1.X && v2.Y < v1.Y))
							[v1,v2] = [v2,v1];
						
						let tangent_angle = Math.atan2(v2.Y - v1.Y, v2.X - v1.X);
						tangent_angle = Math.round(
							tangent_angle * ADJACENCY_ANGLE_STEPS / Math.PI
						) % ADJACENCY_ANGLE_STEPS;
						let tangent = {
							X: Math.cos(tangent_angle / ADJACENCY_ANGLE_STEPS * Math.PI),
							Y: Math.sin(tangent_angle / ADJACENCY_ANGLE_STEPS * Math.PI)
						};

						let minTangent = PointDotProduct(tangent,v1);
						let maxTangent = PointDotProduct(tangent,v2);

						if (maxTangent < minTangent)
							[minTangent, maxTangent] = [maxTangent,minTangent];

						let normal = NormalFromTangent(tangent);
						let offset = PointDotProduct(normal, PointAdd(v1,v2)) * .5;

						let plane = `${tangent_angle},${Math.round(offset / (ADJACENCY_MAX_DISTANCE * WORKING_SCALE))}`;

						if (!p3.has(plane))
							p3.set(plane,[]);
						
						p3.get(plane).push({
							min: minTangent,
							max: maxTangent,
							index: layerIndex
						});
						return p3;
					},
					p2
				),
				p1
			),
			new Map()
		)
	]
	.filter(
		([k,v]) => v.length > 1
	)
	.reduce((nodeList,[k,v]) => 
		{
			for (let i = 0; i < v.length - 1; i++)
			{
				for (let j = i + 1; j < v.length; j++)
				{
					if (v[i].max < v[j].min || v[i].min > v[j].max)
						continue;

					if (!(v[i].index in nodeList))
						nodeList[v[i].index] = new Set();
					if (!(v[j].index in nodeList))
						nodeList[v[j].index] = new Set();
					
					nodeList[v[i].index].add(v[j].index);
					nodeList[v[j].index].add(v[i].index);
				}
			}
			
			return nodeList;
		},
		{}
	);
	
	// TODO: Annotate distances between all regions
	
	layers.forEach(
		(layer, layerIndex) =>
			layer.connections = [...(connections?.[layerIndex] ?? [])]
			.map(
				connectionIndex => ({
					layer: layers[connectionIndex],
					index: connectionIndex
				})
			)
	);
	
	return layers;
}

function GetPossibleLayerColours(layer)
{
	return new Set(
		[...layer.neighbour_colours]
		.filter(([k,v]) => k != UNKNOWN_COLOUR && v == 0)
		.map(([k,v]) => k)
	);
}

function MarkLayerColour(layer, colour)
{
	if (layer.graph_colour == colour)
		return;

	layer.connections.forEach(
		c => {
			c.layer.neighbour_colours.set(
				layer.graph_colour,
				c.layer.neighbour_colours.get(
					layer.graph_colour
				 ) - 1
			);
			c.layer.neighbour_colours.set(
				colour,
				c.layer.neighbour_colours.get(
					colour
				 ) + 1
			);
		}
	);

	layer.graph_colour = colour;
}

function GraphColourLayers(layers)
{
	if (layers.length == 0)
		return;

	let input = new Set();
	let unknown = new Set();

	layers
	.forEach((layer,i) => {
		input.add(i);
		unknown.add(i);
		layer.graph_colour ??= UNKNOWN_COLOUR;
	});
	layers
	.forEach(layer => {
		layer.neighbour_colours = new Map(
			[...GRAPH_COLOURS]
				.map(colour => [colour,0])
		);
		layer.connections.forEach(connection =>
			layer.neighbour_colours.set(
				connection.layer.graph_colour, 
				layer.neighbour_colours.get(
					connection.layer.graph_colour
				) + 1
			)
		);
	});

	let trivialGroups = [];

	do
	{
		// TODO: modify trivial extraction, and forced placement,
		// to only check dirty nodes.
		for (let i = 0; i < input.size; i++)
		{
			let li = [...input][i];
			let layer = layers[li];
			let possibleColours = GetPossibleLayerColours(layer);

			if (possibleColours.size > 1)
				continue;

			if (possibleColours.size == 0)
				throw new Error("Cannot colour graph!");				

			MarkLayerColour(layer,[...possibleColours][0]);
			input.delete(li);
			i = -1;
		}

		if (input.size == 0)
			break;

		let trivial = new Set(
			[...input]
			.filter(li => {
				let possibleColours = GetPossibleLayerColours(layers[li])
				.size;

				let unknownNeighbours = layers[li]
				.connections
				.filter(connection =>
					input.has(connection.index) &&
					connection.layer.graph_colour == UNKNOWN_COLOUR
				).length;

				return possibleColours > unknownNeighbours;
			})
		);

		if (trivial.size > 0) 
		{
			trivialGroups.push(trivial);
			input = input.difference(trivial);
			continue;
		}

		// TODO: Replace sort by neighbour count with a sort by odd cycle count
		let mostConnected = [...input]
		.slice(1)
		.reduce((p,c) =>
			layers[c].connections.length > layers[p].connections.length
				? c
				: p,
			[...input][0]
		);

		// TODO: Add more sophisticated code for cases where naive placement fails
		// (Create a solver function that checks if a result is possible)

		MarkLayerColour(
			layers[mostConnected],
			[...GetPossibleLayerColours(
				layers[mostConnected]
			)][0]
		);

		input.delete(mostConnected);
	}
	while (input.size > 0);

	// TODO: Add code to maximise distance between repeated colours
	trivialGroups
	.reverse()
	.forEach(tg =>
		[...tg].sort((a,b) =>
			layers[a].neighbour_colours.get(UNKNOWN_COLOUR) -
			layers[b].neighbour_colours.get(UNKNOWN_COLOUR)
		)
		.forEach(li => { 
			let colours = [...GetPossibleLayerColours(
				layers[li]
			)];
			MarkLayerColour(
				layers[li],
				// TODO: Replace random selection with
				// deterministic distance-optimised colour
				colours[Math.floor(Math.random() * colours.length)]
			);
		})
	);
	
	return layers;
}

function GetSignedDistanceToEdge(
	vert1,
	vert2,
	point,
	layer,
	)
{
	let to_return = {};
	to_return[DIST_LAYER] = layer;

	if (PointsEqual(vert1,vert2))
	{
		let dist = PointDistance(vert1, point);
		to_return[DIST_EUCLIDEAN] = dist;
		to_return[DIST_PERPENDICULAR] = dist;
		return to_return;
	}

	let _point = PointSubtract(point, vert1);

	let t = PointDotProduct(_point, vert1.edge_tangent) / vert1.edge_len;

	let closest;
	
	if (t <= 0)
	{
		if (PointDotProduct(
			_point,
			vert1.point_tangent
		) < 0)
			return undefined;
		
		closest = {X:0,Y:0};
	}
	else if (t >= 1)
	{
		if (PointDotProduct(
			PointSubtract(
				_point,
				vert1.to_next
			),
			vert2.point_tangent
		) > 0)
			return undefined;
		
		closest = vert1.to_next;
	}
	else
		closest = PointScale(vert1.to_next, t);

	to_return[DIST_PERPENDICULAR] = PointDotProduct(_point, vert1.edge_normal);

	// TODO: Consider surrounding edges for better estimation for sign
	let sign = to_return[DIST_PERPENDICULAR] < 0 ? -1 : 1; // Can't use Math.sign because it returns 0

	to_return[DIST_EUCLIDEAN] = PointDistance(_point, closest) * sign;

	return to_return;
}

function GetClosestDist(dista, distb)
{
	if (dista == undefined)
		return distb;

	if (distb == undefined)
		return dista;

	if (Math.abs(dista[DIST_EUCLIDEAN]) < Math.abs(distb[DIST_EUCLIDEAN]))
		return dista;

	if (Math.abs(dista[DIST_EUCLIDEAN]) > Math.abs(distb[DIST_EUCLIDEAN]))
		return distb;

	if (Math.abs(dista[DIST_PERPENDICULAR]) < Math.abs(distb[DIST_PERPENDICULAR]))
		return dista
	
	return distb;
}

// Signed distance to path as [{X:...,Y:...}...]
function GetSignedDistanceToPath(
	path,
	point,
	layer,
	prevDist = undefined
)
{
	return path.reduce((minDist, vert, vi) =>
		GetClosestDist(
			GetSignedDistanceToEdge(
				vert,
				path[(vi + 1) % path.length],
				point,
				layer,
			),
			minDist
		),
		prevDist
	);
}

// Signed distance to polygon as [[{X:...,Y:...}...]...], and point as {X:...,Y:...}
function GetSignedDistanceToPolygon(
	polygon, 
	point, 
	layer, 
	prevDist = undefined
)
{
	return polygon.reduce((minDist, path) =>
		GetSignedDistanceToPath(
			path,
			point,
			layer,
			minDist
		),
		prevDist
	);
}

// Signed distance to layers as [{poly:[[{X:...,Y:...}...]...]...}...]
function GetSignedDistanceToLayers(
	layers,
	point,
	prevDist = undefined
)
{
	return layers.reduce((minDist, layer) =>
		GetSignedDistanceToPolygon(
			layer.poly,
			point,
			layer,
			minDist
		),
		prevDist
	);
}

// Samples an SDF field for layers assumed to be the same colour
function LayersToSDF(layers, width, height, viewbox)
{
	console.time("LayersToSDF");

	// TODO: Add acceleration structure to discard layers and/or paths
	let sdf = [];
	let sample = {X:0,Y:0};
	for (let row = 0; row < height; row++)
	{
		sample.Y = ((row + 0.5) / height * viewbox.h + viewbox.y) * WORKING_SCALE / svg_size;

		let rowDat = [];
		for (let col = 0; col < width; col++)
		{
			sample.X = ((col + 0.5) / width * viewbox.w + viewbox.x) * WORKING_SCALE / svg_size;

			rowDat.push(
				GetSignedDistanceToLayers(layers, sample)
			);
		}
		sdf.push(rowDat);
	}

	console.timeEnd("LayersToSDF");

	return sdf;
}

// Splits layers into differently coloured regions,
// then renders an SDF for each one (up to four).
// Returns a Map from Colour constants to [[{euclidean:...,perpendicular:...,layer:...,path:...,edge:...}...]...]
function ColouredLayersToSDFs(layers, width, height, viewbox)
{
	if (layers.length == 0)
		return new Map();
	
	console.time("ColouredLayersToSDFs");

	// Separate layers into groups of single colours
	let colouredLayers = layers.reduce(
		(prev, layer, li) =>
		{
			let colour = layer.graph_colour;

			if(!prev.has(colour))
				prev.set(colour,[]);

			prev.get(colour).push(layer);

			return prev;
		},
		new Map()
	);

	// Create a different SDF for each colour
	let sdfs = new Map(
		[...colouredLayers.entries()]
		.map(([colour,subLayers],index,arr) => {
			let sdf = LayersToSDF(subLayers, width, height, viewbox);
			
			console.timeLog("ColouredLayersToSDFs",`Finished SDF ${index + 1}/${arr.length}`);

			return [colour, sdf];
		})
	);

	console.timeEnd("ColouredLayersToSDFs");

	return sdfs;
}

function LayersCalculateVectors(layers)
{
	console.time("LayersCalculateVectors");

	layers
	.forEach(layer => layer.poly
		.forEach(path => {
			path
			.forEach((point, pi) => {
				let next_point = path[(pi + 1) % path.length];
				point.to_next = PointSubtract(next_point, point);
				point.edge_len = PointLength(point.to_next);
				point.edge_tangent = PointScaleInv(point.to_next, point.edge_len);
				point.edge_normal = NormalFromTangent(point.edge_tangent);
			});
			path.
			forEach((point, pi) => {
				let last_point = path.at(pi - 1);
				point.point_tangent = PointNormalise(
					PointAdd(
						last_point.edge_tangent,
						point.edge_tangent
					)
				);
			});
		})
	);

	console.timeEnd("LayersCalculateVectors");

	return layers;
}

function SDFsToImage(
		sdfs,
		width,
		height,
		min,
		max,
		perpendicular
	)
{
	let data = [];

	for (let i = 0; i < width * height * 4; i++)
		data.push(SDF_MAX_VALUE);

	[...sdfs.entries()].forEach(([colour,rows]) => {
		if (colour == UNKNOWN_COLOUR)
			return;

		let index = CHANNEL_MAPPING.get(colour);

		rows
		.forEach(row => row
			.forEach(sample => {
				let dist = perpendicular
					? sample[DIST_PERPENDICULAR]
					: sample[DIST_EUCLIDEAN];

				dist = (dist - min) / (max - min);
				dist = dist > 0 ? (dist < 1 ? dist : 1) : 0;

				data[index] = Math.round(dist * SDF_MAX_VALUE);
				index += 4;
			})
		)
	});

	return data;
}

function SaturateSDFImage(data)
{
	let data_out = []

	for (let i = 0; i+3 < data.length; i += 4)
	{
		let r = data[i+0];
		let g = data[i+1];
		let b = data[i+2];
		let a = data[i+3];
		let min = Math.min(r,g,b,a);
		data_out.push(r == min ? 0 : SDF_MAX_VALUE);
		data_out.push(g == min ? 0 : SDF_MAX_VALUE);
		data_out.push(b == min ? 0 : SDF_MAX_VALUE);
		data_out.push(a == min ? 0 : SDF_MAX_VALUE);
	}

	return data_out;
}

function InvertSDFImage(data)
{
	return data.map(v => SDF_MAX_VALUE - v);
}

function FalseColourSDFImage(data)
{
	let data_out = [];

	for (let i = 0; i+3 < data.length; i += 4)
	{
		let r = data[i+0];
		let g = data[i+1];
		let b = data[i+2];
		let a = data[i+3];
		data_out.push(r * 2 / 4 + g * 2 / 4);
		data_out.push(g * 2 / 4 + b * 2 / 4);
		data_out.push(b * 1 / 4 + a * 3 / 4);
		data_out.push(SDF_MAX_VALUE);
	}

	return data_out;
}

const UPLOAD_INPUT = document.getElementById("upload-input");
const SVG_NAME = document.getElementById("input-preview-name");
const SVG_PREVIEW = document.getElementById("input-preview-svg");
const BUTTON_CONVERT = document.getElementById("button-convert");
const BUTTON_SAVE = document.getElementById("button-save");
const SETTINGS = document.getElementById("rsdf-settings");
const OUTPUT_CANVAS = document.getElementById("output-canvas");
const FALSECOLOUR_CANVAS = document.getElementById("falsecolour-canvas");
const SATURATED_CANVAS = document.getElementById("saturated-canvas");

const NO_FILE_TEXT = "No file selected (0 bytes)";
SVG_NAME.textContent = NO_FILE_TEXT;

let svg_input = null;
let svg_overlay_group = null;
let layers = [];
let viewbox = undefined;
let filename = "";

let sdf_width = 0;
let sdf_height = 0;
let sdf_img = [];
let falsecolour_img = [];
let saturated_img = [];

const CANVAS_CTX = OUTPUT_CANVAS.getContext("2d");
const FALSECOLOUR_CTX = FALSECOLOUR_CANVAS.getContext("2d");
const SATURATED_CTX = SATURATED_CANVAS.getContext("2d");

UPLOAD_INPUT.addEventListener("change", UploadSVG);
BUTTON_CONVERT.addEventListener("click", UpdateLayers);
BUTTON_SAVE.addEventListener("click", SaveSDFs);

function UploadSVG(e)
{
	svg_overlay_group = null;

	svg_input?.remove();
	svg_input = null;

	OUTPUT_CANVAS.style.display = "none";
	SATURATED_CANVAS.style.display = "none";
	FALSECOLOUR_CANVAS.style.display = "none;"
	layers = undefined;

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
		
		viewbox = svg_input
			.getAttribute("viewBox")
			.split(/\s+|,/);

		if (viewbox.length != 4)
			throw new Error(`Expected 4 arguments for SVG viewbox, got ${viewbox.length}!`);

		filename = file.name
			.split('.')
			.slice(0,-1) // Exclude file extension
			.join(".");

		viewbox = {
			x: Number(viewbox[0]),
			y: Number(viewbox[1]),
			w: Number(viewbox[2]),
			h: Number(viewbox[3])
		};
		
		svg_size = Math.max(viewbox.w,viewbox.h);
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
	
	if (!layers)
	{
		let graphics = SVGExtractGraphics(svg_input);
		layers = GraphicsToLayers(graphics);
		// TODO: Add transparency step, intersecting lower layers and setting fills to stacks of blends
		layers = ClipOccludedLayers(layers);
		layers = FuseLayerColours(layers);
		layers = SeparateLayerPolys(layers);
		layers = CullSmallLayers(layers);
		layers = ConnectLayers(layers);
		layers = LayersCalculateVectors(layers);
	}
	else
	{
		layers.forEach(layer => layer.graph_colour = UNKNOWN_COLOUR);
	}

	layers = GraphColourLayers(layers);
	DisplayLayers();

	setTimeout(RenderSDF,0);
}

function DisplayLayers()
{	
	svg_overlay_group = CreateSVGElement("g","overlay");
	let edges = CreateSVGElement("g","edges");
	let nodes = CreateSVGElement("g","nodes");

	layers
	.forEach((layer, i) => {
		layer.points = CPolyToPoints(layer.poly);
		layer.center = GetPathsCenter(layer.points);

		let fill = VISUALISATION_COLOURS.get(layer.graph_colour);
		//let fill = oklch_normalised_wheel(1, 1, i / layers.length - .083 + (i % 2) * 0.5);
		//let fill = oklch_normalised_random(1, 1, 0.5, 1, 0, 1);
		AddPaths(
			svg_overlay_group,
			PathsToString(layer.points),
			fill,
			"#777",
			svg_size * DEBUG_LINE_THICKNESS
		);

		layer.connections
		.forEach(connection => {
			if (connection.index < i)
				return;
			
			let line = CreateSVGElement("line");
	
			SetAttributes(
				line,
				{
					stroke: "#F00",
					"stroke-width": svg_size * DEBUG_LINE_THICKNESS,
					"stroke-linejoin": "round",
					x1: layer.center.X,
					y1: layer.center.Y,
					x2: connection.layer.center.X,
					y2: connection.layer.center.Y,
					r: 5
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
				"stroke-width": svg_size * DEBUG_LINE_THICKNESS,
				"stroke-linejoin": "round",
				cx: layer.center.X,
				cy: layer.center.Y,
				r: svg_size * DEBUG_LINE_THICKNESS * 4
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
	sdf_width = SDF_SIZE;
	sdf_height = SDF_SIZE;

	if (viewbox.w > viewbox.h)
		sdf_height = Math.round(SDF_SIZE * viewbox.h / viewbox.w);
	else
		sdf_width = Math.round(SDF_SIZE * viewbox.w / viewbox.h);

	let sdf_min = -SDF_INNER_RANGE * WORKING_SCALE / SDF_SIZE;
	let sdf_max = SDF_OUTER_RANGE * WORKING_SCALE / SDF_SIZE;

	// Todo: Move processing to a web worker so the page does not lock up, and progress can be displayed
	let sdfs = ColouredLayersToSDFs(layers, sdf_width, sdf_height, viewbox);

	sdf_img = SDFsToImage(
		sdfs,
		sdf_width,
		sdf_height,
		sdf_min,
		sdf_max,
		SDF_PERPENDICULAR,
		SDF_SATURATE,
		SDF_INVERT,
		SDF_FALSECOLOUR
	);

	if (SDF_FALSECOLOUR)
	{
		FALSECOLOUR_CANVAS.style.display = "";
		FALSECOLOUR_CANVAS.width = sdf_width;
		FALSECOLOUR_CANVAS.height = sdf_height;

		const falsecolour_img_data = FALSECOLOUR_CTX.getImageData(0,0,sdf_width,sdf_height);
		const falsecolour_data = falsecolour_img_data.data;

		falsecolour_img = [...sdf_img];

		if (SDF_INVERT)
			falsecolour_img = InvertSDFImage(falsecolour_img);

		falsecolour_img = FalseColourSDFImage(falsecolour_img);

		falsecolour_img.forEach((v,i) => falsecolour_data[i] = v);
		FALSECOLOUR_CTX.putImageData(falsecolour_img_data,0,0);
	}

	if (SDF_SATURATE)
	{
		SATURATED_CANVAS.style.display = "";
		SATURATED_CANVAS.width = sdf_width;
		SATURATED_CANVAS.height = sdf_height;

		const saturated_img_data = SATURATED_CTX.getImageData(0,0,sdf_width,sdf_height);
		const saturated_data = saturated_img_data.data;

		saturated_img = SaturateSDFImage([...sdf_img]);

		if (SDF_INVERT)
			saturated_img = InvertSDFImage(saturated_img);

		if (SDF_FALSECOLOUR)
			saturated_img = FalseColourSDFImage(saturated_img);

		saturated_img.forEach((v,i) => saturated_data[i] = v);
		SATURATED_CTX.putImageData(saturated_img_data,0,0);
	}

	OUTPUT_CANVAS.style.display = "";
	OUTPUT_CANVAS.width = sdf_width;
	OUTPUT_CANVAS.height = sdf_height;

	const img_data = CANVAS_CTX.getImageData(0,0,sdf_width,sdf_height);
	const data = img_data.data;

	if (SDF_INVERT)
		sdf_img = InvertSDFImage(sdf_img);

	sdf_img.forEach((v,i) => data[i] = v);
	CANVAS_CTX.putImageData(img_data,0,0);

	// TODO: Render corresponding colour texture for the RSDF
	// TODO: Create combined preview using RSDF sampling in a shader
}

// https://stackoverflow.com/a/58652379
function SaveCanvas(data, width, height, name)
{
	let p = new png.PNG(
		{
			width: width,
			height: height,
			bitDepth: SDF_COLOUR_DEPTH
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
		sdf_width == sdf_height 
		? sdf_width
		: `${sdf_width}x${sdf_height}`	
	}_`;

	const inner = SDF_INNER_RANGE.toFixed(2);
	const outer = SDF_OUTER_RANGE.toFixed(2);

	const filename_suffix = `_${
		inner == outer
		? (SDF_INNER_RANGE + SDF_OUTER_RANGE).toFixed(2)
		: `-${inner}_+${outer}`
	}${
		SDF_INVERT
		? "_Inverted"
		: ""
	}`;

	if (OUTPUT_CANVAS.style.display != "none")
		SaveCanvas(
			sdf_img,
			sdf_width,
			sdf_height,
			filename_prefix + "RSDF" + filename_suffix
		);

	if (FALSECOLOUR_CANVAS.style.display != "none")
		SaveCanvas(
			falsecolour_img,
			sdf_width,
			sdf_height,
			filename_prefix + "FalseColour" + filename_suffix
		);

	if (SATURATED_CANVAS.style.display != "none")
		SaveCanvas(
			saturated_img,
			sdf_width,
			sdf_height,
			filename_prefix + "Saturated" + filename_suffix
		);
}