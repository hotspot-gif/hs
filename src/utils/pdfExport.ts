import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import autoTable from 'jspdf-autotable';
import type { RetailerSummary, RetailerMonthly } from '@/types';
import { supabase } from '@/lib/supabase';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fe2 = (v: number) => `EUR ${Number(v || 0).toLocaleString('en', { maximumFractionDigits: 0 })}`;
const fn2 = (v: number) => Number(v || 0).toLocaleString('en', { maximumFractionDigits: 0 });

const hR = (h: string) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16)
];

async function drawLogoW(pdf: jsPDF, x: number, y: number, h: number): Promise<number> {
  return new Promise((res) => {
    const timeout = setTimeout(() => res(0), 1000);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      clearTimeout(timeout);
      const ar = img.naturalWidth / img.naturalHeight;
      try {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth;
        cv.height = img.naturalHeight;
        const ctx = cv.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          pdf.addImage(cv.toDataURL('image/png'), 'PNG', x, y, ar * h, h, undefined, 'FAST');
        }
      } catch (e) { console.warn('Logo fail', e); }
      res(ar * h);
    };
    img.onerror = () => { clearTimeout(timeout); res(0); };
    img.src = 'https://cms-assets.ldsvcplatform.com/IT/s3fs-public/inline-images/logo_new1.png';
  });
}

function addFooter(pdf: jsPDF, n: number, W: number, H: number, M: number, branch: string, userName: string) {
  pdf.setDrawColor(200, 200, 210);
  pdf.setLineWidth(0.2);
  pdf.line(M, H - 9, W - M, H - 9);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'italic');
  pdf.setTextColor(140, 140, 150);
  pdf.text('CONFIDENTIAL -- Proprietary retailer performance data. For internal use only. Unauthorised distribution prohibited.', M, H - 5.5);
  pdf.setFont('helvetica', 'normal');
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  pdf.text(`Page ${n} | ${dateStr} | ${branch.replace('LMIT-HS-', '')} | Exported by: ${userName}`, W - M, H - 5.5, { align: 'right' });
}

async function addPageHeader(pdf: jsPDF, n: number, sub: string, W: number, M: number, id: string): Promise<number> {
  pdf.setFillColor(33, 38, 78);
  pdf.rect(0, 0, W, 13, 'F');
  const lw = await drawLogoW(pdf, M, 1.5, 10);
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(7.5);
  pdf.setFont('helvetica', 'bold');
  pdf.text(id, M + (lw > 0 ? lw + 6 : 0), 7);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  pdf.setTextColor(160, 175, 215);
  pdf.text(sub, M + (lw > 0 ? lw + 6 : 0), 11.5);
  pdf.setTextColor(150, 165, 200);
  pdf.text(`Page ${n} | CONFIDENTIAL`, W - M, 7, { align: 'right' });
  return 17;
}

function sectionHeader(pdf: jsPDF, lbl: string, yp: number, M: number, IW: number): number {
  pdf.setFillColor(33, 38, 78);
  pdf.rect(M, yp, IW, 6.5, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(7.5);
  pdf.setFont('helvetica', 'bold');
  pdf.text(lbl, M + 2.5, yp + 4.5);
  return yp + 8;
}

function tableHeader(pdf: jsPDF, cols: number[], hdrs: string[], yp: number, rh: number, M: number, IW: number): number {
  pdf.setFillColor(235, 232, 228);
  pdf.rect(M, yp, IW, rh, 'F');
  pdf.setTextColor(100, 100, 120);
  pdf.setFontSize(5.8);
  pdf.setFont('helvetica', 'bold');
  hdrs.forEach((h, i) => {
    pdf.text(h, cols[i], yp + rh - 1.5);
  });
  return yp + rh;
}

function getCaptureRect(el: HTMLElement) {
  const svgs = el.querySelectorAll('svg');
  if (svgs.length === 0) {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: Math.max(1, r.width), height: Math.max(1, r.height) };
  }

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  svgs.forEach((svg) => {
    const r = svg.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  });

  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: Math.max(1, r.width), height: Math.max(1, r.height) };
  }

  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

