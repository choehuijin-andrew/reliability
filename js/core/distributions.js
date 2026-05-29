/**
 * distributions.js — 신뢰성 분포 함수 라이브러리
 * RE-Suite Static Web App
 *
 * Ref: Meeker & Escobar (1998), "Statistical Methods for Reliability Data", Wiley
 * Ref: ReliaSoft Weibull++ v21 Reference Manual
 *
 * 분포 파라미터 표기 (Reliasoft/Meeker 표준):
 *   Weibull 2P :  alpha(η, scale), beta(β, shape)
 *   Lognormal  :  mu(μ, log-mean), sigma(σ, log-std)
 *   Normal     :  mu(μ, mean),     sigma(σ, std)
 *   Exponential:  lambda(λ, rate = 1/scale)
 */

const Distributions = (() => {

  const LOG2PI = Math.log(2 * Math.PI);

  function groupData(arr) {
    const map = {};
    const len = arr.length;
    for (let i = 0; i < len; i++) {
      const v = arr[i];
      if (v > 0) {
        map[v] = (map[v] || 0) + 1;
      }
    }
    const entries = Object.entries(map);
    const result = new Array(entries.length);
    for (let i = 0; i < entries.length; i++) {
      result[i] = [parseFloat(entries[i][0]), entries[i][1]];
    }
    return result;
  }

  // ─────────────────────────────────────────────
  // 정규분포 CDF (jStat 없을 때 대비 내장 근사)
  // Ref: Abramowitz & Stegun (1964), 26.2.17
  // ─────────────────────────────────────────────
  function normalCDF(x) {
    if (typeof jStat !== 'undefined') {
      return jStat.normal.cdf(x, 0, 1);
    }
    // Hart (1968) rational approximation, 6-term
    const a = [0.319381530, -0.356563782, 1.781477937, -1.821255978, 1.330274429];
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989422820 * Math.exp(-0.5 * x * x);
    let poly = 0;
    let tp = t;
    for (let i = 0; i < a.length; i++) { poly += a[i] * tp; tp *= t; }
    const p = 1 - d * poly;
    return x >= 0 ? p : 1 - p;
  }

  function normalPPF(p) {
    if (typeof jStat !== 'undefined') {
      return jStat.normal.inv(p, 0, 1);
    }
    // Peter Acklam's rational approximation (max err 1.15e-9)
    const a = [-3.969683028665376e+01, 2.209460984245205e+02,
               -2.759285104469687e+02, 1.383577518672690e+02,
               -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02,
               -1.556989798598866e+02, 6.680131188771972e+01,
               -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01,
               -2.400758277161838e+00, -2.549732539343734e+00,
                4.374664141464968e+00,  2.938163982698783e+00];
    const d2 = [7.784695709041462e-03, 3.224671290700398e-01,
                2.445134137142996e+00, 3.754408661907416e+00];
    const pLow = 0.02425, pHigh = 1 - pLow;
    let r, q;
    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
             ((((d2[0]*q+d2[1])*q+d2[2])*q+d2[3])*q+1);
    } else if (p <= pHigh) {
      q = p - 0.5;
      r = q * q;
      return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
             (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
              ((((d2[0]*q+d2[1])*q+d2[2])*q+d2[3])*q+1);
    }
  }

  // ─────────────────────────────────────────────
  // 감마 함수 (Stirling 근사 for MTTF 계산)
  // ─────────────────────────────────────────────
  function gamma(z) {
    // Lanczos approximation (g=7)
    const g = 7;
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
               771.32342877765313, -176.61502916214059, 12.507343278686905,
               -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    z -= 1;
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  }

  // Chi-squared CDF via regularized lower incomplete gamma
  function chi2CDF(x, df) {
    if (typeof jStat !== 'undefined') {
      return jStat.chisquare.cdf(x, df);
    }
    return regularizedGammaP(df / 2, x / 2);
  }

  // 정규화된 하부 불완전 감마 함수 (연속분수 전개)
  function regularizedGammaP(a, x) {
    if (x < 0) return 0;
    if (x === 0) return 0;
    if (x < a + 1) {
      // 급수 전개
      let sum = 1 / a, term = 1 / a, n = 1;
      while (Math.abs(term) > 1e-12 && n < 300) {
        term *= x / (a + n);
        sum += term;
        n++;
      }
      return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
    }
    // 연속분수
    let b = x + 1 - a, c = 1e30, d = 1 / b, h = d;
    for (let i = 1; i <= 300; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = b + an / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-12) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
  }

  function logGamma(z) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
               -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = z, tmp = z + 5.5;
    tmp -= (z + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (const ci of c) { y += 1; ser += ci / y; }
    return -tmp + Math.log(2.5066282746310005 * ser / z);
  }

  // ═══════════════════════════════════════════════════════════════
  // WEIBULL 2P 분포
  // Ref: Meeker & Escobar (1998), Ch.3; Reliasoft Weibull++ v21 Ref
  // F(t) = 1 - exp(-(t/alpha)^beta)
  // ═══════════════════════════════════════════════════════════════
  const Weibull = {
    /**
     * CDF: F(t) = 1 - exp(-(t/alpha)^beta)
     * Ref: M&E (1998), Eq. 3.1
     */
    cdf: (t, alpha, beta) => {
      if (t <= 0) return 0;
      return 1 - Math.exp(-Math.pow(t / alpha, beta));
    },

    /** SF (Reliability): R(t) = exp(-(t/alpha)^beta) */
    sf: (t, alpha, beta) => {
      if (t <= 0) return 1;
      return Math.exp(-Math.pow(t / alpha, beta));
    },

    /** PDF: f(t) = (beta/alpha)*(t/alpha)^(beta-1)*exp(-(t/alpha)^beta) */
    pdf: (t, alpha, beta) => {
      if (t <= 0) return 0;
      const ta = t / alpha;
      return (beta / alpha) * Math.pow(ta, beta - 1) * Math.exp(-Math.pow(ta, beta));
    },

    /** HF (Hazard Rate): h(t) = (beta/alpha)*(t/alpha)^(beta-1) */
    hf: (t, alpha, beta) => {
      if (t <= 0) return 0;
      return (beta / alpha) * Math.pow(t / alpha, beta - 1);
    },

    /**
     * Quantile (Bx Life): t = alpha * (-ln(1-p))^(1/beta)
     * Ref: M&E (1998), Eq. 4.3
     */
    quantile: (p, alpha, beta) => {
      if (p <= 0) return 0;
      if (p >= 1) return Infinity;
      return alpha * Math.pow(-Math.log(1 - p), 1 / beta);
    },

    /**
     * MTTF: η * Γ(1 + 1/β)
     * Ref: Meeker & Escobar (1998), Eq. 3.19
     */
    mttf: (alpha, beta) => alpha * gamma(1 + 1 / beta),

    /**
     * Log-Likelihood (우측 관측중단 포함)
     * Ref: Meeker & Escobar (1998), Eq. 9.12
     * LL = Σ_failures [ln f(ti)] + Σ_censored [ln R(tc)]
     */
    logLikelihood: (failures, censored, alpha, beta) => {
      if (alpha <= 0 || beta <= 0) return -Infinity;
      const fEntries = groupData(failures);
      const cEntries = groupData(censored);
      let ll = 0;
      const lnAlpha = Math.log(alpha);
      const lnBeta = Math.log(beta);
      for (let i = 0; i < fEntries.length; i++) {
        const t = fEntries[i][0];
        const count = fEntries[i][1];
        if (t <= 0) return -Infinity;
        const ta = t / alpha;
        ll += count * (lnBeta - lnAlpha + (beta - 1) * Math.log(ta) - Math.pow(ta, beta));
      }
      for (let i = 0; i < cEntries.length; i++) {
        const t = cEntries[i][0];
        const count = cEntries[i][1];
        ll -= count * Math.pow(t / alpha, beta);
      }
      return ll;
    },

    negLogLikelihoodLog: (failures, censored) => {
      const fEntries = groupData(failures);
      const cEntries = groupData(censored);
      return (params) => {
        const alpha = Math.exp(params[0]);
        const beta  = Math.exp(params[1]);
        if (alpha <= 0 || beta <= 0) return 1e30;
        let ll = 0;
        const lnAlpha = Math.log(alpha);
        const lnBeta = Math.log(beta);
        for (let i = 0; i < fEntries.length; i++) {
          const t = fEntries[i][0];
          const count = fEntries[i][1];
          const ta = t / alpha;
          ll += count * (lnBeta - lnAlpha + (beta - 1) * Math.log(ta) - Math.pow(ta, beta));
        }
        for (let i = 0; i < cEntries.length; i++) {
          const t = cEntries[i][0];
          const count = cEntries[i][1];
          ll -= count * Math.pow(t / alpha, beta);
        }
        return -ll;
      };
    },

    negLogLikelihoodArbitrary: (data) => {
      return (params) => {
        const alpha = Math.exp(params[0]);
        const beta  = Math.exp(params[1]);
        if (alpha <= 0 || beta <= 0) return 1e30;
        let ll = 0;
        const eps = 1e-15;
        for (let i = 0; i < data.length; i++) {
          const { start, end, count } = data[i];
          if (start === end) {
            if (start <= 0) return 1e30;
            const ta = start / alpha;
            ll += count * (Math.log(beta) - Math.log(alpha) + (beta - 1) * Math.log(ta) - Math.pow(ta, beta));
          } else if (end === Infinity || isNaN(end) || end === null || end === '*') {
            ll -= count * Math.pow(start / alpha, beta);
          } else {
            const fEnd = 1 - Math.exp(-Math.pow(end / alpha, beta));
            const fStart = start <= 0 ? 0 : 1 - Math.exp(-Math.pow(start / alpha, beta));
            ll += count * Math.log(Math.max(fEnd - fStart, eps));
          }
        }
        return -ll;
      };
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // LOGNORMAL 2P 분포
  // Ref: Meeker & Escobar (1998), Ch.5
  // F(t) = Φ((ln(t) - μ) / σ)
  // ═══════════════════════════════════════════════════════════════
  const Lognormal = {
    cdf: (t, mu, sigma) => {
      if (t <= 0) return 0;
      return normalCDF((Math.log(t) - mu) / sigma);
    },
    sf: (t, mu, sigma) => 1 - Lognormal.cdf(t, mu, sigma),
    pdf: (t, mu, sigma) => {
      if (t <= 0) return 0;
      const z = (Math.log(t) - mu) / sigma;
      return Math.exp(-0.5 * z * z) / (t * sigma * Math.sqrt(2 * Math.PI));
    },
    hf: (t, mu, sigma) => {
      const f = Lognormal.pdf(t, mu, sigma);
      const s = Lognormal.sf(t, mu, sigma);
      return s > 1e-15 ? f / s : 0;
    },
    /** Quantile: exp(μ + σ * Φ^{-1}(p)) */
    quantile: (p, mu, sigma) => {
      if (p <= 0) return 0;
      if (p >= 1) return Infinity;
      return Math.exp(mu + sigma * normalPPF(p));
    },
    mttf: (mu, sigma) => Math.exp(mu + 0.5 * sigma * sigma),
    logLikelihood: (failures, censored, mu, sigma) => {
      if (sigma <= 0) return -Infinity;
      const fEntries = groupData(failures);
      const cEntries = groupData(censored);
      let ll = 0;
      const lnSigma = Math.log(sigma);
      for (let i = 0; i < fEntries.length; i++) {
        const t = fEntries[i][0];
        const count = fEntries[i][1];
        if (t <= 0) return -Infinity;
        const z = (Math.log(t) - mu) / sigma;
        ll += count * (-Math.log(t) - lnSigma - 0.5 * (LOG2PI + z * z));
      }
      for (let i = 0; i < cEntries.length; i++) {
        const t = cEntries[i][0];
        const count = cEntries[i][1];
        const sfVal = Lognormal.sf(t, mu, sigma);
        ll += count * Math.log(Math.max(sfVal, 1e-15));
      }
      return ll;
    },
    negLogLikelihoodLog: (failures, censored) => {
      const fEntries = groupData(failures);
      const cEntries = groupData(censored);
      return (params) => {
        const mu = params[0];
        const sigma = Math.exp(params[1]);
        if (sigma <= 0) return 1e30;
        let ll = 0;
        const lnSigma = Math.log(sigma);
        for (let i = 0; i < fEntries.length; i++) {
          const t = fEntries[i][0];
          const count = fEntries[i][1];
          const z = (Math.log(t) - mu) / sigma;
          ll += count * (-Math.log(t) - lnSigma - 0.5 * (LOG2PI + z * z));
        }
        for (let i = 0; i < cEntries.length; i++) {
          const t = cEntries[i][0];
          const count = cEntries[i][1];
          const sfVal = Lognormal.sf(t, mu, sigma);
          ll += count * Math.log(Math.max(sfVal, 1e-15));
        }
        return -ll;
      };
    },

    negLogLikelihoodArbitrary: (data) => {
      return (params) => {
        const mu = params[0];
        const sigma = Math.exp(params[1]);
        if (sigma <= 0) return 1e30;
        let ll = 0;
        const eps = 1e-15;
        const lnSigma = Math.log(sigma);
        for (let i = 0; i < data.length; i++) {
          const { start, end, count } = data[i];
          if (start === end) {
            if (start <= 0) return 1e30;
            const z = (Math.log(start) - mu) / sigma;
            ll += count * (-Math.log(start) - lnSigma - 0.5 * (LOG2PI + z * z));
          } else if (end === Infinity || isNaN(end) || end === null || end === '*') {
            const sfVal = Lognormal.sf(start, mu, sigma);
            ll += count * Math.log(Math.max(sfVal, eps));
          } else {
            const fEnd = Lognormal.cdf(end, mu, sigma);
            const fStart = start <= 0 ? 0 : Lognormal.cdf(start, mu, sigma);
            ll += count * Math.log(Math.max(fEnd - fStart, eps));
          }
        }
        return -ll;
      };
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // NORMAL 2P 분포
  // F(t) = Φ((t - μ) / σ)
  // ═══════════════════════════════════════════════════════════════
  const Normal = {
    cdf: (t, mu, sigma) => normalCDF((t - mu) / sigma),
    sf: (t, mu, sigma) => 1 - Normal.cdf(t, mu, sigma),
    pdf: (t, mu, sigma) => {
      const z = (t - mu) / sigma;
      return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
    },
    hf: (t, mu, sigma) => {
      const f = Normal.pdf(t, mu, sigma);
      const s = Normal.sf(t, mu, sigma);
      return s > 1e-15 ? f / s : 0;
    },
    quantile: (p, mu, sigma) => {
      if (p <= 0) return -Infinity;
      if (p >= 1) return Infinity;
      return mu + sigma * normalPPF(p);
    },
    mttf: (mu, sigma) => mu,
    logLikelihood: (failures, censored, mu, sigma) => {
      if (sigma <= 0) return -Infinity;
      const fEntries = groupData(failures);
      const cEntries = groupData(censored);
      let ll = 0;
      const lnSigma = Math.log(sigma);
      for (let i = 0; i < fEntries.length; i++) {
        const t = fEntries[i][0];
        const count = fEntries[i][1];
        const z = (t - mu) / sigma;
        ll += count * (-lnSigma - 0.5 * (LOG2PI + z * z));
      }
      for (let i = 0; i < cEntries.length; i++) {
        const t = cEntries[i][0];
        const count = cEntries[i][1];
        const sfVal = Normal.sf(t, mu, sigma);
        ll += count * Math.log(Math.max(sfVal, 1e-15));
      }
      return ll;
    },
    negLogLikelihoodLog: (failures, censored) => {
      const fEntries = groupData(failures);
      const cEntries = groupData(censored);
      return (params) => {
        const mu = params[0];
        const sigma = Math.exp(params[1]);
        if (sigma <= 0) return 1e30;
        let ll = 0;
        const lnSigma = Math.log(sigma);
        for (let i = 0; i < fEntries.length; i++) {
          const t = fEntries[i][0];
          const count = fEntries[i][1];
          const z = (t - mu) / sigma;
          ll += count * (-lnSigma - 0.5 * (LOG2PI + z * z));
        }
        for (let i = 0; i < cEntries.length; i++) {
          const t = cEntries[i][0];
          const count = cEntries[i][1];
          const sfVal = Normal.sf(t, mu, sigma);
          ll += count * Math.log(Math.max(sfVal, 1e-15));
        }
        return -ll;
      };
    },

    negLogLikelihoodArbitrary: (data) => {
      return (params) => {
        const mu = params[0];
        const sigma = Math.exp(params[1]);
        if (sigma <= 0) return 1e30;
        let ll = 0;
        const eps = 1e-15;
        const lnSigma = Math.log(sigma);
        for (let i = 0; i < data.length; i++) {
          const { start, end, count } = data[i];
          if (start === end) {
            const z = (start - mu) / sigma;
            ll += count * (-lnSigma - 0.5 * (LOG2PI + z * z));
          } else if (end === Infinity || isNaN(end) || end === null || end === '*') {
            const sfVal = Normal.sf(start, mu, sigma);
            ll += count * Math.log(Math.max(sfVal, eps));
          } else {
            const fEnd = Normal.cdf(end, mu, sigma);
            const fStart = Normal.cdf(start, mu, sigma);
            ll += count * Math.log(Math.max(fEnd - fStart, eps));
          }
        }
        return -ll;
      };
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // EXPONENTIAL 1P 분포
  // F(t) = 1 - exp(-λ*t),  λ = 1/scale
  // ═══════════════════════════════════════════════════════════════
  const Exponential = {
    cdf: (t, lambda) => {
      if (t <= 0) return 0;
      return 1 - Math.exp(-lambda * t);
    },
    sf: (t, lambda) => {
      if (t <= 0) return 1;
      return Math.exp(-lambda * t);
    },
    pdf: (t, lambda) => {
      if (t <= 0) return 0;
      return lambda * Math.exp(-lambda * t);
    },
    hf: (t, lambda) => lambda,  // 상수 고장률
    quantile: (p, lambda) => {
      if (p <= 0) return 0;
      if (p >= 1) return Infinity;
      return -Math.log(1 - p) / lambda;
    },
    mttf: (lambda) => 1 / lambda,
    logLikelihood: (failures, censored, lambda) => {
      if (lambda <= 0) return -Infinity;
      const fEntries = groupData(failures);
      const cEntries = groupData(censored);
      let ll = 0;
      const lnLambda = Math.log(lambda);
      for (let i = 0; i < fEntries.length; i++) {
        const t = fEntries[i][0];
        const count = fEntries[i][1];
        if (t <= 0) return -Infinity;
        ll += count * (lnLambda - lambda * t);
      }
      for (let i = 0; i < cEntries.length; i++) {
        const t = cEntries[i][0];
        const count = cEntries[i][1];
        ll -= count * lambda * t;
      }
      return ll;
    },
    negLogLikelihoodLog: (failures, censored) => {
      const fEntries = groupData(failures);
      const cEntries = groupData(censored);
      return (params) => {
        const lambda = Math.exp(params[0]);
        if (lambda <= 0) return 1e30;
        let ll = 0;
        const lnLambda = Math.log(lambda);
        for (let i = 0; i < fEntries.length; i++) {
          const t = fEntries[i][0];
          const count = fEntries[i][1];
          ll += count * (lnLambda - lambda * t);
        }
        for (let i = 0; i < cEntries.length; i++) {
          const t = cEntries[i][0];
          const count = cEntries[i][1];
          ll -= count * lambda * t;
        }
        return -ll;
      };
    },

    negLogLikelihoodArbitrary: (data) => {
      return (params) => {
        const lambda = Math.exp(params[0]);
        if (lambda <= 0) return 1e30;
        let ll = 0;
        const eps = 1e-15;
        const lnLambda = Math.log(lambda);
        for (let i = 0; i < data.length; i++) {
          const { start, end, count } = data[i];
          if (start === end) {
            if (start <= 0) return 1e30;
            ll += count * (lnLambda - lambda * start);
          } else if (end === Infinity || isNaN(end) || end === null || end === '*') {
            ll -= count * lambda * start;
          } else {
            const fEnd = Exponential.cdf(end, lambda);
            const fStart = start <= 0 ? 0 : Exponential.cdf(start, lambda);
            ll += count * Math.log(Math.max(fEnd - fStart, eps));
          }
        }
        return -ll;
      };
    }
  };

  // ─────────────────────────────────────────────
  // Weibull Mixture (Mixed Weibull) 분포
  // ─────────────────────────────────────────────
  const WeibullMixture = {
    cdf(t, p, alpha1, beta1, alpha2, beta2) {
      if (t <= 0) return 0;
      const cdf1 = 1 - Math.exp(-Math.pow(t / alpha1, beta1));
      const cdf2 = 1 - Math.exp(-Math.pow(t / alpha2, beta2));
      return p * cdf1 + (1 - p) * cdf2;
    },

    sf(t, p, alpha1, beta1, alpha2, beta2) {
      return 1 - this.cdf(t, p, alpha1, beta1, alpha2, beta2);
    },

    pdf(t, p, alpha1, beta1, alpha2, beta2) {
      if (t <= 0) return 0;
      const pdf1 = (beta1 / alpha1) * Math.pow(t / alpha1, beta1 - 1) * Math.exp(-Math.pow(t / alpha1, beta1));
      const pdf2 = (beta2 / alpha2) * Math.pow(t / alpha2, beta2 - 1) * Math.exp(-Math.pow(t / alpha2, beta2));
      return p * pdf1 + (1 - p) * pdf2;
    },

    hf(t, p, alpha1, beta1, alpha2, beta2) {
      const sf = this.sf(t, p, alpha1, beta1, alpha2, beta2);
      if (sf < 1e-10) {
        return this.pdf(t, p, alpha1, beta1, alpha2, beta2) / 1e-10;
      }
      return this.pdf(t, p, alpha1, beta1, alpha2, beta2) / sf;
    },

    mttf(p, alpha1, beta1, alpha2, beta2) {
      const mttf1 = alpha1 * gamma(1 + 1 / beta1);
      const mttf2 = alpha2 * gamma(1 + 1 / beta2);
      return p * mttf1 + (1 - p) * mttf2;
    },

    negLogLikelihoodArbitrary(arbitraryData) {
      return (x) => {
        const p = 1 / (1 + Math.exp(-x[0]));
        const alpha1 = Math.exp(x[1]);
        const beta1  = Math.exp(x[2]);
        const alpha2 = Math.exp(x[3]);
        const beta2  = Math.exp(x[4]);

        let sum = 0;
        const len = arbitraryData.length;
        for (let i = 0; i < len; i++) {
          const row = arbitraryData[i];
          const count = row.count || 1;
          if (row.start === row.end) {
            const val = this.pdf(row.start, p, alpha1, beta1, alpha2, beta2);
            sum += count * Math.log(Math.max(val, 1e-15));
          } else if (row.end === Infinity) {
            const val = this.sf(row.start, p, alpha1, beta1, alpha2, beta2);
            sum += count * Math.log(Math.max(val, 1e-15));
          } else {
            const val = this.cdf(row.end, p, alpha1, beta1, alpha2, beta2) - 
                        this.cdf(row.start, p, alpha1, beta1, alpha2, beta2);
            sum += count * Math.log(Math.max(val, 1e-15));
          }
        }
        return -sum;
      };
    },

    negLogLikelihoodLog(failures, censored) {
      const arbitraryData = failures.map(t => ({ start: t, end: t, count: 1 }))
        .concat(censored.map(t => ({ start: t, end: Infinity, count: 1 })));
      return this.negLogLikelihoodArbitrary(arbitraryData);
    },

    logLikelihood(failures, censored, p, alpha1, beta1, alpha2, beta2) {
      const x0 = Math.log(p / (1 - p));
      const x1 = Math.log(alpha1);
      const x2 = Math.log(beta1);
      const x3 = Math.log(alpha2);
      const x4 = Math.log(beta2);
      return -this.negLogLikelihoodLog(failures, censored)([x0, x1, x2, x3, x4]);
    }
  };

  // ─────────────────────────────────────────────
  // AICc, BIC 계산
  // Ref: Burnham & Anderson (2002), "Model Selection"
  // AICc = -2*LL + 2k + 2k(k+1)/(n-k-1)
  // ─────────────────────────────────────────────
  function computeAICc(ll, k, n) {
    const aic = -2 * ll + 2 * k;
    const corr = (n - k - 1) > 0 ? 2 * k * (k + 1) / (n - k - 1) : 0;
    return aic + corr;
  }

  function computeBIC(ll, k, n) {
    return -2 * ll + k * Math.log(n);
  }

  // Anderson-Darling 통계량 (경험적 근사)
  // Ref: Stephens (1974), JASA 69(347):730-737
  function computeAndersonDarling(failures, censored, cdfFn) {
    const allData = failures.slice().sort((a, b) => a - b);
    const n = allData.length;
    if (n < 2) return Infinity;
    let S = 0;
    for (let i = 0; i < n; i++) {
      const Fi = cdfFn(allData[i]);
      const Fc = Math.max(Math.min(Fi, 1 - 1e-10), 1e-10);
      const Fn = cdfFn(allData[n - 1 - i]);
      const Fcn = Math.max(Math.min(Fn, 1 - 1e-10), 1e-10);
      S += (2 * (i + 1) - 1) * (Math.log(Fc) + Math.log(1 - Fcn));
    }
    return -n - S / n;
  }

  // ─────────────────────────────────────────────
  // Beta 해석 메시지
  // Ref: agents.md Section 5-2
  // ─────────────────────────────────────────────
  function interpretBeta(beta) {
    if (beta < 0.9)  return { type: 'infant', message: '초기 고장 (Infant Mortality): β < 1, 고장률이 시간에 따라 감소합니다.' };
    if (beta <= 1.1) return { type: 'random', message: '우발 고장 (Random Failure): β ≈ 1, 고장률이 일정합니다 (지수분포와 유사).' };
    return { type: 'wearout', message: '마모 고장 (Wear-out Failure): β > 1, 고장률이 시간에 따라 증가합니다.' };
  }

  return {
    Weibull,
    Lognormal,
    Normal,
    Exponential,
    WeibullMixture,
    normalCDF,
    normalPPF,
    chi2CDF,
    gamma,
    computeAICc,
    computeBIC,
    computeAndersonDarling,
    interpretBeta
  };
})();
