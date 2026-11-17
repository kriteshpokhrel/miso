import * as THREE from 'three';

/** Reuses its skin and control points as a jointed leg or soft arm changes shape. */
export class SoftLimb {
  readonly geometry = new THREE.BufferGeometry();
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly positions: Float32Array;
  private readonly center = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly binormal = new THREE.Vector3();
  private readonly vertex = new THREE.Vector3();

  constructor(points: THREE.Vector3[], private readonly radii: readonly number[], private readonly rings = 28, private readonly sides = 14) {
    this.curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    this.positions = new Float32Array((rings + 1) * (sides + 1) * 3);
    const indices: number[] = [];
    for (let ring = 0; ring < rings; ring++) for (let side = 0; side < sides; side++) {
      const a = ring * (sides + 1) + side;
      const b = a + sides + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setIndex(indices);
    this.update();
  }

  update(): void {
    for (let ring = 0; ring <= this.rings; ring++) {
      const t = ring / this.rings;
      this.curve.getPoint(t, this.center);
      this.curve.getTangent(t, this.tangent).normalize();
      this.normal.set(Math.abs(this.tangent.x) > 0.94 ? 0 : 1, 0, Math.abs(this.tangent.x) > 0.94 ? 1 : 0);
      this.normal.addScaledVector(this.tangent, -this.normal.dot(this.tangent)).normalize();
      this.binormal.crossVectors(this.tangent, this.normal).normalize();
      const coordinate = t * (this.radii.length - 1);
      const index = Math.min(this.radii.length - 2, Math.floor(coordinate));
      const fraction = coordinate - index;
      const radius = THREE.MathUtils.lerp(this.radii[index]!, this.radii[index + 1]!, fraction);
      for (let side = 0; side <= this.sides; side++) {
        const angle = side / this.sides * Math.PI * 2;
        this.vertex.copy(this.center).addScaledVector(this.normal, Math.cos(angle) * radius)
          .addScaledVector(this.binormal, Math.sin(angle) * radius);
        this.vertex.toArray(this.positions, (ring * (this.sides + 1) + side) * 3);
      }
    }
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.computeVertexNormals();
    const normals = this.geometry.attributes.normal!;
    for (let ring = 0; ring <= this.rings; ring++) {
      const first = ring * (this.sides + 1);
      const last = first + this.sides;
      this.normal.fromBufferAttribute(normals, first).add(this.vertex.fromBufferAttribute(normals, last)).normalize();
      normals.setXYZ(first, this.normal.x, this.normal.y, this.normal.z);
      normals.setXYZ(last, this.normal.x, this.normal.y, this.normal.z);
    }
    normals.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }
}
