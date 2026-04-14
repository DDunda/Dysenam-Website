class Point
{
	constructor(X = 0, Y = X)
	{
		this.X = X;
		this.Y = Y;
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
