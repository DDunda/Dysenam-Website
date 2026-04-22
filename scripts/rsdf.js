const POLY_STEP = Math.pow(2,-9);
const CLEANUP_DELTA = Math.pow(2,-20);
const WORKING_SCALE = Math.pow(2,24);
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
const SDF_COLOUR = true; // Whether the SDF should render the image colour
const SDF_INNER_RANGE = 1; // Pixels relative to size of image
const SDF_OUTER_RANGE = 1; // Pixels relative to size of image

const BLEED = {
	CLOSEST: 0, // Pick the true closest channel
	AVERAGE: 1, // Average the minimum channels' colours
	MARK: 2 // Ignore the input colour and mark with an error colour
};

const COLOUR_DEPTH = 8;
const COLOUR_MAX_VALUE = Math.pow(2, COLOUR_DEPTH) - 1;
const COLOUR_LINEAR = false;
const COLOUR_INVALID_FILL_COLOUR = new RGB(1,0,1,1);
const COLOUR_BLEED_COLOUR = new RGB(1,0,1,1);
const COLOUR_BLEED_MODE = BLEED.CLOSEST; // If two channels share a minima, which colour do you pick?

const BVH_ENABLED = true; // Enable BVH acceleration
const BVH_LEAF_MAX_COUNT = 40; // 40 seems good for mostly straight SVGs, and 72 for mostly curved.

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

const FILL_RULES = {
	nonzero: ClipperLib.PolyFillType.pftNonZero,
	evenodd: ClipperLib.PolyFillType.pftEvenOdd,
};

function Clamp01(value)
{
	if (value <= 0)
		return 0;
	if (value >= 1)
		return 1;
	return value;
}

function Lerp(mix, min, max)
{
	return min * (1 - mix) + max * mix;
}

function GetAttributeOrStyle(element, name)
{
	return element.getAttribute(name) ??
		window.getComputedStyle(element).getPropertyValue(name);
}

function GetPolyClip(clipper, subject, clips, mode)
{
	let result = new ClipperLib.Paths();

	clipper.Clear();
	clipper.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
	clips.forEach(clip => 
		clipper.AddPaths(clip, ClipperLib.PolyType.ptClip, true)
	);
	clipper.Execute(
		mode,
		result,
		ClipperLib.PolyFillType.pftNonZero,
		ClipperLib.PolyFillType.pftNonZero
	);

	return result;
}

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
	return new Point(
		v.X * m.a + v.Y * m.c + m.e,
		v.X * m.b + v.Y * m.d + m.f,
	);
}

function CreateSVGElement(name) {
	return document.createElementNS("http://www.w3.org/2000/svg", name);
}

function NormalFromTangent(tangent)
{
	return new Point(
		tangent.Y,
		-tangent.X
	);
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
			(point,i) => !Point.Equal(point,path.at(i))
		))
	)
	.filter(path => path.length > 1);
}

// Using a mean of points for now.
// For a more accurate center, the points may be
// triangulated and combined with a corresponding "mass".
function GetPathsCenter(paths)
{
	let sum = new Point();
	let count = 0;
	paths.forEach(
		path => path.forEach(
			point => {
				sum = sum.Add(point);
				count++;
			}
		)
	);
	return count > 0 ? sum.ScaleInv(count) : undefined;
}

// Takes an svg as segments, and converts them
// to a list of subpath polygon vertex lists.
// Points are Point objects.
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
	let nextPoint = new Point();
	let nextSControl = undefined;
	let nextTControl = undefined;

	// Used to sample along an edge
	let curve = CreateSVGElement("path", "temp");

	segments.forEach(segment =>
	{
		if (nextPoint)
		{
			curPath.push(new Point(nextPoint.X, nextPoint.Y));
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

			nextPoint = new Point(values.pop(), values.pop());

			curPath = [];
			rPoints.push(curPath);
			return;
		}
		
		if ("LHVZ".includes(type))
		{
			if      (type == "L") nextPoint = new Point(values.pop(), values.pop());
			else if (type == "H") nextPoint = new Point(values.pop(), lastPoint.Y);
			else if (type == "V") nextPoint = new Point(lastPoint.X, values.pop());
			else if (type == "Z") nextPoint = curPath[0];
			return;
		}
		
		let d = `M${lastPoint.X},${lastPoint.Y} `;

		if (type == "C" || type == "S")
		{			
			let control1 = type == "C"
				? new Point(values.pop(), values.pop())
				: lastSControl;
			let control2 = new Point(values.pop(), values.pop());
			nextPoint = new Point(values.pop(), values.pop());
			nextSControl = nextPoint.Scale(2).Subtract(control2);

			if ((Point.Equal(control1,lastPoint) || Point.Equal(control1,nextPoint)) &&
				(Point.Equal(control2,lastPoint) || Point.Equal(control2,nextPoint)))
				return;

			d += `C${control1.X},${control1.Y} ${control2.X},${control2.Y}`;
		}
		else if (type == "Q" || type == "T")
		{			
			let control = type == "Q"
				? new Point(values.pop(), values.pop())
				: lastTControl;
			nextPoint = new Point(values.pop(), values.pop());
			nextTControl = nextPoint.Scale(2).Subtract(control2);

			if (Point.Equal(control,lastPoint) || Point.Equal(control, nextPoint))
				return;

			d += `Q${control.X},${control.Y}`;
		}
		else // A
		{
			let radii = new Point(values.pop(), values.pop());
			let rotation = values.pop();
			let large_arc = values.pop();
			let sweep = values.pop();
			nextPoint = new Point(values.pop(), values.pop());
				
			d += `A${radii.X},${radii.Y} ${rotation} ${large_arc} ${sweep}`;
		}
		
		d += ` ${nextPoint.X},${nextPoint.Y}`;
		curve.setAttribute("d",d);

		// Some malformed geometry fails on tiny curves
		if (Point.Distance(lastPoint, nextPoint) <= POLY_STEP * svg_size)
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
			curPath.push(new Point(point.x, point.y));
		}
	});

	curve.remove();

	if (nextPoint)
		curPath.push(nextPoint);

	return SimplifyPaths(rPoints);
}

