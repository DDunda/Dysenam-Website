class Point
{
	constructor(X = 0, Y = X)
	{
		this.X = X;
		this.Y = Y;
	}

	Copy()
	{
		return new Point(
			this.X,
			this.Y
		);
	}

	Add(other)
	{
		return new Point(
			this.X + other.X,
			this.Y + other.Y
		);
	}

	Subtract(other)
	{
		return new Point(
			this.X - other.X,
			this.Y - other.Y
		);
	}

	Scale(scale)
	{
		return new Point(
			this.X * scale,
			this.Y * scale
		);
	}

	ScaleInv(scale)
	{
		return new Point(
			this.X / scale,
			this.Y / scale
		);
	}

	LengthSqr()
	{
		return this.X * this.X + this.Y * this.Y;
	}

	Length()
	{
		return Math.sqrt(this.LengthSqr());
	}

	Normalised()
	{
		return this.ScaleInv(this.Length());
	}

	Abs()
	{
		return new Point(
			Math.abs(this.X),
			Math.abs(this.Y)
		);
	}

	DotProduct(other)
	{
		return this.X * other.X + this.Y * other.Y;
	}

	static Equal(a,b)
	{
		return a.X == b.X && a.Y == b.Y;
	}

	static DistanceSqr(a,b)
	{
		return a.Subtract(b).LengthSqr();
	}

	static Distance(a,b)
	{
		return Math.hypot(a.X - b.X, a.Y - b.Y);
	}

	static Min(a,b)
	{
		return new Point(
			Math.min(a.X,b.X),
			Math.min(a.Y,b.Y)
		);
	}

	static Max(a,b)
	{
		return new Point(
			Math.max(a.X,b.X),
			Math.max(a.Y,b.Y)
		);
	}
}

class Dist
{
	constructor(
		euclidean = Number.POSITIVE_INFINITY,
		perpendicular = Number.POSITIVE_INFINITY,
		layer = undefined
	)
	{
		this.euclidean = euclidean;
		this.perpendicular = perpendicular;
		this.layer = layer;
	}

	static GetClosest(dista, distb)
	{
		if (dista === undefined)
			return distb;

		if (distb === undefined)
			return dista;

		if (dista.euclidean < distb.euclidean)
			return dista;

		if (dista.euclidean > distb.euclidean)
			return distb;

		if (Math.abs(dista.perpendicular) < Math.abs(distb.perpendicular))
			return dista
		
		return distb;
	}

	get euclidean_signed()
	{
		return this.perpendicular < 0
			? -this.euclidean
			: this.euclidean;
	}
}

class Edge
{
	constructor(
		vert1,
		vert2,
		layer,
		bounds
	)
	{
		this.vert1 = vert1;
		this.vert2 = vert2;
		this.layer = layer;
		this.bounds = bounds;
	}

	SignedDistance(point)
	{
		if (Point.Equal(this.vert1,this.vert2))
		{
			const dist = Point.Distance(this.vert1, point);
			return new Dist(dist, dist, this.layer);
		}

		const _point = point.Subtract(this.vert1);

		const tangent = _point.DotProduct(this.vert1.edge_tangent) / this.vert1.edge_len;
		const perpendicular = _point.DotProduct(this.vert1.edge_normal);
		
		if (tangent <= 0)
		{
			if (_point
				.DotProduct(this.vert1.point_tangent)
				< 0
			)
				return undefined;
			
			var closest = this.vert1;
		}
		else if (tangent >= 1)
		{
			if (point
				.Subtract(this.vert2)
				.DotProduct(this.vert2.point_tangent)
				> 0
			)
				return undefined;
			
			var closest = this.vert2;
		}
		else // If perpendicular to the edge, then euclidean equals perpendicular
			return new Dist(
				Math.abs(perpendicular),
				perpendicular,
				this.layer
			);

		return new Dist(
			Point.Distance(point, closest),
			perpendicular,
			this.layer
		);
	}
}

class Bounds
{
	constructor(
		min = new Point(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
		max = new Point(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)
	)
	{
		this.min = min;
		this.max = max;

		this.center = new Point(
			(max.X+min.X) * 0.5,
			(max.Y+min.Y) * 0.5
		);
		this.half_size = new Point(
			(max.X-min.X) * 0.5,
			(max.Y-min.Y) * 0.5
		);
	}

	// Gets the bounds of an array of edge objects.
	static FromEdges(edges)
	{
		return edges.reduce((prev,edge) =>
			Bounds.Union(prev,edge.bounds),
			undefined
		);
	}

	// Gets the "union" of two bounds, or a bounds that encompasses both bounds.
	static Union(a, b)
	{
		if (!a) return b;
		if (!b) return a;
		return new Bounds(
			Point.Min(a.min, b.min),
			Point.Max(a.max, b.max)
		);
	}

	// Gets the intersection of two bounds.
	// Returns undefined if there was no intersection
	static Intersection(a, b)
	{
		if (!a || !b) return undefined;
		if (
			a.max.X < b.min.X ||
			a.min.X > b.max.X ||
			a.max.Y < b.min.Y ||
			a.min.Y > b.max.Y
		)
			return undefined;
		
		return new Bounds(
			Point.Max(a.min,b.min),
			Point.Min(a.max,b.max),
		);
	}

	// Gets the area of these bounds.
	Area()
	{
		return (this.max.X - this.min.X) * (this.max.Y - this.min.Y);
	}

	// Gets the perimeter of these bounds.
	Perimeter()
	{
		return (this.max.X - this.min.X + this.max.Y - this.min.Y) * 2;
	}

	// Gets the Dist from a point to these bounds.
	SignedDistance(point)
	{
		// https://iquilezles.org/articles/distfunctions2d/
		const d = new Point(
			Math.abs(point.X - this.center.X)
			 - this.half_size.X,
			Math.abs(point.Y - this.center.Y)
			 - this.half_size.Y
		);
		const e = new Point(
			Math.max(d.X,0),
			Math.max(d.Y,0)
		);
			
		return new Dist(
			Math.hypot(e.X,e.Y),
			Math.max(d.X,d.Y)
		);
	}

	// Gets the perpendicular distance from a point to these bounds.
	// Faster than SignedDistance due to lacking sqrt.
	PerpendicularDist(point)
	{
		const d = new Point(
			Math.abs(point.X - this.center.X)
			 - this.half_size.X,
			Math.abs(point.Y - this.center.Y)
			 - this.half_size.Y
		);
		return Math.max(d.X,d.Y);
	}
}

// Base class for the BVH structure
class BVH
{
	static CmpEdgesMinToMaxX(a,b)
	{
		const r = a.bounds.min.X - b.bounds.min.X;
		return r != 0 ? r : (b.bounds.max.X - a.bounds.max.X);
	}

