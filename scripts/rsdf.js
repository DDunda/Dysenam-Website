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

class RSDFConverter {
	static BLEED = {
		EXTEND: 0, // Pick the true closest channel
		AVERAGE: 1, // Average the minimum channels' colours
		MARK: 2 // Ignore the input colour and mark with an error colour
	};

	static CONTENT_BOX = {
		VIEWBOX: 1, // The size is based on the viewbox
		BOUNDS: 2   // The size is based on the poly bounds
	};

	static SCALING = {
		FIT: 1,    // The content box fits inside the image and expands outwards
		COVER: 2,  // The content box covers the image and shrinks inwards
		STRETCH: 3 // The content box is left unchanged, sretching the content
	};

	static ASPECT = {
		Y_X: 0, // y/x
		X_Y: 1  // x/y
	};

	static LABEL_UNKNOWN = -1;
	static LABEL_1 = 1;
	static LABEL_2 = 2;
	static LABEL_3 = 3;
	static LABEL_4 = 4;

	static GRAPH_LABELS = new Set([
		RSDFConverter.LABEL_UNKNOWN,
		RSDFConverter.LABEL_1,
		RSDFConverter.LABEL_2,
		RSDFConverter.LABEL_3,
		RSDFConverter.LABEL_4
	]);

	static VISUALISATION_LABELS = new Map([
		[RSDFConverter.LABEL_UNKNOWN, "oklch(0.719 0.0000   0.00)"],
		[RSDFConverter.LABEL_1, "oklch(0.719 0.1635  59.72)"],
		[RSDFConverter.LABEL_2, "oklch(0.719 0.1635 149.72)"],
		[RSDFConverter.LABEL_3, "oklch(0.719 0.1635 239.72)"],
		[RSDFConverter.LABEL_4, "oklch(0.719 0.1635 329.72)"]
	]);

	static CHANNEL_MAPPING = new Map([
		[RSDFConverter.LABEL_1,0],
		[RSDFConverter.LABEL_2,1],
		[RSDFConverter.LABEL_3,2],
		[RSDFConverter.LABEL_4,3],
	]);

	static SVG_ELEMENTS = ["PATH","ELLIPSE","CIRCLE","POLYGON","RECT","TEXT","G"];