function SVGCircleToPoints(circle)
{
	let r = circle.getAttribute("r");

	if (r === undefined)
		console.log("SVGCircleToPoints: Expected r (radius) attribute");

	r = Number(r);

	const cx = Number(circle.getAttribute("cx") ?? 0);
	const cy = Number(circle.getAttribute("cy") ?? 0);

	const segments = [
		{type: "M", values: [cx-r,cy]},
		{type: "a", values: [r,r,0,0,1,2*r,0]},
		{type: "a", values: [r,r,0,0,1,-2*r,0]}
	];

	return SegmentsToPoints(segments);
}

function SVGEllipseToPoints(ellipse)
{
	let rx = ellipse.getAttribute("rx");
	let ry = ellipse.getAttribute("ry");

	if (rx === undefined)
		console.log("SVGEllipseToPoints: Expected rx (x radius) attribute");
	if (ry === undefined)
		console.log("SVGEllipseToPoints: Expected ry (y radius) attribute");

	rx = Number(rx);
	ry = Number(ry);

	const cx = Number(ellipse.getAttribute("cx") ?? 0);
	const cy = Number(ellipse.getAttribute("cy") ?? 0);

	const segments = [
		{type: "M", values: [cx-rx,cy]},
		{type: "a", values: [rx,ry,0,0,1,2*rx,0]},
		{type: "a", values: [rx,ry,0,0,1,-2*rx,0]}
	];

	return SegmentsToPoints(segments);
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
			new Point(x,  y  ),
			new Point(x+w,y  ),
			new Point(x+w,y+h),
			new Point(x,  y+h)
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
		case "CIRCLE": return SVGCircleToPoints(element);
		case "ELLIPSE": return SVGEllipseToPoints(element);
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

function SVGExtractGraphics(element, matrix = undefined, root = element)
{
	return [...element.children]
	.map(child => ({element: child}))
	.filter(e => {
		const tag = e.element.tagName.toUpperCase();

		// Unknown element
		if (!SVG_ELEMENTS.includes(tag))
			return false;

		const computed_style = window.getComputedStyle(e.element);

		// Element is not renderered
		if (computed_style.getPropertyValue("display") == "none")
			return false;
			
		const opacity = Clamp01(Number(
			e.element.getAttribute("opacity")
			?? computed_style.getPropertyValue("opacity")
			?? 1
		));

		if (opacity <= 0)
			return false;

		const _blend_mode = window
			.getComputedStyle(e.element)
			.getPropertyValue("mix-blend-mode");

		const blend_mode = BLEND_MODE_MAP[_blend_mode] ?? BLEND_MODE.NORMAL;
		e.matrix = matrix;
		e.group = tag == "G";

		// If this element has a transform, apply the input matrix to it
		if (e.element.transform?.baseVal !== undefined &&
			e.element.transform.baseVal.numberOfItems > 0)
		{
			e.matrix = e.element.transform.baseVal.consolidate().matrix;
			e.matrix = matrix?.multiply(e.matrix) ?? e.matrix;
		}

		if (e.group)
		{
			e.opacity = opacity;
			e.blend_mode = blend_mode;
			e.children = SVGExtractGraphics(e.element, e.matrix, root);

			if (e.children.length == 0)
				return false;

			if (blend_mode == BLEND_MODE.NORMAL)
			{
				e = e.children;
				e = e.length == 1 ? e[0] : e;
				return true;
			}

			if (e.children.length > 1)
				return true;

			// If the group only has one child, collapse the group
			e.children[0].blend_mode = blend_mode;
			e = e.children[0];

			return true;
		}

		// TODO: Support POLYGON, TEXT
		if (!["PATH","RECT","CIRCLE","ELLIPSE"].includes(tag))
			return false;
		
		e.points = SVGElementToPoints(e.element);

		if (e.points.flat(1).length == 0)
			return false;

		if (!(e.matrix?.isIdentity ?? true))
		{
			// Apply transform to get true coordinates
			e.points = e.points.map(path =>
				path.map(point => 
					SVGMatMulVec(e.matrix, point)
				)
			);
		}

		const _fill_rule = GetAttributeOrStyle(e.element, "fill-rule");
		const fill_rule = FILL_RULES[_fill_rule] ?? FILL_RULES.nonzero;

		e.poly = PointsToCPoly(e.points);
		e.poly = ClipperLib.Clipper.SimplifyPolygons(e.poly, fill_rule);
		e.poly = ClipperLib.Clipper.CleanPolygons(e.poly, CLEANUP_DELTA * WORKING_SCALE);

		if (e.poly.flat(1).length == 0)
			return false;

		const bounds = e.points
		.flat(1) // Check all points
		.slice(1) // Skip the first, because it is the initial value
		.reduce((_bounds,point) => {
				_bounds.min = Point.Min(_bounds.min, point);
				_bounds.max = Point.Max(_bounds.max, point);
				return _bounds;
			},
			new Bounds(e.points[0][0], e.points[0][0])
		);

		e.paint = Paint.FromString(
			GetAttributeOrStyle(e.element, "fill"),
			bounds,
			opacity,
			blend_mode,
			root,
			COLOUR_LINEAR
		);

		// TODO: Respect stroke data by using jsclipper offset functions, and difference clipping
		//e.stroke = GetAttributeOrStyle(e.element, "stroke");

		if (e.paint === undefined)
			return false;

		if (e.paint.constructor === PaintConstant && e.paint.colour.a <= 0)
			return false;

		delete e.points;
		delete e.matrix;

		return true;
	})
	.flat(1);
}

// Takes transparent layers and composites them onto layers beneath
function FlattenGraphicsToLayers(graphics, is_root=true)
{
	if (is_root)
		console.time("FlattenGraphicsToLayers");

	graphics = graphics
	.map(graphic => {
		if (!graphic.group)
			return graphic;

		const children = FlattenGraphicsToLayers(graphic.children,false);
		if (graphic.blend_mode != BLEND_MODE.NORMAL)
			children.forEach(child =>
				child.paint.blend_mode = graphic.blend_mode
			);

		return children;
	})
	.flat(1);

	graphics = ClipOccludedLayers(graphics);

	let clipper = new ClipperLib.Clipper();

	for (let i = 1; i < graphics.length; i++)
	{
		const covering = graphics[i];

		const union_polys = [];
		const difference_polys = [];

		for (let j = 0; j < i; j++)
		{
			const covered = graphics[j];

			const composite_paint = covering.paint
				.CompositeOver(covered.paint);

			const composite_equals_covered = Paint.Equal(covered.paint, composite_paint);
			const composite_equals_covering = Paint.Equal(covering.paint, composite_paint);
			const equal_paints = Paint.Equal(covered.paint, covering.paint);
			
			// The intersection is different to both paints
			if (!covering.paint.opaque && !composite_equals_covering && !composite_equals_covered)
			{
				const intersection = GetPolyClip(
					clipper,
					covered.poly,
					[covering.poly],
					ClipperLib.ClipType.ctIntersection
				);
				
				if (intersection.flat(1).length > 0)
				{
					graphics.splice(j, 0,
						{
							paint: composite_paint,
							poly: intersection
						}
					);
					i++;
					j++;

					if (!equal_paints)
						difference_polys.push(covered.poly)
					else
						difference_polys.push(intersection);
				}
			}

			if (equal_paints) // Fuse these paints
			{
				union_polys.push(covered.poly);
				covered.poly = [];
			}
			else
			{
				if (!composite_equals_covering && composite_equals_covered) // Cut the bottom out of the top
				{
					difference_polys.push(covered.poly);
				}
				if (!composite_equals_covered) // Cut the top out of the bottom
				{
					covered.poly = GetPolyClip(
						clipper,
						covered.poly,
						[covering.poly],
						ClipperLib.ClipType.ctDifference
					);
				}
			}

			if (covered.poly.flat(1).length == 0)
			{
				graphics.splice(j,1);
				i--;
				j--;
			}
		}

		covering.poly = 
		GetPolyClip(
			clipper,
			GetPolyClip(
				clipper,
				covering.poly,
				union_polys,
				ClipperLib.ClipType.ctUnion
			),
			difference_polys,
			ClipperLib.ClipType.ctDifference
		);

		if (covering.poly.flat(1).length == 0)
		{
			graphics.splice(i,1);
			i--;
		}
	}

	graphics.filter(layer => {
		layer.poly = ClipperLib.Clipper.SimplifyPolygons(layer.poly, ClipperLib.PolyFillType.pftNonZero);
		layer.poly = ClipperLib.Clipper.CleanPolygons(layer.poly, CLEANUP_DELTA * WORKING_SCALE);
		return layer.poly.flat(1).length > 0

	});
	
	if (is_root)
		console.timeEnd("FlattenGraphicsToLayers");

	return graphics;
}

// Converts the points in a layer's polygon into a flat array of edge objects.
function LayerToEdges(layer)
{
	return layer.poly
	.map(path => path
		.map((point, i, arr) => {
			const next = arr[(i + 1) % arr.length];
			// Create edges from points
			return new Edge(
				point,
				next,
				layer,
				new Bounds(
					Point.Min(point, next),
					Point.Max(point, next)
				)
			);
		})
	)
	.flat(1);
}

// Takes layers and clips what each layer occludes from beneath
function ClipOccludedLayers(layers)
{
	const clip_polys = [];

	const clipper = new ClipperLib.Clipper();

	return layers
	.reverse() // Start from top layer
	.filter(layer => {
		if (layer.poly.flat(1).length == 0)
			return false;

		const poly_copy = [...layer.poly]
		.map(path => [...path]
			.map(point => 
				({X: point.X, Y: point.Y})
			)
		);

		if (clip_polys.length > 0)
		{
			clipper.Clear();
			clipper.AddPaths(layer.poly, ClipperLib.PolyType.ptSubject, true);
			clipper.AddPaths(clip_polys, ClipperLib.PolyType.ptClip, true);
			clipper.Execute(
				ClipperLib.ClipType.ctDifference,
				layer.poly,
				ClipperLib.PolyFillType.pftNonZero,
				ClipperLib.PolyFillType.pftNonZero
			);
		}

		if (layer.poly.flat(1).length == 0)
			return false;
		
		clip_polys.push(...layer.poly);
		clip_polys.push(...poly_copy);

		return true;
	})
	.reverse();
}

function FuseLayerPaints(layers)
{
	const paint_groups = new Map();
	const clipper = new ClipperLib.Clipper();

	layers.forEach(layer => {
		for (const [paint, arr] of paint_groups)
		{			
			if (!Paint.Equal(paint, layer.paint))
				continue;

			arr.push(layer.poly);
			return;
		}
		paint_groups.set(layer.paint, [layer.poly]);
	});
	
	return [...paint_groups.entries()]
	.map(([paint, polys]) => {
		if (polys.length < 2)
			return {
				poly: polys[0],
				paint: paint
			};

		let solution = new ClipperLib.Paths();

		clipper.Clear();

		polys.forEach(poly => 
			clipper.AddPaths(poly, ClipperLib.PolyType.ptClip, true)
		);

		clipper.Execute(
			ClipperLib.ClipType.ctUnion,
			solution,
			ClipperLib.PolyFillType.pftNonZero,
			ClipperLib.PolyFillType.pftNonZero
		);

		solution = ClipperLib.Clipper.SimplifyPolygons(solution, ClipperLib.PolyFillType.pftNonZero);
		solution = ClipperLib.Clipper.CleanPolygons(solution, CLEANUP_DELTA * WORKING_SCALE);

		return {
			poly: solution,
			paint: paint
		};
	})
	.filter(layer => layer.poly.flat(1).length > 0);
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
					paint: layer.paint
				})
			);
		}
	);
	return new_layers;
}

