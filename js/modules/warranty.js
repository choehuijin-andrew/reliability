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
        const cohorts = [];
        let totalFailures = 0;
        let totalUnits = 0;
        let globalMaxService = 0;
 
        const nCohorts = salesByPeriod.length;
 
        // 전체 매트릭스에서 실제 데이터가 채워진 최우측 반납월(0-indexed 열 인덱스) 찾기
        let maxJ = -1;
        for (let i = 0; i < nCohorts; i++) {
            const returns = returnsMatrix[i] || [];
            for (let j = 0; j < returns.length; j++) {
                if (returns[j] !== null && returns[j] !== undefined && returns[j] !== '') {
                    if (j > maxJ) {
                        maxJ = j;
                    }
                }
            }
        }
 
        // 만약 데이터가 전혀 없다면 기본적으로 nCohorts로 세팅
        if (maxJ === -1) {
            maxJ = nCohorts;
        }
 
        for (let i = 0; i < nCohorts; i++) {
            const sales = salesByPeriod[i];
            const returns = returnsMatrix[i] || [];
            totalUnits += sales;
 
            // 달력 기준 최대 가동 월 = maxJ - i (생산월 이후의 가동 개월)
            let maxObs = Math.max(0, maxJ - i);
            if (warrantyMonths) {
                maxObs = Math.min(maxObs, warrantyMonths);
            }
 
            if (maxObs > globalMaxService) {
                globalMaxService = maxObs;
            }
 
            let cohortFailures = 0;
 
            // j는 반납월 열 인덱스 (0-indexed). 생산월 index i에 대해, j > i인 셀이 유효한 반납이다.
            for (let j = i + 1; j <= maxJ; j++) {
                const count = returns[j] || 0;
                // 서비스 경과 개월 수 = j - i
                const serviceAge = j - i;
                
                // 만약 보증기간 필터가 켜져있다면 보증기간 이내의 고장만 계상
                if (warrantyMonths && serviceAge > warrantyMonths) {
                    continue;
                }
 
                for (let k = 0; k < count; k++) {
                    failures.push(serviceAge - 0.5);
                }
                cohortFailures += count;
            }
 
            // 나머지 생존 제품은 우측 관측중단
            const survived = Math.max(0, sales - cohortFailures);
            for (let k = 0; k < survived; k++) {
                rightCensored.push(maxObs);
            }
            
            // 각 Cohort별 생존 정보 저장
            cohorts.push({
                cohortIndex: i,
                survived: survived,
                age: maxObs
            });

            totalFailures += cohortFailures;
        }
 
        const summary = {
            totalUnits,
            totalFailures,
            totalCensored: totalUnits - totalFailures,
            failureRatePct: totalUnits > 0 ? ((totalFailures / totalUnits) * 100) : 0,
            nCohorts,
            maxServicePeriod: globalMaxService,
        };
 
        return { failures, rightCensored, cohorts, summary };
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

        const dataRows = [];
        failures.forEach(t => dataRows.push({ time: t, event: 'F' }));
        rightCensored.forEach(t => dataRows.push({ time: t, event: 'C' }));

        const distSpecs = [
            { name: 'weibull', displayName: 'Weibull 2P' },
            { name: 'lognormal', displayName: 'Lognormal 2P' },
            { name: 'normal', displayName: 'Normal 2P' },
            { name: 'exponential', displayName: 'Exponential 1P' }
        ];

        const fits = [];
        for (const spec of distSpecs) {
            try {
                // ReliabilityAnalysis.analyze()를 호출하여 일관된 MLE 적합 및 신뢰구간 분석 결과 획득
                const res = ReliabilityAnalysis.analyze(dataRows, { distribution: spec.name, confidence: 0.90 });
                if (res && res.params) {
                    const mttf = res.mttf;
                    const b10 = res.bxLife?.B10?.estimate ?? null;

                    // 선택된 분포의 AICc를 comparison 배열에서 찾기
                    const ownComp = res.comparison?.find(c => c.dist === spec.name);
                    const aicc = ownComp?.aic_c ?? Infinity;

                    // 파라미터 키를 모듈 내 통일을 위해 보정
                    let paramsMapped = {};
                    if (spec.name === 'weibull') {
                        paramsMapped = { beta: res.params.beta, eta: res.params.alpha };
                    } else if (spec.name === 'lognormal') {
                        paramsMapped = { mu: res.params.mu, sigma: res.params.sigma };
                    } else if (spec.name === 'normal') {
                        paramsMapped = { mean: res.params.mu, std: res.params.sigma };
                    } else if (spec.name === 'exponential') {
                        paramsMapped = { lambda: res.params.lambda };
                    }

                    fits.push({
                        name: spec.name,
                        displayName: spec.displayName,
                        params: paramsMapped,
                        aicc,
                        mttf,
                        b10,
                        best: false,
                        analysisResult: res
                    });
                }
            } catch (e) {
                console.warn(`Warranty fitDistributions error for ${spec.name}:`, e.message);
            }
        }

        if (fits.length === 0) {
            return [{ name: 'Insufficient Data', displayName: 'Insufficient', params: {}, aicc: Infinity, mttf: 0, b10: 0, best: false }];
        }

        fits.sort((a, b) => a.aicc - b.aicc);
        fits[0].best = true;
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
     * 월별 예상 고장 수 및 비용 예측 (조건부 고장 확률 적용)
     * @param {string} dist - 분포명
     * @param {Object} params - 분포 파라미터
     * @param {number} existingProduction - 기존 생산 수량
     * @param {number[]} futureProductionMonthly - 향후 월별 생산 예정 수량
     * @param {number} forecastMonths - 예측 기간 (월)
     * @param {number} unitCost - 단위 고장 처리 비용
     * @param {number|null} warrantyMonths - 보증 기간 (null이면 무제한)
     * @param {number|null} averageAge - 기존 제품의 평균 서비스 연령
     * @returns {{ monthly: Array, totalFailures: number, totalCost: number, peakMonth: number, avgFailures: number }}
     */
    forecast(dist, params, existingProduction, futureProductionMonthly, forecastMonths, unitCost, warrantyMonths = null, averageAge = null, cohortsData = null) {
        const monthly = [];
        let cumulativeFailures = 0;
        let cumulativeCost = 0;

        for (let month = 1; month <= forecastMonths; month++) {
            let monthlyFailures = 0;

            // 1) 기존 생산분의 추가 고장 (Cohort 정보가 있으면 Cohort별 정밀 계산, 없으면 averageAge 기반 계산)
            if (existingProduction > 0) {
                if (cohortsData && cohortsData.length > 0) {
                    // 실제 Nevada 데이터를 기반으로 한 Cohort별 정밀 계산
                    // 사용자가 화면에서 입력한 '기존 설치 베이스 수량' (existingProduction)이 
                    // 실제 Nevada 데이터의 총 생존 수량과 다를 수 있으므로, 비례하여 스케일링합니다.
                    const totalActualSurvived = cohortsData.reduce((sum, c) => sum + c.survived, 0);
                    const scale = totalActualSurvived > 0 ? (existingProduction / totalActualSurvived) : 1;

                    cohortsData.forEach(c => {
                        if (c.survived <= 0) return;
                        const T_i = c.age; // 이 Cohort의 현재 가동 개월 수
                        const rT_i = Math.max(0.0001, 1 - this.cdf(dist, params, T_i));
                        const scaledSurvived = c.survived * scale;

                        const ageNow = T_i + month;
                        const agePrev = T_i + month - 1;

                        let increment = 0;
                        if (!warrantyMonths || ageNow <= warrantyMonths) {
                            const fNow = this.cdf(dist, params, ageNow);
                            const fPrev = this.cdf(dist, params, agePrev);
                            increment = (fNow - fPrev) / rT_i;
                        } else if (agePrev < warrantyMonths) {
                            const fNow = this.cdf(dist, params, warrantyMonths);
                            const fPrev = this.cdf(dist, params, agePrev);
                            increment = (fNow - fPrev) / rT_i;
                        }
                        monthlyFailures += scaledSurvived * Math.max(0, increment);
                    });
                } else {
                    // Fallback: Cohort 정보가 없는 경우 기존 평균 연령(T) 기반 계산
                    const T = (averageAge !== null && averageAge > 0) ? averageAge : 6.0;
                    const rT = Math.max(0.0001, 1 - this.cdf(dist, params, T));
                    const ageNow = T + month;
                    const agePrev = T + month - 1;

                    let increment = 0;
                    if (!warrantyMonths || ageNow <= warrantyMonths) {
                        const fNow = this.cdf(dist, params, ageNow);
                        const fPrev = this.cdf(dist, params, agePrev);
                        increment = (fNow - fPrev) / rT;
                    } else if (agePrev < warrantyMonths) {
                        const fNow = this.cdf(dist, params, warrantyMonths);
                        const fPrev = this.cdf(dist, params, agePrev);
                        increment = (fNow - fPrev) / rT;
                    }
                    monthlyFailures += existingProduction * Math.max(0, increment);
                }
            }

            // 2) 향후 생산분의 고장 (시간 0부터 시작)
            for (let k = 0; k < futureProductionMonthly.length; k++) {
                const prod = futureProductionMonthly[k];
                if (prod <= 0) continue;

                // k번째 월에 출하된 제품의 서비스 경과 = month - k
                const serviceAge = month - k;
                if (serviceAge <= 0) continue;

                let increment = 0;
                if (!warrantyMonths || serviceAge <= warrantyMonths) {
                    const fNow = this.cdf(dist, params, serviceAge);
                    const fPrev = this.cdf(dist, params, serviceAge - 1);
                    increment = fNow - fPrev;
                } else if (serviceAge - 1 < warrantyMonths) {
                    const fNow = this.cdf(dist, params, warrantyMonths);
                    const fPrev = this.cdf(dist, params, serviceAge - 1);
                    increment = fNow - fPrev;
                }

                monthlyFailures += prod * Math.max(0, increment);
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

        // Peak Month 및 월평균 계산
        let peakFailures = -1;
        let peakMonth = 1;
        monthly.forEach(m => {
            if (m.failures > peakFailures) {
                peakFailures = m.failures;
                peakMonth = m.month;
            }
        });
        const avgFailures = cumulativeFailures / forecastMonths;

        return {
            monthly,
            totalFailures: parseFloat(cumulativeFailures.toFixed(1)),
            totalCost: parseFloat(cumulativeCost.toFixed(0)),
            peakMonth,
            avgFailures: parseFloat(avgFailures.toFixed(1))
        };
    },

    /**
     * Monte Carlo 모수 시뮬레이션을 동반한 월별 고장 예측 및 신뢰구간 밴드 산출
     */
    forecastWithCI(dist, fitObj, existingProduction, futureProductionMonthly, forecastMonths, unitCost, confidence = 0.90, warrantyMonths = null, averageAge = null, cohortsData = null) {
        const baseResult = this.forecast(dist, fitObj.params, existingProduction, futureProductionMonthly, forecastMonths, unitCost, warrantyMonths, averageAge, cohortsData);
        
        const nSims = 1000;
        const simData = Array.from({ length: forecastMonths }, () => ({
            failuresList: [],
            costList: [],
            cumFailuresList: [],
            cumCostList: []
        }));

        const rawRes = fitObj.analysisResult;
        let cov = rawRes?.fisherCI?.covMatrix;
        
        let hasCov = cov && cov.length === 2 && cov[0].length === 2 && isFinite(cov[0][0]) && isFinite(cov[1][1]);
        
        const randNorm = () => {
            let u = 0, v = 0;
            while(u === 0) u = Math.random(); 
            while(v === 0) v = Math.random();
            return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        };

        let L = [[0, 0], [0, 0]];
        if (hasCov) {
            try {
                const v11 = cov[0][0];
                const v12 = cov[0][1];
                const v22 = cov[1][1];
                
                if (v11 > 0) {
                    L[0][0] = Math.sqrt(v11);
                    L[1][0] = v12 / L[0][0];
                    const v22_adj = v22 - L[1][0] * L[1][0];
                    L[1][1] = v22_adj > 0 ? Math.sqrt(v22_adj) : 0;
                } else {
                    hasCov = false;
                }
            } catch (e) {
                hasCov = false;
            }
        }
        
        for (let sim = 0; sim < nSims; sim++) {
            let simParams = {};
            
            if (dist === 'weibull' && hasCov) {
                const lnEta = Math.log(fitObj.params.eta);
                const lnBeta = Math.log(fitObj.params.beta);
                
                const z1 = randNorm();
                const z2 = randNorm();
                
                const simLnEta = lnEta + L[0][0] * z1;
                const simLnBeta = lnBeta + L[1][0] * z1 + L[1][1] * z2;
                
                simParams = {
                    eta: Math.exp(simLnEta),
                    beta: Math.max(0.1, Math.exp(simLnBeta))
                };
            } else if (dist === 'lognormal' && hasCov) {
                const mu = fitObj.params.mu;
                const lnSigma = Math.log(fitObj.params.sigma);
                
                const z1 = randNorm();
                const z2 = randNorm();
                
                const simMu = mu + L[0][0] * z1;
                const simLnSigma = lnSigma + L[1][0] * z1 + L[1][1] * z2;
                
                simParams = {
                    mu: simMu,
                    sigma: Math.max(0.01, Math.exp(simLnSigma))
                };
            } else if (dist === 'normal' && hasCov) {
                const mean = fitObj.params.mean;
                const lnStd = Math.log(fitObj.params.std);
                
                const z1 = randNorm();
                const z2 = randNorm();
                
                const simMean = mean + L[0][0] * z1;
                const simLnStd = lnStd + L[1][0] * z1 + L[1][1] * z2;
                
                simParams = {
                    mean: simMean,
                    std: Math.max(0.01, Math.exp(simLnStd))
                };
            } else if (dist === 'exponential') {
                const lambda = fitObj.params.lambda;
                const se = rawRes?.fisherCI?.seParams?.[0] || (lambda * 0.05);
                const z = randNorm();
                simParams = {
                    lambda: Math.max(1e-6, lambda + se * z)
                };
            } else {
                if (dist === 'weibull') {
                    simParams = {
                        eta: fitObj.params.eta * (1 + randNorm() * 0.05),
                        beta: Math.max(0.1, fitObj.params.beta * (1 + randNorm() * 0.05))
                    };
                } else if (dist === 'lognormal') {
                    simParams = {
                        mu: fitObj.params.mu * (1 + randNorm() * 0.05),
                        sigma: Math.max(0.01, fitObj.params.sigma * (1 + randNorm() * 0.05))
                    };
                } else if (dist === 'normal') {
                    simParams = {
                        mean: fitObj.params.mean * (1 + randNorm() * 0.05),
                        std: Math.max(0.01, fitObj.params.std * (1 + randNorm() * 0.05))
                    };
                } else {
                    simParams = Object.assign({}, fitObj.params);
                }
            }

            const res = this.forecast(dist, simParams, existingProduction, futureProductionMonthly, forecastMonths, unitCost, warrantyMonths, averageAge, cohortsData);
            
            for (let m = 0; m < forecastMonths; m++) {
                const monthRes = res.monthly[m];
                if (monthRes) {
                    simData[m].failuresList.push(monthRes.failures);
                    simData[m].costList.push(monthRes.cost);
                    simData[m].cumFailuresList.push(monthRes.cumulativeFailures);
                    simData[m].cumCostList.push(monthRes.cumulativeCost);
                }
            }
        }

        const getPercentile = (arr, p) => {
            const sorted = arr.slice().sort((a, b) => a - b);
            const idx = Math.floor(p * (sorted.length - 1));
            return sorted[idx];
        };

        const alpha = (1 - confidence) / 2;

        const enrichedMonthly = baseResult.monthly.map((bm, idx) => {
            const sd = simData[idx];
            
            const failLow = getPercentile(sd.failuresList, alpha);
            const failHigh = getPercentile(sd.failuresList, 1 - alpha);
            
            const costLow = getPercentile(sd.costList, alpha);
            const costHigh = getPercentile(sd.costList, 1 - alpha);
            
            const cumFailLow = getPercentile(sd.cumFailuresList, alpha);
            const cumFailHigh = getPercentile(sd.cumFailuresList, 1 - alpha);
            
            const cumCostLow = getPercentile(sd.cumCostList, alpha);
            const cumCostHigh = getPercentile(sd.cumCostList, 1 - alpha);

            return Object.assign({}, bm, {
                failures_CI: [parseFloat(failLow.toFixed(2)), parseFloat(failHigh.toFixed(2))],
                cost_CI: [parseFloat(costLow.toFixed(0)), parseFloat(costHigh.toFixed(0))],
                cumulativeFailures_CI: [parseFloat(cumFailLow.toFixed(2)), parseFloat(cumFailHigh.toFixed(2))],
                cumulativeCost_CI: [parseFloat(cumCostLow.toFixed(0)), parseFloat(cumCostHigh.toFixed(0))]
            });
        });

        const totalFailuresSim = simData[forecastMonths - 1].cumFailuresList;
        const totalCostSim = simData[forecastMonths - 1].cumCostList;

        return {
            monthly: enrichedMonthly,
            totalFailures: baseResult.totalFailures,
            totalFailures_CI: [
                parseFloat(getPercentile(totalFailuresSim, alpha).toFixed(1)),
                parseFloat(getPercentile(totalFailuresSim, 1 - alpha).toFixed(1))
            ],
            totalCost: baseResult.totalCost,
            totalCost_CI: [
                parseFloat(getPercentile(totalCostSim, alpha).toFixed(0)),
                parseFloat(getPercentile(totalCostSim, 1 - alpha).toFixed(0))
            ],
            peakMonth: baseResult.peakMonth,
            avgFailures: baseResult.avgFailures
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
