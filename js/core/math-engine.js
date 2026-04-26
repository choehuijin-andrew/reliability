/**
 * math-engine.js — 수치 최적화 엔진
 * RE-Suite Static Web App
 *
 * Ref: Nelder & Mead (1965), "A Simplex Method for Function Minimization", CompJ 7(4):308-313
 * Ref: Brent (1973), "Algorithms for Minimization without Derivatives", Prentice-Hall
 * Ref: Nocedal & Wright (2006), "Numerical Optimization", Springer, Ch.8
 */

const MathEngine = (() => {

  // ─────────────────────────────────────────────
  // Nelder-Mead Simplex (다차원 최소화)
  // Ref: Nelder & Mead (1965)
  // minimize(f, x0, options) → { x, fval, iterations }
  // ─────────────────────────────────────────────
  function nelderMead(f, x0, options = {}) {
    const maxIter  = options.maxIter  || 10000;
    const tolFun   = options.tolFun   || 1e-10;
    const tolX     = options.tolX     || 1e-10;
    const alpha    = options.alpha    || 1.0;   // 반사 계수
    const gamma    = options.gamma    || 2.0;   // 확장 계수
    const rho_coef = options.rho     || 0.5;   // 수축 계수
    const sigma    = options.sigma    || 0.5;   // 축소 계수

    const n = x0.length;
    // 초기 심플렉스 생성
    let simplex = [];
    simplex.push(x0.slice());
    for (let i = 0; i < n; i++) {
      const x = x0.slice();
      x[i] = x[i] !== 0 ? x[i] * 1.05 : 0.00025;
      simplex.push(x);
    }

    let fval = simplex.map(x => f(x));
    let iter = 0;

    while (iter < maxIter) {
      // 정렬 (오름차순)
      const idx = fval.map((v, i) => i).sort((a, b) => fval[a] - fval[b]);
      simplex = idx.map(i => simplex[i]);
      fval    = idx.map(i => fval[i]);

      // 종료 조건 체크
      const fRange = Math.abs(fval[n] - fval[0]);
      if (fRange < tolFun) break;

      let xRange = 0;
      for (let i = 1; i <= n; i++) {
        for (let j = 0; j < n; j++) {
          xRange = Math.max(xRange, Math.abs(simplex[i][j] - simplex[0][j]));
        }
      }
      if (xRange < tolX) break;

      // 무게중심 (최악 점 제외)
      const centroid = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          centroid[j] += simplex[i][j] / n;
        }
      }

      const xWorst = simplex[n];
      const fWorst = fval[n];
      const fBest  = fval[0];
      const fSecondWorst = fval[n - 1];

      // 반사
      const xRef = centroid.map((c, j) => c + alpha * (c - xWorst[j]));
      const fRef = f(xRef);

      if (fRef < fBest) {
        // 확장
        const xExp = centroid.map((c, j) => c + gamma * (xRef[j] - c));
        const fExp = f(xExp);
        if (fExp < fRef) {
          simplex[n] = xExp;
          fval[n]    = fExp;
        } else {
          simplex[n] = xRef;
          fval[n]    = fRef;
        }
      } else if (fRef < fSecondWorst) {
        simplex[n] = xRef;
        fval[n]    = fRef;
      } else {
        // 수축
        if (fRef < fWorst) {
          // 외부 수축
          const xCon = centroid.map((c, j) => c + rho_coef * (xRef[j] - c));
          const fCon = f(xCon);
          if (fCon <= fRef) {
            simplex[n] = xCon;
            fval[n]    = fCon;
          } else {
            // 축소 (shrink)
            for (let i = 1; i <= n; i++) {
              simplex[i] = simplex[0].map((b, j) => b + sigma * (simplex[i][j] - b));
              fval[i]    = f(simplex[i]);
            }
          }
        } else {
          // 내부 수축
          const xCon = centroid.map((c, j) => c + rho_coef * (xWorst[j] - c));
          const fCon = f(xCon);
          if (fCon < fWorst) {
            simplex[n] = xCon;
            fval[n]    = fCon;
          } else {
            // 축소 (shrink)
            for (let i = 1; i <= n; i++) {
              simplex[i] = simplex[0].map((b, j) => b + sigma * (simplex[i][j] - b));
              fval[i]    = f(simplex[i]);
            }
          }
        }
      }

      iter++;
    }

    return { x: simplex[0], fval: fval[0], iterations: iter };
  }

  // ─────────────────────────────────────────────
  // Brent's Method (단변수 근 탐색)
  // Ref: Brent (1973)
  // brentq(f, a, b, tol, maxIter) → root
  // ─────────────────────────────────────────────
  function brentq(f, a, b, tol = 1e-10, maxIter = 500) {
    let fa = f(a);
    let fb = f(b);
    if (fa * fb > 0) return null; // 근이 없음

    let c = a, fc = fa, d = 0, e = 0;
    if (Math.abs(fc) < Math.abs(fb)) {
      [a, b, c] = [b, c, a];
      [fa, fb, fc] = [fb, fc, fa];
    }

    for (let i = 0; i < maxIter; i++) {
      if (Math.abs(b - a) < tol || fb === 0) return b;

      let s;
      if (fa !== fc && fb !== fc) {
        // 역 이차 보간
        s = a * fb * fc / ((fa - fb) * (fa - fc))
          + b * fa * fc / ((fb - fa) * (fb - fc))
          + c * fa * fb / ((fc - fa) * (fc - fb));
      } else {
        // 할선법
        s = b - fb * (b - a) / (fb - fa);
      }

      const cond1 = (s < (3 * a + b) / 4 || s > b);
      const cond2 = (Math.abs(s - b) >= Math.abs(b - c) / 2);
      const cond3 = (Math.abs(b - c) < tol);

      if (cond1 || cond2 || cond3) {
        // 이분법
        s = (a + b) / 2;
      }

      const fs = f(s);
      d = c; e = b;
      c = b; fc = fb;

      if (fa * fs < 0) { b = s; fb = fs; }
      else             { a = s; fa = fs; }

      if (Math.abs(fa) < Math.abs(fb)) {
        [a, b] = [b, a];
        [fa, fb] = [fb, fa];
      }
    }
    return b;
  }

  // ─────────────────────────────────────────────
  // 수치 Hessian (2차 편미분 근사)
  // Ref: Nocedal & Wright (2006), Ch.8
  // hessian(f, x, eps) → H[n×n] (1D array, row-major)
  // ─────────────────────────────────────────────
  function numericalHessian(f, x, eps = 1e-5) {
    const n = x.length;
    const H = Array.from({ length: n }, () => new Array(n).fill(0));
    const f0 = f(x);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const p_ij = x.slice();
        p_ij[i] += eps;
        p_ij[j] += eps;
        const f_ij = f(p_ij);

        const p_i = x.slice();
        p_i[i] += eps;
        const f_i = f(p_i);

        const p_j = x.slice();
        p_j[j] += eps;
        const f_j = f(p_j);

        H[i][j] = (f_ij - f_i - f_j + f0) / (eps * eps);
      }
    }
    return H;
  }

  // ─────────────────────────────────────────────
  // 2×2 행렬 역행렬
  // ─────────────────────────────────────────────
  function inv2x2(H) {
    const det = H[0][0] * H[1][1] - H[0][1] * H[1][0];
    if (Math.abs(det) < 1e-20) return null;
    return [
      [ H[1][1] / det, -H[0][1] / det],
      [-H[1][0] / det,  H[0][0] / det]
    ];
  }

  // ─────────────────────────────────────────────
  // Cholesky 분해 (2×2)
  // ─────────────────────────────────────────────
  function cholesky2x2(A) {
    // A = L @ L^T
    // L = [[l00, 0], [l10, l11]]
    const l00 = Math.sqrt(Math.max(A[0][0], 0));
    if (l00 === 0) return [[1, 0], [0, 1]];
    const l10 = A[1][0] / l00;
    const l11sq = A[1][1] - l10 * l10;
    const l11 = Math.sqrt(Math.max(l11sq, 0));
    return [[l00, 0], [l10, l11 || 0.01]];
  }

  // 행렬-벡터 곱 (2×2 @ 2)
  function matVec2(M, v) {
    return [
      M[0][0] * v[0] + M[0][1] * v[1],
      M[1][0] * v[0] + M[1][1] * v[1]
    ];
  }

  return {
    nelderMead,
    brentq,
    numericalHessian,
    inv2x2,
    cholesky2x2,
    matVec2
  };
})();