function CullSmallLayers(layers)
{
	return layers.filter(layer => {
		layer.poly = layer.poly.filter(
			path => Math.abs(ClipperLib.Clipper.Area(path))
				>= WORKING_SCALE * WORKING_SCALE * MIN_AREA
		);
		return layer.poly.flat(1).length > 0 &&
			ClipperLib.JS.AreaOfPolygons(layer.poly)
			>= WORKING_SCALE * WORKING_SCALE * MIN_AREA;
	});
}

function ConnectLayers(layers)
{
	layers.forEach(layer =>
		layer.connections = new Set()
	);

	[...layers.reduce(
		(planes,layer) => {
			layer.poly
			.forEach(path => path
				.forEach((v,i) => {
					const _v1 = new Point(v.X, v.Y);
					const _v2 = path[(i + 1) % path.length];

					let v1 = _v1;
					let v2 = new Point(_v2.X, _v2.Y);

					if (v2.X < v1.X || (v2.X == v1.X && v2.Y < v1.Y))
						[v1,v2] = [v2,v1];
					
					const tangent_angle = Math.round(
						(Math.atan2(v2.Y - v1.Y, v2.X - v1.X) / Math.PI + 2)
						* ADJACENCY_ANGLE_STEPS
					) % ADJACENCY_ANGLE_STEPS;
					const tangent = new Point(
						Math.cos(tangent_angle / ADJACENCY_ANGLE_STEPS * Math.PI),
						Math.sin(tangent_angle / ADJACENCY_ANGLE_STEPS * Math.PI)
					);

					const extent1 = tangent.DotProduct(v1);
					const extent2 = tangent.DotProduct(v2);

					const normal = NormalFromTangent(tangent);
					const offset = normal.DotProduct(v1.Add(v2)) * .5;

					const plane1 = `${tangent_angle},${Math.floor(offset / (ADJACENCY_MAX_DISTANCE * WORKING_SCALE))}`;
					const plane2 = `${tangent_angle},${Math.ceil(offset / (ADJACENCY_MAX_DISTANCE * WORKING_SCALE))}`;

					const segment = {
						min: Math.min(extent1, extent2),
						max: Math.max(extent1, extent2),
						offset: offset,
						direction: -Math.sign(tangent.DotProduct(_v1.Subtract(_v2))),
						layer: layer
					};

					if (!planes.has(plane1))
						planes.set(plane1,[]);
					
					planes.get(plane1).push(segment);

					if (plane2 == plane1)
						return;
					
					if (!planes.has(plane2))
						planes.set(plane2,[]);
					
					planes.get(plane2).push(segment);
				})
			);

			return planes;
		},
		new Map()
	)]
	.filter(
		([k,v]) => v.length > 1
	)
	.forEach(([k,v]) => {
		for (let i = v.length - 1; i >= 1; i--)
		{
			for (let j = i - 1; j >= 0; j--)
			{
				if (v[i].max <= v[j].min || v[i].min >= v[j].max)
					continue;

				// These edges must be facing opposite ways
				if (v[i].direction == v[j].direction)
					continue;

				if (Math.abs(v[i].offset - v[j].offset)
					>= ADJACENCY_MAX_DISTANCE * WORKING_SCALE)
					continue;
				
				v[i].layer.connections.add(v[j].layer);
				v[j].layer.connections.add(v[i].layer);
			}
		}
	});
	
	// TODO: Annotate distances between all regions
}

