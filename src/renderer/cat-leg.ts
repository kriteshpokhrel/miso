import * as THREE from 'three';

const FRONT_RADII = [0.025, 0.135, 0.125, 0.095, 0.075];
const REAR_RADII = [0.025, 0.155, 0.14, 0.09, 0.075];

export class ContinuousLeg {
  readonly geometry = new THREE.BufferGeometry();
  readonly mesh: THREE.Mesh;
  readonly attachment = new THREE.Vector3();
  private readonly rings = 36;
  private readonly sides = 20;
  private readonly positions = new Float32Array(((this.rings + 1) * (this.sides + 1) + 2) * 3);
  private readonly points = [this.attachment, ...Array.from({ length: 4 }, () => new THREE.Vector3())];
  private readonly curve = new THREE.CatmullRomCurve3(this.points, false, 'centripetal');
  private readonly center = new THREE.Vector3();
  private readonly before = new THREE.Vector3();
  private readonly after = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly binormal = new THREE.Vector3();
  private readonly vertex = new THREE.Vector3();

  constructor(material: THREE.Material) {
    const indices: number[] = [];
    for (let ring = 0; ring < this.rings; ring++) for (let side = 0; side < this.sides; side++) {
      const a = ring * (this.sides + 1) + side;
      const b = a + this.sides + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const firstCap = (this.rings + 1) * (this.sides + 1);
    for (let side = 0; side < this.sides; side++) {
      indices.push(firstCap, side + 1, side);
      const last = this.rings * (this.sides + 1) + side;
      indices.push(firstCap + 1, last, last + 1);
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setIndex(indices);
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
  }

  update(hip: THREE.Vector3, knee: THREE.Vector3, paw: THREE.Vector3, front: boolean): void {
    // Both ends terminate inside the original torso and paw, hiding cut-off attachment rings.
    this.attachment.set(Math.sign(hip.x) * 0.15, 0.98, front ? 0.32 : -0.47);
    this.points[1]!.copy(this.attachment).lerp(hip, 0.6);
    this.points[2]!.copy(hip);
    this.points[3]!.copy(knee);
    this.points[4]!.copy(paw).addScaledVector(this.normal.set(0, 1, 0), 0.055);
    this.points[4]!.z -= 0.015;
    const radii = front ? FRONT_RADII : REAR_RADII;
    for (let ring = 0; ring <= this.rings; ring++) {
      const t = ring / this.rings;
      this.curve.getPoint(t, this.center);
      this.curve.getPoint(Math.max(0, t - 0.001), this.before);
      this.curve.getPoint(Math.min(1, t + 0.001), this.after);
      this.tangent.subVectors(this.after, this.before).normalize();
      this.normal.set(1, 0, 0).addScaledVector(this.tangent, -this.tangent.x).normalize();
      this.binormal.crossVectors(this.tangent, this.normal).normalize();
      const coordinate = t * (radii.length - 1);
      const index = Math.min(radii.length - 2, Math.floor(coordinate));
      const fraction = coordinate - index;
      const a = radii[Math.max(0, index - 1)]!;
      const b = radii[index]!;
      const c = radii[index + 1]!;
      const d = radii[Math.min(radii.length - 1, index + 2)]!;
      const radius = Math.max(0.01, 0.5 * (2 * b + (-a + c) * fraction
        + (2 * a - 5 * b + 4 * c - d) * fraction ** 2 + (-a + 3 * b - 3 * c + d) * fraction ** 3));
      for (let side = 0; side <= this.sides; side++) {
        const angle = side / this.sides * Math.PI * 2;
        this.vertex.copy(this.center).addScaledVector(this.normal, Math.cos(angle) * radius)
          .addScaledVector(this.binormal, Math.sin(angle) * radius * 0.92);
        this.vertex.toArray(this.positions, (ring * (this.sides + 1) + side) * 3);
      }
    }
    const cap = (this.rings + 1) * (this.sides + 1) * 3;
    this.attachment.toArray(this.positions, cap);
    this.points[4]!.toArray(this.positions, cap + 3);
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.computeVertexNormals();
    const normals = this.geometry.attributes.normal!;
    for (let ring = 0; ring <= this.rings; ring++) {
      const first = ring * (this.sides + 1);
      const last = first + this.sides;
      this.normal.fromBufferAttribute(normals, first).add(this.before.fromBufferAttribute(normals, last)).normalize();
      normals.setXYZ(first, this.normal.x, this.normal.y, this.normal.z);
      normals.setXYZ(last, this.normal.x, this.normal.y, this.normal.z);
    }
    normals.needsUpdate = true;
  }
}
