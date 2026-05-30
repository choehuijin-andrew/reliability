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
     */
    forecast(dist, params, existingProduction, futureProductionMonthly, forecastMonths, unitCost, warrantyMonths = null, averageAge = null, cohortsData = null, seasonalIndices = null) {
        const monthly = [];
        let cumulativeFailures = 0;
        let cumulativeCost = 0;

        for (let month = 1; month <= forecastMonths; month++) {
            let monthlyFailures = 0;

            // 1) 기존 생산분의 추가 고장
            if (existingProduction > 0) {
                if (cohortsData && cohortsData.length > 0) {
                    const totalActualSurvived = cohortsData.reduce((sum, c) => sum + c.survived, 0);
                    const scale = totalActualSurvived > 0 ? (existingProduction / totalActualSurvived) : 1;

                    cohortsData.forEach(c => {
                        if (c.survived <= 0) return;
                        const T_i = c.age;
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

            // 2) 향후 생산분의 고장
            for (let k = 0; k < futureProductionMonthly.length; k++) {
                const prod = futureProductionMonthly[k];
                if (prod <= 0) continue;

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

            // 계절성 변동 보정 적용
            if (seasonalIndices && seasonalIndices.length === 12) {
                let maxJ = cohortsData && cohortsData.length > 0 ? Math.max(...cohortsData.map(c => c.age)) : 0;
                const j = maxJ + month;
                const monthIdx = (j - 1) % 12;
                const si = seasonalIndices[monthIdx] || 1.0;
                monthlyFailures = monthlyFailures * si;
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
    forecastWithCI(dist, fitObj, existingProduction, futureProductionMonthly, forecastMonths, unitCost, confidence = 0.90, warrantyMonths = null, averageAge = null, cohortsData = null, seasonalIndices = null) {
        const baseResult = this.forecast(dist, fitObj.params, existingProduction, futureProductionMonthly, forecastMonths, unitCost, warrantyMonths, averageAge, cohortsData, seasonalIndices);
        
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

            const res = this.forecast(dist, simParams, existingProduction, futureProductionMonthly, forecastMonths, unitCost, warrantyMonths, averageAge, cohortsData, seasonalIndices);
            
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
    },

    /**
     * Nevada 데이터를 기반으로 월별 계절성(Seasonality) 지수 산출
     * Ref: Meeker & Escobar (1998), Statistical Methods for Reliability Data, Ch.18
     * @param {number[]} salesByPeriod - 기간별 판매 수량
     * @param {number[][]} returnsMatrix - 고장 행렬 [코호트 x 서비스기간]
     * @returns {{ seasonalIndices: number[], mrrByMonth: number[], description: string }}
     */
    analyzeSeasonality(salesByPeriod, returnsMatrix) {
        const nCohorts = salesByPeriod.length;
        if (nCohorts < 3) {
            return {
                seasonalIndices: Array(12).fill(1.0),
                mrrByMonth: Array(12).fill(0),
                description: '데이터 기간이 너무 짧아 계절성 분석을 수행할 수 없습니다.'
            };
        }

        // 1. 실제 데이터가 존재하는 최대 반납 기수 maxJ 찾기
        let maxJ = -1;
        for (let i = 0; i < nCohorts; i++) {
            const returns = returnsMatrix[i] || [];
            for (let j = 0; j < returns.length; j++) {
                if (returns[j] !== null && returns[j] !== undefined && returns[j] !== '') {
                    if (j > maxJ) maxJ = j;
                }
            }
        }
        if (maxJ === -1) maxJ = nCohorts;

        // 2. 각 반납 기수 j (1~maxJ) 에 대한 Risk Set과 고장 수 계산
        const riskSet = Array(maxJ + 1).fill(0);
        const failures = Array(maxJ + 1).fill(0);

        for (let j = 1; j <= maxJ; j++) {
            let activeUnits = 0;
            let currentFailures = 0;

            for (let i = 0; i < j; i++) {
                const sales = salesByPeriod[i] || 0;
                if (sales <= 0) continue;

                // 생산월 i부터 j-1월까지 고장난 총 수량 계산
                let pastFailures = 0;
                const returns = returnsMatrix[i] || [];
                for (let k = i + 1; k < j; k++) {
                    pastFailures += returns[k] || 0;
                }

                // j기 반납 수량
                const jFailures = returns[j] || 0;
                
                // j기에 활성 상태였던 제품 수 = 판매량 - j-1월까지의 누적 고장
                const exposed = Math.max(0, sales - pastFailures);
                activeUnits += exposed;
                currentFailures += jFailures;
            }

            riskSet[j] = activeUnits;
            failures[j] = currentFailures;
        }

        // 3. 달력 월(1~12월)로 맵핑하여 평균 고장률 계산 (1기 출하 = 1월 가정)
        const monthlyFails = Array(12).fill(0);
        const monthlyRisk = Array(12).fill(0);

        for (let j = 1; j <= maxJ; j++) {
            const monthIdx = (j - 1) % 12; // 0 ~ 11
            monthlyFails[monthIdx] += failures[j];
            monthlyRisk[monthIdx] += riskSet[j];
        }

        const mrrByMonth = Array(12).fill(0);
        let totalRatesSum = 0;
        let validMonthsCount = 0;

        for (let m = 0; m < 12; m++) {
            if (monthlyRisk[m] > 0) {
                mrrByMonth[m] = monthlyFails[m] / monthlyRisk[m];
                totalRatesSum += mrrByMonth[m];
                validMonthsCount++;
            }
        }

        const overallAvgRate = validMonthsCount > 0 ? (totalRatesSum / validMonthsCount) : 0;
        const seasonalIndices = Array(12).fill(1.0);

        if (overallAvgRate > 0) {
            for (let m = 0; m < 12; m++) {
                if (monthlyRisk[m] > 0) {
                    const rawIndex = mrrByMonth[m] / overallAvgRate;
                    seasonalIndices[m] = Math.max(0.2, Math.min(3.0, rawIndex));
                }
            }
        }

        // 해석 텍스트 생성
        let maxVal = -1;
        let minVal = 999;
        let maxMonth = 1;
        let minMonth = 1;

        for (let m = 0; m < 12; m++) {
            if (seasonalIndices[m] > maxVal) {
                maxVal = seasonalIndices[m];
                maxMonth = m + 1;
            }
            if (seasonalIndices[m] < minVal && mrrByMonth[m] > 0) {
                minVal = seasonalIndices[m];
                minMonth = m + 1;
            }
        }

        let description = '';
        if (maxVal > 1.15) {
            const pct = Math.round((maxVal - 1) * 100);
            description = `분석 결과, 일부 계절적 변동이 관찰됩니다. 특히 <strong>${maxMonth}월</strong>의 고장률이 평균 대비 약 <strong>${pct}%</strong> 높게 나타납니다. 온도 변동성 또는 계절별 제품 가동률 급증 시점에 맞춘 자재 보관 및 예방 정비 검토가 요구됩니다.`;
        } else {
            description = `계절성 패턴이 뚜렷하지 않으며, 월별 고장률이 연간 평균 주위에서 안정적으로 분포합니다.`;
        }

        return {
            seasonalIndices: seasonalIndices.map(v => parseFloat(v.toFixed(3))),
            mrrByMonth: mrrByMonth.map(v => parseFloat((v * 100).toFixed(4))),
            description
        };
    },

    /**
     * Cohort(출하 배치)별 서비스 경과 기간에 따른 누적 고장율 계산 및 이상 감지
     * Ref: ReliaSoft Corporation, Warranty Prediction and Data Analysis
     * @param {number[]} salesByPeriod - 기간별 판매 수량
     * @param {number[][]} returnsMatrix - 고장 행렬
     * @returns {{ heatmapData: Array, maxServiceAge: number }}
     */
    generateBatchHeatmap(salesByPeriod, returnsMatrix) {
        const nCohorts = salesByPeriod.length;
        
        let maxJ = -1;
        for (let i = 0; i < nCohorts; i++) {
            const returns = returnsMatrix[i] || [];
            for (let j = 0; j < returns.length; j++) {
                if (returns[j] !== null && returns[j] !== undefined && returns[j] !== '') {
                    if (j > maxJ) maxJ = j;
                }
            }
        }
        if (maxJ === -1) maxJ = nCohorts;

        const maxServiceAge = maxJ;
        const heatmapData = [];

        for (let i = 0; i < nCohorts; i++) {
            const sales = salesByPeriod[i] || 0;
            const returns = returnsMatrix[i] || [];
            let cumFailures = 0;
            const cohortRates = [];

            const maxAgeForCohort = Math.max(0, maxJ - i);

            for (let age = 1; age <= maxServiceAge; age++) {
                if (age <= maxAgeForCohort) {
                    const colIndex = i + age;
                    cumFailures += returns[colIndex] || 0;
                    const rate = sales > 0 ? (cumFailures / sales) : 0;
                    cohortRates.push({
                        age,
                        rate: parseFloat((rate * 100).toFixed(4)),
                        failures: cumFailures,
                        isActive: true
                    });
                } else {
                    cohortRates.push({
                        age,
                        rate: null,
                        failures: null,
                        isActive: false
                    });
                }
            }

            heatmapData.push({
                cohortIndex: i,
                cohortName: `${i + 1}기 출하`,
                sales,
                rates: cohortRates
            });
        }

        // 서비스 기간(age)별 평균 및 표준편차 기반 이상 배치 감지
        for (let ageIdx = 0; ageIdx < maxServiceAge; ageIdx++) {
            const activeRates = [];
            for (let i = 0; i < nCohorts; i++) {
                const r = heatmapData[i].rates[ageIdx];
                if (r.isActive && r.rate !== null) {
                    activeRates.push(r.rate);
                }
            }

            if (activeRates.length >= 3) {
                const sum = activeRates.reduce((a, b) => a + b, 0);
                const mean = sum / activeRates.length;
                const sqDiffSum = activeRates.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
                const std = Math.sqrt(sqDiffSum / activeRates.length);

                const threshold = mean + 2 * std;

                for (let i = 0; i < nCohorts; i++) {
                    const r = heatmapData[i].rates[ageIdx];
                    if (r.isActive && r.rate !== null && r.rate > threshold && r.rate > 0.05 && std > 0) {
                        r.anomaly = true;
                    } else {
                        r.anomaly = false;
                    }
                }
            } else {
                for (let i = 0; i < nCohorts; i++) {
                    heatmapData[i].rates[ageIdx].anomaly = false;
                }
            }
        }

        return {
            heatmapData,
            maxServiceAge
        };
    },

    /**
     * 보증 기간 민감도 분석 (보증 기간별 예상 고장 및 비용 비교)
     * @param {string} dist - 분포명
     * @param {Object} params - 분포 파라미터
     * @param {number} existingProduction - 기존 생산량
     * @param {number[]} futureProductionMonthly - 향후 생산량
     * @param {number} forecastMonths - 예측 기간 (월)
     * @param {number} unitCost - 단위 비용
     * @param {number|null} averageAge - 기존 평균 연령
     * @param {Array} cohortsData - 코호트 데이터
     * @returns {Array<{period: number, totalFailures: number, totalCost: number}>}
     */
    analyzeWarrantySensitivity(dist, params, existingProduction, futureProductionMonthly, forecastMonths, unitCost, averageAge = null, cohortsData = null) {
        const periods = [6, 12, 18, 24, 36, 48];
        const results = [];

        periods.forEach(p => {
            const res = this.forecast(
                dist, 
                params, 
                existingProduction, 
                futureProductionMonthly, 
                forecastMonths, 
                unitCost, 
                p, 
                averageAge, 
                cohortsData
            );
            results.push({
                period: p,
                totalFailures: res.totalFailures,
                totalCost: res.totalCost
            });
        });

        return results;
    }
};