// Finds colours that are not immediately blocked by neighbours
function GetValidLayerColours(layer)
{
	return new Set(
		[...layer.neighbour_colours]
		.filter(([k,v]) => k != UNKNOWN_COLOUR && v == 0)
		.map(([k,v]) => k)
	);
}

// Finds colours that are not immediately blocked, and do not deplete
// its cliques of possible colours.
function GetSafeLayerColours(layer)
{
	const layer_colours = GetValidLayerColours(layer);

	// Connections of layer
	const unknown_connections = new Set([...layer.connections]
	.filter(connection => connection.graph_colour != UNKNOWN_COLOUR));

	if (layer_colours.size == 0 || unknown_connections.size == 0)
		return layer_colours;

	let connection_colours = new Set();

	// Block colours if using it would cause a clique to have
	// less colours available than there are nodes.
	[...unknown_connections]
	.forEach((c1, i, arr1) => {
		const c1_colours = GetValidLayerColours(c1);

		// Connections of layer AND c1
		const possible_c2 = new Set(
			arr1.slice(i + 1)
		).intersection(c1.connections);			

		[...possible_c2]
		.forEach((c2, j, arr2) => {
			const c2_colours = GetValidLayerColours(c2);
			const c12_colours = c1_colours.union(c2_colours);

			// Connections of layer AND c1 AND c2
			const possible_c3 = new Set(
				arr2.slice(j + 1)
			).intersection(c2.connections);

			[...possible_c3]
			.forEach((c3, k, arr3) => {
				const c3_colours = GetValidLayerColours(c3);
				const c123_colours = c12_colours.union(c3_colours);

				// 4-clique neighbours (maximum) with only three colours
				if (c123_colours.size < 4)
					connection_colours = connection_colours.union(c123_colours);
			});

			// 3-clique neighbours with only two colours
			if (c12_colours.size < 3)
				connection_colours = connection_colours.union(c12_colours);
		});

		// 2-clique neighbour with only one colour
		if (c1_colours.size < 2)
			connection_colours = connection_colours.union(c1_colours);
	});

	// Return valid colours without those that break cliques
	return layer_colours.difference(connection_colours);
}