	static CmpEdgesMaxToMinX(a,b)
	{
		const r = b.bounds.max.X - a.bounds.max.X;
		return r != 0 ? r : (a.bounds.min.X - b.bounds.min.X)
	}

	static CmpEdgesMinToMaxY(a,b)
	{
		const r = a.bounds.min.Y - b.bounds.min.Y;
		return r != 0 ? r : (b.bounds.max.Y - a.bounds.max.Y);
	}

	static CmpEdgesMaxToMinY(a,b)
	{
		const r = b.bounds.max.Y - a.bounds.max.Y;
		return r != 0 ? r : (a.bounds.min.Y - b.bounds.min.Y)
	}

	// Splits an array of edges into two, based on a sort
	// from min to max and max to min. These may be different
	// based on the extent of edge extents, or the same based
	// on centers.
	static SplitEdges(edges, cmpMinToMax, cmpMaxToMin)
	{
		if (edges.length == 0) return [[],[]];

		const sorted_edges = [
			[...edges].sort(cmpMinToMax),
			[...edges].sort(cmpMaxToMin)
		];

		let added = new Set();
		let edges_out = [[],[]];
		let sum_lengths = [0,0];
		let bounds = [
			undefined,
			undefined
		];

		let to_add0 = sorted_edges[0][0];
		let to_add1 = sorted_edges[1][0];

		for (let i = [0,0]; added.size < edges.length;)
		{
			while (added.has(to_add0))
			{
				i[0]++;
				to_add0 = sorted_edges[0][i[0]];
			}
			while (added.has(to_add1))
			{
				i[1]++;
				to_add1 = sorted_edges[1][i[1]];
			} 

			const union0 = Bounds.Union(bounds[0], to_add0.bounds);
			const union1 = Bounds.Union(bounds[1], to_add1.bounds);

			if ( // A cost function similar to the 3D surface area heuristic
				(sum_lengths[0] + to_add0.vert1.edge_len) * union0.Area() <=
				(sum_lengths[1] + to_add1.vert1.edge_len) * union1.Area()
			)
			{
				bounds[0] = union0;
				edges_out[0].push(to_add0);
				added.add(to_add0);
				sum_lengths[0] += to_add0.vert1.edge_len;
				i[0]++;
				to_add0 = sorted_edges[0][i[0]];
			}
			else
			{
				bounds[1] = union1;
				edges_out[1].push(to_add1);
				added.add(to_add1);
				sum_lengths[1] += to_add1.vert1.edge_len;
				i[1]++;
				to_add1 = sorted_edges[1][i[1]];
			}
		}

		return [
			{
				bounds: bounds[0],
				edges: edges_out[0]
			},
			{
				bounds: bounds[1],
				edges: edges_out[1]
			}
		];
	}

	// Takes edge objects, and recursively splits the set of edges in half based on bounding boxes
	static FromEdges(edges, bounds)
	{	
		// TODO?: Use a cost function to check if a split is better than a leaf, rather than only stopping by a size bound
		if (edges.length < BVH_LEAF_MAX_COUNT)
			return new BVHLeaf(bounds, edges);
			
		const split_x = BVH.SplitEdges(
			edges,
			BVH.CmpEdgesMinToMaxX,
			BVH.CmpEdgesMaxToMinX
		);
		const split_y = BVH.SplitEdges(
			edges,
			BVH.CmpEdgesMinToMaxY,
			BVH.CmpEdgesMaxToMinY
		);

		// Take the ratio between the size of 
		const area_ratio_x = (Bounds.Intersection(
			split_x[0].bounds,
			split_x[1].bounds
		)?.Area() ?? 0)
		/ Math.min(
			split_x[0].bounds?.Area() ?? 0,
			split_x[1].bounds?.Area() ?? 0
		);
		const area_ratio_y = (Bounds.Intersection(
			split_y[0].bounds,
			split_y[1].bounds
		)?.Area() ?? 0)
		/ Math.min(
			split_y[0].bounds?.Area() ?? 0,
			split_y[1].bounds?.Area() ?? 0
		);

		// Attempt to minimise the intersection between the splits
		if (area_ratio_x < area_ratio_y)
			var out = split_x;
		else
			var out = split_y;
		
		// Recursively finish the BVH by creating a sub-tree for each branch.
		return new BVHBranch(
			bounds,
			[
				BVH.FromEdges(
					out[0].edges,
					out[0].bounds
				),
				BVH.FromEdges(
					out[1].edges,
					out[1].bounds
				)
			]
		);
	}

	// Attaches a calculated BVH onto a layer from its points.
	static CalculateForLayer(layer)
	{
		const edges = LayerToEdges(layer);

		layer.bvh = BVH.FromEdges(
			edges,
			Bounds.FromEdges(edges)
		);

		console.log(layer.bvh.ToString());
		
		return layer;
	}

	// Runs BVH.CalculateForLayer for each layer in an array
	static CalculateForLayers(layers)
	{
		console.time("BVH.CalculateForLayers");
		layers.forEach(layer => {
			BVH.CalculateForLayer(layer)
		});
		console.timeEnd("BVH.CalculateForLayers");
		
		return layers;
	}

	// Turns a BVH tree into a string for printing
	ToString(start = "")
	{
		// The bounds, always printed at the root of a node
		const root = `┬ ${(this.bounds.min.X / WORKING_SCALE * SDF_SIZE).toFixed(1)
				}-${(this.bounds.max.X / WORKING_SCALE * SDF_SIZE).toFixed(1)
				}, ${(this.bounds.min.Y / WORKING_SCALE * SDF_SIZE).toFixed(1)
				}-${(this.bounds.max.Y / WORKING_SCALE * SDF_SIZE).toFixed(1)})\n`

		// Branches return a tree with subtrees of each branch...
		if (this.constructor === BVHBranch)
			return `${root}${
				start}├${this.branches[0].ToString(start + "│")}\n${
				start}└${this.branches[1].ToString(start + " ")}`
		
		// And leaves return the number of contained edges.
		return `${root}${start}└ ${this.edges.length} edges`;
	}

