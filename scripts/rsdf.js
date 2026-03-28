const POLY_STEP = Math.pow(2,-11);
const CLEANUP_DELTA = POLY_STEP * Math.pow(2,-4);
const WORKING_SCALE = Math.pow(2,16);
const DEBUG_LINE_THICKNESS = Math.pow(2,-11);
const ADJACENCY_MAX_DISTANCE = POLY_STEP * Math.pow(2,-1);
const ADJACENCY_ANGLE_STEPS = Math.pow(2,8);
const MIN_AREA = Math.pow(2,-18);
let svg_size = 5;
const SDF_SIZE = Math.pow(2,8); // Size of rendered sdf
const SDF_PERPENDICULAR = false; // Whether distance should be perpendicular rather than euclidean
const SDF_INVERT = false; // Whether to map distances from [0,1] to [1,0]
const SDF_INNER_RANGE = 1; // Pixels relative to size of image
const SDF_OUTER_RANGE = 1; // Pixels relative to size of image

const UNION_ID        = "UNION";
const INTERSECTION_ID = "INTERSECTION";
const DIFFERENCE_ID   = "DIFFERENCE";
const XOR_ID          = "XOR";

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

// Consider this a multiplication in the form:
// ┌             ┐   ┌     ┐
// │ m.a m.c m.e │   | v.0 │
// │ m.b m.d m.f │ × │ v.1 │
// │  0   0   1  │   |  1  │
// └             ┘   └     ┘
function SVGMatMulVec(m,v)
{
	return [
		v[0] * m.a + v[1] * m.c + m.e,
		v[0] * m.b + v[1] * m.d + m.f,
	];
}

function DotProduct(a,b)
{
	return a[0] * b[0] + a[1] * b[1];
}

function PointsEqual(a,b)
{
	return a[0] == b[0] && a[1] == b[1];
}

function CreateSVGElement(name) {
	return document.createElementNS("http://www.w3.org/2000/svg", name);
}

function PointDistance(a,b) {
	let dx = a[0] - b[0];
	let dy = a[1] - b[1];
	return Math.sqrt(dx * dx + dy * dy);
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
	let cpoly = points.map(p => p.map(v => ({ X:v[0], Y:v[1] })));
	ClipperLib.JS.ScaleUpPaths(cpoly, WORKING_SCALE / svg_size);
	return cpoly;
}

function CPolyToPoints(cpoly)
{
	ClipperLib.JS.ScaleDownPaths(cpoly, WORKING_SCALE / svg_size);
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
	return points
	.filter(p => p.length > 1)
	.map(p => p
		.slice(1)
		.reduce(
			(prev,cur) => !PointsEqual(cur,prev.at(-1))
				? prev.concat([cur])
				: prev,
			[p[0]]
		)
	)
	.filter(p => p.length > 1);
}