function MarkLayerColour(layer, colour)
{
	if (layer.graph_colour == colour)
		return;

	[...layer.connections]
	.forEach(connection => {
		connection.neighbour_colours.set(
			layer.graph_colour,
			connection.neighbour_colours.get(
				layer.graph_colour
			) - 1
		);
		connection.neighbour_colours.set(
			colour,
			connection.neighbour_colours.get(
				colour
			) + 1
		);
	});

	layer.graph_colour = colour;
}

// Add initial states and neighbour counts to layers
function SetupGraph(layers)
{
	layers
	.forEach(layer => {
		layer.graph_colour = UNKNOWN_COLOUR;

		layer.neighbour_colours = new Map(
			[...GRAPH_COLOURS]
				.map(colour => [colour,0])
		);

		layer.neighbour_colours.set(
			UNKNOWN_COLOUR,
			layer.connections.size
		);
	});
}

// Saves the state of a graph with mappings from layers to colours
function GetGraphState(layers)
{
	return new Map(
		layers.map(layer =>
			[layer, layer.graph_colour]
		)
	);
}

// Resets a graph using a map from layers to original colours
function ResetGraphState(initial_state)
{
	[...initial_state.entries()]
	.forEach(([layer,colour]) =>
		MarkLayerColour(layer, colour)
	);
}

