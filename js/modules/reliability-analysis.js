/**
 * reliability-analysis.js — 신뢰성 데이터 분석 메인 모듈
 * RE-Suite Static Web App
 *
 * Ref: Meeker & Escobar (1998), "Statistical Methods for Reliability Data", Wiley
 * Ref: ReliaSoft Weibull++ v21 Reference Manual
 *
 * 의존성: math-engine.js, distributions.js, statistics.js
 */

const ReliabilityAnalysis = (() => {

  const PLOT_POINTS = 200;
  const MIN_SAMPLE  = Statistics.MIN_SAMPLE_FOR_MLE;

  // ─────────────────────────────────────────────
  // MLE 파라미터 추정 (Nelder-Mead)
  // ─────────────────────────────────────────────
  function fitDistribution(distName, failures, censored) {
    /**
     * 분포 적합 (MLE via Nelder-Mead)
     * Returns: { params, ll, dist } or null
     */
    const D = Distributions;

    switch (distName) {
      case 'weibull': {
        // 초기값: Median Rank 회귀 기반 추정
        const alphaInit = Math.exp(
          failures.reduce((s, t) => s + Math.log(t), 0) / failures.length
        );
        const betaInit = 1.5;
        const negLL = D.Weibull.negLogLikelihoodLog(failures, censored);
        const res = MathEngine.nelderMead(negLL, [Math.log(alphaInit), Math.log(betaInit)]);
        const alpha = Math.exp(res.x[0]);
        const beta  = Math.exp(res.x[1]);
        const ll    = D.Weibull.logLikelihood(failures, censored, alpha, beta);
        return {
          dist: 'weibull', params: { alpha, beta }, ll,
          mttf: D.Weibull.mttf(alpha, beta),
          cdfFn: (t) => D.Weibull.cdf(t, alpha, beta),
          sfFn:  (t) => D.Weibull.sf(t, alpha, beta),
          pdfFn: (t) => D.Weibull.pdf(t, alpha, beta),
          hfFn:  (t) => D.Weibull.hf(t, alpha, beta),
          qFn:   (p) => D.Weibull.quantile(p, alpha, beta)
        };
      }

      case 'lognormal': {
        // 초기값: 로그 평균/표준편차
        const logTs  = failures.map(t => Math.log(t));
        const muInit = logTs.reduce((s, v) => s + v, 0) / logTs.length;
        const sigmaInit = Math.sqrt(
          logTs.reduce((s, v) => s + (v - muInit) ** 2, 0) / logTs.length
        ) || 0.5;
        const negLL = D.Lognormal.negLogLikelihoodLog(failures, censored);
        const res = MathEngine.nelderMead(negLL, [muInit, Math.log(sigmaInit)]);
        const mu    = res.x[0];
        const sigma = Math.exp(res.x[1]);
        const ll    = D.Lognormal.logLikelihood(failures, censored, mu, sigma);
        return {
          dist: 'lognormal', params: { mu, sigma }, ll,
          mttf: D.Lognormal.mttf(mu, sigma),
          cdfFn: (t) => D.Lognormal.cdf(t, mu, sigma),
          sfFn:  (t) => D.Lognormal.sf(t, mu, sigma),
          pdfFn: (t) => D.Lognormal.pdf(t, mu, sigma),
          hfFn:  (t) => D.Lognormal.hf(t, mu, sigma),
          qFn:   (p) => D.Lognormal.quantile(p, mu, sigma)
        };
      }

      case 'normal': {
        const muInit    = failures.reduce((s, v) => s + v, 0) / failures.length;
        const sigmaInit = Math.sqrt(
          failures.reduce((s, v) => s + (v - muInit) ** 2, 0) / failures.length
        ) || muInit * 0.3;
        const negLL = D.Normal.negLogLikelihoodLog(failures, censored);
        const res = MathEngine.nelderMead(negLL, [muInit, Math.log(sigmaInit)]);
        const mu    = res.x[0];
        const sigma = Math.exp(res.x[1]);
        const ll    = D.Normal.logLikelihood(failures, censored, mu, sigma);
        return {
          dist: 'normal', params: { mu, sigma }, ll,
          mttf: D.Normal.mttf(mu, sigma),
          cdfFn: (t) => D.Normal.cdf(t, mu, sigma),
          sfFn:  (t) => D.Normal.sf(t, mu, sigma),
          pdfFn: (t) => D.Normal.pdf(t, mu, sigma),
          hfFn:  (t) => D.Normal.hf(t, mu, sigma),
          qFn:   (p) => D.Normal.quantile(p, mu, sigma)
        };
      }

      case 'exponential': {
        // MLE 해석해: λ̂ = n_failures / (Σ failures + Σ censored)
        const nF = failures.length;
        const totalTime = [...failures, ...censored].reduce((s, t) => s + t, 0);
        const lambdaInit = nF > 0 ? nF / totalTime : 0.01;
        const negLL = D.Exponential.negLogLikelihoodLog(failures, censored);
        // Exponential은 해석해가 있으므로 직접 사용
        const lambda = lambdaInit;
        const ll = D.Exponential.logLikelihood(failures, censored, lambda);
        return {
          dist: 'exponential', params: { lambda }, ll,
          mttf: D.Exponential.mttf(lambda),
          cdfFn: (t) => D.Exponential.cdf(t, lambda),
          sfFn:  (t) => D.Exponential.sf(t, lambda),
          pdfFn: (t) => D.Exponential.pdf(t, lambda),
          hfFn:  (t) => D.Exponential.hf(t, lambda),
          qFn:   (p) => D.Exponential.quantile(p, lambda)
        };
      }

      default:
        return null;
    }
  }

  // ─────────────────────────────────────────────
  // 분포 비교 메트릭 계산
  // ─────────────────────────────────────────────
  function computeFitMetrics(fitResult, nFailures, nTotal) {
    const { dist, ll, params, cdfFn } = fitResult;
    // 파라미터 수
    const kMap = { weibull: 2, lognormal: 2, normal: 2, exponential: 1 };
    const k = kMap[dist] || 2;

    const aic_c = Distributions.computeAICc(ll, k, nTotal);
    const bic   = Distributions.computeBIC(ll, k, nTotal);
    const ad    = Distributions.computeAndersonDarling(
      // Anderson-Darling: 고장 데이터만 사용
      Array.from({ length: nFailures }, (_, i) => i),  // placeholder
      [],
      cdfFn
    );
    return { aic_c, bic, ll, minus2ll: -2 * ll, ad };
  }

  // ─────────────────────────────────────────────
  // 메인 분석 함수
  // ─────────────────────────────────────────────
  function analyze(dataRows, options = {}) {
    /**
     * dataRows: [{ time, event }]    event: 'F' | 'C' | 'I'
     * options: { distribution, confidence }
     * Returns: 분석 결과 객체
     */
    const confidence = options.confidence || 0.9;
    const distChoice = options.distribution || 'auto';

    // 데이터 분리
    const failures  = dataRows.filter(r => r.event === 'F').map(r => r.time).filter(t => t > 0);
    const censored  = dataRows.filter(r => r.event === 'C').map(r => r.time).filter(t => t > 0);
    const nTotal    = failures.length + censored.length;

    // 유효성 검사
    if (nTotal < MIN_SAMPLE) {
      throw new Error(`샘플 수가 너무 적습니다 (${nTotal}개). 최소 ${MIN_SAMPLE}개 이상 필요합니다.`);
    }
    if (failures.length < 1) {
      throw new Error('고장 데이터가 없습니다. 최소 1개 이상의 고장 데이터가 필요합니다.');
    }

    // 모든 분포 적합 시도
    const distNames = ['weibull', 'lognormal', 'normal', 'exponential'];
    const fits = [];

    for (const dn of distNames) {
      try {
        const fit = fitDistribution(dn, failures, censored);
        if (fit && isFinite(fit.ll)) {
          const kMap = { weibull: 2, lognormal: 2, normal: 2, exponential: 1 };
          const k = kMap[dn];
          fit.aic_c = Distributions.computeAICc(fit.ll, k, nTotal);
          fit.bic   = Distributions.computeBIC(fit.ll, k, nTotal);
          fit.minus2ll = -2 * fit.ll;
          // Anderson-Darling (failure data only)
          fit.ad = Distributions.computeAndersonDarling(
            failures, censored, fit.cdfFn
          );
          fits.push(fit);
        }
      } catch (e) {
        console.warn(`${dn} 적합 실패:`, e.message);
      }
    }

    if (fits.length === 0) throw new Error('모든 분포 적합이 실패했습니다.');

    // 비교 & 정렬 (AICc 기준)
    fits.sort((a, b) => (a.aic_c ?? Infinity) - (b.aic_c ?? Infinity));
    fits[0].best = true;

    // 선택된 분포 결정
    let selectedFit;
    if (distChoice === 'auto') {
      selectedFit = fits[0];
    } else {
      selectedFit = fits.find(f => f.dist === distChoice) || fits[0];
    }

    // 플롯 x 범위 (zoom/pan을 대비해 더 넓은 범위 설정 및 log-spacing)
    const rawMax = Math.max(...failures, ...censored);
    const rawMin = Math.max(Math.min(...failures, ...censored), 1e-6); // 0 방지
    const maxTime = rawMax * 10;
    const minTime = rawMin * 0.01;
    
    // Logarithmic spacing for smooth lines over large range
    const logMin = Math.log(minTime);
    const logMax = Math.log(maxTime);
    const PLOT_POINTS_EXT = 400; // 해상도 향상
    const xVals = Array.from({ length: PLOT_POINTS_EXT }, (_, i) =>
      Math.exp(logMin + (logMax - logMin) * i / (PLOT_POINTS_EXT - 1))
    );

    // 함수값 계산
    const pdfVals = xVals.map(t => selectedFit.pdfFn(t));
    const cdfVals = xVals.map(t => selectedFit.cdfFn(t));
    const sfVals  = xVals.map(t => selectedFit.sfFn(t));
    const hfVals  = xVals.map(t => selectedFit.hfFn(t));

    // ─────────────────────────────────────────────
    // 신뢰구간 (Confidence Intervals)
    // ─────────────────────────────────────────────
    const zScore = Distributions.normalPPF((1 + confidence) / 2);

    // Fisher CI 기반 모수 변동성 (공분산 행렬) 추출 (모든 분포 지원)
    let fisherCI = null, contourData = null;
    if (failures.length >= MIN_SAMPLE) {
      fisherCI = Statistics.computeFisherCI(failures, censored, selectedFit.dist, selectedFit.params, confidence);
      // Contour Plot — 항상 Weibull 기준 (Weibull++ 방식)
      // 다른 분포를 선택해도 Contour는 Weibull 파라미터 공간에서 표시
      if (failures.length >= 5) {
        // Weibull 적합 결과 찾기 (이미 fits에 계산되어 있음)
        const wFit = fits.find(f => f.dist === 'weibull');
        if (wFit) {
          contourData = Statistics.computeContourPlot(
            failures, censored, wFit.params.alpha, wFit.params.beta, confidence, 'weibull'
          );
        }
      }
    }

    // Delta Method 방식 정확한 JMP방식 F(t) 신뢰구간 생성
    let cdfCI;
    if (fisherCI && fisherCI.covMatrix) {
      cdfCI = Statistics.computeTrueCDFCI(selectedFit.dist, selectedFit.params, fisherCI.covMatrix, xVals, zScore);
    } else {
      // Fallback: Wald Logit
      cdfCI = Statistics.waldLogitCI(cdfVals, nTotal, zScore);
    }

    const hfCI  = Statistics.hazardLogCI(hfVals, failures.length, zScore);
    const relLower = cdfCI.upper.map(v => 1 - v); // R(t) lower bound is 1 - F(t) upper bound
    const relUpper = cdfCI.lower.map(v => 1 - v);

    // Probability Plot (모든 분포 지원)
    let probPlot = null;
    if (failures.length >= 2) {
      const km = Statistics.computeKaplanMeier(failures, censored);
      const pp = Statistics.getProbPlotCoords(selectedFit.dist, km.times, km.fValues);
      if (pp.x.length >= 2) {
        // 분포별 적합선 계산
        const xMin = pp.x[0] - 0.5, xMax = pp.x[pp.x.length - 1] + 0.5;
        const xLine = Array.from({ length: 50 }, (_, i) =>
          xMin + (xMax - xMin) * i / 49
        );
        let yLine;
        let xLabel, yLabel;

        if (selectedFit.dist === 'weibull') {
          // y = β * x - β * ln(α)
          const { alpha, beta } = selectedFit.params;
          yLine = xLine.map(x => beta * x - beta * Math.log(alpha));
          xLabel = 'ln(t)';
          yLabel = 'ln(-ln(1-F))';
        } else if (selectedFit.dist === 'lognormal') {
          // y = (x - μ) / σ   (여기서 x = ln(t))
          const { mu, sigma } = selectedFit.params;
          yLine = xLine.map(x => (x - mu) / sigma);
          xLabel = 'ln(t)';
          yLabel = 'Φ⁻¹(F)';
        } else if (selectedFit.dist === 'normal') {
          // y = (x - μ) / σ
          const { mu, sigma } = selectedFit.params;
          yLine = xLine.map(x => (x - mu) / sigma);
          xLabel = '시간 (t)';
          yLabel = 'Φ⁻¹(F)';
        } else if (selectedFit.dist === 'exponential') {
          // y = λ * x
          const { lambda } = selectedFit.params;
          yLine = xLine.map(x => lambda * x);
          xLabel = '시간 (t)';
          yLabel = '-ln(1-F)';
        } else {
          yLine = xLine.map(() => 0);
          xLabel = 'x';
          yLabel = 'y';
        }

        probPlot = {
          xPts: pp.x, yPts: pp.y,
          xLine, yLine,
          xLabel, yLabel
        };
      }
    }

    // Beta 해석 (Weibull)
    let betaInterpretation = null;
    if (selectedFit.dist === 'weibull') {
      betaInterpretation = Distributions.interpretBeta(selectedFit.params.beta);
    }

    // Bx Life 계산 (B1, B5, B10, B50) — 신뢰구간 포함
    const bxLevels = [0.01, 0.05, 0.10, 0.50];
    const bxLife = {};
    for (const bx of bxLevels) {
      try {
        const t = selectedFit.qFn(bx);
        const bKey = `B${Math.round(bx * 100)}`;
        if (isFinite(t)) {
          bxLife[bKey] = { estimate: t, lower: null, upper: null };
          // Delta Method CI
          if (fisherCI && fisherCI.covMatrix) {
            const ci = Statistics.computeBxLifeCI(selectedFit.dist, selectedFit.params, fisherCI.covMatrix, bx, zScore);
            if (ci) {
              bxLife[bKey].lower = ci.lower;
              bxLife[bKey].upper = ci.upper;
            }
          }
        } else {
          bxLife[bKey] = null;
        }
      } catch { bxLife[`B${Math.round(bx * 100)}`] = null; }
    }

    return {
      // 선택된 분포 결과
      distribution: selectedFit.dist,
      params: selectedFit.params,
      mttf: selectedFit.mttf,
      bxLife,
      betaInterpretation,
      // 비교 테이블
      comparison: fits.map(f => ({
        dist: f.dist,
        aic_c: f.aic_c,
        bic:   f.bic,
        ad:    f.ad,
        ll:    f.ll,
        minus2ll: f.minus2ll,
        best:  f.best || false
      })),
      // 플롯 데이터
      plotData: {
        x:         xVals,
        pdf:       pdfVals,
        cdf:       cdfVals,
        cdfLower:  cdfCI.lower,
        cdfUpper:  cdfCI.upper,
        sf:        sfVals,
        relLower,  relUpper,
        hf:        hfVals,
        hfLower:   hfCI.lower,
        hfUpper:   hfCI.upper
      },
      // 고급 분석
      fisherCI,
      contourData,
      probPlot,
      // 원시 데이터 요약
      dataSummary: {
        nFailures:  failures.length,
        nCensored:  censored.length,
        nTotal,
        failures,
        censored
      },
      confidence
    };
  }

  // ─────────────────────────────────────────────
  // 커스텀 계산 (Bx Life / F(t) / R(t))
  // ─────────────────────────────────────────────
  function customCalculate(analysisResult, queries) {
    /**
     * queries: [{ type: 'B-life'|'Probability'|'Reliability', value }]
     * Returns: [{ type, input, result, lower, upper }]
     */
    const { distribution, params, dataSummary, confidence } = analysisResult;
    const nTotal = dataSummary.nTotal;
    const zScore = Distributions.normalPPF((1 + confidence) / 2);
    const D = Distributions;

    // 분포 함수 선택
    let qFn, cdfFn;
    if (distribution === 'weibull') {
      const { alpha, beta } = params;
      qFn   = (p) => D.Weibull.quantile(p, alpha, beta);
      cdfFn = (t) => D.Weibull.cdf(t, alpha, beta);
    } else if (distribution === 'lognormal') {
      const { mu, sigma } = params;
      qFn   = (p) => D.Lognormal.quantile(p, mu, sigma);
      cdfFn = (t) => D.Lognormal.cdf(t, mu, sigma);
    } else if (distribution === 'normal') {
      const { mu, sigma } = params;
      qFn   = (p) => D.Normal.quantile(p, mu, sigma);
      cdfFn = (t) => D.Normal.cdf(t, mu, sigma);
    } else if (distribution === 'exponential') {
      const { lambda } = params;
      qFn   = (p) => D.Exponential.quantile(p, lambda);
      cdfFn = (t) => D.Exponential.cdf(t, lambda);
    } else {
      throw new Error(`알 수 없는 분포: ${distribution}`);
    }

    return queries.map(q => {
      try {
        if (q.type === 'B-life') {
          const fraction = q.value / 100;
          const result = qFn(fraction);
          // Delta Method Bx Life CI
          let lower = null, upper = null;
          if (dataSummary.nFailures >= 3) {
            const fi = Statistics.computeFisherCI(
              dataSummary.failures, dataSummary.censored,
              distribution, params, confidence
            );
            if (fi && fi.covMatrix) {
              const ci = Statistics.computeBxLifeCI(distribution, params, fi.covMatrix, fraction, zScore);
              if (ci) { lower = ci.lower; upper = ci.upper; }
            }
          }
          return { type: q.type, input: q.value, result, lower, upper, unit: '시간' };
        }

        if (q.type === 'Probability') {
          const p = cdfFn(q.value);
          const pc = Math.max(Math.min(p, 1 - 1e-9), 1e-9);
          const seP = Math.sqrt(pc * (1 - pc) / nTotal);
          const w = Math.log(pc / (1 - pc));
          const seW = seP / (pc * (1 - pc));
          const lower = Math.exp(w - zScore * seW) / (1 + Math.exp(w - zScore * seW));
          const upper = Math.exp(w + zScore * seW) / (1 + Math.exp(w + zScore * seW));
          return { type: q.type, input: q.value, result: p, lower, upper };
        }

        if (q.type === 'Reliability') {
          const p = 1 - cdfFn(q.value);
          const pf = 1 - p;
          const pfc = Math.max(Math.min(pf, 1 - 1e-9), 1e-9);
          const seP = Math.sqrt(pfc * (1 - pfc) / nTotal);
          const w = Math.log(pfc / (1 - pfc));
          const seW = seP / (pfc * (1 - pfc));
          const fLower = Math.exp(w - zScore * seW) / (1 + Math.exp(w - zScore * seW));
          const fUpper = Math.exp(w + zScore * seW) / (1 + Math.exp(w + zScore * seW));
          return { type: q.type, input: q.value, result: p, lower: 1 - fUpper, upper: 1 - fLower };
        }
      } catch (e) {
        console.warn(`커스텀 계산 실패 (${q.type}=${q.value}):`, e);
      }
      return { type: q.type, input: q.value, result: null, error: true };
    });
  }

  return { analyze, fitDistribution, customCalculate };
})();
