/**
 * RE-Suite Static — 가속 수명 시험 데이터 분석 (ALT MLE) 모듈
 * Ref: Meeker & Escobar (1998), Statistical Methods for Reliability Data, Ch. 18 & 19
 * Ref: ReliaSoft ALTA v21 Reference Manual
 */
const ALTAnalysis = {
    K: CONSTANTS.BOLTZMANN_EV, // 8.617333262145e-5 eV/K

    /**
     * ALT 데이터 전처리 및 독립 그룹화
     * 데이터 포맷: { temp_C, stress2, failures: [], censored: [] }
     */
    prepareData(rawGroups, stressModel) {
        const groups = [];
        for (const g of rawGroups) {
            const temp_C = parseFloat(g.temp_C);
            const stress2 = parseFloat(g.stress2);
            if (isNaN(temp_C)) continue;

            const temp_K = temp_C + 273.15;
            const failures = (g.failures || []).map(parseFloat).filter(v => !isNaN(v) && v > 0);
            const censored = (g.censored || []).map(parseFloat).filter(v => !isNaN(v) && v > 0);

            if (failures.length === 0 && censored.length === 0) continue;

            groups.push({
                temp_C,
                temp_K,
                stress2: isNaN(stress2) ? 1.0 : stress2,
                failures,
                censored,
                nTotal: failures.length + censored.length
            });
        }
        return groups;
    },

    /**
     * 단순 선형 회귀 분석 (초기값 추정용)
     * Y = beta0 + beta1 * X1 (+ beta2 * X2)
     */
    fitInitialLinear(y, x1, x2 = null) {
        const n = y.length;
        if (n < 2) return x2 ? [10, 0, 0] : [10, 0];

        if (!x2) {
            // 단변수 선형 회귀 (Y = a + b * X)
            let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
            for (let i = 0; i < n; i++) {
                sumX += x1[i];
                sumY += y[i];
                sumXY += x1[i] * y[i];
                sumXX += x1[i] * x1[i];
            }
            const denom = n * sumXX - sumX * sumX;
            if (Math.abs(denom) < 1e-12) return [mean(y), 0];
            const b = (n * sumXY - sumX * sumY) / denom;
            const a = (sumY - b * sumX) / n;
            return [a, b];
        } else {
            // 다변수 선형 회귀 (Y = a + b*X1 + c*X2) -> 행렬 풀이 (크래머 공식 또는 단순 대수적 해결)
            let sY = 0, sX1 = 0, sX2 = 0, sX1Y = 0, sX2Y = 0;
            let sX11 = 0, sX22 = 0, sX12 = 0;
            for (let i = 0; i < n; i++) {
                sY += y[i];
                sX1 += x1[i];
                sX2 += x2[i];
                sX1Y += x1[i] * y[i];
                sX2Y += x2[i] * y[i];
                sX11 += x1[i] * x1[i];
                sX22 += x2[i] * x2[i];
                sX12 += x1[i] * x2[i];
            }

            // 다중 선형 회귀 방정식 시스템 풀이:
            // | n     sX1    sX2  |   | a |   | sY   |
            // | sX1   sX11   sX12 | * | b | = | sX1Y |
            // | sX2   sX12   sX22 |   | c |   | sX2Y |
            const M = [
                [n, sX1, sX2],
                [sX1, sX11, sX12],
                [sX2, sX12, sX22]
            ];
            const V = [sY, sX1Y, sX2Y];

            const det = M[0][0]*(M[1][1]*M[2][2] - M[1][2]*M[2][1]) -
                        M[0][1]*(M[1][0]*M[2][2] - M[1][2]*M[2][0]) +
                        M[0][2]*(M[1][0]*M[2][1] - M[1][1]*M[2][0]);

            if (Math.abs(det) < 1e-12) {
                return [sY/n, 0, 0];
            }

            const detA = V[0]*(M[1][1]*M[2][2] - M[1][2]*M[2][1]) -
                         M[0][1]*(V[1]*M[2][2] - M[1][2]*V[2]) +
                         M[0][2]*(V[1]*M[2][1] - M[1][1]*V[2]);

            const detB = M[0][0]*(V[1]*M[2][2] - M[1][2]*V[2]) -
                         V[0]*(M[1][0]*M[2][2] - M[1][2]*M[2][0]) +
                         M[0][2]*(M[1][0]*V[2] - V[1]*M[2][0]);

            const detC = M[0][0]*(M[1][1]*V[2] - V[1]*M[2][0]) -
                         M[0][1]*(M[1][0]*V[2] - V[1]*M[2][0]) +
                         V[0]*(M[1][0]*M[2][1] - M[1][1]*M[2][0]);

            return [detA/det, detB/det, detC/det];
        }
    },

    /**
     * 각 스트레스 그룹별 대표 수명 계산 (기하 평균 우선)
     */
    getGroupRepresentativeLife(failures, censored) {
        const all = [...failures, ...censored];
        if (all.length === 0) return 1000;
        let sumLog = 0;
        for (const t of all) {
            sumLog += Math.log(t);
        }
        return Math.exp(sumLog / all.length);
    },

    /**
     * 1) Arrhenius-Weibull 동시 MLE 적합
     * ln(η) = a0 + a1 / T_K
     * x0: [ln(beta), a0, a1]
     */
    fitArrhenius(rawGroups) {
        const data = this.prepareData(rawGroups, 'arrhenius');
        if (data.length < 2) {
            throw new Error("동시 MLE 분석을 위해서는 최소 2개 이상의 서로 다른 스트레스 수준의 데이터셋이 필요합니다.");
        }

        // 초기값 설정
        const yVal = [];
        const xVal = [];
        for (const g of data) {
            const repLife = this.getGroupRepresentativeLife(g.failures, g.censored);
            yVal.push(Math.log(repLife));
            xVal.push(1.0 / g.temp_K);
        }

        const [init_a0, init_a1] = this.fitInitialLinear(yVal, xVal);
        const init_lnBeta = Math.log(1.5); // 초기 beta = 1.5 로 설정
        const x0 = [init_lnBeta, init_a0, init_a1];

        // 음의 로그우도 함수 정의
        const negLogLikelihood = (params) => {
            const beta = Math.exp(params[0]);
            const a0 = params[1];
            const a1 = params[2];

            if (beta <= 0.01 || beta > 20) return 1e12; // 비정상 범위 방지
            
            let nll = 0;
            for (const g of data) {
                const eta = Math.exp(a0 + a1 / g.temp_K);
                if (eta <= 0 || !isFinite(eta)) return 1e12;

                const lnEta = Math.log(eta);
                const betaLnEta = beta * lnEta;

                // 고장 데이터 우도
                for (const t of g.failures) {
                    const z = t / eta;
                    nll -= Math.log(beta) - lnEta + (beta - 1) * Math.log(z) - Math.pow(z, beta);
                }

                // 검열 데이터 우도
                for (const t of g.censored) {
                    nll += Math.pow(t / eta, beta);
                }
            }

            return isNaN(nll) || !isFinite(nll) ? 1e12 : nll;
        };

        const opt = MathEngine.nelderMead(negLogLikelihood, x0, { tolFun: 1e-12, tolX: 1e-12, maxIter: 2000 });
        const beta = Math.exp(opt.x[0]);
        const a0 = opt.x[1];
        const a1 = opt.x[2];
        const Ea = a1 * this.K;

        // 수치 Hessian을 사용하여 공분산 행렬 계산
        let covMatrix = null;
        let stdErrors = [0, 0, 0];
        try {
            const H = MathEngine.numericalHessian(negLogLikelihood, opt.x, 1e-5);
            // 3x3 역행렬 구하기
            const invH = this.inv3x3(H);
            if (invH) {
                covMatrix = invH;
                stdErrors = [
                    Math.sqrt(Math.max(invH[0][0], 0)),
                    Math.sqrt(Math.max(invH[1][1], 0)),
                    Math.sqrt(Math.max(invH[2][2], 0))
                ];
            }
        } catch (e) {
            console.warn("ALT Hessian 계산 실패:", e);
        }

        const z = 1.95996; // 95% 신뢰도
        const confLimits = {
            betaLower: beta * Math.exp(-z * stdErrors[0]),
            betaUpper: beta * Math.exp(z * stdErrors[0]),
            a0Lower: a0 - z * stdErrors[1],
            a0Upper: a0 + z * stdErrors[1],
            a1Lower: a1 - z * stdErrors[2],
            a1Upper: a1 + z * stdErrors[2],
            eaLower: (a1 - z * stdErrors[2]) * this.K,
            eaUpper: (a1 + z * stdErrors[2]) * this.K
        };

        return {
            model: 'arrhenius',
            beta,
            a0,
            a1,
            stressCoefs: [a1],
            Ea,
            optParams: opt.x,
            covMatrix,
            stdErrors,
            confLimits,
            negLL: opt.fval,
            data
        };
    },
    /**
     * 2) 다차원 GLL (온도 + 임의 개수의 스트레스) 동시 MLE 적합
     * ln(η) = a0 + a1 * X1 + a2 * X2 + ... + ap * Xp
     * x0: [ln(beta), a0, a1, a2, ..., ap] (길이 p + 2)
     *
     * @param {Array} rawGroups - [{ temp_C, stressValues: [v1, v2...], failures: [], censored: [] }]
     * @param {Array} stressSpecs - [{ name: '온도', type: 'reciprocal_k', useVal: 25 }, { name: '습도', type: 'log', useVal: 50 }...]
     */
    fitGLL(rawGroups, stressSpecs) {
        // 데이터 정규화 및 변환 적용
        const data = [];
        for (const g of rawGroups) {
            const temp_C = parseFloat(g.temp_C);
            if (isNaN(temp_C)) continue;
            const temp_K = temp_C + 273.15;

            // 추가 스트레스 변환값들 계산
            const xVals = [];
            // 첫 번째 요인은 항상 온도로 셋팅 (reciprocal_k)
            xVals.push(1.0 / temp_K);

            const extraValues = g.stressValues || [];
            // specs에서 첫 번째(온도) 제외하고 추가 스트레스 루프
            for (let i = 1; i < stressSpecs.length; i++) {
                const spec = stressSpecs[i];
                let val = parseFloat(extraValues[i - 1]);
                if (isNaN(val)) val = spec.useVal; // 결측값 시 사용 조건으로 대체
                
                let transVal = val;
                if (spec.type === 'log') {
                    transVal = Math.log(Math.max(val, 1e-6));
                } else if (spec.type === 'reciprocal') {
                    transVal = 1.0 / Math.max(val, 1e-6);
                }
                xVals.push(transVal);
            }

            const failures = (g.failures || []).map(parseFloat).filter(v => !isNaN(v) && v > 0);
            const censored = (g.censored || []).map(parseFloat).filter(v => !isNaN(v) && v > 0);
            if (failures.length === 0 && censored.length === 0) continue;

            data.push({
                temp_C,
                temp_K,
                xVals,
                failures,
                censored,
                // 시각화용 대표 스트레스 값 보존
                rawStresses: [temp_C, ...extraValues]
            });
        }

        const p = stressSpecs.length; // 스트레스 요인 개수 (온도 포함)
        if (data.length < p + 1) {
            throw new Error(`다차원 GLL 분석을 위해서는 최소 ${p + 1}개 이상의 서로 다른 스트레스 조합의 데이터셋이 필요합니다. (현재 유효 그룹: ${data.length}개)`);
        }

        // 다차원 선형 회귀를 이용한 초기값 추정
        // Y = ln(대표수명) = a0 + a1 * X1 + ... + ap * Xp
        const yVal = [];
        const XMatrix = [];
        for (const g of data) {
            const repLife = this.getGroupRepresentativeLife(g.failures, g.censored);
            yVal.push(Math.log(repLife));
            XMatrix.push([1.0, ...g.xVals]); // 상수항 1.0 포함
        }

        let initCoefs = Array(p + 1).fill(0);
        try {
            initCoefs = this.fitMultiLinearOLS(yVal, XMatrix);
        } catch (err) {
            // 최소자승법 실패 시 기본값 부여
            initCoefs[0] = 8.0; // a0
            initCoefs[1] = 5000.0; // a1 (온도 계수)
        }

        const init_lnBeta = Math.log(1.5);
        // x0 구성: [lnBeta, a0, a1, a2, ..., ap] -> 총 p + 2차원
        const x0 = [init_lnBeta, ...initCoefs];

        // 다차원 음의 로그우도 함수
        const negLogLikelihood = (params) => {
            const beta = Math.exp(params[0]);
            const a0 = params[1];
            if (beta <= 0.01 || beta > 20) return 1e12;

            let nll = 0;
            for (const g of data) {
                // ln(eta) = a0 + a1*X1 + a2*X2 + ...
                let logEta = a0;
                for (let i = 0; i < p; i++) {
                    logEta += params[i + 2] * g.xVals[i];
                }
                const eta = Math.exp(logEta);
                if (eta <= 0 || !isFinite(eta)) return 1e12;

                const lnEta = Math.log(eta);
                for (const t of g.failures) {
                    const z = t / eta;
                    nll -= Math.log(beta) - lnEta + (beta - 1) * Math.log(z) - Math.pow(z, beta);
                }
                for (const t of g.censored) {
                    nll += Math.pow(t / eta, beta);
                }
            }
            return isNaN(nll) || !isFinite(nll) ? 1e12 : nll;
        };

        const opt = MathEngine.nelderMead(negLogLikelihood, x0, { tolFun: 1e-12, tolX: 1e-12, maxIter: 1000 + 500 * p });
        const beta = Math.exp(opt.x[0]);
        const a0 = opt.x[1];
        
        // 파라미터 값 추출
        const stressCoefs = [];
        for (let i = 0; i < p; i++) {
            stressCoefs.push(opt.x[i + 2]);
        }

        const Ea = stressCoefs[0] * this.K; // 온도는 항상 첫 번째 스트레스 (a1 * k)

        // 가변 차원 Hessian 계산 및 신뢰구간 도출
        const dim = p + 2;
        let covMatrix = null;
        let stdErrors = Array(dim).fill(0);
        try {
            const H = MathEngine.numericalHessian(negLogLikelihood, opt.x, 1e-5);
            const invH = this.invMatrix(H);
            if (invH) {
                covMatrix = invH;
                for (let i = 0; i < dim; i++) {
                    stdErrors[i] = Math.sqrt(Math.max(invH[i][i], 0));
                }
            }
        } catch (e) {
            console.warn("다차원 GLL Hessian 계산 실패:", e);
        }

        const z = 1.95996; // 95% CI
        const confLimits = {
            betaLower: beta * Math.exp(-z * stdErrors[0]),
            betaUpper: beta * Math.exp(z * stdErrors[0]),
            a0Lower: a0 - z * stdErrors[1],
            a0Upper: a0 + z * stdErrors[1],
            eaLower: (stressCoefs[0] - z * stdErrors[2]) * this.K,
            eaUpper: (stressCoefs[0] + z * stdErrors[2]) * this.K,
            // 개별 추가 스트레스에 대한 신뢰구간
            extraStresses: []
        };

        for (let i = 1; i < p; i++) {
            const val = stressCoefs[i];
            const err = stdErrors[i + 2];
            confLimits.extraStresses.push({
                name: stressSpecs[i].name,
                coef: val,
                lower: val - z * err,
                upper: val + z * err,
                // 대개 지수 n = -coef로 표기
                nValue: -val,
                nLower: -(val + z * err),
                nUpper: -(val - z * err)
            });
        }

        return {
            model: 'gll',
            beta,
            a0,
            stressCoefs,
            Ea,
            optParams: opt.x,
            covMatrix,
            stdErrors,
            confLimits,
            negLL: opt.fval,
            data,
            stressSpecs
        };
    },

    /**
     * OLS 다중 선형 회귀 분석: (X^T * X)^-1 * X^T * Y
     * X는 [n, p+1] 크기의 2차원 배열 (상수항 1.0 컬럼 포함)
     */
    fitMultiLinearOLS(y, X) {
        const n = X.length;
        const p = X[0].length; // 계수 개수 (상수항 포함)

        // 1. XT 생성
        const XT = Array(p).fill(0).map(() => Array(n).fill(0));
        for (let i = 0; i < p; i++) {
            for (let j = 0; j < n; j++) {
                XT[i][j] = X[j][i];
            }
        }

        // 2. XT * X 계산 (p x p)
        const XTX = Array(p).fill(0).map(() => Array(p).fill(0));
        for (let i = 0; i < p; i++) {
            for (let j = 0; j < p; j++) {
                let sum = 0;
                for (let k = 0; k < n; k++) {
                    sum += XT[i][k] * X[k][j];
                }
                XTX[i][j] = sum;
            }
        }

        // 3. XT * Y 계산 (p x 1)
        const XTY = Array(p).fill(0);
        for (let i = 0; i < p; i++) {
            let sum = 0;
            for (let k = 0; k < n; k++) {
                sum += XT[i][k] * y[k];
            }
            XTY[i] = sum;
        }

        // 4. (XT * X)^-1 계산
        const invXTX = this.invMatrix(XTX);
        if (!invXTX) {
            throw new Error("디자인 행렬이 특이행렬(Singular)입니다. 초기값 유도가 불가능합니다.");
        }

        // 5. 계수 구하기 (invXTX * XTY)
        const coefs = Array(p).fill(0);
        for (let i = 0; i < p; i++) {
            let sum = 0;
            for (let j = 0; j < p; j++) {
                sum += invXTX[i][j] * XTY[j];
            }
            coefs[i] = sum;
        }

        return coefs;
    },

    /**
     * 3x3 역행렬 계산 유틸리티
     */
    inv3x3(M) {
        return this.invMatrix(M);
    },

    /**
     * 임의의 N x N 행렬 역행렬 계산 (Gauss-Jordan 소거법 일반형)
     */
    invMatrix(M) {
        const n = M.length;
        const A = M.map(row => [...row]);
        const I = Array(n).fill(0).map((_, idx) => {
            const row = Array(n).fill(0);
            row[idx] = 1.0;
            return row;
        });

        for (let i = 0; i < n; i++) {
            // 피벗팅
            let maxRow = i;
            for (let j = i + 1; j < n; j++) {
                if (Math.abs(A[j][i]) > Math.abs(A[maxRow][i])) {
                    maxRow = j;
                }
            }

            if (Math.abs(A[maxRow][i]) < 1e-20) {
                return null; // 특이 행렬
            }

            // 행 교환
            if (maxRow !== i) {
                [A[i], A[maxRow]] = [A[maxRow], A[i]];
                [I[i], I[maxRow]] = [I[maxRow], I[i]];
            }

            // 피벗을 1로 만들기
            const pivot = A[i][i];
            for (let j = 0; j < n; j++) {
                A[i][j] /= pivot;
                I[i][j] /= pivot;
            }

            // 다른 모든 행 소거
            for (let j = 0; j < n; j++) {
                if (j !== i) {
                    const factor = A[j][i];
                    for (let k = 0; k < n; k++) {
                        A[j][k] -= factor * A[i][k];
                        I[j][k] -= factor * I[i][k];
                    }
                }
            }
        }
        return I;
    }
};