// Attempts to colour a graph. To exhaust possibilities, this recurses
// when a uncertain decision is made. Returns true if coloured, false if not,
// and resets the graph when a colouring was not possible.
function ColourGraph(layers)
{
	if (layers.length == 0)
		return true;

	const initial_state = GetGraphState(layers);
	const input = new Set(layers);
	const trivial_groups = [];
	let input_arr = [...input];

	for (;;)
	{
		const trivial = new Set();
		
		// TODO: modify trivial extraction, and forced placement,
		// to only check dirty nodes.
		for (let i = 0; i < input.size; i++)
		{
			const layer = input_arr[i];
			const possible_colours = GetSafeLayerColours(layer);

			if (possible_colours.size == 0)
			{
				ResetGraphState(initial_state);
				return false;
			}
			else if (possible_colours.size == 1)
			{
				MarkLayerColour(layer,[...possible_colours][0]);
				
				trivial.delete(layer);
				input.delete(layer);
				input_arr = [...input];
				i = -1;
				continue;
			}

			const unknown_neighbours = [...(
				layer.connections.intersection(input)
			)].filter(connection =>
				connection.graph_colour == UNKNOWN_COLOUR
			);

			if (possible_colours.size <= unknown_neighbours.length)
				continue;
			
			trivial.add(layer);
		}

		if (trivial.size == 0)
			break;

		trivial_groups.push(trivial);

		[...trivial].forEach(layer => input.delete(layer));
		input_arr = [...input];
	}

	if (input.size != 0)
	{
		// TODO: Replace sort by neighbour count with a sort by odd cycle count
		const most_connected = input_arr
		.slice(1)
		.reduce((previous,current) =>
			current.connections.size > previous.connections.size
				? current
				: previous,
			input_arr[0]
		);

		input.delete(most_connected);
		input_arr = [...input];

		const allowed_colours = [...GetSafeLayerColours(
			most_connected
		)];

		do
		{
			if (allowed_colours.length == 0)
			{
				ResetGraphState(initial_state);
				return false;
			}

			MarkLayerColour(
				most_connected,
				allowed_colours.pop()
			);
		}
		while (!ColourGraph(input_arr));
	}

	// TODO: Add code to maximise distance between repeated colours
	trivial_groups
	.reverse()
	.forEach(group =>
		[...group]
		.sort((a,b) =>
			a.neighbour_colours.get(UNKNOWN_COLOUR) -
			b.neighbour_colours.get(UNKNOWN_COLOUR)
		)
		.forEach(layer => {
			const colours = [...GetValidLayerColours(
				layer
			)];

			MarkLayerColour(
				layer,
				// TODO: Replace random selection with
				// deterministic distance-optimised colour
				colours[Math.floor(Math.random() * colours.length)]
			);
		})
	);
	
	return true;
}

// Signed distance to path as [Point...]
function GetSignedDistanceToPath(
	path,
	point,
	layer,
	prevDist = undefined
)
{
	return path.reduce((_prevDist, vert, vi) =>
		Dist.GetClosest(
			_prevDist,
			new Edge(
				vert,
				path[(vi + 1) % path.length],
				layer,
				undefined // Unneccessary for this
			).SignedDistance(point)
		),
		prevDist
	);
}

// Signed distance to polygon as [[Point...]...], and point as a Point
function GetSignedDistanceToPolygon(
	polygon, 
	point, 
	layer, 
	prevDist = undefined
)
{
	return polygon.reduce((_prevDist, path) =>
		GetSignedDistanceToPath(
			path,
			point,
			layer,
			_prevDist
		),
		prevDist
	);
}

// Signed distance to layers as [{poly:[[Point...]...]...}...]
function GetSignedDistanceToLayers(
	layers,
	point,
	prevDist = undefined
)
{
	return layers.reduce((_prevDist, layer) =>
		GetSignedDistanceToPolygon(
			layer.poly,
			point,
			layer,
			_prevDist
		),
		prevDist
	);
}

// Samples an SDF field for layers assumed to be the same colour
function LayersToSDF(layers, width, height, viewbox)
{
	console.time("LayersToSDF");
	const sdf = new Array(height);
	for (let row = 0; row < height; row++)
	{
		sdf[row] = new Array(width);
	}

	const sample = new Point();
	for (let row = 0; row < height; row++)
	{
		sample.Y = ((row + 0.5) / height * viewbox.h + viewbox.y) * WORKING_SCALE / svg_size;

		const rowDat = sdf[row];
		for (let col = 0; col < width; col++)
		{
			sample.X = ((col + 0.5) / width * viewbox.w + viewbox.x) * WORKING_SCALE / svg_size;

			rowDat[col] = GetSignedDistanceToLayers(layers, sample);
		}
	}

	console.timeEnd("LayersToSDF");

	return sdf;
}

// Splits layers into differently coloured regions,
// then renders an SDF for each one (up to four).
// Returns a Map from Colour constants to [[Dist...]...]
function ColouredLayersToDistances(layers, width, height, viewbox)
{
	if (layers.length == 0)
		return new Map();
	
	console.time("ColouredLayersToDistances");

	// Separate layers into groups of single colours
	const colouredLayers = layers.reduce(
		(prev, layer) =>
		{
			const colour = layer.graph_colour;

			if(!prev.has(colour))
				prev.set(colour,[]);

			prev.get(colour).push(layer);

			return prev;
		},
		new Map()
	);

	if (!BVH_ENABLED)
	{
		// Create a different SDF for each colour
		var dists = new Map(
			[...colouredLayers.entries()]
			.map(([colour,subLayers],index,arr) => {
				const sdf = LayersToSDF(subLayers, width, height, viewbox);
				
				console.timeLog("ColouredLayersToDistances",`Finished SDF ${index + 1}/${arr.length}`);

				return [colour, sdf];
			})
		);
	}
	else
	{	
		console.time("ColouredLayersToDistances: BVH");
		
		// Build a combined BVH for each set of layers
		const bvhs = new Map(
			[...colouredLayers.entries()]
			.map(([colour,subLayers]) =>
			{
				const edges = subLayers
					.map(LayerToEdges)
					.flat(1);

				const bvh = BVH.FromEdges(
					edges,
					Bounds.FromEdges(edges)
				);

				console.log(bvh.ToString());

				return [colour, bvh];
			})
		);
		console.timeEnd("ColouredLayersToDistances: BVH");

		var dists = new Map(
			[...bvhs.entries()]
			.map(([colour,bvh],index,arr) =>
			{
				const sdf = bvh.ToSDF(width, height, viewbox);
				
				console.timeLog("ColouredLayersToDistances",`Finished SDF ${index + 1}/${arr.length}`);

				return [colour, sdf];
			})
		);
	}

	console.timeEnd("ColouredLayersToDistances");

	return dists;
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
				next_point = new Point(next_point.X,next_point.Y);
				point.to_next = next_point.Subtract(point);
				point.edge_len = point.to_next.Length();
				point.edge_tangent = point.to_next.ScaleInv(point.edge_len);
				point.edge_normal = NormalFromTangent(point.edge_tangent);
			});
			path.
			forEach((point, pi) => {
				let last_point = path.at(pi - 1);
				point.point_tangent = last_point.edge_tangent
					.Add(point.edge_tangent)
					.Normalised();
			});
		})
	);

	console.timeEnd("LayersCalculateVectors");

	return layers;
}