	// Gets the signed distance from a point to edges in this bvh.
	// This function is a bit uglier than usual
	// because it is optimised for performance.
	SignedDistance(point, prevDist = undefined)
	{
		let to_check = [{
			dist: this.bounds.PerpendicularDist(point),
			bvh: this
		}];

		let cmp_dist = prevDist?.euclidean ?? Number.POSITIVE_INFINITY;

		if (cmp_dist <= to_check[0].dist)
			return prevDist;

		let cur_dist = prevDist;

		for(;;) {
			const cur = to_check.pop();
			
			if (cur.bvh.constructor === BVHBranch)
			{
				// Add branches to be checked
				for (let i = 0; i < cur.bvh.branches.length; i++)
				{
					const branch = cur.bvh.branches[i];
					const dist = branch.bounds.PerpendicularDist(point);

					if (cmp_dist <= dist)
						continue;

					to_check.push({
						dist: dist,
						bvh: branch
					});
				}
				if (to_check.length == 0)
					return cur_dist;

				// Sort reversed to use pop instead of unshift
				to_check = to_check.sort((a,b) => b.dist - a.dist);
				continue;
			}

			for (let i = 0; i < cur.bvh.edges.length; i++)
			{
				const edge = cur.bvh.edges[i];

				if (cmp_dist <= edge.bounds.PerpendicularDist(point))
					continue;

				cur_dist = Dist.GetClosest(
					cur_dist,
					edge.SignedDistance(point)
				);

				cmp_dist = cur_dist?.euclidean
					?? Number.POSITIVE_INFINITY;
			}

			if (to_check.length == 0)
				return cur_dist;

			// Elements up to this index are now too far away
			let discard = 0;

			// If short, do a simple linear search to avoid overhead	
			if (to_check.length <= 4) // 4 seems good experimentally
			{
				do
				{
					if (cmp_dist >= to_check[discard].dist)
						break;
					else
						discard++;
				}
				while (discard < to_check.length);
			}
			else // Binary search: https://stackoverflow.com/a/21822316
			{
				let upper = to_check.length;
				
				do
				{
					const mid = (discard + upper) >>> 1;

					if (cmp_dist < to_check[mid].dist)
						discard = mid + 1;
					else
						upper = mid;
				}
				while (discard < upper);
			}

			if (discard == 0) // Discard nothing
				continue;
			else if (discard == to_check.length) // Discard all remaining nodes
				return cur_dist;

			to_check = to_check.slice(discard);
		}
	}

	// Samples an SDF field for a BVH assumed to be of the same colour
	ToSDF(width, height, viewbox)
	{
		console.time("BVH.ToSDF");
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

				rowDat[col] = this.SignedDistance(sample);
			}
		}

		console.timeEnd("BVH.ToSDF");

		return sdf;
	}
}

// BVH class for branches. Contains child BVH nodes.
class BVHBranch extends BVH
{
	constructor(bounds, branches)
	{
		super();
		this.bounds = bounds;
		this.branches = branches;
	}
}

// BVH class for leaves. Contains edges, and is the end of a tree.
class BVHLeaf extends BVH
{
	constructor(bounds, edges)
	{
		super();
		this.bounds = bounds;
		this.edges = edges;
	}
}

const BLEND_MODE = {
	NORMAL:      0,
	MULTIPLY:    1,
	SCREEN:      2,
	OVERLAY:     3,
	DARKEN:      4,
	LIGHTEN:     5,
	DODGE:       6,
	BURN:        7,
	HARDLIGHT:   8,
	SOFTLIGHT:   9,
	DIFFERENCE: 10,
	EXCLUSION:  11
};

const BLEND_MODE_MAP = {
	normal:        BLEND_MODE.NORMAL,
	multiply:      BLEND_MODE.MULTIPLY,
	screen:        BLEND_MODE.SCREEN,
	overlay:       BLEND_MODE.OVERLAY,
	darken:        BLEND_MODE.DARKEN,
	lighten:       BLEND_MODE.LIGHTEN,
	"color-dodge": BLEND_MODE.DODGE,
	"color-burn":  BLEND_MODE.BURN,
	"hard-light":  BLEND_MODE.HARDLIGHT,
	"soft-light":  BLEND_MODE.SOFTLIGHT,
	difference:    BLEND_MODE.DIFFERENCE,
	exclusion:     BLEND_MODE.EXCLUSION
};

// Dodge, burn: only for certain values
// Overlay, hard light: only if their channels are on the same side of 0.5
// Darken, lighten: only if their values are the same
// Soft light: only if the second value is 0.5 (has no effect)
// Difference: only if a or b == 0, or a = 1 for any b
const MERGABLE_BLEND_MODES = new Set([
	BLEND_MODE.NORMAL,
	BLEND_MODE.MULTIPLY,
	BLEND_MODE.SCREEN,
	BLEND_MODE.EXCLUSION
]);

class RGB
{
	constructor(r,g,b,a=1)
	{
		this.r = r;
		this.g = g;
		this.b = b;
		this.a = a;
	}

	static to_lrgb = culori.converter("lrgb");
	static to_srgb = culori.converter("rgb");

	static FromString(s, linear = false)
	{
		const c = (linear ? this.to_lrgb : this.to_srgb)(s);

		if (c === undefined)
			return undefined;

		return new RGB(
			c.r ?? 0,
			c.g ?? 0,
			c.b ?? 0,
			c.alpha ?? 1
		);
	}
	
	FromLinear()
	{
		const c = RGB.to_srgb(
			{
				mode: "lrgb",
				r: this.r,
				g: this.g,
				b: this.b,
				alpha: this.a
			}
		);

		if (c === undefined)
			return undefined;

		return new RGB(
			c.r ?? 0,
			c.g ?? 0,
			c.b ?? 0,
			c.alpha ?? 1
		);
	}

	ToLinear()
	{
		const c = RGB.to_lrgb(
			{
				mode: "rgb",
				r: this.r,
				g: this.g,
				b: this.b,
				alpha: this.a
			}
		);

		if (c === undefined)
			return undefined;

		return new RGB(
			c.r ?? 0,
			c.g ?? 0,
			c.b ?? 0,
			c.alpha ?? 1
		);
	}
	
	Copy()
	{
		return new RGB(
			this.r,
			this.g,
			this.b,
			this.a
		);
	}

	static Equal(a, b)
	{
		return (a === undefined && b === undefined)
		|| (
			a !== undefined && b !== undefined
			&& a.r == b.r
			&& a.g == b.g
			&& a.b == b.b
			&& a.a == b.a
		);
	}

	// https://www.w3.org/TR/compositing/#blendingnormal
	static Normal(bkg, src)
	{
		return src;
	}

	// https://www.w3.org/TR/compositing/#blendingmultiply
	static Multiply(bkg, src)
	{
		return bkg * src;
	}

	// https://www.w3.org/TR/compositing/#blendingscreen
	static Screen(bkg, src)
	{
		return 1 - (1 - bkg) * (1 - src);
	}

	// https://www.w3.org/TR/compositing/#blendingoverlay
	static Overlay(bkg, src)
	{
		return HardLight(src,bkg);
	}

