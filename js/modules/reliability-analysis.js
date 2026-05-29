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
  function fitDistribution(distName, failures, censored, arbitraryData = null) {
    /**
     * 분포 적합 (MLE via Nelder-Mead)
     * Returns: { params, ll, dist } or null
     */
    const D = Distributions;
    const isArbitrary = Array.isArray(arbitraryData) && arbitraryData.length > 0;

    switch (distName) {
      case 'weibull': {
        const alphaInit = failures.length > 0 
          ? Math.exp(failures.reduce((s, t) => s + Math.log(t), 0) / failures.length)
          : 100;
        const betaInit = 1.5;
        
        let negLL, res, alpha, beta, ll;
        if (isArbitrary) {
          negLL = D.Weibull.negLogLikelihoodArbitrary(arbitraryData);
          res = MathEngine.nelderMead(negLL, [Math.log(alphaInit), Math.log(betaInit)]);
          alpha = Math.exp(res.x[0]);
          beta  = Math.exp(res.x[1]);
          ll    = -negLL([Math.log(alpha), Math.log(beta)]);
        } else {
          negLL = D.Weibull.negLogLikelihoodLog(failures, censored);
          res = MathEngine.nelderMead(negLL, [Math.log(alphaInit), Math.log(betaInit)]);
          alpha = Math.exp(res.x[0]);
          beta  = Math.exp(res.x[1]);
          ll    = D.Weibull.logLikelihood(failures, censored, alpha, beta);
        }

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
        const logTs  = failures.map(t => Math.log(Math.max(t, 1e-10)));
        const muInit = logTs.length > 0 ? logTs.reduce((s, v) => s + v, 0) / logTs.length : 4;
        const sigmaInit = logTs.length > 1 
          ? Math.sqrt(logTs.reduce((s, v) => s + (v - muInit) ** 2, 0) / logTs.length) || 0.5
          : 0.5;

        let negLL, res, mu, sigma, ll;
        if (isArbitrary) {
          negLL = D.Lognormal.negLogLikelihoodArbitrary(arbitraryData);
          res = MathEngine.nelderMead(negLL, [muInit, Math.log(sigmaInit)]);
          mu    = res.x[0];
          sigma = Math.exp(res.x[1]);
          ll    = -negLL([mu, Math.log(sigma)]);
        } else {
          negLL = D.Lognormal.negLogLikelihoodLog(failures, censored);
          res = MathEngine.nelderMead(negLL, [muInit, Math.log(sigmaInit)]);
          mu    = res.x[0];
          sigma = Math.exp(res.x[1]);
          ll    = D.Lognormal.logLikelihood(failures, censored, mu, sigma);
        }

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
        const muInit    = failures.length > 0 ? failures.reduce((s, v) => s + v, 0) / failures.length : 100;
        const sigmaInit = failures.length > 1 ? Math.sqrt(
          failures.reduce((s, v) => s + (v - muInit) ** 2, 0) / failures.length
        ) || muInit * 0.3 : muInit * 0.3;

        let negLL, res, mu, sigma, ll;
        if (isArbitrary) {
          negLL = D.Normal.negLogLikelihoodArbitrary(arbitraryData);
          res = MathEngine.nelderMead(negLL, [muInit, Math.log(sigmaInit)]);
          mu    = res.x[0];
          sigma = Math.exp(res.x[1]);
          ll    = -negLL([mu, Math.log(sigma)]);
        } else {
          negLL = D.Normal.negLogLikelihoodLog(failures, censored);
          res = MathEngine.nelderMead(negLL, [muInit, Math.log(sigmaInit)]);
          mu    = res.x[0];
          sigma = Math.exp(res.x[1]);
          ll    = D.Normal.logLikelihood(failures, censored, mu, sigma);
        }

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
        const nF = failures.length;
        const totalTime = [...failures, ...censored].reduce((s, t) => s + t, 0);
        const lambdaInit = nF > 0 ? nF / totalTime : 0.01;

        let negLL, res, lambda, ll;
        if (isArbitrary) {
          negLL = D.Exponential.negLogLikelihoodArbitrary(arbitraryData);
          res = MathEngine.nelderMead(negLL, [Math.log(lambdaInit)]);
          lambda = Math.exp(res.x[0]);
          ll    = -negLL([Math.log(lambda)]);
        } else {
          negLL = D.Exponential.negLogLikelihoodLog(failures, censored);
          lambda = lambdaInit;
          ll = D.Exponential.logLikelihood(failures, censored, lambda);
        }

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

      case 'weibull_mixture': {
        const sortedFailures = failures.slice().sort((a,b) => a - b);
        const halfIdx = Math.floor(sortedFailures.length / 2);
        
        const alpha1Init = sortedFailures.length > 0
          ? (sortedFailures[Math.floor(halfIdx / 2)] || 10)
          : 10;
        const beta1Init = 1.0;
        
        const alpha2Init = sortedFailures.length > 0
          ? (sortedFailures[Math.min(sortedFailures.length - 1, halfIdx + Math.floor(halfIdx / 2))] || 100)
          : 100;
        const beta2Init = 3.0;
        
        const initParams = [
          0.0,
          Math.log(alpha1Init),
          Math.log(beta1Init),
          Math.log(alpha2Init),
          Math.log(beta2Init)
        ];

        let negLL, res, p, alpha1, beta1, alpha2, beta2, ll;
        if (isArbitrary) {
          negLL = D.WeibullMixture.negLogLikelihoodArbitrary(arbitraryData);
          res = MathEngine.nelderMead(negLL, initParams);
          p = 1 / (1 + Math.exp(-res.x[0]));
          alpha1 = Math.exp(res.x[1]);
          beta1  = Math.exp(res.x[2]);
          alpha2 = Math.exp(res.x[3]);
          beta2  = Math.exp(res.x[4]);
          ll    = -negLL([res.x[0], res.x[1], res.x[2], res.x[3], res.x[4]]);
        } else {
          negLL = D.WeibullMixture.negLogLikelihoodLog(failures, censored);
          res = MathEngine.nelderMead(negLL, initParams);
          p = 1 / (1 + Math.exp(-res.x[0]));
          alpha1 = Math.exp(res.x[1]);
          beta1  = Math.exp(res.x[2]);
          alpha2 = Math.exp(res.x[3]);
          beta2  = Math.exp(res.x[4]);
          ll    = D.WeibullMixture.logLikelihood(failures, censored, p, alpha1, beta1, alpha2, beta2);
        }

        return {
          dist: 'weibull_mixture', params: { p, alpha1, beta1, alpha2, beta2 }, ll,
          mttf: D.WeibullMixture.mttf(p, alpha1, beta1, alpha2, beta2),
          cdfFn: (t) => D.WeibullMixture.cdf(t, p, alpha1, beta1, alpha2, beta2),
          sfFn:  (t) => D.WeibullMixture.sf(t, p, alpha1, beta1, alpha2, beta2),
          pdfFn: (t) => D.WeibullMixture.pdf(t, p, alpha1, beta1, alpha2, beta2),
          hfFn:  (t) => D.WeibullMixture.hf(t, p, alpha1, beta1, alpha2, beta2),
          qFn:   (fraction) => {
            let low = 0, high = alpha1 * 10 + alpha2 * 10;
            for (let i = 0; i < 50; i++) {
              const mid = (low + high) / 2;
              const val = D.WeibullMixture.cdf(mid, p, alpha1, beta1, alpha2, beta2);
              if (val < fraction) low = mid;
              else high = mid;
            }
            return (low + high) / 2;
          }
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
    const kMap = { weibull: 2, lognormal: 2, normal: 2, exponential: 1, weibull_mixture: 5 };
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
     * dataRows: [{ time, event, count, start, end, type }]
     * options: { distribution, confidence }
     * Returns: 분석 결과 객체
     */
    const confidence = options.confidence || 0.9;
    const distChoice = options.distribution || 'auto';

    // 임의 관측중단(Arbitrary Censoring) 형식의 데이터 배열 및 비모수 플롯용 임시 배열 생성
    const arbitraryData = [];
    let nTotal = 0;
    let nFailures = 0;
    const failures = [];
    const censored = [];

    dataRows.forEach(r => {
      const count = Number(r.count) || 1;
      nTotal += count;

      if (r.type === 'interval') {
        const start = Number(r.start);
        const end = (r.end === '*' || r.end === Infinity || isNaN(Number(r.end)) || r.end === null) ? Infinity : Number(r.end);
        if (start >= 0 && end > start) {
          arbitraryData.push({ start, end, count });
          if (end === Infinity) {
            for (let i = 0; i < count; i++) censored.push(start);
          } else {
            nFailures += count;
            const mid = (start + end) / 2;
            for (let i = 0; i < count; i++) failures.push(mid);
          }
        }
      } else {
        const t = Number(r.time);
        if (t > 0) {
          if (r.event === 'F') {
            nFailures += count;
            arbitraryData.push({ start: t, end: t, count });
            for (let i = 0; i < count; i++) failures.push(t);
          } else {
            arbitraryData.push({ start: t, end: Infinity, count });
            for (let i = 0; i < count; i++) censored.push(t);
          }
        }
      }
    });

    // 유효성 검사
    if (nTotal < MIN_SAMPLE) {
      throw new Error(`샘플 수가 너무 적습니다 (${nTotal}개). 최소 ${MIN_SAMPLE}개 이상 필요합니다.`);
    }
    if (failures.length < 1) {
      throw new Error('고장 데이터가 없습니다. 최소 1개 이상의 고장 데이터가 필요합니다.');
    }

    // 모든 분포 적합 시도
    const distNames = ['weibull', 'lognormal', 'normal', 'exponential', 'weibull_mixture'];
    const fits = [];

    for (const dn of distNames) {
      try {
        const fit = fitDistribution(dn, failures, censored, arbitraryData);
        if (fit && isFinite(fit.ll)) {
          const kMap = { weibull: 2, lognormal: 2, normal: 2, exponential: 1, weibull_mixture: 5 };
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
    const pdfVals = xVals.map(t => {
      const val = selectedFit.pdfFn(t);
      return isFinite(val) ? val : 0;
    });
    const cdfVals = xVals.map(t => {
      const val = selectedFit.cdfFn(t);
      return isFinite(val) ? Math.max(0, Math.min(1, val)) : 1;
    });
    const sfVals  = xVals.map(t => {
      const val = selectedFit.sfFn(t);
      return isFinite(val) ? Math.max(0, Math.min(1, val)) : 0;
    });
    const hfVals  = xVals.map(t => {
      const val = selectedFit.hfFn(t);
      return isFinite(val) ? val : 0;
    });

    // ─────────────────────────────────────────────
    // 신뢰구간 (Confidence Intervals)
    // ─────────────────────────────────────────────
    const zScore = Distributions.normalPPF((1 + confidence) / 2);

    // Fisher CI 기반 모수 변동성 (공분산 행렬) 추출
    let fisherCI = null, contourData = null;
    if (failures.length >= MIN_SAMPLE && selectedFit.dist !== 'weibull_mixture') {
      fisherCI = Statistics.computeFisherCI(arbitraryData, null, selectedFit.dist, selectedFit.params, confidence);
      // Contour Plot — 항상 Weibull 기준
      if (failures.length >= 5) {
        const wFit = fits.find(f => f.dist === 'weibull');
        if (wFit) {
          contourData = Statistics.computeContourPlot(
            arbitraryData, null, wFit.params.alpha, wFit.params.beta, confidence, 'weibull'
          );
        }
      }
    }

    // Delta Method 방식 정확한 JMP방식 F(t) 신뢰구간 생성
    let cdfCI;
    if (fisherCI && fisherCI.covMatrix) {
      cdfCI = Statistics.computeTrueCDFCI(selectedFit.dist, selectedFit.params, fisherCI.covMatrix, xVals, zScore);
    } else {
      cdfCI = Statistics.waldLogitCI(cdfVals, nTotal, zScore);
    }

    // Hazard Rate CI도 Delta Method로 계산
    let hfCI;
    if (fisherCI && fisherCI.covMatrix) {
      hfCI = Statistics.computeHazardCI(selectedFit.dist, selectedFit.params, fisherCI.covMatrix, xVals, zScore);
    } else {
      hfCI = Statistics.hazardLogCI(hfVals, failures.length, zScore);
    }

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
      mttfF: selectedFit.cdfFn(selectedFit.mttf),
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
              dataSummary.arbitraryData || dataSummary.failures,
              dataSummary.arbitraryData ? null : dataSummary.censored,
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
          let lower = null, upper = null;
          if (dataSummary.nFailures >= 3) {
            const fi = Statistics.computeFisherCI(
              dataSummary.arbitraryData || dataSummary.failures,
              dataSummary.arbitraryData ? null : dataSummary.censored,
              distribution, params, confidence
            );
            if (fi && fi.covMatrix) {
              const ci = Statistics.computeTrueCDFCI(distribution, params, fi.covMatrix, [q.value], zScore);
              if (ci) { lower = ci.lower[0]; upper = ci.upper[0]; }
            }
          }
          if (lower === null || upper === null) {
            const pc = Math.max(Math.min(p, 1 - 1e-9), 1e-9);
            const seP = Math.sqrt(pc * (1 - pc) / nTotal);
            const w = Math.log(pc / (1 - pc));
            const seW = seP / (pc * (1 - pc));
            lower = Math.exp(w - zScore * seW) / (1 + Math.exp(w - zScore * seW));
            upper = Math.exp(w + zScore * seW) / (1 + Math.exp(w + zScore * seW));
          }
          return { type: q.type, input: q.value, result: p, lower, upper };
        }

        if (q.type === 'Reliability') {
          const p = 1 - cdfFn(q.value);
          const pf = 1 - p;
          let lower = null, upper = null;
          if (dataSummary.nFailures >= 3) {
            const fi = Statistics.computeFisherCI(
              dataSummary.arbitraryData || dataSummary.failures,
              dataSummary.arbitraryData ? null : dataSummary.censored,
              distribution, params, confidence
            );
            if (fi && fi.covMatrix) {
              const ci = Statistics.computeTrueCDFCI(distribution, params, fi.covMatrix, [q.value], zScore);
              if (ci) {
                lower = 1 - ci.upper[0];
                upper = 1 - ci.lower[0];
              }
            }
          }
          if (lower === null || upper === null) {
            const pc = Math.max(Math.min(pf, 1 - 1e-9), 1e-9);
            const seP = Math.sqrt(pc * (1 - pc) / nTotal);
            const w = Math.log(pc / (1 - pc));
            const seW = seP / (pc * (1 - pc));
            const fLower = Math.exp(w - zScore * seW) / (1 + Math.exp(w - zScore * seW));
            const fUpper = Math.exp(w + zScore * seW) / (1 + Math.exp(w + zScore * seW));
            lower = 1 - fUpper;
            upper = 1 - fLower;
          }
          return { type: q.type, input: q.value, result: p, lower, upper };
        }
      } catch (e) {
        console.warn(`커스텀 계산 실패 (${q.type}=${q.value}):`, e);
      }
      return { type: q.type, input: q.value, result: null, error: true };
    });
  }

  return { analyze, fitDistribution, customCalculate };
})();
