/**
 * RE-Suite Static — 가속 수명 모델 모듈
 * Ref: JEDEC JESD91, IEC 61709, MIL-HDBK-338B
 */
const Acceleration = {
    K: CONSTANTS.BOLTZMANN_EV,

    // ─── 아레니우스 모델 ───
    // AF = exp((Ea/k) * (1/Tu - 1/Ts))
    // Ref: JEDEC JESD91, Eq.1; IEC 61709, Section 6.2
    calcArrhenius(ea, tUse, tStress) {
        const tuK = tUse + 273.15;
        const tsK = tStress + 273.15;
        return Math.exp((ea / this.K) * (1 / tuK - 1 / tsK));
    },

    // ─── 펙 모델 (온도+습도) ───
    // AF = (RHs/RHu)^n * Arrhenius(T)
    // Ref: Peck (1986), JEDEC JESD91A Section 3.3
    calcPeck(ea, n, tUse, rhUse, tStress, rhStress) {
        const afT = this.calcArrhenius(ea, tUse, tStress);
        const afRH = Math.pow(rhStress / rhUse, n);
        return afT * afRH;
    },

    // ─── 코핀-맨슨 모델 (열 사이클) ───
    // AF = (ΔTs/ΔTu)^m
    // Ref: Coffin (1954), IPC-9701A
    calcCoffinManson(m, dtUse, dtStress) {
        return Math.pow(dtStress / dtUse, m);
    },

    // ─── 역거듭제곱 법칙 ───
    // AF = (Vs/Vu)^n
    // Ref: Nelson (1990), Ch.2
    calcInversePower(n, vUse, vStress) {
        return Math.pow(vStress / vUse, n);
    },

    // ─── Eyring 모델 ───
    // AF = (Tu/Ts) * exp((Ea/k)*(1/Tu - 1/Ts)) * exp(B*(Ss - Su))
    // Ref: JEDEC JESD91A, Section 3.4
    calcEyring(ea, tUse, tStress, b = 0, sUse = 0, sStress = 0) {
        const tuK = tUse + 273.15;
        const tsK = tStress + 273.15;
        let af = (tuK / tsK) * Math.exp((ea / this.K) * (1 / tuK - 1 / tsK));
        if (b !== 0 && sUse > 0 && sStress > 0) {
            af *= Math.exp(b * (sStress - sUse));
        }
        return af;
    },

    // ─── Norris-Landzberg ───
    // AF = (fu/fs)^n1 * (ΔTs/ΔTu)^m * Arrhenius(Tmax)
    // Ref: Norris & Landzberg (1969); IPC-9701A
    calcNorrisLandzberg(m, fUse, fStress, dtUse, dtStress, tMaxUse, tMaxStress, ea = 0.123) {
        const n1 = 0.33;
        const afFreq = Math.pow(fUse / fStress, n1);
        const afDt = Math.pow(dtStress / dtUse, m);
        const afT = this.calcArrhenius(ea, tMaxUse, tMaxStress);
        return afFreq * afDt * afT;
    },

    // ─── 복합: 아레니우스 × 역거듭제곱 ───
    // Ref: JEDEC JESD91A, Section 3.5
    calcArrheniusPower(ea, n, tUse, tStress, vUse, vStress) {
        return this.calcArrhenius(ea, tUse, tStress) * this.calcInversePower(n, vUse, vStress);
    },

    // ─── 시험 시간 vs 시료수 트레이드오프 ───
    // T_test = (L_target / AF) * [ln(1-C) / (n * ln(R))]^(1/β)
    // Ref: Meeker & Escobar (1998), Ch. 16
    calcTradeoff(af, beta, targetLife, targetReliability = 0.9, confidence = 0.9) {
        const ln1C = Math.log(1 - confidence);
        const lnR = Math.log(targetReliability);
        const data = [];

        for (let n = 1; n <= 50; n++) {
            const term = ln1C / (n * lnR);
            if (term <= 0) { data.push({ n, time: 0 }); continue; }
            const tReq = (targetLife / af) * Math.pow(term, 1 / beta);
            data.push({ n, time: parseFloat(tReq.toFixed(1)) });
        }
        return data;
    },

    // ─── 아레니우스 계산 과정 수식 ───
    getGeneralFormula(modelLabel, afFormulaStr, af, beta, n, targetLife, confidence, targetBx, goal, tTestUser) {
        const C = confidence / 100;
        const bxFraction = targetBx / 100;
        let steps = '';

        // 1. AF 계산
        steps += FormulaRenderer.step(`1. 가속 계수 (AF) 계산 - ${modelLabel}`, afFormulaStr);

        const chi2 = jStat.chisquare.inv(C, 2);
        
        if (!goal || goal === 'test_time') {
            // 2. 필요 시험 시간
            const etaUseReq = targetLife / Math.pow(-Math.log(1 - bxFraction), 1 / beta);
            const tTest = (1 / af) * Math.pow((chi2 * Math.pow(etaUseReq, beta)) / (2 * Math.max(n, 1)), 1 / beta);

            steps += FormulaRenderer.step('2. 필요 시험 시간(t_{test}) 계산',
                `t_{test} = \\frac{1}{AF} \\left( \\frac{\\chi^2 \\cdot \\eta_{use,req}^{\\beta}}{2n} \\right)^{1/\\beta} = \\frac{1}{${af.toFixed(2)}} \\left( \\frac{${chi2.toFixed(3)} \\cdot ${Math.round(etaUseReq)}^${beta}}{2 \\cdot ${n}} \\right)^{1/${beta}} = ${Math.round(tTest)}`
            );

            // 3. 척도모수
            const etaUse = Math.pow((2 * Math.pow(tTest * af, beta) * Math.max(n, 1)) / chi2, 1 / beta);
            steps += FormulaRenderer.step('3. 최종 척도모수(\\eta_{use}) 계산',
                `\\eta_{use} = \\left( \\frac{2 n \\cdot (t_{test} \\cdot AF)^{\\beta}}{\\chi^2} \\right)^{1/\\beta} = ${Math.round(etaUse)}`
            );

            // 4. 보증 수명
            const bxLife = etaUse * Math.pow(-Math.log(1 - bxFraction), 1 / beta);
            steps += FormulaRenderer.step('4. 보증 수명(B_x Life) 계산',
                `B_x = \\eta_{use} \\cdot [-\\ln(1-F_x)]^{1/\\beta} = ${Math.round(etaUse)} \\cdot [-\\ln(1-${bxFraction})]^{1/${beta}} = ${Math.round(bxLife)}`
            );
        } else if (goal === 'sample_size') {
            const etaUseReq = targetLife / Math.pow(-Math.log(1 - bxFraction), 1 / beta);
            const num = chi2 * Math.pow(etaUseReq, beta);
            const den = 2 * Math.pow(tTestUser * af, beta);
            const nReq = Math.ceil(num / den);
            
            steps += FormulaRenderer.step('2. 목표 척도모수(\\eta_{use,req}) 계산',
                `\\eta_{use,req} = \\frac{B_x}{[-\\ln(1-F_x)]^{1/\\beta}} = \\frac{${targetLife}}{[-\\ln(1-${bxFraction})]^{1/${beta}}} = ${Math.round(etaUseReq)}`
            );
            steps += FormulaRenderer.step('3. 필요 시료 수(n) 계산',
                `n_{req} = \\lceil \\frac{\\chi^2 \\cdot \\eta_{use,req}^{\\beta}}{2 (t_{test} \\cdot AF)^{\\beta}} \\rceil = \\lceil \\frac{${chi2.toFixed(3)} \\cdot ${Math.round(etaUseReq)}^${beta}}{2 \\cdot (${tTestUser} \\cdot ${af.toFixed(2)})^${beta}} \\rceil = ${nReq}`
            );
        } else if (goal === 'life') {
            const certifiedLife = af * tTestUser * Math.pow(-Math.log(1 - bxFraction), 1/beta) / Math.pow(chi2/(2 * Math.max(n, 1)), 1/beta);
            steps += FormulaRenderer.step('2. 보증 가능 수명(B_x) 계산',
                `B_{x,cert} = \\frac{AF \\cdot t_{test} \\cdot [-\\ln(1-F_x)]^{1/\\beta}}{(\\chi^2 / 2n)^{1/\\beta}} = \\frac{${af.toFixed(2)} \\cdot ${tTestUser} \\cdot [-\\ln(1-${bxFraction})]^{1/${beta}}}{(${chi2.toFixed(3)} / ${2*n})^{1/${beta}}} = ${Math.round(certifiedLife)}`
            );
            const etaUse = Math.round(certifiedLife / Math.pow(-Math.log(1 - bxFraction), 1 / beta));
            steps += FormulaRenderer.step('3. 도출된 척도모수(\\eta_{use})',
                `\\eta_{use} = \\frac{B_{x,cert}}{[-\\ln(1-F_x)]^{1/\\beta}} = ${etaUse}`
            );
        }

        return { steps };
    },

    // ─── AF vs 스트레스 시각화 데이터 생성 ───
    // 온도, 습도, 전압 등 스트레스 범위에 따른 AF 곡선
    generateAFvsStress(model, params) {
        const data = [];
        if (model === 'arrhenius' || model === 'eyring') {
            // 온도 50°C ~ 200°C 범위
            for (let t = 50; t <= 200; t += 5) {
                const af = model === 'arrhenius'
                    ? this.calcArrhenius(params.ea, params.tUse, t)
                    : this.calcEyring(params.ea, params.tUse, t, params.b || 0, params.sUse || 0, params.sStress || 0);
                data.push({ stress: t, af: parseFloat(af.toFixed(3)), label: `${t}°C` });
            }
        } else if (model === 'peck') {
            // 습도 30%~100% 범위 (온도 고정)
            for (let rh = 30; rh <= 100; rh += 5) {
                const af = this.calcPeck(params.ea, params.nPeck, params.tUse, params.rhUse, params.tStress, rh);
                data.push({ stress: rh, af: parseFloat(af.toFixed(3)), label: `${rh}%RH` });
            }
        } else if (model === 'coffin_manson' || model === 'norris_landzberg') {
            // ΔT 30~200 범위
            for (let dt = 30; dt <= 200; dt += 10) {
                const af = model === 'coffin_manson'
                    ? this.calcCoffinManson(params.m, params.dtUse, dt)
                    : this.calcNorrisLandzberg(params.m, params.fUse, params.fStress, params.dtUse, dt, params.tMaxUse, params.tMaxStress || dt, params.ea);
                data.push({ stress: dt, af: parseFloat(af.toFixed(3)), label: `ΔT=${dt}°C` });
            }
        } else if (model === 'inverse_power') {
            // 스트레스 레벨 범위
            const baseV = params.vUse;
            for (let v = baseV * 1.2; v <= baseV * 10; v += baseV * 0.4) {
                const af = this.calcInversePower(params.n, params.vUse, v);
                data.push({ stress: parseFloat(v.toFixed(1)), af: parseFloat(af.toFixed(3)), label: `${v.toFixed(1)}` });
            }
        } else if (model === 'arrhenius_power') {
            // 온도 범위 (전압 고정)
            for (let t = 50; t <= 200; t += 5) {
                const af = this.calcArrheniusPower(params.ea, params.n, params.tUse, t, params.vUse, params.vStress);
                data.push({ stress: t, af: parseFloat(af.toFixed(3)), label: `${t}°C` });
            }
        }
        return data;
    }
};