	// https://www.w3.org/TR/compositing/#blendingdarken
	static Darken(bkg, src)
	{
		return Math.min(src,bkg);
	}

	// https://www.w3.org/TR/compositing/#blendinglighten
	static Lighten(bkg, src)
	{
		return Math.max(src,bkg);
	}

	// https://www.w3.org/TR/compositing/#blendingcolordodge
	static Dodge(bkg, src)
	{
		if (bkg == 0)
			return 0;
		if (src == 1)
			return 1
		return Math.min(1, bkg / (1 - src));
	}

	// https://www.w3.org/TR/compositing/#blendingcolorburn
	static Burn(bkg, src)
	{
		return 1 - Dodge(1 - bkg, 1 - src);
	}

	// https://www.w3.org/TR/compositing/#blendinghardlight
	static HardLight(bkg, src)
	{
		return src <= 0.5
			? Multiply(bkg, 2 * src)
			: Screen(bkg, 2 * src - 1);
	}

	// https://www.w3.org/TR/compositing/#blendingsoftlight
	static SoftLight(bkg, src)
	{
		const D = bkg <= 0.25
			? ((16 * bkg - 12) * bkg + 4) * bkg
			: Math.sqrt(bkg);

		return bkg + (2 * src - 1) * (
			src <= 0.5
			? (1 - bkg) * bkg
			: D - bkg
		);
	}

	// https://www.w3.org/TR/compositing/#blendingdifference
	static Difference(bkg, src)
	{
		return Math.abs(bkg-src);
	}

	// https://www.w3.org/TR/compositing/#blendingexclusion
	static Exclusion(bkg, src)
	{
		return bkg + src - 2 * bkg * src;
	}

	// Operates upon individual channels as per the SVG spec:
	// https://www.w3.org/TR/compositing/#blendingseparable
	static SEPARABLE_BLEND_FUNCTIONS = new Map([
		[BLEND_MODE.NORMAL,      RGB.Normal    ],
		[BLEND_MODE.MULTIPLY,    RGB.Multiply  ],
		[BLEND_MODE.SCREEN,      RGB.Screen    ],
		[BLEND_MODE.OVERLAY,     RGB.Overlay   ],
		[BLEND_MODE.DARKEN,      RGB.Darken    ],
		[BLEND_MODE.LIGHTEN,     RGB.Lighten   ],
		[BLEND_MODE.DODGE,       RGB.Dodge     ],
		[BLEND_MODE.BURN,        RGB.Burn      ],
		[BLEND_MODE.HARDLIGHT,   RGB.HardLight ],
		[BLEND_MODE.SOFTLIGHT,   RGB.SoftLight ],
		[BLEND_MODE.DIFFERENCE,  RGB.Difference],
		[BLEND_MODE.EXCLUSION,   RGB.Exclusion ]
	]);

	static Lerp(mix, min, max)
	{
		if (RGB.Equal(min, max))
			return max;

		if (mix == 0) return min;
		if (mix == 1) return max;

		return new RGB(
			Lerp(mix, min.r, max.r),
			Lerp(mix, min.g, max.g),
			Lerp(mix, min.b, max.b),
			Lerp(mix, min.a, max.a)
		);
	}

	// Layers two colours, with src on top, and bkg in the background
	// https://www.w3.org/TR/compositing/#blending
	static Blend(bkg, src, mode = BLEND_MODE.NORMAL)
	{
		if (src.a == 0)
			return bkg;

		if (bkg.a == 0)
			return src;

		// TODO: Support non-separable blend modes
		const B = RGB.SEPARABLE_BLEND_FUNCTIONS.get(mode) ?? RGB.Normal;

		let result = new RGB(
			B(bkg.r, src.r),
			B(bkg.g, src.g),
			B(bkg.b, src.b),
			1
		);

		if (src.a == 1)
			return RGB.Lerp(bkg.a, src, result);
		
		if (bkg.a == 1)
			return RGB.Lerp(src.a, bkg, result);

		result.a = bkg.a + src.a - bkg.a * src.a;

		result.r = (result.r * bkg.a * src.a +
			bkg.r * bkg.a * (1 - src.a) +
			src.r * src.a * (1 - bkg.a)
		) / result.a;

		result.g = (result.g * bkg.a * src.a +
			bkg.g * bkg.a * (1 - src.a) +
			src.g * src.a * (1 - bkg.a)
		) / result.a;

		result.b = (result.b * bkg.a * src.a +
			bkg.b * bkg.a * (1 - src.a) +
			src.b * src.a * (1 - bkg.a)
		) / result.a;

		return result;
	}
}

class Paint
{
	constructor(blend_mode)
	{
		this.blend_mode = blend_mode;
	}

