/** P59 — premium report design tokens (jsPDF units: mm for geometry, pt for type, RGB 0–255). */
export type RGB = readonly [number, number, number];
export const PAGE = { width: 210, height: 297, marginTop: 13, marginBottom: 16, marginX: 13, contentWidth: 184, footerY: 289, gutter: 4.5 } as const;
export const COLOR = {
  navy: [11, 31, 58], navy2: [18, 54, 95], teal: [14, 124, 134], tealSoft: [230, 244, 245], ink: [30, 41, 59], muted: [100, 116, 139], rule: [226, 232, 240], panel: [248, 250, 252],
  red: [198, 40, 40], redSoft: [253, 236, 236], redDeep: [155, 28, 28], amber: [180, 83, 9], amberSoft: [254, 243, 226], amberDeep: [138, 75, 6],
  green: [46, 125, 50], greenSoft: [232, 245, 233], neutral: [148, 163, 184], neutralSoft: [241, 245, 249], violet: [109, 40, 217], violetSoft: [245, 240, 255],
  heroText: [215, 231, 245], heroKicker: [159, 227, 232], synthetic: [253, 230, 138], white: [255, 255, 255],
} as const satisfies Record<string, RGB>;
export const TYPE = { h1: 23, h2: 14.5, h3: 11, h4: 10.2, body: 9.2, card: 8.1, small: 7.8, table: 7.9, tableHead: 7.4, chartTitle: 10.5, chartAxis: 7.5, chartLabel: 8.5, badge: 6.8, footer: 7, lineHeight: 1.42 } as const;
export const RADIUS = { hero: 3.5, card: 2.8, panel: 2.8, badge: 1.1 } as const;
export const CHART = { panelHeightLine: 74, panelHeightSingleRow: 12, plotInset: { left: 16, right: 5, top: 10.5, bottom: 14 }, pointRadius: 1.6, lineWidth: 0.55, gridWidth: 0.2, pointInsetX: 12 } as const;
