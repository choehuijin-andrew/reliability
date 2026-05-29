/**
 * RE-Suite Static — 가속열화시험(ADT, Accelerated Degradation Testing) 분석 모듈
 *
 * [물리/통계학적 이론적 근거]
 * Ref: Meeker & Escobar (1998), Statistical Methods for Reliability Data, Ch.21 & Ch.22
 * Ref: Nelson (1990), Accelerated Testing, Ch.11
 *
 * 1단계 (열화 경로 적합):
 *   시료별로 시간에 따른 열화 거동 D(t) = a + b * t 를 적합하여 열화 속도 b (기울기)를 산출합니다.
 * 2단계 (가속 관계식 적합):
 *   스트레스 수준(온도 T in Celsius)에 따른 열화 속도 b의 가속 거동을 Arrhenius 모델로 적합합니다:
 *     b(T) = A * exp( -Ea / (k * T_K) )
 *     ln(|b|) = ln(A) - Ea / (k * T_K)
 *   여기서 k = 8.617333e-5 eV/K (볼츠만 상수), T_K = T_Celsius + 273.15
 *   선형 회귀 ln(|b|) = A' + B' * (1000 / T_K) 를 통해 활성화 에너지 Ea를 산출합니다.
 * 3단계 (사용 조건 외삽):
 *   사용 온도 T_use에서의 열화 속도 b_use를 산출하고, 각 시료가 임계치(Threshold)에
 *   도달하여 Pseudo Failure를 일으키는 가상 수명(Pseudo Lifetime)을 구합니다:
 *     t_pseudo = (Threshold - a) / b_use
 * 4단계 (사용 조건 수명 분포 적합):
 *   추정된 가상 수명들에 대해 Weibull 2P 및 Lognormal 분포를 적합하여 MTTF 및 B10 수명을 산출합니다.
 */