	static FromString(text, bounds, opacity, blend_mode, root, linear = false)
	{
		const URL_REGEX = /^url\((['"]?)\#(.+)\1\)$/;

		if (!text)
			return new PaintConstant(new RGB(0,0,0,opacity), 1, blend_mode);
		
		const colour = RGB.FromString(text, linear);

		if (colour !== undefined)
			return new PaintConstant(colour, opacity, blend_mode);

		if (!URL_REGEX.test(text))
			throw new Error(`Paint.FromString: Expected colour, got '${text}'.`);

		const paint_element = root.getElementById(text.match(URL_REGEX)[2]);

		if (paint_element === undefined)
			throw new Error(`Paint.FromString: Could not find element with id in ${text}.`);

		const tag = paint_element.tagName.toUpperCase();
 
		if (tag == "LINEARGRADIENT")
			return PaintGradientLinear.FromLinearElement(paint_element, bounds, opacity, blend_mode, linear);

		if (tag == "RADIALGRADIENT")
			return PaintGradientRadial.FromRadialElement(paint_element, bounds, opacity, blend_mode, linear);

		throw new Error(`Paint.FromString: Attempted to retrieve gradient from URL, got '${paint_element.tagName}' element.`);
	}

	static Equal(a,b)
	{
		if (a.constructor !== b.constructor)
			return false;

		return a.constructor.Equal(a,b);
	}

	Blend(point, background)
	{
		const source = this.GetColour(point);

		return RGB.Blend(background, source, this.blend_mode);
	}

	CompositeOver(other)
	{
		if (this.opaque)
			return this.Copy();

		return new PaintComposite(
			[other.Copy(),this.Copy()],
			1,
			BLEND_MODE.NORMAL
		);
	}
}

class PaintConstant extends Paint
{
	constructor(colour, opacity = 1, blend_mode = BLEND_MODE.NORMAL)
	{
		super(blend_mode);
		this.colour = colour;
		this.colour.a *= opacity;
	}

	Copy()
	{
		return new PaintConstant(
			this.colour.Copy(),
			1,
			this.blend_mode
		);
	}

	static Equal(a,b)
	{
		return a.blend_mode == b.blend_mode
			&& RGB.Equal(a.colour, b.colour);
	}

	// Returns undefined if this cannot merge into a single paint
	MergeAtop(other)
	{
		const blend_mode = this.blend_mode;

		if (!other.opaque)
		{
			if (this.blend_mode != other.blend_mode)
				return undefined;

			if (!MERGABLE_BLEND_MODES.has(blend_mode))
				return undefined;
		}

		if (other.constructor == PaintComposite)
			return undefined;

		const src = this.colour;

		if (other.constructor == PaintConstant)
		{
			const bkg = other.colour;

			return new PaintConstant(
				RGB.Blend(
					bkg,
					src,
					blend_mode
				),
				1,
				other.blend_mode
			);
		}

		const merged = other.Copy();

		merged.stops
		.forEach(stop => {
			const bkg = stop.colour;

			stop.colour = RGB.Blend(
				bkg,
				src,
				blend_mode
			);
		});

		return merged;
	}

	MergeBelow(other)
	{
		const blend_mode = other.blend_mode;

		if (!this.opaque)
		{
			if (this.blend_mode != other.blend_mode)
				return undefined;

			if (!MERGABLE_BLEND_MODES.has(blend_mode))
				return undefined;
		}

		if (other.constructor == PaintComposite)
			return undefined;

		const bkg = this.colour;

		if (other.constructor == PaintConstant)
		{
			const src = other.colour;

			return new PaintConstant(
				RGB.Blend(
					bkg,
					src,
					blend_mode,
				),
				1,
				this.blend_mode
			);
		}

		const merged = other.Copy();

		merged.stops
		.forEach(stop => {
			const src = stop.colour;

			stop.colour = RGB.Blend(
				bkg,
				src,
				blend_mode
			);
		});

		merged.blend_mode = this.blend_mode;

		return merged;
	}

	ScaleOpacity(scale)
	{
		this.colour.a *= scale;
	}

	GetColour(point)
	{
		return this.colour;
	}

	get opaque()
	{
		return this.blend_mode == BLEND_MODE.NORMAL
			&& this.colour.a == 1;
	}

}

class GradientStop
{
	constructor(offset, colour)
	{
		this.offset = offset; // Expected to be based on 0-1
		this.colour = colour;
	}

	static StopsFromElement(element, length, linear = false)
	{
		return [...element
		.getElementsByTagName("stop")]
		.map(stop => {
			let colour = RGB.FromString(
				GetAttributeOrStyle(stop, "stop-color")
				?? "black",
				linear
			) ?? new RGB(0,0,0);

			const _opacity = GetAttributeOrStyle(stop, "stop-opacity");
			const opacity = _opacity != undefined && !Number.isNaN(_opacity)
				? Clamp01(Number(_opacity))
				: 1;

			colour.a *= opacity;
			
			const _offset = stop.offset;
			const offset =
			_offset.constructor === SVGAnimatedNumber ||
			_offset.constructor === SVGNumber
				? stop.getAttribute("offset").slice(-1) == "%"
					? _offset.baseVal
					: _offset.baseVal / length
				: 0;

			return new GradientStop(
				offset,
				colour
			);
		});
	}

	Copy()
	{
		return new GradientStop(
			this.offset,
			this.colour.Copy()
		);
	}

	static Equal(a,b)
	{
		return a.offset == b.offset
			&& RGB.Equal(a.colour,b.colour);
	}

	static MergeStops(stops_bkg, stops_src, blend_mode)
	{
		if (stops_bkg.length == 0)
			return stops_src.map(stops_src => stops_src.Copy());
		if (stops_src.length == 0)
			return stops_bkg.map(stops_bkg => stops_bkg.Copy());

		let stops = [];

		// Indexes
		let b = 0, s = 0;

		// Previous values
		let pbo = stops_bkg[0].offset;
		let pso = stops_src[0].offset;
		let pbc = stops_bkg[0].colour;
		let psc = stops_src[0].colour;

		// Current values
		let bo = pbo;
		let so = pso;
		let bc = pbc;
		let sc = psc;
		
		do
		{
			// Selected offset and blend colours for next merged stop
			const offset = Math.min(bo, so);
			let bkg = bc;
			let src = sc;

			// Bkg is between src stops; override src with interpolation
			if (s < stops_src.length && bo < so && so > pso)
				src = RGB.Lerp(
					(bo - pso) / (so - pso),
					psc,
					sc
				);

			// Src is between bkg stops; override bkg with interpolation
			else if (b < stops_bkg.length && so < bo && bo > pbo)
				bkg = RGB.Lerp(
					(so - pbo) / (bo - pbo),
					pbc,
					bc
				);

			stops.push(
				new GradientStop(
					offset,
					RGB.Blend(
						bkg,
						src,
						blend_mode
					)
				)
			);

			// Move to next bkg stop
			if (offset == bo)
			{
				pbo = bo;
				pbc = bc;

				b++;
				
				if (b >= stops_bkg.length)
					bo = Number.POSITIVE_INFINITY;
				else
				{
					bo = stops_bkg[b].offset;
					bc = stops_bkg[b].colour;
				}
			}

			// Move to next src stop
			if (offset == so)
			{
				pso = so;
				psc = sc;

				s++;

				if (s >= stops_src.length)
					so = Number.POSITIVE_INFINITY;
				else
				{
					so = stops_src[s].offset;
					sc = stops_src[s].colour;
				}
			}
		}
		while (b != stops_bkg.length && s != stops_src.length);

		return stops;
	}

	static GetColour(stops, offset, spread)
	{
		if (spread == Gradient.SPREAD.PAD)
		{
			offset = Clamp01(offset);
		}
		else
		{
			// Reflect essentially has double the range of repeat
			const range = spread == Gradient.SPREAD.REFLECT ? 2 : 1;

			let _offset = offset % range;

			// Deal with negative modulo dividend
			if (offset < 0)
				_offset = (_offset + range) % range;

			if (spread == Gradient.SPREAD.REFLECT && _offset > 1)
				_offset = 2 - _offset;

			offset = _offset;
		}
		
		if (offset <= stops[0].offset)
			return stops[0].colour;
		if (offset >= stops[stops.length - 1].offset)
			return stops[stops.length - 1].colour;

		let i = 0;
		for (; i < stops.length - 2; i++)
		{
			if (offset == stops[i + 1].offset)
				return stops[i + 1].colour;
			if (offset < stops[i + 1].offset)
				break;
		}

		const a = stops[i];
		const b = stops[i + 1];
		const mix = (offset - a.offset) / (b.offset - a.offset);

		return RGB.Lerp(mix, a.colour, b.colour);
	}
}

class Gradient extends Paint
{
	constructor(stops, spread, opacity, blend_mode)
	{
		super(blend_mode);
		this.stops = stops.sort((a,b) => a.offset - b.offset);
		this.spread = spread;

		this.stops.forEach(stop => stop.colour.a *= opacity);
	}

	static SPREAD = {
		PAD: 0,
		REFLECT: 1,
		REPEAT: 2
	};

	static SPREAD_MAP = {
		pad: Gradient.SPREAD.PAD,
		reflect: Gradient.SPREAD.REFLECT,
		repeat: Gradient.SPREAD.REPEAT,
	};

	MergeBelow(other)
	{
		return other.MergeAbove(this);
	}

	ScaleOpacity(scale)
	{
		this.stops.forEach(stop =>
			stop.colour.a *= scale
		);
	}

	get opaque()
	{
		return this.blend_mode == BLEND_MODE.NORMAL
			&& this.stops.every(stop => stop.colour.a == 1);
	}
}

class PaintGradientLinear extends Gradient
{
	constructor(
		enda,
		endb,
		stops,
		spread,
		opacity,
		blend_mode
	)
	{
		if (opacity == 0 || stops.every(stop => stop.a == 0))
			return new PaintConstant(new RGB(0,0,0,0), opacity, blend_mode);

		if (stops.length == 1 ||
			stops.slice(1)
			.every(stop => RGB.Equal(stops[0].colour, stop.colour)))
			return new PaintConstant(stops[0].colour, opacity, blend_mode);

		super(stops, spread, opacity, blend_mode);

		this.enda = enda;
		this.endb = endb;
		this.distance = Point.Distance(enda,endb);
		this.tangent = endb.Subtract(enda).ScaleInv(this.distance);
	}

	static FromLinearElement(element, bounds, opacity, blend_mode, linear)
	{
		const _x1 = element.x1?.baseVal;
		const _y1 = element.y1?.baseVal;
		const _x2 = element.x2?.baseVal;
		const _y2 = element.y2?.baseVal;

		const x1 = _x1 !== undefined
			? _x1.unitType == SVGLength.SVG_LENGTHTYPE_PERCENTAGE
				? Lerp(_x1.valueInSpecifiedUnits, bounds.min.X, bounds.max.X)
				: _x1.value * WORKING_SCALE
			: bounds.min.X;

		const x2 = _x2 !== undefined
			? _x2.unitType == SVGLength.SVG_LENGTHTYPE_PERCENTAGE
				? Lerp(_x2.valueInSpecifiedUnits, bounds.min.X, bounds.max.X)
				: _x2.value * WORKING_SCALE
			: bounds.max.X;

		const y1 = _y1 !== undefined
			? _y1.unitType == SVGLength.SVG_LENGTHTYPE_PERCENTAGE
				? Lerp(_y1.valueInSpecifiedUnits, bounds.min.Y, bounds.max.Y)
				: _y1.value * WORKING_SCALE
			: bounds.min.Y;

		const y2 = _y2 !== undefined
			? _y2.unitType == SVGLength.SVG_LENGTHTYPE_PERCENTAGE
				? Lerp(_y2.valueInSpecifiedUnits, bounds.min.Y, bounds.max.Y)
				: _y2.value * WORKING_SCALE
			: bounds.min.Y;

		const _spread = element.getAttribute("spreadMethod");
		const spread = _spread in Gradient.SPREAD_MAP
			? Gradient.SPREAD_MAP[_spread]
			: Gradient.SPREAD.PAD;

		const enda = new Point(x1,y1);
		const endb = new Point(x2,y2);

		const stops = GradientStop.StopsFromElement(
			element,
			Point.Distance(enda,endb),
			linear
		);

		if (stops.length == 0)
			return undefined;

		return new PaintGradientLinear(
			enda,
			endb,
			stops,
			spread,
			opacity,
			blend_mode
		);
	}

	Copy()
	{
		return new PaintGradientLinear(
			this.enda.Copy(),
			this.endb.Copy(),
			this.stops.map(stop => stop.Copy()),
			this.spread,
			1,
			this.blend_mode
		);
	}

	static Equal(a,b)
	{
		return a.blend_mode == b.blend_mode
			&& a.spread == b.spread
			&& a.stops.length == b.stops.length
			&& (
				(
					Point.Equal(a.enda, b.enda)
					&& Point.Equal(a.endb, b.endb)
					&& a.stops.every((stop, i) => GradientStop.Equal(stop, b.stops[i]))
				) || (
					Point.Equal(a.enda, b.endb)
					&& Point.Equal(a.endb, b.enda)
					&& a.stops.every((stop, i) => 
						stop.offset == 1 - b.stops.at(-i - 1).offset
						&& RGB.Equal(stop.colour, b.stops.at(-i - 1).colour)
					)
				)
			);
	}

	GetColour(point)
	{
		const offset = point
			.Subtract(this.enda)
			.DotProduct(this.tangent) / this.distance;

		return GradientStop.GetColour(this.stops, offset, this.spread);
	}

	MergeAtop(other)
	{
		if (other.constructor == PaintConstant)
			return other.MergeBelow(this);

		if (this.blend_mode != other.blend_mode)
			return undefined;

		const blend_mode = this.blend_mode;

		if (!MERGABLE_BLEND_MODES.has(blend_mode))
			return undefined;

		if (other.constructor != PaintGradientLinear)
			return undefined;

		if (this.spread != other.spread)
			return undefined;

		const stops_a = other.stops;
		const stops_b = this.stops;

		if (Point.Equal(this.enda, other.endb) &&
			Point.Equal(this.endb, other.enda))
			stops_b = stops_b.map(stop =>
				new GradientStop(
					1 - stop.offset,
					stop.colour
				)
			);
		else if (
			!Point.Equal(this.enda, other.enda) ||
			!Point.Equal(this.endb, other.endb))
			return undefined;

		const stops = GradientStop.MergeStops(
			stops_a,
			stops_b,
			blend_mode
		);

		return new PaintGradientLinear(
			this.enda.Copy(),
			this.endb.Copy(),
			stops,
			this.spread,
			1,
			blend_mode
		)
	}
}

// A radial gradient, based on an outer and inner circle with stops.
class PaintGradientRadial extends Gradient
{
	constructor(
		center,
		radius,
		focus,
		focus_radius,
		stops,
		spread,
		opacity,
		blend_mode
	)
	{
		if (Point.Equal(focus, center))
			return new PaintGradientRadialSimple(
				center,
				radius,
				focus_radius,
				stops,
				spread,
				opacity,
				blend_mode
			);
		
		if (opacity == 0 || stops.every(stop => stop.colour.a == 0))
			return new PaintConstant(new RGB(0,0,0,0), opacity, blend_mode);

		// All stops are the same colour
		if (stops.length == 1 ||
			stops.slice(1)
			.every(stop =>
				RGB.Equal(stops[0].colour, stop.colour)
			))
			return new PaintConstant(stops[0].colour, opacity, blend_mode);
			
		super(stops, spread, opacity, blend_mode);

		this.center = center;
		this.radius = radius;
		this.focus = focus;
		this.focus_radius = focus_radius;

		// Using this point, you can take the proportion between it
		// and the outer circle to sample the gradient.
		this.cone_tip = focus
		.Subtract(center)
		.ScaleInv(
			1 - focus_radius / radius
		).Add(center);

		this.pointed = Point.Distance(center, this.cone_tip)
			>= radius - Number.EPSILON;
		this.tip_to_center = this.center.Subtract(this.cone_tip);
	}

	static FromRadialElement(element, bounds, opacity, blend_mode, linear)
	{
		const max_radius = Math.min(
			bounds.max.X - bounds.min.X,
			bounds.max.Y - bounds.min.Y
		) * 0.5;
		const _cx = element.cx?.baseVal;
		const _cy = element.cy?.baseVal;
		const _r = element.r?.baseVal;
		const _fx = element.fx?.baseVal;
		const _fy = element.fy?.baseVal;
		const _fr = element.fr?.baseVal;

		const cx = _cx !== undefined
			? _cx.unitType == SVGLength.SVG_LENGTHTYPE_PERCENTAGE
				? Lerp(_cx.valueInSpecifiedUnits, bounds.min.X, bounds.max.X)
				: _cx.value * WORKING_SCALE
			: (bounds.min.X + bounds.max.X) * 0.5;

		const cy = _cy !== undefined
			? _cy.unitType == SVGLength.SVG_LENGTHTYPE_PERCENTAGE
				? Lerp(_cy.valueInSpecifiedUnits, bounds.min.Y, bounds.max.Y)
				: _cy.value * WORKING_SCALE
			: (bounds.min.Y + bounds.max.Y) * 0.5;

		const r = _r !== undefined
			? _r.unitType == SVGLength.SVG_LENGTHTYPE_PERCENTAGE
				? _r.valueInSpecifiedUnits * max_radius
				: _r.value * WORKING_SCALE
			: max_radius;

		const fx = _fx !== undefined
			? _fx.unitType == SVGLength.SVG_LENGTHTYPE_PERCENTAGE
				? Lerp(_fx.valueInSpecifiedUnits, bounds.min.X, bounds.max.X)
				: _fx.value * WORKING_SCALE
			: cx;

		const fy = _fy !== undefined
			? _fy.unitType == SVGLength.SVG_LENGTHTYPE_PERCENTAGE
				? Lerp(_fy.valueInSpecifiedUnits, bounds.min.Y, bounds.max.Y)
				: _fy.value * WORKING_SCALE
			: cy;

		const fr = _fr !== undefined
			? _fr.unitType == SVGLength.SVG_LENGTHTYPE_PERCENTAGE
				? _fr.valueInSpecifiedUnits * max_radius
				: _fr.value * WORKING_SCALE
			: 0;

		const _spread = element.getAttribute("spreadMethod");
		const spread = _spread in Gradient.SPREAD_MAP
			? Gradient.SPREAD_MAP[_spread]
			: Gradient.SPREAD.PAD;

		const stops = GradientStop.StopsFromElement(element, r-fr, linear);

		if (stops.length == 0)
			return undefined;

		return new PaintGradientRadial(
			new Point(cx,cy),
			r,
			new Point(fx,fy),
			fr,
			stops,
			spread,
			opacity,
			blend_mode
		);
	}

	Copy()
	{
		return new PaintGradientRadial(
			this.center.Copy(),
			this.radius,
			this.focus.Copy(),
			this.focus_radius,
			this.stops.map(stop => stop.Copy()),
			this.spread,
			1,
			this.blend_mode
		);
	}
	
	static Equal(a,b)
	{
		return a.blend_mode == b.blend_mode
			&& a.focus_radius == b.focus_radius
			&& a.radius == b.radius
			&& Point.Equal(a.center, b.center)
			&& Point.Equal(a.focus, b.focus)
			&& a.spread == b.spread
			&& a.stops.length == b.stops.length
			&& a.stops.every((stop, i) => GradientStop.Equal(stop,b.stops[i]));
	}

	GetColour(point)
	{
		const tip_to_point = point.Subtract(this.cone_tip);

		if (this.pointed && 
			tip_to_point.DotProduct(this.tip_to_center) <= 0)
			return undefined;

		// Cast a ray from the cone tip, towards the point, and intersect the outer circle
		const ray_dir = tip_to_point.Normalised();
		const ray_normal = NormalFromTangent(ray_dir);
		const ray_rel = point.Subtract(this.center);

		// The closest point on the ray to the circle (tangent to circle, perpendicular to ray direction)
		const closest_dist = ray_normal.DotProduct(ray_rel);

		// Ray does not pass through circle
		if (closest_dist * closest_dist > this.radius * this.radius)
			return undefined;
		
		const closest_to_outer_distance = Math.sqrt(this.radius * this.radius - closest_dist * closest_dist);
		const closest = ray_normal
			.Scale(closest_dist)
			.Add(this.center);
		const outer = ray_dir
			.Scale(closest_to_outer_distance)
			.Add(closest);
		const tip_to_outer = outer
			.Subtract(this.cone_tip);

		const offset = (
			Math.sqrt(tip_to_point.LengthSqr() / tip_to_outer.LengthSqr()) * this.radius -
			this.focus_radius
		) / (this.radius - this.focus_radius);

		return GradientStop.GetColour(this.stops, offset, this.spread);
	}

	MergeAtop(other)
	{
		if (other.constructor == PaintConstant)
			return other.MergeBelow(this);

		if (this.blend_mode != other.blend_mode)
			return undefined;

		const blend_mode = this.blend_mode;

		if (!MERGABLE_BLEND_MODES.has(blend_mode))
			return undefined;

		if (other.constructor != PaintGradientRadial)
			return undefined;

		if (this.spread != other.spread)
			return undefined;

		const stops_a = other.stops;
		const stops_b = this.stops;

		if (
			this.radius == other.focus_radius &&
			this.focus_radius == other.radius &&
			Point.Equal(this.center, other.focus) &&
			Point.Equal(this.focus, other.center)
		)
			stops_b = stops_b.map(stop =>
				new GradientStop(
					1 - stop.offset,
					stop.colour
				)
			);
		else if (!(
			this.radius == other.radius &&
			this.focus_radius == other.focus_radius &&
			Point.Equal(this.center, other.center) &&
			Point.Equal(this.focus, other.focus)
		))
			return undefined;

		const stops = GradientStop.MergeStops(
			stops_a,
			stops_b,
			blend_mode
		);

		return new PaintGradientRadial(
			this.center.Copy(),
			this.radius,
			this.focus.Copy(),
			this.focus_radius,
			stops,
			this.spread,
			1,
			blend_mode
		)
	}
	
	get opaque()
	{
		return this.blend_mode == BLEND_MODE.NORMAL
			&& !this.pointed
			&& this.stops.every(stop => stop.colour.a == 1);
	}
}

// A trivial gradient case where the focal point is also the center.
class PaintGradientRadialSimple extends Gradient
{
	constructor(
		center,
		outer_radius,
		inner_radius,
		stops,
		spread,
		opacity,
		blend_mode
	)
	{
		if (opacity == 0 || stops.every(stop => stop.a == 0))
			return new PaintConstant(new RGB(0,0,0,0), opacity, blend_mode);

		if (stops.length == 1 ||
			stops.slice(1)
			.every(stop => RGB.Equal(stops[0].colour, stop.colour)))
			return new PaintConstant(stops[0].colour, opacity, blend_mode);

		super(stops, spread, opacity, blend_mode);

		this.center = center;
		this.outer_radius = outer_radius;
		this.inner_radius = inner_radius;

		this.radius_range = outer_radius - inner_radius;
	}

	Copy()
	{
		return new PaintGradientRadialSimple(
			this.center.Copy(),
			this.outer_radius,
			this.inner_radius,
			this.stops.map(stop => stop.Copy()),
			this.spread,
			1,
			this.blend_mode
		);
	}

	GetColour(point)
	{
		const offset = (Point.Distance(point,this.center) - this.inner_radius)
			/ this.radius_range;

		return GradientStop.GetColour(this.stops, offset, this.spread);
	}
	
	static Equal(a,b)
	{
		return a.blend_mode == b.blend_mode
			&& a.inner_radius == b.inner_radius
			&& a.outer_radius == b.outer_radius
			&& Point.Equal(a.center, b.center)
			&& a.spread == b.spread
			&& a.stops.length == b.stops.length
			&& a.stops.every((stop, i) => GradientStop.Equal(stop,b.stops[i]));
	}

	MergeAtop(other)
	{
		if (other.constructor == PaintConstant)
			return other.MergeBelow(this);

		if (this.blend_mode != other.blend_mode)
			return undefined;

		const blend_mode = this.blend_mode;

		if (!MERGABLE_BLEND_MODES.has(blend_mode))
			return undefined;

		if (other.constructor != PaintGradientRadialSimple)
			return undefined;

		if (this.spread != other.spread ||
			!Point.Equal(this.center, other.center))
			return undefined;

		const stops_a = other.stops;
		const stops_b = this.stops;

		if (
			this.outer_radius == other.inner_radius &&
			this.inner_radius == other.outer_radius
		)
			stops_b = stops_b.map(stop =>
				new GradientStop(
					1 - stop.offset,
					stop.colour
				)
			);
		else if (!(
			this.outer_radius == other.outer_radius &&
			this.inner_radius == other.inner_radius
		))
			return undefined;

		const stops = GradientStop.MergeStops(
			stops_a,
			stops_b,
			blend_mode
		);

		return new PaintGradientRadialSimple(
			this.center.Copy(),
			this.outer_radius,
			this.inner_radius,
			stops,
			this.spread,
			1,
			blend_mode
		)
	}
}

// A "paint" that is actually a stack of paints composited together
class PaintComposite extends Paint
{
	constructor(paints, opacity, blend_mode)
	{
		// Spill the contents of normal mode composites directly into this composite
		paints = paints
		.map(paint => {
			if (paint.constructor !== PaintComposite
				|| paint.blend_mode != BLEND_MODE.NORMAL)
				return paint;
			
			return paint.sub_paints.map(sub_paint => {
				sub_paint = sub_paint.Copy();
				sub_paint.ScaleOpacity(paint.opacity);
				return sub_paint;
			});
		})
		.flat(1);

		if (opacity == 0)
			return new PaintConstant(new RGB(0,0,0,0), 0, blend_mode);

		let i = paints.length - 1;
		for (; i > 0; i--)
		{
			if (paints[i].opaque)
				break;

			const merged = paints[i].MergeAtop(paints[i - 1]);
			
			if (merged === undefined)
				continue;

			// Remove this paint and the one below, replacing it with
			// them merged together.
			paints.splice(
				i - 1,
				2,
				merged
			);
		}

		// Either by being opaque or by merging onto all lower paints,
		// there is now only one paint in this composite. Just return it instead,
		// and inherit this composite's opacity and blend mode.
		if (i == paints.length - 1)
		{
			const out = paints[i].Copy();
			out.ScaleOpacity(opacity);
			if (blend_mode != BLEND_MODE.NORMAL)
				out.blend_mode = blend_mode;
			return out;
		}

		super(blend_mode);

		this.sub_paints = i > 0
			? paints.slice(i)
			: paints;
	}

	Copy()
	{
		return new PaintComposite(
			this.sub_paints.map(paint => paint.Copy()),
			this.opacity,
			this.blend_mode
		);
	}

	Blend(point, background)
	{
		if (this.blend_mode != BLEND_MODE.NORMAL)
			return RGB.Blend(
				background,
				this.GetColour(point),
				this.blend_mode
			);
		
		return this.sub_paints
		.reduce((bkg,paint) =>
			{
				const src = paint.GetColour(point);
				src.a *= this.opacity;
				return RGB.Blend(
					bkg,
					src,
					paint.blend_mode
				);
			},
			background
		);
	}

	GetColour(point)
	{
		const colour = this.sub_paints
		.slice(1)
		.reduce((bkg,paint) => 
			paint.Blend(
				point,
				bkg
			),
			this.sub_paints[0].GetColour(point)
		);
		colour.a *= this.opacity;

		return colour;
	}

	get opaque()
	{
		return this.blend_mode == BLEND_MODE.NORMAL
			&& this.opacity == 1
			&& this.sub_paints.some(paint => paint.opaque);
	}

	static Equal(a,b)
	{
		return a.blend_mode == b.blend_mode
			&& a.sub_paints.length == b.sub_paints.length
			&& a.sub_paints.every((a_paint,i) =>
				Paint.Equal(a_paint,b.sub_paints[i])
			);
	}

	MergeAtop(other)
	{
		return undefined;
	}

	ScaleOpacity(scale)
	{
		this.opacity *= scale;
	}
}