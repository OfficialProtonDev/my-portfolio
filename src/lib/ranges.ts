/*
 * The hills on the horizon, west of Hamilton: a broad far range, rolling
 * nearer hills, and the tree line on the riverbank. Drawn in a 1440 x 140
 * box that stretches to the width of the screen.
 */

export interface Ranges {
  far: string;
  mid: string;
  near: string;
}

function treeline(seed: number, clusters: [number, number][]): string {
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const base = 133;
  let d = `M0 ${base}`;
  for (let x = 0; x <= 1440; x += 4) {
    const inCluster = clusters.some(([a, b]) => x >= a && x <= b);
    let y = base + Math.sin(x / 61) * 0.8;
    if (inCluster) {
      const edge = Math.min(...clusters.filter(([a, b]) => x >= a && x <= b).map(([a, b]) => Math.min(x - a, b - x)));
      const taper = Math.min(1, edge / 40);
      y -= taper * (4 + r() * 7 + Math.max(0, Math.sin(x / 9 + r())) * 3);
    }
    d += ` L${x} ${y.toFixed(1)}`;
  }
  return `${d} V140 H0 Z`;
}

// Low country under the name on the left; the range rises on the right, and
// the sun comes up off its shoulder.
export const dawnRanges: Ranges = {
  far: 'M0 117C90 115 180 112 270 110C360 108 430 106 520 102C600 98 660 90 720 82C770 75 800 64 840 57C870 52 890 44 920 42C945 40 960 47 985 45C1015 42 1035 33 1065 32C1095 31 1110 41 1135 48C1165 56 1200 73 1250 85C1300 95 1370 99 1440 101V140H0Z',
  mid: 'M0 121C100 119 190 115 290 116C390 117 460 111 560 110C660 109 730 116 830 117C930 118 1000 111 1100 110C1200 109 1270 114 1360 115C1400 115 1425 116 1440 116V140H0Z',
  near: treeline(1907, [
    [0, 300],
    [1330, 1440],
  ]),
};

export const nextDawnRanges: Ranges = {
  far: 'M0 118C100 116 200 113 300 111C400 109 470 105 560 99C640 93 690 84 750 78C800 73 830 63 870 58C905 53 930 46 965 46C995 46 1010 54 1040 52C1075 50 1095 40 1125 40C1150 40 1170 50 1195 59C1230 71 1270 83 1320 92C1370 99 1410 101 1440 102V140H0Z',
  mid: 'M0 122C110 120 200 116 310 117C420 118 490 112 600 111C710 110 780 117 890 118C1000 119 1070 112 1180 111C1290 110 1370 115 1440 116V140H0Z',
  near: treeline(2027, [
    [0, 260],
    [1350, 1440],
  ]),
};