const ADTAnalysis = {
    /**
     * 텍스트 데이터 파싱
     * 형식: "시료ID, 스트레스값(온도), 시간, 열화량"
     */
    parseData(text) {
        const rows = text.trim().split('\n').filter(l => l.trim());
        const data = [];
        for (const row of rows) {
            const cols = row.split(/[,\t]+/).map(c => c.trim());
            if (cols.length >= 4) {
                const id = cols[0];
                const stress = parseFloat(cols[1]);
                const time = parseFloat(cols[2]);
                const value = parseFloat(cols[3]);
                if (!isNaN(stress) && !isNaN(time) && !isNaN(value)) {
                    data.push({ id, stress, time, value });
                }
            }
        }
        return data;
    },

    /**
     * ADT 전체 분석 파이프라인
     * @param {Array} data - [{id, stress, time, value}, ...]
     * @param {number} threshold - 고장 임계값
     * @param {string} direction - 'increasing' | 'decreasing'
     * @param {number} useTemp - 상온 사용 온도 (°C)
     * @param {string} pathModel - 'linear' | 'exponential'
     * @returns {Object}
     */
    analyze(data, threshold, direction = 'increasing', useTemp = 25, pathModel = 'linear') {
        if (!data || data.length === 0) {
            throw new Error('분석할 데이터가 존재하지 않습니다.');
        }

        const BOLTZMANN = 8.617333262145e-5; // eV/K

        // 1. 시료 단위별 데이터 그룹화
        const units = {};
        for (const d of data) {
            if (!units[d.id]) {
                units[d.id] = {
                    id: d.id,
                    stress: d.stress,
                    points: []
                };
            }
            units[d.id].points.push({ time: d.time, value: d.value });
        }

        const unitList = Object.values(units);
        if (unitList.length < 3) {
            throw new Error('가속열화 분석을 수행하려면 최소 3개 이상의 시료 데이터가 필요합니다.');
        }

        // 2. 각 시료별 열화 경로 적합 (1단계)
        const pathResults = [];
        const stressGroups = {}; // stress -> list of slope b

        for (const unit of unitList) {
            // 시간순 정렬
            unit.points.sort((a, b) => a.time - b.time);
            const nPoints = unit.points.length;
            if (nPoints < 2) continue; // 데이터 포인트가 부족한 시료 패스

            let a = 0, b = 0, r2 = 0;

            if (pathModel === 'exponential') {
                // Exponential: ln(Y) = a_prime + b * t  =>  Y = A * exp(b * t)
                const logPoints = unit.points.map(p => ({
                    time: p.time,
                    value: Math.log(Math.max(p.value, 1e-10))
                }));
                const regression = this.fitLinear(logPoints);
                if (regression) {
                    a = Math.exp(regression.intercept); // A = exp(a_prime)
                    b = regression.slope;
                    r2 = regression.r2;
                }
            } else {
                // Linear: Y = a + b * t
                const regression = this.fitLinear(unit.points);
                if (regression) {
                    a = regression.intercept;
                    b = regression.slope;
                    r2 = regression.r2;
                }
            }

            // 방향성 체크
            const isNormalDirection = (direction === 'increasing' && b > 0) || (direction === 'decreasing' && b < 0);
            if (!isNormalDirection) {
                // 비정상적인 열화 거동인 경우 제외하거나 경고
                continue;
            }

            pathResults.push({
                id: unit.id,
                stress: unit.stress,
                a,
                b,
                r2,
                points: unit.points
            });

            if (!stressGroups[unit.stress]) {
                stressGroups[unit.stress] = [];
            }
            stressGroups[unit.stress].push(Math.abs(b));
        }

        if (pathResults.length < 3) {
            throw new Error('정상적인 열화 방향성을 띠는 시료가 너무 부족합니다.');
        }

        // 3. 온도 조건(스트레스)별 평균 열화 속도 계산
        const stressLevels = Object.keys(stressGroups).map(Number).sort((a, b) => a - b);
        if (stressLevels.length < 2) {
            throw new Error('가속 Arrhenius 모형 적합을 수행하려면 최소 2개 수준 이상의 가속 스트레스(온도) 데이터가 필요합니다.');
        }

        const altPoints = []; // Arrhenius 적합용 데이터 점들: X = 1/T_K, Y = ln(|b|)
        const stressAverages = [];

        for (const stress of stressLevels) {
            const slopes = stressGroups[stress];
            // 기하평균 적용 (열화 속도는 로그 스케일로 분포하므로 기하평균이 적합)
            const sumLog = slopes.reduce((s, v) => s + Math.log(v), 0);
            const geoMeanSlope = Math.exp(sumLog / slopes.length);

            const TK = stress + 273.15;
            const invTK = 1 / TK;

            altPoints.push({
                x: invTK,
                y: Math.log(geoMeanSlope),
                stress: stress,
                slope: geoMeanSlope
            });

            stressAverages.push({
                stress,
                meanSlope: geoMeanSlope,
                nUnits: slopes.length
            });
        }

        // 4. 가속 모델 적합 (2단계: ln(|b|) = A_prime - (Ea / k) * (1/T_K))
        // Y = ln(|b|), X = 1/T_K => slope_regression = -Ea / k, intercept = ln(A)
        let Ea = 0.7; // 기본값
        let A = 1.0;
        let altR2 = 0;

        const altRegressionPoints = altPoints.map(pt => ({ time: pt.x, value: pt.y }));
        const altRegResult = this.fitLinear(altRegressionPoints);

        if (altRegResult) {
            const slopeCoef = altRegResult.slope; // -Ea / k
            A = Math.exp(altRegResult.intercept);
            Ea = -slopeCoef * BOLTZMANN; // Ea = -slope * k
            altR2 = altRegResult.r2;
        }

        // 5. 사용 조건(useTemp) 하에서의 예측 (3단계)
        const TK_use = useTemp + 273.15;
        const b_use = A * Math.exp(-Ea / (BOLTZMANN * TK_use)); // 사용 조건에서의 예상 열화 속도

        const pseudoLifetimes = [];
        const unitsWithLifetimes = [];

        for (const pr of pathResults) {
            // 사용 온도 조건 b_use 하에서 임계치까지 걸리는 시간 계산
            let tPseudo = Infinity;
            
            if (pathModel === 'exponential') {
                // Threshold = a * exp(b_use * t) => ln(Threshold/a) / b_use
                if (pr.a > 0 && threshold > 0) {
                    const ratio = threshold / pr.a;
                    if ((direction === 'increasing' && ratio > 1) || (direction === 'decreasing' && ratio < 1)) {
                        tPseudo = Math.log(ratio) / (direction === 'increasing' ? b_use : -b_use);
                    }
                }
            } else {
                // Linear: Threshold = a + b_use * t => (Threshold - a) / b_use
                // 개별 시료의 상대 편차(또는 열화 특성 비율) 반영을 위해 개별 b의 가속 비율을 가해줌
                // 개별 시료의 b가 전체 평균 b 대비 얼마나 다른지 비율 적용
                const stressAvgSlope = stressAverages.find(sa => sa.stress === pr.stress)?.meanSlope || b_use;
                const unitRatio = Math.abs(pr.b) / stressAvgSlope;
                const individualBUse = b_use * unitRatio * (direction === 'increasing' ? 1 : -1);

                tPseudo = (threshold - pr.a) / individualBUse;
            }

            if (isFinite(tPseudo) && tPseudo > 0) {
                pseudoLifetimes.push(tPseudo);
                unitsWithLifetimes.push({
                    id: pr.id,
                    stress: pr.stress,
                    a: pr.a,
                    b_est: pr.b,
                    b_use_individual: b_use * (Math.abs(pr.b) / (stressAverages.find(sa => sa.stress === pr.stress)?.meanSlope || b_use)) * (direction === 'increasing' ? 1 : -1),
                    tPseudo
                });
            }
        }

        // 6. 사용 조건 Pseudo Lifetimes 분포 적합 (4단계)
        let distResult = null;
        if (pseudoLifetimes.length >= 3) {
            try {
                // Weibull 2P 적합
                const logTimes = pseudoLifetimes.map(t => Math.log(t));
                const alphaInit = Math.exp(logTimes.reduce((s, v) => s + v, 0) / logTimes.length);
                const negLL = Distributions.Weibull.negLogLikelihoodLog(pseudoLifetimes, []);
                const res = MathEngine.nelderMead(negLL, [Math.log(alphaInit), Math.log(1.5)]);
                const eta = Math.exp(res.x[0]);
                const beta = Math.exp(res.x[1]);

                const mttf = Distributions.Weibull.mttf(eta, beta);
                const b10 = Distributions.Weibull.quantile(0.1, eta, beta);

                distResult = {
                    distribution: 'Weibull 2P',
                    eta,
                    beta,
                    mttf,
                    b10
                };
            } catch (err) {
                console.warn('ADT: Weibull fitting failed, using simple statistics.', err);
            }
        }

        const meanPseudo = pseudoLifetimes.length > 0 ? pseudoLifetimes.reduce((s, v) => s + v, 0) / pseudoLifetimes.length : null;

        return {
            pathResults,
            stressAverages,
            altPoints,
            Ea,
            A,
            altR2,
            useTemp,
            b_use,
            pseudoLifetimes,
            unitsWithLifetimes,
            distributionFit: distResult,
            meanPseudo,
            threshold,
            direction,
            pathModel
        };
    },

    /**
     * 단순 1차 선형 회귀 (X = time, Y = value)
     */
    fitLinear(points) {
        const n = points.length;
        if (n < 2) return null;

        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
        for (const p of points) {
            const x = p.time;
            const y = p.value;
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumXX += x * x;
            sumYY += y * y;
        }

        const denom = n * sumXX - sumX * sumX;
        if (Math.abs(denom) < 1e-15) return null;

        const slope = (n * sumXY - sumX * sumY) / denom;
        const intercept = (sumY - slope * sumX) / n;

        // R² 계산
        const ssTot = sumYY - (sumY * sumY) / n;
        const ssRes = points.reduce((s, p) => s + (p.value - (intercept + slope * p.time)) ** 2, 0);
        const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

        return { slope, intercept, r2 };
    }
};