function DistancesToSDFImage(
		dists,
		width,
		height,
		min,
		max,
		perpendicular
	)
{
	let data = [];

	for (let i = 0; i < width * height * 4; i++)
		data.push(COLOUR_MAX_VALUE);

	[...dists.entries()].forEach(([colour,rows]) => {
		if (colour == UNKNOWN_COLOUR)
			return;

		let index = CHANNEL_MAPPING.get(colour);

		rows
		.forEach(row => row
			.forEach(sample => {
				let dist = perpendicular
					? sample.perpendicular
					: sample.euclidean_signed;

				dist = (dist - min) / (max - min);
				dist = dist > 0 ? (dist < 1 ? dist : 1) : 0;

				data[index] = Math.round(dist * COLOUR_MAX_VALUE);
				index += 4;
			})
		)
	});

	return data;
}

function DistancesToColourImage(
	dists,
	data,
	width,
	height
)
{
	function FromGamma(dists,colour,row,col)
	{
		return dists.get(colour)[row][col]
			.layer.paint.GetColour(sample)
			// Radial gradients may produce undefined colours
			?? SDF_COLOUR_INVALID_COLOUR;
	}

	function FromLinear(dists,colour,row,col)
	{
		return dists.get(colour)[row][col]
			.layer.paint.GetColour(sample).FromLinear()
			// Radial gradients may produce undefined colours
			?? SDF_COLOUR_INVALID_COLOUR;
	}

	const ColourFromDists = COLOUR_LINEAR
		? FromLinear
		: FromGamma;

	const data_out = [];
	const sample = new Point()

	for (let row = 0, i = 0; row < height; row++)
	{
		sample.Y = ((row + 0.5) / height * viewbox.h + viewbox.y) * WORKING_SCALE / svg_size;
		let colour_out;
		for (let col = 0; col < width;
			col++,
			i += 4,
			data_out.push(Math.round(colour_out.r * COLOUR_MAX_VALUE)),
			data_out.push(Math.round(colour_out.g * COLOUR_MAX_VALUE)),
			data_out.push(Math.round(colour_out.b * COLOUR_MAX_VALUE)),
			data_out.push(Math.round(colour_out.a * COLOUR_MAX_VALUE))
		)
		{
			sample.X = ((col + 0.5) / width * viewbox.w + viewbox.x) * WORKING_SCALE / svg_size;

			const r = data[i+0];
			const g = data[i+1];
			const b = data[i+2];
			const a = data[i+3];

			const min = Math.min(r,g,b,a)

			const min_channels = [
				[r,COLOUR1_COLOUR],
				[g,COLOUR2_COLOUR],
				[b,COLOUR3_COLOUR],
				[a,COLOUR4_COLOUR]
			].filter(([v,c]) => dists.has(c) && v == min)
			.map(([v,c]) => c);

			if (min_channels.length == 1)
			{
				colour_out = ColourFromDists(
					dists,
					min_channels[0],
					row,
					col
				);
				continue;
			}
			
			if (COLOUR_BLEED_MODE == BLEED.MARK)
			{
				colour_out = COLOUR_BLEED_COLOUR;
				continue;
			}
			
			if (COLOUR_BLEED_MODE == BLEED.AVERAGE)
			{
				colour_out = new RGB(0,0,0,0);

				min_channels
				.forEach(colour => {
					let sample_colour = ColourFromDists(
						dists,
						colour,
						row,
						col
					);

					if (COLOUR_LINEAR)
						sample_colour = sample_colour.ToLinear();

					colour_out.r += sample_colour.r;
					colour_out.g += sample_colour.g;
					colour_out.b += sample_colour.b;
					colour_out.a += sample_colour.a;
				});

				colour_out.r /= min_channels.length;
				colour_out.g /= min_channels.length;
				colour_out.b /= min_channels.length;
				colour_out.a /= min_channels.length;

				if (COLOUR_LINEAR)
					colour_out = colour_out.FromLinear();

				continue;
			}

			let min_obj = dists.get(min_channels[0])[row][col];
			let min_dist = min_obj.euclidean_signed;

			min_channels
			.slice(1)
			.forEach(colour => {
				const obj = dists.get(colour)[row][col];
				const dist = obj.euclidean_signed;

				if (dist > min_dist)
					return;

				min_obj = obj;
				min_dist = dist;
			});

			colour_out = min_obj.layer.paint.GetColour(sample);

			if (COLOUR_LINEAR && colour_out)
				colour_out = colour_out.FromLinear();

			colour_out ??= SDF_COLOUR_INVALID_COLOUR;
		}
	}

	return data_out;
}