const yieldToBrowser = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function fastChartCapture(el: HTMLElement): Promise<string | null> {
  const svgs = el.querySelectorAll('svg');
  if (svgs.length === 0) return null;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const captureRect = getCaptureRect(el);
  const pxW = Math.max(520, Math.min(950, Math.round((captureRect.width) * 1.15)));
  const pxH = Math.max(320, Math.min(700, Math.round((captureRect.height) * 1.15)));
  const scale = Math.min(1.5, pxW / captureRect.width, pxH / captureRect.height);

  canvas.width = Math.ceil(captureRect.width * scale);
  canvas.height = Math.ceil(captureRect.height * scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  for (let i = 0; i < svgs.length; i++) {
    const svg = svgs[i];
    
    const svgRect = svg.getBoundingClientRect();
    const clonedSvg = svg.cloneNode(true) as SVGSVGElement;
    clonedSvg.setAttribute('width', svgRect.width.toString());
    clonedSvg.setAttribute('height', svgRect.height.toString());
    
    const xml = new XMLSerializer().serializeToString(clonedSvg);
    const svg64 = btoa(unescape(encodeURIComponent(xml)));
    const image64 = 'data:image/svg+xml;base64,' + svg64;

    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const x = svgRect.left - captureRect.left;
        const y = svgRect.top - captureRect.top;
        ctx.drawImage(img, x, y, svgRect.width, svgRect.height);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = image64;
    });
  }

  const dataUrl = canvas.toDataURL('image/png');
  canvas.width = 0; canvas.height = 0;
  return dataUrl;
}

type LegendItem = { label: string; color: string };

function drawLegend(pdf: jsPDF, x: number, y: number, maxW: number, items: LegendItem[]) {
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(5.5);
  pdf.setTextColor(33, 38, 78);

  let cx = x;
  let cy = y;
  const rowH = 3.4;

  for (const it of items) {
    const w = pdf.getTextWidth(it.label) + 8.5;
    if (cx + w > x + maxW) {
      cx = x;
      cy += rowH;
    }
    const rgb = hR(it.color);
    pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
    pdf.circle(cx + 1.4, cy - 0.8, 0.8, 'F');
    pdf.text(it.label, cx + 3, cy);
    cx += w;
  }

  return cy;
}

async function addChartToPDF(
  pdf: jsPDF,
  cid: string,
  x: number,
  yp: number,
  cw: number,
  ch: number,
  title: string,
  opts?: { legend?: LegendItem[]; subLabels?: string[]; alignY?: 'top' | 'center' }
) {
  const el = document.getElementById(cid);
  pdf.setFillColor(250, 248, 245);
  pdf.setDrawColor(220, 215, 210);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(x, yp, cw, ch + 7, 2, 2, 'FD');
  pdf.setTextColor(100, 100, 120);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'bold');
  pdf.text(title, x + 2, yp + 4.5);

  if (!el) return;

  try {
    await yieldToBrowser();
    // 1. Try high-res SVG capture
    let url = await fastChartCapture(el);
    
    // 2. Fallback to html2canvas if SVG capture failed
    if (!url) {
      await yieldToBrowser();
      const canvas = await html2canvas(el, { 
        scale: 1.2, 
        useCORS: true, 
        backgroundColor: '#ffffff', 
        logging: false
      });
      url = canvas.toDataURL('image/png');
      canvas.width = 0; canvas.height = 0;
    }

    if (url) {
      const legend = opts?.legend ?? [];
      const subLabels = opts?.subLabels ?? [];
      const legendRows = legend.length > 0 ? 1 : 0;
      const subLabelRows = subLabels.length > 0 ? 1 : 0;
      const extraTop = (legendRows + subLabelRows) * 4;

      if (legend.length > 0) {
        drawLegend(pdf, x + 2, yp + 8, cw - 4, legend);
      }

      if (subLabels.length > 0) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.2);
        pdf.setTextColor(33, 38, 78);
        const startY = yp + 8 + (legend.length > 0 ? 4 : 0);
        const colW = (cw - 4) / subLabels.length;
        subLabels.forEach((lbl, i) => {
          pdf.text(lbl, x + 2 + colW * (i + 0.5), startY, { align: 'center' });
        });
      }

      // Calculate aspect ratio to prevent stretching
      const captureRect = getCaptureRect(el);
      const aspectRatio = captureRect.width / captureRect.height;
      
      // Calculate display width/height in PDF while maintaining aspect ratio
      // We prioritize the provided width (cw - 2) and adjust height
      const displayW = cw - 2;
      const displayH = displayW / aspectRatio;
      
      // If the calculated height is too tall for the box, we scale by height instead
      let finalW = displayW;
      let finalH = displayH;
      
      const maxImageH = Math.max(10, ch - extraTop);
      if (finalH > maxImageH) {
        finalH = maxImageH;
        finalW = finalH * aspectRatio;
      }

      // Center the image in the box
      const offsetX = (cw - 2 - finalW) / 2;
      const offsetY = opts?.alignY === 'top' ? 0 : ((ch - extraTop) - finalH) / 2;

      const imageTop = yp + 6 + extraTop;
      pdf.addImage(url, 'PNG', x + 1 + offsetX, imageTop + offsetY, finalW, finalH, undefined, 'FAST');
    }
  } catch (e) {
    console.warn('Capture fail', cid, e);
  }
}