// Using a mean of points for now.
// For a more accurate center, the points may be
// triangulated and combined with a corresponding "mass".
function PointsToCenter(points)
{
	let sum = [0,0];
	let count = 0;
	points.forEach(
		p => p.forEach(
			v => {
				sum[0] += v[0];
				sum[1] += v[1];
				count++;
			}
		)
	);
	return count > 0 ? [sum[0] / count, sum[1] / count] : undefined;
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
	let nextPoint = [0,0];
	let nextSControl = undefined;
	let nextTControl = undefined;

	// Used to sample along an edge
	let curve = CreateSVGElement("path", "temp");

	segments.forEach(segment =>
	{
		if (nextPoint)
		{
			curPath.push([...nextPoint]);
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
				values[5] += lastPoint[0];
				values[6] += lastPoint[1];
			}
			else if (type == "H") values[0] += lastPoint[0];
			else if (type == "V") values[0] += lastPoint[1];
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
			if (curPath.length <= 1)
				rPoints.pop(); // Empty or single-point path

			nextPoint = [ values.pop(), values.pop() ];

			curPath = []
			rPoints.push(curPath);
			return;
		}
		
		if ("LHVZ".includes(type))
		{
			if      (type == "L") nextPoint = [ values.pop(), values.pop() ];
			else if (type == "H") nextPoint = [ values.pop(), lastPoint[1] ];
			else if (type == "V") nextPoint = [ lastPoint[0], values.pop() ];
			else if (type == "Z") nextPoint = curPath[0];
			return;
		}
		
		let d = `M${lastPoint[0]},${lastPoint[1]} `

		if (type == "C" || type == "S")
		{			
			let control1 = type == "C"
				? [ values.pop(), values.pop() ]
				: lastSControl;
			let control2 = [ values.pop(), values.pop() ];
			nextPoint = [ values.pop(), values.pop() ];
			nextSControl = [ 2 * nextPoint[0] - control2[0], 2 * nextPoint[1] - control2[1] ];

			if ((PointsEqual(control1,lastPoint) || PointsEqual(control1,nextPoint)) &&
				(PointsEqual(control2,lastPoint) || PointsEqual(control2,nextPoint)))
				return;

			d += `C${control1[0]},${control1[1]} ${control2[0]},${control2[1]}`;
		}
		else if (type == "Q" || type == "T")
		{			
			let control = type == "Q"
				? [ values.pop(), values.pop() ]
				: lastTControl;
			nextPoint = [ values.pop(), values.pop() ];
			nextTControl = [ 2 * nextPoint[0] - control[0], 2 * nextPoint[1] - control[1] ];

			if (PointsEqual(control,lastPoint) || PointsEqual(control, nextPoint))
				return;

			d += `Q${control[0]},${control[1]}`;
		}
		else // A
		{
			let radii = [ values.pop(), values.pop() ];
			let rotation = values.pop();
			let large_arc = values.pop();
			let sweep = values.pop();
			nextPoint = [ values.pop(), values.pop() ];
				
			d += `A${radii[0]},${radii[1]} ${rotation} ${large_arc} ${sweep}`;
		}
		
		d += ` ${nextPoint[0]},${nextPoint[1]}`;
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
			let pz = [ point.x, point.y ];
			curPath.push( pz );
		}
	});

	curve.remove();

	if (nextPoint)
		curPath.push(nextPoint);

	return SimplifyPoints(rPoints);
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
			[x,y],[x+w,y],[x+w,y+h],[x,y+h]
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
	.filter(e => e.element.tagName && ["PATH","RECT"].includes(e.element.tagName.toUpperCase())) // TODO: Support ELLIPSE, CIRCLE, POLYGON, TEXT
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
			}
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
			)
		}
	)
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
						tangent_angle = Math.round(tangent_angle * ADJACENCY_ANGLE_STEPS / Math.PI) % ADJACENCY_ANGLE_STEPS;
						let tangent = [
							Math.cos(tangent_angle / ADJACENCY_ANGLE_STEPS * Math.PI),
							Math.sin(tangent_angle / ADJACENCY_ANGLE_STEPS * Math.PI)
						];

						let minTangent = DotProduct(tangent,[v1.X,v1.Y]);
						let maxTangent = DotProduct(tangent,[v2.X,v2.Y]);

						if (maxTangent < minTangent)
							[minTangent, maxTangent] = [maxTangent,minTangent];

						let normal = [-tangent[1],tangent[0]];
						let offset = DotProduct(normal, [ v1.X + v2.X, v1.Y + v2.Y ]) * .5;

						let plane = `${tangent_angle},${Math.round(offset / (ADJACENCY_MAX_DISTANCE * WORKING_SCALE))}`;

						if (!p3.has(plane))
							p3.set(plane,[]);
						
						p3.get(plane).push(
							{
								min: minTangent,
								max: maxTangent,
								index:layerIndex
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
		layer.neighbour_colours = new Map([
			[COLOUR1_COLOUR,0],
			[COLOUR2_COLOUR,0],
			[COLOUR3_COLOUR,0],
			[COLOUR4_COLOUR,0],
			[UNKNOWN_COLOUR,0]
		]);
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
	layerIndex,
	pathIndex,
	edgeIndex
	)
{
	vert1 = [vert1.X,vert1.Y];
	vert2 = [vert2.X,vert2.Y];
	point = [point.X,point.Y];

	if (PointsEqual(vert1,vert2))
	{
		let dist = PointDistance(vert1, point);
		return {
			euclidean: dist,
			perpendicular: dist,
			layer: layerIndex,
			path: pathIndex,
			edge: edgeIndex
		};
	}

	vert2[0] -= vert1[0];
	vert2[1] -= vert1[1];
	point[0] -= vert1[0];
	point[1] -= vert1[1];

	let edgeLen = Math.sqrt(vert2[0] * vert2[0] + vert2[1] * vert2[1]);

	// TODO: Precalculate tangent/normal/length onto vertices
	let tangent = [
		vert2[0] / edgeLen,
		vert2[1] / edgeLen
	];
	let normal = [
		tangent[1],
		-tangent[0]
	];

	let t = DotProduct(point,tangent)
	t = Math.max(0,Math.min(t, edgeLen));

	let closest = [
		tangent[0] * t,
		tangent[1] * t
	];

	let pDist = DotProduct(point, normal);

	// TODO: Consider surrounding edges for better estimation for sign
	let sign = pDist < 0 ? -1 : 1; // Can't use Math.sign because it returns 0

	return {
		euclidean: PointDistance(point, closest) * sign,
		perpendicular: pDist,
		layer: layerIndex,
		path: pathIndex,
		edge: edgeIndex
	};
}

function GetClosestDist(dista, distb)
{
	if (Math.abs(dista.euclidean) < Math.abs(distb.euclidean))
		return dista;

	if (Math.abs(dista.euclidean) > Math.abs(distb.euclidean))
		return distb;

	// Possibly incorrect
	if (dista.perpendicular > distb.perpendicular)
		return dista
	
	return distb;
}

// Signed distance to path as [{X:...,Y:...}...]
function GetSignedDistanceToPath(
	path,
	point,
	layerIndex,
	pathIndex,
	prevDist = {
		euclidean: Number.MAX_VALUE,
		perpendicular: Number.MAX_VALUE,
		layer: undefined,
		path: undefined,
		edge: undefined
	})
{
	return path.reduce((minDist, vert, vi) =>
		GetClosestDist(
			GetSignedDistanceToEdge(
				vert,
				path[(vi + 1) % path.length],
				point,
				layerIndex,
				pathIndex,
				vi
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
	layerIndex, 
	prevDist = {
		euclidean: Number.MAX_VALUE,
		perpendicular: Number.MAX_VALUE,
		layer: undefined,
		path: undefined,
		edge: undefined
	})
{
	return polygon.reduce((minDist, path, pi) =>
		GetSignedDistanceToPath(
			path,
			point,
			layerIndex,
			pi,
			minDist
		),
		prevDist
	);
}

// Signed distance to layers as [{poly:[[{X:...,Y:...}...]...]...}...]
function GetSignedDistanceToLayers(
	layers,
	point,
	prevDist = {
		euclidean: Number.MAX_VALUE,
		perpendicular: Number.MAX_VALUE,
		layer: undefined,
		path: undefined,
		edge: undefined
	}
	)
{
	return layers.reduce((minDist, layer, li) =>
		GetSignedDistanceToPolygon(
			layer.poly,
			point,
			li,
			minDist
		),
		prevDist
	);
}

// Samples an SDF field for layers assumed to be the same colour
function LayersToSDF(layers, width, height, viewbox)
{
	// TODO: Add acceleration structure to discard layers and/or paths
	let sdf = [];
	let sample = {X:0,Y:0};
	for (let row = 0; row < height; row++)
	{
		sample.Y = ((row + 0.5) / height * viewbox.h + viewbox.y) / svg_size * WORKING_SCALE;

		let rowDat = [];
		for (let col = 0; col < width; col++)
		{
			sample.X = ((col + 0.5) / width * viewbox.w + viewbox.x) / svg_size * WORKING_SCALE;

			rowDat.push(
				GetSignedDistanceToLayers(layers, sample)
			);
		}
		sdf.push(rowDat);
	}
	return sdf;
}

// Splits layers into differently coloured regions,
// then renders an SDF for each one (up to four).
// Returns a Map from Colour constants to [[{euclidean:...,perpendicular:...,layer:...,path:...,edge:...}...]...]
function ColouredLayersToSDFs(layers, width, height, viewbox)
{
	if (layers.length == 0)
		return new Map();

	// Separate layers into groups of single colours
	let colouredLayers = layers.reduce(
		(prev, layer, li) =>
		{
			// Used to map back to indexes in the original layers list,
			// after sdfs are constructed with subsets of the layers with
			// different indexes.
			layer.original_index = li;

			if(!prev.has(layer.graph_colour))
				prev.set(layer.graph_colour,[]);
			prev.get(layer.graph_colour).push(layer);

			return prev;
		},
		new Map()
	);

	// Create a different SDF for each colour
	return new Map(
		[...colouredLayers.entries()]
		.map(([colour,subLayers]) => [
			colour,
			LayersToSDF(subLayers, width, height, viewbox)
			.map(row => row
				.map(sample => {
					// Set layer back to correct index
					sample.layer = sample.layer ? subLayers[sample.layer].original_index : undefined;
					return sample;
				})
			)
		])
	);
}

function SDFsToImage(
		sdfs,
		width,
		height,
		min,
		max,
		perpendicular,
		inverted,
		false_colour
	)
{
	let data = [];

	for (let i = 0; i < width * height * 4; i++)
		data.push(255);

	[...sdfs.entries()].forEach(([colour,rows]) => {
		if (colour == UNKNOWN_COLOUR)
			return;

		let index = CHANNEL_MAPPING.get(colour);

		rows
		.forEach(row => row
			.forEach(sample => {
				let dist = perpendicular
					? sample.perpendicular
					: sample.euclidean;

				dist = (dist - min) / (max - min);
				dist = dist > 0 ? (dist < 1 ? dist : 1) : 0;

				data[index] = Math.round(dist * 255);
				index += 4;
			})
		)
	});

	if (inverted)
		data = data.map(v => 255 - v);

	if (false_colour)
	{
		for (let i = 0; i < sdf_width * sdf_height * 4; i += 4)
		{
			let r = data[i+0];
			let g = data[i+1];
			let b = data[i+2];
			let a = data[i+3];
			data[i+0] = r * 2 / 4 + g * 2 / 4;
			data[i+1] = g * 2 / 4 + b * 2 / 4;
			data[i+2] = b * 1 / 4 + a * 3 / 4;
			data[i+3] = 255;
		}
	}

	return data;
}

const UPLOAD_INPUT = document.getElementById("upload_input");
const SVG_NAME = document.getElementById("input_preview_name");
const SVG_PREVIEW = document.getElementById("input_preview_svg");
const BUTTON_CONVERT = document.getElementById("button-convert");
const SETTINGS = document.getElementById("rsdf-settings");
const OUTPUT_CANVAS = document.getElementById("output-canvas");

const NO_FILE_TEXT = "No file selected (0 bytes)";
SVG_NAME.textContent = NO_FILE_TEXT;

var svg_input = null;
var svg_overlay_group = null;
		
const CANVAS_CTX = OUTPUT_CANVAS.getContext('2d');

UPLOAD_INPUT.addEventListener("change",
	e =>
	{
		svg_overlay_group = null;

		svg_input?.remove();
		svg_input = null;

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

		svg_overlay_group?.remove();
		svg_overlay_group = null;
			
		// TODO?: Support high-resolution bitmaps (completely different pipeline, but common use-case)
		if (!svg_input) return;
		
		let viewbox = svg_input.getAttribute("viewBox");
		
		if (!viewbox)
			throw new Error("SVG has no viewBox!");
		
		viewbox = viewbox.split(/\s+|,/);

		viewbox = {
			x: viewbox[0],
			y: viewbox[1],
			w: viewbox[2],
			h: viewbox[3]
		};
		
		svg_size = Math.max(viewbox.w,viewbox.h);

		let sdf_width = SDF_SIZE;
		let sdf_height = SDF_SIZE;

		if (viewbox.w > viewbox.h)
			sdf_height = Math.round(SDF_SIZE * viewbox.h / viewbox.w);
		else
			sdf_width = Math.round(SDF_SIZE * viewbox.w / viewbox.h);

		let sdf_min = -SDF_INNER_RANGE * WORKING_SCALE / SDF_SIZE;
		let sdf_max = SDF_OUTER_RANGE * WORKING_SCALE / SDF_SIZE;
		
		let graphics = SVGExtractGraphics(svg_input);
		let layers = GraphicsToLayers(graphics);
		layers = ClipOccludedLayers(layers);
		layers = FuseLayerColours(layers);
		layers = SeparateLayerPolys(layers);
		layers = CullSmallLayers(layers);
		layers = ConnectLayers(layers);
		layers = GraphColourLayers(layers);
		
		svg_overlay_group = CreateSVGElement("g","overlay")
		svg_input.appendChild(svg_overlay_group);

		layers.forEach(
			layer => {
				layer.points = CPolyToPoints(layer.poly);
				layer.center = PointsToCenter(layer.points);
			}
		);
		
		layers.forEach(
			(layer, i) => 
			{
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
			}
		);
		
		layers.forEach(
			(layer, i) =>
			{
				layer.connections.forEach(
					connection => {
						if (connection.index < i)
							return;
						
						let line = CreateSVGElement("line");
				
						SetAttributes(
							line,
							{
								stroke: "#F00",
								"stroke-width": svg_size * DEBUG_LINE_THICKNESS,
								"stroke-linejoin": "round",
								x1: layer.center[0],
								y1: layer.center[1],
								x2: connection.layer.center[0],
								y2: connection.layer.center[1],
								r: 5
							}
						);
						
						svg_overlay_group.appendChild(line);
					}
				);
				
				let fill = VISUALISATION_COLOURS.get(layer.graph_colour);
				//let fill = oklch_normalised_wheel(1, 1, i / layers.length - .083 + (i % 2) * 0.5);
				//let fill = oklch_normalised_random(1, 1, 0.5, 1, 0, 1);
				
				let circle = CreateSVGElement("circle");
				
				SetAttributes(
					circle,
					{
						fill: fill,
						stroke: "#F00",
						"stroke-width": svg_size * DEBUG_LINE_THICKNESS,
						"stroke-linejoin": "round",
						cx: layer.center[0],
						cy: layer.center[1],
						r: svg_size * DEBUG_LINE_THICKNESS * 4
					}
				);
				
				svg_overlay_group.appendChild(circle);
			}
		);

		let sdfs = ColouredLayersToSDFs(layers, sdf_width, sdf_height, viewbox);

		let sdf_img = SDFsToImage(
			sdfs,
			sdf_width,
			sdf_height,
			sdf_min,
			sdf_max,
			SDF_PERPENDICULAR,
			SDF_INVERT,
			true
		);

		OUTPUT_CANVAS.width = sdf_width;
		OUTPUT_CANVAS.height = sdf_height;

		const img_data = CANVAS_CTX.getImageData(0,0,sdf_width,sdf_height);
		const data = img_data.data;
		sdf_img.forEach((v,i) => data[i] = v);
		CANVAS_CTX.putImageData(img_data,0,0);

		// TODO: Render corresponding colour texture for the RSDF
		// TODO: Create combined preview using RSDF sampling in a shader
	}
);