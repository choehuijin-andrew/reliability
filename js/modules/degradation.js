/**
 * RE-Suite Static — 열화 분석 모듈 (Degradation Analysis)
 *
 * 일반 열화 경로(General Degradation Path) 모델:
 *   D(t) = a + b * g(t)
 *   여기서 g(t) = t^p (power), ln(t) (log), exp(ct) (exponential), sqrt(t)
 *
 * Ref: Meeker & Escobar (1998), Ch.21 "Degradation Data, Models, and Data Analysis"
 * Ref: Nelson (1990), "Accelerated Testing", Ch.11
 *
 * 기능:
 *   1) 열화 데이터 입력 (시간, 측정값, 시료 ID)
 *   2) 시료별 열화 경로 플롯
 *   3) 선형/제곱근/거듭제곱/로그 회귀 모델 적합
 *   4) 임계값(threshold) 도달 시간 예측 = 추정 수명
 *   5) 추정 수명 분포 (Weibull/Lognormal) 적합
 *   6) 실시간 파라미터 조정
 */

const DegradationAnalysis = {

    /**
     * 텍스트 데이터 파싱
     * 형식: "시료ID, 시간, 측정값" (쉼표 또는 탭 구분, 행별)
     */
    parseData(text) {
        const rows = text.trim().split('\n').filter(l => l.trim());
        const data = [];
        for (const row of rows) {
            const cols = row.split(/[,\t]+/).map(c => c.trim());
            if (cols.length >= 3) {
                const id = cols[0];
                const time = parseFloat(cols[1]);
                const value = parseFloat(cols[2]);
                if (!isNaN(time) && !isNaN(value)) {
                    data.push({ id, time, value });
                }
            }
        }
        return data;
    },

    /**
     * 시료 ID별로 데이터 그룹화
     */
    groupByUnit(data) {
        const groups = {};
        for (const d of data) {
            if (!groups[d.id]) groups[d.id] = [];
            groups[d.id].push({ time: d.time, value: d.value });
        }
        // 시간순 정렬
        for (const id in groups) {
            groups[id].sort((a, b) => a.time - b.time);
        }
        return groups;
    },

    /**
     * 변환 함수 정의
     * Ref: Meeker & Escobar (1998), Section 21.3
     */
    transforms: {
        linear: { fn: t => t, invY: y => y },
        sqrt:   { fn: t => Math.sqrt(Math.max(t, 0)), invY: y => y },
        log:    { fn: t => Math.log(Math.max(t, 1e-10)), invY: y => y },
        power:  { fn: (t, p) => Math.pow(Math.max(t, 1e-10), p), invY: y => y },
        exponential: { fn: t => t, transformY: y => Math.log(Math.max(y, 1e-10)), invY: Y => Math.exp(Y) },
        lloyd:  { fn: t => 1 / Math.max(t, 1e-10), invY: y => y },
        gompertz: { fn: (t, c) => Math.pow(c, t), transformY: y => Math.log(Math.max(y, 1e-10)), invY: Y => Math.exp(Y) }
    },

    /**
     * 선형 회귀 적합 (Y = a + b*X)
     * 필요시 X, Y 변환 적용
     */
    fitLinearRegression(points, transformX = t => t, transformY = y => y, invTransformY = Y => Y) {
        const n = points.length;
        if (n < 2) return null;

        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        let sumOrigY = 0;

        for (const p of points) {
            const x = transformX(p.time);
            const y = transformY(p.value);
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumXX += x * x;
            sumOrigY += p.value;
        }
        const denom = n * sumXX - sumX * sumX;
        if (Math.abs(denom) < 1e-15) return null;

        const b = (n * sumXY - sumX * sumY) / denom;
        const a = (sumY - b * sumX) / n;
        
        // R² 계산 (원래 Y 공간 기준)
        const meanOrigY = sumOrigY / n;
        const ssTot = points.reduce((s, p) => s + (p.value - meanOrigY) ** 2, 0);
        const ssRes = points.reduce((s, p) => {
            const predY = invTransformY(a + b * transformX(p.time));
            return s + (p.value - predY) ** 2;
        }, 0);
        
        const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

        return { a, b, r2 };
    },

    /**
     * 거듭제곱 모델에서 최적 p 탐색 (grid search + refine)
     * D(t) = a + b·t^p
     */
    fitPowerModel(points) {
        if (points.length < 2) return null;
        let bestR2 = -Infinity, bestP = 1, bestFit = null;

        for (let p = 0.1; p <= 5.0; p += 0.1) {
            const fn = t => Math.pow(Math.max(t, 1e-10), p);
            const fit = this.fitLinearRegression(points, fn, y => y, y => y);
            if (fit && fit.r2 > bestR2) { bestR2 = fit.r2; bestP = p; bestFit = { ...fit, p }; }
        }

        for (let p = bestP - 0.1; p <= bestP + 0.1; p += 0.01) {
            if (p <= 0) continue;
            const fn = t => Math.pow(Math.max(t, 1e-10), p);
            const fit = this.fitLinearRegression(points, fn, y => y, y => y);
            if (fit && fit.r2 > bestR2) { bestR2 = fit.r2; bestP = p; bestFit = { ...fit, p }; }
        }
        return bestFit;
    },

    /**
     * Gompertz 모델에서 최적 c 탐색
     * y = a * b^(c^t) -> ln(y) = ln(a) + ln(b) * c^t
     */
    fitGompertzModel(points) {
        if (points.length < 2) return null;
        let bestR2 = -Infinity, bestC = 0.5, bestFit = null;
        const ty = this.transforms.gompertz.transformY;
        const invY = this.transforms.gompertz.invY;

        for (let c = 0.01; c <= 2.0; c += 0.05) {
            if (Math.abs(c - 1) < 1e-5) continue; // c=1 is exponential
            const fn = t => Math.pow(c, t);
            const fit = this.fitLinearRegression(points, fn, ty, invY);
            if (fit && fit.r2 > bestR2) { bestR2 = fit.r2; bestC = c; bestFit = { ...fit, c }; }
        }
        return bestFit;
    },

    /**
     * 임계값 도달 시간 계산 (추정 수명)
     */
    estimateLifetime(fit, threshold, modelType) {
        if (!fit || fit.b === 0) return Infinity;

        let gInvVal;
        if (modelType === 'exponential') {
            const ty = this.transforms.exponential.transformY(threshold);
            gInvVal = (ty - fit.a) / fit.b;
        } else if (modelType === 'gompertz') {
            const ty = this.transforms.gompertz.transformY(threshold);
            const cx = (ty - fit.a) / fit.b;
            if (cx <= 0) return Infinity; // 불가능한 경우
            gInvVal = Math.log(cx) / Math.log(fit.c);
        } else {
            gInvVal = (threshold - fit.a) / fit.b;
        }

        switch (modelType) {
            case 'linear': return gInvVal;
            case 'sqrt':   return gInvVal * gInvVal;
            case 'log':    return Math.exp(gInvVal);
            case 'power':  return Math.pow(Math.max(gInvVal, 0), 1 / (fit.p || 1));
            case 'lloyd':  return 1 / gInvVal;
            case 'exponential': return gInvVal;
            case 'gompertz': return gInvVal;
            default:       return gInvVal;
        }
    },

    /**
     * 모든 모델 적합 & 비교 (단일 시료)
     */
    fitAllModels(points) {
        const results = [];

        // Linear
        const lin = this.fitLinearRegression(points, this.transforms.linear.fn);
        if (lin) results.push({ model: 'linear', label: 'Linear', ...lin });

        // Sqrt
        const sq = this.fitLinearRegression(points, this.transforms.sqrt.fn);
        if (sq) results.push({ model: 'sqrt', label: 'Square Root', ...sq });

        // Log
        const lg = this.fitLinearRegression(points, this.transforms.log.fn);
        if (lg) results.push({ model: 'log', label: 'Logarithmic', ...lg });

        // Power
        const pw = this.fitPowerModel(points);
        if (pw) results.push({ model: 'power', label: `Power (p=${pw.p.toFixed(2)})`, ...pw });

        // Exponential
        const exp = this.fitLinearRegression(points, this.transforms.exponential.fn, this.transforms.exponential.transformY, this.transforms.exponential.invY);
        if (exp) results.push({ model: 'exponential', label: 'Exponential', ...exp });

        // Lloyd-Lipow
        const lloyd = this.fitLinearRegression(points, this.transforms.lloyd.fn);
        if (lloyd) results.push({ model: 'lloyd', label: 'Lloyd-Lipow', ...lloyd });

        // Gompertz
        const gomp = this.fitGompertzModel(points);
        if (gomp) results.push({ model: 'gompertz', label: `Gompertz (c=${gomp.c.toFixed(2)})`, ...gomp });

        results.sort((a, b) => b.r2 - a.r2);
        if (results.length > 0) results[0].best = true;

        return results;
    },

    /**
     * 시료 그룹별 열화 분석 수행
     * Returns: { units, models, lifetimes, lifetimeDist }
     */
    analyze(data, threshold, direction = 'increasing', selectedModel = 'auto') {
        const groups = this.groupByUnit(data);
        const unitIds = Object.keys(groups);

        if (unitIds.length === 0) {
            return { error: '데이터가 없습니다.' };
        }

        // 각 시료별 지정/최적 모델 적합
        const unitResults = [];
        const lifetimes = [];

        for (const id of unitIds) {
            const points = groups[id];
            const models = this.fitAllModels(points);
            let bestModel = null;
            
            if (selectedModel === 'auto') {
                bestModel = models.find(m => m.best) || models[0];
            } else {
                bestModel = models.find(m => m.model === selectedModel) || models.find(m => m.best) || models[0];
                models.forEach(m => m.best = (m.model === bestModel.model)); // Update best flag for charting
            }

            let lifetime = Infinity;
            if (bestModel) {
                lifetime = this.estimateLifetime(bestModel, threshold, bestModel.model);
                // 방향 검증: 증가 열화일 때 b > 0이어야 하고, 감소 열화일 때 b < 0이어야 함
                if (direction === 'increasing' && bestModel.b < 0) lifetime = Infinity;
                if (direction === 'decreasing' && bestModel.b > 0) lifetime = Infinity;
                if (lifetime <= 0 || !isFinite(lifetime)) lifetime = Infinity;
            }

            unitResults.push({
                id,
                points,
                models,
                bestModel,
                lifetime: isFinite(lifetime) ? lifetime : null,
            });

            if (isFinite(lifetime) && lifetime > 0) {
                lifetimes.push(lifetime);
            }
        }

        // 추정 수명 분포 적합 (Weibull MLE)
        let lifetimeDist = null;
        if (lifetimes.length >= 3) {
            try {
                const D = Distributions;
                const alphaInit = Math.exp(lifetimes.reduce((s,t) => s + Math.log(t), 0) / lifetimes.length);
                const negLL = D.Weibull.negLogLikelihoodLog(lifetimes, []);
                const res = MathEngine.nelderMead(negLL, [Math.log(alphaInit), Math.log(1.5)]);
                const eta = Math.exp(res.x[0]);
                const beta = Math.exp(res.x[1]);
                const mttf = D.Weibull.mttf(eta, beta);
                const b10 = eta * Math.pow(-Math.log(0.9), 1 / beta);
                lifetimeDist = { distribution: 'Weibull 2P', beta, eta, mttf, b10 };
            } catch (e) {
                console.warn('Degradation: Lifetime dist fit failed:', e.message);
            }
        }

        // 전체 모델 적합 (합산)
        const allPoints = unitIds.flatMap(id => groups[id]);
        const globalModels = this.fitAllModels(allPoints);

        return {
            units: unitResults,
            globalModels,
            lifetimes,
            lifetimeDist,
            threshold,
            direction,
            summary: {
                nUnits: unitIds.length,
                nPoints: allPoints.length,
                nLifetimesEstimated: lifetimes.length,
                medianLifetime: lifetimes.length > 0 ?
                    lifetimes.sort((a,b) => a - b)[Math.floor(lifetimes.length / 2)] : null,
                meanLifetime: lifetimes.length > 0 ?
                    lifetimes.reduce((s,v) => s + v, 0) / lifetimes.length : null,
            }
        };
    },

    /**
     * 모델 예측값 생성 (차트용)
     */
    predict(fit, modelType, tMax, nPoints = 100) {
        const points = [];
        for (let i = 0; i <= nPoints; i++) {
            const t = (tMax * i) / nPoints;
            let gVal;
            switch (modelType) {
                case 'linear': gVal = t; break;
                case 'sqrt':   gVal = Math.sqrt(t); break;
                case 'log':    gVal = Math.log(Math.max(t, 1e-10)); break;
                case 'power':  gVal = Math.pow(Math.max(t, 1e-10), fit.p || 1); break;
                default:       gVal = t;
            }
            points.push({ time: t, value: fit.a + fit.b * gVal });
        }
        return points;
    },
};
