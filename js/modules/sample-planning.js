/**
 * RE-Suite Static — 시료수 계획 모듈
 * Ref: Meeker & Escobar (1998), Ch. 10
 * Ref: MIL-HDBK-781A, ISO 2859-1
 */
const SamplePlanning = {

    // ─── 무고장 보증 (Success Run, c=0) ───
    // n = ceil[ ln(1-C) / ln(R) ]
    // Ref: Meeker & Escobar (1998), Eq. 10.12
    calculateSuccessRun(confidence, reliability) {
        if (reliability >= 1.0 || confidence >= 1.0) return 0;
        return Math.ceil(Math.log(1 - confidence) / Math.log(reliability));
    },

    // ─── 이항 분포 기반 시료수 (c≥0) ───
    // P(X ≤ c | p=1-R) ≤ 1-C 를 만족하는 최소 n
    // Ref: Meeker & Escobar (1998), Eq. 10.14
    calculateBinomialSampleSize(confidence, reliability, allowedFailures) {
        if (allowedFailures === 0) {
            return this.calculateSuccessRun(confidence, reliability);
        }

        const pFail = 1 - reliability;
        let n = allowedFailures + 1;

        while (n < CONSTANTS.MAX_SAMPLE_SEARCH) {
            const probPass = jStat.binomial.cdf(allowedFailures, n, pFail);
            if (probPass <= (1 - confidence)) {
                return n;
            }
            n++;
        }
        return -1; // 수렴 실패
    },

    // ─── LTPD 기반 시료수 ───
    // Ref: ISO 2859 부속서, MIL-STD-1916
    // LTPD = p (허용 불량률), β = 소비자 위험 (제2종 오류)
    // n = ceil[ χ²(β, 2(c+1)) / (2p) ]  (c=0일 때 간소화)
    calculateLTPD(ltpdPercent, betaPercent, allowedFailures) {
        const p = ltpdPercent / 100;
        const beta = betaPercent / 100;

        if (allowedFailures === 0) {
            // 간편 공식: n = ceil[ χ²(β, 2) / (2p) ]
            const chi2Val = jStat.chisquare.inv(1 - beta, 2);
            return Math.ceil(chi2Val / (2 * p));
        }

        // 일반 공식: χ² 기반
        // n = ceil[ χ²(β, 2(c+1)) / (2p) ]
        const df = 2 * (allowedFailures + 1);
        const chi2Val = jStat.chisquare.inv(1 - beta, df);
        return Math.ceil(chi2Val / (2 * p));
    },

    // ─── AQL 기반 시료수 (생산자 위험 관점) ───
    // P(X ≤ c | p=AQL) ≥ 1-α 를 만족하는 최대 n
    // Ref: ISO 2859-1, Section 8.3
    calculateAQLSampleSize(aqlPercent, alphaPercent, allowedFailures) {
        const pFail = aqlPercent / 100;
        const alpha = alphaPercent / 100;
        let n = allowedFailures + 1;

        while (n < CONSTANTS.MAX_SAMPLE_SEARCH) {
            const probAccept = jStat.binomial.cdf(allowedFailures, n, pFail);
            if (probAccept < (1 - alpha)) {
                return n - 1;
            }
            n++;
        }
        return CONSTANTS.MAX_SAMPLE_SEARCH;
    },

    // ─── OC Curve 데이터 생성 ───
    // Ref: ISO 2859-1, Appendix B
    generateOCCurve(n, c) {
        const data = [];
        for (let i = 0; i <= 100; i++) {
            const p = i * 0.005; // 0 ~ 0.5
            const pa = jStat.binomial.cdf(c, n, p);
            data.push({ p, pa });
        }
        return data;
    },

    // ─── n-c 매트릭스 생성 ───
    generateNCMatrix(confidence, reliability, maxC = 5) {
        const rows = [];
        for (let c = 0; c <= maxC; c++) {
            const n = this.calculateBinomialSampleSize(confidence, reliability, c);
            rows.push({ c, n });
        }
        return rows;
    },

    // ─── LTPD 계산 과정 수식 생성 ───
    getLTPDFormula(ltpdPercent, betaPercent, allowedFailures, result) {
        const p = ltpdPercent / 100;
        const beta = betaPercent / 100;
        const df = 2 * (allowedFailures + 1);
        const chi2Val = jStat.chisquare.inv(1 - beta, df);

        let steps = '';

        // 메인 공식
        steps += FormulaRenderer.step('계산 공식 및 과정',
            `n = \\left\\lceil \\frac{\\chi^2(\\beta, 2(c+1))}{2p} \\right\\rceil`
        );

        // 파라미터 대입
        steps += FormulaRenderer.step('',
            `p(\\text{허용불량률}) = ${ltpdPercent}\\% = ${p.toFixed(4)}`
        );
        steps += FormulaRenderer.step('',
            `\\beta(\\text{소비자위험도}) = ${betaPercent}\\% = ${beta.toFixed(3)}`
        );
        steps += FormulaRenderer.step('',
            `c(\\text{허용고장수}) = ${allowedFailures}`
        );

        // χ² 값
        steps += FormulaRenderer.step('',
            `\\chi^2(\\beta, 2(c+1)) = \\chi^2(${beta.toFixed(3)},\\, ${df}) = ${chi2Val.toFixed(3)}`
        );

        // 최종 계산
        steps += FormulaRenderer.step('',
            `n = \\left\\lceil \\frac{${chi2Val.toFixed(3)}}{2 \\times ${p.toFixed(4)}} \\right\\rceil = \\left\\lceil \\frac{${chi2Val.toFixed(3)}}{${(2*p).toFixed(4)}} \\right\\rceil = ${result}`
        );

        return steps;
    },

    // ─── 무고장 보증 계산 과정 수식 생성 ───
    getSuccessRunFormula(confidence, reliability, allowedFailures, result) {
        const C = confidence / 100;
        const R = reliability / 100;
        let steps = '';

        if (allowedFailures === 0) {
            steps += FormulaRenderer.step('무고장 보증 공식 (c=0)',
                `n = \\left\\lceil \\frac{\\ln(1-C)}{\\ln(R)} \\right\\rceil`
            );
            steps += FormulaRenderer.step('',
                `C(\\text{신뢰수준}) = ${confidence}\\% = ${C.toFixed(4)}`
            );
            steps += FormulaRenderer.step('',
                `R(\\text{목표신뢰도}) = ${reliability}\\% = ${R.toFixed(4)}`
            );
            steps += FormulaRenderer.step('',
                `n = \\left\\lceil \\frac{\\ln(${(1-C).toFixed(4)})}{\\ln(${R.toFixed(4)})} \\right\\rceil = \\left\\lceil \\frac{${Math.log(1-C).toFixed(4)}}{${Math.log(R).toFixed(6)}} \\right\\rceil = ${result}`
            );
        } else {
            steps += FormulaRenderer.step('이항 분포 기반 시료수 (c>0)',
                `P(X \\leq c \\mid n, p) = \\sum_{k=0}^{c} \\binom{n}{k} p^k (1-p)^{n-k} \\leq 1-C`
            );
            steps += FormulaRenderer.step('',
                `p = 1 - R = ${(1-R).toFixed(6)}, \\quad C = ${C.toFixed(4)}, \\quad c = ${allowedFailures}`
            );
            steps += FormulaRenderer.step('',
                `\\text{이항 CDF 탐색 결과: } n = ${result}`
            );
        }

        return steps;
    },

    // ─── Weibull Bx 수명 기반 시료수 계산 ───
    // Ref: Meeker & Escobar (1998), Ch. 10.4
    // Ref: Nelson (1982), "Applied Life Data Analysis", Ch. 6
    //
    // Weibull(β, η) 가정, 무고장 보증 시험
    // η = t_Bx / (-ln(1-x))^(1/β)
    // c=0: n = ceil[ χ²(C, 2) / (2 * (t_test / η)^β) ]
    // c>0: n = ceil[ χ²(C, 2(c+1)) / (2 * (t_test / η)^β) ]
    calculateWeibullBxSampleSize(beta, targetBxLife, bxPercent, testTime, confidence, allowedFailures) {
        const x = bxPercent / 100;
        // η 역산: η = t_Bx / (-ln(1-x))^(1/β)
        const eta = targetBxLife / Math.pow(-Math.log(1 - x), 1 / beta);
        const df = 2 * (allowedFailures + 1);
        const chi2Val = jStat.chisquare.inv(confidence, df);
        const n = Math.ceil(chi2Val / (2 * Math.pow(testTime / eta, beta)));
        return { n, eta, chi2Val, df };
    },

    // Weibull Bx 수식 생성
    getWeibullBxFormula(beta, targetBxLife, bxPercent, testTime, confidence, allowedFailures, result) {
        const x = bxPercent / 100;
        const eta = result.eta;
        let steps = '';

        steps += FormulaRenderer.step('1단계: 척도모수 (η) 역산',
            `\\eta = \\frac{t_{B${bxPercent}}}{(-\\ln(1-${x}))^{1/\\beta}} = \\frac{${targetBxLife}}{(-\\ln(${(1-x).toFixed(4)}))^{1/${beta}}} = ${eta.toFixed(1)}`
        );

        steps += FormulaRenderer.step('2단계: 시료수 계산',
            `n = \\left\\lceil \\frac{\\chi^2(C,\\, 2(c+1))}{2 \\cdot \\left(\\frac{t_{test}}{\\eta}\\right)^{\\beta}} \\right\\rceil`
        );

        steps += FormulaRenderer.step('',
            `\\chi^2(${(confidence*100).toFixed(0)}\\%,\\, ${result.df}) = ${result.chi2Val.toFixed(4)}`
        );

        steps += FormulaRenderer.step('',
            `n = \\left\\lceil \\frac{${result.chi2Val.toFixed(4)}}{2 \\cdot \\left(\\frac{${testTime}}{${eta.toFixed(1)}}\\right)^{${beta}}} \\right\\rceil = ${result.n}`
        );

        return steps;
    },

    // Weibull Bx 트레이드오프 (n vs testTime)
    generateBxTradeoff(beta, targetBxLife, bxPercent, confidence, allowedFailures) {
        const x = bxPercent / 100;
        const eta = targetBxLife / Math.pow(-Math.log(1 - x), 1 / beta);
        const df = 2 * (allowedFailures + 1);
        const chi2Val = jStat.chisquare.inv(confidence, df);

        const data = [];
        // 시험시간을 목표수명의 1%~100%까지 변화
        for (let pct = 1; pct <= 100; pct++) {
            const tTest = targetBxLife * pct / 100;
            const n = Math.ceil(chi2Val / (2 * Math.pow(tTest / eta, beta)));
            if (n > 0 && n < 100000) {
                data.push({ t: tTest, n });
            }
        }
        return data;
    },

    // ─── LTFR (Lot Tolerance Failure Rate) ───
    // Ref: MIL-HDBK-781A, IEC 61124
    //
    // 지수분포 가정: 고장률 λ 일정
    // 총 시험시간: T_total ≥ χ²(C, 2(c+1)) / (2 * λ_target)
    // 시료수: n = ceil[ T_total / t_test ]
    calculateLTFR(targetFR, testTime, confidence, allowedFailures, frUnit) {
        // frUnit: 'FIT' (10⁻⁹/h) or 'perHour' (/h)
        let lambda = targetFR;
        if (frUnit === 'FIT') {
            lambda = targetFR * 1e-9; // FIT → /h 변환
        }
        const df = 2 * (allowedFailures + 1);
        const chi2Val = jStat.chisquare.inv(confidence, df);
        const totalTime = chi2Val / (2 * lambda);
        const n = Math.ceil(totalTime / testTime);
        return { n, totalTime, chi2Val, df, lambda };
    },

    // LTFR 수식 생성
    getLTFRFormula(targetFR, testTime, confidence, allowedFailures, frUnit, result) {
        const frLabel = frUnit === 'FIT' ? `${targetFR} \\text{ FIT} = ${result.lambda.toExponential(4)} \\text{ /h}` : `${targetFR} \\text{ /h}`;
        let steps = '';

        steps += FormulaRenderer.step('LTFR 계산 공식',
            `T_{total} \\geq \\frac{\\chi^2(C,\\, 2(c+1))}{2 \\cdot \\lambda_{target}}`
        );

        steps += FormulaRenderer.step('',
            `\\lambda_{target} = ${frLabel}`
        );

        steps += FormulaRenderer.step('',
            `\\chi^2(${(confidence*100).toFixed(0)}\\%,\\, ${result.df}) = ${result.chi2Val.toFixed(4)}`
        );

        steps += FormulaRenderer.step('',
            `T_{total} = \\frac{${result.chi2Val.toFixed(4)}}{2 \\times ${result.lambda.toExponential(4)}} = ${result.totalTime.toFixed(0)} \\text{ h}`
        );

        steps += FormulaRenderer.step('필요 시료수',
            `n = \\left\\lceil \\frac{T_{total}}{t_{test}} \\right\\rceil = \\left\\lceil \\frac{${result.totalTime.toFixed(0)}}{${testTime}} \\right\\rceil = ${result.n}`
        );

        return steps;
    }
};
