/**
 * statistics.js — 신뢰성 통계 유틸리티
 * RE-Suite Static Web App
 *
 * Ref: Meeker & Escobar (1998), "Statistical Methods for Reliability Data"
 * Ref: Nelson (1982), "Applied Life Data Analysis"
 * Ref: Reliasoft Weibull++ v21 Reference Manual
 */

const Statistics = (() => {

  const MIN_SAMPLE_FOR_MLE = 3;

  // ─────────────────────────────────────────────
  // Kaplan-Meier 경험적 CDF
  // Ref: Nelson (1982), Applied Life Data Analysis, Ch.4
  // ─────────────────────────────────────────────
  function computeKaplanMeier(failures, censored) {
    /**
     * KM Estimator — 생존 함수 추정 후 F(t) = 1 - S(t)
     * Returns: { times, fValues }
     */
    const allData = [
      ...failures.map(t => ({ t, event: 1 })),
      ...censored.map(t  => ({ t, event: 0 }))
    ].sort((a, b) => a.t - b.t);

    const n = allData.length;
    let survival = 1.0;
    let atRisk = n;

    const times = [];
    const fValues = [];

    for (const { t, event } of allData) {
      if (event === 1) {
        survival *= (1 - 1 / atRisk);
        times.push(t);
        fValues.push(1 - survival);
      }
      atRisk--;
    }
    return { times, fValues };
  }

  // ─────────────────────────────────────────────
  // Probability Plot 좌표 변환 (다분포 지원)
  // Ref: Meeker & Escobar (1998), Appendix C
  // ─────────────────────────────────────────────

  /**
   * Weibull: x = ln(t), y = ln(-ln(1-F))
   */
  function weibullProbPlotCoords(times, fValues) {
    const x = [], y = [];
    for (let i = 0; i < times.length; i++) {
      const t = times[i], f = fValues[i];
      if (t > 0 && f > 0 && f < 1) {
        x.push(Math.log(t));
        y.push(Math.log(-Math.log(1 - f)));
      }
    }
    return { x, y };
  }

  /**
   * Lognormal: x = ln(t), y = Φ⁻¹(F)
   * Ref: Meeker & Escobar (1998), Ch. 5
   */
  function lognormalProbPlotCoords(times, fValues) {
    const x = [], y = [];
    for (let i = 0; i < times.length; i++) {
      const t = times[i], f = fValues[i];
      if (t > 0 && f > 0.001 && f < 0.999) {
        x.push(Math.log(t));
        y.push(Distributions.normalPPF(f));
      }
    }
    return { x, y };
  }

  /**
   * Normal: x = t, y = Φ⁻¹(F)
   * Ref: Meeker & Escobar (1998), Ch. 4
   */
  function normalProbPlotCoords(times, fValues) {
    const x = [], y = [];
    for (let i = 0; i < times.length; i++) {
      const t = times[i], f = fValues[i];
      if (t > 0 && f > 0.001 && f < 0.999) {
        x.push(t);
        y.push(Distributions.normalPPF(f));
      }
    }
    return { x, y };
  }

  /**
   * Exponential: x = t, y = -ln(1-F)  (= cumulative hazard)
   * Ref: Nelson (1982), Ch. 4
   */
  function exponentialProbPlotCoords(times, fValues) {
    const x = [], y = [];
    for (let i = 0; i < times.length; i++) {
      const t = times[i], f = fValues[i];
      if (t > 0 && f > 0 && f < 1) {
        x.push(t);
        y.push(-Math.log(1 - f));
      }
    }
    return { x, y };
  }

  /**
   * 분포별 Probability Plot 좌표 라우터
   */
  function getProbPlotCoords(distType, times, fValues) {
    switch (distType) {
      case 'weibull':      return weibullProbPlotCoords(times, fValues);
      case 'lognormal':    return lognormalProbPlotCoords(times, fValues);
      case 'normal':       return normalProbPlotCoords(times, fValues);
      case 'exponential':  return exponentialProbPlotCoords(times, fValues);
      default:             return weibullProbPlotCoords(times, fValues);
    }
  }

  // ─────────────────────────────────────────────
  // CDF / Reliability Wald Logit 신뢰구간
  // Ref: Meeker & Escobar (1998), Section 7.2, Eq. 7.7
  //   w = logit(F) = ln(F/(1-F))
  //   se(w) = se_p / [F*(1-F)]
  //   CI_F = logistic(w ± z*se(w))
  // ─────────────────────────────────────────────
  function waldLogitCI(pVals, nTotal, zScore) {
    /**
     * pVals: array of F(t) values [0,1]
     * Returns: { lower, upper } arrays
     */
    const eps = 1e-9;
    const lower = [], upper = [];

    for (const p of pVals) {
      const pc = Math.max(Math.min(p, 1 - eps), eps);
      const seP = Math.sqrt(pc * (1 - pc) / nTotal);
      const w   = Math.log(pc / (1 - pc));
      const seW = seP / (pc * (1 - pc));
      const wL  = w - zScore * seW;
      const wU  = w + zScore * seW;
      lower.push(Math.exp(wL) / (1 + Math.exp(wL)));
      upper.push(Math.exp(wU) / (1 + Math.exp(wU)));
    }
    return { lower, upper };
  }

  // ─────────────────────────────────────────────
  // Hazard Rate Log CI (Poisson 근사)
  // Ref: Meeker & Escobar (1998), Section 7.3, Eq. 7.17
  //   se(ln h) ≈ 1/sqrt(n_failures)
  // ─────────────────────────────────────────────
  function hazardLogCI(hfVals, nFailures, zScore) {
    const nF = Math.max(nFailures, 1);
    const seLnH = 1 / Math.sqrt(nF);
    const lower = hfVals.map(h => Math.max(h * Math.exp(-zScore * seLnH), 0));
    const upper = hfVals.map(h => h * Math.exp(zScore * seLnH));
    return { lower, upper };
  }

  function computeFisherCI(failures, censored, fitDist, params, confidence) {
    if (failures.length < MIN_SAMPLE_FOR_MLE) return null;

    try {
      let optParams, negLL;
      if (fitDist === 'weibull') {
        optParams = [Math.log(params.alpha), Math.log(params.beta)];
        negLL = Distributions.Weibull.negLogLikelihoodLog(failures, censored);
      } else if (fitDist === 'lognormal') {
        optParams = [params.mu, Math.log(params.sigma)];
        negLL = Distributions.Lognormal.negLogLikelihoodLog(failures, censored);
      } else if (fitDist === 'normal') {
        optParams = [params.mu, Math.log(params.sigma)];
        negLL = Distributions.Normal.negLogLikelihoodLog(failures, censored);
      } else if (fitDist === 'exponential') {
        optParams = [Math.log(params.lambda)];
        negLL = Distributions.Exponential.negLogLikelihoodLog(failures, censored);
      } else {
        return null;
      }

      const H = MathEngine.numericalHessian(negLL, optParams, 1e-5);
      const cov = (optParams.length === 2) ? MathEngine.inv2x2(H) : [[ 1 / Math.max(H[0][0], 1e-10) ]];
      if (!cov) return null;

      const z = Distributions.normalPPF((1 + confidence) / 2);
      const res = { covMatrix: cov, confidence, zScore: z };

      if (fitDist === 'weibull') {
        const seL_A = Math.sqrt(Math.max(cov[0][0], 0));
        const seL_B = Math.sqrt(Math.max(cov[1][1], 0));
        res.alphaLower = params.alpha * Math.exp(-z * seL_A);
        res.alphaUpper = params.alpha * Math.exp( z * seL_A);
        res.betaLower  = params.beta  * Math.exp(-z * seL_B);
        res.betaUpper  = params.beta  * Math.exp( z * seL_B);
      } else if (fitDist === 'lognormal') {
        const seMu = Math.sqrt(Math.max(cov[0][0], 0));
        const seL_S = Math.sqrt(Math.max(cov[1][1], 0));
        res.muLower = params.mu - z * seMu;
        res.muUpper = params.mu + z * seMu;
        res.sigmaLower = params.sigma * Math.exp(-z * seL_S);
        res.sigmaUpper = params.sigma * Math.exp( z * seL_S);
      } else if (fitDist === 'normal') {
        const seMu = Math.sqrt(Math.max(cov[0][0], 0));
        const seL_S = Math.sqrt(Math.max(cov[1][1], 0));
        res.muLower = params.mu - z * seMu;
        res.muUpper = params.mu + z * seMu;
        res.sigmaLower = params.sigma * Math.exp(-z * seL_S);
        res.sigmaUpper = params.sigma * Math.exp( z * seL_S);
      } else if (fitDist === 'exponential') {
        const seL_L = Math.sqrt(Math.max(cov[0][0], 0));
        res.lambdaLower = params.lambda * Math.exp(-z * seL_L);
        res.lambdaUpper = params.lambda * Math.exp( z * seL_L);
      }
      return res;
    } catch (e) {
      console.warn('Fisher CI 계산 실패:', e);
      return null;
    }
  }

  // ─────────────────────────────────────────────
  // Delta Method 바탕 정확한 F(t) 신뢰구간 역산 (JMP/Weibull++ 방식)
  // ─────────────────────────────────────────────
  function computeTrueCDFCI(fitDist, params, cov, tVals, zScore) {
    const lower = [], upper = [];
    if (!cov) {
      // Fallback
      return { lower: tVals.map(()=>0), upper: tVals.map(()=>0) };
    }

    for (const t of tVals) {
      if (t <= 0) { lower.push(0); upper.push(0); continue; }

      if (fitDist === 'weibull') {
        // w = beta * (ln t - ln alpha)
        const lnt = Math.log(t);
        const lna = Math.log(params.alpha);
        const b = params.beta;
        const w = b * (lnt - lna);

        // var(w) = (lnt - lna)^2 var(beta) + (b/alpha)^2 var(alpha) ...
        // Cov is actually wrt [logAlpha, logBeta] !!!
        // So let u1 = logAlpha, u2 = logBeta. w = exp(u2) * (lnt - u1)
        // dw/du1 = -exp(u2) = -b
        // dw/du2 = exp(u2)*(lnt - u1) = w
        const d1 = -b; 
        const d2 = w;
        const varW = d1*d1*cov[0][0] + d2*d2*cov[1][1] + 2*d1*d2*cov[0][1];
        const seW = Math.sqrt(Math.max(varW, 0));
        
        const wL = w - zScore * seW;
        const wU = w + zScore * seW;
        lower.push(1 - Math.exp(-Math.exp(wL)));
        upper.push(1 - Math.exp(-Math.exp(wU)));
        
      } else if (fitDist === 'lognormal') {
        // z = (ln t - mu) / sigma
        // Cov is wrt [mu, logSigma]. Let u1 = mu, u2 = logSigma.
        // z = (lnt - u1)/exp(u2)
        // dz/du1 = -1/sigma
        // dz/du2 = -(lnt - u1)/exp(u2) = -z
        const z = (Math.log(t) - params.mu) / params.sigma;
        const d1 = -1 / params.sigma;
        const d2 = -z;
        const varZ = d1*d1*cov[0][0] + d2*d2*cov[1][1] + 2*d1*d2*cov[0][1];
        const seZ = Math.sqrt(Math.max(varZ, 0));
        
        const zL = z - zScore * seZ;
        const zU = z + zScore * seZ;
        lower.push(Distributions.normalCDF(zL));
        upper.push(Distributions.normalCDF(zU));

      } else if (fitDist === 'normal') {
        // z = (t - mu) / sigma
        // Cov wrt [mu, logSigma]. u1 = mu, u2 = logSigma
        const z = (t - params.mu) / params.sigma;
        const d1 = -1 / params.sigma;
        const d2 = -z;
        const varZ = d1*d1*cov[0][0] + d2*d2*cov[1][1] + 2*d1*d2*cov[0][1];
        const seZ = Math.sqrt(Math.max(varZ, 0));
        
        const zL = z - zScore * seZ;
        const zU = z + zScore * seZ;
        lower.push(Distributions.normalCDF(zL));
        upper.push(Distributions.normalCDF(zU));

      } else if (fitDist === 'exponential') {
        // w = ln(lambda * t) = u1 + ln t, where u1 = logLambda
        // dw/du1 = 1
        const u1 = Math.log(params.lambda);
        const w = u1 + Math.log(t);
        const varW = cov[0][0];
        const seW = Math.sqrt(Math.max(varW, 0));
        
        const wL = w - zScore * seW;
        const wU = w + zScore * seW;
        lower.push(1 - Math.exp(-Math.exp(wL)));
        upper.push(1 - Math.exp(-Math.exp(wU)));
      }
    }
    return { lower, upper };
  }

  // ─────────────────────────────────────────────
  // Bx Life 신뢰구간 (Delta Method)
  // Ref: Meeker & Escobar (1998), Ch. 7.3, Eq. 7.26-7.28
  // Ref: Reliasoft Weibull++ v21 Reference, "Confidence Bounds on Bx Life"
  // ─────────────────────────────────────────────
  function computeBxLifeCI(fitDist, params, covMatrix, bxFraction, zScore) {
    /**
     * Delta Method로 Bx 수명의 신뢰구간 계산
     * bxFraction: 0.01 (B1), 0.05 (B5), 0.10 (B10) 등
     * Returns: { estimate, lower, upper } or null
     */
    if (!covMatrix || bxFraction <= 0 || bxFraction >= 1) return null;

    try {
      if (fitDist === 'weibull') {
        // t_Bx = α * (-ln(1-x))^(1/β)
        // Log-space: ln(t_Bx) = ln(α) + (1/β)*ln(-ln(1-x))
        // Let u1 = ln(α), u2 = ln(β)
        // ln(t_Bx) = u1 + exp(-u2) * ln(-ln(1-x))
        // ∂(ln t)/∂u1 = 1
        // ∂(ln t)/∂u2 = -exp(-u2) * ln(-ln(1-x)) = -(1/β)*ln(-ln(1-x))
        const { alpha, beta } = params;
        const logQ = Math.log(-Math.log(1 - bxFraction));
        const tBx = alpha * Math.pow(-Math.log(1 - bxFraction), 1 / beta);
        const lnTBx = Math.log(tBx);

        const d1 = 1;  // ∂(ln t)/∂(ln α)
        const d2 = -(1 / beta) * logQ;  // ∂(ln t)/∂(ln β)

        const varLnT = d1 * d1 * covMatrix[0][0] + d2 * d2 * covMatrix[1][1] + 2 * d1 * d2 * (covMatrix[0][1] || 0);
        const seLnT = Math.sqrt(Math.max(varLnT, 0));

        return {
          estimate: tBx,
          lower: Math.exp(lnTBx - zScore * seLnT),
          upper: Math.exp(lnTBx + zScore * seLnT)
        };
      }

      if (fitDist === 'lognormal') {
        // t_Bx = exp(μ + σ * Φ⁻¹(x))
        // ln(t_Bx) = μ + σ * Φ⁻¹(x)
        // cov is wrt [μ, ln(σ)], let u1=μ, u2=ln(σ)
        // ∂(ln t)/∂u1 = 1
        // ∂(ln t)/∂u2 = σ * Φ⁻¹(x) = exp(u2) * Φ⁻¹(x)
        const { mu, sigma } = params;
        const z = Distributions.normalPPF(bxFraction);
        const tBx = Math.exp(mu + sigma * z);
        const lnTBx = Math.log(tBx);

        const d1 = 1;
        const d2 = sigma * z;  // ∂(ln t)/∂(ln σ) = σ*z

        const varLnT = d1 * d1 * covMatrix[0][0] + d2 * d2 * covMatrix[1][1] + 2 * d1 * d2 * (covMatrix[0][1] || 0);
        const seLnT = Math.sqrt(Math.max(varLnT, 0));

        return {
          estimate: tBx,
          lower: Math.exp(lnTBx - zScore * seLnT),
          upper: Math.exp(lnTBx + zScore * seLnT)
        };
      }

      if (fitDist === 'normal') {
        // t_Bx = μ + σ * Φ⁻¹(x)
        // cov wrt [μ, ln(σ)]
        // ∂t/∂u1 = 1, ∂t/∂u2 = σ * Φ⁻¹(x)
        const { mu, sigma } = params;
        const z = Distributions.normalPPF(bxFraction);
        const tBx = mu + sigma * z;

        const d1 = 1;
        const d2 = sigma * z;

        const varT = d1 * d1 * covMatrix[0][0] + d2 * d2 * covMatrix[1][1] + 2 * d1 * d2 * (covMatrix[0][1] || 0);
        const seT = Math.sqrt(Math.max(varT, 0));

        return {
          estimate: tBx,
          lower: tBx - zScore * seT,
          upper: tBx + zScore * seT
        };
      }

      if (fitDist === 'exponential') {
        // t_Bx = -ln(1-x) / λ
        // ln(t_Bx) = ln(-ln(1-x)) - ln(λ)
        // cov wrt [ln(λ)]
        // ∂(ln t)/∂(ln λ) = -1
        const { lambda } = params;
        const tBx = -Math.log(1 - bxFraction) / lambda;
        const lnTBx = Math.log(tBx);

        const d1 = -1;
        const varLnT = d1 * d1 * covMatrix[0][0];
        const seLnT = Math.sqrt(Math.max(varLnT, 0));

        return {
          estimate: tBx,
          lower: Math.exp(lnTBx - zScore * seLnT),
          upper: Math.exp(lnTBx + zScore * seLnT)
        };
      }

      return null;
    } catch (e) {
      console.warn('Bx Life CI 계산 실패:', e);
      return null;
    }
  }

  // ─────────────────────────────────────────────
  // Contour Plot (Likelihood Ratio + Polar Tracing)
  // Ref: Meeker & Escobar (1998), Ch. 8.6
  // -2[L(θ) - L(θ̂)] ≤ χ²(2, α)
  // 지원 분포: Weibull (η,β), Lognormal (μ,σ)
  // ─────────────────────────────────────────────
  function computeContourPlot(failures, censored, param1Hat, param2Hat, confidence, distType) {
    if (failures.length < MIN_SAMPLE_FOR_MLE) return null;
    const dist = distType || 'weibull';

    try {
      const logP1Hat = (dist === 'lognormal' || dist === 'normal') ? param1Hat : Math.log(param1Hat);
      const logP2Hat = (dist === 'lognormal' || dist === 'normal') ? Math.log(param2Hat) : Math.log(param2Hat);

      // 분포별 로그우도 함수 선택
      const logLik = (p1, p2) => {
        if (dist === 'weibull') {
          if (p1 <= 0 || p2 <= 0) return -Infinity;
          return Distributions.Weibull.logLikelihood(failures, censored, p1, p2);
        } else if (dist === 'lognormal') {
          if (p2 <= 0) return -Infinity;
          return Distributions.Lognormal.logLikelihood(failures, censored, p1, p2);
        } else if (dist === 'normal') {
          if (p2 <= 0) return -Infinity;
          return Distributions.Normal.logLikelihood(failures, censored, p1, p2);
        }
        return -Infinity;
      };

      const llHat = logLik(param1Hat, param2Hat);
      const chi2Threshold = _chi2Quantile(confidence, 2);
      const targetLL = llHat - chi2Threshold / 2;

      // Fisher covMatrix 기반 Cholesky
      const fisher = computeFisherCI(failures, censored, dist, { 
        ...(dist === 'weibull' ? { alpha: param1Hat, beta: param2Hat } : {}),
        ...(dist === 'lognormal' || dist === 'normal' ? { mu: param1Hat, sigma: param2Hat } : {})
      }, confidence);
      let L;
      if (fisher && fisher.covMatrix) {
        L = MathEngine.cholesky2x2(fisher.covMatrix);
      } else {
        L = [[0.1, 0], [0, 0.1]];
      }

      const points = [];
      const nAngles = 120;

      for (let i = 0; i <= nAngles; i++) {
        const theta = (2 * Math.PI * i) / nAngles;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        const llDiff = (r) => {
          const dp = MathEngine.matVec2(L, [r * cosT, r * sinT]);
          let p1, p2;
          if (dist === 'lognormal' || dist === 'normal') {
            p1 = logP1Hat + dp[0]; // μ는 linear space
            p2 = Math.exp(logP2Hat + dp[1]); // σ는 log space
          } else {
            p1 = Math.exp(logP1Hat + dp[0]);
            p2 = Math.exp(logP2Hat + dp[1]);
          }
          return logLik(p1, p2) - targetLL;
        };

        let rMax = 3.0;
        while (llDiff(rMax) > 0 && rMax < 100) rMax *= 2;

        const rRoot = MathEngine.brentq(llDiff, 1e-8, rMax);
        if (rRoot !== null) {
          const dp = MathEngine.matVec2(L, [rRoot * cosT, rRoot * sinT]);
          let p1, p2;
          if (dist === 'lognormal' || dist === 'normal') {
            p1 = logP1Hat + dp[0];
            p2 = Math.exp(logP2Hat + dp[1]);
          } else {
            p1 = Math.exp(logP1Hat + dp[0]);
            p2 = Math.exp(logP2Hat + dp[1]);
          }
          if (isFinite(p1) && isFinite(p2)) {
            points.push({ x: p1, y: p2 });
          }
        }
      }

      if (points.length < 3) return null;

      // 라벨 설정
      const labels = {
        weibull: { labelX: '척도 모수 (η)', labelY: '형상 모수 (β)' },
        lognormal: { labelX: '위치 모수 (μ)', labelY: '척도 모수 (σ)' },
        normal: { labelX: '평균 (μ)', labelY: '표준편차 (σ)' }
      };

      return {
        contourPoints: points,
        mleX: param1Hat,
        mleY: param2Hat,
        confidence,
        chi2Threshold,
        ...(labels[dist] || labels.weibull)
      };
    } catch (e) {
      console.warn('Contour Plot 계산 실패:', e);
      return null;
    }
  }

  // Chi-squared quantile (역 CDF) — Brent으로 역탐색
  function _chi2Quantile(p, df) {
    if (typeof jStat !== 'undefined') {
      return jStat.chisquare.inv(p, df);
    }
    // Brent으로 역탐색
    const f = (x) => Distributions.chi2CDF(x, df) - p;
    return MathEngine.brentq(f, 0.001, 200) || df;
  }

  return {
    computeKaplanMeier,
    weibullProbPlotCoords,
    lognormalProbPlotCoords,
    normalProbPlotCoords,
    exponentialProbPlotCoords,
    getProbPlotCoords,
    waldLogitCI,
    hazardLogCI,
    computeFisherCI,
    computeTrueCDFCI,
    computeBxLifeCI,
    computeContourPlot,
    MIN_SAMPLE_FOR_MLE
  };
})();