function SaturateSDFImage(data)
{
	let data_out = [];

	for (let i = 0; i+3 < data.length; i += 4)
	{
		let r = data[i+0];
		let g = data[i+1];
		let b = data[i+2];
		let a = data[i+3];
		let min = Math.min(r,g,b,a);
		data_out.push(r == min ? 0 : COLOUR_MAX_VALUE);
		data_out.push(g == min ? 0 : COLOUR_MAX_VALUE);
		data_out.push(b == min ? 0 : COLOUR_MAX_VALUE);
		data_out.push(a == min ? 0 : COLOUR_MAX_VALUE);
	}

	return data_out;
}

function InvertSDFImage(data)
{
	return data.map(v => COLOUR_MAX_VALUE - v);
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
		data_out.push(COLOUR_MAX_VALUE);
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
const COLOUR_CANVAS = document.getElementById("colour-canvas");

const CANVAS_CTX = OUTPUT_CANVAS.getContext("2d");
const FALSECOLOUR_CTX = FALSECOLOUR_CANVAS.getContext("2d");
const SATURATED_CTX = SATURATED_CANVAS.getContext("2d");
const COLOUR_CTX = COLOUR_CANVAS.getContext("2d");

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
let colour_img = [];

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
	COLOUR_CANVAS.style.display = "none";
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
		const graphics = SVGExtractGraphics(svg_input);
		layers = FlattenGraphicsToLayers(graphics)
		layers = SeparateLayerPolys(layers);
		layers = CullSmallLayers(layers);
		ConnectLayers(layers);
		SetupGraph(layers);
		layers = LayersCalculateVectors(layers);
	}
	else
	{
		layers.forEach(layer =>
			MarkLayerColour(layer, UNKNOWN_COLOUR)
		);
	}

	if (!ColourGraph(layers))
	{
		DisplayLayers();
		layers = undefined;
		console.error("Could not colour layers!");
		return;
	}

	DisplayLayers();

	setTimeout(RenderSDF,0);
}

function DisplayLayers()
{	
	const visited = new Set();
	svg_overlay_group = CreateSVGElement("g","overlay");
	let edges = CreateSVGElement("g","edges");
	let nodes = CreateSVGElement("g","nodes");

	layers
	.forEach((layer) => {
		layer.points = CPolyToPoints(layer.poly);
		layer.center = GetPathsCenter(layer.points);
	});

	layers
	.forEach(layer => {
		const fill = VISUALISATION_COLOURS.get(layer.graph_colour);
		//let fill = oklch_normalised_wheel(1, 1, i / layers.length - .083 + (i % 2) * 0.5);
		//let fill = oklch_normalised_random(1, 1, 0.5, 1, 0, 1);
		AddPaths(
			svg_overlay_group,
			PathsToString(layer.points),
			fill,
			ClipperLib.JS.AreaOfPolygons(layer.poly) >= 0 ? "#777" : "#f33",
			svg_size * DEBUG_LINE_THICKNESS
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
					"stroke-width": svg_size * DEBUG_LINE_THICKNESS,
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

	const sdf_min = -SDF_INNER_RANGE * WORKING_SCALE / SDF_SIZE;
	const sdf_max = SDF_OUTER_RANGE * WORKING_SCALE / SDF_SIZE;

	// Todo: Move processing to a web worker so the page does not lock up, and progress can be displayed
	const dists = ColouredLayersToDistances(layers, sdf_width, sdf_height, viewbox);

	sdf_img = DistancesToSDFImage(
		dists,
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

	if (SDF_COLOUR)
	{
		COLOUR_CANVAS.style.display = "";
		COLOUR_CANVAS.width = sdf_width;
		COLOUR_CANVAS.height = sdf_height;

		const colour_img_data = COLOUR_CTX.getImageData(0,0,sdf_width,sdf_height);
		const colour_data = colour_img_data.data;

		colour_img = DistancesToColourImage(
			dists,
			sdf_img,
			sdf_width,
			sdf_height
		);
		
		colour_img.forEach((v,i) => colour_data[i] = v);
		COLOUR_CTX.putImageData(colour_img_data,0,0);
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

	// TODO: Create combined preview using RSDF sampling in a shader
}

// https://stackoverflow.com/a/58652379
function SaveCanvas(data, width, height, name)
{
	let p = new png.PNG(
		{
			width: width,
			height: height,
			bitDepth: COLOUR_DEPTH
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

	if (COLOUR_CANVAS.style.display != "none")
		SaveCanvas(
			colour_img,
			sdf_width,
			sdf_height,
			filename_prefix + "Colour" + filename_suffix
		);
}