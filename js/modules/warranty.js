/**
 * RE-Suite Static — Warranty 분석 모듈
 * Nevada 차트 전처리, 분포 적합, 예측 시뮬레이션
 * Ref: Meeker & Escobar (1998), Ch.18 — Warranty Data Analysis
 */
const WarrantyAnalysis = {

    // ═══════════════════════════════════════
    // 1. Nevada 차트 전처리
    // ═══════════════════════════════════════

    /**
     * Nevada 차트 → 고장 시간 + 우측 관측중단 추출
     * @param {number[]} salesByPeriod - 기간별 판매 수량 배열
     * @param {number[][]} returnsMatrix - 고장 행렬 [코호트 × 서비스기간]
     * @param {number|null} warrantyMonths - 보증 기간 (null이면 전체)
     * @returns {{ failures: number[], rightCensored: number[], summary: Object }}
     */
    preprocessNevada(salesByPeriod, returnsMatrix, warrantyMonths = null) {
        const failures = [];
        const rightCensored = [];
        let totalFailures = 0;
        let totalUnits = 0;

        const nCohorts = salesByPeriod.length;

        for (let i = 0; i < nCohorts; i++) {
            const sales = salesByPeriod[i];
            const returns = returnsMatrix[i] || [];
            totalUnits += sales;

            // 이 코호트의 최대 관측 기간
            const maxObs = warrantyMonths ? Math.min(returns.length, warrantyMonths) : returns.length;
            let cohortFailures = 0;

            // 각 서비스 기간(j+1)에 발생한 고장을 개별 고장 시간으로 변환
            for (let j = 0; j < maxObs; j++) {
                const count = returns[j] || 0;
                for (let k = 0; k < count; k++) {
                    // 기간 중앙점을 고장 시간으로 사용
                    // Ref: Meeker & Escobar (1998), Section 18.3.1
                    failures.push(j + 0.5);
                }
                cohortFailures += count;
            }

            // 나머지 생존 제품은 우측 관측중단
            const survived = Math.max(0, sales - cohortFailures);
            for (let k = 0; k < survived; k++) {
                rightCensored.push(maxObs);
            }
            totalFailures += cohortFailures;
        }

        const summary = {
            totalUnits,
            totalFailures,
            totalCensored: totalUnits - totalFailures,
            failureRatePct: totalUnits > 0 ? ((totalFailures / totalUnits) * 100) : 0,
            nCohorts,
            maxServicePeriod: Math.max(...returnsMatrix.map(r => r.length)),
        };

        return { failures, rightCensored, summary };
    },

    // ═══════════════════════════════════════
    // 2. 분포 적합 (MLE — ReliabilityAnalysis 재활용)
    // ═══════════════════════════════════════

    /**
     * Warranty 데이터에 여러 분포를 적합
     * @param {number[]} failures - 고장 시간 배열
     * @param {number[]} rightCensored - 관측중단 시간 배열
     * @returns {Array<{name: string, params: Object, aicc: number, mttf: number, b10: number, best: boolean}>}
     */
    fitDistributions(failures, rightCensored) {
        if (failures.length < 3) {
            return [{ name: 'Insufficient Data', displayName: 'Insufficient', params: {}, aicc: Infinity, mttf: 0, b10: 0, best: false }];
        }

        const D = Distributions;
        const nTotal = failures.length + rightCensored.length;
        const distSpecs = [
            { name: 'weibull', displayName: 'Weibull 2P', k: 2,
              fit: () => {
                const alphaInit = Math.exp(failures.reduce((s,t)=>s+Math.log(t),0)/failures.length);
                const negLL = D.Weibull.negLogLikelihoodLog(failures, rightCensored);
                const res = MathEngine.nelderMead(negLL, [Math.log(alphaInit), Math.log(1.5)]);
                const eta = Math.exp(res.x[0]), beta = Math.exp(res.x[1]);
                const ll = D.Weibull.logLikelihood(failures, rightCensored, eta, beta);
                return { params: { beta, eta }, ll, mttf: D.Weibull.mttf(eta, beta),
                         b10: eta * Math.pow(-Math.log(0.9), 1/beta) };
              }},
            { name: 'lognormal', displayName: 'Lognormal 2P', k: 2,
              fit: () => {
                const logTs = failures.map(t=>Math.log(t));
                const muI = logTs.reduce((s,v)=>s+v,0)/logTs.length;
                const sigI = Math.sqrt(logTs.reduce((s,v)=>s+(v-muI)**2,0)/logTs.length) || 0.5;
                const negLL = D.Lognormal.negLogLikelihoodLog(failures, rightCensored);
                const res = MathEngine.nelderMead(negLL, [muI, Math.log(sigI)]);
                const mu = res.x[0], sigma = Math.exp(res.x[1]);
                const ll = D.Lognormal.logLikelihood(failures, rightCensored, mu, sigma);
                return { params: { mu, sigma }, ll, mttf: Math.exp(mu + sigma*sigma/2),
                         b10: Math.exp(mu + sigma * jStat.normal.inv(0.10, 0, 1)) };
              }},
            { name: 'normal', displayName: 'Normal 2P', k: 2,
              fit: () => {
                const muI = failures.reduce((s,v)=>s+v,0)/failures.length;
                const sigI = Math.sqrt(failures.reduce((s,v)=>s+(v-muI)**2,0)/failures.length) || muI*0.3;
                const negLL = D.Normal.negLogLikelihoodLog(failures, rightCensored);
                const res = MathEngine.nelderMead(negLL, [muI, Math.log(sigI)]);
                const mean = res.x[0], std = Math.exp(res.x[1]);
                const ll = D.Normal.logLikelihood(failures, rightCensored, mean, std);
                return { params: { mean, std }, ll, mttf: mean,
                         b10: mean + std * jStat.normal.inv(0.10, 0, 1) };
              }},
            { name: 'exponential', displayName: 'Exponential 1P', k: 1,
              fit: () => {
                const totalT = [...failures, ...rightCensored].reduce((s,t)=>s+t,0);
                const lambda = failures.length > 0 ? failures.length / totalT : 0.01;
                const ll = D.Exponential.logLikelihood(failures, rightCensored, lambda);
                return { params: { lambda }, ll, mttf: 1/lambda,
                         b10: -Math.log(0.9) / lambda };
              }},
        ];

        const fits = [];
        for (const spec of distSpecs) {
            try {
                const result = spec.fit();
                if (result && isFinite(result.ll)) {
                    const aicc = D.computeAICc(result.ll, spec.k, nTotal);
                    fits.push({
                        name: spec.name,
                        displayName: spec.displayName,
                        params: result.params,
                        aicc,
                        mttf: result.mttf,
                        b10: result.b10,
                        best: false,
                    });
                }
            } catch (e) {
                console.warn(`Warranty: ${spec.name} fit failed:`, e.message);
            }
        }

        fits.sort((a, b) => a.aicc - b.aicc);
        if (fits.length > 0) fits[0].best = true;
        return fits;
    },

    // ═══════════════════════════════════════
    // 3. CDF 계산 (분포별)
    // ═══════════════════════════════════════

    /**
     * 분포의 F(t) 계산
     */
    cdf(dist, params, t) {
        if (t <= 0) return 0;
        if (dist === 'weibull') {
            return 1 - Math.exp(-Math.pow(t / params.eta, params.beta));
        } else if (dist === 'lognormal') {
            return jStat.normal.cdf((Math.log(t) - params.mu) / params.sigma, 0, 1);
        } else if (dist === 'normal') {
            return jStat.normal.cdf(t, params.mean, params.std);
        } else if (dist === 'exponential') {
            return 1 - Math.exp(-params.lambda * t);
        }
        return 0;
    },

    // ═══════════════════════════════════════
    // 4. 예측 시뮬레이션
    // ═══════════════════════════════════════

    /**
     * 월별 예상 고장 수 및 비용 예측
     * @param {string} dist - 분포명
     * @param {Object} params - 분포 파라미터
     * @param {number} existingProduction - 기존 생산 수량
     * @param {number[]} futureProductionMonthly - 향후 월별 생산 예정 수량
     * @param {number} forecastMonths - 예측 기간 (월)
     * @param {number} unitCost - 단위 고장 처리 비용
     * @param {number|null} warrantyMonths - 보증 기간 (null이면 무제한)
     * @returns {{ monthly: Array, totalFailures: number, totalCost: number }}
     */
    forecast(dist, params, existingProduction, futureProductionMonthly, forecastMonths, unitCost, warrantyMonths = null) {
        const monthly = [];
        let cumulativeFailures = 0;
        let cumulativeCost = 0;

        for (let month = 1; month <= forecastMonths; month++) {
            let monthlyFailures = 0;

            // 기존 생산분의 고장 (이미 서비스 중)
            // 기존 제품은 서비스 시작부터 month까지 경과
            if (existingProduction > 0) {
                const fNow = this.cdf(dist, params, month);
                const fPrev = this.cdf(dist, params, month - 1);
                let increment = fNow - fPrev;
                if (warrantyMonths && month > warrantyMonths) increment = 0;
                monthlyFailures += existingProduction * Math.max(0, increment);
            }

            // 향후 생산분의 고장
            for (let k = 0; k < futureProductionMonthly.length; k++) {
                const prod = futureProductionMonthly[k];
                if (prod <= 0) continue;

                // k번째 월에 출하된 제품의 서비스 경과 = month - k
                const serviceAge = month - k;
                if (serviceAge <= 0) continue;
                if (warrantyMonths && serviceAge > warrantyMonths) continue;

                const fNow = this.cdf(dist, params, serviceAge);
                const fPrev = this.cdf(dist, params, serviceAge - 1);
                monthlyFailures += prod * Math.max(0, fNow - fPrev);
            }

            const cost = monthlyFailures * unitCost;
            cumulativeFailures += monthlyFailures;
            cumulativeCost += cost;

            monthly.push({
                month,
                failures: parseFloat(monthlyFailures.toFixed(2)),
                cost: parseFloat(cost.toFixed(0)),
                cumulativeFailures: parseFloat(cumulativeFailures.toFixed(2)),
                cumulativeCost: parseFloat(cumulativeCost.toFixed(0)),
            });
        }

        return {
            monthly,
            totalFailures: parseFloat(cumulativeFailures.toFixed(1)),
            totalCost: parseFloat(cumulativeCost.toFixed(0)),
        };
    },

    // ═══════════════════════════════════════
    // 5. 텍스트 파싱 헬퍼
    // ═══════════════════════════════════════

    /**
     * 쉼표/공백/탭 구분 텍스트를 숫자 배열로 파싱
     */
    parseNumberLine(text) {
        return text.trim().split(/[\s,;\t]+/).map(Number).filter(n => !isNaN(n) && n >= 0);
    },

    /**
     * 여러 줄 텍스트를 2D 숫자 행렬로 파싱
     */
    parseMatrix(text) {
        return text.trim().split('\n')
            .filter(line => line.trim())
            .map(line => line.trim().split(/[\s,;\t]+/).map(v => {
                const n = Number(v);
                return isNaN(n) ? 0 : n;
            }));
    }
};
