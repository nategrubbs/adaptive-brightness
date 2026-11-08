    const timelineSlider = document.getElementById('timeline-slider');
    const luxDisplay = document.getElementById('lux-value');
    const deviceScrim = document.getElementById('device-scrim');
    const brightnessFill = document.getElementById('brightness-fill');
    const brightnessTrack = document.getElementById('brightness-track');
    const brightnessClip = document.getElementById('brightness-clip');
    const brightnessReset = document.getElementById('brightness-reset');
    const handHour = document.getElementById('hand-hour');
    const handMinute = document.getElementById('hand-minute');
    const handSecond = document.getElementById('hand-second');

    const graphPanel = document.getElementById('graph-panel');
    const graphToggle = document.getElementById('graph-toggle');
    const graphCurve = document.getElementById('graph-curve');
    const graphCurveFill = document.getElementById('graph-curve-fill');
    const graphBand = document.getElementById('graph-band');
    const graphSegments = document.getElementById('graph-segments');
    const graphPlayhead = document.getElementById('graph-playhead');
    const graphPlayheadDot = document.getElementById('graph-playhead-dot');
    const graphUserCurve = document.getElementById('graph-user-curve');
    const graphUserDots = document.getElementById('graph-user-dots');
    const graphLockedLine = document.getElementById('graph-locked-line');

    const adaptiveSwitch = document.getElementById('adaptive-switch');
    const adaptiveToggleEl = document.querySelector('#adaptive-toggle-container .adaptive-toggle');
    const nightModeSwitch = document.getElementById('night-mode-switch');
    const clockFace = document.querySelector('.clock-face');
    const clockHands = document.querySelector('.clock-hands');

    const modeToggleEl = document.querySelector('.mode-toggle');
    const modeBtnRelative = document.getElementById('mode-btn-relative');
    const modeBtnAbsolute = document.getElementById('mode-btn-absolute');

    const relOptions = document.getElementById('rel-options');
    const relRadios = {
      legacy: document.getElementById('rel-legacy'),
      v2: document.getElementById('rel-v2')
    };

    const perceptualToggle = document.getElementById('perceptual-toggle');

    const graphLeft = 40, graphRight = 420, graphTop = 20, graphBottom = 200;
    const graphWidth = graphRight - graphLeft;
    const graphHeight = graphBottom - graphTop;

    const scenes = [
      document.getElementById('scene-1'),
      document.getElementById('scene-2'),
      document.getElementById('scene-3'),
      document.getElementById('scene-4'),
      document.getElementById('scene-5'),
      document.getElementById('scene-6'),
      document.getElementById('scene-7')
    ];

    const scenePositions = [0, 7.6, 26.9, 50, 72.9, 92.4, 100];

    let currentMode = 'absolute';
    let relVariant = 'legacy';

    let isUserDragging = false;
    let userOverrideBrightness = null;

    let legacySliderPos = 50;
    let relV2SliderPos = 50;
    let relV2Points = [];
    let relV2Draft = null;

    let perceptualSlider = true;

    let adaptiveEnabled = true;
    let lockedBrightness = null;
    let nightModeEnabled = false;
    let nightModeActive = false;

    function isRelativeMode() { return currentMode === 'relative'; }
    function isAbsoluteMode() { return currentMode === 'absolute'; }

    function getRelSliderPos(lux) {
      if (relVariant === 'legacy') return legacySliderPos;
      if (isUserDragging) return relV2SliderPos;
      return relV2EffectiveSliderPos(lux === undefined ? currentTimelineLux() : lux);
    }
    function setRelSliderPos(val) {
      if (relVariant === 'legacy') legacySliderPos = val;
      else relV2SliderPos = val;
    }

    function currentTimelineLux() {
      return positionToLux(parseFloat(timelineSlider.value));
    }

    const MODEL_MAX_LUX = 1000;

    const REL_MERGE_DIST = 0.1;
    const REL_SLOT_THRESHOLD = 140;

    function ambientSlotFor(lux) {
      return lux < REL_SLOT_THRESHOLD ? 'low' : 'high';
    }

    function slotsDisplacedBy(lux) {
      const bucket = ambientSlotFor(lux);
      const log = toLogLux(lux);
      return p => p.bucket === bucket || Math.abs(toLogLux(p.lux) - log) < REL_MERGE_DIST;
    }

    function relV2ActivePoints() {
      if (!relV2Draft) return relV2Points;
      const displaced = slotsDisplacedBy(relV2Draft.lux);
      return relV2Points
        .filter(p => !displaced(p))
        .concat([{
          lux: relV2Draft.lux,
          sliderPos: relV2Draft.sliderPos,
          bucket: ambientSlotFor(relV2Draft.lux)
        }])
        .sort((a, b) => a.lux - b.lux);
    }

    function commitRelV2(pref) {
      const displaced = slotsDisplacedBy(pref.lux);
      relV2Points = relV2Points
        .filter(p => !displaced(p))
        .concat([{
          lux: pref.lux,
          sliderPos: pref.sliderPos,
          bucket: ambientSlotFor(pref.lux)
        }])
        .sort((a, b) => a.lux - b.lux);
    }

    function relV2EffectiveSliderPos(lux) {
      return relativeSliderPosAt(relV2ActivePoints(), lux);
    }

    function relativeSliderPosAt(pts, lux) {
      if (pts.length === 0) return 50;
      if (pts.length === 1) return pts[0].sliderPos;

      const x = toLogLux(lux);
      const sorted = [...pts].sort((a, b) => a.lux - b.lux);
      const xs = [], ys = [];
      for (const pt of sorted) {
        const px = toLogLux(pt.lux);
        if (xs.length && Math.abs(xs[xs.length - 1] - px) < 1e-9) {
          ys[ys.length - 1] = pt.sliderPos;
        } else {
          xs.push(px);
          ys.push(pt.sliderPos);
        }
      }
      if (xs.length === 1) return ys[0];
      return evalPchip(xs, ys, computePchipTangents(xs, ys), x);
    }

    function relV2HasPreference() {
      return relV2Points.length > 0;
    }

    function relativeCurveValues(pts) {
      const values = new Array(MODEL_MAX_LUX + 1);
      for (let lux = 0; lux <= MODEL_MAX_LUX; lux++) {
        values[lux] = widenedLookup(lux, relativeSliderPosAt(pts, lux));
      }
      for (let i = 1; i <= MODEL_MAX_LUX; i++) {
        if (values[i] < values[i - 1]) values[i] = values[i - 1];
      }
      return values;
    }

    function sampleCurve(values, lux) {
      const l = Math.max(0, Math.min(MODEL_MAX_LUX, lux));
      const lo = Math.floor(l);
      const hi = Math.min(MODEL_MAX_LUX, lo + 1);
      return values[lo] + (l - lo) * (values[hi] - values[lo]);
    }

    function relativeCurveKey(pts) {
      let key = 'rel';
      for (const pt of pts) key += '|' + pt.lux + ':' + pt.sliderPos.toFixed(3);
      return key;
    }

    let relV2Cache = null;
    function relV2CurveValues() {
      const pts = relV2ActivePoints();
      const key = relativeCurveKey(pts);
      if (relV2Cache && relV2Cache.key === key) return relV2Cache.values;
      const values = relativeCurveValues(pts);
      relV2Cache = { key, values };
      return values;
    }

    function relV2Brightness(lux) {
      return sampleCurve(relV2CurveValues(), lux);
    }

    const defaultLux = [0,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100,105,110,115,120,125,130,135,140,145,150,155,160,165,170,175,180,185,190,195,200,205,210,215,220,225,230,235,240,245,250,255,260,265,270,275,280,285,290,295,300,400,500,750,1000];
    const defaultColumns = {
      0:   [3,3,4,5,8,14,22,33,47,62,80,97,114,131,145,159,170,180,189,197,203,209,213,217,221,224,226,228,230,232,233,235,236,237,237,238,239,239,240,241,241,241,242,242,242,243,243,243,243,243,244,244,244,244,244,244,244,244,245,245,245,245,246,246,246],
      25:  [3,3,5,10,19,32,49,68,88,107,126,143,158,171,182,191,199,206,212,216,221,224,227,230,232,234,235,237,238,239,240,241,242,242,243,244,244,244,245,245,246,246,246,246,247,247,247,247,247,248,248,248,248,248,248,248,248,248,248,249,249,249,250,250,250],
      50:  [6,7,14,27,46,69,93,116,137,155,170,183,194,202,209,215,220,224,227,230,233,235,237,238,240,241,242,243,243,244,245,245,246,246,247,247,247,248,248,248,249,249,249,249,249,249,250,250,250,250,250,250,250,250,250,250,251,251,251,251,251,251,252,252,252],
      75:  [26,30,45,69,97,124,148,167,183,195,205,213,219,224,228,231,234,236,238,240,241,242,243,244,245,246,246,247,247,248,248,248,249,249,249,250,250,250,250,250,250,251,251,251,251,251,251,251,251,251,251,252,252,252,252,252,252,252,252,252,252,252,253,253,253],
      100: [66,77,104,134,160,180,196,207,216,222,228,232,235,237,239,241,243,244,245,246,246,247,248,248,249,249,249,250,250,250,251,251,251,251,251,251,252,252,252,252,252,252,252,252,252,252,253,253,253,253,253,253,253,253,253,253,253,253,253,253,253,253,254,254,254]
    };

    const WIDENED_FLOOR = [
      3,3,3,3,3,3,4,4,5,6,6,7,8,9,9,10,11,11,11,12,12,13,13,14,15,16,16,17,18,18,19,20,20,21,22,22,23,24,25,25,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26,26
    ];

    const WIDENED_CEILING = (() => {
      return defaultColumns[100].map((v, i) =>
        defaultLux[i] >= 300 ? 255 : defaultLux[i] >= 250 ? Math.max(v, 254) : v);
    })();

    const WIDENED_SPREAD = { 25: 0.85, 50: 0.55, 75: 0.25 };

    const widenedColumns = (() => {
      const out = { 0: WIDENED_FLOOR.slice(), 100: WIDENED_CEILING.slice() };
      Object.keys(WIDENED_SPREAD).forEach(key => {
        const pos = Number(key);
        const spread = WIDENED_SPREAD[pos];
        const col = defaultLux.map((_, i) => {
          const v0 = defaultColumns[0][i];
          const v100 = WIDENED_CEILING[i];
          const current = defaultColumns[pos][i];
          const span = v100 - v0;
          const t = span > 0 ? (current - v0) / span : 0;
          const floor = WIDENED_FLOOR[i];
          const redistributed = floor + t * (v100 - floor);
          return Math.round(current + spread * (redistributed - current));
        });
        for (let i = 1; i < col.length; i++) {
          if (col[i] < col[i - 1]) col[i] = col[i - 1];
        }
        out[pos] = col;
      });
      const keys = [0, 25, 50, 75, 100];
      for (let i = 0; i < defaultLux.length; i++) {
        for (let k = 1; k < keys.length; k++) {
          if (out[keys[k]][i] < out[keys[k - 1]][i]) out[keys[k]][i] = out[keys[k - 1]][i];
        }
      }
      return out;
    })();

    function tableLookup(lux, sliderPos, columns) {
      columns = columns || defaultColumns;
      let luxIdx = 0;
      for (let i = 0; i < defaultLux.length - 1; i++) {
        if (lux >= defaultLux[i] && lux <= defaultLux[i + 1]) { luxIdx = i; break; }
        if (lux > defaultLux[i]) luxIdx = i;
      }
      const luxLow = defaultLux[luxIdx];
      const luxHigh = defaultLux[Math.min(luxIdx + 1, defaultLux.length - 1)];
      const luxT = (luxHigh === luxLow) ? 0 : (lux - luxLow) / (luxHigh - luxLow);

      const colKeys = [0, 25, 50, 75, 100];
      let colIdx = 0;
      for (let i = 0; i < colKeys.length - 1; i++) {
        if (sliderPos >= colKeys[i] && sliderPos <= colKeys[i + 1]) { colIdx = i; break; }
        if (sliderPos > colKeys[i]) colIdx = i;
      }
      const colLow = colKeys[colIdx];
      const colHigh = colKeys[Math.min(colIdx + 1, colKeys.length - 1)];
      const colT = (colHigh === colLow) ? 0 : (sliderPos - colLow) / (colHigh - colLow);

      const vLL = columns[colLow][luxIdx];
      const vLH = columns[colLow][Math.min(luxIdx + 1, defaultLux.length - 1)];
      const vHL = columns[colHigh][luxIdx];
      const vHH = columns[colHigh][Math.min(luxIdx + 1, defaultLux.length - 1)];

      const vLow = vLL + luxT * (vLH - vLL);
      const vHigh = vHL + luxT * (vHH - vHL);
      const raw255 = vLow + colT * (vHigh - vLow);
      return (raw255 / 255) * 100;
    }

    function widenedLookup(lux, sliderPos) {
      return tableLookup(lux, sliderPos, widenedColumns);
    }

    function luxToBrightness(lux) { return tableLookup(lux, 50); }

    function toLogLux(lux) { return Math.log10(Math.max(lux, 1)); }

    function computePchipTangents(xs, ys) {
      const n = xs.length;
      const m = new Array(n).fill(0);
      if (n === 1) return m;

      const d = new Array(n - 1);
      for (let k = 0; k < n - 1; k++) {
        d[k] = (ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k]);
      }

      for (let k = 1; k < n - 1; k++) {
        if (d[k - 1] === 0 || d[k] === 0 || (d[k - 1] < 0) !== (d[k] < 0)) {
          m[k] = 0;
        } else {
          const w1 = 2 * (xs[k + 1] - xs[k]) + (xs[k] - xs[k - 1]);
          const w2 = (xs[k + 1] - xs[k]) + 2 * (xs[k] - xs[k - 1]);
          m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k]);
        }
      }

      m[0] = d[0];
      if (d.length > 1 && ((d[0] < 0) !== (d[1] < 0)) && Math.abs(m[0]) > 3 * Math.abs(d[0])) {
        m[0] = 3 * d[0];
      }
      m[n - 1] = d[n - 2];
      if (d.length > 2 && ((d[n - 2] < 0) !== (d[n - 3] < 0)) && Math.abs(m[n - 1]) > 3 * Math.abs(d[n - 2])) {
        m[n - 1] = 3 * d[n - 2];
      }
      return m;
    }

    function evalPchip(xs, ys, ms, x) {
      const n = xs.length;
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let k = 0;
      for (let i = 0; i < n - 1; i++) {
        if (x >= xs[i] && x <= xs[i + 1]) { k = i; break; }
      }
      const h = xs[k + 1] - xs[k];
      const t = (x - xs[k]) / h;
      const t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      return h00 * ys[k] + h10 * h * ms[k] + h01 * ys[k + 1] + h11 * h * ms[k + 1];
    }

    const HW_MIN = 3, HW_MAX = 255;
    const pctFromHW = hw => (hw / HW_MAX) * 100;
    const ABS_MIN_PCT = pctFromHW(HW_MIN);

    const PERCEPTUAL_HW = [
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
      20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
      30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
      40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
      50, 51, 52, 54, 56, 58, 61, 63, 66, 69,
      72, 75, 78, 81, 84, 88, 92, 95, 99, 103,
      107, 111, 115, 119, 123, 128, 132, 137, 141, 146,
      150, 155, 160, 165, 169, 174, 179, 184, 190, 195,
      200, 205, 211, 216, 221, 227, 232, 238, 244, 249,
      255
    ];

    const seatHW = raw => HW_MIN + raw * (HW_MAX - HW_MIN) / HW_MAX;
    const unseatHW = hw => (hw - HW_MIN) * HW_MAX / (HW_MAX - HW_MIN);

    function perceptualToPct(pos) {
      const p = Math.max(0, Math.min(100, pos));
      const i = Math.min(Math.floor(p), PERCEPTUAL_HW.length - 2);
      const h0 = PERCEPTUAL_HW[i], h1 = PERCEPTUAL_HW[i + 1];
      return pctFromHW(seatHW(h0 + (p - i) * (h1 - h0)));
    }

    function pctToPerceptual(pct) {
      const raw = unseatHW(Math.max(0, Math.min(100, pct)) / 100 * HW_MAX);
      if (raw <= PERCEPTUAL_HW[0]) return 0;
      for (let i = 0; i < PERCEPTUAL_HW.length - 1; i++) {
        const h0 = PERCEPTUAL_HW[i], h1 = PERCEPTUAL_HW[i + 1];
        if (raw <= h1) return h1 === h0 ? i : i + (raw - h0) / (h1 - h0);
      }
      return 100;
    }

    function perceptualApplies() {
      return perceptualSlider && isAbsoluteMode() && adaptiveEnabled;
    }

    const ABS_SEED_PCT = pctFromHW(12);
    const ABS_PLATEAU_LIMIT = 15;
    const ABS_BAND_EDGES = [15, 60, 180, 1000];
    const ABS_MIN_SEPARATION_LOG = 0.1;
    const ABS_BAND_FLOORS_HW = [3, 9, 17, 28, 28];
    const ABS_TOP_LUX = 600;
    const ABS_MAX_GHOSTS = 6;

    function absBandOf(lux) {
      let i = 0;
      while (i < ABS_BAND_EDGES.length && lux >= ABS_BAND_EDGES[i]) i++;
      return i;
    }

    function absEnvelope(lux) {
      return { lo: pctFromHW(ABS_BAND_FLOORS_HW[absBandOf(lux)]), hi: 100 };
    }

    let absSeq = 0;

    function newAbsState() {
      return {
        points: [
          { lux: 0, b: ABS_SEED_PCT, kind: 'plateau', authored: false, seq: 0 },
          { lux: ABS_PLATEAU_LIMIT, b: ABS_SEED_PCT, kind: 'plateau', authored: false, seq: 0 },
          { lux: ABS_TOP_LUX, b: luxToBrightness(ABS_TOP_LUX), kind: 'anchor', authored: false, seq: 0 }
        ],
        ghosts: [],
        touched: false,
        cache: null
      };
    }

    let absStateCurrent = newAbsState();
    function absState() { return absStateCurrent; }

    function absBrightnessFromSlider(lux, pos) {
      const p = Math.max(0, Math.min(100, pos)) / 100;
      const { lo, hi } = absEnvelope(lux);
      if (perceptualApplies()) {
        const pLo = pctToPerceptual(lo), pHi = pctToPerceptual(hi);
        return perceptualToPct(pLo + p * (pHi - pLo));
      }
      return lo + p * (hi - lo);
    }

    function absSliderPosFor(lux, b) {
      const { lo, hi } = absEnvelope(lux);
      let pos;
      if (perceptualApplies()) {
        const pLo = pctToPerceptual(lo), pHi = pctToPerceptual(hi);
        pos = (pHi - pLo) < 1e-9 ? 0 : ((pctToPerceptual(b) - pLo) / (pHi - pLo)) * 100;
      } else {
        pos = (hi - lo) < 1e-9 ? 0 : ((b - lo) / (hi - lo)) * 100;
      }
      return Math.max(0, Math.min(100, pos));
    }

    function absEvalAt(pts, lux) {
      if (lux <= pts[0].lux) return pts[0].b;
      const last = pts[pts.length - 1];
      if (lux >= last.lux) return last.b;
      let i = 0;
      for (let k = 0; k < pts.length - 1; k++) {
        if (lux >= pts[k].lux && lux <= pts[k + 1].lux) { i = k; break; }
      }
      const p0 = pts[i], p1 = pts[i + 1];
      const v0 = luxToBrightness(p0.lux);
      const v1 = luxToBrightness(p1.lux);
      const denom = v1 - v0;
      const d = Math.abs(denom) < 1e-9
        ? 0
        : Math.max(0, Math.min(1, (luxToBrightness(lux) - v0) / denom));
      return p0.b + d * (p1.b - p0.b);
    }

    function absProject(points) {
      const order = [...points].sort((a, b) => (b.seq - a.seq) || (a.lux - b.lux));
      const resolved = [];
      const out = new Map();
      for (const p of order) {
        let lo = 0, hi = 100;
        for (const r of resolved) {
          if (r.lux < p.lux) lo = Math.max(lo, r.out);
          else if (r.lux > p.lux) hi = Math.min(hi, r.out);
        }
        const v = Math.max(lo, Math.min(hi, p.b));
        out.set(p, v);
        resolved.push({ lux: p.lux, out: v });
      }
      return [...points]
        .sort((a, b) => a.lux - b.lux)
        .map(p => ({
          ref: p,
          lux: p.lux,
          kind: p.kind,
          authored: p.authored,
          seq: p.seq,
          b: p.b,
          out: out.get(p),
          suppressed: Math.abs(out.get(p) - p.b) > 1e-9,
          crowded: false
        }));
    }

    function absCrowdedOut(proj) {
      const dropped = new Set();
      const order = [...proj].sort((a, b) => (b.seq - a.seq) || (a.lux - b.lux));
      for (const p of order) {
        if (p.kind !== 'user') continue;
        for (const q of proj) {
          if (q === p || dropped.has(q)) continue;
          if (q.seq <= p.seq) continue;
          if (Math.abs(toLogLux(p.lux) - toLogLux(q.lux)) < ABS_MIN_SEPARATION_LOG) {
            dropped.add(p);
            break;
          }
        }
      }
      return dropped;
    }

    function absDrawnPoints(st) {
      const proj = absProject(st.points);
      const crowded = absCrowdedOut(proj);
      for (const p of proj) if (crowded.has(p)) p.crowded = true;
      const drawn = proj.filter(p => !p.crowded && !(p.suppressed && p.kind === 'user'));
      return { proj, drawn };
    }

    function absCurveValues(st) {
      const key = st.points
        .map(p => p.kind[0] + p.lux + ':' + p.b.toFixed(3) + ':' + p.seq)
        .join('|');
      if (st.cache && st.cache.key === key) return st.cache.values;
      const pts = absDrawnPoints(st).drawn.map(p => ({ lux: p.lux, b: p.out }));
      const values = new Array(MODEL_MAX_LUX + 1);
      for (let lux = 0; lux <= MODEL_MAX_LUX; lux++) values[lux] = absEvalAt(pts, lux);
      st.cache = { key, values };
      return values;
    }

    function absBrightness(lux) {
      return sampleCurve(absCurveValues(absState()), lux);
    }

    function absCommit(lux, brightness) {
      const st = absState();
      const b = Math.max(ABS_MIN_PCT, Math.min(100, brightness));
      st.touched = true;
      const seq = ++absSeq;

      if (lux <= ABS_PLATEAU_LIMIT) {
        const prior = st.points.find(p => p.kind === 'plateau' && p.authored);
        if (prior && Math.abs(prior.b - b) > 1e-9) {
          st.ghosts.push({ lux: ABS_PLATEAU_LIMIT, b: prior.b });
        }
        st.points.forEach(p => {
          if (p.kind === 'plateau') { p.b = b; p.authored = true; p.seq = seq; }
        });
      } else {
        const band = absBandOf(lux);
        st.points = st.points.filter(p => {
          if (p.kind !== 'user') return true;
          if (p.lux !== lux && absBandOf(p.lux) !== band) return true;
          if (p.lux !== lux) st.ghosts.push({ lux: p.lux, b: p.b });
          return false;
        });
        st.points.push({ lux, b, kind: 'user', authored: true, seq });
      }

      st.points.sort((a, c) => a.lux - c.lux);
      if (st.ghosts.length > ABS_MAX_GHOSTS) {
        st.ghosts = st.ghosts.slice(-ABS_MAX_GHOSTS);
      }
      st.cache = null;
    }

    function absHasState() { return absState().touched; }

    function absSortedPoints() {
      return absDrawnPoints(absState()).proj;
    }

    function getActiveBrightness(lux) {
      if (isAbsoluteMode()) return absBrightness(lux);
      if (relVariant === 'legacy') return tableLookup(lux, legacySliderPos);
      return relV2Brightness(lux);
    }

    const modeButtons = {
      relative: modeBtnRelative,
      absolute: modeBtnAbsolute
    };

    function refreshResetVisibility() {
      let show;
      if (isAbsoluteMode()) show = absHasState();
      else if (relVariant === 'legacy') show = Math.abs(legacySliderPos - 50) >= 1;
      else show = relV2HasPreference();
      brightnessReset.classList.toggle('visible', show);
    }

    function setMode(mode) {
      currentMode = mode;
      modeToggleEl.dataset.mode = mode;
      Object.keys(modeButtons).forEach(key => {
        modeButtons[key].classList.toggle('active', key === mode);
      });
      relV2Draft = null;
      refreshAll();
    }

    function setRelVariant(value) {
      relVariant = value;
      relV2Draft = null;
      refreshAll();
    }

    function refreshAll() {
      updateControls();
      updateLegend();
      refreshResetVisibility();
      drawGraphCurve();
      drawBand();
      drawSegments();
      drawUserCurve();
      update();
    }

    modeBtnRelative.addEventListener('click', () => setMode('relative'));
    modeBtnAbsolute.addEventListener('click', () => setMode('absolute'));

    function updateControls() {
      const showRel = isRelativeMode() && adaptiveEnabled;
      relOptions.classList.toggle('hidden', !showRel);
      adaptiveToggleEl.classList.toggle('merged-bottom', showRel);
      Object.keys(relRadios).forEach(k => {
        relRadios[k].classList.toggle('active', k === relVariant);
      });
      perceptualToggle.classList.toggle('hidden', !(isAbsoluteMode() && adaptiveEnabled));
      perceptualToggle.classList.toggle('checked', perceptualSlider);
      perceptualToggle.setAttribute('aria-checked', String(perceptualSlider));
    }

    Object.keys(relRadios).forEach(k => {
      relRadios[k].addEventListener('click', () => setRelVariant(k));
    });

    function togglePerceptual() {
      perceptualSlider = !perceptualSlider;
      updateControls();
      update();
    }

    perceptualToggle.addEventListener('click', togglePerceptual);
    perceptualToggle.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); togglePerceptual(); }
    });

    const legendYellowText = document.getElementById('graph-legend-yellow-text');
    const legendGhostItem = document.getElementById('graph-legend-ghost');
    const legendGhostDivider = document.getElementById('graph-legend-ghost-divider');
    const legendSupItem = document.getElementById('graph-legend-sup');
    const legendSupDivider = document.getElementById('graph-legend-sup-divider');

    function updateLegend() {
      if (legendYellowText) {
        legendYellowText.textContent = isAbsoluteMode() ? 'Learned curve' : 'User preference';
      }
      const show = isAbsoluteMode() ? 'visible' : 'hidden';
      if (legendGhostItem) legendGhostItem.style.visibility = show;
      if (legendGhostDivider) legendGhostDivider.style.visibility = show;
      if (legendSupItem) legendSupItem.style.visibility = show;
      if (legendSupDivider) legendSupDivider.style.visibility = show;
    }

    function brightnessFromY(clientY) {
      const rect = brightnessClip.getBoundingClientRect();
      const ratio = 1 - ((clientY - rect.top) / rect.height);
      return Math.max(0, Math.min(100, ratio * 100));
    }

    function startBrightnessDrag(e) {
      if (nightModeActive || isUserDragging) return;
      e.preventDefault();
      isUserDragging = true;
      brightnessTrack.classList.add('user-active');
      updateBrightnessDrag(e);
      document.addEventListener('pointermove', updateBrightnessDrag);
      document.addEventListener('pointerup', endBrightnessDrag);
      document.addEventListener('pointercancel', endBrightnessDrag);
    }

    function updateBrightnessDrag(e) {
      if (!isUserDragging) return;
      if (!adaptiveEnabled) {
        const brightness = Math.max(ABS_MIN_PCT, brightnessFromY(e.clientY));
        userOverrideBrightness = brightness;
        applyBrightness(brightness);
        const y = brightnessToGraphY(brightness);
        graphLockedLine.setAttribute('y1', y);
        graphLockedLine.setAttribute('y2', y);
        graphPlayheadDot.setAttribute('cy', y);
      } else if (isRelativeMode()) {
        const sliderVal = brightnessFromY(e.clientY);
        setRelSliderPos(sliderVal);
        const lux = currentTimelineLux();
        let brightness;
        if (relVariant === 'v2') {
          relV2Draft = { lux, sliderPos: sliderVal };
          brightness = relV2Brightness(lux);
        } else {
          brightness = tableLookup(lux, sliderVal);
        }
        brightnessFill.style.height = sliderVal + '%';
        deviceScrim.style.opacity = brightnessToScrim(brightness);
        drawUserCurve();
        updateGraph(lux, brightness);
      } else {
        const pos = brightnessFromY(e.clientY);
        const lux = currentTimelineLux();
        const brightness = absBrightnessFromSlider(lux, pos);
        userOverrideBrightness = brightness;
        brightnessFill.style.height = pos + '%';
        deviceScrim.style.opacity = brightnessToScrim(brightness);
        updateGraph(lux, brightness);
      }
    }

    function endBrightnessDrag(e) {
      if (!isUserDragging) return;
      isUserDragging = false;
      document.removeEventListener('pointermove', updateBrightnessDrag);
      document.removeEventListener('pointerup', endBrightnessDrag);
      document.removeEventListener('pointercancel', endBrightnessDrag);
      brightnessTrack.classList.remove('user-active');

      if (!adaptiveEnabled) {
        const brightness = userOverrideBrightness !== null
          ? userOverrideBrightness
          : Math.max(ABS_MIN_PCT, brightnessFromY(e.clientY));
        lockedBrightness = brightness;
        const y = brightnessToGraphY(lockedBrightness);
        graphLockedLine.setAttribute('y1', y);
        graphLockedLine.setAttribute('y2', y);
      } else if (isAbsoluteMode()) {
        const lux = currentTimelineLux();
        if (lux >= 0 && lux <= 300 && userOverrideBrightness !== null) {
          absCommit(lux, userOverrideBrightness);
        }
        drawUserCurve();
      } else if (relVariant === 'v2') {
        if (relV2Draft) {
          commitRelV2(relV2Draft);
          relV2Draft = null;
        }
        drawUserCurve();
      } else {
        drawUserCurve();
      }
      refreshResetVisibility();
      userOverrideBrightness = null;
      update();
    }

    brightnessTrack.addEventListener('pointerdown', startBrightnessDrag);

    brightnessReset.addEventListener('click', () => {
      if (isAbsoluteMode()) {
        absStateCurrent = newAbsState();
      } else if (relVariant === 'legacy') {
        legacySliderPos = 50;
      } else {
        relV2Points = [];
        relV2Draft = null;
        relV2SliderPos = 50;
        relV2Cache = null;
      }
      brightnessReset.classList.remove('visible');
      graphUserCurve.setAttribute('d', '');
      graphUserDots.innerHTML = '';
      update();
      drawUserCurve();
    });

    function positionToLux(pos) { return Math.round(300 * Math.sin((pos / 100) * Math.PI)); }

    function updateClock(pos) {
      const currentHour = 6 + 12 * (pos / 100);
      handHour.style.transform = `rotate(${(currentHour / 12) * 360}deg)`;
      handMinute.style.transform = `rotate(${(currentHour % 1) * 360}deg)`;
      handSecond.style.transform = `rotate(${(pos / 100) * 360 * 60}deg)`;
    }

    const SCRIM_GAMMA = 2.2;
    const NIGHT_VIEWING_PCT = 10;

    function brightnessToScrim(brightness) {
      const lum = Math.max(0, Math.min(100, brightness)) / 100;
      return 1 - Math.pow(lum, 1 / SCRIM_GAMMA);
    }

    function applyBrightness(brightness) {
      deviceScrim.style.opacity = brightnessToScrim(brightness);
      let fill;
      if (!adaptiveEnabled) {
        fill = ((brightness - ABS_MIN_PCT) / (100 - ABS_MIN_PCT)) * 100;
      } else if (isRelativeMode()) {
        fill = getRelSliderPos();
      } else {
        fill = absSliderPosFor(currentTimelineLux(), brightness);
      }
      brightnessFill.style.height = Math.max(0, Math.min(100, fill)) + '%';
    }

    function updateScenes(pos) {
      if (pos <= scenePositions[0]) { scenes.forEach((s, i) => s.style.opacity = i === 0 ? 1 : 0); return; }
      if (pos >= scenePositions[scenePositions.length - 1]) { scenes.forEach((s, i) => s.style.opacity = i === scenes.length - 1 ? 1 : 0); return; }
      for (let i = 0; i < scenePositions.length - 1; i++) {
        if (pos >= scenePositions[i] && pos <= scenePositions[i + 1]) {
          const progress = (pos - scenePositions[i]) / (scenePositions[i + 1] - scenePositions[i]);
          scenes.forEach((s, j) => { s.style.opacity = j === i ? 1 - progress : j === i + 1 ? progress : 0; });
          return;
        }
      }
    }

    function update() {
      if (isUserDragging) return;
      const pos = parseFloat(timelineSlider.value);
      const lux = positionToLux(pos);
      updateNightMode(lux);
      let brightness;
      if (nightModeActive) brightness = 3;
      else if (!adaptiveEnabled && lockedBrightness !== null) brightness = lockedBrightness;
      else brightness = getActiveBrightness(lux);
      luxDisplay.textContent = lux;
      updateScenes(pos);
      updateClock(pos);
      if (nightModeActive) {
        deviceScrim.style.opacity = brightnessToScrim(NIGHT_VIEWING_PCT);
      } else {
        applyBrightness(brightness);
      }
      updateGraph(lux, brightness);
    }

    function luxToGraphX(lux) { return graphLeft + (lux / 300) * graphWidth; }
    function brightnessToGraphY(brightness) { return graphBottom - (brightness / 100) * graphHeight; }

    function drawGraphCurve() {
      const points = [];
      for (let lux = 0; lux <= 300; lux += 2) {
        points.push(`${luxToGraphX(lux)},${brightnessToGraphY(defaultCurveFor(lux))}`);
      }
      const pathData = 'M' + points.join(' L');
      graphCurve.setAttribute('d', pathData);
      graphCurveFill.setAttribute('d', pathData + ` L${graphRight},${graphBottom} L${graphLeft},${graphBottom} Z`);
    }

    function defaultCurveFor(lux) {
      return (isRelativeMode() && relVariant === 'v2')
        ? widenedLookup(lux, 50)
        : luxToBrightness(lux);
    }

    function bandEdgesFor() {
      if (isRelativeMode()) {
        const cols = relVariant === 'legacy' ? defaultColumns : widenedColumns;
        return { lo: l => tableLookup(l, 0, cols), hi: l => tableLookup(l, 100, cols) };
      }
      return { lo: l => absEnvelope(l).lo, hi: l => absEnvelope(l).hi };
    }

    function drawBand() {
      const edges = bandEdgesFor();
      let d = '';
      for (let lux = 0; lux <= 300; lux += 2) {
        d += (lux === 0 ? 'M' : 'L') +
          luxToGraphX(lux).toFixed(1) + ',' + brightnessToGraphY(edges.hi(lux)).toFixed(1) + ' ';
      }
      for (let lux = 300; lux >= 0; lux -= 2) {
        d += 'L' + luxToGraphX(lux).toFixed(1) + ',' + brightnessToGraphY(edges.lo(lux)).toFixed(1) + ' ';
      }
      graphBand.setAttribute('d', d + 'Z');
    }

    function segmentEdgesFor() {
      if (isAbsoluteMode()) return ABS_BAND_EDGES.filter(l => l > 0 && l < 300);
      return relVariant === 'v2' ? [REL_SLOT_THRESHOLD] : [];
    }

    function drawSegments() {
      const NS = 'http://www.w3.org/2000/svg';
      graphSegments.innerHTML = '';
      for (const lux of segmentEdgesFor()) {
        const x = luxToGraphX(lux);
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('class', 'graph-segment-line');
        line.setAttribute('x1', x);
        line.setAttribute('x2', x);
        line.setAttribute('y1', graphTop);
        line.setAttribute('y2', graphBottom);
        graphSegments.appendChild(line);
        const label = document.createElementNS(NS, 'text');
        label.setAttribute('class', 'graph-segment-label');
        label.setAttribute('x', x);
        label.setAttribute('y', graphTop - 6);
        label.setAttribute('text-anchor', 'middle');
        label.textContent = lux;
        graphSegments.appendChild(label);
      }
    }

    function clearUserCurve() {
      graphUserCurve.setAttribute('d', '');
      graphUserDots.innerHTML = '';
    }

    function addDot(cls, lux, brightness, r) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('class', cls);
      c.setAttribute('cx', luxToGraphX(lux));
      c.setAttribute('cy', brightnessToGraphY(brightness));
      c.setAttribute('r', r);
      graphUserDots.appendChild(c);
    }

    function addLeader(lux, fromB, toB) {
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('class', 'graph-sup-leader');
      l.setAttribute('x1', luxToGraphX(lux));
      l.setAttribute('x2', luxToGraphX(lux));
      l.setAttribute('y1', brightnessToGraphY(fromB));
      l.setAttribute('y2', brightnessToGraphY(toB));
      graphUserDots.appendChild(l);
    }

    function drawUserCurve() {
      if (isAbsoluteMode()) {
        const values = absCurveValues(absState());
        const points = [];
        for (let lux = 0; lux <= 300; lux += 2) {
          points.push(`${luxToGraphX(lux)},${brightnessToGraphY(sampleCurve(values, lux))}`);
        }
        graphUserCurve.setAttribute('d', 'M' + points.join(' L'));

        graphUserDots.innerHTML = '';
        for (const g of absState().ghosts) addDot('graph-ghost-dot', g.lux, g.b, 4);
        for (const p of absSortedPoints()) {
          if (!p.authored) {
            addDot('graph-seed-dot', p.lux, p.out, 3);
          } else if (p.suppressed || p.crowded) {
            const onCurve = sampleCurve(values, p.lux);
            addLeader(p.lux, p.b, onCurve);
            addDot('graph-sup-dot', p.lux, p.b, 4);
          } else {
            addDot('graph-user-dot', p.lux, p.b, 4);
          }
        }
        return;
      }

      if (relVariant === 'legacy') {
        if (Math.abs(legacySliderPos - 50) < 1) { clearUserCurve(); return; }
        const points = [];
        for (let lux = 0; lux <= 300; lux += 2) {
          points.push(`${luxToGraphX(lux)},${brightnessToGraphY(tableLookup(lux, legacySliderPos))}`);
        }
        graphUserCurve.setAttribute('d', 'M' + points.join(' L'));
        graphUserDots.innerHTML = '';
        return;
      }

      const pts = relV2ActivePoints();
      if (pts.length === 0) { clearUserCurve(); return; }
      const points = [];
      for (let lux = 0; lux <= 300; lux += 2) {
        points.push(`${luxToGraphX(lux)},${brightnessToGraphY(relV2Brightness(lux))}`);
      }
      graphUserCurve.setAttribute('d', 'M' + points.join(' L'));
      graphUserDots.innerHTML = '';
      for (const pt of pts) {
        addDot('graph-user-dot', pt.lux, widenedLookup(pt.lux, pt.sliderPos), 4);
      }
    }

    function updateGraph(lux, brightness) {
      const x = luxToGraphX(lux), y = brightnessToGraphY(brightness);
      graphPlayhead.setAttribute('x1', x); graphPlayhead.setAttribute('x2', x);
      graphPlayheadDot.setAttribute('cx', x); graphPlayheadDot.setAttribute('cy', y);
    }

    adaptiveSwitch.addEventListener('click', () => {
      adaptiveEnabled = !adaptiveEnabled;
      adaptiveSwitch.classList.toggle('off', !adaptiveEnabled);
      if (!adaptiveEnabled) {
        const lux = positionToLux(parseFloat(timelineSlider.value));
        lockedBrightness = getActiveBrightness(lux);
        const y = brightnessToGraphY(lockedBrightness);
        graphLockedLine.setAttribute('y1', y); graphLockedLine.setAttribute('y2', y);
        graphLockedLine.classList.add('visible');
        graphCurve.classList.add('dimmed'); graphCurveFill.classList.add('dimmed');
        graphUserCurve.style.opacity = '0.3';
      } else {
        lockedBrightness = null;
        graphLockedLine.classList.remove('visible');
        graphCurve.classList.remove('dimmed'); graphCurveFill.classList.remove('dimmed');
        graphUserCurve.style.opacity = '1';
      }
      updateControls();
      update();
    });

    nightModeSwitch.addEventListener('click', () => {
      nightModeEnabled = !nightModeEnabled;
      nightModeSwitch.classList.toggle('off', !nightModeEnabled);
      if (!nightModeEnabled && nightModeActive) {
        nightModeActive = false;
        clockFace.classList.remove('night-active');
        clockHands.classList.remove('night-hands');
        brightnessTrack.classList.remove('disabled');
        brightnessTrack.style.display = '';
        applyBrightness(3);
      }
      update();
    });

    function updateNightMode(lux) {
      const shouldBeNight = nightModeEnabled && lux < 12;
      if (shouldBeNight !== nightModeActive) {
        nightModeActive = shouldBeNight;
        clockFace.classList.toggle('night-active', nightModeActive);
        clockHands.classList.toggle('night-hands', nightModeActive);
        brightnessTrack.classList.toggle('disabled', nightModeActive);
        if (nightModeActive) {
          brightnessTrack.style.display = 'none';
        } else {
          brightnessTrack.style.display = '';
        }
      }
    }

    graphToggle.addEventListener('click', () => { graphPanel.classList.toggle('collapsed'); });

    setMode(currentMode);
    timelineSlider.addEventListener('input', update);
    update();

    const playBtn = document.getElementById('play-btn');
    let isPlaying = false;
    let playInterval = null;

    playBtn.addEventListener('click', () => {
      isPlaying = !isPlaying;
      playBtn.classList.toggle('playing', isPlaying);

      if (isPlaying) {
        playInterval = setInterval(() => {
          let val = parseFloat(timelineSlider.value);
          val += 1;
          if (val > 100) val = 0;
          timelineSlider.value = val;
          update();
        }, 250);
      } else {
        clearInterval(playInterval);
        playInterval = null;
      }
    });

    const graphSvg = document.getElementById('graph-svg');
    let isScrubbing = false;

    function stopPlayback() {
      if (!isPlaying) return;
      isPlaying = false;
      playBtn.classList.remove('playing');
      clearInterval(playInterval);
      playInterval = null;
    }

    function scrubTo(clientX) {
      const r = graphSvg.getBoundingClientRect();
      const x = ((clientX - r.left) / r.width) * 440;
      const lux = Math.max(0, Math.min(300, ((x - graphLeft) / graphWidth) * 300));
      const half = (Math.asin(lux / 300) / Math.PI) * 100;
      const current = parseFloat(timelineSlider.value);
      timelineSlider.value = current > 50 ? 100 - half : half;
      update();
    }

    graphSvg.addEventListener('pointerdown', (e) => {
      if (isUserDragging) return;
      e.preventDefault();
      isScrubbing = true;
      graphSvg.classList.add('scrubbing');
      try { graphSvg.setPointerCapture(e.pointerId); } catch (err) {}
      stopPlayback();
      scrubTo(e.clientX);
    });
    graphSvg.addEventListener('pointermove', (e) => {
      if (isScrubbing) scrubTo(e.clientX);
    });
    const endScrub = () => {
      isScrubbing = false;
      graphSvg.classList.remove('scrubbing');
    };
    graphSvg.addEventListener('pointerup', endScrub);
    graphSvg.addEventListener('pointercancel', endScrub);

    const stage = document.getElementById('stage');
    const MIN_W = 1200, MIN_H = 720, MAX_ASPECT_H = 0.8;
    function fitStage() {
      const w = window.innerWidth, h = window.innerHeight;
      const scale = Math.min(1, w / MIN_W, h / MIN_H);
      const sw = w / scale;
      const sh = Math.min(h / scale, Math.max(MIN_H, sw * MAX_ASPECT_H));
      const root = document.documentElement.style;
      root.setProperty('--sw', sw + 'px');
      root.setProperty('--sh', sh + 'px');
      const y = (h - sh * scale) / 2;
      stage.style.transform = `translate(0px, ${y}px) scale(${scale})`;
    }
    window.addEventListener('resize', fitStage);
    fitStage();