	static PATH_ARG_COUNT = {
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

	static RELATIVE_ARGS = ["m","l","h","v","z","c","s","q","t","a"];

	static FILL_RULES = {
		nonzero: ClipperLib.PolyFillType.pftNonZero,
		evenodd: ClipperLib.PolyFillType.pftEvenOdd,
	};

	constructor()
	{
		this.size = Math.pow(2,8); // Size of rendered sdf
		this.render_colour = true; // Whether the SDF should render the image colour
		this.render_regions = false; // Whether to set distances to exclusively the minima. Good for debugging, finding doubles, making colour maps by hand...
		this.render_falsecolour = false; // Whether the SDF should render with false colour (fully opaque within 3 channels)
		
		this.inner_px = -1; // Pixels relative to size of image
		this.outer_px = 1; // Pixels relative to size of image
		this.perpendicular = false; // Whether distance should be perpendicular rather than euclidean
		this.inverted = false; // Whether to map distances from [0,1] to [1,0]
		
		this.background_enabled = true;
		this.background_colour = new RGB(0,0,0,0);
		this.bleed_mode = RSDFConverter.BLEED.EXTEND; // If two channels share a minima, which colour do you pick?
		this.bleed_colour = new RGB(1,0,1,1);
		this.invalid_colour = new RGB(1,0,1,1);
		this.bit_depth = 8;
		this.linear_enabled = false;
		
		this.content_box = RSDFConverter.CONTENT_BOX.VIEWBOX; // What boundary is fit into the image?
		this.fixed_aspect = false; // Should the image should a fixed aspect?
		this.aspect_mode = RSDFConverter.ASPECT.Y_X; // Is the aspect a x/y or y/x ratio?
		this.aspect = 1; // The aspect ratio of the image (if fixed)
		this.scaling = RSDFConverter.SCALING.FIT; // How the content box is fit to the image
		this.alignment_x = 0.5; // Where the content box is positioned when fitting
		this.alignment_y = 0.5;
		this.outer_margin = true; // Whether to add a outer_margin for the outer range
		this.sample_borders = false; // Whether to expand by a half pixel to align samples to pixel corners
		
		this.bvh_enabled = true; // Enable BVH acceleration
		this.bvh_leaf_size = 40; // 40 seems good for mostly straight SVGs, and 72 for mostly curved.
		
		this.working_scale = Math.pow(2,24);
		this.poly_delta = Math.pow(2,-9);
		this.cleanup_delta = Math.pow(2,-20);
		this.min_area = Math.pow(2,-18);
		
		this.max_distance = Math.pow(2,-10);
		this.angle_steps = Math.pow(2,8);
		this.graph_thickness = Math.pow(2,-11);
		
		this.viewbox = new Bounds();

		this.print_debug = false;
		this.print_performance = true;
	}

	Copy()
	{
		const output = new RSDFConverter();
		
		output.size = this.size;
		output.render_colour = this.render_colour;
		output.render_regions = this.render_regions;
		output.render_falsecolour = this.render_falsecolour;
		output.inner_px = this.inner_px;
		output.outer_px = this.outer_px;
		output.perpendicular = this.perpendicular;
		output.inverted = this.inverted;
		output.background_enabled = this.background_enabled;
		output.background_colour = this.background_colour.Copy();
		output.bleed_mode = this.bleed_mode;
		output.bleed_colour = this.bleed_colour.Copy();
		output.invalid_colour = this.invalid_colour.Copy();
		output.bit_depth = this.bit_depth;
		output.linear_enabled = this.linear_enabled;
		output.content_box = this.content_box;
		output.fixed_aspect = this.fixed_aspect;
		output.aspect_mode = this.aspect_mode;
		output.aspect = this.aspect;
		output.scaling = this.scaling;
		output.alignment_x = this.alignment_x;
		output.alignment_y = this.alignment_y;
		output.outer_margin = this.outer_margin;
		output.sample_borders = this.sample_borders;
		output.bvh_enabled = this.bvh_enabled;
		output.bvh_leaf_size = this.bvh_leaf_size;
		output.working_scale = this.working_scale;
		output.poly_delta = this.poly_delta;
		output.cleanup_delta = this.cleanup_delta;
		output.min_area = this.min_area;
		output.max_distance = this.max_distance;
		output.angle_steps = this.angle_steps;
		output.graph_thickness = this.graph_thickness;
		output.viewbox = this.viewbox.Copy();
		output.print_debug = this.print_debug;
		output.print_performance = this.print_performance;
		
		return output;
	}

	ImportIsClean(old_settings)
	{
		return this.background_enabled == old_settings.background_enabled &&
			(!this.background_enabled || RGB.Equal(this.background_colour, old_settings.background_colour)) &&
			this.working_scale == old_settings.working_scale &&
			this.poly_delta == old_settings.poly_delta &&
			this.cleanup_delta == old_settings.cleanup_delta &&
			this.min_area == old_settings.min_area &&
			this.max_distance == old_settings.max_distance &&
			this.angle_steps == old_settings.angle_steps &&
			Bounds.Equal(this.viewbox, old_settings.viewbox);
	}

	get svg_size() {
		return Math.max(this.viewbox.width, this.viewbox.height);
	}

	get alignment() {
		return new Point(
			this.alignment_x,
			this.alignment_y
		);
	}

	get max_colour_value() {
		return (1 << this.bit_depth) - 1;
	}	

	// Converts a list of vertices to a JsClipper
	// compatible format.
	PointsToCPoly(points)
	{
		const SCALE = this.working_scale / (this.svg_size * 0.5);
		return points
		.map(path => path
			.map(point => ({
				X: (point.X - this.viewbox.center.X) * SCALE,
				Y: (point.Y - this.viewbox.center.Y) * SCALE
			}))
		);
	}

	CPolyToPoints(cpoly)
	{
		const SCALE = (this.svg_size * 0.5) / this.working_scale;
		return cpoly
		.map(path => path
			.map(point => ({
				X: point.X * SCALE + this.viewbox.center.X,
				Y: point.Y * SCALE + this.viewbox.center.Y,
			}))
		);
	}

	// Takes an svg as segments, and converts them
	// to a list of subpath polygon vertex lists.
	// Points are Point objects.
	// Returns a path list of subpath lists of points.
	SegmentsToPoints(segments)
	{
		if (segments.length == 0)
			return [];

		const POLY_DELTA = this.poly_delta * this.svg_size;

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

			if (!(upper_type in RSDFConverter.PATH_ARG_COUNT))
				throw Error(`SegmentsToPoints: Unknown command '${type}'!`);

			let args = segment.values.length;
			let req_args = RSDFConverter.PATH_ARG_COUNT[upper_type];

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
			if (Point.Distance(lastPoint, nextPoint) <= POLY_DELTA)
				return;

			let length = curve.getTotalLength();

			if (length < 0)
				throw Error(`SegmentsToPoints: Length of curve is '${length}'! (${segments[i].type + segments[i].values.join(" ")})`);

			let edges = Math.ceil(length / POLY_DELTA);
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

	SVGCircleToPoints(circle)
	{
		let r = circle.getAttribute("r");

		if (r === undefined)
			console.error("SVGCircleToPoints: Expected r (radius) attribute");

		r = Number(r);

		const cx = Number(circle.getAttribute("cx") ?? 0);
		const cy = Number(circle.getAttribute("cy") ?? 0);

		const segments = [
			{type: "M", values: [cx-r,cy]},
			{type: "a", values: [r,r,0,0,1,2*r,0]},
			{type: "a", values: [r,r,0,0,1,-2*r,0]}
		];

		return this.SegmentsToPoints(segments);
	}

	SVGEllipseToPoints(ellipse)
	{
		let rx = ellipse.getAttribute("rx");
		let ry = ellipse.getAttribute("ry");

		if (rx === undefined)
			console.error("SVGEllipseToPoints: Expected rx (x radius) attribute");
		if (ry === undefined)
			console.error("SVGEllipseToPoints: Expected ry (y radius) attribute");

		rx = Number(rx);
		ry = Number(ry);

		const cx = Number(ellipse.getAttribute("cx") ?? 0);
		const cy = Number(ellipse.getAttribute("cy") ?? 0);

		const segments = [
			{type: "M", values: [cx-rx,cy]},
			{type: "a", values: [rx,ry,0,0,1,2*rx,0]},
			{type: "a", values: [rx,ry,0,0,1,-2*rx,0]}
		];

		return this.SegmentsToPoints(segments);
	}

	SVGRectToPoints(rect)
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

		return this.SegmentsToPoints(segments);
	}

	SVGPathToPoints(path)
	{
		return this.SegmentsToPoints(path.getPathData());
	}

	SVGElementToPoints(element)
	{
		let tag = element.tagName.toUpperCase();
		switch(tag)
		{
			case "RECT": return this.SVGRectToPoints(element);
			case "PATH": return this.SVGPathToPoints(element);
			case "CIRCLE": return this.SVGCircleToPoints(element);
			case "ELLIPSE": return this.SVGEllipseToPoints(element);
		}
		throw Error(`SVGElementToPoints: Unknown element tag '${element.tagName}'`);
	}

	// Takes an svg path as a string, and converts
	// it to a format usable by JsClipper.
	SegmentsToCPoly(segments)
	{
		return this.PointsToCPoly(
			this.SegmentsToPoints(segments)
		);
	}

	// Takes an svg path as an element, and converts
	// it to a format usable by JsClipper.
	PathToCPoly(path)
	{
		return this.SegmentsToCPoly(
			path.getPathData({normalize: true})
		);
	}

	// Takes an svg path as an ID, and converts
	// it to a format usable by JsClipper.
	IdToCPoly(id)
	{
		return this.PathToCPoly(
			document.getElementById(id)
		);
	}

	SVGExtractGraphics(element, matrix = undefined, root = element)
	{
		return [...element.children]
		.map(child => ({element: child}))
		.filter(e => {
			const tag = e.element.tagName.toUpperCase();

			// Unknown element
			if (!RSDFConverter.SVG_ELEMENTS.includes(tag))
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
				e.children = this.SVGExtractGraphics(e.element, e.matrix, root);

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
			
			e.points = this.SVGElementToPoints(e.element);

			if (e.points.flat(1).length == 0)
				return false;

			if (e.matrix && (
				e.matrix.a != 1 || e.matrix.b != 0 ||
				e.matrix.c != 0 || e.matrix.d != 1 ||
				e.matrix.e != 0 || e.matrix.f != 0))
			{
				// Apply transform to get true coordinates
				e.points = e.points.map(path =>
					path.map(point => 
						SVGMatMulVec(e.matrix, point)
					)
				);
			}

			const _fill_rule = GetAttributeOrStyle(e.element, "fill-rule");
			const fill_rule = RSDFConverter.FILL_RULES[_fill_rule] ?? RSDFConverter.FILL_RULES.nonzero;

			e.poly = this.PointsToCPoly(e.points);
			e.poly = ClipperLib.Clipper.SimplifyPolygons(e.poly, fill_rule);
			e.poly = ClipperLib.Clipper.CleanPolygons(e.poly, this.cleanup_delta * this.working_scale);

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
				this.linear_enabled
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
	FlattenGraphicsToLayers(graphics, is_root=true)
	{
		if (is_root && this.print_performance)
			console.time("FlattenGraphicsToLayers");

		const background_paint = is_root && this.background_enabled
			? new PaintConstant(
				this.background_colour.Copy()
			)
			: undefined;

		graphics = graphics
		.map(graphic => {
			if (!graphic.group)
				return graphic;

			const children = this.FlattenGraphicsToLayers(graphic.children,false);
			if (graphic.blend_mode != BLEND_MODE.NORMAL)
				children.forEach(child =>
					child.paint.blend_mode = graphic.blend_mode
				);

			return children;
		})
		.flat(1);

		let clipper = new ClipperLib.Clipper();

		if (background_paint)
		{
			graphics[0].paint = new PaintComposite(
				[background_paint.Copy(), graphics[0].paint],
				1,
				BLEND_MODE.NORMAL
			);
		}

		for (let i = 1; i < graphics.length; i++)
		{
			const covering = graphics[i];
			// The paint this layer will take once it flattens onto the background
			const covering_blend = background_paint ? new PaintComposite(
				[background_paint, covering.paint],
				1,
				BLEND_MODE.NORMAL
			) : covering.paint;

			const union_polys = [];
			const difference_polys = [];

			for (let j = 0; j < i; j++)
			{
				const covered = graphics[j];

				const intersection_paint = covering.paint
					.CompositeOver(covered.paint);

				const intersection_equals_covered = Paint.Equal(covered.paint, intersection_paint);
				const intersection_equals_covering = Paint.Equal(covering_blend, intersection_paint);
				const equal_paints = Paint.Equal(covered.paint, covering_blend);

				// Fuse these paints
				if (equal_paints)
					union_polys.push(covered.poly);
				
				// The intersection is different to both paints
				if (!intersection_equals_covering && !intersection_equals_covered)
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
								paint: intersection_paint,
								poly: intersection
							}
						);
						i++;
						j++;

						if (!equal_paints)
							difference_polys.push(covered.poly)
						else
							difference_polys.push(intersection);

						covered.poly = GetPolyClip(
							clipper,
							covered.poly,
							[covering.poly],
							ClipperLib.ClipType.ctDifference
						);
					}
				}
				// One layer is equal to intersection, but they aren't equal to eachother.
				// Therefore, cut one from the other without processing the intersection
				else if (!equal_paints)
				{
					// Cut the bottom out of the top
					if (intersection_equals_covered)
					{
						difference_polys.push(covered.poly);
					}
					// Cut the top out of the bottom
					else
					{
						covered.poly = GetPolyClip(
							clipper,
							covered.poly,
							[covering.poly],
							ClipperLib.ClipType.ctDifference
						);
					}
				}

				if (equal_paints || covered.poly.flat(1).length == 0)
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
			covering.paint = covering_blend;

			if (covering.poly.flat(1).length == 0)
			{
				graphics.splice(i,1);
				i--;
			}
		}

		graphics = graphics.filter(layer => {
			layer.poly = ClipperLib.Clipper.SimplifyPolygons(layer.poly, ClipperLib.PolyFillType.pftNonZero);
			layer.poly = ClipperLib.Clipper.CleanPolygons(layer.poly, this.cleanup_delta * this.working_scale);
			return layer.poly.flat(1).length > 0
		});

		if (!background_paint)
		{
			if (is_root && this.print_performance)
				console.timeEnd("FlattenGraphicsToLayers");

			return graphics;
		}

		graphics = graphics.filter(
			layer => !Paint.Equal(layer.paint, background_paint)			
		);

		let background_poly = new ClipperLib.Paths();

		clipper.Clear();
		
		// Without this, the background can sometimes create adjacent but separate polygons;
		// Even after using SimplifyPolygons and CleanPolygons!
		clipper.StrictlySimple = true;

		graphics.forEach(layer =>
			clipper.AddPaths(layer.poly, ClipperLib.PolyType.ptClip, true)
		);

		clipper.Execute(
			ClipperLib.ClipType.ctUnion,
			background_poly,
			ClipperLib.PolyFillType.pftNonZero,
			ClipperLib.PolyFillType.pftNonZero
		);
						
		background_poly = ClipperLib.Clipper.SimplifyPolygons(background_poly, ClipperLib.PolyFillType.pftNonZero);
		background_poly = ClipperLib.Clipper.CleanPolygons(background_poly, this.cleanup_delta * this.working_scale);

		background_poly = background_poly
		.filter(path => path.length > 0)
		.filter(path =>
			Math.abs(ClipperLib.Clipper.Area(path))
			>= this.working_scale * this.working_scale * this.min_area
		)
		// Reverse the winding order to fill the outside; the inverse of the union
		.map(path => path.reverse());

		if (background_poly.flat(1).length > 0)
		{
			graphics.unshift({
				poly: background_poly,
				paint: background_paint
			});
		}

		if (is_root && this.print_performance)
			console.timeEnd("FlattenGraphicsToLayers");

		return graphics;
	}

	// Takes layers and clips what each layer occludes from beneath
	ClipOccludedLayers(layers)
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
			
			if (layer.paint.opaque)
				clip_polys.push(...poly_copy);

			return true;
		})
		.reverse();
	}

	FuseLayerPaints(layers, consider_blend = true)
	{
		const paint_groups = new Map();
		const clipper = new ClipperLib.Clipper();

		layers.forEach(layer => {
			const orig_blend = layer.paint.blend_mode;
			for (const [paint, arr] of paint_groups)
			{			
				if (!consider_blend)
					layer.paint.blend_mode = paint.blend_mode;
				
				if (!Paint.Equal(paint, layer.paint))
					continue;

				arr.push(layer.poly);
				return;
			}
			layer.paint.blend_mode = orig_blend;
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
			solution = ClipperLib.Clipper.CleanPolygons(solution, this.cleanup_delta * this.working_scale);

			return {
				poly: solution,
				paint: paint
			};
		})
		.filter(layer => layer.poly.flat(1).length > 0);
	}

	SeparateLayerPolys(layers)
	{
		const clipper = new ClipperLib.Clipper();

		return layers
		.map(layer => {
			// Mainly used for the background, which is the inverse of the union
			// of everything else and consequently negative.
			const inverted = ClipperLib.JS.AreaOfPolygons(layer.poly) <= 0;

			const polytree = new ClipperLib.PolyTree();

			clipper.Clear();
			clipper.AddPaths(layer.poly, ClipperLib.PolyType.ptSubject, true);
			clipper.Execute(
				ClipperLib.ClipType.ctUnion,
				polytree,
				ClipperLib.PolyFillType.pftNonZero,
				ClipperLib.PolyFillType.pftNonZero
			);

			const polys = [];
			const nodes = inverted
				? [polytree]
				: [...polytree.Childs()];

			while (nodes.length > 0)
			{
				const node = nodes.pop();
				const node_contour = [...node.Contour()]
				const node_children = [...node.Childs()];
				const node_poly = [];

				if (node_contour.length > 0)
					node_poly.push(node_contour);

				node_children
				.forEach(child => {
					node_poly.push([...child.Contour()]);
					nodes.push(...child.Childs());
				});
				
				polys.push(node_poly);
			}

			// Clipper will flip the contours if the outermost shape is inverted.
			// Therefore, flip them back to how they started.
			if (inverted)
			{
				polys
				.forEach(poly => poly
					.forEach(path =>
						path = path.reverse()
					)
				);
			}
			
			return polys
			.map(poly => ({
				poly: poly,
				paint: layer.paint
			}));
		})
		.flat(1);
	}

	CullSmallLayers(layers)
	{
		return layers.filter(layer => {
			layer.poly = layer.poly.filter(
				path => Math.abs(ClipperLib.Clipper.Area(path))
					>= this.working_scale * this.working_scale * this.min_area
			);
			return layer.poly.flat(1).length > 0 &&
				Math.abs(ClipperLib.JS.AreaOfPolygons(layer.poly))
				>= this.working_scale * this.working_scale * this.min_area;
		});
	}

	ConnectLayers(layers)
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
							* this.angle_steps
						) % this.angle_steps;
						const tangent = new Point(
							Math.cos(tangent_angle / this.angle_steps * Math.PI),
							Math.sin(tangent_angle / this.angle_steps * Math.PI)
						);

						const extent1 = tangent.DotProduct(v1);
						const extent2 = tangent.DotProduct(v2);

						const normal = NormalFromTangent(tangent);
						const offset = normal.DotProduct(v1.Add(v2)) * .5;

						const plane1 = `${tangent_angle},${Math.floor(offset / (this.max_distance * this.working_scale))}`;
						const plane2 = `${tangent_angle},${Math.ceil(offset / (this.max_distance * this.working_scale))}`;

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
						>= this.max_distance * this.working_scale)
						continue;
					
					v[i].layer.connections.add(v[j].layer);
					v[j].layer.connections.add(v[i].layer);
				}
			}
		});
		
		// TODO: Annotate distances between all regions
	}

	// Finds labels that are not immediately blocked by neighbours
	GetValidLayerLabels(layer)
	{
		return new Set(
			[...layer.neighbour_labels]
			.filter(([k,v]) => k != RSDFConverter.LABEL_UNKNOWN && v == 0)
			.map(([k,v]) => k)
		);
	}

	// Finds labels that are not immediately blocked, and do not deplete
	// its cliques of possible labels.
	GetSafeLayerLabels(layer)
	{
		const layer_labels = this.GetValidLayerLabels(layer);

		// Connections of layer
		const unknown_connections = new Set([...layer.connections]
		.filter(connection => connection.graph_label != RSDFConverter.LABEL_UNKNOWN));

		if (layer_labels.size == 0 || unknown_connections.size == 0)
			return layer_labels;

		let connection_labels = new Set();

		// Block labels if using it would cause a clique to have
		// less labels available than there are nodes.
		[...unknown_connections]
		.forEach((c1, i1, arr1) => {
			const c1_labels = this.GetValidLayerLabels(c1);

			// Connections of layer AND c1
			const possible_c2 = new Set(
				arr1.slice(i1 + 1)
			).intersection(c1.connections);			

			[...possible_c2]
			.forEach((c2, i2, arr2) => {
				const c2_labels = this.GetValidLayerLabels(c2);
				const c12_labels = c1_labels.union(c2_labels);

				// Connections of layer AND c1 AND c2
				const possible_c3 = new Set(
					arr2.slice(i2 + 1)
				).intersection(c2.connections);

				[...possible_c3]
				.forEach((c3, i3, arr3) => {
					const c3_labels = this.GetValidLayerLabels(c3);
					const c123_labels = c12_labels.union(c3_labels);
					
					// Connections of layer AND c1 AND c2 AND c3
					const possible_c4 = new Set(
						arr3.slice(i3 + 1)
					).intersection(c3.connections);

					// A >=5-clique has formed! Impossible to colour.
					if (possible_c4.length > 0)
						connection_labels = connection_labels.union(RSDFConverter.GRAPH_LABELS);

					// 4-clique neighbours (maximum) with only three labels
					if (c123_labels.size == 3)
						connection_labels = connection_labels.union(c123_labels);
					// Less labels than clique neighbours! Impossible to colour.
					else if (c123_labels.size < 3)
						connection_labels = connection_labels.union(RSDFConverter.GRAPH_LABELS);
				});

				// 3-clique neighbours with only two labels
				if (c12_labels.size == 2)
					connection_labels = connection_labels.union(c12_labels);
				// Less labels than clique neighbours! Impossible to colour.
				else if (c12_labels.size < 2)
					connection_labels = connection_labels.union(RSDFConverter.GRAPH_LABELS); // Invalid state
			});

			// 2-clique neighbour with only one label
			if (c1_labels.size == 1)
				connection_labels = connection_labels.union(c1_labels);
			// Less labels than clique neighbours! Impossible to colour.
			else if (c1_labels.size < 1)
				connection_labels = connection_labels.union(RSDFConverter.GRAPH_LABELS); // Invalid state
		});

		// Return valid labels without those that break cliques
		return layer_labels.difference(connection_labels);
	}

	LabelLayer(layer, label)
	{
		if (layer.graph_label == label)
			return;

		[...layer.connections]
		.forEach(connection => {
			connection.neighbour_labels.set(
				layer.graph_label,
				connection.neighbour_labels.get(
					layer.graph_label
				) - 1
			);
			connection.neighbour_labels.set(
				label,
				connection.neighbour_labels.get(
					label
				) + 1
			);
		});

		layer.graph_label = label;
	}

	// Add initial states and neighbour counts to layers
	SetupGraph(layers)
	{
		layers
		.forEach(layer => {
			layer.graph_label = RSDFConverter.LABEL_UNKNOWN;

			layer.neighbour_labels = new Map(
				[...RSDFConverter.GRAPH_LABELS]
					.map(label => [label,0])
			);

			layer.neighbour_labels.set(
				RSDFConverter.LABEL_UNKNOWN,
				layer.connections.size
			);
		});
	}

	// Saves the state of a graph with mappings from layers to labels
	GetGraphState(layers)
	{
		return new Map(
			layers.map(layer =>
				[layer, layer.graph_label]
			)
		);
	}

	// Sets a graph's state using a map from layers to labels
	SetGraphState(state)
	{
		[...state.entries()]
		.forEach(([layer, label]) =>
			this.LabelLayer(layer, label)
		);
	}

	// Attempts to label a graph. To exhaust possibilities, this recurses
	// when a uncertain decision is made. Returns true if labelled, false if not,
	// and resets the graph when a labeling was not possible.
	LabelGraph(layers)
	{
		if (layers.length == 0)
			return true;

		const initial_state = this.GetGraphState(layers);
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
				const possible_labels = this.GetSafeLayerLabels(layer);

				if (possible_labels.size == 0)
				{
					this.SetGraphState(initial_state);
					return false;
				}
				else if (possible_labels.size == 1)
				{
					this.LabelLayer(layer,[...possible_labels][0]);
					
					trivial.delete(layer);
					input.delete(layer);
					input_arr = [...input];
					i = -1;
					continue;
				}

				const unknown_neighbours = [...(
					layer.connections.intersection(input)
				)].filter(connection =>
					connection.graph_label == RSDFConverter.LABEL_UNKNOWN
				);

				if (possible_labels.size <= unknown_neighbours.length)
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

			const allowed_labels = [...this.GetSafeLayerLabels(
				most_connected
			)];

			do
			{
				if (allowed_labels.length == 0)
				{
					this.SetGraphState(initial_state);
					return false;
				}

				this.LabelLayer(
					most_connected,
					allowed_labels.pop()
				);
			}
			while (!this.LabelGraph(input_arr));
		}

		// TODO: Add code to maximise distance between repeated labels
		trivial_groups
		.reverse()
		.forEach(group =>
			[...group]
			.sort((a,b) =>
				a.neighbour_labels.get(RSDFConverter.LABEL_UNKNOWN) -
				b.neighbour_labels.get(RSDFConverter.LABEL_UNKNOWN)
			)
			.forEach(layer => {
				const labels = [...this.GetValidLayerLabels(
					layer
				)];

				this.LabelLayer(
					layer,
					// TODO: Replace random selection with
					// deterministic distance-optimised label
					labels[Math.floor(Math.random() * labels.length)]
				);
			})
		);
		
		return true;
	}

	// Signed distance to path as [Point...]
	GetSignedDistanceToPath(
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
	GetSignedDistanceToPolygon(
		polygon, 
		point, 
		layer, 
		prevDist = undefined
	)
	{
		return polygon.reduce((_prevDist, path) =>
			this.GetSignedDistanceToPath(
				path,
				point,
				layer,
				_prevDist
			),
			prevDist
		);
	}

	// Signed distance to layers as [{poly:[[Point...]...]...}...]
	GetSignedDistanceToLayers(
		layers,
		point,
		prevDist = undefined
	)
	{
		return layers.reduce((_prevDist, layer) =>
			this.GetSignedDistanceToPolygon(
				layer.poly,
				point,
				layer,
				_prevDist
			),
			prevDist
		);
	}

	// Samples an SDF field for layers assumed to have the same label
	LayersToDistances(layers, mapping)
	{
		if (this.print_performance)
			console.time("LayersToDistances");

		const sdf = new Array(mapping.size.Y);
		const sample = new Point();
		for (let row = 0; row < mapping.size.Y; row++)
		{
			const rowDat = sdf[row] = new Array(mapping.size.X);

			sample.Y = Lerp(
				row / (mapping.size.Y - 1),
				mapping.bounds.min.Y,
				mapping.bounds.max.Y
			);

			for (let col = 0; col < mapping.size.X; col++)
			{
				sample.X = Lerp(
					col / (mapping.size.X - 1),
					mapping.bounds.min.X,
					mapping.bounds.max.X
				);

				rowDat[col] = this.GetSignedDistanceToLayers(layers, sample);
			}
		}

		if (this.print_performance)
			console.timeEnd("LayersToDistances");

		return sdf;
	}

	// Splits layers into differently labelled regions,
	// then renders an SDF for each one (up to four).
	// Returns a Map from Label constants to [[Dist...]...]
	LabelledLayersToDistances(layers, mapping)
	{
		if (layers.length == 0)
			return new Map();
		
		if (this.print_performance)
			console.time("LabelledLayersToDistances");

		// Separate layers into groups of single labels
		const labelled_layers = layers.reduce(
			(prev, layer) =>
			{
				const label = layer.graph_label;

				if(!prev.has(label))
					prev.set(label,[]);

				prev.get(label).push(layer);

				return prev;
			},
			new Map()
		);

		if (!this.bvh_enabled)
		{
			// Create a different SDF for each label
			var dists = new Map(
				[...labelled_layers.entries()]
				.map(([label,subLayers],index,arr) => {
					const sdf = this.LayersToDistances(subLayers, mapping);
					
					if (this.print_performance)
						console.timeLog(
							"LabelledLayersToDistances",
							`Finished SDF ${index + 1}/${arr.length}`
						);

					return [label, sdf];
				})
			);
		}
		else
		{	
			if (this.print_performance)
				console.time("LabelledLayersToDistances: BVH");
			
			// Build a combined BVH for each set of layers
			const bvhs = new Map(
				[...labelled_layers.entries()]
				.map(([label,subLayers]) =>
				{
					const edges = subLayers
						.map(LayerToEdges)
						.flat(1);

					const bvh = BVH.FromEdges(
						edges,
						Bounds.FromEdges(edges),
						this.bvh_leaf_size
					);

					if (this.print_debug)
						console.log(bvh.ToString(mapping.bounds));

					return [label, bvh];
				})
			);

			if (this.print_performance)
				console.timeEnd("LabelledLayersToDistances: BVH");

			var dists = new Map(
				[...bvhs.entries()]
				.map(([label,bvh],index,arr) =>
				{
					const sdf = bvh.ToSDF(mapping, this.print_performance);
					
					if (this.print_performance)
						console.timeLog(
							"LabelledLayersToDistances",
							`Finished SDF ${index + 1}/${arr.length}`
						);

					return [label, sdf];
				})
			);
		}

		if (this.print_performance)
			console.timeEnd("LabelledLayersToDistances");

		return dists;
	}

	LayersCalculateVectors(layers)
	{
		if (this.print_performance)
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

		if (this.print_performance)
			console.timeEnd("LayersCalculateVectors");

		return layers;
	}

	DistancesToSDFImage(
		dists,
		mapping
	)
	{
		let data = new Array(mapping.size.X * mapping.size.Y * 4);

		for (let i = 0; i < data.length; i++)
			data[i] = this.max_colour_value;

		[...dists.entries()].forEach(([label,rows]) => {
			if (label == RSDFConverter.LABEL_UNKNOWN)
				return;

			let index = RSDFConverter.CHANNEL_MAPPING.get(label);

			rows
			.forEach(row => row
				.forEach(sample => {
					let dist = this.perpendicular
						? sample.perpendicular
						: sample.euclidean_signed;

					dist = dist > mapping.inner
						? dist < mapping.outer
							? (dist - mapping.inner)
							/ (mapping.outer - mapping.inner)
							: 1
						: 0;

					data[index] = Math.round(dist * this.max_colour_value);
					index += 4;
				})
			)
		});

		return data;
	}

	DistancesToColourImage(
		dists,
		data,
		mapping
	)
	{
		function FromGamma(dists,label,row,col)
		{
			return dists.get(label)[row][col]
				.layer.paint.GetColour(sample)
				// Radial gradients may produce undefined colours
				?? this.invalid_colour;
		}

		function FromLinear(dists,label,row,col)
		{
			return dists.get(label)[row][col]
				.layer.paint.GetColour(sample).FromLinear()
				// Radial gradients may produce undefined colours
				?? this.invalid_colour;
		}

		const ColourFromDists = this.linear_enabled
			? FromLinear
			: FromGamma;

		const data_out = new Array(mapping.size.X * mapping.size.Y * 4);
		const sample = new Point()

		for (let row = 0, i = 0; row < mapping.size.Y; row++)
		{
			sample.Y = Lerp(
				row / (mapping.size.Y - 1),
				mapping.bounds.min.Y,
				mapping.bounds.max.Y
			);
			
			let colour_out;
			for (let col = 0; col < mapping.size.X;
				col++,
				data_out[i++] = Math.round(colour_out.r * this.max_colour_value),
				data_out[i++] = Math.round(colour_out.g * this.max_colour_value),
				data_out[i++] = Math.round(colour_out.b * this.max_colour_value),
				data_out[i++] = Math.round(colour_out.a * this.max_colour_value)
			)
			{
				sample.X = Lerp(
					col / (mapping.size.X - 1),
					mapping.bounds.min.X,
					mapping.bounds.max.X
				);

				const r = data[i+0];
				const g = data[i+1];
				const b = data[i+2];
				const a = data[i+3];

				const min = Math.min(r,g,b,a)

				const min_channels = [
					[r,RSDFConverter.LABEL_1],
					[g,RSDFConverter.LABEL_2],
					[b,RSDFConverter.LABEL_3],
					[a,RSDFConverter.LABEL_4]
				].filter(([v,l]) => dists.has(l) && v == min)
				.map(([v,l]) => l);

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
				
				if (this.bleed_mode == RSDFConverter.BLEED.MARK)
				{
					colour_out = this.bleed_colour;
					continue;
				}
				
				if (this.bleed_mode == RSDFConverter.BLEED.AVERAGE)
				{
					colour_out = new RGB(0,0,0,0);

					min_channels
					.forEach(label => {
						let sample_colour = ColourFromDists(
							dists,
							label,
							row,
							col
						);

						if (this.linear_enabled)
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

					if (this.linear_enabled)
						colour_out = colour_out.FromLinear();

					continue;
				}

				let min_obj = dists.get(min_channels[0])[row][col];
				let min_dist = min_obj.euclidean_signed;

				min_channels
				.slice(1)
				.forEach(label => {
					const obj = dists.get(label)[row][col];
					const dist = obj.euclidean_signed;

					if (dist > min_dist)
						return;

					min_obj = obj;
					min_dist = dist;
				});

				colour_out = min_obj.layer.paint.GetColour(sample);

				if (this.linear_enabled && colour_out)
					colour_out = colour_out.FromLinear();

				colour_out ??= OUTPUT_RENDER_this.invalid_colour;
			}
		}

		return data_out;
	}

	SaturateSDFImage(data)
	{
		let data_out = [];

		for (let i = 0; i+3 < data.length; i += 4)
		{
			let r = data[i+0];
			let g = data[i+1];
			let b = data[i+2];
			let a = data[i+3];
			let min = Math.min(r,g,b,a);
			data_out.push(r == min ? 0 : this.max_colour_value);
			data_out.push(g == min ? 0 : this.max_colour_value);
			data_out.push(b == min ? 0 : this.max_colour_value);
			data_out.push(a == min ? 0 : this.max_colour_value);
		}

		return data_out;
	}

	InvertSDFImage(data)
	{
		return data.map(v => this.max_colour_value - v);
	}

	FalseColourSDFImage(data)
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
			data_out.push(this.max_colour_value);
		}

		return data_out;
	}

	GetImageMapping(layers)
	{
		let alignment = this.alignment;
		
		// Get the content box to align to
		if (this.content_box == RSDFConverter.CONTENT_BOX.VIEWBOX)
		{
			var content_bounds = this.viewbox;
		}
		else
		{
			var content_bounds = layers.reduce(
				(_bounds,layer) => {
					layer.poly
					.forEach(path => path
						.forEach(point => 
							_bounds = new Bounds(
								Point.Min(_bounds.min,point),
								Point.Max(_bounds.max,point)
							)
						)
					)
					return _bounds;
				},
				new Bounds()
			);
		}

		if (this.print_debug)
			console.log(`GetImageMapping: Content bounds: (${content_bounds.min.X},${content_bounds.min.Y}) \
- (${content_bounds.max.X},${content_bounds.max.Y})`);

		// Get final image resolution
		if (!this.fixed_aspect)
		{
			if (content_bounds.width < content_bounds.height) // Shrink image width
				var output_resolution = new Point(
					Math.round(this.size * content_bounds.width / content_bounds.height),
					this.size
				);
			else if (content_bounds.width > content_bounds.height) // Shrink image height
				var output_resolution = new Point(
					this.size,
					Math.round(this.size * content_bounds.height / content_bounds.width)
				);
			else
				var output_resolution = new Point(this.size);
		}
		else
		{
			if (this.aspect_mode == RSDFConverter.ASPECT.X_Y)
				var output_resolution = new Point(
					Math.round(this.size * this.aspect),
					this.size
				);
			else
				var output_resolution = new Point(
					this.size,
					Math.round(this.size * this.aspect)
				);
		}

		// Get the resolution of the inner image fit to the content
		let fit_resolution = output_resolution.Copy();

		if (this.sample_borders)
		{
			fit_resolution.X -= 1.0;
			fit_resolution.Y -= 1.0;
		}

		if (this.outer_margin)
		{
			fit_resolution.X -= this.outer_px * 2.0;
			fit_resolution.Y -= this.outer_px * 2.0;
		}

		if (fit_resolution.X <= 0.0 || fit_resolution.Y <= 0.0)
			throw Error(`GetImageMapping: Fit resolution is non-positive \
(${fit_resolution.X}x${fit_resolution.Y}) due to corner sampling or outer margin!`);

		const w_units = content_bounds.width / fit_resolution.X
		const h_units = content_bounds.height / fit_resolution.Y;
		
		// If the aspect isn't fixed, horizontal density matches vertical density,
		// or the scaling is set to STRETCH, then the image is scaled relative to the box
		if ((this.fixed_aspect
				? w_units == h_units
				: content_bounds.width == content_bounds.height
			) ||
			this.scaling == RSDFConverter.SCALING.STRETCH)
		{
			var pixel_units = new Point(w_units, h_units);
			var fit_size = content_bounds.size.Copy();
		}
		// Otherwise, the box is scaled relative to the image
		else if (this.fixed_aspect
			// If fixed aspect, use scaling mode to decide between smaller or larger pixel units
			? (this.scaling == RSDFConverter.SCALING.FIT) == (w_units < h_units)
			// If free aspect, keep the larger side fixed
			: content_bounds.width < content_bounds.height)
		{
			var pixel_units = new Point(h_units);
			var fit_size = new Point(
				fit_resolution.X * h_units,
				content_bounds.height
			);
		}
		else
		{
			var pixel_units = new Point(w_units);
			var fit_size = new Point(
				content_bounds.width,
				fit_resolution.Y * w_units
			);
		}
		
		let fit_position = content_bounds.size
			.Subtract(fit_size)
			.Multiply(this.alignment)
			.Add(content_bounds.min);

		let fit_bounds = new Bounds(
			fit_position,
			fit_position.Add(fit_size)
		);

		if (this.print_debug)
		{
			console.log(`GetImageMapping: Fit resolution: ${fit_resolution.X}x${fit_resolution.Y}`);
			console.log(`GetImageMapping: Fit bounds: (${fit_bounds.min.X},${fit_bounds.min.Y}) \
- (${fit_bounds.max.X},${fit_bounds.max.Y})`);
		}

		if (!this.sample_borders)
		{
			fit_bounds.min = fit_bounds.min.Add(pixel_units.Scale(0.5));
			fit_bounds.max = fit_bounds.max.Subtract(pixel_units.Scale(0.5));
		}

		if (this.outer_margin)
		{
			fit_bounds.min = fit_bounds.min.Subtract(pixel_units.Scale(this.outer_px));
			fit_bounds.max = fit_bounds.max.Add(pixel_units.Scale(this.outer_px));
		}

		if (this.print_debug)
		{
			console.log(`GetImageMapping: Output resolution: ${output_resolution.X}x${output_resolution.Y}`);
			console.log(`GetImageMapping: Output bounds: (${fit_bounds.min.X},${fit_bounds.min.Y}) \
- (${fit_bounds.max.X},${fit_bounds.max.Y})`);
		}

		if (pixel_units.X == pixel_units.Y)
			// Arbitrary choice
			pixel_units = pixel_units.X;
		else
			// You could take the min here, or always choose X or Y
			pixel_units = Math.max(pixel_units.X, pixel_units.Y);

		const inner = this.inner_px * pixel_units;
		const outer = this.outer_px * pixel_units;

		if (this.print_debug)
			console.log(`GetImageMapping: SDF range: -${-inner} - +${outer}`);

		return {
			bounds: fit_bounds,
			inner: inner,
			outer: outer,
			size: output_resolution
		};
	}
}