export async function generatePDF(summary: RetailerSummary, monthly: RetailerMonthly[], user: any, setProgress?: (p: number) => void) {
  try {
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: false });
    const W = 210, H = 297, M = 10, IW = 190;
    const ID = summary.retailer_id;
    const BRANCH = summary.branch;
    const ZONE = summary.zone;
    const yearsInData = Array.from(new Set(monthly.map(m => String(m.month || '').slice(0, 4))))
      .filter(y => /^\d{4}$/.test(y))
      .sort();
    const latestYear = yearsInData.length ? yearsInData[yearsInData.length - 1] : String(new Date().getFullYear());
    const INCENTIVE = monthly
      .filter(m => String(m.month || '').startsWith(latestYear))
      .reduce((s, m) => s + (m.incentive || 0), 0);
    const GA = summary.ga_cnt;
    const PORT_IN = summary.port_in;
    const PI_RAW = summary.pi_raw;
    const ADD_GARA = summary.add_gara;
    const PI_TOTAL = summary.pi_total;
    const DEDUCTIONS = summary.total_deductions;

    const yd = (yr: string) => {
      const mos = monthly.filter(m => m.month.startsWith(yr));
      const sum = (fn: (m: RetailerMonthly) => number) => mos.reduce((s, m) => s + fn(m), 0);
      return [sum(m=>m.ga_cnt), sum(m=>m.pi_l6), sum(m=>m.pi_g6), sum(m=>m.np_l6), sum(m=>m.np_g6), sum(m=>m.port_in), sum(m=>m.port_out), sum(m=>m.total_ded), sum(m=>m.pi_raw), sum(m=>m.add_gara), sum(m=>m.pi_total), sum(m=>m.incentive), mos.length, sum(m=>m.po_deduction), sum(m=>m.clawback), sum(m=>m.renewal_impact)];
    };

    const tD = () => pdf.setTextColor(33, 38, 78);
    const tM = () => pdf.setTextColor(100, 100, 120);
    const tW = () => pdf.setTextColor(255, 255, 255);
    const tG = () => pdf.setTextColor(5, 163, 93);
    const tR = () => pdf.setTextColor(240, 68, 56);
    const tB = () => pdf.setTextColor(0, 106, 224);
    const sF = (r: number, g: number, b: number) => pdf.setFillColor(r, g, b);

    // Page 1
    setProgress?.(10);
    sF(33, 38, 78); pdf.rect(0, 0, W, 50, 'F');
    const lw0 = await drawLogoW(pdf, M, 5, 16);
    tW(); pdf.setFontSize(14); pdf.setFont('helvetica', 'bold'); pdf.text('Retailer Performance Report', M + (lw0 > 0 ? lw0 + 8 : 0), 14);
    pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(170, 185, 215);
    pdf.text('Year-on-Year Analysis: 2024 - 2025 - 2026 YTD', M + (lw0 > 0 ? lw0 + 8 : 0), 21);
    pdf.setFontSize(7.5); pdf.setTextColor(140, 155, 195);
    pdf.text(`Retailer: ${ID} | Branch: ${BRANCH.replace('LMIT-HS-', '')} | Zone: ${ZONE}`, M + (lw0 > 0 ? lw0 + 8 : 0), 27);
    pdf.setTextColor(255, 213, 79); pdf.setFontSize(16); pdf.setFont('helvetica', 'bold'); pdf.text(fe2(INCENTIVE), W - M, 28, { align: 'right' });
    
    let y = 56; y = sectionHeader(pdf, 'YEAR-ON-YEAR SUMMARY', y, M, IW);
    const cw3 = IW / 3;
    ['2024', '2025', '2026'].forEach((y2, i) => {
      const d = yd(y2); const cx = M + i * cw3; const rgb = hR(y2 === '2024' ? '#006AE0' : y2 === '2025' ? '#08DC7D' : '#FFD54F');
      sF(255, 255, 255); pdf.setDrawColor(rgb[0], rgb[1], rgb[2]); pdf.setLineWidth(0.4); pdf.roundedRect(cx, y, cw3 - 2, 40, 2, 2, 'FD');
      sF(rgb[0], rgb[1], rgb[2]); pdf.roundedRect(cx + 2, y + 2, 26, 7, 1.5, 1.5, 'F');
      pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(y2 === '2026' ? 33 : 255, y2 === '2026' ? 38 : 255, y2 === '2026' ? 78 : 255);
      pdf.text(y2 + (y2 === '2026' ? ' YTD' : ''), cx + 15, y + 6.8, { align: 'center' });
      [['Total Inc.', fe2(d[11]), 'B'], ['GA Count', fn2(d[0]), 'D'], ['Port-In', fn2(d[5]), 'G'], ['PI Inc.', fe2(d[10]), 'B'], ['Deductions', fe2(d[7]), 'R']].forEach((s: any, si) => {
        tM(); pdf.setFontSize(5.8); pdf.setFont('helvetica', 'normal'); pdf.text(s[0], cx + 2.5, y + 13 + si * 4.9);
        if (s[2] === 'B') tB(); else if (s[2] === 'R') tR(); else if (s[2] === 'G') tG(); else tD();
        pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.text(s[1], cx + cw3 - 3.5, y + 13 + si * 4.9, { align: 'right' });
      });
    });
    y += 48;

    // Calculate REAL ALL-TIME totals by summing all monthly records
    const allTimeTotal = monthly.reduce((sum, m) => {
      return {
        incentive: sum.incentive + (m.incentive || 0),
        ga_cnt: sum.ga_cnt + (m.ga_cnt || 0),
        port_in: sum.port_in + (m.port_in || 0),
        pi_raw: sum.pi_raw + (m.pi_raw || 0),
        add_gara: sum.add_gara + (m.add_gara || 0),
        pi_total: sum.pi_total + (m.pi_total || 0),
        total_deductions: sum.total_deductions + (m.total_ded || 0),
      };
    }, {
      incentive: 0,
      ga_cnt: 0,
      port_in: 0,
      pi_raw: 0,
      add_gara: 0,
      pi_total: 0,
      total_deductions: 0
    });

    y = sectionHeader(pdf, 'ALL-TIME KPI SUMMARY', y, M, IW);
    const kpis: Array<[string, string, 'B' | 'G' | 'R' | 'D' | 'Y']> = [
      ['Total Incentive', fe2(allTimeTotal.incentive), 'B'],
      ['Monthly Avg', fe2(allTimeTotal.incentive / Math.max(monthly.length, 1)), 'D'],
      ['GA Activations', fn2(allTimeTotal.ga_cnt), 'D'],
      ['Port-In Total', fn2(allTimeTotal.port_in), 'G'],
      ['PORT IN Inc.', fe2(allTimeTotal.pi_raw), 'B'],
      ['GARA Bonus', fe2(allTimeTotal.add_gara), 'Y'],
      ['Total PI Inc.', fe2(allTimeTotal.pi_total), 'B'],
      ['Total Deductions', fe2(allTimeTotal.total_deductions), 'R']
    ];
    const tw = IW / 4;
    const th = 12;
    kpis.forEach((k, idx) => {
      const row = Math.floor(idx / 4);
      const col = idx % 4;
      const kx = M + col * tw;
      const ky = y + row * (th + 2);
      sF(255, 255, 255);
      pdf.setDrawColor(220, 215, 210);
      pdf.setLineWidth(0.25);
      pdf.roundedRect(kx, ky, tw - 1.5, th, 1.5, 1.5, 'FD');
      const ac = k[2] === 'B' ? hR('#006AE0') : k[2] === 'G' ? hR('#08DC7D') : k[2] === 'R' ? hR('#F04438') : k[2] === 'Y' ? [180, 140, 0] : [100, 100, 120];
      sF(ac[0], ac[1], ac[2]);
      pdf.roundedRect(kx, ky, tw - 1.5, 2.4, 1.2, 1.2, 'F');
      tM();
      pdf.setFontSize(5.4);
      pdf.setFont('helvetica', 'normal');
      pdf.text(k[0], kx + 2, ky + 6);
      if (k[2] === 'B') tB(); else if (k[2] === 'R') tR(); else if (k[2] === 'G') tG(); else tD();
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'bold');
      pdf.text(k[1], kx + 2, ky + 11);
    });
    y += (th + 2) * 2 + 6;
    const HW = (IW - 3) / 2, HR = 45;
    setProgress?.(25);
    await addChartToPDF(pdf, 'cYB', M, y, HW, HR, 'Annual Incentive YoY');
    await addChartToPDF(pdf, 'cMO', M + HW + 3, y, HW, HR, 'Monthly Incentive Overlay', {
      legend: [
        { label: '2024', color: '#006AE0' },
        { label: '2025', color: '#08DC7D' },
        { label: '2026', color: '#FFD54F' }
      ]
    });
    y += HR + 10;
    await addChartToPDF(pdf, 'cMF', M, y, IW, 70, 'Full Monthly Incentive Timeline', { alignY: 'top' });
    addFooter(pdf, 1, W, H, M, BRANCH, user.full_name);

    // Page 2
    setProgress?.(35);
    pdf.addPage(); y = await addPageHeader(pdf, 2, 'GA Report', W, M, ID);
    y = sectionHeader(pdf, 'GA REPORT', y, M, IW);

    const gaYears = ['2024', '2025', '2026'].map((yr) => {
      const mos = monthly.filter(m => m.month.startsWith(yr));
      const total = mos.reduce((s, m) => s + (m.ga_cnt || 0), 0);
      const activeMonths = mos.reduce((s, m) => s + ((m.ga_cnt || 0) > 0 ? 1 : 0), 0);
      const avgActive = activeMonths > 0 ? total / activeMonths : 0;
      return { yr, total, avgActive, monthCount: mos.length };
    });

    const gaTileW = (IW - 6) / 3;
    const gaTileH = 16;
    gaYears.forEach((gy, idx) => {
      const tx = M + idx * (gaTileW + 3);
      const ty = y;
      pdf.setFillColor(255, 247, 242);
      pdf.setDrawColor(220, 215, 210);
      pdf.setLineWidth(0.25);
      pdf.roundedRect(tx, ty, gaTileW, gaTileH, 2, 2, 'FD');
      const yc = hR(gy.yr === '2024' ? '#006AE0' : gy.yr === '2025' ? '#08DC7D' : '#FFD54F');
      pdf.setFillColor(yc[0], yc[1], yc[2]);
      pdf.circle(tx + 5, ty + 5.5, 2, 'F');
      pdf.setTextColor(100, 100, 120);
      pdf.setFontSize(5.5);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${gy.yr} Total GA`, tx + 10, ty + 5.8);
      pdf.setTextColor(33, 38, 78);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.text(fn2(gy.total), tx + 10, ty + 11.7);
      pdf.setTextColor(140, 140, 150);
      pdf.setFontSize(5.5);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Avg: ${fn2(gy.avgActive)}/mo`, tx + gaTileW - 2, ty + 11.7, { align: 'right' });
      pdf.text(`${gy.monthCount} months`, tx + gaTileW - 2, ty + 14.8, { align: 'right' });
    });

    y += gaTileH + 6;

    await addChartToPDF(pdf, 'cGAC', M, y, IW, 110, 'GA Activations - Calendar Overlay', {
      legend: [
        { label: '2024', color: '#006AE0' },
        { label: '2025', color: '#08DC7D' },
        { label: '2026', color: '#FFD54F' }
      ]
    });
    y += 125;
    await addChartToPDF(pdf, 'cGT', M, y, IW, 85, 'GA Activations - Full Timeline');
    addFooter(pdf, 2, W, H, M, BRANCH, user.full_name);

    // Page 3
    setProgress?.(50);
    pdf.addPage(); y = await addPageHeader(pdf, 3, 'Plan Activation & Deductions Detail', W, M, ID);
    y = sectionHeader(pdf, 'ANNUAL PLAN ACTIVATION', y, M, IW);
    const pC = [M + 1, 30, 53, 76, 99, 120, 140, 161, 183];
    y = tableHeader(pdf, pC, ['Year', 'PI<=6', 'PI>6', 'NP<=6', 'NP>6', 'P-In', 'PI Inc.', 'Gara', 'Total PI'], y, 6, M, IW);
    ['2024', '2025', '2026'].forEach((y2, ri) => {
      const d = yd(y2); sF(ri % 2 === 0 ? 252 : 248, ri % 2 === 0 ? 250 : 247, ri % 2 === 0 ? 248 : 245); pdf.rect(M, y, IW, 6.5, 'F');
      pdf.setFontSize(7); pdf.setFont('helvetica', 'normal');
      [String(y2), fn2(d[1]), fn2(d[2]), fn2(d[3]), fn2(d[4]), fn2(d[5]), fe2(d[8]), fe2(d[9]), fe2(d[10])].forEach((v, i) => {
        if (i === 5) tG(); else if (i >= 6) tB(); else tD(); pdf.text(v, pC[i], y + 4.5);
      }); y += 6.5;
    });
    y += 10; setProgress?.(65);
    await addChartToPDF(pdf, 'cPI', M, y, HW, HR, 'P-IN less 6.99 vs P-IN Great 6.99', {
      legend: [
        { label: 'P-IN ≤€6.99', color: '#46286E' },
        { label: 'P-IN >€6.99', color: '#00D7FF' }
      ]
    });
    await addChartToPDF(pdf, 'cNP', M + HW + 3, y, HW, HR, 'NEW Less 6.99 vs NEW Great 6.99', {
      legend: [
        { label: 'NEW ≤€6.99', color: '#006AE0' },
        { label: 'NEW >€6.99', color: '#08DC7D' }
      ]
    });
    y += HR + 10;
    await addChartToPDF(pdf, 'cPY', M, y, IW, 70, 'Plan Mix by Year', {
      legend: [
        { label: 'P-IN less 6.99', color: '#46286E' },
        { label: 'P-IN Great 6.99', color: '#00D7FF' },
        { label: 'NEW Less 6.99', color: '#006AE0' },
        { label: 'NEW Great 6.99', color: '#08DC7D' }
      ],
      subLabels: ['2024', '2025', '2026']
    });
    addFooter(pdf, 3, W, H, M, BRANCH, user.full_name);

    // Page 4
    setProgress?.(78);
    pdf.addPage(); y = await addPageHeader(pdf, 4, 'Port-In Monthly Detail', W, M, ID);
    y = sectionHeader(pdf, 'PORT-IN ACTIVATION & INCENTIVE - MoM', y, M, IW);
    const mC = [M + 1, 18, 27, 40, 53, 66, 77, 88, 110, 135, 160, 185];
    y = tableHeader(pdf, mC, ['Month', 'Yr', 'PI<=6', 'PI>6', 'NP<=6', 'NP>6', 'P-In', 'P-Out', 'PI Inc.', 'Gara', 'Tot PI', '%Tot'], y, 6, M, IW);
    const sortedMonthly = [...monthly].sort((a, b) => a.month.localeCompare(b.month));
    let ri2 = 0;
    sortedMonthly.slice(-12).forEach((mo) => {
      const yr3 = mo.month.split('-')[0].slice(2); const mName = MONTH_NAMES[parseInt(mo.month.split('-')[1]) - 1];
      sF(ri2 % 2 === 0 ? 252 : 248, ri2 % 2 === 0 ? 250 : 247, ri2 % 2 === 0 ? 248 : 245); pdf.rect(M, y, IW, 5.5, 'F');
      [mName, yr3, fn2(mo.pi_l6), fn2(mo.pi_g6), fn2(mo.np_l6), fn2(mo.np_g6), fn2(mo.port_in), fn2(mo.port_out), fe2(mo.pi_raw), fe2(mo.add_gara), fe2(mo.pi_total), '0%'].forEach((v, i) => {
        if (i === 6) tG(); else if (i === 7 && mo.port_out > 0) tR(); else if (i === 10) tB(); else tD(); pdf.text(v, mC[i], y + 3.9);
      }); y += 5.5; ri2++;
    });
    y += 10; setProgress?.(88);
    await addChartToPDF(pdf, 'cPII', M, y, HW, HR, 'PI Incentive + Gara Monthly', {
      legend: [
        { label: 'Port in Incentive', color: '#FFC8B2' },
        { label: 'Gara bonus', color: '#FFD54F' }
      ]
    });
    await addChartToPDF(pdf, 'cPF', M + HW + 3, y, HW, HR, 'Port-In vs Port-Out', {
      legend: [
        { label: 'Port-In', color: '#08DC7D' },
        { label: 'Port-Out', color: '#F04438' }
      ]
    });
    y += HR + 10;
    await addChartToPDF(pdf, 'cPD', M, y, IW, 40, 'Total Port-In Bonus vs Incentive', {
      legend: [
        { label: 'Total Port-In Bonus', color: '#006AE0' },
        { label: 'Total Incentive Paid', color: '#08DC7D' }
      ]
    });
    addFooter(pdf, 4, W, H, M, BRANCH, user.full_name);

    // Page 5
    setProgress?.(95);
    pdf.addPage(); y = await addPageHeader(pdf, 5, 'Deductions & Renewal %', W, M, ID);
    await addChartToPDF(pdf, 'cDM', M, y, IW, 50, 'Monthly Deductions (Stacked)', {
      legend: [
        { label: 'PO Deduction', color: '#F04438' },
        { label: 'Clawback', color: '#D32F2F' },
        { label: 'Renewal Impact', color: '#B71C1C' }
      ]
    });
    y += 65;
    await addChartToPDF(pdf, 'cDY', M, y, HW, HR, 'Annual Deductions Breakdown', {
      legend: [
        { label: 'PO Deduction', color: '#F04438' },
        { label: 'Clawback', color: '#D32F2F' },
        { label: 'Renewal Impact', color: '#B71C1C' }
      ]
    });
    await addChartToPDF(pdf, 'cRN', M + HW + 3, y, HW, HR, 'Renewal Rate Monthly');
    addFooter(pdf, 5, W, H, M, BRANCH, user.full_name);

    // Page 6
    setProgress?.(96);
    pdf.addPage(); y = await addPageHeader(pdf, 6, 'Stock Details', W, M, ID);
    y = sectionHeader(pdf, 'STOCK DETAILS', y, M, IW);

    const pickNumS = (row: any, key: string) => {
      const v = row?.[key];
      if (v === null || v === undefined) return 0;
      const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
      return Number.isFinite(n) ? n : 0;
    };
    const pickStrS = (row: any, key: string) => {
      const v = row?.[key];
      if (v === null || v === undefined) return '';
      return String(v).trim();
    };
    const parseMonthKey = (raw: string) => {
      if (!raw) return '';
      const s = raw.trim();
      if (/^\d{4}-\d{2}$/.test(s)) return s;
      if (/^\d{4}\/\d{2}$/.test(s)) return s.replace('/', '-');
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return s;
    };

    let stock: any[] = [];
    try {
      const { data, error } = await supabase
        .from('retailer_stock')
        .select('*')
        .eq('retailer_id', ID)
        .limit(5000);
      if (!error) stock = (data as any[]) || [];
    } catch {
      stock = [];
    }

    const byMonth = new Map<string, { monthKey: string; monthLabel: string; total: number; used: number; unused: number }>();
    const byYear = new Map<string, { year: string; distributed: number; used: number; remaining: number }>();
    const byMonthFace = new Map<string, { monthKey: string; monthLabel: string; retailer_id: string; sim_facevalue: string; totalcards: number; used: number; unused: number }>();
    let lastUpdated: Date | null = null;

    for (const r of stock) {
      const monthKey = parseMonthKey(pickStrS(r, 'month'));
      const yr = monthKey && /^\d{4}-\d{2}$/.test(monthKey) ? monthKey.slice(0, 4) : '';
      const mm = monthKey && /^\d{4}-\d{2}$/.test(monthKey) ? Number(monthKey.slice(5, 7)) : 0;
      const monthLabel = yr && mm >= 1 && mm <= 12 ? `${MONTH_NAMES[mm - 1]} ${yr}` : (monthKey || 'N/A');

      const totalcards = Math.max(0, pickNumS(r, 'totalcards'));
      const used = Math.max(0, Math.min(pickNumS(r, 'used'), totalcards));
      const unused = Math.max(0, pickNumS(r, 'unused') || (totalcards - used));

      const fv = pickStrS(r, 'sim_facevalue') || 'N/A';
      const retailerId = pickStrS(r, 'retailer_id') || ID;

      const updRaw = r?.updated_at || r?.created_at || r?.issued_date || r?.issued_at;
      if (updRaw) {
        const d = new Date(updRaw);
        if (!Number.isNaN(d.getTime()) && (!lastUpdated || d.getTime() > lastUpdated.getTime())) lastUpdated = d;
      }

      if (monthKey) {
        const m = byMonth.get(monthKey);
        if (m) {
          m.total += totalcards; m.used += used; m.unused += unused;
        } else {
          byMonth.set(monthKey, { monthKey, monthLabel, total: totalcards, used, unused });
        }
      }

      if (yr) {
        const yv = byYear.get(yr);
        if (yv) {
          yv.distributed += totalcards; yv.used += used; yv.remaining += unused;
        } else {
          byYear.set(yr, { year: yr, distributed: totalcards, used, remaining: unused });
        }
      }

      const k = `${monthKey}__${fv}`;
      const ex = byMonthFace.get(k);
      if (ex) {
        ex.totalcards += totalcards; ex.used += used; ex.unused += unused;
      } else {
        byMonthFace.set(k, { monthKey: monthKey || 'N/A', monthLabel, retailer_id: retailerId, sim_facevalue: fv, totalcards, used, unused });
      }
    }

    const monthKeys = Array.from(byMonth.keys()).sort();
    const latestMonthKey = monthKeys.length ? monthKeys[monthKeys.length - 1] : '';
    const latestMonth = latestMonthKey ? byMonth.get(latestMonthKey) : undefined;

    const allTimeTotals = Array.from(byMonth.values()).reduce(
      (acc, r) => ({ total: acc.total + r.total, used: acc.used + r.used, unused: acc.unused + r.unused }),
      { total: 0, used: 0, unused: 0 }
    );

    const tileW = (IW - 12) / 5;
    const tileH = 14;
    const tileY = y;
    const tiles = [
      { label: 'All Time Total', value: fn2(allTimeTotals.total), color: '#006AE0' },
      { label: 'All Time Used', value: fn2(allTimeTotals.used), color: '#08DC7D' },
      { label: 'All Time Remaining', value: fn2(allTimeTotals.unused), color: '#FFD54F' },
      { label: 'Last Month Issued', value: fn2(latestMonth?.total || 0), color: '#F59E0B' },
      { label: 'Last Month Remaining', value: fn2(latestMonth?.unused || 0), color: '#46286E' },
    ];

    tiles.forEach((t, i) => {
      const tx = M + i * (tileW + 3);
      pdf.setFillColor(255, 247, 242);
      pdf.setDrawColor(220, 215, 210);
      pdf.setLineWidth(0.25);
      pdf.roundedRect(tx, tileY, tileW, tileH, 2, 2, 'FD');
      const c = hR(t.color);
      pdf.setFillColor(c[0], c[1], c[2]);
      pdf.circle(tx + 5, tileY + 5.2, 1.8, 'F');
      pdf.setTextColor(100, 100, 120);
      pdf.setFontSize(5.6);
      pdf.setFont('helvetica', 'normal');
      pdf.text(t.label, tx + 9, tileY + 5.4);
      pdf.setTextColor(33, 38, 78);
      pdf.setFontSize(8.8);
      pdf.setFont('helvetica', 'bold');
      pdf.text(t.value, tx + 9, tileY + 11);
    });

    y += tileH + 6;
    if (latestMonth?.monthLabel || lastUpdated) {
      pdf.setTextColor(140, 140, 150);
      pdf.setFontSize(6);
      pdf.setFont('helvetica', 'normal');
      const updStr = lastUpdated ? lastUpdated.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
      pdf.text(`Latest month: ${latestMonth?.monthLabel || '—'} | Stock updated: ${updStr}`, M, y - 1);
    }

    await addChartToPDF(pdf, 'cSTK', M, y, IW, 60, 'Stock Distribution (Year-over-Year)', { alignY: 'top' });
    y += 75;

    const stockTableRows = Array.from(byMonthFace.values())
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey) || a.sim_facevalue.localeCompare(b.sim_facevalue, undefined, { numeric: true, sensitivity: 'base' }))
      .map(r => [
        r.monthLabel,
        r.retailer_id,
        r.sim_facevalue,
        fn2(r.totalcards),
        fn2(r.used),
        fn2(r.unused),
        r.totalcards > 0 ? `${((r.used / r.totalcards) * 100).toFixed(1)}%` : '0.0%',
        (() => {
          const total = Number(r.totalcards || 0);
          const used = Number(r.used || 0);
          const unused = Number(r.unused || 0);
          const ok = Math.round(used + unused) === Math.round(total);
          const rate = total > 0 ? (used / total) * 100 : 0;
          if (!ok) return 'Data mismatch';
          if (total === 0) return 'No stock issued';
          if (rate >= 90) return 'Fast moving';
          if (rate >= 50) return 'Normal usage';
          if (rate >= 10) return 'Slow moving';
          return 'Stagnant stock';
        })(),
      ]);

    autoTable(pdf, {
      startY: y,
      head: [['Month', 'Retailer ID', 'Face Value', 'Total', 'Used', 'Unused', 'Using %', 'Stock Using Analysis']],
      body: stockTableRows,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [33, 38, 78], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 32 },
        2: { cellWidth: 16 },
        3: { cellWidth: 16, halign: 'right' },
        4: { cellWidth: 14, halign: 'right' },
        5: { cellWidth: 14, halign: 'right' },
        6: { cellWidth: 14, halign: 'right' },
        7: { cellWidth: 52 },
      },
      margin: { left: M, right: M },
    });

    const totalPages = pdf.getNumberOfPages();
    for (let pn = 6; pn <= totalPages; pn++) {
      pdf.setPage(pn);
      addFooter(pdf, pn, W, H, M, BRANCH, user.full_name);
    }

    setProgress?.(100);
    pdf.save(`Retailer_Report_${ID}.pdf`);
  } catch (err) {
    console.error('PDF ERROR:', err);
    alert('PDF export failed. Try again or check console.');
    setProgress?.(0);
  }
}
